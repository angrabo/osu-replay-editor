import { panelLabels, useLayoutStore, type PanelId } from '../../stores/layout';

const docked: PanelId[] = ['explorer', 'tracks', 'inspector', 'selection', 'timeline'];
const floating: PanelId[] = ['quickbar', 'toolOptions', 'stats', 'viewControls', 'simulation', 'previewBadge'];

export function WindowMenu() {
  const hiddenPanels = useLayoutStore((state) => state.hiddenPanels);
  const setPanelVisible = useLayoutStore((state) => state.setPanelVisible);
  const showAllPanels = useLayoutStore((state) => state.showAllPanels);
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
      <div className="menu-separator" />
      <button role="menuitem" disabled={!hiddenPanels.length} onClick={showAllPanels}>
        Show all windows
      </button>
    </div>
  );
}
