import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fixStats, inverseNormal, planTimingFix, type FixHit, type FixOptions, type FixPress } from '../../apps/desktop/src/timingFix.ts';

// OD 8: 300 inside ±32 ms, 100 inside ±76 ms, 50 inside ±120 ms.
const windows = { great: 32, ok: 76, meh: 120 };
const center = { x: 256, y: 192 };

// A seeded player: hit errors around +4 ms with a 20 ms spread, alternating keys, 60 ms holds.
function play(count: number, spread = 20, mean = 4) {
  let state = 12345;
  const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 4294967296);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
  const hits: FixHit[] = [];
  const presses: Record<'K1' | 'K2', FixPress[]> = { K1: [], K2: [] };
  for (let index = 0; index < count; index++) {
    const objectTime = 1000 + index * 300;
    const error = Math.round(mean + spread * normal());
    if (Math.abs(error) >= windows.meh) continue;
    const key = index % 2 ? 'K2' : 'K1';
    const press = { key, startTime: objectTime + error, endTime: objectTime + error + 60 } as const;
    presses[key].push(press);
    hits.push({ objectIndex: index, kind: 'circle', objectTime, error, press, center });
  }
  return { hits, presses };
}

const options = (hits: FixHit[], presses: FixOptions['presses'], change: Partial<FixOptions> = {}): FixOptions => ({
  windows,
  radius: 40,
  leewayPx: 3,
  target100s: 0,
  closeCallPull: 0.5,
  closeCallFrom: 0.7,
  // The cursor rests on the circle the whole time.
  cursorAt: () => center,
  presses,
  anchors: hits.map((hit) => ({ objectIndex: hit.objectIndex, time: hit.objectTime + hit.error })),
  ...change,
});

const outside = (stats: { ok: number; meh: number }) => stats.ok + stats.meh;

describe('timing fix', () => {
  test('inverseNormal matches known quantiles', () => {
    assert.ok(Math.abs(inverseNormal(0.5)) < 1e-9);
    assert.ok(Math.abs(inverseNormal(0.975) - 1.959964) < 1e-5);
    assert.ok(Math.abs(inverseNormal(0.001) + 3.090232) < 1e-5);
  });

  test('brings the 100s down to the requested count, only ever moving hits inward', () => {
    const { hits, presses } = play(800);
    const plan = planTimingFix(hits, options(hits, presses, { target100s: 10 }));
    assert.ok(outside(plan.before) > 60, `the sample needs 100s to fix (${outside(plan.before)})`);
    assert.ok(outside(plan.after) <= 10 && outside(plan.after) >= 6, `100s after: ${outside(plan.after)}`);
    for (const move of plan.moves) {
      assert.ok(Math.abs(move.errorAfter) < Math.abs(move.errorBefore), 'a hit moved outward');
      assert.equal(move.to.endTime - move.to.startTime, move.from.endTime - move.from.startTime, 'hold length changed');
      assert.ok(Number.isInteger(move.to.startTime), 'press times stay whole milliseconds');
    }
    // The player's own centre is kept and the spread only tightens.
    assert.ok(Math.abs(plan.after.mean - plan.before.mean) < 3, `mean ${plan.before.mean} -> ${plan.after.mean}`);
    assert.ok(plan.after.ur < plan.before.ur);
  });

  test('leaves no wall of hits just inside the 300 window', () => {
    const { hits, presses } = play(800);
    const plan = planTimingFix(hits, options(hits, presses, { target100s: 10 }));
    // Hits that came in from outside spread over the window's edge region instead of piling up
    // in its last few milliseconds.
    const landed = plan.moves
      .filter((move) => Math.abs(move.errorBefore) >= windows.great)
      .map((move) => Math.abs(move.errorAfter));
    const atEdge = landed.filter((size) => size >= windows.great - 3).length;
    assert.ok(landed.length > 40);
    assert.ok(atEdge / landed.length < 0.35, `${atEdge} of ${landed.length} moved hits sit at the window edge`);
    // The result still looks normal: about 68% within one standard deviation of the mean.
    const { mean } = plan.after;
    const deviation = plan.after.ur / 10;
    const within = plan.errorsAfter.filter((error) => Math.abs(error - mean) <= deviation).length / plan.errorsAfter.length;
    assert.ok(within > 0.6 && within < 0.78, `share within one sd: ${within}`);
  });

  test('with enough 100s allowed, only close calls come a little closer', () => {
    const { hits, presses } = play(400);
    const plan = planTimingFix(hits, options(hits, presses, { target100s: 9999 }));
    assert.equal(outside(plan.after), outside(plan.before));
    assert.ok(plan.moves.length > 0);
    for (const move of plan.moves) {
      assert.ok(Math.abs(move.errorBefore) >= windows.great * 0.7 && Math.abs(move.errorBefore) < windows.great);
      assert.ok(Math.abs(move.errorAfter) < Math.abs(move.errorBefore));
    }
  });

  test('a press only moves where the cursor is still on the circle with room to spare', () => {
    const { hits, presses } = play(400);
    // The cursor is 38 px from the centre: on a 40 px circle, but without 3 px of room.
    const plan = planTimingFix(hits, options(hits, presses, { target100s: 0, cursorAt: () => ({ x: 294, y: 192 }) }));
    assert.equal(plan.moves.length, 0);
    assert.ok(plan.blocked > 0);
    assert.deepEqual(fixStats(plan.errorsAfter, windows), plan.before);
  });

  test('a press never runs into another press of the same key or past its neighbours', () => {
    const { hits, presses } = play(400);
    const plan = planTimingFix(hits, options(hits, presses, { target100s: 0 }));
    const moved = new Map(plan.moves.map((move) => [move.objectIndex, move.to]));
    for (const key of ['K1', 'K2'] as const) {
      const list = presses[key].map((press) => moved.get(hits.find((hit) => hit.press === press)!.objectIndex) ?? press);
      list.sort((a, b) => a.startTime - b.startTime);
      for (let index = 1; index < list.length; index++) assert.ok(list[index].startTime > list[index - 1].endTime);
    }
    const times = hits.map((hit) => moved.get(hit.objectIndex)?.startTime ?? hit.press.startTime);
    for (let index = 1; index < times.length; index++) assert.ok(times[index] > times[index - 1]);
  });

  test('the same settings always give the same result', () => {
    const { hits, presses } = play(300);
    const first = planTimingFix(hits, options(hits, presses, { target100s: 5 }));
    const second = planTimingFix(hits, options(hits, presses, { target100s: 5 }));
    assert.deepEqual(first.moves, second.moves);
  });
});
