namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// The lazer model: a 1,000,000-point split between a combo portion (accumulated
/// chronologically, weighted by <c>sqrt(combo)</c>) and an accuracy portion, plus spinner bonus.
/// </summary>
internal sealed class LazerScoreModel : ScoreModel
{
    public override string Name => "editor-lazer-v1";

    public override string PrimaryWarning =>
        "Lazer score uses the 1,000,000 accuracy/combo model with nested slider checks and spinner bonus; replay parity is still being validated.";

    public (long Score, int MaximumCombo, int EndingCombo) Compute(
        IEnumerable<LazerScoreEvent> events, double accuracy, long bonusScore, double scoreMultiplier)
    {
        var comboScore = ComboScore(events);
        var comboProgress = comboScore.MaximumPortion <= 0 ? 1 : comboScore.CurrentPortion / comboScore.MaximumPortion;
        var scoreWithoutMods = (long)Math.Round(500_000 * accuracy * comboProgress
            + 500_000 * Math.Pow(accuracy, 5)
            + bonusScore);
        var score = (long)Math.Round(scoreWithoutMods * Math.Max(0, scoreMultiplier));

        return (score, comboScore.MaximumCombo, comboScore.EndingCombo);
    }

    private static (double CurrentPortion, double MaximumPortion, int MaximumCombo, int EndingCombo) ComboScore(
        IEnumerable<LazerScoreEvent> source)
    {
        double currentPortion = 0;
        double maximumPortion = 0;
        var combo = 0;
        var maximumCombo = 0;
        var perfectCombo = 0;

        foreach (var item in source.OrderBy(item => item.Time).ThenBy(item => item.Order))
        {
            perfectCombo++;
            maximumPortion += item.MaximumValue * Math.Sqrt(perfectCombo);

            if (item.Hit)
            {
                combo++;
                currentPortion += item.MaximumValue * Math.Sqrt(combo);
                maximumCombo = Math.Max(maximumCombo, combo);
            }
            else if (item.BreakOnMiss)
            {
                combo = 0;
            }
        }

        return (currentPortion, maximumPortion, maximumCombo, combo);
    }
}
