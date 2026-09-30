import { useEffect, useMemo, useRef } from 'react';
import { buildHitsoundEvents, type HitsoundEvent, type ParsedBeatmap, type SliderBreak } from '@ore/beatmap-viewer';
import { useEditorStore, type SimulationResult } from '../stores/editor';
import { readSkinFile, useSkinStore } from '../stores/skin';
import { sidecarBlobRequest } from '../sidecar';
import { HitsoundPlayer } from './hitsoundPlayer';

// How far ahead of the playhead samples are scheduled, so they land on time despite frame jitter.
const LOOKAHEAD_MS = 60;

/// Moves hitsounds to what the replay actually did: circles and slider heads sound at the press
/// that hit them and not at all when missed; slider ticks, repeats and tails that were not tracked
/// stay silent. Without a simulation every object sounds at its own time.
function replayEvents(
  events: readonly HitsoundEvent[],
  simulation: SimulationResult | null,
  breaks: readonly SliderBreak[],
  map: ParsedBeatmap,
): HitsoundEvent[] {
  if (!simulation) return [...events];
  const judgements = new Map(simulation.judgements.map((judgement) => [judgement.objectIndex, judgement]));
  const missedChecks = new Map(breaks.map((item) => [item.objectIndex, item.missedChecks]));
  const result: HitsoundEvent[] = [];
  for (const event of events) {
    const judgement = judgements.get(event.objectIndex);
    if (event.part === 'head') {
      if (!judgement || judgement.hitTime == null) continue;
      result.push({ ...event, time: judgement.hitTime });
    } else if (event.part === 'spinner') {
      if (judgement?.result !== 'miss') result.push(event);
    } else {
      const missed = missedChecks.get(event.objectIndex) ?? [];
      const object = map.hitObjects[event.objectIndex];
      const isMissed =
        event.part === 'tail'
          ? missed.some((time) => time >= object.endTime - 40)
          : missed.some((time) => Math.abs(time - event.time) < 2);
      if (!isMissed) result.push(event);
    }
  }
  // Combo breaks: osu! plays combobreak when a combo of 20 or more is lost.
  let previous = 0;
  for (const judgement of [...simulation.judgements].sort((a, b) => a.objectIndex - b.objectIndex)) {
    if (judgement.comboAfter < previous && previous >= 20) {
      const object = map.hitObjects[judgement.objectIndex];
      const tail = object ? object.endTime - Math.min(36, (object.endTime - object.startTime) / 2) : 0;
      const brokenAt = missedChecks.get(judgement.objectIndex)?.find((time) => Math.abs(time - tail) > 0.5);
      result.push({
        time: brokenAt ?? (judgement.kind === 'circle' ? judgement.startTime : judgement.endTime),
        objectIndex: judgement.objectIndex,
        part: 'combobreak',
        samples: [{ name: 'combobreak', index: 0, volume: 100, file: null }],
      });
    }
    previous = judgement.comboAfter;
  }
  return result.sort((a, b) => a.time - b.time);
}

/// Plays the beatmap's hitsounds (with the selected osu! skin as fallback) while the main
/// playfield plays.
export function useHitsounds({
  beatmap,
  beatmapHash,
  simulation,
  breaks,
  enabled,
}: {
  beatmap: ParsedBeatmap | null;
  beatmapHash: string | null;
  simulation: SimulationResult | null;
  breaks: readonly SliderBreak[];
  enabled: boolean;
}) {
  const osuDirectory = useSkinStore((state) => state.osuDirectory);
  const skinName = useSkinStore((state) => state.skinName);
  const skinFiles = useSkinStore((state) => state.skinFiles);
  const hitsoundsEnabled = useSkinStore((state) => state.hitsoundsEnabled);
  const hitsoundVolume = useSkinStore((state) => state.hitsoundVolume);
  const useSkinHitsounds = useSkinStore((state) => state.useSkinHitsounds);

  const player = useMemo(() => {
    if (!enabled) return null;
    return new HitsoundPlayer(
      async (file) => {
        if (!beatmapHash) return null;
        try {
          const blob = await sidecarBlobRequest(`/api/beatmaps/${beatmapHash}/file?name=${encodeURIComponent(file)}`);
          return await blob.arrayBuffer();
        } catch {
          return null;
        }
      },
      async (file) => (osuDirectory && skinName ? readSkinFile(osuDirectory, skinName, file).catch(() => null) : null),
      skinFiles,
      useSkinHitsounds,
    );
  }, [enabled, beatmapHash, osuDirectory, skinName, skinFiles, useSkinHitsounds]);
  useEffect(() => () => player?.dispose(), [player]);

  const baseEvents = useMemo(() => (beatmap ? buildHitsoundEvents(beatmap) : []), [beatmap]);
  const events = useMemo(
    () => (beatmap ? replayEvents(baseEvents, simulation, breaks, beatmap) : []),
    [baseEvents, simulation, breaks, beatmap],
  );

  // Decode every distinct sample up front so the first hits are not late.
  useEffect(() => {
    if (!player || !hitsoundsEnabled) return;
    const seen = new Set<string>();
    for (const event of baseEvents)
      for (const sample of event.samples) {
        const key = `${sample.file ?? ''}|${sample.name}|${sample.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        void player.resolve(sample);
      }
  }, [player, baseEvents, hitsoundsEnabled]);

  const scheduledUntil = useRef<number | null>(null);
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        if (!player || !hitsoundsEnabled) return;
        if (!state.playing) {
          if (previous.playing) player.cancelPending();
          scheduledUntil.current = null;
          return;
        }
        const now = state.playheadMs;
        const from = scheduledUntil.current;
        // A seek (backwards or a big jump) restarts scheduling from the new position.
        if (from === null || now < from - LOOKAHEAD_MS - 5 || now - from > 400) {
          if (from !== null) player.cancelPending();
          scheduledUntil.current = now;
          return;
        }
        const until = now + LOOKAHEAD_MS;
        if (until <= from) return;
        // The preview clock runs map time at the editor's playback rate.
        const rate = Math.max(0.001, state.playbackRate);
        const gain = (hitsoundVolume / 100) * (state.volume / 100);
        let low = 0;
        let high = events.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (events[mid].time <= from) low = mid + 1;
          else high = mid;
        }
        for (let index = low; index < events.length && events[index].time <= until; index++)
          player.play(events[index].samples, (events[index].time - now) / rate, gain);
        scheduledUntil.current = until;
      }),
    [player, events, hitsoundsEnabled, hitsoundVolume],
  );
}
