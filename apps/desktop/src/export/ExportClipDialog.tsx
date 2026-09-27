import { useMemo, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { formatTime, useEditorStore } from '../stores/editor';
import { captureScalePercent, clipHeight, exportClip, saveClip, videoMimeType, type ClipFormat } from './clipExport';
import { InfoTip } from '../components/InfoTip';

const sizes: Record<ClipFormat, number[]> = { mp4: [640, 960, 1280, 1920], gif: [320, 480, 640] };
const frameRates: Record<ClipFormat, number[]> = { mp4: [30, 60], gif: [20, 25, 30] };
const maxLengthMs: Record<ClipFormat, number> = { mp4: 180_000, gif: 30_000 };

function modRate(mods: number): number {
  if (mods & (64 | 512)) return 1.5;
  if (mods & 256) return 0.75;
  return 1;
}

export function ExportClipDialog({ onClose }: { onClose: () => void }) {
  const initialRange = useMemo(() => {
    const state = useEditorStore.getState();
    const range = state.selectedTimeRange ?? state.selectedCursorRange;
    return range
      ? { startMs: range.startMs, endMs: range.endMs }
      : { startMs: Math.round(state.playheadMs), endMs: Math.round(state.playheadMs) + 5000 };
  }, []);
  const video = useMemo(videoMimeType, []);
  const [format, setFormat] = useState<ClipFormat>(video ? 'mp4' : 'gif');
  const [startMs, setStartMs] = useState(initialRange.startMs);
  const [endMs, setEndMs] = useState(initialRange.endMs);
  const [width, setWidth] = useState(960);
  const [fps, setFps] = useState(60);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [progress, setProgress] = useState<{ value: number; stage: string } | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const exporting = progress !== null;

  const sizeOptions = sizes[format];
  const fpsOptions = frameRates[format];
  const chosenWidth = sizeOptions.includes(width) ? width : sizeOptions[Math.min(1, sizeOptions.length - 1)];
  const chosenFps = fpsOptions.includes(fps) ? fps : fpsOptions[fpsOptions.length - 1];
  const lengthMs = endMs - startMs;
  const rangeError =
    lengthMs <= 0
      ? 'The end must be after the start.'
      : lengthMs > maxLengthMs[format]
        ? `${format.toUpperCase()} clips can be at most ${maxLengthMs[format] / 1000} s long.`
        : '';

  const start = async () => {
    const state = useEditorStore.getState();
    const track = state.tracks.find((item) => item.id === state.previewTrackId) ?? state.tracks[0];
    const restoreTimeMs = state.playheadMs;
    state.setPlaying(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setMessage('');
    setProgress({ value: 0, stage: 'Preparing…' });
    try {
      const result = await exportClip(
        {
          format,
          startMs,
          endMs,
          width: chosenWidth,
          fps: chosenFps,
          rate: modRate(track?.exportMetadata.mods ?? 0),
          nightcore: ((track?.exportMetadata.mods ?? 0) & 512) !== 0,
          audio: includeAudio,
        },
        (value, stage) => setProgress({ value, stage }),
        controller.signal,
        restoreTimeMs,
      );
      setProgress({ value: 1, stage: 'Saving…' });
      const name = `${(track?.name ?? 'replay').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'replay'} ${Math.round(startMs)}-${Math.round(endMs)}`;
      const saved = await saveClip(result, name);
      setMessage(
        saved
          ? `Saved ${saved} (${(result.bytes.length / 1024 / 1024).toFixed(1)} MB).`
          : 'Export finished, not saved.',
      );
    } catch (error) {
      setMessage(
        (error as Error).name === 'AbortError' ? 'Export cancelled.' : `Export failed: ${(error as Error).message}`,
      );
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !exporting && onClose()}>
      <div className="auth-modal export-clip-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>
              Export clip
              <InfoTip
                text={`Renders the main playfield with its current overlays and filters. The grid fills ${captureScalePercent}% of the frame so objects outside it still show.`}
              />
            </h2>
            <span className="modal-subtitle">
              {formatTime(startMs)} – {formatTime(endMs)} · {(Math.max(0, lengthMs) / 1000).toFixed(2)} s
            </span>
          </div>
          <button aria-label="Close" disabled={exporting} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="export-clip-form">
          <label>
            <span>Format</span>
            <div className="segmented">
              <button
                type="button"
                className={format === 'mp4' ? 'active' : ''}
                disabled={exporting || !video}
                title={video ? undefined : 'Video recording is not available in this app version'}
                onClick={() => setFormat('mp4')}
              >
                {video?.extension === 'webm' ? 'Video (WebM)' : 'MP4'}
              </button>
              <button
                type="button"
                className={format === 'gif' ? 'active' : ''}
                disabled={exporting}
                onClick={() => setFormat('gif')}
              >
                GIF
              </button>
            </div>
          </label>
          <label>
            <span>Start (ms)</span>
            <input
              type="number"
              value={startMs}
              disabled={exporting}
              onChange={(event) => setStartMs(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            <span>End (ms)</span>
            <input
              type="number"
              value={endMs}
              disabled={exporting}
              onChange={(event) => setEndMs(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            <span>Size</span>
            <select value={chosenWidth} disabled={exporting} onChange={(event) => setWidth(Number(event.target.value))}>
              {sizeOptions.map((value) => (
                <option key={value} value={value}>
                  {value} × {clipHeight(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Frame rate</span>
            <select value={chosenFps} disabled={exporting} onChange={(event) => setFps(Number(event.target.value))}>
              {fpsOptions.map((value) => (
                <option key={value} value={value}>
                  {value} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        {format === 'mp4' ? (
          <>
            <label className="export-clip-check">
              <input
                type="checkbox"
                checked={includeAudio}
                disabled={exporting}
                onChange={(event) => setIncludeAudio(event.target.checked)}
              />
              <span>Include beatmap audio</span>
            </label>
            <p className="export-clip-note">Video is recorded in real time, so exporting takes as long as the clip.</p>
          </>
        ) : (
          <p className="export-clip-note">GIFs have no sound.</p>
        )}
        {progress && (
          <div className="update-progress" role="status" aria-live="polite">
            <div className="update-progress-label">
              <span>{progress.stage}</span>
              <span>{Math.round(progress.value * 100)}%</span>
            </div>
            <div className="update-progress-track">
              <div className="update-progress-fill" style={{ width: `${progress.value * 100}%` }} />
            </div>
          </div>
        )}
        {(message || rangeError) && (
          <p className="map-flow-message" role={rangeError ? 'alert' : 'status'}>
            {rangeError || message}
          </p>
        )}
        <div className="map-flow-actions">
          {exporting ? (
            <button className="map-flow-primary" onClick={() => abortRef.current?.abort()}>
              <Film size={18} />
              <span>
                <strong>Cancel export</strong>
                <small>Stops after the current frame</small>
              </span>
            </button>
          ) : (
            <button className="map-flow-primary" disabled={!!rangeError} onClick={() => void start()}>
              <Film size={18} />
              <span>
                <strong>Export {format === 'gif' ? 'GIF' : video?.extension === 'webm' ? 'video' : 'MP4'}</strong>
                <small>
                  {chosenWidth} × {clipHeight(chosenWidth)} · {chosenFps} fps
                </small>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
