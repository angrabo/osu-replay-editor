namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// One scorable moment in lazer's combo-portion timeline: a judgement's maximum value
/// (used for both the "achieved" and "perfect" combo portions) and whether it was hit.
/// </summary>
// Judged = false: the play ended (failed) before this judgement; it still counts toward the maximums.
// Value: the accuracy value earned (-1: MaximumValue when hit, else 0). DisplayTime: when the judgement
// shows up during play (NaN: Time). Bonus: spinner bonus score awarded with it. The last three only
// feed the live score timeline.
internal sealed record LazerScoreEvent(double Time, int Order, int MaximumValue, bool Hit, bool BreakOnMiss = true, bool Judged = true,
    int Value = -1, double DisplayTime = double.NaN, long Bonus = 0);

/// <summary>
/// One scorable moment in a stable ScoreV1/ScoreV2 timeline: its raw point value,
/// whether combo-scaling and combo-breaking apply, and (ScoreV2 only) the event's maximum
/// value for the combo-bonus weighting.
/// </summary>
// DisplayTime: when it shows up during play (NaN: Time); only used for the live score timeline.
internal sealed record StableScoreEvent(double Time, int Order, int Value, bool Hit, bool AddsCombo,
    bool BreakOnMiss, bool ComboScaled, int MaximumValue = 0, bool PerfectAddsCombo = false, double DisplayTime = double.NaN)
{
    public double ShownAt => double.IsNaN(DisplayTime) ? Time : DisplayTime;
}
