import { useEffect, useState } from 'react';
import { UPDATER_ENABLED } from '../appMeta';
import { useUpdateChannelStore } from '../stores/updateChannel';

export type PendingUpdate = { version: string; body: string | null };
export type UpdateCheckResult = 'idle' | 'checking' | 'up-to-date' | 'error';
export type UpdateProgress = { stage: 'downloading' | 'installing'; downloaded: number; total: number | null };

type UpdateEvent =
  { event: 'progress'; data: { downloaded: number; total: number | null } } | { event: 'installing'; data?: undefined };

/// <summary>
/// Checks the chosen release channel (Settings › General) for a newer signed build: once on mount,
/// again when the channel changes, and on demand via checkNow — e.g. a "Check for updates"
/// settings button. Exposes the pending update, if any, so the UI can ask the user before
/// downloading, installing, and relaunching. checkNow always resolves (never throws); callers
/// read checkResult for the outcome. The check and install run in the desktop shell, which picks
/// the channel's manifest (see check_update / install_update in src-tauri).
/// </summary>
export function useAutoUpdater() {
  const channel = useUpdateChannelStore((state) => state.channel);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult>('idle');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const checkNow = () => {
    if (!UPDATER_ENABLED) {
      setCheckResult('error');
      return;
    }
    setCheckResult('checking');
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const update = await invoke<PendingUpdate | null>('check_update', {
          channel: useUpdateChannelStore.getState().channel,
        });
        setPendingUpdate(update ? { version: update.version, body: update.body ?? null } : null);
        setCheckResult(update ? 'idle' : 'up-to-date');
      } catch {
        setCheckResult('error');
      }
    })();
  };

  useEffect(() => {
    if (UPDATER_ENABLED) checkNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const install = () => {
    if (!pendingUpdate) return;
    setInstalling(true);
    setInstallError(null);
    void (async () => {
      try {
        const { invoke, Channel } = await import('@tauri-apps/api/core');
        const { relaunch } = await import('@tauri-apps/plugin-process');
        let reported = -1;
        setProgress({ stage: 'downloading', downloaded: 0, total: null });
        const onEvent = new Channel<UpdateEvent>();
        onEvent.onmessage = (message) => {
          if (message.event === 'installing') {
            setProgress((current) => ({
              stage: 'installing',
              downloaded: current?.downloaded ?? 0,
              total: current?.total ?? null,
            }));
            return;
          }
          const { downloaded, total } = message.data;
          // Chunks arrive far more often than the bar can change; re-render per 0.5% (or 256 KB).
          const step = total ? Math.floor((downloaded / total) * 200) : Math.floor(downloaded / 262144);
          if (step !== reported) {
            reported = step;
            setProgress({ stage: 'downloading', downloaded, total });
          }
        };
        await invoke('install_update', { onEvent });
        await relaunch();
      } catch (error) {
        console.error('Update install failed:', error);
        setInstallError(error instanceof Error ? error.message : String(error));
        setProgress(null);
        setInstalling(false);
        // The pending update was used up by the failed attempt; look again so Retry has one.
        checkNow();
      }
    })();
  };

  const dismiss = () => {
    setPendingUpdate(null);
    setInstallError(null);
  };

  return { pendingUpdate, installing, installError, progress, install, dismiss, checkNow, checkResult };
}
