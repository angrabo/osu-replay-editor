export function advancePlaybackClock(
  timeMs: number,
  deltaMs: number,
  rate: number,
  audioTimeMs: number | null,
  previousAudioTimeMs: number | null,
): number {
  // A playing media element can still have a stalled clock while seeking or buffering.
  if (audioTimeMs !== null && audioTimeMs !== previousAudioTimeMs && audioTimeMs > timeMs) return audioTimeMs;
  return timeMs + Math.min(100, deltaMs) * rate;
}
