import { useRef, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';

/// <summary>
/// Owns the drag-to-resize state machine for a single timeline lane label's resize handle.
/// </summary>
export function useLaneResize(laneHeights: number[], setLaneHeights: Dispatch<SetStateAction<number[]>>) {
  const laneResizeRef = useRef<{ pointerId: number; lane: number; y: number; height: number } | null>(null);

  const beginLaneResize = (lane: number, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    laneResizeRef.current = { pointerId: event.pointerId, lane, y: event.clientY, height: laneHeights[lane] };
  };

  const moveLaneResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const resize = laneResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const height = Math.max(20, Math.min(140, resize.height + event.clientY - resize.y));
    setLaneHeights((current) => current.map((value, index) => (index === resize.lane ? Math.round(height) : value)));
  };

  const finishLaneResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    laneResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return { beginLaneResize, moveLaneResize, finishLaneResize };
}
