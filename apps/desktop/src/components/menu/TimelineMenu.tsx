export function TimelineMenu({
  onCenterOnPlayhead,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  laneHeightDraft,
  onLaneHeightDraftChange,
  onApplyLaneHeight,
  onSaveDefaultLaneHeight,
  onResetLaneHeights,
  defaultLaneHeight,
}: {
  onCenterOnPlayhead: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  laneHeightDraft: number;
  onLaneHeightDraftChange: (value: number) => void;
  onApplyLaneHeight: () => void;
  onSaveDefaultLaneHeight: () => void;
  onResetLaneHeights: () => void;
  defaultLaneHeight: number;
}) {
  return (
    <div className="app-menu timeline-menu" role="menu">
      <button role="menuitem" onClick={onCenterOnPlayhead}>
        Center on playhead
      </button>
      <button role="menuitem" onClick={onZoomIn}>
        Zoom in
      </button>
      <button role="menuitem" onClick={onZoomOut}>
        Zoom out
      </button>
      <button role="menuitem" onClick={onResetZoom}>
        Reset zoom
      </button>
      <div className="menu-separator" />
      <span className="menu-heading">All track heights</span>
      <label>
        <span>Height</span>
        <input
          type="number"
          min="20"
          max="140"
          value={laneHeightDraft}
          onChange={(event) => onLaneHeightDraftChange(Number(event.target.value))}
        />
      </label>
      <button role="menuitem" onClick={onApplyLaneHeight}>
        Set to {Math.max(20, Math.min(140, Math.round(laneHeightDraft || 48)))} px
      </button>
      <button role="menuitem" onClick={onSaveDefaultLaneHeight}>
        Set as default
      </button>
      <button role="menuitem" onClick={onResetLaneHeights}>
        Use default ({defaultLaneHeight} px)
      </button>
    </div>
  );
}
