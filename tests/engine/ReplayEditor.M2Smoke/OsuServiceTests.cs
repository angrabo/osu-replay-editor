using System.Net;
using System.Text;
using System.Text.Json;
using ReplayEditor.Api;
using ReplayEditor.Osu;
using Xunit;
using static ReplayEditor.M2Smoke.TestSupport;

namespace ReplayEditor.M2Smoke;

public sealed class OsuServiceTests(OsuFixture fixture) : IClassFixture<OsuFixture>
{
    [Fact]
    public void ReplayHeaderDecoding()
    {
        var replay = new MemoryStream();
        using (var writer = new BinaryWriter(replay, Encoding.UTF8, true))
        {
            writer.Write((byte)0);
            writer.Write(20200101);
            WriteString(writer, fixture.Hash);
            WriteString(writer, "Tester");
            WriteString(writer, "");
            for (var i = 0; i < 6; i++)
                writer.Write((short)0);
            writer.Write(0);
            writer.Write((short)0);
            writer.Write(false);
            writer.Write(0);
        }

        replay.Position = 0;
        var header = ReplayHeaderReader.Read(replay);
        Check(header.BeatmapHash == fixture.Hash && header.PlayerName == "Tester", "replay header");
        Check(Throws(() => ReplayHeaderReader.Read(new MemoryStream([0, 1]))), "truncated replay");
    }

    [Fact]
    public void ArchiveInspection()
    {
        var package = BeatmapArchive.InspectOsz(fixture.Archive, fixture.Hash, "fixture");
        Check(package.ExactDifficulty?.Version == "Hard" && package.Assets.Length == 3, "exact difficulty and assets");
        Check(package.ExactDifficulty?.AudioFilename == "song.mp3" && package.ExactDifficulty.BackgroundFilename == "bg.jpg", "asset references");
        Check(BeatmapArchive.InspectOsz(fixture.Archive, new string('a', 32), "fixture").ExactDifficulty is null, "wrong difficulty");
        Check(Throws(() => BeatmapArchive.InspectOsz([1, 2, 3], fixture.Hash, "fixture")), "corrupt archive");
        Check(Throws(() => BeatmapArchive.InspectOsz(MakeZip(("../escape.osu", fixture.Osu)), fixture.Hash, "fixture")), "path traversal");
    }

    [Fact]
    public async Task ManualImportAndOfflineCache()
    {
        var service = new OsuService(testCacheRoot: Path.Combine(Path.GetTempPath(), $"ore-m2-smoke-{Guid.NewGuid():N}"));
        var imported = await service.ImportAsync(fixture.Hash, "fixture.osz", fixture.Archive, CancellationToken.None);
        Check(imported.Status == "verified", "manual import");

        service.Logout();
        var cached = await service.ResolveAsync(fixture.Hash, CancellationToken.None);
        Check(cached.Status == "verified" && cached.Source == "cache", "offline cache");
        Check(Encoding.UTF8.GetString(service.ReadBeatmapFile(fixture.Hash, "hard.osu")!.Contents).StartsWith("osu file format"), "viewer difficulty file");
        Check(service.ReadBeatmapFile(fixture.Hash, "song.mp3")?.Contents.SequenceEqual(new byte[] { 1, 2, 3 }) == true, "viewer audio file");
        Check(service.ReadBeatmapFile(fixture.Hash, "bg.jpg")?.Contents.SequenceEqual(new byte[] { 4, 5 }) == true, "viewer background file");
        Check(service.ReadBeatmapFile(fixture.Hash, "../hard.osu") is null && service.ReadBeatmapFile(fixture.Hash, "other.bin") is null, "viewer asset boundary");

        var wrong = await service.ImportAsync(new string('a', 32), "fixture.osz", fixture.Archive, CancellationToken.None);
        Check(wrong.Status == "mismatch", "manual wrong difficulty");
        var missing = await service.ResolveAsync(new string('b', 32), CancellationToken.None);
        Check(missing.Status == "login-required", "missing map without session");
        var bad = await service.ImportAsync(fixture.Hash, "broken.osz", [1, 2, 3], CancellationToken.None);
        Check(bad.Status == "invalid", "bad archive response");
        var loose = await service.ImportAsync(fixture.Hash, "fixture.osu", fixture.Osu, CancellationToken.None);
        Check(loose.Status == "verified", "manual .osu import");
    }

    [Fact]
    public async Task OnlineLoginProfileAndDownload()
    {
        using var _ = new OsuClientCredentialsScope();

        var calls = new List<string>();
        var handler = new FakeHandler(async request =>
        {
            CheckSharedHeaders(request, "shared");
            calls.Add(request.RequestUri!.AbsolutePath);

            if (request.RequestUri.AbsolutePath == "/oauth/token")
            {
                Check(request.Method == HttpMethod.Post && request.Content is MultipartFormDataContent, "multipart token POST");
                var body = await request.Content!.ReadAsStringAsync();
                foreach (var key in new[] { "username", "password", "grant_type", "client_id", "client_secret", "scope" })
                    Check(body.Contains($"name=\"{key}\"") || body.Contains($"name={key}"), $"multipart field {key}");
                return Json("{\"token_type\":\"Bearer\",\"expires_in\":3600,\"access_token\":\"fake-test-token\"}");
            }

            Check(request.Method == HttpMethod.Get && request.Content is null, "API GET without multipart");
            Check(request.Headers.Authorization?.ToString() == "Bearer fake-test-token", "bearer auth");

            if (request.RequestUri.AbsolutePath == "/api/v2/me")
                return Json("{\"id\":42,\"username\":\"TestNickname\",\"avatar_url\":\"https://a.ppy.sh/42\"}");
            if (request.RequestUri.AbsolutePath == "/api/v2/beatmaps/lookup")
            {
                Check(request.RequestUri.Query == $"?checksum={fixture.Hash}", "checksum lookup");
                return Json($"{{\"checksum\":\"{fixture.Hash}\",\"beatmapset_id\":123}}");
            }

            if (request.RequestUri.AbsolutePath == "/api/v2/beatmapsets/123/download")
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(fixture.Archive) };

            throw new Exception("Unexpected request");
        });

        var onlineRoot = Path.Combine(Path.GetTempPath(), $"ore-m2-online-{Guid.NewGuid():N}");
        var online = new OsuService(handler, onlineRoot);
        var signedIn = await online.LoginAsync("tester", "fake-password", CancellationToken.None);
        Check(signedIn.Authenticated && signedIn.ExpiresAt > DateTimeOffset.UtcNow, "session expiry");
        Check(signedIn.User?.Username == "TestNickname" && signedIn.User.AvatarUrl == "https://a.ppy.sh/42", "profile from /me");
        Check(!JsonSerializer.Serialize(signedIn).Contains("fake-test-token"), "token absent from status");

        var downloaded = await online.ResolveAsync(fixture.Hash, CancellationToken.None);
        Check(downloaded.Status == "verified" && downloaded.BeatmapsetId == 123, "API lookup and download");
        Check(calls.SequenceEqual(["/oauth/token", "/api/v2/me", "/api/v2/beatmaps/lookup", "/api/v2/beatmapsets/123/download"]), "HTTP request order");

        var encryptedSession = File.ReadAllBytes(Path.Combine(onlineRoot, "session.dat"));
        Check(!Encoding.UTF8.GetString(encryptedSession).Contains("fake-test-token"), "stored token encrypted");

        var restored = new OsuService(handler, onlineRoot);
        Check(restored.Status().Authenticated && restored.Status().User?.Username == "TestNickname", "remember session after restart");
        Check(restored.Settings().RememberSession, "remember session defaults on");
        restored.UpdateSettings(false);
        Check(!File.Exists(Path.Combine(onlineRoot, "session.dat")), "disable remember removes token");

        var notRestored = new OsuService(handler, onlineRoot);
        Check(!notRestored.Status().Authenticated && !notRestored.Settings().RememberSession, "disabled session stays signed out");

        online.Logout();
        Check(!online.Status().Authenticated && online.Status().User is null, "logout clears profile");
    }

    private static void CheckSharedHeaders(HttpRequestMessage request, string label)
    {
        Check(request.RequestUri?.Host == "osu.ppy.sh", "osu host");
        Check(request.Headers.UserAgent.ToString() == "osu!", $"{label} user agent");
        Check(request.Headers.AcceptLanguage.ToString() == "en", $"{label} accept language");
        Check(request.Headers.Accept.ToString() == "application/json", $"{label} JSON accept");
        Check(request.Headers.AcceptEncoding.ToString() == "gzip, deflate, br", $"{label} encodings");
        Check(request.Headers.GetValues("x-api-version").Single() == "20260620", $"{label} API version");
    }

    [Fact]
    public async Task LoginFailureModes()
    {
        using var _ = new OsuClientCredentialsScope();

        var denied = new OsuService(new FakeHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized))),
            Path.Combine(Path.GetTempPath(), $"ore-m2-denied-{Guid.NewGuid():N}"));
        Check(!(await denied.LoginAsync("tester", "wrong", CancellationToken.None)).Authenticated, "invalid credentials");

        var malformed = new OsuService(new FakeHandler(_ => Task.FromResult(Json("{oops"))),
            Path.Combine(Path.GetTempPath(), $"ore-m2-malformed-{Guid.NewGuid():N}"));
        Check(!(await malformed.LoginAsync("tester", "password", CancellationToken.None)).Authenticated, "malformed token response");

        var timeout = new OsuService(new FakeHandler(_ => throw new TaskCanceledException()),
            Path.Combine(Path.GetTempPath(), $"ore-m2-timeout-{Guid.NewGuid():N}"));
        Check((await timeout.LoginAsync("tester", "password", CancellationToken.None)).Message?.Contains("timed out") == true, "login timeout");

        var forbidden = new OsuService(new FakeHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden))),
            Path.Combine(Path.GetTempPath(), $"ore-m2-forbidden-{Guid.NewGuid():N}"));
        Check(!(await forbidden.LoginAsync("tester", "password", CancellationToken.None)).Authenticated, "forbidden login");
    }

    [Fact]
    public async Task DownloadErrorHandling()
    {
        using var _ = new OsuClientCredentialsScope();

        var downloadError = new OsuService(new FakeHandler(request => Task.FromResult(request.RequestUri!.AbsolutePath switch
        {
            "/oauth/token" => Json("{\"access_token\":\"fake\",\"expires_in\":3600}"),
            "/api/v2/me" => Json("{\"id\":42,\"username\":\"TestNickname\",\"avatar_url\":\"https://a.ppy.sh/42\"}"),
            "/api/v2/beatmaps/lookup" => Json($"{{\"checksum\":\"{fixture.Hash}\",\"beatmapset_id\":123}}"),
            _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        })), Path.Combine(Path.GetTempPath(), $"ore-m2-download-error-{Guid.NewGuid():N}"));

        Check((await downloadError.LoginAsync("tester", "password", CancellationToken.None)).Authenticated, "download error setup");
        var failedDownload = await downloadError.ResolveAsync(fixture.Hash, CancellationToken.None);
        Check(failedDownload.Status == "unresolved" && failedDownload.Error?.Contains("503") == true, "download error state");
    }

    [Fact]
    public async Task MultiFactorAuthentication()
    {
        using var _ = new OsuClientCredentialsScope();

        var mfaVerified = false;
        var mailRequested = false;
        var mfaCalls = new List<string>();
        var mfa = new OsuService(new FakeHandler(async request =>
        {
            mfaCalls.Add(request.RequestUri!.AbsolutePath);
            CheckSharedHeaders(request, "MFA");

            return request.RequestUri.AbsolutePath switch
            {
                "/oauth/token" => Json("{\"access_token\":\"mfa-token\",\"expires_in\":3600}"),
                "/api/v2/me" => Json("{\"id\":99,\"username\":\"MfaUser\",\"avatar_url\":\"https://a.ppy.sh/99\","
                    + $"\"session_verified\":{mfaVerified.ToString().ToLowerInvariant()},"
                    + $"\"session_verification_method\":\"{(mailRequested ? "mail" : "totp")}\"}}"),
                "/api/v2/session/verify/mail-fallback" => MailFallback(request, ref mailRequested),
                "/api/v2/session/verify" => await VerifyCode(request, () => mfaVerified = true),
                _ => throw new Exception("Unexpected MFA request")
            };
        }), Path.Combine(Path.GetTempPath(), $"ore-m2-mfa-{Guid.NewGuid():N}"));

        var pending = await mfa.LoginAsync("tester", "password", CancellationToken.None);
        Check(!pending.Authenticated && pending.VerificationRequired && pending.VerificationMethod == "totp", "manual TOTP prompt state");
        Check(pending.User?.Username == "MfaUser", "pending profile from /me");

        var mail = await mfa.RequestMailVerificationAsync(CancellationToken.None);
        Check(mail.VerificationRequired && mail.VerificationMethod == "mail", "switch verification to email");

        var verified = await mfa.VerifySessionAsync("452c8a4d", CancellationToken.None);
        Check(verified.Authenticated && !verified.VerificationRequired && verified.User?.Username == "MfaUser", "manual verification completes login");
        Check(mfaCalls.SequenceEqual(["/oauth/token", "/api/v2/me", "/api/v2/session/verify/mail-fallback", "/api/v2/session/verify", "/api/v2/me"]),
            "MFA request order");
    }

    private static HttpResponseMessage MailFallback(HttpRequestMessage request, ref bool mailRequested)
    {
        Check(request.Method == HttpMethod.Post && request.Content is null, "mail fallback POST");
        mailRequested = true;
        return new HttpResponseMessage(HttpStatusCode.NoContent);
    }

    private static async Task<HttpResponseMessage> VerifyCode(HttpRequestMessage verification, Action markVerified)
    {
        Check(verification.Method == HttpMethod.Post && verification.Content is MultipartFormDataContent, "manual verification multipart");
        var body = await verification.Content!.ReadAsStringAsync();
        Check(body.Contains("verification_key") && body.Contains("452c8a4d"), "manual email verification code field");
        markVerified();
        return new HttpResponseMessage(HttpStatusCode.NoContent);
    }
}
