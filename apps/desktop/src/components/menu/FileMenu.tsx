import type { AcquisitionAction } from '../../MapAcquisition';

export function FileMenu({
  hasTracks,
  onAction,
  onSaveProject,
  onOpenProject,
}: {
  hasTracks: boolean;
  onAction: (action: AcquisitionAction) => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
}) {
  return (
    <div className="app-menu" role="menu">
      <button role="menuitem" onClick={() => onAction('select-replays')}>
        Select replay files… <kbd>Ctrl+O</kbd>
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
    </div>
  );
}
