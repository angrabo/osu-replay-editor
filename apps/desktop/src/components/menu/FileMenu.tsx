import { useState } from 'react';
import { FileJson, FileVideo } from 'lucide-react';
import type { AcquisitionAction } from '../../MapAcquisition';
import { shortcutLabel, useKeybindingsVersion } from '../../keybindings';
import { clearRecentFiles, readRecentFiles, type RecentFile } from '../../recentFiles';

export function FileMenu({
  hasTracks,
  onAction,
  onSaveProject,
  onOpenProject,
  onOpenRecent,
  onExportClip,
}: {
  hasTracks: boolean;
  onAction: (action: AcquisitionAction) => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (entry: RecentFile) => void;
  onExportClip: () => void;
}) {
  const [recent, setRecent] = useState(readRecentFiles);
  useKeybindingsVersion();
  return (
    <div className="app-menu" role="menu">
      <button role="menuitem" onClick={() => onAction('select-replays')}>
        Select replay files… {shortcutLabel('open-replays') && <kbd>{shortcutLabel('open-replays')}</kbd>}
      </button>
      <button role="menuitem" disabled={!hasTracks} onClick={() => onAction('select-map')}>
        Select matching map…
      </button>
      <div className="menu-separator" />
      <button role="menuitem" onClick={() => onAction('new-map')}>
        Set new map…
      </button>
      <div className="menu-separator" />
      <button role="menuitem" onClick={onOpenProject}>
        Open project…
      </button>
      <button role="menuitem" disabled={!hasTracks} onClick={onSaveProject}>
        Save project…
      </button>
      <div className="menu-separator" />
      <button role="menuitem" disabled={!hasTracks} onClick={onExportClip}>
        Export clip (MP4 / GIF)…
      </button>
      <div className="menu-separator" />
      <span className="menu-heading">Open recent</span>
      {recent.length ? (
        <>
          {recent.map((entry) => (
            <button
              key={`${entry.kind}:${entry.paths.join('|')}`}
              role="menuitem"
              className="recent-file"
              title={entry.paths.join('\n')}
              onClick={() => onOpenRecent(entry)}
            >
              {entry.kind === 'project' ? <FileJson size={13} /> : <FileVideo size={13} />}
              <span>{entry.label}</span>
            </button>
          ))}
          <button
            role="menuitem"
            className="recent-clear"
            onClick={() => {
              clearRecentFiles();
              setRecent([]);
            }}
          >
            Clear recent files
          </button>
        </>
      ) : (
        <span className="menu-empty">No recent files</span>
      )}
    </div>
  );
}
