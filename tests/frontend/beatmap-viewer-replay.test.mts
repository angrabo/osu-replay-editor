import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { replayPointAt } from '../../packages/beatmap-viewer/src/replay.ts';
import { hiddenObjectAlpha, hitFadeAlpha, inputVariantColor, isLogicalPress, isLogicalRelease, judgementAlpha, logicalButtons, logicalButtonTransitions, objectAlpha, updateLogicalButtonOrder } from '../../packages/beatmap-viewer/src/renderMath.ts';

const first = [
  { timeMs: -1000, x: 256, y: -500, keys: 0 },
  { timeMs: 0, x: 100, y: 110, keys: 5 },
  { timeMs: 1000, x: 300, y: 280, keys: 0 },
];
const second = [
  { timeMs: -800, x: 256, y: -500, keys: 0 },
  { timeMs: 0, x: 110, y: 90, keys: 10 },
  { timeMs: 1200, x: 250, y: 240, keys: 0 },
];

describe('replayPointAt', () => {
  test('returns null before the first frame', () => {
    assert.equal(replayPointAt(first, -1001), null);
  });

  test('returns the exact frame when the time matches', () => {
    assert.deepEqual(replayPointAt(first, 0), { timeMs: 0, x: 100, y: 110, keys: 5 });
  });

  test('interpolates position between two frames', () => {
    assert.deepEqual(replayPointAt(first, 500), { timeMs: 500, x: 200, y: 195, keys: 5 });
    assert.deepEqual(replayPointAt(second, 600), { timeMs: 600, x: 180, y: 165, keys: 10 });
  });

  test('clamps to the last frame past the end of the replay', () => {
    assert.deepEqual(replayPointAt(first, 2500), { timeMs: 2500, x: 300, y: 280, keys: 0 });
  });
});

describe('objectAlpha', () => {
  test('is zero outside the fade-in/fade-out window', () => {
    assert.equal(objectAlpha(-301, 100, 100, 400), 0);
    assert.equal(objectAlpha(341, 100, 100, 400), 0);
  });

  test('fades in and out linearly at the half-fade midpoints', () => {
    assert.equal(objectAlpha(-100, 100, 100, 400), 0.5);
    assert.equal(objectAlpha(220, 100, 100, 400), 0.5);
  });

  test('is fully opaque once approach completes', () => {
    assert.equal(objectAlpha(100, 100, 100, 400), 1);
  });
});

describe('hiddenObjectAlpha', () => {
  test('starts fully visible just after appearing', () => {
    assert.equal(hiddenObjectAlpha(-299, 100, 400), 1);
  });

  test('fades before the hit time', () => {
    assert.ok(hiddenObjectAlpha(-100, 100, 400) < 1);
  });

  test('is invisible once the hit time is reached', () => {
    assert.equal(hiddenObjectAlpha(100, 100, 400), 0);
  });
});

describe('hitFadeAlpha', () => {
  test('is fully opaque right after the hit', () => {
    assert.equal(hitFadeAlpha(50, 100), 1);
  });

  test('is half-faded at the midpoint of a custom fade duration', () => {
    assert.equal(hitFadeAlpha(190, 100, 180), 0.5);
  });

  test('is fully faded once the fade duration elapses', () => {
    assert.equal(hitFadeAlpha(280, 100, 180), 0);
  });
});

describe('judgementAlpha', () => {
  test('is invisible before the judgement time', () => {
    assert.equal(judgementAlpha(99, 100), 0);
  });

  test('is fully opaque at the judgement time', () => {
    assert.equal(judgementAlpha(100, 100), 1);
  });

  test('is invisible long after the judgement', () => {
    assert.equal(judgementAlpha(650, 100), 0);
  });
});

describe('logical press/release detection', () => {
  test('isLogicalPress fires only on a genuine 0->1 transition', () => {
    assert.equal(isLogicalPress(0, 5), true);
    assert.equal(isLogicalPress(5, 0), false);
    assert.equal(isLogicalPress(5, 10), false);
  });

  test('isLogicalRelease fires only on a genuine 1->0 transition', () => {
    assert.equal(isLogicalRelease(5, 0), true);
    assert.equal(isLogicalRelease(0, 10), false);
  });
});

describe('logicalButtons', () => {
  test('masks redundant mouse bits onto the logical M1/M2/K1/K2 bits', () => {
    assert.deepEqual([0, 1, 2, 5, 10, 15].map(logicalButtons), [0, 1, 2, 4, 8, 12]);
  });
});

describe('logicalButtonTransitions', () => {
  test('reports which logical buttons were pressed vs released between two masks', () => {
    assert.deepEqual(logicalButtonTransitions(0, 5), { pressed: 4, released: 0 });
    assert.deepEqual(logicalButtonTransitions(5, 0), { pressed: 0, released: 4 });
  });
});

describe('updateLogicalButtonOrder', () => {
  test('tracks press order and drops a button once it is released', () => {
    let heldOrder = updateLogicalButtonOrder([], 0, 1);
    heldOrder = updateLogicalButtonOrder(heldOrder, 1, 3);
    assert.deepEqual(heldOrder, [0, 1]);
    heldOrder = updateLogicalButtonOrder(heldOrder, 3, 2);
    heldOrder = updateLogicalButtonOrder(heldOrder, 2, 3);
    assert.deepEqual(heldOrder, [1, 0]);
  });
});

describe('inputVariantColor', () => {
  test('gives each of the four input slots a distinct colour variant', () => {
    assert.equal(new Set([0, 1, 2, 3].map((index) => inputVariantColor(0x5ca3ff, index))).size, 4);
  });
});
