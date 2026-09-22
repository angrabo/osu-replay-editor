using System.Globalization;
using ReplayEditor.Core;

namespace ReplayEditor.Osu;

/// <summary>
/// The comma/pipe-delimited frame-text format decoded from the LZMA payload: delta
/// time, position, and raw key bitmask per frame, plus the trailing RNG seed marker.
/// </summary>
public static partial class ReplayFileReader
{
    public static (ReplayFrame[] Frames, int? Seed) ParseFrames(string text)
    {
        var frames = new List<ReplayFrame>();
        long time = 0;
        int? seed = null;
        var items = text.Split(',');
        for (var frameIndex = 0; frameIndex < items.Length; frameIndex++)
        {
            var item = items[frameIndex];
            if (item.Length == 0 && frameIndex == items.Length - 1)
                break;
            if (item.Length == 0)
                throw new InvalidDataException("Replay contains an empty cursor frame.");

            var parts = item.Split('|');
            if (parts.Length != 4 || !TryDelta(parts[0], out var delta)
                || !float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var x)
                || !float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var y)
                || !int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out var keys)
                || !float.IsFinite(x) || !float.IsFinite(y))
                throw new InvalidDataException("Replay contains a malformed cursor frame.");

            if (delta == -12345)
            {
                if (seed is not null || x != 0 || y != 0)
                    throw new InvalidDataException("Replay RNG seed marker is malformed.");
                seed = keys;
                continue;
            }

            if (seed is not null || frames.Count >= 1_000_000)
                throw new InvalidDataException("Replay frame times are invalid or exceed the supported limit.");
            time = checked(time + delta);
            frames.Add(new ReplayFrame(time, delta, x, y, keys));
        }

        return (frames.ToArray(), seed);
    }

    private static ReplayFrame[] DisplayFrames(IReadOnlyList<ReplayFrame> rawFrames)
    {
        var first = 0;
        while (first < Math.Min(2, rawFrames.Count) && rawFrames[first].X == 256 && rawFrames[first].Y == -500)
            first++;

        // Preserve the encoded order in RawFrames; playback uses chronological order.
        // OrderBy is stable, so frames sharing a timestamp retain their encoded order.
        return rawFrames.Skip(first).OrderBy(frame => frame.TimeMs).ToArray();
    }

    private static bool TryDelta(string value, out long delta)
    {
        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out delta))
            return true;
        if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var fractional)
            || !double.IsFinite(fractional) || fractional < long.MinValue || fractional > long.MaxValue)
            return false;
        delta = checked((long)Math.Round(fractional));
        return true;
    }
}
