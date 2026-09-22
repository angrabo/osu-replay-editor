namespace ReplayEditor.Simulation.Beatmap;

/// <summary>
/// Applies stable's hit-object stacking algorithm: nearby circles/slider-ends within
/// the AR-derived stack window are nudged along the diagonal (and, on hard rock, mirrored
/// vertically) so overlapping objects render and hit-test the way stable does.
/// </summary>
internal static class StableStacking
{
    public static MapObject[] Apply(MapObject[] objects, double ar, double stackLeniency, double cs,
        bool hardRock, bool modernStacking)
    {
        if (objects.Length == 0)
            return objects;

        var heights = ComputeStackHeights(objects, ar, stackLeniency, modernStacking);
        return ApplyStackOffsets(objects, heights, cs, hardRock);
    }

    private static int[] ComputeStackHeights(MapObject[] objects, double ar, double stackLeniency, bool modernStacking)
    {
        var heights = new int[objects.Length];
        var preempt = ar > 5 ? 1200 - 150 * (ar - 5) : ar < 5 ? 1200 + 120 * (5 - ar) : 1200;
        var threshold = (int)preempt * Math.Clamp(stackLeniency, 0, 1);

        // Modern (.osu v6+) reverse stacking pass. Current editor targets and
        // cached ranked maps use this format. The calculation happens before
        // HR's vertical transform, as it does in stable.
        for (var i = modernStacking ? objects.Length - 1 : 0; i > 0; i--)
        {
            var objectI = objects[i];
            var objectIIndex = i;
            if (heights[i] != 0 || objectI.Kind == "spinner")
                continue;

            var n = i;
            if (objectI.Kind == "circle")
                StackCircle(objects, heights, threshold, ref objectI, ref objectIIndex, ref n, i);
            else if (objectI.Kind == "slider")
                StackSlider(objects, heights, threshold, ref objectI, ref objectIIndex, ref n);
        }

        return heights;
    }

    private static void StackCircle(MapObject[] objects, int[] heights, double threshold,
        ref MapObject objectI, ref int objectIIndex, ref int n, int i)
    {
        while (--n >= 0)
        {
            var objectN = objects[n];
            if (objectN.Kind == "spinner")
                continue;
            if ((int)objectI.Start - (int)objectN.End > threshold)
                break;

            if (objectN.Kind == "slider" && Distance(End(objectN), Start(objectI)) < 3)
            {
                var offset = heights[objectIIndex] - heights[n] + 1;
                for (var j = n + 1; j <= i; j++)
                    if (Distance(End(objectN), Start(objects[j])) < 3)
                        heights[j] -= offset;
                break;
            }

            if (Distance(Start(objectN), Start(objectI)) < 3)
            {
                heights[n] = heights[objectIIndex] + 1;
                objectI = objectN;
                objectIIndex = n;
            }
        }
    }

    private static void StackSlider(MapObject[] objects, int[] heights, double threshold,
        ref MapObject objectI, ref int objectIIndex, ref int n)
    {
        while (--n >= 0)
        {
            var objectN = objects[n];
            if (objectN.Kind == "spinner")
                continue;
            if (objectI.Start - objectN.Start > threshold)
                break;

            if (Distance(End(objectN), Start(objectI)) < 3)
            {
                heights[n] = heights[objectIIndex] + 1;
                objectI = objectN;
                objectIIndex = n;
            }
        }
    }

    private static MapObject[] ApplyStackOffsets(MapObject[] objects, int[] heights, double cs, bool hardRock)
    {
        var radius = Math.Max(12, 54.4 - 4.48 * cs);
        // Stable offsets stacks by 6.4 screen pixels multiplied by the
        // hit-object scale. Since radius = 64 * scale, this is radius / 10.
        var stackOffset = radius / 10;

        var result = new MapObject[objects.Length];
        for (var i = 0; i < objects.Length; i++)
        {
            var dx = -heights[i] * stackOffset;
            var dy = -heights[i] * stackOffset;
            var shiftedPath = objects[i].Path
                .Select(point => (point.X + dx, hardRock ? 384 - (point.Y + dy) : point.Y + dy))
                .ToArray();
            result[i] = objects[i] with
            {
                X = objects[i].X + dx,
                Y = hardRock ? 384 - (objects[i].Y + dy) : objects[i].Y + dy,
                Path = shiftedPath
            };
        }

        return result;
    }

    private static double Distance((double X, double Y) a, (double X, double Y) b) =>
        Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2));

    private static (double X, double Y) Start(MapObject item) => (item.X, item.Y);

    private static (double X, double Y) End(MapObject item) => item.Path.Length == 0 ? Start(item) : item.Path[^1];
}
