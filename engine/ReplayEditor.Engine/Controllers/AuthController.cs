using Microsoft.AspNetCore.Mvc;
using ReplayEditor.Api;
using ReplayEditor.Contracts;

namespace ReplayEditor.Engine.Controllers;

[ApiController]
public sealed class AuthController(OsuService osu) : ControllerBase
{
    [HttpGet("/api/auth/status")]
    public IActionResult Status() => Ok(osu.Status());

    [HttpGet("/api/settings")]
    public IActionResult GetSettings() => Ok(osu.Settings());

    [HttpPut("/api/settings")]
    public IActionResult UpdateSettings(SettingsRequest settings) => Ok(osu.UpdateSettings(settings.RememberSession));

    [HttpPost("/api/auth/logout")]
    public IActionResult Logout()
    {
        osu.Logout();
        return Ok(osu.Status());
    }

    [HttpPost("/api/auth/login")]
    public async Task<IActionResult> Login(OsuLoginRequest login, CancellationToken ct)
    {
        var status = await osu.LoginAsync(login.Username, login.Password, ct);
        return status.Authenticated || status.VerificationRequired ? Ok(status) : BadRequest(status);
    }

    [HttpPost("/api/auth/verification/mail")]
    public async Task<IActionResult> RequestMailVerification(CancellationToken ct)
    {
        var status = await osu.RequestMailVerificationAsync(ct);
        return status.VerificationRequired ? Ok(status) : BadRequest(status);
    }

    [HttpPost("/api/auth/verification/verify")]
    public async Task<IActionResult> VerifySession(VerificationRequest verification, CancellationToken ct)
    {
        var status = await osu.VerifySessionAsync(verification.Code, ct);
        return status.Authenticated ? Ok(status) : BadRequest(status);
    }
}
