import { createPortal } from 'react-dom';
import { formatTime, type InputDragMode, type InputKey } from '../stores/editor';

export type TimelineContextMenuState = { x: number; y: number; timeMs: number; maxHeight: number };

export function TimelineContextMenu({
  menu,
  onClose,
  hasSelection,
  onCopy,
  canPaste,
  onPasteAtTime,
  onPasteInPlace,
  inputKeys,
  onAddInput,
  canDeleteSelected,
  onDeleteSelected,
  inputDragMode,
  onSetInputDragMode,
}: {
  menu: TimelineContextMenuState;
  onClose: () => void;
  hasSelection: boolean;
  onCopy: () => void;
  canPaste: boolean;
  onPasteAtTime: (timeMs: number) => void;
  onPasteInPlace: () => void;
  inputKeys: readonly InputKey[];
  onAddInput: (key: InputKey, timeMs: number) => void;
  canDeleteSelected: boolean;
  onDeleteSelected: () => void;
  inputDragMode: InputDragMode;
  onSetInputDragMode: (mode: InputDragMode) => void;
}) {
  return createPortal(
    <div
      className="timeline-context-menu timeline-context-menu-portal"
      style={{ left: menu.x, top: menu.y, maxHeight: menu.maxHeight, overflowY: 'auto' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="context-time">{formatTime(menu.timeMs)}</div>
      <button
        disabled={!hasSelection}
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        Copy selection
      </button>
      <button
        disabled={!canPaste}
        onClick={() => {
          onPasteAtTime(menu.timeMs);
          onClose();
        }}
      >
        Paste at clicked time
      </button>
      <button
        disabled={!canPaste}
        onClick={() => {
          onPasteInPlace();
          onClose();
        }}
      >
        Paste in place
      </button>
      <div className="context-separator" />
      {inputKeys.map((key) => (
        <button
          key={key}
          onClick={() => {
            onAddInput(key, menu.timeMs);
            onClose();
          }}
        >
          Add {key} (17 ms)
        </button>
      ))}
      <div className="context-separator" />
      <button
        disabled={!canDeleteSelected}
        onClick={() => {
          onDeleteSelected();
          onClose();
        }}
      >
        Delete selected input
      </button>
      <div className="context-separator" />
      <button className={inputDragMode === 'free' ? 'active' : ''} onClick={() => onSetInputDragMode('free')}>
        Drag: free (1 ms)
      </button>
      <button className={inputDragMode === 'frame' ? 'active' : ''} onClick={() => onSetInputDragMode('frame')}>
        Drag: replay frames
      </button>
    </div>,
    document.body,
  );
}
