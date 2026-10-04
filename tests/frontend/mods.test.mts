import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MODS, SCORE_V2, activeMods, clientBlocker, modsFor, toggleMod } from '../../apps/desktop/src/mods.ts';

const none = { mods: 0, lazerMods: [] as string[] };
const acronyms = (selection: { mods: number; lazerMods: string[] }) => activeMods(selection).map((mod) => mod.acronym);

describe('mod catalogue', () => {
  test('only osu!standard mods are offered, per client', () => {
    const all = MODS.map((mod) => mod.acronym);
    for (const other of ['4K', '5K', '6K', '7K', '8K', '9K', 'FI']) assert.ok(!all.includes(other), other);
    const stable = modsFor('stable').map((mod) => mod.acronym);
    const lazer = modsFor('lazer').map((mod) => mod.acronym);
    assert.ok(stable.includes('SV2') && !lazer.includes('SV2'));
    assert.ok(lazer.includes('CL') && lazer.includes('DA') && !stable.includes('CL'));
    // Every stable mod is a bit of the replay bitmask.
    assert.ok(modsFor('stable').every((mod) => mod.bit !== undefined));
  });

  test('toggling follows the game: pairs come together, incompatible mods switch off', () => {
    assert.deepEqual(toggleMod(none, 'NC'), { mods: 64 | 512, lazerMods: [] });
    assert.deepEqual(toggleMod({ mods: 64 | 512, lazerMods: [] }, 'DT'), none);
    assert.deepEqual(toggleMod({ mods: 64 | 512, lazerMods: [] }, 'HT'), { mods: 256, lazerMods: [] });
    assert.deepEqual(toggleMod({ mods: 16, lazerMods: [] }, 'EZ'), { mods: 2, lazerMods: [] });
    assert.deepEqual(toggleMod({ mods: 1, lazerMods: [] }, 'PF'), { mods: 32 | 16384, lazerMods: [] });
    // Lazer-only mods live beside the bitmask and obey the same rules.
    assert.deepEqual(toggleMod({ mods: 64, lazerMods: ['CL'] }, 'DC'), { mods: 0, lazerMods: ['CL', 'DC'] });
    assert.deepEqual(toggleMod({ mods: 16, lazerMods: [] }, 'DA'), { mods: 0, lazerMods: ['DA'] });
    assert.deepEqual(toggleMod({ mods: 0, lazerMods: ['CL', 'DA'] }, 'CL'), { mods: 0, lazerMods: ['DA'] });
  });

  test('a mod of one client locks the other', () => {
    assert.equal(clientBlocker({ mods: 24, lazerMods: [] }, 'lazer'), null);
    assert.equal(clientBlocker({ mods: 24, lazerMods: [] }, 'stable'), null);
    assert.match(clientBlocker({ mods: SCORE_V2, lazerMods: [] }, 'lazer')!, /Score V2/);
    assert.equal(clientBlocker({ mods: SCORE_V2, lazerMods: [] }, 'stable'), null);
    assert.match(clientBlocker({ mods: 0, lazerMods: ['CL', 'DA'] }, 'stable')!, /CL, DA exist only on lazer/);
  });

  test('imported lazer mods the catalogue does not know stay listed', () => {
    assert.deepEqual(acronyms({ mods: 8, lazerMods: ['CL', 'XX'] }), ['HD', 'CL', 'XX']);
  });
});
