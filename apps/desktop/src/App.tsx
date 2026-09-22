import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, Check, UserRound, Volume2 } from 'lucide-react';
import { Timeline } from './timeline/Timeline';
import { checkSidecar, sidecarRequest } from './sidecar';
import { MapAcquisition, toMapInfo, type AcquisitionAction, type Resolution, type Session } from './MapAcquisition';
import { AccountDialog } from './AccountDialog';
import { SettingsDialog } from './SettingsDialog';
import { ChangelogDialog } from './ChangelogDialog';
import { MenuBar } from './components/menu/MenuBar';
import { Transport } from './components/transport/Transport';
import { Explorer } from './components/explorer/Explorer';
import { TrackList } from './components/tracks/TrackList';
import { Playfield, type PlayfieldSource } from './components/playfield/Playfield';
import { Inspector } from './components/inspector/Inspector';
import { SelectionPanel } from './components/selection/SelectionPanel';
import { usePanelResize } from './hooks/usePanelResize';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoUpdater } from './hooks/useAutoUpdater';
import { formatTime, useEditorStore, type EditorState } from './stores/editor';
import {
  parseProjectFile,
  projectFileName,
  serializeProject,
  PROJECT_FILE_EXTENSION,
  type ProjectView,
} from './project';

const PROJECT_VIEW_KEYS: (keyof ProjectView)[] = [
  'playbackRate',
  'volume',
  'showBackground',
  'backgroundDim',
  'showGrid',
  'compactMode',
  'wireframeGameplay',
  'fadeAfterClick',
  'showHitJudgements',
  'showHiddenFade',
  'playfieldZoom',
  'cursorTrailMs',
  'showCursorPast',
  'showCursorFuture',
  'showInputPaths',
  'showClickMarkers',
  'cursorSmoothing',
  'drawRangeSnap',
  'timelineWheelMode',
  'timelineWheelStepMs',
  'pixelsPerSecond',
  'timelineLaneHeight',
];

function currentProjectView(state: EditorState): ProjectView {
  const view = {} as ProjectView;
  for (const key of PROJECT_VIEW_KEYS) (view as Record<string, unknown>)[key] = state[key];
  return view;
}

export default function App() {
  const playhead = useEditorStore((state) => state.playheadMs);
  const hasContextSelection = useEditorStore(
    (state) =>
      state.selectedInputs.length > 0 ||
      state.selectedCursorRange !== null ||
      state.selectedBeatmapObjectIndex !== null,
  );
  const durationMs = useEditorStore((state) => state.durationMs);
  const playing = useEditorStore((state) => state.playing);
  const playbackRate = useEditorStore((state) => state.playbackRate);
  const volume = useEditorStore((state) => state.volume);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlaybackRate = useEditorStore((state) => state.setPlaybackRate);
  const setVolume = useEditorStore((state) => state.setVolume);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const [sidecar, setSidecar] = useState<'ready' | 'offline' | 'demo'>('demo');
  const [account, setAccount] = useState<Session | null>(null);
  const [acquisitionOpen, setAcquisitionOpen] = useState(false);
  const [acquisitionAction, setAcquisitionAction] = useState<AcquisitionAction>('open');
  const [resolution, setResolution] = useState<Resolution | null>(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('viewer-fixture')
      ? {
          status: 'verified',
          replayHash: '00000000000000000000000000000000',
          title: 'Viewer Integration Fixture',
          artist: 'osu! Replay Editor',
          creator: 'Codex',
          version: 'Circle Slider Spinner',
          beatmapsetId: null,
          source: 'dev-fixture',
          error: null,
          assets: [],
          difficulties: [
            {
              filename: 'fixture.osu',
              checksum: '00000000000000000000000000000000',
              title: 'Viewer Integration Fixture',
              artist: 'osu! Replay Editor',
              version: 'Circle Slider Spinner',
              creator: 'Codex',
              audioFilename: null,
              backgroundFilename: null,
            },
          ],
        }
      : null,
  );
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [leftSource, setLeftSource] = useState<PlayfieldSource>('preview');
  const [rightSource, setRightSource] = useState<PlayfieldSource>('original');
  const { leftWidth, rightWidth, viewerHeight, centerRef, beginResize, clearResizeState } = usePanelResize();

  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('viewer-fixture')) return;
    void import('./devReplayFixture').then(({ developmentReplays }) => {
      if (useEditorStore.getState().tracks.length === 0)
        developmentReplays.forEach((replay) => useEditorStore.getState().importReplay(replay));
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const update = () => {
      void checkSidecar().then((status) => {
        if (!mounted) return;
        setSidecar(status);
        if (status === 'ready')
          void sidecarRequest<Session>('/api/auth/status')
            .then((session) => {
              if (mounted) setAccount(session);
            })
            .catch(() => {
              if (mounted) setAccount(null);
            });
        else setAccount(null);
      });
    };
    update();
    const interval = window.setInterval(update, 3000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!playing || resolution) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(100, now - last);
      last = now;
      const current = useEditorStore.getState();
      const next = current.playheadMs + delta * current.playbackRate;
      current.setPlayhead(Math.min(durationMs, next));
      if (next >= durationMs) current.setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, resolution]);

  const openAcquisition = (action: AcquisitionAction) => {
    setAcquisitionAction(action);
    setAcquisitionOpen(true);
  };
  const handleLoadReplayGroup = (beatmapHash: string, trackId: string) => {
    // Resolve first, then flip tracks + resolution together in one tick — doing the store
    // swap before the resolve finished left a render where tracks pointed at the new map but
    // the canvas/timeline still showed the old one, which read as a jump/flash.
    void sidecarRequest<Resolution>(`/api/beatmaps/resolve/${beatmapHash}`)
      .then((next) => {
        const state = useEditorStore.getState();
        if (state.tracks.length && state.tracks[0].replay.metadata.beatmapHash !== beatmapHash)
          state.archiveActiveMap(toMapInfo(resolution));
        state.promoteArchivedTracks(beatmapHash);
        state.setPreviewTrack(trackId);
        state.setMapLoadStatus(beatmapHash, next.status === 'verified' ? 'ok' : 'error');
        setResolution(next);
      })
      .catch(() => useEditorStore.getState().setMapLoadStatus(beatmapHash, 'error'));
  };
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const handleSaveProject = () => {
    const state = useEditorStore.getState();
    const project = serializeProject(
      state.tracks,
      currentProjectView(state),
      resolution,
      state.archivedTracks,
      state.archivedMapInfo,
    );
    const json = JSON.stringify(project);
    const suggestedName = projectFileName(project);
    void import('@tauri-apps/api/core')
      .then(async ({ isTauri }) => {
        if (!isTauri()) throw new Error('not-tauri');
        const [{ save }, { writeTextFile }] = await Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ]);
        const path = await save({
          defaultPath: suggestedName,
          filters: [{ name: 'osu! Replay Editor project', extensions: [PROJECT_FILE_EXTENSION] }],
        });
        if (!path) return;
        await writeTextFile(path, json);
      })
      .catch(() => {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = suggestedName;
        anchor.click();
        URL.revokeObjectURL(url);
      });
  };
  const loadProjectText = (text: string) => {
    const { tracks, archivedTracks, archivedMapInfo, view, beatmapHash } = parseProjectFile(text);
    useEditorStore.getState().loadProjectTracks(tracks, archivedTracks, archivedMapInfo);
    useEditorStore.setState(view);
    if (beatmapHash)
      void sidecarRequest<Resolution>(`/api/beatmaps/resolve/${beatmapHash}`)
        .then((next) => setResolution(next))
        .catch(() => setResolution(null));
  };
  const handleOpenProject = () => {
    void import('@tauri-apps/api/core')
      .then(async ({ isTauri }) => {
        if (!isTauri()) throw new Error('not-tauri');
        const [{ open }, { readTextFile }] = await Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ]);
        const path = await open({
          multiple: false,
          filters: [{ name: 'osu! Replay Editor project', extensions: [PROJECT_FILE_EXTENSION] }],
        });
        if (!path || Array.isArray(path)) return;
        loadProjectText(await readTextFile(path));
      })
      .catch((error) => {
        if ((error as Error).message === 'not-tauri') {
          projectFileInputRef.current?.click();
          return;
        }
        useEditorStore.setState({ lastEditMessage: `Could not open project: ${(error as Error).message}` });
      });
  };
  const handleProjectFileSelected = (file?: File) => {
    if (!file) return;
    void file
      .text()
      .then((text) => loadProjectText(text))
      .catch((error) => {
        useEditorStore.setState({ lastEditMessage: `Could not open project: ${(error as Error).message}` });
      });
  };
  useKeyboardShortcuts({ openAcquisition, setSettingsOpen, undo, redo, setPlaying });
  useAutoUpdater();

  const layoutStyle = {
    '--left-width': `${leftWidth}px`,
    '--right-width': `${rightWidth}px`,
    '--viewer-height': viewerHeight ? `${viewerHeight}px` : 'minmax(230px, 1.15fr)',
  } as CSSProperties;
  return (
    <div className="app-shell" style={layoutStyle} onContextMenu={(event) => event.preventDefault()}>
      <header className="app-header">
        <MenuBar
          openAcquisition={openAcquisition}
          splitView={splitView}
          setSplitView={setSplitView}
          resetLeftSource={() => setLeftSource('preview')}
          setSettingsOpen={setSettingsOpen}
          setChangelogOpen={setChangelogOpen}
          onSaveProject={handleSaveProject}
          onOpenProject={handleOpenProject}
        />
        <div className="header-actions">
          <button className="account-button" title="User profile" onClick={() => setAccountOpen(true)}>
            {account?.user ? (
              <>
                <img src={account.user.avatarUrl} alt="" referrerPolicy="no-referrer" />
                <span>{account.user.username}</span>
              </>
            ) : (
              <UserRound size={16} />
            )}
          </button>
        </div>
      </header>
      <main className="workspace">
        <aside className="left-column">
          <Explorer resolution={resolution} onSelectReplayTrack={handleLoadReplayGroup} />
          <TrackList onImport={() => openAcquisition('open')} />
        </aside>
        <div
          className="column-splitter"
          onPointerDown={(event) => beginResize('left', event)}
          onLostPointerCapture={clearResizeState}
        />
        <div className="center-column" ref={centerRef}>
          <Playfield
            resolution={resolution}
            split={splitView}
            leftSource={leftSource}
            rightSource={rightSource}
            onLeftSourceChange={setLeftSource}
            onRightSourceChange={setRightSource}
          />
          <div
            className="viewer-splitter"
            onPointerDown={(event) => beginResize('viewer', event)}
            onLostPointerCapture={clearResizeState}
          />
          <div className="center-transport">
            <span>
              {formatTime(playhead)} / {formatTime(durationMs)}
            </span>
            <Transport />
            <div className="center-transport-right">
              <label className="volume-control" title={`Volume ${volume}%`}>
                <Volume2 size={16} />
                <input
                  aria-label="Volume"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
                <span>{volume}%</span>
              </label>
              <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>
          </div>
          <section className="panel timeline-panel">
            <Timeline resolution={resolution} />
          </section>
        </div>
        <div
          className="column-splitter"
          onPointerDown={(event) => beginResize('right', event)}
          onLostPointerCapture={clearResizeState}
        />
        <aside className={`right-column${hasContextSelection ? '' : ' selection-idle'}`}>
          <Inspector />
          <SelectionPanel />
        </aside>
      </main>
      <footer className="status-bar">
        <span>
          {sidecar === 'ready' ? (
            <>
              <Check size={13} /> Engine ready
            </>
          ) : sidecar === 'offline' ? (
            <>
              <AlertCircle size={13} /> Engine offline
            </>
          ) : (
            'UI prototype · browser preview'
          )}
        </span>
        <span>
          {resolution
            ? `${resolution.artist} - ${resolution.title} [${resolution.version}] · ${formatTime(durationMs)} · 512×384 · osu!standard`
            : 'No verified beatmap loaded · open File to begin'}
        </span>
      </footer>
      {acquisitionOpen && (
        <MapAcquisition
          currentResolution={resolution}
          initialAction={acquisitionAction}
          session={account}
          onClose={() => setAcquisitionOpen(false)}
          onOpenAccount={() => setAccountOpen(true)}
          onResolutionChange={setResolution}
        />
      )}
      {accountOpen && (
        <AccountDialog
          session={account}
          onClose={() => setAccountOpen(false)}
          onSessionChange={setAccount}
          onOpenFiles={() => openAcquisition('open')}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {changelogOpen && <ChangelogDialog onClose={() => setChangelogOpen(false)} />}
      <input
        ref={projectFileInputRef}
        type="file"
        accept={`.${PROJECT_FILE_EXTENSION}`}
        hidden
        onChange={(event) => {
          handleProjectFileSelected(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
