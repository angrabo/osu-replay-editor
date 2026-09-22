namespace ReplayEditor.Api.Sessions;

/// <summary>
/// The osu! OAuth client id/secret baked into shipped builds. The release workflow overwrites
/// these two constants from repository variables right before compiling the sidecar, so a
/// released installer works without any setup. Local dev builds ship with these empty and fall
/// back to OSU_CLIENT_ID/OSU_CLIENT_SECRET (env var or app.config.json) — see
/// <see cref="OsuClientCredentials"/>.
/// </summary>
internal static class OsuClientSecrets
{
    public const string ClientId = "";
    public const string ClientSecret = "";
}
