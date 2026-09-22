import { useEffect, useState } from 'react';
import { CHANGELOG, type ChangelogEntry } from './changelog';
import { APP_VERSION, REPOSITORY, releasesUrl, UPDATER_ENABLED } from './appMeta';

type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
};

function notesFromBody(body: string | null): string[] {
  return (body ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

async function fetchGithubChangelog(): Promise<ChangelogEntry[] | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}/releases`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const releases: GithubRelease[] = await response.json();
    const entries = releases
      .filter((release) => !release.draft)
      .map((release): ChangelogEntry => ({
        version: release.tag_name.replace(/^v/, ''),
        date: release.published_at?.slice(0, 10) ?? '',
        notes: notesFromBody(release.body).length ? notesFromBody(release.body) : ['No release notes.'],
      }));
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ChangelogEntry[]>(CHANGELOG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchGithubChangelog().then((fromGithub) => {
      if (!cancelled && fromGithub) setEntries(fromGithub);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>Changelog</h2>
            <span className="modal-subtitle">
              Version {APP_VERSION}
              {loading ? ' · loading from GitHub…' : ''}
            </span>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {entries.map((entry) => (
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
