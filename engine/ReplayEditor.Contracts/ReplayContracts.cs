using ReplayEditor.Core;

namespace ReplayEditor.Contracts;

public sealed record ReplayExportMetadata(
    int Version,
    string BeatmapHash,
    string PlayerName,
    string ReplayHash,
    int[] HitCounts,
    int Score,
    int MaxCombo,
    bool Perfect,
    int Mods,
    string LifeGraph,
    string TimestampTicks,
    string OnlineScoreId,
    double? TargetPracticeAccuracy,
    int? RngSeed,
    string? LazerScoreInfo);

public sealed record ReplayExportRequest(string? Filename, ReplayExportMetadata Metadata, SimulationFrame[] Frames);

public sealed record ReplayExportResult(string Path, int Bytes);

/// <summary>
/// Reshapes <see cref="ReplayMetadata"/> for JSON transport: 64-bit fields become strings so JS numbers stay exact.
/// </summary>
public sealed record ParsedReplayMetadata(
    byte Mode,
    int Version,
    string BeatmapHash,
    string PlayerName,
    string ReplayHash,
    ushort[] HitCounts,
    int Score,
    ushort MaxCombo,
    bool Perfect,
    int Mods,
    string LifeGraph,
    string TimestampTicks,
    string OnlineScoreId,
    double? TargetPracticeAccuracy,
    int? RngSeed,
    byte[]? LazerScoreInfo);

public sealed record ParsedReplayResponse(
    ParsedReplayMetadata Metadata,
    ReplayFrame[] Frames,
    ReplayKeyEvent[] KeyEvents);
