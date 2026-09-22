using System.Net;
using System.Text.Json;
using ReplayEditor.Api.Http;
using ReplayEditor.Api.Json;

namespace ReplayEditor.Api.Sessions;

/// <summary>
/// Orchestrates the login, email-verification, and code-verification flows: talks to
/// <see cref="OsuApiClient"/>, then applies results to <see cref="OsuSessionState"/>.
/// </summary>
internal sealed class OsuAuthService(OsuApiClient api, OsuSessionState session)
{
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<SessionStatus> LoginAsync(string username, string password, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return new SessionStatus(false, null, "Enter username and password.");

        var (clientId, clientSecret) = OsuClientCredentials.Resolve();
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return new SessionStatus(false, null, "osu! client configuration is missing.");

        await gate.WaitAsync(ct);
        try
        {
            session.Logout();

            using var response = await api.RequestTokenAsync(username, password, clientId, clientSecret, ct);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                or HttpStatusCode.BadRequest)
                return new SessionStatus(false, null, "osu! rejected the login. Check credentials and client access.");
            if (!response.IsSuccessStatusCode)
                return new SessionStatus(false, null, $"osu! login failed ({(int)response.StatusCode}).");

            if (!TryReadToken(await ParseJsonAsync(response, ct), out var token, out var expiresAt))
                return new SessionStatus(false, null, "osu! returned an invalid token response.");

            session.SetToken(token, expiresAt);

            using var ownData = await api.SendAuthorizedAsync(session.Token, "api/v2/me", ct);
            if (!ownData.IsSuccessStatusCode)
            {
                session.Logout();
                return new SessionStatus(false, null, $"osu! profile request failed ({(int)ownData.StatusCode}).");
            }

            if (!session.ApplyProfile(await ParseJsonAsync(ownData, ct)))
                return new SessionStatus(false, null, "osu! returned invalid profile data.");

            return session.Status();
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            session.Logout();
            return new SessionStatus(false, null, "osu! login timed out.");
        }
        catch (HttpRequestException)
        {
            session.Logout();
            return new SessionStatus(false, null, "osu! login or profile is unavailable.");
        }
        catch (JsonException)
        {
            session.Logout();
            return new SessionStatus(false, null, "osu! returned a malformed response.");
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<SessionStatus> RequestMailVerificationAsync(CancellationToken ct)
    {
        if (!session.NeedsVerification)
            return new SessionStatus(false, null, "No session is waiting for verification.");

        try
        {
            using var response = await api.SendAuthorizedAsync(session.Token,
                                     "api/v2/session/verify/mail-fallback",
                                     ct,
                                     HttpMethod.Post);
            if (!response.IsSuccessStatusCode)
                return session.Status() with
                {
                    Message = await ErrorMessageAsync(response, "Could not send the email verification code.", ct)
                };

            session.SetVerificationMethod("mail");
            return session.Status() with { Message = "Verification code sent to your email." };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return session.Status() with { Message = "Email verification request timed out." };
        }
        catch (HttpRequestException)
        {
            return session.Status() with { Message = "Email verification is unavailable." };
        }
    }

    public async Task<SessionStatus> VerifySessionAsync(string code, CancellationToken ct)
    {
        if (!session.NeedsVerification)
            return new SessionStatus(false, null, "No session is waiting for verification.");

        if (!TryValidateCode(code.Trim(), session.VerificationMethod, out var validationError))
            return session.Status() with { Message = validationError };

        try
        {
            using var form = new MultipartFormDataContent { { new StringContent(code.Trim()), "verification_key" } };
            using var response =
                await api.SendAuthorizedAsync(session.Token, "api/v2/session/verify", ct, HttpMethod.Post, form);
            if (!response.IsSuccessStatusCode)
                return session.Status() with
                {
                    Message = await ErrorMessageAsync(response, "The verification code was rejected.", ct)
                };

            using var ownData = await api.SendAuthorizedAsync(session.Token, "api/v2/me", ct);
            if (!ownData.IsSuccessStatusCode)
                return session.Status() with
                {
                    Message = "Session was verified, but the profile could not be refreshed."
                };

            if (!session.ApplyProfile(await ParseJsonAsync(ownData, ct)))
                return session.Status() with { Message = "osu! returned invalid profile data after verification." };

            return session.IsVerified
                       ? session.Status()
                       : session.Status() with { Message = "osu! still requires session verification." };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return session.Status() with { Message = "Session verification timed out." };
        }
        catch (HttpRequestException)
        {
            return session.Status() with { Message = "Session verification is unavailable." };
        }
        catch (JsonException)
        {
            return session.Status() with { Message = "osu! returned a malformed profile response." };
        }
    }

    private static bool TryValidateCode(string code, string? verificationMethod, out string error)
    {
        var isTotp = verificationMethod == "totp";
        var valid = isTotp
                        ? code.Length is >= 4 and <= 12 && code.All(char.IsDigit)
                        : code.Length is >= 4 and <= 64 && code.All(character =>
                              char.IsAsciiLetterOrDigit(character) || character == '-');

        error = valid ? "" :
                isTotp ? "Enter a valid numeric authenticator code." : "Enter a valid email verification code.";
        return valid;
    }

    private static bool TryReadToken(JsonElement root, out string token, out DateTimeOffset expiresAt)
    {
        token = "";
        expiresAt = default;

        if (!root.TryGetProperty("access_token", out var access) || access.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(access.GetString()) ||
            !root.TryGetProperty("expires_in", out var ttl) || !ttl.TryGetInt32(out var seconds) || seconds < 1)
            return false;

        token = access.GetString()!;
        expiresAt = DateTimeOffset.UtcNow.AddSeconds(seconds);
        return true;
    }

    private static async Task<JsonElement> ParseJsonAsync(HttpResponseMessage response, CancellationToken ct)
    {
        await using var body = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(body, cancellationToken: ct);
        return document.RootElement.Clone();
    }

    private static async Task<string> ErrorMessageAsync(HttpResponseMessage response,
        string fallback,
        CancellationToken ct)
    {
        try
        {
            var json = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            return JsonPropertyReader.StringProperty(doc.RootElement, "error_description") ??
                   JsonPropertyReader.StringProperty(doc.RootElement, "error") ?? fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }
}
