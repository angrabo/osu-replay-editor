import { create } from 'zustand';

/// App-wide skin and hitsound preferences: which osu! (stable) installation and skin to take
/// samples (and later graphics) from, and how loud hitsounds play. Saved per machine.
export type SkinState = {
  osuDirectory: string | null;
  skinName: string | null;
  hitsoundsEnabled: boolean;
  hitsoundVolume: number;
  // Which parts come from the osu! skin; the rest uses the editor's own look.
  useSkinCircles: boolean;
  useSkinCursor: boolean;
  useSkinHitsounds: boolean;
  // Lower-cased file names in the selected skin, so lookups need no probing.
  skinFiles: ReadonlySet<string>;
  skins: string[];
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  message: string;
  setOsuDirectory: (directory: string | null) => void;
  setSkinName: (skin: string | null) => void;
  setHitsoundsEnabled: (enabled: boolean) => void;
  setHitsoundVolume: (volume: number) => void;
  setSkinUse: (part: 'circles' | 'cursor' | 'hitsounds', enabled: boolean) => void;
  refresh: () => Promise<void>;
  detect: () => Promise<void>;
};

const storageKey = 'osu-replay-editor.skin';

type Saved = Pick<
  SkinState,
  | 'osuDirectory'
  | 'skinName'
  | 'hitsoundsEnabled'
  | 'hitsoundVolume'
  | 'useSkinCircles'
  | 'useSkinCursor'
  | 'useSkinHitsounds'
>;

function readSaved(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return {
      osuDirectory: typeof saved.osuDirectory === 'string' ? saved.osuDirectory : null,
      skinName: typeof saved.skinName === 'string' ? saved.skinName : null,
      hitsoundsEnabled: saved.hitsoundsEnabled !== false,
      hitsoundVolume:
        Number.isFinite(saved.hitsoundVolume) && saved.hitsoundVolume >= 0 && saved.hitsoundVolume <= 100
          ? saved.hitsoundVolume
          : 60,
      useSkinCircles: saved.useSkinCircles !== false,
      useSkinCursor: saved.useSkinCursor !== false,
      useSkinHitsounds: saved.useSkinHitsounds !== false,
    };
  } catch {
    return {
      osuDirectory: null,
      skinName: null,
      hitsoundsEnabled: true,
      hitsoundVolume: 60,
      useSkinCircles: true,
      useSkinCursor: true,
      useSkinHitsounds: true,
    };
  }
}

function save(state: SkinState) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        osuDirectory: state.osuDirectory,
        skinName: state.skinName,
        hitsoundsEnabled: state.hitsoundsEnabled,
        hitsoundVolume: state.hitsoundVolume,
        useSkinCircles: state.useSkinCircles,
        useSkinCursor: state.useSkinCursor,
        useSkinHitsounds: state.useSkinHitsounds,
      }),
    );
  } catch {
    /* Preferences still apply for this session. */
  }
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke, isTauri } = await import('@tauri-apps/api/core');
  if (!isTauri()) throw new Error('not-desktop');
  return invoke<T>(command, args);
}

export async function readSkinFile(directory: string, skin: string, file: string): Promise<ArrayBuffer> {
  return invokeDesktop<ArrayBuffer>('read_skin_file', { directory, skin, file });
}

export const useSkinStore = create<SkinState>((set, get) => ({
  ...readSaved(),
  skinFiles: new Set(),
  skins: [],
  status: 'idle',
  message: '',
  setOsuDirectory: (osuDirectory) => {
    set({ osuDirectory, skinName: null });
    save(get());
    void get().refresh();
  },
  setSkinName: (skinName) => {
    set({ skinName });
    save(get());
    void get().refresh();
  },
  setHitsoundsEnabled: (hitsoundsEnabled) => {
    set({ hitsoundsEnabled });
    save(get());
  },
  setHitsoundVolume: (volume) => {
    set({ hitsoundVolume: Math.max(0, Math.min(100, Math.round(volume))) });
    save(get());
  },
  setSkinUse: (part, enabled) => {
    set(
      part === 'circles'
        ? { useSkinCircles: enabled }
        : part === 'cursor'
          ? { useSkinCursor: enabled }
          : { useSkinHitsounds: enabled },
    );
    save(get());
  },
  // Reloads the skin list and the selected skin's files.
  refresh: async () => {
    const { osuDirectory } = get();
    if (!osuDirectory) {
      set({ skins: [], skinFiles: new Set(), status: 'idle' });
      return;
    }
    set({ status: 'loading', message: '' });
    try {
      const skins = await invokeDesktop<string[]>('list_stable_skins', { directory: osuDirectory });
      let skinName = get().skinName;
      if (!skinName || !skins.includes(skinName)) {
        skinName =
          (await invokeDesktop<string | null>('osu_stable_current_skin', { directory: osuDirectory })) ??
          skins[0] ??
          null;
        set({ skinName });
        save(get());
      }
      const files = skinName
        ? await invokeDesktop<string[]>('list_skin_files', { directory: osuDirectory, skin: skinName })
        : [];
      set({ skins, skinFiles: new Set(files), status: 'ready' });
    } catch (error) {
      const text = String((error as Error)?.message ?? error);
      set({
        skins: [],
        skinFiles: new Set(),
        status: text === 'not-desktop' ? 'unavailable' : 'error',
        message: text === 'not-desktop' ? 'Skins are available in the desktop app.' : text,
      });
    }
  },
  // Finds the osu! installation on first run; keeps a folder the user already picked.
  detect: async () => {
    if (get().osuDirectory) return get().refresh();
    try {
      const found = await invokeDesktop<{ directory: string; currentSkin: string | null } | null>('detect_osu_stable');
      if (!found) {
        set({ status: 'error', message: 'osu! (stable) was not found. Choose its folder in Settings.' });
        return;
      }
      set({ osuDirectory: found.directory, skinName: found.currentSkin });
      save(get());
      await get().refresh();
    } catch (error) {
      const text = String((error as Error)?.message ?? error);
      set({ status: text === 'not-desktop' ? 'unavailable' : 'error', message: text === 'not-desktop' ? '' : text });
    }
  },
}));
