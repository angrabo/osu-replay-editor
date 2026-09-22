using System.Text.Json;
using ReplayEditor.Contracts;
using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.Engine.Scoring;

public static class ScoreCalibration
{
    public static double LazerScoreMultiplier(SimulationRequest request)
    {
        if (request.Version < 30000000)
            return StableScoreV2Multiplier(request.Mods);

        var fallback = LazerFallbackMultiplier(request.Mods);

        if (request.SourceScore is null || request.SourceMods != request.Mods ||
            string.IsNullOrWhiteSpace(request.LazerScoreInfo))
            return fallback;

        return LazerCalibratedMultiplier(request, fallback);
    }

    private static double StableScoreV2Multiplier(int mods)
    {
        var multiplier = 1d;

        // Stable ScoreV2 normalises NoFail back to a 1.0 score multiplier.
        if ((mods & 1) != 0 && (mods & (1 << 29)) == 0)
            multiplier *= .5;
        if ((mods & 2) != 0)
            multiplier *= .5;
        if ((mods & 8) != 0)
            multiplier *= 1.06;
        if ((mods & 16) != 0)
            multiplier *= (mods & (1 << 29)) != 0 ? 1.10 : 1.06;
        if ((mods & 64) != 0)
            multiplier *= (mods & (1 << 29)) != 0 ? 1.20 : 1.12;
        if ((mods & 256) != 0)
            multiplier *= .3;
        if ((mods & 1024) != 0)
            multiplier *= 1.12;
        if ((mods & 4096) != 0)
            multiplier *= .9;

        return multiplier;
    }

    // Mirrors osu.Game.Rulesets.Osu.Scoring.OsuScoreMultiplierCalculatorV2 (the current lazer
    // scoring multiplier table). A legacy .osr mod bitmask cannot carry per-mod settings (custom
    // rates, Easy retry count, Hidden's fade-approach-circles-only toggle, Flashlight size), so
    // every multiplier here uses that mod's default configuration, matching an unconfigured mod.
    private static double LazerFallbackMultiplier(int mods)
    {
        var multiplier = 1d;

        if ((mods & 1) != 0)
            multiplier *= .5; // NoFail
        if ((mods & 2) != 0)
            multiplier *= .8; // Easy (default: 0 retries)
        if ((mods & 8) != 0)
            multiplier *= 1.04; // Hidden (default configuration)
        if ((mods & 16) != 0)
            multiplier *= 1.09; // HardRock
        if ((mods & 64) != 0)
            multiplier *= 1.23; // DoubleTime (default 1.5x: (1.5-1)*0.46+1, no non-default-rate penalty)
        if ((mods & 256) != 0)
            multiplier *= .55; // HalfTime (default 0.75x: floor(0.75*20)/20*1.4-0.5)
        if ((mods & 1024) != 0)
            multiplier *= 1.2; // Flashlight (default: combo-based, size 1.0)
        if ((mods & 4096) != 0)
            multiplier *= .95; // SpunOut

        return multiplier;
    }

    // The recorded lazer score embeds its own mod-free base score; deriving the
    // multiplier from that is exact, where the fixed per-mod table above is only an estimate.
    private static double LazerCalibratedMultiplier(SimulationRequest request, double fallback)
    {
        try
        {
            var json = ReplayFileReader.TryDecodeLazerScoreInfo(Convert.FromBase64String(request.LazerScoreInfo!));
            if (json is null)
                return fallback;

            using var document = JsonDocument.Parse(json);

            if (!document.RootElement.TryGetProperty("total_score_without_mods", out var value)
                || !value.TryGetInt64(out var withoutMods) || withoutMods <= 0)
                return fallback;

            var multiplier = request.SourceScore!.Value / (double)withoutMods;

            return double.IsFinite(multiplier) && multiplier > 0 ? multiplier : fallback;
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            return fallback;
        }
    }

    public static bool MatchesRecordedResult(SimulationResult result, SimulationRequest request)
    {
        if (!MatchesRecordedAggregates(result, request))
            return false;

        if (result.Client != "lazer" || string.IsNullOrWhiteSpace(request.LazerScoreInfo))
            return true;

        return MatchesRecordedLazerStatistics(result, request.LazerScoreInfo);
    }

    public static SimulationResult ReconcileRecordedLazerResult(SimulationResult result, SimulationRequest request)
    {
        if (result.Client != "lazer" || request.SourceMods != request.Mods ||
            !MatchesRecordedAggregates(result, request) || string.IsNullOrWhiteSpace(request.LazerScoreInfo))
            return result;

        try
        {
            var json = ReplayFileReader.TryDecodeLazerScoreInfo(Convert.FromBase64String(request.LazerScoreInfo));
            if (json is null)
                return result;

            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("statistics", out var actual) ||
                !root.TryGetProperty("maximum_statistics", out var maximum))
                return result;

            var sliderTicks = Count(actual, "large_tick_hit");
            var sliderTickTotal = Count(maximum, "large_tick_hit");
            var sliderEnds = Count(actual, "slider_tail_hit");
            var sliderEndTotal = Count(maximum, "slider_tail_hit");
            var spinnerSpins = Count(actual, "small_bonus");
            var spinnerSpinTotal = Count(maximum, "small_bonus");
            var spinnerBonus = Count(actual, "large_bonus");
            var spinnerBonusTotal = Count(maximum, "large_bonus");

            // Replay metadata is authoritative for a sampling-boundary difference in spinner
            // rotations only. Keep real slider or beatmap-model discrepancies visible.
            if (result.SliderTicksHit != sliderTicks || result.SliderTicksTotal != sliderTickTotal ||
                result.SliderEndsHit != sliderEnds || result.SliderEndsTotal != sliderEndTotal ||
                result.SpinnerSpinsTotal != spinnerSpinTotal || result.SpinnerBonusTotal != spinnerBonusTotal)
                return result;

            var recordedBonusScore = spinnerSpins * 10L + spinnerBonus * 50L;
            var bonusDelta = recordedBonusScore - result.BonusScore;
            var correctedScore = result.Score + (long)Math.Round(
                bonusDelta * LazerScoreMultiplier(request), MidpointRounding.AwayFromZero);

            return result with
            {
                Score = correctedScore,
                BonusScore = recordedBonusScore,
                SliderTicksHit = sliderTicks,
                SliderTicksTotal = sliderTickTotal,
                SliderEndsHit = sliderEnds,
                SliderEndsTotal = sliderEndTotal,
                SpinnerSpinsHit = spinnerSpins,
                SpinnerSpinsTotal = spinnerSpinTotal,
                SpinnerBonusHit = spinnerBonus,
                SpinnerBonusTotal = spinnerBonusTotal
            };
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            return result;
        }
    }

    public static bool MatchesRecordedAggregates(SimulationResult result, SimulationRequest request)
    {
        if (!request.SourceUnedited || request.SourceScore is null || request.SourceMaxCombo is null
            || request.SourceHitCounts is not { Length: >= 6 })
            return false;

        return (result.Client == "lazer" || result.Score == request.SourceScore)
               && result.MaxCombo == request.SourceMaxCombo
               && result.Count300 == request.SourceHitCounts[0]
               && result.Count100 == request.SourceHitCounts[1]
               && result.Count50 == request.SourceHitCounts[2]
               && result.Misses == request.SourceHitCounts[5];
    }

    private static bool MatchesRecordedLazerStatistics(SimulationResult result, string lazerScoreInfo)
    {
        try
        {
            var json = ReplayFileReader.TryDecodeLazerScoreInfo(Convert.FromBase64String(lazerScoreInfo));
            if (json is null)
                return false;

            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;

            if (!root.TryGetProperty("statistics", out var actual) ||
                !root.TryGetProperty("maximum_statistics", out var maximum))
                return false;

            return result.SliderTicksHit == Count(actual, "large_tick_hit")
                   && result.SliderTicksTotal == Count(maximum, "large_tick_hit")
                   && result.SliderEndsHit == Count(actual, "slider_tail_hit")
                   && result.SliderEndsTotal == Count(maximum, "slider_tail_hit")
                   && result.SpinnerSpinsHit == Count(actual, "small_bonus")
                   && result.SpinnerSpinsTotal == Count(maximum, "small_bonus")
                   && result.SpinnerBonusHit == Count(actual, "large_bonus")
                   && result.SpinnerBonusTotal == Count(maximum, "large_bonus");
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            return false;
        }
    }

    private static int Count(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var count) ? count : 0;
}
