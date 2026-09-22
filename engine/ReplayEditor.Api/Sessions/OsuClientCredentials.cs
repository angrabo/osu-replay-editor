using System.Text.Json;

namespace ReplayEditor.Api.Sessions;

/// <summary>
/// Resolves the osu! OAuth client id/secret: environment variables first (CI/production), then
/// app.config.json (walked up from the executable directory, since the sidecar runs from a
/// different folder in dev vs. a packaged build) so contributors can configure credentials
/// without exporting environment variables.
/// </summary>
internal static class OsuClientCredentials
{
    private static (string? ClientId, string? ClientSecret)? cached;

    public static (string? ClientId, string? ClientSecret) Resolve()
    {
        if (cached is { } value) return value;

        var clientId = Environment.GetEnvironmentVariable("OSU_CLIENT_ID");
        var clientSecret = Environment.GetEnvironmentVariable("OSU_CLIENT_SECRET");
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
        {
            var fromFile = ReadFromConfigFile();
            clientId = string.IsNullOrWhiteSpace(clientId) ? fromFile.ClientId : clientId;
            clientSecret = string.IsNullOrWhiteSpace(clientSecret) ? fromFile.ClientSecret : clientSecret;
        }

        cached = (clientId, clientSecret);
        return cached.Value;
    }

    private static (string? ClientId, string? ClientSecret) ReadFromConfigFile()
    {
        foreach (var candidate in CandidatePaths())
        {
            if (!File.Exists(candidate)) continue;
            try
            {
                using var stream = File.OpenRead(candidate);
                using var document = JsonDocument.Parse(stream);
                if (!document.RootElement.TryGetProperty("osu", out var osu)) continue;

                var clientId = osu.TryGetProperty("clientId", out var idProperty) ? idProperty.GetString() : null;
                var clientSecret = osu.TryGetProperty("clientSecret", out var secretProperty)
                    ? secretProperty.GetString()
                    : null;
                if (!string.IsNullOrWhiteSpace(clientId) && !string.IsNullOrWhiteSpace(clientSecret))
                    return (clientId, clientSecret);
            }
            catch (JsonException)
            {
                // Malformed config file: fall through to the next candidate.
            }
        }

        return (null, null);
    }

    private static IEnumerable<string> CandidatePaths()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        for (var depth = 0; directory is not null && depth < 8; depth++, directory = directory.Parent)
            yield return Path.Combine(directory.FullName, "app.config.json");
    }
}
