import { useState } from 'react';
import { ZoomIn } from 'lucide-react';

const basePixelsPerSecond = 138;

export function TimelineZoomControl({
  pixelsPerSecond,
  setPixelsPerSecond,
}: {
  pixelsPerSecond: number;
  setPixelsPerSecond: (value: number) => void;
}) {
  const [zoomDraft, setZoomDraft] = useState('100');
  const zoomPercent = Math.max(1, Math.round((pixelsPerSecond / basePixelsPerSecond) * 100));
  const applyZoom = () => {
    const percent = Number(zoomDraft);
    if (!Number.isFinite(percent)) return;
    setPixelsPerSecond((basePixelsPerSecond * percent) / 100);
  };
  return (
    <div className="timeline-zoom-host" onPointerEnter={() => setZoomDraft(String(zoomPercent))}>
      <button className="timeline-zoom-value" title="Set timeline zoom">
        <ZoomIn size={12} />
        {zoomPercent}%
      </button>
      <div className="premiere-popover timeline-zoom-popover">
        <strong>Timeline zoom</strong>
        <small>Drag the slider or enter an exact percentage.</small>
        <input
          className="timeline-zoom-slider"
          aria-label="Timeline zoom percentage"
          type="range"
          min="10"
          max="3600"
          step="10"
          value={Math.max(10, Math.min(3600, Number(zoomDraft) || 10))}
          onChange={(event) => setZoomDraft(event.target.value)}
        />
        <label>
          <span>Zoom</span>
          <div>
            <input
              type="number"
              min="10"
              max="3600"
              value={zoomDraft}
              onChange={(event) => setZoomDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyZoom();
                if (event.key === 'Escape') setZoomDraft(String(zoomPercent));
              }}
            />
            <b>%</b>
          </div>
        </label>
        <label>
          <span>Scale</span>
          <output>{Math.round((basePixelsPerSecond * (Number(zoomDraft) || 0)) / 100)} px/s</output>
        </label>
        <div className="popover-actions">
          <button onClick={() => setZoomDraft(String(zoomPercent))}>Reset</button>
          <button className="primary" onClick={applyZoom}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
