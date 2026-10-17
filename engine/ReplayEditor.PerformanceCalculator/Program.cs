using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using osu.Game.Beatmaps;
using osu.Game.Beatmaps.Formats;
using osu.Game.Beatmaps.Legacy;
using osu.Game.Database;
using osu.Game.IO;
using osu.Game.Online.API;
using osu.Game.Rulesets.Difficulty;
using osu.Game.Rulesets.Mods;
using osu.Game.Rulesets.Osu;
using osu.Game.Rulesets.Osu.Difficulty;
using osu.Game.Rulesets.Osu.Mods;
using osu.Game.Rulesets.Scoring;
using osu.Game.Scoring;

namespace ReplayEditor.PerformanceCalculator;

/// <summary>
/// Optional helper the editor downloads to show performance points. It uses osu!'s own difficulty
/// and performance calculators, so results match the game for the osu! version it was built
/// against. One JSON request on stdin, one JSON result on stdout; errors go to stderr with exit 1.
/// </summary>
public static class Program
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static int Main(string[] args)
    {
        // osu! logs to the console; only the JSON result may reach stdout.
        var output = Console.Out;
        Console.SetOut(TextWriter.Null);

        if (args.Contains("--version"))
        {
            output.WriteLine(JsonSerializer.Serialize(new { calculator = typeof(OsuRuleset).Assembly.GetName().Version?.ToString(3) }, Json));
            return 0;
        }

        try
        {
            using var input = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
            var request = JsonSerializer.Deserialize<PerformanceRequest>(input.ReadToEnd(), Json)
                          ?? throw new InvalidDataException("Empty request.");
            output.WriteLine(JsonSerializer.Serialize(Calculate(request), Json));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    public static PerformanceResult Calculate(PerformanceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Beatmap))
            throw new InvalidDataException("The request has no beatmap.");

        var ruleset = new OsuRuleset();
        var beatmap = Decode(request.Beatmap);
        beatmap.BeatmapInfo.Ruleset = ruleset.RulesetInfo;
        var working = new FlatWorkingBeatmap(beatmap);
        var mods = Mods(ruleset, request);

        var difficulty = (OsuDifficultyAttributes)ruleset.CreateDifficultyCalculator(working).Calculate(mods);

        var statistics = Statistics(request.Statistics);
        var score = new ScoreInfo(working.BeatmapInfo, ruleset.RulesetInfo)
        {
            Mods = mods,
            MaxCombo = request.MaxCombo,
            Statistics = statistics,
            MaximumStatistics = Statistics(request.MaximumStatistics),
        };
        score.Accuracy = StandardisedScoreMigrationTools.ComputeAccuracy(score, ruleset.CreateScoreProcessor());

        var performance = (OsuPerformanceAttributes)ruleset.CreatePerformanceCalculator()!.Calculate(score, difficulty);
        return new PerformanceResult(
            performance.Total,
            performance.Aim,
            performance.Speed,
            performance.Accuracy,
            performance.Flashlight,
            difficulty.StarRating,
            difficulty.MaxCombo,
            score.Accuracy,
            typeof(OsuRuleset).Assembly.GetName().Version?.ToString(3) ?? "");
    }

    private static Beatmap Decode(string text)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(text));
        using var reader = new LineBufferedReader(stream);
        return osu.Game.Beatmaps.Formats.Decoder.GetDecoder<Beatmap>(reader).Decode(reader);
    }

    /// <summary>
    /// Stable plays are scored as lazer imports them: their legacy mods plus Classic. Lazer plays
    /// use the mods as saved, with their settings (custom rates, Difficulty Adjust values…).
    /// </summary>
    private static Mod[] Mods(OsuRuleset ruleset, PerformanceRequest request)
    {
        if (request.Client == "stable")
            return ruleset.ConvertFromLegacyMods((LegacyMods)request.LegacyMods)
                .Append(new OsuModClassic())
                .ToArray();

        return (request.Mods ?? [])
            .Select(mod =>
            {
                var api = new APIMod { Acronym = mod.Acronym };
                foreach (var (name, value) in mod.Settings ?? [])
                    api.Settings[name] = value;
                return api.ToMod(ruleset);
            })
            .Where(mod => mod is not UnknownMod)
            .ToArray();
    }

    private static Dictionary<HitResult, int> Statistics(PerformanceStatistics? counts)
    {
        var result = new Dictionary<HitResult, int>();
        if (counts is null)
            return result;

        void Add(HitResult hit, int count)
        {
            if (count > 0)
                result[hit] = count;
        }

        Add(HitResult.Great, counts.Great);
        Add(HitResult.Ok, counts.Ok);
        Add(HitResult.Meh, counts.Meh);
        Add(HitResult.Miss, counts.Miss);
        Add(HitResult.LargeTickHit, counts.LargeTickHit);
        Add(HitResult.LargeTickMiss, counts.LargeTickMiss);
        Add(HitResult.SliderTailHit, counts.SliderTailHit);
        Add(HitResult.SmallBonus, counts.SmallBonus);
        Add(HitResult.LargeBonus, counts.LargeBonus);
        return result;
    }
}

public sealed record PerformanceRequest(
    string Beatmap,
    string Client,
    int LegacyMods,
    PerformanceMod[]? Mods,
    int MaxCombo,
    PerformanceStatistics? Statistics,
    PerformanceStatistics? MaximumStatistics);

public sealed record PerformanceMod(string Acronym, Dictionary<string, JsonElement>? Settings);

public sealed record PerformanceStatistics(
    int Great,
    int Ok,
    int Meh,
    int Miss,
    int LargeTickHit,
    int LargeTickMiss,
    int SliderTailHit,
    int SmallBonus,
    int LargeBonus);

public sealed record PerformanceResult(
    double Pp,
    double Aim,
    double Speed,
    double Accuracy,
    double Flashlight,
    double Stars,
    int MaxCombo,
    double ScoreAccuracy,
    string Calculator);
