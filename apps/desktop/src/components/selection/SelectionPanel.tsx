import { Copy, Plus, Scissors, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatTime, type InputKey, useEditorStore } from '../../stores/editor';
import { Field } from '../common/Field';
import { InfoTip } from '../InfoTip';
import { PanelCloseButton } from '../common/PanelCloseButton';

const inputKeys: InputKey[] = ['M1', 'M2', 'K1', 'K2'];
const shiftSteps = [-10, -5, -1, 1, 5, 10];

function RangeSummary({ start, end }: { start: number; end: number }) {
  return (
    <>
      <Field label="Range" value={`${formatTime(start)} – ${formatTime(end)}`} />
      <Field label="Duration" value={`${end - start} ms`} />
    </>
  );
}

export function SelectionPanel() {
  const selectedInputs = useEditorStore((state) => state.selectedInputs);
  const selectedCursorRange = useEditorStore((state) => state.selectedCursorRange);
  const selectedObjectIndex = useEditorStore((state) => state.selectedBeatmapObjectIndex);
  const selectedObject = useEditorStore((state) =>
    selectedObjectIndex === null ? null : state.beatmapObjects[selectedObjectIndex],
  );
  const playhead = useEditorStore((state) => state.playheadMs);
  const tracks = useEditorStore((state) => state.tracks);
  const clipboard = useEditorStore((state) => state.inputClipboard);
  const message = useEditorStore((state) => state.lastEditMessage);
  const commitInputEdits = useEditorStore((state) => state.commitInputEdits);
  const nudgeSelectedInput = useEditorStore((state) => state.nudgeSelectedInput);
  const deleteSelectedInput = useEditorStore((state) => state.deleteSelectedInput);
  const copySelectedInputs = useEditorStore((state) => state.copySelectedInputs);
  const pasteInputs = useEditorStore((state) => state.pasteInputs);
  const cutInputAt = useEditorStore((state) => state.cutInputAt);
  const addInputAtPlayhead = useEditorStore((state) => state.addInputAtPlayhead);
  const interpolateCursorRange = useEditorStore((state) => state.interpolateCursorRange);
  const smoothCursorRange = useEditorStore((state) => state.smoothCursorRange);
  const [customShift, setCustomShift] = useState('17');

  const firstInput = selectedInputs[0] ?? null;
  const inputStart = selectedInputs.length ? Math.min(...selectedInputs.map((item) => item.startTime)) : 0;
  const inputEnd = selectedInputs.length ? Math.max(...selectedInputs.map((item) => item.endTime)) : 0;
  const inputTracks = [
    ...new Set(
      selectedInputs.map((item) => tracks.find((track) => track.id === item.trackId)?.name ?? 'Unknown replay'),
    ),
  ];
  const cursorTrack = tracks.find((track) => track.id === selectedCursorRange?.trackId);
  const cursorFrames =
    selectedCursorRange && cursorTrack
      ? cursorTrack.replay.frames.filter(
          (frame) => frame.timeMs >= selectedCursorRange.startMs && frame.timeMs <= selectedCursorRange.endMs,
        )
      : [];
  const changeInputKey = (key: InputKey) =>
    commitInputEdits(selectedInputs.map((original) => ({ original, next: { ...original, key } })));
  const applyShift = (amount: number) => {
    if (Number.isFinite(amount) && amount !== 0) nudgeSelectedInput(Math.round(amount));
  };

  return (
    <section className="panel selection-panel">
      <div className="panel-title">
        <span>
          Selection
          <InfoTip text="Select input events, Alt+drag across Cursor X/Y for a time range, or pick a hit object. Cursor coordinates are read only here — edit nodes on the playfield." />
        </span>
        <PanelCloseButton panel="selection" />
      </div>
      <div className="selection-body">
        {selectedInputs.length > 0 && (
          <>
            <div className="selection-summary">
              <strong>
                {selectedInputs.length} input event{selectedInputs.length === 1 ? '' : 's'} selected
              </strong>
              <span>{inputTracks.join(', ')}</span>
            </div>
            <RangeSummary start={inputStart} end={inputEnd} />
            <div className="selection-group-title">Input</div>
            <label className="selection-control">
              <span>Type</span>
              <select
                value={firstInput?.key ?? 'M1'}
                onChange={(event) => changeInputKey(event.target.value as InputKey)}
              >
                {inputKeys.map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
            {selectedInputs.length === 1 && firstInput && (
              <>
                <label className="selection-control">
                  <span>Start</span>
                  <input
                    key={`start-${firstInput.startTime}`}
                    type="number"
                    defaultValue={firstInput.startTime}
                    onBlur={(event) =>
                      commitInputEdits([
                        {
                          original: firstInput,
                          next: {
                            ...firstInput,
                            startTime: Math.min(Number(event.target.value), firstInput.endTime - 1),
                          },
                        },
                      ])
                    }
                  />
                </label>
                <label className="selection-control">
                  <span>End</span>
                  <input
                    key={`end-${firstInput.endTime}`}
                    type="number"
                    defaultValue={firstInput.endTime}
                    onBlur={(event) =>
                      commitInputEdits([
                        {
                          original: firstInput,
                          next: {
                            ...firstInput,
                            endTime: Math.max(Number(event.target.value), firstInput.startTime + 1),
                          },
                        },
                      ])
                    }
                  />
                </label>
              </>
            )}
            <div className="selection-group-title">Timing</div>
            <div className="shift-grid">
              {shiftSteps.map((ms) => (
                <button key={ms} onClick={() => applyShift(ms)}>
                  {ms > 0 ? '+' : ''}
                  {ms} ms
                </button>
              ))}
            </div>
            <form
              className="custom-shift"
              onSubmit={(event) => {
                event.preventDefault();
                applyShift(Number(customShift));
              }}
            >
              <label>
                Custom{' '}
                <input
                  aria-label="Custom selection shift"
                  type="number"
                  value={customShift}
                  onChange={(event) => setCustomShift(event.target.value)}
                />{' '}
                ms
              </label>
              <button type="submit">Apply</button>
            </form>
            <div className="selection-group-title">Transform</div>
            <div className="selection-actions">
              <button
                disabled={
                  selectedInputs.length !== 1 ||
                  !firstInput ||
                  playhead <= firstInput.startTime ||
                  playhead >= firstInput.endTime
                }
                onClick={() => firstInput && cutInputAt(firstInput.trackId, firstInput.key, playhead)}
              >
                <Scissors size={13} /> Split
              </button>
              <button onClick={copySelectedInputs}>
                <Copy size={13} /> Copy
              </button>
              <button className="danger" onClick={deleteSelectedInput}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}

        {!selectedInputs.length && selectedCursorRange && cursorTrack && (
          <>
            <div className="selection-summary">
              <strong>{cursorFrames.length} cursor frames selected</strong>
              <span>{cursorTrack.name}</span>
            </div>
            <RangeSummary start={selectedCursorRange.startMs} end={selectedCursorRange.endMs} />
            <Field
              label="Start X / Y"
              value={
                cursorFrames.length
                  ? `${cursorFrames[0].x.toFixed(1)} / ${cursorFrames[0].y.toFixed(1)}`
                  : 'interpolated'
              }
            />
            <Field
              label="End X / Y"
              value={
                cursorFrames.length
                  ? `${cursorFrames.at(-1)!.x.toFixed(1)} / ${cursorFrames.at(-1)!.y.toFixed(1)}`
                  : 'interpolated'
              }
            />
            <div className="selection-group-title">Transform</div>
            <div className="selection-actions">
              <button
                disabled={cursorTrack.locked || cursorFrames.length < 3}
                onClick={() =>
                  smoothCursorRange(cursorTrack.id, selectedCursorRange.startMs, selectedCursorRange.endMs)
                }
              >
                <Sparkles size={13} /> Smooth
              </button>
              <button
                disabled={cursorTrack.locked}
                onClick={() =>
                  interpolateCursorRange(cursorTrack.id, selectedCursorRange.startMs, selectedCursorRange.endMs)
                }
              >
                Interpolate
              </button>
              <button onClick={copySelectedInputs}>
                <Copy size={13} /> Copy
              </button>
            </div>
          </>
        )}

        {!selectedInputs.length && !selectedCursorRange && selectedObject && (
          <>
            <div className="selection-summary">
              <strong>
                {selectedObject.kind} #{selectedObjectIndex! + 1}
              </strong>
              <span>Beatmap object · read only</span>
            </div>
            <Field label="Time" value={`${formatTime(selectedObject.startTime)} (${selectedObject.startTime} ms)`} />
            {selectedObject.endTime !== selectedObject.startTime && (
              <Field label="End" value={`${formatTime(selectedObject.endTime)} (${selectedObject.endTime} ms)`} />
            )}
            <Field label="Position" value={`${selectedObject.x.toFixed(0)} / ${selectedObject.y.toFixed(0)}`} />
            <Field label="Duration" value={`${selectedObject.endTime - selectedObject.startTime} ms`} />
          </>
        )}

        {!selectedInputs.length && !selectedCursorRange && !selectedObject && (
          <div className="selection-empty">
            <strong>Nothing selected</strong>
            <div className="selection-group-title">Quick actions</div>
            <div className="selection-actions">
              <button onClick={addInputAtPlayhead}>
                <Plus size={13} /> Input at playhead
              </button>
              <button disabled={!clipboard} onClick={() => pasteInputs(false)}>
                Paste
              </button>
            </div>
            <div className="shortcut-list">
              <span>
                <kbd>Ctrl C</kbd> Copy
              </span>
              <span>
                <kbd>Ctrl V</kbd> Paste
              </span>
              <span>
                <kbd>Delete</kbd> Remove
              </span>
              <span>
                <kbd>B</kbd> Blade tool
              </span>
            </div>
          </div>
        )}
        {message && <div className="tool-message">{message}</div>}
      </div>
    </section>
  );
}
