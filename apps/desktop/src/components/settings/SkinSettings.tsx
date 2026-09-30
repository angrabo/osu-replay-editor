import { FolderOpen, RefreshCw } from 'lucide-react';
import { useSkinStore } from '../../stores/skin';
import { InfoTip } from '../InfoTip';
import { Spinner } from '../common/Loading';

/// Settings › Skin & sounds: the osu! (stable) installation and skin used for hitsounds (and the
/// playfield skin), plus hitsound playback.
export function SkinSettings() {
  const osuDirectory = useSkinStore((state) => state.osuDirectory);
  const skinName = useSkinStore((state) => state.skinName);
  const skins = useSkinStore((state) => state.skins);
  const status = useSkinStore((state) => state.status);
  const message = useSkinStore((state) => state.message);
  const hitsoundsEnabled = useSkinStore((state) => state.hitsoundsEnabled);
  const hitsoundVolume = useSkinStore((state) => state.hitsoundVolume);
  const setOsuDirectory = useSkinStore((state) => state.setOsuDirectory);
  const setSkinName = useSkinStore((state) => state.setSkinName);
  const setHitsoundsEnabled = useSkinStore((state) => state.setHitsoundsEnabled);
  const setHitsoundVolume = useSkinStore((state) => state.setHitsoundVolume);
  const useSkinCircles = useSkinStore((state) => state.useSkinCircles);
  const useSkinCursor = useSkinStore((state) => state.useSkinCursor);
  const useSkinHitsounds = useSkinStore((state) => state.useSkinHitsounds);
  const setSkinUse = useSkinStore((state) => state.setSkinUse);
  const toggle = (title: string, info: string, checked: boolean, onChange: (value: boolean) => void) => (
    <div className="setting-row">
      <span className="setting-row-title">
        {title}
        <InfoTip text={info} />
      </span>
      <div className="setting-row-control">
        <input
          type="checkbox"
          className="setting-switch"
          aria-label={title}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </div>
  );

  const browse = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ directory: true, multiple: false, title: 'Choose your osu! folder' });
      if (typeof picked === 'string') setOsuDirectory(picked);
    } catch {
      /* The browser preview has no folder picker. */
    }
  };

  return (
    <div className="setting-list">
      <div className="setting-row">
        <span className="setting-row-title">
          osu! folder
          <InfoTip text="The osu! (stable) installation whose Skins folder is used. Found automatically when possible." />
        </span>
        <div className="setting-row-control">
          <code className="setting-path">{osuDirectory ?? 'Not found'}</code>
          <button
            type="button"
            title="Detect again"
            onClick={() => {
              setOsuDirectory(null);
              void useSkinStore.getState().detect();
            }}
          >
            <RefreshCw size={12} />
          </button>
          <button type="button" title="Choose folder" onClick={() => void browse()}>
            <FolderOpen size={12} />
          </button>
        </div>
      </div>
      <div className="setting-row">
        <span className="setting-row-title">
          Skin
          <InfoTip text="Defaults to the skin selected in osu!. Its samples play when a beatmap has no custom ones." />
        </span>
        <div className="setting-row-control">
          {status === 'loading' && <Spinner size={10} />}
          <select
            aria-label="Skin"
            value={skinName ?? ''}
            disabled={!skins.length}
            onChange={(event) => setSkinName(event.target.value || null)}
          >
            {!skins.length && <option value="">No skins</option>}
            {skins.map((skin) => (
              <option key={skin} value={skin}>
                {skin}
              </option>
            ))}
          </select>
        </div>
      </div>
      {toggle(
        'Use skin circles',
        'Hit circles, approach circles, numbers, slider balls, reverse arrows and slider colours from the skin. Anything the skin lacks keeps the editor look, as does wireframe.',
        useSkinCircles,
        (value) => setSkinUse('circles', value),
      )}
      {toggle('Use skin cursor', "The skin's cursor instead of the editor's.", useSkinCursor, (value) =>
        setSkinUse('cursor', value),
      )}
      {toggle(
        'Use skin hitsounds',
        "Samples the beatmap does not provide come from the skin. Off: only the beatmap's own samples play.",
        useSkinHitsounds,
        (value) => setSkinUse('hitsounds', value),
      )}
      {message && (
        <div className="setting-row muted">
          <span className="setting-row-title">{message}</span>
        </div>
      )}
      <div className="setting-row">
        <span className="setting-row-title">
          Hitsounds
          <InfoTip text="Play the beatmap's hitsounds during playback, at the moment each object was actually hit. Missed objects stay silent." />
        </span>
        <div className="setting-row-control">
          <input
            type="checkbox"
            className="setting-switch"
            aria-label="Hitsounds"
            checked={hitsoundsEnabled}
            onChange={(event) => setHitsoundsEnabled(event.target.checked)}
          />
        </div>
      </div>
      <div className="setting-row">
        <span className="setting-row-title">
          Effects volume
          <InfoTip text="Hitsounds and combo breaks, relative to the master volume. Also in the volume menu next to the playback controls." />
        </span>
        <div className="setting-row-control">
          <input
            type="range"
            aria-label="Effects volume"
            min={0}
            max={100}
            step={1}
            value={hitsoundVolume}
            disabled={!hitsoundsEnabled}
            onChange={(event) => setHitsoundVolume(Number(event.target.value))}
          />
          <output>{hitsoundVolume} %</output>
        </div>
      </div>
    </div>
  );
}
