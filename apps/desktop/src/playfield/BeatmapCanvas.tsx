import {
  applyPreviewMods,
  parseOsu,
  PixiBeatmapViewer,
  replayPointAt,
  type BeatmapViewerAdapter,
  type ParsedBeatmap,
} from '@ore/beatmap-viewer';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Resolution } from '../MapAcquisition';
import { sidecarBlobRequest } from '../sidecar';
import {
  adjacentReplayFrameTime,
  editReplayInputs,
  nearestReplayFrameTime,
  useEditorStore,
  type CursorStrokePoint,
} from '../stores/editor';

const DEV_FIXTURE = `osu file format v14
[General]
[Metadata]
Title:Viewer Integration Fixture
Artist:osu! Replay Editor
Creator:Codex
Version:Circle Slider Spinner
[Difficulty]
CircleSize:4
ApproachRate:7
SliderMultiplier:1.4
[TimingPoints]
0,500,4,2,1,100,1,0
[Colours]
Combo1:90,170,255
Combo2:255,100,160
[HitObjects]
100,110,700,1,0,0:0:0:0:
150,250,1300,2,0,B|256:80|410:245,2,300
400,105,2700,1,0,0:0:0:0:
256,192,3400,8,0,4900
`;

async function loadOptional(hash: string, filename: string | null): Promise<string | null> {
  if (!filename) return null;
  try {
    const blob = await sidecarBlobRequest(`/api/beatmaps/${hash}/file?name=${encodeURIComponent(filename)}`);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function BeatmapCanvas({
  resolution,
  trackId,
  original = false,
  clock = true,
  interactive = true,
}: {
  resolution: Resolution | null;
  trackId?: string | null;
  original?: boolean;
  clock?: boolean;
  interactive?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BeatmapViewerAdapter | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const cursorDragRef = useRef<{ pointerId: number; trackId: string; timeMs: number; x: number; y: number } | null>(
    null,
  );
  const strokeRef = useRef<{
    pointerId: number;
    trackId: string;
    startedAt: number;
    points: CursorStrokePoint[];
    snapEnd: { x: number; y: number } | null;
  } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorDraft, setCursorDraft] = useState<{ x: number; y: number } | null>(null);
  const [strokeDraft, setStrokeDraft] = useState<CursorStrokePoint[]>([]);
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; timeMs: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [baseBeatmap, setBaseBeatmap] = useState<ParsedBeatmap | null>(null);
  const [error, setError] = useState('');
  const playing = useEditorStore((state) => state.playing);
  const playhead = useEditorStore((state) => state.playheadMs);
  const rate = useEditorStore((state) => state.playbackRate);
  const volume = useEditorStore((state) => state.volume);
  const showBackground = useEditorStore((state) => state.showBackground);
  const backgroundDim = useEditorStore((state) => state.backgroundDim);
  const showGrid = useEditorStore((state) => state.showGrid);
  const compactMode = useEditorStore((state) => state.compactMode);
  const wireframeGameplay = useEditorStore((state) => state.wireframeGameplay);
  const fadeAfterClick = useEditorStore((state) => state.fadeAfterClick);
  const showHitJudgements = useEditorStore((state) => state.showHitJudgements);
  const showHiddenFade = useEditorStore((state) => state.showHiddenFade);
  const playfieldZoom = useEditorStore((state) => state.playfieldZoom);
  const cursorTrailMs = useEditorStore((state) => state.cursorTrailMs);
  const showCursorPast = useEditorStore((state) => state.showCursorPast);
  const showCursorFuture = useEditorStore((state) => state.showCursorFuture);
  const showInputPaths = useEditorStore((state) => state.showInputPaths);
  const showClickMarkers = useEditorStore((state) => state.showClickMarkers);
  const drawRangeSnap = useEditorStore((state) => state.drawRangeSnap);
  const wheelMode = useEditorStore((state) => state.timelineWheelMode);
  const wheelStepMs = useEditorStore((state) => state.timelineWheelStepMs);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const requestTimelineFocus = useEditorStore((state) => state.requestTimelineFocus);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlayfieldZoom = useEditorStore((state) => state.setPlayfieldZoom);
  const setCursorTrailMs = useEditorStore((state) => state.setCursorTrailMs);
  const previewTrackId = useEditorStore((state) => state.previewTrackId);
  const previewTrack = useEditorStore((state) =>
    state.tracks.find((track) => track.id === (trackId === undefined ? previewTrackId : trackId)),
  );
  const simulation = useEditorStore((state) => {
    const id = trackId === undefined ? state.previewTrackId : trackId;
    return id ? state.simulationByTrack[id]?.result : null;
  });
  const displayedReplay = previewTrack ? (original ? previewTrack.originalReplay : previewTrack.replay) : null;
  const previewMods = previewTrack
    ? original
      ? previewTrack.originalReplay.metadata.mods
      : previewTrack.exportMetadata.mods
    : 0;
  const previewBeatmap = useMemo(
    () => (baseBeatmap ? applyPreviewMods(baseBeatmap, previewMods) : null),
    [baseBeatmap, previewMods],
  );
  const selectedInput = useEditorStore((state) => state.selectedInput);
  const inputEditPreview = useEditorStore((state) => state.inputEditPreview);
  const tool = useEditorStore((state) => state.tool);
  const selectedCursorFrameMs = useEditorStore((state) => state.selectedCursorFrameMs);
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const selectCursorFrame = useEditorStore((state) => state.selectCursorFrame);
  const setCursorFramePosition = useEditorStore((state) => state.setCursorFramePosition);
  const insertCursorFrame = useEditorStore((state) => state.insertCursorFrame);
  const deleteCursorFrame = useEditorStore((state) => state.deleteCursorFrame);
  const drawCursorPath = useEditorStore((state) => state.drawCursorPath);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !resolution) {
      setReady(false);
      setBaseBeatmap(null);
      const store = useEditorStore.getState();
      store.setBeatmapObjects([]);
      store.setDuration(0);
      store.setPlayhead(0);
      store.setWindowStart(0);
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];
    setReady(false);
    setError('Loading beatmap viewer…');
    void (async () => {
      const difficulty = resolution.difficulties.find(
        (item) => item.checksum.toLowerCase() === resolution.replayHash.toLowerCase(),
      );
      if (!difficulty) throw new Error('The verified difficulty is missing.');
      const developmentFixture = import.meta.env.DEV && resolution.source === 'dev-fixture';
      const osuText = developmentFixture
        ? DEV_FIXTURE
        : await (
            await sidecarBlobRequest(
              `/api/beatmaps/${resolution.replayHash}/file?name=${encodeURIComponent(difficulty.filename)}`,
            )
          ).text();
      const parsedBeatmap = parseOsu(osuText);
      const [audioUrl, backgroundUrl] = developmentFixture
        ? [null, null]
        : await Promise.all([
            loadOptional(resolution.replayHash, difficulty.audioFilename ?? parsedBeatmap.audioFilename),
            loadOptional(resolution.replayHash, difficulty.backgroundFilename ?? parsedBeatmap.backgroundFilename),
          ]);
      if (audioUrl) objectUrls.push(audioUrl);
      if (backgroundUrl) objectUrls.push(backgroundUrl);
      const viewer = await PixiBeatmapViewer.create(host, {
        onLoaded: (beatmap) => {
          if (!clock) return;
          const store = useEditorStore.getState();
          store.setDuration(beatmap.durationMs);
          store.setPlayhead(0);
          store.setBeatmapObjects(
            beatmap.hitObjects.map((object) => ({
              startTime: object.startTime,
              endTime: object.endTime,
              kind: object.kind,
              x: object.x,
              y: object.y,
            })),
          );
          store.setWindowStart(
            useEditorStore.getState().tracks.reduce(
              (earliest, track) => Math.min(earliest, track.replay.frames[0]?.timeMs ?? 0),
              beatmap.hitObjects.reduce((earliest, object) => Math.min(earliest, object.startTime), 0),
            ),
          );
        },
        onTimeChange: (timeMs) => {
          if (clock) useEditorStore.getState().setPlayhead(timeMs);
        },
        onEnded: () => {
          if (clock) useEditorStore.getState().setPlaying(false);
        },
      });
      if (cancelled) {
        viewer.destroy();
        return;
      }
      viewerRef.current = viewer;
      viewer.setMods(0);
      panRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
      await viewer.loadBeatmap({ text: osuText, audioUrl, backgroundUrl });
      if (cancelled) return;
      setBaseBeatmap(parsedBeatmap);
      viewer.setReplay(null);
      viewer.setRate(useEditorStore.getState().playbackRate);
      viewer.setVolume(clock ? useEditorStore.getState().volume : 0);
      const settings = useEditorStore.getState();
      viewer.setOptions({
        showCursorTrail: settings.cursorTrailMs > 0,
        showCursorPast: settings.showCursorPast,
        showCursorFuture: settings.showCursorFuture,
        showInputPaths: settings.showInputPaths,
        showClickMarkers: settings.showClickMarkers,
        showBackground: settings.showBackground,
        backgroundDim: settings.backgroundDim,
        showGrid: settings.showGrid,
        compactMode: settings.compactMode,
        wireframeGameplay: settings.wireframeGameplay,
        fadeAfterClick: settings.fadeAfterClick,
        showHitJudgements: settings.showHitJudgements,
        showHiddenFade: settings.showHiddenFade,
        zoom: settings.playfieldZoom,
        cursorTrailMs: settings.cursorTrailMs,
      });
      viewer.seek(0);
      if (clock && useEditorStore.getState().playing) viewer.play();
      setReady(true);
      setError('');
    })().catch((reason) => {
      if (!cancelled) setError((reason as Error).message);
    });
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [resolution, clock]);

  useEffect(() => {
    if (ready) {
      if (playing && clock) viewerRef.current?.play();
      else viewerRef.current?.pause();
    }
  }, [playing, ready, clock]);
  useEffect(() => {
    if (ready) viewerRef.current?.setRate(rate);
  }, [rate, ready]);
  useEffect(() => {
    if (ready) viewerRef.current?.setVolume(clock ? volume : 0);
  }, [volume, ready, clock]);
  useEffect(() => {
    if (ready) viewerRef.current?.setMods(previewMods);
  }, [previewMods, ready]);
  useEffect(() => {
    if (ready)
      viewerRef.current?.setOptions({
        showCursorTrail: cursorTrailMs > 0,
        showCursorPast,
        showCursorFuture,
        showInputPaths,
        showClickMarkers,
        showBackground,
        backgroundDim,
        showGrid,
        compactMode,
        wireframeGameplay,
        fadeAfterClick,
        showHitJudgements,
        showHiddenFade,
        zoom: playfieldZoom,
        cursorTrailMs,
      });
  }, [
    showBackground,
    backgroundDim,
    showGrid,
    compactMode,
    wireframeGameplay,
    fadeAfterClick,
    showHitJudgements,
    showHiddenFade,
    playfieldZoom,
    cursorTrailMs,
    showCursorPast,
    showCursorFuture,
    showInputPaths,
    showClickMarkers,
    ready,
  ]);
  useEffect(() => {
    if (!ready) return;
    const matchesPreview = !original || !previewTrack?.edited;
    viewerRef.current?.setJudgements(
      matchesPreview && simulation?.scope === 'whole-replay' && simulation.status !== 'unsupported'
        ? simulation.judgements
        : null,
    );
  }, [ready, simulation, original, previewTrack?.edited]);
  useEffect(() => {
    if (ready) viewerRef.current?.seek(playhead);
  }, [playhead, ready]);
  useEffect(() => {
    const host = hostRef.current;
    const cursorPointer = cursorDragRef.current?.pointerId;
    const strokePointer = strokeRef.current?.pointerId;
    cursorDragRef.current = null;
    strokeRef.current = null;
    setCursorDraft(null);
    setStrokeDraft([]);
    setNodeMenu(null);
    if (cursorPointer !== undefined && host?.hasPointerCapture(cursorPointer))
      host.releasePointerCapture(cursorPointer);
    if (strokePointer !== undefined && host?.hasPointerCapture(strokePointer))
      host.releasePointerCapture(strokePointer);
  }, [tool, previewTrack?.id, original, interactive]);
  useEffect(() => {
    if (!ready) return;
    if (!previewTrack) {
      viewerRef.current?.setReplay(null);
      return;
    }
    const edits =
      inputEditPreview?.filter(
        (edit) => edit.original.trackId === previewTrack.id && edit.next.trackId === previewTrack.id,
      ) ?? [];
    let replay = original
      ? previewTrack.originalReplay
      : edits.length
        ? editReplayInputs(previewTrack.replay, edits)
        : previewTrack.replay;
    const draftTime = cursorDragRef.current?.timeMs ?? selectedCursorFrameMs;
    if (cursorDraft && draftTime !== null)
      replay = {
        ...replay,
        frames: replay.frames.map((frame) => (frame.timeMs === draftTime ? { ...frame, ...cursorDraft } : frame)),
      };
    const liveSelection =
      edits.find(
        (edit) =>
          selectedInput &&
          edit.original.key === selectedInput.key &&
          edit.original.startTime === selectedInput.startTime &&
          edit.original.endTime === selectedInput.endTime,
      )?.next ??
      edits[0]?.next ??
      selectedInput;
    viewerRef.current?.setReplay({
      trackId: previewTrack.id,
      color: previewTrack.color,
      frames: replay.frames,
      client: previewTrack.exportMetadata.version >= 30000000 ? 'lazer' : 'stable',
      selectedInput:
        liveSelection?.trackId === previewTrack.id
          ? {
              keyIndex: ['M1', 'M2', 'K1', 'K2'].indexOf(liveSelection.key),
              startTime: liveSelection.startTime,
              endTime: liveSelection.endTime,
            }
          : null,
      selectedRange:
        tool === 'draw' && selectedTimeRange
          ? { startTime: selectedTimeRange.startMs, endTime: selectedTimeRange.endMs }
          : null,
    });
  }, [
    ready,
    previewTrack,
    original,
    selectedInput,
    inputEditPreview,
    cursorDraft,
    selectedCursorFrameMs,
    tool,
    selectedTimeRange,
  ]);

  const finishPan = (target?: HTMLDivElement) => {
    const drag = panDragRef.current;
    panDragRef.current = null;
    target?.classList.remove('panning');
    if (drag && target?.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId);
  };

  const scale = hostRef.current
    ? Math.min(hostRef.current.clientWidth / 512, hostRef.current.clientHeight / 384) * playfieldZoom
    : 1;
  const originX = hostRef.current ? (hostRef.current.clientWidth - 512 * scale) / 2 + pan.x : 0;
  const originY = hostRef.current ? (hostRef.current.clientHeight - 384 * scale) / 2 + pan.y : 0;
  const cursorFrameTime = displayedReplay
    ? nearestReplayFrameTime(displayedReplay.frames, selectedCursorFrameMs ?? playhead)
    : 0;
  const cursorPoint = displayedReplay ? replayPointAt(displayedReplay.frames, cursorFrameTime) : null;
  const curveFrames =
    interactive && tool === 'curve' && displayedReplay
      ? displayedReplay.frames.filter(
          (frame) =>
            frame.timeMs >= playhead - cursorTrailMs &&
            frame.timeMs <= playhead + cursorTrailMs &&
            (frame.timeMs <= playhead ? showCursorPast : showCursorFuture),
        )
      : [];
  const pointerPoint = (clientX: number, clientY: number) => {
    const box = hostRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: (clientX - box.left - originX) / scale, y: (clientY - box.top - originY) / scale };
  };

  const finishCursorDrag = (target: HTMLDivElement, pointerId: number) => {
    const drag = cursorDragRef.current;
    cursorDragRef.current = null;
    setCursorDraft(null);
    if (drag?.pointerId === pointerId) setCursorFramePosition(drag.trackId, drag.timeMs, drag.x, drag.y);
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  };

  const finishStroke = (
    target: HTMLDivElement,
    pointerId: number,
    commit: boolean,
    clientX?: number,
    clientY?: number,
  ) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== pointerId) return;
    if (commit && clientX !== undefined && clientY !== undefined) {
      let point = pointerPoint(clientX, clientY);
      if (
        point &&
        drawRangeSnap &&
        stroke.snapEnd &&
        Math.hypot(point.x - stroke.snapEnd.x, point.y - stroke.snapEnd.y) * scale <= 18
      )
        point = stroke.snapEnd;
      if (point) stroke.points.push({ ...point, offsetMs: Math.max(0, performance.now() - stroke.startedAt) });
    }
    strokeRef.current = null;
    setStrokeDraft([]);
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    if (commit) drawCursorPath(stroke.trackId, stroke.points);
  };

  return (
    <div
      className={`beatmap-canvas${tool === 'draw' ? ' drawing' : ''}`}
      ref={hostRef}
      onPointerDown={(event) => {
        if (!interactive) return;
        if ((event.target as HTMLElement).closest('.cursor-node-menu')) return;
        setNodeMenu(null);
        if (event.button !== 0 || (event.target as HTMLElement).closest('.playfield-zoom')) return;
        if (tool === 'draw') {
          if (!previewTrack || previewTrack.locked || !selectedTimeRange) {
            if (previewTrack) drawCursorPath(previewTrack.id, []);
            return;
          }
          let point = pointerPoint(event.clientX, event.clientY);
          if (!point) return;
          const rangeStart = replayPointAt(previewTrack.replay.frames, selectedTimeRange.startMs);
          const rangeEnd = replayPointAt(previewTrack.replay.frames, selectedTimeRange.endMs);
          if (drawRangeSnap && rangeStart && Math.hypot(point.x - rangeStart.x, point.y - rangeStart.y) * scale <= 18)
            point = rangeStart;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setPlaying(false);
          strokeRef.current = {
            pointerId: event.pointerId,
            trackId: previewTrack.id,
            startedAt: performance.now(),
            points: [{ ...point, offsetMs: 0 }],
            snapEnd: rangeEnd ? { x: rangeEnd.x, y: rangeEnd.y } : null,
          };
          setStrokeDraft([...strokeRef.current.points]);
          return;
        }
        if (tool === 'select') {
          if (!previewTrack || previewTrack.locked) return;
          const point = pointerPoint(event.clientX, event.clientY);
          if (!point) return;
          const timeMs = cursorFrameTime;
          if (cursorPoint && Math.hypot(point.x - cursorPoint.x, point.y - cursorPoint.y) * scale > 24) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          selectCursorFrame(timeMs);
          cursorDragRef.current = { pointerId: event.pointerId, trackId: previewTrack.id, timeMs, ...point };
          setCursorDraft(point);
          return;
        }
        if (tool === 'split') {
          const state = useEditorStore.getState();
          if (state.selectedInput)
            state.cutInputAt(state.selectedInput.trackId, state.selectedInput.key, state.playheadMs);
          return;
        }
        if (tool === 'zoom') {
          setPlayfieldZoom(playfieldZoom + (event.shiftKey ? -0.1 : 0.1));
          return;
        }
        if (tool !== 'hand') return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add('panning');
        panDragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startX: panRef.current.x,
          startY: panRef.current.y,
        };
      }}
      onDoubleClick={(event) => {
        if (!interactive) return;
        if (
          tool !== 'curve' ||
          !previewTrack ||
          previewTrack.locked ||
          (event.target as HTMLElement).closest('.cursor-curve-node,.playfield-zoom,.cursor-node-menu')
        )
          return;
        const point = pointerPoint(event.clientX, event.clientY);
        if (!point || curveFrames.length < 2) return;
        let closest: { distance: number; timeMs: number; x: number; y: number } | null = null;
        for (let index = 1; index < curveFrames.length; index++) {
          const before = curveFrames[index - 1];
          const after = curveFrames[index];
          const dx = after.x - before.x;
          const dy = after.y - before.y;
          const lengthSquared = dx * dx + dy * dy;
          if (lengthSquared === 0 || after.timeMs - before.timeMs <= 1) continue;
          const amount = Math.max(
            0,
            Math.min(1, ((point.x - before.x) * dx + (point.y - before.y) * dy) / lengthSquared),
          );
          const x = before.x + dx * amount;
          const y = before.y + dy * amount;
          const projectedTime = Math.round(before.timeMs + (after.timeMs - before.timeMs) * amount);
          const candidate = {
            distance: Math.hypot(point.x - x, point.y - y) * scale,
            timeMs: Math.max(before.timeMs + 1, Math.min(after.timeMs - 1, projectedTime)),
            x,
            y,
          };
          if (!closest || candidate.distance < closest.distance) closest = candidate;
        }
        if (closest && closest.distance <= 12) insertCursorFrame(previewTrack.id, closest.timeMs, closest.x, closest.y);
      }}
      onPointerMove={(event) => {
        const drag = panDragRef.current;
        const cursorDrag = cursorDragRef.current;
        const stroke = strokeRef.current;
        if (stroke?.pointerId === event.pointerId) {
          let point = pointerPoint(event.clientX, event.clientY);
          if (
            point &&
            drawRangeSnap &&
            stroke.snapEnd &&
            Math.hypot(point.x - stroke.snapEnd.x, point.y - stroke.snapEnd.y) * scale <= 18
          )
            point = stroke.snapEnd;
          if (point && stroke.points.length < 2048) {
            const previous = stroke.points.at(-1)!;
            if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5) {
              stroke.points.push({ ...point, offsetMs: Math.max(0, performance.now() - stroke.startedAt) });
              setStrokeDraft([...stroke.points]);
            }
          }
          return;
        }
        if (cursorDrag?.pointerId === event.pointerId) {
          const point = pointerPoint(event.clientX, event.clientY);
          if (point) {
            cursorDrag.x = point.x;
            cursorDrag.y = point.y;
            setCursorDraft(point);
          }
          return;
        }
        if (!drag || drag.pointerId !== event.pointerId) return;
        const requested = { x: drag.startX + event.clientX - drag.x, y: drag.startY + event.clientY - drag.y };
        panRef.current = viewerRef.current?.setPan(requested.x, requested.y) ?? requested;
        setPan({ ...panRef.current });
      }}
      onPointerUp={(event) => {
        if (strokeRef.current) finishStroke(event.currentTarget, event.pointerId, true, event.clientX, event.clientY);
        else if (cursorDragRef.current) finishCursorDrag(event.currentTarget, event.pointerId);
        else finishPan(event.currentTarget);
      }}
      onPointerCancel={(event) => {
        if (strokeRef.current) finishStroke(event.currentTarget, event.pointerId, false);
        else if (cursorDragRef.current) finishCursorDrag(event.currentTarget, event.pointerId);
        else finishPan(event.currentTarget);
      }}
      onLostPointerCapture={(event) => {
        if (strokeRef.current) finishStroke(event.currentTarget, event.pointerId, false);
        else if (cursorDragRef.current) finishCursorDrag(event.currentTarget, event.pointerId);
        else finishPan(event.currentTarget);
      }}
      onWheel={(event) => {
        event.preventDefault();
        const direction: -1 | 1 = event.deltaY > 0 ? 1 : -1;
        if (event.ctrlKey) {
          setPlayfieldZoom(playfieldZoom + (direction < 0 ? 0.1 : -0.1));
          return;
        }
        const currentPlayhead = useEditorStore.getState().playheadMs;
        if (wheelMode === 'frame') {
          const frameTime = displayedReplay
            ? adjacentReplayFrameTime(displayedReplay.frames, currentPlayhead, direction)
            : null;
          setPlayhead(frameTime ?? currentPlayhead + direction * 17);
        } else setPlayhead(currentPlayhead + direction * wheelStepMs);
        requestTimelineFocus();
      }}
    >
      {!resolution && (
        <div className="viewer-message">
          <strong>No beatmap loaded</strong>
          <span>Open a replay from File to resolve its exact difficulty.</span>
        </div>
      )}
      {resolution && error && (
        <div className="viewer-message">
          <strong>{error}</strong>
          <span>The editor remains available.</span>
        </div>
      )}
      {resolution && ready && previewBeatmap && (
        <div className="playfield-difficulty" aria-label="Effective beatmap difficulty">
          {(previewMods & 16) !== 0 && <strong>HR</strong>}
          {(previewMods & 2) !== 0 && <strong>EZ</strong>}
          <span>CS {previewBeatmap.circleSize.toFixed(1)}</span>
          <span>AR {previewBeatmap.approachRate.toFixed(1)}</span>
          <span>OD {previewBeatmap.overallDifficulty.toFixed(1)}</span>
        </div>
      )}
      {interactive && resolution && previewTrack && cursorPoint && tool === 'select' && (
        <div
          className="cursor-edit-node"
          title={`Cursor frame ${cursorFrameTime} ms · X ${Math.round((cursorDraft ?? cursorPoint).x)} · Y ${Math.round((cursorDraft ?? cursorPoint).y)}`}
          style={{
            left: originX + (cursorDraft ?? cursorPoint).x * scale,
            top: originY + (cursorDraft ?? cursorPoint).y * scale,
          }}
        />
      )}
      {interactive &&
        resolution &&
        previewTrack &&
        tool === 'curve' &&
        curveFrames.map((frame) => {
          const selected = frame.timeMs === selectedCursorFrameMs;
          const point = selected && cursorDraft ? cursorDraft : frame;
          return (
            <button
              type="button"
              key={frame.timeMs}
              className={`cursor-curve-node ${frame.timeMs <= playhead ? 'past' : 'future'}${selected ? ' selected' : ''}`}
              aria-label={`Cursor line node at ${frame.timeMs} milliseconds`}
              title={`${frame.timeMs} ms · X ${Math.round(point.x)} · Y ${Math.round(point.y)}`}
              style={{ left: originX + point.x * scale, top: originY + point.y * scale }}
              onPointerDown={(event) => {
                if (event.button !== 0 || previewTrack.locked) return;
                event.preventDefault();
                event.stopPropagation();
                setPlaying(false);
                selectCursorFrame(frame.timeMs);
                hostRef.current?.setPointerCapture(event.pointerId);
                cursorDragRef.current = {
                  pointerId: event.pointerId,
                  trackId: previewTrack.id,
                  timeMs: frame.timeMs,
                  x: frame.x,
                  y: frame.y,
                };
                setCursorDraft({ x: frame.x, y: frame.y });
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectCursorFrame(frame.timeMs);
                const box = hostRef.current?.getBoundingClientRect();
                if (!box) return;
                setNodeMenu({ x: event.clientX - box.left, y: event.clientY - box.top, timeMs: frame.timeMs });
              }}
            />
          );
        })}
      {interactive && nodeMenu && previewTrack && (
        <div
          className="cursor-node-menu"
          style={{ left: nodeMenu.x, top: nodeMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <small>{nodeMenu.timeMs} ms</small>
          <button
            type="button"
            onClick={() => {
              deleteCursorFrame(previewTrack.id, nodeMenu.timeMs);
              setNodeMenu(null);
            }}
          >
            Delete cursor node
          </button>
        </div>
      )}
      {strokeDraft.length > 0 && (
        <svg
          className="cursor-draw-overlay"
          style={{ left: originX, top: originY, width: 512 * scale, height: 384 * scale }}
          viewBox="0 0 512 384"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={strokeDraft.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={strokeDraft[0].x} cy={strokeDraft[0].y} r="4" fill="#ffffff" />
        </svg>
      )}
      {resolution && (
        <div className="playfield-zoom">
          <button type="button" title="Zoom out" onClick={() => setPlayfieldZoom(playfieldZoom - 0.1)}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="zoom-value"
            title="Reset zoom and position"
            onClick={() => {
              panRef.current = { x: 0, y: 0 };
              setPan({ x: 0, y: 0 });
              viewerRef.current?.setPan(0, 0);
              setPlayfieldZoom(1);
            }}
          >
            <RotateCcw size={12} />
            {Math.round(playfieldZoom * 100)}%
          </button>
          <button type="button" title="Zoom in" onClick={() => setPlayfieldZoom(playfieldZoom + 0.1)}>
            <Plus size={14} />
          </button>
          <label className="trail-duration" title="How long cursor movement and click history remains visible">
            <span>Trail</span>
            <input
              aria-label="Cursor history duration"
              type="number"
              min="0"
              max="5000"
              step="10"
              value={cursorTrailMs}
              onWheel={(event) => event.stopPropagation()}
              onChange={(event) => setCursorTrailMs(Number(event.target.value))}
            />
            <small>ms</small>
          </label>
        </div>
      )}
    </div>
  );
}
