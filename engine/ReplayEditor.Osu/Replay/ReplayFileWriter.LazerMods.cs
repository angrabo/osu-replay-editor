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
        if (existing.Count == desired.Length && desired.All(acronym => entries.ContainsKey(acronym)))
            return original;

        var updated = new JsonArray();
        foreach (var acronym in desired)
            updated.Add(entries.TryGetValue(acronym, out var entry)
                            ? entry.DeepClone()
                            : new JsonObject { ["acronym"] = acronym });
        root["mods"] = updated;

        return Compress(root);
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
            ["rank"] = Rank(statistics, objects, metadata.Mods),
            ["user_id"] = 1,
            ["online_id"] = -1,
            ["mods"] = new JsonArray(mods.Select(acronym => (JsonNode)new JsonObject { ["acronym"] = acronym }).ToArray()),
            ["statistics"] = hit,
            ["maximum_statistics"] = maximum,
            ["pauses"] = new JsonArray()
        };
    }

    private static string Rank(LazerScoreStatistics statistics, int objects, int mods)
    {
        var accuracy = objects == 0
            ? 1
            : (300d * statistics.Great + 100d * statistics.Ok + 50d * statistics.Meh) / (300d * objects);
        // Hidden and Flashlight turn SS and S silver.
        var silver = (mods & (8 | 1024)) != 0 ? "H" : "";
        if (statistics.Great == objects)
            return "X" + silver;
        if (accuracy >= .95 && statistics.Miss == 0)
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
