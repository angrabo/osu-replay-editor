import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { InfoTip } from './components/InfoTip';
import { sidecarRequest } from './sidecar';
import {
  simulationMetadataPatch,
  useEditorStore,
  type ImportedReplay,
  type SimulationResult,
  type Track,
} from './stores/editor';

type ModGroup = 'reduction' | 'increase' | 'automation' | 'other';

const modOptions: readonly (readonly [string, number, string, ModGroup])[] = [
  ['EZ', 2, 'Easy', 'reduction'],
  ['NF', 1, 'No Fail', 'reduction'],
  ['HT', 256, 'Half Time', 'reduction'],
  ['HR', 16, 'Hard Rock', 'increase'],
  ['SD', 32, 'Sudden Death', 'increase'],
  ['PF', 16384, 'Perfect', 'increase'],
  ['DT', 64, 'Double Time', 'increase'],
  ['NC', 512, 'Nightcore', 'increase'],
  ['HD', 8, 'Hidden', 'increase'],
  ['FL', 1024, 'Flashlight', 'increase'],
  ['FI', 1048576, 'Fade In', 'increase'],
  ['RX', 128, 'Relax', 'automation'],
  ['AP', 8192, 'Autopilot', 'automation'],
  ['SO', 4096, 'Spun Out', 'automation'],
  ['AT', 2048, 'Autoplay', 'automation'],
  ['CN', 4194304, 'Cinema', 'automation'],
  ['TP', 8388608, 'Target Practice', 'automation'],
  ['TD', 4, 'Touch Device', 'other'],
  ['SV2', 536870912, 'Score V2', 'other'],
  ['RD', 2097152, 'Random', 'other'],
  ['4K', 32768, '4 Keys', 'other'],
  ['5K', 65536, '5 Keys', 'other'],
  ['6K', 131072, '6 Keys', 'other'],
  ['7K', 262144, '7 Keys', 'other'],
  ['8K', 524288, '8 Keys', 'other'],
  ['9K', 16777216, '9 Keys', 'other'],
];

const modGroups: readonly (readonly [ModGroup, string])[] = [
  ['reduction', 'Difficulty reduction'],
  ['increase', 'Difficulty increase'],
  ['automation', 'Automation'],
  ['other', 'Other'],
];

const simulatedMods = [1, 2, 8, 16, 64, 256, 512, 1024, 4096];

function MetaCard({
  title,
  info,
  aside,
  collapsible = false,
  children,
}: {
  title: string;
  info?: string;
  aside?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className={`meta-card${open ? '' : ' collapsed'}`}>
      <header className="meta-card-head">
        {collapsible ? (
          <button type="button" className="meta-card-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {title}
          </button>
        ) : (
          <strong>{title}</strong>
        )}
        {info && <InfoTip text={info} />}
        {aside && <span className="meta-card-aside">{aside}</span>}
      </header>
      {open && <div className="meta-card-body">{children}</div>}
    </section>
  );
}

function TextEdit({
  label,
  value,
  onCommit,
  multiline = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
}) {
  const commit = (input: HTMLInputElement | HTMLTextAreaElement) => {
    if (input.value !== value) onCommit(input.value);
  };
  return (
    <label className="meta-field">
      <span>{label}</span>
      {multiline ? (
        <textarea key={`${label}-${value}`} defaultValue={value} onBlur={(event) => commit(event.currentTarget)} />
      ) : (
        <input
          key={`${label}-${value}`}
          type="text"
          defaultValue={value}
          title={value}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      )}
    </label>
  );
}

function WarningMark({
  label,
  actual,
  suggested,
}: {
  label: string;
  actual: number | boolean;
  suggested: number | boolean | null | undefined;
}) {
  if (suggested == null || actual === suggested) return null;
  return (
    <span
      className="metadata-score-warning"
      role="img"
      aria-label={`${label} differs from simulation`}
      title={`${label}: replay metadata ${String(actual)}, simulation ${String(suggested)}. Simulation is an estimate.`}
    >
      <AlertTriangle size={13} />
    </span>
  );
}

function NumberEdit({
  label,
  value,
  min = 0,
  max = 2147483647,
  suggested,
  onCommit,
  className = '',
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suggested?: number | null;
  onCommit: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={`meta-field ${className}`}>
      <span>{label}</span>
      <div className="metadata-score-input">
        <input
          key={`${label}-${value}`}
          type="number"
          min={min}
          max={max}
          step="1"
          defaultValue={value}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isSafeInteger(next) && next >= min && next <= max && next !== value) onCommit(next);
            else event.currentTarget.value = String(value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <WarningMark label={label} actual={value} suggested={suggested} />
      </div>
    </label>
  );
}

const judgementLabels = [
  ['300', 'j300'],
  ['100', 'j100'],
  ['50', 'j50'],
  ['Geki', 'jgeki'],
  ['Katu', 'jkatu'],
  ['Miss', 'jmiss'],
] as const;

export function ReplayMetadataEditor({
  track,
  simulation,
  section,
}: {
  track: Track | undefined;
  simulation: SimulationResult | null | undefined;
  section: 'mods' | 'metadata';
}) {
  const setMetadata = useEditorStore((state) => state.setTrackMetadata);
  const [exportName, setExportName] = useState('');
  const [exportState, setExportState] = useState('');
  if (!track)
    return (
      <p className="sample-note">
        No replay
        <InfoTip text="Import a replay and choose its preview track." />
      </p>
    );
  const metadata = track.exportMetadata;
  const update = (patch: Partial<ImportedReplay['metadata']>, autoScore?: boolean) =>
    setMetadata(track.id, patch, autoScore);
  const count = (index: number) => metadata.hitCounts?.[index] ?? 0;
  const updateCount = (index: number, value: number) => {
    const hitCounts = [...(metadata.hitCounts ?? [0, 0, 0, 0, 0, 0])];
    hitCounts[index] = value;
    update({ hitCounts }, false);
  };
  const changeMod = (bit: number) => {
    let mods = metadata.mods ^ bit;
    if (bit === 512) mods = mods & 512 ? mods | 64 : mods & ~64;
    if (bit === 16384) mods = mods & 16384 ? mods | 32 : mods & ~32;
    if (bit === 64 && !(mods & 64)) mods &= ~512;
    if (bit === 32 && !(mods & 32)) mods &= ~16384;
    if (mods & bit) {
      if (bit === 2) mods &= ~16;
      if (bit === 16) mods &= ~2;
      if (bit === 64 || bit === 512) mods &= ~256;
      if (bit === 256) mods &= ~(64 | 512);
      if (bit === 32 || bit === 16384) mods &= ~1;
      if (bit === 1) mods &= ~(32 | 16384);
    }
    update({ mods }, true);
  };
  const exportReplay = async () => {
    setExportState('Exporting…');
    try {
      const result = await sidecarRequest<{ path: string }>('/api/replays/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: exportName || track.replay.filename,
          metadata: {
            ...metadata,
            hitCounts: metadata.hitCounts ?? [0, 0, 0, 0, 0, 0],
            maxCombo: metadata.maxCombo ?? 0,
            perfect: metadata.perfect ?? false,
            lifeGraph: metadata.lifeGraph ?? '',
            targetPracticeAccuracy: metadata.targetPracticeAccuracy ?? null,
            rngSeed: metadata.rngSeed ?? null,
            lazerScoreInfo: metadata.lazerScoreInfo ?? null,
          },
          frames: track.replay.frames,
        }),
      });
      setExportState(`Saved: ${result.path}`);
    } catch (error) {
      setExportState((error as Error).message);
    }
  };

  if (section === 'mods') {
    const active = modOptions.filter(([, bit]) => (metadata.mods & bit) !== 0);
    return (
      <div className="meta-stack">
        <MetaCard
          title="Active mods"
          info="Changing mods reruns the whole replay simulation and adopts its score. Mods without a simulated effect stay estimates."
        >
          <div className="mod-summary">
            {active.length ? (
              active.map(([name, , fullName, group]) => (
                <span key={name} className={`mod-chip small ${group} active`} title={fullName}>
                  {name}
                </span>
              ))
            ) : (
              <span className="mod-summary-empty">No mods</span>
            )}
            <label className="mod-bitmask" title="Raw mods bitmask">
              <span>#</span>
              <input
                key={`mods-${metadata.mods}`}
                type="number"
                min="0"
                max="2147483647"
                defaultValue={metadata.mods}
                onBlur={(event) => {
                  const mods = Number(event.currentTarget.value);
                  if (Number.isSafeInteger(mods) && mods >= 0 && mods !== metadata.mods) update({ mods }, true);
                  else event.currentTarget.value = String(metadata.mods);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
          </div>
        </MetaCard>
        {modGroups.map(([group, groupLabel]) => (
          <MetaCard key={group} title={groupLabel} collapsible={group === 'other'}>
            <div className="mod-chip-grid">
              {modOptions
                .filter((option) => option[3] === group)
                .map(([name, bit, fullName]) => {
                  const on = (metadata.mods & bit) !== 0;
                  return (
                    <button
                      key={bit}
                      type="button"
                      className={`mod-chip ${group}${on ? ' active' : ''}`}
                      title={
                        simulatedMods.includes(bit)
                          ? `${fullName}: simulated`
                          : `${fullName}: stored in the replay, gameplay effect not simulated`
                      }
                      disabled={name === 'SV2' && metadata.version >= 30000000}
                      aria-pressed={on}
                      onClick={() => changeMod(bit)}
                    >
                      <b>{name}</b>
                      <small>{fullName}</small>
                    </button>
                  );
                })}
            </div>
          </MetaCard>
        ))}
      </div>
    );
  }

  const wholeSimulation = simulation?.scope === 'whole-replay' ? simulation : null;
  const suggested = wholeSimulation?.score ?? null;
  const scoreMismatch = suggested !== null && suggested !== metadata.score;
  const waitingForAutoScore = track.autoScore && suggested === null;
  const simulatedCounts = wholeSimulation
    ? [
        wholeSimulation.count300,
        wholeSimulation.count100,
        wholeSimulation.count50,
        wholeSimulation.countGeki,
        wholeSimulation.countKatu,
        wholeSimulation.misses,
      ]
    : [];
  const syncSimulation = () => {
    if (wholeSimulation) update(simulationMetadataPatch(wholeSimulation, metadata), true);
  };
  const totalHits = count(0) + count(1) + count(2) + count(5);
  const accuracy = totalHits ? ((count(0) * 300 + count(1) * 100 + count(2) * 50) / (totalHits * 300)) * 100 : null;

  return (
    <div className="meta-stack">
      <MetaCard
        title="Score"
        aside={
          <span
            className={`meta-status${track.autoScore ? ' auto' : ''}`}
            title={track.autoScore ? 'Score follows the simulation' : 'Metadata edited by hand'}
          >
            {track.autoScore ? 'Auto' : 'Manual'}
          </span>
        }
      >
        <TextEdit label="Player" value={metadata.playerName} onCommit={(playerName) => update({ playerName })} />
        <div className="meta-field">
          <span>Score</span>
          <div className="metadata-score-input">
            <input
              key={`score-${metadata.score}`}
              type="number"
              min="0"
              max="2147483647"
              step="1"
              defaultValue={metadata.score}
              onBlur={(event) => {
                const score = Number(event.currentTarget.value);
                if (Number.isSafeInteger(score) && score >= 0 && score <= 2147483647 && score !== metadata.score)
                  update({ score }, false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            {scoreMismatch && <WarningMark label="Score" actual={metadata.score} suggested={suggested} />}
            <button
              type="button"
              className="meta-icon-button"
              disabled={!wholeSimulation}
              title={
                suggested !== null
                  ? `Sync from simulation (score ${suggested.toLocaleString('en-US')})`
                  : 'Sync from simulation (waiting for a whole-replay simulation)'
              }
              aria-label="Sync from simulation"
              onClick={syncSimulation}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <div className="meta-grid">
          <NumberEdit
            label="Max combo"
            value={metadata.maxCombo ?? 0}
            suggested={wholeSimulation?.maxCombo}
            max={65535}
            onCommit={(maxCombo) => update({ maxCombo }, false)}
          />
          <label className="meta-field">
            <span>Perfect</span>
            <div className="metadata-score-input meta-check">
              <input
                type="checkbox"
                checked={metadata.perfect ?? false}
                onChange={(event) => update({ perfect: event.currentTarget.checked }, false)}
              />
              <WarningMark label="Perfect" actual={metadata.perfect ?? false} suggested={wholeSimulation?.perfect} />
            </div>
          </label>
        </div>
      </MetaCard>

      <MetaCard
        title="Judgements"
        aside={accuracy !== null ? <span className="meta-accuracy">{accuracy.toFixed(2)}%</span> : undefined}
      >
        <div className="judgement-grid">
          {judgementLabels.map(([label, tone], index) => (
            <NumberEdit
              key={label}
              className={`judgement-tile ${tone}`}
              label={label}
              value={count(index)}
              suggested={simulatedCounts[index]}
              max={65535}
              onCommit={(value) => updateCount(index, value)}
            />
          ))}
        </div>
      </MetaCard>

      <MetaCard
        title="Replay header"
        collapsible
        info="Beatmap title, artist and mapper live in the .osu map; this edits the .osr header. Replay hash and embedded lazer extras stay as imported until changed and may no longer describe edited data."
      >
        <div className="meta-grid">
          <div className="meta-field">
            <span>Mode</span>
            <div className="field-value">osu!standard</div>
          </div>
          <NumberEdit
            label="Version"
            value={metadata.version}
            min={1}
            onCommit={(version) => update({ version }, true)}
          />
          <TextEdit
            label="UTC ticks"
            value={metadata.timestampTicks}
            onCommit={(timestampTicks) => update({ timestampTicks })}
          />
          <TextEdit
            label="Online ID"
            value={metadata.onlineScoreId}
            onCommit={(onlineScoreId) => update({ onlineScoreId })}
          />
          <NumberEdit
            label="RNG seed"
            value={metadata.rngSeed ?? 0}
            min={-2147483648}
            onCommit={(rngSeed) => update({ rngSeed })}
          />
          <label className="meta-field">
            <span>Target acc.</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.0001"
              defaultValue={metadata.targetPracticeAccuracy ?? ''}
              onBlur={(event) => {
                const value = event.currentTarget.value === '' ? null : Number(event.currentTarget.value);
                if (value === null || (Number.isFinite(value) && value >= 0 && value <= 1))
                  update({ targetPracticeAccuracy: value });
              }}
            />
          </label>
        </div>
        <TextEdit
          label="Beatmap MD5"
          value={metadata.beatmapHash}
          onCommit={(beatmapHash) => update({ beatmapHash })}
        />
        <TextEdit label="Replay hash" value={metadata.replayHash} onCommit={(replayHash) => update({ replayHash })} />
        <TextEdit
          label="Life graph"
          value={metadata.lifeGraph ?? ''}
          onCommit={(lifeGraph) => update({ lifeGraph })}
          multiline
        />
        {metadata.version >= 30000001 && (
          <TextEdit
            label="Lazer extra (base64)"
            value={metadata.lazerScoreInfo ?? ''}
            onCommit={(lazerScoreInfo) => update({ lazerScoreInfo })}
            multiline
          />
        )}
      </MetaCard>

      <MetaCard
        title="Export"
        info={
          waitingForAutoScore
            ? 'Waiting for the whole-replay simulation. Enter a manual score if the map is unavailable.'
            : undefined
        }
      >
        <div className="meta-export-row">
          <input
            type="text"
            placeholder={track.replay.filename}
            value={exportName}
            aria-label="Export filename"
            onChange={(event) => setExportName(event.currentTarget.value)}
          />
          <button
            className="metadata-export-button"
            type="button"
            disabled={waitingForAutoScore}
            title="Export .osr to Downloads"
            onClick={() => void exportReplay()}
          >
            <Download size={14} /> Export
          </button>
        </div>
        {exportState && (
          <p className="sample-note" role="status">
            {exportState}
          </p>
        )}
      </MetaCard>
    </div>
  );
}
