import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { InputSelection, Track } from '../stores/editor';

export type TimelineInputItem = {
  original: InputSelection;
  preview: InputSelection;
  track: Track;
  keyIndex: number;
  color: string;
  left: number;
  width: number;
  top: number;
  height: number;
  opacity: number;
  zIndex: number;
};

export function TimelineInputNode({
  item,
  selected,
  interactive,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onContextMenu,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onBeginHandleDrag,
}: {
  item: TimelineInputItem;
  selected: boolean;
  interactive: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onContextMenu: () => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginHandleDrag: (event: ReactPointerEvent<HTMLSpanElement>, mode: 'start' | 'end') => void;
}) {
  return (
    <div
      className={`timeline-input-edit${selected ? ' selected' : ''}${item.track.locked ? ' locked' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${item.original.key} input from ${item.original.startTime} to ${item.original.endTime} milliseconds${item.track.locked ? ', locked' : ''}`}
      data-track-id={item.original.trackId}
      data-input-key={item.original.key}
      data-start-time={item.original.startTime}
      data-end-time={item.original.endTime}
      style={
        {
          left: item.left,
          top: item.top,
          width: item.width,
          height: item.height,
          opacity: item.opacity,
          zIndex: item.zIndex,
          pointerEvents: interactive ? 'auto' : 'none',
          '--input-color': item.color,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onContextMenu={onContextMenu}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
    >
      {item.width >= item.track.name.length * 6 + 12 && item.height >= 10 && (
        <span className="input-key-label">{item.track.name}</span>
      )}
      {!item.track.locked && (
        <>
          <span
            className="input-handle left"
            onPointerDown={(event) => {
              if (!event.altKey) onBeginHandleDrag(event, 'start');
            }}
            onLostPointerCapture={onLostPointerCapture}
          />
          <span
            className="input-handle right"
            onPointerDown={(event) => {
              if (!event.altKey) onBeginHandleDrag(event, 'end');
            }}
            onLostPointerCapture={onLostPointerCapture}
          />
        </>
      )}
    </div>
  );
}
