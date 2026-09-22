namespace ReplayEditor.SimulationSmoke;

/// <summary>
/// `.osu` maps and mod constants reused by more than one scenario below.
/// </summary>
internal static class TestFixtures
{
    public const string BoundaryMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:5\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n";

    public const string SpinnerMap = "osu file format v14\n[Difficulty]\nOverallDifficulty:0\n[HitObjects]\n256,192,1000,8,0,2000\n";

    public const int ScoreV2Mod = 1 << 29;
}
