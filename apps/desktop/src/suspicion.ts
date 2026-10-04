import type { ReplayFrame, ReplayKeyEvent, SimulationJudgement } from './stores/editor';

export type SuspicionKind = 'teleport' | 'straight' | 'even-timing' | 'even-holds';
/// A stretch of the replay that does not look hand-played. `strong` findings are close to
/// impossible for a human; the others are worth a look.
export type Suspicion = {
  kind: SuspicionKind;
  startMs: number;
  endMs: number;
  strong: boolean;
  summary: string;
  detail: string;
};

// Cursor jumps: faster than any flick, over a distance that is not sensor noise. Real replays
// peak around 10 px/ms between frames; only a tablet pen re-entering range goes higher.
const TELEPORT_SPEED = 12; // px per ms
const TELEPORT_STRONG_SPEED = 30; // px per ms
const TELEPORT_DISTANCE = 120; // px
// Snap back: out and straight back within two frames, each leg at least this long. A hand has to
// slow down to turn around, so real replays never show this.
const SNAP_DISTANCE = 60; // px
const SNAP_FRAME_MS = 40;
const SNAP_REVERSAL = -0.9; // cosine between the two legs
// Stray frame: a single frame off the path, found two ways (both absent from real replays):
// out and back to the same spot with legs this long and this sharp a turn,
const STRAY_LEG = 16; // px
const STRAY_TURN = -0.5; // cosine between the two legs
// or this far off a path that is smooth without it, taking a detour this much longer.
const STRAY_OFF_PATH = 12; // px
const STRAY_SMOOTHNESS = 3; // neighbours stay within off-path distance / this
const STRAY_DETOUR = 1.5;
// Straight lines: this many frames in a row on one line, over at least this distance.
const STRAIGHT_FRAMES = 7;
const STRAIGHT_LENGTH = 120; // px
const STRAIGHT_TOLERANCE = 0.2; // px off the line
// Steps this evenly spaced (relative spread) mean constant speed, as interpolation produces.
const EVEN_STEP_SPREAD = 0.03;
// Timing: this many hits (or presses) in a row with a spread no player sustains.
const TIMING_RUN = 16;
const EVEN_TIMING_MS = 2; // standard deviation of the hit error, i.e. UR 20
const EVEN_HOLD_MS = 1.5; // standard deviation of the key hold time

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

// Frames far outside any game window are replay bookkeeping (stable's seed frame), not cursor data.
// The cursor itself is free to leave the playfield, so the limits are generous.
const onPlayfield = (frame: ReplayFrame) =>
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  frame.x > -400 &&
  frame.x < 912 &&
  frame.y > -300 &&
  frame.y < 684;

function teleports(frames: readonly ReplayFrame[], found: Suspicion[]) {
  for (let index = 1; index < frames.length; index++) {
    const from = frames[index - 1];
    const to = frames[index];
    if (!onPlayfield(from) || !onPlayfield(to)) continue;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const elapsed = to.timeMs - from.timeMs;
    const back = frames[index + 1];
    if (back && onPlayfield(back) && distance >= SNAP_DISTANCE) {
      const returned = Math.hypot(back.x - to.x, back.y - to.y);
      const reversal =
        ((to.x - from.x) * (back.x - to.x) + (to.y - from.y) * (back.y - to.y)) / (distance * (returned || 1));
      if (
        returned >= SNAP_DISTANCE &&
        reversal < SNAP_REVERSAL &&
        elapsed <= SNAP_FRAME_MS &&
        back.timeMs - to.timeMs <= SNAP_FRAME_MS
      ) {
        found.push({
          kind: 'teleport',
          startMs: from.timeMs,
          endMs: back.timeMs,
          strong: true,
          summary: `Cursor snap · ${Math.round(distance)} px out and back`,
          detail: `The cursor shot ${Math.round(distance)} px away and straight back ${Math.round(returned)} px within ${Math.max(0, Math.round(back.timeMs - from.timeMs))} ms. A hand has to slow down to turn around.`,
        });
        // The return leg belongs to this finding.
        index++;
        continue;
      }
    }
    const stray = back && onPlayfield(back) ? strayDistance(frames, index) : 0;
    if (stray && back) {
      found.push({
        kind: 'teleport',
        startMs: from.timeMs,
        endMs: back.timeMs,
        strong: true,
        summary: `Stray frame · ${Math.round(stray)} px off the path`,
        detail: `One frame sits ${Math.round(stray)} px off the path and the next is back on it. Take that frame away and the movement is smooth, so the cursor did not really go there.`,
      });
      continue;
    }
    if (distance < TELEPORT_DISTANCE) continue;
    if (elapsed > 0 && distance / elapsed <= TELEPORT_SPEED) continue;
    found.push({
      kind: 'teleport',
      startMs: from.timeMs,
      endMs: to.timeMs,
      strong: elapsed <= 1 || distance / elapsed > TELEPORT_STRONG_SPEED,
      summary: `Cursor jump · ${Math.round(distance)} px in ${Math.max(0, Math.round(elapsed))} ms`,
      detail: `The cursor moved ${Math.round(distance)} px between two frames ${Math.max(0, Math.round(elapsed))} ms apart, faster than a hand moves. A tablet pen coming back into range can also do this.`,
    });
  }
}

// Distance of point p from the line through a and b.
function offLine(a: ReplayFrame, b: ReplayFrame, p: ReplayFrame): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return length ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length : Math.hypot(p.x - a.x, p.y - a.y);
}

/// How far frame `index` sits off the path when it is a lone outlier (0 when it is not): either
/// the cursor pops out and comes straight back to where it was, or the frames around it line up
/// smoothly without it. Neither shape appears in real replays, even at these small distances.
function strayDistance(frames: readonly ReplayFrame[], index: number): number {
  const before = frames[index - 1];
  const frame = frames[index];
  const after = frames[index + 1];
  if (frame.timeMs - before.timeMs > SNAP_FRAME_MS || after.timeMs - frame.timeMs > SNAP_FRAME_MS) return 0;
  const out = Math.hypot(frame.x - before.x, frame.y - before.y);
  const home = Math.hypot(after.x - frame.x, after.y - frame.y);
  const across = Math.hypot(after.x - before.x, after.y - before.y);
  if (!out || !home) return 0;
  const leg = Math.min(out, home);
  const turn = ((frame.x - before.x) * (after.x - frame.x) + (frame.y - before.y) * (after.y - frame.y)) / (out * home);
  if (leg >= STRAY_LEG && turn < STRAY_TURN && across < leg / 2) return out;

  const earlier = frames[index - 2];
  const later = frames[index + 2];
  if (!earlier || !later || !onPlayfield(earlier) || !onPlayfield(later)) return 0;
  if (before.timeMs - earlier.timeMs > SNAP_FRAME_MS || later.timeMs - after.timeMs > SNAP_FRAME_MS) return 0;
  const off = across > 1 ? offLine(before, after, frame) : out;
  const smooth =
    offLine(earlier, after, before) < off / STRAY_SMOOTHNESS && offLine(before, later, after) < off / STRAY_SMOOTHNESS;
  return off >= STRAY_OFF_PATH && smooth && out + home > STRAY_DETOUR * Math.max(across, 1) ? off : 0;
}

function straightLines(frames: readonly ReplayFrame[], found: Suspicion[]) {
  let start = 0;
  while (start < frames.length - 1) {
    if (!onPlayfield(frames[start])) {
      start++;
      continue;
    }
    // Grow the run while each new frame stays on the line so far and keeps moving forward.
    let end = start + 1;
    while (end + 1 < frames.length && onPlayfield(frames[end + 1])) {
      const next = frames[end + 1];
      const forward =
        (next.x - frames[end].x) * (frames[end].x - frames[start].x) +
          (next.y - frames[end].y) * (frames[end].y - frames[start].y) >
        0;
      if (!forward || offLine(frames[start], frames[end], next) > STRAIGHT_TOLERANCE) break;
      end++;
    }
    const length = Math.hypot(frames[end].x - frames[start].x, frames[end].y - frames[start].y);
    let straight = end - start + 1 >= STRAIGHT_FRAMES && length >= STRAIGHT_LENGTH;
    // The line drifted as the run grew: every frame must sit on the final chord.
    for (let index = start + 1; straight && index < end; index++)
      straight = offLine(frames[start], frames[end], frames[index]) <= STRAIGHT_TOLERANCE;
    if (!straight) {
      start++;
      continue;
    }
    const speeds: number[] = [];
    for (let index = start + 1; index <= end; index++) {
      const elapsed = frames[index].timeMs - frames[index - 1].timeMs;
      if (elapsed > 0)
        speeds.push(Math.hypot(frames[index].x - frames[index - 1].x, frames[index].y - frames[index - 1].y) / elapsed);
    }
    const mean = speeds.reduce((sum, speed) => sum + speed, 0) / Math.max(1, speeds.length);
    const spread = mean
      ? Math.sqrt(speeds.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) / speeds.length) / mean
      : 1;
    const constant = speeds.length >= STRAIGHT_FRAMES - 1 && spread < EVEN_STEP_SPREAD;
    found.push({
      kind: 'straight',
      startMs: frames[start].timeMs,
      endMs: frames[end].timeMs,
      strong: constant,
      summary: `Straight line · ${Math.round(length)} px${constant ? ' at constant speed' : ''}`,
      detail: `${end - start + 1} frames in a row lie within ${STRAIGHT_TOLERANCE} px of one line over ${Math.round(length)} px${
        constant ? ', evenly spaced like an interpolated path' : ''
      }. Hand movement curves and wobbles.`,
    });
    start = end;
  }
}

/// Runs of at least TIMING_RUN values whose standard deviation stays under `limit`, merged.
function evenRuns(values: readonly { time: number; value: number }[], limit: number) {
  const runs: { from: number; to: number; deviation: number }[] = [];
  let sum = 0;
  let squares = 0;
  for (let index = 0; index < values.length; index++) {
    sum += values[index].value;
    squares += values[index].value ** 2;
    if (index >= TIMING_RUN) {
      sum -= values[index - TIMING_RUN].value;
      squares -= values[index - TIMING_RUN].value ** 2;
    }
    if (index < TIMING_RUN - 1) continue;
    const mean = sum / TIMING_RUN;
    const deviation = Math.sqrt(Math.max(0, squares / TIMING_RUN - mean * mean));
    if (deviation >= limit) continue;
    const from = index - TIMING_RUN + 1;
    const last = runs.at(-1);
    if (last && from <= last.to) {
      last.to = index;
      last.deviation = Math.max(last.deviation, deviation);
    } else runs.push({ from, to: index, deviation });
  }
  return runs;
}

function evenTiming(judgements: readonly SimulationJudgement[], found: Suspicion[]) {
  const hits = judgements
    .filter((judgement) => judgement.hitError != null && judgement.hitTime != null && judgement.kind !== 'spinner')
    .map((judgement) => ({ time: judgement.hitTime!, value: judgement.hitError! }))
    .sort((a, b) => a.time - b.time);
  for (const run of evenRuns(hits, EVEN_TIMING_MS))
    found.push({
      kind: 'even-timing',
      startMs: hits[run.from].time,
      endMs: hits[run.to].time,
      strong: run.deviation < EVEN_TIMING_MS / 2,
      summary: `Even timing · ${run.to - run.from + 1} hits at UR ${round(run.deviation * 10)}`,
      detail: `${run.to - run.from + 1} hits in a row land within a ${round(run.deviation)} ms spread (UR ${round(run.deviation * 10)}). The best players stay above UR 50 over stretches like this.`,
    });
}

function evenHolds(keyEvents: readonly ReplayKeyEvent[], found: Suspicion[]) {
  const downAt = new Map<string, number>();
  const holds: { time: number; value: number }[] = [];
  for (const event of keyEvents) {
    if (event.down) downAt.set(event.key, event.timeMs);
    else {
      const pressed = downAt.get(event.key);
      if (pressed !== undefined) holds.push({ time: pressed, value: event.timeMs - pressed });
      downAt.delete(event.key);
    }
  }
  holds.sort((a, b) => a.time - b.time);
  for (const run of evenRuns(holds, EVEN_HOLD_MS))
    found.push({
      kind: 'even-holds',
      startMs: holds[run.from].time,
      endMs: holds[run.to].time + holds[run.to].value,
      strong: run.deviation < EVEN_HOLD_MS / 3,
      summary: `Even key holds · ${run.to - run.from + 1} presses within ${round(run.deviation)} ms`,
      detail: `${run.to - run.from + 1} presses in a row are held for almost exactly the same time (${round(run.deviation)} ms spread). Fingers vary by several ms from press to press.`,
    });
}

/// Finds the parts of a replay that look generated or edited rather than played: cursor jumps,
/// perfectly straight (and constant-speed) movement, and timing or key holds that are too even.
/// `judgements` (from the simulation) are optional; without them hit timing is not checked.
export function analyseSuspicion(input: {
  frames: readonly ReplayFrame[];
  keyEvents: readonly ReplayKeyEvent[];
  judgements?: readonly SimulationJudgement[] | null;
}): Suspicion[] {
  const found: Suspicion[] = [];
  teleports(input.frames, found);
  straightLines(input.frames, found);
  if (input.judgements) evenTiming(input.judgements, found);
  evenHolds(input.keyEvents, found);
  return found.sort((a, b) => a.startMs - b.startMs);
}
