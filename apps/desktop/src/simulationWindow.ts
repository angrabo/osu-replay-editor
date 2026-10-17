import type { ReplayFrame, SimulationJudgement, SimulationResult } from './stores/editor';

export type TimeRange = { start: number; end: number };

const sameFrame = (a: ReplayFrame, b: ReplayFrame) =>
  a === b || (a.timeMs === b.timeMs && a.x === b.x && a.y === b.y && a.keys === b.keys);

/// The stretch of replay time an edit touched: from the first frame that differs to the last one,
/// comparing from both ends so inserted or removed frames are covered. Null when nothing changed.
export function changedFrameRange(previous: readonly ReplayFrame[], next: readonly ReplayFrame[]): TimeRange | null {
  const shorter = Math.min(previous.length, next.length);
  let head = 0;
  while (head < shorter && sameFrame(previous[head], next[head])) head++;
  if (head === previous.length && head === next.length) return null;
  let tail = 0;
  while (tail < shorter - head && sameFrame(previous[previous.length - 1 - tail], next[next.length - 1 - tail])) tail++;
  const times: number[] = [];
  // The frames either side of the change bound it; the changed frames themselves lie between.
  for (const frames of [previous, next]) {
    const first = frames[Math.min(head, frames.length - 1)];
    const last = frames[Math.max(0, frames.length - 1 - tail)];
    const before = frames[Math.max(0, head - 1)];
    if (first) times.push(first.timeMs);
    if (last) times.push(last.timeMs);
    if (before && head > 0) times.push(before.timeMs);
  }
  return times.length ? { start: Math.min(...times), end: Math.max(...times) } : null;
}

export const unionRange = (a: TimeRange | null, b: TimeRange | null): TimeRange | null =>
  !a ? b : !b ? a : { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };

const counts = (judgements: readonly SimulationJudgement[]) => {
  const total = { '300': 0, '100': 0, '50': 0, miss: 0, value: 0 };
  for (const item of judgements) {
    total[item.result]++;
    total.value += item.result === 'miss' ? 0 : Number(item.result);
  }
  return total;
};

/// A window run laid over the last full result: the window's objects replace the old ones and
/// the hit counts and accuracy shift by the difference. Score and combo stay those of the base
/// result; they need a whole-replay run, which is why the merged result is marked partial.
export function mergeWindowResult(
  base: SimulationResult,
  window: SimulationResult,
  range: TimeRange,
): SimulationResult {
  const inside = (item: SimulationJudgement) => item.startTime >= range.start && item.startTime <= range.end;
  const replaced = base.judgements.filter(inside);
  const added = window.judgements.filter(inside);
  const judgements = [...base.judgements.filter((item) => !inside(item)), ...added].sort(
    (a, b) => a.objectIndex - b.objectIndex,
  );
  const before = counts(replaced);
  const after = counts(added);
  const objects = Math.max(1, base.totalObjects);
  return {
    ...base,
    status: base.status === 'unsupported' ? base.status : 'estimate',
    count300: base.count300 + after['300'] - before['300'],
    count100: base.count100 + after['100'] - before['100'],
    count50: base.count50 + after['50'] - before['50'],
    misses: base.misses + after.miss - before.miss,
    accuracy: Math.max(0, Math.min(100, base.accuracy + ((after.value - before.value) * 100) / (300 * objects))),
    judgements,
    windows: window.windows ?? base.windows,
  };
}
