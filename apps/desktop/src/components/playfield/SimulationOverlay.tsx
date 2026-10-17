import { RefreshCw } from 'lucide-react';
import { SnapWidget } from '../../hooks/useSnapDrag';
import { useSimulationPrefsStore } from '../../stores/simulationPrefs';
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
  // Only the objects around the edits were checked again: score and combo wait for a whole run.
  const partial = stale && !!state?.partial;
  const requestWholeRun = useSimulationPrefsStore((prefs) => prefs.requestWholeRun);
  const label = running
    ? 'SIMULATING'
    : partial
      ? 'PARTIAL · OUTDATED'
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
        {partial && (
          <button
            type="button"
            className="simulation-whole-run"
            title="Only the objects around your edits were simulated. Simulate the whole replay for the score and combo."
            aria-label="Simulate the whole replay"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={requestWholeRun}
          >
            <RefreshCw size={10} />
          </button>
        )}
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
