using Microsoft.AspNetCore.Mvc;
using ReplayEditor.Api;
using ReplayEditor.Engine.Http;
using ReplayEditor.Osu;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
[Route("/api/beatmaps")]
public sealed class BeatmapController(OsuService osu) : ControllerBase
{
    [HttpGet("resolve/{hash}")]
    public async Task<IActionResult> Resolve(string hash, CancellationToken ct)
    {
        var resolution = await osu.ResolveAsync(hash, ct);

        return Ok(resolution);
    }

    [HttpGet("{hash}/file")]
    public IActionResult GetFile(string hash, [FromQuery] string name)
    {
        var file = osu.ReadBeatmapFile(hash, name);

        if (file is null)
            return NotFound(new { error = "Beatmap file is unavailable." });

        return File(file.Contents, file.ContentType, enableRangeProcessing: true);
    }

    [HttpPost("import")]
    [Consumes("application/octet-stream")]
    public async Task<IActionResult> Import([FromQuery] string hash, [FromQuery] string filename, CancellationToken ct)
    {
        if (Request.ContentLength > BeatmapArchive.MaxArchiveBytes)
            return BadRequest(new { error = "Beatmap file is too large." });

        try
        {
            using var buffer = await Request.Body.ReadLimitedAsync(BeatmapArchive.MaxArchiveBytes, ct);
            var result = await osu.ImportAsync(hash, filename, buffer.ToArray(), ct);

            return Ok(result);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException)
        {
            return BadRequest(new { error = "Beatmap file is unreadable or too large." });
        }
    }
}
