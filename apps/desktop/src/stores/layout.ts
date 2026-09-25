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

type LayoutState = {
  hiddenPanels: PanelId[];
  setPanelVisible: (id: PanelId, visible: boolean) => void;
  showAllPanels: () => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
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
