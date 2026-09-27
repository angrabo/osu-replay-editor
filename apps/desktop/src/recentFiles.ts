/// Recently opened projects and replay sets, remembered per machine (localStorage) by file path.
/// Paths only exist in the desktop app, so the browser preview never records anything.

export type RecentFile = { kind: 'project' | 'replays'; paths: string[]; label: string; openedAt: number };

const storageKey = 'osu-replay-editor.recent-files';
const limit = 10;

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function readRecentFiles(): RecentFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is RecentFile =>
            item &&
            (item.kind === 'project' || item.kind === 'replays') &&
            Array.isArray(item.paths) &&
            item.paths.length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

function writeRecentFiles(items: RecentFile[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(0, limit)));
  } catch {
    /* Recent files are a convenience; nothing to do when storage is unavailable. */
  }
}

const sameEntry = (first: Pick<RecentFile, 'kind' | 'paths'>, second: Pick<RecentFile, 'kind' | 'paths'>) =>
  first.kind === second.kind && first.paths.join('\n') === second.paths.join('\n');

export function recordRecentFile(kind: RecentFile['kind'], paths: string[]): void {
  if (!paths.length) return;
  const label =
    kind === 'project'
      ? fileName(paths[0])
      : paths.length === 1
        ? fileName(paths[0])
        : `${fileName(paths[0])} + ${paths.length - 1} more`;
  const entry: RecentFile = { kind, paths, label, openedAt: Date.now() };
  writeRecentFiles([entry, ...readRecentFiles().filter((item) => !sameEntry(item, entry))]);
}

export function forgetRecentFile(entry: Pick<RecentFile, 'kind' | 'paths'>): void {
  writeRecentFiles(readRecentFiles().filter((item) => !sameEntry(item, entry)));
}

export function clearRecentFiles(): void {
  writeRecentFiles([]);
}

/// Reads a replay or project the user picked earlier. Goes through a desktop command so files from
/// previous sessions open without the dialog having granted access to them first.
export async function readUserFile(path: string): Promise<ArrayBuffer> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ArrayBuffer>('read_user_file', { path });
}

export async function isDesktop(): Promise<boolean> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}
