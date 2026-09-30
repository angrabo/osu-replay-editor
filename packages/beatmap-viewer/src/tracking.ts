import type { HitSlider, ParsedBeatmap, Point } from './parser';
import { replayPointAt, type ReplayPoint } from './replay';
import { logicalButtons } from './renderMath';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// Distance travelled at each path point, cached per path: sliders are sampled every few ms, and
// re-measuring a long path for every sample made whole-map analysis slow.
const pathDistances = new WeakMap<Point[], Float64Array>();
function cumulativeDistances(path: Point[]): Float64Array {
  let distances = pathDistances.get(path);
  if (!distances) {
    distances = new Float64Array(path.length);
    for (let index = 1; index < path.length; index++)
      distances[index] =
        distances[index - 1] + Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    pathDistances.set(path, distances);
  }
  return distances;
}

export function pointOnPath(path: Point[], progress: number): Point {
  if (path.length < 2) return path[0] || { x: 256, y: 192 };
  const distances = cumulativeDistances(path);
  const total = distances[distances.length - 1] || 1;
  const target = clamp(progress) * total;
  // The first point at or past the target distance.
  let low = 1;
  let high = distances.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const length = distances[low] - distances[low - 1];
  const ratio = length ? (target - distances[low - 1]) / length : 0;
  return {
    x: path[low - 1].x + (path[low].x - path[low - 1].x) * ratio,
    y: path[low - 1].y + (path[low].y - path[low - 1].y) * ratio,
  };
}

/// The part of a path between two progress values (0..1), as points.
export function pathSegment(path: Point[], from: number, to: number): Point[] {
  const start = clamp(Math.min(from, to));
  const end = clamp(Math.max(from, to));
  if (path.length < 2 || end - start >= 1) return path;
  const distances = cumulativeDistances(path);
  const total = distances[distances.length - 1] || 1;
  const points: Point[] = [pointOnPath(path, start)];
  for (let index = 1; index < path.length; index++) {
    const progress = distances[index] / total;
    if (progress > start && progress < end) points.push(path[index]);
  }
  points.push(pointOnPath(path, end));
  return points;
}

export function sliderBallAt(slider: HitSlider, timeMs: number): Point {
  const raw =
    ((clamp(timeMs, slider.startTime, slider.endTime) - slider.startTime) /
      Math.max(1, slider.endTime - slider.startTime)) *
    slider.repeats;
  const span = Math.min(slider.repeats - 1, Math.floor(raw));
  const progress = span % 2 ? 1 - (raw - span) : raw - span;
  return pointOnPath(slider.path, progress);
}

export function circleRadius(circleSize: number): number {
  return 54.4 - 4.48 * clamp(circleSize, 0, 10);
}

export type TrackingSample = { timeMs: number; tracked: boolean };

const sampleStepMs = 6;

export type SliderClient = 'stable' | 'lazer';

/// When the slider head was hit: the simulation's hit time when known (null = head missed),
/// otherwise the first key press within the 50 window around the slider start.
export function sliderHeadHitTime(
  slider: HitSlider,
  frames: readonly ReplayPoint[],
  overallDifficulty: number,
  judgedHitTime?: number | null,
): number | null {
  if (judgedHitTime !== undefined) return judgedHitTime;
  const window = 200 - 10 * overallDifficulty;
  // Jump to the window by binary search; the frame before it gives the keys already held.
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs < slider.startTime - window) low = middle + 1;
    else high = middle;
  }
  let previous = low > 0 ? logicalButtons(frames[low - 1].keys) : 0;
  for (let index = low; index < frames.length; index++) {
    const frame = frames[index];
    if (frame.timeMs > slider.startTime + window) break;
    const buttons = logicalButtons(frame.keys);
    if (buttons & ~previous) return frame.timeMs;
    previous = buttons;
  }
  return null;
}

/// When the tail is judged: stable checks one moment, lazer accepts tracking at any point from
/// here to the end. Both use min(36 ms, half the slider) before the end.
export function sliderTailCheckTime(slider: HitSlider): number {
  return slider.endTime - Math.min(36, (slider.endTime - slider.startTime) / 2);
}

// Approximate slider tracking from the replay, from `fromMs` (the head hit) on: a key is held and
// the cursor is inside the follow circle, 2.4× the radius while tracking and 1× to pick it back
// up. Hitting the head expands the circle straight away.
export function sliderTracking(
  slider: HitSlider,
  frames: readonly ReplayPoint[],
  radius: number,
  fromMs: number,
  untilMs: number,
  headHit: boolean,
): TrackingSample[] {
  const start = Math.max(slider.startTime, Math.min(fromMs, slider.endTime));
  const end = Math.min(untilMs, slider.endTime);
  const samples: TrackingSample[] = [];
  if (end < start) return samples;
  let tracked = false;
  for (let timeMs = start; ; timeMs = Math.min(end, timeMs + sampleStepMs)) {
    const cursor = replayPointAt(frames, timeMs);
    const ball = sliderBallAt(slider, timeMs);
    const held = !!cursor && (cursor.keys & 15) !== 0;
    const distance = cursor ? Math.hypot(cursor.x - ball.x, cursor.y - ball.y) : Number.POSITIVE_INFINITY;
    const reach: number = tracked || (!samples.length && headHit) ? radius * 2.4 : radius;
    tracked = held && distance <= reach;
    samples.push({ timeMs, tracked });
    if (timeMs >= end) break;
  }
  return samples;
}

/// Ticks and repeats along every span (the tail is handled separately).
export function sliderCheckTimes(slider: HitSlider): number[] {
  const duration = slider.endTime - slider.startTime;
  if (duration <= 0) return [];
  const span = duration / slider.repeats;
  const times: number[] = [];
  const length = Math.max(1, slider.pixelLength);
  for (let repeat = 0; repeat < slider.repeats; repeat++) {
    if (slider.tickDistance > 0)
      for (let distance = slider.tickDistance; distance < length - 0.5; distance += slider.tickDistance) {
        const progress = distance / length;
        times.push(slider.startTime + (repeat + (repeat % 2 ? 1 - progress : progress)) * span);
      }
    if (repeat > 0) times.push(slider.startTime + repeat * span);
  }
  return times.sort((a, b) => a - b);
}

export type SliderBreak = {
  objectIndex: number;
  // Stretches between the head hit and the tail check where the cursor was not tracking.
  lost: { startMs: number; endMs: number }[];
  // Ticks, repeats or the tail that were checked while not tracking: the actual slider breaks.
  missedChecks: number[];
};

export type SliderTrackingResult = {
  from: number;
  samples: TrackingSample[];
  lost: SliderBreak['lost'];
  missedChecks: number[];
};

/// Tracking for one slider, following each client's rules:
/// - tracking only starts when the head is hit, so a late or early click is not a loss;
/// - lazer: ticks the ball passed before a late head hit count when the cursor, at hit time, was
///   within the follow circle of where the ball was; stable misses them;
/// - the tail: stable checks one moment, lazer any moment of the final stretch;
/// - releasing after the tail check is not a loss.
export function analyseSlider(
  slider: HitSlider,
  frames: readonly ReplayPoint[],
  radius: number,
  client: SliderClient,
  headHitTime: number | null,
  untilMs = slider.endTime,
): SliderTrackingResult {
  const headHit = headHitTime !== null;
  const from = headHit ? Math.max(slider.startTime, headHitTime) : slider.startTime;
  const samples = sliderTracking(slider, frames, radius, from, untilMs, headHit);
  const tailTime = sliderTailCheckTime(slider);
  const trackedAt = (time: number) => {
    if (!samples.length) return false;
    const index = Math.min(samples.length - 1, Math.max(0, Math.round((time - samples[0].timeMs) / sampleStepMs)));
    return samples[index].tracked;
  };
  const cursorAtHit = headHit ? replayPointAt(frames, headHitTime) : null;
  const heldBeforeHit = (time: number) => {
    if (client !== 'lazer' || !cursorAtHit) return false;
    const ball = sliderBallAt(slider, time);
    return Math.hypot(cursorAtHit.x - ball.x, cursorAtHit.y - ball.y) <= radius * 2.4;
  };
  const missedChecks = sliderCheckTimes(slider).filter(
    (time) => time <= untilMs && !(time < from ? heldBeforeHit(time) : trackedAt(time)),
  );
  if (untilMs >= tailTime) {
    const tailHit =
      client === 'lazer'
        ? samples.some((sample) => sample.tracked && sample.timeMs >= tailTime) ||
          (tailTime < from && heldBeforeHit(tailTime))
        : tailTime < from
          ? false
          : trackedAt(tailTime);
    if (!tailHit && (client === 'stable' || untilMs >= slider.endTime)) missedChecks.push(tailTime);
  }
  const lost: SliderBreak['lost'] = [];
  const shownUntil = Math.min(untilMs, tailTime);
  for (let index = 0; index < samples.length && samples[index].timeMs <= shownUntil; index++) {
    if (samples[index].tracked) continue;
    const startMs = samples[index].timeMs;
    while (index + 1 < samples.length && !samples[index + 1].tracked && samples[index + 1].timeMs <= shownUntil)
      index++;
    lost.push({ startMs, endMs: Math.min(shownUntil, samples[Math.min(samples.length - 1, index + 1)].timeMs) });
  }
  return { from, samples, lost, missedChecks };
}

/// Slider breaks for every slider in the map. `judgedHeadHits` maps object index to the head hit
/// time from the simulation (null = head missed); sliders without an entry are estimated.
export function sliderBreaks(
  beatmap: ParsedBeatmap,
  frames: readonly ReplayPoint[],
  client: SliderClient = 'stable',
  judgedHeadHits?: ReadonlyMap<number, number | null>,
): SliderBreak[] {
  if (!frames.length) return [];
  const radius = circleRadius(beatmap.circleSize);
  const result: SliderBreak[] = [];
  beatmap.hitObjects.forEach((object, objectIndex) => {
    if (object.kind !== 'slider' || object.endTime <= object.startTime) return;
    const headHitTime = sliderHeadHitTime(object, frames, beatmap.overallDifficulty, judgedHeadHits?.get(objectIndex));
    const analysis = analyseSlider(object, frames, radius, client, headHitTime);
    if (!analysis.lost.length && !analysis.missedChecks.length) return;
    result.push({ objectIndex, lost: analysis.lost, missedChecks: analysis.missedChecks.sort((a, b) => a - b) });
  });
  return result;
}
