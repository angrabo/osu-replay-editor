namespace ReplayEditor.Contracts;

public sealed record OsuLoginRequest(string Username, string Password);

public sealed record VerificationRequest(string Code);

public sealed record SettingsRequest(bool RememberSession);
