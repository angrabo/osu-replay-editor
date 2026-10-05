import { create } from 'zustand';

/// App-wide simulation preference: how long the editor waits after the last edit before it
/// simulates the replay again.
export const DEFAULT_EDIT_SIMULATION_DELAY_MS = 5000;
export const MAX_EDIT_SIMULATION_DELAY_MS = 600_000;
const storageKey = 'osu-replay-editor.simulation';

type SimulationPrefsState = {
  editDelayMs: number;
  setEditDelayMs: (ms: number) => void;
};

const clamp = (ms: unknown) =>
  typeof ms === 'number' && Number.isFinite(ms)
    ? Math.max(0, Math.min(MAX_EDIT_SIMULATION_DELAY_MS, Math.round(ms)))
    : DEFAULT_EDIT_SIMULATION_DELAY_MS;

function readSaved(): number {
  try {
    return clamp(JSON.parse(localStorage.getItem(storageKey) ?? 'null')?.editDelayMs);
  } catch {
    return DEFAULT_EDIT_SIMULATION_DELAY_MS;
  }
}

export const useSimulationPrefsStore = create<SimulationPrefsState>((set) => ({
  editDelayMs: readSaved(),
  setEditDelayMs: (ms) => {
    const editDelayMs = clamp(ms);
    set({ editDelayMs });
    try {
      localStorage.setItem(storageKey, JSON.stringify({ editDelayMs }));
    } catch {
      /* the preference still applies for this session */
    }
  },
}));
