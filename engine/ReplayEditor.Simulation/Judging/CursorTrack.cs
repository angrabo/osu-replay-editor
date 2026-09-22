using ReplayEditor.Core;

namespace ReplayEditor.Simulation.Judging;

/// <summary>
/// One button press extracted from consecutive replay frames' key bitmasks.
/// </summary>
internal sealed record Press(double Time, int Bit, string Key);

/// <summary>
/// Derives presses from a replay's key bitmasks and interpolates the cursor position
/// between frames. Shared by circle/slider hit-testing and spinner rotation tracking.
/// </summary>
internal static class CursorTrack
{
    private static readonly string[] KeyNames = ["M1", "M2", "K1", "K2"];

    public static IEnumerable<Press> Presses(IReadOnlyList<SimulationFrame> frames)
    {
        var previous = 0;
        foreach (var frame in frames)
        {
            var current = Logical(frame.Keys);
            for (var bit = 0; bit < 4; bit++)
            {
                if ((current & (1 << bit)) != 0 && (previous & (1 << bit)) == 0)
                    yield return new Press(frame.TimeMs, 1 << bit, KeyNames[bit]);
            }

            previous = current;
        }
    }

    public static int Logical(int rawKeys) => (rawKeys & 15) & ~((rawKeys & 12) >> 2);

    public static bool Held(SimulationFrame frame) => Logical(frame.Keys) != 0;

    public static (double X, double Y)? CursorAt(IReadOnlyList<SimulationFrame> frames, double time)
    {
        if (frames.Count == 0 || time < frames[0].TimeMs || time > frames[^1].TimeMs)
            return null;

        var low = 0;
        var high = frames.Count;
        while (low < high)
        {
            var middle = (low + high) >> 1;
            if (frames[middle].TimeMs <= time)
                low = middle + 1;
            else
                high = middle;
        }

        var before = frames[Math.Max(0, low - 1)];
        var after = low < frames.Count ? frames[low] : before;
        if (after.TimeMs == before.TimeMs)
            return (before.X, before.Y);

        var amount = (time - before.TimeMs) / (after.TimeMs - before.TimeMs);
        return (before.X + (after.X - before.X) * amount, before.Y + (after.Y - before.Y) * amount);
    }
}
