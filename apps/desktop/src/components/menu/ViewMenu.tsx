export function ViewMenu({
  splitView,
  onSingleView,
  onSplitView,
  onOpenSettings,
  onOpenChangelog,
}: {
  splitView: boolean;
  onSingleView: () => void;
  onSplitView: () => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
}) {
  return (
    <div className="app-menu" role="menu">
      <button role="menuitemradio" aria-checked={!splitView} onClick={onSingleView}>
        {!splitView ? '✓ ' : ''}Single view
      </button>
      <button role="menuitemradio" aria-checked={splitView} onClick={onSplitView}>
        {splitView ? '✓ ' : ''}Side by side
      </button>
      <div className="menu-separator" />
      <button role="menuitem" onClick={onOpenSettings}>
        Display settings…
      </button>
      <button role="menuitem" onClick={onOpenChangelog}>
        Changelog…
      </button>
    </div>
  );
}
