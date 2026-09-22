using System.Text;
using SharpCompress.Compressors.LZMA;

namespace ReplayEditor.Osu.Binary;

/// <summary>
/// The `.osr` LZMA envelope: 5 bytes of LZMA properties, an 8-byte little-endian
/// decoded length, then the compressed payload. Used for both the replay frame stream and the
/// embedded lazer score-info JSON.
/// </summary>
internal static class LzmaEnvelope
{
    private const int MaxDecodedBytes = 64 * 1024 * 1024;
    private const int HeaderBytes = 13;

    public static byte[] Compress(byte[] decoded)
    {
        using var payload = new MemoryStream();
        byte[] properties;
        using (var encoder = LzmaStream.Create(new LzmaEncoderProperties(), false, payload))
        {
            properties = (byte[])encoder.Properties.Clone();
            encoder.Write(decoded);
        }

        using var envelope = new MemoryStream();
        envelope.Write(properties);
        envelope.Write(BitConverter.GetBytes((long)decoded.Length));
        envelope.Write(payload.ToArray());
        return envelope.ToArray();
    }

    public static string DecompressText(byte[] envelope) =>
        new UTF8Encoding(false, true).GetString(Decompress(envelope));

    public static byte[] Decompress(byte[] envelope)
    {
        if (envelope.Length < HeaderBytes)
            throw new InvalidDataException("Replay frame stream is missing or truncated.");

        var properties = envelope[..5];
        var dictionarySize = BitConverter.ToInt32(properties, 1);
        if (dictionarySize is < 4096 or > MaxDecodedBytes)
            throw new InvalidDataException("Replay LZMA dictionary is unsupported.");

        var outputSize = BitConverter.ToInt64(envelope, 5);
        if (outputSize > MaxDecodedBytes)
            throw new InvalidDataException("Replay frame stream exceeds 64 MB.");

        using var input = new MemoryStream(envelope, HeaderBytes, envelope.Length - HeaderBytes, writable: false);
        using var decoder = LzmaStream.Create(properties, input, input.Length, outputSize);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int read;

        try
        {
            while ((read = decoder.Read(buffer)) > 0)
            {
                if (output.Length + read > MaxDecodedBytes)
                    throw new InvalidDataException("Replay frame stream exceeds 64 MB.");
                output.Write(buffer, 0, read);
            }
        }
        catch (Exception ex) when (ex is not InvalidDataException)
        {
            throw new InvalidDataException("Replay frame stream is invalid LZMA.", ex);
        }

        if (outputSize >= 0 && output.Length != outputSize)
            throw new InvalidDataException("Replay frame stream length does not match its header.");

        return output.ToArray();
    }
}
