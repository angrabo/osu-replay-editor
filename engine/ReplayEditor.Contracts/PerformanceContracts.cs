namespace ReplayEditor.Contracts;

/// <summary>Judgement counts in lazer's terms, as the performance calculator expects them.</summary>
public sealed record PerformanceCounts(
    int Great,
    int Ok,
    int Meh,
    int Miss,
    int LargeTickHit,
    int LargeTickMiss,
    int SliderTailHit,
    int SmallBonus,
    int LargeBonus);

/// <summary>
/// A simulated play to rate: the beatmap difficulty (from the cache), the game it is for, its
/// mods (the bitmask, lazer-only acronyms and the replay's lazer score info for mod settings)
/// and the simulated counts.
/// </summary>
public sealed record PerformanceRequest(
    string Hash,
    string Filename,
    string Client,
    int Mods,
    string[]? LazerMods,
    string? LazerScoreInfo,
    int MaxCombo,
    PerformanceCounts Statistics,
    PerformanceCounts MaximumStatistics);

public sealed record PerformanceInstallRequest(string Version);

public sealed record PerformanceStatus(bool Installed, string? Calculator, long? Bytes, string? Message = null);

public sealed record PerformanceResult(
    double Pp,
    double Aim,
    double Speed,
    double Accuracy,
    double Flashlight,
    double Stars,
    int MaxCombo,
    double ScoreAccuracy,
    string Calculator);
