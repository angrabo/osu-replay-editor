import { useEditorStore, type EditorState } from './stores/editor';

export type JumpTarget = 'object' | 'miss' | '100' | '50' | 'combo-break' | 'marker';

const targetLabel: Record<JumpTarget, string> = {
  object: 'hit objects',
  miss: 'misses',
  '100': '100s',
  '50': '50s',
  'combo-break': 'combo breaks',
  marker: 'markers',
};

/// Where the combo was lost: an object whose judgement left the combo lower than before (or a
/// miss while holding combo), and sliders broken by a missed tick or repeat. A missed slider end
/// alone does not break combo on stable or lazer, so it is not listed.
function comboBreaks(state: EditorState): { index: number; time: number }[] | null {
  const result = state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null;
  const breaks = new Map<number, number>();
  for (const item of state.sliderBreaks) {
    const object = state.beatmapObjects[item.objectIndex];
    if (!object) continue;
    const tail = object.endTime - Math.min(36, (object.endTime - object.startTime) / 2);
    const firstTick = item.missedChecks.find((time) => Math.abs(time - tail) > 0.5);
    if (firstTick !== undefined) breaks.set(item.objectIndex, firstTick);
  }
  if (result) {
    let previous = 0;
    for (const judgement of [...result.judgements].sort((a, b) => a.objectIndex - b.objectIndex)) {
      const lost = judgement.comboAfter < previous || (judgement.result === 'miss' && previous > 0);
      if (lost && !breaks.has(judgement.objectIndex)) breaks.set(judgement.objectIndex, judgement.startTime);
      previous = judgement.comboAfter;
    }
  } else if (!breaks.size) return null;
  return [...breaks].map(([index, time]) => ({ index, time }));
}

/// Moves the playhead to the next (direction 1) or previous (-1) hit object, judgement of a given
/// result, combo break, or timeline marker, relative to the current playhead. Objects are also
/// selected so the playfield and timeline highlight them.
export function jumpTo(target: JumpTarget, direction: 1 | -1): void {
  const state = useEditorStore.getState();
  const now = state.playheadMs;
  const ahead = (time: number) => (direction > 0 ? time > now + 0.5 : time < now - 0.5);
  const nearest = <T>(items: readonly T[], time: (item: T) => number): T | null =>
    items
      .filter((item) => ahead(time(item)))
      .reduce<T | null>(
        (best, item) =>
          best === null || (direction > 0 ? time(item) < time(best) : time(item) > time(best)) ? item : best,
        null,
      );
  const notify = (message: string) => useEditorStore.setState({ lastEditMessage: message });

  if (target === 'marker') {
    const marker = nearest(state.markers, (item) => item.timeMs);
    if (!marker) return notify(`No more ${targetLabel.marker} ${direction > 0 ? 'ahead' : 'behind'}.`);
    state.setPlaying(false);
    state.setPlayhead(marker.timeMs);
    state.requestTimelineFocus();
    return;
  }

  let candidates: { index: number; time: number }[];
  if (target === 'object') {
    candidates = state.beatmapObjects.map((object, index) => ({ index, time: object.startTime }));
  } else if (target === 'combo-break') {
    const breaks = comboBreaks(state);
    if (!breaks) return notify('Run the simulation to jump between combo breaks.');
    candidates = breaks;
  } else {
    const result = state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null;
    if (!result) return notify('Run the simulation to jump between judgements.');
    candidates = result.judgements
      .filter((judgement) => judgement.result === target)
      .map((judgement) => ({ index: judgement.objectIndex, time: judgement.startTime }));
  }
  const next = nearest(candidates, (item) => item.time);
  if (!next) return notify(`No more ${targetLabel[target]} ${direction > 0 ? 'ahead' : 'behind'}.`);
  state.setPlaying(false);
  state.selectBeatmapObject(next.index);
  state.setPlayhead(next.time);
  state.requestTimelineFocus();
}
