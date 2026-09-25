import { X } from 'lucide-react';
import { panelLabels, useLayoutStore, type PanelId } from '../../stores/layout';

export function PanelCloseButton({ panel, className = '' }: { panel: PanelId; className?: string }) {
  const setPanelVisible = useLayoutStore((state) => state.setPanelVisible);
  return (
    <button
      type="button"
      className={`panel-close ${className}`}
      title={`Close ${panelLabels[panel]} (reopen from Window)`}
      aria-label={`Close ${panelLabels[panel]}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setPanelVisible(panel, false)}
    >
      <X size={12} />
    </button>
  );
}
