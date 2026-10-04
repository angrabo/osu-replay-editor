using System.Text.Json;
using ReplayEditor.Osu;
using Xunit;

namespace ReplayEditor.M4Smoke;

public sealed class ReplayCodecTests(ReplayCodecFixture fixture) : IClassFixture<ReplayCodecFixture>
{
    [Fact]
    public void ExactDifficultyMatchesReplayBeatmapHash()
    {
        Assert.True(fixture.A.Metadata.BeatmapHash == fixture.MapHash && fixture.B.Metadata.BeatmapHash == fixture.MapHash, "exact difficulty");
    }

    [Fact]
    public void MapChecksumMatchAndMismatchAreDetected()
    {
        var text = System.Text.Encoding.UTF8.GetBytes(fixture.MapText);
        Assert.True(BeatmapArchive.InspectOsu(text, fixture.A.Metadata.BeatmapHash, "fixture.osu").ExactDifficulty is not null, "map checksum match");
        Assert.True(BeatmapArchive.InspectOsu(text, new string('f', 32), "fixture.osu").ExactDifficulty is null, "map mismatch rejected");
    }

    [Fact]
    public void PlayerNamesSurviveDecoding()
    {
        Assert.True(fixture.A.Metadata.PlayerName == "Player One" && fixture.B.Metadata.PlayerName == "Player Two", "metadata");
    }

    [Fact]
    public void ClientOriginComesFromReplayFormatVersion()
    {
        Assert.True(fixture.A.Metadata.Client == "stable" && fixture.Lazer.Metadata.Client == "lazer", "client origin from replay format version");
    }

    [Fact]
    public void ModsAndRngSeedSurviveDecoding()
    {
        Assert.True(fixture.A.Metadata.Mods == 0 && fixture.B.Metadata.Mods == 64 && fixture.A.Metadata.RngSeed == 42 && fixture.B.Metadata.RngSeed == 77,
            "mods/seed");
    }

    [Fact]
    public void FrameTimesAreAbsoluteMilliseconds()
    {
        Assert.True(fixture.A.Frames[0].TimeMs == -1000 && fixture.A.Frames[1].TimeMs == 0 && fixture.B.Frames[0].TimeMs == -800 && fixture.B.Frames[1].TimeMs == 0,
            "absolute times");
    }

    [Fact]
    public void MouseAndKeyboardKeyTransitionsStayDistinct()
    {
        Assert.True(fixture.A.KeyEvents.Select(e => $"{e.TimeMs}:{e.Key}:{e.Down}").SequenceEqual(["0:K1:True", "100:K1:False", "600:K2:True", "630:K2:False"]),
            "distinct mouse and keyboard transitions");
    }

    [Fact]
    public void KeyStateReconstructionMatchesLogicalKeys()
    {
        Assert.True(fixture.A.Frames.All(frame => ReplayFileReader.ReconstructKeyState(fixture.A.KeyEvents, frame.TimeMs) == ReplayFileReader.LogicalKeys(frame.Keys)),
            "key-state reconstruction");
    }

    [Fact]
    public void LogicalKeysMaskRedundantMouseBits()
    {
        Assert.True(ReplayFileReader.LogicalKeys(1) == 1 && ReplayFileReader.LogicalKeys(2) == 2 && ReplayFileReader.LogicalKeys(5) == 4
            && ReplayFileReader.LogicalKeys(10) == 8 && ReplayFileReader.LogicalKeys(15) == 12, "keyboard bits mask redundant mouse bits");
    }

    [Fact]
    public void BytePreservingRoundTrip()
    {
        Assert.True(ReplayFileReader.Read(fixture.A.CopyOriginal()).Frames.SequenceEqual(fixture.A.Frames)
            && ReplayFileReader.Read(fixture.B.CopyOriginal()).Frames.SequenceEqual(fixture.B.Frames), "byte-preserving round trip");
        Assert.True(fixture.A.CopyOriginal().SequenceEqual(fixture.First), "source bytes unchanged");
    }

    [Fact]
    public void EditedMetadataRoundTrip()
    {
        var metadata = fixture.ExportedMetadata.Metadata;
        Assert.True(fixture.Exported.Metadata.PlayerName == "Edited Player" && fixture.Exported.Metadata.Score == 7654321 && fixture.Exported.Metadata.Mods == 24
            && fixture.Exported.Metadata.HitCounts.SequenceEqual(metadata.HitCounts) && fixture.Exported.Metadata.MaxCombo == 123,
            "edited replay metadata round trip");
    }

    [Fact]
    public void EditedFramesExportWithoutChangingSourceBytes()
    {
        Assert.True(fixture.Exported.Frames[1].X == 333.5f && fixture.Exported.Frames[1].Keys == 4 && fixture.A.CopyOriginal().SequenceEqual(fixture.First),
            "edited frames exported without changing source bytes");
    }

    [Fact]
    public void StableScoreV2ModSurvivesExport()
    {
        Assert.True(fixture.ExportedScoreV2.Metadata.Mods == 1 << 29 && fixture.ExportedScoreV2.Metadata.Client == "stable", "stable ScoreV2 mod survives export");
    }

    [Fact]
    public void LazerExtraMetadataRoundTrip()
    {
        Assert.True(fixture.ExportedLazer.Metadata.LazerScoreInfo?.SequenceEqual(new byte[] { 1, 2, 3 }) == true, "lazer extra metadata round trip");
    }

    [Fact]
    public void LazerHeaderAndEmbeddedModsStaySynchronized()
    {
        using var scoreInfo = JsonDocument.Parse(ReplayFileReader.TryDecodeLazerScoreInfo(fixture.LazerWithMods.Metadata.LazerScoreInfo)!);
        var mods = scoreInfo.RootElement.GetProperty("mods");
        Assert.True(fixture.LazerWithMods.Metadata.Mods == 24 && mods.GetArrayLength() == 2
            && mods[0].GetProperty("acronym").GetString() == "HD"
            && mods[0].GetProperty("settings").GetProperty("sample").GetInt32() == 2
            && mods[1].GetProperty("acronym").GetString() == "HR"
            && scoreInfo.RootElement.GetProperty("total_score_without_mods").GetInt32() == 1234,
            "lazer header and embedded mods synchronized");
    }

    [Fact]
    public void RemovedLazerModsClearInEmbeddedScoreMetadata()
    {
        using var scoreInfo = JsonDocument.Parse(ReplayFileReader.TryDecodeLazerScoreInfo(fixture.LazerCleared.Metadata.LazerScoreInfo)!);
        Assert.True(scoreInfo.RootElement.GetProperty("mods").GetArrayLength() == 0, "removed lazer mods cleared in embedded score metadata");
    }

    [Fact]
    public void LazerScoreDataAndFractionalDeltaSurviveDecoding()
    {
        Assert.True(fixture.Lazer.Metadata.LazerScoreInfo?.Length == 3 && fixture.Lazer.Frames[1].TimeMs == 0 && fixture.Lazer.Frames[2].TimeMs == 101,
            "lazer score data and fractional delta");
    }

    [Fact]
    public void LegacyReplayHasA32BitScoreId()
    {
        Assert.True(fixture.Legacy.Metadata.OnlineScoreId == 0, "legacy 32-bit score id");
    }

    [Fact]
    public void SkipBoundaryRawFramesAreRetained()
    {
        Assert.True(fixture.Skipped.RawFrames.Length == 5 && fixture.Skipped.RawFrames[1].TimeMs == 5934 && fixture.Skipped.RawFrames[2].TimeMs == 15,
            "raw skip boundary retained");
    }

    [Fact]
    public void SkipBoundaryVisibleFramesAreDeduplicated()
    {
        Assert.True(fixture.Skipped.Frames.Length == 3 && fixture.Skipped.Frames[0].TimeMs == 15 && fixture.Skipped.KeyEvents[0].TimeMs == 15,
            "skip boundary visible frames");
    }

    [Fact]
    public void SkipBoundaryRoundTrip()
    {
        Assert.True(ReplayFileReader.Read(fixture.Skipped.CopyOriginal()).RawFrames.SequenceEqual(fixture.Skipped.RawFrames), "skip boundary round trip");
    }

    [Fact]
    public void EmptyCursorFrameIsRejected()
    {
        Assert.Throws<InvalidDataException>(() => ReplayFileReader.ParseFrames("0|1|2|0,,1|2|3|0,"));
    }

    [Fact]
    public void SignedFrameTimesDecodeCorrectly()
    {
        Assert.True(fixture.SignedTimes.RawFrames.Select(frame => frame.TimeMs).SequenceEqual([-700, 200, -100]), "signed raw frame times");
        Assert.True(fixture.SignedTimes.Frames.Select(frame => frame.TimeMs).SequenceEqual([-700, -100, 200]), "signed playback frame times");
        Assert.True(fixture.SignedTimes.KeyEvents.Select(e => $"{e.TimeMs}:{e.Down}").SequenceEqual(["200:True"]), "signed-time key transitions");
    }

    [Fact]
    public void TruncatedReplayIsRejected()
    {
        Assert.Throws<InvalidDataException>(() => ReplayFileReader.Read(fixture.First[..(fixture.First.Length - 4)]));
    }

    [Fact]
    public void UnsupportedModeIsRejected()
    {
        Assert.Throws<InvalidDataException>(() => ReplayFileReader.Read(fixture.WrongMode));
    }

    [Fact]
    public void CorruptedReplayIsRejected()
    {
        Assert.Throws<InvalidDataException>(() => ReplayFileReader.Read(fixture.Broken));
    }

    private static JsonDocument ScoreInfo(ReplayEditor.Core.ReplayFile replay) =>
        JsonDocument.Parse(ReplayFileReader.TryDecodeLazerScoreInfo(replay.Metadata.LazerScoreInfo)!);

    private static string[] Acronyms(JsonDocument scoreInfo) => scoreInfo.RootElement.GetProperty("mods")
        .EnumerateArray().Select(mod => mod.GetProperty("acronym").GetString()!).ToArray();

    [Fact]
    public void LazerOnlyModsAreReadAndSurviveExport()
    {
        var withClassic = ReplayFileReader.Read(ReplayFileWriter.Write(
            fixture.LazerWithMods.Metadata with { LazerMods = ["CL", "DA"] }, fixture.LazerWithMods.Frames));
        using var scoreInfo = ScoreInfo(withClassic);
        Assert.Equal(["HD", "HR", "CL", "DA"], Acronyms(scoreInfo));
        // The settings of mods that were already there are kept.
        Assert.Equal(2, scoreInfo.RootElement.GetProperty("mods")[0].GetProperty("settings").GetProperty("sample").GetInt32());
        Assert.Equal(["CL", "DA"], ReplayFileWriter.LazerOnlyMods(withClassic.Metadata.LazerScoreInfo, withClassic.Metadata.Mods));

        // Exporting again with the same mods leaves the score info untouched; dropping one removes it.
        var again = ReplayFileWriter.Write(withClassic.Metadata with { LazerMods = ["CL", "DA"] }, withClassic.Frames);
        Assert.True(ReplayFileReader.Read(again).Metadata.LazerScoreInfo!.SequenceEqual(withClassic.Metadata.LazerScoreInfo!));
        using var dropped = ScoreInfo(ReplayFileReader.Read(
            ReplayFileWriter.Write(withClassic.Metadata with { LazerMods = ["CL"] }, withClassic.Frames)));
        Assert.Equal(["HD", "HR", "CL"], Acronyms(dropped));
    }

    [Fact]
    public void StableReplayExportedForLazerGetsScoreInfoFromTheSimulation()
    {
        var statistics = new ReplayEditor.Core.LazerScoreStatistics(90, 6, 2, 2, 17, 19, 40, 44, 12, 12, 3, 5);
        var lazer = ReplayFileReader.Read(ReplayFileWriter.Write(
            fixture.A.Metadata with { Version = 30000019, Mods = 8, LazerStatistics = statistics, LazerMods = ["CL"] },
            fixture.A.Frames));
        Assert.Equal("lazer", lazer.Metadata.Client);
        using var scoreInfo = ScoreInfo(lazer);
        var root = scoreInfo.RootElement;
        Assert.Equal(["HD", "CL"], Acronyms(scoreInfo));
        Assert.Equal("A", root.GetProperty("rank").GetString());
        var hit = root.GetProperty("statistics");
        var maximum = root.GetProperty("maximum_statistics");
        Assert.True(hit.GetProperty("great").GetInt32() == 90 && hit.GetProperty("ok").GetInt32() == 6
            && hit.GetProperty("meh").GetInt32() == 2 && hit.GetProperty("miss").GetInt32() == 2
            && hit.GetProperty("large_tick_hit").GetInt32() == 17 && hit.GetProperty("large_tick_miss").GetInt32() == 2
            && hit.GetProperty("slider_tail_hit").GetInt32() == 40 && hit.GetProperty("large_bonus").GetInt32() == 3,
            "simulated counts written as lazer statistics");
        Assert.True(maximum.GetProperty("great").GetInt32() == 100 && maximum.GetProperty("large_tick_hit").GetInt32() == 19
            && maximum.GetProperty("slider_tail_hit").GetInt32() == 44 && maximum.GetProperty("large_bonus").GetInt32() == 5,
            "maximums cover every judgement");
    }

    [Fact]
    public void LazerExportWithoutScoreInfoOrStatisticsStillRefusesMods()
    {
        Assert.Throws<InvalidDataException>(() => ReplayFileWriter.Write(
            fixture.A.Metadata with { Version = 30000019, LazerMods = ["CL"] }, fixture.A.Frames));
        Assert.Throws<InvalidDataException>(() => ReplayFileWriter.Write(
            fixture.LazerWithMods.Metadata with { LazerMods = ["not a mod"] }, fixture.LazerWithMods.Frames));
    }
}
