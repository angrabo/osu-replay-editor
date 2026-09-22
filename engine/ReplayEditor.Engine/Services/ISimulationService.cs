using ReplayEditor.Contracts;
using ReplayEditor.Core;

namespace ReplayEditor.Engine.Services;

/// <summary>
/// Runs replay simulation against the resolved beatmap difficulty. Owns scope validation,
/// score reconciliation, and verified-status detection so controllers stay thin.
/// </summary>
public interface ISimulationService
{
    SimulationResult Simulate(SimulationRequest request, CancellationToken ct);
}
