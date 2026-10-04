import { create } from 'zustand';

/// The one place the editor learns where osu! lives. Skins, hitsounds and the local beatmap
/// search all read the stable and lazer folders from here: a folder the user chose wins,
/// otherwise the detected one is used.
export type OsuClient = 'stable' | 'lazer';
type Paths = Record<OsuClient, string | null>;

type InstallsState = {
  // Folders the user chose; null means "use whatever is detected".
  chosen: Paths;
  detected: Paths;
  detecting: boolean;
  setPath: (client: OsuClient, path: string | null) => void;
  detect: () => Promise<void>;
};

const storageKey = 'osu-replay-editor.installs';
const none: Paths = { stable: null, lazer: null };
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

function readChosen(): Paths {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved) return { stable: text(saved.stable), lazer: text(saved.lazer) };
    // First run after the folders were unified: adopt the ones the map search and skins remembered.
    const maps = JSON.parse(localStorage.getItem('ore-map-locations') ?? '{}');
    const skin = JSON.parse(localStorage.getItem('osu-replay-editor.skin') ?? '{}');
    return { stable: text(maps.stable) ?? text(skin.osuDirectory), lazer: text(maps.lazer) };
  } catch {
    return { ...none };
  }
}

export const useInstallsStore = create<InstallsState>((set, get) => ({
  chosen: readChosen(),
  detected: { ...none },
  detecting: false,
  setPath: (client, path) => {
    const chosen = { ...get().chosen, [client]: text(path) };
    set({ chosen });
    try {
      localStorage.setItem(storageKey, JSON.stringify(chosen));
    } catch {
      /* the folder still applies for this session */
    }
  },
  // Looks for both installations: the engine knows the usual places for each client, and the
  // desktop shell also checks the registry for stable.
  detect: async () => {
    if (get().detecting) return;
    set({ detecting: true });
    const detected = { ...get().detected };
    try {
      const { sidecarRequest } = await import('../sidecar');
      const found = await sidecarRequest<Partial<Paths>>('/api/beatmaps/local/locations');
      detected.stable = text(found.stable) ?? detected.stable;
      detected.lazer = text(found.lazer) ?? detected.lazer;
    } catch {
      /* the engine may not be running; the shell can still find stable */
    }
    if (!detected.stable)
      try {
        const { invoke, isTauri } = await import('@tauri-apps/api/core');
        if (isTauri())
          detected.stable = text((await invoke<{ directory: string } | null>('detect_osu_stable'))?.directory);
      } catch {
        /* not found */
      }
    set({ detected, detecting: false });
  },
}));

/// The folder in use for a client: the chosen one, else the detected one.
export const installPath = (state: Pick<InstallsState, 'chosen' | 'detected'>, client: OsuClient) =>
  state.chosen[client] ?? state.detected[client];
