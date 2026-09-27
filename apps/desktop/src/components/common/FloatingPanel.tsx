import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { PanelBottomClose, SquareArrowOutUpRight, X } from 'lucide-react';
import { panelLabels, useLayoutStore, type FloatablePanelId, type FloatingRect } from '../../stores/layout';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const TITLE_HEIGHT = 26;

let topZ = 100;

function clampRect(rect: FloatingRect): FloatingRect {
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth - 16));
  const height = Math.max(MIN_HEIGHT, Math.min(rect.height, window.innerHeight - 16));
  return {
    width,
    height,
    // Keep the title bar reachable: never fully off-screen.
    x: Math.max(-width + 80, Math.min(rect.x, window.innerWidth - 80)),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - TITLE_HEIGHT)),
  };
}

// Header button that pops a docked panel out into a floating window, or docks it back.
export function PanelPopOutButton({ panel, className = '' }: { panel: FloatablePanelId; className?: string }) {
  const floating = useLayoutStore((state) => !!state.floatingPanels[panel]);
  const popOutPanel = useLayoutStore((state) => state.popOutPanel);
  const dockPanel = useLayoutStore((state) => state.dockPanel);
  return (
    <button
      type="button"
      className={`panel-close panel-popout ${className}`}
      title={floating ? `Dock ${panelLabels[panel]} back into the layout` : `Pop out ${panelLabels[panel]}`}
      aria-label={floating ? `Dock ${panelLabels[panel]}` : `Pop out ${panelLabels[panel]}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (floating) {
          dockPanel(panel);
          return;
        }
        const box = (event.currentTarget.closest('.panel, section') as HTMLElement | null)?.getBoundingClientRect();
        popOutPanel(
          panel,
          clampRect({
            x: (box?.x ?? 120) + 24,
            y: (box?.y ?? 120) + 24,
            width: box?.width ?? 360,
            height: (box?.height ?? 320) + TITLE_HEIGHT,
          }),
        );
      }}
    >
      {floating ? <PanelBottomClose size={12} /> : <SquareArrowOutUpRight size={12} />}
    </button>
  );
}

// A popped-out panel: a window over the workspace that can be moved by its title bar and resized
// from its edges; the rect is remembered.
export function FloatingPanel({ panel, children }: { panel: FloatablePanelId; children: ReactNode }) {
  const rect = useLayoutStore((state) => state.floatingPanels[panel]);
  const setFloatingRect = useLayoutStore((state) => state.setFloatingRect);
  const dockPanel = useLayoutStore((state) => state.dockPanel);
  const setPanelVisible = useLayoutStore((state) => state.setPanelVisible);
  const [draft, setDraft] = useState<FloatingRect | null>(null);
  const [z, setZ] = useState(() => ++topZ);
  const draftRef = useRef<FloatingRect | null>(null);

  useEffect(() => {
    const keepOnScreen = () => {
      const current = useLayoutStore.getState().floatingPanels[panel];
      if (current) setFloatingRect(panel, clampRect(current));
    };
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
  }, [panel, setFloatingRect]);

  if (!rect) return null;
  const shown = draft ?? rect;

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    apply: (start: FloatingRect, dx: number, dy: number) => FloatingRect,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = rect;
    document.body.classList.add('resizing');
    const move = (moveEvent: PointerEvent) => {
      draftRef.current = clampRect(apply(start, moveEvent.clientX - startX, moveEvent.clientY - startY));
      setDraft(draftRef.current);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.body.classList.remove('resizing');
      if (draftRef.current) setFloatingRect(panel, draftRef.current);
      draftRef.current = null;
      setDraft(null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const resize =
    (edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }) =>
    (event: ReactPointerEvent<HTMLElement>) =>
      beginGesture(event, (start, dx, dy) => {
        let { x, y, width, height } = start;
        if (edges.right) width = start.width + dx;
        if (edges.bottom) height = start.height + dy;
        if (edges.left) {
          width = Math.max(MIN_WIDTH, start.width - dx);
          x = start.x + start.width - width;
        }
        if (edges.top) {
          height = Math.max(MIN_HEIGHT, start.height - dy);
          y = start.y + start.height - height;
        }
        return { x, y, width, height };
      });

  return (
    <div
      className="floating-panel"
      style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height, zIndex: z }}
      onPointerDownCapture={() => setZ(++topZ)}
    >
      <div
        className="floating-panel-title"
        onPointerDown={(event) =>
          beginGesture(event, (start, dx, dy) => ({ ...start, x: start.x + dx, y: start.y + dy }))
        }
        onDoubleClick={() => dockPanel(panel)}
      >
        <span>{panelLabels[panel]}</span>
        <button
          type="button"
          className="panel-close"
          title="Dock back into the layout (or double-click the title)"
          aria-label={`Dock ${panelLabels[panel]}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => dockPanel(panel)}
        >
          <PanelBottomClose size={12} />
        </button>
        <button
          type="button"
          className="panel-close floating-panel-close"
          title={`Close ${panelLabels[panel]} (reopen from Window)`}
          aria-label={`Close ${panelLabels[panel]}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setPanelVisible(panel, false)}
        >
          <X size={12} />
        </button>
      </div>
      <div className="floating-panel-body">{children}</div>
      <div className="floating-resize edge-right" onPointerDown={resize({ right: true })} />
      <div className="floating-resize edge-bottom" onPointerDown={resize({ bottom: true })} />
      <div className="floating-resize edge-left" onPointerDown={resize({ left: true })} />
      <div className="floating-resize corner" onPointerDown={resize({ right: true, bottom: true })} />
    </div>
  );
}
