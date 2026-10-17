import { create } from 'zustand';
import type { Resolution } from '../MapAcquisition';
import { APP_VERSION } from '../appMeta';
import { isLazerVersion } from '../mods';
import { sidecarRequest } from '../sidecar';
import { useEditorStore, type SimulationResult, type Track } from './editor';

/// Performance points from the optional pp calculator (osu!'s own code, downloaded on demand).
export type PerformanceResult = {
  pp: number;
  aim: number;
  speed: number;
  accuracy: number;
  flashlight: number;
  stars: number;
  maxCombo: number;
  scoreAccuracy: number;
  calculator: string;
};
export type PerformanceStatus = {
  installed: boolean;
  calculator: string | null;
  bytes: number | null;
  message?: string | null;
};
// One calculation per simulation result: `source` is the result it was made from.
type Entry = { source: SimulationResult; result?: PerformanceResult; error?: string; running: boolean };

type PerformanceState = {
  status: PerformanceStatus | null;
  busy: 'install' | 'remove' | null;
  message: string;
  results: Record<string, Entry>;
  refresh: () => Promise<void>;
  install: () => Promise<void>;
  remove: () => Promise<void>;
  calculate: (track: Track, simulation: SimulationResult, resolution: Resolution) => Promise<void>;
};

type Counts = {
  great: number;
  ok: number;
  meh: number;
  miss: number;
  largeTickHit: number;
  largeTickMiss: number;
  sliderTailHit: number;
  smallBonus: number;
  largeBonus: number;
};
const none: Counts = {
  great: 0,
  ok: 0,
  meh: 0,
  miss: 0,
  largeTickHit: 0,
  largeTickMiss: 0,
  sliderTailHit: 0,
  smallBonus: 0,
  largeBonus: 0,
};

/// The simulated counts in lazer's terms. Stable plays are rated as lazer imports them (with
/// Classic), from the hit counts alone; lazer plays also count slider ticks, ends and spinners.
export function performanceCounts(
  simulation: SimulationResult,
  lazer: boolean,
): { statistics: Counts; maximum: Counts } {
  const objects = simulation.count300 + simulation.count100 + simulation.count50 + simulation.misses;
  const hits = {
    great: simulation.count300,
    ok: simulation.count100,
    meh: simulation.count50,
    miss: simulation.misses,
  };
  if (!lazer) return { statistics: { ...none, ...hits }, maximum: { ...none, great: objects } };
  return {
    statistics: {
      ...hits,
      largeTickHit: simulation.sliderTicksHit,
      largeTickMiss: simulation.sliderTicksTotal - simulation.sliderTicksHit,
      sliderTailHit: simulation.sliderEndsHit,
      smallBonus: simulation.spinnerSpinsHit,
      largeBonus: simulation.spinnerBonusHit,
    },
    maximum: {
      ...none,
      great: objects,
      largeTickHit: simulation.sliderTicksTotal,
      sliderTailHit: simulation.sliderEndsTotal,
      smallBonus: simulation.spinnerSpinsTotal,
      largeBonus: simulation.spinnerBonusTotal,
    },
  };
}

const errorText = (error: unknown) => String((error as Error)?.message ?? error);

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  status: null,
  busy: null,
  message: '',
  results: {},
  refresh: async () => {
    try {
      set({ status: await sidecarRequest<PerformanceStatus>('/api/performance/status') });
    } catch {
      /* the engine is not running yet (or this is the browser preview) */
    }
  },
  install: async () => {
    set({ busy: 'install', message: '' });
    try {
      const status = await sidecarRequest<PerformanceStatus>('/api/performance/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: APP_VERSION }),
      });
      set({ status, message: status.installed ? 'Installed.' : (status.message ?? '') });
    } catch (error) {
      set({ message: errorText(error) });
    } finally {
      set({ busy: null });
    }
  },
  remove: async () => {
    set({ busy: 'remove', message: '' });
    try {
      set({ status: await sidecarRequest<PerformanceStatus>('/api/performance', { method: 'DELETE' }), results: {} });
    } catch (error) {
      set({ message: errorText(error) });
    } finally {
      set({ busy: null });
    }
  },
  calculate: async (track, simulation, resolution) => {
    const metadata = track.exportMetadata;
    const difficulty = resolution.difficulties.find(
      (item) => item.checksum.toLowerCase() === metadata.beatmapHash.toLowerCase(),
    );
    if (!difficulty) return;
    const lazer = isLazerVersion(metadata.version);
    const { statistics, maximum } = performanceCounts(simulation, lazer);
    set((state) => ({ results: { ...state.results, [track.id]: { source: simulation, running: true } } }));
    const settle = (entry: Omit<Entry, 'source' | 'running'>) =>
      set((state) =>
        // A newer simulation may have started a newer calculation meanwhile.
        state.results[track.id]?.source === simulation
          ? { results: { ...state.results, [track.id]: { source: simulation, running: false, ...entry } } }
          : {},
      );
    try {
      const result = await sidecarRequest<PerformanceResult>('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash: metadata.beatmapHash,
          filename: difficulty.filename,
          client: lazer ? 'lazer' : 'stable',
          mods: metadata.mods,
          lazerMods: lazer ? (metadata.lazerMods ?? []) : [],
          lazerScoreInfo: lazer ? (metadata.lazerScoreInfo ?? null) : null,
          maxCombo: simulation.maxCombo,
          statistics,
          maximumStatistics: maximum,
        }),
      });
      settle({ result });
    } catch (error) {
      settle({ error: errorText(error) });
    }
  },
}));

/// The pp of a track's current simulation, when it has been calculated.
export function usePerformance(trackId: string | null | undefined): Entry | null {
  return usePerformanceStore((state) => {
    if (!trackId) return null;
    const entry = state.results[trackId];
    const current = useEditorStore.getState().simulationByTrack[trackId];
    return entry && current?.result === entry.source && !current.stale ? entry : null;
  });
}

/// Rates every whole-replay simulation once it is ready, while the calculator is installed.
export function startPerformanceRunner(resolution: () => Resolution | null): () => void {
  const check = () => {
    const performance = usePerformanceStore.getState();
    const map = resolution();
    if (!performance.status?.installed || !map) return;
    const editor = useEditorStore.getState();
    for (const track of editor.tracks) {
      const run = editor.simulationByTrack[track.id];
      const result = run?.result;
      if (!result || run.stale || run.status !== 'ready' || result.scope !== 'whole-replay') continue;
      if (performance.results[track.id]?.source === result) continue;
      void performance.calculate(track, result, map);
    }
  };
  const unsubscribeEditor = useEditorStore.subscribe((state, previous) => {
    if (state.simulationByTrack !== previous.simulationByTrack) check();
  });
  const unsubscribePerformance = usePerformanceStore.subscribe((state, previous) => {
    if (state.status !== previous.status) check();
  });
  void usePerformanceStore.getState().refresh();
  check();
  return () => {
    unsubscribeEditor();
    unsubscribePerformance();
  };
}
