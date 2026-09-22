import { FastForward, LocateFixed, Pause, Play, Rewind, SkipBack, SkipForward } from 'lucide-react';
import { timelineStart, useEditorStore } from '../../stores/editor';

export function Transport({ compact = false }: { compact?: boolean }) {
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const playhead = useEditorStore((state) => state.playheadMs);
  const tracks = useEditorStore((state) => state.tracks);
  const durationMs = useEditorStore((state) => state.durationMs);
  const startMs = useEditorStore((state) => timelineStart(state.tracks, state.beatmapObjects));
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const requestTimelineFocus = useEditorStore((state) => state.requestTimelineFocus);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const jumpToNext = (result: '100' | '50' | 'miss') => {
    const matches = simulation?.judgements.filter((judgement) => judgement.result === result) ?? [];
    const target = matches.find((judgement) => judgement.startTime > playhead + 0.5) ?? matches[0];
    if (!target) return;
    setPlaying(false);
    setPlayhead(target.startTime);
    requestTimelineFocus();
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
            <button
              className="jump-100"
              title="Jump to next 100"
              disabled={!simulation?.judgements.some((item) => item.result === '100')}
              onClick={() => jumpToNext('100')}
            >
              100
            </button>
            <button
              className="jump-50"
              title="Jump to next 50"
              disabled={!simulation?.judgements.some((item) => item.result === '50')}
              onClick={() => jumpToNext('50')}
            >
              50
            </button>
            <button
              className="jump-miss"
              title="Jump to next miss"
              disabled={!simulation?.judgements.some((item) => item.result === 'miss')}
              onClick={() => jumpToNext('miss')}
            >
              ×
            </button>
          </span>
        </>
      )}
    </div>
  );
}
