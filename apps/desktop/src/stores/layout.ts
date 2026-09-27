import { create } from 'zustand';

export type PanelId =
  | 'explorer'
  | 'tracks'
  | 'inspector'
  | 'selection'
  | 'timeline'
  | 'quickbar'
  | 'toolOptions'
  | 'stats'
  | 'viewControls'
  | 'simulation'
  | 'previewBadge';

export const panelLabels: Record<PanelId, string> = {
  explorer: 'Explorer',
  tracks: 'Tracks',
  inspector: 'Inspector',
  selection: 'Selection',
  timeline: 'Timeline',
  quickbar: 'Tool bar',
  toolOptions: 'Tool options',
  stats: 'Difficulty stats',
  viewControls: 'Zoom & trail',
  simulation: 'Simulation score',
  previewBadge: 'Preview label',
};

const storageKey = 'osu-replay-editor.hidden-panels';

function readHidden(): PanelId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (Array.isArray(saved)) return saved.filter((id): id is PanelId => typeof id === 'string' && id in panelLabels);
  } catch {
    /* unreadable preference: show everything */
  }
  return [];
}

function persist(hidden: PanelId[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(hidden));
  } catch {
    /* storage unavailable: layout just won't persist */
  }
}

export type FloatablePanelId = 'explorer' | 'tracks' | 'inspector' | 'selection' | 'timeline';
export type FloatingRect = { x: number; y: number; width: number; height: number };

const floatingStorageKey = 'osu-replay-editor.floating-panels';
const snapStorageKey = 'osu-replay-editor.snap-widgets';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: layout just won't persist */
  }
}

type LayoutState = {
  hiddenPanels: PanelId[];
  // Panels popped out of the docked layout into floating windows, with their window rects.
  floatingPanels: Partial<Record<FloatablePanelId, FloatingRect>>;
  // When false, playfield widgets stay exactly where they are dropped instead of snapping.
  snapWidgets: boolean;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
  showAllPanels: () => void;
  popOutPanel: (id: FloatablePanelId, rect: FloatingRect) => void;
  setFloatingRect: (id: FloatablePanelId, rect: FloatingRect) => void;
  dockPanel: (id: FloatablePanelId) => void;
  setSnapWidgets: (snap: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  floatingPanels: readJson(floatingStorageKey, {}),
  snapWidgets: readJson<boolean>(snapStorageKey, true) !== false,
  popOutPanel: (id, rect) =>
    set((state) => {
      const floatingPanels = { ...state.floatingPanels, [id]: rect };
      writeJson(floatingStorageKey, floatingPanels);
      return { floatingPanels };
    }),
  setFloatingRect: (id, rect) =>
    set((state) => {
      if (!state.floatingPanels[id]) return {};
      const floatingPanels = { ...state.floatingPanels, [id]: rect };
      writeJson(floatingStorageKey, floatingPanels);
      return { floatingPanels };
    }),
  dockPanel: (id) =>
    set((state) => {
      const floatingPanels = { ...state.floatingPanels };
      delete floatingPanels[id];
      writeJson(floatingStorageKey, floatingPanels);
      return { floatingPanels };
    }),
  setSnapWidgets: (snapWidgets) => {
    writeJson(snapStorageKey, snapWidgets);
    set({ snapWidgets });
  },
  hiddenPanels: readHidden(),
  setPanelVisible: (id, visible) =>
    set((state) => {
      const hiddenPanels = visible
        ? state.hiddenPanels.filter((panel) => panel !== id)
        : state.hiddenPanels.includes(id)
          ? state.hiddenPanels
          : [...state.hiddenPanels, id];
      persist(hiddenPanels);
      return { hiddenPanels };
    }),
  showAllPanels: () => {
    persist([]);
    set({ hiddenPanels: [] });
  },
}));

export const usePanelVisible = (id: PanelId) => useLayoutStore((state) => !state.hiddenPanels.includes(id));
