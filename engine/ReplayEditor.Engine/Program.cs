using ReplayEditor.Api;
using ReplayEditor.Engine.Security;
using ReplayEditor.Engine.Services;
using ReplayEditor.Osu;

var portText = ArgumentValue(args, "--port");
var nonce = ArgumentValue(args, "--nonce");

if (!int.TryParse(portText, out var port) || port is < 1 or > 65535 || string.IsNullOrWhiteSpace(nonce))
{
    Console.Error.WriteLine("Usage: ReplayEditor.Engine --port <loopback port> --nonce <session nonce>");
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = BeatmapArchive.MaxArchiveBytes + 1024);
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

builder.Services.AddControllers();
builder.Services.AddSingleton(_ => new OsuService());
builder.Services.AddScoped<IReplayCodecService, ReplayCodecService>();
builder.Services.AddScoped<ISimulationService, SimulationService>();

builder.Services.AddCors(options => options.AddPolicy("desktop", policy => policy
    .WithOrigins("http://localhost:1420", "http://127.0.0.1:1420", "http://tauri.localhost", "tauri://localhost")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseCors("desktop");
app.UseSessionNonce(nonce);
app.MapControllers();

await app.RunAsync();

static string? ArgumentValue(string[] arguments, string key)
{
    var index = Array.IndexOf(arguments, key);
    return index >= 0 && index + 1 < arguments.Length ? arguments[index + 1] : null;
}
