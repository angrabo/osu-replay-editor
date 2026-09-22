using Microsoft.AspNetCore.Mvc;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
public sealed class HealthController : ControllerBase
{
    [HttpGet("/health")]
    public IActionResult Health() => Ok(new { status = "ready" });

    [HttpGet("/version")]
    public IActionResult Version() => Ok(new { version = "0.1.0", api = 1 });
}
