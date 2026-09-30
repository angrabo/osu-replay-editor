import { useEffect, useRef, useState } from 'react';
import { Minimize2, Pause, Play } from 'lucide-react';
import { formatTime, timelineStart, useEditorStore } from '../../stores/editor';
import { toggleFullscreen } from '../../hooks/useFullscreen';

const resultColour = { '100': '#59d98e', '50': '#f29a4a', miss: '#ff6575' } as const;

/// Video-player style bar for the fullscreen playfield: play/pause, time, and a seekable progress
/// track with the replay's 100s, 50s and misses and the timeline markers. Hides after the pointer
/// rests for a moment while playing.
export function FullscreenBar() {
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const playhead = useEditorStore((state) => state.playheadMs);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const duration = useEditorStore((state) => state.durationMs);
  const start = useEditorStore((state) => timelineStart(state.tracks, state.beatmapObjects));
  const markers = useEditorStore((state) => state.markers);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const trackRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const span = Math.max(1, duration - start);
  const percent = (time: number) => `${Math.max(0, Math.min(100, ((time - start) / span) * 100))}%`;
  const timeAt = (clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box) return start;
    return start + Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * span;
  };

  useEffect(() => {
    const wake = () => {
      setVisible(true);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        if (useEditorStore.getState().playing) setVisible(false);
      }, 2200);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!playing) setVisible(true);
  }, [playing]);

  return (
    <div className={`fullscreen-bar${visible ? '' : ' hidden'}`} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <span className="fullscreen-time">{formatTime(Math.max(0, playhead))}</span>
      <div
        ref={trackRef}
        className="fullscreen-track"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setPlayhead(timeAt(event.clientX));
        }}
        onPointerMove={(event) => {
          setHover(timeAt(event.clientX));
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setPlayhead(timeAt(event.clientX));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="fullscreen-track-fill" style={{ width: percent(playhead) }} />
        {simulation?.judgements
          .filter((judgement) => judgement.result !== '300')
          .map((judgement) => (
            <i
              key={judgement.objectIndex}
              className={`fullscreen-mark result-${judgement.result}`}
              style={{
                left: percent(judgement.startTime),
                background: resultColour[judgement.result as keyof typeof resultColour],
              }}
            />
          ))}
        {markers.map((marker) => (
          <i
            key={marker.id}
            className="fullscreen-mark marker"
            style={{ left: percent(marker.timeMs) }}
            title={marker.note}
          />
        ))}
        <div className="fullscreen-track-head" style={{ left: percent(playhead) }} />
        {hover !== null && (
          <span className="fullscreen-hover-time" style={{ left: percent(hover) }}>
            {formatTime(Math.max(0, hover))}
          </span>
        )}
      </div>
      <span className="fullscreen-time">{formatTime(duration)}</span>
      <button type="button" title="Exit fullscreen (Esc)" onClick={toggleFullscreen}>
        <Minimize2 size={16} />
      </button>
    </div>
  );
}
