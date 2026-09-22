namespace ReplayEditor.Simulation.Beatmap;

/// <summary>
/// Builds a slider's sampled pixel path from its `.osu` curve type and control points
/// (linear/perfect-circle/bezier/catmull), then trims it to the map-declared pixel length.
/// </summary>
internal static class SliderCurveBuilder
{
    public static (double X, double Y)[] BuildPath(string curve, (double X, double Y)[] controls)
    {
        if (controls.Length < 2 || curve == "L")
            return controls;

        if (curve == "P" && controls.Length == 3 && TryBuildPerfectCircle(controls, out var arc))
            return arc;

        return curve == "C" ? BuildCatmullRom(controls) : BuildBezier(controls);
    }

    public static (double X, double Y)[] FitPath((double X, double Y)[] path, double pixelLength)
    {
        if (path.Length < 2 || pixelLength <= 0)
            return path;

        var output = new List<(double X, double Y)> { path[0] };
        var travelled = 0d;

        for (var index = 1; index < path.Length; index++)
        {
            var before = output[^1];
            var after = path[index];
            var segment = Distance(before, after);
            if (segment < .00001)
                continue;

            if (travelled + segment >= pixelLength)
            {
                var fraction = (pixelLength - travelled) / segment;
                output.Add(Lerp(before, after, fraction));
                return output.ToArray();
            }

            output.Add(after);
            travelled += segment;
        }

        if (travelled < pixelLength)
            ExtendPastLastPoint(output, pixelLength, travelled);

        return output.ToArray();
    }

    public static (double X, double Y) PathAt((double X, double Y)[] path, double amount)
    {
        if (path.Length == 0)
            return (256, 192);
        if (path.Length == 1)
            return path[0];

        var lengths = new double[path.Length - 1];
        double total = 0;
        for (var i = 0; i < lengths.Length; i++)
        {
            lengths[i] = Distance(path[i], path[i + 1]);
            total += lengths[i];
        }

        var target = total * Math.Clamp(amount, 0, 1);
        double passed = 0;
        for (var i = 0; i < lengths.Length; i++)
        {
            if (passed + lengths[i] >= target)
            {
                var local = lengths[i] == 0 ? 0 : (target - passed) / lengths[i];
                return Lerp(path[i], path[i + 1], local);
            }

            passed += lengths[i];
        }

        return path[^1];
    }

    private static bool TryBuildPerfectCircle((double X, double Y)[] controls, out (double X, double Y)[] arc)
    {
        var (a, b, c) = (controls[0], controls[1], controls[2]);
        var divisor = 2 * (a.X * (b.Y - c.Y) + b.X * (c.Y - a.Y) + c.X * (a.Y - b.Y));
        if (Math.Abs(divisor) < .001)
        {
            arc = [];
            return false;
        }

        var aa = a.X * a.X + a.Y * a.Y;
        var bb = b.X * b.X + b.Y * b.Y;
        var cc = c.X * c.X + c.Y * c.Y;
        var centerX = (aa * (b.Y - c.Y) + bb * (c.Y - a.Y) + cc * (a.Y - b.Y)) / divisor;
        var centerY = (aa * (c.X - b.X) + bb * (a.X - c.X) + cc * (b.X - a.X)) / divisor;

        double Angle((double X, double Y) point) => Math.Atan2(point.Y - centerY, point.X - centerX);

        var start = Angle(a);
        var middle = Angle(b);
        var end = Angle(c);
        while (middle < start)
            middle += Math.PI * 2;
        while (end < start)
            end += Math.PI * 2;
        if (middle > end)
            while (end > start)
                end -= Math.PI * 2;

        var radius = Distance(a, (centerX, centerY));
        arc = Enumerable.Range(0, 49).Select(index =>
        {
            var angle = start + (end - start) * index / 48;
            return (centerX + Math.Cos(angle) * radius, centerY + Math.Sin(angle) * radius);
        }).ToArray();

        return true;
    }

    private static (double X, double Y)[] BuildBezier((double X, double Y)[] controls)
    {
        var segments = new List<List<(double X, double Y)>>();
        var current = new List<(double X, double Y)>();
        foreach (var point in controls)
        {
            if (current.Count > 1 && point == current[^1])
            {
                segments.Add(current);
                current = [point];
            }
            else
            {
                current.Add(point);
            }
        }

        if (current.Count > 0)
            segments.Add(current);

        var samples = new List<(double X, double Y)>();
        foreach (var segment in segments)
        {
            var count = Math.Max(12, segment.Count * 12);
            for (var step = samples.Count == 0 ? 0 : 1; step < count; step++)
            {
                var t = step / (double)(count - 1);
                samples.Add(DeCasteljau(segment, t));
            }
        }

        return samples.ToArray();
    }

    private static (double X, double Y) DeCasteljau(List<(double X, double Y)> segment, double t)
    {
        var working = segment.ToArray();
        for (var level = working.Length - 1; level > 0; level--)
            for (var index = 0; index < level; index++)
                working[index] = Lerp(working[index], working[index + 1], t);

        return working[0];
    }

    private static (double X, double Y)[] BuildCatmullRom((double X, double Y)[] controls)
    {
        var output = new List<(double X, double Y)>();
        for (var index = 0; index < controls.Length - 1; index++)
        {
            var p0 = controls[Math.Max(0, index - 1)];
            var p1 = controls[index];
            var p2 = controls[index + 1];
            var p3 = controls[Math.Min(controls.Length - 1, index + 2)];

            for (var step = 0; step < 20; step++)
            {
                var t = step / 20d;
                var t2 = t * t;
                var t3 = t2 * t;
                var x = .5 * (2 * p1.X + (-p0.X + p2.X) * t + (2 * p0.X - 5 * p1.X + 4 * p2.X - p3.X) * t2
                    + (-p0.X + 3 * p1.X - 3 * p2.X + p3.X) * t3);
                var y = .5 * (2 * p1.Y + (-p0.Y + p2.Y) * t + (2 * p0.Y - 5 * p1.Y + 4 * p2.Y - p3.Y) * t2
                    + (-p0.Y + 3 * p1.Y - 3 * p2.Y + p3.Y) * t3);
                output.Add((x, y));
            }
        }

        output.Add(controls[^1]);
        return output.ToArray();
    }

    private static void ExtendPastLastPoint(List<(double X, double Y)> output, double pixelLength, double travelled)
    {
        var before = output[^2];
        var after = output[^1];
        var segment = Distance(before, after);
        if (segment > .00001)
            output.Add(Lerp(after, (after.X + (after.X - before.X), after.Y + (after.Y - before.Y)),
                (pixelLength - travelled) / segment));
    }

    private static double Distance((double X, double Y) a, (double X, double Y) b) =>
        Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2));

    private static (double X, double Y) Lerp((double X, double Y) from, (double X, double Y) to, double amount) =>
        (from.X + (to.X - from.X) * amount, from.Y + (to.Y - from.Y) * amount);
}
