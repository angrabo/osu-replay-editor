import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { GripVertical } from 'lucide-react';
import { PanelCloseButton } from '../components/common/PanelCloseButton';
import { useLayoutStore, type PanelId } from '../stores/layout';

export type SnapAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const anchors: SnapAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export type SnapInsets = { top: number; right: number; bottom: number; left: number };

const GAP = 6;

type Entry = { anchor: SnapAnchor; width: number; height: number; order: number; line: number };
type Rect = { x: number; y: number; width: number; height: number };

// Flow layout of every widget docked on one anchor. Each widget belongs to a line: a row along the
// top/bottom edge (rows grow away from the edge) or a column along the left/right edge. Within a
// line widgets sit side by side and wrap onto an extra line when the pane is too small.
function layoutGroup(
  anchor: SnapAnchor,
  items: readonly { id: string; width: number; height: number; line: number }[],
  parentWidth: number,
  parentHeight: number,
  insets: SnapInsets,
): Map<string, { x: number; y: number }> {
  const [row, column] = anchor.split('-');
  const result = new Map<string, { x: number; y: number }>();
  const lines: { items: (typeof items)[number][]; main: number; cross: number; key: number }[] = [];
  const stacked = row === 'middle';
  const available = stacked ? parentHeight - insets.top - insets.bottom : parentWidth - insets.left - insets.right;
  for (const item of items) {
    const main = stacked ? item.height : item.width;
    const cross = stacked ? item.width : item.height;
    const line = lines.at(-1);
    if (line && line.key === item.line && line.main + GAP + main <= available) {
      line.items.push(item);
      line.main += GAP + main;
      line.cross = Math.max(line.cross, cross);
    } else lines.push({ items: [item], main, cross, key: item.line });
  }
  let crossOffset = 0;
  for (const line of lines) {
    let mainOffset = 0;
    for (const item of line.items) {
      let x: number;
      let y: number;
      if (stacked) {
        y = Math.max(insets.top, (parentHeight - line.main) / 2) + mainOffset;
        x = column === 'left' ? insets.left + crossOffset : parentWidth - insets.right - crossOffset - item.width;
        mainOffset += item.height + GAP;
      } else {
        x =
          column === 'left'
            ? insets.left + mainOffset
            : column === 'right'
              ? parentWidth - insets.right - mainOffset - item.width
              : Math.max(insets.left, (parentWidth - line.main) / 2) + mainOffset;
        y = row === 'top' ? insets.top + crossOffset : parentHeight - insets.bottom - crossOffset - item.height;
        mainOffset += item.width + GAP;
      }
      result.set(item.id, {
        x: Math.max(0, Math.min(x, parentWidth - item.width)),
        y: Math.max(0, Math.min(y, parentHeight - item.height)),
      });
    }
    crossOffset += line.cross + GAP;
  }
  return result;
}

// Where a dropped widget joins a group: inside an existing line (before/after a neighbour), or on a
// new line placed nearer to or further from the edge than the lines it was dropped between.
function dropPlacement(
  anchor: SnapAnchor,
  drop: Rect,
  peers: readonly { order: number; line: number; rect: Rect | undefined }[],
): { line: number; order: number } {
  const [row, column] = anchor.split('-');
  const stacked = row === 'middle';
  const crossStart = (rect: Rect) => (stacked ? rect.x : rect.y);
  const crossSize = (rect: Rect) => (stacked ? rect.width : rect.height);
  const mainCentre = (rect: Rect) => (stacked ? rect.y + rect.height / 2 : rect.x + rect.width / 2);
  // Distance from the docking edge along the cross axis; lines further out have larger values.
  const outward = (value: number) => (stacked ? (column === 'left' ? value : -value) : row === 'top' ? value : -value);
  const dropCross = outward(crossStart(drop) + crossSize(drop) / 2);
  const placed = peers.filter((peer): peer is { order: number; line: number; rect: Rect } => !!peer.rect);
  if (!placed.length) return { line: 0, order: 0 };
  const lineKeys = [...new Set(placed.map((peer) => peer.line))].sort((first, second) => first - second);
  const spans = lineKeys.map((key) => {
    const members = placed.filter((peer) => peer.line === key);
    const edges = members.flatMap((peer) => [
      outward(crossStart(peer.rect)),
      outward(crossStart(peer.rect) + crossSize(peer.rect)),
    ]);
    return { key, members, from: Math.min(...edges), to: Math.max(...edges) };
  });
  const inside = spans.find((span) => dropCross >= span.from && dropCross <= span.to);
  if (inside) {
    const members = inside.members.slice().sort((first, second) => first.order - second.order);
    const reversed = !stacked && column === 'right';
    const dropMain = mainCentre(drop);
    const index = members.findIndex((peer) =>
      reversed ? dropMain > mainCentre(peer.rect) : dropMain < mainCentre(peer.rect),
    );
    const order =
      index === -1
        ? members.at(-1)!.order + 1
        : index === 0
          ? members[0].order - 1
          : (members[index - 1].order + members[index].order) / 2;
    return { line: inside.key, order };
  }
  const beyond = spans.filter((span) => dropCross > span.to);
  if (beyond.length === spans.length) return { line: spans.at(-1)!.key + 1, order: 0 };
  if (!beyond.length) return { line: spans[0].key - 1, order: 0 };
  const inner = beyond.at(-1)!.key;
  const outer = spans[beyond.length].key;
  return { line: (inner + outer) / 2, order: 0 };
}

// Shared by every floating widget of one playfield pane, so widgets parked on the same anchor
// line up next to each other instead of overlapping.
class SnapZone {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = () => this.version;
  set(id: string, entry: Entry) {
    const previous = this.entries.get(id);
    if (
      previous &&
      previous.anchor === entry.anchor &&
      previous.order === entry.order &&
      previous.line === entry.line &&
      Math.abs(previous.width - entry.width) < 0.5 &&
      Math.abs(previous.height - entry.height) < 0.5
    )
      return;
    this.entries.set(id, entry);
    this.notify();
  }
  delete(id: string) {
    this.rects.delete(id);
    if (this.entries.delete(id)) this.notify();
  }
  // Last settled rect of every widget; read when a drop decides where in a group it slots in.
  private rects = new Map<string, Rect>();
  setRect(id: string, rect: Rect) {
    this.rects.set(id, rect);
  }
  rect(id: string) {
    return this.rects.get(id);
  }
  peers(anchor: SnapAnchor) {
    return [...this.entries.entries()]
      .filter(([, entry]) => entry.anchor === anchor)
      .sort(([, first], [, second]) => first.line - second.line || first.order - second.order);
  }
  private notify() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}

const SnapZoneContext = createContext<{ zone: SnapZone; insets: SnapInsets } | null>(null);

export function SnapZoneProvider({ insets, children }: { insets: SnapInsets; children: ReactNode }) {
  const [zone] = useState(() => new SnapZone());
  return <SnapZoneContext.Provider value={{ zone, insets }}>{children}</SnapZoneContext.Provider>;
}

type Stored = { anchor: SnapAnchor; order: number; line: number };

function readStored(storageKey: string, fallback: SnapAnchor, defaultOrder: number): Stored {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = (raw.startsWith('{') ? JSON.parse(raw) : { anchor: raw, order: 0 }) as Partial<Stored>;
      if (parsed.anchor && anchors.includes(parsed.anchor))
        return { anchor: parsed.anchor, order: Number(parsed.order) || 0, line: Number(parsed.line) || 0 };
    }
  } catch {
    /* storage unavailable: use the fallback */
  }
  return { anchor: fallback, order: defaultOrder, line: 0 };
}

// Floating element that can be flung around its pane and settles on the nearest corner or edge
// centre with a springy ease, like chat heads or stream pop-outs.
export function useSnapDrag<T extends HTMLElement>(id: string, fallback: SnapAnchor, defaultOrder = 0) {
  const context = useContext(SnapZoneContext);
  if (!context) throw new Error('useSnapDrag needs a SnapZoneProvider');
  const { zone, insets } = context;
  const storageKey = `osu-replay-editor.anchor.${id}`;
  useSyncExternalStore(zone.subscribe, zone.getVersion);
  const ref = useRef<T>(null);
  const [stored, setStored] = useState<Stored>(() => readStored(storageKey, fallback, defaultOrder));
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const draggingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  const report = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    zone.set(id, {
      anchor: stored.anchor,
      order: stored.order,
      line: stored.line,
      width: element.offsetWidth,
      height: element.offsetHeight,
    });
  }, [zone, id, stored]);

  const anchorPoint = useCallback(() => {
    const element = ref.current;
    const parent = element?.offsetParent as HTMLElement | null;
    if (!element || !parent) return null;
    const peers = zone.peers(stored.anchor).map(([peerId, entry]) => ({ id: peerId, ...entry }));
    if (!peers.some((peer) => peer.id === id))
      peers.push({ id, ...stored, width: element.offsetWidth, height: element.offsetHeight });
    return (
      layoutGroup(stored.anchor, peers, parent.clientWidth, parent.clientHeight, insetsRef.current).get(id) ?? null
    );
  }, [zone, id, stored]);

  const settle = useCallback(() => {
    if (draggingRef.current) return;
    report();
    const point = anchorPoint();
    const element = ref.current;
    if (point && element) zone.setRect(id, { ...point, width: element.offsetWidth, height: element.offsetHeight });
    if (point)
      setPosition((previous) =>
        previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5 ? previous : point,
      );
  }, [report, anchorPoint]);

  // Re-anchor after every render: sizes change with content (tool switch) and peers move.
  useLayoutEffect(settle);

  const mounted = ref.current !== null;
  useEffect(() => {
    const element = ref.current;
    const parent = element?.offsetParent as HTMLElement | null;
    if (!element || !parent) return;
    const observer = new ResizeObserver(settle);
    observer.observe(parent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [settle, mounted]);

  useEffect(() => {
    if (!mounted) zone.delete(id);
  }, [zone, id, mounted]);
  useEffect(
    () => () => {
      zone.delete(id);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [zone, id],
  );

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !position) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const element = ref.current;
    const parent = element?.offsetParent as HTMLElement | null;
    if (!element || !parent) return;
    handle.setPointerCapture(event.pointerId);
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...position };
    let current = position;
    const samples: { x: number; y: number; t: number }[] = [];
    draggingRef.current = true;
    setDragging(true);
    const move = (moveEvent: PointerEvent) => {
      current = { x: start.x + moveEvent.clientX - start.pointerX, y: start.y + moveEvent.clientY - start.pointerY };
      samples.push({ x: current.x, y: current.y, t: performance.now() });
      if (samples.length > 12) samples.shift();
      setPosition(current);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      draggingRef.current = false;
      setDragging(false);
      // Project the release velocity forward so a quick flick carries it to the far anchor.
      // Only a flick counts: movement from the last 100 ms, and nothing if the pointer had stopped.
      const now = performance.now();
      const recent = samples.filter((sample) => now - sample.t <= 100);
      const first = recent[0];
      const last = recent.at(-1);
      const elapsed = first && last ? last.t - first.t : 0;
      const velocity =
        first && last && elapsed > 8
          ? { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
          : { x: 0, y: 0 };
      const centre = {
        x: current.x + element.offsetWidth / 2 + velocity.x * 180,
        y: current.y + element.offsetHeight / 2 + velocity.y * 180,
      };
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      let best = stored.anchor;
      let bestDistance = Infinity;
      for (const candidate of anchors) {
        const [row, column] = candidate.split('-');
        const referenceX = column === 'left' ? 0 : column === 'right' ? width : width / 2;
        const referenceY = row === 'top' ? 0 : row === 'bottom' ? height : height / 2;
        let distance = Math.hypot(referenceX - centre.x, referenceY - centre.y);
        // Dropping right next to a docked widget joins its group, even if another anchor point is closer.
        const groupRects = zone
          .peers(candidate)
          .filter(([peerId]) => peerId !== id)
          .map(([peerId]) => zone.rect(peerId))
          .filter((rect): rect is Rect => !!rect);
        if (groupRects.length && Math.hypot(velocity.x, velocity.y) < 0.3) {
          const dropRight = current.x + element.offsetWidth;
          const dropBottom = current.y + element.offsetHeight;
          // Edge-to-edge gap between the dropped widget and each docked one.
          const nearest = Math.min(
            ...groupRects.map((rect) =>
              Math.hypot(
                Math.max(rect.x - dropRight, 0, current.x - (rect.x + rect.width)),
                Math.max(rect.y - dropBottom, 0, current.y - (rect.y + rect.height)),
              ),
            ),
          );
          if (nearest <= 24) distance = Math.min(distance, nearest);
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      // Slot into the group where it was dropped: beside a neighbour, or on a new row above/below.
      const drop = { ...current, width: element.offsetWidth, height: element.offsetHeight };
      const peers = zone
        .peers(best)
        .filter(([peerId]) => peerId !== id)
        .map(([peerId, entry]) => ({ order: entry.order, line: entry.line, rect: zone.rect(peerId) }));
      const next = { anchor: best, ...dropPlacement(best, drop, peers) };
      setSettling(true);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(() => setSettling(false), 450);
      setStored(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: anchor just won't persist */
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const [row, column] = stored.anchor.split('-');
  const className = `${dragging ? ' dragging' : settling ? ' settling' : ''} anchor-${row} anchor-${column}`;
  const style = position
    ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
    : ({ visibility: 'hidden' } as const);
  return { ref, position, dragging, anchor: stored.anchor, beginDrag, className, style };
}

// A floating widget of the pane; drag it by its grip (or anywhere when no grip is shown).
export function SnapWidget({
  id,
  fallback,
  order = 0,
  className = '',
  grip = false,
  title,
  ariaLabel,
  panel,
  children,
}: {
  id: string;
  fallback: SnapAnchor;
  order?: number;
  className?: string;
  grip?: boolean;
  title?: string;
  ariaLabel?: string;
  // Makes the widget closable (hover X) and hideable from the Window menu.
  panel?: PanelId;
  children: ReactNode;
}) {
  const snap = useSnapDrag<HTMLDivElement>(id, fallback, order);
  const visible = useLayoutStore((state) => !panel || !state.hiddenPanels.includes(panel));
  if (!visible) return null;
  return (
    <div
      ref={snap.ref}
      className={`${className} snap-widget${grip ? '' : ' snap-drag-self'}${snap.className}`}
      style={snap.style}
      title={grip ? undefined : (title ?? 'Drag to move')}
      aria-label={ariaLabel}
      onPointerDown={grip ? undefined : snap.beginDrag}
    >
      {grip && (
        <span className="floating-grip" title="Drag to move" onPointerDown={snap.beginDrag}>
          <GripVertical size={13} />
        </span>
      )}
      {children}
      {panel && <PanelCloseButton panel={panel} className="overlay-close" />}
    </div>
  );
}
