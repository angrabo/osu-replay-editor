import { useMemo } from 'react';
import { formatTime, useEditorStore, type SimulationResult } from './stores/editor';

/// Values a text widget can show, as of the playhead.
export type LiveValues = Record<string, string>;

/// Whether the replay's simulation is from before its latest edit (or re-running).
export function useSimulationStale(trackId: string | null | undefined): boolean {
  return useEditorStore((state) => {
    const simulation = trackId ? state.simulationByTrack[trackId] : undefined;
    return !!simulation?.result && (!!simulation.stale || simulation.status === 'running');
  });
}

export const LIVE_VARIABLES: { name: string; description: string }[] = [
  { name: 'score', description: 'Score so far' },
  { name: 'combo', description: 'Current combo' },
  { name: 'maxcombo', description: 'Highest combo so far' },
  { name: 'acc', description: 'Accuracy so far' },
  { name: '300', description: '300 count' },
  { name: '100', description: '100 count' },
  { name: '50', description: '50 count' },
  { name: 'miss', description: 'Miss count' },
  { name: 'ur', description: 'Unstable rate so far' },
  { name: 'time', description: 'Playhead time' },
  { name: 'player', description: 'Player name' },
  { name: 'mods', description: 'Mods' },
];

type Step = {
  at: number;
  score: number;
  combo: number;
  maxCombo: number;
  counts: [number, number, number, number];
  errorSum: number;
  errorSquares: number;
  errorCount: number;
};

/// When each object's judgement lands: circles at the press (or the end of their window), sliders
/// and spinners at their end. Running totals are kept per judgement so any playhead is one lookup.
function buildSteps(result: SimulationResult): Step[] {
  const ordered = [...result.judgements]
    .map((judgement) => ({
      judgement,
      at: judgement.kind === 'circle' ? (judgement.hitTime ?? judgement.startTime) : judgement.endTime,
    }))
    .sort((a, b) => a.at - b.at);
  const steps: Step[] = [];
  let maxCombo = 0;
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  let errorSum = 0;
  let errorSquares = 0;
  let errorCount = 0;
  for (const { judgement, at } of ordered) {
    maxCombo = Math.max(maxCombo, judgement.comboAfter);
    counts[judgement.result === '300' ? 0 : judgement.result === '100' ? 1 : judgement.result === '50' ? 2 : 3]++;
    if (judgement.hitError != null) {
      errorSum += judgement.hitError;
      errorSquares += judgement.hitError * judgement.hitError;
      errorCount++;
    }
    steps.push({
      at,
      score: judgement.scoreAfter,
      combo: judgement.comboAfter,
      maxCombo,
      counts: [...counts] as Step['counts'],
      errorSum,
      errorSquares,
      errorCount,
    });
  }
  return steps;
}

const modNames: [number, string][] = [
  [1, 'NF'],
  [2, 'EZ'],
  [8, 'HD'],
  [16, 'HR'],
  [32, 'SD'],
  [64, 'DT'],
  [256, 'HT'],
  [512, 'NC'],
  [1024, 'FL'],
  [4096, 'SO'],
  [16384, 'PF'],
];

type LivePoint = { at: number; score: number; combo: number; maxCombo: number };

/// Score and combo after every scoring moment the engine reports, slider ticks included, so the
/// display moves one step at a time. The last point is scaled onto the final score, which may have
/// been calibrated to the recorded replay.
function buildPoints(result: SimulationResult): LivePoint[] {
  const timeline = result.timeline ?? [];
  const last = timeline.at(-1);
  const ratio = last && last.score > 0 ? result.score / last.score : 1;
  const scale = ratio > 0.8 && ratio < 1.25 ? ratio : 1;
  let maxCombo = 0;
  return timeline.map((point) => {
    maxCombo = Math.max(maxCombo, point.combo);
    return { at: point.time, score: Math.round(point.score * scale), combo: point.combo, maxCombo };
  });
}

function lastAtOrBefore<T extends { at: number }>(items: readonly T[], time: number): T | null {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (items[mid].at <= time) low = mid + 1;
    else high = mid;
  }
  return low > 0 ? items[low - 1] : null;
}

export function useLiveValues(trackId: string | null | undefined): LiveValues {
  const track = useEditorStore((state) => state.tracks.find((item) => item.id === trackId) ?? null);
  const result = useEditorStore((state) => (trackId ? state.simulationByTrack[trackId]?.result : null));
  const playhead = useEditorStore((state) => state.playheadMs);
  const steps = useMemo(() => (result ? buildSteps(result) : []), [result]);
  const points = useMemo(() => (result ? buildPoints(result) : []), [result]);
  return useMemo(() => {
    const step = lastAtOrBefore(steps, playhead);
    // Older results without a timeline fall back to per-object totals.
    const point = points.length ? lastAtOrBefore(points, playhead) : step;
    const counts = step?.counts ?? [0, 0, 0, 0];
    const judged = counts[0] + counts[1] + counts[2] + counts[3];
    const accuracy = judged ? ((counts[0] * 300 + counts[1] * 100 + counts[2] * 50) / (judged * 300)) * 100 : 100;
    const mean = step && step.errorCount ? step.errorSum / step.errorCount : 0;
    const variance = step && step.errorCount ? step.errorSquares / step.errorCount - mean * mean : 0;
    const mods = track?.exportMetadata.mods ?? 0;
    const none = result ? null : '—';
    return {
      score: none ?? (point?.score ?? 0).toLocaleString('en-US'),
      combo: none ?? String(point?.combo ?? 0),
      maxcombo: none ?? String(point?.maxCombo ?? 0),
      acc: none ?? `${accuracy.toFixed(2)}%`,
      '300': none ?? String(counts[0]),
      '100': none ?? String(counts[1]),
      '50': none ?? String(counts[2]),
      miss: none ?? String(counts[3]),
      ur: none ?? (Math.sqrt(Math.max(0, variance)) * 10).toFixed(2),
      time: formatTime(Math.max(0, playhead)),
      player: track?.exportMetadata.playerName ?? '',
      mods:
        modNames
          .filter(([bit]) => mods & bit)
          .filter(([bit]) => !(bit === 64 && mods & 512) && !(bit === 32 && mods & 16384))
          .map(([, name]) => name)
          .join('') || 'NM',
    };
  }, [steps, points, playhead, result, track]);
}
