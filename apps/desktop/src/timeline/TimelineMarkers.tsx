import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { formatTime, useEditorStore } from '../stores/editor';
import { rulerHeight } from './useTimelineCanvas';

/// Marker flags on the ruler with a faint guide line through the lanes. Click seeks, drag moves,
/// double-click edits the note.
export function TimelineMarkers({
  xForTime,
  pixelsPerSecond,
  width,
  height,
}: {
  xForTime: (time: number) => number;
  pixelsPerSecond: number;
  width: number;
  height: number;
}) {
  const markers = useEditorStore((state) => state.markers);
  const editingMarkerId = useEditorStore((state) => state.editingMarkerId);
  const updateMarker = useEditorStore((state) => state.updateMarker);
  const removeMarker = useEditorStore((state) => state.removeMarker);
  const setEditingMarker = useEditorStore((state) => state.setEditingMarker);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const dragRef = useRef<{ id: string; pointerId: number; x: number; timeMs: number; moved: boolean } | null>(null);
  const editing = markers.find((marker) => marker.id === editingMarkerId) ?? null;

  return (
    <>
      {markers.map((marker) => {
        const x = xForTime(marker.timeMs);
        if (x < -140 || x > width + 4) return null;
        return (
          <div key={marker.id}>
            <i className="timeline-marker-line" style={{ left: x, top: rulerHeight, height: height - rulerHeight }} />
            <button
              type="button"
              className={`timeline-marker-flag${marker.id === editingMarkerId ? ' editing' : ''}`}
              style={{ left: x }}
              title={`${marker.note || 'Marker'} · ${formatTime(marker.timeMs)}\nClick to seek · drag to move · double-click to edit`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  id: marker.id,
                  pointerId: event.pointerId,
                  x: event.clientX,
                  timeMs: marker.timeMs,
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const dx = event.clientX - drag.x;
                if (!drag.moved && Math.abs(dx) < 3) return;
                drag.moved = true;
                updateMarker(drag.id, { timeMs: drag.timeMs + (dx * 1000) / pixelsPerSecond });
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current;
                dragRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                if (drag && !drag.moved) setPlayhead(marker.timeMs);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditingMarker(marker.id);
              }}
            >
              {marker.note && <span>{marker.note}</span>}
            </button>
          </div>
        );
      })}
      {editing && (
        <div
          className="marker-editor"
          style={{ left: Math.max(4, Math.min(width - 244, xForTime(editing.timeMs) - 12)), top: rulerHeight + 4 }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
              event.preventDefault();
              setEditingMarker(null);
            }
          }}
        >
          <textarea
            autoFocus
            rows={2}
            placeholder="Note…"
            value={editing.note}
            onChange={(event) => updateMarker(editing.id, { note: event.target.value })}
          />
          <div className="marker-editor-row">
            <label>
              <input
                type="number"
                value={editing.timeMs}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) updateMarker(editing.id, { timeMs: value });
                }}
              />
              ms
            </label>
            <button type="button" title="Delete marker" onClick={() => removeMarker(editing.id)}>
              <Trash2 size={12} />
            </button>
            <button type="button" className="primary" onClick={() => setEditingMarker(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
