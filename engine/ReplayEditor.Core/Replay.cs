namespace ReplayEditor.Core;

public sealed record ReplayFrame(long TimeMs, long DeltaMs, float X, float Y, int Keys);

public sealed record ReplayKeyEvent(long TimeMs, string Key, bool Down);

public sealed record ReplayMetadata(
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
    long TimestampTicks,
    long OnlineScoreId,
    double? TargetPracticeAccuracy,
    int? RngSeed,
    byte[]? LazerScoreInfo,
    // Lazer mods the bitmask cannot express (Classic, Difficulty Adjust…), by acronym.
    string[]? LazerMods = null,
    // Counts for building lazer score info when the replay has none (played on stable).
    LazerScoreStatistics? LazerStatistics = null)
{
    public string Client => Version >= 30000000 ? "lazer" : "stable";
}

/// <summary>Judgement counts of a lazer score and the most each could have been.</summary>
public sealed record LazerScoreStatistics(
    int Great,
    int Ok,
    int Meh,
    int Miss,
    int LargeTickHit,
    int LargeTickTotal,
    int SliderTailHit,
    int SliderTailTotal,
    int SmallBonus,
    int SmallBonusTotal,
    int LargeBonus,
    int LargeBonusTotal);

public sealed record ReplayFile(
    ReplayMetadata Metadata,
    ReplayFrame[] Frames,
    ReplayKeyEvent[] KeyEvents,
    ReplayFrame[] RawFrames,
    byte[] OriginalBytes)
{
    public byte[] CopyOriginal() => (byte[])OriginalBytes.Clone();
}

public sealed record ReplayHeader(byte Mode, int Version, string BeatmapHash, string PlayerName, int Mods);
