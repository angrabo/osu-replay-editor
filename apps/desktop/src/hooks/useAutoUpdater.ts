import { useEffect } from 'react';
import { UPDATER_ENABLED } from '../appMeta';
import { useEditorStore } from '../stores/editor';

/// <summary>
/// Checks the configured GitHub release endpoint for a newer signed build and, if found,
/// downloads/installs it and relaunches. No-ops entirely while UPDATER_ENABLED is false.
/// </summary>
export function useAutoUpdater() {
  useEffect(() => {
    if (!UPDATER_ENABLED) return;
    void (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const { relaunch } = await import('@tauri-apps/plugin-process');
        const update = await check();
        if (!update) return;
        useEditorStore.setState({ lastEditMessage: `Downloading update ${update.version}…` });
        await update.downloadAndInstall();
        await relaunch();
      } catch {
        // Offline, no release yet, or running outside Tauri — silently skip.
      }
    })();
  }, []);
}
