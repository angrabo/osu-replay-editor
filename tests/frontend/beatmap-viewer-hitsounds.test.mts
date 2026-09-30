import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOsu } from '../../packages/beatmap-viewer/src/parser.ts';
import { buildHitsoundEvents, sampleCandidates } from '../../packages/beatmap-viewer/src/hitsounds.ts';

const text = `osu file format v14
[General]
AudioFilename: song.mp3
SampleSet: Soft
[Difficulty]
SliderMultiplier:1
SliderTickRate:1
[TimingPoints]
0,500,4,2,0,70,1,0
900,-100,4,3,2,40,0,0
[HitObjects]
100,100,500,1,2,0:0:0:0:
200,200,1000,2,8,L|300:200,1,200,4|2,0:0|1:2,0:0:0:0:
256,192,2500,12,0,3000,0:0:0:0:
300,300,4000,1,0,0:0:0:0:custom.wav
`;

describe('beatmap hitsounds', () => {
  const map = parseOsu(text);

  test('parses sample sets, edge sounds and custom sample fields', () => {
    assert.equal(map.defaultSampleSet, 2);
    assert.deepEqual(map.timingPoints[1], {
      time: 900,
      beatLength: -100,
      uninherited: false,
      sampleSet: 3,
      sampleIndex: 2,
      volume: 40,
    });
    const slider = map.hitObjects[1];
    assert.equal(slider.kind, 'slider');
    if (slider.kind !== 'slider') return;
    assert.deepEqual(slider.edgeSounds, [4, 2]);
    assert.deepEqual(slider.edgeSets, [
      [0, 0],
      [1, 2],
    ]);
    assert.equal(map.hitObjects[3].hitSample.filename, 'custom.wav');
  });

  test('builds hitnormal plus additions from the active timing point', () => {
    const events = buildHitsoundEvents(map);
    const circle = events.find((event) => event.objectIndex === 0)!;
    assert.deepEqual(
      circle.samples.map((sample) => [sample.name, sample.index, sample.volume]),
      [
        ['soft-hitnormal', 0, 70],
        ['soft-hitwhistle', 0, 70],
      ],
    );
    const head = events.find((event) => event.objectIndex === 1 && event.part === 'head')!;
    // Timing point at 900 ms: drum set, custom index 2, 40% volume; edge 0 adds a finish.
    assert.deepEqual(
      head.samples.map((sample) => [sample.name, sample.index, sample.volume]),
      [
        ['drum-hitnormal', 2, 40],
        ['drum-hitfinish', 2, 40],
      ],
    );
    const tail = events.find((event) => event.objectIndex === 1 && event.part === 'tail')!;
    assert.deepEqual(
      tail.samples.map((sample) => sample.name),
      ['normal-hitnormal', 'soft-hitwhistle'],
    );
    assert.ok(events.some((event) => event.objectIndex === 1 && event.part === 'tick'));
    assert.equal(events.find((event) => event.objectIndex === 2)!.part, 'spinner');
  });

  test('custom files replace the lookup; beatmap variants come before the skin', () => {
    const custom = buildHitsoundEvents(map).find((event) => event.objectIndex === 3)!;
    assert.deepEqual(sampleCandidates(custom.samples[0]), { beatmap: ['custom.wav'], skin: [] });
    assert.deepEqual(sampleCandidates({ name: 'soft-hitclap', index: 2, volume: 100, file: null }).beatmap[0], 'soft-hitclap2.wav');
    assert.deepEqual(sampleCandidates({ name: 'soft-hitclap', index: 1, volume: 100, file: null }).beatmap[0], 'soft-hitclap.wav');
    assert.deepEqual(sampleCandidates({ name: 'soft-hitclap', index: 0, volume: 100, file: null }).beatmap, []);
  });
});
