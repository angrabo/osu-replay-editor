using System.Globalization;
using System.Text;
using ReplayEditor.Contracts;
using ReplayEditor.Core;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Osu;

namespace ReplayEditor.Engine.Services;

public sealed class ReplayCodecService : IReplayCodecService
{
    private const int MaxExportFrames = 1_000_000;
    private const int MaxExportFilenameLength = 100;
    private const int MaxFilenameSuffix = 10_000;

    public ReplayHeader ReadHeader(Stream body)
    {
        try
        {
            return ReplayHeaderReader.Read(body);
        }
        catch (Exception ex) when (ex is InvalidDataException or DecoderFallbackException)
        {
            throw new OperationFailedException(ex.Message, ex);
        }
    }

    public ParsedReplayResponse ParseReplay(byte[] bytes)
    {
        try
        {
            var replay = ReplayFileReader.Read(bytes);
            return new ParsedReplayResponse(ToDto(replay.Metadata), replay.Frames, replay.KeyEvents);
        }
        catch (Exception ex) when (ex is InvalidDataException or DecoderFallbackException)
        {
            throw new OperationFailedException(ex.Message, ex);
        }
    }

    public ReplayExportResult ExportReplay(ReplayExportRequest request)
    {
        ValidateExportRequest(request);
        try
        {
            var metadata = BuildMetadata(request.Metadata!);
            var frames = BuildFrames(request.Frames);
            var bytes = ReplayFileWriter.Write(metadata, frames);
            var path = WriteUniqueFile(SanitizeFilename(request.Filename), bytes);
            return new ReplayExportResult(path, bytes.Length);
        }
        catch (Exception error) when (error is InvalidDataException or ArgumentException or FormatException
                                          or OverflowException or IOException or UnauthorizedAccessException)
        {
            throw new OperationFailedException($"Export failed: {error.Message}", error);
        }
    }

    private static ParsedReplayMetadata ToDto(ReplayMetadata metadata) => new(
        metadata.Mode,
        metadata.Version,
        metadata.BeatmapHash,
        metadata.PlayerName,
        metadata.ReplayHash,
        metadata.HitCounts,
        metadata.Score,
        metadata.MaxCombo,
        metadata.Perfect,
        metadata.Mods,
        metadata.LifeGraph,
        metadata.TimestampTicks.ToString(CultureInfo.InvariantCulture),
        metadata.OnlineScoreId.ToString(CultureInfo.InvariantCulture),
        metadata.TargetPracticeAccuracy,
        metadata.RngSeed,
        metadata.LazerScoreInfo);

    private static void ValidateExportRequest(ReplayExportRequest request)
    {
        if (request.Metadata is null || request.Frames is null || request.Frames.Length is 0 or > MaxExportFrames
            || request.Metadata.HitCounts is not { Length: 6 })
            throw new RequestValidationException("Export requires six hit counts and valid replay frames.");
    }

    private static ReplayMetadata BuildMetadata(ReplayExportMetadata header) => new(
        0,
        header.Version,
        header.BeatmapHash,
        header.PlayerName,
        header.ReplayHash,
        header.HitCounts.Select(count => checked((ushort)count)).ToArray(),
        header.Score,
        checked((ushort)header.MaxCombo),
        header.Perfect,
        header.Mods,
        header.LifeGraph,
        long.Parse(header.TimestampTicks, CultureInfo.InvariantCulture),
        long.Parse(header.OnlineScoreId, CultureInfo.InvariantCulture),
        header.TargetPracticeAccuracy,
        header.RngSeed,
        string.IsNullOrEmpty(header.LazerScoreInfo) ? null : Convert.FromBase64String(header.LazerScoreInfo));

    private static ReplayFrame[] BuildFrames(SimulationFrame[] frames) => frames
        .Select(frame => new ReplayFrame(frame.TimeMs,
            0,
            (float)frame.X,
            (float)frame.Y,
            frame.Keys))
        .ToArray();

    private static string SanitizeFilename(string? requested)
    {
        var cleaned = new string((requested ?? "replay")
                .Where(character => !Path.GetInvalidFileNameChars().Contains(character)).ToArray())
            .Trim();
        var name = Path.GetFileNameWithoutExtension(cleaned);
        if (name.Length == 0)
            name = "replay";
        return name.Length > MaxExportFilenameLength ? name[..MaxExportFilenameLength] : name;
    }

    private static string WriteUniqueFile(string name, byte[] bytes)
    {
        var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        Directory.CreateDirectory(downloads);
        for (var suffix = 0; suffix < MaxFilenameSuffix; suffix++)
        {
            var path = Path.Combine(downloads, $"{name}_edited{(suffix == 0 ? "" : $"_{suffix}")}.osr");
            try
            {
                using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                output.Write(bytes);
                return path;
            }
            catch (IOException) when (File.Exists(path))
            {
            }
        }

        throw new ExportExhaustedException("Could not choose a unique export filename.");
    }
}
