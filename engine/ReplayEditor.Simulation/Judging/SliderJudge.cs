using ReplayEditor.Core;
using ReplayEditor.Simulation.Beatmap;

namespace ReplayEditor.Simulation.Judging;

/// <summary>
/// Judges a slider's head/ticks/repeats/tail against replay input: for each part,
/// whether the cursor was following the slider ball (held for stable, merely nearby for lazer)
/// at the moment the part is judged.
/// </summary>
internal static class SliderJudge
{
    public static (double Time, int Score, bool Hit)[] Parts(IReadOnlyList<SimulationFrame> frames, MapObject item,
        double rate, double tickRate, double radius, bool headHit, bool lazer, double? headHitTime = null)
    {
        var ordered = BuildPartTimeline(item, rate, tickRate, headHit);
        JudgePartTimeline(ordered, frames, item, rate, radius, lazer, headHit, headHitTime);
        return ordered;
    }

    public static int PartCount(MapObject item, double rate, double tickRate)
    {
        var span = (item.End - item.Start) / rate / item.Repeats;
        var tickInterval = item.BeatLength / Math.Max(.1, tickRate) / rate;

        var ticksPerSpan = 0;
        for (var offset = tickInterval; offset < span - 10; offset += tickInterval)
            ticksPerSpan++;

        return 1 + ticksPerSpan * item.Repeats + Math.Max(0, item.Repeats - 1) + 1;
    }

    public static (double X, double Y) BallAt(MapObject item, double rate, double time)
    {
        var start = item.Start / rate;
        var end = item.End / rate;
        var progress = Math.Clamp((time - start) / Math.Max(1, end - start) * item.Repeats, 0, item.Repeats);
        var repeat = Math.Min(item.Repeats - 1, (int)Math.Floor(progress));
        var local = progress - repeat;
        if ((repeat & 1) != 0)
            local = 1 - local;

        return SliderCurveBuilder.PathAt(item.Path, local);
    }

    private static (double Time, int Score, bool Hit)[] BuildPartTimeline(MapObject item, double rate, double tickRate, bool headHit)
    {
        var start = item.Start / rate;
        var end = item.End / rate;
        var span = (end - start) / item.Repeats;
        var tickInterval = item.BeatLength / Math.Max(.1, tickRate) / rate;

        var parts = new List<(double Time, int Score, bool Hit)> { (start, 30, headHit) };
        for (var repeat = 0; repeat < item.Repeats; repeat++)
        {
            var spanStart = start + span * repeat;
            for (var offset = tickInterval; offset < span - 10; offset += tickInterval)
                parts.Add((spanStart + offset, 10, false));

            if (repeat < item.Repeats - 1)
                parts.Add((spanStart + span, 30, false));
        }

        // Stable judges the legacy slider tail at exactly min(36 ms, half the
        // slider duration) before the visual end. Shifting this by even 1 ms
        // changes tracking on short, fast sliders.
        var tailTime = end - Math.Min(36, (end - start) / 2);
        parts.Add((tailTime, 30, false));

        return parts.OrderBy(part => part.Time).ToArray();
    }

    private static void JudgePartTimeline((double Time, int Score, bool Hit)[] ordered, IReadOnlyList<SimulationFrame> frames,
        MapObject item, double rate, double radius, bool lazer, bool headHit, double? headHitTime)
    {
        var start = item.Start / rate;
        var active = headHit;
        var frameIndex = 0;
        while (frameIndex < frames.Count && frames[frameIndex].TimeMs <= start)
            frameIndex++;

        var firstIndex = 1;
        if (lazer && headHit && headHitTime is { } hitTime && hitTime > start)
        {
            // Lazer's SliderInputManager.PostProcessHeadJudgement: when the head is hit late and the
            // cursor is inside the expanded follow area, every nested part already passed is hit as
            // long as the cursor (where it is at the hit) lies within the expanded area around the ball
            // at that part's time; the first part that fails, and all passed parts after it, miss.
            // Tracking then starts immediately with the expanded radius.
            var cursorAtHit = CursorTrack.CursorAt(frames, hitTime);
            var inArea = cursorAtHit is not null && Distance(cursorAtHit.Value, BallAt(item, rate, hitTime)) <= radius;
            var forcing = inArea;
            while (firstIndex < ordered.Length && ordered[firstIndex].Time <= hitTime)
            {
                var part = ordered[firstIndex];
                forcing = forcing && Distance(cursorAtHit!.Value, BallAt(item, rate, part.Time)) <= radius;
                ordered[firstIndex] = (Math.Round(part.Time), part.Score, forcing);
                firstIndex++;
            }

            while (frameIndex < frames.Count && frames[frameIndex].TimeMs <= hitTime)
                frameIndex++;
            active = inArea;
        }

        // Lazer judges the tail over a window (DrawableSliderTail: hit if tracking at any moment from
        // min(36 ms, half the slider) before the end until the end); stable checks only that moment.
        var end = item.End / rate;
        var tailWindowStart = end - Math.Min(36, (end - start) / 2);
        var tailIndex = Array.FindLastIndex(ordered, part => part.Score == 30 && Math.Abs(part.Time - tailWindowStart) < 1e-6);
        var tailForced = tailIndex >= 0 && tailIndex < firstIndex;
        var trackedInTailWindow = false;
        void Sample(double time, bool tracked)
        {
            if (tracked && time >= Math.Round(tailWindowStart) && time <= Math.Round(end))
                trackedInTailWindow = true;
        }

        for (var index = firstIndex; index < ordered.Length; index++)
        {
            // Stable's gameplay clock and recorded input use whole milliseconds.
            // At a shared timestamp, the slider judgement precedes that input
            // frame; sampling the preceding millisecond preserves this order.
            var eventTime = lazer ? Math.Round(ordered[index].Time) : Math.Floor(ordered[index].Time);
            while (frameIndex < frames.Count && (lazer ? frames[frameIndex].TimeMs <= eventTime : frames[frameIndex].TimeMs < eventTime))
            {
                var frame = frames[frameIndex++];
                var ball = BallAt(item, rate, frame.TimeMs);
                active = lazer
                    ? FollowPosition(active, (frame.X, frame.Y), ball, radius)
                    : FollowState(active, CursorTrack.Held(frame), (frame.X, frame.Y), ball, radius);
                Sample(frame.TimeMs, active && CursorTrack.Held(frame));
            }

            var heldFrame = frameIndex == 0 ? null : frames[frameIndex - 1];
            var held = heldFrame is not null && CursorTrack.Held(heldFrame);
            var cursor = CursorTrack.CursorAt(frames, lazer ? eventTime : eventTime - 1);
            var eventBall = BallAt(item, rate, eventTime);
            active = cursor is not null && (lazer
                ? FollowPosition(active, cursor.Value, eventBall, radius)
                : FollowState(active, held, cursor.Value, eventBall, radius));

            // Lazer's SliderInputManager.Tracking also requires an actively
            // held key (any key once the head's key is released), same as stable.
            ordered[index] = (eventTime, ordered[index].Score, active && held);
            Sample(eventTime, active && held);
        }

        if (!lazer || tailIndex < 0 || tailForced)
            return;

        // Keep following the ball to the slider's end so tracking late in the window still counts.
        var endTime = Math.Round(end);
        while (frameIndex < frames.Count && frames[frameIndex].TimeMs <= endTime)
        {
            var frame = frames[frameIndex++];
            active = FollowPosition(active, (frame.X, frame.Y), BallAt(item, rate, frame.TimeMs), radius);
            Sample(frame.TimeMs, active && CursorTrack.Held(frame));
        }

        ordered[tailIndex] = (ordered[tailIndex].Time, ordered[tailIndex].Score, trackedInTailWindow);
    }

    private static double Distance((double X, double Y) first, (double X, double Y) second) =>
        Math.Sqrt(Math.Pow(first.X - second.X, 2) + Math.Pow(first.Y - second.Y, 2));

    private static bool FollowState(bool active, bool held, (double X, double Y) cursor, (double X, double Y) target, double expandedRadius)
    {
        if (!held)
            return false;

        var distance = Math.Sqrt(Math.Pow(cursor.X - target.X, 2) + Math.Pow(cursor.Y - target.Y, 2));
        return distance <= (active ? expandedRadius : expandedRadius / 2.4);
    }

    private static bool FollowPosition(bool active, (double X, double Y) cursor, (double X, double Y) target, double expandedRadius)
    {
        var distance = Math.Sqrt(Math.Pow(cursor.X - target.X, 2) + Math.Pow(cursor.Y - target.Y, 2));
        return distance <= (active ? expandedRadius : expandedRadius / 2.4);
    }
}
