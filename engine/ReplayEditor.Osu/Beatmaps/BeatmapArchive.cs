using System.IO.Compression;
using ReplayEditor.Core;

namespace ReplayEditor.Osu;

/// <summary>
/// Inspects a manually-imported `.osu` file or a `.osz` beatmapset archive: enumerates
/// its difficulties/assets and finds the one matching a replay's checksum, if any. Text parsing
/// of an individual `.osu` difficulty lives in <see cref="OsuDifficultyParser"/>.
/// </summary>
public static class BeatmapArchive
{
    public const long MaxArchiveBytes = 256L * 1024 * 1024;
    private const long MaxExpandedBytes = 768L * 1024 * 1024;
    private const int MaxEntries = 4096;

    public static BeatmapPackage InspectOsu(byte[] data, string replayHash, string filename = "imported.osu")
    {
        if (data.Length > 16 * 1024 * 1024)
            throw new InvalidDataException(".osu file is too large.");
        var diff = OsuDifficultyParser.Parse(filename, data);
        return new BeatmapPackage("manual-osu", null, [diff], diff.Checksum == replayHash ? diff : null, []);
    }

    public static BeatmapPackage InspectOsz(byte[] data, string replayHash, string source, string? archivePath = null)
    {
        if (data.Length > MaxArchiveBytes)
            throw new InvalidDataException(".osz archive is too large.");

        using var stream = new MemoryStream(data, writable: false);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        if (archive.Entries.Count > MaxEntries)
            throw new InvalidDataException("Too many archive entries.");

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var files = new List<string>();
        var diffs = new List<BeatmapDifficulty>();
        long expanded = 0;
        foreach (var entry in archive.Entries)
        {
            ValidatePath(entry.FullName);
            if (!names.Add(entry.FullName))
                throw new InvalidDataException("Duplicate archive path.");
            expanded = checked(expanded + entry.Length);
            if (expanded > MaxExpandedBytes)
                throw new InvalidDataException("Archive expands beyond the size limit.");
            if (entry.FullName.EndsWith('/'))
                continue;

            files.Add(entry.FullName);
            if (!entry.FullName.EndsWith(".osu", StringComparison.OrdinalIgnoreCase))
                continue;
            if (entry.Length > 16 * 1024 * 1024)
                throw new InvalidDataException(".osu difficulty is too large.");

            using var part = entry.Open();
            using var buffer = new MemoryStream();
            part.CopyTo(buffer);
            diffs.Add(OsuDifficultyParser.Parse(entry.FullName, buffer.ToArray()));
        }

        if (diffs.Count == 0)
            throw new InvalidDataException("Archive has no .osu difficulty.");
        var exact = diffs.SingleOrDefault(d => d.Checksum == replayHash);
        return new BeatmapPackage(source, archivePath, [.. diffs], exact, [.. files]);
    }

    private static void ValidatePath(string path)
    {
        var normalized = path.Replace('\\', '/').TrimEnd('/');
        if (string.IsNullOrWhiteSpace(path) || normalized.StartsWith('/') || normalized.Contains(':') ||
            normalized.Any(char.IsControl) || normalized.Split('/').Any(part => part is ".." or "." or ""))
            throw new InvalidDataException("Unsafe archive path.");
    }
}
