import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePlaybackClock } from '../../packages/beatmap-viewer/src/playbackClock.ts';

test('0.1x playback advances when unpaused audio has a frozen timestamp', () => {
  let time = 1000;
  for (let frame = 0; frame < 100; frame++)
    time = advancePlaybackClock(time, 10, 0.1, 1000, 1000);
  assert.equal(time, 1100);
});

test('audio recovering behind the visual clock never rewinds playback', () => {
  assert.equal(advancePlaybackClock(1100, 10, 0.1, 1001, 1000), 1101);
  assert.equal(advancePlaybackClock(1100, 10, 0.1, 1105, 1001), 1105);
});

test('advancing audio remains the timing reference', () => {
  assert.equal(advancePlaybackClock(1000, 16, 1, 1015, 1000), 1015);
});

test('silent playback preserves fractional progress at extremely slow speeds', () => {
  assert.equal(advancePlaybackClock(-10, 10, 0.001, null, null), -9.99);
});
