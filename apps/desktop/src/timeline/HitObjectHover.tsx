import type { SliderBreak } from '@ore/beatmap-viewer';
import type { BeatmapTimelineObject, HitWindows, SimulationJudgement } from '../stores/editor';
import type { MissCause } from '../missAnalysis';

const resultColour = { '300': '#7fc0ff', '100': '#59d98e', '50': '#f29a4a', miss: '#ff6575' } as const;

function signedMs(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}

/// Hit-error bar for one hit: the 50/100/300 windows around the object time, with a marker where
/// the press actually landed (left = early, right = late).
export function HitErrorBar({ windows, hitError }: { windows: HitWindows; hitError: number | null }) {
  const span = windows.meh;
  const percent = (value: number) => 50 + (Math.max(-span, Math.min(span, value)) / span) * 50;
  const zone = (half: number, colour: string) => (
    <i style={{ left: `${percent(-half)}%`, width: `${percent(half) - percent(-half)}%`, background: colour }} />
  );
  return (
    <div className="hit-error-bar">
      <div className="hit-error-track">
        {zone(windows.meh, '#f29a4a')}
        {zone(windows.ok, '#59d98e')}
        {zone(windows.great, '#7fc0ff')}
        <b className="hit-error-centre" />
        {hitError !== null && <b className="hit-error-marker" style={{ left: `${percent(hitError)}%` }} />}
      </div>
      <div className="hit-error-scale">
        <em>early</em>
        <em>
          ±{Math.round(windows.great)} / {Math.round(windows.ok)} / {Math.round(windows.meh)} ms
        </em>
        <em>late</em>
      </div>
    </div>
  );
}

/// Where the cursor was, relative to the circle, when it mattered: the hit (one dot in the
/// result's colour) or, for a miss, the nearby presses / the cursor at the object's time.
export type AimInfo = {
  radius: number;
  points: { dx: number; dy: number; kind: 'hit' | 'press' | 'cursor' }[];
  result: SimulationJudgement['result'] | null;
};

function AimTarget({ aim }: { aim: AimInfo }) {
  const size = 76;
  const farthest = Math.max(aim.radius, ...aim.points.map((point) => Math.hypot(point.dx, point.dy)));
  // Keep the circle large, but zoom out enough for far-off clicks.
  const scale = (size / 2 - 5) / Math.max(aim.radius * 1.35, farthest * 1.1);
  const centre = size / 2;
  const colour = aim.result ? resultColour[aim.result] : '#aab6c3';
  const main = aim.points[0];
  const distance = main ? Math.hypot(main.dx, main.dy) : null;
  return (
    <div className="aim-target">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={centre} cy={centre} r={aim.radius * scale} fill="#ffffff0d" stroke={colour} strokeWidth="1.5" />
        <line x1={centre - 4} y1={centre} x2={centre + 4} y2={centre} stroke="#ffffff55" />
        <line x1={centre} y1={centre - 4} x2={centre} y2={centre + 4} stroke="#ffffff55" />
        {aim.points.map((point, index) => (
          <circle
            key={index}
            cx={centre + point.dx * scale}
            cy={centre + point.dy * scale}
            r={point.kind === 'cursor' ? 3 : 3.6}
            fill={point.kind === 'cursor' ? 'none' : point.kind === 'hit' ? colour : '#ff6575'}
            stroke={point.kind === 'cursor' ? '#c8d6e4' : '#0b1119'}
            strokeWidth="1.2"
          />
        ))}
      </svg>
      <span>
        {distance === null
          ? 'No cursor data'
          : `${Math.round(distance)} px from centre${distance > aim.radius ? ` · ${Math.round(distance - aim.radius)} px outside` : ''}`}
        <small>
          {main?.kind === 'hit'
            ? 'At the hit'
            : main?.kind === 'press'
              ? 'Presses near the object'
              : 'Cursor at the object time'}
        </small>
      </span>
    </div>
  );
}

export function HitObjectTooltip({
  object,
  index,
  judgement,
  sliderBreak,
  missCause,
  aim,
  windows,
  x,
  y,
}: {
  object: BeatmapTimelineObject;
  index: number;
  judgement: SimulationJudgement | null;
  sliderBreak?: SliderBreak | null;
  missCause?: MissCause | null;
  aim?: AimInfo | null;
  windows: HitWindows | null;
  x: number;
  y: number;
}) {
  const hit = judgement?.hitError != null ? judgement.hitError : null;
  return (
    <div className="input-drag-tooltip hit-object-tooltip" style={{ left: x, top: y }}>
      <strong>
        {object.kind} #{index + 1}
        {judgement && (
          <em className="hit-object-result" style={{ color: resultColour[judgement.result] }}>
            {judgement.result === 'miss' ? 'Miss' : judgement.result}
          </em>
        )}
      </strong>
      <span>Object at {Math.round(object.startTime)} ms</span>
      {judgement?.hitTime != null ? (
        <span>
          {judgement.key ?? 'Press'} at {Math.round(judgement.hitTime)} ms · {signedMs(hit ?? 0)}{' '}
          {hit === null || Math.round(hit) === 0 ? '' : hit < 0 ? 'early' : 'late'}
        </span>
      ) : (
        <span>{judgement ? 'No press judged for this object' : 'Run the simulation to see the hit'}</span>
      )}
      {missCause && (
        <span className="hit-object-break" title={missCause.detail}>
          Why: {missCause.summary}
        </span>
      )}
      {sliderBreak && (
        <span className="hit-object-break">
          {sliderBreak.missedChecks.length
            ? `Slider break · ${sliderBreak.missedChecks.length} check${sliderBreak.missedChecks.length === 1 ? '' : 's'} missed`
            : 'Lost tracking between checks (no break)'}
        </span>
      )}
      {aim && object.kind !== 'spinner' && <AimTarget aim={aim} />}
      {windows && object.kind !== 'spinner' && <HitErrorBar windows={windows} hitError={hit} />}
    </div>
  );
}
