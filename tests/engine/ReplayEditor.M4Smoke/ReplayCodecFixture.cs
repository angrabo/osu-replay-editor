using System.Text;
using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.M4Smoke;

/// <summary>
/// Builds the shared replays used across <see cref="ReplayCodecTests"/> once per test
/// run, and writes the `.osr`/`.osu` fixture files the native M4 owner review imports (see
/// <c>tests/engine/fixtures/m4</c> and PROGRESS.md's M4 review checklist).
/// </summary>
public sealed class ReplayCodecFixture
{
    private const string LazerJson = "{\"mods\":[{\"acronym\":\"HD\",\"settings\":{\"sample\":2}}],\"total_score_without_mods\":1234}";

    public string MapText { get; }

    public string MapHash { get; }

    public byte[] First { get; }

    public byte[] Second { get; }

    public byte[] Mismatch { get; }

    public byte[] WrongMode { get; }

    public byte[] Broken { get; }

    public ReplayFile A { get; }

    public ReplayFile B { get; }

    public ReplayFile Lazer { get; }

    public ReplayFile Legacy { get; }

    public ReplayFile Skipped { get; }

    public ReplayFile SignedTimes { get; }

    public ReplayFile Exported { get; }

    public ReplayFile ExportedScoreV2 { get; }

    public ReplayFile ExportedLazer { get; }

    public ReplayFile LazerWithMods { get; }

    public ReplayFile LazerCleared { get; }

    public ReplayExportMetadataChange ExportedMetadata { get; }

    public ReplayCodecFixture()
    {
        MapText = "osu file format v14\n[General]\nAudioFilename: none.mp3\n[Metadata]\nTitle:M4 Replay Fixture\nArtist:Codex\nCreator:Codex\nVersion:Two Tracks\n"
            + "[Difficulty]\nCircleSize:4\nApproachRate:7\nSliderMultiplier:1.4\n[TimingPoints]\n0,500,4,2,1,100,1,0\n"
            + "[HitObjects]\n100,110,700,1,0,0:0:0:0:\n150,250,1300,2,0,B|256:80|410:245,2,300\n256,192,3400,8,0,4900\n";
        MapHash = ReplayHeaderReader.Md5(Encoding.UTF8.GetBytes(MapText));

        First = ReplayFixtures.Fixture(MapHash, "Player One", "-1000|256|192|0,1000|100|110|5,80|150|120|5,20|150|120|0,500|300|280|10,30|320|290|0,-12345|0|0|42,", 0);
        Second = ReplayFixtures.Fixture(MapHash, "Player Two", "-800|256|192|0,800|110|90|10,120|140|120|10,30|140|120|0,540|250|240|5,50|260|250|0,-12345|0|0|77,", 64);
        var lazerBytes = ReplayFixtures.Fixture(MapHash, "Lazer Player", "-500|256|192|0,500.4|130|190|5,100.6|180|160|0,", 0, 30000001);
        var legacyBytes = ReplayFixtures.Fixture(MapHash, "Legacy Player", "0|256|192|0,100|200|100|1,", 0, 20130319);
        Mismatch = ReplayFixtures.Fixture(new string('f', 32), "Other Map", "0|256|192|0,100|200|100|1,", 0);
        var skipBoundaryBytes = ReplayFixtures.Fixture(MapHash, "Skip Boundary", "0|256|-500|0,5934|256|-500|0,-5919|258.3333|168|5,0|272.3333|148.3333|5,50|300|200|0,", 0);
        var signedTimesBytes = ReplayFixtures.Fixture(MapHash, "Signed Times", "-700|1|2|0,900|2|3|1,-300|3|4|0,", 0);

        A = ReplayFileReader.Read(First);
        B = ReplayFileReader.Read(Second);
        Lazer = ReplayFileReader.Read(lazerBytes);
        Legacy = ReplayFileReader.Read(legacyBytes);
        Skipped = ReplayFileReader.Read(skipBoundaryBytes);
        SignedTimes = ReplayFileReader.Read(signedTimesBytes);

        var exportedMetadata = A.Metadata with
        {
            PlayerName = "Edited Player",
            Score = 7654321,
            Mods = 24,
            HitCounts = [100, 2, 1, 0, 0, 0],
            MaxCombo = 123,
            Perfect = false
        };
        var exportedFrames = A.Frames.Select((frame, index) => index == 1 ? frame with { X = 333.5f, Keys = 4 } : frame).ToArray();
        Exported = ReplayFileReader.Read(ReplayFileWriter.Write(exportedMetadata, exportedFrames));
        ExportedMetadata = new ReplayExportMetadataChange(exportedMetadata, exportedFrames);

        ExportedScoreV2 = ReplayFileReader.Read(ReplayFileWriter.Write(A.Metadata with { Mods = 1 << 29 }, A.Frames));
        ExportedLazer = ReplayFileReader.Read(ReplayFileWriter.Write(Lazer.Metadata, Lazer.Frames));

        LazerWithMods = ReplayFileReader.Read(ReplayFileWriter.Write(
            Lazer.Metadata with { Mods = 24, LazerScoreInfo = ReplayFixtures.CompressJson(LazerJson) }, Lazer.Frames));
        LazerCleared = ReplayFileReader.Read(ReplayFileWriter.Write(LazerWithMods.Metadata with { Mods = 0 }, LazerWithMods.Frames));

        WrongMode = (byte[])First.Clone();
        WrongMode[0] = 3;
        Broken = (byte[])First.Clone();
        Broken[Broken.Length - 10] ^= 0xff;

        WriteNativeReviewFixtures();
    }

    private void WriteNativeReviewFixtures()
    {
        var output = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../fixtures/m4"));
        Directory.CreateDirectory(output);
        File.WriteAllBytes(Path.Combine(output, "first.osr"), First);
        File.WriteAllBytes(Path.Combine(output, "second.osr"), Second);
        File.WriteAllBytes(Path.Combine(output, "mismatch.osr"), Mismatch);
        File.WriteAllText(Path.Combine(output, "fixture.osu"), MapText, new UTF8Encoding(false));
    }
}

/// <summary>
/// The edited metadata/frames used to produce <see cref="ReplayCodecFixture.Exported"/>,
/// kept alongside it so a test can assert the export matches what was requested.
/// </summary>
public sealed record ReplayExportMetadataChange(ReplayMetadata Metadata, ReplayFrame[] Frames);
