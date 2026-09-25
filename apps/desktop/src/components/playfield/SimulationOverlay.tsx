import { SnapWidget } from '../../hooks/useSnapDrag';
import { PanelCloseButton } from '../common/PanelCloseButton';
import type { SimulationResult } from '../../stores/editor';
import { formatAccuracy } from '../../utils/formatAccuracy';

export function SimulationOverlay({ simulation }: { simulation: SimulationResult }) {
  return (
    <SnapWidget id="simulation" fallback="top-right" className="score-overlay simulation-score-overlay">
      <PanelCloseButton panel="simulation" className="overlay-close" />
      <small>{simulation.status === 'verified' ? 'SIMULATION VERIFIED' : 'SIMULATION ESTIMATE'}</small>
      <strong>{simulation.score.toLocaleString('en-US')}</strong>
      <span>{formatAccuracy(simulation)}%</span>
      <small>
        {simulation.maxCombo}x · {simulation.misses} miss
      </small>
    </SnapWidget>
  );
}
