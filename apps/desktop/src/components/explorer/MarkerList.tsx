import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { formatTime, useEditorStore } from '../../stores/editor';

/// Explorer tab listing the timeline markers. Click seeks, double-click edits the note on the
/// timeline, the bin deletes. The Explorer search box filters by note text.
export function MarkerList({ search }: { search: string }) {
  const markers = useEditorStore((state) => state.markers);
  const playhead = useEditorStore((state) => state.playheadMs);
  const editingMarkerId = useEditorStore((state) => state.editingMarkerId);
  const filter = search.trim().toLowerCase();
  const visible = markers.filter((marker) => !filter || marker.note.toLowerCase().includes(filter));
  // The marker at or just before the playhead is the "current" one.
  const current = [...markers].reverse().find((marker) => marker.timeMs <= playhead + 0.5)?.id;

  const seek = (timeMs: number) => {
    const state = useEditorStore.getState();
    state.setPlaying(false);
    state.setPlayhead(timeMs);
    state.requestTimelineFocus();
  };

  return (
    <div className="file-tree marker-list">
      <button
        type="button"
        className="marker-list-add"
        onClick={() => {
          const state = useEditorStore.getState();
          state.setEditingMarker(state.addMarker(state.playheadMs));
        }}
      >
        <Plus size={13} /> Add marker at playhead
      </button>
      {visible.map((marker) => (
        <div
          key={marker.id}
          className={`marker-list-row${marker.id === current ? ' current' : ''}${marker.id === editingMarkerId ? ' editing' : ''}`}
          role="button"
          tabIndex={0}
          title="Click to seek · double-click to edit"
          onClick={() => seek(marker.timeMs)}
          onDoubleClick={() => {
            seek(marker.timeMs);
            useEditorStore.getState().setEditingMarker(marker.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') seek(marker.timeMs);
          }}
        >
          <Bookmark size={12} />
          <span className="marker-list-time">{formatTime(marker.timeMs)}</span>
          <span className={`marker-list-note${marker.note ? '' : ' empty'}`}>{marker.note || 'No note'}</span>
          <button
            type="button"
            className="marker-list-delete"
            title="Delete marker"
            aria-label="Delete marker"
            onClick={(event) => {
              event.stopPropagation();
              useEditorStore.getState().removeMarker(marker.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {!markers.length && (
        <p className="marker-list-empty">No markers yet. Press M on the timeline or use the button above.</p>
      )}
      {markers.length > 0 && !visible.length && <p className="marker-list-empty">No markers match the search.</p>}
    </div>
  );
}
