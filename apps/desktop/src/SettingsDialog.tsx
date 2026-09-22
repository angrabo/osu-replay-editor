import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Clock3,
  FolderOpen,
  Keyboard,
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
import type { UpdateCheckResult } from './hooks/useAutoUpdater';

type AccountSettings = { rememberSession: boolean; storageDirectory: string };
type CategoryId =
  | 'general'
  | 'account'
  | 'editor'
  | 'playback'
  | 'timeline'
  | 'appearance'
  | 'filters'
  | 'files'
  | 'shortcuts'
  | 'advanced';
type Category = {
  id: CategoryId;
  label: string;
  icon: ReactNode;
  keywords: string;
  items: { title: string; description: string }[];
};

const categories: Category[] = [
  {
    id: 'general',
    label: 'General',
    icon: <Settings2 size={17} />,
    keywords: 'startup language updates restore project',
    items: [
      { title: 'Startup behavior', description: 'Choose what opens when the editor starts.' },
      { title: 'Language and updates', description: 'Application language and update preferences.' },
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
    id: 'editor',
    label: 'Editor',
    icon: <SlidersHorizontal size={17} />,
    keywords: 'cursor input editing snap undo autosave',
    items: [
      { title: 'Editing defaults', description: 'Defaults for cursor, key input and snapping tools.' },
      { title: 'Undo history', description: 'History size and editing safeguards.' },
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
    keywords: 'zoom lanes grid waveform',
    items: [{ title: 'Timeline display', description: 'Visible lanes, grid density and zoom behavior.' }],
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
      { title: 'Storage locations', description: 'Project, beatmap cache and export folders.' },
      { title: 'osu! installation', description: 'Optional local beatmap discovery.' },
    ],
  },
  {
    id: 'shortcuts',
    label: 'Keyboard',
    icon: <Keyboard size={17} />,
    keywords: 'hotkeys keybind shortcuts controls',
    items: [
      { title: 'Frame stepping', description: 'Left Arrow: previous replay frame · Right Arrow: next replay frame.' },
      { title: 'Playback and editor', description: 'Space: play/pause · Ctrl+Z/Ctrl+Y: undo/redo · Ctrl+,: settings.' },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <Wrench size={17} />,
    keywords: 'api diagnostics logs sidecar developer',
    items: [{ title: 'Diagnostics', description: 'Engine status, logs and troubleshooting tools.' }],
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
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const volume = useEditorStore((state) => state.volume);
  const setVolume = useEditorStore((state) => state.setVolume);
  const showBackground = useEditorStore((state) => state.showBackground);
  const setShowBackground = useEditorStore((state) => state.setShowBackground);
  const backgroundDim = useEditorStore((state) => state.backgroundDim);
  const setBackgroundDim = useEditorStore((state) => state.setBackgroundDim);
  const showGrid = useEditorStore((state) => state.showGrid);
  const setShowGrid = useEditorStore((state) => state.setShowGrid);
  const compactMode = useEditorStore((state) => state.compactMode);
  const setCompactMode = useEditorStore((state) => state.setCompactMode);
  const wireframeGameplay = useEditorStore((state) => state.wireframeGameplay);
  const fadeAfterClick = useEditorStore((state) => state.fadeAfterClick);
  const showHitJudgements = useEditorStore((state) => state.showHitJudgements);
  const showHiddenFade = useEditorStore((state) => state.showHiddenFade);
  const setGameplayFilter = useEditorStore((state) => state.setGameplayFilter);
  const cursorTrailMs = useEditorStore((state) => state.cursorTrailMs);
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
                  <div>
                    <h3>{category.label}</h3>
                    <small>
                      {normalizedQuery
                        ? 'Search result'
                        : `${category.items.length} ${category.items.length === 1 ? 'option' : 'options'}`}
                    </small>
                  </div>
                </div>
                {category.id === 'general' ? (
                  <>
                    <div className="setting-preview">
                      <div>
                        <strong>Version {APP_VERSION}</strong>
                        <small>
                          {updateCheckResult === 'checking'
                            ? 'Checking for updates…'
                            : updateCheckResult === 'up-to-date'
                              ? "You're on the latest version."
                              : updateCheckResult === 'error'
                                ? 'Could not check for updates.'
                                : 'Check GitHub for a newer signed build.'}
                        </small>
                      </div>
                      <button
                        className="primary-button"
                        disabled={updateCheckResult === 'checking'}
                        onClick={onCheckForUpdates}
                      >
                        Check for updates
                      </button>
                    </div>
                    <div className="setting-preview">
                      <div>
                        <strong>Changelog</strong>
                        <small>See what changed in this and past versions.</small>
                      </div>
                      <button onClick={onOpenChangelog}>View changelog</button>
                    </div>
                  </>
                ) : category.id === 'account' ? (
                  <>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                      />
                      <span>
                        <strong>Remember signed-in session</strong>
                        <small>Encrypt the access token for this Windows user and restore it until it expires.</small>
                      </span>
                    </label>
                    <p className="settings-note">
                      Turning this off immediately removes the stored token. Passwords and verification codes are never
                      saved.
                    </p>
                    {settings && (
                      <div className="settings-path">
                        <span>Settings location</span>
                        <code>{settings.storageDirectory}</code>
                      </div>
                    )}
                  </>
                ) : category.id === 'playback' ? (
                  <label className="setting-volume">
                    <span>
                      <strong>Volume</strong>
                      <small>Saved automatically and restored when the app starts.</small>
                    </span>
                    <div>
                      <input
                        aria-label="Playback volume"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={volume}
                        onChange={(event) => setVolume(Number(event.target.value))}
                      />
                      <output>{volume}%</output>
                    </div>
                  </label>
                ) : category.id === 'filters' ? (
                  <div className="setting-playfield">
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={wireframeGameplay}
                        onChange={(event) => setGameplayFilter('wireframeGameplay', event.target.checked)}
                      />
                      <span>
                        <strong>Wireframe gameplay</strong>
                        <small>Show object outlines and paths without filled circles.</small>
                      </span>
                    </label>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={fadeAfterClick}
                        onChange={(event) => setGameplayFilter('fadeAfterClick', event.target.checked)}
                      />
                      <span>
                        <strong>Fade after click</strong>
                        <small>Fade a hit circle from its simulated hit time.</small>
                      </span>
                    </label>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={showHitJudgements}
                        onChange={(event) => setGameplayFilter('showHitJudgements', event.target.checked)}
                      />
                      <span>
                        <strong>Show 100, 50 and misses</strong>
                        <small>Show fading result markers from replay simulation.</small>
                      </span>
                    </label>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={showHiddenFade}
                        onChange={(event) => setGameplayFilter('showHiddenFade', event.target.checked)}
                      />
                      <span>
                        <strong>Show Hidden fade</strong>
                        <small>Preview early fading and hide approach circles when HD is active.</small>
                      </span>
                    </label>
                  </div>
                ) : category.id === 'appearance' ? (
                  <div className="setting-playfield">
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={showBackground}
                        onChange={(event) => setShowBackground(event.target.checked)}
                      />
                      <span>
                        <strong>Show beatmap background</strong>
                        <small>Use the image from the cached beatmap archive when available.</small>
                      </span>
                    </label>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={showGrid}
                        onChange={(event) => setShowGrid(event.target.checked)}
                      />
                      <span>
                        <strong>Show playfield grid</strong>
                        <small>Draw the 512×384 editor grid and boundary.</small>
                      </span>
                    </label>
                    <label className="setting-check">
                      <input
                        type="checkbox"
                        checked={compactMode}
                        onChange={(event) => setCompactMode(event.target.checked)}
                      />
                      <span>
                        <strong>Compact mode</strong>
                        <small>Smaller slider ticks, cursor paths and click markers. Saved automatically.</small>
                      </span>
                    </label>
                    <label className="setting-volume">
                      <span>
                        <strong>Background dim</strong>
                        <small>0% keeps the image bright; 100% makes it black.</small>
                      </span>
                      <div>
                        <input
                          aria-label="Background dim"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={backgroundDim}
                          disabled={!showBackground}
                          onChange={(event) => setBackgroundDim(Number(event.target.value))}
                        />
                        <output>{backgroundDim}%</output>
                      </div>
                    </label>
                    <label className="setting-volume">
                      <span>
                        <strong>Cursor history</strong>
                        <small>Duration of the thin movement line and click markers.</small>
                      </span>
                      <div>
                        <input
                          aria-label="Cursor trail duration"
                          type="range"
                          min="0"
                          max="2000"
                          step="50"
                          value={cursorTrailMs}
                          onChange={(event) => setCursorTrailMs(Number(event.target.value))}
                        />
                        <output>{cursorTrailMs} ms</output>
                      </div>
                    </label>
                  </div>
                ) : (
                  category.items.map((item) => (
                    <div className="setting-preview" key={item.title}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </div>
                      <span>Planned</span>
                    </div>
                  ))
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
