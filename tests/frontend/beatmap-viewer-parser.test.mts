import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPreviewMods, approachPreempt, parseOsu } from '../../packages/beatmap-viewer/src/parser.ts';

const text = `osu file format v14
[General]
AudioFilename: song.mp3
[Metadata]
Title:Viewer Test
Artist:Fixture
Creator:Mapper
Version:All Objects
[Difficulty]
CircleSize:4
ApproachRate:8
OverallDifficulty:6
SliderMultiplier:1.4
[Events]
0,0,"bg.jpg",0,0
[TimingPoints]
0,500,4,2,1,100,1,0
1000,-50,4,2,1,100,0,0
[Colours]
Combo1 : 255,100,120
[HitObjects]
64,96,500,1,0,0:0:0:0:
128,192,1000,2,0,B|256:96|384:192,2,280
256,192,3000,8,0,4200
`;

const beatmap = parseOsu(text);

describe('parseOsu', () => {
  test('reads general and event metadata', () => {
    assert.equal(beatmap.audioFilename, 'song.mp3');
    assert.equal(beatmap.backgroundFilename, 'bg.jpg');
  });

  test('parses one of each hit object kind in file order', () => {
    assert.equal(beatmap.hitObjects.length, 3);
    assert.deepEqual(beatmap.hitObjects.map((object) => object.kind), ['circle', 'slider', 'spinner']);
    assert.deepEqual(beatmap.hitObjects.map((object) => object.comboNumber), [1, 2, 3]);
    assert.deepEqual(beatmap.hitObjects.map((object) => object.comboIndex), [0, 0, 0]);
  });

  test('derives slider end time and overall beatmap duration', () => {
    assert.equal(beatmap.hitObjects[1].endTime, 2000);
    assert.equal(beatmap.durationMs, 5400);
  });

  test('parses combo colours', () => {
    assert.deepEqual(beatmap.comboColors, [0xff6478]);
  });

  test('rejects text that is not a beatmap', () => {
    assert.throws(() => parseOsu('not a beatmap'));
  });
});

describe('approachPreempt', () => {
  test('maps AR to preempt milliseconds', () => {
    assert.equal(approachPreempt(8), 750);
  });
});

describe('applyPreviewMods', () => {
  test('Hard Rock flips playfield Y and scales difficulty up', () => {
    const hardRock = applyPreviewMods(beatmap, 16);
    assert.equal(hardRock.circleSize, 5.2);
    assert.equal(hardRock.approachRate, 10);
    assert.ok(Math.abs(hardRock.overallDifficulty - 8.4) < 0.001);
    assert.equal(hardRock.hitObjects[0].y, 288);
    assert.equal(hardRock.hitObjects[1].y, 192);
  });

  test('Hard Rock mirrors slider path points around the same axis', () => {
    const hardRock = applyPreviewMods(beatmap, 16);
    const original = beatmap.hitObjects[1];
    const flipped = hardRock.hitObjects[1];
    assert.ok(original.kind === 'slider' && flipped.kind === 'slider');
    if (original.kind === 'slider' && flipped.kind === 'slider') assert.equal(flipped.path[1].y, 384 - original.path[1].y);
  });

  test('leaves the source beatmap untouched', () => {
    assert.equal(beatmap.hitObjects[0].y, 96);
  });

  test('Easy halves circle size and eases AR/OD', () => {
    const easy = applyPreviewMods(beatmap, 2);
    assert.deepEqual([easy.circleSize, easy.approachRate, easy.overallDifficulty], [2, 4, 3]);
  });
});
