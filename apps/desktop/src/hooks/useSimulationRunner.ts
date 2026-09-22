import { useEffect, useRef, useState } from 'react';
import { sidecarRequest } from '../sidecar';
import { useEditorStore, type SimulationResult } from '../stores/editor';
import type { Resolution } from '../MapAcquisition';

export function useSimulationRunner(resolution: Resolution | null) {
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const previewTrack = useEditorStore((state) => state.tracks.find((track) => track.id === state.previewTrackId));
  const simulationState = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId] : undefined,
  );
  const needsJudgementPreview = useEditorStore((state) => state.fadeAfterClick || state.showHitJudgements);
  const setSimulationRunning = useEditorStore((state) => state.setSimulationRunning);
  const setSimulationResult = useEditorStore((state) => state.setSimulationResult);
  const setSimulationError = useEditorStore((state) => state.setSimulationError);
  const [simulationScope, setSimulationScope] = useState<'whole-replay' | 'selected-area'>('whole-replay');
  const simulationRequest = useRef<AbortController | null>(null);
  const simulationDebounce = useRef<number | null>(null);

  const runSimulation = async (forceWhole = false) => {
    if (!previewTrack || !resolution) return;
    if (simulationDebounce.current !== null) window.clearTimeout(simulationDebounce.current);
    simulationRequest.current?.abort();
    const controller = new AbortController();
    simulationRequest.current = controller;
    const hash = previewTrack.replay.metadata.beatmapHash;
    const scope =
      !forceWhole && !previewTrack.autoScore && simulationScope === 'selected-area' && selectedTimeRange
        ? 'selected-area'
        : 'whole-replay';
    const difficulty = resolution.difficulties.find((item) => item.checksum.toLowerCase() === hash.toLowerCase());
    if (!difficulty) {
      setSimulationError(previewTrack.id, 'The resolved beatmap does not contain the replay difficulty.');
      return;
    }
    setSimulationRunning(previewTrack.id);
    try {
      const result = await sidecarRequest<SimulationResult>('/api/simulation/whole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          hash,
          filename: difficulty.filename,
          mods: previewTrack.exportMetadata.mods,
          version: previewTrack.exportMetadata.version,
          frames: previewTrack.replay.frames,
          sourceScore: previewTrack.replay.metadata.score,
          sourceMods: previewTrack.replay.metadata.mods,
          sourceHitCounts: previewTrack.replay.metadata.hitCounts,
          sourceMaxCombo: previewTrack.replay.metadata.maxCombo,
          sourceUnedited: !previewTrack.edited,
          lazerScoreInfo: previewTrack.replay.metadata.lazerScoreInfo,
          scope,
          startMs: scope === 'selected-area' ? selectedTimeRange?.startMs : undefined,
          endMs: scope === 'selected-area' ? selectedTimeRange?.endMs : undefined,
        }),
      });
      if (
        !controller.signal.aborted &&
        useEditorStore.getState().tracks.find((track) => track.id === previewTrack.id)?.replay ===
          previewTrack.replay &&
        useEditorStore.getState().tracks.find((track) => track.id === previewTrack.id)?.exportMetadata.mods ===
          previewTrack.exportMetadata.mods &&
        useEditorStore.getState().tracks.find((track) => track.id === previewTrack.id)?.exportMetadata.version ===
          previewTrack.exportMetadata.version
      )
        setSimulationResult(previewTrack.id, result);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        useEditorStore.getState().tracks.find((track) => track.id === previewTrack.id)?.replay === previewTrack.replay
      )
        setSimulationError(previewTrack.id, (error as Error).message);
    } finally {
      if (simulationRequest.current === controller) simulationRequest.current = null;
    }
  };

  useEffect(() => {
    if (
      previewTrack &&
      resolution &&
      (!simulationState?.result ||
        previewTrack.edited ||
        (needsJudgementPreview && simulationState.result.scope !== 'whole-replay'))
    )
      simulationDebounce.current = window.setTimeout(() => {
        void runSimulation(needsJudgementPreview);
      }, 350);
    return () => {
      if (simulationDebounce.current !== null) window.clearTimeout(simulationDebounce.current);
      simulationRequest.current?.abort();
    };
  }, [
    previewTrack?.id,
    previewTrack?.replay,
    previewTrack?.exportMetadata.mods,
    previewTrack?.exportMetadata.version,
    resolution,
    simulationScope,
    selectedTimeRange?.startMs,
    selectedTimeRange?.endMs,
    needsJudgementPreview,
  ]);

  return { previewTrack, simulationState, simulationScope, setSimulationScope, runSimulation };
}
