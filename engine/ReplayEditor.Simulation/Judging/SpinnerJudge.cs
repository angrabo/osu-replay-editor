using ReplayEditor.Core;

namespace ReplayEditor.Simulation.Judging;

/// <summary>
/// The judged outcome of one spinner: completion ratio, raw turns, and the
/// client-specific spin/bonus counts and score.
/// </summary>
internal sealed record SpinnerStats(double Completion, double Turns, int RequiredTurns, long BonusScore,
    int SpinHits, int SpinTotal, int BonusHits, int BonusTotal);

/// <summary>
/// Reconstructs spinner rotation from cursor angle deltas while a key is held, then
/// converts total turns into the client-specific (stable ScoreV1/ScoreV2 vs lazer) judgement
/// and bonus score.
/// </summary>
internal static class SpinnerJudge
{
    private const double CenterX = 256;
    private const double CenterY = 192;
    private const double DeadZoneRadiusSquared = 64;

    public static SpinnerStats Judge(IReadOnlyList<SimulationFrame> frames, double start, double end, double od,
        bool lazer, bool stableScoreV2, double inputRate)
    {
        var turns = AccumulateTurns(frames, start, end, lazer, inputRate);
        var required = Math.Max(1, (int)Math.Floor((end - start) / 1000 * DifficultyRange(od, 90, 150, 225) / 60));
        var completion = turns / required;

        var (score, spinHits, spinTotal, bonusHits, bonusTotal) = lazer
            ? JudgeLazer(turns, required, od, end, start)
            : JudgeStable(turns, required, od, end, start, stableScoreV2);

        return new SpinnerStats(Math.Clamp(completion, 0, 2), turns, required, score, spinHits, spinTotal, bonusHits, bonusTotal);
    }

    private static double AccumulateTurns(IReadOnlyList<SimulationFrame> frames, double start, double end, bool lazer, double inputRate)
    {
        double? previous = lazer && LastCursorAngleBefore(frames, start) is { } before ? before : null;
        double accumulated = 0;
        double accumulatedAtCompletion = 0;
        double currentMaximum = 0;
        double? previousTime = null;
        var completedSpins = 0;

        foreach (var frame in frames.Where(frame => frame.TimeMs >= start && frame.TimeMs < end))
        {
            if (Math.Pow(frame.X - CenterX, 2) + Math.Pow(frame.Y - CenterY, 2) < DeadZoneRadiusSquared)
                continue;

            var angle = Math.Atan2(frame.Y - CenterY, frame.X - CenterX);
            if (previous is not null && CursorTrack.Held(frame))
            {
                var delta = NormalizeAngleDelta(angle - previous.Value);
                if (!lazer && previousTime is { } previousTimestamp)
                    delta = ClampStableAngularVelocity(delta, frame.TimeMs - previousTimestamp);

                accumulated += delta * inputRate;
                var current = accumulated - accumulatedAtCompletion;
                currentMaximum = Math.Max(currentMaximum, Math.Abs(current));

                while (currentMaximum >= Math.PI * 2)
                {
                    var direction = Math.Sign(current);
                    completedSpins++;
                    accumulatedAtCompletion += direction * Math.PI * 2;
                    current = accumulated - accumulatedAtCompletion;
                    currentMaximum = Math.Abs(current);
                }
            }

            previous = angle;
            previousTime = frame.TimeMs;
        }

        var turns = completedSpins + currentMaximum / (Math.PI * 2);

        // Stable's spinner has a short angular-velocity wind-up. The lost
        // quarter-turn belongs to raw cursor input, so it must use the same
        // gameplay-rate scaling as the rotation deltas above. Subtracting it
        // after DT scaling underestimates the wind-up and awards extra ticks.
        return lazer ? turns : Math.Max(0, turns - .25 * inputRate);
    }

    private static double? LastCursorAngleBefore(IReadOnlyList<SimulationFrame> frames, double start)
    {
        var frame = frames.LastOrDefault(frame =>
            frame.TimeMs < start && Math.Pow(frame.X - CenterX, 2) + Math.Pow(frame.Y - CenterY, 2) >= DeadZoneRadiusSquared);
        return frame is null ? null : Math.Atan2(frame.Y - CenterY, frame.X - CenterX);
    }

    private static double NormalizeAngleDelta(double delta)
    {
        while (delta > Math.PI)
            delta -= Math.PI * 2;
        while (delta < -Math.PI)
            delta += Math.PI * 2;

        return delta;
    }

    private static double ClampStableAngularVelocity(double delta, double elapsedMs)
    {
        var maximumDelta = Math.Max(0, elapsedMs) / 1000 * (477.0 / 60) * Math.PI * 2;
        return Math.Clamp(delta, -maximumDelta, maximumDelta);
    }

    private static (long Score, int SpinHits, int SpinTotal, int BonusHits, int BonusTotal) JudgeLazer(
        double turns, int required, double od, double end, double start)
    {
        var fullTurns = Math.Max(0, (int)Math.Floor(turns));
        var completeRpm = DifficultyRange(od, 250, 380, 430);
        var maximumBonusSpins = Math.Max(0, (int)Math.Floor(completeRpm / 60 * (end - start) / 1000) - required - 2);

        var spinTotal = required + 2;
        var spinHits = Math.Min(fullTurns, spinTotal);
        // The two completion spins are small bonuses. Large bonuses start only
        // after both of them have been completed.
        var bonusHits = Math.Min(maximumBonusSpins, Math.Max(0, fullTurns - required - 2));
        var bonusTotal = maximumBonusSpins;
        var score = spinHits * 10L + bonusHits * 50L;

        return (score, spinHits, spinTotal, bonusHits, bonusTotal);
    }

    private static (long Score, int SpinHits, int SpinTotal, int BonusHits, int BonusTotal) JudgeStable(
        double turns, int required, double od, double end, double start, bool stableScoreV2)
    {
        var halfTurns = Math.Max(0, (int)Math.Floor(turns * 2));
        var requiredHalfSpins = Math.Max(1, (int)Math.Floor((end - start) / 1000 * DifficultyRange(od, 3, 5, 7.5)));
        var spinTotal = requiredHalfSpins;
        var spinHits = Math.Min(halfTurns, spinTotal);
        var halfSpinsBeforeBonus = requiredHalfSpins + 3;

        var bonusHits = 0;
        long score = 0;
        for (var halfSpin = 2; halfSpin <= halfTurns; halfSpin++)
        {
            if (halfSpin > halfSpinsBeforeBonus && (halfSpin - halfSpinsBeforeBonus) % 2 == 0)
            {
                bonusHits++;
                // ScoreV2 records a 500-point bonus event per extra
                // half-spin; ScoreV1 uses the legacy 1,100-point award.
                score += stableScoreV2 ? 500 : 1_100;
            }
            else if (halfSpin % 2 == 0)
            {
                score += 100;
            }
        }

        return (score, spinHits, spinTotal, bonusHits, bonusHits);
    }

    private static double DifficultyRange(double difficulty, double minimum, double midpoint, double maximum) =>
        difficulty > 5 ? midpoint + (maximum - midpoint) * (difficulty - 5) / 5 :
        difficulty < 5 ? midpoint - (midpoint - minimum) * (5 - difficulty) / 5 : midpoint;
}
