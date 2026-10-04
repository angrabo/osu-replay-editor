import {
  LAZER_VERSION,
  STABLE_VERSION,
  clientBlocker,
  isLazerVersion,
  type Client,
  type ModSelection,
} from '../../mods';
import { useEditorStore, type Track } from '../../stores/editor';

export const trackClient = (track: Track): Client =>
  isLazerVersion(track.exportMetadata.version) ? 'lazer' : 'stable';
export const trackMods = (track: Track): ModSelection => ({
  mods: track.exportMetadata.mods,
  lazerMods: track.exportMetadata.lazerMods ?? [],
});

/// Which game the replay is made for. It decides the rules the simulation judges and scores by,
/// the mods on offer and the file the export writes, so switching reruns the simulation. A side
/// is locked while a mod that only exists on the other one is on.
export function ClientSwitch({ track }: { track: Track }) {
  const setMetadata = useEditorStore((state) => state.setTrackMetadata);
  const current = trackClient(track);
  const selection = trackMods(track);
  const choose = (client: Client) => {
    if (client === current) return;
    // Going back to the client the replay was played on restores its own format version.
    const original = track.replay.metadata.version;
    const version =
      isLazerVersion(original) === (client === 'lazer')
        ? original
        : client === 'lazer'
          ? LAZER_VERSION
          : STABLE_VERSION;
    setMetadata(track.id, { version }, true);
  };
  return (
    <div className="client-switch" role="radiogroup" aria-label="Game client">
      {(
        [
          ['stable', 'osu!stable'],
          ['lazer', 'osu!lazer'],
        ] as const
      ).map(([client, label]) => {
        const blocker = client === current ? null : clientBlocker(selection, client);
        return (
          <button
            key={client}
            type="button"
            role="radio"
            aria-checked={client === current}
            className={client === current ? 'active' : undefined}
            disabled={!!blocker}
            title={blocker ?? `Judge, score and export this replay for ${label}`}
            onClick={() => choose(client)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
