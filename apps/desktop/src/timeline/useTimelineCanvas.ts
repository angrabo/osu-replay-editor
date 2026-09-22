import { Application, Graphics } from 'pixi.js';
import { inputVariantColor } from '@ore/beatmap-viewer';
import { useEffect, useRef, useState } from 'react';
import {
  logicalKeys,
  type BeatmapTimelineObject,
  type ReplayFrame,
  type ReplayKeyEvent,
  type SimulationResult,
  type Track,
} from '../stores/editor';
import type { TimelineLayout } from './TimelineToolbar';

const lanes = ['Hit Objects', 'Cursor X', 'Cursor Y', 'M1', 'M2', 'K1', 'K2', 'Judgements'];
const rulerHeight = 40;
const rulerStepsMs = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];

function numericColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function lowerBound<T extends { timeMs: number }>(items: readonly T[], time: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].timeMs < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export { lanes, rulerHeight, rulerStepsMs, numericColor, lowerBound };

/// <summary>
/// Owns the timeline's Pixi canvas: mounting the Application/Graphics once, resizing it to the
/// host element, and redrawing lanes, hit objects, cursor curves, input blocks and judgements
/// whenever the given inputs change.
/// </summary>
export function useTimelineCanvas(params: {
  timelineHeight: number;
  laneHeights: number[];
  start: number;
  pixelsPerSecond: number;
  beatmapObjects: BeatmapTimelineObject[];
  selectedBeatmapObjectIndex: number | null;
  orderedVisibleTracks: Track[];
  selected: string[];
  layoutMode: TimelineLayout;
  simulation: SimulationResult | null;
  xForTime: (time: number) => number;
  laneTop: (lane: number) => number;
}) {
  const {
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
  } = params;
  const hostRef = useRef<HTMLDivElement>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const [width, setWidth] = useState(900);

  drawRef.current = () => {
    const graphics = graphicsRef.current;
    const host = hostRef.current;
    if (!graphics || !host) return;
    const canvasWidth = host.clientWidth;
    const canvasHeight = Math.max(timelineHeight, host.clientHeight);
    graphics.clear();
    graphics.rect(0, 0, canvasWidth, canvasHeight).fill(0x111923);
    graphics.rect(0, 0, canvasWidth, rulerHeight).fill(0x151d27);

    for (let lane = 0; lane < lanes.length; lane++) {
      const y = laneTop(lane);
      const height = laneHeights[lane];
      graphics.rect(0, y, canvasWidth, height).fill(lane % 2 ? 0x131b25 : 0x101821);
      graphics.moveTo(0, y).lineTo(canvasWidth, y).stroke({ color: 0x2b3744, width: 1, alpha: 0.8 });
    }

    const majorStep = rulerStepsMs.find((step) => (step * pixelsPerSecond) / 1000 >= 90) ?? 60000;
    const minorStep = majorStep / 5;
    const firstTick = Math.ceil(start / minorStep);
    const lastTick = Math.floor((start + (canvasWidth * 1000) / pixelsPerSecond) / minorStep);
    for (let tick = firstTick; tick <= lastTick; tick++) {
      const timeMs = tick * minorStep;
      const x = xForTime(timeMs);
      const major = tick % 5 === 0;
      if (major)
        graphics.moveTo(x, rulerHeight).lineTo(x, canvasHeight).stroke({ color: 0x4b5767, width: 1, alpha: 0.26 });
      graphics
        .moveTo(x, rulerHeight - (major ? 13 : 6))
        .lineTo(x, rulerHeight)
        .stroke({ color: major ? 0x9db2c9 : 0x718092, width: 1, alpha: major ? 0.8 : 0.5 });
    }

    for (const [objectIndex, object] of beatmapObjects.entries()) {
      const x = xForTime(object.startTime);
      if (x < -20 || x > canvasWidth + 20) continue;
      const durationWidth = Math.max(0, ((object.endTime - object.startTime) * pixelsPerSecond) / 1000);
      if (durationWidth > 3) {
        const objectColor = object.kind === 'spinner' ? 0x5f9eea : 0xb985f5;
        graphics
          .roundRect(x, laneTop(0) + Math.max(3, (laneHeights[0] - 15) / 2), Math.max(5, durationWidth), 15, 7)
          .fill({ color: objectColor, alpha: 0.22 });
        graphics
          .roundRect(x, laneTop(0) + Math.max(3, (laneHeights[0] - 15) / 2), Math.max(5, durationWidth), 15, 7)
          .stroke({
            color: selectedBeatmapObjectIndex === objectIndex ? 0xffffff : objectColor,
            width: selectedBeatmapObjectIndex === objectIndex ? 2.4 : 1.4,
            alpha: 0.95,
          });
      } else {
        graphics.circle(x, laneTop(0) + laneHeights[0] / 2, 8).fill({ color: 0x563b83, alpha: 0.25 });
        graphics.circle(x, laneTop(0) + laneHeights[0] / 2, 8).stroke({
          color: selectedBeatmapObjectIndex === objectIndex ? 0xffffff : 0xb985f5,
          width: selectedBeatmapObjectIndex === objectIndex ? 2.5 : 1.5,
          alpha: 0.95,
        });
      }
    }

    orderedVisibleTracks.forEach((track, trackIndex) => {
      const selectedAlpha = selected.includes(track.id) ? 0.94 : 0.48;
      const base = numericColor(track.color);
      const frames = track.replay.frames;
      const endTime = start + (canvasWidth * 1000) / pixelsPerSecond;
      const firstFrame = Math.max(0, lowerBound<ReplayFrame>(frames, start) - 1);
      const lastFrame = Math.min(frames.length, lowerBound<ReplayFrame>(frames, endTime) + 1);
      for (const laneIndex of [1, 2]) {
        const baseY = laneTop(laneIndex) + laneHeights[laneIndex] / 2;
        let started = false;
        for (let index = firstFrame; index < lastFrame; index++) {
          const frame = frames[index];
          const coordinate = laneIndex === 1 ? frame.x : frame.y;
          const range = laneIndex === 1 ? 512 : 384;
          const y = baseY - (coordinate / range - 0.5) * (laneHeights[laneIndex] - 7);
          if (!started) {
            graphics.moveTo(xForTime(frame.timeMs), y);
            started = true;
          } else graphics.lineTo(xForTime(frame.timeMs), y);
        }
        if (started)
          graphics.stroke({ color: base, width: selected.includes(track.id) ? 1.8 : 1.15, alpha: selectedAlpha });
      }

      const events = track.replay.keyEvents;
      const keyNames = ['M1', 'M2', 'K1', 'K2'];
      const priorFrameIndex = lowerBound<ReplayFrame>(frames, start) - 1;
      const stateAtStart = priorFrameIndex >= 0 ? logicalKeys(frames[priorFrameIndex].keys) : 0;
      const firstEvent = lowerBound<ReplayKeyEvent>(events, start);
      for (let keyIndex = 0; keyIndex < keyNames.length; keyIndex++) {
        const laneIndex = keyIndex + 3;
        const laneY = laneTop(laneIndex);
        const rowHeight =
          layoutMode === 'overlap'
            ? Math.max(3, laneHeights[laneIndex] - 4)
            : Math.max(3, (laneHeights[laneIndex] - 4) / Math.max(1, orderedVisibleTracks.length));
        const y = laneY + 2 + (layoutMode === 'overlap' ? 0 : trackIndex * rowHeight);
        const inputAlpha = layoutMode === 'overlap' ? (selected.includes(track.id) ? 0.94 : 0.3) : selectedAlpha;
        let downAt: number | null = (stateAtStart & (1 << keyIndex)) !== 0 ? start : null;
        for (let index = firstEvent; index < events.length; index++) {
          const event = events[index];
          if (event.timeMs > endTime) break;
          if (event.key !== keyNames[keyIndex]) continue;
          if (event.down) downAt = event.timeMs;
          else if (downAt !== null) {
            const x = Math.max(0, xForTime(downAt));
            graphics
              .rect(x, y, Math.max(2, xForTime(event.timeMs) - x), rowHeight - 1)
              .fill({ color: inputVariantColor(base, keyIndex), alpha: inputAlpha });
            downAt = null;
          }
          const x = xForTime(event.timeMs);
          graphics.rect(x, y, 2, rowHeight - 1).fill({ color: inputVariantColor(base, keyIndex), alpha: inputAlpha });
        }
        if (downAt !== null)
          graphics
            .rect(
              Math.max(0, xForTime(downAt)),
              y,
              Math.max(2, canvasWidth - Math.max(0, xForTime(downAt))),
              rowHeight - 1,
            )
            .fill({ color: inputVariantColor(base, keyIndex), alpha: inputAlpha * 0.6 });
      }
    });

    if (simulation) {
      const y = laneTop(7) + laneHeights[7] / 2;
      const colours = { '100': 0x59d98e, '50': 0xf29a4a, miss: 0xff6575 } as const;
      for (const judgement of simulation.judgements) {
        if (judgement.result === '300') continue;
        const x = xForTime(judgement.startTime);
        if (x < -8 || x > canvasWidth + 8) continue;
        const colour = colours[judgement.result];
        if (judgement.result === 'miss') {
          graphics
            .moveTo(x - 4, y - 4)
            .lineTo(x + 4, y + 4)
            .moveTo(x + 4, y - 4)
            .lineTo(x - 4, y + 4)
            .stroke({ color: colour, width: 2, alpha: 0.95 });
        } else {
          const radius = judgement.result === '100' ? 4.5 : 4;
          graphics.circle(x, y, radius).fill({ color: colour, alpha: 0.28 });
          graphics.circle(x, y, radius).stroke({ color: colour, width: 1.5, alpha: 1 });
        }
      }
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let app: Application | null = null;
    let observer: ResizeObserver | null = null;
    void (async () => {
      const next = new Application();
      await next.init({
        width: Math.max(1, host.clientWidth),
        height: Math.max(timelineHeight, host.clientHeight),
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled) {
        next.destroy(true);
        return;
      }
      app = next;
      host.appendChild(next.canvas);
      const graphics = new Graphics();
      graphicsRef.current = graphics;
      next.stage.addChild(graphics);
      observer = new ResizeObserver(() => {
        const nextWidth = Math.max(1, host.clientWidth);
        next.renderer.resize(nextWidth, Math.max(timelineHeight, host.clientHeight));
        setWidth(nextWidth);
        drawRef.current();
      });
      observer.observe(host);
      drawRef.current();
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      graphicsRef.current = null;
      app?.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawRef.current();
  }, [
    orderedVisibleTracks,
    selected,
    start,
    pixelsPerSecond,
    beatmapObjects,
    selectedBeatmapObjectIndex,
    laneHeights,
    layoutMode,
    simulation,
  ]);

  return { hostRef, width };
}
