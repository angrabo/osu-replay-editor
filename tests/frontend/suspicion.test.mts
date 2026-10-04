import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseSuspicion } from '../../apps/desktop/src/suspicion.ts';

const frame = (timeMs: number, x: number, y: number, keys = 0) => ({ timeMs, deltaMs: 0, x, y, keys });

// A hand-like path: a curve with a wobble, at 16 ms frames.
const natural = Array.from({ length: 400 }, (_, index) =>
  frame(index * 16, 256 + 150 * Math.sin(index / 23) + 3 * Math.sin(index * 1.7), 192 + 100 * Math.cos(index / 17) + 2 * Math.cos(index * 2.3)),
);
const kinds = (found: { kind: string }[]) => found.map((item) => item.kind);

describe('suspicious replay stretches', () => {
  test('a natural path with uneven timing raises nothing', () => {
    const keyEvents = Array.from({ length: 40 }, (_, index) => [
      { timeMs: index * 200, key: 'K1' as const, down: true },
      { timeMs: index * 200 + 60 + ((index * 37) % 23), key: 'K1' as const, down: false },
    ]).flat();
    const judgements = Array.from({ length: 40 }, (_, index) => ({
      objectIndex: index,
      kind: 'circle' as const,
      hitTime: index * 200,
      hitError: ((index * 53) % 31) - 15,
    }));
    assert.deepEqual(analyseSuspicion({ frames: natural, keyEvents, judgements: judgements as never }), []);
  });

  test('a cursor jump between two close frames is a teleport', () => {
    const frames = [frame(0, 100, 100), frame(16, 110, 105), frame(17, 480, 360), frame(33, 490, 362)];
    const found = analyseSuspicion({ frames, keyEvents: [] });
    assert.deepEqual(found.map((item) => [item.kind, item.strong, item.startMs]), [['teleport', true, 16]]);
  });

  test('a jump faster than any flick is reported, but only as a hint', () => {
    // 320 px in one 16 ms frame: 20 px/ms, about twice what real replays reach.
    const frames = [frame(0, 100, 100), frame(16, 105, 100), frame(32, 425, 100), frame(48, 430, 100)];
    const found = analyseSuspicion({ frames, keyEvents: [] });
    assert.deepEqual(found.map((item) => [item.kind, item.strong, item.startMs]), [['teleport', false, 16]]);
  });

  test('shooting away and straight back within two frames is one strong finding', () => {
    const frames = [frame(0, 250, 250), frame(16, 252, 251), frame(32, 60, 330), frame(48, 250, 252), frame(64, 251, 253)];
    const found = analyseSuspicion({ frames, keyEvents: [] });
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].kind, found[0].strong, found[0].startMs, found[0].endMs], ['teleport', true, 16, 48]);
    assert.match(found[0].summary, /out and back/);
    // A normal turn-around slows down first, so the legs are short.
    const turn = [100, 150, 180, 192, 195, 190, 170, 130].map((x, index) => frame(index * 16, x, 100 + index * 0.5));
    assert.deepEqual(analyseSuspicion({ frames: turn, keyEvents: [] }), []);
  });

  test('a fast flick over normal frame spacing is not a teleport', () => {
    const frames = [frame(0, 100, 100), frame(16, 250, 180), frame(32, 400, 260), frame(48, 410, 262)];
    assert.ok(!kinds(analyseSuspicion({ frames, keyEvents: [] })).includes('teleport'));
  });

  test('an interpolated line is straight and strong; a wobbly one is ignored', () => {
    const line = Array.from({ length: 12 }, (_, index) => frame(index * 16, 60 + index * 20, 80 + index * 10));
    const [found] = analyseSuspicion({ frames: line, keyEvents: [] });
    assert.equal(found.kind, 'straight');
    assert.equal(found.strong, true);
    assert.deepEqual([found.startMs, found.endMs], [0, 176]);
    const wobbly = line.map((item, index) => ({ ...item, y: item.y + (index % 2 ? 1.5 : -1.5) }));
    assert.deepEqual(analyseSuspicion({ frames: wobbly, keyEvents: [] }), []);
  });

  test('a straight line at uneven speed is reported but not strong', () => {
    const steps = [0, 9, 30, 44, 71, 85, 118, 127, 160, 171, 200];
    const line = steps.map((distance, index) => frame(index * 16, 60 + distance, 100));
    const [found] = analyseSuspicion({ frames: line, keyEvents: [] });
    assert.equal(found.kind, 'straight');
    assert.equal(found.strong, false);
  });

  test('hit errors and key holds that barely vary are flagged as one merged run each', () => {
    const judgements = Array.from({ length: 30 }, (_, index) => ({
      objectIndex: index,
      kind: 'circle' as const,
      hitTime: index * 150,
      hitError: index % 2,
    }));
    const keyEvents = Array.from({ length: 30 }, (_, index) => [
      { timeMs: index * 150, key: 'K1' as const, down: true },
      { timeMs: index * 150 + 50, key: 'K1' as const, down: false },
    ]).flat();
    const found = analyseSuspicion({ frames: [], keyEvents, judgements: judgements as never });
    assert.deepEqual(kinds(found).sort(), ['even-holds', 'even-timing']);
    assert.ok(found.every((item) => item.strong && item.startMs === 0));
    // Without a simulation only the key holds can be checked.
    assert.deepEqual(kinds(analyseSuspicion({ frames: [], keyEvents })), ['even-holds']);
  });
});

describe('stray frames', () => {
  // A smooth path moving right at 10 px per frame.
  const path = (strayAt: number, dx: number, dy: number) =>
    Array.from({ length: 12 }, (_, index) =>
      frame(index * 16, 100 + index * 10 + (index === strayAt ? dx : 0), 200 + Math.sin(index / 4) * 3 + (index === strayAt ? dy : 0)),
    );

  test('one frame popping off a smooth path and back is a strong finding', () => {
    const found = analyseSuspicion({ frames: path(6, -8, -30), keyEvents: [] });
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].kind, found[0].strong, found[0].startMs, found[0].endMs], ['teleport', true, 80, 112]);
    assert.match(found[0].summary, /Stray frame/);
  });

  test('a stray frame on a fast path, where the cursor does not return to the same spot, is found too', () => {
    const fast = Array.from({ length: 12 }, (_, index) => frame(index * 16, 60 + index * 20, 200 + (index === 6 ? 30 : 0)));
    const found = analyseSuspicion({ frames: fast, keyEvents: [] }).filter((item) => /Stray/.test(item.summary));
    assert.equal(found.length, 1);
  });

  test('small wobble and a real corner are left alone', () => {
    assert.deepEqual(analyseSuspicion({ frames: path(6, 0, -6), keyEvents: [] }), []);
    // Slowing into a corner and leaving it: no single frame is an outlier.
    const corner = [0, 30, 55, 72, 82, 86].map((x, index) => frame(index * 16, 100 + x, 200));
    corner.push(...[6, 18, 38, 64, 96].map((y, index) => frame((index + 6) * 16, 187, 200 + y)));
    assert.deepEqual(analyseSuspicion({ frames: corner, keyEvents: [] }), []);
  });
});
