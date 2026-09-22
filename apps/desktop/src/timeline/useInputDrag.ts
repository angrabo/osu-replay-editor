import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { nearestReplayFrameTime, type InputDragMode, type InputSelection, type Track } from '../stores/editor';

function sameInput(first: InputSelection | null, second: InputSelection): boolean {
  return (
    !!first &&
    first.trackId === second.trackId &&
    first.key === second.key &&
    first.startTime === second.startTime &&
    first.endTime === second.endTime
  );
}

export type InputDragTooltip = { x: number; y: number; mode: 'move' | 'start' | 'end'; precision: boolean };

/// <summary>
/// Owns the drag-to-move/resize state machine for an input block on the timeline: which input
/// is being dragged, its live preview position, and the drag tooltip. Commits the edit to the
/// store once the drag ends.
/// </summary>
export function useInputDrag(params: {
  tracks: Track[];
  inputDragMode: InputDragMode;
  selectedInputs: InputSelection[];
  pixelsPerSecond: number;
  selectInput: (input: InputSelection | null, additive?: boolean) => void;
  setPreviewTrack: (trackId: string) => void;
  setInputEditPreview: (preview: { original: InputSelection; next: InputSelection }[] | null) => void;
  commitInputEdit: (original: InputSelection | null, next: InputSelection | null) => void;
  commitInputEdits: (edits: { original: InputSelection | null; next: InputSelection | null }[]) => void;
  onDragStart: () => void;
}) {
  const {
    tracks,
    inputDragMode,
    selectedInputs,
    pixelsPerSecond,
    selectInput,
    setPreviewTrack,
    setInputEditPreview,
    commitInputEdit,
    commitInputEdits,
    onDragStart,
  } = params;
  const inputDragRef = useRef<{
    pointerId: number;
    lastX: number;
    deltaMs: number;
    original: InputSelection;
    originals: InputSelection[];
    mode: 'move' | 'start' | 'end';
  } | null>(null);
  const inputPreviewRef = useRef<InputSelection | null>(null);
  const [inputPreview, setInputPreview] = useState<InputSelection | null>(null);
  const [inputDragTooltip, setInputDragTooltip] = useState<InputDragTooltip | null>(null);

  const beginInputDrag = (
    event: ReactPointerEvent<HTMLElement>,
    input: InputSelection,
    mode: 'move' | 'start' | 'end',
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const alreadySelected = selectedInputs.some((item) => sameInput(item, input));
    const originals = mode === 'move' && alreadySelected ? selectedInputs : [input];
    if (!alreadySelected || mode !== 'move') selectInput(input);
    setPreviewTrack(input.trackId);
    onDragStart();
    inputDragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      deltaMs: 0,
      original: input,
      originals,
      mode,
    };
    setInputEditPreview(null);
    inputPreviewRef.current = input;
    setInputPreview(input);
    const area = event.currentTarget.closest<HTMLElement>('.timeline-draw-area');
    const box = area?.getBoundingClientRect();
    if (box)
      setInputDragTooltip({
        x: Math.max(6, Math.min(box.width - 216, event.clientX - box.left + 12)),
        y: Math.max(4, event.clientY - box.top - 86),
        mode,
        precision: event.ctrlKey,
      });
  };

  const moveInputDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = inputDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const track = tracks.find((item) => item.id === drag.original.trackId);
    if (!track) return;
    drag.deltaMs += ((event.clientX - drag.lastX) * 1000) / pixelsPerSecond / (event.ctrlKey ? 10 : 1);
    drag.lastX = event.clientX;
    const rawDelta = Math.round(drag.deltaMs);
    let next = { ...drag.original };
    if (drag.mode === 'move') {
      let startTime = drag.original.startTime + rawDelta;
      if (inputDragMode === 'frame') startTime = nearestReplayFrameTime(track.replay.frames, startTime);
      const delta = startTime - drag.original.startTime;
      next = { ...next, startTime, endTime: drag.original.endTime + delta };
    } else if (drag.mode === 'start') {
      let startTime = drag.original.startTime + rawDelta;
      if (inputDragMode === 'frame') startTime = nearestReplayFrameTime(track.replay.frames, startTime);
      next.startTime = Math.min(next.endTime - 1, startTime);
    } else {
      let endTime = drag.original.endTime + rawDelta;
      if (inputDragMode === 'frame') endTime = nearestReplayFrameTime(track.replay.frames, endTime);
      next.endTime = Math.max(next.startTime + 1, endTime);
    }
    inputPreviewRef.current = next;
    setInputPreview(next);
    const delta = next.startTime - drag.original.startTime;
    setInputEditPreview(
      drag.mode === 'move' && drag.originals.length > 1
        ? drag.originals.map((original) => ({
            original,
            next: { ...original, startTime: original.startTime + delta, endTime: original.endTime + delta },
          }))
        : [{ original: drag.original, next }],
    );
    const area = event.currentTarget.closest<HTMLElement>('.timeline-draw-area');
    const box = area?.getBoundingClientRect();
    if (box)
      setInputDragTooltip({
        x: Math.max(6, Math.min(box.width - 216, event.clientX - box.left + 12)),
        y: Math.max(4, event.clientY - box.top - 86),
        mode: drag.mode,
        precision: event.ctrlKey,
      });
  };

  const finishInputDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const drag = inputDragRef.current;
    const preview = inputPreviewRef.current;
    inputDragRef.current = null;
    inputPreviewRef.current = null;
    setInputPreview(null);
    setInputDragTooltip(null);
    setInputEditPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag && preview && !sameInput(preview, drag.original)) {
      const delta = preview.startTime - drag.original.startTime;
      if (drag.mode === 'move' && drag.originals.length > 1)
        commitInputEdits(
          drag.originals.map((original) => ({
            original,
            next: { ...original, startTime: original.startTime + delta, endTime: original.endTime + delta },
          })),
        );
      else commitInputEdit(drag.original, preview);
    }
  };

  return { inputDragRef, inputPreview, inputDragTooltip, beginInputDrag, moveInputDrag, finishInputDrag };
}
