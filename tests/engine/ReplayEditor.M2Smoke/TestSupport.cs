using System.IO.Compression;
using System.Net;
using System.Text;
using Xunit;

namespace ReplayEditor.M2Smoke;

internal static class TestSupport
{
    public static void Check(bool ok, string name) => Assert.True(ok, name);

    public static bool Throws(Action action)
    {
        try
        {
            action();
            return false;
        }
        catch (Exception ex) when (ex is InvalidDataException or EndOfStreamException)
        {
            return true;
        }
    }

    public static void WriteString(BinaryWriter writer, string text)
    {
        if (text.Length == 0)
        {
            writer.Write((byte)0);
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(text);
        writer.Write((byte)0x0b);
        writer.Write((byte)bytes.Length);
        writer.Write(bytes);
    }

    public static byte[] MakeZip(params (string Name, byte[] Content)[] files)
    {
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, true))
        {
            foreach (var (name, content) in files)
            {
                var entry = zip.CreateEntry(name);
                using var output = entry.Open();
                output.Write(content);
            }
        }

        return stream.ToArray();
    }

    public static HttpResponseMessage Json(string value) =>
        new(HttpStatusCode.OK) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
}

/// <summary>
/// An <see cref="HttpMessageHandler"/> that hands every request to a test-supplied
/// callback, so scenarios can assert on outbound requests and script osu! API responses
/// without a real network call.
/// </summary>
internal sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> reply) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => reply(request);
}

/// <summary>
/// Sets the osu! client id/secret environment variables <c>OsuService.LoginAsync</c>
/// requires for the lifetime of the scope, restoring them to unset on dispose.
/// </summary>
internal sealed class OsuClientCredentialsScope : IDisposable
{
    public OsuClientCredentialsScope()
    {
        Environment.SetEnvironmentVariable("OSU_CLIENT_ID", "test-id");
        Environment.SetEnvironmentVariable("OSU_CLIENT_SECRET", "test-secret");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("OSU_CLIENT_ID", null);
        Environment.SetEnvironmentVariable("OSU_CLIENT_SECRET", null);
    }
}
