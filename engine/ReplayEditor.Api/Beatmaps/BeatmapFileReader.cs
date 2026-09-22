using System.IO.Compression;
using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.Api.Beatmaps;

/// <summary>
/// Serves one asset (difficulty/audio/background) belonging to an already-resolved
/// beatmap package, from either the loose cached `.osu` or the cached `.osz` archive.
/// </summary>
internal sealed class BeatmapFileReader(BeatmapCache cache)
{
    public BeatmapFile? ReadBeatmapFile(string hash, string requestedName)
    {
        if (!ReplayHeaderReader.IsMd5(hash) || !IsSafeRelativePath(requestedName))
            return null;

        var package = cache.FindCached(hash.ToLowerInvariant());
        var difficulty = package?.ExactDifficulty;
        if (package is null || difficulty is null)
            return null;

        if (!IsRequestedAsset(difficulty, requestedName))
            return null;

        return package.ArchivePath is null
                   ? ReadLooseDifficultyFile(hash, requestedName, difficulty.Filename)
                   : ReadArchivedFile(package.ArchivePath, difficulty.Filename, requestedName);
    }

    private static bool IsRequestedAsset(BeatmapDifficulty difficulty, string requestedName) =>
        new[] { difficulty.Filename, difficulty.AudioFilename, difficulty.BackgroundFilename }
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Any(name => string.Equals(NormalizePath(name!),
                NormalizePath(requestedName),
                StringComparison.OrdinalIgnoreCase));

    private BeatmapFile? ReadLooseDifficultyFile(string hash, string requestedName, string difficultyFilename)
    {
        if (!requestedName.EndsWith(".osu", StringComparison.OrdinalIgnoreCase))
            return null;

        return cache.TryReadLooseDifficulty(hash, out var contents)
                   ? new BeatmapFile(contents, "text/plain; charset=utf-8", difficultyFilename)
                   : null;
    }

    private static BeatmapFile? ReadArchivedFile(string archivePath, string difficultyFilename, string requestedName)
    {
        using var stream = File.OpenRead(archivePath);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        var normalized = NormalizePath(requestedName);
        var directory = Path.GetDirectoryName(NormalizePath(difficultyFilename))?.Replace('\\', '/');
        var candidates = string.IsNullOrWhiteSpace(directory)
                             ? new[] { normalized }
                             : new[] { normalized, $"{directory}/{normalized}" };

        var entry = archive.Entries.FirstOrDefault(item =>
            candidates.Any(candidate =>
                string.Equals(NormalizePath(item.FullName), candidate, StringComparison.OrdinalIgnoreCase)));
        if (entry is null || entry.Length > BeatmapArchive.MaxArchiveBytes)
            return null;

        using var part = entry.Open();
        using var output = new MemoryStream();
        part.CopyTo(output);

        return new BeatmapFile(output.ToArray(), ContentType(entry.FullName), entry.FullName);
    }

    private static string NormalizePath(string path) => path.Replace('\\', '/').Trim();

    private static bool IsSafeRelativePath(string path)
    {
        var normalized = NormalizePath(path);
        return !string.IsNullOrWhiteSpace(normalized) && !normalized.StartsWith('/') && !normalized.Contains(':') &&
               !normalized.Any(char.IsControl) && normalized.Split('/').All(part => part is not ("" or "." or ".."));
    }

    private static string ContentType(string filename) => Path.GetExtension(filename).ToLowerInvariant() switch
    {
        ".osu" => "text/plain; charset=utf-8",
        ".mp3" => "audio/mpeg",
        ".ogg" => "audio/ogg",
        ".wav" => "audio/wav",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "application/octet-stream"
    };
}
