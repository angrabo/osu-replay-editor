import { useEffect, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { UPDATER_ENABLED } from '../appMeta';

export type PendingUpdate = { version: string; body: string | null };
export type UpdateCheckResult = 'idle' | 'checking' | 'up-to-date' | 'error';

/// <summary>
/// Checks the configured GitHub release endpoint for a newer signed build (once on mount, and
/// on demand via checkNow — e.g. a "Check for updates" settings button). Exposes the pending
/// update, if any, so the UI can ask the user before downloading, installing, and relaunching.
/// checkNow always resolves (never throws); callers read checkResult for the outcome.
/// </summary>
export function useAutoUpdater() {
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult>('idle');
  const [updateHandle, setUpdateHandle] = useState<Update | null>(null);

  const checkNow = () => {
    if (!UPDATER_ENABLED) {
      setCheckResult('error');
      return;
    }
    setCheckResult('checking');
    void (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          setUpdateHandle(update);
          setPendingUpdate({ version: update.version, body: update.body ?? null });
          setCheckResult('idle');
        } else {
          setCheckResult('up-to-date');
        }
      } catch {
        setCheckResult('error');
      }
    })();
  };

  useEffect(() => {
    if (UPDATER_ENABLED) checkNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = () => {
    if (!updateHandle) return;
    setInstalling(true);
    void (async () => {
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await updateHandle.downloadAndInstall();
        await relaunch();
      } catch {
        setInstalling(false);
      }
    })();
  };

  const dismiss = () => setPendingUpdate(null);

  return { pendingUpdate, installing, install, dismiss, checkNow, checkResult };
}
