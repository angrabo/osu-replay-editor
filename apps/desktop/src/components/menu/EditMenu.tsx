import { shortcutLabel } from '../../keybindings';
export function EditMenu({
  scopeLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onInvertAxis,
}: {
  scopeLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onInvertAxis: (axis: 'x' | 'y') => void;
}) {
  return (
    <div className="app-menu" role="menu">
      <span className="menu-scope">{scopeLabel}</span>
      <button role="menuitem" disabled={!canUndo} onClick={onUndo}>
        Undo {shortcutLabel('undo') && <kbd>{shortcutLabel('undo')}</kbd>}
      </button>
      <button role="menuitem" disabled={!canRedo} onClick={onRedo}>
        Redo {shortcutLabel('redo') && <kbd>{shortcutLabel('redo')}</kbd>}
      </button>
      <div className="menu-separator" />
      <button role="menuitem" onClick={() => onInvertAxis('x')}>
        Invert X axis
      </button>
      <button role="menuitem" onClick={() => onInvertAxis('y')}>
        Invert Y axis (HR)
      </button>
    </div>
  );
}
