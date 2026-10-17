using Microsoft.AspNetCore.Mvc;
using ReplayEditor.Contracts;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Engine.Services;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
[Route("/api/performance")]
public sealed class PerformanceController(PerformanceCalculatorService performance) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct) => Ok(await performance.StatusAsync(ct));

    [HttpPost("install")]
    public Task<IActionResult> Install(PerformanceInstallRequest request, CancellationToken ct) =>
        Handle(async () => await performance.InstallAsync(request.Version, ct));

    [HttpDelete]
    public Task<IActionResult> Remove() => Handle(() => Task.FromResult<object>(performance.Remove()));

    [HttpPost]
    public Task<IActionResult> Calculate(PerformanceRequest request, CancellationToken ct) =>
        Handle(async () => await performance.CalculateAsync(request, ct));

    private async Task<IActionResult> Handle(Func<Task<object>> action)
    {
        try
        {
            return Ok(await action());
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
