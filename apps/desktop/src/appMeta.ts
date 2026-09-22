/// <summary>
/// App build metadata: bump alongside package.json and src-tauri/tauri.conf.json on release.
/// </summary>
export const APP_VERSION = '0.1.5';

export const REPOSITORY = {
  owner: 'angrabo',
  name: 'osu-replay-editor',
};

export const UPDATER_ENABLED = true;

export function releasesUrl(): string {
  return `https://github.com/${REPOSITORY.owner}/${REPOSITORY.name}/releases`;
}
