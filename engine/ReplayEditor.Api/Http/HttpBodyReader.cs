namespace ReplayEditor.Api.Http;

internal static class HttpBodyReader
{
    public static async Task<byte[]> ReadLimitedAsync(HttpContent content, long limit, CancellationToken ct)
    {
        await using var stream = await content.ReadAsStreamAsync(ct);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        long total = 0;
        int count;

        while ((count = await stream.ReadAsync(buffer, ct)) > 0)
        {
            total += count;
            if (total > limit)
                throw new InvalidDataException("File exceeds the size limit.");
            output.Write(buffer, 0, count);
        }

        return output.ToArray();
    }
}
