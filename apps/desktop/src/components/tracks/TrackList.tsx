import { useState, type CSSProperties, type MouseEvent } from 'react';
import { inputVariantColor } from '@ore/beatmap-viewer';
import { Check, Eye, EyeOff, LockKeyhole, LockKeyholeOpen, MoreVertical, Plus, Scan, X } from 'lucide-react';
import { useEditorStore } from '../../stores/editor';

function trackInputColor(base: string, keyIndex: number): string {
  const numeric = Number.parseInt(base.slice(1), 16);
  return `#${inputVariantColor(numeric, keyIndex).toString(16).padStart(6, '0')}`;
}

export function TrackList({ onImport }: { onImport: () => void }) {
  const tracks = useEditorStore((state) => state.tracks);
  const selected = useEditorStore((state) => state.selectedTrackIds);
  const preview = useEditorStore((state) => state.previewTrackId);
  const selectTrack = useEditorStore((state) => state.selectTrack);
  const setPreview = useEditorStore((state) => state.setPreviewTrack);
  const setColor = useEditorStore((state) => state.setTrackColor);
  const setTrackName = useEditorStore((state) => state.setTrackName);
  const toggleVisibility = useEditorStore((state) => state.toggleTrackVisibility);
  const toggleLock = useEditorStore((state) => state.toggleTrackLock);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [colorDraft, setColorDraft] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  return (
    <section className="panel track-panel">
      <div className="track-heading">
        <button className="add-track" onClick={onImport}>
          <Plus size={15} /> Import Replay
        </button>
        <span>TRACKS</span>
      </div>
      <div className="track-list">
        {tracks.map((track) => (
          <div className={`track-row ${selected.includes(track.id) ? 'selected' : ''}`} key={track.id}>
            <button
              className="track-main"
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                selectTrack(track.id, event.ctrlKey || event.metaKey, event.shiftKey)
              }
            >
              <span
                className="track-swatch"
                title={`K1 ${trackInputColor(track.color, 2)} · K2 ${trackInputColor(track.color, 3)}`}
                style={
                  {
                    '--track-k1': trackInputColor(track.color, 2),
                    '--track-k2': trackInputColor(track.color, 3),
                  } as CSSProperties
                }
              />
              <span>{track.name}</span>
            </button>
            <button
              className={`track-icon ${preview === track.id ? 'preview-active' : ''}`}
              title="Preview this replay"
              onClick={() => setPreview(preview === track.id ? null : track.id)}
            >
              {preview === track.id ? <span className="preview-dot" /> : <Scan size={15} />}
            </button>
            <button
              className="track-icon"
              title={track.visible ? 'Hide track' : 'Show track'}
              onClick={() => toggleVisibility(track.id)}
            >
              {track.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              className="track-icon"
              title={track.locked ? 'Unlock track' : 'Lock track'}
              onClick={() => toggleLock(track.id)}
            >
              {track.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}
            </button>
            <button
              className="track-icon"
              title="Track menu"
              onClick={() => setMenuId(menuId === track.id ? null : track.id)}
            >
              <MoreVertical size={15} />
            </button>
            {menuId === track.id && (
              <div className="track-menu">
                <button
                  onClick={() => {
                    setPreview(track.id);
                    setMenuId(null);
                  }}
                >
                  Set as preview
                </button>
                <button
                  onClick={() => {
                    setNameDraft(track.name);
                    setEditingName(track.id);
                    setMenuId(null);
                  }}
                >
                  Rename track
                </button>
                <button
                  onClick={() => {
                    setColorDraft(track.color);
                    setEditingColor(track.id);
                    setMenuId(null);
                  }}
                >
                  Edit HEX color
                </button>
                <button
                  onClick={() => {
                    toggleVisibility(track.id);
                    setMenuId(null);
                  }}
                >
                  {track.visible ? 'Hide' : 'Show'} track
                </button>
                <button
                  onClick={() => {
                    toggleLock(track.id);
                    setMenuId(null);
                  }}
                >
                  {track.locked ? 'Unlock' : 'Lock'} track
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editingName && (
        <form
          className="track-name-editor"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameDraft.trim()) {
              setTrackName(editingName, nameDraft);
              setEditingName(null);
            }
          }}
        >
          <label>
            Track name
            <input
              autoFocus
              value={nameDraft}
              maxLength={80}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditingName(null);
              }}
            />
          </label>
          <button title="Apply name" type="submit">
            <Check size={16} />
          </button>
          <button title="Cancel" type="button" onClick={() => setEditingName(null)}>
            <X size={16} />
          </button>
        </form>
      )}
      {editingColor && (
        <div className="color-editor">
          <label>
            Track HEX color
            <input value={colorDraft} maxLength={7} onChange={(event) => setColorDraft(event.target.value)} />
          </label>
          <input
            aria-label="Pick track color"
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(colorDraft) ? colorDraft : '#ffffff'}
            onChange={(event) => setColorDraft(event.target.value)}
          />
          <button
            title="Apply color"
            onClick={() => {
              setColor(editingColor, colorDraft);
              if (/^#[0-9a-fA-F]{6}$/.test(colorDraft)) setEditingColor(null);
            }}
          >
            <Check size={16} />
          </button>
          <button title="Cancel" onClick={() => setEditingColor(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="track-hint">Ctrl select multiple · Double click preview icon</div>
    </section>
  );
}
