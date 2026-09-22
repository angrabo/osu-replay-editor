import { CheckCircle2, FileUp, FolderOpen, MapPinned, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sidecarRequest } from './sidecar';
import { useEditorStore, type ImportedReplay, type MapInfo } from './stores/editor';

export type Session = {
  authenticated: boolean;
  expiresAt: string | null;
  message?: string;
  user: { id: number; username: string; avatarUrl: string } | null;
  verificationRequired: boolean;
  verificationMethod: 'totp' | 'mail' | null;
};
type Header = { beatmapHash: string; playerName: string; mods: number; version: number };
type Difficulty = {
  filename: string;
  checksum: string;
  title: string | null;
  artist: string | null;
  version: string | null;
  creator: string | null;
  audioFilename: string | null;
  backgroundFilename: string | null;
};
export type Resolution = {
  status: string;
  replayHash: string;
  title: string | null;
  artist: string | null;
  creator: string | null;
  version: string | null;
  beatmapsetId: number | null;
  source: string | null;
  error: string | null;
  difficulties: Difficulty[];
  assets: string[];
};

export type AcquisitionAction = 'open' | 'select-replays' | 'select-map' | 'new-map';

export function toMapInfo(resolution: Resolution | null): MapInfo | undefined {
  return resolution
    ? {
        title: resolution.title,
        artist: resolution.artist,
        setId: resolution.beatmapsetId,
        version: resolution.version,
      }
    : undefined;
}

type Props = {
  onClose: () => void;
  onOpenAccount: () => void;
  onResolutionChange: (resolution: Resolution | null) => void;
  currentResolution: Resolution | null;
  session: Session | null;
  initialAction?: AcquisitionAction;
};

export function MapAcquisition({
  onClose,
  onOpenAccount,
  onResolutionChange,
  currentResolution,
  session,
  initialAction = 'open',
}: Props) {
  const currentReplay = useEditorStore.getState().tracks[0]?.replay;
  const [header, setHeader] = useState<Header | null>(() =>
    currentReplay
      ? {
          beatmapHash: currentReplay.metadata.beatmapHash,
          playerName: currentReplay.metadata.playerName,
          mods: currentReplay.metadata.mods,
          version: currentReplay.metadata.version,
        }
      : null,
  );
  const [resolution, setResolution] = useState<Resolution | null>(currentResolution);
  const [pending, setPending] = useState<ImportedReplay[]>([]);
  const [pendingReplacement, setPendingReplacement] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const beatmapInput = useRef<HTMLInputElement>(null);
  const initialActionHandled = useRef(false);
  const previousAuthenticated = useRef(session?.authenticated ?? false);

  function applyResolution(value: Resolution, imported = pending, replacing = pendingReplacement) {
    setResolution(value);
    if (value.status === 'verified') {
      const store = useEditorStore.getState();
      const matching = imported.filter((replay) => replay.metadata.beatmapHash === value.replayHash);
      if (replacing && matching.length) {
        store.archiveActiveMap(toMapInfo(resolution));
        store.clearReplays();
      }
      matching.forEach((replay) => store.importReplay(replay));
      setPending([]);
      setPendingReplacement(false);
      onResolutionChange(value);
    } else if (!replacing) {
      onResolutionChange(null);
    }
  }

  async function resolve(hash: string, imported = pending, replacing = pendingReplacement) {
    setBusy(true);
    setActivity('Finding the exact beatmap…');
    setMessage('');
    try {
      const value = await sidecarRequest<Resolution>(`/api/beatmaps/resolve/${hash}`);
      applyResolution(value, imported, replacing);
      useEditorStore.getState().setMapLoadStatus(hash, value.status === 'verified' ? 'ok' : 'error');
      if (value.status === 'verified')
        setMessage(value.source === 'cache' ? 'Using the cached beatmap.' : 'Beatmap downloaded and ready.');
    } catch (error) {
      if (!replacing) onResolutionChange(null);
      useEditorStore.getState().setMapLoadStatus(hash, 'error');
      setMessage((error as Error).message);
    } finally {
      setActivity(null);
      setBusy(false);
    }
  }

  async function finishReplayImport(imported: ImportedReplay[], replacing: boolean) {
    const hash = imported[0].metadata.beatmapHash;
    setHeader({
      beatmapHash: hash,
      playerName: imported[0].metadata.playerName,
      mods: imported[0].metadata.mods,
      version: imported[0].metadata.version,
    });
    if (!replacing && resolution?.status === 'verified' && resolution.replayHash === hash) {
      imported.forEach((item) => useEditorStore.getState().importReplay(item));
      setMessage(`${imported.length} replay${imported.length === 1 ? '' : 's'} imported.`);
      return;
    }

    setPending(imported);
    setPendingReplacement(replacing);
    await resolve(hash, imported, replacing);
  }

  async function readReplay(files?: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setActivity('Reading replay data…');
    setMessage('');
    try {
      const imported: ImportedReplay[] = [];
      for (const file of Array.from(files)) {
        setActivity(`Reading ${file.name}…`);
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: replay file is too large.`);
        const sourceBytes = new Uint8Array(await file.arrayBuffer());
        const parsed = await sidecarRequest<Pick<ImportedReplay, 'metadata' | 'frames' | 'keyEvents'>>(
          '/api/replays/parse',
          { method: 'POST', body: sourceBytes },
        );
        imported.push({ ...parsed, filename: file.name, sourceBytes });
      }

      const hash = imported[0].metadata.beatmapHash;
      if (imported.some((item) => item.metadata.beatmapHash !== hash))
        throw new Error('Selected replays use different beatmap difficulties. Import matching files together.');

      const existingHash = useEditorStore.getState().tracks[0]?.replay.metadata.beatmapHash;
      await finishReplayImport(imported, !!existingHash && existingHash !== hash);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setActivity(null);
      setBusy(false);
    }
  }

  function newMap() {
    useEditorStore.getState().archiveActiveMap(toMapInfo(resolution));
    useEditorStore.getState().clearReplays();
    setHeader(null);
    setPending([]);
    setPendingReplacement(false);
    setResolution(null);
    onResolutionChange(null);
    setMessage('Choose one or more replay files to start a new map.');
  }

  async function importMap(file?: File) {
    if (!file || !header) return;
    setBusy(true);
    setActivity(`Checking ${file.name}…`);
    setMessage('');
    try {
      if (file.size > 256 * 1024 * 1024) throw new Error('Beatmap archive is too large.');
      const query = new URLSearchParams({ hash: header.beatmapHash, filename: file.name });
      const value = await sidecarRequest<Resolution>(`/api/beatmaps/import?${query}`, {
        method: 'POST',
        body: await file.arrayBuffer(),
      });
      applyResolution(value);
      setMessage(
        value.status === 'verified'
          ? 'Beatmap imported and ready.'
          : value.error || 'This map does not match the replay.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setActivity(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialActionHandled.current) return;
    initialActionHandled.current = true;
    if (initialAction === 'new-map') newMap();
    const timer = window.setTimeout(() => {
      if (initialAction === 'select-replays') replayInput.current?.click();
      if (initialAction === 'select-map') beatmapInput.current?.click();
      if (initialAction === 'open' && header && !currentResolution) void resolve(header.beatmapHash);
    });
    return () => window.clearTimeout(timer);
  }, [initialAction]);

  useEffect(() => {
    const signedInNow = session?.authenticated ?? false;
    if (!previousAuthenticated.current && signedInNow && header && resolution?.status === 'login-required' && !busy)
      void resolve(header.beatmapHash);
    previousAuthenticated.current = signedInNow;
  }, [session?.authenticated]);

  const needsMap = header && resolution?.status !== 'verified';
  const canDownload = session?.authenticated === true;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal acquisition-modal map-flow-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>Open replay</h2>
            <span className="modal-subtitle">The matching beatmap is loaded automatically when available.</span>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <input
          ref={replayInput}
          hidden
          type="file"
          accept=".osr"
          multiple
          onChange={(event) => {
            void readReplay(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={beatmapInput}
          hidden
          type="file"
          accept=".osz,.osu"
          onChange={(event) => {
            void importMap(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        <div className="map-flow-actions">
          <button className="map-flow-primary" disabled={busy} onClick={() => replayInput.current?.click()}>
            <FileUp size={18} />
            <span>
              <strong>Select replay files</strong>
              <small>Open one or more .osr files for the same map</small>
            </span>
          </button>
          <button className="map-flow-new" disabled={busy} onClick={newMap}>
            New map
          </button>
        </div>

        {activity && (
          <div className="acquisition-progress" role="status" aria-live="polite">
            <div className="acquisition-progress-track" role="progressbar" aria-label={activity}>
              <span />
            </div>
            <small>{activity}</small>
          </div>
        )}

        {!header && !activity && (
          <div className="map-flow-empty">
            <MapPinned size={25} />
            <div>
              <strong>No replay selected</strong>
              <small>Select a replay and its exact beatmap will be found automatically.</small>
            </div>
          </div>
        )}

        {resolution?.status === 'verified' && header && (
          <div className="map-flow-ready">
            <CheckCircle2 size={20} />
            <div>
              <strong>
                {resolution.artist} – {resolution.title} [{resolution.version}]
              </strong>
              <small>
                {resolution.source === 'cache' ? 'Loaded from cache' : 'Downloaded from osu!'} · replay by{' '}
                {header.playerName}
              </small>
            </div>
          </div>
        )}

        {needsMap && !activity && (
          <div className="map-flow-needed">
            <MapPinned size={22} />
            <div className="map-flow-needed-copy">
              <strong>Matching beatmap required</strong>
              <p>{resolution?.error || 'The exact difficulty is not available yet.'}</p>
              <small>Replay MD5: {header.beatmapHash}</small>
            </div>
            <div className="map-flow-needed-actions">
              <button className="primary-button" disabled={busy} onClick={() => beatmapInput.current?.click()}>
                <FolderOpen size={16} /> Choose .osz or .osu
              </button>
              {!canDownload && (
                <button disabled={busy} onClick={onOpenAccount}>
                  <UserRound size={16} /> Sign in to download
                </button>
              )}
              {canDownload && resolution && resolution.status !== 'login-required' && (
                <button disabled={busy} onClick={() => void resolve(header.beatmapHash)}>
                  Try download again
                </button>
              )}
            </div>
          </div>
        )}

        {message && (
          <p className="map-flow-message" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
