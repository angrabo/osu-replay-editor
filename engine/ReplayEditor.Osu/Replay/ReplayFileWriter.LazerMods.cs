using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ReplayEditor.Core;
using ReplayEditor.Osu.Binary;

namespace ReplayEditor.Osu;

/// <summary>
/// Keeps the embedded lazer score-info JSON's `mods` array in sync with the exported replay's
/// mods (the `.osr` bitmask plus the lazer-only mods that have no bit), preserving each mod's
/// existing settings and every other JSON field. A replay without score info (one played on
/// stable and exported for lazer) gets it built from the simulated statistics.
/// </summary>
public static partial class ReplayFileWriter
{
    private static readonly (int Bit, string Acronym)[] LazerMods =
    [
        (1, "NF"), (2, "EZ"), (4, "TD"), (8, "HD"), (16, "HR"), (32, "SD"),
        (64, "DT"), (128, "RX"), (256, "HT"), (512, "NC"), (1024, "FL"),
        (2048, "AT"), (4096, "SO"), (8192, "AP"), (16384, "PF"),
        (32768, "4K"), (65536, "5K"), (131072, "6K"), (262144, "7K"),
        (524288, "8K"), (1048576, "FI"), (2097152, "RD"), (4194304, "CN"),
        (8388608, "TP"), (16777216, "9K"), (536870912, "SV2")
    ];

    private const int MaxLazerOnlyMods = 64;

    private static string[] BitmaskAcronyms(int mods) => LazerMods
        .Where(mod => (mods & mod.Bit) != 0
                      && !(mod.Bit == 32 && (mods & 16384) != 0)
                      && !(mod.Bit == 64 && (mods & 512) != 0))
        .Select(mod => mod.Acronym)
        .ToArray();

    /// <summary>
    /// The mods in a replay's lazer score info that the `.osr` bitmask cannot express (Classic,
    /// Difficulty Adjust, Daycore…), so an import can carry them through to the export.
    /// </summary>
    public static string[] LazerOnlyMods(byte[]? scoreInfo, int mods)
    {
        if (ReplayFileReader.TryDecodeLazerScoreInfo(scoreInfo) is not { } json)
            return [];
        try
        {
            if (JsonNode.Parse(json)?["mods"] is not JsonArray entries)
                return [];
            var known = BitmaskAcronyms(mods);
            return entries.OfType<JsonObject>()
                .Select(entry => entry["acronym"] is JsonValue value && value.TryGetValue<string>(out var acronym) ? acronym : null)
                .Where(acronym => acronym is not null && !known.Contains(acronym, StringComparer.OrdinalIgnoreCase))
                .Select(acronym => acronym!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// The mods a lazer replay plays with: the bitmask's plus the lazer-only acronyms, each with the
    /// settings its score info holds for it (custom rates, Difficulty Adjust values…), if any.
    /// </summary>
    public static IReadOnlyList<(string Acronym, JsonObject? Settings)> LazerModsWithSettings(byte[]? scoreInfo,
        int mods, IEnumerable<string>? lazerOnly)
    {
        var settings = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        if (ReplayFileReader.TryDecodeLazerScoreInfo(scoreInfo) is { } json)
            try
            {
                if (JsonNode.Parse(json)?["mods"] is JsonArray entries)
                    foreach (var entry in entries.OfType<JsonObject>())
                        if (entry["acronym"] is JsonValue acronym && acronym.TryGetValue<string>(out var name) &&
                            entry["settings"] is JsonObject values)
                            settings[name] = (JsonObject)values.DeepClone();
            }
            catch (JsonException)
            {
            }

        return BitmaskAcronyms(mods)
            .Concat((lazerOnly ?? []).Select(acronym => acronym.ToUpperInvariant()))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(acronym => (acronym, settings.GetValueOrDefault(acronym)))
            .ToArray();
    }

    private static byte[] UpdateLazerMods(ReplayMetadata metadata)
    {
        var original = metadata.LazerScoreInfo;
        var extras = metadata.LazerMods ?? [];
        if (extras.Length > MaxLazerOnlyMods || extras.Any(acronym =>
                acronym.Length is < 2 or > 4 || !acronym.All(char.IsAsciiLetterOrDigit)))
            throw new InvalidDataException("Lazer mod acronyms are invalid.");
        var desired = BitmaskAcronyms(metadata.Mods)
            .Concat(extras.Select(acronym => acronym.ToUpperInvariant()))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (original is null || original.Length == 0)
        {
            if (metadata.LazerStatistics is { } statistics)
                return Compress(BuildScoreInfo(metadata, statistics, desired));
            if (desired.Length != 0)
                throw new InvalidDataException("Cannot export lazer mods without valid embedded score metadata.");
            return original ?? [];
        }

        var json = ReplayFileReader.TryDecodeLazerScoreInfo(original);
        if (json is null)
        {
            if (desired.Length != 0)
                throw new InvalidDataException("Cannot update mods in unreadable lazer score metadata.");
            return original;
        }

        var root = ParseScoreInfo(json);
        var existing = root["mods"] as JsonArray ??
                       throw new InvalidDataException("Lazer score metadata has no mods array.");
        var entries = existing.OfType<JsonObject>().Where(item => item["acronym"] is JsonValue).ToDictionary(
            item => item["acronym"]!.GetValue<string>(),
            StringComparer.OrdinalIgnoreCase);
        if (existing.Count != desired.Length || !desired.All(acronym => entries.ContainsKey(acronym)))
        {
            var updated = new JsonArray();
            foreach (var acronym in desired)
                updated.Add(entries.TryGetValue(acronym, out var entry)
                                ? entry.DeepClone()
                                : new JsonObject { ["acronym"] = acronym });
            root["mods"] = updated;
        }

        SyncScore(root, metadata);
        return root.ToJsonString() == ParseScoreInfo(json).ToJsonString() ? original : Compress(root);
    }

    /// <summary>
    /// Lazer shows a replay's score from its score info, not from the `.osr` header: the judgement
    /// counts, total score, combo, accuracy and rank there are set to the exported ones. Tick, tail and
    /// bonus counts change only when the simulation supplied them.
    /// </summary>
    private static void SyncScore(JsonObject root, ReplayMetadata metadata)
    {
        var counts = metadata.HitCounts;
        var statistics = metadata.LazerStatistics;
        var great = statistics?.Great ?? counts[0];
        var ok = statistics?.Ok ?? counts[1];
        var meh = statistics?.Meh ?? counts[2];
        var miss = statistics?.Miss ?? counts[5];

        var hit = root["statistics"] as JsonObject ?? new JsonObject();
        int Read(JsonObject? source, string name) =>
            source?[name] is JsonValue value && value.TryGetValue<int>(out var number) ? number : 0;
        long ReadLong(string name) =>
            root[name] is JsonValue value && value.TryGetValue<long>(out var number) ? number : -1;
        // Nothing changed (a replay exported as imported): keep the score info exactly as it was,
        // including the accuracy lazer computed itself.
        if (statistics is null && Read(hit, "great") == great && Read(hit, "ok") == ok && Read(hit, "meh") == meh &&
            Read(hit, "miss") == miss && ReadLong("total_score") == metadata.Score &&
            ReadLong("max_combo") == metadata.MaxCombo)
            return;
        root["statistics"] = hit;
        void Set(JsonObject target, string name, int value)
        {
            if (value > 0)
                target[name] = value;
            else
                target.Remove(name);
        }

        Set(hit, "great", great);
        Set(hit, "ok", ok);
        Set(hit, "meh", meh);
        Set(hit, "miss", miss);
        if (statistics is not null)
        {
            var maximum = root["maximum_statistics"] as JsonObject ?? new JsonObject();
            root["maximum_statistics"] = maximum;
            Set(hit, "large_tick_hit", statistics.LargeTickHit);
            Set(hit, "large_tick_miss", statistics.LargeTickTotal - statistics.LargeTickHit);
            Set(hit, "slider_tail_hit", statistics.SliderTailHit);
            Set(hit, "small_bonus", statistics.SmallBonus);
            Set(hit, "large_bonus", statistics.LargeBonus);
            Set(maximum, "great", great + ok + meh + miss);
            Set(maximum, "large_tick_hit", statistics.LargeTickTotal);
            Set(maximum, "slider_tail_hit", statistics.SliderTailTotal);
            Set(maximum, "small_bonus", statistics.SmallBonusTotal);
            Set(maximum, "large_bonus", statistics.LargeBonusTotal);
        }

        var objects = great + ok + meh + miss;
        var accuracy = statistics?.Accuracy ??
                       (objects == 0 ? 1 : (300d * great + 100d * ok + 50d * meh) / (300d * objects));
        if (root["total_score"] is JsonValue oldTotal && oldTotal.TryGetValue<long>(out var previous) && previous > 0 &&
            root["total_score_without_mods"] is JsonValue withoutMods && withoutMods.TryGetValue<long>(out var bare))
            root["total_score_without_mods"] = (long)Math.Round(bare * (double)metadata.Score / previous);
        root["total_score"] = metadata.Score;
        root["max_combo"] = (int)metadata.MaxCombo;
        root["accuracy"] = accuracy;
        root["rank"] = Rank(great, objects, miss, accuracy, metadata.Mods);
    }

    /// <summary>
    /// Score info for a replay that has none, in the shape lazer writes: mods, the judgement
    /// counts and their maximums, and the rank those counts earn.
    /// </summary>
    private static JsonObject BuildScoreInfo(ReplayMetadata metadata, LazerScoreStatistics statistics, string[] mods)
    {
        var hit = new JsonObject();
        var maximum = new JsonObject();
        void Add(string name, int count, int total)
        {
            if (count > 0)
                hit[name] = count;
            if (total > 0)
                maximum[name] = total;
        }

        var objects = statistics.Great + statistics.Ok + statistics.Meh + statistics.Miss;
        Add("great", statistics.Great, objects);
        Add("ok", statistics.Ok, 0);
        Add("meh", statistics.Meh, 0);
        Add("miss", statistics.Miss, 0);
        Add("large_tick_hit", statistics.LargeTickHit, statistics.LargeTickTotal);
        Add("large_tick_miss", statistics.LargeTickTotal - statistics.LargeTickHit, 0);
        Add("slider_tail_hit", statistics.SliderTailHit, statistics.SliderTailTotal);
        Add("small_bonus", statistics.SmallBonus, statistics.SmallBonusTotal);
        Add("large_bonus", statistics.LargeBonus, statistics.LargeBonusTotal);

        return new JsonObject
        {
            ["client_version"] = "osu! Replay Editor",
            ["rank"] = Rank(statistics.Great, objects, statistics.Miss, statistics.Accuracy ?? BasicAccuracy(statistics, objects),
                metadata.Mods),
            ["user_id"] = 1,
            ["online_id"] = -1,
            ["mods"] = new JsonArray(mods.Select(acronym => (JsonNode)new JsonObject { ["acronym"] = acronym }).ToArray()),
            ["statistics"] = hit,
            ["maximum_statistics"] = maximum,
            ["pauses"] = new JsonArray()
        };
    }

    private static double BasicAccuracy(LazerScoreStatistics statistics, int objects) => objects == 0
        ? 1
        : (300d * statistics.Great + 100d * statistics.Ok + 50d * statistics.Meh) / (300d * objects);

    private static string Rank(int great, int objects, int miss, double accuracy, int mods)
    {
        // Hidden and Flashlight turn SS and S silver.
        var silver = (mods & (8 | 1024)) != 0 ? "H" : "";
        if (great == objects)
            return "X" + silver;
        if (accuracy >= .95 && miss == 0)
            return "S" + silver;
        return accuracy >= .9 ? "A" : accuracy >= .8 ? "B" : accuracy >= .7 ? "C" : "D";
    }

    private static byte[] Compress(JsonObject root) => LzmaEnvelope.Compress(Encoding.UTF8.GetBytes(root.ToJsonString()));

    private static JsonObject ParseScoreInfo(string json)
    {
        try
        {
            return JsonNode.Parse(json) as JsonObject ??
                   throw new InvalidDataException("Lazer score metadata must be a JSON object.");
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException("Lazer score metadata is invalid JSON.", ex);
        }
    }
}
