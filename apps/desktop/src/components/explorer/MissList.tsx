import { CornerUpLeft, Crosshair, Hand, Link2Off, Lock, RotateCw, Timer, TimerReset, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatTime, useEditorStore } from '../../stores/editor';
import type { MissCauseKind, MissEntry } from '../../missAnalysis';

const icons: Record<MissCauseKind, ReactNode> = {
  'no-press': <Hand size={12} />,
  aim: <Crosshair size={12} />,
  early: <TimerReset size={12} />,
  late: <Timer size={12} />,
  notelock: <Lock size={12} />,
  taken: <CornerUpLeft size={12} />,
  'slider-break': <Link2Off size={12} />,
  spinner: <RotateCw size={12} />,
  unknown: <HelpCircle size={12} />,
};

/// Explorer tab listing every miss of the previewed replay with its likely cause. Click jumps to
/// the object and selects it; the search box filters by cause.
export function MissList({ misses, search }: { misses: MissEntry[] | null; search: string }) {
  const selectedIndex = useEditorStore((state) => state.selectedBeatmapObjectIndex);
  if (!misses) return <p className="marker-list-empty">Run the simulation to analyse misses.</p>;
  const filter = search.trim().toLowerCase();
  const visible = misses.filter(
    (miss) => !filter || `${miss.cause.summary} ${miss.cause.detail}`.toLowerCase().includes(filter),
  );
  const counts = misses.reduce<Partial<Record<MissCauseKind, number>>>((all, miss) => {
    all[miss.cause.kind] = (all[miss.cause.kind] ?? 0) + 1;
    return all;
  }, {});
  return (
    <div className="file-tree marker-list miss-list">
      {misses.length > 0 && (
        <div className="miss-list-summary">
          {(Object.entries(counts) as [MissCauseKind, number][]).map(([kind, count]) => (
            <span key={kind} className={`miss-kind miss-${kind}`} title={kind.replace('-', ' ')}>
              {icons[kind]} {count}
            </span>
          ))}
        </div>
      )}
      {visible.map((miss) => (
        <div
          key={miss.objectIndex}
          role="button"
          tabIndex={0}
          className={`marker-list-row miss-list-row${miss.objectIndex === selectedIndex ? ' current' : ''}`}
          title={miss.cause.detail}
          onClick={() => {
            const state = useEditorStore.getState();
            state.setPlaying(false);
            state.selectBeatmapObject(miss.objectIndex);
            state.setPlayhead(miss.time);
            state.requestTimelineFocus();
          }}
        >
          <span className={`miss-kind miss-${miss.cause.kind}`}>{icons[miss.cause.kind]}</span>
          <span className="marker-list-time">{formatTime(miss.time)}</span>
          <span className="marker-list-note">
            {miss.kind} #{miss.objectIndex + 1} · {miss.cause.summary}
          </span>
        </div>
      ))}
      {!misses.length && <p className="marker-list-empty">No misses in this replay.</p>}
      {misses.length > 0 && !visible.length && <p className="marker-list-empty">No misses match the search.</p>}
    </div>
  );
}
