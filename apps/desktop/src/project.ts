import type { EditorState, ImportedReplay, MapInfo, Track } from './stores/editor';
import type { Resolution } from './MapAcquisition';

export const PROJECT_FILE_EXTENSION = 'oreproj';
const PROJECT_VERSION = 1;

/// <summary>
/// The subset of editor view/display state a project file remembers, so reopening it restores
/// playback and playfield preferences alongside the beatmap and its replays.
/// </summary>
export type ProjectView = Pick<
  EditorState,
  | 'playbackRate'
  | 'volume'
  | 'showBackground'
  | 'backgroundDim'
  | 'showGrid'
  | 'compactMode'
  | 'wireframeGameplay'
  | 'fadeAfterClick'
  | 'showHitJudgements'
  | 'showHiddenFade'
  | 'playfieldZoom'
  | 'cursorTrailMs'
  | 'showCursorPast'
  | 'showCursorFuture'
  | 'showInputPaths'
  | 'showClickMarkers'
  | 'cursorSmoothing'
  | 'drawRangeSnap'
  | 'timelineWheelMode'
  | 'timelineWheelStepMs'
  | 'pixelsPerSecond'
  | 'timelineLaneHeight'
>;

type SerializedReplay = Omit<ImportedReplay, 'sourceBytes'> & { sourceBytes: string };
type SerializedTrack = Omit<Track, 'replay' | 'originalReplay'> & {
  replay: SerializedReplay;
  originalReplay: SerializedReplay;
};

export type ProjectFile = {
  version: number;
  beatmapHash: string;
  beatmapTitle?: string;
  tracks: SerializedTrack[];
  archivedTracks?: SerializedTrack[];
  archivedMapInfo?: Record<string, MapInfo>;
  view: ProjectView;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function serializeReplay(replay: ImportedReplay): SerializedReplay {
  return { ...replay, sourceBytes: bytesToBase64(replay.sourceBytes) };
}

function deserializeReplay(replay: SerializedReplay): ImportedReplay {
  return { ...replay, sourceBytes: base64ToBytes(replay.sourceBytes) };
}

export function serializeProject(
  tracks: Track[],
  view: ProjectView,
  resolution: Resolution | null,
  archivedTracks: Track[] = [],
  archivedMapInfo: Record<string, MapInfo> = {},
): ProjectFile {
  const beatmapHash = resolution?.replayHash ?? tracks[0]?.replay.metadata.beatmapHash ?? '';
  const serializeTrack = (track: Track): SerializedTrack => ({
    ...track,
    replay: serializeReplay(track.replay),
    originalReplay: serializeReplay(track.originalReplay),
  });
  return {
    version: PROJECT_VERSION,
    beatmapHash,
    beatmapTitle:
      resolution && resolution.artist && resolution.title ? `${resolution.artist} - ${resolution.title}` : undefined,
    tracks: tracks.map(serializeTrack),
    archivedTracks: archivedTracks.map(serializeTrack),
    archivedMapInfo,
    view,
  };
}

export function projectFileName(project: Pick<ProjectFile, 'beatmapTitle'>): string {
  const base = (project.beatmapTitle ?? 'osu-replay-project').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${base || 'osu-replay-project'}.${PROJECT_FILE_EXTENSION}`;
}

export function parseProjectFile(raw: string): {
  tracks: Track[];
  archivedTracks: Track[];
  archivedMapInfo: Record<string, MapInfo>;
  view: ProjectView;
  beatmapHash: string;
} {
  let parsed: ProjectFile;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a valid project (invalid JSON).');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== PROJECT_VERSION || !Array.isArray(parsed.tracks))
    throw new Error('This file is not a recognised osu! Replay Editor project.');

  const deserializeTrack = (track: SerializedTrack): Track => ({
    ...track,
    replay: deserializeReplay(track.replay),
    originalReplay: deserializeReplay(track.originalReplay),
  });
  const tracks: Track[] = parsed.tracks.map(deserializeTrack);
  const archivedTracks: Track[] = (parsed.archivedTracks ?? []).map(deserializeTrack);
  return {
    tracks,
    archivedTracks,
    archivedMapInfo: parsed.archivedMapInfo ?? {},
    view: parsed.view,
    beatmapHash: parsed.beatmapHash,
  };
}
