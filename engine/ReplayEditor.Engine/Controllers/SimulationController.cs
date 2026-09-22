using Microsoft.AspNetCore.Mvc;
using ReplayEditor.Contracts;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Engine.Services;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
[Route("/api/simulation")]
public sealed class SimulationController(ISimulationService simulation) : ControllerBase
{
    [HttpPost("whole")]
    public IActionResult Whole(SimulationRequest request, CancellationToken ct)
    {
        try
        {
            var result = simulation.Simulate(request, ct);

            return Ok(result);
        }
        catch (RequestValidationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (ResourceNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (OperationFailedException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
