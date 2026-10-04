namespace ReplayEditor.Contracts;

public sealed record OsuLoginRequest(string Username, string Password);

/// <summary>Sign in with the session saved by osu!lazer in the given data folder (detected when empty).</summary>
public sealed record LazerTokenLoginRequest(string? Directory);

public sealed record VerificationRequest(string Code);

public sealed record SettingsRequest(bool RememberSession);
