using ReplayEditor.Core;
using ReplayEditor.Simulation.Beatmap;

namespace ReplayEditor.Simulation.Judging;

/// <summary>
/// Counts geki (perfect combo, all-300) and katu (100-or-better, no 50/miss) per
/// combo group, matching stable's per-combo judgement summary.
/// </summary>
internal static class ComboCounts
{
    public static (int Geki, int Katu) EndCounts(IReadOnlyList<MapObject> objects, IReadOnlyList<ObjectJudgement> judgements)
    {
        var geki = 0;
        var katu = 0;
        var all300 = true;
        var no50OrMiss = true;

        for (var index = 0; index < judgements.Count; index++)
        {
            if (index > 0 && objects[index].NewCombo)
            {
                all300 = true;
                no50OrMiss = true;
            }

            var value = judgements[index].Value;
            all300 &= value == 300;
            no50OrMiss &= value >= 100;

            if (index + 1 < judgements.Count && !objects[index + 1].NewCombo)
                continue;

            if (all300)
                geki++;
            else if (no50OrMiss && value >= 100)
                katu++;
        }

        return (geki, katu);
    }
}
