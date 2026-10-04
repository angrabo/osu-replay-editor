using System.Globalization;

namespace ReplayEditor.Api.Sessions;

/// <summary>
/// Reads the signed-in session osu!lazer keeps in its `game.ini` (`Token = access|expiry|refresh`).
/// Only the access token and its expiry are used: the file is never written and the token is
/// never refreshed, since refreshing would replace the one lazer itself relies on.
/// </summary>
internal static class LazerToken
{
    private const long MaxConfigBytes = 1024 * 1024;

    public static bool TryRead(string? directory, out string token, out DateTimeOffset expiresAt, out string problem)
    {
        token = "";
        expiresAt = default;

        if (string.IsNullOrWhiteSpace(directory))
        {
            problem = "osu!lazer was not found. Set its folder in Settings › Files.";
            return false;
        }

        string[] lines;
        try
        {
            var config = new FileInfo(Path.Combine(Path.GetFullPath(directory), "game.ini"));
            if (!config.Exists || config.Length > MaxConfigBytes)
            {
                problem = "No game.ini in the osu!lazer folder.";
                return false;
            }

            lines = File.ReadAllLines(config.FullName);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException
                                       or NotSupportedException)
        {
            problem = "Could not read osu!lazer's game.ini.";
            return false;
        }

        var value = lines.Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2 && parts[0].Trim() == "Token")
            .Select(parts => parts[1].Trim())
            .FirstOrDefault();
        var fields = value?.Split('|') ?? [];
        if (fields.Length < 2 || string.IsNullOrWhiteSpace(fields[0]) ||
            !long.TryParse(fields[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var expiry))
        {
            problem = "osu!lazer is not signed in. Sign in there first.";
            return false;
        }

        try
        {
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(expiry);
        }
        catch (ArgumentOutOfRangeException)
        {
            problem = "osu!lazer's saved session is not readable.";
            return false;
        }

        if (expiresAt <= DateTimeOffset.UtcNow)
        {
            problem = "osu!lazer's saved session has expired. Open osu!lazer once to renew it, then try again.";
            return false;
        }

        token = fields[0].Trim();
        problem = "";
        return true;
    }
}
