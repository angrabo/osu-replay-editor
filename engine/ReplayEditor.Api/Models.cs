using ReplayEditor.Core;

namespace ReplayEditor.Api;

public sealed record OsuUserProfile(long Id, string Username, string AvatarUrl);

public sealed record SessionStatus(
    bool Authenticated,
    DateTimeOffset? ExpiresAt,
    string? Message = null,
    OsuUserProfile? User = null,
    bool VerificationRequired = false,
    string? VerificationMethod = null);

public sealed record AccountSettings(bool RememberSession, string StorageDirectory);

public sealed record BeatmapFile(byte[] Contents, string ContentType, string Filename);

public sealed record MapResolution(
    string Status,
    string ReplayHash,
    string? Title,
    string? Artist,
    string? Creator,
    string? Version,
    long? BeatmapsetId,
    string? Source,
    string? Error,
    BeatmapDifficulty[] Difficulties,
    string[] Assets);
