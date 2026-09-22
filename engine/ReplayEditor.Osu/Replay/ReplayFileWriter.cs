using System.Globalization;
using System.Text;
using ReplayEditor.Core;
using ReplayEditor.Osu.Binary;

namespace ReplayEditor.Osu;

/// <summary>
/// Encodes a full `.osr`, mirroring the reader's shape: fixed header fields, the
/// LZMA-compressed frame stream, then version-dependent trailer fields. Lazer mods-array
/// patching lives in the LazerMods partial.
/// </summary>
public static partial class ReplayFileWriter
{
    public static byte[] Write(ReplayMetadata metadata, IReadOnlyList<ReplayFrame> frames)
    {
        ValidateMetadata(metadata, frames);

        var envelope = LzmaEnvelope.Compress(Encoding.UTF8.GetBytes(FormatFrameText(frames, metadata.RngSeed)));

        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output, new UTF8Encoding(false, true), leaveOpen: true);

        WriteHeaderFields(writer, metadata);
        WriteFrameEnvelope(writer, envelope);
        WriteTrailerFields(writer, metadata);

        writer.Flush();
        if (output.Length > ReplayFileReader.MaxFileBytes)
            throw new InvalidDataException("Export exceeds the 8 MB replay limit.");

        return output.ToArray();
    }

    private static void ValidateMetadata(ReplayMetadata metadata, IReadOnlyList<ReplayFrame> frames)
    {
        if (metadata.Mode != 0 || metadata.Version <= 0)
            throw new InvalidDataException("Only osu!standard replay versions are supported.");
        if (!ReplayHeaderReader.IsMd5(metadata.BeatmapHash))
            throw new InvalidDataException("Beatmap checksum must be a 32-character MD5 hash.");
        if (metadata.HitCounts.Length != 6 || frames.Count is 0 or > 1_000_000)
            throw new InvalidDataException("Replay counts or frames are invalid.");
        if (metadata.PlayerName.Length == 0 || metadata.PlayerName.Length > 256)
            throw new InvalidDataException("Player name must contain 1–256 characters.");
        if (metadata.LazerScoreInfo is { Length: > ReplayFileReader.MaxFileBytes })
            throw new InvalidDataException("Lazer score metadata is too large.");
    }

    private static void WriteHeaderFields(BinaryWriter writer, ReplayMetadata metadata)
    {
        writer.Write(metadata.Mode);
        writer.Write(metadata.Version);
        OsuBinaryString.Write(writer, metadata.BeatmapHash.ToLowerInvariant());
        OsuBinaryString.Write(writer, metadata.PlayerName);
        OsuBinaryString.Write(writer, metadata.ReplayHash);

        foreach (var count in metadata.HitCounts)
            writer.Write(count);
        writer.Write(metadata.Score);
        writer.Write(metadata.MaxCombo);
        writer.Write((byte)(metadata.Perfect ? 1 : 0));
        writer.Write(metadata.Mods);
        OsuBinaryString.Write(writer, metadata.LifeGraph);
        writer.Write(metadata.TimestampTicks);
    }

    private static void WriteFrameEnvelope(BinaryWriter writer, byte[] envelope)
    {
        writer.Write(envelope.Length);
        writer.Write(envelope);
    }

    private static void WriteTrailerFields(BinaryWriter writer, ReplayMetadata metadata)
    {
        if (metadata.Version >= 20140721)
            writer.Write(metadata.OnlineScoreId);
        else if (metadata.Version >= 20121008)
            writer.Write(checked((int)metadata.OnlineScoreId));

        if ((metadata.Mods & (1 << 23)) != 0)
            writer.Write(metadata.TargetPracticeAccuracy ?? 0);

        if (metadata.Version >= 30000001)
        {
            var extra = UpdateLazerMods(metadata.LazerScoreInfo, metadata.Mods);
            writer.Write(extra.Length);
            writer.Write(extra);
        }
    }

    private static string FormatFrameText(IReadOnlyList<ReplayFrame> frames, int? rngSeed)
    {
        var frameText = new StringBuilder(frames.Count * 30);
        long previousTime = 0;
        foreach (var frame in frames.OrderBy(frame => frame.TimeMs))
        {
            if (!float.IsFinite(frame.X) || !float.IsFinite(frame.Y) || frame.Keys < 0)
                throw new InvalidDataException("Replay contains an invalid cursor frame.");
            frameText.Append(frame.TimeMs - previousTime).Append('|')
                .Append(frame.X.ToString("R", CultureInfo.InvariantCulture)).Append('|')
                .Append(frame.Y.ToString("R", CultureInfo.InvariantCulture)).Append('|')
                .Append(frame.Keys).Append(',');
            previousTime = frame.TimeMs;
        }

        if (rngSeed is { } seed)
            frameText.Append("-12345|0|0|").Append(seed).Append(',');

        return frameText.ToString();
    }
}
