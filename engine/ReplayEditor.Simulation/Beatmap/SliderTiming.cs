namespace ReplayEditor.Simulation.Beatmap;

/// <summary>
/// Looks up a slider's beat length and duration from the map's timing points at the
/// slider's start time (the most recent uninherited point sets the beat, the most recent
/// inherited point sets its velocity multiplier).
/// </summary>
internal static class SliderTiming
{
    public static double SliderDuration(double start, double length, int repeats, double multiplier,
        (double Time, double BeatLength, bool Uninherited)[] timing)
    {
        var beat = 500d;
        var velocity = 1d;

        foreach (var point in timing)
        {
            if (point.Time > start)
                break;
            if (point.Uninherited && point.BeatLength > 0)
            {
                beat = point.BeatLength;
                velocity = 1;
            }
            else if (!point.Uninherited && point.BeatLength < 0)
            {
                velocity = Math.Clamp(-100 / point.BeatLength, .1, 10);
            }
        }

        return length / (Math.Max(.1, multiplier) * 100 * velocity) * beat * repeats;
    }

    public static double BeatLengthAt(double start, (double Time, double BeatLength, bool Uninherited)[] timing)
    {
        var beat = 500d;

        foreach (var point in timing)
        {
            if (point.Time > start)
                break;
            if (point.Uninherited && point.BeatLength > 0)
                beat = point.BeatLength;
        }

        return beat;
    }
}
