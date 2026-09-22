import { inputVariantColor } from '@ore/beatmap-viewer';
import { Scissors } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  adjacentReplayFrameTime,
  formatTime,
  nearestReplayFrameTime,
  replayInputSegments,
  snapTimeWithinRange,
  useEditorStore,
  type InputKey,
  type InputSelection,
} from '../stores/editor';
import { TimelineToolbar, type TimelineLayout, type TimelineTool } from './TimelineToolbar';
import { TimelineZoomControl } from './TimelineZoomControl';
import { TimelineContextMenu, type TimelineContextMenuState } from './TimelineContextMenu';
import { TimelineInputNode, type TimelineInputItem } from './TimelineInputNode';
import { useTimelineCanvas, lanes, rulerHeight, rulerStepsMs, numericColor } from './useTimelineCanvas';
import { useInputDrag } from './useInputDrag';
import { useLaneResize } from './useLaneResize';
import type { Resolution } from '../MapAcquisition';

const inputKeyNames: InputKey[] = ['M1', 'M2', 'K1', 'K2'];

function sameInput(first: InputSelection | null, second: InputSelection): boolean {
  return (
    !!first &&
    first.trackId === second.trackId &&
    first.key === second.key &&
    first.startTime === second.startTime &&
    first.endTime === second.endTime
  );
}

export function Timeline({ resolution }: { resolution: Resolution | null }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; start: number; moved: boolean; mode: 'seek' | 'pan' } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; x: number; y: number; additive: boolean; timeRange: boolean } | null>(
    null,
  );
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [timelineTool, setTimelineTool] = useState<TimelineTool>('select');
  const [layoutMode, setLayoutMode] = useState<TimelineLayout>('stack');
  const timelineLaneHeight = useEditorStore((state) => state.timelineLaneHeight);
  const timelineLaneHeightRequest = useEditorStore((state) => state.timelineLaneHeightRequest);
  const [configuredLaneHeights, setLaneHeights] = useState(() => lanes.map(() => timelineLaneHeight));
  const [inputHoverTooltip, setInputHoverTooltip] = useState<{
    x: number;
    y: number;
    input: InputSelection;
    trackName: string;
  } | null>(null);
  const [bladePreview, setBladePreview] = useState<{ timeMs: number; lane: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<TimelineContextMenuState | null>(null);
  const [brushRadiusMs, setBrushRadiusMs] = useState(150);
  const [brushHover, setBrushHover] = useState<{ x: number; y: number } | null>(null);
  const brushDragRef = useRef<{ pointerId: number; trackId: string; axis: 'x' | 'y'; lastY: number } | null>(null);
  const tracks = useEditorStore((state) => state.tracks);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const selected = useEditorStore((state) => state.selectedTrackIds);
  const playhead = useEditorStore((state) => state.playheadMs);
  const playing = useEditorStore((state) => state.playing);
  const beatmapObjects = useEditorStore((state) => state.beatmapObjects);
  const start = useEditorStore((state) => state.windowStartMs);
  const focusRequest = useEditorStore((state) => state.timelineFocusRequest);
  const pixelsPerSecond = useEditorStore((state) => state.pixelsPerSecond);
  const durationMs = useEditorStore((state) => state.durationMs);
  const wheelMode = useEditorStore((state) => state.timelineWheelMode);
  const wheelStepMs = useEditorStore((state) => state.timelineWheelStepMs);
  const snap = useEditorStore((state) => state.snap);
  const setSnap = useEditorStore((state) => state.setSnap);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setWindowStart = useEditorStore((state) => state.setWindowStart);
  const setPixelsPerSecond = useEditorStore((state) => state.setPixelsPerSecond);
  const selectedInput = useEditorStore((state) => state.selectedInput);
  const selectedInputs = useEditorStore((state) => state.selectedInputs);
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const selectedCursorRange = useEditorStore((state) => state.selectedCursorRange);
  const selectedBeatmapObjectIndex = useEditorStore((state) => state.selectedBeatmapObjectIndex);
  const inputDragMode = useEditorStore((state) => state.inputDragMode);
  const selectInput = useEditorStore((state) => state.selectInput);
  const selectInputs = useEditorStore((state) => state.selectInputs);
  const setInputEditPreview = useEditorStore((state) => state.setInputEditPreview);
  const selectTimeRange = useEditorStore((state) => state.selectTimeRange);
  const selectCursorRange = useEditorStore((state) => state.selectCursorRange);
  const selectBeatmapObject = useEditorStore((state) => state.selectBeatmapObject);
  const commitInputEdits = useEditorStore((state) => state.commitInputEdits);
  const inputClipboard = useEditorStore((state) => state.inputClipboard);
  const copySelectedInputs = useEditorStore((state) => state.copySelectedInputs);
  const pasteInputs = useEditorStore((state) => state.pasteInputs);
  const selectCursorFrame = useEditorStore((state) => state.selectCursorFrame);
  const editorSurface = useEditorStore((state) => state.editorSurface);
  const setEditorSurface = useEditorStore((state) => state.setEditorSurface);
  const setPreviewTrack = useEditorStore((state) => state.setPreviewTrack);
  const commitInputEdit = useEditorStore((state) => state.commitInputEdit);
  const setInputKey = useEditorStore((state) => state.setInputKey);
  const setInputDragMode = useEditorStore((state) => state.setInputDragMode);
  const deleteSelectedInput = useEditorStore((state) => state.deleteSelectedInput);
  const cutInputAt = useEditorStore((state) => state.cutInputAt);
  const beginBrushStroke = useEditorStore((state) => state.beginBrushStroke);
  const applyBrushDab = useEditorStore((state) => state.applyBrushDab);
  const visibleTracks = tracks.filter((track) => track.visible);
  const timelineOrigin = Math.min(
    0,
    ...visibleTracks.map((track) => track.replay.frames[0]?.timeMs ?? 0),
    ...beatmapObjects.map((object) => object.startTime),
  );
  const laneHeights = configuredLaneHeights;
  const contentHeight = rulerHeight + laneHeights.reduce((sum, height) => sum + height, 0) + 30;
  const laneTop = (lane: number) => rulerHeight + laneHeights.slice(0, lane).reduce((sum, height) => sum + height, 0);
  const timelineHeight = contentHeight;
  const orderedVisibleTracks =
    layoutMode === 'overlap'
      ? [...visibleTracks].sort(
          (first, second) => Number(selected.includes(first.id)) - Number(selected.includes(second.id)),
        )
      : visibleTracks;
  const xForTime = (time: number) => ((time - start) * pixelsPerSecond) / 1000;
  const snapPlayheadTime = (time: number): number => {
    if (snap === 'off') return time;
    const preferred =
      tracks.find((track) => track.id === selectedInput?.trackId) ??
      tracks.find((track) => selected.includes(track.id)) ??
      tracks[0];
    const candidates: number[] = [];
    if ((snap === 'hit-window' || snap === 'all') && preferred)
      candidates.push(...preferred.replay.keyEvents.map((event) => event.timeMs));
    if (snap === 'hit-object' || snap === 'all') {
      for (const object of beatmapObjects) {
        candidates.push(object.startTime);
        if (object.endTime !== object.startTime) candidates.push(object.endTime);
      }
    }
    const snapRangeMs = (12 * 1000) / pixelsPerSecond;
    return snapTimeWithinRange(time, candidates, snapRangeMs);
  };

  const { hostRef, width } = useTimelineCanvas({
    timelineHeight,
    laneHeights,
    start,
    pixelsPerSecond,
    beatmapObjects,
    selectedBeatmapObjectIndex,
    orderedVisibleTracks,
    selected,
    layoutMode,
    simulation,
    xForTime,
    laneTop,
  });

  useEffect(() => {
    setLaneHeights(lanes.map(() => timelineLaneHeight));
  }, [timelineLaneHeightRequest, timelineLaneHeight]);

  useEffect(() => {
    if (playing) setFollowPlayback(true);
  }, [playing]);

  useEffect(() => {
    if (!playing || !followPlayback || width <= 0) return;
    const visibleMs = (width * 1000) / pixelsPerSecond;
    if (playhead < start || playhead > start + visibleMs * 0.7) setWindowStart(playhead - visibleMs * 0.7);
  }, [playing, followPlayback, playhead, start, width, pixelsPerSecond, setWindowStart]);

  useEffect(() => {
    if (focusRequest === 0 || width <= 0) return;
    setWindowStart(Math.max(timelineOrigin, playhead - (width * 500) / pixelsPerSecond));
    setFollowPlayback(true);
  }, [focusRequest]);

  const ticks = useMemo(() => {
    const majorStep = rulerStepsMs.find((step) => (step * pixelsPerSecond) / 1000 >= 90) ?? 60000;
    const first = Math.ceil(start / majorStep);
    const last = Math.floor((start + (width * 1000) / pixelsPerSecond) / majorStep);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => (first + index) * majorStep);
  }, [start, pixelsPerSecond, width]);

  const { inputDragRef, inputPreview, inputDragTooltip, beginInputDrag, moveInputDrag, finishInputDrag } = useInputDrag(
    {
      tracks,
      inputDragMode,
      selectedInputs,
      pixelsPerSecond,
      selectInput,
      setPreviewTrack,
      setInputEditPreview,
      commitInputEdit,
      commitInputEdits,
      onDragStart: () => {
        setFollowPlayback(false);
        setContextMenu(null);
        setInputHoverTooltip(null);
      },
    },
  );

  const inputItems = orderedVisibleTracks.flatMap((track, trackIndex) => {
    return replayInputSegments(track).flatMap((original) => {
      const drag = inputDragRef.current;
      const groupDelta = drag?.mode === 'move' && inputPreview ? inputPreview.startTime - drag.original.startTime : 0;
      const preview =
        drag && sameInput(drag.original, original)
          ? (inputPreview ?? original)
          : drag?.originals.some((item) => sameInput(item, original)) && groupDelta
            ? { ...original, startTime: original.startTime + groupDelta, endTime: original.endTime + groupDelta }
            : original;
      if (preview.endTime < start || preview.startTime > start + (width * 1000) / pixelsPerSecond) return [];
      const keyIndex = inputKeyNames.indexOf(preview.key);
      const base = numericColor(track.color);
      const laneIndex = keyIndex + 3;
      const rowHeight =
        layoutMode === 'overlap'
          ? Math.max(3, laneHeights[laneIndex] - 4)
          : Math.max(3, (laneHeights[laneIndex] - 4) / Math.max(1, orderedVisibleTracks.length));
      return [
        {
          original,
          preview,
          track,
          keyIndex,
          color: `#${inputVariantColor(base, keyIndex).toString(16).padStart(6, '0')}`,
          left: xForTime(preview.startTime),
          width: Math.max(5, ((preview.endTime - preview.startTime) * pixelsPerSecond) / 1000),
          top: laneTop(laneIndex) + 2 + (layoutMode === 'overlap' ? 0 : trackIndex * rowHeight),
          height: rowHeight - 1,
          opacity:
            layoutMode === 'overlap'
              ? selected.includes(track.id)
                ? 0.96
                : 0.38
              : selected.includes(track.id)
                ? 0.94
                : 0.66,
          zIndex: selected.includes(track.id) ? 8 : trackIndex + 1,
        },
      ];
    });
  });

  const showInputHover = (event: ReactPointerEvent<HTMLElement>, input: InputSelection, trackName: string) => {
    if (inputDragRef.current) return;
    const box = event.currentTarget.closest<HTMLElement>('.timeline-draw-area')?.getBoundingClientRect();
    if (!box) return;
    setInputHoverTooltip({
      x: Math.max(6, Math.min(box.width - 216, event.clientX - box.left + 12)),
      y: Math.max(4, event.clientY - box.top - 82),
      input,
      trackName,
    });
  };

  const { beginLaneResize, moveLaneResize, finishLaneResize } = useLaneResize(laneHeights, setLaneHeights);

  const visibleMs = (width * 1000) / pixelsPerSecond;
  const maxWindowStart = Math.max(timelineOrigin, durationMs - visibleMs);

  const laneAtPointer = (event: ReactWheelEvent<HTMLDivElement>): number | null => {
    const target = event.target as HTMLElement;
    const labelledLane = target.closest<HTMLElement>('[data-lane-index]');
    if (labelledLane) return Number(labelledLane.dataset.laneIndex);
    const drawArea = target.closest<HTMLElement>('.timeline-draw-area');
    if (!drawArea) return null;
    const y = event.clientY - drawArea.getBoundingClientRect().top - rulerHeight;
    if (y < 0) return null;
    let offset = 0;
    for (let lane = 0; lane < laneHeights.length; lane += 1) {
      offset += laneHeights[lane];
      if (y < offset) return lane;
    }
    return null;
  };

  const handleTimelineWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.premiere-popover, input, select')) return;
    event.preventDefault();
    const direction: -1 | 1 = event.deltaY > 0 ? 1 : -1;
    if (event.ctrlKey) {
      setPixelsPerSecond(pixelsPerSecond * (direction < 0 ? 1.12 : 1 / 1.12));
      return;
    }
    if (event.altKey) {
      const lane = laneAtPointer(event);
      if (lane === null) return;
      const delta = direction < 0 ? 4 : -4;
      setLaneHeights((current) =>
        current.map((height, index) => (index === lane ? Math.max(20, Math.min(140, height + delta)) : height)),
      );
      return;
    }
    setFollowPlayback(false);
    if (wheelMode === 'frame') {
      const track =
        tracks.find((item) => item.id === selectedInput?.trackId) ??
        tracks.find((item) => item.id === selected[0]) ??
        tracks[0];
      const frameTime = track ? adjacentReplayFrameTime(track.replay.frames, start, direction) : null;
      setWindowStart(Math.min(maxWindowStart, frameTime ?? start + direction * 17));
    } else setWindowStart(Math.min(maxWindowStart, start + direction * wheelStepMs));
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const preventWheelScroll = (event: WheelEvent) => event.preventDefault();
    viewport.addEventListener('wheel', preventWheelScroll, { passive: false });
    return () => viewport.removeEventListener('wheel', preventWheelScroll);
  }, []);

  useEffect(() => {
    const switchTool = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.matches('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (editorSurface !== 'timeline') return;
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        setTimelineTool('select');
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setTimelineTool('hand');
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setTimelineTool('cut');
      }
      if (event.key.toLowerCase() === 's' && event.shiftKey) {
        event.preventDefault();
        const current = useEditorStore.getState().snap;
        setSnap(
          current === 'off'
            ? 'hit-window'
            : current === 'hit-window'
              ? 'hit-object'
              : current === 'hit-object'
                ? 'all'
                : 'off',
        );
      } else if (event.key.toLowerCase() === 's') {
        const chosen = useEditorStore.getState().selectedInput;
        if (chosen && playhead > chosen.startTime && playhead < chosen.endTime) {
          event.preventDefault();
          cutInputAt(chosen.trackId, chosen.key, playhead);
        }
      }
    };
    window.addEventListener('keydown', switchTool);
    return () => window.removeEventListener('keydown', switchTool);
  }, [editorSurface, playhead]);

  return (
    <div
      className="timeline-scroll"
      onWheel={handleTimelineWheel}
      onPointerEnter={() => setEditorSurface('timeline')}
      onPointerDownCapture={() => setEditorSurface('timeline')}
      onPointerLeave={() => {
        if (!inputDragRef.current && !marqueeRef.current && !dragRef.current) setEditorSurface(null);
      }}
    >
      <TimelineToolbar
        timelineTool={timelineTool}
        setTimelineTool={setTimelineTool}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        resolution={resolution}
        brushRadiusMs={brushRadiusMs}
        setBrushRadiusMs={setBrushRadiusMs}
      />
      <div className="timeline-viewport" ref={viewportRef}>
        <div className="timeline-labels" style={{ minHeight: timelineHeight }}>
          <div className="timeline-ruler-label">
            <button
              className={`timeline-follow${followPlayback ? ' active' : ''}`}
              title="Follow playhead during playback"
              aria-pressed={followPlayback}
              onClick={() => setFollowPlayback((value) => !value)}
            >
              Follow
            </button>
          </div>
          {lanes.map((lane, index) => (
            <div
              className="timeline-lane-label"
              data-lane-index={index}
              key={lane}
              style={{ height: laneHeights[index] }}
            >
              {lane}
              <span
                className="lane-resize-handle"
                title={`Resize ${lane}`}
                onPointerDown={(event) => beginLaneResize(index, event)}
                onPointerMove={moveLaneResize}
                onPointerUp={finishLaneResize}
                onPointerCancel={finishLaneResize}
                onLostPointerCapture={finishLaneResize}
              />
            </div>
          ))}
          <div className="timeline-bottom-space" />
        </div>
        <div
          className="timeline-draw-area"
          style={{ minHeight: timelineHeight }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            setContextMenu(null);
            const box = event.currentTarget.getBoundingClientRect();
            const onRuler = event.clientY - box.top < rulerHeight;
            const clickedTime = start + ((event.clientX - box.left) * 1000) / pixelsPerSecond;
            const localY = event.clientY - box.top;
            if (!onRuler && timelineTool === 'brush') {
              const y = localY - rulerHeight;
              let offset = 0;
              let lane = -1;
              for (let index = 0; index < laneHeights.length; index += 1) {
                offset += laneHeights[index];
                if (y >= 0 && y < offset) {
                  lane = index;
                  break;
                }
              }
              const axis = lane === 1 ? 'x' : lane === 2 ? 'y' : null;
              const track =
                tracks.find((item) => item.id === useEditorStore.getState().previewTrackId) ??
                tracks.find((item) => selected.includes(item.id));
              if (axis && track && !track.locked) {
                event.currentTarget.setPointerCapture(event.pointerId);
                setFollowPlayback(false);
                beginBrushStroke(track.id);
                brushDragRef.current = { pointerId: event.pointerId, trackId: track.id, axis, lastY: event.clientY };
              }
              return;
            }
            if (
              !onRuler &&
              timelineTool === 'select' &&
              localY >= laneTop(0) &&
              localY <= laneTop(0) + laneHeights[0]
            ) {
              const toleranceMs = (10 * 1000) / pixelsPerSecond;
              let match = -1;
              let bestDistance = Number.POSITIVE_INFINITY;
              beatmapObjects.forEach((object, index) => {
                const inside =
                  clickedTime >= object.startTime - toleranceMs && clickedTime <= object.endTime + toleranceMs;
                const distance = inside
                  ? Math.min(Math.abs(clickedTime - object.startTime), Math.abs(clickedTime - object.endTime))
                  : Number.POSITIVE_INFINITY;
                if (inside && distance < bestDistance) {
                  match = index;
                  bestDistance = distance;
                }
              });
              if (match >= 0) {
                selectBeatmapObject(match);
                setPlayhead(beatmapObjects[match].startTime);
                return;
              }
            }
            if (!onRuler && timelineTool === 'select' && event.altKey) {
              event.currentTarget.setPointerCapture(event.pointerId);
              const x = event.clientX - box.left;
              marqueeRef.current = {
                pointerId: event.pointerId,
                x,
                y: rulerHeight,
                additive: event.ctrlKey || event.metaKey,
                timeRange: true,
              };
              setMarquee({ x, y: rulerHeight, width: 0, height: box.height - rulerHeight });
              return;
            }
            if (!onRuler && timelineTool === 'select') {
              event.currentTarget.setPointerCapture(event.pointerId);
              const x = event.clientX - box.left;
              const y = event.clientY - box.top;
              marqueeRef.current = {
                pointerId: event.pointerId,
                x,
                y,
                additive: event.ctrlKey || event.metaKey,
                timeRange: false,
              };
              setMarquee({ x, y, width: 0, height: 0 });
              return;
            }
            const mode = onRuler ? 'seek' : timelineTool === 'hand' ? 'pan' : null;
            if (!onRuler && timelineTool === 'cut') {
              const y = event.clientY - box.top - rulerHeight;
              let offset = 0;
              let lane = -1;
              for (let index = 0; index < laneHeights.length; index += 1) {
                offset += laneHeights[index];
                if (y >= 0 && y < offset) {
                  lane = index;
                  break;
                }
              }
              const key = inputKeyNames[lane - 3];
              if (key) {
                const track = [...orderedVisibleTracks]
                  .reverse()
                  .find((item) =>
                    replayInputSegments(item).some(
                      (input) => input.key === key && clickedTime > input.startTime && clickedTime < input.endTime,
                    ),
                  );
                if (track) cutInputAt(track.id, key, clickedTime);
              }
              return;
            }
            if (!mode) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { x: event.clientX, start, moved: false, mode };
            if (mode === 'seek') {
              setFollowPlayback(false);
              setPlayhead(snapPlayheadTime(start + ((event.clientX - box.left) * 1000) / pixelsPerSecond));
            }
          }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (timelineTool === 'brush') {
              setBrushHover({ x: event.clientX - box.left, y: event.clientY - box.top });
              const brush = brushDragRef.current;
              if (brush?.pointerId === event.pointerId) {
                const laneIndex = brush.axis === 'x' ? 1 : 2;
                const range = brush.axis === 'x' ? 512 : 384;
                const dy = event.clientY - brush.lastY;
                const delta = (-dy / (laneHeights[laneIndex] - 7)) * range;
                const centerMs = start + ((event.clientX - box.left) * 1000) / pixelsPerSecond;
                applyBrushDab(brush.trackId, brush.axis, centerMs, brushRadiusMs, delta);
                brushDragRef.current = { ...brush, lastY: event.clientY };
                return;
              }
            }
            const selection = marqueeRef.current;
            if (selection?.pointerId === event.pointerId) {
              const box = event.currentTarget.getBoundingClientRect();
              const rawX = event.clientX - box.left;
              const x = rawX;
              const y = event.clientY - box.top;
              setMarquee({
                x: Math.min(selection.x, x),
                y: selection.timeRange ? rulerHeight : Math.min(selection.y, y),
                width: Math.abs(x - selection.x),
                height: selection.timeRange ? box.height - rulerHeight : Math.abs(y - selection.y),
              });
              return;
            }
            if (timelineTool === 'cut' && !dragRef.current) {
              const box = event.currentTarget.getBoundingClientRect();
              const y = event.clientY - box.top - rulerHeight;
              let offset = 0;
              let lane = -1;
              for (let index = 0; index < laneHeights.length; index += 1) {
                offset += laneHeights[index];
                if (y >= 0 && y < offset) {
                  lane = index;
                  break;
                }
              }
              setBladePreview(
                lane >= 0 ? { timeMs: start + ((event.clientX - box.left) * 1000) / pixelsPerSecond, lane } : null,
              );
            } else if (bladePreview) setBladePreview(null);
            const drag = dragRef.current;
            if (!drag) return;
            const dx = event.clientX - drag.x;
            if (drag.mode === 'seek') {
              const box = event.currentTarget.getBoundingClientRect();
              setPlayhead(snapPlayheadTime(start + ((event.clientX - box.left) * 1000) / pixelsPerSecond));
              drag.moved = true;
              return;
            }
            if (Math.abs(dx) > 3 && !drag.moved) {
              drag.moved = true;
              setFollowPlayback(false);
            }
            if (drag.moved) setWindowStart(drag.start - (dx * 1000) / pixelsPerSecond);
          }}
          onPointerUp={(event) => {
            const selection = marqueeRef.current;
            if (selection?.pointerId === event.pointerId) {
              const box = event.currentTarget.getBoundingClientRect();
              const rawEndX = event.clientX - box.left;
              const endX = rawEndX;
              const endY = event.clientY - box.top;
              const left = Math.min(selection.x, endX);
              const right = Math.max(selection.x, endX);
              const top = Math.min(selection.y, endY);
              const bottom = Math.max(selection.y, endY);
              const inputs = inputItems
                .filter(
                  (item) =>
                    item.left < right &&
                    item.left + item.width > left &&
                    (selection.timeRange || (item.top < bottom && item.top + item.height > top)),
                )
                .map((item) => item.original);
              const cursorLaneSelected =
                selection.timeRange ||
                ([1, 2] as const).some((lane) => top < laneTop(lane) + laneHeights[lane] && bottom > laneTop(lane));
              const cursorTrack =
                tracks.find((item) => item.id === useEditorStore.getState().previewTrackId) ??
                tracks.find((item) => selected.includes(item.id));
              const hasTimeSpan = Math.abs(right - left) >= 2;
              const selectedRange = hasTimeSpan
                ? {
                    startMs: Math.round(start + (left * 1000) / pixelsPerSecond),
                    endMs: Math.round(start + (right * 1000) / pixelsPerSecond),
                  }
                : null;
              selectInputs(inputs, selection.additive);
              selectTimeRange(selection.timeRange ? selectedRange : null);
              if (!selection.timeRange)
                selectCursorRange(
                  cursorLaneSelected && cursorTrack && selectedRange
                    ? { ...selectedRange, trackId: cursorTrack.id }
                    : null,
                );
              if (!selection.timeRange && !hasTimeSpan && cursorLaneSelected && cursorTrack?.replay.frames.length)
                selectCursorFrame(
                  nearestReplayFrameTime(cursorTrack.replay.frames, start + (selection.x * 1000) / pixelsPerSecond),
                );
              else if (!selection.timeRange && !selection.additive) selectCursorFrame(null);
              marqueeRef.current = null;
              setMarquee(null);
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              return;
            }
            dragRef.current = null;
            brushDragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            brushDragRef.current = null;
            marqueeRef.current = null;
            setMarquee(null);
          }}
          onLostPointerCapture={() => {
            dragRef.current = null;
            brushDragRef.current = null;
            marqueeRef.current = null;
            setMarquee(null);
          }}
          onPointerLeave={() => {
            setBladePreview(null);
            setInputHoverTooltip(null);
            setBrushHover(null);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            const localX = event.clientX - box.left;
            const maxHeight = Math.max(140, window.innerHeight - 16);
            const menuHeight = Math.min(310, maxHeight);
            setContextMenu({
              x: Math.max(4, Math.min(window.innerWidth - 188, event.clientX)),
              y: Math.max(4, Math.min(window.innerHeight - menuHeight - 4, event.clientY)),
              timeMs: Math.round(start + (localX * 1000) / pixelsPerSecond),
              maxHeight,
            });
          }}
        >
          <div className="timeline-canvas" ref={hostRef} />
          <div className="timeline-input-layer">
            {inputItems.map((item) => (
              <TimelineInputNode
                key={`${item.original.trackId}-${item.original.key}-${item.original.startTime}-${item.original.endTime}`}
                item={item}
                selected={selectedInputs.some((input) => sameInput(input, item.original))}
                interactive={timelineTool !== 'hand'}
                onPointerDown={(event) => {
                  const box = event.currentTarget.closest<HTMLElement>('.timeline-draw-area')?.getBoundingClientRect();
                  if (timelineTool === 'select' && event.altKey) return;
                  if (timelineTool === 'cut') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (box)
                      cutInputAt(
                        item.original.trackId,
                        item.original.key,
                        start + ((event.clientX - box.left) * 1000) / pixelsPerSecond,
                      );
                    return;
                  }
                  if (timelineTool !== 'select') {
                    event.stopPropagation();
                    return;
                  }
                  if (event.ctrlKey || event.metaKey) {
                    event.stopPropagation();
                    selectInput(item.original, true);
                    return;
                  }
                  if (event.shiftKey && selectedInput) {
                    event.stopPropagation();
                    const first = Math.min(selectedInput.startTime, item.original.startTime);
                    const last = Math.max(selectedInput.startTime, item.original.startTime);
                    selectInputs(
                      inputItems
                        .filter(
                          (candidate) => candidate.original.startTime >= first && candidate.original.startTime <= last,
                        )
                        .map((candidate) => candidate.original),
                    );
                    return;
                  }
                  if (!item.track.locked) beginInputDrag(event, item.original, 'move');
                  else {
                    event.stopPropagation();
                    selectInput(item.original);
                    setPreviewTrack(item.original.trackId);
                  }
                }}
                onPointerEnter={(event) => {
                  if (timelineTool === 'select') showInputHover(event, item.preview, item.track.name);
                }}
                onPointerMove={(event) => {
                  if (inputDragRef.current) moveInputDrag(event);
                  else if (timelineTool === 'select') showInputHover(event, item.preview, item.track.name);
                }}
                onPointerLeave={() => setInputHoverTooltip(null)}
                onContextMenu={() => {
                  selectInput(item.original);
                  setPreviewTrack(item.original.trackId);
                }}
                onPointerUp={finishInputDrag}
                onPointerCancel={finishInputDrag}
                onLostPointerCapture={finishInputDrag}
                onBeginHandleDrag={(event, mode) => beginInputDrag(event, item.original, mode)}
              />
            ))}
          </div>
          {selectedTimeRange && (
            <div
              className="timeline-time-range"
              style={{
                left: xForTime(selectedTimeRange.startMs),
                top: rulerHeight,
                width: Math.max(1, xForTime(selectedTimeRange.endMs) - xForTime(selectedTimeRange.startMs)),
                height: contentHeight - rulerHeight - 30,
              }}
            />
          )}
          {!selectedTimeRange && selectedCursorRange && (
            <div
              className="timeline-time-range cursor-range"
              style={{
                left: xForTime(selectedCursorRange.startMs),
                top: laneTop(1),
                width: Math.max(1, xForTime(selectedCursorRange.endMs) - xForTime(selectedCursorRange.startMs)),
                height: laneHeights[1] + laneHeights[2],
              }}
            />
          )}
          {marquee && (
            <div
              className="timeline-marquee"
              style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
            />
          )}
          <div className="timeline-ticks">
            {ticks.map((timeMs) => (
              <span key={timeMs} style={{ left: xForTime(timeMs) + 4 }}>
                {formatTime(timeMs)}
              </span>
            ))}
          </div>
          {timelineTool === 'brush' && brushHover && (
            <div
              className="timeline-brush-cursor"
              style={{
                left: brushHover.x - (brushRadiusMs * pixelsPerSecond) / 1000,
                top: brushHover.y - (brushRadiusMs * pixelsPerSecond) / 1000,
                width: (brushRadiusMs * pixelsPerSecond * 2) / 1000,
                height: (brushRadiusMs * pixelsPerSecond * 2) / 1000,
              }}
            />
          )}
          {timelineTool === 'cut' && bladePreview && (
            <div
              className="timeline-blade-preview"
              style={{
                left: xForTime(bladePreview.timeMs),
                top: laneTop(bladePreview.lane),
                height: laneHeights[bladePreview.lane],
              }}
            >
              <Scissors size={10} />
              <span
                className="timeline-blade-time"
                style={{ transform: xForTime(bladePreview.timeMs) > width - 105 ? 'translateX(-100%)' : undefined }}
              >
                {formatTime(Math.round(bladePreview.timeMs))} · {Math.round(bladePreview.timeMs)} ms
              </span>
            </div>
          )}
          <div className="timeline-playhead" style={{ left: xForTime(playhead) }}>
            <span />
          </div>
          {inputDragTooltip && inputPreview && (
            <div className="input-drag-tooltip" style={{ left: inputDragTooltip.x, top: inputDragTooltip.y }}>
              <strong>
                {inputDragTooltip.mode === 'move'
                  ? `Move ${inputPreview.key}`
                  : inputDragTooltip.mode === 'start'
                    ? `Set ${inputPreview.key} press`
                    : `Set ${inputPreview.key} release`}
              </strong>
              <span>
                Press {formatTime(inputPreview.startTime)} · {inputPreview.startTime} ms
              </span>
              <span>
                Release {formatTime(inputPreview.endTime)} · {inputPreview.endTime} ms
              </span>
              <span>Length {inputPreview.endTime - inputPreview.startTime} ms</span>
              <span className={inputDragTooltip.precision ? 'precision-active' : ''}>
                {inputDragTooltip.precision ? 'Ctrl precision · 10× slower' : 'Hold Ctrl for 10× precision'}
              </span>
            </div>
          )}
          {!inputDragTooltip && timelineTool === 'select' && inputHoverTooltip && (
            <div
              className="input-drag-tooltip input-hover-tooltip"
              style={{ left: inputHoverTooltip.x, top: inputHoverTooltip.y }}
            >
              <strong>
                {inputHoverTooltip.input.key} input · {inputHoverTooltip.trackName}
              </strong>
              <span>
                Press {formatTime(inputHoverTooltip.input.startTime)} · {inputHoverTooltip.input.startTime} ms
              </span>
              <span>
                Release {formatTime(inputHoverTooltip.input.endTime)} · {inputHoverTooltip.input.endTime} ms
              </span>
              <span>Length {inputHoverTooltip.input.endTime - inputHoverTooltip.input.startTime} ms</span>
            </div>
          )}
          {contextMenu && (
            <TimelineContextMenu
              menu={contextMenu}
              onClose={() => setContextMenu(null)}
              hasSelection={!!(selectedInputs.length || selectedTimeRange || selectedCursorRange)}
              onCopy={copySelectedInputs}
              canPaste={!!inputClipboard}
              onPasteAtTime={(timeMs) => pasteInputs(false, timeMs)}
              onPasteInPlace={() => pasteInputs(true)}
              inputKeys={inputKeyNames}
              onAddInput={(key, timeMs) => {
                const track =
                  tracks.find((item) => item.id === selectedInput?.trackId) ??
                  tracks.find((item) => item.id === selected[0]) ??
                  tracks[0];
                setInputKey(key);
                if (track) commitInputEdit(null, { trackId: track.id, key, startTime: timeMs, endTime: timeMs + 17 });
              }}
              canDeleteSelected={!!selectedInput}
              onDeleteSelected={deleteSelectedInput}
              inputDragMode={inputDragMode}
              onSetInputDragMode={setInputDragMode}
            />
          )}
        </div>
      </div>
      <div className="timeline-footer">
        <TimelineZoomControl pixelsPerSecond={pixelsPerSecond} setPixelsPerSecond={setPixelsPerSecond} />
        <input
          aria-label="Timeline horizontal scrollbar"
          className="timeline-horizontal-scroll"
          type="range"
          min={timelineOrigin}
          max={Math.max(timelineOrigin, maxWindowStart)}
          step={wheelMode === 'frame' ? 1 : Math.max(1, wheelStepMs)}
          value={Math.max(timelineOrigin, Math.min(maxWindowStart, start))}
          onChange={(event) => {
            setFollowPlayback(false);
            setWindowStart(Number(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
