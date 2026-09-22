using System.Text;

namespace ReplayEditor.Osu.Binary;

/// <summary>
/// The ULEB128-length-prefixed string format shared by `.osr` headers and frame
/// streams: a 0x00 byte for empty, or 0x0b followed by a ULEB128 length and UTF-8 bytes.
/// </summary>
internal static class OsuBinaryString
{
    private const int MaxLength = 4096;

    public static string Read(BinaryReader reader)
    {
        var marker = reader.ReadByte();
        if (marker == 0)
            return "";
        if (marker != 0x0b)
            throw new InvalidDataException("Invalid replay string marker.");

        var length = 0;
        for (var i = 0; i < 5; i++)
        {
            var part = reader.ReadByte();
            length |= (part & 0x7f) << (i * 7);
            if ((part & 0x80) != 0)
                continue;

            if (length is < 0 or > MaxLength)
                throw new InvalidDataException("Replay string is too large.");
            var bytes = reader.ReadBytes(length);
            if (bytes.Length != length)
                throw new EndOfStreamException();
            return new UTF8Encoding(false, true).GetString(bytes);
        }

        throw new InvalidDataException("Invalid replay string length.");
    }

    public static void Write(BinaryWriter writer, string value)
    {
        var bytes = new UTF8Encoding(false, true).GetBytes(value);
        if (bytes.Length > MaxLength)
            throw new InvalidDataException("Replay string exceeds 4096 UTF-8 bytes.");
        if (bytes.Length == 0)
        {
            writer.Write((byte)0);
            return;
        }

        writer.Write((byte)0x0b);
        var length = (uint)bytes.Length;
        do
        {
            var part = (byte)(length & 0x7f);
            length >>= 7;
            writer.Write(length == 0 ? part : (byte)(part | 0x80));
        } while (length != 0);

        writer.Write(bytes);
    }
}
