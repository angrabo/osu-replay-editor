import { BeatmapCanvas } from '../../playfield/BeatmapCanvas';
import type { Resolution } from '../../MapAcquisition';
import { useEditorStore } from '../../stores/editor';
import { formatAccuracy } from '../../utils/formatAccuracy';
import { EditorQuickbar } from './EditorQuickbar';

export type PlayfieldSource = 'preview' | 'original' | `track:${string}`;

export function Playfield({
  resolution,
  split,
  leftSource,
  rightSource,
  onLeftSourceChange,
  onRightSourceChange,
}: {
  resolution: Resolution | null;
  split: boolean;
  leftSource: PlayfieldSource;
  rightSource: PlayfieldSource;
  onLeftSourceChange: (source: PlayfieldSource) => void;
  onRightSourceChange: (source: PlayfieldSource) => void;
}) {
  const previewId = useEditorStore((state) => state.previewTrackId);
  const tracks = useEditorStore((state) => state.tracks);
  const setEditorSurface = useEditorStore((state) => state.setEditorSurface);
  const simulations = useEditorStore((state) => state.simulationByTrack);
  const sourceTrack = (source: PlayfieldSource) => (source.startsWith('track:') ? source.slice(6) : previewId);
  const sourceOriginal = (source: PlayfieldSource) => source === 'original';
  const sourceLabel = (source: PlayfieldSource) =>
    source === 'preview'
      ? 'Edited preview'
      : source === 'original'
        ? 'Original replay'
        : (tracks.find((track) => track.id === sourceTrack(source))?.name ?? 'Replay');
  const sourceOptions = (
    <>
      {<option value="preview">Edited preview</option>}
      <option value="original" disabled={!previewId}>
        Original replay
      </option>
      {tracks
        .filter((track) => track.id !== previewId)
        .map((track) => (
          <option value={`track:${track.id}`} key={track.id}>
            {track.name}
          </option>
        ))}
    </>
  );
  const pane = (source: PlayfieldSource, side: 'left' | 'right') => {
    const trackId = sourceTrack(source);
    const simulation = sourceOriginal(source)
      ? null
      : trackId && simulations[trackId]?.result?.status !== 'unsupported'
        ? simulations[trackId]?.result
        : null;
    const interactive = side === 'left' && source === 'preview';
    return (
      <div className={`playfield-pane playfield-pane-${side}`} key={side}>
        {split && (
          <label className="playfield-source">
            <span>{side === 'left' ? 'LEFT' : 'RIGHT'}</span>
            <select
              value={source}
              onChange={(event) =>
                (side === 'left' ? onLeftSourceChange : onRightSourceChange)(event.target.value as PlayfieldSource)
              }
            >
              {sourceOptions}
            </select>
          </label>
        )}
        <BeatmapCanvas
          key={`${side}-${split ? 'split' : 'single'}`}
          resolution={resolution}
          trackId={trackId}
          original={sourceOriginal(source)}
          clock={side === 'left'}
          interactive={interactive}
        />
        {interactive && <EditorQuickbar />}
        {simulation && (
          <div className="score-overlay simulation-score-overlay">
            <small>{simulation.status === 'verified' ? 'SIMULATION VERIFIED' : 'SIMULATION ESTIMATE'}</small>
            <strong>{simulation.score.toLocaleString('en-US')}</strong>
            <span>{formatAccuracy(simulation)}%</span>
            <small>
              {simulation.maxCombo}x · {simulation.misses} miss
            </small>
          </div>
        )}
        <div className="preview-badge">
          {trackId
            ? `${sourceOriginal(source) ? 'ORIGINAL' : 'REPLAY'} · ${sourceLabel(source)}`
            : resolution
              ? `BEATMAP · ${resolution.source}`
              : 'NO MAP LOADED'}
        </div>
      </div>
    );
  };
  return (
    <section
      className="panel playfield"
      onPointerEnter={() => setEditorSurface('gameplay')}
      onPointerDownCapture={() => setEditorSurface('gameplay')}
      onPointerLeave={() => setEditorSurface(null)}
    >
      <div className="playfield-sky" />
      <div className={`playfield-panes${split ? ' split' : ''}`}>
        {pane(leftSource, 'left')}
        {split && pane(rightSource, 'right')}
      </div>
    </section>
  );
}
