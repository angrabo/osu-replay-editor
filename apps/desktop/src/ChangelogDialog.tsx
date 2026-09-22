import { CHANGELOG } from './changelog';
import { APP_VERSION, releasesUrl, UPDATER_ENABLED } from './appMeta';

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>Changelog</h2>
            <span className="modal-subtitle">Version {APP_VERSION}</span>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {CHANGELOG.map((entry) => (
          <div key={entry.version} style={{ marginBottom: 18 }}>
            <strong>
              {entry.version} <small style={{ opacity: 0.6 }}>{entry.date}</small>
            </strong>
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              {entry.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ))}
        {!UPDATER_ENABLED && (
          <p className="map-flow-message">
            Automatic updates aren't set up yet — check{' '}
            <a href={releasesUrl()} target="_blank" rel="noreferrer">
              GitHub releases
            </a>{' '}
            for new versions.
          </p>
        )}
      </div>
    </div>
  );
}
