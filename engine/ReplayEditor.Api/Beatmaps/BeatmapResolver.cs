using System.Net;
using System.Text.Json;
using ReplayEditor.Api.Http;
using ReplayEditor.Api.Json;
using ReplayEditor.Api.Sessions;
using ReplayEditor.Osu;

namespace ReplayEditor.Api.Beatmaps;

/// <summary>
/// Resolves a replay's beatmap: cache first, then an authenticated osu! API lookup and
/// beatmapset download. Logs the session out on an authorization failure partway through.
/// </summary>
internal sealed class BeatmapResolver(OsuApiClient api, OsuSessionState session, BeatmapCache cache)
{
    public async Task<MapResolution> ResolveAsync(string hash, CancellationToken ct)
    {
        if (!ReplayHeaderReader.IsMd5(hash))
            return MapResolutions.Empty("invalid", hash, "Invalid beatmap checksum.");
        hash = hash.ToLowerInvariant();

        var cached = cache.FindCached(hash);
        if (cached is not null)
            return MapResolutions.FromPackage(hash, cached, null);

        if (!session.IsAuthenticated)
            return MapResolutions.Empty("login-required",
                hash,
                "Sign in to resolve this beatmap, or import a matching .osz/.osu.");

        try
        {
            var lookup = await LookupBeatmapsetAsync(hash, ct);
            if (lookup.Resolution is not null)
                return lookup.Resolution;

            return await DownloadBeatmapsetAsync(hash, lookup.SetId, ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return MapResolutions.Empty("unresolved", hash, "osu! request timed out.");
        }
        catch (HttpRequestException)
        {
            return MapResolutions.Empty("unresolved", hash, "osu! is unavailable. Import a matching .osz/.osu.");
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException or IOException)
        {
            return MapResolutions.Empty("unresolved", hash, "osu! returned invalid beatmap data.");
        }
    }

    private async Task<(MapResolution? Resolution, long SetId)> LookupBeatmapsetAsync(string hash, CancellationToken ct)
    {
        using var lookup = await api.SendAuthorizedAsync(session.Token, $"api/v2/beatmaps/lookup?checksum={hash}", ct);

        if (lookup.StatusCode == HttpStatusCode.NotFound)
            return (MapResolutions.Empty("unresolved",
                           hash,
                           "Beatmap not found. Import the matching .osz/.osu manually."), 0);

        if (lookup.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            session.Logout();
            return (MapResolutions.Empty("login-required", hash, "osu! session expired. Sign in again."), 0);
        }

        if (!lookup.IsSuccessStatusCode)
            return (MapResolutions.Empty("unresolved", hash, $"Beatmap lookup failed ({(int)lookup.StatusCode})."), 0);

        await using var lookupBody = await lookup.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(lookupBody, cancellationToken: ct);
        var map = doc.RootElement;
        var apiHash = JsonPropertyReader.StringProperty(map, "checksum");
        var setId = JsonPropertyReader.LongProperty(map, "beatmapset_id");

        if (!string.Equals(apiHash, hash, StringComparison.OrdinalIgnoreCase) || setId is null or <= 0)
            return (MapResolutions.Empty("unresolved", hash, "Lookup did not confirm the exact beatmap checksum."), 0);

        return (null, setId.Value);
    }

    private async Task<MapResolution> DownloadBeatmapsetAsync(string hash, long setId, CancellationToken ct)
    {
        using var download = await api.SendAuthorizedAsync(session.Token, $"api/v2/beatmapsets/{setId}/download", ct);

        if (download.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            session.Logout();
            return MapResolutions.Empty("login-required", hash, "osu! download access was denied. Sign in again.");
        }

        if (!download.IsSuccessStatusCode)
            return MapResolutions.Empty("unresolved",
                hash,
                $"Beatmapset download failed ({(int)download.StatusCode}).");

        if (download.Content.Headers.ContentLength > BeatmapArchive.MaxArchiveBytes)
            return MapResolutions.Empty("unresolved", hash, "Beatmapset archive exceeds the size limit.");

        var bytes = await HttpBodyReader.ReadLimitedAsync(download.Content, BeatmapArchive.MaxArchiveBytes, ct);
        var package = BeatmapArchive.InspectOsz(bytes, hash, "download");
        if (package.ExactDifficulty is null)
            return MapResolutions.Empty("mismatch",
                hash,
                "Downloaded beatmapset does not contain the replay difficulty.");

        var path = await cache.CacheAsync(bytes, setId, ct);
        return MapResolutions.FromPackage(hash, package with { ArchivePath = path }, setId);
    }
}
