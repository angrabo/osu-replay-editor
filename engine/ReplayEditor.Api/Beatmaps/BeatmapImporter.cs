using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.Api.Beatmaps;

/// <summary>
/// Handles manual `.osz`/`.osu` import when online resolution is unavailable or failed.
/// </summary>
internal sealed class BeatmapImporter(BeatmapCache cache)
{
    public async Task<MapResolution> ImportAsync(string hash, string filename, byte[] bytes, CancellationToken ct)
    {
        if (!ReplayHeaderReader.IsMd5(hash))
            return MapResolutions.Empty("invalid", hash, "Load a valid .osr first.");

        try
        {
            BeatmapPackage package;
            if (filename.EndsWith(".osz", StringComparison.OrdinalIgnoreCase))
                package = BeatmapArchive.InspectOsz(bytes, hash, "manual-osz");
            else if (filename.EndsWith(".osu", StringComparison.OrdinalIgnoreCase))
                package = BeatmapArchive.InspectOsu(bytes, hash);
            else
                return MapResolutions.Empty("invalid", hash, "Select an .osz or .osu file.");

            if (package.ExactDifficulty is null)
                return MapResolutions.FromPackage(hash, package, null);

            if (filename.EndsWith(".osz", StringComparison.OrdinalIgnoreCase))
                package = package with { ArchivePath = await cache.CacheAsync(bytes, null, ct) };
            else
                await cache.SaveLooseDifficultyAsync(hash, bytes, ct);

            return MapResolutions.FromPackage(hash, package, null);
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException or OverflowException)
        {
            return MapResolutions.Empty("invalid", hash, "Beatmap file is corrupt, unsafe, or exceeds the size limit.");
        }
    }
}
