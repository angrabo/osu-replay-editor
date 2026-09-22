using ReplayEditor.Api.Io;
using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.Api.Beatmaps;

/// <summary>
/// Owns the on-disk beatmapset cache directory: finding an already-cached package for a
/// replay hash, and writing newly downloaded or manually imported ones.
/// </summary>
internal sealed class BeatmapCache(string cacheRoot)
{
    public BeatmapPackage? FindCached(string hash)
    {
        if (!Directory.Exists(cacheRoot))
            return null;

        var looseDifficulty = FindLooseDifficulty(hash);
        if (looseDifficulty is not null)
            return looseDifficulty;

        return FindArchivedDifficulty(hash);
    }

    public async Task<string> CacheAsync(byte[] bytes, long? setId, CancellationToken ct)
    {
        Directory.CreateDirectory(cacheRoot);
        var name = setId is null ? $"manual-{Guid.NewGuid():N}.osz" : $"set-{setId}.osz";
        var path = Path.Combine(cacheRoot, name);

        await AtomicFile.WriteAsync(path, bytes, ct);

        return path;
    }

    public async Task SaveLooseDifficultyAsync(string hash, byte[] bytes, CancellationToken ct)
    {
        Directory.CreateDirectory(cacheRoot);
        await File.WriteAllBytesAsync(LooseDifficultyPath(hash), bytes, ct);
    }

    public bool TryReadLooseDifficulty(string hash, out byte[] contents)
    {
        var path = LooseDifficultyPath(hash);
        if (!File.Exists(path))
        {
            contents = [];
            return false;
        }

        contents = File.ReadAllBytes(path);
        return true;
    }

    private BeatmapPackage? FindLooseDifficulty(string hash)
    {
        var path = LooseDifficultyPath(hash);
        if (!File.Exists(path))
            return null;

        try
        {
            var file = new FileInfo(path);
            if (file.Length > 16 * 1024 * 1024)
                return null;

            var loose = BeatmapArchive.InspectOsu(File.ReadAllBytes(path), hash);
            return loose.ExactDifficulty is not null ? loose with { Source = "cache" } : null;
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            return null;
        }
    }

    private BeatmapPackage? FindArchivedDifficulty(string hash)
    {
        foreach (var path in Directory.EnumerateFiles(cacheRoot, "*.osz"))
        {
            try
            {
                var file = new FileInfo(path);
                if (file.Length > BeatmapArchive.MaxArchiveBytes)
                    continue;

                var package = BeatmapArchive.InspectOsz(File.ReadAllBytes(path), hash, "cache", path);
                if (package.ExactDifficulty is not null)
                    return package;
            }
            catch (Exception ex) when (ex is InvalidDataException or IOException or OverflowException)
            {
            }
        }

        return null;
    }

    private string LooseDifficultyPath(string hash) =>
        Path.Combine(cacheRoot, $"difficulty-{hash.ToLowerInvariant()}.osu");
}
