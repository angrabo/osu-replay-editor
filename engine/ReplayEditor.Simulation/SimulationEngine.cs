using ReplayEditor.Core;
using ReplayEditor.Simulation.Beatmap;
using ReplayEditor.Simulation.Judging;
using ReplayEditor.Simulation.Scoring;

namespace ReplayEditor.Simulation;

public static class SimulationEngine
{
    public static SimulationResult ReconcileRecordedStableScore(SimulationResult result, long? sourceScore,
        int? sourceMaxCombo, int[]? sourceHitCounts, bool sourceUnedited, int? sourceMods, int mods)
    {
        if (!MatchesRecordedAggregates(result, sourceScore, sourceMaxCombo, sourceHitCounts, sourceUnedited, sourceMods, mods))
            return result;

        var scoreDelta = sourceScore!.Value - result.Score;
        if (scoreDelta == 0)
            return result;

        // The .osr stores the authoritative final score. Stable's hidden
        // spinner and ScoreV2 normalization details can leave a small residual
        // even when every available result count and maximum combo agree.
        // Never use that reference to conceal a substantial simulation error.
        if (result.SpinnerSpinsTotal == 0 && (result.Model != "editor-stable-v2"
            || Math.Abs(scoreDelta) > Math.Max(1000, sourceScore.Value / 100)))
            return result;

        var calibratedBonus = result.BonusScore + scoreDelta;
        if (result.SpinnerSpinsTotal > 0 && calibratedBonus < 0)
            return result;

        return result with
        {
            Score = sourceScore.Value,
            Status = "source-calibrated",
            BonusScore = result.SpinnerSpinsTotal > 0 ? calibratedBonus : result.BonusScore,
            Warnings =
            [
                ..result.Warnings,
                result.SpinnerSpinsTotal > 0
                    ? "Stable spinner bonus was calibrated to the recorded replay after judgement counts and maximum combo matched."
                    : "The final ScoreV2 value uses the recorded replay after judgement counts and maximum combo matched; per-object score remains an estimate."
            ]
        };
    }

    private static bool MatchesRecordedAggregates(SimulationResult result, long? sourceScore, int? sourceMaxCombo,
        int[]? sourceHitCounts, bool sourceUnedited, int? sourceMods, int mods)
    {
        if (!sourceUnedited || result.Client != "stable")
            return false;
        if (sourceScore is null or < 0 || sourceMaxCombo is null || sourceHitCounts is not { Length: >= 6 })
            return false;
        if (sourceMods != mods || result.MaxCombo != sourceMaxCombo)
            return false;

        return result.Count300 == sourceHitCounts[0] && result.Count100 == sourceHitCounts[1]
            && result.Count50 == sourceHitCounts[2] && result.Misses == sourceHitCounts[5];
    }

    public static SimulationResult SimulateRange(string osuText, IReadOnlyList<SimulationFrame> sourceFrames, int mods,
        int replayVersion, double startMs, double endMs, CancellationToken cancellationToken = default, double scoreMultiplier = 1)
    {
        if (!double.IsFinite(startMs) || !double.IsFinite(endMs) || endMs <= startMs)
            throw new ArgumentException("Selected area must have a finite start and a later end.");

        var whole = SimulateWhole(osuText, sourceFrames, mods, replayVersion, cancellationToken, scoreMultiplier);
        if (whole.Status == "unsupported")
            return whole with { Scope = "selected-area" };

        var selected = whole.Judgements.Where(item => item.StartTime >= startMs && item.StartTime < endMs).ToArray();
        var firstIndex = selected.Length == 0 ? -1 : selected[0].ObjectIndex;
        var previousScore = firstIndex > 0 ? whole.Judgements[firstIndex - 1].ScoreAfter : 0;
        var score = selected.Length == 0 ? 0 : selected[^1].ScoreAfter - previousScore;
        var n300 = selected.Count(item => item.Value == 300);
        var n100 = selected.Count(item => item.Value == 100);
        var n50 = selected.Count(item => item.Value == 50);
        var misses = selected.Count(item => item.Value == 0);
        var accuracy = selected.Length == 0 ? 100 : (300d * n300 + 100d * n100 + 50d * n50) / (300d * selected.Length) * 100;
        var maxCombo = selected.Length == 0 ? 0 : selected.Max(item => item.ComboAfter);
        var endCombo = selected.Length == 0 ? 0 : selected[^1].ComboAfter;

        return whole with
        {
            Scope = "selected-area",
            Score = score,
            Accuracy = Math.Round(accuracy, 4),
            Count300 = n300,
            Count100 = n100,
            Count50 = n50,
            Misses = misses,
            MaxCombo = maxCombo,
            AchievedCombo = endCombo,
            TotalObjects = selected.Length,
            Judgements = selected,
            CountGeki = null,
            CountKatu = null,
            Perfect = null,
            Warnings =
            [
                ..whole.Warnings,
                "Area includes objects whose start is within [start, end). Score is their gain over the full replay; combo entering the area is retained."
            ]
        };
    }

    public static SimulationResult SimulateWhole(string osuText, IReadOnlyList<SimulationFrame> sourceFrames, int mods, int replayVersion = 0,
        CancellationToken cancellationToken = default, double scoreMultiplier = 1, bool lazerInclusiveLateHitWindows = false)
    {
        var client = replayVersion >= 30000000 ? "lazer" : "stable";
        var map = BeatmapTextParser.Parse(osuText, mods);
        var isLazer = client == "lazer";
        var stableScoreV2 = !isLazer && (mods & (1 << 29)) != 0;

        // Replay frame timestamps and .osu object timestamps share the gameplay clock.
        // Rate-changing mods alter real elapsed time, not this stored timeline.
        const double rate = 1.0;
        var spinnerInputRate = (mods & 64) != 0 ? 1.5 : (mods & 256) != 0 ? .75 : 1;
        var frames = sourceFrames.OrderBy(frame => frame.TimeMs).ToArray();
        var presses = CursorTrack.Presses(frames).ToArray();
        var used = new HashSet<int>();
        var judgements = new List<ObjectJudgement>(map.Objects.Length);

        var (hitWindow300, hitWindow100, hitWindow50) = HitWindows(map.Od, rate);
        var radius = Math.Max(12, 54.4 - 4.48 * map.Cs);
        var maximumCombo = map.Objects.Sum(item => item.Kind == "slider" ? SliderJudge.PartCount(item, rate, map.SliderTickRate) : 1);

        var combo = 0;
        var maxCombo = 0;
        long score = 0;
        long bonusScore = 0;
        double spinnerSpins = 0;
        var lazerScoreEvents = new List<LazerScoreEvent>();
        var stableScoreEvents = new List<StableScoreEvent>();
        var n300 = 0;
        var n100 = 0;
        var n50 = 0;
        var misses = 0;
        var sliderTicksHit = 0;
        var sliderTicksTotal = 0;
        var sliderEndsHit = 0;
        var sliderEndsTotal = 0;
        var spinnerSpinsHit = 0;
        var spinnerSpinsTotal = 0;
        var spinnerBonusHit = 0;
        var spinnerBonusTotal = 0;
        var stableNotelockUntil = double.NegativeInfinity;
        double lazerAccuracyEarned = 0;
        double lazerAccuracyPossible = 0;

        for (var objectIndex = 0; objectIndex < map.Objects.Length; objectIndex++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var item = map.Objects[objectIndex];
            var start = item.Start / rate;
            var end = item.End / rate;
            string result;
            int value;
            double? hitTime = null;
            double? hitError = null;
            string? key = null;
            var stableObjectUnlockTime = start;
            var sliderHeadValue = 0;
            (double Time, int Score, bool Hit)[] sliderParts = [];
            var distance = double.PositiveInfinity;
            var inside = false;

            if (item.Kind == "spinner")
            {
                stableObjectUnlockTime = end;
                var spinner = SpinnerJudge.Judge(frames, start, end, map.Od, isLazer, stableScoreV2, spinnerInputRate);
                (result, value) = isLazer
                    ? spinner.Completion >= 1 ? ("300", 300) : spinner.Completion > .9 ? ("100", 100) : spinner.Completion > .75 ? ("50", 50) : ("miss", 0)
                    : spinner.Completion >= .9 ? ("300", 300) : spinner.Completion >= .75 ? ("100", 100) : spinner.Completion >= .5 ? ("50", 50) : ("miss", 0);
                distance = 0;
                inside = spinner.Completion > 0;
                bonusScore += spinner.BonusScore;
                spinnerSpins += spinner.Turns;
                spinnerSpinsHit += spinner.SpinHits;
                spinnerSpinsTotal += spinner.SpinTotal;
                spinnerBonusHit += spinner.BonusHits;
                spinnerBonusTotal += spinner.BonusTotal;
                if (!isLazer && spinner.BonusScore > 0)
                    stableScoreEvents.Add(new StableScoreEvent(end, objectIndex * 10_000 - 1, checked((int)spinner.BonusScore), true, false, false, false));
            }
            else
            {
                var candidates = FindHitCandidates(presses, used, frames, item, start, radius, hitWindow50, isLazer,
                    lazerInclusiveLateHitWindows, stableNotelockUntil);
                if (candidates.Length == 0)
                {
                    (result, value) = ("miss", 0);
                    stableObjectUnlockTime = start + hitWindow50;
                    if (item.Kind == "slider")
                        sliderParts = SliderJudge.Parts(frames, item, rate, map.SliderTickRate, radius * 2.4, false, isLazer);
                }
                else
                {
                    var chosen = candidates[0];
                    used.Add(chosen.index);
                    hitTime = chosen.press.Time;
                    hitError = chosen.press.Time - start;
                    stableObjectUnlockTime = chosen.press.Time;
                    key = chosen.press.Key;
                    distance = chosen.distance;
                    inside = true;

                    var signedError = hitError.Value;
                    var absolute = Math.Abs(signedError);
                    (result, value) = isLazer && lazerInclusiveLateHitWindows
                        ? signedError <= -hitWindow50 || signedError > hitWindow50 ? ("miss", 0)
                            : signedError > -hitWindow300 && signedError <= hitWindow300 ? ("300", 300)
                            : signedError > -hitWindow100 && signedError <= hitWindow100 ? ("100", 100) : ("50", 50)
                        : absolute >= hitWindow50 ? ("miss", 0)
                            : absolute < hitWindow300 ? ("300", 300) : absolute < hitWindow100 ? ("100", 100) : ("50", 50);
                    sliderHeadValue = value;
                    if (item.Kind == "slider")
                        sliderParts = SliderJudge.Parts(frames, item, rate, map.SliderTickRate, radius * 2.4, true, isLazer);
                }

                if (item.Kind == "slider" && !isLazer)
                    (result, value) = StableSliderResult(sliderParts, stableScoreV2, sliderHeadValue);
            }

            if (!isLazer)
                stableNotelockUntil = Math.Max(stableNotelockUntil, stableObjectUnlockTime);

            if (item.Kind == "slider")
            {
                var sliderResult = RecordSliderStableEvents(stableScoreEvents, sliderParts, objectIndex, start, hitWindow50, isLazer, combo, maxCombo);
                combo = sliderResult.Combo;
                maxCombo = sliderResult.MaxCombo;
                sliderTicksHit += sliderResult.TicksHitDelta;
                sliderTicksTotal += sliderResult.TicksTotalDelta;
                sliderEndsHit += sliderResult.EndsHitDelta;
                sliderEndsTotal += sliderResult.EndsTotalDelta;
            }

            if (isLazer)
                RecordLazerObjectEvents(lazerScoreEvents, item, sliderParts, objectIndex, start, value);

            if (value == 0)
            {
                misses++;
                if (item.Kind != "slider")
                    combo = 0;
                if (!isLazer && item.Kind != "slider")
                    stableScoreEvents.Add(new StableScoreEvent(item.Kind == "spinner" ? end : start, objectIndex * 10_000 + 9_999,
                        0, false, false, true, true, 300, item.Kind != "slider"));
            }
            else
            {
                if (value == 300)
                    n300++;
                else if (value == 100)
                    n100++;
                else
                    n50++;

                if (!isLazer)
                    stableScoreEvents.Add(new StableScoreEvent(item.Kind == "circle" ? start : end, objectIndex * 10_000 + 9_999,
                        value, true, item.Kind != "slider", true, true, 300));
                if (item.Kind != "slider")
                {
                    combo++;
                    maxCombo = Math.Max(maxCombo, combo);
                }
            }

            if (isLazer)
                (lazerAccuracyEarned, lazerAccuracyPossible) = AccumulateLazerAccuracy(sliderParts, value, lazerAccuracyEarned, lazerAccuracyPossible);

            judgements.Add(new ObjectJudgement(objectIndex, item.Kind, start, end, result, value, hitTime, hitError,
                double.IsFinite(distance) ? Math.Round(distance, 3) : -1, inside, key, combo, score,
                sliderParts.Skip(1).Count(part => part.Hit), Math.Max(0, sliderParts.Length - 1)));
        }

        var total = map.Objects.Length;
        var accuracy = isLazer
            ? (lazerAccuracyPossible == 0 ? 1 : lazerAccuracyEarned / lazerAccuracyPossible)
            : (total == 0 ? 1 : (300d * n300 + 100d * n100 + 50d * n50) / (300d * total));

        var model = ApplyScoreModel(isLazer, stableScoreV2, lazerScoreEvents, stableScoreEvents, judgements, map.DifficultyMultiplier,
            accuracy, bonusScore, scoreMultiplier, out combo, out maxCombo, out score);

        var warnings = BuildWarnings(model, map, mods);
        var (geki, katu) = isLazer ? ((int?)null, (int?)null) : ComboCounts.EndCounts(map.Objects, judgements);
        var perfect = misses == 0 && maxCombo == maximumCombo && sliderTicksHit == sliderTicksTotal && sliderEndsHit == sliderEndsTotal;

        return new SimulationResult("whole-replay", model.Name, "estimate", score, Math.Round(accuracy * 100, 4),
            n300, n100, n50, misses, maxCombo, combo, total, judgements.ToArray(), warnings.ToArray(), client, bonusScore, Math.Round(spinnerSpins, 3),
            sliderTicksHit, sliderTicksTotal, sliderEndsHit, sliderEndsTotal,
            spinnerSpinsHit, spinnerSpinsTotal, spinnerBonusHit, spinnerBonusTotal, geki, katu, perfect);
    }

    private static (double Great, double Ok, double Meh) HitWindows(double od, double rate)
    {
        var hitWindow300 = Math.Max(20, 80 - 6 * od) / rate;
        var hitWindow100 = Math.Max(40, 140 - 8 * od) / rate;
        var hitWindow50 = Math.Max(60, 200 - 10 * od) / rate;

        // osu! truncates the maximum hit-error windows to integer milliseconds.
        // Rounding these values up changes borderline stable judgements (for
        // example OD 9.4 has a 23 ms GREAT window, not 24 ms).
        return (Math.Floor(hitWindow300), Math.Floor(hitWindow100), Math.Floor(hitWindow50));
    }

    private static (Press press, int index, double distance)[] FindHitCandidates(Press[] presses, HashSet<int> used,
        IReadOnlyList<SimulationFrame> frames, MapObject item, double start, double radius, double hitWindow50,
        bool isLazer, bool lazerInclusiveLateHitWindows, double stableNotelockUntil)
    {
        return presses.Select((press, index) => (press, index))
            .Where(candidate => !used.Contains(candidate.index)
                && (isLazer || candidate.press.Time > stableNotelockUntil)
                // Stable consumes a press just outside the early 50
                // window as an early miss. Ignoring it lets a later
                // press hit the same object a second time.
                && candidate.press.Time >= start - hitWindow50 - 10
                && (isLazer && lazerInclusiveLateHitWindows
                    ? candidate.press.Time <= start + hitWindow50
                    : candidate.press.Time < start + hitWindow50))
            .Select(candidate =>
            {
                var cursor = CursorTrack.CursorAt(frames, candidate.press.Time);
                var d = cursor is null ? double.PositiveInfinity : Math.Sqrt(Math.Pow(cursor.Value.X - item.X, 2) + Math.Pow(cursor.Value.Y - item.Y, 2));
                return (candidate.press, candidate.index, distance: d);
            })
            .Where(candidate => candidate.distance <= radius)
            // Inputs are consumed as they occur. Choosing a later press
            // merely because it is closer to the object time can turn
            // an already-triggered 50 into a 300 and shift every
            // subsequent assignment in dense alternating patterns.
            .OrderBy(candidate => candidate.press.Time)
            .ToArray();
    }

    private static (string Result, int Value) StableSliderResult((double Time, int Score, bool Hit)[] sliderParts,
        bool stableScoreV2, int sliderHeadValue)
    {
        var hits = sliderParts.Count(part => part.Hit);
        var value = hits == sliderParts.Length ? 300 : hits == 0 ? 0 : hits * 2 >= sliderParts.Length ? 100 : 50;

        // Stable still awards a 50 when the head breaks combo but
        // a later slider part is collected. ScoreV2 caps a tracked
        // slider by the head's timing grade, not below that floor.
        if (stableScoreV2 && value > Math.Max(50, sliderHeadValue))
            value = Math.Max(50, sliderHeadValue);

        var result = value switch { 300 => "300", 100 => "100", 50 => "50", _ => "miss" };
        return (result, value);
    }

    private static (int Combo, int MaxCombo, int TicksHitDelta, int TicksTotalDelta, int EndsHitDelta, int EndsTotalDelta) RecordSliderStableEvents(
        List<StableScoreEvent> stableScoreEvents, (double Time, int Score, bool Hit)[] sliderParts, int objectIndex, double start,
        double hitWindow50, bool isLazer, int combo, int maxCombo)
    {
        var ticksTotalDelta = Math.Max(0, sliderParts.Length - 2);
        var ticksHitDelta = sliderParts.Skip(1).SkipLast(1).Count(part => part.Hit);
        var endsTotalDelta = 0;
        var endsHitDelta = 0;
        if (sliderParts.Length > 1)
        {
            endsTotalDelta = 1;
            if (sliderParts[^1].Hit)
                endsHitDelta = 1;
        }

        for (var partIndex = 0; partIndex < sliderParts.Length; partIndex++)
        {
            var part = sliderParts[partIndex];
            if (!isLazer)
                stableScoreEvents.Add(new StableScoreEvent(part.Time, objectIndex * 10_000 + partIndex, part.Score, part.Hit, true,
                    partIndex != 0 && partIndex != sliderParts.Length - 1, false, part.Score));
            if (!isLazer && partIndex == 0 && !part.Hit)
                stableScoreEvents.Add(new StableScoreEvent(start + hitWindow50, objectIndex * 10_000 + partIndex, 0, false, false, true, false));

            if (part.Hit)
            {
                combo++;
                maxCombo = Math.Max(maxCombo, combo);
            }
            else if (partIndex != sliderParts.Length - 1)
            {
                combo = 0;
            }
        }

        return (combo, maxCombo, ticksHitDelta, ticksTotalDelta, endsHitDelta, endsTotalDelta);
    }

    private static void RecordLazerObjectEvents(List<LazerScoreEvent> lazerScoreEvents, MapObject item,
        (double Time, int Score, bool Hit)[] sliderParts, int objectIndex, double start, int value)
    {
        // lazer's combo score is accumulated for every scorable judgement in
        // chronological order. The contribution uses the judgement's maximum
        // value (for example a 100 circle still has a maximum value of 300).
        lazerScoreEvents.Add(new LazerScoreEvent(start, objectIndex * 10_000, 300, value > 0));
        if (item.Kind != "slider")
            return;

        // A missed large tick breaks combo. Slider tails are recorded as
        // ignore_miss by lazer and therefore remove their combo increment
        // without resetting the combo built by surrounding events.
        for (var partIndex = 1; partIndex < sliderParts.Length; partIndex++)
        {
            var part = sliderParts[partIndex];
            var isTail = partIndex == sliderParts.Length - 1;
            lazerScoreEvents.Add(new LazerScoreEvent(part.Time, objectIndex * 10_000 + partIndex,
                isTail ? 150 : 30, part.Hit, BreakOnMiss: !isTail));
        }
    }

    private static (double Earned, double Possible) AccumulateLazerAccuracy((double Time, int Score, bool Hit)[] sliderParts,
        int value, double lazerAccuracyEarned, double lazerAccuracyPossible)
    {
        lazerAccuracyEarned += value;
        lazerAccuracyPossible += 300;

        if (sliderParts.Length <= 1)
            return (lazerAccuracyEarned, lazerAccuracyPossible);

        for (var partIndex = 1; partIndex < sliderParts.Length; partIndex++)
        {
            var maximum = partIndex == sliderParts.Length - 1 ? 150 : 30;
            lazerAccuracyPossible += maximum;
            if (sliderParts[partIndex].Hit)
                lazerAccuracyEarned += maximum;
        }

        return (lazerAccuracyEarned, lazerAccuracyPossible);
    }

    private static ScoreModel ApplyScoreModel(bool isLazer, bool stableScoreV2, List<LazerScoreEvent> lazerScoreEvents,
        List<StableScoreEvent> stableScoreEvents, List<ObjectJudgement> judgements, int difficultyMultiplier,
        double accuracy, long bonusScore, double scoreMultiplier, out int combo, out int maxCombo, out long score)
    {
        var multiplier = Math.Max(0, scoreMultiplier);

        if (isLazer)
        {
            var model = new LazerScoreModel();
            var result = model.Compute(lazerScoreEvents, accuracy, bonusScore, multiplier);
            combo = result.EndingCombo;
            maxCombo = result.MaximumCombo;
            score = result.Score;
            return model;
        }

        if (stableScoreV2)
        {
            var model = new StableScoreV2Model();
            var result = model.Compute(stableScoreEvents, judgements, multiplier);
            combo = result.EndingCombo;
            maxCombo = result.MaximumCombo;
            score = result.Score;
            for (var i = 0; i < judgements.Count; i++)
                judgements[i] = judgements[i] with { ScoreAfter = result.ScoreAfter[i] };
            return model;
        }

        var v1Model = new StableScoreV1Model();
        var v1Result = v1Model.Compute(stableScoreEvents, judgements, difficultyMultiplier, multiplier);
        combo = v1Result.EndingCombo;
        maxCombo = v1Result.MaximumCombo;
        score = v1Result.Score;
        for (var i = 0; i < judgements.Count; i++)
            judgements[i] = judgements[i] with { ScoreAfter = v1Result.ScoreAfter[i] };
        return v1Model;
    }

    private static List<string> BuildWarnings(ScoreModel model, MapData map, int mods)
    {
        var warnings = new List<string> { model.PrimaryWarning };

        if (map.Objects.Any(item => item.Kind == "slider"))
            warnings.Add("Slider curve, head, tick, repeat, and tail checks are simulated; stable follow-circle state and tick edge cases can still differ.");
        if (map.Objects.Any(item => item.Kind == "spinner"))
            warnings.Add("Spinner judgement and bonus use sampled held rotations with the client-specific OD completion threshold.");
        if ((mods & ~(1 | 2 | 8 | 16 | 64 | 256 | 1024 | 4096 | (1 << 29))) != 0)
            warnings.Add("EZ, HR, DT and HT affect timing or geometry; NF, HD, FL and SO affect the score multiplier. Other mods are displayed but ignored.");

        return warnings;
    }
}
