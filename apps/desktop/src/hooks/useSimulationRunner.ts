import { useEffect, useRef, useState } from 'react';
import { sidecarRequest } from '../sidecar';
import { useEditorStore, type ImportedReplay, type SimulationResult } from '../stores/editor';
import type { Resolution } from '../MapAcquisition';
import { useSimulationPrefsStore } from '../stores/simulationPrefs';
import { changedFrameRange, mergeWindowResult, unionRange, type TimeRange } from '../simulationWindow';

// A window this large is no quicker than the whole replay, and its totals would be mostly guessed.
const MAX_WINDOW_SHARE = 0.6;

export function useSimulationRunner(resolution: Resolution | null) {
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const previewTrack = useEditorStore((state) => state.tracks.find((track) => track.id === state.previewTrackId));
  const simulationState = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId] : undefined,
  );
  const needsJudgementPreview = useEditorStore((state) => state.fadeAfterClick || state.showHitJudgements);
  const setSimulationRunning = useEditorStore((state) => state.setSimulationRunning);
  // Mid-stroke edits are not simulated; the run starts once the stroke or drag ends.
  const liveEdit = useEditorStore((state) => state.liveEdit);
  const setSimulationResult = useEditorStore((state) => state.setSimulationResult);
  const setSimulationError = useEditorStore((state) => state.setSimulationError);
  const wholeRunRequest = useSimulationPrefsStore((state) => state.wholeRunRequest);
  const [simulationScope, setSimulationScope] = useState<'whole-replay' | 'selected-area'>('whole-replay');
  const simulationRequest = useRef<AbortController | null>(null);
  const simulationDebounce = useRef<number | null>(null);
  // An edit is waiting to be simulated (see the effect below).
  const editPendingRef = useRef(false);
  // The replay time the edits since the last finished run touched; cleared once a run covering
  // them lands, so an aborted run's edits are still checked by the next one.
  const changedRangeRef = useRef<TimeRange | null>(null);

  // `around`: simulate only the objects around these times and lay them over the last result.
  const runSimulation = async (forceWhole = false, around?: TimeRange) => {
    if (!previewTrack || !resolution) return;
    editPendingRef.current = false;
    if (simulationDebounce.current !== null) window.clearTimeout(simulationDebounce.current);
    simulationRequest.current?.abort();
    const controller = new AbortController();
    simulationRequest.current = controller;
    const hash = previewTrack.replay.metadata.beatmapHash;
    const scope = around
      ? 'window'
      : !forceWhole && !previewTrack.autoScore && simulationScope === 'selected-area' && selectedTimeRange
        ? 'selected-area'
        : 'whole-replay';
    const range = scope === 'window' ? around : scope === 'selected-area' ? selectedTimeRange : null;
    const startMs = range ? ('start' in range ? range.start : range.startMs) : undefined;
    const endMs = range ? ('end' in range ? range.end : range.endMs) : undefined;
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
          startMs,
          endMs,
        }),
      });
      const current = useEditorStore.getState().tracks.find((track) => track.id === previewTrack.id);
      if (
        !controller.signal.aborted &&
        current?.replay === previewTrack.replay &&
        current.exportMetadata.mods === previewTrack.exportMetadata.mods &&
        current.exportMetadata.version === previewTrack.exportMetadata.version
      ) {
        if (scope === 'whole-replay') changedRangeRef.current = null;
        if (around) {
          const base = useEditorStore.getState().simulationByTrack[previewTrack.id]?.result;
          changedRangeRef.current = null;
          if (base?.scope === 'whole-replay')
            setSimulationResult(previewTrack.id, mergeWindowResult(base, result, around), true);
          // Nothing whole to lay the window over (it was cleared meanwhile): run everything.
          else void runSimulation(true);
        } else setSimulationResult(previewTrack.id, result);
      }
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

  // The run after an edit: only the objects around the changed times when the user chose that
  // (Settings › General) and there is a whole result to update; otherwise the usual run.
  const runAfterEdit = () => {
    const { afterEdit, aroundMs } = useSimulationPrefsStore.getState();
    const changed = changedRangeRef.current;
    const base = previewTrack ? useEditorStore.getState().simulationByTrack[previewTrack.id]?.result : null;
    const frames = previewTrack?.replay.frames ?? [];
    const length = frames.length ? frames[frames.length - 1].timeMs - frames[0].timeMs : 0;
    if (
      afterEdit === 'around' &&
      changed &&
      base?.scope === 'whole-replay' &&
      base.status !== 'unsupported' &&
      changed.end - changed.start + 2 * aroundMs < length * MAX_WINDOW_SHARE
    )
      void runSimulation(false, { start: changed.start - aroundMs, end: changed.end + aroundMs });
    else void runSimulation(needsJudgementPreview);
  };

  // After an edit the run waits until editing has paused for a while; loading, switching replays
  // or changing options still simulate almost at once. The pending flag stays set until a run
  // actually starts, so the end of a stroke (which changes nothing new) still waits.
  const lastReplayRef = useRef<{ trackId: string; replay: ImportedReplay } | null>(null);
  useEffect(() => {
    const last = lastReplayRef.current;
    if (!previewTrack || last?.trackId !== previewTrack.id) {
      editPendingRef.current = false;
      changedRangeRef.current = null;
    } else if (last.replay !== previewTrack.replay) {
      editPendingRef.current = true;
      changedRangeRef.current = unionRange(
        changedRangeRef.current,
        changedFrameRange(last.replay.frames, previewTrack.replay.frames),
      );
    }
    lastReplayRef.current = previewTrack ? { trackId: previewTrack.id, replay: previewTrack.replay } : null;
    if (
      !liveEdit &&
      previewTrack &&
      resolution &&
      (!simulationState?.result ||
        previewTrack.edited ||
        (needsJudgementPreview && simulationState.result.scope !== 'whole-replay'))
    ) {
      const afterEdit = editPendingRef.current;
      simulationDebounce.current = window.setTimeout(
        () => (afterEdit ? runAfterEdit() : void runSimulation(needsJudgementPreview)),
        // The wait after an edit is the user's choice (Settings › General); read when the timer starts.
        afterEdit ? useSimulationPrefsStore.getState().editDelayMs : 350,
      );
    }
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
    liveEdit,
  ]);

  // "Simulate whole replay" from the partial-result badge.
  useEffect(() => {
    if (wholeRunRequest > 0) void runSimulation(true);
  }, [wholeRunRequest]);

  return { previewTrack, simulationState, simulationScope, setSimulationScope, runSimulation };
}
