using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ReplayEditor.Api.Io;

namespace ReplayEditor.Api.Sessions;

internal sealed record StoredSettings(bool RememberSession);

internal sealed record StoredSession(string Token, DateTimeOffset ExpiresAt, OsuUserProfile User);

/// <summary>
/// Reads and writes the on-disk settings and session files. The session file is
/// DPAPI-encrypted and only ever considered on Windows. Owns no session business rules
/// beyond "is this stored session still usable" (expiry, shape).
/// </summary>
internal sealed class OsuSessionStorage(string dataRoot)
{
    private static readonly byte[] SessionEntropy = Encoding.UTF8.GetBytes("osu-replay-editor/session/v1");

    private readonly string settingsPath = Path.Combine(dataRoot, "settings.json");
    private readonly string sessionPath = Path.Combine(dataRoot, "session.dat");

    public bool LoadRememberSession()
    {
        try
        {
            if (!File.Exists(settingsPath))
                return true;

            return JsonSerializer.Deserialize<StoredSettings>(File.ReadAllBytes(settingsPath))?.RememberSession ?? true;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return true;
        }
    }

    public void SaveRememberSession(bool remember)
    {
        Directory.CreateDirectory(dataRoot);
        AtomicFile.Write(settingsPath, JsonSerializer.SerializeToUtf8Bytes(new StoredSettings(remember)));
    }

    public StoredSession? LoadSession(bool rememberSession)
    {
        if (!rememberSession || !OperatingSystem.IsWindows() || !File.Exists(sessionPath))
            return null;

        try
        {
            var encrypted = File.ReadAllBytes(sessionPath);
            var json = ProtectedData.Unprotect(encrypted, SessionEntropy, DataProtectionScope.CurrentUser);
            var saved = JsonSerializer.Deserialize<StoredSession>(json);

            if (saved is null || saved.ExpiresAt <= DateTimeOffset.UtcNow || string.IsNullOrWhiteSpace(saved.Token) ||
                saved.User is null)
            {
                DeleteSession();
                return null;
            }

            return saved;
        }
        catch (Exception ex) when (ex is IOException or CryptographicException or JsonException
                                       or UnauthorizedAccessException)
        {
            DeleteSession();
            return null;
        }
    }

    public void SaveSession(StoredSession session)
    {
        if (!OperatingSystem.IsWindows())
            return;

        Directory.CreateDirectory(dataRoot);
        var json = JsonSerializer.SerializeToUtf8Bytes(session);
        var encrypted = ProtectedData.Protect(json, SessionEntropy, DataProtectionScope.CurrentUser);
        AtomicFile.Write(sessionPath, encrypted);
    }

    public void DeleteSession()
    {
        try
        {
            if (File.Exists(sessionPath))
                File.Delete(sessionPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
        }
    }
}
