import { panelLabels, useLayoutStore, type FloatablePanelId, type PanelId } from '../../stores/layout';
import { useTextWidgetStore } from '../../stores/textWidgets';

const docked: PanelId[] = ['explorer', 'tracks', 'inspector', 'selection', 'timeline'];
const floating: PanelId[] = ['quickbar', 'toolOptions', 'stats', 'viewControls', 'simulation', 'previewBadge'];

export function WindowMenu({ onClose }: { onClose: () => void }) {
  const hiddenPanels = useLayoutStore((state) => state.hiddenPanels);
  const setPanelVisible = useLayoutStore((state) => state.setPanelVisible);
  const showAllPanels = useLayoutStore((state) => state.showAllPanels);
  const snapWidgets = useLayoutStore((state) => state.snapWidgets);
  const setSnapWidgets = useLayoutStore((state) => state.setSnapWidgets);
  const floatingPanels = useLayoutStore((state) => state.floatingPanels);
  const dockPanel = useLayoutStore((state) => state.dockPanel);
  const poppedOut = Object.keys(floatingPanels) as FloatablePanelId[];
  const item = (panel: PanelId) => {
    const visible = !hiddenPanels.includes(panel);
    return (
      <button
        key={panel}
        role="menuitemcheckbox"
        aria-checked={visible}
        onClick={() => setPanelVisible(panel, !visible)}
      >
        {visible ? '✓ ' : ''}
        {panelLabels[panel]}
      </button>
    );
  };
  return (
    <div className="app-menu" role="menu">
      {docked.map(item)}
      <div className="menu-separator" />
      {floating.map(item)}
      <button
        role="menuitem"
        onClick={() => {
          useTextWidgetStore.getState().add();
          onClose();
        }}
      >
        + Add text panel
      </button>
      <div className="menu-separator" />
      <button
        role="menuitemcheckbox"
        aria-checked={snapWidgets}
        title="When off, playfield widgets stay exactly where you drop them. Hold Alt while dropping to do the opposite."
        onClick={() => setSnapWidgets(!snapWidgets)}
      >
        {snapWidgets ? '✓ ' : ''}Snap playfield widgets
      </button>
      <div className="menu-separator" />
      <button role="menuitem" disabled={!hiddenPanels.length} onClick={showAllPanels}>
        Show all windows
      </button>
      <button
        role="menuitem"
        disabled={!poppedOut.length}
        onClick={() => poppedOut.forEach((panel) => dockPanel(panel))}
      >
        Dock all popped-out panels
      </button>
    </div>
  );
}
