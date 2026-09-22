using System.Text.Json;
using ReplayEditor.Api.Json;

namespace ReplayEditor.Api.Sessions;

/// <summary>
/// Holds the in-memory session (token/expiry/profile/verification), decides when a
/// session is worth persisting, and applies the osu! `/me` profile response. Delegates the
/// actual file I/O to <see cref="OsuSessionStorage"/>.
/// </summary>
internal sealed class OsuSessionState
{
    private readonly OsuSessionStorage storage;
    private readonly string dataRoot;

    private bool rememberSession;
    private string? token;
    private DateTimeOffset? expiresAt;
    private OsuUserProfile? profile;
    private bool sessionVerified;
    private string? verificationMethod;

    public OsuSessionState(OsuSessionStorage storage, string dataRoot)
    {
        this.storage = storage;
        this.dataRoot = dataRoot;
        rememberSession = storage.LoadRememberSession();
        Restore();
    }

    public string? Token => token;

    public bool IsAuthenticated => token is not null && sessionVerified;

    public bool IsVerified => sessionVerified;

    public bool NeedsVerification => token is not null && !sessionVerified;

    public string? VerificationMethod => verificationMethod;

    public SessionStatus Status()
    {
        if (token is not null && expiresAt <= DateTimeOffset.UtcNow)
            Logout();

        return new SessionStatus(IsAuthenticated,
            expiresAt,
            User: profile,
            VerificationRequired: NeedsVerification,
            VerificationMethod: NeedsVerification ? verificationMethod ?? "totp" : null);
    }

    public AccountSettings Settings() => new(rememberSession, dataRoot);

    public AccountSettings UpdateSettings(bool remember)
    {
        rememberSession = remember;
        storage.SaveRememberSession(remember);

        if (rememberSession)
            PersistIfVerified();
        else
            storage.DeleteSession();

        return Settings();
    }

    public void Logout()
    {
        token = null;
        expiresAt = null;
        profile = null;
        sessionVerified = false;
        verificationMethod = null;
        storage.DeleteSession();
    }

    public void SetToken(string newToken, DateTimeOffset newExpiresAt)
    {
        token = newToken;
        expiresAt = newExpiresAt;
    }

    public void SetVerificationMethod(string method) => verificationMethod = method;

    public bool ApplyProfile(JsonElement user)
    {
        var userId = JsonPropertyReader.LongProperty(user, "id");
        var nickname = JsonPropertyReader.StringProperty(user, "username");
        var avatar = JsonPropertyReader.StringProperty(user, "avatar_url");

        if (userId is null or <= 0 || string.IsNullOrWhiteSpace(nickname) ||
            !Uri.TryCreate(avatar, UriKind.Absolute, out var avatarUri) ||
            avatarUri.Scheme != Uri.UriSchemeHttps || avatarUri.Host != "a.ppy.sh")
        {
            Logout();
            return false;
        }

        profile = new OsuUserProfile(userId.Value, nickname, avatarUri.ToString());
        sessionVerified = !user.TryGetProperty("session_verified", out var verified) ||
                          verified.ValueKind != JsonValueKind.False;
        verificationMethod = sessionVerified
                                 ? null
                                 : JsonPropertyReader.StringProperty(user, "session_verification_method") ?? "totp";

        if (sessionVerified)
            PersistIfVerified();

        return true;
    }

    private void PersistIfVerified()
    {
        if (!rememberSession || !OperatingSystem.IsWindows() || token is null || expiresAt is null ||
            expiresAt <= DateTimeOffset.UtcNow || profile is null || !sessionVerified) return;

        storage.SaveSession(new StoredSession(token, expiresAt.Value, profile));
    }

    private void Restore()
    {
        var saved = storage.LoadSession(rememberSession);
        if (saved is null)
            return;

        token = saved.Token;
        expiresAt = saved.ExpiresAt;
        profile = saved.User;
        sessionVerified = true;
        verificationMethod = null;
    }
}
