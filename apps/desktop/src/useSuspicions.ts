import { useMemo } from 'react';
import { useEditorStore } from './stores/editor';
import { analyseSuspicion, type Suspicion } from './suspicion';

const NONE: Suspicion[] = [];
// One analysis shared by the Explorer and the timeline, keyed on its exact inputs.
let cached: { inputs: unknown[]; result: Suspicion[] } | null = null;

/// What identifies a finding in the project's ignore list. It names the replay and the exact
/// stretch, so editing that stretch (which changes the finding) brings it back.
export const suspicionKey = (trackId: string, item: Suspicion) =>
  `${trackId}:${item.kind}:${item.startMs}:${item.endMs}`;

/// Suspicious stretches of the previewed replay, split into the ones still shown and the ones the
/// user ignored. Hit timing is only checked once a simulation exists. During a brush stroke or
/// node drag the last result stands; it catches up afterwards.
export function useSuspicionReport(): { trackId: string | null; shown: Suspicion[]; ignored: Suspicion[] } {
  const trackId = useEditorStore((state) => state.previewTrackId);
  const replay = useEditorStore(
    (state) => state.tracks.find((item) => item.id === state.previewTrackId)?.replay ?? null,
  );
  const judgements = useEditorStore((state) => {
    const simulation = state.previewTrackId ? state.simulationByTrack[state.previewTrackId] : undefined;
    // An outdated simulation's hit errors no longer describe the edited replay.
    return simulation?.result && !simulation.stale ? simulation.result.judgements : null;
  });
  const liveEdit = useEditorStore((state) => state.liveEdit);
  const ignoredKeys = useEditorStore((state) => state.ignoredSuspicions);
  const all = useMemo(() => {
    if (liveEdit && cached) return cached.result;
    const inputs = [replay, judgements];
    if (cached && cached.inputs.every((input, index) => input === inputs[index])) return cached.result;
    const result = replay ? analyseSuspicion({ frames: replay.frames, keyEvents: replay.keyEvents, judgements }) : NONE;
    cached = { inputs, result };
    return result;
  }, [replay, judgements, liveEdit]);
  return useMemo(() => {
    if (!trackId || !ignoredKeys.length) return { trackId, shown: all, ignored: NONE };
    const keys = new Set(ignoredKeys);
    const shown: Suspicion[] = [];
    const ignored: Suspicion[] = [];
    for (const item of all) (keys.has(suspicionKey(trackId, item)) ? ignored : shown).push(item);
    return { trackId, shown, ignored };
  }, [all, ignoredKeys, trackId]);
}

/// The stretches still shown (not ignored), for the timeline marks and the tab count.
export function useSuspicions(): Suspicion[] {
  return useSuspicionReport().shown;
}
