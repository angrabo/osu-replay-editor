export type { ParsedBeatmap, HitObject, HitCircle, HitSlider, HitSpinner, TimingPoint, Point } from './parser';
export { parseOsu, approachPreempt, applyPreviewMods } from './parser';
export { PixiBeatmapViewer, CAPTURE_SCALE } from './viewer';
export { sliderBreaks, type SliderBreak } from './tracking';
export { SPEED_STOPS, speedColor } from './speed';
export { replayPointAt } from './replay';
export {
  objectAlpha,
  hiddenObjectAlpha,
  hitFadeAlpha,
  judgementAlpha,
  isLogicalPress,
  isLogicalRelease,
  logicalButtons,
  logicalButtonTransitions,
  updateLogicalButtonOrder,
  inputVariantColor,
} from './renderMath';
export type { ReplayPoint } from './replay';

import type { ParsedBeatmap } from './parser';

export type BeatmapSource = {
  text: string;
  audioUrl?: string | null;
  backgroundUrl?: string | null;
};
export type PreviewFrame = import('./replay').ReplayPoint;
export type PreviewReplay = {
  trackId: string;
  color: string;
  frames: readonly PreviewFrame[];
  client?: 'stable' | 'lazer';
  selectedInput?: { keyIndex: number; startTime: number; endTime: number } | null;
  selectedRange?: { startTime: number; endTime: number } | null;
};
export type PreviewJudgement = {
  objectIndex: number;
  result: '300' | '100' | '50' | 'miss';
  hitTime: number | null;
  startTime: number;
};
export { DEFAULT_CURSOR_LAYER_ORDER, normalizeCursorLayerOrder, type CursorLayerId } from './layers';
import type { CursorLayerId } from './layers';
export type ViewerOptions = {
  showCursorTrail: boolean;
  showCursorPast: boolean;
  showCursorFuture: boolean;
  showInputPaths: boolean;
  // Colour the cursor path by speed: blue slow, then green and yellow, red fast.
  showCursorSpeed: boolean;
  // The small × on every replay frame.
  showFrameMarkers: boolean;
  // Drawing order of the cursor overlays, first = on top.
  cursorLayerOrder: readonly CursorLayerId[];
  showClickMarkers: boolean;
  showBackground: boolean;
  backgroundDim: number;
  // Cursor size in percent of the default (100).
  cursorSize: number;
  showGrid: boolean;
  compactMode: boolean;
  wireframeGameplay: boolean;
  fadeAfterClick: boolean;
  showHitJudgements: boolean;
  showHiddenFade: boolean;
  // Mark where the slider end is judged: stable checks one moment, lazer a window before the end.
  showSliderEndWindows: boolean;
  // Paint the parts of a slider the cursor did not track in red.
  showSliderTracking: boolean;
  zoom: number;
  cursorTrailMs: number;
  // Hit object picked in the editor (timeline or object list), outlined on the playfield.
  highlightedObjectIndex: number | null;
};
export type ViewerCallbacks = {
  onLoaded?: (beatmap: ParsedBeatmap) => void;
  onTimeChange?: (timeMs: number) => void;
  onEnded?: () => void;
  // Screen-space placement of the 512×384 playfield inside the host (after zoom, pan and resize).
  onTransformChange?: (transform: PlayfieldTransform) => void;
};

export type PlayfieldTransform = { scale: number; x: number; y: number };

export interface BeatmapViewerAdapter {
  loadBeatmap(source: BeatmapSource): Promise<void>;
  setReplay(replay: PreviewReplay | null): void;
  setJudgements(judgements: readonly PreviewJudgement[] | null): void;
  seek(timeMs: number): void;
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setMods(mods: number): void;
  setOptions(options: ViewerOptions): void;
  setPan(x: number, y: number): { x: number; y: number };
  destroy(): void;
}
