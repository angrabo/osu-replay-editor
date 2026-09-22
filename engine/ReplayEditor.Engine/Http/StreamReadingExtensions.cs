namespace ReplayEditor.Engine.Http;

public static class StreamReadingExtensions
{
    public static async Task<MemoryStream> ReadLimitedAsync(this Stream input, long limit, CancellationToken ct)
    {
        var output = new MemoryStream();
        var buffer = new byte[81920];
        long total = 0;
        try
        {
            int count;
            while ((count = await input.ReadAsync(buffer, ct)) > 0)
            {
                total += count;
                if (total > limit)
                    throw new InvalidDataException("File exceeds the size limit.");
                output.Write(buffer, 0, count);
            }

            output.Position = 0;
            return output;
        }
        catch
        {
            output.Dispose();
            throw;
        }
    }
}
