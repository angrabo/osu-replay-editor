import { useRef, useState } from 'react';
import { InfoTip } from '../InfoTip';
import { logicalKeys, type ReplayFrame } from '../../stores/editor';

export function CursorTimingControl({
  frame,
  before,
  after,
  locked,
  onCommit,
}: {
  frame: ReplayFrame;
  before?: ReplayFrame;
  after?: ReplayFrame;
  locked: boolean;
  onCommit: (timeMs: number) => void;
}) {
  const [draft, setDraft] = useState(frame.timeMs);
  const committed = useRef(false);
  const min = before ? before.timeMs + 1 : frame.timeMs;
  const max = after ? after.timeMs - 1 : frame.timeMs;
  const editable = !locked && !!before && !!after && logicalKeys(before.keys) === logicalKeys(frame.keys) && min <= max;
  const clampDraft = (value: number) => Math.max(min, Math.min(max, Math.round(value)));
  const commit = () => {
    if (committed.current || !editable) return;
    committed.current = true;
    if (draft !== frame.timeMs) onCommit(clampDraft(draft));
  };
  const speed = (
    first: ReplayFrame | undefined,
    second: ReplayFrame | undefined,
    firstTime: number,
    secondTime: number,
  ) =>
    first && second && secondTime > firstTime
      ? `${((Math.hypot(second.x - first.x, second.y - first.y) * 1000) / (secondTime - firstTime)).toFixed(1)} u/s`
      : '—';
  return (
    <div className="cursor-timing-control">
      <div className="field-row">
        <span>
          Frame time
          <InfoTip text="Retime an interior cursor frame. Input transition times stay on the input timeline." />
        </span>
        <input
          className="field-value cursor-coordinate"
          aria-label="Cursor frame time in milliseconds"
          type="number"
          min={min}
          max={max}
          step="1"
          value={draft}
          disabled={!editable}
          onChange={(event) => {
            committed.current = false;
            setDraft(Number(event.target.value));
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      {editable && (
        <input
          className="cursor-timing-slider"
          aria-label="Cursor frame timing"
          type="range"
          min={min}
          max={max}
          step="1"
          value={clampDraft(draft)}
          onChange={(event) => {
            committed.current = false;
            setDraft(Number(event.target.value));
          }}
          onPointerUp={commit}
          onKeyUp={(event) => {
            if (event.key.startsWith('Arrow')) commit();
          }}
          onBlur={commit}
        />
      )}
      <div className="cursor-segment-speed">
        <span>Before {speed(before, frame, before?.timeMs ?? 0, draft)}</span>
        <span>After {speed(frame, after, draft, after?.timeMs ?? 0)}</span>
      </div>
    </div>
  );
}
