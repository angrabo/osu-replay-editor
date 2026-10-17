import { replayPointAt } from '@ore/beatmap-viewer';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import {
  replayInputSegments,
  useEditorStore,
  type InputKey,
  type SimulationResult,
  type Track,
} from '../../stores/editor';
import {
  planTimingFix,
  type BlockReason,
  type FixHit,
  type FixPlan,
  type FixPress,
  type FixStats,
  type FixWindows,
} from '../../timingFix';
import { InfoTip } from '../InfoTip';

export const useTimingFixDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const SCORE_V2 = 1 << 29;

/// The hits the fix can work on: circles, plus slider heads where their timing counts (lazer and
/// ScoreV2), each with the press that judged it. Null when the simulation predates the data it needs.
function fixableHits(track: Track, simulation: SimulationResult): FixHit[] | null {
  const headsCount = simulation.client === 'lazer' || (track.exportMetadata.mods & SCORE_V2) !== 0;
  const segments = replayInputSegments(track);
  const hits: FixHit[] = [];
  for (const judgement of simulation.judgements) {
    if (judgement.hitTime == null || judgement.hitError == null || judgement.result === 'miss' || !judgement.key)
      continue;
    if (judgement.kind === 'spinner' || (judgement.kind === 'slider' && !headsCount)) continue;
    if (judgement.objectX === undefined || judgement.objectY === undefined) return null;
    const press = segments.find(
      (segment) => segment.key === judgement.key && segment.startTime === Math.round(judgement.hitTime!),
    );
    if (!press) continue;
    hits.push({
      objectIndex: judgement.objectIndex,
      kind: judgement.kind,
      objectTime: judgement.startTime,
      error: judgement.hitError,
      press: { key: press.key, startTime: press.startTime, endTime: press.endTime },
      center: { x: judgement.objectX, y: judgement.objectY },
    });
  }
  return hits;
}

function Histogram({ plan, windows }: { plan: FixPlan; windows: FixWindows }) {
  const width = 360;
  const height = 90;
  const range = Math.ceil(windows.ok + 8);
  const binSize = 2;
  const bins = Math.ceil((range * 2) / binSize);
  const count = (errors: number[]) => {
    const result = new Array<number>(bins).fill(0);
    for (const error of errors) {
      const bin = Math.floor((error + range) / binSize);
      if (bin >= 0 && bin < bins) result[bin]++;
    }
    return result;
  };
  const before = count(plan.errorsBefore);
  const after = count(plan.errorsAfter);
  const top = Math.max(1, ...before, ...after);
  const x = (error: number) => ((error + range) / (range * 2)) * width;
  const barWidth = width / bins;
  return (
    <svg
      className="timing-fix-histogram"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Hit errors before and after"
    >
      {[-windows.great, windows.great].map((edge) => (
        <line key={`great${edge}`} x1={x(edge)} x2={x(edge)} y1={0} y2={height} className="edge great" />
      ))}
      {[-windows.ok, windows.ok].map((edge) => (
        <line key={`ok${edge}`} x1={x(edge)} x2={x(edge)} y1={0} y2={height} className="edge ok" />
      ))}
      <line x1={x(0)} x2={x(0)} y1={0} y2={height} className="edge zero" />
      {before.map((value, bin) => (
        <rect
          key={`b${bin}`}
          className="before"
          x={bin * barWidth}
          y={height - (value / top) * (height - 4)}
          width={Math.max(1, barWidth - 0.5)}
          height={(value / top) * (height - 4)}
        />
      ))}
      <polyline
        className="after"
        points={after
          .map((value, bin) => `${bin * barWidth + barWidth / 2},${height - (value / top) * (height - 4)}`)
          .join(' ')}
      />
    </svg>
  );
}

const blockReasons: Record<BlockReason, string> = {
  cursor: 'cursor not on the circle with the room asked for',
  press: 'runs into another press of the key',
  order: "would pass a neighbouring object's hit",
  window: 'would leave the hit window',
};
const blockedText = (plan: FixPlan) =>
  (Object.entries(plan.blockedBy) as [BlockReason, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${blockReasons[reason]}`)
    .join(', ');

// The score's hit counts with the timed hits' change applied, so the table matches the simulation;
// mean and UR stay those of the timed hits.
const withScore = (stats: FixStats, before: FixStats, simulation: SimulationResult): FixStats => ({
  ...stats,
  great: simulation.count300 + stats.great - before.great,
  ok: simulation.count100 + stats.ok - before.ok,
  meh: simulation.count50 + stats.meh - before.meh,
});

const row = (label: string, stats: FixStats) => (
  <tr>
    <th>{label}</th>
    <td>{stats.great}</td>
    <td>{stats.ok}</td>
    <td>{stats.meh}</td>
    <td>{stats.mean.toFixed(1)}</td>
    <td>{stats.ur.toFixed(1)}</td>
  </tr>
);

/// Experimental: improve accuracy for showcase replays by nudging key presses, keeping the hit
/// errors natural (see timingFix). Changes only key presses, as one undoable edit.
export function TimingFixDialog() {
  const setOpen = useTimingFixDialog((state) => state.setOpen);
  const track = useEditorStore((state) => state.tracks.find((item) => item.id === state.previewTrackId));
  const run = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId] : undefined,
  );
  const radius = useEditorStore((state) => state.circleRadius);
  const commitInputEdits = useEditorStore((state) => state.commitInputEdits);
  const simulation = run?.result;
  const ready = !!simulation && !run?.stale && run?.status === 'ready' && simulation.scope === 'whole-replay';
  const windows = simulation?.windows ?? null;
  const hits = useMemo(
    () => (track && simulation && ready ? fixableHits(track, simulation) : null),
    [track, simulation, ready],
  );
  const currentOutside = useMemo(
    () => (hits && windows ? hits.filter((hit) => Math.abs(hit.error) >= windows.great).length : 0),
    [hits, windows],
  );
  // 100s and 50s the fix does not see: sliders judged by their ticks and ends, and hits whose
  // press could not be matched.
  const { otherOutside, unmatched } = useMemo(() => {
    const seen = new Set(hits?.map((hit) => hit.objectIndex));
    const rest = (simulation?.judgements ?? []).filter(
      (item) => (item.result === '100' || item.result === '50') && !seen.has(item.objectIndex),
    );
    return {
      otherOutside: rest.filter((item) => item.kind === 'slider').length,
      unmatched: rest.filter((item) => item.kind === 'circle').length,
    };
  }, [hits, simulation]);
  // The count the user sees and sets is the score's (every 100 and 50); the part the fix cannot
  // move stays as it is, so the timed hits aim at what is left.
  const scoreOutside = simulation ? simulation.count100 + simulation.count50 : 0;
  const fixedOutside = Math.max(0, scoreOutside - currentOutside);
  const [target, setTarget] = useState<number | null>(null);
  const [pull, setPull] = useState(50);
  const [leeway, setLeeway] = useState(3);
  const targetTotal = Math.max(fixedOutside, Math.min(scoreOutside, target ?? scoreOutside));
  const target100s = targetTotal - fixedOutside;

  const plan = useMemo(() => {
    if (!track || !simulation || !hits || !windows || radius === null) return null;
    const presses: Partial<Record<InputKey, FixPress[]>> = {};
    for (const segment of replayInputSegments(track))
      (presses[segment.key] ??= []).push({ key: segment.key, startTime: segment.startTime, endTime: segment.endTime });
    return planTimingFix(hits, {
      windows,
      radius,
      leewayPx: leeway,
      target100s,
      closeCallPull: pull / 100,
      closeCallFrom: 0.7,
      cursorAt: (time) => replayPointAt(track.replay.frames, time),
      presses,
      anchors: simulation.judgements
        .filter((judgement) => judgement.hitTime != null)
        .map((judgement) => ({ objectIndex: judgement.objectIndex, time: judgement.hitTime! })),
    });
  }, [track, simulation, hits, windows, radius, leeway, target100s, pull]);

  const apply = () => {
    if (!track || !plan?.moves.length) return;
    commitInputEdits(
      plan.moves.map((move) => ({
        original: { trackId: track.id, ...move.from },
        next: { trackId: track.id, ...move.to },
      })),
    );
    useEditorStore.setState({
      lastEditMessage: `Timing fix: moved ${plan.moves.length} press${plan.moves.length === 1 ? '' : 'es'} on ${track.name}.`,
    });
    setOpen(false);
  };

  const problem = !track
    ? 'Choose a replay first.'
    : track.locked
      ? 'The replay is locked.'
      : !ready
        ? run?.partial && run.status === 'ready'
          ? 'Only part of the replay was simulated after the last edit. Run the whole replay from the simulation readout.'
          : 'Waiting for a whole-replay simulation of the current replay.'
        : !windows || hits === null
          ? 'This simulation is from an older engine. Change anything to simulate again.'
          : radius === null
            ? 'Waiting for the beatmap.'
            : hits.length < 8
              ? 'Not enough hits to work with.'
              : null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="auth-modal timing-fix-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2>Fix timing (experimental)</h2>
          <button aria-label="Close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <p className="timing-fix-intro">
          Moves key presses so close calls land nearer the centre of the 300 window and the 100s drop to the count you
          choose. Hit errors are kept natural: they follow a normal curve around the player's own average, in the same
          early/late order, without piling up at the window edge. Only key presses change, never the cursor.
        </p>
        {problem ? (
          <p className="sample-note">{problem}</p>
        ) : (
          plan &&
          windows && (
            <>
              <div className="timing-fix-controls">
                <label>
                  <span>
                    100s to keep
                    <InfoTip text="100s and 50s in the score after the fix, as in the simulation. Those not decided by press timing (slider ticks and ends) set the lowest value. It is reached only as far as the cursor and the neighbouring presses leave room." />
                  </span>
                  <input
                    type="number"
                    min={fixedOutside}
                    max={scoreOutside}
                    value={targetTotal}
                    onChange={(event) => setTarget(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                  />
                  <small>
                    now {scoreOutside}
                    {fixedOutside > 0 && ` · min ${fixedOutside}`}
                  </small>
                </label>
                <label>
                  <span>
                    Close-call pull
                    <InfoTip text="How far 300s near the window edge move toward their natural place: 0 leaves them, 100 moves them all the way." />
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pull}
                    onChange={(event) => setPull(Number(event.target.value))}
                  />
                  <small>{pull}%</small>
                </label>
                <label>
                  <span>
                    Room on the circle
                    <InfoTip text="A press only moves where the cursor stays at least this far inside the circle at the new time." />
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={leeway}
                    onChange={(event) => setLeeway(Math.max(0, Math.min(20, Number(event.target.value) || 0)))}
                  />
                  <small>px</small>
                </label>
              </div>
              <Histogram plan={plan} windows={windows} />
              <table className="timing-fix-stats">
                <thead>
                  <tr>
                    <th />
                    <th>300</th>
                    <th>100</th>
                    <th>50</th>
                    <th>Mean ms</th>
                    <th>UR</th>
                  </tr>
                </thead>
                <tbody>
                  {row('Before', withScore(plan.before, plan.before, simulation!))}
                  {row('After', withScore(plan.after, plan.before, simulation!))}
                </tbody>
              </table>
              <p className="timing-fix-summary">
                {plan.moves.length} press{plan.moves.length === 1 ? '' : 'es'} move
                {plan.blocked ? ` · ${plan.blocked} could not (${blockedText(plan)})` : ''}. Counts cover {hits!.length}{' '}
                timed hits; the simulation runs again after applying.
                {otherOutside > 0 &&
                  ` The other ${otherOutside} 100${otherOutside === 1 ? '' : 's'}/50s in the score ${otherOutside === 1 ? 'is a slider' : 'are sliders'} judged by ticks and ends, not by press timing, so this cannot change ${otherOutside === 1 ? 'it' : 'them'}.`}
                {unmatched > 0 &&
                  ` ${unmatched} circle 100${unmatched === 1 ? '' : 's'} could not be matched to ${unmatched === 1 ? 'its' : 'their'} press and ${unmatched === 1 ? 'is' : 'are'} left as ${unmatched === 1 ? 'it is' : 'they are'}.`}
                {targetTotal >= scoreOutside &&
                  currentOutside > 0 &&
                  ' Lower "100s to keep" to bring 100s into the 300 window; at the current count only close calls move.'}
              </p>
            </>
          )
        )}
        <div className="timing-fix-actions">
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!!problem || !plan?.moves.length} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
