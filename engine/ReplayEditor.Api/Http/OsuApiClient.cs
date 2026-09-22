using System.Net;
using System.Net.Http.Headers;

namespace ReplayEditor.Api.Http;

/// <summary>
/// Raw HTTP transport to osu.ppy.sh: client configuration, the token request, and
/// bearer-authorized calls. Carries no session or beatmap business logic.
/// </summary>
internal sealed class OsuApiClient
{
    private static readonly Uri OsuOrigin = new("https://osu.ppy.sh/");

    private readonly HttpClient http;

    public OsuApiClient(HttpMessageHandler? testHandler = null)
    {
        var handler = testHandler ?? new HttpClientHandler
        {
            AutomaticDecompression =
                DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
            AllowAutoRedirect = true
        };

        http = new HttpClient(handler) { BaseAddress = OsuOrigin, Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("osu!");
        http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        http.DefaultRequestHeaders.AcceptEncoding.ParseAdd("gzip, deflate, br");
        http.DefaultRequestHeaders.Add("x-api-version", "20260620");
    }

    public async Task<HttpResponseMessage> RequestTokenAsync(string username,
        string password,
        string clientId,
        string clientSecret,
        CancellationToken ct)
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(username), "username" },
            { new StringContent(password), "password" },
            { new StringContent("password"), "grant_type" },
            { new StringContent(clientId), "client_id" },
            { new StringContent(clientSecret), "client_secret" },
            { new StringContent("*"), "scope" }
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "oauth/token") { Content = form };

        return await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
    }

    public async Task<HttpResponseMessage> SendAuthorizedAsync(string? token,
        string path,
        CancellationToken ct,
        HttpMethod? method = null,
        HttpContent? content = null)
    {
        using var request = new HttpRequestMessage(method ?? HttpMethod.Get, path) { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
    }
}
