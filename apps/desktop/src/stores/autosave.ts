import { create } from 'zustand';

/// App-wide autosave preference: whether the open project is saved on a timer, and how often.
export const AUTOSAVE_INTERVALS = [1, 5, 10, 15, 30, 60];
const DEFAULT_MINUTES = 15;
const storageKey = 'osu-replay-editor.autosave';

type AutosaveState = {
  enabled: boolean;
  minutes: number;
  setEnabled: (enabled: boolean) => void;
  setMinutes: (minutes: number) => void;
};

function readSaved(): Pick<AutosaveState, 'enabled' | 'minutes'> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return {
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : true,
      minutes: AUTOSAVE_INTERVALS.includes(saved?.minutes) ? saved.minutes : DEFAULT_MINUTES,
    };
  } catch {
    return { enabled: true, minutes: DEFAULT_MINUTES };
  }
}

export const useAutosaveStore = create<AutosaveState>((set, get) => {
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ enabled: get().enabled, minutes: get().minutes }));
    } catch {
      /* the preference still applies for this session */
    }
  };
  return {
    ...readSaved(),
    setEnabled: (enabled) => {
      set({ enabled });
      persist();
    },
    setMinutes: (minutes) => {
      if (!AUTOSAVE_INTERVALS.includes(minutes)) return;
      set({ minutes });
      persist();
    },
  };
});
