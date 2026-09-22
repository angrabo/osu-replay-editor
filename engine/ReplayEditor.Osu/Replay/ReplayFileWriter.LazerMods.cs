using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ReplayEditor.Osu.Binary;

namespace ReplayEditor.Osu;

/// <summary>
/// Keeps the embedded lazer score-info JSON's `mods` array in sync with the exported
/// `.osr` mod bitmask, preserving each mod's existing settings and every other JSON field.
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

    private static byte[] UpdateLazerMods(byte[]? original, int mods)
    {
        var desired = LazerMods.Where(mod => (mods & mod.Bit) != 0
                                             && !(mod.Bit == 32 && (mods & 16384) != 0)
                                             && !(mod.Bit == 64 && (mods & 512) != 0)).Select(mod => mod.Acronym)
            .ToArray();

        if (original is null || original.Length == 0)
        {
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

        return LzmaEnvelope.Compress(Encoding.UTF8.GetBytes(root.ToJsonString()));
    }

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
