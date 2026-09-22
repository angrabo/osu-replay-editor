export type ReplayPoint = { timeMs: number; x: number; y: number; keys: number };

export function replayPointAt(frames: readonly ReplayPoint[], timeMs: number): ReplayPoint | null {
  if (!frames.length || timeMs < frames[0].timeMs) return null;
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  const before = frames[low - 1];
  const after = frames[low];
  if (!after || after.timeMs <= before.timeMs) return { ...before, timeMs };
  const amount = Math.max(0, Math.min(1, (timeMs - before.timeMs) / (after.timeMs - before.timeMs)));
  return {
    timeMs,
    x: before.x + (after.x - before.x) * amount,
    y: before.y + (after.y - before.y) * amount,
    keys: before.keys,
  };
}
