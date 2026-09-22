import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectFile, projectFileName, serializeProject } from '../../apps/desktop/src/project.ts';
import type { Track } from '../../apps/desktop/src/stores/editor.ts';

const metadata = {
  beatmapHash: 'a'.repeat(32),
  playerName: 'One',
  replayHash: '',
  mods: 0,
  version: 20260620,
  score: 12345,
  timestampTicks: '0',
  onlineScoreId: '0',
  rngSeed: null,
  hitCounts: [100, 2, 1, 0, 0, 0],
  maxCombo: 250,
};
// Non-trivial bytes (including 0x00, 0xff and values spanning the base64 chunking boundary) to
// catch off-by-one errors in the chunked base64 encode/decode round trip.
const sourceBytes = new Uint8Array(70_000).map((_, index) => index % 256);

const track: Track = {
  id: 'track-1',
  name: 'Player One',
  color: '#ff00aa',
  visible: true,
  locked: false,
  edited: true,
  replay: {
    filename: 'one.osr',
    sourceBytes,
    metadata,
    frames: [
      { timeMs: 0, deltaMs: 0, x: 100, y: 110, keys: 0 },
      { timeMs: 17, deltaMs: 17, x: 110, y: 120, keys: 1 },
    ],
    keyEvents: [{ timeMs: 17, key: 'M1', down: true }],
  },
  originalReplay: {
    filename: 'one.osr',
    sourceBytes,
    metadata,
    frames: [{ timeMs: 0, deltaMs: 0, x: 100, y: 110, keys: 0 }],
    keyEvents: [],
  },
  exportMetadata: { ...metadata },
  autoScore: false,
  inputCuts: [{ key: 'M1', timeMs: 8 }],
};

const view = {
  playbackRate: 1.5,
  volume: 42,
  showBackground: false,
  backgroundDim: 30,
  showGrid: true,
  compactMode: false,
  wireframeGameplay: true,
  fadeAfterClick: false,
  showHitJudgements: true,
  showHiddenFade: false,
  playfieldZoom: 1.2,
  cursorTrailMs: 300,
  showCursorPast: true,
  showCursorFuture: false,
  showInputPaths: true,
  showClickMarkers: false,
  cursorSmoothing: 'light' as const,
  drawRangeSnap: true,
  timelineWheelMode: 'milliseconds' as const,
  timelineWheelStepMs: 5,
  pixelsPerSecond: 200,
  timelineLaneHeight: 60,
};

describe('project file save/load round trip', () => {
  test('serializing then parsing reproduces the track byte-for-byte', () => {
    const resolution = {
      status: 'verified',
      replayHash: metadata.beatmapHash,
      title: 'Title',
      artist: 'Artist',
      creator: 'Creator',
      version: 'Insane',
      beatmapsetId: 123,
      source: 'osu-api',
      error: null,
      difficulties: [],
      assets: [],
    };
    const project = serializeProject([track], view, resolution);
    assert.equal(project.version, 1);
    assert.equal(project.beatmapHash, metadata.beatmapHash);

    const json = JSON.stringify(project);
    const parsed = parseProjectFile(json);

    assert.equal(parsed.beatmapHash, metadata.beatmapHash);
    assert.deepEqual(parsed.view, view);
    assert.equal(parsed.tracks.length, 1);

    const [restored] = parsed.tracks;
    assert.equal(restored.id, track.id);
    assert.equal(restored.name, track.name);
    assert.equal(restored.edited, track.edited);
    assert.deepEqual(restored.inputCuts, track.inputCuts);
    assert.deepEqual(restored.replay.frames, track.replay.frames);
    assert.deepEqual(restored.replay.keyEvents, track.replay.keyEvents);
    assert.deepEqual(restored.replay.metadata, track.replay.metadata);
    assert.deepEqual(Array.from(restored.replay.sourceBytes), Array.from(track.replay.sourceBytes));
    assert.deepEqual(Array.from(restored.originalReplay.sourceBytes), Array.from(track.originalReplay.sourceBytes));
  });

  test('rejects a file that is not a recognised project', () => {
    assert.throws(() => parseProjectFile('{}'), /not a recognised/);
    assert.throws(() => parseProjectFile('not json'), /not a valid project/);
  });

  test('derives a safe file name from the beatmap title', () => {
    assert.equal(projectFileName({ beatmapTitle: 'Artist - Title' }), 'Artist - Title.oreproj');
    assert.equal(projectFileName({ beatmapTitle: 'a/b:c*d' }), 'a b c d.oreproj');
    assert.equal(projectFileName({}), 'osu-replay-project.oreproj');
  });
});
