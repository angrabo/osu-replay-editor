import { useMemo } from 'react';
import { replayPointAt, type SliderBreak } from '@ore/beatmap-viewer';
import {
  useEditorStore,
  type BeatmapTimelineObject,
  type HitWindows,
  type ReplayFrame,
  type ReplayKeyEvent,
  type SimulationJudgement,
} from './stores/editor';

export type MissCauseKind = 'no-press' | 'aim' | 'early' | 'late' | 'notelock' | 'slider-break' | 'spinner' | 'unknown';
export type MissCause = { kind: MissCauseKind; summary: string; detail: string };
export type MissEntry = { objectIndex: number; time: number; kind: BeatmapTimelineObject['kind']; cause: MissCause };

// A press this far before an object still counts as a miss for it (osu!'s miss window).
const MISS_WINDOW_MS = 400;

const ms = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)} ms`;
const px = (value: number) => `${Math.round(value)} px`;

/// Why a judged miss happened, from the replay's presses and cursor around the object:
/// no press at all, a press off the circle (aim), a press outside the 50 window (timing),
/// a press blocked because the previous object was still waiting (notelock), or a slider that
/// was hit but then broken.
export function analyseMisses(input: {
  objects: readonly BeatmapTimelineObject[];
  judgements: readonly SimulationJudgement[];
  frames: readonly ReplayFrame[];
  keyEvents: readonly ReplayKeyEvent[];
  windows: HitWindows;
  radius: number;
  hardRock: boolean;
  sliderBreaks: readonly SliderBreak[];
}): MissEntry[] {
  const { objects, judgements, frames, keyEvents, windows, radius, hardRock, sliderBreaks } = input;
  const byIndex = new Map(judgements.map((judgement) => [judgement.objectIndex, judgement]));
  const presses = keyEvents.filter((event) => event.down);
  const breaks = new Map(sliderBreaks.map((item) => [item.objectIndex, item]));
  const entries: MissEntry[] = [];

  for (const judgement of judgements) {
    if (judgement.result !== 'miss') continue;
    const object = objects[judgement.objectIndex];
    if (!object) continue;
    const entry = (cause: MissCause) =>
      entries.push({ objectIndex: judgement.objectIndex, time: object.startTime, kind: object.kind, cause });

    if (object.kind === 'spinner') {
      entry({
        kind: 'spinner',
        summary: 'Spinner not completed',
        detail: 'Not enough rotations before the spinner ended.',
      });
      continue;
    }
    if (object.kind === 'slider' && judgement.hitTime != null) {
      const broken = breaks.get(judgement.objectIndex);
      entry({
        kind: 'slider-break',
        summary: 'Slider broken after the head',
        detail: broken?.missedChecks.length
          ? `${broken.missedChecks.length} tick${broken.missedChecks.length === 1 ? '' : 's'} or ends missed while not tracking.`
          : 'The head was hit but the rest of the slider was not tracked.',
      });
      continue;
    }

    const centre = { x: object.x, y: hardRock ? 384 - object.y : object.y };
    const around = presses
      .filter(
        (press) =>
          press.timeMs >= object.startTime - MISS_WINDOW_MS && press.timeMs <= object.startTime + windows.meh + 200,
      )
      .map((press) => {
        const cursor = replayPointAt(frames, press.timeMs);
        return {
          ...press,
          offset: press.timeMs - object.startTime,
          distance: cursor ? Math.hypot(cursor.x - centre.x, cursor.y - centre.y) : Number.POSITIVE_INFINITY,
        };
      });
    const inWindow = around.filter((press) => Math.abs(press.offset) <= windows.meh);
    const onTarget = inWindow.filter((press) => press.distance <= radius);

    if (onTarget.length) {
      const press = onTarget[0];
      const previous = [...judgements]
        .filter((item) => item.objectIndex < judgement.objectIndex && objects[item.objectIndex]?.kind !== 'spinner')
        .sort((a, b) => b.objectIndex - a.objectIndex)[0];
      const previousObject = previous ? objects[previous.objectIndex] : null;
      const previousDone = previous
        ? (previous.hitTime ?? (previousObject ? previousObject.startTime + windows.meh : -Infinity))
        : -Infinity;
      if (previous && previousDone > press.timeMs)
        entry({
          kind: 'notelock',
          summary: 'Notelock',
          detail: `${press.key} at ${ms(press.offset)} was on the circle, but #${previous.objectIndex + 1} was still waiting to be hit.`,
        });
      else
        entry({
          kind: 'unknown',
          summary: 'Pressed on time and on target',
          detail: `${press.key} at ${ms(press.offset)}, ${px(press.distance)} from the centre. Check the key order or overlapping objects.`,
        });
      continue;
    }
    if (inWindow.length) {
      const closest = [...inWindow].sort((a, b) => a.distance - b.distance)[0];
      entry({
        kind: 'aim',
        summary: `Aim · ${px(closest.distance - radius)} outside the circle`,
        detail: `${closest.key} at ${ms(closest.offset)}, cursor ${px(closest.distance)} from the centre (radius ${px(radius)}).`,
      });
      continue;
    }
    const early = around.filter((press) => press.offset < -windows.meh).sort((a, b) => b.offset - a.offset)[0];
    if (early) {
      entry({
        kind: 'early',
        summary: `Too early · ${ms(early.offset)}`,
        detail: `${early.key} landed ${Math.round(-early.offset - windows.meh)} ms before the 50 window opened.`,
      });
      continue;
    }
    const late = around.filter((press) => press.offset > windows.meh).sort((a, b) => a.offset - b.offset)[0];
    if (late) {
      entry({
        kind: 'late',
        summary: `Too late · ${ms(late.offset)}`,
        detail: `${late.key} landed ${Math.round(late.offset - windows.meh)} ms after the 50 window closed.`,
      });
      continue;
    }
    const cursor = replayPointAt(frames, object.startTime);
    const distance = cursor ? Math.hypot(cursor.x - centre.x, cursor.y - centre.y) : null;
    entry({
      kind: 'no-press',
      summary: 'No press',
      detail:
        distance === null
          ? 'No key was pressed near this object.'
          : `No key was pressed near this object; the cursor was ${px(distance)} from the centre.`,
    });
  }
  return entries.sort((a, b) => a.time - b.time);
}

/// Miss causes for the previewed replay, recomputed when its simulation or inputs change.
export function useMissAnalysis(): MissEntry[] | null {
  const track = useEditorStore((state) => state.tracks.find((item) => item.id === state.previewTrackId) ?? null);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const objects = useEditorStore((state) => state.beatmapObjects);
  const windows = useEditorStore((state) => state.hitWindows);
  const radius = useEditorStore((state) => state.circleRadius);
  const sliderBreaks = useEditorStore((state) => state.sliderBreaks);
  return useMemo(() => {
    if (!track || !simulation || !windows || radius === null) return null;
    return analyseMisses({
      objects,
      judgements: simulation.judgements,
      frames: track.replay.frames,
      keyEvents: track.replay.keyEvents,
      windows,
      radius,
      hardRock: (track.exportMetadata.mods & 16) !== 0,
      sliderBreaks,
    });
  }, [track, simulation, objects, windows, radius, sliderBreaks]);
}
