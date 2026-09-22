import type { PendingUpdate } from './hooks/useAutoUpdater';

export function UpdateDialog({
  update,
  installing,
  installError,
  onInstall,
  onDismiss,
}: {
  update: PendingUpdate;
  installing: boolean;
  installError: string | null;
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
        {installError && (
          <p className="map-flow-message" role="alert" style={{ color: '#ff8994' }}>
            Update failed: {installError}
          </p>
        )}
        <div className="map-flow-actions">
          <button className="map-flow-primary" disabled={installing} onClick={onInstall}>
            <span>
              <strong>{installing ? 'Installing…' : 'Update now'}</strong>
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
