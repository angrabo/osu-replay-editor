import { useState } from 'react';

type UpdateDiagnosis = {
  currentVersion: string;
  remoteVersion: string | null;
  downloadUrl: string | null;
  manifest: unknown;
  downloadedBytes: number | null;
  error: string | null;
};

// Dev-build tool: runs the real update check + download + signature verification (without
// installing) and shows every step, so a failing update can be diagnosed.
export function UpdateDiagnostics() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<UpdateDiagnosis | string | null>(null);

  const run = () => {
    setRunning(true);
    setResult(null);
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        setResult(await invoke<UpdateDiagnosis>('diagnose_update'));
      } catch (error) {
        setResult(`The diagnostics command could not run: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setRunning(false);
      }
    })();
  };

  return (
    <div className="setting-preview update-diagnostics">
      <div>
        <strong>Update diagnostics (dev build)</strong>
        <small>
          Fetches the release manifest, downloads the installer and verifies its signature. Nothing is installed.
        </small>
        {typeof result === 'string' && <pre className="update-diagnostics-output error">{result}</pre>}
        {result && typeof result !== 'string' && (
          <pre className={`update-diagnostics-output${result.error ? ' error' : ''}`}>
            {[
              `Installed version: ${result.currentVersion}`,
              `Manifest version: ${result.remoteVersion ?? '—'}`,
              `Download URL: ${result.downloadUrl ?? '—'}`,
              result.downloadedBytes !== null
                ? `Download + signature: OK (${(result.downloadedBytes / 1024 / 1024).toFixed(1)} MB)`
                : `Error: ${result.error ?? 'unknown'}`,
              '',
              'Manifest:',
              result.manifest ? JSON.stringify(result.manifest, null, 2) : '—',
            ].join('\n')}
          </pre>
        )}
      </div>
      <button disabled={running} onClick={run}>
        {running ? 'Running…' : 'Run diagnostics'}
      </button>
    </div>
  );
}
