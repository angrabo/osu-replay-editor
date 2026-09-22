using System.Text;
using SharpCompress.Compressors.LZMA;

namespace ReplayEditor.M4Smoke;

/// <summary>
/// Builds synthetic `.osr` bytes and LZMA-compresses arbitrary JSON, without going
/// through <c>ReplayFileWriter</c> — these fixtures exist to test the reader independently of
/// the writer that round-trips through them elsewhere in this file.
/// </summary>
internal static class ReplayFixtures
{
    public static byte[] Fixture(string mapHash, string player, string data, int mods, int version = 20260620)
    {
        var text = Encoding.UTF8.GetBytes(data);
        var envelope = CompressLzma(text);

        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output, Encoding.UTF8, leaveOpen: true);
        writer.Write((byte)0);
        writer.Write(version);
        WriteString(writer, mapHash);
        WriteString(writer, player);
        WriteString(writer, "11111111111111111111111111111111");
        for (var i = 0; i < 6; i++)
            writer.Write((short)0);
        writer.Write(123456);
        writer.Write((short)42);
        writer.Write((byte)0);
        writer.Write(mods);
        WriteString(writer, "0|1");
        writer.Write(DateTime.UtcNow.Ticks);
        writer.Write(envelope.Length);
        writer.Write(envelope);

        if (version >= 20140721)
            writer.Write((long)0);
        else
            writer.Write(0);

        if (version >= 30000001)
        {
            writer.Write(3);
            writer.Write(new byte[] { 1, 2, 3 });
        }

        return output.ToArray();
    }

    public static byte[] CompressJson(string json) => CompressLzma(Encoding.UTF8.GetBytes(json));

    private static byte[] CompressLzma(byte[] decoded)
    {
        using var payload = new MemoryStream();
        byte[] properties;
        using (var compressor = LzmaStream.Create(new LzmaEncoderProperties(), false, payload))
        {
            properties = (byte[])compressor.Properties.Clone();
            compressor.Write(decoded);
        }

        using var result = new MemoryStream();
        result.Write(properties);
        result.Write(BitConverter.GetBytes((long)decoded.Length));
        result.Write(payload.ToArray());
        return result.ToArray();
    }

    public static void WriteString(BinaryWriter writer, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        writer.Write((byte)0x0b);
        var size = bytes.Length;
        do
        {
            var part = size & 0x7f;
            size >>= 7;
            writer.Write((byte)(part | (size > 0 ? 0x80 : 0)));
        } while (size > 0);

        writer.Write(bytes);
    }
}
