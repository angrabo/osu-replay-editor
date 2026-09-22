using System.Text;
using ReplayEditor.Osu;
using static ReplayEditor.M2Smoke.TestSupport;

namespace ReplayEditor.M2Smoke;

/// <summary>
/// One `.osu` difficulty and its `.osz` archive, shared read-only by every test in
/// <see cref="OsuServiceTests"/> so each test doesn't rebuild an identical fixture.
/// </summary>
public sealed class OsuFixture
{
    public string Hash { get; }

    public byte[] Osu { get; }

    public byte[] Archive { get; }

    public OsuFixture()
    {
        Osu = Encoding.UTF8.GetBytes("osu file format v14\n[General]\nAudioFilename: song.mp3\n[Metadata]\nTitle: Test\nArtist: Fixture\nCreator: Mapper\nVersion: Hard\n"
            + "[Events]\n0,0,\"bg.jpg\",0,0\n");
        Hash = ReplayHeaderReader.Md5(Osu);
        Archive = MakeZip(("hard.osu", Osu), ("song.mp3", [1, 2, 3]), ("bg.jpg", [4, 5]));
    }
}
