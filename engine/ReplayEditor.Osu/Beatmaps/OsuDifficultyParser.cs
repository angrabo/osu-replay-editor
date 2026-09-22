using System.Text;
using ReplayEditor.Core;

namespace ReplayEditor.Osu;

/// <summary>
/// Parses the `[General]`/`[Metadata]`/`[Events]` sections of a single `.osu`
/// difficulty file into a <see cref="BeatmapDifficulty"/>, keyed by its content checksum.
/// </summary>
internal static class OsuDifficultyParser
{
    public static BeatmapDifficulty Parse(string name, byte[] bytes)
    {
        var text = Encoding.UTF8.GetString(bytes);
        if (!text.TrimStart('﻿').StartsWith("osu file format v", StringComparison.Ordinal))
            throw new InvalidDataException("Invalid .osu header.");

        var section = "";
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string? background = null;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim().TrimStart('﻿');
            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                section = line;
                continue;
            }

            if (section == "[Events]" && background is null && line.StartsWith("0,", StringComparison.Ordinal))
            {
                var parts = line.Split(',');
                if (parts.Length > 2)
                    background = parts[2].Trim().Trim('"');
            }

            if (section is not ("[General]" or "[Metadata]"))
                continue;
            var colon = line.IndexOf(':');
            if (colon > 0)
                values[line[..colon].Trim()] = line[(colon + 1)..].Trim();
        }

        string? Get(string key) => values.GetValueOrDefault(key);
        if (Get("Title") is null || Get("Artist") is null || Get("Creator") is null || Get("Version") is null)
            throw new InvalidDataException("Incomplete .osu metadata.");

        return new BeatmapDifficulty(name, ReplayHeaderReader.Md5(bytes), Get("Title"), Get("Artist"),
            Get("Version"), Get("Creator"), Get("AudioFilename"), background);
    }
}
