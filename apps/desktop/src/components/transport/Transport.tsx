import { FastForward, LocateFixed, Pause, Play, Rewind, SkipBack, SkipForward } from 'lucide-react';
import { timelineStart, useEditorStore } from '../../stores/editor';
import { jumpTo, type JumpTarget } from '../../navigation';
import { shortcutLabel, useKeybindingsVersion, type KeyActionId } from '../../keybindings';

const jumpButtons: {
  target: JumpTarget;
  label: string;
  name: string;
  className: string;
  next: KeyActionId;
  previous: KeyActionId;
}[] = [
  { target: '100', label: '100', name: '100', className: 'jump-100', next: 'next-100', previous: 'previous-100' },
  { target: '50', label: '50', name: '50', className: 'jump-50', next: 'next-50', previous: 'previous-50' },
  { target: 'miss', label: '×', name: 'miss', className: 'jump-miss', next: 'next-miss', previous: 'previous-miss' },
  {
    target: 'combo-break',
    label: 'CB',
    name: 'combo break',
    className: 'jump-combo-break',
    next: 'next-combo-break',
    previous: 'previous-combo-break',
  },
];

export function Transport({ compact = false }: { compact?: boolean }) {
  useKeybindingsVersion();
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const playhead = useEditorStore((state) => state.playheadMs);
  const durationMs = useEditorStore((state) => state.durationMs);
  const startMs = useEditorStore((state) => timelineStart(state.tracks, state.beatmapObjects));
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const requestTimelineFocus = useEditorStore((state) => state.requestTimelineFocus);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const hasSliderBreaks = useEditorStore((state) => state.sliderBreaks.length > 0);
  const available = (target: JumpTarget) =>
    target === 'combo-break'
      ? !!simulation || hasSliderBreaks
      : !!simulation?.judgements.some((item) => item.result === target);
  const hint = (id: KeyActionId) => {
    const key = shortcutLabel(id);
    return key ? ` (${key})` : '';
  };
  return (
    <div className={`transport ${compact ? 'transport-compact' : ''}`}>
      <button title="Go to start" onClick={() => setPlayhead(startMs)}>
        <SkipBack size={16} fill="currentColor" />
      </button>
      <button title="Back five seconds" onClick={() => setPlayhead(playhead - 5000)}>
        <Rewind size={17} fill="currentColor" />
      </button>
      <button className="transport-play" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <button title="Forward five seconds" onClick={() => setPlayhead(Math.min(durationMs, playhead + 5000))}>
        <FastForward size={17} fill="currentColor" />
      </button>
      <button title="Go to end" onClick={() => setPlayhead(durationMs)}>
        <SkipForward size={16} fill="currentColor" />
      </button>
      {!compact && (
        <>
          <button title="Back to playhead" aria-label="Back to playhead" onClick={requestTimelineFocus}>
            <LocateFixed size={17} />
          </button>
          <span className="judgement-jumps">
            {jumpButtons.map((item) => (
              <button
                key={item.target}
                className={item.className}
                title={`Next ${item.name}${hint(item.next)} · Shift+click: previous${hint(item.previous)}`}
                aria-label={`Jump to next ${item.name}`}
                disabled={!available(item.target)}
                onClick={(event) => jumpTo(item.target, event.shiftKey ? -1 : 1)}
              >
                {item.label}
              </button>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
