import { FolderOpen, RefreshCw, X } from 'lucide-react';
import { installPath, useInstallsStore, type OsuClient } from '../../stores/installs';
import { InfoTip } from '../InfoTip';
import { Spinner } from '../common/Loading';

const rows: readonly (readonly [OsuClient, string, string])[] = [
  [
    'stable',
    'osu!stable folder',
    'The folder with osu!.exe, Songs and Skins. Used for skins, hitsounds and finding beatmaps you already have.',
  ],
  [
    'lazer',
    'osu!lazer folder',
    "lazer's data folder (the one with client.realm and files). Used for finding beatmaps you already have.",
  ],
];

/// Settings › Files: where osu!stable and osu!lazer live. Everything that reads from an
/// installation uses these two folders.
export function InstallSettings() {
  const state = useInstallsStore();
  const browse = async (client: OsuClient) => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ directory: true, multiple: false, title: `Choose your osu!${client} folder` });
      if (typeof picked === 'string') state.setPath(client, picked);
    } catch {
      /* The browser preview has no folder picker. */
    }
  };
  return (
    <>
      {rows.map(([client, title, info]) => {
        const path = installPath(state, client);
        const chosen = state.chosen[client] !== null;
        return (
          <div className="setting-row" key={client}>
            <span className="setting-row-title">
              {title}
              <InfoTip text={info} />
            </span>
            <div className="setting-row-control">
              {state.detecting && !path && <Spinner size={10} />}
              <code className="setting-path" title={path ?? undefined}>
                {path ?? 'Not found'}
              </code>
              {path && <span className="setting-value">{chosen ? 'chosen' : 'detected'}</span>}
              {chosen ? (
                <button
                  type="button"
                  title="Forget this folder and detect it"
                  onClick={() => state.setPath(client, null)}
                >
                  <X size={12} />
                </button>
              ) : (
                <button type="button" title="Detect again" onClick={() => void state.detect()}>
                  <RefreshCw size={12} />
                </button>
              )}
              <button type="button" title="Choose folder" onClick={() => void browse(client)}>
                <FolderOpen size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
