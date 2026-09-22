using ReplayEditor.Core;

namespace ReplayEditor.Osu;

/// <summary>
/// Derives discrete press/release events from consecutive frames' raw key bitmasks,
/// masking out the keyboard bits (K1/K2) that mirror the mouse bits (M1/M2) on the same input.
/// </summary>
public static partial class ReplayFileReader
{
    private static readonly (int Bit, string Name)[] Keys = [(1, "M1"), (2, "M2"), (4, "K1"), (8, "K2")];

    public static ReplayKeyEvent[] KeyTransitions(IReadOnlyList<ReplayFrame> frames)
    {
        var events = new List<ReplayKeyEvent>();
        var previous = 0;
        foreach (var frame in frames)
        {
            var current = LogicalKeys(frame.Keys);
            foreach (var (bit, name) in Keys)
                if (((previous ^ current) & bit) != 0)
                    events.Add(new ReplayKeyEvent(frame.TimeMs, name, (current & bit) != 0));
            previous = current;
        }

        return events.ToArray();
    }

    public static int LogicalKeys(int rawKeys) => (rawKeys & 15) & ~((rawKeys & 12) >> 2);

    public static int ReconstructKeyState(IEnumerable<ReplayKeyEvent> events, long timeMs)
    {
        var state = 0;
        foreach (var item in events.Where(item => item.TimeMs <= timeMs))
        {
            var bit = Keys.FirstOrDefault(key => key.Name == item.Key).Bit;
            if (bit == 0)
                throw new InvalidDataException("Unknown replay key.");
            state = item.Down ? state | bit : state & ~bit;
        }

        return state;
    }
}
