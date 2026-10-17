import type { InputKey } from './stores/editor';

/// Experimental timing fix for showcase replays: nudges key presses so close calls land nearer
/// the centre of the 300 window and the number of 100s drops to a chosen count, while the hit
/// errors keep looking played. Only press times change; the cursor path is never touched.
///
/// How it stays natural:
/// - errors are mapped by rank onto a normal distribution centred on the player's own mean, so
///   the order of early and late hits is kept and the result has normal tails, not a wall of hits
///   just inside the window edge;
/// - the spread is only tightened as far as the requested 100 count needs;
/// - hits already well inside the window are left alone, close calls move only part of the way,
///   and every target gets a little seeded noise;
/// - a press only moves where the cursor is still on the circle with some room to spare, it does
///   not run into another press of the same key, and it stays between its neighbours' hits.

export type FixWindows = { great: number; ok: number; meh: number };
export type FixPress = { key: InputKey; startTime: number; endTime: number };
export type FixHit = {
  objectIndex: number;
  kind: 'circle' | 'slider';
  // The object's time and the hit error of the press that judged it (press time − object time).
  objectTime: number;
  error: number;
  press: FixPress;
  // Where the object sits on the playfield (stacking and Hard Rock applied).
  center: { x: number; y: number };
};
export type FixOptions = {
  windows: FixWindows;
  radius: number;
  // How far inside the circle the cursor must stay at the new press time, in osu! pixels.
  leewayPx: number;
  // How many hits may stay outside the 300 window (100s and 50s together).
  target100s: number;
  // 0–1: how far close calls move toward their natural position.
  closeCallPull: number;
  // Hits beyond this share of the 300 window count as close calls.
  closeCallFrom: number;
  cursorAt: (timeMs: number) => { x: number; y: number } | null;
  // Every press on the track by key, so moves never collide with another press.
  presses: Partial<Record<InputKey, FixPress[]>>;
  // When every judged object was hit, so a moved press stays between its neighbours.
  anchors: { objectIndex: number; time: number }[];
  seed?: number;
};
// cursor: not on the circle with the required room; press: runs into another press of the key;
// order: would pass a neighbouring object's hit; window: would leave the 50 window or empty the press.
export type BlockReason = 'cursor' | 'press' | 'order' | 'window';
export type FixStats = { great: number; ok: number; meh: number; mean: number; ur: number };
export type FixMove = { objectIndex: number; from: FixPress; to: FixPress; errorBefore: number; errorAfter: number };
export type FixPlan = {
  moves: FixMove[];
  before: FixStats;
  after: FixStats;
  // Hits that should have moved but had no room (cursor too close to the edge, neighbours).
  blocked: number;
  // Why they could not move, by the reason the last step tried failed on.
  blockedBy: Partial<Record<BlockReason, number>>;
  errorsBefore: number[];
  errorsAfter: number[];
};

// Inverse of the standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9).
export function inverseNormal(p: number): number {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 1 - low) return -inverseNormal(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

// Seeded standard normal noise per object, so the same settings always give the same result.
function noise(seed: number, index: number): number {
  let state = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next());
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function fixStats(errors: number[], windows: FixWindows): FixStats {
  const stats = { great: 0, ok: 0, meh: 0, mean: 0, ur: 0 };
  if (!errors.length) return stats;
  for (const error of errors) {
    const size = Math.abs(error);
    if (size < windows.great) stats.great++;
    else if (size < windows.ok) stats.ok++;
    else stats.meh++;
  }
  stats.mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  stats.ur = Math.sqrt(errors.reduce((sum, error) => sum + (error - stats.mean) ** 2, 0) / errors.length) * 10;
  return stats;
}

type Draft = { moves: FixMove[]; errors: number[]; blocked: number; blockedBy: Partial<Record<BlockReason, number>> };

// How much of the way hits inside the window move when the spread is tightened.
const TIGHTEN_SHARE = 0.8;

const SHARED_KEYS: Record<InputKey, InputKey[]> = {
  M1: ['M1', 'K1'],
  K1: ['K1', 'M1'],
  M2: ['M2', 'K2'],
  K2: ['K2', 'M2'],
};

// `spread`: the normal spread hits outside the window are mapped onto. `closeSpread`: the slightly
// tighter one close calls are pulled toward. `moveOutside`: hits outside the 300 window may be
// brought in (only while the 100 count is above the target); otherwise only close calls move.
function draft(
  hits: FixHit[],
  options: FixOptions,
  spread: number,
  closeSpread: number,
  centre: number,
  moveOutside: boolean,
): Draft {
  const { windows } = options;
  const count = hits.length;
  // Rank of each hit's error: the order of early and late hits is kept.
  const order = hits.map((_, index) => index).sort((a, b) => hits[a].error - hits[b].error);
  const quantile = new Array<number>(count);
  order.forEach((index, rank) => (quantile[index] = inverseNormal((rank + 0.5) / count)));

  const presses = new Map<InputKey, FixPress[]>();
  for (const [key, list] of Object.entries(options.presses) as [InputKey, FixPress[]][])
    presses.set(
      key,
      [...list].sort((a, b) => a.startTime - b.startTime),
    );
  const anchors = [...options.anchors].sort((a, b) => a.time - b.time);
  const moved = new Map<number, number>();

  const moves: FixMove[] = [];
  const errors: number[] = [];
  let blocked = 0;
  const blockedBy: Partial<Record<BlockReason, number>> = {};
  const seed = options.seed ?? 727;

  for (let index = 0; index < count; index++) {
    const hit = hits[index];
    const error = hit.error;
    const jitter = 0.15 * noise(seed, hit.objectIndex);
    const outside = Math.abs(error) >= windows.great;
    const closeCall = !outside && Math.abs(error) >= windows.great * options.closeCallFrom;
    // Close calls aim at a slightly tighter spread than the rest, so they really come in a bit.
    const natural = centre + (closeCall ? closeSpread : spread) * (quantile[index] + jitter);
    // Only ever move toward the centre.
    const inward = Math.abs(natural - centre) < Math.abs(error - centre) && Math.abs(natural) < Math.abs(error);
    let wanted = error;
    if (inward && outside && moveOutside) wanted = natural;
    // Tightening the spread moves every hit part of the way to its place in the narrower normal
    // curve: moving only the tails would leave a flat-topped distribution no player produces. A
    // share of the player's own shape is kept.
    else if (inward && moveOutside)
      wanted = error + (natural - error) * Math.max(TIGHTEN_SHARE, closeCall ? options.closeCallPull : 0);
    else if (inward && closeCall) wanted = error + (natural - error) * options.closeCallPull;

    // Press times are whole milliseconds: the shift is rounded, the error follows from it.
    let shift: number | null = null;
    let reason: BlockReason | null = null;
    for (const share of [1, 0.75, 0.5, 0.25]) {
      const candidate = Math.round((wanted - error) * share);
      if (candidate === 0) break;
      // Rounding to whole milliseconds must not leave the hit just as far out on the other side.
      if (Math.abs(error + candidate) >= Math.abs(error)) continue;
      reason = blockReason(hit, candidate, options, presses, anchors, moved);
      if (!reason) {
        shift = candidate;
        break;
      }
    }
    if (wanted === error) {
      errors.push(error);
      continue;
    }
    if (shift === null) {
      blocked++;
      if (reason) blockedBy[reason] = (blockedBy[reason] ?? 0) + 1;
      errors.push(error);
      continue;
    }
    const placed = error + shift;
    const to: FixPress = {
      key: hit.press.key,
      startTime: hit.press.startTime + shift,
      // A circle's whole press moves; a slider keeps holding until it did, so only the press start moves.
      endTime: hit.kind === 'circle' ? hit.press.endTime + shift : hit.press.endTime,
    };
    const list = presses.get(hit.press.key) ?? [];
    const position = list.findIndex(
      (item) => item.startTime === hit.press.startTime && item.endTime === hit.press.endTime,
    );
    if (position >= 0) list[position] = to;
    moved.set(hit.objectIndex, hit.objectTime + placed);
    moves.push({ objectIndex: hit.objectIndex, from: hit.press, to, errorBefore: error, errorAfter: placed });
    errors.push(placed);
  }
  return { moves, errors, blocked, blockedBy };
}

// Why the press cannot move by `shift`, or null when it can.
function blockReason(
  hit: FixHit,
  shift: number,
  options: FixOptions,
  presses: Map<InputKey, FixPress[]>,
  anchors: { objectIndex: number; time: number }[],
  moved: Map<number, number>,
): BlockReason | null {
  const start = hit.press.startTime + shift;
  const end = hit.kind === 'circle' ? hit.press.endTime + shift : hit.press.endTime;
  if (end - start < 1) return 'window';
  // Still a hit, with the cursor inside the circle by the required margin.
  if (Math.abs(start - hit.objectTime) >= options.windows.meh) return 'window';
  const cursor = options.cursorAt(start);
  if (!cursor || Math.hypot(cursor.x - hit.center.x, cursor.y - hit.center.y) > options.radius - options.leewayPx)
    return 'cursor';
  // No collision with another press of the same key, or of the mouse button sharing its bit
  // (M1 with K1, M2 with K2).
  for (const key of SHARED_KEYS[hit.press.key])
    for (const other of presses.get(key) ?? []) {
      if (key === hit.press.key && other.startTime === hit.press.startTime && other.endTime === hit.press.endTime)
        continue;
      if (start <= other.endTime && end >= other.startTime) return 'press';
    }
  // Between the neighbouring objects' hits, so the press still judges this object.
  const before = anchors.filter((item) => item.objectIndex < hit.objectIndex).at(-1);
  const after = anchors.find((item) => item.objectIndex > hit.objectIndex);
  const beforeTime = before ? (moved.get(before.objectIndex) ?? before.time) : -Infinity;
  if (start <= beforeTime || (after && start >= after.time)) return 'order';
  return null;
}

export function planTimingFix(input: FixHit[], options: FixOptions): FixPlan {
  const hits = [...input].sort((a, b) => a.objectTime - b.objectTime);
  const errorsBefore = hits.map((hit) => hit.error);
  const before = fixStats(errorsBefore, options.windows);
  const empty = {
    moves: [],
    before,
    after: before,
    blocked: 0,
    blockedBy: {},
    errorsBefore,
    errorsAfter: errorsBefore,
  };
  if (hits.length < 8) return empty;

  // The player's own centre and spread: median and MAD, so a few far misses do not skew them.
  const inside = errorsBefore.filter((error) => Math.abs(error) < options.windows.great);
  const centre = median(inside.length ? inside : errorsBefore);
  const playerSpread = Math.max(1, 1.4826 * median(errorsBefore.map((error) => Math.abs(error - centre))));

  const outsideCount = (result: Draft) => {
    const stats = fixStats(result.errors, options.windows);
    return stats.ok + stats.meh;
  };
  const target = Math.max(0, Math.round(options.target100s));

  // The widest spread that brings the 100s down to the target: tightening stops as soon as it is
  // enough. A target at or above the current count only pulls close calls.
  const tightest = Math.max(0.5, playerSpread * 0.2);
  const run = (spread: number, moveOutside: boolean) =>
    draft(hits, options, spread, Math.min(spread, playerSpread * 0.85), centre, moveOutside);
  let best = run(playerSpread, false);
  if (outsideCount(best) > target) {
    best = run(playerSpread, true);
    if (outsideCount(best) > target) {
      let low = tightest;
      let high = playerSpread;
      let found: Draft | null = null;
      for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2;
        const result = run(middle, true);
        if (outsideCount(result) > target) high = middle;
        else {
          low = middle;
          found = result;
        }
      }
      // Even the tightest spread could not reach the target (no room to move): use the tightest.
      best = found ?? run(tightest, true);
    }
  }

  return {
    moves: best.moves,
    before,
    after: fixStats(best.errors, options.windows),
    blocked: best.blocked,
    blockedBy: best.blockedBy,
    errorsBefore,
    errorsAfter: best.errors,
  };
}
