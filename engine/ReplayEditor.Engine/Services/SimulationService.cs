using System.Text;
using ReplayEditor.Api;
using ReplayEditor.Contracts;
using ReplayEditor.Core;
using ReplayEditor.Engine.Exceptions;
using ReplayEditor.Engine.Scoring;
using ReplayEditor.Simulation;

namespace ReplayEditor.Engine.Services;

public sealed class SimulationService(OsuService osu) : ISimulationService
{
    private const int MaxFrames = 1_000_000;
    private const string SelectedAreaScope = "selected-area";
    private const string WholeReplayScope = "whole-replay";
    // Only the objects around an edit, for a quick check (see SimulationEngine.SimulateWindow).
    private const string WindowScope = "window";

    // Selected-area and window results cover part of the replay: no recorded-score reconciliation.
    private static bool IsPartial(SimulationRequest request) => request.Scope is SelectedAreaScope or WindowScope;

    public SimulationResult Simulate(SimulationRequest request, CancellationToken ct)
    {
        ValidateFrames(request);
        ValidateScope(request);

        var beatmap = LoadBeatmapFile(request);

        try
        {
            var text = DecodeBeatmapText(beatmap);
            var multiplier = ScoreCalibration.LazerScoreMultiplier(request);

            var result = RunEngine(request, text, multiplier, ct);
            result = RetryLazerBoundaryRounding(result, request, text, multiplier, ct);
            result = ReconcileIfWholeReplay(result, request);
            result = MarkVerifiedIfMatchesRecording(result, request);

            return result;
        }
        catch (Exception ex) when (ex is InvalidDataException or DecoderFallbackException or ArgumentException)
        {
            throw new OperationFailedException($"Simulation failed: {ex.Message}", ex);
        }
    }

    private static void ValidateFrames(SimulationRequest request)
    {
        if (request.Frames is null || request.Frames.Length is 0 or > MaxFrames)
            throw new RequestValidationException($"Simulation requires between 1 and {MaxFrames:N0} replay frames.");
    }

    private static void ValidateScope(SimulationRequest request)
    {
        if (request.Scope is not null and not WholeReplayScope and not SelectedAreaScope and not WindowScope)
            throw new RequestValidationException("Unknown simulation scope.");
        if (IsPartial(request) && (request.StartMs is null || request.EndMs is null))
            throw new RequestValidationException("Selected area requires start and end times.");
    }

    private BeatmapFile LoadBeatmapFile(SimulationRequest request) =>
        osu.ReadBeatmapFile(request.Hash, request.Filename)
        ?? throw new ResourceNotFoundException("The exact beatmap difficulty is unavailable.");

    private static string DecodeBeatmapText(BeatmapFile beatmap) =>
        new UTF8Encoding(false, true).GetString(beatmap.Contents);

    private static SimulationResult RunEngine(SimulationRequest request,
        string beatmapText,
        double scoreMultiplier,
        CancellationToken ct) =>
        request.Scope == WindowScope
            ? SimulationEngine.SimulateWindow(beatmapText,
                request.Frames,
                request.Mods,
                request.Version,
                request.StartMs!.Value,
                request.EndMs!.Value,
                ct,
                scoreMultiplier)
            : request.Scope == SelectedAreaScope
            ? SimulationEngine.SimulateRange(beatmapText,
                request.Frames,
                request.Mods,
                request.Version,
                request.StartMs!.Value,
                request.EndMs!.Value,
                ct,
                scoreMultiplier)
            : SimulationEngine.SimulateWhole(beatmapText,
                request.Frames,
                request.Mods,
                request.Version,
                ct,
                scoreMultiplier,
                failAfterJudgedObjects: ScoreCalibration.RecordedFailedJudgedObjects(request));

    private static SimulationResult RetryLazerBoundaryRounding(SimulationResult result, SimulationRequest request,
        string beatmapText, double scoreMultiplier, CancellationToken ct)
    {
        if (IsPartial(request) || request.Version < 30_000_000 ||
            !request.SourceUnedited || ScoreCalibration.MatchesRecordedAggregates(result, request))
            return result;

        var alternate = SimulationEngine.SimulateWhole(beatmapText,
            request.Frames,
            request.Mods,
            request.Version,
            ct,
            scoreMultiplier,
            lazerInclusiveLateHitWindows: true,
            failAfterJudgedObjects: ScoreCalibration.RecordedFailedJudgedObjects(request));

        return ScoreCalibration.MatchesRecordedAggregates(alternate, request) ? alternate : result;
    }

    private static SimulationResult ReconcileIfWholeReplay(SimulationResult result, SimulationRequest request)
    {
        if (IsPartial(request))
            return result;

        return request.Version >= 30_000_000
            ? ScoreCalibration.ReconcileRecordedLazerResult(result, request)
            : SimulationEngine.ReconcileRecordedStableScore(result,
                request.SourceScore,
                request.SourceMaxCombo,
                request.SourceHitCounts,
                request.SourceUnedited,
                request.SourceMods,
                request.Mods);
    }

    private static SimulationResult MarkVerifiedIfMatchesRecording(SimulationResult result, SimulationRequest request)
    {
        if (IsPartial(request) || result.Status == "source-calibrated" ||
            !ScoreCalibration.MatchesRecordedResult(result, request))
            return result;

        return result with
        {
            Status = "verified",
            Warnings = ["Result matches the recorded osu! replay, including nested slider and spinner statistics."]
        };
    }
}
