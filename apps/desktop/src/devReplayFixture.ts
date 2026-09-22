import { logicalKeys, type ImportedReplay, type ReplayFrame, type ReplayKeyEvent } from './stores/editor';

const beatmapHash = '00000000000000000000000000000000';

function replay(filename: string, playerName: string, mods: number, frames: ReplayFrame[]): ImportedReplay {
  const keyEvents: ReplayKeyEvent[] = [];
  const names: ReplayKeyEvent['key'][] = ['M1', 'M2', 'K1', 'K2'];
  let previous = 0;
  for (const frame of frames) {
    const current = logicalKeys(frame.keys);
    names.forEach((key, index) => {
      const bit = 1 << index;
      if (((previous ^ current) & bit) !== 0)
        keyEvents.push({ timeMs: frame.timeMs, key, down: (current & bit) !== 0 });
    });
    previous = current;
  }
  return {
    filename,
    sourceBytes: new Uint8Array(),
    metadata: {
      beatmapHash,
      playerName,
      replayHash: '',
      mods,
      version: 20260620,
      score: 0,
      timestampTicks: '0',
      onlineScoreId: '0',
      rngSeed: null,
    },
    frames,
    keyEvents,
  };
}

export const developmentReplays = [
  replay('first.osr', 'Player One', 0, [
    { timeMs: -1000, deltaMs: -1000, x: 256, y: 192, keys: 0 },
    { timeMs: 0, deltaMs: 1000, x: 100, y: 110, keys: 5 },
    { timeMs: 800, deltaMs: 800, x: 150, y: 120, keys: 5 },
    { timeMs: 1300, deltaMs: 500, x: 190, y: 220, keys: 0 },
    { timeMs: 2700, deltaMs: 1400, x: 300, y: 280, keys: 10 },
    { timeMs: 4900, deltaMs: 2200, x: 320, y: 290, keys: 0 },
  ]),
  replay('second.osr', 'Player Two', 64, [
    { timeMs: -800, deltaMs: -800, x: 256, y: 192, keys: 0 },
    { timeMs: 0, deltaMs: 800, x: 110, y: 90, keys: 10 },
    { timeMs: 900, deltaMs: 900, x: 140, y: 120, keys: 10 },
    { timeMs: 1400, deltaMs: 500, x: 200, y: 170, keys: 0 },
    { timeMs: 3400, deltaMs: 2000, x: 250, y: 240, keys: 5 },
    { timeMs: 5500, deltaMs: 2100, x: 260, y: 250, keys: 0 },
  ]),
];
