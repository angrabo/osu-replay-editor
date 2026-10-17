using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ReplayEditor.Api;
using ReplayEditor.Contracts;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Osu;

namespace ReplayEditor.Engine.Services;

/// <summary>
/// The optional performance-points calculator: a separate program built on osu!'s own code,
/// published with each release and downloaded only when the user asks for pp. Running it as its
/// own process keeps osu!'s large dependencies (and their own Realm) out of the engine.
/// </summary>
public sealed partial class PerformanceCalculatorService(OsuService osu)
{
    private const string Repository = "angrabo/osu-replay-editor";
    private const string AssetName = "pp-calculator-win-x64.exe";
    private const long MaxDownloadBytes = 300L * 1024 * 1024;
    private static readonly TimeSpan CalculationTimeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HttpClient Http = CreateHttp();

    private readonly SemaphoreSlim gate = new(1, 1);

    private static string InstallDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "osu-replay-editor", "pp-calculator");

    // A development build can point at a locally built calculator instead of downloading one.
    private static string ExecutablePath =>
        Environment.GetEnvironmentVariable("ORE_PP_CALCULATOR") is { Length: > 0 } local && File.Exists(local)
            ? local
            : Path.Combine(InstallDirectory, "pp-calculator.exe");

    public async Task<PerformanceStatus> StatusAsync(CancellationToken ct)
    {
        var path = ExecutablePath;
        if (!File.Exists(path))
            return new PerformanceStatus(false, null, null);
        try
        {
            var version = await RunAsync(path, "--version", null, TimeSpan.FromSeconds(20), ct);
            using var document = JsonDocument.Parse(version);
            return new PerformanceStatus(true, document.RootElement.GetProperty("calculator").GetString(),
                new FileInfo(path).Length);
        }
        catch (Exception error) when (error is OperationFailedException or JsonException or KeyNotFoundException)
        {
            return new PerformanceStatus(false, null, null, $"The installed pp calculator does not start: {error.Message}");
        }
    }

    /// <summary>
    /// Downloads the calculator published with this app version, checks it against the SHA-256 the
    /// release lists, and only then puts it in place.
    /// </summary>
    public async Task<PerformanceStatus> InstallAsync(string version, CancellationToken ct)
    {
        if (!VersionPattern().IsMatch(version))
            throw new RequestValidationException("Unknown app version.");

        await gate.WaitAsync(ct);
        var download = Path.Combine(Path.GetTempPath(), $"pp-calculator-{Guid.NewGuid():N}.exe");
        try
        {
            var release = $"https://github.com/{Repository}/releases/download/v{version}/";
            using var checksumResponse = await Http.GetAsync(release + AssetName + ".sha256", ct);
            if (!checksumResponse.IsSuccessStatusCode)
                throw Fail(checksumResponse.StatusCode == System.Net.HttpStatusCode.NotFound
                    ? $"No pp calculator is published for version {version}."
                    : $"Could not reach the release ({(int)checksumResponse.StatusCode}).");
            var expected = (await checksumResponse.Content.ReadAsStringAsync(ct)).Trim().Split(' ', 2)[0].ToLowerInvariant();
            if (expected.Length != 64 || !expected.All(Uri.IsHexDigit))
                throw Fail("The release lists an invalid checksum for the pp calculator.");

            using var response = await Http.GetAsync(release + AssetName, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
                throw Fail($"Downloading the pp calculator failed ({(int)response.StatusCode}).");
            if (response.Content.Headers.ContentLength > MaxDownloadBytes)
                throw Fail("The pp calculator download is unexpectedly large.");

            await using (var source = await response.Content.ReadAsStreamAsync(ct))
            await using (var target = File.Create(download))
            {
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await source.ReadAsync(buffer, ct)) > 0)
                {
                    total += read;
                    if (total > MaxDownloadBytes)
                        throw Fail("The pp calculator download is unexpectedly large.");
                    await target.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }

            await using (var check = File.OpenRead(download))
            {
                var actual = Convert.ToHexString(await SHA256.HashDataAsync(check, ct)).ToLowerInvariant();
                if (actual != expected)
                    throw Fail("The downloaded pp calculator does not match its published checksum.");
            }

            Directory.CreateDirectory(InstallDirectory);
            File.Move(download, Path.Combine(InstallDirectory, "pp-calculator.exe"), overwrite: true);
        }
        catch (HttpRequestException error)
        {
            throw Fail($"Could not download the pp calculator: {error.Message}");
        }
        finally
        {
            if (File.Exists(download))
                File.Delete(download);
            gate.Release();
        }

        return await StatusAsync(ct);
    }

    public PerformanceStatus Remove()
    {
        var path = Path.Combine(InstallDirectory, "pp-calculator.exe");
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw Fail($"Could not remove the pp calculator: {error.Message}");
        }

        return new PerformanceStatus(false, null, null);
    }

    public async Task<PerformanceResult> CalculateAsync(PerformanceRequest request, CancellationToken ct)
    {
        var path = ExecutablePath;
        if (!File.Exists(path))
            throw new ResourceNotFoundException("The pp calculator is not installed.");
        if (request.Client is not ("stable" or "lazer"))
            throw new RequestValidationException("Unknown game client.");

        var beatmap = osu.ReadBeatmapFile(request.Hash, request.Filename)
                      ?? throw new ResourceNotFoundException("The beatmap difficulty is not available.");
        var mods = request.Client == "lazer"
            ? ReplayFileWriter.LazerModsWithSettings(
                    string.IsNullOrEmpty(request.LazerScoreInfo) ? null : Convert.FromBase64String(request.LazerScoreInfo),
                    request.Mods,
                    request.LazerMods)
                .Select(mod => new JsonObject { ["acronym"] = mod.Acronym, ["settings"] = mod.Settings })
                .ToArray()
            : [];

        var input = new JsonObject
        {
            ["beatmap"] = new UTF8Encoding(false).GetString(beatmap.Contents),
            ["client"] = request.Client,
            ["legacyMods"] = request.Mods,
            ["mods"] = new JsonArray(mods.Select(mod => (JsonNode)mod).ToArray()),
            ["maxCombo"] = request.MaxCombo,
            ["statistics"] = JsonSerializer.SerializeToNode(request.Statistics, Json),
            ["maximumStatistics"] = JsonSerializer.SerializeToNode(request.MaximumStatistics, Json),
        };

        await gate.WaitAsync(ct);
        try
        {
            var output = await RunAsync(path, null, input.ToJsonString(), CalculationTimeout, ct);
            return JsonSerializer.Deserialize<PerformanceResult>(output, Json)
                   ?? throw Fail("The pp calculator returned nothing.");
        }
        catch (JsonException)
        {
            throw Fail("The pp calculator returned an unreadable result.");
        }
        finally
        {
            gate.Release();
        }
    }

    private static async Task<string> RunAsync(string path, string? argument, string? input, TimeSpan timeout,
        CancellationToken ct)
    {
        var start = new ProcessStartInfo(path)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardInputEncoding = new UTF8Encoding(false),
            StandardOutputEncoding = Encoding.UTF8,
        };
        if (argument is not null)
            start.ArgumentList.Add(argument);

        using var process = Process.Start(start) ?? throw Fail("The pp calculator did not start.");
        var output = process.StandardOutput.ReadToEndAsync(ct);
        var error = process.StandardError.ReadToEndAsync(ct);
        if (input is not null)
            await process.StandardInput.WriteAsync(input.AsMemory(), ct);
        process.StandardInput.Close();

        using var timer = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timer.CancelAfter(timeout);
        try
        {
            await process.WaitForExitAsync(timer.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw Fail("The pp calculator took too long.");
        }

        if (process.ExitCode != 0)
            throw Fail((await error).Trim() is { Length: > 0 } message
                ? $"The pp calculator failed: {message}"
                : $"The pp calculator failed ({process.ExitCode}).");
        return await output;
    }

    // The engine's error type for a failed operation; there is no underlying exception here.
    private static OperationFailedException Fail(string message) => new(message, new InvalidOperationException(message));

    private static HttpClient CreateHttp()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("osu-replay-editor");
        return client;
    }

    [GeneratedRegex(@"^\d+\.\d+\.\d+$")]
    private static partial Regex VersionPattern();
}
