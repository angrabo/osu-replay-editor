namespace ReplayEditor.Core;

public sealed record SimulationFrame(long TimeMs, double X, double Y, int Keys);

public sealed record ObjectJudgement(
    int ObjectIndex,
    string Kind,
    double StartTime,
    double EndTime,
    string Result,
    int Value,
    double? HitTime,
    double? HitError,
    double CursorDistance,
    bool Inside,
    string? Key,
    int ComboAfter,
    long ScoreAfter,
    int NestedHits = 0,
    int NestedTotal = 0,
    // Where the object was judged on the playfield: after stacking and Hard Rock.
    double ObjectX = 0,
    double ObjectY = 0);

public sealed record SimulationResult(
    string Scope,
    string Model,
    string Status,
    long Score,
    double Accuracy,
    int Count300,
    int Count100,
    int Count50,
    int Misses,
    int MaxCombo,
    int AchievedCombo,
    int TotalObjects,
    ObjectJudgement[] Judgements,
    string[] Warnings,
    string Client,
    long BonusScore,
    double SpinnerSpins,
    int SliderTicksHit,
    int SliderTicksTotal,
    int SliderEndsHit,
    int SliderEndsTotal,
    int SpinnerSpinsHit,
    int SpinnerSpinsTotal,
    int SpinnerBonusHit,
    int SpinnerBonusTotal,
    int? CountGeki = null,
    int? CountKatu = null,
    bool? Perfect = null,
    ScorePoint[]? Timeline = null,
    // The hit windows the replay was judged with (OD and rate applied), in replay milliseconds.
    HitWindowsInfo? Windows = null);

public sealed record HitWindowsInfo(double Great, double Ok, double Meh);

/// Score and combo right after one scoring moment (an object, slider tick/repeat/tail or spinner
/// bonus), in time order, so a live display can follow every step.
public sealed record ScorePoint(double Time, long Score, int Combo);
