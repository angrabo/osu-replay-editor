import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Clock3,
  FolderOpen,
  Keyboard,
  Music,
  Palette,
  Play,
  Search,
  Settings2,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from 'lucide-react';
import { sidecarRequest } from './sidecar';
import { useEditorStore } from './stores/editor';
import { APP_VERSION } from './appMeta';
import { UpdateDiagnostics } from './UpdateDiagnostics';
import type { UpdateCheckResult } from './hooks/useAutoUpdater';
import { Spinner } from './components/common/Loading';
import { KeybindSettings } from './components/settings/KeybindSettings';
import { SkinSettings } from './components/settings/SkinSettings';
import { InstallSettings } from './components/settings/InstallSettings';
import { InfoTip } from './components/InfoTip';
import { clearRecentFiles, readRecentFiles } from './recentFiles';
import { AUTOSAVE_INTERVALS, useAutosaveStore } from './stores/autosave';
import { MAX_EDIT_SIMULATION_DELAY_MS, useSimulationPrefsStore } from './stores/simulationPrefs';

type AccountSettings = { rememberSession: boolean; storageDirectory: string };
type CategoryId =
  | 'general'
  | 'account'
  | 'playback'
  | 'timeline'
  | 'appearance'
  | 'skin'
  | 'filters'
  | 'files'
  | 'shortcuts'
  | 'advanced';
type Category = {
  id: CategoryId;
  label: string;
  icon: ReactNode;
  keywords: string;
  // `planned` items are not built yet and are listed with a Planned badge.
  items: { title: string; description: string; planned?: boolean }[];
};

const categories: Category[] = [
  {
    id: 'general',
    label: 'General',
    icon: <Settings2 size={17} />,
    keywords: 'startup language updates restore project simulation delay',
    items: [
      {
        title: 'Simulate after editing',
        description: 'How long the editor waits after your last edit before it simulates the replay again.',
      },
      { title: 'Updates', description: 'Check GitHub for a newer signed build.' },
      { title: 'Changelog', description: 'What changed in this and past versions.' },
    ],
  },
  {
    id: 'account',
    label: 'osu! account',
    icon: <UserRound size={17} />,
    keywords: 'login token remember session avatar profile',
    items: [
      {
        title: 'Remember signed-in session',
        description: 'Encrypt and restore the osu! access token for this Windows user.',
      },
    ],
  },
  {
    id: 'playback',
    label: 'Playback',
    icon: <Play size={17} />,
    keywords: 'audio speed volume preview',
    items: [{ title: 'Playback defaults', description: 'Speed, volume and preview behavior.' }],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: <Clock3 size={17} />,
    keywords: 'lanes lane height layout',
    items: [{ title: 'Lane height', description: 'Default height of timeline lanes.' }],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette size={17} />,
    keywords:
      'theme colors ui scale interface playfield background dim brightness grid cursor trail history compact ticks click markers',
    items: [{ title: 'Playfield display', description: 'Background, grid, compact mode and cursor history.' }],
  },
  {
    id: 'skin',
    label: 'Skin & sounds',
    icon: <Music size={17} />,
    keywords: 'skin osu stable folder hitsounds hitsound samples volume sounds audio',
    items: [
      { title: 'osu! skin', description: 'Skin from your osu! (stable) installation.' },
      { title: 'Hitsounds', description: 'Play hitsounds during playback and set their volume.' },
    ],
  },
  {
    id: 'filters',
    label: 'Filters',
    icon: <SlidersHorizontal size={17} />,
    keywords: 'gameplay wireframe fade click hidden HD 100 50 miss judgements',
    items: [{ title: 'Gameplay filters', description: 'Wireframe, hit fades, judgements and Hidden fade.' }],
  },
  {
    id: 'files',
    label: 'Files & cache',
    icon: <FolderOpen size={17} />,
    keywords: 'folder cache osu beatmap replay export paths',
    items: [
      { title: 'Recent files', description: 'Projects and replays listed under File › Open recent.' },
      { title: 'Settings location', description: 'Where the editor keeps its settings and cache.' },
      {
        title: 'osu! folders',
        description: 'osu!stable and osu!lazer installation folders for skins, hitsounds and local beatmaps.',
      },
    ],
  },
  {
    id: 'shortcuts',
    label: 'Keyboard',
    icon: <Keyboard size={17} />,
    keywords: 'hotkeys keybind keybinds shortcuts controls keys',
    items: [{ title: 'Keyboard shortcuts', description: 'Rebind every editor shortcut.' }],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <Wrench size={17} />,
    keywords: 'api diagnostics logs sidecar developer',
    items: [{ title: 'Diagnostics', description: 'Engine status, logs and troubleshooting tools.', planned: true }],
  },
];

export function SettingsDialog({
  onClose,
  onCheckForUpdates,
  updateCheckResult,
  onOpenChangelog,
}: {
  onClose: () => void;
  onCheckForUpdates: () => void;
  updateCheckResult: UpdateCheckResult;
  onOpenChangelog: () => void;
}) {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [remember, setRemember] = useState(true);
  const [active, setActive] = useState<CategoryId>('general');
  const editDelayMs = useSimulationPrefsStore((state) => state.editDelayMs);
  const setEditDelayMs = useSimulationPrefsStore((state) => state.setEditDelayMs);
  const autosaveEnabled = useAutosaveStore((state) => state.enabled);
  const autosaveMinutes = useAutosaveStore((state) => state.minutes);
  const setAutosaveEnabled = useAutosaveStore((state) => state.setEnabled);
  const setAutosaveMinutes = useAutosaveStore((state) => state.setMinutes);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const volume = useEditorStore((state) => state.volume);
  const setVolume = useEditorStore((state) => state.setVolume);
  const showBackground = useEditorStore((state) => state.showBackground);
  const setShowBackground = useEditorStore((state) => state.setShowBackground);
  const backgroundDim = useEditorStore((state) => state.backgroundDim);
  const setBackgroundDim = useEditorStore((state) => state.setBackgroundDim);
  const cursorSize = useEditorStore((state) => state.cursorSize);
  const setCursorSize = useEditorStore((state) => state.setCursorSize);
  const showGrid = useEditorStore((state) => state.showGrid);
  const setShowGrid = useEditorStore((state) => state.setShowGrid);
  const compactMode = useEditorStore((state) => state.compactMode);
  const hideCollectedTicks = useEditorStore((state) => state.hideCollectedTicks);
  const snakingSliders = useEditorStore((state) => state.snakingSliders);
  const snakingOutSliders = useEditorStore((state) => state.snakingOutSliders);
  const setSliderDisplay = useEditorStore((state) => state.setSliderDisplay);
  const setCompactMode = useEditorStore((state) => state.setCompactMode);
  const wireframeGameplay = useEditorStore((state) => state.wireframeGameplay);
  const fadeAfterClick = useEditorStore((state) => state.fadeAfterClick);
  const showHitJudgements = useEditorStore((state) => state.showHitJudgements);
  const showHiddenFade = useEditorStore((state) => state.showHiddenFade);
  const showSliderEndWindows = useEditorStore((state) => state.showSliderEndWindows);
  const showSliderTracking = useEditorStore((state) => state.showSliderTracking);
  const setGameplayFilter = useEditorStore((state) => state.setGameplayFilter);
  const cursorTrailMs = useEditorStore((state) => state.cursorTrailMs);
  const defaultLaneHeight = useEditorStore((state) => state.timelineDefaultLaneHeight);
  const saveDefaultLaneHeight = useEditorStore((state) => state.saveDefaultTimelineLaneHeight);
  const [recentCount, setRecentCount] = useState(() => readRecentFiles().length);
  const setCursorTrailMs = useEditorStore((state) => state.setCursorTrailMs);

  useEffect(() => {
    void sidecarRequest<AccountSettings>('/api/settings')
      .then((value) => {
        setSettings(value);
        setRemember(value.rememberSession);
      })
      .catch((error) => setMessage((error as Error).message));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      categories.filter((category) => {
        const text =
          `${category.label} ${category.keywords} ${category.items.map((item) => `${item.title} ${item.description}`).join(' ')}`.toLowerCase();
        return !normalizedQuery || text.includes(normalizedQuery);
      }),
    [normalizedQuery],
  );
  const visibleCategories = normalizedQuery ? results : categories.filter((category) => category.id === active);

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const value = await sidecarRequest<AccountSettings>('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rememberSession: remember }),
      });
      setSettings(value);
      setMessage('Settings saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-window" onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h2>Settings</h2>
            <span>Configure osu! Replay Editor</span>
          </div>
          <button aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="settings-search">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
          />
          <kbd>Ctrl+,</kbd>
        </label>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings categories">
            {categories.map((category) => (
              <button
                key={category.id}
                className={!normalizedQuery && active === category.id ? 'active' : ''}
                onClick={() => {
                  setActive(category.id);
                  setQuery('');
                }}
              >
                {category.icon}
                <span>{category.label}</span>
              </button>
            ))}
          </nav>
          <main className="settings-content">
            {visibleCategories.length === 0 && (
              <div className="settings-empty">
                <Search size={28} />
                <strong>No settings found</strong>
                <span>Try another search term.</span>
              </div>
            )}
            {visibleCategories.map((category) => (
              <section className="settings-category" key={category.id}>
                <div className="settings-category-heading">
                  <span>{category.icon}</span>
                  <h3>{category.label}</h3>
                  {normalizedQuery && <small>Search result</small>}
                </div>
                {category.id === 'general' ? (
                  <>
                    <div className="setting-list">
                      <SettingRow
                        title={`Version ${APP_VERSION}`}
                        info={
                          updateCheckResult === 'up-to-date'
                            ? "You're on the latest version."
                            : updateCheckResult === 'error'
                              ? 'Could not check for updates.'
                              : 'Check GitHub for a newer signed build.'
                        }
                      >
                        {updateCheckResult === 'checking' && <Spinner size={9} />}
                        <button
                          className="primary-button"
                          disabled={updateCheckResult === 'checking'}
                          onClick={onCheckForUpdates}
                        >
                          Check for updates
                        </button>
                      </SettingRow>
                      <SettingRow
                        title="Simulate after editing"
                        info="How long the editor waits after your last edit before it simulates the replay again. 0 simulates straight away; a longer wait keeps editing smooth on long replays. The old result stays on screen, dimmed, until the new one is ready."
                      >
                        <input
                          key={editDelayMs}
                          className="setting-number"
                          type="number"
                          aria-label="Simulation delay after editing, in milliseconds"
                          min={0}
                          max={MAX_EDIT_SIMULATION_DELAY_MS}
                          step={500}
                          defaultValue={editDelayMs}
                          onBlur={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (event.currentTarget.value !== '' && Number.isFinite(value)) setEditDelayMs(value);
                            else event.currentTarget.value = String(editDelayMs);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                        />
                        <span className="setting-value">ms</span>
                      </SettingRow>
                      <SettingRow title="Changelog" info="What changed in this and past versions.">
                        <button onClick={onOpenChangelog}>View</button>
                      </SettingRow>
                    </div>
                    {import.meta.env.DEV && <UpdateDiagnostics />}
                  </>
                ) : category.id === 'account' ? (
                  <div className="setting-list">
                    <ToggleRow
                      title="Remember signed-in session"
                      info="Encrypts the osu! access token for this Windows user and restores it until it expires. Turning this off removes the stored token right away. Passwords and verification codes are never saved."
                      checked={remember}
                      onChange={setRemember}
                    />
                    {settings && (
                      <SettingRow title="Settings location">
                        <code className="setting-path">{settings.storageDirectory}</code>
                      </SettingRow>
                    )}
                  </div>
                ) : category.id === 'timeline' ? (
                  <div className="setting-list">
                    <SliderRow
                      title="Default lane height"
                      info="Applied to every lane now and when the app starts."
                      min={20}
                      max={140}
                      step={2}
                      value={defaultLaneHeight}
                      unit="px"
                      onChange={saveDefaultLaneHeight}
                    />
                  </div>
                ) : category.id === 'files' ? (
                  <div className="setting-list">
                    <InstallSettings />
                    <ToggleRow
                      title="Autosave project"
                      info="Saves the open project on a timer when it has changed. A project that was never saved is copied to the app's autosave folder and listed under File › Open recent."
                      checked={autosaveEnabled}
                      onChange={setAutosaveEnabled}
                    />
                    <SettingRow title="Autosave every" info="How often the project is saved.">
                      <select
                        aria-label="Autosave interval"
                        disabled={!autosaveEnabled}
                        value={autosaveMinutes}
                        onChange={(event) => setAutosaveMinutes(Number(event.target.value))}
                      >
                        {AUTOSAVE_INTERVALS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes === 60 ? '1 hour' : `${minutes} minute${minutes === 1 ? '' : 's'}`}
                          </option>
                        ))}
                      </select>
                    </SettingRow>
                    <SettingRow title="Recent files" info="Projects and replays listed under File › Open recent.">
                      <span className="setting-value">{recentCount ? `${recentCount} saved` : 'Empty'}</span>
                      <button
                        disabled={!recentCount}
                        onClick={() => {
                          clearRecentFiles();
                          setRecentCount(0);
                        }}
                      >
                        Clear
                      </button>
                    </SettingRow>
                    {settings && (
                      <SettingRow title="Settings location">
                        <code className="setting-path">{settings.storageDirectory}</code>
                      </SettingRow>
                    )}
                  </div>
                ) : category.id === 'shortcuts' ? (
                  <KeybindSettings query={normalizedQuery} />
                ) : category.id === 'playback' ? (
                  <div className="setting-list">
                    <SliderRow
                      title="Volume"
                      info="Saved automatically and restored when the app starts."
                      min={0}
                      max={100}
                      step={1}
                      value={volume}
                      unit="%"
                      onChange={setVolume}
                    />
                  </div>
                ) : category.id === 'filters' ? (
                  <div className="setting-list">
                    <ToggleRow
                      title="Wireframe gameplay"
                      info="Object outlines and paths without filled circles."
                      checked={wireframeGameplay}
                      onChange={(value) => setGameplayFilter('wireframeGameplay', value)}
                    />
                    <ToggleRow
                      title="Fade after click"
                      info="Fade a hit circle from its simulated hit time."
                      checked={fadeAfterClick}
                      onChange={(value) => setGameplayFilter('fadeAfterClick', value)}
                    />
                    <ToggleRow
                      title="Show 100, 50 and misses"
                      info="Fading result markers from the replay simulation."
                      checked={showHitJudgements}
                      onChange={(value) => setGameplayFilter('showHitJudgements', value)}
                    />
                    <ToggleRow
                      title="Show Hidden fade"
                      info="Preview early fading and hide approach circles when HD is active."
                      checked={showHiddenFade}
                      onChange={(value) => setGameplayFilter('showHiddenFade', value)}
                    />
                    <ToggleRow
                      title="Show slider breaks"
                      info="Paint the parts of a slider the cursor did not track in red."
                      checked={showSliderTracking}
                      onChange={(value) => setGameplayFilter('showSliderTracking', value)}
                    />
                    <ToggleRow
                      title="Show slider end windows"
                      info="Where slider ends are judged: one moment on stable, the final stretch on lazer."
                      checked={showSliderEndWindows}
                      onChange={(value) => setGameplayFilter('showSliderEndWindows', value)}
                    />
                  </div>
                ) : category.id === 'skin' ? (
                  <SkinSettings />
                ) : category.id === 'appearance' ? (
                  <div className="setting-list">
                    <ToggleRow
                      title="Beatmap background"
                      info="Use the image from the cached beatmap archive when available."
                      checked={showBackground}
                      onChange={setShowBackground}
                    />
                    <SliderRow
                      title="Background dim"
                      info="0% keeps the image bright; 100% makes it black."
                      min={0}
                      max={100}
                      step={1}
                      value={backgroundDim}
                      unit="%"
                      disabled={!showBackground}
                      onChange={setBackgroundDim}
                    />
                    <ToggleRow
                      title="Playfield grid"
                      info="Draw the 512×384 editor grid and boundary."
                      checked={showGrid}
                      onChange={setShowGrid}
                    />
                    <ToggleRow
                      title="Snaking sliders"
                      info="Slider bodies grow out of the head as they fade in, like in osu!."
                      checked={snakingSliders}
                      onChange={(value) => setSliderDisplay('snakingSliders', value)}
                    />
                    <ToggleRow
                      title="Shrink sliders behind the ball"
                      info="On the last pass the body disappears behind the slider ball (snaking out)."
                      checked={snakingOutSliders}
                      onChange={(value) => setSliderDisplay('snakingOutSliders', value)}
                    />
                    <ToggleRow
                      title="Hide collected slider ticks"
                      info="A tick disappears once the ball has passed it; off keeps every tick visible."
                      checked={hideCollectedTicks}
                      onChange={(value) => setSliderDisplay('hideCollectedTicks', value)}
                    />
                    <ToggleRow
                      title="Compact mode"
                      info="Smaller slider ticks, cursor paths and click markers."
                      checked={compactMode}
                      onChange={setCompactMode}
                    />
                    <SliderRow
                      title="Cursor size"
                      info="Size of the replay cursor on the playfield."
                      min={50}
                      max={200}
                      step={5}
                      value={cursorSize}
                      unit="%"
                      onChange={setCursorSize}
                    />
                    <SliderRow
                      title="Cursor history"
                      info="How long the thin movement line and click markers stay."
                      min={0}
                      max={2000}
                      step={50}
                      value={cursorTrailMs}
                      unit="ms"
                      onChange={setCursorTrailMs}
                    />
                  </div>
                ) : null}
                {category.items.some((item) => item.planned) && (
                  <div className="setting-list">
                    {category.items
                      .filter((item) => item.planned)
                      .map((item) => (
                        <SettingRow key={item.title} title={item.title} info={item.description} muted>
                          <span className="setting-planned">Planned</span>
                        </SettingRow>
                      ))}
                  </div>
                )}
              </section>
            ))}
          </main>
        </div>
        <div className="settings-footer">
          <span role="status">{message}</span>
          <div>
            <button onClick={onClose}>Cancel</button>
            <button className="primary-button" disabled={busy || !settings} onClick={() => void save()}>
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/// One compact settings line: title (with an optional info tooltip) and its control on the right.
function SettingRow({
  title,
  info,
  muted,
  children,
}: {
  title: string;
  info?: string;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={muted ? 'setting-row muted' : 'setting-row'}>
      <span className="setting-row-title">
        {title}
        {info && <InfoTip text={info} />}
      </span>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

function ToggleRow({
  title,
  info,
  checked,
  onChange,
}: {
  title: string;
  info?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow title={title} info={info}>
      <input
        type="checkbox"
        className="setting-switch"
        aria-label={title}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </SettingRow>
  );
}

function SliderRow({
  title,
  info,
  min,
  max,
  step,
  value,
  unit,
  disabled,
  onChange,
}: {
  title: string;
  info?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow title={title} info={info}>
      <input
        type="range"
        aria-label={title}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>
        {value} {unit}
      </output>
    </SettingRow>
  );
}
