import { SnapWidget } from '../../hooks/useSnapDrag';
import { PanelCloseButton } from '../common/PanelCloseButton';
import { Spinner } from '../common/Loading';
import type { SimulationRunState } from '../../stores/editor';
import { formatAccuracy } from '../../utils/formatAccuracy';

// Always-present score readout: placeholders while nothing is known, a shimmer while the first
// simulation runs, and the previous numbers (dimmed) after an edit and while a newer run is on its way.
export function SimulationOverlay({ state }: { state: SimulationRunState | undefined }) {
  const running = state?.status === 'running';
  const result = state?.result && state.result.status !== 'unsupported' ? state.result : null;
  // Edited since this result: it stays up, dimmed, until the next run.
  const stale = !!result && !!state?.stale && !running;
  const label = running
    ? 'SIMULATING'
    : stale
      ? 'OUTDATED · WAITING'
      : state?.status === 'error'
        ? 'SIMULATION FAILED'
        : state?.result?.status === 'unsupported'
          ? 'NOT SIMULATED'
          : result?.status === 'verified'
            ? 'SIMULATION VERIFIED'
            : result
              ? 'SIMULATION ESTIMATE'
              : 'SIMULATION';
  const placeholder = !result;
  return (
    <SnapWidget
      id="simulation"
      fallback="top-right"
      className={`score-overlay simulation-score-overlay${running ? ' running' : ''}${stale ? ' stale' : ''}${placeholder ? ' placeholder' : ''}`}
      title={state?.status === 'error' ? state.error : undefined}
    >
      <PanelCloseButton panel="simulation" className="overlay-close" />
      <small className="simulation-label">
        {running && <Spinner size={8} />}
        {label}
        {running && <span className="simulation-dots" aria-hidden="true" />}
      </small>
      {/* Keyed on the score so a fresh result replays the pop-in animation. */}
      <strong key={result ? `score-${result.score}` : 'score-none'} className={result ? 'simulation-pop' : undefined}>
        {result ? result.score.toLocaleString('en-US') : '-------'}
      </strong>
      <span>{result ? `${formatAccuracy(result)}%` : '---.--%'}</span>
      <small>{result ? `${result.maxCombo}x · ${result.misses} miss` : '---x · --- miss'}</small>
    </SnapWidget>
  );
}
