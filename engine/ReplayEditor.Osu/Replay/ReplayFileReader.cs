using System.Text;
using ReplayEditor.Core;
using ReplayEditor.Osu.Binary;

namespace ReplayEditor.Osu;

/// <summary>
/// Decodes a full `.osr`: fixed header fields, the LZMA-compressed frame stream, then
/// version-dependent trailer fields. Frame-text parsing lives in the Frames partial, key-state
/// derivation in the Keys partial.
/// </summary>
public static partial class ReplayFileReader
{
    public const int MaxFileBytes = 8 * 1024 * 1024;

    private readonly record struct HeaderFields(
        byte Mode,
        int Version,
        string MapHash,
        string Player,
        string ReplayHash,
        ushort[] Counts,
        int Score,
        ushort Combo,
        bool Perfect,
        int Mods,
        string Life,
        long Timestamp);

    private readonly record struct TrailerFields(long OnlineId, double? TargetAccuracy, byte[]? LazerScoreInfo);

    public static ReplayFile Read(byte[] bytes)
    {
        ValidateFileSize(bytes);

        try
        {
            using var source = new MemoryStream(bytes, writable: false);
            using var reader = new BinaryReader(source, new UTF8Encoding(false, true), leaveOpen: true);

            var header = ReadHeaderFields(reader);
            var compressed = ReadFrameStreamBytes(reader, source);
            var trailer = ReadTrailerFields(reader, source, header.Version, header.Mods);
            EnsureFullyConsumed(source);

            var text = LzmaEnvelope.DecompressText(compressed);
            var (rawFrames, seed) = ParseFrames(text);
            var frames = DisplayFrames(rawFrames);
            if (frames.Length == 0)
                throw new InvalidDataException("Replay contains no cursor frames.");

            var metadata = BuildMetadata(header, trailer, seed);
            return new ReplayFile(metadata, frames, KeyTransitions(frames), rawFrames, (byte[])bytes.Clone());
        }
        catch (EndOfStreamException ex)
        {
            throw new InvalidDataException("Replay is truncated.", ex);
        }
        catch (DecoderFallbackException ex)
        {
            throw new InvalidDataException("Replay contains invalid UTF-8.", ex);
        }
        catch (OverflowException ex)
        {
            throw new InvalidDataException("Replay frame time is out of range.", ex);
        }
    }

    public static string? TryDecodeLazerScoreInfo(byte[]? compressed)
    {
        if (compressed is null || compressed.Length < 13)
            return null;
        try
        {
            return LzmaEnvelope.DecompressText(compressed);
        }
        catch (InvalidDataException)
        {
            return null;
        }
    }

    private static void ValidateFileSize(byte[] bytes)
    {
        if (bytes.Length is 0 or > MaxFileBytes)
            throw new InvalidDataException("Replay is empty or exceeds 8 MB.");
    }

    private static HeaderFields ReadHeaderFields(BinaryReader reader)
    {
        var mode = reader.ReadByte();
        if (mode != 0)
            throw new InvalidDataException("Only osu!standard .osr replays are supported.");
        var version = reader.ReadInt32();
        if (version <= 0)
            throw new InvalidDataException("Replay version is invalid.");

        var mapHash = OsuBinaryString.Read(reader);
        if (!ReplayHeaderReader.IsMd5(mapHash))
            throw new InvalidDataException("Replay has no valid beatmap checksum.");
        var player = OsuBinaryString.Read(reader);
        var replayHash = OsuBinaryString.Read(reader);

        var counts = new ushort[6];
        for (var index = 0; index < counts.Length; index++)
            counts[index] = reader.ReadUInt16();
        var score = reader.ReadInt32();
        var combo = reader.ReadUInt16();
        var perfect = reader.ReadByte() != 0;
        var mods = reader.ReadInt32();
        var life = OsuBinaryString.Read(reader);
        var timestamp = reader.ReadInt64();

        return new HeaderFields(mode,
            version,
            mapHash.ToLowerInvariant(),
            player,
            replayHash,
            counts,
            score,
            combo,
            perfect,
            mods,
            life,
            timestamp);
    }

    private static byte[] ReadFrameStreamBytes(BinaryReader reader, Stream source)
    {
        var compressedLength = reader.ReadInt32();
        if (compressedLength < 13 || compressedLength > MaxFileBytes ||
            compressedLength > source.Length - source.Position)
            throw new InvalidDataException("Replay frame stream is missing or truncated.");

        return reader.ReadBytes(compressedLength);
    }

    private static TrailerFields ReadTrailerFields(BinaryReader reader, Stream source, int version, int mods)
    {
        var onlineId = version >= 20140721 ? reader.ReadInt64() : version >= 20121008 ? reader.ReadInt32() : 0;

        double? targetAccuracy = null;
        if ((mods & (1 << 23)) != 0)
            targetAccuracy = reader.ReadDouble();

        byte[]? lazerScoreInfo = null;
        if (version >= 30000001)
        {
            var extraLength = reader.ReadInt32();
            if (extraLength < 0 || extraLength > source.Length - source.Position)
                throw new InvalidDataException("Lazer score metadata is truncated.");
            lazerScoreInfo = reader.ReadBytes(extraLength);
        }

        return new TrailerFields(onlineId, targetAccuracy, lazerScoreInfo);
    }

    private static void EnsureFullyConsumed(Stream source)
    {
        if (source.Position != source.Length)
            throw new InvalidDataException("Replay has unexpected trailing data.");
    }

    private static ReplayMetadata BuildMetadata(HeaderFields header, TrailerFields trailer, int? seed) => new(
        header.Mode,
        header.Version,
        header.MapHash,
        header.Player,
        header.ReplayHash,
        header.Counts,
        header.Score,
        header.Combo,
        header.Perfect,
        header.Mods,
        header.Life,
        header.Timestamp,
        trailer.OnlineId,
        trailer.TargetAccuracy,
        seed,
        trailer.LazerScoreInfo);
}
