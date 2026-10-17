import { useEffect } from 'react';
import { InfoTip } from '../InfoTip';
import { Spinner } from '../common/Loading';
import { usePerformanceStore } from '../../stores/performance';

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/// Settings › General: the optional pp calculator. It is not part of the app download; the user
/// fetches it here (about 50 MB, checked against the release's checksum) or removes it again.
export function PerformanceSettings() {
  const status = usePerformanceStore((state) => state.status);
  const busy = usePerformanceStore((state) => state.busy);
  const message = usePerformanceStore((state) => state.message);
  useEffect(() => {
    void usePerformanceStore.getState().refresh();
  }, []);
  const installed = status?.installed ?? false;
  return (
    <div className="setting-row">
      <span className="setting-row-title">
        Performance points (pp)
        <InfoTip text="Shows the pp of each simulated play, calculated by osu!'s own code so it matches the game. The calculator is a separate download of about 50 MB, made for this version of the editor." />
      </span>
      <div className="setting-row-control">
        {busy && <Spinner size={10} />}
        <span className="setting-value" title={message || undefined}>
          {busy === 'install'
            ? 'Downloading…'
            : busy === 'remove'
              ? 'Removing…'
              : installed
                ? `osu! ${status?.calculator ?? ''}${status?.bytes ? ` · ${megabytes(status.bytes)}` : ''}`
                : message || status?.message || (status ? 'Not installed' : 'Engine not running')}
        </span>
        {installed ? (
          <button type="button" disabled={!!busy} onClick={() => void usePerformanceStore.getState().remove()}>
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={!!busy || !status}
            onClick={() => void usePerformanceStore.getState().install()}
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}
