namespace ReplayEditor.Simulation.Beatmap;

/// <summary>
/// One parsed `.osu` hit object: its kind ("circle"/"slider"/"spinner"), start/end
/// time, and (for sliders) the sampled pixel path used for ball-following and duration.
/// </summary>
internal sealed record MapObject(
    string Kind,
    double X,
    double Y,
    double Start,
    double End,
    (double X, double Y)[] Path,
    int Repeats,
    double BeatLength,
    bool NewCombo);

/// <summary>
/// A parsed `.osu` difficulty: mod-adjusted CS/AR/OD, slider velocity settings, the
/// legacy ScoreV1 difficulty multiplier, timing points, and stacked hit objects in start order.
/// </summary>
internal sealed record MapData(
    double Cs,
    double Od,
    double Hp,
    double SliderMultiplier,
    double SliderTickRate,
    int DifficultyMultiplier,
    (double Time, double BeatLength, bool Uninherited)[] Timing,
    MapObject[] Objects);
