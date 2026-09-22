export type { ParsedBeatmap, HitObject, HitCircle, HitSlider, HitSpinner, TimingPoint, Point } from './parser';
export { parseOsu, approachPreempt, applyPreviewMods } from './parser';
export { PixiBeatmapViewer } from './viewer';
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
export type ViewerOptions = {
  showCursorTrail: boolean;
  showCursorPast: boolean;
  showCursorFuture: boolean;
  showInputPaths: boolean;
  showClickMarkers: boolean;
  showBackground: boolean;
  backgroundDim: number;
  showGrid: boolean;
  compactMode: boolean;
  wireframeGameplay: boolean;
  fadeAfterClick: boolean;
  showHitJudgements: boolean;
  showHiddenFade: boolean;
  zoom: number;
  cursorTrailMs: number;
};
export type ViewerCallbacks = {
  onLoaded?: (beatmap: ParsedBeatmap) => void;
  onTimeChange?: (timeMs: number) => void;
  onEnded?: () => void;
};

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
