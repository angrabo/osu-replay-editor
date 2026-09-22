namespace ReplayEditor.Core;

public sealed record BeatmapDifficulty(
    string Filename,
    string Checksum,
    string? Title,
    string? Artist,
    string? Version,
    string? Creator,
    string? AudioFilename,
    string? BackgroundFilename);

public sealed record BeatmapPackage(
    string Source,
    string? ArchivePath,
    BeatmapDifficulty[] Difficulties,
    BeatmapDifficulty? ExactDifficulty,
    string[] Assets);
