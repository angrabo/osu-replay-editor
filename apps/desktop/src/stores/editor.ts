import { create } from 'zustand';

export type Track = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  edited: boolean;
  replay: ImportedReplay;
  originalReplay: ImportedReplay;
  exportMetadata: ImportedReplay['metadata'];
  autoScore: boolean;
  inputCuts: InputCut[];
};
export type ReplayFrame = { timeMs: number; deltaMs: number; x: number; y: number; keys: number };
export type InputKey = 'M1' | 'M2' | 'K1' | 'K2';
export type ReplayKeyEvent = { timeMs: number; key: InputKey; down: boolean };
export type InputSelection = { trackId: string; key: InputKey; startTime: number; endTime: number };
export type ClipboardMode = 'inputs' | 'cursor' | 'both';
export type InputClipboard = {
  anchorMs: number;
  inputs: InputSelection[];
  cursorFrames: Pick<ReplayFrame, 'timeMs' | 'x' | 'y'>[];
};
export type CursorStrokePoint = { x: number; y: number; offsetMs: number };
export type CursorSmoothing = 'off' | 'light' | 'medium' | 'strong';
export type EditorSurface = 'gameplay' | 'timeline' | null;
export type InputInterval = InputSelection;
export type InputCut = { key: InputKey; timeMs: number };
export type InputDragMode = 'free' | 'frame';
export type TimelineWheelMode = 'frame' | 'milliseconds';
export type ImportedReplay = {
  filename: string;
  sourceBytes: Uint8Array;
  metadata: {
    beatmapHash: string;
    playerName: string;
    replayHash: string;
    mods: number;
    version: number;
    score: number;
    timestampTicks: string;
    onlineScoreId: string;
    rngSeed: number | null;
    mode?: number;
    client?: 'stable' | 'lazer';
    hitCounts?: number[];
    maxCombo?: number;
    perfect?: boolean;
    lifeGraph?: string;
    targetPracticeAccuracy?: number | null;
    lazerScoreInfo?: string | null;
  };
  frames: ReplayFrame[];
  keyEvents: ReplayKeyEvent[];
};

export type Tool = 'select' | 'hand' | 'draw' | 'curve' | 'split' | 'zoom';
export type Snap = 'off' | 'hit-window' | 'hit-object' | 'all' | 'timing-point' | 'replay-frame';
export type BeatmapTimelineObject = {
  startTime: number;
  endTime: number;
  kind: 'circle' | 'slider' | 'spinner';
  x: number;
  y: number;
};
export type SimulationJudgement = {
  objectIndex: number;
  kind: 'circle' | 'slider' | 'spinner';
  startTime: number;
  endTime: number;
  result: '300' | '100' | '50' | 'miss';
  value: number;
  hitTime: number | null;
  hitError: number | null;
  cursorDistance: number;
  inside: boolean;
  key: InputKey | null;
  comboAfter: number;
  scoreAfter: number;
};
export type SimulationResult = {
  scope: 'whole-replay' | 'selected-area';
  model: string;
  status: string;
  client: 'stable' | 'lazer';
  score: number;
  accuracy: number;
  count300: number;
  count100: number;
  count50: number;
  misses: number;
  maxCombo: number;
  achievedCombo: number;
  totalObjects: number;
  bonusScore: number;
  spinnerSpins: number;
  sliderTicksHit: number;
  sliderTicksTotal: number;
  sliderEndsHit: number;
  sliderEndsTotal: number;
  spinnerSpinsHit: number;
  spinnerSpinsTotal: number;
  spinnerBonusHit: number;
  spinnerBonusTotal: number;
  judgements: SimulationJudgement[];
  warnings: string[];
  countGeki?: number | null;
  countKatu?: number | null;
  perfect?: boolean | null;
};
export function simulationMetadataPatch(
  result: SimulationResult,
  metadata: ImportedReplay['metadata'],
): Partial<ImportedReplay['metadata']> {
  const hitCounts = [...(metadata.hitCounts ?? [0, 0, 0, 0, 0, 0])];
  hitCounts[0] = result.count300;
  hitCounts[1] = result.count100;
  hitCounts[2] = result.count50;
  if (result.countGeki != null) hitCounts[3] = result.countGeki;
  if (result.countKatu != null) hitCounts[4] = result.countKatu;
  hitCounts[5] = result.misses;
  return {
    score: result.score,
    maxCombo: result.maxCombo,
    hitCounts,
    ...(result.perfect == null ? {} : { perfect: result.perfect }),
  };
}
export type SimulationRunState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  result: SimulationResult | null;
  error: string;
};
type TrackSnapshot = Track[];
export type MapInfo = { title: string | null; artist: string | null; setId: number | null; version: string | null };

export type EditorState = {
  tracks: Track[];
  archivedTracks: Track[];
  archivedMapInfo: Record<string, MapInfo>;
  mapLoadStatus: Record<string, 'ok' | 'error'>;
  selectedTrackIds: string[];
  previewTrackId: string | null;
  selectionAnchorId: string | null;
  undoStack: TrackSnapshot[];
  redoStack: TrackSnapshot[];
  playheadMs: number;
  durationMs: number;
  playing: boolean;
  playbackRate: number;
  volume: number;
  showBackground: boolean;
  backgroundDim: number;
  showGrid: boolean;
  compactMode: boolean;
  wireframeGameplay: boolean;
  fadeAfterClick: boolean;
  showHitJudgements: boolean;
  showHiddenFade: boolean;
  playfieldZoom: number;
  cursorTrailMs: number;
  showCursorPast: boolean;
  showCursorFuture: boolean;
  showInputPaths: boolean;
  showClickMarkers: boolean;
  cursorSmoothing: CursorSmoothing;
  drawRangeSnap: boolean;
  editorSurface: EditorSurface;
  beatmapObjects: BeatmapTimelineObject[];
  simulationByTrack: Record<string, SimulationRunState>;
  windowStartMs: number;
  timelineFocusRequest: number;
  pixelsPerSecond: number;
  timelineWheelMode: TimelineWheelMode;
  timelineWheelStepMs: number;
  timelineLaneHeight: number;
  timelineDefaultLaneHeight: number;
  timelineLaneHeightRequest: number;
  tool: Tool;
  snap: Snap;
  selectedInput: InputSelection | null;
  selectedInputs: InputSelection[];
  inputEditPreview: { original: InputSelection; next: InputSelection }[] | null;
  selectedTimeRange: { startMs: number; endMs: number } | null;
  selectedCursorRange: { trackId: string; startMs: number; endMs: number } | null;
  selectedBeatmapObjectIndex: number | null;
  inputClipboard: InputClipboard | null;
  clipboardMode: ClipboardMode;
  lastEditMessage: string;
  selectedCursorFrameMs: number | null;
  inputKey: InputKey;
  inputDragMode: InputDragMode;
  filesTab: 'objects' | 'replay';
  inspectorTab: 'inspector' | 'mods' | 'metadata';
  selectTrack: (id: string, ctrl: boolean, shift: boolean) => void;
  setPreviewTrack: (id: string | null) => void;
  importReplay: (replay: ImportedReplay) => void;
  clearReplays: () => void;
  archiveActiveMap: (mapInfo?: MapInfo) => void;
  promoteArchivedTracks: (beatmapHash: string) => void;
  setMapLoadStatus: (beatmapHash: string, status: 'ok' | 'error') => void;
  loadProjectTracks: (tracks: Track[], archivedTracks?: Track[], archivedMapInfo?: Record<string, MapInfo>) => void;
  setTrackColor: (id: string, color: string) => void;
  setTrackName: (id: string, name: string) => void;
  setTrackMetadata: (id: string, patch: Partial<ImportedReplay['metadata']>, autoScore?: boolean) => void;
  toggleTrackVisibility: (id: string) => void;
  toggleTrackLock: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setPlayhead: (ms: number) => void;
  setDuration: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setShowBackground: (show: boolean) => void;
  setBackgroundDim: (dim: number) => void;
  setShowGrid: (show: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setGameplayFilter: (
    filter: 'wireframeGameplay' | 'fadeAfterClick' | 'showHitJudgements' | 'showHiddenFade',
    enabled: boolean,
  ) => void;
  setPlayfieldZoom: (zoom: number) => void;
  setCursorTrailMs: (duration: number) => void;
  setCursorDisplay: (option: 'past' | 'future' | 'input-paths' | 'click-markers', show: boolean) => void;
  setCursorSmoothing: (smoothing: CursorSmoothing) => void;
  setDrawRangeSnap: (enabled: boolean) => void;
  setEditorSurface: (surface: EditorSurface) => void;
  setBeatmapObjects: (objects: BeatmapTimelineObject[]) => void;
  setSimulationRunning: (trackId: string) => void;
  setSimulationResult: (trackId: string, result: SimulationResult) => void;
  setSimulationError: (trackId: string, error: string) => void;
  setWindowStart: (ms: number) => void;
  requestTimelineFocus: () => void;
  setPixelsPerSecond: (value: number) => void;
  setTimelineWheelMode: (mode: TimelineWheelMode) => void;
  setTimelineWheelStepMs: (value: number) => void;
  setAllTimelineLaneHeights: (value: number) => void;
  saveDefaultTimelineLaneHeight: (value: number) => void;
  resetTimelineLaneHeights: () => void;
  setTool: (tool: Tool) => void;
  setSnap: (snap: Snap) => void;
  selectInput: (input: InputSelection | null, additive?: boolean) => void;
  selectInputs: (inputs: InputSelection[], additive?: boolean) => void;
  setInputEditPreview: (preview: { original: InputSelection; next: InputSelection }[] | null) => void;
  selectTimeRange: (range: { startMs: number; endMs: number } | null) => void;
  selectCursorRange: (range: { trackId: string; startMs: number; endMs: number } | null) => void;
  selectBeatmapObject: (index: number | null) => void;
  copySelectedInputs: () => void;
  setClipboardMode: (mode: ClipboardMode) => void;
  pasteInputs: (inPlace?: boolean, atTimeMs?: number, replaceSelection?: boolean) => void;
  selectCursorFrame: (timeMs: number | null) => void;
  setCursorFramePosition: (trackId: string, timeMs: number, x: number, y: number) => void;
  insertCursorFrame: (trackId: string, timeMs: number, x: number, y: number) => void;
  deleteCursorFrame: (trackId: string, timeMs: number) => void;
  moveCursorFrameTime: (trackId: string, fromMs: number, toMs: number) => void;
  drawCursorPath: (trackId: string, points: CursorStrokePoint[]) => void;
  beginBrushStroke: (trackId: string) => void;
  applyBrushDab: (trackId: string, axis: 'x' | 'y', centerMs: number, radiusMs: number, delta: number) => void;
  interpolateCursorRange: (trackId: string, startTime: number, endTime: number) => void;
  smoothCursorRange: (trackId: string, startTime: number, endTime: number) => void;
  invertCursorAxis: (axis: 'x' | 'y') => void;
  commitInputEdits: (edits: { original: InputSelection | null; next: InputSelection | null }[]) => void;
  setInputKey: (key: InputKey) => void;
  setInputDragMode: (mode: InputDragMode) => void;
  commitInputEdit: (original: InputSelection | null, next: InputSelection | null) => void;
  addInputAtPlayhead: () => void;
  deleteSelectedInput: () => void;
  duplicateSelectedInputs: () => void;
  nudgeSelectedInput: (amountMs: number) => void;
  rippleDeleteSelectedInputs: () => void;
  cutInputAt: (trackId: string, key: InputKey, timeMs: number) => void;
  setFilesTab: (tab: EditorState['filesTab']) => void;
  setInspectorTab: (tab: EditorState['inspectorTab']) => void;
};

const initialTracks: Track[] = [];
const palette = ['#57a5fa', '#53c3ad', '#f2b04c', '#d674ee', '#e66f93', '#8fca63'];
const volumeStorageKey = 'osu-replay-editor.playback-volume';
const backgroundStorageKey = 'osu-replay-editor.playfield-background';
const dimStorageKey = 'osu-replay-editor.playfield-dim';
const gridStorageKey = 'osu-replay-editor.playfield-grid';
const compactModeStorageKey = 'osu-replay-editor.playfield-compact-mode';
const gameplayFilterStorageKeys = {
  wireframeGameplay: 'osu-replay-editor.filter-wireframe',
  fadeAfterClick: 'osu-replay-editor.filter-fade-after-click',
  showHitJudgements: 'osu-replay-editor.filter-hit-judgements',
  showHiddenFade: 'osu-replay-editor.filter-hidden-fade',
} as const;
const zoomStorageKey = 'osu-replay-editor.playfield-zoom';
const trailStorageKey = 'osu-replay-editor.cursor-trail-ms';
const cursorPastStorageKey = 'osu-replay-editor.cursor-past';
const cursorFutureStorageKey = 'osu-replay-editor.cursor-future';
const inputPathsStorageKey = 'osu-replay-editor.cursor-input-paths';
const clickMarkersStorageKey = 'osu-replay-editor.cursor-click-markers';
const smoothingStorageKey = 'osu-replay-editor.cursor-smoothing';
const drawRangeSnapStorageKey = 'osu-replay-editor.draw-range-snap';
const wheelModeStorageKey = 'osu-replay-editor.timeline-wheel-mode';
const wheelStepStorageKey = 'osu-replay-editor.timeline-wheel-step-ms';
const laneHeightStorageKey = 'osu-replay-editor.timeline-lane-height';

function readTimelineLaneHeight(): number {
  try {
    const value = Number(localStorage.getItem(laneHeightStorageKey) ?? 48);
    return Number.isFinite(value) ? Math.max(20, Math.min(140, Math.round(value))) : 48;
  } catch {
    return 48;
  }
}

export function snapTimeWithinRange(time: number, candidates: readonly number[], maxDistanceMs: number): number {
  if (!candidates.length || maxDistanceMs < 0) return time;
  const nearest = candidates.reduce(
    (best, candidate) => (Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best),
    candidates[0],
  );
  return Math.abs(nearest - time) <= maxDistanceMs ? nearest : time;
}

function readTimelineWheelPreferences(): { timelineWheelMode: TimelineWheelMode; timelineWheelStepMs: number } {
  try {
    const mode = localStorage.getItem(wheelModeStorageKey);
    const step = Number(localStorage.getItem(wheelStepStorageKey) ?? 17);
    return {
      timelineWheelMode: mode === 'milliseconds' ? 'milliseconds' : 'frame',
      timelineWheelStepMs: Number.isFinite(step) ? Math.max(1, Math.min(10_000, Math.round(step))) : 17,
    };
  } catch {
    return { timelineWheelMode: 'frame', timelineWheelStepMs: 17 };
  }
}

function readCursorEditingPreferences(): Pick<
  EditorState,
  'showCursorPast' | 'showCursorFuture' | 'showInputPaths' | 'showClickMarkers' | 'cursorSmoothing' | 'drawRangeSnap'
> {
  try {
    const smoothing = localStorage.getItem(smoothingStorageKey);
    return {
      showCursorPast: localStorage.getItem(cursorPastStorageKey) !== 'false',
      showCursorFuture: localStorage.getItem(cursorFutureStorageKey) !== 'false',
      showInputPaths: localStorage.getItem(inputPathsStorageKey) !== 'false',
      showClickMarkers: localStorage.getItem(clickMarkersStorageKey) !== 'false',
      cursorSmoothing: smoothing === 'off' || smoothing === 'light' || smoothing === 'strong' ? smoothing : 'medium',
      drawRangeSnap: localStorage.getItem(drawRangeSnapStorageKey) !== 'false',
    };
  } catch {
    return {
      showCursorPast: true,
      showCursorFuture: true,
      showInputPaths: true,
      showClickMarkers: true,
      cursorSmoothing: 'medium',
      drawRangeSnap: true,
    };
  }
}

export function readSavedVolume(): number {
  try {
    const stored = localStorage.getItem(volumeStorageKey);
    if (stored !== null) {
      const value = Number(stored);
      if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
    }
  } catch {
    /* Local storage can be unavailable in a restricted preview. */
  }
  return 100;
}

export function readPlayfieldPreferences(): Pick<
  EditorState,
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
> {
  try {
    const background = localStorage.getItem(backgroundStorageKey);
    const dim = localStorage.getItem(dimStorageKey);
    const grid = localStorage.getItem(gridStorageKey);
    const compactMode = localStorage.getItem(compactModeStorageKey);
    const zoom = Number(localStorage.getItem(zoomStorageKey) ?? 1);
    const trail = Number(localStorage.getItem(trailStorageKey) ?? 220);
    const dimValue = dim === null ? 62 : Number(dim);
    return {
      showBackground: background === null ? true : background !== 'false',
      backgroundDim: Number.isFinite(dimValue) && dimValue >= 0 && dimValue <= 100 ? dimValue : 62,
      showGrid: grid === null ? true : grid !== 'false',
      compactMode: compactMode === 'true',
      wireframeGameplay: localStorage.getItem(gameplayFilterStorageKeys.wireframeGameplay) === 'true',
      fadeAfterClick: localStorage.getItem(gameplayFilterStorageKeys.fadeAfterClick) === 'true',
      showHitJudgements: localStorage.getItem(gameplayFilterStorageKeys.showHitJudgements) === 'true',
      showHiddenFade: localStorage.getItem(gameplayFilterStorageKeys.showHiddenFade) === 'true',
      playfieldZoom: Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 2.5 ? zoom : 1,
      cursorTrailMs: Number.isFinite(trail) && trail >= 0 && trail <= 5000 ? trail : 220,
    };
  } catch {
    return {
      showBackground: true,
      backgroundDim: 62,
      showGrid: true,
      compactMode: false,
      wireframeGameplay: false,
      fadeAfterClick: false,
      showHitJudgements: false,
      showHiddenFade: false,
      playfieldZoom: 1,
      cursorTrailMs: 220,
    };
  }
}

function snapshot(tracks: Track[]): TrackSnapshot {
  return tracks.map((track) => ({ ...track }));
}

export function timelineStart(tracks: readonly Track[], objects: readonly BeatmapTimelineObject[] = []): number {
  const replayStart = tracks.reduce((earliest, track) => Math.min(earliest, track.replay.frames[0]?.timeMs ?? 0), 0);
  return objects.reduce((earliest, object) => Math.min(earliest, object.startTime), replayStart);
}

export function logicalKeys(rawKeys: number): number {
  return rawKeys & 15 & ~((rawKeys & 12) >> 2);
}

export function adjacentReplayFrameTime(
  frames: readonly ReplayFrame[],
  currentTime: number,
  direction: -1 | 1,
): number | null {
  let low = 0;
  let high = frames.length;
  if (direction > 0) {
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (frames[middle].timeMs <= currentTime) low = middle + 1;
      else high = middle;
    }
    return frames[low]?.timeMs ?? null;
  }
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs < currentTime) low = middle + 1;
    else high = middle;
  }
  return low > 0 ? frames[low - 1].timeMs : null;
}

const inputKeys: InputKey[] = ['M1', 'M2', 'K1', 'K2'];

function rawKeysFromLogical(logical: number, originalRaw: number): number {
  let raw = originalRaw & ~15;
  if ((logical & 1) !== 0) raw |= 1;
  if ((logical & 2) !== 0) raw |= 2;
  if ((logical & 4) !== 0) raw = (raw & ~1) | 5;
  if ((logical & 8) !== 0) raw = (raw & ~2) | 10;
  return raw;
}

function framePositionAt(frames: readonly ReplayFrame[], timeMs: number): { x: number; y: number; keys: number } {
  if (!frames.length) return { x: 256, y: 192, keys: 0 };
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  const before = frames[low - 1];
  const after = frames[low];
  if (!before) return { x: after.x, y: after.y, keys: 0 };
  if (!after || after.timeMs === before.timeMs) return { x: before.x, y: before.y, keys: before.keys };
  const amount = (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
  return {
    x: before.x + (after.x - before.x) * amount,
    y: before.y + (after.y - before.y) * amount,
    keys: before.keys,
  };
}

function ensureFrame(frames: ReplayFrame[], timeMs: number): void {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs < timeMs) low = middle + 1;
    else high = middle;
  }
  if (frames[low]?.timeMs === timeMs) return;
  const point = framePositionAt(frames, timeMs);
  frames.splice(low, 0, { timeMs, deltaMs: 0, x: point.x, y: point.y, keys: point.keys });
}

function rebuildKeyEvents(frames: readonly ReplayFrame[]): ReplayKeyEvent[] {
  const events: ReplayKeyEvent[] = [];
  let previous = 0;
  for (const frame of frames) {
    const current = logicalKeys(frame.keys);
    for (let index = 0; index < inputKeys.length; index++)
      if (((previous ^ current) & (1 << index)) !== 0)
        events.push({ timeMs: frame.timeMs, key: inputKeys[index], down: (current & (1 << index)) !== 0 });
    previous = current;
  }
  return events;
}

export function replayInputIntervals(trackId: string, replay: ImportedReplay): InputInterval[] {
  const active = new Map<InputKey, number>();
  const intervals: InputInterval[] = [];
  for (const event of replay.keyEvents) {
    if (event.down) {
      if (!active.has(event.key)) active.set(event.key, event.timeMs);
    } else {
      const startTime = active.get(event.key);
      if (startTime !== undefined && event.timeMs > startTime)
        intervals.push({ trackId, key: event.key, startTime, endTime: event.timeMs });
      active.delete(event.key);
    }
  }
  const replayEnd = replay.frames.at(-1)?.timeMs ?? 0;
  for (const [key, startTime] of active)
    if (replayEnd > startTime) intervals.push({ trackId, key, startTime, endTime: replayEnd });
  return intervals.sort((a, b) => a.startTime - b.startTime || inputKeys.indexOf(a.key) - inputKeys.indexOf(b.key));
}

export function replayInputSegments(track: Pick<Track, 'id' | 'replay' | 'inputCuts'>): InputInterval[] {
  return replayInputIntervals(track.id, track.replay).flatMap((interval) => {
    const cuts = (track.inputCuts ?? [])
      .filter((cut) => cut.key === interval.key && cut.timeMs > interval.startTime && cut.timeMs < interval.endTime)
      .map((cut) => cut.timeMs)
      .sort((first, second) => first - second);
    const boundaries = [interval.startTime, ...new Set(cuts), interval.endTime];
    return boundaries
      .slice(0, -1)
      .map((startTime, index) => ({ ...interval, startTime, endTime: boundaries[index + 1] }));
  });
}

export function editReplayInputs(
  replay: ImportedReplay,
  edits: readonly { original: InputSelection | null; next: InputSelection | null }[],
): ImportedReplay {
  const frames = replay.frames.map((frame) => ({ ...frame })).sort((a, b) => a.timeMs - b.timeMs);
  const apply = (input: InputSelection, down: boolean) => {
    const startTime = Math.round(input.startTime);
    const endTime = Math.max(startTime + 1, Math.round(input.endTime));
    ensureFrame(frames, startTime);
    ensureFrame(frames, endTime);
    const bit = 1 << inputKeys.indexOf(input.key);
    const conflictingBit = bit === 1 ? 4 : bit === 4 ? 1 : bit === 2 ? 8 : 2;
    for (const frame of frames)
      if (frame.timeMs >= startTime && frame.timeMs < endTime) {
        let logical = logicalKeys(frame.keys);
        logical = down ? (logical & ~conflictingBit) | bit : logical & ~bit;
        frame.keys = rawKeysFromLogical(logical, frame.keys);
      }
  };
  for (const edit of edits) if (edit.original) apply(edit.original, false);
  for (const edit of edits) if (edit.next) apply(edit.next, true);
  frames.forEach((frame, index) => {
    frame.deltaMs = index ? frame.timeMs - frames[index - 1].timeMs : frame.timeMs;
  });
  return { ...replay, frames, keyEvents: rebuildKeyEvents(frames) };
}

export function editReplayInput(
  replay: ImportedReplay,
  original: InputSelection | null,
  next: InputSelection | null,
): ImportedReplay {
  return editReplayInputs(replay, [{ original, next }]);
}

export function drawReplayCursorPath(
  replay: ImportedReplay,
  startMs: number,
  endMs: number,
  points: readonly CursorStrokePoint[],
  smoothing: CursorSmoothing = 'off',
): ImportedReplay {
  const start = Math.round(startMs);
  const end = Math.round(endMs);
  if (end <= start || !points.length) return replay;
  let samples = points
    .map((point) => ({
      x: point.x,
      y: point.y,
      offsetMs: Math.max(0, point.offsetMs),
    }))
    .sort((first, second) => first.offsetMs - second.offsetMs);
  const passes = smoothing === 'light' ? 1 : smoothing === 'medium' ? 3 : smoothing === 'strong' ? 6 : 0;
  for (let pass = 0; pass < passes && samples.length > 2; pass++)
    samples = samples.map((point, index) =>
      index === 0 || index === samples.length - 1
        ? point
        : {
            ...point,
            x: (samples[index - 1].x + point.x * 2 + samples[index + 1].x) / 4,
            y: (samples[index - 1].y + point.y * 2 + samples[index + 1].y) / 4,
          },
    );
  const span = samples.at(-1)!.offsetMs - samples[0].offsetMs;
  const stroke = samples.map((point) => ({
    ...point,
    timeMs: span > 0 ? start + Math.round(((point.offsetMs - samples[0].offsetMs) / span) * (end - start)) : start,
  }));
  if (stroke.length === 1) stroke.push({ ...stroke[0], timeMs: end });
  else {
    stroke[0].timeMs = start;
    stroke[stroke.length - 1].timeMs = end;
  }
  const frames = replay.frames.map((frame) => ({ ...frame })).sort((first, second) => first.timeMs - second.timeMs);
  ensureFrame(frames, start);
  ensureFrame(frames, end);
  for (const point of stroke) ensureFrame(frames, point.timeMs);
  let segment = 0;
  for (const frame of frames) {
    if (frame.timeMs < start || frame.timeMs > end) continue;
    while (segment + 1 < stroke.length - 1 && stroke[segment + 1].timeMs < frame.timeMs) segment++;
    const before = stroke[segment];
    const after = stroke[Math.min(segment + 1, stroke.length - 1)];
    const amount =
      after.timeMs > before.timeMs
        ? Math.max(0, Math.min(1, (frame.timeMs - before.timeMs) / (after.timeMs - before.timeMs)))
        : 1;
    frame.x = Math.round((before.x + (after.x - before.x) * amount) * 10) / 10;
    frame.y = Math.round((before.y + (after.y - before.y) * amount) * 10) / 10;
  }
  frames.forEach((frame, index) => {
    frame.deltaMs = index ? frame.timeMs - frames[index - 1].timeMs : frame.timeMs;
  });
  return { ...replay, frames, keyEvents: rebuildKeyEvents(frames) };
}

export function sameInputSelection(first: InputSelection, second: InputSelection): boolean {
  return (
    first.trackId === second.trackId &&
    first.key === second.key &&
    first.startTime === second.startTime &&
    first.endTime === second.endTime
  );
}

function conflictingInput(first: InputSelection, second: InputSelection): boolean {
  const conflictingKeys =
    first.key === second.key ||
    (first.key === 'M1' && second.key === 'K1') ||
    (first.key === 'K1' && second.key === 'M1') ||
    (first.key === 'M2' && second.key === 'K2') ||
    (first.key === 'K2' && second.key === 'M2');
  return conflictingKeys && first.startTime < second.endTime && second.startTime < first.endTime;
}

export function nearestReplayFrameTime(frames: readonly ReplayFrame[], timeMs: number): number {
  if (!frames.length) return Math.round(timeMs);
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeMs < timeMs) low = middle + 1;
    else high = middle;
  }
  const before = frames[low - 1]?.timeMs;
  const after = frames[low]?.timeMs;
  if (before === undefined) return after;
  if (after === undefined) return before;
  return timeMs - before <= after - timeMs ? before : after;
}

function changeTracks(state: EditorState, next: Track[]): Partial<EditorState> {
  const simulationByTrack = Object.fromEntries(
    Object.entries(state.simulationByTrack).filter(([id]) => {
      const before = state.tracks.find((track) => track.id === id);
      const after = next.find((track) => track.id === id);
      return before?.replay === after?.replay;
    }),
  );
  return {
    tracks: next,
    simulationByTrack,
    undoStack: [...state.undoStack.slice(-99), snapshot(state.tracks)],
    redoStack: [],
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tracks: initialTracks,
  archivedTracks: [],
  archivedMapInfo: {},
  mapLoadStatus: {},
  selectedTrackIds: [],
  previewTrackId: null,
  selectionAnchorId: null,
  undoStack: [],
  redoStack: [],
  playheadMs: 0,
  durationMs: 0,
  playing: false,
  playbackRate: 1,
  volume: readSavedVolume(),
  ...readPlayfieldPreferences(),
  ...readCursorEditingPreferences(),
  editorSurface: null,
  beatmapObjects: [],
  simulationByTrack: {},
  windowStartMs: 0,
  timelineFocusRequest: 0,
  pixelsPerSecond: 138,
  ...readTimelineWheelPreferences(),
  timelineLaneHeight: readTimelineLaneHeight(),
  timelineDefaultLaneHeight: readTimelineLaneHeight(),
  timelineLaneHeightRequest: 0,
  tool: 'select',
  snap: 'off',
  selectedInput: null,
  selectedInputs: [],
  inputEditPreview: null,
  selectedTimeRange: null,
  selectedCursorRange: null,
  selectedBeatmapObjectIndex: null,
  inputClipboard: null,
  clipboardMode: 'inputs',
  lastEditMessage: '',
  selectedCursorFrameMs: null,
  inputKey: 'M1',
  inputDragMode: 'free',
  filesTab: 'replay',
  inspectorTab: 'inspector',
  selectTrack: (id, ctrl, shift) =>
    set((state) => {
      const index = state.tracks.findIndex((track) => track.id === id);
      if (index < 0) return {};
      if (shift && state.selectionAnchorId) {
        const anchor = state.tracks.findIndex((track) => track.id === state.selectionAnchorId);
        const range = state.tracks.slice(Math.min(index, anchor), Math.max(index, anchor) + 1).map((track) => track.id);
        return { selectedTrackIds: ctrl ? [...new Set([...state.selectedTrackIds, ...range])] : range };
      }
      if (ctrl) {
        const selected = state.selectedTrackIds.includes(id)
          ? state.selectedTrackIds.filter((selectedId) => selectedId !== id)
          : [...state.selectedTrackIds, id];
        return { selectedTrackIds: selected, selectionAnchorId: id };
      }
      return { selectedTrackIds: [id], selectionAnchorId: id };
    }),
  setPreviewTrack: (id) => set({ previewTrackId: id }),
  importReplay: (replay) =>
    set((state) => {
      if (state.tracks.some((track) => track.replay.metadata.beatmapHash !== replay.metadata.beatmapHash)) return {};
      const id = crypto.randomUUID();
      const track: Track = {
        id,
        name: replay.metadata.playerName || replay.filename,
        color: palette[state.tracks.length % palette.length],
        visible: true,
        locked: false,
        edited: false,
        replay,
        originalReplay: replay,
        exportMetadata: { ...replay.metadata, hitCounts: [...(replay.metadata.hitCounts ?? [0, 0, 0, 0, 0, 0])] },
        autoScore: false,
        inputCuts: [],
      };
      const lastFrame = replay.frames.at(-1)?.timeMs ?? 0;
      const tracks = [...state.tracks, track];
      return {
        tracks,
        selectedTrackIds: [id],
        selectionAnchorId: id,
        previewTrackId: state.previewTrackId ?? id,
        durationMs: Math.max(state.durationMs, lastFrame),
        windowStartMs: Math.min(state.windowStartMs, timelineStart(tracks, state.beatmapObjects)),
        undoStack: [],
        redoStack: [],
      };
    }),
  clearReplays: () =>
    set({
      tracks: [],
      selectedTrackIds: [],
      previewTrackId: null,
      selectionAnchorId: null,
      selectedInput: null,
      selectedInputs: [],
      inputEditPreview: null,
      selectedTimeRange: null,
      selectedCursorRange: null,
      selectedBeatmapObjectIndex: null,
      inputClipboard: null,
      lastEditMessage: '',
      selectedCursorFrameMs: null,
      undoStack: [],
      redoStack: [],
      simulationByTrack: {},
    }),
  archiveActiveMap: (mapInfo) =>
    set((state) => {
      if (!state.tracks.length) return {};
      const hash = state.tracks[0].replay.metadata.beatmapHash;
      return {
        archivedTracks: [...state.archivedTracks, ...state.tracks],
        archivedMapInfo: mapInfo ? { ...state.archivedMapInfo, [hash]: mapInfo } : state.archivedMapInfo,
      };
    }),
  setMapLoadStatus: (beatmapHash, status) =>
    set((state) => ({ mapLoadStatus: { ...state.mapLoadStatus, [beatmapHash]: status } })),
  promoteArchivedTracks: (beatmapHash) =>
    set((state) => {
      const promoted = state.archivedTracks.filter((track) => track.replay.metadata.beatmapHash === beatmapHash);
      if (!promoted.length) return {};
      const lastFrame = Math.max(0, ...promoted.map((track) => track.replay.frames.at(-1)?.timeMs ?? 0));
      return {
        tracks: promoted,
        archivedTracks: state.archivedTracks.filter((track) => track.replay.metadata.beatmapHash !== beatmapHash),
        selectedTrackIds: [],
        previewTrackId: promoted[0]?.id ?? null,
        selectionAnchorId: null,
        selectedInput: null,
        selectedInputs: [],
        inputEditPreview: null,
        selectedTimeRange: null,
        selectedCursorRange: null,
        selectedBeatmapObjectIndex: null,
        inputClipboard: null,
        lastEditMessage: `Loaded ${promoted.length} replay${promoted.length === 1 ? '' : 's'} for this map.`,
        selectedCursorFrameMs: null,
        durationMs: Math.max(state.durationMs, lastFrame),
        undoStack: [],
        redoStack: [],
        simulationByTrack: {},
      };
    }),
  loadProjectTracks: (tracks, archivedTracks = [], archivedMapInfo = {}) =>
    set((state) => {
      const lastFrame = Math.max(0, ...tracks.map((track) => track.replay.frames.at(-1)?.timeMs ?? 0));
      return {
        tracks,
        archivedTracks,
        archivedMapInfo,
        selectedTrackIds: [],
        previewTrackId: tracks[0]?.id ?? null,
        selectionAnchorId: null,
        selectedInput: null,
        selectedInputs: [],
        inputEditPreview: null,
        selectedTimeRange: null,
        selectedCursorRange: null,
        selectedBeatmapObjectIndex: null,
        inputClipboard: null,
        lastEditMessage: `Loaded project with ${tracks.length} replay${tracks.length === 1 ? '' : 's'}.`,
        selectedCursorFrameMs: null,
        durationMs: Math.max(state.durationMs, lastFrame),
        undoStack: [],
        redoStack: [],
        simulationByTrack: {},
      };
    }),
  setTrackColor: (id, color) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    set((state) =>
      changeTracks(
        state,
        state.tracks.map((track) => (track.id === id ? { ...track, color } : track)),
      ),
    );
  },
  setTrackName: (id, name) => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return;
    set((state) =>
      changeTracks(
        state,
        state.tracks.map((track) => (track.id === id ? { ...track, name: trimmed } : track)),
      ),
    );
  },
  setTrackMetadata: (id, patch, autoScore) =>
    set((state) => {
      const current = state.tracks.find((track) => track.id === id);
      if (!current || current.locked) return {};
      const next = { ...current.exportMetadata, ...patch };
      const modsChanged = next.mods !== current.exportMetadata.mods || next.version !== current.exportMetadata.version;
      const tracks = state.tracks.map((track) =>
        track.id === id
          ? {
              ...track,
              edited: true,
              exportMetadata: next,
              autoScore: autoScore ?? (patch.score !== undefined ? false : track.autoScore),
            }
          : track,
      );
      const simulationByTrack = { ...state.simulationByTrack };
      if (modsChanged) delete simulationByTrack[id];
      else if (simulationByTrack[id]?.result?.status === 'verified')
        simulationByTrack[id] = {
          ...simulationByTrack[id],
          result: { ...simulationByTrack[id].result!, status: 'estimate' },
        };
      return { ...changeTracks(state, tracks), simulationByTrack };
    }),
  toggleTrackVisibility: (id) =>
    set((state) =>
      changeTracks(
        state,
        state.tracks.map((track) => (track.id === id ? { ...track, visible: !track.visible } : track)),
      ),
    ),
  toggleTrackLock: (id) =>
    set((state) =>
      changeTracks(
        state,
        state.tracks.map((track) => (track.id === id ? { ...track, locked: !track.locked } : track)),
      ),
    ),
  undo: () =>
    set((state) => {
      if (!state.undoStack.length) return {};
      const previous = state.undoStack.at(-1)!;
      return {
        tracks: snapshot(previous),
        selectedInput: null,
        selectedInputs: [],
        selectedTimeRange: null,
        simulationByTrack: {},
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot(state.tracks)],
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.redoStack.length) return {};
      const next = state.redoStack.at(-1)!;
      return {
        tracks: snapshot(next),
        selectedInput: null,
        selectedInputs: [],
        selectedTimeRange: null,
        simulationByTrack: {},
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, snapshot(state.tracks)],
      };
    }),
  setPlayhead: (ms) =>
    set((state) => ({
      playheadMs: Math.max(timelineStart(state.tracks, state.beatmapObjects), Math.min(state.durationMs, ms)),
    })),
  setDuration: (ms) =>
    set((state) => {
      const durationMs = Math.max(0, ms, ...state.tracks.map((track) => track.replay.frames.at(-1)?.timeMs ?? 0));
      return { durationMs, playheadMs: Math.min(state.playheadMs, durationMs) };
    }),
  setPlaying: (playing) => set({ playing }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => {
    if (!Number.isFinite(volume)) return;
    const value = Math.max(0, Math.min(100, Math.round(volume)));
    try {
      localStorage.setItem(volumeStorageKey, String(value));
    } catch {
      /* Playback still works without persistence. */
    }
    set({ volume: value });
  },
  setShowBackground: (showBackground) => {
    try {
      localStorage.setItem(backgroundStorageKey, String(showBackground));
    } catch {
      /* The current session remains usable. */
    }
    set({ showBackground });
  },
  setBackgroundDim: (dim) => {
    if (!Number.isFinite(dim)) return;
    const backgroundDim = Math.max(0, Math.min(100, Math.round(dim)));
    try {
      localStorage.setItem(dimStorageKey, String(backgroundDim));
    } catch {
      /* The current session remains usable. */
    }
    set({ backgroundDim });
  },
  setShowGrid: (showGrid) => {
    try {
      localStorage.setItem(gridStorageKey, String(showGrid));
    } catch {
      /* The current session remains usable. */
    }
    set({ showGrid });
  },
  setCompactMode: (compactMode) => {
    try {
      localStorage.setItem(compactModeStorageKey, String(compactMode));
    } catch {
      /* The current session remains usable. */
    }
    set({ compactMode });
  },
  setGameplayFilter: (filter, enabled) => {
    try {
      localStorage.setItem(gameplayFilterStorageKeys[filter], String(enabled));
    } catch {
      /* The current session remains usable. */
    }
    set({ [filter]: enabled } as Pick<EditorState, typeof filter>);
  },
  setPlayfieldZoom: (zoom) => {
    if (!Number.isFinite(zoom)) return;
    const playfieldZoom = Math.max(0.5, Math.min(2.5, Math.round(zoom * 10) / 10));
    try {
      localStorage.setItem(zoomStorageKey, String(playfieldZoom));
    } catch {
      /* The current session remains usable. */
    }
    set({ playfieldZoom });
  },
  setCursorTrailMs: (duration) => {
    if (!Number.isFinite(duration)) return;
    const cursorTrailMs = Math.max(0, Math.min(5000, Math.round(duration / 10) * 10));
    try {
      localStorage.setItem(trailStorageKey, String(cursorTrailMs));
    } catch {
      /* The current session remains usable. */
    }
    set({ cursorTrailMs });
  },
  setCursorDisplay: (option, show) => {
    const mapping = {
      past: ['showCursorPast', cursorPastStorageKey],
      future: ['showCursorFuture', cursorFutureStorageKey],
      'input-paths': ['showInputPaths', inputPathsStorageKey],
      'click-markers': ['showClickMarkers', clickMarkersStorageKey],
    } as const;
    const [field, storageKey] = mapping[option];
    try {
      localStorage.setItem(storageKey, String(show));
    } catch {
      /* The current session remains usable. */
    }
    set({ [field]: show } as Pick<EditorState, typeof field>);
  },
  setCursorSmoothing: (cursorSmoothing) => {
    try {
      localStorage.setItem(smoothingStorageKey, cursorSmoothing);
    } catch {
      /* The current session remains usable. */
    }
    set({ cursorSmoothing });
  },
  setDrawRangeSnap: (drawRangeSnap) => {
    try {
      localStorage.setItem(drawRangeSnapStorageKey, String(drawRangeSnap));
    } catch {
      /* The current session remains usable. */
    }
    set({ drawRangeSnap });
  },
  setEditorSurface: (editorSurface) => set({ editorSurface }),
  setBeatmapObjects: (beatmapObjects) => set({ beatmapObjects, selectedBeatmapObjectIndex: null }),
  setSimulationRunning: (trackId) =>
    set((state) => ({
      simulationByTrack: { ...state.simulationByTrack, [trackId]: { status: 'running', result: null, error: '' } },
    })),
  setSimulationResult: (trackId, result) =>
    set((state) => ({
      simulationByTrack: { ...state.simulationByTrack, [trackId]: { status: 'ready', result, error: '' } },
      tracks:
        result.scope === 'whole-replay'
          ? state.tracks.map((track) =>
              track.id === trackId && track.autoScore
                ? {
                    ...track,
                    exportMetadata: {
                      ...track.exportMetadata,
                      ...simulationMetadataPatch(result, track.exportMetadata),
                    },
                  }
                : track,
            )
          : state.tracks,
    })),
  setSimulationError: (trackId, error) =>
    set((state) => ({
      simulationByTrack: { ...state.simulationByTrack, [trackId]: { status: 'error', result: null, error } },
    })),
  setWindowStart: (ms) =>
    set((state) => ({ windowStartMs: Math.max(timelineStart(state.tracks, state.beatmapObjects), ms) })),
  requestTimelineFocus: () => set((state) => ({ timelineFocusRequest: state.timelineFocusRequest + 1 })),
  setPixelsPerSecond: (value) => {
    if (Number.isFinite(value)) set({ pixelsPerSecond: Math.max(20, Math.min(5000, Math.round(value))) });
  },
  setTimelineWheelMode: (timelineWheelMode) => {
    try {
      localStorage.setItem(wheelModeStorageKey, timelineWheelMode);
    } catch {
      /* The current session remains usable. */
    }
    set({ timelineWheelMode });
  },
  setTimelineWheelStepMs: (value) => {
    if (!Number.isFinite(value)) return;
    const timelineWheelStepMs = Math.max(1, Math.min(10_000, Math.round(value)));
    try {
      localStorage.setItem(wheelStepStorageKey, String(timelineWheelStepMs));
    } catch {
      /* The current session remains usable. */
    }
    set({ timelineWheelStepMs });
  },
  setAllTimelineLaneHeights: (value) => {
    if (!Number.isFinite(value)) return;
    const timelineLaneHeight = Math.max(20, Math.min(140, Math.round(value)));
    set((state) => ({ timelineLaneHeight, timelineLaneHeightRequest: state.timelineLaneHeightRequest + 1 }));
  },
  saveDefaultTimelineLaneHeight: (value) => {
    if (!Number.isFinite(value)) return;
    const timelineDefaultLaneHeight = Math.max(20, Math.min(140, Math.round(value)));
    try {
      localStorage.setItem(laneHeightStorageKey, String(timelineDefaultLaneHeight));
    } catch {
      /* Session setting still applies. */
    }
    set((state) => ({
      timelineLaneHeight: timelineDefaultLaneHeight,
      timelineDefaultLaneHeight,
      timelineLaneHeightRequest: state.timelineLaneHeightRequest + 1,
    }));
  },
  resetTimelineLaneHeights: () =>
    set((state) => ({
      timelineLaneHeight: state.timelineDefaultLaneHeight,
      timelineLaneHeightRequest: state.timelineLaneHeightRequest + 1,
    })),
  setTool: (tool) => set({ tool }),
  setSnap: (snap) => set({ snap }),
  selectInput: (input, additive = false) =>
    set((state) => {
      if (!input)
        return { selectedInput: null, selectedInputs: [], selectedTimeRange: null, selectedCursorRange: null };
      if (!additive)
        return {
          selectedInput: input,
          selectedInputs: [input],
          selectedTimeRange: null,
          selectedCursorRange: null,
          selectedBeatmapObjectIndex: null,
        };
      const exists = state.selectedInputs.some((item) => sameInputSelection(item, input));
      const selectedInputs = exists
        ? state.selectedInputs.filter((item) => !sameInputSelection(item, input))
        : [...state.selectedInputs, input];
      return { selectedInputs, selectedInput: selectedInputs.at(-1) ?? null, selectedTimeRange: null };
    }),
  selectInputs: (inputs, additive = false) =>
    set((state) => {
      const selectedInputs = additive ? [...state.selectedInputs] : [];
      for (const input of inputs)
        if (!selectedInputs.some((item) => sameInputSelection(item, input))) selectedInputs.push(input);
      return {
        selectedInputs,
        selectedInput: selectedInputs.at(-1) ?? null,
        selectedTimeRange: null,
        selectedBeatmapObjectIndex: null,
        selectedCursorRange: additive ? state.selectedCursorRange : null,
      };
    }),
  setInputEditPreview: (inputEditPreview) => set({ inputEditPreview }),
  selectTimeRange: (selectedTimeRange) =>
    set((state) => ({
      selectedTimeRange,
      selectedBeatmapObjectIndex: null,
      selectedCursorRange:
        selectedTimeRange && state.previewTrackId ? { ...selectedTimeRange, trackId: state.previewTrackId } : null,
    })),
  selectCursorRange: (selectedCursorRange) => set({ selectedCursorRange, selectedBeatmapObjectIndex: null }),
  selectBeatmapObject: (selectedBeatmapObjectIndex) =>
    set({
      selectedBeatmapObjectIndex,
      selectedInput: null,
      selectedInputs: [],
      selectedTimeRange: null,
      selectedCursorRange: null,
      selectedCursorFrameMs: null,
    }),
  setClipboardMode: (clipboardMode) => set({ clipboardMode }),
  copySelectedInputs: () =>
    set((state) => {
      const inputs = state.clipboardMode === 'cursor' ? [] : state.selectedInputs.map((input) => ({ ...input }));
      const cursorRange =
        state.selectedCursorRange ??
        (state.selectedTimeRange && state.previewTrackId
          ? { ...state.selectedTimeRange, trackId: state.previewTrackId }
          : null) ??
        (state.selectedCursorFrameMs === null || !state.previewTrackId
          ? null
          : {
              trackId: state.previewTrackId,
              startMs: Math.min(state.selectedCursorFrameMs, state.playheadMs),
              endMs: Math.max(state.selectedCursorFrameMs, state.playheadMs),
            });
      const source = state.tracks.find((track) => track.id === cursorRange?.trackId);
      const cursorFrames =
        state.clipboardMode === 'inputs' || !source || !cursorRange || !source.replay.frames.length
          ? []
          : [
              { timeMs: cursorRange.startMs, ...framePositionAt(source.replay.frames, cursorRange.startMs) },
              ...source.replay.frames.filter(
                (frame) => frame.timeMs > cursorRange.startMs && frame.timeMs < cursorRange.endMs,
              ),
              ...(cursorRange.endMs > cursorRange.startMs
                ? [{ timeMs: cursorRange.endMs, ...framePositionAt(source.replay.frames, cursorRange.endMs) }]
                : []),
            ].map(({ timeMs, x, y }) => ({ timeMs, x, y }));
      if (!inputs.length && !cursorFrames.length)
        return { lastEditMessage: 'Select inputs or a cursor frame range before copying.' };
      return {
        inputClipboard: {
          anchorMs: Math.min(...inputs.map((input) => input.startTime), ...cursorFrames.map((frame) => frame.timeMs)),
          inputs,
          cursorFrames,
        },
        lastEditMessage: `${inputs.length} input${inputs.length === 1 ? '' : 's'} and ${cursorFrames.length} cursor frame${cursorFrames.length === 1 ? '' : 's'} copied.`,
      };
    }),
  pasteInputs: (inPlace = false, atTimeMs, replaceSelection = false) =>
    set((state) => {
      const clipboard = state.inputClipboard;
      const target =
        state.tracks.find((track) => state.selectedTrackIds.includes(track.id) && !track.locked) ??
        state.tracks.find((track) => track.id === state.previewTrackId && !track.locked);
      if (!clipboard) return {};
      if (!target) return { lastEditMessage: 'Choose an unlocked destination track.' };
      const replaced = replaceSelection ? state.selectedInputs.filter((input) => input.trackId === target.id) : [];
      if (replaceSelection && (!replaced.length || !clipboard.inputs.length))
        return { lastEditMessage: 'Select destination inputs and copy input intervals before replacing.' };
      const destinationTime = replaceSelection
        ? Math.min(...replaced.map((input) => input.startTime))
        : Math.round(atTimeMs ?? state.playheadMs);
      const shift = inPlace ? 0 : destinationTime - clipboard.anchorMs;
      const next = clipboard.inputs.map((input) => ({
        ...input,
        trackId: target.id,
        startTime: input.startTime + shift,
        endTime: input.endTime + shift,
      }));
      if (
        next.some((input) => input.startTime < timelineStart(state.tracks, state.beatmapObjects)) ||
        clipboard.cursorFrames.some((frame) => frame.timeMs + shift < timelineStart(state.tracks, state.beatmapObjects))
      )
        return { lastEditMessage: 'Paste starts before the timeline.' };
      const existing = replayInputSegments(target).filter(
        (input) => !replaced.some((item) => sameInputSelection(item, input)),
      );
      if (
        next.some(
          (input, index) =>
            existing.some((item) => conflictingInput(input, item)) ||
            next.slice(index + 1).some((item) => conflictingInput(input, item)),
        )
      )
        return { lastEditMessage: 'Paste overlaps an existing or copied input on this track.' };
      const edits = [
        ...replaced.map((original) => ({ original, next: null as InputSelection | null })),
        ...next.map((input) => ({ original: null as InputSelection | null, next: input })),
      ];
      const replay = edits.length
        ? editReplayInputs(target.replay, edits)
        : { ...target.replay, frames: target.replay.frames.map((frame) => ({ ...frame })) };
      for (const copied of clipboard.cursorFrames) {
        const timeMs = copied.timeMs + shift;
        ensureFrame(replay.frames, timeMs);
        const frame = replay.frames.find((item) => item.timeMs === timeMs)!;
        frame.x = copied.x;
        frame.y = copied.y;
      }
      replay.frames.forEach((frame, index) => {
        frame.deltaMs = index ? frame.timeMs - replay.frames[index - 1].timeMs : frame.timeMs;
      });
      const tracks = state.tracks.map((track) => (track.id === target.id ? { ...track, replay, edited: true } : track));
      return {
        ...changeTracks(state, tracks),
        selectedInputs: next,
        selectedInput: next.at(-1) ?? null,
        selectedCursorFrameMs: clipboard.cursorFrames.at(-1)
          ? clipboard.cursorFrames.at(-1)!.timeMs + shift
          : state.selectedCursorFrameMs,
        durationMs: Math.max(state.durationMs, replay.frames.at(-1)?.timeMs ?? 0),
        playing: false,
        lastEditMessage: `${replaceSelection ? `Replaced ${replaced.length} selected input${replaced.length === 1 ? '' : 's'} with` : 'Pasted'} ${next.length} input${next.length === 1 ? '' : 's'} and ${clipboard.cursorFrames.length} cursor frame${clipboard.cursorFrames.length === 1 ? '' : 's'} ${replaceSelection ? 'on' : 'to'} ${target.name}.`,
      };
    }),
  selectCursorFrame: (timeMs) => set({ selectedCursorFrameMs: timeMs === null ? null : Math.round(timeMs) }),
  setCursorFramePosition: (trackId, timeMs, x, y) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked || !Number.isFinite(x) || !Number.isFinite(y)) return {};
      const targetTime = Math.round(timeMs);
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      ensureFrame(frames, targetTime);
      const frame = frames.find((item) => item.timeMs === targetTime);
      if (!frame) return {};
      const nextX = Math.round(x * 10) / 10;
      const nextY = Math.round(y * 10) / 10;
      if (frame.x === nextX && frame.y === nextY) return {};
      frame.x = nextX;
      frame.y = nextY;
      frames.forEach((item, index) => {
        item.deltaMs = index ? item.timeMs - frames[index - 1].timeMs : item.timeMs;
      });
      const tracks = state.tracks.map((item) =>
        item.id === trackId ? { ...item, edited: true, replay: { ...item.replay, frames } } : item,
      );
      return { ...changeTracks(state, tracks), selectedCursorFrameMs: targetTime, playing: false };
    }),
  insertCursorFrame: (trackId, timeMs, x, y) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track.' };
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      const target = Math.round(timeMs);
      let index = 0;
      while (index < frames.length && frames[index].timeMs < target) index++;
      if (frames[index]?.timeMs === target)
        return { selectedCursorFrameMs: target, lastEditMessage: `Cursor frame already exists at ${target} ms.` };
      if (index === 0 || index >= frames.length)
        return { lastEditMessage: 'Add cursor nodes between existing replay frames.' };
      const point = framePositionAt(frames, target);
      frames.splice(index, 0, {
        timeMs: target,
        deltaMs: 0,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        keys: point.keys,
      });
      frames.forEach((frame, item) => {
        frame.deltaMs = item ? frame.timeMs - frames[item - 1].timeMs : frame.timeMs;
      });
      const tracks = state.tracks.map((item) =>
        item.id === trackId
          ? { ...item, edited: true, replay: { ...item.replay, frames, keyEvents: rebuildKeyEvents(frames) } }
          : item,
      );
      return {
        ...changeTracks(state, tracks),
        selectedCursorFrameMs: target,
        playing: false,
        lastEditMessage: `Added cursor node at ${target} ms.`,
      };
    }),
  deleteCursorFrame: (trackId, timeMs) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track.' };
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      const target = Math.round(timeMs);
      const index = frames.findIndex((frame) => frame.timeMs === target);
      if (index <= 0 || index >= frames.length - 1)
        return { lastEditMessage: 'The first and last replay frames cannot be removed.' };
      if (logicalKeys(frames[index - 1].keys) !== logicalKeys(frames[index].keys))
        return { lastEditMessage: 'This node changes an input. Remove or move that input on the timeline.' };
      frames.splice(index, 1);
      frames.forEach((frame, item) => {
        frame.deltaMs = item ? frame.timeMs - frames[item - 1].timeMs : frame.timeMs;
      });
      const tracks = state.tracks.map((item) =>
        item.id === trackId
          ? { ...item, edited: true, replay: { ...item.replay, frames, keyEvents: rebuildKeyEvents(frames) } }
          : item,
      );
      return {
        ...changeTracks(state, tracks),
        selectedCursorFrameMs: null,
        playing: false,
        lastEditMessage: `Removed cursor node at ${target} ms.`,
      };
    }),
  moveCursorFrameTime: (trackId, fromMs, toMs) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track.' };
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      const index = frames.findIndex((frame) => frame.timeMs === Math.round(fromMs));
      if (index <= 0 || index >= frames.length - 1)
        return { lastEditMessage: 'Select an interior cursor frame to change segment speed.' };
      if (logicalKeys(frames[index - 1].keys) !== logicalKeys(frames[index].keys))
        return { lastEditMessage: 'This frame changes an input. Move its input timing on the timeline instead.' };
      const target = Math.round(toMs);
      if (target === frames[index].timeMs) return {};
      if (target <= frames[index - 1].timeMs || target >= frames[index + 1].timeMs)
        return { lastEditMessage: 'Frame time must stay between its neighboring frames.' };
      frames[index].timeMs = target;
      frames.forEach((frame, item) => {
        frame.deltaMs = item ? frame.timeMs - frames[item - 1].timeMs : frame.timeMs;
      });
      const replay = { ...track.replay, frames, keyEvents: rebuildKeyEvents(frames) };
      const tracks = state.tracks.map((item) => (item.id === trackId ? { ...item, edited: true, replay } : item));
      return {
        ...changeTracks(state, tracks),
        selectedCursorFrameMs: target,
        playing: false,
        lastEditMessage: `Moved cursor frame to ${target} ms.`,
      };
    }),
  drawCursorPath: (trackId, points) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track to draw.' };
      const range = state.selectedTimeRange;
      if (!range || range.endMs <= range.startMs)
        return { lastEditMessage: 'Alt-drag a time range on the timeline before drawing.' };
      if (!points.length) return {};
      const replay = drawReplayCursorPath(track.replay, range.startMs, range.endMs, points, state.cursorSmoothing);
      if (replay === track.replay) return {};
      const tracks = state.tracks.map((item) => (item.id === trackId ? { ...item, edited: true, replay } : item));
      return {
        ...changeTracks(state, tracks),
        selectedCursorFrameMs: range.startMs,
        playing: false,
        lastEditMessage: `Drew cursor path from ${range.startMs} to ${range.endMs} ms on ${track.name}.`,
      };
    }),
  beginBrushStroke: (trackId) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track) return {};
      return {
        undoStack: [...state.undoStack.slice(-99), snapshot(state.tracks)],
        redoStack: [],
        playing: false,
      };
    }),
  applyBrushDab: (trackId, axis, centerMs, radiusMs, delta) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked || radiusMs <= 0 || delta === 0) return {};
      const bound = axis === 'x' ? 512 : 384;
      const frames = track.replay.frames.map((frame) => {
        const distance = Math.abs(frame.timeMs - centerMs);
        if (distance >= radiusMs) return frame;
        const weight = 1 - distance / radiusMs;
        const eased = weight * weight;
        const value = axis === 'x' ? frame.x : frame.y;
        const nextValue = Math.max(0, Math.min(bound, value + delta * eased));
        return axis === 'x'
          ? { ...frame, x: Math.round(nextValue * 10) / 10 }
          : { ...frame, y: Math.round(nextValue * 10) / 10 };
      });
      const tracks = state.tracks.map((item) =>
        item.id === trackId ? { ...item, edited: true, replay: { ...item.replay, frames } } : item,
      );
      return {
        tracks,
        simulationByTrack: {},
        lastEditMessage: `Brushed cursor ${axis.toUpperCase()} on ${track.name}.`,
      };
    }),
  interpolateCursorRange: (trackId, startTime, endTime) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track.' };
      if (endTime <= startTime) return { lastEditMessage: 'Select a cursor range before deleting it.' };
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      ensureFrame(frames, Math.round(startTime));
      ensureFrame(frames, Math.round(endTime));
      const startPoint = framePositionAt(frames, startTime);
      const endPoint = framePositionAt(frames, endTime);
      for (const frame of frames)
        if (frame.timeMs > startTime && frame.timeMs < endTime) {
          const amount = (frame.timeMs - startTime) / (endTime - startTime);
          frame.x = Math.round((startPoint.x + (endPoint.x - startPoint.x) * amount) * 10) / 10;
          frame.y = Math.round((startPoint.y + (endPoint.y - startPoint.y) * amount) * 10) / 10;
        }
      const tracks = state.tracks.map((item) =>
        item.id === trackId ? { ...item, edited: true, replay: { ...item.replay, frames } } : item,
      );
      return {
        ...changeTracks(state, tracks),
        playing: false,
        lastEditMessage: `Cleared cursor movement from ${Math.round(startTime)} to ${Math.round(endTime)} ms on ${track.name}.`,
      };
    }),
  smoothCursorRange: (trackId, startTime, endTime) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track.' };
      const frames = track.replay.frames.map((frame) => ({ ...frame }));
      const indices = frames.flatMap((frame, index) =>
        frame.timeMs >= startTime && frame.timeMs <= endTime ? [index] : [],
      );
      if (indices.length < 3) return { lastEditMessage: 'Select at least three cursor frames to smooth.' };
      const source = frames.map((frame) => ({ x: frame.x, y: frame.y }));
      for (const index of indices) {
        if (index === 0 || index === frames.length - 1) continue;
        frames[index].x = Math.round(((source[index - 1].x + source[index].x * 2 + source[index + 1].x) / 4) * 10) / 10;
        frames[index].y = Math.round(((source[index - 1].y + source[index].y * 2 + source[index + 1].y) / 4) * 10) / 10;
      }
      const tracks = state.tracks.map((item) =>
        item.id === trackId ? { ...item, edited: true, replay: { ...item.replay, frames } } : item,
      );
      return {
        ...changeTracks(state, tracks),
        playing: false,
        lastEditMessage: `Smoothed ${indices.length} cursor frames on ${track.name}.`,
      };
    }),
  invertCursorAxis: (axis) =>
    set((state) => {
      const track =
        state.tracks.find((item) => item.id === state.previewTrackId) ??
        state.tracks.find((item) => state.selectedTrackIds.includes(item.id));
      if (!track || track.locked) return { lastEditMessage: 'Choose an unlocked replay track to invert.' };
      const range = state.selectedTimeRange;
      const frames = track.replay.frames.map((frame) => {
        if (range && (frame.timeMs < range.startMs || frame.timeMs > range.endMs)) return frame;
        return axis === 'x' ? { ...frame, x: 512 - frame.x } : { ...frame, y: 384 - frame.y };
      });
      const changed = frames.filter((frame, index) => frame !== track.replay.frames[index]).length;
      if (!changed) return { lastEditMessage: 'The selected time range contains no replay frames.' };
      const tracks = state.tracks.map((item) =>
        item.id === track.id ? { ...item, edited: true, replay: { ...item.replay, frames } } : item,
      );
      return {
        ...changeTracks(state, tracks),
        playing: false,
        lastEditMessage: `Inverted ${axis.toUpperCase()} for ${changed} cursor frames on ${track.name}${range ? ` (${range.startMs}–${range.endMs} ms)` : ' (whole replay)'}.`,
      };
    }),
  setInputKey: (inputKey) => set({ inputKey }),
  setInputDragMode: (inputDragMode) => set({ inputDragMode }),
  commitInputEdits: (edits) =>
    set((state) => {
      if (!edits.length) return {};
      const affected = new Map<string, typeof edits>();
      for (const edit of edits) {
        const trackId = (edit.next ?? edit.original)?.trackId;
        const track = state.tracks.find((item) => item.id === trackId);
        if (!track || track.locked || (edit.original && edit.next && edit.original.trackId !== edit.next.trackId))
          return {};
        affected.set(track.id, [...(affected.get(track.id) ?? []), edit]);
      }
      for (const [trackId, trackEdits] of affected) {
        const track = state.tracks.find((item) => item.id === trackId)!;
        const retained = replayInputSegments(track).filter(
          (input) => !trackEdits.some((edit) => edit.original && sameInputSelection(edit.original, input)),
        );
        const next = trackEdits.flatMap((edit) => (edit.next ? [edit.next] : []));
        if (
          next.some(
            (input, index) =>
              retained.some((item) => conflictingInput(input, item)) ||
              next.slice(index + 1).some((item) => conflictingInput(input, item)),
          )
        )
          return { lastEditMessage: 'Edit overlaps another input on this track.' };
      }
      const tracks = state.tracks.map((track) =>
        affected.has(track.id)
          ? { ...track, edited: true, replay: editReplayInputs(track.replay, affected.get(track.id)!) }
          : track,
      );
      const selectedInputs = edits.flatMap((edit) => (edit.next ? [edit.next] : []));
      return {
        ...changeTracks(state, tracks),
        selectedInputs,
        selectedInput: selectedInputs.at(-1) ?? null,
        durationMs: Math.max(state.durationMs, ...tracks.map((track) => track.replay.frames.at(-1)?.timeMs ?? 0)),
        playing: false,
        lastEditMessage: '',
      };
    }),
  commitInputEdit: (original, next) => get().commitInputEdits([{ original, next }]),
  addInputAtPlayhead: () => {
    const state = get();
    const track =
      state.tracks.find((item) => item.id === state.previewTrackId) ??
      state.tracks.find((item) => state.selectedTrackIds.includes(item.id)) ??
      state.tracks[0];
    if (!track || track.locked) return;
    state.commitInputEdit(null, {
      trackId: track.id,
      key: state.inputKey,
      startTime: Math.round(state.playheadMs),
      endTime: Math.round(state.playheadMs) + 17,
    });
  },
  deleteSelectedInput: () => {
    const state = get();
    if (state.selectedInputs.length)
      state.commitInputEdits(state.selectedInputs.map((original) => ({ original, next: null })));
  },
  duplicateSelectedInputs: () => {
    const state = get();
    const selected = state.selectedInputs;
    if (!selected.length) return;
    const shift =
      Math.max(...selected.map((input) => input.endTime)) - Math.min(...selected.map((input) => input.startTime)) + 1;
    state.commitInputEdits(
      selected.map((input) => ({
        original: null,
        next: { ...input, startTime: input.startTime + shift, endTime: input.endTime + shift },
      })),
    );
  },
  nudgeSelectedInput: (amountMs) => {
    const state = get();
    if (!state.selectedInputs.length) return;
    state.commitInputEdits(
      state.selectedInputs.map((original) => ({
        original,
        next: { ...original, startTime: original.startTime + amountMs, endTime: original.endTime + amountMs },
      })),
    );
  },
  rippleDeleteSelectedInputs: () => {
    const state = get();
    const chosen = state.selectedInputs;
    if (!chosen.length) return;
    const trackId = chosen[0].trackId;
    if (chosen.some((input) => input.trackId !== trackId)) {
      set({ lastEditMessage: 'Ripple inputs requires one track.' });
      return;
    }
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track || track.locked) return;
    const startTime = Math.min(...chosen.map((input) => input.startTime));
    const endTime = Math.max(...chosen.map((input) => input.endTime));
    const shift = endTime - startTime;
    const later = replayInputSegments(track).filter(
      (input) => input.startTime >= endTime && !chosen.some((item) => sameInputSelection(item, input)),
    );
    state.commitInputEdits([
      ...chosen.map((original) => ({ original, next: null })),
      ...later.map((original) => ({
        original,
        next: { ...original, startTime: original.startTime - shift, endTime: original.endTime - shift },
      })),
    ]);
  },
  cutInputAt: (trackId, key, timeMs) =>
    set((state) => {
      const track = state.tracks.find((item) => item.id === trackId);
      if (!track || track.locked) return {};
      const cutTime = Math.round(timeMs);
      const segment = replayInputSegments(track).find(
        (input) => input.key === key && cutTime > input.startTime && cutTime < input.endTime,
      );
      if (!segment) return {};
      const tracks = state.tracks.map((item) =>
        item.id === trackId ? { ...item, inputCuts: [...(item.inputCuts ?? []), { key, timeMs: cutTime }] } : item,
      );
      const selectedInput = { ...segment, endTime: cutTime };
      return { ...changeTracks(state, tracks), selectedInput, selectedInputs: [selectedInput], playing: false };
    }),
  setFilesTab: (filesTab) => set({ filesTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
}));

export function formatTime(ms: number): string {
  const total = Math.floor(Math.abs(ms));
  const minutes = Math.floor(total / 60_000)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor((total % 60_000) / 1000)
    .toString()
    .padStart(2, '0');
  const millis = (total % 1000).toString().padStart(3, '0');
  return `${ms < 0 ? '-' : ''}${minutes}:${seconds}.${millis}`;
}

export function tint(hex: string, amount: number): string {
  const color = hex.replace('#', '');
  const values = [0, 2, 4].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const next = values.map((value) =>
    Math.round(Math.max(0, Math.min(255, amount >= 0 ? value + (255 - value) * amount : value * (1 + amount)))),
  );
  return `#${next.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
