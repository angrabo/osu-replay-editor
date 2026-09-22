using ReplayEditor.Api.Beatmaps;
using ReplayEditor.Api.Http;
using ReplayEditor.Api.Sessions;

namespace ReplayEditor.Api;

/// <summary>
/// Public facade over authentication, session storage, and beatmap acquisition.
/// Each concern lives in its own collaborator (see the Sessions/ and Beatmaps/ folders); this
/// class only wires them together and exposes the surface the sidecar controllers call.
/// </summary>
public sealed class OsuService
{
    private readonly OsuSessionState session;
    private readonly OsuAuthService auth;
    private readonly BeatmapResolver resolver;
    private readonly BeatmapImporter importer;
    private readonly BeatmapFileReader fileReader;

    public OsuService(HttpMessageHandler? testHandler = null, string? testCacheRoot = null)
    {
        var dataRoot = testCacheRoot ?? Path.Combine(
                           Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                           "osu-replay-editor");
        var cacheRoot = testCacheRoot ?? Path.Combine(dataRoot, "beatmapsets");

        var api = new OsuApiClient(testHandler);
        var storage = new OsuSessionStorage(dataRoot);
        var cache = new BeatmapCache(cacheRoot);

        session = new OsuSessionState(storage, dataRoot);
        auth = new OsuAuthService(api, session);
        resolver = new BeatmapResolver(api, session, cache);
        importer = new BeatmapImporter(cache);
        fileReader = new BeatmapFileReader(cache);
    }

    public SessionStatus Status() => session.Status();

    public AccountSettings Settings() => session.Settings();

    public AccountSettings UpdateSettings(bool remember) => session.UpdateSettings(remember);

    public void Logout() => session.Logout();

    public Task<SessionStatus> LoginAsync(string username, string password, CancellationToken ct) =>
        auth.LoginAsync(username, password, ct);

    public Task<SessionStatus> RequestMailVerificationAsync(CancellationToken ct) =>
        auth.RequestMailVerificationAsync(ct);

    public Task<SessionStatus> VerifySessionAsync(string code, CancellationToken ct) =>
        auth.VerifySessionAsync(code, ct);

    public Task<MapResolution> ResolveAsync(string hash, CancellationToken ct) =>
        resolver.ResolveAsync(hash, ct);

    public Task<MapResolution> ImportAsync(string hash, string filename, byte[] bytes, CancellationToken ct) =>
        importer.ImportAsync(hash, filename, bytes, ct);

    public BeatmapFile? ReadBeatmapFile(string hash, string requestedName) =>
        fileReader.ReadBeatmapFile(hash, requestedName);
}
