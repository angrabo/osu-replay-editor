using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ReplayEditor.Core;
using ReplayEditor.Osu;
using ReplayEditor.Simulation;

namespace ReplayEditor.SimulationCompare;

/// <summary>
/// Manual diagnostic tool: inspects a real replay against an exact `.osu` file or cached archive
/// directory and prints simulation vs. recorded deltas.
/// Not part of the automated smoke checks below.
/// </summary>
internal static class ReplayComparisonTool
{
    public static int Run(string replayPath, string cacheDirectory)
    {
        var replay = ReadReplayOrNull(replayPath);
        if (replay is null)
            return 2;

        PrintReplaySummary(replay);
        var scoreMultiplier = ComputeScoreMultiplier(replay);

        if (File.Exists(cacheDirectory))
        {
            var mapBytes = File.ReadAllBytes(cacheDirectory);
            if (!Convert.ToHexString(MD5.HashData(mapBytes)).Equals(replay.Metadata.BeatmapHash, StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine("Replay comparison skipped: the supplied .osu checksum does not match the replay.");
                return 2;
            }
            Console.WriteLine($"Map: {cacheDirectory}");
            RunDiagnostics(replay, mapBytes, scoreMultiplier);
            return 0;
        }

        foreach (var archivePath in Directory.EnumerateFiles(cacheDirectory, "*.osz"))
        {
            using var archive = ZipFile.OpenRead(archivePath);
            foreach (var entry in archive.Entries.Where(entry => entry.FullName.EndsWith(".osu", StringComparison.OrdinalIgnoreCase)))
            {
                var bytes = ReadEntry(entry);
                if (!Convert.ToHexString(MD5.HashData(bytes)).Equals(replay.Metadata.BeatmapHash, StringComparison.OrdinalIgnoreCase))
                    continue;

                Console.WriteLine($"Map: {archivePath} :: {entry.FullName}");
                RunDiagnostics(replay, bytes, scoreMultiplier);
                return 0;
            }
        }

        Console.Error.WriteLine("Replay comparison skipped: exact map checksum not found in cached archives.");
        return 2;
    }

    private static ReplayFile? ReadReplayOrNull(string path)
    {
        try
        {
            return ReplayFileReader.Read(File.ReadAllBytes(path));
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Replay comparison skipped: {error.Message}");
            return null;
        }
    }

    private static byte[] ReadEntry(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }

    private static void PrintReplaySummary(ReplayFile replay)
    {
        Console.WriteLine($"Imported: score={replay.Metadata.Score} combo={replay.Metadata.MaxCombo} counts={string.Join(',', replay.Metadata.HitCounts)} "
            + $"mods={replay.Metadata.Mods} version={replay.Metadata.Version} lazerExtra={replay.Metadata.LazerScoreInfo?.Length ?? 0} "
            + $"frames={replay.Frames.Length} hash={replay.Metadata.BeatmapHash}");
    }

    private static double ComputeScoreMultiplier(ReplayFile replay)
    {
        var multiplier = LegacyModMultiplier(replay.Metadata.Mods, replay.Metadata.Version);

        if (ReplayFileReader.TryDecodeLazerScoreInfo(replay.Metadata.LazerScoreInfo) is not { } lazerJson)
            return multiplier;

        Console.WriteLine($"Lazer score info: {lazerJson}");
        using var document = JsonDocument.Parse(lazerJson);
        if (document.RootElement.TryGetProperty("total_score_without_mods", out var value)
            && value.TryGetInt64(out var withoutMods) && withoutMods > 0)
            multiplier = replay.Metadata.Score / (double)withoutMods;

        return multiplier;
    }

    private static double LegacyModMultiplier(int mods, int version)
    {
        if (version >= 30_000_000)
            return LazerModMultiplier(mods);

        var multiplier = 1d;
        if ((mods & 1) != 0 && (mods & (1 << 29)) == 0)
            multiplier *= .5;
        if ((mods & 2) != 0)
            multiplier *= .5;
        if ((mods & 8) != 0)
            multiplier *= 1.06;
        if ((mods & 16) != 0)
            multiplier *= (mods & (1 << 29)) != 0 ? 1.10 : 1.06;
        if ((mods & 64) != 0)
            multiplier *= version >= 30000000 ? 1.1 : (mods & (1 << 29)) != 0 ? 1.20 : 1.12;
        if ((mods & 256) != 0)
            multiplier *= .3;
        if ((mods & 1024) != 0)
            multiplier *= 1.12;
        if ((mods & 4096) != 0)
            multiplier *= .9;

        return multiplier;
    }

    private static double LazerModMultiplier(int mods)
    {
        var multiplier = 1d;
        if ((mods & 1) != 0) multiplier *= .5;
        if ((mods & 2) != 0) multiplier *= .8;
        if ((mods & 8) != 0) multiplier *= 1.04;
        if ((mods & 16) != 0) multiplier *= 1.09;
        if ((mods & 64) != 0) multiplier *= 1.23;
        if ((mods & 256) != 0) multiplier *= .55;
        if ((mods & 1024) != 0) multiplier *= 1.2;
        if ((mods & 4096) != 0) multiplier *= .95;
        return multiplier;
    }

    private static void RunDiagnostics(ReplayFile replay, byte[] mapBytes, double scoreMultiplier)
    {
        var osuLines = Encoding.UTF8.GetString(mapBytes).Split('\n');
        PrintDifficultySummary(osuLines);
        var objectLines = ObjectLines(osuLines);
        PrintCurveGroups(objectLines);

        var diagnosticFrames = replay.Frames.Select(frame => new SimulationFrame(frame.TimeMs, frame.X, frame.Y, frame.Keys)).ToArray();
        var mapText = Encoding.UTF8.GetString(mapBytes);
        var result = SimulationEngine.SimulateWhole(mapText, diagnosticFrames, replay.Metadata.Mods,
            replay.Metadata.Version, default, scoreMultiplier);
        if (replay.Metadata.Version >= 30_000_000 && !MatchesPrimaryAggregates(result, replay.Metadata))
        {
            var alternate = SimulationEngine.SimulateWhole(mapText, diagnosticFrames, replay.Metadata.Mods,
                replay.Metadata.Version, default, scoreMultiplier, lazerInclusiveLateHitWindows: true);
            if (MatchesPrimaryAggregates(alternate, replay.Metadata))
            {
                Console.WriteLine("Lazer boundary retry: selected inclusive late edge from recorded aggregate counts.");
                result = alternate;
            }
        }

        PrintSimulationSummary(result);
        PrintDelta(result, replay.Metadata);

        var reconciled = SimulationEngine.ReconcileRecordedStableScore(result, replay.Metadata.Score, replay.Metadata.MaxCombo,
            replay.Metadata.HitCounts.Select(count => (int)count).ToArray(), true, replay.Metadata.Mods, replay.Metadata.Mods);
        if (reconciled.Score != result.Score)
            Console.WriteLine($"Recorded score reconciliation: score={reconciled.Score} bonus={reconciled.BonusScore} status={reconciled.Status}");

        PrintExtraCounts(result, replay.Metadata);
        if (result.Model == "editor-stable-v2")
            PrintScoreV2Breakdown(result, replay.Metadata, scoreMultiplier);

        PrintJudgementTallies(result);
        PrintSpinnerDetails(result, Encoding.UTF8.GetString(mapBytes), diagnosticFrames, replay.Metadata.Mods,
            replay.Metadata.Version, scoreMultiplier, objectLines);
        PrintPeakCombo(result);
        PrintBorderline300s(result);
        PrintLowJudgements(result, replay, objectLines);
        PrintMisses(result, replay, objectLines);
        PrintNestedMisses(result, replay, objectLines);
    }

    private static bool MatchesPrimaryAggregates(SimulationResult result, ReplayMetadata metadata) =>
        result.MaxCombo == metadata.MaxCombo
        && result.Count300 == metadata.HitCounts[0]
        && result.Count100 == metadata.HitCounts[1]
        && result.Count50 == metadata.HitCounts[2]
        && result.Misses == metadata.HitCounts[5];

    private static string[] ObjectLines(string[] osuLines) =>
        osuLines.SkipWhile(line => !line.Trim().Equals("[HitObjects]", StringComparison.OrdinalIgnoreCase))
            .Skip(1)
            .Where(line => line.Contains(','))
            .ToArray();

    private static void PrintDifficultySummary(string[] osuLines)
    {
        var keys = new[] { "HPDrainRate:", "CircleSize:", "OverallDifficulty:", "SliderMultiplier:", "SliderTickRate:" };
        foreach (var line in osuLines.Where(line => keys.Any(line.StartsWith)))
            Console.WriteLine(line.Trim());
    }

    private static void PrintCurveGroups(string[] objectLines)
    {
        var sliderCurves = objectLines.Select(line => line.Split(','))
            .Where(parts => parts.Length > 5 && (int.Parse(parts[3]) & 2) != 0)
            .GroupBy(parts => parts[5].Split('|')[0]);
        foreach (var group in sliderCurves)
            Console.WriteLine($"Curve {group.Key}: {group.Count()}");
    }

    private static void PrintSimulationSummary(SimulationResult result)
    {
        Console.WriteLine($"Simulation: score={result.Score} combo={result.MaxCombo} counts={result.Count300},{result.Count100},{result.Count50},{result.Misses} "
            + $"accuracy={result.Accuracy} sliderTicks={result.SliderTicksHit}/{result.SliderTicksTotal} sliderEnds={result.SliderEndsHit}/{result.SliderEndsTotal} "
            + $"spinnerTurns={result.SpinnerSpins} spinner={result.SpinnerSpinsHit}/{result.SpinnerSpinsTotal} spinnerBonus={result.SpinnerBonusHit}/{result.SpinnerBonusTotal} "
            + $"bonusScore={result.BonusScore}");
    }

    private static void PrintDelta(SimulationResult result, ReplayMetadata metadata)
    {
        Console.WriteLine($"Delta: score={result.Score - metadata.Score:+#;-#;0} combo={result.MaxCombo - metadata.MaxCombo:+#;-#;0} "
            + $"counts={result.Count300 - metadata.HitCounts[0]:+#;-#;0},{result.Count100 - metadata.HitCounts[1]:+#;-#;0},"
            + $"{result.Count50 - metadata.HitCounts[2]:+#;-#;0},{result.Misses - metadata.HitCounts[5]:+#;-#;0}");
    }

    private static void PrintExtraCounts(SimulationResult result, ReplayMetadata metadata)
    {
        Console.WriteLine($"Extra counts: simulatedGeki={result.CountGeki?.ToString() ?? "unavailable"} recordedGeki={metadata.HitCounts[3]} "
            + $"simulatedKatu={result.CountKatu?.ToString() ?? "unavailable"} recordedKatu={metadata.HitCounts[4]} "
            + $"simulatedPerfect={result.Perfect} recordedPerfect={metadata.Perfect}");
    }

    private static void PrintScoreV2Breakdown(SimulationResult result, ReplayMetadata metadata, double scoreMultiplier)
    {
        var objects = result.TotalObjects;
        var accuracyRatio = objects == 0 ? 0d : (300d * result.Count300 + 100d * result.Count100 + 50d * result.Count50) / (300d * objects);
        var accuracyPoints = 300_000d * Math.Pow(accuracyRatio, 10) * scoreMultiplier;
        var bonusPoints = result.BonusScore * scoreMultiplier;
        var simulatedComboPoints = result.Score - accuracyPoints - bonusPoints;
        var recordedComboIfSameBonus = metadata.Score - accuracyPoints - bonusPoints;

        Console.WriteLine($"V2 breakdown: accuracy={accuracyPoints:F3} simulatedSpinnerBonus={bonusPoints:F3} simulatedCombo≈{simulatedComboPoints:F3} "
            + $"recordedComboIfSameBonus≈{recordedComboIfSameBonus:F3}");
        Console.WriteLine("V2 note: the .osr stores only the final score, not per-object judgements or spinner bonus; the recorded combo component above assumes the simulated bonus is exact.");
    }

    private static void PrintJudgementTallies(SimulationResult result)
    {
        var groups = result.Judgements.GroupBy(item => (item.Kind, item.Result))
            .OrderBy(group => group.Key.Kind).ThenBy(group => group.Key.Result);
        foreach (var group in groups)
            Console.WriteLine($"{group.Key.Kind} {group.Key.Result}: {group.Count()}");
    }

    private static void PrintSpinnerDetails(SimulationResult result, string mapText, SimulationFrame[] frames, int mods,
        int version, double scoreMultiplier, string[] objectLines)
    {
        foreach (var item in result.Judgements.Where(item => item.Kind == "spinner"))
        {
            var header = mapText[..mapText.IndexOf("[HitObjects]", StringComparison.OrdinalIgnoreCase)];
            var spinnerMap = header + "[HitObjects]\n" + objectLines[item.ObjectIndex] + "\n";
            var spinner = SimulationEngine.SimulateWhole(spinnerMap, frames, mods, version, default, scoreMultiplier);
            Console.WriteLine($"Spinner detail: object={item.ObjectIndex + 1} start={item.StartTime} end={item.EndTime} result={item.Result} "
                + $"turns={spinner.SpinnerSpins} spins={spinner.SpinnerSpinsHit}/{spinner.SpinnerSpinsTotal} "
                + $"bonus={spinner.SpinnerBonusHit}/{spinner.SpinnerBonusTotal} bonusScore={spinner.BonusScore}");
        }
    }

    private static void PrintPeakCombo(SimulationResult result)
    {
        foreach (var item in result.Judgements.Where(item => item.ComboAfter >= result.MaxCombo - 5))
            Console.WriteLine($"Peak combo: object={item.ObjectIndex + 1} kind={item.Kind} result={item.Result} combo={item.ComboAfter} start={item.StartTime}");
    }

    private static void PrintBorderline300s(SimulationResult result)
    {
        var borderline = result.Judgements.Where(item => item.Result == "300" && item.HitError is not null)
            .OrderByDescending(item => Math.Abs(item.HitError!.Value))
            .Take(12);
        foreach (var item in borderline)
            Console.WriteLine($"Borderline 300: object={item.ObjectIndex + 1} kind={item.Kind} start={item.StartTime} hit={item.HitTime} error={item.HitError}");
    }

    private static void PrintLowJudgements(SimulationResult result, ReplayFile replay, string[] objectLines)
    {
        foreach (var item in result.Judgements.Where(item => item.Value is 100 or 50).OrderBy(item => item.StartTime))
        {
            Console.WriteLine($"Low judgement: object={item.ObjectIndex + 1} kind={item.Kind} result={item.Result} start={item.StartTime} "
                + $"hit={item.HitTime} error={item.HitError} nested={item.NestedHits}/{item.NestedTotal}");
            PrintNearbyFrames(replay, item.StartTime - 120, item.StartTime + 120);
        }
    }

    private static void PrintMisses(SimulationResult result, ReplayFile replay, string[] objectLines)
    {
        foreach (var item in result.Judgements.Where(item => item.Result == "miss"))
        {
            var nearby = replay.Frames.Where(frame => Math.Abs(frame.TimeMs - item.StartTime) <= 130 && frame.Keys != 0)
                .OrderBy(frame => Math.Abs(frame.TimeMs - item.StartTime))
                .Take(5)
                .Select(frame => $"{frame.TimeMs - item.StartTime:+#;-#;0}ms:{frame.Keys}@{frame.X:F0},{frame.Y:F0}");
            Console.WriteLine($"Miss detail: object={item.ObjectIndex + 1} kind={item.Kind} start={item.StartTime} nested={item.NestedHits}/{item.NestedTotal} "
                + $"nearby={string.Join(' ', nearby)} line={objectLines[item.ObjectIndex].Trim()}");
        }
    }

    private static void PrintNestedMisses(SimulationResult result, ReplayFile replay, string[] objectLines)
    {
        foreach (var item in result.Judgements.Where(item => item.Kind == "slider" && item.NestedHits != item.NestedTotal))
        {
            Console.WriteLine($"Nested miss: object={item.ObjectIndex + 1} start={item.StartTime} end={item.EndTime} result={item.Result} "
                + $"head={item.HitTime} error={item.HitError} nested={item.NestedHits}/{item.NestedTotal} combo={item.ComboAfter}");
            Console.WriteLine($"Object line: {objectLines[item.ObjectIndex].Trim()}");
            PrintNearbyFrames(replay, item.StartTime - 80, item.EndTime + 80);
        }
    }

    private static void PrintNearbyFrames(ReplayFile replay, double fromMs, double toMs)
    {
        foreach (var frame in replay.Frames.Where(frame => frame.TimeMs >= fromMs && frame.TimeMs <= toMs))
            Console.WriteLine($"  frame {frame.TimeMs}: ({frame.X:F1},{frame.Y:F1}) keys={frame.Keys}");
    }
}
