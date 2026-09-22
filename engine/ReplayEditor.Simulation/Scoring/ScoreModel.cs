namespace ReplayEditor.Simulation.Scoring;

/// <summary>
/// A supported scoring model (stable ScoreV1, stable ScoreV2, or lazer). Each concrete
/// model owns its own score-accumulation algorithm; <see cref="Name"/> and
/// <see cref="PrimaryWarning"/> are what <see cref="SimulationEngine"/> reports back to the
/// caller, so picking a model also picks the result's labelling.
/// </summary>
internal abstract class ScoreModel
{
    public abstract string Name { get; }

    public abstract string PrimaryWarning { get; }
}
