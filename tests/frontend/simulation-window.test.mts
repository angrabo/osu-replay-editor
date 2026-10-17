import assert from 'node:assert/strict';
import test from 'node:test';
import { changedFrameRange, mergeWindowResult, unionRange } from '../../apps/desktop/src/simulationWindow.ts';
import type { ReplayFrame, SimulationJudgement, SimulationResult } from '../../apps/desktop/src/stores/editor.ts';

const frames = (count: number): ReplayFrame[] =>
  Array.from({ length: count }, (_, index) => ({ timeMs: index * 16, deltaMs: 16, x: index, y: 0, keys: 0 }));

test('changed range covers edited, inserted and removed frames', () => {
  const base = frames(100);
  assert.equal(changedFrameRange(base, base.slice()), null);

  const keyed = base.map((frame, index) => (index === 40 ? { ...frame, keys: 1 } : frame));
  const range = changedFrameRange(base, keyed)!;
  assert.ok(range.start <= 40 * 16 && range.end >= 40 * 16);
  assert.ok(range.end - range.start <= 2 * 16);

  const inserted = [...base.slice(0, 50), { timeMs: 50 * 16 - 8, deltaMs: 8, x: 0, y: 0, keys: 1 }, ...base.slice(50)];
  const insertRange = changedFrameRange(base, inserted)!;
  assert.ok(insertRange.start <= 50 * 16 - 8 && insertRange.end >= 50 * 16 - 8);

  const removed = [...base.slice(0, 70), ...base.slice(75)];
  const removeRange = changedFrameRange(base, removed)!;
  assert.ok(removeRange.start <= 70 * 16 && removeRange.end >= 74 * 16);
  assert.ok(removeRange.end - removeRange.start < 10 * 16);

  assert.deepEqual(unionRange({ start: 5, end: 10 }, { start: 1, end: 7 }), { start: 1, end: 10 });
  assert.deepEqual(unionRange(null, { start: 1, end: 7 }), { start: 1, end: 7 });
});

const judgement = (objectIndex: number, result: SimulationJudgement['result']): SimulationJudgement => ({
  objectIndex,
  kind: 'circle',
  startTime: objectIndex * 1000,
  endTime: objectIndex * 1000,
  result,
  value: result === 'miss' ? 0 : Number(result),
  hitTime: result === 'miss' ? null : objectIndex * 1000,
  hitError: 0,
  cursorDistance: 0,
  inside: true,
  key: null,
  comboAfter: 0,
  scoreAfter: 0,
});

const result = (judgements: SimulationJudgement[], scope: SimulationResult['scope']): SimulationResult => ({
  scope,
  model: 'test',
  status: 'verified',
  client: 'stable',
  score: 1000,
  accuracy: 0,
  count300: judgements.filter((item) => item.result === '300').length,
  count100: judgements.filter((item) => item.result === '100').length,
  count50: judgements.filter((item) => item.result === '50').length,
  misses: judgements.filter((item) => item.result === 'miss').length,
  maxCombo: 10,
  achievedCombo: 10,
  totalObjects: judgements.length,
  bonusScore: 0,
  spinnerSpins: 0,
  sliderTicksHit: 0,
  sliderTicksTotal: 0,
  sliderEndsHit: 0,
  sliderEndsTotal: 0,
  spinnerSpinsHit: 0,
  spinnerSpinsTotal: 0,
  spinnerBonusHit: 0,
  spinnerBonusTotal: 0,
  judgements,
  warnings: [],
});

test('window judgements replace the old ones and shift the counts', () => {
  const base = result(
    Array.from({ length: 10 }, (_, index) => judgement(index, index === 4 ? 'miss' : '300')),
    'whole-replay',
  );
  base.accuracy = 90;
  const window = result([judgement(3, '300'), judgement(4, '100'), judgement(5, '300')], 'window');
  const merged = mergeWindowResult(base, window, { start: 3000, end: 5000 });
  assert.equal(merged.scope, 'whole-replay');
  assert.equal(merged.status, 'estimate');
  assert.deepEqual(
    merged.judgements.map((item) => item.objectIndex),
    Array.from({ length: 10 }, (_, index) => index),
  );
  assert.equal(merged.judgements[4].result, '100');
  assert.equal(merged.misses, 0);
  assert.equal(merged.count100, 1);
  assert.equal(merged.count300, 9);
  assert.ok(Math.abs(merged.accuracy - (90 + 100 / 30)) < 1e-9);
  assert.equal(merged.score, base.score);
});
