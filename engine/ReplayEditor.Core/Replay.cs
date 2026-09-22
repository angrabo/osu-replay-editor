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
    byte[]? LazerScoreInfo)
{
    public string Client => Version >= 30000000 ? "lazer" : "stable";
}

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
