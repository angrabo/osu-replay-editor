import { useEffect, useState } from 'react';
import { CHANGELOG, type ChangelogEntry } from './changelog';
import { APP_VERSION, REPOSITORY, releasesUrl, UPDATER_ENABLED } from './appMeta';
import { renderMarkdown } from './utils/markdown';

type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
};

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
        body: release.body?.trim() || '_No release notes._',
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
      <div className="settings-window changelog-window" onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h2>Changelog</h2>
            <span>
              Version {APP_VERSION}
              {loading ? ' · loading from GitHub…' : ''}
            </span>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="changelog-body">
          {entries.map((entry) => (
            <article className="changelog-entry" key={entry.version}>
              <div className="changelog-entry-heading">
                <strong>{entry.version}</strong>
                {entry.date && <small>{entry.date}</small>}
              </div>
              {renderMarkdown(entry.body)}
            </article>
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
    </div>
  );
}
