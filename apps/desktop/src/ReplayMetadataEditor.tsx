import { useState } from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { sidecarRequest } from './sidecar';
import {
  simulationMetadataPatch,
  useEditorStore,
  type ImportedReplay,
  type SimulationResult,
  type Track,
} from './stores/editor';

const modOptions = [
  ['NF', 1],
  ['EZ', 2],
  ['TD', 4],
  ['HD', 8],
  ['HR', 16],
  ['SD', 32],
  ['DT', 64],
  ['RX', 128],
  ['HT', 256],
  ['NC', 512],
  ['FL', 1024],
  ['AT', 2048],
  ['SO', 4096],
  ['AP', 8192],
  ['PF', 16384],
  ['4K', 32768],
  ['5K', 65536],
  ['6K', 131072],
  ['7K', 262144],
  ['8K', 524288],
  ['FI', 1048576],
  ['RD', 2097152],
  ['CN', 4194304],
  ['TP', 8388608],
  ['9K', 16777216],
  ['SV2', 536870912],
] as const;

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
    <label className="field-row metadata-field">
      <span>{label}</span>
      {multiline ? (
        <textarea key={`${label}-${value}`} defaultValue={value} onBlur={(event) => commit(event.currentTarget)} />
      ) : (
        <input
          key={`${label}-${value}`}
          type="text"
          defaultValue={value}
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
      <AlertTriangle size={15} />
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
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suggested?: number | null;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="field-row metadata-field">
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
  if (!track) return <p className="sample-note">Import a replay and choose its preview track.</p>;
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
  if (section === 'mods')
    return (
      <>
        <h3>Replay mods</h3>
        <div className="mod-grid metadata-mod-grid">
          {modOptions.map(([name, bit]) => (
            <button
              key={bit}
              type="button"
              className={(metadata.mods & bit) !== 0 ? 'active' : ''}
              title={
                name === 'SV2'
                  ? 'Stable ScoreV2: normalized score model (estimate)'
                  : ([1, 2, 8, 16, 64, 256, 512, 1024, 4096] as number[]).includes(bit)
                    ? `${name}: supported by the score model`
                    : `${name}: stored in replay; its gameplay effect is not yet simulated`
              }
              disabled={name === 'SV2' && metadata.version >= 30000000}
              aria-pressed={(metadata.mods & bit) !== 0}
              onClick={() => changeMod(bit)}
            >
              {name}
            </button>
          ))}
        </div>
        <NumberEdit
          label="Bitmask"
          value={metadata.mods}
          max={2147483647}
          onCommit={(mods) => update({ mods }, true)}
        />
        <p className="sample-note">
          Changing mods reruns the whole replay simulation and adopts its score. Unsupported mod mechanics remain
          estimates.
        </p>
      </>
    );
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
  return (
    <>
      <h3>Replay metadata</h3>
      <TextEdit label="Player" value={metadata.playerName} onCommit={(playerName) => update({ playerName })} />
      <div className="field-row metadata-field metadata-score-row">
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
        </div>
      </div>
      <div className="metadata-score-actions">
        <button type="button" disabled={!wholeSimulation} onClick={syncSimulation}>
          <RefreshCw size={12} /> Sync from simulation
        </button>
        <small>
          {track.autoScore ? 'Auto sync on' : 'Manual metadata'}
          {suggested !== null ? ` · score ${suggested.toLocaleString('en-US')}` : ''}
        </small>
      </div>
      <NumberEdit
        label="Max combo"
        value={metadata.maxCombo ?? 0}
        suggested={wholeSimulation?.maxCombo}
        max={65535}
        onCommit={(maxCombo) => update({ maxCombo }, false)}
      />
      {(['300', '100', '50', 'Geki', 'Katu', 'Miss'] as const).map((label, index) => (
        <NumberEdit
          key={label}
          label={label}
          value={count(index)}
          suggested={simulatedCounts[index]}
          max={65535}
          onCommit={(value) => updateCount(index, value)}
        />
      ))}
      <label className="field-row metadata-field">
        <span>Perfect</span>
        <div className="metadata-score-input">
          <input
            type="checkbox"
            checked={metadata.perfect ?? false}
            onChange={(event) => update({ perfect: event.currentTarget.checked }, false)}
          />
          <WarningMark label="Perfect" actual={metadata.perfect ?? false} suggested={wholeSimulation?.perfect} />
        </div>
      </label>
      <h3>Replay header</h3>
      <div className="field-row">
        <span>Mode</span>
        <div className="field-value">0 · osu!standard</div>
      </div>
      <NumberEdit label="Version" value={metadata.version} min={1} onCommit={(version) => update({ version }, true)} />
      <TextEdit label="Beatmap MD5" value={metadata.beatmapHash} onCommit={(beatmapHash) => update({ beatmapHash })} />
      <TextEdit label="Replay hash" value={metadata.replayHash} onCommit={(replayHash) => update({ replayHash })} />
      <TextEdit
        label="Life graph"
        value={metadata.lifeGraph ?? ''}
        onCommit={(lifeGraph) => update({ lifeGraph })}
        multiline
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
      <label className="field-row metadata-field">
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
      {metadata.version >= 30000001 && (
        <TextEdit
          label="Lazer extra (base64)"
          value={metadata.lazerScoreInfo ?? ''}
          onCommit={(lazerScoreInfo) => update({ lazerScoreInfo })}
          multiline
        />
      )}
      <p className="sample-note">
        Beatmap title, artist and mapper live in the .osu map. This panel edits the .osr header. Replay hash and
        embedded lazer extras stay as imported until changed and may no longer describe edited data.
      </p>
      <h3>Export a copy</h3>
      <TextEdit label="Filename" value={exportName} onCommit={setExportName} />
      <button
        className="metadata-export-button"
        type="button"
        disabled={waitingForAutoScore}
        onClick={() => void exportReplay()}
      >
        <Download size={14} /> Export .osr to Downloads
      </button>
      {waitingForAutoScore && (
        <p className="sample-note">
          Waiting for whole replay simulation. Enter a manual score if the map is unavailable.
        </p>
      )}
      {exportState && (
        <p className="sample-note" role="status">
          {exportState}
        </p>
      )}
    </>
  );
}
