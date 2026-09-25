import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoTip } from '../InfoTip';
import { Check } from 'lucide-react';

export type OptionTile = {
  id: string;
  label: string;
  preview: ReactNode;
  checked: boolean;
  onToggle: (checked: boolean) => void;
};

const MIN_WIDTH = 240;
const MIN_HEIGHT = 170;

function readSize(storageKey: string): { width: number; height: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
      width?: unknown;
      height?: unknown;
    } | null;
    if (saved && typeof saved.width === 'number' && typeof saved.height === 'number')
      return { width: Math.max(MIN_WIDTH, saved.width), height: Math.max(MIN_HEIGHT, saved.height) };
  } catch {
    /* unreadable preference falls back to the default size */
  }
  return null;
}

export function OptionTilesPopover({
  icon,
  label,
  title,
  description,
  storageKey,
  tiles,
  active,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  storageKey: string;
  tiles: OptionTile[];
  active?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const hoveredRef = useRef(false);
  const [size, setSize] = useState(() => readSize(storageKey) ?? { width: 340, height: 300 });
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const open = () => {
    hoveredRef.current = true;
    cancelClose();
    if (position) return;
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    // Rendered in a fixed-position portal so the playfield's overflow can't clip it.
    const saved = readSize(storageKey) ?? size;
    setSize(saved);
    const fitsRight = box.right + 8 + saved.width <= window.innerWidth - 8;
    setPosition({
      left: fitsRight ? box.right + 8 : Math.max(8, box.left - saved.width - 8),
      top: Math.max(8, Math.min(box.top, window.innerHeight - saved.height - 8)),
    });
  };
  const scheduleClose = () => {
    hoveredRef.current = false;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (!pinnedRef.current && !hoveredRef.current) setPosition(null);
    }, 140);
  };

  useEffect(() => cancelClose, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>, edges: { x: boolean; y: boolean }) => {
    if (event.button !== 0 || !position) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    pinnedRef.current = true;
    const start = { x: event.clientX, y: event.clientY, ...size };
    let latest = size;
    const move = (moveEvent: PointerEvent) => {
      latest = {
        width: edges.x
          ? Math.round(
              Math.max(
                MIN_WIDTH,
                Math.min(window.innerWidth - position.left - 8, start.width + moveEvent.clientX - start.x),
              ),
            )
          : start.width,
        height: edges.y
          ? Math.round(
              Math.max(
                MIN_HEIGHT,
                Math.min(window.innerHeight - position.top - 8, start.height + moveEvent.clientY - start.y),
              ),
            )
          : start.height,
      };
      setSize(latest);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      pinnedRef.current = false;
      try {
        localStorage.setItem(storageKey, JSON.stringify(latest));
      } catch {
        /* storage unavailable: size just won't persist */
      }
      if (!hoveredRef.current) scheduleClose();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  return (
    <div className="quickbar-popover-host" onPointerEnter={open} onPointerLeave={scheduleClose}>
      <button ref={buttonRef} className={active ? 'active' : ''} title={label} aria-label={label}>
        {icon}
      </button>
      {position &&
        createPortal(
          <div
            ref={panelRef}
            className="premiere-popover option-tiles-popover"
            style={{ left: position.left, top: position.top, width: size.width, height: size.height }}
            onPointerEnter={open}
            onPointerLeave={scheduleClose}
          >
            <div
              className="option-tiles-resize edge-x"
              onPointerDown={(event) => startResize(event, { x: true, y: false })}
            />
            <div
              className="option-tiles-resize edge-y"
              onPointerDown={(event) => startResize(event, { x: false, y: true })}
            />
            <div
              className="option-tiles-resize corner"
              title="Drag to resize"
              onPointerDown={(event) => startResize(event, { x: true, y: true })}
            />
            <div className="option-tiles-body">
              <strong className="popover-title">
                {title}
                <InfoTip text={description} />
              </strong>
              <div className="option-tiles">
                {tiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    className={`option-tile${tile.checked ? ' checked' : ''}`}
                    aria-pressed={tile.checked}
                    title={tile.label}
                    onClick={() => tile.onToggle(!tile.checked)}
                  >
                    <span className="option-tile-preview" aria-hidden="true">
                      {tile.preview}
                    </span>
                    <span className="option-tile-label">
                      <span className="option-tile-check">{tile.checked && <Check size={10} strokeWidth={3} />}</span>
                      {tile.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
