import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MOD_GROUPS, activeMods, clientBlocker, isActive, isSimulated, modsFor, toggleMod, type Mod } from '../../mods';
import { useEditorStore, type Track } from '../../stores/editor';
import { InfoTip } from '../InfoTip';
import { ClientSwitch, trackClient, trackMods } from './ClientSwitch';

/// Mod picker for the previewed replay: the mods of the client it targets, grouped as in the
/// game. Changing mods reruns the simulation and adopts its score.
export function ModsPanel({ track }: { track: Track | undefined }) {
  const setMetadata = useEditorStore((state) => state.setTrackMetadata);
  // Fun mods are many and rarely used: folded until asked for, unless one is on.
  const [funOpen, setFunOpen] = useState(false);
  if (!track)
    return (
      <p className="sample-note">
        No replay
        <InfoTip text="Import a replay and choose its preview track." />
      </p>
    );
  const client = trackClient(track);
  const selection = trackMods(track);
  const available = modsFor(client);
  const active = activeMods(selection);
  const other = client === 'lazer' ? 'stable' : 'lazer';
  const locked = clientBlocker(selection, other);
  const toggle = (mod: Mod) => setMetadata(track.id, toggleMod(selection, mod.acronym), true);

  return (
    <div className="mods-panel">
      <ClientSwitch track={track} />
      {locked && <p className="mods-lock-note">{locked}</p>}
      <div className="mods-active">
        <span className="mods-active-label">Active</span>
        {active.length ? (
          active.map((mod) => (
            <button
              key={mod.acronym}
              type="button"
              className={`mod-tag ${mod.group}`}
              title={`${mod.name} · click to remove`}
              onClick={() =>
                mod.bit === undefined && !available.includes(mod)
                  ? // An imported lazer mod the picker does not list.
                    setMetadata(
                      track.id,
                      { lazerMods: selection.lazerMods.filter((item) => item !== mod.acronym) },
                      true,
                    )
                  : toggle(mod)
              }
            >
              {mod.acronym}
            </button>
          ))
        ) : (
          <span className="mods-none">No mods</span>
        )}
        <InfoTip text="Changing mods reruns the whole replay simulation and adopts its score. A dot marks mods that are saved in the replay but whose effect is not simulated." />
      </div>
      {MOD_GROUPS.map(([group, label]) => {
        const mods = available.filter((mod) => mod.group === group);
        if (!mods.length) return null;
        const foldable = group === 'fun';
        const open = !foldable || funOpen || mods.some((mod) => isActive(mod, selection));
        return (
          <section key={group} className={`mods-group ${group}`}>
            {foldable ? (
              <button type="button" className="mods-group-title" aria-expanded={open} onClick={() => setFunOpen(!open)}>
                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {label}
                <span>{mods.length}</span>
              </button>
            ) : (
              <h4 className="mods-group-title">{label}</h4>
            )}
            {open && (
              <div className="mods-list">
                {mods.map((mod) => {
                  const on = isActive(mod, selection);
                  return (
                    <button
                      key={mod.acronym}
                      type="button"
                      className={`mod-row${on ? ' active' : ''}`}
                      aria-pressed={on}
                      title={
                        isSimulated(mod)
                          ? `${mod.name}: simulated`
                          : `${mod.name}: saved in the replay, its effect on gameplay is not simulated`
                      }
                      onClick={() => toggle(mod)}
                    >
                      <b>{mod.acronym}</b>
                      <span>{mod.name}</span>
                      {!isSimulated(mod) && <i aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
