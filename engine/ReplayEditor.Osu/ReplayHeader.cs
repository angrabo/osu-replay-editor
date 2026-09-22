using System.Security.Cryptography;
using System.Text;
using ReplayEditor.Core;
using ReplayEditor.Osu.Binary;

namespace ReplayEditor.Osu;

/// <summary>
/// Reads only the `.osr` header fields needed to identify a replay's beatmap and mods,
/// without decompressing or parsing the frame stream.
/// </summary>
public static class ReplayHeaderReader
{
    public static ReplayHeader Read(Stream source)
    {
        using var reader = new BinaryReader(source, Encoding.UTF8, leaveOpen: true);
        try
        {
            var mode = reader.ReadByte();
            var version = reader.ReadInt32();
            var hash = OsuBinaryString.Read(reader);
            var player = OsuBinaryString.Read(reader);
            _ = OsuBinaryString.Read(reader); // replay checksum
            for (var i = 0; i < 6; i++)
                _ = reader.ReadInt16();
            _ = reader.ReadInt32(); // score
            _ = reader.ReadInt16(); // combo
            _ = reader.ReadBoolean();
            var mods = reader.ReadInt32();
            if (mode != 0 || !IsMd5(hash))
                throw new InvalidDataException("Expected an osu!standard replay with a beatmap checksum.");
            return new ReplayHeader(mode, version, hash.ToLowerInvariant(), player, mods);
        }
        catch (EndOfStreamException ex)
        {
            throw new InvalidDataException("Replay header is truncated.", ex);
        }
    }

    public static bool IsMd5(string? value) => value is { Length: 32 } && value.All(Uri.IsHexDigit);
    public static string Md5(ReadOnlySpan<byte> bytes) => Convert.ToHexStringLower(MD5.HashData(bytes));
}
