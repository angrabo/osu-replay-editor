import type { HitObject, HitSample, ParsedBeatmap, TimingPoint } from './parser';

/// One sample to play: the skin sample name (e.g. "soft-hitclap"), the custom index that picks a
/// beatmap-provided variant ("soft-hitclap2.wav"; 0 = skin only), the volume in percent, and a
/// custom file that replaces the whole lookup.
export type HitsoundSample = { name: string; index: number; volume: number; file: string | null };
export type HitsoundPart = 'head' | 'repeat' | 'tail' | 'tick' | 'spinner' | 'combobreak';
export type HitsoundEvent = { time: number; objectIndex: number; part: HitsoundPart; samples: HitsoundSample[] };

const setName = (set: number) => (set === 2 ? 'soft' : set === 3 ? 'drum' : 'normal');

function pointAt(points: readonly TimingPoint[], time: number): TimingPoint | null {
  let active: TimingPoint | null = null;
  // Stable looks the sample point up slightly after the object so points placed on it apply.
  for (const point of points) {
    if (point.time > time + 5) break;
    active = point;
  }
  return active;
}

function edgeSamples(
  map: ParsedBeatmap,
  time: number,
  additions: number,
  normalSet: number,
  additionSet: number,
  hitSample: HitSample,
): HitsoundSample[] {
  const point = pointAt(map.timingPoints, time);
  const normal = normalSet || point?.sampleSet || map.defaultSampleSet;
  const addition = additionSet || normal;
  const index = hitSample.index || point?.sampleIndex || 0;
  const volume = hitSample.volume || point?.volume || 100;
  if (hitSample.filename) return [{ name: `${setName(normal)}-hitnormal`, index, volume, file: hitSample.filename }];
  const samples: HitsoundSample[] = [{ name: `${setName(normal)}-hitnormal`, index, volume, file: null }];
  if (additions & 2) samples.push({ name: `${setName(addition)}-hitwhistle`, index, volume, file: null });
  if (additions & 4) samples.push({ name: `${setName(addition)}-hitfinish`, index, volume, file: null });
  if (additions & 8) samples.push({ name: `${setName(addition)}-hitclap`, index, volume, file: null });
  return samples;
}

function tickTimes(slider: Extract<HitObject, { kind: 'slider' }>): number[] {
  const times: number[] = [];
  const length = Math.max(1, slider.pixelLength);
  if (slider.tickDistance <= 0) return times;
  for (let repeat = 0; repeat < slider.repeats; repeat++)
    for (let distance = slider.tickDistance; distance < length - 0.5; distance += slider.tickDistance) {
      const progress = distance / length;
      times.push(slider.startTime + (repeat + (repeat % 2 ? 1 - progress : progress)) * slider.spanDuration);
    }
  return times.sort((a, b) => a - b);
}

/// Every hitsound the map would play if all objects were hit, in time order. The caller drops or
/// moves events according to the replay's judgements.
export function buildHitsoundEvents(map: ParsedBeatmap): HitsoundEvent[] {
  const events: HitsoundEvent[] = [];
  map.hitObjects.forEach((object, objectIndex) => {
    const sample = object.hitSample;
    if (object.kind === 'circle') {
      events.push({
        time: object.startTime,
        objectIndex,
        part: 'head',
        samples: edgeSamples(map, object.startTime, object.hitSound, sample.normalSet, sample.additionSet, sample),
      });
      return;
    }
    if (object.kind === 'spinner') {
      events.push({
        time: object.endTime,
        objectIndex,
        part: 'spinner',
        samples: edgeSamples(map, object.endTime, object.hitSound, sample.normalSet, sample.additionSet, sample),
      });
      return;
    }
    for (let edge = 0; edge <= object.repeats; edge++) {
      const time = object.startTime + edge * object.spanDuration;
      const [normalSet, additionSet] = object.edgeSets[edge] ?? [sample.normalSet, sample.additionSet];
      events.push({
        time: edge === object.repeats ? object.endTime : time,
        objectIndex,
        part: edge === 0 ? 'head' : edge === object.repeats ? 'tail' : 'repeat',
        // Edge sounds carry their own additions; the object's custom filename applies to the body.
        samples: edgeSamples(map, time, object.edgeSounds[edge] ?? object.hitSound, normalSet, additionSet, {
          ...sample,
          filename: '',
        }),
      });
    }
    for (const time of tickTimes(object)) {
      const point = pointAt(map.timingPoints, time);
      const set = sample.normalSet || point?.sampleSet || map.defaultSampleSet;
      events.push({
        time,
        objectIndex,
        part: 'tick',
        samples: [
          {
            name: `${setName(set)}-slidertick`,
            index: sample.index || point?.sampleIndex || 0,
            volume: sample.volume || point?.volume || 100,
            file: null,
          },
        ],
      });
    }
  });
  return events.sort((a, b) => a.time - b.time);
}

/// File names to try for a sample, beatmap first (custom index), then skin.
export function sampleCandidates(sample: HitsoundSample): { beatmap: string[]; skin: string[] } {
  const extensions = ['wav', 'ogg', 'mp3'];
  if (sample.file) return { beatmap: [sample.file], skin: [] };
  const beatmap =
    sample.index > 0 ? extensions.map((ext) => `${sample.name}${sample.index === 1 ? '' : sample.index}.${ext}`) : [];
  return { beatmap, skin: extensions.map((ext) => `${sample.name}.${ext}`) };
}
