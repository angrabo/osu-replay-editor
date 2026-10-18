import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentReplayFrameTime, drawReplayCursorPath, editReplayInput, formatTime, logicalKeys, magneticDragWeights, nearestReplayFrameTime, readPlayfieldPreferences, readSavedVolume, replayInputIntervals, replayInputSegments, snapTimeWithinRange, useEditorStore } from '../../apps/desktop/src/stores/editor.ts';

// Tests run in file order and deliberately share store state between blocks (an editing
// session, not isolated units) so undo/redo and cross-track clipboard scenarios can build on
// what earlier tests set up - mirrors how the app is actually used end to end.

const metadata = { beatmapHash: 'a'.repeat(32), playerName: 'One', replayHash: '', mods: 0, version: 20260620,
  score: 0, timestampTicks: '0', onlineScoreId: '0', rngSeed: null };
const frame = { timeMs: 7000, deltaMs: 7000, x: 256, y: 192, keys: 5 };

describe('adjacentReplayFrameTime', () => {
  const steppedFrames = [{ ...frame, timeMs: -200 }, { ...frame, timeMs: 0 }, { ...frame, timeMs: 17 }, { ...frame, timeMs: 33 }];

  test('finds the next and previous frame time', () => {
    assert.equal(adjacentReplayFrameTime(steppedFrames, 0, 1), 17);
    assert.equal(adjacentReplayFrameTime(steppedFrames, 17, -1), 0);
  });

  test('returns null past either end of the replay', () => {
    assert.equal(adjacentReplayFrameTime(steppedFrames, -300, -1), null);
    assert.equal(adjacentReplayFrameTime(steppedFrames, 40, 1), null);
  });
});

describe('magneticDragWeights', () => {
  const line = (points: [number, number][]) => points.map(([x, y], index) => ({ timeMs: index * 17, deltaMs: 17, x, y, keys: 0 }));

  test('neighbours along the path follow with a falloff that shrinks with distance', () => {
    const frames = line([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0], [60, 0]]);
    const weights = magneticDragWeights(frames, [3], 5);
    assert.equal(weights[3], 1);
    assert.ok(weights[2] > weights[1] && weights[1] > 0);
    assert.ok(weights[4] > weights[5] && weights[5] > 0);
    assert.equal(weights[0], 0);
  });

  test('a bigger drag reaches further along the path', () => {
    const frames = line([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0], [60, 0], [70, 0], [80, 0]]);
    const small = magneticDragWeights(frames, [4], 5).filter((weight) => weight > 0).length;
    const large = magneticDragWeights(frames, [4], 30).filter((weight) => weight > 0).length;
    assert.ok(large > small);
  });

  test('a cursor reversal stays pinned and stops the pull', () => {
    const frames = line([[0, 0], [10, 0], [20, 0], [30, 0], [20, 1], [10, 2], [0, 3]]);
    const weights = magneticDragWeights(frames, [1], 60);
    assert.equal(weights[3], 0);
    assert.equal(weights[4], 0);
    assert.ok(weights[2] > 0);
  });
});

describe('editReplayInput and replayInputIntervals', () => {
  test('zero-duration taps are listed and removable without changing adjacent holds or cursor frames', () => {
    const replay = editReplayInput({ filename: 'instant.osr', sourceBytes: new Uint8Array(), metadata,
      frames: [[0, 0], [10, 2], [20, 0], [20, 2], [20, 0], [20, 2], [30, 0]]
        .map(([timeMs, keys]) => ({ timeMs, deltaMs: 0, x: 100 + timeMs, y: 200, keys })), keyEvents: [],
    }, null, null);
    const intervals = replayInputIntervals('edit', replay);
    assert.deepEqual(intervals.map(input => [input.startTime, input.endTime]), [[10, 20], [20, 20], [20, 30]]);
    const edited = editReplayInput(replay, intervals[1], null);
    assert.deepEqual(replayInputIntervals('edit', edited).map(input => [input.startTime, input.endTime]), [[10, 20], [20, 30]]);
    assert.deepEqual(edited.frames.map(({ timeMs, x, y }) => ({ timeMs, x, y })), replay.frames.map(({ timeMs, x, y }) => ({ timeMs, x, y })));
    assert.deepEqual(edited.frames.map(frame => frame.keys), [0, 2, 0, 0, 0, 2, 0]);
  });

  const duplicateRelease = {
    filename: 'zetsu-release.osr', sourceBytes: new Uint8Array(), metadata,
    frames: [[44702, 0], [44713, 2], [44798, 2], [44798, 0], [44842, 1], [44945, 0]]
      .map(([timeMs, keys], index, all) => ({ timeMs, deltaMs: index ? timeMs - all[index - 1][0] : timeMs, x: 175, y: 132, keys })),
    keyEvents: [],
  };
  const originalHold = { trackId: 'edit', key: 'M2' as const, startTime: 44713, endTime: 44798 };

  test('shortening, moving or deleting a hold leaves no phantom press at its duplicate-timestamp release', () => {
    for (const next of [null, { ...originalHold, endTime: 44780 }, { ...originalHold, startTime: 44600, endTime: 44680 }]) {
      const edited = editReplayInput(duplicateRelease, originalHold, next);
      assert.deepEqual(edited.keyEvents.filter(event => event.key === 'M2'), next ? [
        { timeMs: next.startTime, key: 'M2', down: true },
        { timeMs: next.endTime, key: 'M2', down: false },
      ] : []);
      assert.deepEqual(edited.keyEvents.filter(event => event.key === 'M1'), [
        { timeMs: 44842, key: 'M1', down: true }, { timeMs: 44945, key: 'M1', down: false },
      ]);
    }
  });

  test('clearing a hold preserves a separate press after its release at the same timestamp', () => {
    const frames = duplicateRelease.frames.map(frame => ({ ...frame }));
    frames.splice(4, 0, { ...frames[3], keys: 2 });
    const edited = editReplayInput({ ...duplicateRelease, frames }, originalHold, null);
    assert.deepEqual(edited.keyEvents.filter(event => event.key === 'M2'), [
      { timeMs: 44798, key: 'M2', down: true }, { timeMs: 44842, key: 'M2', down: false },
    ]);
  });

  const editable = { filename: 'edit.osr', sourceBytes: new Uint8Array([9, 8, 7]), metadata,
    frames: [0, 17, 34].map((timeMs, index) => ({ timeMs, deltaMs: index ? 17 : 0, x: 100 + timeMs, y: 200, keys: 0 })), keyEvents: [] };
  const inserted = editReplayInput(editable, null, { trackId: 'edit', key: 'M1', startTime: 10, endTime: 27 });

  test('inserting an input splices press/release cursor frames at its edges', () => {
    assert.deepEqual(inserted.frames.map((item) => item.timeMs), [0, 10, 17, 27, 34]);
    assert.equal(inserted.frames.find((item) => item.timeMs === 10)?.x, 110);
    assert.deepEqual(inserted.keyEvents, [{ timeMs: 10, key: 'M1', down: true }, { timeMs: 27, key: 'M1', down: false }]);
    assert.deepEqual(replayInputIntervals('edit', inserted), [{ trackId: 'edit', key: 'M1', startTime: 10, endTime: 27 }]);
  });

  test('nearestReplayFrameTime rounds to the closest existing frame', () => {
    assert.equal(nearestReplayFrameTime(editable.frames, 10), 17);
  });

  test('drawReplayCursorPath replaces cursor movement inside a time range', () => {
    const drawn = drawReplayCursorPath(inserted, 0, 34, [
      { x: 0, y: 0, offsetMs: 0 }, { x: 512, y: 384, offsetMs: 10 }, { x: 0, y: 0, offsetMs: 20 },
    ]);
    assert.deepEqual(drawn.frames.map((item) => item.timeMs), [0, 10, 27, 34]);
    const tap = drawn.frames.find((item) => item.timeMs === 10);
    assert.deepEqual(tap && [tap.x, tap.y], [301.2, 225.9]);
    assert.deepEqual(drawn.keyEvents, inserted.keyEvents);
    assert.deepEqual(Array.from(drawn.sourceBytes), [9, 8, 7]);
  });

  test('drawReplayCursorPath smoothing pulls the path away from a hard corner', () => {
    const smoothed = drawReplayCursorPath(inserted, 0, 34, [
      { x: 0, y: 0, offsetMs: 0 }, { x: 512, y: 384, offsetMs: 10 }, { x: 0, y: 0, offsetMs: 20 },
    ], 'strong');
    assert.ok((smoothed.frames.find((item) => item.timeMs === 10)?.x ?? 512) < 100);
  });

  test('drawReplayCursorPath resamples to ~60 fps frames plus input frames, not one per pointer sample', () => {
    const dense = Array.from({ length: 200 }, (_, index) => ({ x: index, y: index, offsetMs: index }));
    const drawn = drawReplayCursorPath(inserted, 0, 200, dense);
    const times = drawn.frames.filter((item) => item.timeMs >= 0 && item.timeMs <= 200).map((item) => item.timeMs);
    assert.ok(times.includes(10) && times.includes(27));
    for (let index = 1; index < times.length; index++) assert.ok(times[index] - times[index - 1] <= 17);
    assert.ok(times.length <= 15);
  });

  test('replayInputSegments splits an input at a recorded cut point', () => {
    assert.deepEqual(replayInputSegments({ id: 'edit', replay: inserted, inputCuts: [{ key: 'M1', timeMs: 17 }] }), [
      { trackId: 'edit', key: 'M1', startTime: 10, endTime: 17 }, { trackId: 'edit', key: 'M1', startTime: 17, endTime: 27 },
    ]);
  });

  test('moving an input retimes its key-down/up frames and removes the ones it no longer needs', () => {
    const moved = editReplayInput(inserted, { trackId: 'edit', key: 'M1', startTime: 10, endTime: 27 }, { trackId: 'edit', key: 'M1', startTime: 11, endTime: 28 });
    assert.deepEqual(moved.keyEvents, [{ timeMs: 11, key: 'M1', down: true }, { timeMs: 28, key: 'M1', down: false }]);
    // The frames added for the old edges carried nothing else, so they are gone.
    assert.deepEqual(moved.frames.map((item) => item.timeMs), [0, 11, 17, 28, 34]);

    const removed = editReplayInput(moved, { trackId: 'edit', key: 'M1', startTime: 11, endTime: 28 }, null);
    assert.deepEqual(removed.frames.map((item) => item.timeMs), editable.frames.map((item) => item.timeMs));
    assert.equal(removed.frames.every((item) => logicalKeys(item.keys) === 0), true);
    assert.deepEqual(Array.from(removed.sourceBytes), [9, 8, 7]);
  });

  test('an input placed exactly where another ends merges into one interval', () => {
    const merged = editReplayInput(inserted, null, { trackId: 'edit', key: 'M1', startTime: 20, endTime: 34 });
    assert.deepEqual(replayInputIntervals('edit', merged), [{ trackId: 'edit', key: 'M1', startTime: 10, endTime: 34 }]);
  });
});

describe('snapTimeWithinRange', () => {
  test('snaps to the nearest candidate inside the tolerance', () => {
    assert.equal(snapTimeWithinRange(109, [100, 200], 10), 100);
  });

  test('leaves the time alone outside the tolerance or with no candidates', () => {
    assert.equal(snapTimeWithinRange(111, [100, 200], 10), 111);
    assert.equal(snapTimeWithinRange(150, [], 10), 150);
  });
});

const first = { filename: 'one.osr', sourceBytes: new Uint8Array([1, 2]), metadata,
  frames: [frame], keyEvents: [{ timeMs: 7000, key: 'M1' as const, down: true }] };
const second = { filename: 'two.osr', sourceBytes: new Uint8Array([3, 4]), metadata: { ...metadata, playerName: 'Two' },
  frames: [{ ...frame, x: 300, keys: 10 }], keyEvents: [{ timeMs: 7000, key: 'M2' as const, down: true }] };

describe('importing replays as tracks', () => {
  test('two replays for the same difficulty become two distinct, differently coloured tracks', () => {
    useEditorStore.getState().importReplay(first);
    useEditorStore.getState().importReplay(second);
    const state = useEditorStore.getState();
    assert.equal(state.tracks.length, 2);
    assert.notEqual(state.tracks[0].id, state.tracks[1].id);
    assert.notEqual(state.tracks[0].color, state.tracks[1].color);
    assert.equal(state.tracks[0].replay.frames[0].timeMs, state.tracks[1].replay.frames[0].timeMs);
    assert.equal(state.durationMs, 7000);
    assert.equal(state.previewTrackId, state.tracks[0].id);
  });

  test('renaming trims whitespace and ignores a blank name', () => {
    const renamedTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().setTrackName(renamedTrackId, '  Renamed Player  ');
    assert.equal(useEditorStore.getState().tracks[0].name, 'Renamed Player');
    useEditorStore.getState().setTrackName(renamedTrackId, '   ');
    assert.equal(useEditorStore.getState().tracks[0].name, 'Renamed Player');
  });

  test('the preview track can be switched to another imported track', () => {
    const state = useEditorStore.getState();
    state.setPreviewTrack(state.tracks[1].id);
    assert.equal(useEditorStore.getState().previewTrackId, state.tracks[1].id);
  });

  test('re-importing a replay with a different beatmap hash does not duplicate tracks or mutate the source bytes', () => {
    useEditorStore.getState().importReplay({ ...first, metadata: { ...metadata, beatmapHash: 'b'.repeat(32) } });
    assert.equal(useEditorStore.getState().tracks.length, 2);
    assert.deepEqual(Array.from(first.sourceBytes), [1, 2]);
  });

  test('clearReplays empties the workspace', () => {
    useEditorStore.getState().clearReplays();
    const state = useEditorStore.getState();
    assert.equal(state.tracks.length, 0);
    assert.equal(state.previewTrackId, null);
  });
});

describe('playhead and timeline window', () => {
  test('a replay starting before 0ms sets the initial window start', () => {
    const early = { ...first, frames: [{ ...frame, timeMs: -750, deltaMs: -750 }, { ...frame, timeMs: 7000 }] };
    useEditorStore.getState().importReplay(early);
    assert.equal(useEditorStore.getState().windowStartMs, -750);
  });

  test('the playhead and window start can move freely, but the window is clamped to the replay start', () => {
    useEditorStore.getState().setPlayhead(-500);
    assert.equal(useEditorStore.getState().playheadMs, -500);
    useEditorStore.getState().setWindowStart(-500);
    assert.equal(useEditorStore.getState().windowStartMs, -500);
    useEditorStore.getState().setWindowStart(-900);
    assert.equal(useEditorStore.getState().windowStartMs, -750);
  });
});

describe('adding and cutting inputs on the timeline', () => {
  test('adding an input at the playhead selects it and is undoable', () => {
    const beforeEditFrames = useEditorStore.getState().tracks[0].replay.frames.length;
    useEditorStore.getState().setInputKey('M2');
    useEditorStore.getState().setPlayhead(100);
    useEditorStore.getState().addInputAtPlayhead();
    assert.equal(useEditorStore.getState().selectedInput?.key, 'M2');
    assert.equal(useEditorStore.getState().selectedInput?.startTime, 100);
    assert.equal(useEditorStore.getState().playheadMs, 100);
    assert.ok(useEditorStore.getState().tracks[0].replay.frames.length > beforeEditFrames);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.length, beforeEditFrames);
    useEditorStore.getState().redo();
    assert.ok(useEditorStore.getState().tracks[0].replay.frames.length > beforeEditFrames);
  });

  test('cutting an input at a point splits it into two, and is undoable', () => {
    const editedTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().cutInputAt(editedTrackId, 'M2', 108);
    assert.deepEqual(replayInputSegments(useEditorStore.getState().tracks[0]).filter((input) => input.key === 'M2'), [
      { trackId: editedTrackId, key: 'M2', startTime: 100, endTime: 108 }, { trackId: editedTrackId, key: 'M2', startTime: 108, endTime: 117 },
    ]);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].inputCuts.length, 0);
  });

  test('a locked track rejects input edits', () => {
    const editedTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().toggleTrackLock(editedTrackId);
    const lockedFrames = useEditorStore.getState().tracks[0].replay.frames.map((item) => ({ ...item }));
    useEditorStore.getState().commitInputEdit(null, { trackId: editedTrackId, key: 'K2', startTime: 200, endTime: 217 });
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, lockedFrames);
  });
});

describe('copy/paste inputs across tracks', () => {
  const editable = { filename: 'edit.osr', sourceBytes: new Uint8Array([9, 8, 7]), metadata,
    frames: [0, 17, 34].map((timeMs, index) => ({ timeMs, deltaMs: index ? 17 : 0, x: 100 + timeMs, y: 200, keys: 0 })), keyEvents: [] };

  test('setup: two tracks from the same source replay, one edited with two inputs', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay(editable);
    useEditorStore.getState().importReplay({ ...editable, filename: 'target.osr', metadata: { ...metadata, playerName: 'Target' } });
    const [sourceTrack] = useEditorStore.getState().tracks;
    assert.equal(sourceTrack.edited, false);
    useEditorStore.getState().commitInputEdits([
      { original: null, next: { trackId: sourceTrack.id, key: 'M1', startTime: 10, endTime: 20 } },
      { original: null, next: { trackId: sourceTrack.id, key: 'M2', startTime: 23, endTime: 30 } },
    ]);
    const sourceInputs = replayInputIntervals(sourceTrack.id, useEditorStore.getState().tracks[0].replay);
    assert.equal(sourceInputs.length, 2);
    assert.equal(useEditorStore.getState().tracks[0].edited, true);
  });

  test('pasting copied inputs onto another track offsets them to the playhead', () => {
    const [sourceTrack, targetTrack] = useEditorStore.getState().tracks;
    const sourceInputs = replayInputIntervals(sourceTrack.id, sourceTrack.replay);
    useEditorStore.getState().selectInputs(sourceInputs);
    assert.equal(useEditorStore.getState().selectedInputs.length, 2);
    useEditorStore.getState().copySelectedInputs();
    useEditorStore.getState().selectTrack(targetTrack.id, false, false);
    useEditorStore.getState().setDuration(200);
    useEditorStore.getState().setPlayhead(100);
    useEditorStore.getState().pasteInputs(false);
    assert.deepEqual(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).map((input) => [input.key, input.startTime, input.endTime]), [
      ['M1', 100, 110], ['M2', 113, 120],
    ]);
  });

  test('pasting or editing on top of an existing input is rejected without mutating frames', () => {
    const [, targetTrack] = useEditorStore.getState().tracks;
    const beforeRejectedPaste = useEditorStore.getState().tracks[1].replay.frames.map((item) => ({ ...item }));
    useEditorStore.getState().pasteInputs(false);
    assert.deepEqual(useEditorStore.getState().tracks[1].replay.frames, beforeRejectedPaste);
    assert.match(useEditorStore.getState().lastEditMessage, /overlaps/);
    useEditorStore.getState().commitInputEdit(null, { trackId: targetTrack.id, key: 'K1', startTime: 105, endTime: 115 });
    assert.deepEqual(useEditorStore.getState().tracks[1].replay.frames, beforeRejectedPaste);
    assert.match(useEditorStore.getState().lastEditMessage, /overlaps/);
  });

  test('the accepted paste can be undone and redone', () => {
    const [, targetTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().undo();
    assert.equal(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).length, 0);
    assert.equal(useEditorStore.getState().tracks[1].edited, false);
    useEditorStore.getState().redo();
    assert.equal(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).length, 2);
    assert.equal(useEditorStore.getState().tracks[1].edited, true);
  });

  test('delete only removes the selected inputs, not the whole track', () => {
    const [, targetTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().deleteSelectedInput();
    assert.equal(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).length, 2);
    useEditorStore.getState().selectInputs(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay));
    useEditorStore.getState().deleteSelectedInput();
    assert.equal(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).length, 0);
    useEditorStore.getState().undo();
    assert.equal(replayInputIntervals(targetTrack.id, useEditorStore.getState().tracks[1].replay).length, 2);
  });
});

describe('cursor frame editing', () => {
  test('setCursorFramePosition moves an existing frame, is undoable, and insertCursorFrame adds a new one', () => {
    const [sourceTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().setCursorFramePosition(sourceTrack.id, 17, 400, 300);
    let moved = useEditorStore.getState().tracks[0].replay.frames.find((item) => item.timeMs === 17);
    assert.deepEqual(moved && [moved.x, moved.y], [400, 300]);

    useEditorStore.getState().insertCursorFrame(sourceTrack.id, 21, 600, -25);
    const inserted = useEditorStore.getState().tracks[0].replay.frames.find((item) => item.timeMs === 21);
    assert.deepEqual(inserted && [inserted.x, inserted.y], [600, -25]);

    useEditorStore.getState().deleteCursorFrame(sourceTrack.id, 21);
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs === 21), false);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs === 21), true);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs === 21), false);

    useEditorStore.getState().setCursorFramePosition(sourceTrack.id, 17, 620, -40);
    moved = useEditorStore.getState().tracks[0].replay.frames.find((item) => item.timeMs === 17);
    assert.deepEqual(moved && [moved.x, moved.y], [620, -40]);
  });

  test('interpolateCursorRange straightens the path between its endpoints, and is undoable', () => {
    const [sourceTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().undo();
    useEditorStore.getState().interpolateCursorRange(sourceTrack.id, 0, 34);
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.find((item) => item.timeMs === 17)?.x, 117);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.find((item) => item.timeMs === 17)?.x, 400);
  });

  test('brush warps only selected existing replay frames with center-weighted falloff and one undo step', () => {
    const [sourceTrack] = useEditorStore.getState().tracks;
    const before = useEditorStore.getState().tracks[0].replay.frames.map((item) => ({ ...item }));
    const frameCount = before.length;
    const center = before.find((item) => item.timeMs === 17)!;
    useEditorStore.getState().beginBrushStroke(sourceTrack.id);
    useEditorStore.getState().applyBrushDab(sourceTrack.id, center.x, center.y, 100, 20, 10, 0, 34, [17]);
    const after = useEditorStore.getState().tracks[0].replay.frames;
    assert.equal(after.length, frameCount);
    assert.deepEqual(after.find((item) => item.timeMs === 17), { ...center, x: center.x + 7, y: center.y + 3.5 });
    assert.deepEqual(after.filter((item) => item.timeMs !== 17), before.filter((item) => item.timeMs !== 17));
    useEditorStore.getState().undo();
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, before);
  });
});

describe('clipboard cursor-frame modes', () => {
  test('cursor-only clipboard copies from the selected single frame to the playhead', () => {
    const [sourceTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().setPreviewTrack(sourceTrack.id);
    useEditorStore.getState().selectCursorFrame(0);
    useEditorStore.getState().setPlayhead(34);
    useEditorStore.getState().setClipboardMode('cursor');
    useEditorStore.getState().copySelectedInputs();
    assert.ok((useEditorStore.getState().inputClipboard?.cursorFrames.length ?? 0) >= 3);
  });

  test('pasting cursor frames writes their positions onto the destination track, and is undoable', () => {
    const [, targetTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().selectTrack(targetTrack.id, false, false);
    useEditorStore.getState().pasteInputs(false, 150);
    assert.equal(useEditorStore.getState().tracks[1].replay.frames.find((item) => item.timeMs === 167)?.x, 400);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[1].replay.frames.some((item) => item.timeMs === 167), false);
  });

  test('a selected time range copies every cursor frame inside it', () => {
    const [sourceTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().selectTimeRange({ startMs: 0, endMs: 17 });
    useEditorStore.getState().copySelectedInputs();
    assert.deepEqual(useEditorStore.getState().inputClipboard?.cursorFrames.map((item) => item.timeMs), [0, 10, 17]);
    useEditorStore.getState().selectTimeRange(null);
    useEditorStore.getState().selectCursorRange({ trackId: sourceTrack.id, startMs: 11, endMs: 16 });
    useEditorStore.getState().copySelectedInputs();
    assert.deepEqual(useEditorStore.getState().inputClipboard?.cursorFrames.map((item) => item.timeMs), [11, 16]);
  });

  test('paste reproduces the copied cursor position and leaves the source bytes untouched', () => {
    const [sourceTrack, targetTrack] = useEditorStore.getState().tracks;
    const copiedCursorX = useEditorStore.getState().inputClipboard?.cursorFrames[0].x;
    useEditorStore.getState().selectTrack(targetTrack.id, false, false);
    useEditorStore.getState().pasteInputs(false, 200);
    assert.equal(useEditorStore.getState().tracks.find((track) => track.id === targetTrack.id)?.replay.frames.find((item) => item.timeMs === 200)?.x, copiedCursorX);
    useEditorStore.getState().undo();
    useEditorStore.getState().selectCursorRange(null);
    assert.deepEqual(Array.from(sourceTrack.replay.sourceBytes), [9, 8, 7]);
  });
});

describe('ripple delete and shifted commits', () => {
  const editable = { filename: 'edit.osr', sourceBytes: new Uint8Array([9, 8, 7]), metadata,
    frames: [0, 17, 34].map((timeMs, index) => ({ timeMs, deltaMs: index ? 17 : 0, x: 100 + timeMs, y: 200, keys: 0 })), keyEvents: [] };

  test('setup: one track with two M1 inputs and a preview-only edit that does not mutate frames', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay(editable);
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    const transientFrames = useEditorStore.getState().tracks[0].replay.frames;
    useEditorStore.getState().setInputEditPreview([{ original: { trackId: rippleTrackId, key: 'M1', startTime: 1, endTime: 10 }, next: { trackId: rippleTrackId, key: 'M1', startTime: 1, endTime: 24 } }]);
    assert.equal(useEditorStore.getState().inputEditPreview?.[0].next.endTime, 24);
    assert.equal(useEditorStore.getState().tracks[0].replay.frames, transientFrames);
    useEditorStore.getState().setInputEditPreview(null);
    useEditorStore.getState().commitInputEdits([
      { original: null, next: { trackId: rippleTrackId, key: 'M1', startTime: 5, endTime: 10 } },
      { original: null, next: { trackId: rippleTrackId, key: 'M1', startTime: 20, endTime: 25 } },
    ]);
  });

  test('ripple delete removes an input and shifts everything after it left, and is undoable', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().selectInput({ trackId: rippleTrackId, key: 'M1', startTime: 5, endTime: 10 });
    useEditorStore.getState().rippleDeleteSelectedInputs();
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.startTime, input.endTime]), [[15, 20]]);
    useEditorStore.getState().undo();
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.startTime, input.endTime]), [[5, 10], [20, 25]]);
  });

  test('a shifted commit that would collide is rejected; a non-colliding shift is accepted and undoable', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    const rippleInputs = replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay);
    const beforeCollision = useEditorStore.getState().tracks[0].replay.frames.map((item) => ({ ...item }));
    useEditorStore.getState().commitInputEdits([{ original: rippleInputs[0], next: { ...rippleInputs[0], startTime: 18, endTime: 23 } }]);
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, beforeCollision);
    assert.match(useEditorStore.getState().lastEditMessage, /overlaps/);

    useEditorStore.getState().commitInputEdits(rippleInputs.map((original) => ({ original, next: { ...original, startTime: original.startTime + 1, endTime: original.endTime + 1 } })));
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.startTime, input.endTime]), [[6, 11], [21, 26]]);
    useEditorStore.getState().undo();
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.startTime, input.endTime]), [[5, 10], [20, 25]]);
  });

  test('replace-selection paste swaps a selected input for the clipboard input', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().selectInput({ trackId: rippleTrackId, key: 'M1', startTime: 5, endTime: 10 });
    useEditorStore.getState().setClipboardMode('inputs');
    useEditorStore.getState().copySelectedInputs();
    useEditorStore.getState().commitInputEdit(null, { trackId: rippleTrackId, key: 'K1', startTime: 40, endTime: 50 });
    useEditorStore.getState().selectInput({ trackId: rippleTrackId, key: 'K1', startTime: 40, endTime: 50 });
    useEditorStore.getState().pasteInputs(false, undefined, true);
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.key, input.startTime, input.endTime]), [['M1', 5, 10], ['M1', 20, 25], ['M1', 40, 45]]);
    assert.match(useEditorStore.getState().lastEditMessage, /Replaced/);
    useEditorStore.getState().undo();
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.key, input.startTime, input.endTime]), [['M1', 5, 10], ['M1', 20, 25], ['K1', 40, 50]]);
  });

  test('duplicate offsets a copy of the selected input right after it', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().selectInput({ trackId: rippleTrackId, key: 'M1', startTime: 20, endTime: 25 });
    useEditorStore.getState().duplicateSelectedInputs();
    assert.deepEqual(replayInputIntervals(rippleTrackId, useEditorStore.getState().tracks[0].replay).map((input) => [input.key, input.startTime, input.endTime]), [['M1', 5, 10], ['M1', 20, 25], ['M1', 26, 31], ['K1', 40, 50]]);
    useEditorStore.getState().undo();
  });
});

describe('moveCursorFrameTime and drawCursorPath guard rails', () => {
  test('an interior cursor frame can be retimed between its neighbors, and is undoable', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    const beforeRetime = useEditorStore.getState().tracks[0].replay;
    useEditorStore.getState().moveCursorFrameTime(rippleTrackId, 17, 18);
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs === 18), true);
    assert.equal(useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs === 17), false);
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.keyEvents, beforeRetime.keyEvents);
    useEditorStore.getState().undo();
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, beforeRetime.frames);
  });

  test('a frame that changes an input cannot be retimed or deleted as a cursor frame', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    const beforeRetime = useEditorStore.getState().tracks[0].replay;
    useEditorStore.getState().moveCursorFrameTime(rippleTrackId, 5, 6);
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, beforeRetime.frames);
    assert.match(useEditorStore.getState().lastEditMessage, /changes an input/);
    useEditorStore.getState().deleteCursorFrame(rippleTrackId, 5);
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, beforeRetime.frames);
    assert.match(useEditorStore.getState().lastEditMessage, /changes an input/);
  });

  test('drawing a cursor path over a selected range replaces movement without touching key events', () => {
    const rippleTrackId = useEditorStore.getState().tracks[0].id;
    const beforeRetime = useEditorStore.getState().tracks[0].replay;
    useEditorStore.getState().selectTimeRange({ startMs: 0, endMs: 34 });
    useEditorStore.getState().drawCursorPath(rippleTrackId, [{ x: 10, y: 20, offsetMs: 0 }, { x: 256, y: 192, offsetMs: 5 }, { x: 490, y: 360, offsetMs: 10 }]);
    assert.ok(
      useEditorStore.getState().tracks[0].replay.frames.some((item) => item.timeMs > 0 && item.timeMs < 34 && item.x > 200),
    );
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.keyEvents, beforeRetime.keyEvents);
    useEditorStore.getState().undo();
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames, beforeRetime.frames);
  });
});

describe('pure formatting helpers', () => {
  test('formatTime renders negative milliseconds with a leading sign', () => {
    assert.equal(formatTime(-500), '-00:00.500');
  });

  test('logicalKeys masks redundant mouse bits onto the keyboard bits', () => {
    assert.deepEqual([1, 2, 5, 10, 15].map(logicalKeys), [1, 2, 4, 8, 12]);
  });
});

describe('persisted preferences', () => {
  const preferences = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => preferences.get(key) ?? null,
    setItem: (key: string, value: string) => { preferences.set(key, value); },
  } });

  test('volume is clamped to 100 and persisted', () => {
    useEditorStore.getState().setVolume(20);
    assert.equal(useEditorStore.getState().volume, 20);
    assert.equal(readSavedVolume(), 20);
    useEditorStore.getState().setVolume(120);
    assert.equal(readSavedVolume(), 100);
    useEditorStore.getState().setVolume(20);
  });

  test('playfield display preferences round-trip through readPlayfieldPreferences', () => {
    useEditorStore.getState().setShowBackground(false);
    useEditorStore.getState().setBackgroundDim(35);
    useEditorStore.getState().setShowGrid(false);
    useEditorStore.getState().setCompactMode(true);
    for (const filter of ['hideSkinCursor', 'wireframeGameplay', 'fadeAfterClick', 'showHitJudgements', 'showHiddenFade'] as const)
      useEditorStore.getState().setGameplayFilter(filter, true);
    useEditorStore.getState().setPlayfieldZoom(1.7);
    useEditorStore.getState().setCursorTrailMs(650);
    assert.deepEqual(readPlayfieldPreferences(), { showBackground: false, backgroundDim: 35, cursorSize: 100, showGrid: false, compactMode: true, hideSkinCursor: true, wireframeGameplay: true, fadeAfterClick: true, showHitJudgements: true, showHiddenFade: true, showSliderEndWindows: false, showSliderTracking: true, playfieldZoom: 1.7, cursorTrailMs: 650 });

    useEditorStore.getState().setShowBackground(true);
    useEditorStore.getState().setBackgroundDim(120);
    useEditorStore.getState().setShowGrid(true);
    useEditorStore.getState().setCompactMode(false);
    for (const filter of ['hideSkinCursor', 'wireframeGameplay', 'fadeAfterClick', 'showHitJudgements', 'showHiddenFade'] as const)
      useEditorStore.getState().setGameplayFilter(filter, false);
    useEditorStore.getState().setPlayfieldZoom(1);
    useEditorStore.getState().setCursorTrailMs(220);
    assert.deepEqual(readPlayfieldPreferences(), { showBackground: true, backgroundDim: 100, cursorSize: 100, showGrid: true, compactMode: false, hideSkinCursor: false, wireframeGameplay: false, fadeAfterClick: false, showHitJudgements: false, showHiddenFade: false, showSliderEndWindows: false, showSliderTracking: true, playfieldZoom: 1, cursorTrailMs: 220 });
  });

  test('timeline wheel mode/step is persisted to localStorage', () => {
    useEditorStore.getState().setTimelineWheelMode('milliseconds');
    useEditorStore.getState().setTimelineWheelStepMs(5);
    assert.equal(useEditorStore.getState().timelineWheelMode, 'milliseconds');
    assert.equal(useEditorStore.getState().timelineWheelStepMs, 5);
    assert.equal(preferences.get('osu-replay-editor.timeline-wheel-mode'), 'milliseconds');
    assert.equal(preferences.get('osu-replay-editor.timeline-wheel-step-ms'), '5');
  });

  test('cursor display/smoothing/draw-snap toggles are persisted to localStorage', () => {
    useEditorStore.getState().setCursorDisplay('future', false);
    useEditorStore.getState().setCursorDisplay('click-markers', false);
    useEditorStore.getState().setCursorSmoothing('strong');
    useEditorStore.getState().setDrawRangeSnap(false);
    assert.equal(useEditorStore.getState().showCursorFuture, false);
    assert.equal(useEditorStore.getState().showClickMarkers, false);
    assert.equal(useEditorStore.getState().cursorSmoothing, 'strong');
    assert.equal(useEditorStore.getState().drawRangeSnap, false);
    assert.equal(preferences.get('osu-replay-editor.cursor-future'), 'false');
    assert.equal(preferences.get('osu-replay-editor.cursor-click-markers'), 'false');
    assert.equal(preferences.get('osu-replay-editor.cursor-smoothing'), 'strong');
    assert.equal(preferences.get('osu-replay-editor.draw-range-snap'), 'false');
  });
});

describe('track metadata, autoScore and simulation results', () => {
  test('editing exported metadata does not touch the recorded replay metadata, and marks the track auto-scored', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay(first);
    const metadataTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().setTrackMetadata(metadataTrackId, { playerName: 'Export Player', mods: 24 }, true);
    assert.equal(useEditorStore.getState().tracks[0].replay.metadata.playerName, first.metadata.playerName);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.playerName, 'Export Player');
    assert.equal(useEditorStore.getState().tracks[0].autoScore, true);
  });

  test('a simulation result only overwrites the export score while auto-scored', () => {
    const metadataTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().setSimulationResult(metadataTrackId, { scope: 'whole-replay', score: 1234 } as any);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, 1234);
    useEditorStore.getState().setTrackMetadata(metadataTrackId, { score: 5678 }, false);
    useEditorStore.getState().setSimulationResult(metadataTrackId, { scope: 'whole-replay', score: 1234 } as any);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, 5678);
    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().tracks[0].autoScore, true);
  });

  test('an imported replay keeps its recorded score until its inputs are edited, then follows the simulation', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay(first);
    const id = useEditorStore.getState().tracks[0].id;
    const recorded = useEditorStore.getState().tracks[0].exportMetadata.score;
    const result = { scope: 'whole-replay', score: 4321, count300: 5, count100: 9, count50: 0, misses: 3, maxCombo: 7 } as any;
    useEditorStore.getState().setSimulationResult(id, result);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, recorded);
    useEditorStore.getState().setTrackMetadata(id, { playerName: 'Renamed' });
    useEditorStore.getState().setSimulationResult(id, result);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, recorded);

    useEditorStore.setState((state) => ({
      tracks: state.tracks.map((track) => ({ ...track, replay: { ...track.replay, frames: [...track.replay.frames] } })),
    }));
    useEditorStore.getState().setSimulationResult(id, result, true);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, recorded, 'a partial result is not written');
    useEditorStore.getState().setSimulationResult(id, result);
    const track = useEditorStore.getState().tracks[0];
    assert.equal(track.exportMetadata.score, 4321);
    assert.equal(track.exportMetadata.hitCounts?.[1], 9);
    assert.equal(track.autoScore, true);

    useEditorStore.getState().setTrackMetadata(id, { score: 1111 }, false);
    useEditorStore.getState().setSimulationResult(id, result);
    assert.equal(useEditorStore.getState().tracks[0].exportMetadata.score, 1111, 'hand-typed numbers stay');
  });
});

describe('invertCursorAxis', () => {
  const mirrorSource = { ...first, frames: first.frames.map((item, index) => ({ ...item, x: [100, 520, 200][index], y: [50, -20, 150][index] })) };

  test('inverting Y only affects frames inside the selected time range, and is undoable', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay({ ...mirrorSource, frames: [{ ...frame, timeMs: 0 }, { ...frame, timeMs: 17 }, { ...frame, timeMs: 34 }].map((item, index) => ({ ...item, x: [100, 520, 200][index], y: [50, -20, 150][index] })) });
    useEditorStore.getState().selectTimeRange({ startMs: 17, endMs: 34 });
    useEditorStore.getState().invertCursorAxis('y');
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames.map((item) => item.y), [50, 404, 234]);
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames.map((item) => item.x), [100, 520, 200]);
    useEditorStore.getState().undo();
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames.map((item) => item.y), [50, -20, 150]);
    useEditorStore.getState().redo();
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames.map((item) => item.y), [50, 404, 234]);
  });

  test('inverting X with no range selected affects the whole replay', () => {
    useEditorStore.getState().selectTimeRange(null);
    useEditorStore.getState().invertCursorAxis('x');
    assert.deepEqual(useEditorStore.getState().tracks[0].replay.frames.map((item) => item.x), [412, -8, 312]);
  });

  test('a locked track rejects axis inversion', () => {
    const mirrorTrackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().toggleTrackLock(mirrorTrackId);
    const lockedMirrorFrames = useEditorStore.getState().tracks[0].replay.frames;
    useEditorStore.getState().invertCursorAxis('x');
    assert.equal(useEditorStore.getState().tracks[0].replay.frames, lockedMirrorFrames);
  });
});

describe('removeTracks', () => {
  test('removes an active replay, repoints the preview and clears undo history', () => {
    useEditorStore.getState().clearReplays();
    useEditorStore.getState().importReplay({ ...first, filename: 'a.osr' });
    useEditorStore.getState().importReplay({ ...first, filename: 'b.osr' });
    const [keptTrack, removedTrack] = useEditorStore.getState().tracks;
    useEditorStore.getState().setPreviewTrack(removedTrack.id);
    useEditorStore.getState().removeTracks([removedTrack.id]);
    const state = useEditorStore.getState();
    assert.deepEqual(state.tracks.map((track) => track.id), [keptTrack.id]);
    assert.equal(state.previewTrackId, keptTrack.id);
    assert.equal(state.undoStack.length, 0);
    assert.match(state.lastEditMessage, /Removed 1 replay/);
  });

  test('removes archived replays without touching the active map', () => {
    const active = useEditorStore.getState().tracks;
    useEditorStore.setState({ archivedTracks: [{ ...active[0], id: 'archived-1' }] });
    useEditorStore.getState().removeTracks(['archived-1']);
    assert.equal(useEditorStore.getState().archivedTracks.length, 0);
    assert.equal(useEditorStore.getState().tracks, active);
  });
});

describe('editing key presses leaves the cursor path alone', () => {
  // A curved path sampled every 100 ms, with no keys held.
  const path = Array.from({ length: 11 }, (_, index) => ({
    timeMs: index * 100,
    deltaMs: 100,
    x: 100 + index * 20,
    y: 200 + (index % 2) * 30,
    keys: 0,
  }));
  const replay = { frames: path, keyEvents: [] } as never;
  const cursorAt = (frames: { timeMs: number; x: number; y: number }[], time: number) => {
    const after = frames.findIndex((frame) => frame.timeMs >= time);
    const a = frames[after - 1] ?? frames[after];
    const b = frames[after];
    const amount = b.timeMs === a.timeMs ? 0 : (time - a.timeMs) / (b.timeMs - a.timeMs);
    return [Math.round((a.x + (b.x - a.x) * amount) * 100) / 100, Math.round((a.y + (b.y - a.y) * amount) * 100) / 100];
  };
  const press = (startTime: number, endTime: number) => ({ trackId: 't', key: 'K1' as const, startTime, endTime });

  test('a press between frames gets frames on the path, which go away when the press moves on', () => {
    const added = editReplayInput(replay, null, press(150, 250));
    assert.deepEqual(
      added.frames.map((frame) => frame.timeMs),
      [0, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000],
    );
    for (const time of [120, 150, 175, 250, 330]) assert.deepEqual(cursorAt(added.frames, time), cursorAt(path, time));

    // Moving the press elsewhere, twice, leaves no frames behind at the old boundaries.
    const moved = editReplayInput(added, press(150, 250), press(350, 450));
    const movedAgain = editReplayInput(moved, press(350, 450), press(620, 680));
    assert.deepEqual(
      movedAgain.frames.map((frame) => frame.timeMs),
      [0, 100, 200, 300, 400, 500, 600, 620, 680, 700, 800, 900, 1000],
    );
    for (const time of [150, 250, 350, 450, 620, 650, 680]) assert.deepEqual(cursorAt(movedAgain.frames, time), cursorAt(path, time));
    assert.deepEqual(
      replayInputIntervals('t', movedAgain).map((item) => [item.startTime, item.endTime]),
      [[620, 680]],
    );

    // Removing the press restores the original frames.
    assert.deepEqual(editReplayInput(movedAgain, press(620, 680), null).frames.map((frame) => frame.timeMs), path.map((frame) => frame.timeMs));
  });

  test('recorded frames and frames moved by hand are never removed', () => {
    const added = editReplayInput(replay, null, press(150, 250));
    // The frame inserted at 150 ms was dragged off the path afterwards: it is cursor data now.
    const dragged = { ...added, frames: added.frames.map((frame) => (frame.timeMs === 150 ? { ...frame, y: frame.y + 40 } : frame)) };
    const moved = editReplayInput(dragged, press(150, 250), press(350, 450));
    assert.ok(moved.frames.some((frame) => frame.timeMs === 150));
    assert.ok(!moved.frames.some((frame) => frame.timeMs === 250));
    // Presses on recorded frames keep every recorded frame.
    const onFrames = editReplayInput(replay, null, press(200, 400));
    assert.deepEqual(editReplayInput(onFrames, press(200, 400), null).frames.length, path.length);
  });
});
