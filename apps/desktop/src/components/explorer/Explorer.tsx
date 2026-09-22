import { useEffect, useState } from 'react';
import { replayPointAt } from '@ore/beatmap-viewer';
import { AlertTriangle, ChevronDown, File, Folder, Search } from 'lucide-react';
import { TabButton } from '../common/TabButton';
import { useEditorStore, type BeatmapTimelineObject, type MapInfo, type Track } from '../../stores/editor';
import type { Resolution } from '../../MapAcquisition';

const OBJECT_PAGE_SIZE = 150;
const PREVIEW_WINDOW_MS = 150;

type Row = {
  label: string;
  depth: number;
  type: 'folder' | 'file';
  objectIndex?: number;
  object?: BeatmapTimelineObject;
  hasError?: boolean;
  onClick?: () => void;
};

type HoverPreview = { object: BeatmapTimelineObject; top: number; left: number };

function mapGroupLabel(info: MapInfo | undefined, hash: string): string {
  const name =
    info?.artist && info?.title ? `${info.artist} - ${info.title}` : (info?.title ?? `Map ${hash.slice(0, 8)}`);
  const withVersion = info?.version ? `${name} [${info.version}]` : name;
  return info?.setId ? `${withVersion} (${info.setId})` : withVersion;
}

function buildReplayRows(
  tracks: Track[],
  archivedTracks: Track[],
  archivedMapInfo: Record<string, MapInfo>,
  mapLoadStatus: Record<string, 'ok' | 'error'>,
  activeLabel: string,
  onSelectActiveTrack: (trackId: string) => void,
  onSelectArchivedTrack: (hash: string, trackId: string) => void,
): Row[] {
  const activeHash = tracks[0]?.replay.metadata.beatmapHash;
  const groups = new Map<string, { label: string; active: boolean; tracks: Track[] }>();
  for (const track of archivedTracks) {
    const hash = track.replay.metadata.beatmapHash;
    if (!groups.has(hash))
      groups.set(hash, { label: mapGroupLabel(archivedMapInfo[hash], hash), active: false, tracks: [] });
    groups.get(hash)!.tracks.push(track);
  }
  for (const track of tracks) {
    const hash = track.replay.metadata.beatmapHash;
    if (!groups.has(hash))
      groups.set(hash, {
        label: hash === activeHash ? activeLabel : mapGroupLabel(undefined, hash),
        active: hash === activeHash,
        tracks: [],
      });
    groups.get(hash)!.tracks.push(track);
  }
  return Array.from(groups.entries())
    .sort(([, first], [, second]) => first.label.localeCompare(second.label))
    .flatMap(([hash, group]): Row[] => [
      { label: group.label, depth: 0, type: 'folder', hasError: mapLoadStatus[hash] === 'error' },
      ...group.tracks
        .slice()
        .sort((first, second) => first.replay.filename.localeCompare(second.replay.filename))
        .map((track): Row => ({
          label: track.replay.filename,
          depth: 1,
          type: 'file',
          hasError: mapLoadStatus[hash] === 'error',
          onClick: group.active ? () => onSelectActiveTrack(track.id) : () => onSelectArchivedTrack(hash, track.id),
        })),
    ]);
}

export function Explorer({
  resolution,
  onSelectReplayTrack,
}: {
  resolution: Resolution | null;
  onSelectReplayTrack: (beatmapHash: string, trackId: string) => void;
}) {
  const tracks = useEditorStore((state) => state.tracks);
  const archivedTracks = useEditorStore((state) => state.archivedTracks);
  const archivedMapInfo = useEditorStore((state) => state.archivedMapInfo);
  const mapLoadStatus = useEditorStore((state) => state.mapLoadStatus);
  const beatmapObjects = useEditorStore((state) => state.beatmapObjects);
  const previewTrackId = useEditorStore((state) => state.previewTrackId);
  const tab = useEditorStore((state) => state.filesTab);
  const setTab = useEditorStore((state) => state.setFilesTab);
  const setPreviewTrack = useEditorStore((state) => state.setPreviewTrack);
  const selectBeatmapObject = useEditorStore((state) => state.selectBeatmapObject);
  const selectedBeatmapObjectIndex = useEditorStore((state) => state.selectedBeatmapObjectIndex);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const requestTimelineFocus = useEditorStore((state) => state.requestTimelineFocus);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [visibleObjectCount, setVisibleObjectCount] = useState(OBJECT_PAGE_SIZE);
  const [hover, setHover] = useState<HoverPreview | null>(null);
  const previewTrack = tracks.find((track) => track.id === previewTrackId);

  useEffect(() => setVisibleObjectCount(OBJECT_PAGE_SIZE), [beatmapObjects]);

  const activeLabel = mapGroupLabel(
    resolution
      ? {
          title: resolution.title,
          artist: resolution.artist,
          setId: resolution.beatmapsetId,
          version: resolution.version,
        }
      : undefined,
    tracks[0]?.replay.metadata.beatmapHash ?? '',
  );
  const replayRows: Row[] = buildReplayRows(
    tracks,
    archivedTracks,
    archivedMapInfo,
    mapLoadStatus,
    activeLabel,
    (trackId) => setPreviewTrack(trackId),
    onSelectReplayTrack,
  );

  const rows: Row[] =
    tab === 'objects'
      ? beatmapObjects.slice(0, visibleObjectCount).map((object, index): Row => ({
          label: `${object.kind} #${index + 1} · ${Math.round(object.startTime)} ms`,
          depth: 0,
          type: 'file',
          objectIndex: index,
          object,
          onClick: () => {
            selectBeatmapObject(index);
            setPlayhead(object.startTime);
            requestTimelineFocus();
          },
        }))
      : replayRows;
  const remainingObjects = tab === 'objects' ? beatmapObjects.length - visibleObjectCount : 0;

  return (
    <section className="panel explorer-panel">
      <div className="tabs">
        <TabButton active={tab === 'objects'} onClick={() => setTab('objects')}>
          Objects
        </TabButton>
        <TabButton active={tab === 'replay'} onClick={() => setTab('replay')}>
          Replays
        </TabButton>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
      </label>
      <div className="file-tree">
        {rows
          .filter((row) => !search || row.label.toLowerCase().includes(search.toLowerCase()))
          .map((row, index) => {
            const active =
              row.objectIndex !== undefined
                ? selectedBeatmapObjectIndex === row.objectIndex
                : selectedFile === row.label;
            return (
              <button
                key={`${row.label}-${index}`}
                className={`file-row ${active ? 'selected' : ''}`}
                style={{ paddingLeft: 12 + row.depth * 19 }}
                onClick={() => {
                  setSelectedFile(row.label);
                  row.onClick?.();
                }}
                onMouseEnter={(event) => {
                  if (!row.object) return;
                  const box = event.currentTarget.getBoundingClientRect();
                  setHover({ object: row.object, top: box.top, left: box.right + 8 });
                }}
                onMouseLeave={() => setHover(null)}
              >
                {row.type === 'folder' ? (
                  <>
                    <ChevronDown size={12} />
                    <Folder size={15} fill="#efd099" color="#efd099" />
                  </>
                ) : (
                  <>
                    <span className="tree-spacer" />
                    <File size={14} fill="#dce2ea" color="#dce2ea" />
                  </>
                )}
                <span>{row.label}</span>
                {row.hasError && (
                  <span
                    title="Beatmap failed to load"
                    style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center' }}
                  >
                    <AlertTriangle size={13} color="#f2b880" />
                  </span>
                )}
              </button>
            );
          })}
        {tab === 'objects' && remainingObjects > 0 && (
          <button
            className="file-row"
            style={{ paddingLeft: 12, fontStyle: 'italic', opacity: 0.75 }}
            onClick={() => setVisibleObjectCount((count) => count + OBJECT_PAGE_SIZE)}
          >
            <span className="tree-spacer" />
            <span>
              Show {Math.min(OBJECT_PAGE_SIZE, remainingObjects)} more ({remainingObjects} left)
            </span>
          </button>
        )}
      </div>
      {hover && (
        <div
          className="object-hover-preview"
          style={{
            position: 'fixed',
            top: hover.top,
            left: hover.left,
            width: 150,
            pointerEvents: 'none',
            zIndex: 50,
            background: '#151d27',
            border: '1px solid #2b3744',
            borderRadius: 6,
            padding: 4,
          }}
        >
          <svg viewBox="0 0 512 384" width={142} height={106}>
            <rect x={0} y={0} width={512} height={384} fill="#0d131b" />
            {(() => {
              const object = hover.object;
              const cursorPoint = previewTrack ? replayPointAt(previewTrack.replay.frames, object.startTime) : null;
              const trail = previewTrack
                ? previewTrack.replay.frames.filter(
                    (frame) =>
                      frame.timeMs >= object.startTime - PREVIEW_WINDOW_MS &&
                      frame.timeMs <= object.startTime + PREVIEW_WINDOW_MS,
                  )
                : [];
              return (
                <>
                  {trail.length > 1 && (
                    <polyline
                      points={trail.map((frame) => `${frame.x},${frame.y}`).join(' ')}
                      fill="none"
                      stroke="#c875ff"
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  )}
                  {object.kind === 'spinner' ? (
                    <circle cx={256} cy={192} r={90} fill="none" stroke="#5f9eea" strokeWidth={4} />
                  ) : (
                    <circle
                      cx={object.x}
                      cy={object.y}
                      r={28}
                      fill={object.kind === 'slider' ? 'rgba(185,133,245,0.25)' : 'rgba(90,160,255,0.25)'}
                      stroke={object.kind === 'slider' ? '#b985f5' : '#5aa0ff'}
                      strokeWidth={3}
                    />
                  )}
                  {cursorPoint && <circle cx={cursorPoint.x} cy={cursorPoint.y} r={6} fill="#ffffff" />}
                </>
              );
            })()}
          </svg>
        </div>
      )}
    </section>
  );
}
