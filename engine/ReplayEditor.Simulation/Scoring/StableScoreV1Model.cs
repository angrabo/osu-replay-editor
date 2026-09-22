using ReplayEditor.Core;

namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// The legacy stable ScoreV1 model: each hit's point value is scaled by the current
/// combo and the map's difficulty multiplier.
/// </summary>
internal sealed class StableScoreV1Model : ScoreModel
{
    public override string Name => "editor-stable-v1";

    public override string PrimaryWarning =>
        "ScoreV1 calculation is an estimate until per-object judgements match the imported replay. Nothing is submitted to osu!.";

    public (long Score, int MaximumCombo, int EndingCombo, long[] ScoreAfter) Compute(
        IEnumerable<StableScoreEvent> events, IReadOnlyList<ObjectJudgement> judgements,
        int difficultyMultiplier, double scoreMultiplier)
    {
        long score = 0;
        var combo = 0;
        var maximumCombo = 0;
        var orderedEvents = events.OrderBy(item => item.Time).ThenBy(item => item.Order).ToArray();
        var scoreAfter = new long[judgements.Count];
        var nextJudgement = 0;
        var judgementOrder = Enumerable.Range(0, judgements.Count).OrderBy(index => judgements[index].EndTime).ToArray();

        foreach (var item in orderedEvents)
        {
            while (nextJudgement < judgementOrder.Length && judgements[judgementOrder[nextJudgement]].EndTime < item.Time)
                scoreAfter[judgementOrder[nextJudgement++]] = score;

            if (item.Hit)
            {
                score += item.ComboScaled
                    ? item.Value + (long)Math.Floor(item.Value * Math.Max(0, combo - 1) * difficultyMultiplier * scoreMultiplier / 25.0)
                    : item.Value;
                if (item.AddsCombo)
                {
                    combo++;
                    maximumCombo = Math.Max(maximumCombo, combo);
                }
            }
            else if (item.BreakOnMiss)
            {
                combo = 0;
            }
        }

        while (nextJudgement < judgementOrder.Length)
            scoreAfter[judgementOrder[nextJudgement++]] = score;

        return (score, maximumCombo, combo, scoreAfter);
    }
}
