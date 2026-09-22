using Microsoft.AspNetCore.Mvc;
using ReplayEditor.Contracts;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Engine.Http;
using ReplayEditor.Engine.Services;
using ReplayEditor.Osu;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
[Route("/api/replays")]
public sealed class ReplayController(IReplayCodecService codec) : ControllerBase
{
    private const long MaxHeaderBytes = 8 * 1024 * 1024;

    [HttpPost("header")]
    [Consumes("application/octet-stream")]
    public async Task<IActionResult> Header(CancellationToken ct)
    {
        if (Request.ContentLength > MaxHeaderBytes)
            return BadRequest(new { error = "Replay file is too large." });

        using var buffer = await Request.Body.ReadLimitedAsync(MaxHeaderBytes, ct);
        buffer.Position = 0;

        return TryRun(() => codec.ReadHeader(buffer));
    }

    [HttpPost("parse")]
    [Consumes("application/octet-stream")]
    public async Task<IActionResult> Parse(CancellationToken ct)
    {
        if (Request.ContentLength > ReplayFileReader.MaxFileBytes)
            return BadRequest(new { error = "Replay file is too large." });

        using var buffer = await Request.Body.ReadLimitedAsync(ReplayFileReader.MaxFileBytes, ct);

        return TryRun(() => codec.ParseReplay(buffer.ToArray()));
    }

    [HttpPost("export")]
    public IActionResult Export(ReplayExportRequest request)
    {
        return TryRun(() => codec.ExportReplay(request));
    }

    // Maps the codec service's typed exceptions onto HTTP responses, so every
    // action above stays a plain "read body -> call service -> map result" shape.
    private IActionResult TryRun<T>(Func<T> action)
    {
        try
        {
            return Ok(action());
        }
        catch (RequestValidationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (OperationFailedException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (ExportExhaustedException ex)
        {
            return Problem(ex.Message);
        }
    }
}
