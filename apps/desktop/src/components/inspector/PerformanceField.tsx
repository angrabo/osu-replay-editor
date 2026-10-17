import { Field } from '../common/Field';
import { Spinner } from '../common/Loading';
import { usePerformance, usePerformanceStore } from '../../stores/performance';

/// The play's pp in the simulation result, with the parts it is made of in the tooltip. Shown only
/// once the optional calculator is installed.
export function PerformanceField({ trackId }: { trackId: string }) {
  const installed = usePerformanceStore((state) => state.status?.installed ?? false);
  const entry = usePerformance(trackId);
  if (!installed) return null;
  if (!entry || entry.running)
    return (
      <div className="field-row performance-pending">
        <span>PP</span>
        <Spinner size={10} />
      </div>
    );
  if (entry.error || !entry.result) return <Field label="PP" value="—" />;
  const { pp, aim, speed, accuracy, flashlight, stars, calculator } = entry.result;
  return (
    <div
      title={`Aim ${aim.toFixed(1)} · Speed ${speed.toFixed(1)} · Accuracy ${accuracy.toFixed(1)}${flashlight ? ` · Flashlight ${flashlight.toFixed(1)}` : ''}\nosu! ${calculator}`}
    >
      <Field label="PP" value={`${pp.toFixed(2)} pp · ${stars.toFixed(2)}★`} positive />
    </div>
  );
}
