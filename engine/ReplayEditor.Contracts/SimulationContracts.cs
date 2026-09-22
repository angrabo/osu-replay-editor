using ReplayEditor.Core;

namespace ReplayEditor.Contracts;

public sealed record SimulationRequest(
    string Hash,
    string Filename,
    int Mods,
    int Version,
    SimulationFrame[] Frames,
    string? Scope = null,
    double? StartMs = null,
    double? EndMs = null,
    int? SourceScore = null,
    string? LazerScoreInfo = null,
    int[]? SourceHitCounts = null,
    int? SourceMaxCombo = null,
    bool SourceUnedited = false,
    int? SourceMods = null);
