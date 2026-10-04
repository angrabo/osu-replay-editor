/// osu!standard mods per client. Stable mods are bits of the replay's mod bitmask. Lazer shares
/// most of them and adds mods the bitmask cannot express; those travel as acronyms next to it
/// (`lazerMods`) and end up in the replay's lazer score info. Mods of other rulesets (key counts,
/// mania's Fade In and Random) are not offered: the editor only handles osu!standard replays.
export type Client = 'stable' | 'lazer';
export type ModGroup = 'reduction' | 'increase' | 'automation' | 'conversion' | 'fun' | 'system';
export type Mod = {
  acronym: string;
  name: string;
  group: ModGroup;
  // The bitmask bit; mods without one exist only on lazer.
  bit?: number;
  // Stable has it too (only meaningful with a bit).
  stable?: boolean;
  // Lazer has it.
  lazer?: boolean;
};

export const SCORE_V2 = 1 << 29;
export const LAZER_VERSION = 30000019;
export const STABLE_VERSION = 20260711;
export const isLazerVersion = (version: number) => version >= 30000000;

// Lazer rebalanced its mod score multipliers in replay format 30000017. It treats the total of a
// replay saved by an older format as scored on the old multipliers and rescales it on load. The
// simulation scores by the current multipliers, so a simulated score has to be written in a
// current format, or lazer would scale it a second time.
const LAZER_REBALANCE_VERSION = 30000017;
export function exportVersion(version: number, simulatedScore: boolean): number {
  return isLazerVersion(version) && version < LAZER_REBALANCE_VERSION && simulatedScore ? LAZER_VERSION : version;
}
/// The score in an old-format lazer replay is entered by hand: lazer will rescale it.
export const lazerRescalesScore = (version: number, simulatedScore: boolean) =>
  isLazerVersion(version) && version < LAZER_REBALANCE_VERSION && !simulatedScore;

const both = { stable: true, lazer: true };
export const MODS: readonly Mod[] = [
  { acronym: 'EZ', name: 'Easy', group: 'reduction', bit: 2, ...both },
  { acronym: 'NF', name: 'No Fail', group: 'reduction', bit: 1, ...both },
  { acronym: 'HT', name: 'Half Time', group: 'reduction', bit: 256, ...both },
  { acronym: 'DC', name: 'Daycore', group: 'reduction', lazer: true },

  { acronym: 'HR', name: 'Hard Rock', group: 'increase', bit: 16, ...both },
  { acronym: 'SD', name: 'Sudden Death', group: 'increase', bit: 32, ...both },
  { acronym: 'PF', name: 'Perfect', group: 'increase', bit: 16384, ...both },
  { acronym: 'DT', name: 'Double Time', group: 'increase', bit: 64, ...both },
  { acronym: 'NC', name: 'Nightcore', group: 'increase', bit: 512, ...both },
  { acronym: 'HD', name: 'Hidden', group: 'increase', bit: 8, ...both },
  { acronym: 'FL', name: 'Flashlight', group: 'increase', bit: 1024, ...both },
  { acronym: 'BL', name: 'Blinds', group: 'increase', lazer: true },
  { acronym: 'ST', name: 'Strict Tracking', group: 'increase', lazer: true },
  { acronym: 'AC', name: 'Accuracy Challenge', group: 'increase', lazer: true },

  { acronym: 'AT', name: 'Autoplay', group: 'automation', bit: 2048, ...both },
  { acronym: 'CN', name: 'Cinema', group: 'automation', bit: 4194304, ...both },
  { acronym: 'RX', name: 'Relax', group: 'automation', bit: 128, ...both },
  { acronym: 'AP', name: 'Autopilot', group: 'automation', bit: 8192, ...both },
  { acronym: 'SO', name: 'Spun Out', group: 'automation', bit: 4096, ...both },

  { acronym: 'TP', name: 'Target Practice', group: 'conversion', bit: 8388608, ...both },
  { acronym: 'DA', name: 'Difficulty Adjust', group: 'conversion', lazer: true },
  { acronym: 'CL', name: 'Classic', group: 'conversion', lazer: true },
  { acronym: 'RD', name: 'Random', group: 'conversion', lazer: true },
  { acronym: 'MR', name: 'Mirror', group: 'conversion', lazer: true },
  { acronym: 'AL', name: 'Alternate', group: 'conversion', lazer: true },
  { acronym: 'SG', name: 'Single Tap', group: 'conversion', lazer: true },

  { acronym: 'TR', name: 'Transform', group: 'fun', lazer: true },
  { acronym: 'WG', name: 'Wiggle', group: 'fun', lazer: true },
  { acronym: 'SI', name: 'Spin In', group: 'fun', lazer: true },
  { acronym: 'GR', name: 'Grow', group: 'fun', lazer: true },
  { acronym: 'DF', name: 'Deflate', group: 'fun', lazer: true },
  { acronym: 'WU', name: 'Wind Up', group: 'fun', lazer: true },
  { acronym: 'WD', name: 'Wind Down', group: 'fun', lazer: true },
  { acronym: 'TC', name: 'Traceable', group: 'fun', lazer: true },
  { acronym: 'BR', name: 'Barrel Roll', group: 'fun', lazer: true },
  { acronym: 'AD', name: 'Approach Different', group: 'fun', lazer: true },
  { acronym: 'MU', name: 'Muted', group: 'fun', lazer: true },
  { acronym: 'NS', name: 'No Scope', group: 'fun', lazer: true },
  { acronym: 'MG', name: 'Magnetised', group: 'fun', lazer: true },
  { acronym: 'RP', name: 'Repel', group: 'fun', lazer: true },
  { acronym: 'AS', name: 'Adaptive Speed', group: 'fun', lazer: true },
  { acronym: 'FR', name: 'Freeze Frame', group: 'fun', lazer: true },
  { acronym: 'BU', name: 'Bubbles', group: 'fun', lazer: true },
  { acronym: 'SY', name: 'Synesthesia', group: 'fun', lazer: true },
  { acronym: 'DP', name: 'Depth', group: 'fun', lazer: true },
  { acronym: 'BM', name: 'Bloom', group: 'fun', lazer: true },

  { acronym: 'TD', name: 'Touch Device', group: 'system', bit: 4, ...both },
  { acronym: 'SV2', name: 'Score V2', group: 'system', bit: SCORE_V2, stable: true },
];

export const MOD_GROUPS: readonly (readonly [ModGroup, string])[] = [
  ['reduction', 'Difficulty reduction'],
  ['increase', 'Difficulty increase'],
  ['automation', 'Automation'],
  ['conversion', 'Conversion'],
  ['fun', 'Fun'],
  ['system', 'System'],
];

// Mods whose effect on judging or score the simulation models.
const SIMULATED = new Set(['NF', 'EZ', 'HD', 'HR', 'DT', 'HT', 'NC', 'FL', 'SO', 'SV2']);
export const isSimulated = (mod: Mod) => SIMULATED.has(mod.acronym);

export type ModSelection = { mods: number; lazerMods: string[] };

export const modsFor = (client: Client) => MODS.filter((mod) => (client === 'lazer' ? mod.lazer : mod.stable));

export function isActive(mod: Mod, selection: ModSelection): boolean {
  return mod.bit !== undefined ? (selection.mods & mod.bit) !== 0 : selection.lazerMods.includes(mod.acronym);
}

/// Everything that is on, including lazer acronyms the catalogue does not know (kept as imported).
export function activeMods(selection: ModSelection): Mod[] {
  const known = MODS.filter((mod) => isActive(mod, selection));
  const unknown = selection.lazerMods
    .filter((acronym) => !MODS.some((mod) => mod.bit === undefined && mod.acronym === acronym))
    .map((acronym): Mod => ({ acronym, name: acronym, group: 'system', lazer: true }));
  return [...known, ...unknown];
}

// Mods that cannot be on together: turning one on turns the others in its set off.
const EXCLUSIVE: readonly (readonly string[])[] = [
  ['EZ', 'HR', 'DA'],
  ['DT', 'NC', 'HT', 'DC', 'WU', 'WD', 'AS'],
  ['NF', 'SD', 'PF', 'AC'],
  ['AT', 'CN', 'RX', 'AP'],
  ['AL', 'SG'],
  ['GR', 'DF'],
  ['MG', 'RP'],
];
// Pairs inside a set that do go together (the second builds on the first).
const PAIRS: readonly (readonly [string, string])[] = [
  ['DT', 'NC'],
  ['SD', 'PF'],
];

/// The selection after clicking a mod: toggled, with the usual osu! rules applied (Nightcore
/// brings Double Time, Perfect brings Sudden Death, and incompatible mods switch off).
export function toggleMod(selection: ModSelection, acronym: string): ModSelection {
  const byAcronym = new Map(MODS.map((mod) => [mod.acronym, mod]));
  const target = byAcronym.get(acronym);
  if (!target) return selection;
  let mods = selection.mods;
  let lazerMods = [...selection.lazerMods];
  const set = (name: string, on: boolean) => {
    const mod = byAcronym.get(name);
    if (!mod) return;
    if (mod.bit !== undefined) mods = on ? mods | mod.bit : mods & ~mod.bit;
    else lazerMods = on ? [...new Set([...lazerMods, name])] : lazerMods.filter((item) => item !== name);
  };
  const turningOn = !isActive(target, selection);
  set(acronym, turningOn);
  for (const [base, extra] of PAIRS) {
    if (acronym === extra) set(base, turningOn);
    if (acronym === base && !turningOn) set(extra, false);
  }
  if (turningOn)
    for (const group of EXCLUSIVE) {
      if (!group.includes(acronym)) continue;
      const keep = PAIRS.find((pair) => pair.includes(acronym)) ?? [acronym];
      for (const other of group) if (!keep.includes(other)) set(other, false);
    }
  return { mods, lazerMods };
}

/// Why a replay with this selection cannot be made for `client`, or null when it can.
export function clientBlocker(selection: ModSelection, client: Client): string | null {
  if (client === 'lazer' && selection.mods & SCORE_V2) return 'Score V2 is a stable mod. Turn it off to target lazer.';
  if (client === 'stable' && selection.lazerMods.length)
    return `${selection.lazerMods.join(', ')} ${selection.lazerMods.length === 1 ? 'exists' : 'exist'} only on lazer. Turn ${selection.lazerMods.length === 1 ? 'it' : 'them'} off to target stable.`;
  return null;
}
