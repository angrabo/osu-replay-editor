import { Hourglass, Keyboard, Minus, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatTime, useEditorStore } from '../../stores/editor';
import type { Suspicion, SuspicionKind } from '../../suspicion';
import { suspicionKey, useSuspicionReport } from '../../useSuspicions';

const icons: Record<SuspicionKind, ReactNode> = {
  teleport: <Zap size={12} />,
  straight: <Minus size={12} />,
  'even-timing': <Hourglass size={12} />,
  'even-holds': <Keyboard size={12} />,
};
const names: Record<SuspicionKind, string> = {
  teleport: 'Cursor jumps',
  straight: 'Straight lines',
  'even-timing': 'Even timing',
  'even-holds': 'Even key holds',
};

const MENU_WIDTH = 190;
const MENU_HEIGHT = 130;

/// Explorer tab listing the stretches of the previewed replay that do not look hand-played.
/// Click jumps there and selects the stretch on the timeline; right-click offers to ignore it
/// (remembered in the project). The search box filters the list.
export function SuspicionList({ search }: { search: string }) {
  const { trackId, shown, ignored } = useSuspicionReport();
  // Only the index is subscribed to, so playback does not re-render the list every frame.
  const current = useEditorStore((state) =>
    shown.findIndex((item) => state.playheadMs >= item.startMs && state.playheadMs <= item.endMs),
  );
  const simulated = useEditorStore(
    (state) => !!(state.previewTrackId && state.simulationByTrack[state.previewTrackId]?.result),
  );
  const [menu, setMenu] = useState<{ x: number; y: number; item: Suspicion } | null>(null);
  // Ignored findings can be listed again (dimmed) to bring single ones back.
  const [showIgnored, setShowIgnored] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const filter = search.trim().toLowerCase();
  const listed = showIgnored ? [...shown, ...ignored].sort((a, b) => a.startMs - b.startMs) : shown;
  const visible = listed.filter(
    (item) => !filter || `${names[item.kind]} ${item.summary} ${item.detail}`.toLowerCase().includes(filter),
  );
  const counts = shown.reduce<Partial<Record<SuspicionKind, number>>>((all, item) => {
    all[item.kind] = (all[item.kind] ?? 0) + 1;
    return all;
  }, {});
  const jumpTo = (item: Suspicion) => {
    const state = useEditorStore.getState();
    state.setPlaying(false);
    state.setPlayhead(item.startMs);
    // A jump is a single moment; give it a little room so the selection is visible.
    state.selectTimeRange({ startMs: item.startMs, endMs: Math.max(item.endMs, item.startMs + 20) });
    state.requestTimelineFocus();
  };
  const ignore = (items: readonly Suspicion[]) => {
    if (trackId) useEditorStore.getState().ignoreSuspicions(items.map((item) => suspicionKey(trackId, item)));
  };
  const restore = (items: readonly Suspicion[]) => {
    if (trackId) useEditorStore.getState().restoreSuspicions(items.map((item) => suspicionKey(trackId, item)));
  };
  const sameKind = menu ? shown.filter((item) => item.kind === menu.item.kind) : [];
  const menuIgnored = !!menu && ignored.includes(menu.item);

  return (
    <div className="file-tree marker-list miss-list">
      {shown.length > 0 && (
        <div className="miss-list-summary">
          {(Object.entries(counts) as [SuspicionKind, number][]).map(([kind, count]) => (
            <span key={kind} className={`suspicion-kind suspicion-${kind}`} title={names[kind]}>
              {icons[kind]} {count}
            </span>
          ))}
        </div>
      )}
      {visible.map((item, index) => (
        <div
          key={`${item.kind}-${item.startMs}-${index}`}
          role="button"
          tabIndex={0}
          className={`marker-list-row miss-list-row${shown[current] === item || menu?.item === item ? ' current' : ''}${ignored.includes(item) ? ' ignored' : ''}`}
          title={item.detail}
          onClick={() => jumpTo(item)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({
              x: Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8),
              y: Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8),
              item,
            });
          }}
        >
          <span className={`suspicion-kind suspicion-${item.kind}${item.strong ? ' strong' : ''}`}>
            {icons[item.kind]}
          </span>
          <span className="marker-list-time">{formatTime(item.startMs)}</span>
          <span className="marker-list-note">
            {item.summary}
            {item.strong && <b className="suspicion-strong">strong</b>}
          </span>
        </div>
      ))}
      {!shown.length && <p className="marker-list-empty">Nothing suspicious found in this replay.</p>}
      {listed.length > 0 && !visible.length && <p className="marker-list-empty">Nothing matches the search.</p>}
      {!simulated && <p className="marker-list-empty">Run the simulation to also check hit timing.</p>}
      {ignored.length > 0 && (
        <p className="marker-list-empty suspicion-ignored">
          {ignored.length} ignored
          <button type="button" onClick={() => setShowIgnored(!showIgnored)}>
            {showIgnored ? 'Hide ignored' : 'Show ignored'}
          </button>
          {showIgnored && (
            <button type="button" onClick={() => useEditorStore.getState().restoreSuspicions()}>
              Restore all
            </button>
          )}
        </p>
      )}
      {menu &&
        createPortal(
          <div
            className="timeline-context-menu timeline-context-menu-portal"
            style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="context-time">
              {formatTime(menu.item.startMs)} · {names[menu.item.kind]}
            </div>
            {menuIgnored ? (
              <button
                onClick={() => {
                  restore([menu.item]);
                  setMenu(null);
                }}
              >
                Restore this
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    ignore([menu.item]);
                    setMenu(null);
                  }}
                >
                  Ignore this
                </button>
                <button
                  disabled={sameKind.length < 2}
                  onClick={() => {
                    ignore(sameKind);
                    setMenu(null);
                  }}
                >
                  Ignore all {names[menu.item.kind].toLowerCase()} ({sameKind.length})
                </button>
              </>
            )}
            <button
              onClick={() => {
                useEditorStore.getState().addMarker(menu.item.startMs, menu.item.summary);
                setMenu(null);
              }}
            >
              Add marker here
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
