import { useState } from 'react';
import { AlertTriangle, Check, Download, Info } from 'lucide-react';
import { activeMods, isSimulated } from '../../mods';
import { sidecarRequest } from '../../sidecar';
import { useEditorStore, type SimulationResult, type Track } from '../../stores/editor';
import { InfoTip } from '../InfoTip';
import { Spinner } from '../common/Loading';
import { ClientSwitch, trackClient, trackMods } from './ClientSwitch';

type Note = { tone: 'ok' | 'info' | 'warning' | 'blocked'; text: string };

/// Export tab: pick the game the replay is for, see what will be written and anything that
/// stands in the way, and save the .osr to Downloads.
export function ExportPanel({
  track,
  simulation,
}: {
  track: Track | undefined;
  simulation: SimulationResult | null | undefined;
}) {
  const stale = useEditorStore((state) => {
    const run = track ? state.simulationByTrack[track.id] : undefined;
    return !!run && (!!run.stale || run.status === 'running');
  });
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ busy?: boolean; saved?: string; error?: string }>({});
  if (!track)
    return (
      <p className="sample-note">
        No replay
        <InfoTip text="Import a replay and choose its preview track." />
      </p>
    );
  const metadata = track.exportMetadata;
  const client = trackClient(track);
  const selection = trackMods(track);
  const mods = activeMods(selection);
  const whole = simulation?.scope === 'whole-replay' && !stale ? simulation : null;
  // A replay played on stable has no lazer score details; they are built from the simulation.
  const buildsScoreInfo = client === 'lazer' && !metadata.lazerScoreInfo;
  const unsimulated = mods.filter((mod) => !isSimulated(mod));

  const notes: Note[] = [];
  if (track.autoScore && !whole)
    notes.push({ tone: 'blocked', text: 'Waiting for the simulation to finish, so the score matches the replay.' });
  else if (buildsScoreInfo && !whole)
    notes.push({ tone: 'blocked', text: 'Lazer needs judgement counts from a whole-replay simulation. Run it first.' });
  if (buildsScoreInfo && whole)
    notes.push({
      tone: 'info',
      text: 'This replay was played on stable. Its lazer score details (judgement counts, rank) are built from the simulation.',
    });
  if (client === 'stable' && track.replay.metadata.version >= 30000000)
    notes.push({
      tone: 'info',
      text: 'This replay was played on lazer. It is judged and scored again by stable rules, including notelock.',
    });
  if (unsimulated.length)
    notes.push({
      tone: 'warning',
      text: `${unsimulated.map((mod) => mod.acronym).join(', ')} ${unsimulated.length === 1 ? 'is' : 'are'} saved in the replay but not simulated, so the score may differ in game.`,
    });
  if (!track.autoScore)
    notes.push({ tone: 'warning', text: 'Score and counts were edited by hand and are exported as entered.' });
  if (whole?.status === 'verified' && !track.edited)
    notes.push({ tone: 'ok', text: 'The simulation matches the recorded replay.' });
  const blocked = notes.some((note) => note.tone === 'blocked');

  const exportReplay = async () => {
    setStatus({ busy: true });
    try {
      const result = await sidecarRequest<{ path: string }>('/api/replays/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: name || track.replay.filename,
          metadata: {
            ...metadata,
            hitCounts: metadata.hitCounts ?? [0, 0, 0, 0, 0, 0],
            maxCombo: metadata.maxCombo ?? 0,
            perfect: metadata.perfect ?? false,
            lifeGraph: metadata.lifeGraph ?? '',
            targetPracticeAccuracy: metadata.targetPracticeAccuracy ?? null,
            rngSeed: metadata.rngSeed ?? null,
            lazerScoreInfo: metadata.lazerScoreInfo ?? null,
            lazerMods: client === 'lazer' ? selection.lazerMods : [],
            lazerStatistics:
              buildsScoreInfo && whole
                ? {
                    great: whole.count300,
                    ok: whole.count100,
                    meh: whole.count50,
                    miss: whole.misses,
                    largeTickHit: whole.sliderTicksHit,
                    largeTickTotal: whole.sliderTicksTotal,
                    sliderTailHit: whole.sliderEndsHit,
                    sliderTailTotal: whole.sliderEndsTotal,
                    smallBonus: whole.spinnerSpinsHit,
                    smallBonusTotal: whole.spinnerSpinsTotal,
                    largeBonus: whole.spinnerBonusHit,
                    largeBonusTotal: whole.spinnerBonusTotal,
                  }
                : null,
          },
          frames: track.replay.frames,
        }),
      });
      setStatus({ saved: result.path });
    } catch (error) {
      setStatus({ error: (error as Error).message });
    }
  };

  return (
    <div className="export-panel">
      <section className="export-block">
        <h4>
          Export for
          <InfoTip text="The game this replay is made for. It sets the rules the simulation judges and scores by, the mods on offer and the file format. Switching reruns the simulation." />
        </h4>
        <ClientSwitch track={track} />
      </section>

      <section className="export-block">
        <h4>Replay</h4>
        <dl className="export-summary">
          <dt>Player</dt>
          <dd>{metadata.playerName}</dd>
          <dt>Mods</dt>
          <dd>
            {mods.length ? (
              mods.map((mod) => (
                <span key={mod.acronym} className={`mod-tag static ${mod.group}`} title={mod.name}>
                  {mod.acronym}
                </span>
              ))
            ) : (
              <span className="mods-none">No mods</span>
            )}
          </dd>
          <dt>Score</dt>
          <dd>
            {metadata.score.toLocaleString('en-US')}
            <small>{track.autoScore ? 'from simulation' : 'manual'}</small>
          </dd>
          <dt>Format</dt>
          <dd>
            {client === 'lazer' ? 'osu!lazer' : 'osu!stable'}
            <small>version {metadata.version}</small>
          </dd>
        </dl>
      </section>

      {notes.length > 0 && (
        <ul className="export-notes">
          {notes.map((note) => (
            <li key={note.text} className={note.tone}>
              {note.tone === 'ok' ? (
                <Check size={12} />
              ) : note.tone === 'info' ? (
                <Info size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="export-block">
        <h4>File</h4>
        <input
          className="export-name"
          type="text"
          placeholder={track.replay.filename}
          value={name}
          aria-label="Export filename"
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <button
          className="export-button"
          type="button"
          disabled={blocked || status.busy}
          title="Save the .osr to Downloads"
          onClick={() => void exportReplay()}
        >
          {status.busy ? <Spinner size={12} /> : <Download size={14} />}
          Export .osr for {client === 'lazer' ? 'lazer' : 'stable'}
        </button>
        {status.saved && (
          <p className="export-result" role="status">
            Saved to <code>{status.saved}</code>
          </p>
        )}
        {status.error && (
          <p className="export-result error" role="alert">
            {status.error}
          </p>
        )}
      </section>
    </div>
  );
}
