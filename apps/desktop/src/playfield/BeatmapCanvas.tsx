import {
  applyPreviewMods,
  inputVariantColor,
  parseOsu,
  PixiBeatmapViewer,
  replayPointAt,
  type BeatmapViewerAdapter,
  type ParsedBeatmap,
  type PlayfieldTransform,
} from '@ore/beatmap-viewer';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Resolution } from '../MapAcquisition';
import { sidecarBlobRequest } from '../sidecar';
import {
  adjacentReplayFrameTime,
  editReplayInputs,
  useEditorStore,
  type CursorStrokePoint,
  type ReplayFrame,
} from '../stores/editor';
import { SnapWidget } from '../hooks/useSnapDrag';
import { StepNumberInput } from '../components/common/StepNumberInput';

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
  const nodeDragRef = useRef<{
    pointerId: number;
    trackId: string;
    times: number[];
    originFrames: readonly ReplayFrame[];
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const strokeRef = useRef<{
    pointerId: number;
    trackId: string;
    startedAt: number;
    points: CursorStrokePoint[];
    snapEnd: { x: number; y: number } | null;
  } | null>(null);
  const brushDragRef = useRef<{ pointerId: number; trackId: string; x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [viewTransform, setViewTransform] = useState<PlayfieldTransform | null>(null);
  const [brushHover, setBrushHover] = useState<{ x: number; y: number } | null>(null);
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
  // Zoom is per-pane (local state), not the shared store value — otherwise the two split-view
  // panes would fight over one zoom level. Seeded once from the saved preference at mount.
  const [playfieldZoom, setPlayfieldZoomRaw] = useState(() => useEditorStore.getState().playfieldZoom);
  const setPlayfieldZoom = (zoom: number) => {
    if (!Number.isFinite(zoom)) return;
    setPlayfieldZoomRaw(Math.max(0.5, Math.min(2.5, Math.round(zoom * 10) / 10)));
  };
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
  const selectedCursorFrameTimes = useEditorStore((state) => state.selectedCursorFrameTimes);
  const selectedCursorRange = useEditorStore((state) => state.selectedCursorRange);
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const selectCursorFrame = useEditorStore((state) => state.selectCursorFrame);
  const selectBeatmapObject = useEditorStore((state) => state.selectBeatmapObject);
  const setCursorFramePosition = useEditorStore((state) => state.setCursorFramePosition);
  const deleteCursorFrame = useEditorStore((state) => state.deleteCursorFrame);
  const drawCursorPath = useEditorStore((state) => state.drawCursorPath);
  const brushRadiusPx = useEditorStore((state) => state.brushRadiusPx);
  const magneticMove = useEditorStore((state) => state.magneticMove);
  const dragCursorNodes = useEditorStore((state) => state.dragCursorNodes);
  const beginBrushStroke = useEditorStore((state) => state.beginBrushStroke);
  const applyBrushDab = useEditorStore((state) => state.applyBrushDab);

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
        onTransformChange: (next) =>
          setViewTransform((previous) =>
            previous &&
            Math.abs(previous.scale - next.scale) < 1e-6 &&
            Math.abs(previous.x - next.x) < 0.01 &&
            Math.abs(previous.y - next.y) < 0.01
              ? previous
              : next,
          ),
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
        zoom: playfieldZoom,
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

  // React's wheel listener is passive; block the page scroll/zoom (Ctrl+wheel) natively instead.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const block = (event: WheelEvent) => event.preventDefault();
    host.addEventListener('wheel', block, { passive: false });
    return () => host.removeEventListener('wheel', block);
  }, []);
  // The viewer resizes itself (and re-clamps its pan) on its own ResizeObserver; mirror both here
  // so the DOM node overlay keeps the viewer's exact transform when a panel shows/hides.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      setHostSize({ width: host.clientWidth, height: host.clientHeight });
      const synced = viewerRef.current?.setPan(panRef.current.x, panRef.current.y);
      if (synced && (synced.x !== panRef.current.x || synced.y !== panRef.current.y)) {
        panRef.current = synced;
        setPan({ ...synced });
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
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
    const synced = viewerRef.current?.setPan(panRef.current.x, panRef.current.y);
    if (synced && (synced.x !== panRef.current.x || synced.y !== panRef.current.y)) {
      panRef.current = synced;
      setPan({ ...synced });
    }
  }, [playfieldZoom, ready]);
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
    const cursorPointer = nodeDragRef.current?.pointerId;
    const strokePointer = strokeRef.current?.pointerId;
    nodeDragRef.current = null;
    strokeRef.current = null;
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
      selectedRange: (() => {
        if (tool !== 'draw' && tool !== 'brush') return null;
        const range = selectedCursorRange?.trackId === previewTrack.id ? selectedCursorRange : selectedTimeRange;
        return range ? { startTime: range.startMs, endTime: range.endMs } : null;
      })(),
    });
  }, [ready, previewTrack, original, selectedInput, inputEditPreview, selectedCursorRange, tool, selectedTimeRange]);

  const finishPan = (target?: HTMLDivElement) => {
    const drag = panDragRef.current;
    panDragRef.current = null;
    target?.classList.remove('panning');
    if (drag && target?.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId);
  };

  // The DOM overlay (cursor nodes, brush, draw preview) follows the viewer's own transform so it can
  // never drift from what Pixi draws; the computed fallback only covers the moment before load.
  const computedScale = hostSize.width
    ? Math.min(hostSize.width / 512, hostSize.height / 384) * Math.max(0.5, Math.min(2.5, playfieldZoom))
    : 1;
  const scale = ready && viewTransform ? viewTransform.scale : computedScale;
  const originX = ready && viewTransform ? viewTransform.x : (hostSize.width - 512 * scale) / 2 + pan.x;
  const originY = ready && viewTransform ? viewTransform.y : (hostSize.height - 384 * scale) / 2 + pan.y;
  const cursorEditColor = `#${inputVariantColor(
    Number.parseInt(previewTrack?.color.replace('#', '') ?? '', 16) || 0xffffff,
    2,
  )
    .toString(16)
    .padStart(6, '0')}`;
  const curveFrames =
    interactive && (tool === 'curve' || tool === 'select') && displayedReplay
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

  const finishNodeDrag = (target: HTMLDivElement, pointerId: number) => {
    nodeDragRef.current = null;
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
        if (tool === 'brush') {
          if (!previewTrack || previewTrack.locked) return;
          const point = pointerPoint(event.clientX, event.clientY);
          if (!point) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setPlaying(false);
          beginBrushStroke(previewTrack.id);
          brushDragRef.current = { pointerId: event.pointerId, trackId: previewTrack.id, ...point };
          return;
        }
        if (tool === 'select' || tool === 'curve') {
          selectBeatmapObject(null);
          if (!(event.ctrlKey || event.metaKey || event.shiftKey)) selectCursorFrame(null);
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
        if (!point || curveFrames.length < 1) return;
        // Only ever move an already-existing replay frame (or an input-cut-created one) —
        // osu! replays don't have samples at arbitrary times, so never synthesize a new one.
        let closest: { distance: number; frame: (typeof curveFrames)[number] } | null = null;
        for (const frame of curveFrames) {
          const distance = Math.hypot(point.x - frame.x, point.y - frame.y) * scale;
          if (!closest || distance < closest.distance) closest = { distance, frame };
        }
        if (closest && closest.distance <= 12)
          setCursorFramePosition(previewTrack.id, closest.frame.timeMs, point.x, point.y);
      }}
      onPointerMove={(event) => {
        if (tool === 'brush') {
          const point = pointerPoint(event.clientX, event.clientY);
          if (point) setBrushHover(point);
          const brush = brushDragRef.current;
          if (brush?.pointerId === event.pointerId && point) {
            const selectedRange =
              selectedCursorRange?.trackId === brush.trackId ? selectedCursorRange : selectedTimeRange;
            const selectedFrames = selectedRange
              ? undefined
              : selectedCursorFrameTimes.length
                ? selectedCursorFrameTimes
                : selectedCursorFrameMs === null
                  ? undefined
                  : [selectedCursorFrameMs];
            applyBrushDab(
              brush.trackId,
              brush.x,
              brush.y,
              brushRadiusPx,
              point.x - brush.x,
              point.y - brush.y,
              selectedRange?.startMs ?? playhead - cursorTrailMs,
              selectedRange?.endMs ?? playhead + cursorTrailMs,
              selectedFrames,
            );
            brushDragRef.current = { ...brush, x: point.x, y: point.y };
          }
        }
        const drag = panDragRef.current;
        const nodeDrag = nodeDragRef.current;
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
        if (nodeDrag?.pointerId === event.pointerId) {
          const point = pointerPoint(event.clientX, event.clientY);
          if (point) {
            if (!nodeDrag.moved) {
              // One undo step per drag, taken only once the node actually moves.
              beginBrushStroke(nodeDrag.trackId);
              nodeDrag.moved = true;
            }
            dragCursorNodes(
              nodeDrag.trackId,
              nodeDrag.originFrames,
              nodeDrag.times,
              point.x - nodeDrag.x,
              point.y - nodeDrag.y,
              magneticMove,
            );
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
        else if (nodeDragRef.current) finishNodeDrag(event.currentTarget, event.pointerId);
        else if (brushDragRef.current?.pointerId === event.pointerId) {
          brushDragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        } else finishPan(event.currentTarget);
      }}
      onPointerCancel={(event) => {
        if (strokeRef.current) finishStroke(event.currentTarget, event.pointerId, false);
        else if (nodeDragRef.current) finishNodeDrag(event.currentTarget, event.pointerId);
        else if (brushDragRef.current?.pointerId === event.pointerId) brushDragRef.current = null;
        else finishPan(event.currentTarget);
      }}
      onLostPointerCapture={(event) => {
        if (strokeRef.current) finishStroke(event.currentTarget, event.pointerId, false);
        else if (nodeDragRef.current) finishNodeDrag(event.currentTarget, event.pointerId);
        else if (brushDragRef.current?.pointerId === event.pointerId) brushDragRef.current = null;
        else finishPan(event.currentTarget);
      }}
      onPointerLeave={() => setBrushHover(null)}
      onWheel={(event) => {
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
        <SnapWidget
          id="stats"
          panel="stats"
          fallback="top-left"
          order={2}
          className="playfield-difficulty"
          ariaLabel="Effective beatmap difficulty"
        >
          {(previewMods & 16) !== 0 && <strong>HR</strong>}
          {(previewMods & 2) !== 0 && <strong>EZ</strong>}
          <span>CS {previewBeatmap.circleSize.toFixed(1)}</span>
          <span>AR {previewBeatmap.approachRate.toFixed(1)}</span>
          <span>OD {previewBeatmap.overallDifficulty.toFixed(1)}</span>
        </SnapWidget>
      )}
      {interactive &&
        resolution &&
        previewTrack &&
        curveFrames.map((frame) => {
          const selected = frame.timeMs === selectedCursorFrameMs || selectedCursorFrameTimes.includes(frame.timeMs);
          return (
            <button
              type="button"
              key={frame.timeMs}
              className={`cursor-curve-node ${frame.timeMs <= playhead ? 'past' : 'future'}${selected ? ' selected' : ''}${tool === 'select' ? ' select-only' : ''}`}
              aria-label={`Cursor line node at ${frame.timeMs} milliseconds`}
              title={`${frame.timeMs} ms · X ${Math.round(frame.x)} · Y ${Math.round(frame.y)}`}
              style={{ left: originX + frame.x * scale, top: originY + frame.y * scale }}
              onPointerDown={(event) => {
                if (event.button !== 0 || previewTrack.locked) return;
                event.preventDefault();
                event.stopPropagation();
                setPlaying(false);
                const additive = event.ctrlKey || event.metaKey || event.shiftKey;
                if (additive || tool === 'select' || !selected) selectCursorFrame(frame.timeMs, additive);
                if (additive || tool === 'select') return;
                const point = pointerPoint(event.clientX, event.clientY);
                if (!point) return;
                const times = selected
                  ? [
                      ...new Set(
                        [...selectedCursorFrameTimes, selectedCursorFrameMs].filter(
                          (time): time is number => time !== null,
                        ),
                      ),
                    ]
                  : [frame.timeMs];
                hostRef.current?.setPointerCapture(event.pointerId);
                nodeDragRef.current = {
                  pointerId: event.pointerId,
                  trackId: previewTrack.id,
                  times,
                  originFrames: previewTrack.replay.frames,
                  moved: false,
                  ...point,
                };
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
      {interactive && tool === 'brush' && brushHover && (
        <div
          className="playfield-brush-cursor"
          style={{
            left: originX + brushHover.x * scale,
            top: originY + brushHover.y * scale,
            width: brushRadiusPx * scale * 2,
            height: brushRadiusPx * scale * 2,
          }}
        />
      )}
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
            stroke="#0b0f15"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
          <polyline
            points={strokeDraft.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={cursorEditColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={strokeDraft[0].x}
            cy={strokeDraft[0].y}
            r="4.5"
            fill={cursorEditColor}
            stroke="#ffffff"
            strokeWidth="1.3"
          />
        </svg>
      )}
      {resolution && (
        <SnapWidget id="viewControls" panel="viewControls" fallback="bottom-left" grip className="playfield-zoom">
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
            <StepNumberInput
              ariaLabel="Cursor history duration"
              min={0}
              max={5000}
              value={cursorTrailMs}
              onChange={setCursorTrailMs}
            />
            <small>ms</small>
          </label>
        </SnapWidget>
      )}
    </div>
  );
}
