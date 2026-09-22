namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// One scorable moment in lazer's combo-portion timeline: a judgement's maximum value
/// (used for both the "achieved" and "perfect" combo portions) and whether it was hit.
/// </summary>
internal sealed record LazerScoreEvent(double Time, int Order, int MaximumValue, bool Hit, bool BreakOnMiss = true);

/// <summary>
/// One scorable moment in a stable ScoreV1/ScoreV2 timeline: its raw point value,
/// whether combo-scaling and combo-breaking apply, and (ScoreV2 only) the event's maximum
/// value for the combo-bonus weighting.
/// </summary>
internal sealed record StableScoreEvent(double Time, int Order, int Value, bool Hit, bool AddsCombo,
    bool BreakOnMiss, bool ComboScaled, int MaximumValue = 0, bool PerfectAddsCombo = false);
