using ReplayEditor.Core;

namespace ReplayEditor.Api.Beatmaps;

/// <summary>
/// Builds the <see cref="MapResolution"/> responses shared by resolving, importing,
/// and serving beatmap files.
/// </summary>
internal static class MapResolutions
{
    public static MapResolution FromPackage(string hash, BeatmapPackage package, long? setId)
    {
        var exact = package.ExactDifficulty;

        return new MapResolution(exact is null ? "mismatch" : "verified",
            hash,
            exact?.Title,
            exact?.Artist,
            exact?.Creator,
            exact?.Version,
            setId,
            package.Source,
            exact is null ? "No .osu difficulty matches the replay checksum." : null,
            package.Difficulties,
            package.Assets);
    }

    public static MapResolution Empty(string status, string hash, string error) =>
        new(status, hash, null, null, null, null, null, null, error, [], []);
}
