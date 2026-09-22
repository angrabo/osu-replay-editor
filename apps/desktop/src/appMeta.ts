/// <summary>
/// App build metadata: bump alongside package.json and src-tauri/tauri.conf.json on release.
/// </summary>
export const APP_VERSION = '0.1.0';

export const REPOSITORY = {
  owner: 'your-github-username',
  name: 'osu-replay-editor',
};

/// <summary>
/// Flip on once REPOSITORY points at the real GitHub repo and the release workflow has
/// published at least one signed build (tauri.conf.json's updater.endpoints must resolve).
/// </summary>
export const UPDATER_ENABLED = false;

export function releasesUrl(): string {
  return `https://github.com/${REPOSITORY.owner}/${REPOSITORY.name}/releases`;
}
