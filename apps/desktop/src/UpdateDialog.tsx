import type { PendingUpdate, UpdateProgress } from './hooks/useAutoUpdater';

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function UpdateDialog({
  update,
  installing,
  installError,
  progress,
  onInstall,
  onDismiss,
}: {
  update: PendingUpdate;
  installing: boolean;
  installError: string | null;
  progress: UpdateProgress | null;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={() => !installing && onDismiss()}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>Update available</h2>
            <span className="modal-subtitle">Version {update.version}</span>
          </div>
          {!installing && (
            <button aria-label="Close" onClick={onDismiss}>
              ×
            </button>
          )}
        </div>
        {update.body && <p style={{ whiteSpace: 'pre-wrap' }}>{update.body}</p>}
        {progress && (
          <div className="update-progress" role="status" aria-live="polite">
            <div className="update-progress-label">
              <span>
                {progress.stage === 'downloading' ? 'Downloading update…' : 'Installing — the app will restart'}
              </span>
              <span>
                {progress.total
                  ? `${megabytes(progress.downloaded)} / ${megabytes(progress.total)} · ${Math.floor((progress.downloaded / progress.total) * 100)}%`
                  : megabytes(progress.downloaded)}
              </span>
            </div>
            <div
              className={`update-progress-track${progress.total || progress.stage === 'installing' ? '' : ' indeterminate'}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.total ? Math.floor((progress.downloaded / progress.total) * 100) : undefined}
            >
              <div
                className="update-progress-fill"
                style={{
                  width:
                    progress.stage === 'installing'
                      ? '100%'
                      : progress.total
                        ? `${(progress.downloaded / progress.total) * 100}%`
                        : '35%',
                }}
              />
            </div>
          </div>
        )}
        {installError && (
          <p className="map-flow-message" role="alert" style={{ color: '#ff8994' }}>
            Update failed: {installError}
          </p>
        )}
        <div className="map-flow-actions">
          <button className="map-flow-primary" disabled={installing} onClick={onInstall}>
            <span>
              <strong>
                {installing ? (progress?.stage === 'installing' ? 'Installing…' : 'Downloading…') : 'Update now'}
              </strong>
              <small>Downloads, installs, and restarts the app</small>
            </span>
          </button>
          <button className="map-flow-new" disabled={installing} onClick={onDismiss}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
