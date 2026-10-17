import { create } from 'zustand';

/// App-wide simulation preferences: how long the editor waits after the last edit before it
/// simulates the replay again, and whether that run covers the whole replay or only the objects
/// around the edit.
export const DEFAULT_EDIT_SIMULATION_DELAY_MS = 5000;
export const MAX_EDIT_SIMULATION_DELAY_MS = 600_000;
export const DEFAULT_AROUND_EDIT_MS = 2000;
export const MAX_AROUND_EDIT_MS = 60_000;
const storageKey = 'osu-replay-editor.simulation';

export type AfterEditScope = 'whole' | 'around';
type Saved = { editDelayMs: number; afterEdit: AfterEditScope; aroundMs: number };

type SimulationPrefsState = Saved & {
  setEditDelayMs: (ms: number) => void;
  setAfterEdit: (scope: AfterEditScope) => void;
  setAroundMs: (ms: number) => void;
  // Bumped to ask the runner for a whole-replay run (after a partial one); not saved.
  wholeRunRequest: number;
  requestWholeRun: () => void;
};

const clampTo = (ms: unknown, max: number, fallback: number) =>
  typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, Math.min(max, Math.round(ms))) : fallback;

function readSaved(): Saved {
  let saved: Partial<Saved> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  } catch {
    /* defaults below */
  }
  return {
    editDelayMs: clampTo(saved?.editDelayMs, MAX_EDIT_SIMULATION_DELAY_MS, DEFAULT_EDIT_SIMULATION_DELAY_MS),
    afterEdit: saved?.afterEdit === 'around' ? 'around' : 'whole',
    aroundMs: clampTo(saved?.aroundMs, MAX_AROUND_EDIT_MS, DEFAULT_AROUND_EDIT_MS),
  };
}

export const useSimulationPrefsStore = create<SimulationPrefsState>((set, get) => {
  const save = (patch: Partial<Saved>) => {
    set(patch);
    const { editDelayMs, afterEdit, aroundMs } = get();
    try {
      localStorage.setItem(storageKey, JSON.stringify({ editDelayMs, afterEdit, aroundMs }));
    } catch {
      /* the preference still applies for this session */
    }
  };
  return {
    ...readSaved(),
    setEditDelayMs: (ms) =>
      save({ editDelayMs: clampTo(ms, MAX_EDIT_SIMULATION_DELAY_MS, DEFAULT_EDIT_SIMULATION_DELAY_MS) }),
    setAfterEdit: (afterEdit) => save({ afterEdit }),
    setAroundMs: (ms) => save({ aroundMs: clampTo(ms, MAX_AROUND_EDIT_MS, DEFAULT_AROUND_EDIT_MS) }),
    wholeRunRequest: 0,
    requestWholeRun: () => set((state) => ({ wholeRunRequest: state.wholeRunRequest + 1 })),
  };
});
