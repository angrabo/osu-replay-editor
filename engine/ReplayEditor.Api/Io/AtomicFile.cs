namespace ReplayEditor.Api.Io;

/// <summary>
/// Writes a file via a temp-then-move so a reader never observes a partially written file.
/// </summary>
internal static class AtomicFile
{
    public static void Write(string path, byte[] contents)
    {
        var temp = TempPath(path);
        try
        {
            File.WriteAllBytes(temp, contents);
            File.Move(temp, path, true);
        }
        finally
        {
            if (File.Exists(temp))
                File.Delete(temp);
        }
    }

    public static async Task WriteAsync(string path, byte[] contents, CancellationToken ct)
    {
        var temp = TempPath(path);
        try
        {
            await File.WriteAllBytesAsync(temp, contents, ct);
            File.Move(temp, path, true);
        }
        finally
        {
            if (File.Exists(temp))
                File.Delete(temp);
        }
    }

    private static string TempPath(string path) => path + $".{Guid.NewGuid():N}.tmp";
}
