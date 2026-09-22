using ReplayEditor.Core;

namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// The stable ScoreV2 model: a normalized 1,000,000-point split between a combo
/// portion (every scorable event weighted by <c>1 + combo / 10</c>) and an accuracy portion,
/// plus uncapped spinner bonus.
/// </summary>
internal sealed class StableScoreV2Model : ScoreModel
{
    public override string Name => "editor-stable-v2";

    public override string PrimaryWarning =>
        "Stable ScoreV2 uses a normalized combo and accuracy model; slider and spinner details remain estimates. Nothing is submitted to osu!.";

    public (long Score, int MaximumCombo, int EndingCombo, long[] ScoreAfter) Compute(
        IEnumerable<StableScoreEvent> events, IReadOnlyList<ObjectJudgement> judgements, double scoreMultiplier)
    {
        var orderedEvents = events.OrderBy(item => item.Time).ThenBy(item => item.Order).ToArray();
        var maximumComboBonus = MaximumComboBonus(orderedEvents);

        var judgementOrder = Enumerable.Range(0, judgements.Count).OrderBy(index => judgements[index].EndTime).ToArray();
        var scoreAfter = new long[judgements.Count];
        var nextJudgement = 0;
        var combo = 0;
        var maximumCombo = 0;
        double comboBonus = 0;
        long spinnerBonus = 0;
        double accuracyEarned = 0;

        long CurrentScore()
        {
            var progress = judgements.Count == 0 ? 0 : nextJudgement / (double)judgements.Count;
            var accuracy = nextJudgement == 0 ? 0 : accuracyEarned / (300d * nextJudgement);
            var normalized = 700_000d * (maximumComboBonus == 0 ? 0 : comboBonus / maximumComboBonus)
                + 300_000d * Math.Pow(accuracy, 10) * progress + spinnerBonus;
            return (long)Math.Round(normalized * scoreMultiplier);
        }

        void CompleteJudgement()
        {
            var index = judgementOrder[nextJudgement];
            accuracyEarned += judgements[index].Value;
            nextJudgement++;
            scoreAfter[index] = CurrentScore();
        }

        foreach (var item in orderedEvents)
        {
            while (nextJudgement < judgementOrder.Length && judgements[judgementOrder[nextJudgement]].EndTime < item.Time)
                CompleteJudgement();

            if (item.Hit)
            {
                if (item.AddsCombo)
                {
                    combo++;
                    maximumCombo = Math.Max(maximumCombo, combo);
                }

                if (item.MaximumValue > 0)
                    comboBonus += item.Value * (1 + combo / 10d);
                if (item.MaximumValue == 0 && !item.ComboScaled)
                    spinnerBonus += item.Value;
            }
            else if (item.BreakOnMiss)
            {
                combo = 0;
            }
        }

        while (nextJudgement < judgementOrder.Length)
            CompleteJudgement();

        return (CurrentScore(), maximumCombo, combo, scoreAfter);
    }

    private static double MaximumComboBonus(IEnumerable<StableScoreEvent> orderedEvents)
    {
        var perfectCombo = 0;
        double maximumComboBonus = 0;

        // Stable ScoreV2 weights every scorable event, including nested
        // slider parts, by 1 + the combo after that event / 10.
        foreach (var item in orderedEvents.Where(item => item.MaximumValue > 0))
        {
            if (item.AddsCombo || item.PerfectAddsCombo)
                perfectCombo++;
            maximumComboBonus += item.MaximumValue * (1 + perfectCombo / 10d);
        }

        return maximumComboBonus;
    }
}
