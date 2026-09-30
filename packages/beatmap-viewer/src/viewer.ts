import { AlphaFilter, Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { applyPreviewMods, approachPreempt, parseOsu, type HitSlider, type ParsedBeatmap, type Point } from './parser';
import {
  hiddenObjectAlpha,
  hitFadeAlpha,
  inputVariantColor,
  judgementAlpha,
  logicalButtons,
  logicalButtonTransitions,
  objectAlpha,
  updateLogicalButtonOrder,
} from './renderMath';
import { replayPointAt } from './replay';
import { speedColor } from './speed';
import {
  analyseSlider,
  pathSegment,
  pointOnPath,
  sliderBallAt,
  sliderHeadHitTime,
  sliderTailCheckTime,
} from './tracking';
import { DEFAULT_CURSOR_LAYER_ORDER, normalizeCursorLayerOrder, type CursorLayerId } from './layers';
import type {
  BeatmapSource,
  BeatmapViewerAdapter,
  PreviewGhost,
  PreviewJudgement,
  ViewerSkin,
  PreviewReplay,
  ViewerCallbacks,
  ViewerOptions,
} from './index';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
// Playback speed limits; below MIN_AUDIO_RATE browsers refuse to play audio.
const MIN_RATE = 0.001;
const MAX_RATE = 5;
const MIN_AUDIO_RATE = 0.0625;

// Direction the slider ball travels away from a repeat point at path progress `t`,
// sampled a short step further along the path in that direction.
function pathAngle(path: Point[], t: number, forward: boolean): number {
  const step = 0.03;
  const from = pointOnPath(path, t);
  const to = pointOnPath(path, forward ? Math.min(1, t + step) : Math.max(0, t - step));
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function drawReverseArrow(graphics: Graphics, x: number, y: number, angle: number, size: number, alpha: number) {
  const half = size * 0.62;
  const points = [
    { x: -half, y: -half },
    { x: half, y: 0 },
    { x: -half, y: half },
  ];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = points.map((point) => ({
    x: x + point.x * cos - point.y * sin,
    y: y + point.x * sin + point.y * cos,
  }));
  graphics
    .moveTo(rotated[0].x, rotated[0].y)
    .lineTo(rotated[1].x, rotated[1].y)
    .lineTo(rotated[2].x, rotated[2].y)
    .stroke({ color: 0xffffff, width: size * 0.3, alpha, cap: 'round', join: 'round' });
}

// Share of an exported frame the 512×384 playfield grid fills; the rest shows off-grid objects.
export const CAPTURE_SCALE = 0.8;
const HIGHLIGHT_COLOR = 0xffd84d;

function mixColour(from: number, to: number, amount: number): number {
  return [16, 8, 0].reduce((sum, shift) => {
    const channel = Math.round(((from >> shift) & 255) * (1 - amount) + ((to >> shift) & 255) * amount);
    return sum | (channel << shift);
  }, 0);
}
const BREAK_COLOR = 0xff4d5e;

export class PixiBeatmapViewer implements BeatmapViewerAdapter {
  private readonly app = new Application();
  private readonly backgroundLayer = new Container();
  private readonly dim = new Graphics();
  private readonly playfield = new Container();
  private readonly grid = new Graphics();
  private readonly objectLayers = new Container();
  private readonly judgementLayers = new Container();
  private readonly judgementPool: Text[] = [];
  // body: the slider body, composited on its own (opaque strokes + one group alpha) so parts of a
  // slider that cross or double back over themselves never stack into darker patches.
  private readonly objectLayerPool: {
    container: Container;
    // Skin sprites of this object, reused frame to frame; spriteCount are in use this frame.
    spriteLayer: Container;
    sprites: Sprite[];
    spriteCount: number;
    body: Container;
    bodyFade: AlphaFilter;
    bodyFill: Graphics;
    bodyCut: Graphics;
    graphics: Graphics;
    label: Text;
  }[] = [];
  private readonly cursorTrail = new Graphics();
  private readonly cursor = new Graphics();
  private readonly cursorClicks = new Graphics();
  // One layer per cursor overlay so the user can choose their drawing order.
  private readonly overlayContainer = new Container();
  private readonly overlays: Record<CursorLayerId, Graphics> = {
    past: new Graphics(),
    future: new Graphics(),
    speed: new Graphics(),
    'input-paths': new Graphics(),
    'frame-markers': new Graphics(),
    'click-markers': new Graphics(),
    ghosts: new Graphics(),
  };
  private ghosts: readonly PreviewGhost[] = [];
  private skin: ViewerSkin | null = null;
  private readonly cursorSprites = new Container();
  private appliedLayerOrder = '';
  private observer: ResizeObserver | null = null;
  private background: Sprite | null = null;
  private audio: HTMLAudioElement | null = null;
  private beatmap: ParsedBeatmap | null = null;
  private sourceBeatmap: ParsedBeatmap | null = null;
  private mods = 0;
  private replay: PreviewReplay | null = null;
  private judgements: readonly PreviewJudgement[] | null = null;
  private options: ViewerOptions = {
    showCursorTrail: true,
    showCursorPast: true,
    showCursorFuture: true,
    showInputPaths: true,
    showCursorSpeed: false,
    showFrameMarkers: true,
    showGhostCursors: true,
    cursorLayerOrder: DEFAULT_CURSOR_LAYER_ORDER,
    showClickMarkers: true,
    showBackground: true,
    backgroundDim: 62,
    cursorSize: 100,
    showGrid: true,
    compactMode: false,
    wireframeGameplay: false,
    fadeAfterClick: false,
    showHitJudgements: false,
    showHiddenFade: false,
    showSliderEndWindows: false,
    showSliderTracking: true,
    hideCollectedTicks: true,
    snakingSliders: true,
    snakingOutSliders: false,
    zoom: 1,
    cursorTrailMs: 220,
    highlightedObjectIndex: null,
  };
  private timeMs = 0;
  private rate = 1;
  private volume = 100;
  private panX = 0;
  private panY = 0;
  private playing = false;
  private destroyed = false;

  private constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: ViewerCallbacks,
  ) {}

  static async create(host: HTMLElement, callbacks: ViewerCallbacks = {}): Promise<PixiBeatmapViewer> {
    const viewer = new PixiBeatmapViewer(host, callbacks);
    await viewer.app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    viewer.app.stage.addChild(viewer.backgroundLayer, viewer.dim, viewer.playfield);
    viewer.playfield.addChild(
      viewer.grid,
      viewer.objectLayers,
      viewer.judgementLayers,
      viewer.cursorTrail,
      viewer.overlayContainer,
      viewer.cursor,
      viewer.cursorSprites,
      viewer.cursorClicks,
    );
    viewer.applyLayerOrder();
    viewer.host.appendChild(viewer.app.canvas);
    viewer.observer = new ResizeObserver(() => viewer.resize());
    viewer.observer.observe(host);
    viewer.app.ticker.add((ticker) => viewer.tick(ticker.deltaMS));
    viewer.resize();
    return viewer;
  }

  async loadBeatmap(source: BeatmapSource): Promise<void> {
    this.releaseMedia();
    this.sourceBeatmap = parseOsu(source.text);
    this.beatmap = applyPreviewMods(this.sourceBeatmap, this.mods);
    this.timeMs = 0;
    if (source.audioUrl) {
      this.audio = new Audio(source.audioUrl);
      this.audio.preload = 'auto';
      this.audio.playbackRate = this.rate;
      this.audio.volume = this.volume / 100;
      this.audio.addEventListener('ended', this.handleEnded);
    }
    if (source.backgroundUrl) {
      try {
        const image = new Image();
        image.src = source.backgroundUrl;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Beatmap background image could not be decoded.'));
        });
        const texture = Texture.from(image);
        if (this.destroyed) {
          texture.destroy(true);
          return;
        }
        this.background = new Sprite(texture);
        this.background.anchor.set(0.5);
        this.backgroundLayer.addChild(this.background);
      } catch {
        this.background = null;
      }
    }
    if (this.destroyed) return;
    this.resize();
    this.draw();
    this.callbacks.onLoaded?.(this.beatmap);
    this.callbacks.onTimeChange?.(0);
  }

  setReplay(replay: PreviewReplay | null): void {
    this.replay = replay;
    this.draw();
  }

  setGhosts(ghosts: readonly PreviewGhost[]): void {
    this.ghosts = ghosts;
    this.draw();
  }

  setSkin(skin: ViewerSkin | null): void {
    this.skin = skin;
    this.draw();
  }

  /// The skin used for hit objects, unless wireframe (an editor view) is on.
  private circleSkin(): ViewerSkin | null {
    return this.skin?.circles && !this.options.wireframeGameplay ? this.skin : null;
  }

  private skinSprite(
    layer: { spriteLayer: Container; sprites: Sprite[]; spriteCount: number },
    name: string,
    x: number,
    y: number,
    scale: number,
    tint: number,
    alpha: number,
    rotation = 0,
  ): Sprite | null {
    const entry = this.skin?.textures[name];
    if (!entry) return null;
    let sprite = layer.sprites[layer.spriteCount];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5);
      layer.spriteLayer.addChild(sprite);
      layer.sprites.push(sprite);
    }
    layer.spriteCount++;
    sprite.texture = entry.texture;
    sprite.position.set(x, y);
    sprite.scale.set(scale * (entry.hd ? 0.5 : 1));
    sprite.tint = tint;
    sprite.alpha = alpha;
    sprite.rotation = rotation;
    sprite.visible = true;
    return sprite;
  }

  /// A skin's hit-circle number from its digit images, 0.8× the circle scale like stable.
  private skinNumber(
    layer: { spriteLayer: Container; sprites: Sprite[]; spriteCount: number },
    value: number,
    x: number,
    y: number,
    objectScale: number,
    alpha: number,
  ): boolean {
    const skin = this.skin;
    if (!skin) return false;
    const digits = String(value).split('');
    const entries = digits.map((digit) => skin.textures[`default-${digit}`]);
    if (entries.some((entry) => !entry)) return false;
    const scale = objectScale * 0.8;
    const widths = entries.map((entry) => entry!.texture.width * (entry!.hd ? 0.5 : 1) * scale);
    const overlap = skin.hitCircleOverlap * scale;
    const total = widths.reduce((sum, width) => sum + width, 0) - overlap * (digits.length - 1);
    let left = x - total / 2;
    digits.forEach((digit, index) => {
      this.skinSprite(layer, `default-${digit}`, left + widths[index] / 2, y, scale, 0xffffff, alpha);
      left += widths[index] - overlap;
    });
    return true;
  }
  setJudgements(judgements: readonly PreviewJudgement[] | null): void {
    this.judgements = judgements;
    this.draw();
  }

  private captureState: { zoom: number; panX: number; panY: number } | null = null;
  private captureSize: { width: number; height: number } | null = null;

  /// Clip export: the renderer is resized to the clip size and the playfield centred at 80% of the
  /// frame, so objects placed outside the grid still show. endCapture() restores the user's view.
  beginCapture(width: number, height: number): void {
    if (this.captureState || this.destroyed) return;
    this.captureState = { zoom: this.options.zoom, panX: this.panX, panY: this.panY };
    this.captureSize = { width, height };
    this.audio?.pause();
    this.options = { ...this.options, zoom: CAPTURE_SCALE };
    this.panX = 0;
    this.panY = 0;
    this.resize();
  }

  endCapture(timeMs: number): void {
    const state = this.captureState;
    if (!state || this.destroyed) return;
    this.captureState = null;
    this.captureSize = null;
    this.options = { ...this.options, zoom: state.zoom };
    this.panX = state.panX;
    this.panY = state.panY;
    this.resize();
    this.seek(timeMs);
  }

  /// Renders the frame at `timeMs` and copies it into `context`.
  /// The copy must happen right after rendering, before the browser presents the WebGL canvas.
  captureFrame(timeMs: number, context: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.destroyed) return;
    this.seek(timeMs);
    this.app.renderer.render(this.app.stage);
    context.fillStyle = '#05080d';
    context.fillRect(0, 0, width, height);
    context.drawImage(this.app.canvas, 0, 0, this.app.canvas.width, this.app.canvas.height, 0, 0, width, height);
  }

  seek(timeMs: number): void {
    const duration = Math.max(this.beatmap?.durationMs ?? 0, this.replay?.frames.at(-1)?.timeMs ?? 0);
    const earliest = Math.min(0, this.replay?.frames[0]?.timeMs ?? 0, this.beatmap?.hitObjects[0]?.startTime ?? 0);
    this.timeMs = clamp(timeMs, earliest, duration);
    if (this.audio && this.timeMs < 0) {
      this.audio.pause();
      this.audio.currentTime = 0;
    } else if (this.audio && Math.abs(this.audio.currentTime * 1000 - this.timeMs) > 35)
      this.audio.currentTime = this.timeMs / 1000;
    this.draw();
  }

  play(): void {
    if (!this.beatmap || this.playing) return;
    this.playing = true;
    if (this.audio && this.timeMs >= 0 && this.audible())
      void this.audio.play().catch(() => {
        /* visual clock remains available */
      });
  }

  pause(): void {
    this.playing = false;
    this.audio?.pause();
  }
  /// Browsers only play audio between 1/16× and 16×; slower than that the music stops and the
  /// visual clock alone drives playback.
  private audible(): boolean {
    return this.rate >= MIN_AUDIO_RATE;
  }
  setRate(rate: number): void {
    this.rate = clamp(rate, MIN_RATE, MAX_RATE);
    if (!this.audio) return;
    if (this.audible()) this.audio.playbackRate = this.rate;
    else this.audio.pause();
  }
  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 100);
    if (this.audio) this.audio.volume = this.volume / 100;
  }
  setMods(mods: number): void {
    this.mods = mods;
    this.beatmap = this.sourceBeatmap ? applyPreviewMods(this.sourceBeatmap, mods) : null;
    this.draw();
  }
  private applyLayerOrder() {
    const order = normalizeCursorLayerOrder(this.options.cursorLayerOrder);
    const key = order.join(',');
    if (key === this.appliedLayerOrder) return;
    this.appliedLayerOrder = key;
    this.overlayContainer.removeChildren();
    // Children render in insertion order, so the bottom layer goes in first.
    [...order].reverse().forEach((id) => this.overlayContainer.addChild(this.overlays[id]));
  }

  private clearOverlays() {
    Object.values(this.overlays).forEach((graphics) => graphics.clear());
  }

  setOptions(options: ViewerOptions): void {
    this.options = options;
    this.applyLayerOrder();
    this.resize();
  }
  setPan(x: number, y: number): { x: number; y: number } {
    this.panX = x;
    this.panY = y;
    this.positionPlayfield();
    return { x: this.panX, y: this.panY };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pause();
    this.observer?.disconnect();
    this.observer = null;
    this.releaseMedia();
    // `app.destroy(true, ...)` treats the boolean shorthand as `releaseGlobalResources: true`,
    // which wipes Pixi's process-wide TexturePool/TextureCache shared by every viewer instance
    // (e.g. the other split-view pane) — crashing it later with "Cannot read properties of
    // undefined (reading 'push')" inside TexturePool.returnTexture. Only remove this view's canvas.
    this.app.destroy({ removeView: true }, { children: true, texture: true });
  }

  private readonly handleEnded = () => {
    if (this.timeMs >= Math.max(this.beatmap?.durationMs ?? 0, this.replay?.frames.at(-1)?.timeMs ?? 0)) {
      this.playing = false;
      this.callbacks.onEnded?.();
    }
  };

  private tick(deltaMs: number) {
    if (!this.playing || !this.beatmap) return;
    if (this.audio && !this.audio.paused) this.timeMs = this.audio.currentTime * 1000;
    else {
      this.timeMs += Math.min(100, deltaMs) * this.rate;
      if (this.audio && this.timeMs >= 0 && this.audio.paused && this.audible()) {
        this.audio.playbackRate = this.rate;
        this.audio.currentTime = this.timeMs / 1000;
        void this.audio.play().catch(() => {
          /* visual clock remains available */
        });
      }
    }
    const duration = Math.max(this.beatmap.durationMs, this.replay?.frames.at(-1)?.timeMs ?? 0);
    if (this.timeMs >= duration) {
      this.timeMs = duration;
      this.pause();
      this.callbacks.onEnded?.();
    }
    this.draw();
    this.callbacks.onTimeChange?.(this.timeMs);
  }

  private viewSize(): { width: number; height: number } {
    return (
      this.captureSize ?? { width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight) }
    );
  }

  /// URL of the beatmap audio, for clip export.
  audioUrl(): string | null {
    return this.audio?.src || null;
  }

  private resize() {
    if (this.destroyed) return;
    const { width, height } = this.viewSize();
    this.app.renderer.resize(width, height);
    this.positionPlayfield();
    if (this.background) {
      const cover = Math.max(width / this.background.texture.width, height / this.background.texture.height);
      this.background.width = this.background.texture.width * cover;
      this.background.height = this.background.texture.height * cover;
      this.background.position.set(width / 2, height / 2);
    }
    this.updateDim();
    this.draw();
  }

  private positionPlayfield() {
    const { width, height } = this.viewSize();
    const scale = Math.min(width / 512, height / 384) * clamp(this.options.zoom, 0.5, 2.5);
    const baseX = (width - 512 * scale) / 2;
    const baseY = (height - 384 * scale) / 2;
    const margin = 48;
    this.panX = clamp(this.panX, margin - baseX - 512 * scale, width - margin - baseX);
    this.panY = clamp(this.panY, margin - baseY - 384 * scale, height - margin - baseY);
    this.playfield.scale.set(scale);
    this.playfield.position.set(baseX + this.panX, baseY + this.panY);
    this.callbacks.onTransformChange?.({ scale, x: baseX + this.panX, y: baseY + this.panY });
  }

  private updateDim() {
    this.backgroundLayer.visible = this.options.showBackground;
    this.dim.clear();
    const alpha =
      this.background && this.options.showBackground ? clamp(this.options.backgroundDim, 0, 100) / 100 : 0.72;
    this.dim.rect(0, 0, this.app.renderer.width, this.app.renderer.height).fill({ color: 0x05080d, alpha });
  }

  private drawGrid() {
    this.grid.clear();
    if (!this.options.showGrid) return;
    for (let x = 0; x <= 512; x += 32)
      this.grid
        .moveTo(x, 0)
        .lineTo(x, 384)
        .stroke({ color: 0xffffff, width: x % 64 === 0 ? 0.7 : 0.45, alpha: x % 64 === 0 ? 0.2 : 0.11 });
    for (let y = 0; y <= 384; y += 32)
      this.grid
        .moveTo(0, y)
        .lineTo(512, y)
        .stroke({ color: 0xffffff, width: y % 64 === 0 ? 0.7 : 0.45, alpha: y % 64 === 0 ? 0.2 : 0.11 });
    this.grid.rect(0, 0, 512, 384).stroke({ color: 0xeaf5ff, width: 1.5, alpha: 0.78 });
  }

  private objectLayer(index: number) {
    if (!this.objectLayerPool[index]) {
      const container = new Container();
      const graphics = new Graphics();
      const label = new Text({
        text: '',
        resolution: Math.max(3, (window.devicePixelRatio || 1) * 2),
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 18,
          fontWeight: '800',
          fill: 0xffffff,
          stroke: { color: 0x10141b, width: 1.4 },
          align: 'center',
        },
      });
      label.anchor.set(0.5);
      label.roundPixels = true;
      const body = new Container();
      const bodyFade = new AlphaFilter();
      body.filters = [bodyFade];
      const bodyFill = new Graphics();
      // Wireframe: erases the inside of the body so only the outline of the whole shape remains.
      const bodyCut = new Graphics();
      bodyCut.blendMode = 'erase';
      body.addChild(bodyFill, bodyCut);
      const spriteLayer = new Container();
      container.addChild(body, graphics, spriteLayer, label);
      this.objectLayers.addChild(container);
      this.objectLayerPool.push({
        container,
        spriteLayer,
        sprites: [],
        spriteCount: 0,
        body,
        bodyFade,
        bodyFill,
        bodyCut,
        graphics,
        label,
      });
    }
    const layer = this.objectLayerPool[index];
    layer.container.visible = true;
    layer.body.visible = false;
    layer.bodyFill.clear();
    layer.bodyCut.clear();
    layer.graphics.clear();
    layer.label.visible = false;
    layer.spriteCount = 0;
    layer.sprites.forEach((sprite) => (sprite.visible = false));
    return layer;
  }

  private drawSlider(
    layer: {
      body: Container;
      bodyFade: AlphaFilter;
      bodyFill: Graphics;
      bodyCut: Graphics;
      graphics: Graphics;
      spriteLayer: Container;
      sprites: Sprite[];
      spriteCount: number;
    },
    slider: HitSlider,
    radius: number,
    color: number,
    alpha: number,
    highlighted = false,
    // Head hit time from the simulation (null = head missed); undefined when not simulated.
    judgedHeadHit?: number | null,
  ) {
    const graphics = layer.graphics;
    if (!slider.path.length) return;
    // Visible stretch of the body (path progress): snaking in grows it from the head over the first
    // third of the approach; snaking out trims it behind the ball on the final span.
    const preempt = this.beatmap ? approachPreempt(this.beatmap.approachRate) : 1200;
    const duration = Math.max(1, slider.endTime - slider.startTime);
    const raw = clamp((this.timeMs - slider.startTime) / duration) * slider.repeats;
    const span = Math.min(slider.repeats - 1, Math.floor(raw));
    const spanProgress = raw - span;
    const forward = span % 2 === 0;
    const ballProgress = forward ? spanProgress : 1 - spanProgress;
    let visibleFrom = 0;
    let visibleTo = 1;
    if (this.options.snakingSliders && this.timeMs < slider.startTime)
      visibleTo = clamp((this.timeMs - (slider.startTime - preempt)) / (preempt / 3));
    if (this.options.snakingOutSliders && this.timeMs >= slider.startTime && span === slider.repeats - 1) {
      if (forward) visibleFrom = ballProgress;
      else visibleTo = ballProgress;
    }
    const bodyPath =
      visibleFrom > 0 || visibleTo < 1
        ? pathSegment(slider.path, visibleFrom, Math.max(visibleFrom + 1e-4, visibleTo))
        : slider.path;
    const trace = (target: Graphics) => {
      target.moveTo(bodyPath[0].x, bodyPath[0].y);
      bodyPath.slice(1).forEach((point) => target.lineTo(point.x, point.y));
    };
    const shown = (progress: number) => progress >= visibleFrom - 1e-6 && progress <= visibleTo + 1e-6;
    // A tick is collected once the ball has passed it in the current span.
    const collected = (progress: number) =>
      this.options.hideCollectedTicks &&
      this.timeMs >= slider.startTime &&
      (this.timeMs >= slider.endTime || (forward ? progress <= ballProgress : progress >= ballProgress));
    const round = { cap: 'round', join: 'round' } as const;
    layer.body.visible = true;
    layer.bodyFade.alpha = alpha;
    if (highlighted) {
      // Drawn first and wider, so it shows as a coloured rim around the whole body in both modes.
      trace(layer.bodyFill);
      layer.bodyFill.stroke({
        ...round,
        color: HIGHLIGHT_COLOR,
        width: (this.options.wireframeGameplay ? radius * 2 : radius * 2.05) + 11,
      });
    }
    if (this.options.wireframeGameplay) {
      // A 2 px outline of the whole shape: a wide stroke with its inside erased.
      trace(layer.bodyFill);
      layer.bodyFill.stroke({ ...round, color, width: radius * 2 + 4 });
      trace(layer.bodyCut);
      layer.bodyCut.stroke({ ...round, color: 0xffffff, width: radius * 2 });
      trace(graphics);
      graphics.stroke({ ...round, color, width: 1.4, alpha: 0.6 * alpha });
      // Small chevrons along the centerline show which way the slider travels.
      const length = Math.max(1, slider.pixelLength);
      const spacing = Math.max(24, radius * 1.6);
      const size = Math.max(3, radius * 0.14);
      for (let distance = spacing / 2; distance < length - spacing / 4; distance += spacing) {
        const at = pointOnPath(slider.path, distance / length);
        const ahead = pointOnPath(slider.path, Math.min(1, (distance + 2) / length));
        const behind = pointOnPath(slider.path, Math.max(0, (distance - 2) / length));
        const dx = ahead.x - behind.x;
        const dy = ahead.y - behind.y;
        const norm = Math.hypot(dx, dy);
        if (norm < 1e-3) continue;
        const ux = dx / norm;
        const uy = dy / norm;
        const tipX = at.x + ux * size * 0.5;
        const tipY = at.y + uy * size * 0.5;
        const backX = tipX - ux * size;
        const backY = tipY - uy * size;
        graphics
          .moveTo(backX - uy * size * 0.75, backY + ux * size * 0.75)
          .lineTo(tipX, tipY)
          .lineTo(backX + uy * size * 0.75, backY - ux * size * 0.75)
          .stroke({ ...round, color, width: 1.4, alpha: 0.85 * alpha });
      }
    } else {
      // Opaque layers drawn over the whole path in turn: where the slider crosses itself the
      // inner layers cover the outer ones, so it reads as one continuous body.
      const skin = this.circleSkin();
      if (skin) {
        // Stable draws the body with a shader: border colour, then the track (SliderTrackOverride
        // or the combo colour) slightly lighter towards the middle.
        const track = skin.sliderTrack ?? mixColour(color, 0x000000, 0.2);
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color: skin.sliderBorder ?? 0xffffff, width: radius * 2 });
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color: track, width: radius * 1.76 });
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color: mixColour(track, 0xffffff, 0.12), width: radius * 1.2 });
      } else {
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color: 0xffffff, width: radius * 2.05 });
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color, width: radius * 1.78 });
        trace(layer.bodyFill);
        layer.bodyFill.stroke({ ...round, color: 0x11151c, width: radius * 1.48 });
      }
    }
    const frames = this.replay?.frames;
    const tracking =
      this.options.showSliderTracking && frames?.length && this.timeMs >= slider.startTime
        ? analyseSlider(
            slider,
            frames,
            radius,
            this.replay?.client ?? 'stable',
            sliderHeadHitTime(slider, frames, this.beatmap?.overallDifficulty ?? 5, judgedHeadHit),
            this.timeMs,
          )
        : null;
    if (tracking?.lost.length) {
      // Red where the cursor lost the slider between the head hit and the tail check, drawn over
      // the body as far as the playhead has got.
      for (const lost of tracking.lost) {
        const first = sliderBallAt(slider, lost.startMs);
        graphics.moveTo(first.x, first.y);
        for (let time = lost.startMs + 6; time < lost.endMs; time += 6) {
          const point = sliderBallAt(slider, time);
          graphics.lineTo(point.x, point.y);
        }
        const last = sliderBallAt(slider, lost.endMs);
        graphics.lineTo(last.x + 0.01, last.y);
      }
      graphics.stroke({
        ...round,
        color: BREAK_COLOR,
        width: this.options.wireframeGameplay ? radius * 0.45 : radius * 1.48,
        alpha: (this.options.wireframeGameplay ? 0.8 : 0.6) * alpha,
      });
    }
    for (let distance = slider.tickDistance; distance < slider.pixelLength - 0.5; distance += slider.tickDistance) {
      const tickProgress = distance / Math.max(1, slider.pixelLength);
      if (!shown(tickProgress) || collected(tickProgress)) continue;
      const tick = pointOnPath(slider.path, tickProgress);
      // Ticks are tiny dots so they mark positions without covering the path.
      if (this.circleSkin() && this.skinSprite(layer, 'sliderscorepoint', tick.x, tick.y, radius / 64, 0xffffff, alpha))
        continue;
      const tickRadius = this.options.compactMode ? Math.max(0.9, radius * 0.035) : Math.max(1.2, radius * 0.05);
      graphics
        .circle(tick.x, tick.y, tickRadius)
        .fill({ color: this.options.wireframeGameplay ? color : 0xffffff, alpha: 0.95 * alpha });
    }
    const start = pointOnPath(slider.path, 0);
    const finish = pointOnPath(slider.path, 1);
    for (let repeat = 1; repeat < slider.repeats; repeat++) {
      const atStart = repeat % 2 === 0;
      const edge = atStart ? start : finish;
      // Arrows show once the body reaches them, and only while that turn is still ahead.
      if (!shown(atStart ? 0 : 1) || (this.timeMs >= slider.startTime && repeat <= span)) continue;
      const angle = pathAngle(slider.path, atStart ? 0 : 1, atStart);
      if (
        this.circleSkin() &&
        this.skinSprite(layer, 'reversearrow', edge.x, edge.y, radius / 64, 0xffffff, alpha, angle)
      )
        continue;
      if (this.options.wireframeGameplay) drawReverseArrow(graphics, edge.x, edge.y, angle, radius * 0.62, alpha);
      else {
        graphics.circle(edge.x, edge.y, radius * 0.42).fill({ color: 0x10141b, alpha: 0.68 * alpha });
        drawReverseArrow(graphics, edge.x, edge.y, angle, radius * 0.62, alpha);
      }
    }
    if (this.options.showSliderEndWindows) this.drawSliderEndWindow(graphics, slider, radius, alpha);
    if (this.timeMs >= slider.startTime && this.timeMs <= slider.endTime) {
      const ball = sliderBallAt(slider, this.timeMs);
      // Follow circle: how far the cursor may stray from the ball and keep tracking (2.4× radius).
      // Red while the cursor is not tracking.
      const lastSample = tracking?.samples.at(-1);
      const lost =
        !!lastSample &&
        !lastSample.tracked &&
        this.timeMs >= tracking!.from &&
        this.timeMs <= sliderTailCheckTime(slider);
      const skin = this.circleSkin();
      if (skin && (skin.textures.sliderb0 || skin.textures.sliderb)) {
        const ahead = sliderBallAt(slider, Math.min(slider.endTime, this.timeMs + 8));
        const behind = sliderBallAt(slider, Math.max(slider.startTime, this.timeMs - 8));
        const heading = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
        const scale = radius / 64;
        this.skinSprite(
          layer,
          skin.textures.sliderb0 ? 'sliderb0' : 'sliderb',
          ball.x,
          ball.y,
          scale,
          0xffffff,
          alpha,
          heading,
        );
        this.skinSprite(layer, 'sliderfollowcircle', ball.x, ball.y, scale, lost ? BREAK_COLOR : 0xffffff, alpha);
        return;
      }
      graphics
        .circle(ball.x, ball.y, radius * 2.4)
        .fill({ color: lost ? BREAK_COLOR : color, alpha: lost ? 0.12 : 0.08 })
        .stroke({ color: lost ? BREAK_COLOR : 0xffffff, width: 2, alpha: lost ? 0.8 : 0.55 });
      if (this.options.wireframeGameplay)
        graphics.circle(ball.x, ball.y, radius * 0.56).stroke({ color, width: 2.5, alpha });
      else
        graphics
          .circle(ball.x, ball.y, radius * 0.56)
          .fill({ color: 0xffffff, alpha: 0.98 })
          .stroke({ color, width: 4, alpha: 1 });
    }
  }

  // Where the slider end is judged. Stable checks tracking at one moment,
  // end − min(36 ms, half the slider): everything after it no longer counts, so it is dimmed.
  // Lazer accepts tracking at any moment in that final stretch, so the whole window is lit up.
  private drawSliderEndWindow(graphics: Graphics, slider: HitSlider, radius: number, alpha: number) {
    const duration = slider.endTime - slider.startTime;
    if (duration <= 0 || !slider.path.length) return;
    const span = duration / slider.repeats;
    const progressAt = (time: number) => {
      const raw = Math.max(0, Math.min(slider.repeats, (time - slider.startTime) / span));
      const repeat = Math.min(slider.repeats - 1, Math.floor(raw));
      const local = raw - repeat;
      return repeat % 2 ? 1 - local : local;
    };
    // 36 ms of real time; slider times here are map time, so scale by the DT/NC or HT speed.
    const speed = this.mods & (64 | 512) ? 1.5 : this.mods & 256 ? 0.75 : 1;
    const windowStart = slider.endTime - Math.min(36 * speed, duration / 2);
    // Sample by time, not path progress: on repeat sliders the stretch can cross a turnaround.
    const steps = 16;
    const points = Array.from({ length: steps + 1 }, (_, index) =>
      pointOnPath(slider.path, progressAt(windowStart + ((slider.endTime - windowStart) * index) / steps)),
    );
    const traceWindow = () => {
      graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
    };
    // Flat cap at the bar so nothing is painted before the stretch begins.
    const stroke = { cap: 'butt', join: 'round' } as const;
    // Stable (yellow): only the first moment of the stretch is checked. Lazer (cyan): any moment counts.
    const tone = this.replay?.client === 'lazer' ? 0x5fe3ff : 0xffd166;
    // Opaque blend of the tone over the dark body, so the overlapping end cap doesn't double up.
    const mix = (from: number, to: number, amount: number) =>
      [16, 8, 0].reduce((sum, shift) => {
        const channel = Math.round(((from >> shift) & 255) * (1 - amount) + ((to >> shift) & 255) * amount);
        return sum | (channel << shift);
      }, 0);
    const inner = mix(0x10141b, tone, 0.35);
    const body = radius * 2;
    const end = points[points.length - 1];
    // Round the tip with a half disc facing outward only; a full circle would reach back past the bar
    // whenever the stretch is shorter than the slider radius.
    const before =
      [...points].reverse().find((point) => Math.hypot(point.x - end.x, point.y - end.y) > 0.5) ?? points[0];
    const heading = Math.atan2(end.y - before.y, end.x - before.x);
    const tip = (size: number, color: number, opacity: number) =>
      graphics
        .moveTo(end.x + Math.cos(heading - Math.PI / 2) * size, end.y + Math.sin(heading - Math.PI / 2) * size)
        .arc(end.x, end.y, size, heading - Math.PI / 2, heading + Math.PI / 2)
        .closePath()
        .fill({ color, alpha: opacity });
    traceWindow();
    graphics.stroke({ ...stroke, color: tone, width: body, alpha: 0.95 * alpha });
    tip(radius, tone, 0.95 * alpha);
    traceWindow();
    graphics.stroke({ ...stroke, color: inner, width: body - 6, alpha: 0.9 * alpha });
    tip(radius - 3, inner, 0.9 * alpha);
    // A bar across the body where the stretch begins.
    const start = points[0];
    const next = points.find((point) => Math.hypot(point.x - start.x, point.y - start.y) > 0.5) ?? points[1];
    const angle = Math.atan2(next.y - start.y, next.x - start.x) + Math.PI / 2;
    graphics
      .moveTo(start.x - Math.cos(angle) * radius, start.y - Math.sin(angle) * radius)
      .lineTo(start.x + Math.cos(angle) * radius, start.y + Math.sin(angle) * radius)
      .stroke({ color: tone, width: 3, alpha: alpha, cap: 'round' });
  }

  private drawCircle(
    layer: { graphics: Graphics; label: Text; spriteLayer: Container; sprites: Sprite[]; spriteCount: number },
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
    number: number,
    sliderHead = false,
  ) {
    const skin = this.circleSkin();
    const circleName = sliderHead && skin?.textures.sliderstartcircle ? 'sliderstartcircle' : 'hitcircle';
    if (skin?.textures[circleName]) {
      const scale = radius / 64;
      this.skinSprite(layer, circleName, x, y, scale, color, alpha);
      const overlayName =
        sliderHead && skin.textures['sliderstartcircleoverlay'] ? 'sliderstartcircleoverlay' : 'hitcircleoverlay';
      this.skinSprite(layer, overlayName, x, y, scale, 0xffffff, alpha);
      if (this.skinNumber(layer, number, x, y, scale, alpha)) return;
    }
    if (this.options.wireframeGameplay) {
      layer.graphics.circle(x, y, radius).stroke({ color, width: 2.4, alpha });
      return;
    }
    if (skin?.textures[circleName]) {
      // Skin circle drawn above, but its digits are missing: fall back to the text number.
      this.showLabel(layer.label, x, y, radius, alpha, number);
      return;
    }
    layer.graphics
      .circle(x, y, radius)
      .fill({ color, alpha: 0.75 * alpha })
      .stroke({ color: 0xffffff, width: 4, alpha: 0.95 * alpha });
    layer.graphics
      .circle(x, y, radius * 0.72)
      .fill({ color: 0x10141b, alpha: 0.72 * alpha })
      .stroke({ color, width: 2.5, alpha: 0.72 * alpha });
    this.showLabel(layer.label, x, y, radius, alpha, number);
  }

  private showLabel(label: Text, x: number, y: number, radius: number, alpha: number, number: number) {
    if (label.text !== String(number)) label.text = String(number);
    const fontSize = Math.max(18, radius * 0.76);
    if (label.style.fontSize !== fontSize) label.style.fontSize = fontSize;
    label.position.set(Math.round(x), Math.round(y));
    label.alpha = alpha;
    label.visible = true;
  }

  private draw() {
    // loadBeatmap()'s awaits can resolve after the component unmounted this viewer (e.g.
    // toggling split view remounts BeatmapCanvas) — don't touch already-destroyed Pixi objects.
    if (this.destroyed) return;
    this.objectLayerPool.forEach((layer) => {
      layer.container.visible = false;
    });
    this.judgementPool.forEach((label) => {
      label.visible = false;
    });
    this.cursorTrail.clear();
    this.clearOverlays();
    this.cursor.clear();
    this.cursorClicks.clear();
    this.drawGrid();
    const map = this.beatmap;
    if (!map) return;
    const radius = 54.4 - 4.48 * clamp(map.circleSize, 0, 10);
    const preempt = approachPreempt(map.approachRate);
    const judgementByIndex = new Map(this.judgements?.map((judgement) => [judgement.objectIndex, judgement]) ?? []);
    const hiddenFade = this.options.showHiddenFade && (this.mods & 8) !== 0;
    // Earlier hit objects stay above later approaching objects.
    let visibleIndex = 0;
    for (let objectIndex = map.hitObjects.length - 1; objectIndex >= 0; objectIndex--) {
      const object = map.hitObjects[objectIndex];
      const judgement = judgementByIndex.get(objectIndex);
      let alpha = objectAlpha(this.timeMs, object.startTime, object.endTime, preempt);
      if (hiddenFade && object.kind === 'circle') alpha *= hiddenObjectAlpha(this.timeMs, object.startTime, preempt);
      if (
        this.options.fadeAfterClick &&
        object.kind === 'circle' &&
        judgement?.hitTime != null &&
        judgement.result !== 'miss' &&
        this.timeMs >= judgement.hitTime
      )
        alpha = Math.min(alpha, hitFadeAlpha(this.timeMs, judgement.hitTime));
      if (alpha <= 0) continue;
      const layer = this.objectLayer(visibleIndex++);
      const graphics = layer.graphics;
      // Like stable, a skin's combo colours apply when the map has none of its own.
      const colours =
        this.circleSkin() && !map.hasComboColours && this.skin!.comboColours.length
          ? this.skin!.comboColours
          : map.comboColors;
      const color = colours[object.comboIndex % colours.length];
      const highlighted = this.options.highlightedObjectIndex === objectIndex;
      if (object.kind === 'spinner') {
        if (highlighted) graphics.circle(256, 192, 126).stroke({ color: HIGHLIGHT_COLOR, width: 4, alpha });
        const active = clamp((this.timeMs - object.startTime) / Math.max(1, object.endTime - object.startTime));
        if (this.options.wireframeGameplay) graphics.circle(256, 192, 116).stroke({ color, width: 3, alpha });
        else
          graphics
            .circle(256, 192, 116)
            .fill({ color: 0x101722, alpha: 0.82 * alpha })
            .stroke({ color, width: 8, alpha });
        if (active > 0)
          graphics
            .moveTo(256, 101)
            .arc(256, 192, 91, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * active)
            .stroke({ color: 0xffffff, width: 7, alpha });
        continue;
      }
      if (object.kind === 'slider')
        this.drawSlider(layer, object, radius, color, alpha, highlighted, judgement ? judgement.hitTime : undefined);
      let headAlpha =
        hiddenFade && object.kind === 'slider'
          ? alpha * hiddenObjectAlpha(this.timeMs, object.startTime, preempt)
          : alpha;
      if (
        this.options.fadeAfterClick &&
        object.kind === 'slider' &&
        judgement?.hitTime != null &&
        judgement.result !== 'miss' &&
        this.timeMs >= judgement.hitTime
      )
        headAlpha = Math.min(headAlpha, hitFadeAlpha(this.timeMs, judgement.hitTime));
      if (headAlpha > 0)
        this.drawCircle(
          layer,
          object.x,
          object.y,
          radius,
          color,
          headAlpha,
          object.comboNumber,
          object.kind === 'slider',
        );
      if (highlighted && object.kind === 'circle')
        graphics.circle(object.x, object.y, radius + 6).stroke({ color: HIGHLIGHT_COLOR, width: 3.5, alpha });
      if (this.timeMs <= object.startTime && !hiddenFade) {
        const progress = clamp((this.timeMs - (object.startTime - preempt)) / preempt);
        const approach =
          this.circleSkin() &&
          this.skinSprite(
            layer,
            'approachcircle',
            object.x,
            object.y,
            (radius / 64) * (4 - 3 * progress),
            color,
            0.9 * alpha,
          );
        if (!approach)
          graphics
            .circle(object.x, object.y, radius * (4 - 3 * progress))
            .stroke({ color, width: 3, alpha: 0.9 * alpha });
      }
    }
    this.drawJudgements(map);
    this.drawGhosts();
    this.drawCursor();
  }

  private drawJudgements(map: ParsedBeatmap) {
    if (!this.options.showHitJudgements || !this.judgements) return;
    let visibleIndex = 0;
    for (const judgement of this.judgements) {
      if (judgement.result === '300') continue;
      const object = map.hitObjects[judgement.objectIndex];
      if (!object || object.kind === 'spinner') continue;
      const eventTime = judgement.hitTime ?? judgement.startTime;
      const alpha = judgementAlpha(this.timeMs, eventTime);
      if (alpha <= 0) continue;
      let label = this.judgementPool[visibleIndex++];
      if (!label) {
        label = new Text({
          text: '',
          resolution: Math.max(3, (window.devicePixelRatio || 1) * 2),
          style: {
            fontFamily: 'Arial, sans-serif',
            fontSize: 22,
            fontWeight: '900',
            fill: 0xffffff,
            stroke: { color: 0x10141b, width: 4 },
            align: 'center',
          },
        });
        label.anchor.set(0.5);
        this.judgementLayers.addChild(label);
        this.judgementPool.push(label);
      }
      label.text = judgement.result === 'miss' ? '×' : judgement.result;
      label.style.fill = judgement.result === 'miss' ? 0xff596a : judgement.result === '50' ? 0xf0c65c : 0x60cf8b;
      label.position.set(object.x, object.y - (1 - alpha) * 12);
      label.alpha = alpha;
      label.visible = true;
    }
  }

  private drawGhosts() {
    const layer = this.overlays.ghosts;
    if (!this.options.showGhostCursors || !this.ghosts.length) return;
    const trailMs =
      this.options.showCursorTrail && this.options.showCursorPast ? clamp(this.options.cursorTrailMs, 0, 5000) : 0;
    const pathScale = this.options.compactMode ? 0.6 : 1;
    const cursorScale = clamp(this.options.cursorSize ?? 100, 50, 200) / 100;
    for (const ghost of this.ghosts) {
      const frames = ghost.frames;
      if (!frames.length || this.timeMs < frames[0].timeMs || this.timeMs > frames[frames.length - 1].timeMs + 500)
        continue;
      const point = replayPointAt(frames, this.timeMs);
      if (!point) continue;
      const color = Number.parseInt(ghost.color.replace('#', ''), 16) || 0xffffff;
      const alpha = clamp(ghost.opacity, 0.05, 1);
      if (trailMs > 0) {
        let low = 0;
        let high = frames.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (frames[mid].timeMs < this.timeMs - trailMs) low = mid + 1;
          else high = mid;
        }
        if (low < frames.length && frames[low].timeMs <= this.timeMs) {
          layer.moveTo(frames[low].x, frames[low].y);
          for (let i = low + 1; i < frames.length && frames[i].timeMs <= this.timeMs; i++)
            layer.lineTo(frames[i].x, frames[i].y);
          layer
            .lineTo(point.x, point.y)
            .stroke({ color, width: 1.6 * pathScale, alpha: 0.55 * alpha, cap: 'round', join: 'round' });
        }
      }
      // Filled while a key is held, hollow otherwise.
      const held = logicalButtons(point.keys) !== 0;
      layer
        .circle(point.x, point.y, 10 * cursorScale)
        .fill({ color, alpha: (held ? 0.8 : 0.25) * alpha })
        .stroke({ color, width: 2.5 * cursorScale, alpha: 0.95 * alpha });
    }
  }

  /// The skin's cursor (and cursormiddle) instead of the drawn one. Sizes are in playfield units,
  /// which match stable's osu!pixels.
  private drawSkinCursor(x: number, y: number, cursorScale: number): boolean {
    const skin = this.skin;
    const cursor = skin?.cursor ? skin.textures.cursor : undefined;
    if (!skin || !cursor) return false;
    const place = (index: number, name: string) => {
      const entry = skin.textures[name];
      if (!entry) return;
      let sprite = this.cursorSprites.children[index] as Sprite | undefined;
      if (!sprite) {
        sprite = new Sprite();
        this.cursorSprites.addChild(sprite);
      }
      sprite.texture = entry.texture;
      sprite.anchor.set(skin.cursorCentre || name === 'cursormiddle' ? 0.5 : 0);
      sprite.position.set(x, y);
      sprite.scale.set((entry.hd ? 0.5 : 1) * cursorScale);
      sprite.visible = true;
    };
    place(0, 'cursor');
    place(1, 'cursormiddle');
    return true;
  }

  private drawCursor() {
    this.cursorSprites.children.forEach((child) => (child.visible = false));
    const replay = this.replay;
    // The previewed replay's own opacity fades its cursor and overlays, not the ghosts.
    const opacity = clamp(replay?.opacity ?? 1, 0.05, 1);
    for (const [id, graphics] of Object.entries(this.overlays)) graphics.alpha = id === 'ghosts' ? 1 : opacity;
    this.cursor.alpha = opacity;
    this.cursorSprites.alpha = opacity;
    this.cursorTrail.alpha = opacity;
    this.cursorClicks.alpha = opacity;
    if (!replay?.frames.length || this.timeMs < replay.frames[0].timeMs) return;
    const frames = replay.frames;
    let low = 0;
    let high = frames.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timeMs <= this.timeMs) low = mid + 1;
      else high = mid;
    }
    const index = Math.max(0, low - 1);
    const point = replayPointAt(frames, this.timeMs);
    if (!point) return;
    const color = Number.parseInt(replay.color.replace('#', ''), 16) || 0xffffff;
    const cursorEditColor = inputVariantColor(color, 2);
    const pathScale = this.options.compactMode ? 0.6 : 1;
    const markerScale = this.options.compactMode ? 0.62 : 1;
    const drawSelectedRange = () => {
      if (replay.selectedRange) {
        const range = replay.selectedRange;
        const first = replayPointAt(frames, range.startTime);
        const last = replayPointAt(frames, range.endTime);
        if (first && last) {
          const points = [
            first,
            ...frames.filter((frame) => frame.timeMs > range.startTime && frame.timeMs < range.endTime),
            last,
          ];
          if (points.length > 1) {
            this.cursorTrail.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((rangePoint) => this.cursorTrail.lineTo(rangePoint.x, rangePoint.y));
            this.cursorTrail.stroke({
              color: 0xffffff,
              width: 5 * pathScale,
              alpha: 0.82,
              cap: 'round',
              join: 'round',
            });
            this.cursorTrail.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((rangePoint) => this.cursorTrail.lineTo(rangePoint.x, rangePoint.y));
            this.cursorTrail.stroke({
              color: cursorEditColor,
              width: 2.6 * pathScale,
              alpha: 0.98,
              cap: 'round',
              join: 'round',
            });
          }
          this.cursorClicks
            .circle(first.x, first.y, 4.5 * markerScale)
            .fill({ color: cursorEditColor, alpha: 1 })
            .stroke({ color: 0xffffff, width: 1.5 * markerScale, alpha: 1 });
          this.cursorClicks
            .rect(last.x - 4 * markerScale, last.y - 4 * markerScale, 8 * markerScale, 8 * markerScale)
            .fill({ color: cursorEditColor, alpha: 1 })
            .stroke({ color: 0xffffff, width: 1.5 * markerScale, alpha: 1 });
        }
      }
    };
    if (replay.selectedInput) {
      const selection = replay.selectedInput;
      const selectedColor = inputVariantColor(color, selection.keyIndex);
      const first = replayPointAt(frames, selection.startTime);
      const last = replayPointAt(frames, selection.endTime);
      if (first && last) {
        const points = [
          first,
          ...frames.filter((frame) => frame.timeMs > selection.startTime && frame.timeMs < selection.endTime),
          last,
        ];
        if (points.length > 1) {
          this.cursorTrail.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((selectedPoint) => this.cursorTrail.lineTo(selectedPoint.x, selectedPoint.y));
          this.cursorTrail.stroke({ color: 0xffffff, width: 8 * pathScale, alpha: 0.92, cap: 'round', join: 'round' });
          this.cursorTrail.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((selectedPoint) => this.cursorTrail.lineTo(selectedPoint.x, selectedPoint.y));
          this.cursorTrail.stroke({
            color: selectedColor,
            width: 4.5 * pathScale,
            alpha: 1,
            cap: 'round',
            join: 'round',
          });
        }
        this.cursorClicks
          .circle(first.x, first.y, 6 * markerScale)
          .fill({ color: 0xffffff, alpha: 1 })
          .stroke({ color: selectedColor, width: 2.4 * markerScale, alpha: 1 });
        this.cursorClicks
          .circle(last.x, last.y, 6 * markerScale)
          .fill({ color: selectedColor, alpha: 1 })
          .stroke({ color: 0xffffff, width: 2 * markerScale, alpha: 1 });
      }
    }
    if (this.options.showCursorTrail) {
      const fromTime = this.timeMs - clamp(this.options.cursorTrailMs, 0, 5000);
      let from = index;
      while (from > 0 && frames[from - 1].timeMs >= fromTime) from--;
      if (this.options.showCursorPast && from < index) {
        this.overlays.past.moveTo(frames[from].x, frames[from].y);
        for (let i = from + 1; i <= index; i++) this.overlays.past.lineTo(frames[i].x, frames[i].y);
        this.overlays.past
          .lineTo(point.x, point.y)
          .stroke({ color: 0xc5ccd4, width: 1.35 * pathScale, alpha: 0.68, cap: 'round', join: 'round' });
      }
      const untilTime = Math.min(frames.at(-1)!.timeMs, this.timeMs + clamp(this.options.cursorTrailMs, 0, 5000));
      if (this.options.showCursorFuture && untilTime > this.timeMs) {
        this.overlays.future.moveTo(point.x, point.y);
        for (let i = index + 1; i < frames.length && frames[i].timeMs < untilTime; i++)
          this.overlays.future.lineTo(frames[i].x, frames[i].y);
        const future = replayPointAt(frames, untilTime);
        if (future)
          this.overlays.future
            .lineTo(future.x, future.y)
            .stroke({ color: 0xffffff, width: 1.35 * pathScale, alpha: 0.82, cap: 'round', join: 'round' });
      }
      if (this.options.showCursorSpeed) {
        // Speed heatmap over the visible trail. Speed is averaged with the neighbouring segments
        // so single jittery frames do not flash red.
        const segmentSpeed = (i: number) => {
          const dt = frames[i].timeMs - frames[i - 1].timeMs;
          return dt > 0 ? Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y) / dt : NaN;
        };
        for (let i = Math.max(1, from + 1); i < frames.length && frames[i - 1].timeMs < untilTime; i++) {
          const past = frames[i].timeMs <= this.timeMs;
          if ((past && !this.options.showCursorPast) || (!past && !this.options.showCursorFuture)) continue;
          let sum = 0;
          let count = 0;
          for (let j = Math.max(1, i - 1); j <= Math.min(frames.length - 1, i + 1); j++) {
            const value = segmentSpeed(j);
            if (Number.isFinite(value)) {
              sum += value;
              count++;
            }
          }
          if (!count) continue;
          this.overlays.speed
            .moveTo(frames[i - 1].x, frames[i - 1].y)
            .lineTo(frames[i].x, frames[i].y)
            .stroke({ color: speedColor(sum / count), width: 3 * pathScale, alpha: past ? 0.95 : 0.7, cap: 'round' });
        }
      }
      const frameMarkerRadius = 3.2 * markerScale;
      for (let i = from; this.options.showFrameMarkers && i < frames.length && frames[i].timeMs <= untilTime; i++) {
        const frame = frames[i];
        const pastOrCurrent = frame.timeMs <= this.timeMs;
        if ((pastOrCurrent && !this.options.showCursorPast) || (!pastOrCurrent && !this.options.showCursorFuture))
          continue;
        const drawFrameX = (strokeColor: number, width: number, alpha: number) =>
          this.overlays['frame-markers']
            .moveTo(frame.x - frameMarkerRadius, frame.y - frameMarkerRadius)
            .lineTo(frame.x + frameMarkerRadius, frame.y + frameMarkerRadius)
            .moveTo(frame.x + frameMarkerRadius, frame.y - frameMarkerRadius)
            .lineTo(frame.x - frameMarkerRadius, frame.y + frameMarkerRadius)
            .stroke({ color: strokeColor, width, alpha, cap: 'round' });
        drawFrameX(0x0b0f15, 3.4 * markerScale, 0.92);
        drawFrameX(cursorEditColor, 1.7 * markerScale, pastOrCurrent ? 0.9 : 1);
      }
      let heldOrder = [0, 1, 2, 3].filter((keyIndex) => (logicalButtons(frames[0].keys) & (1 << keyIndex)) !== 0);
      for (let i = 1; i < Math.max(1, from + 1); i++)
        heldOrder = updateLogicalButtonOrder(heldOrder, frames[i - 1].keys, frames[i].keys);
      const markerHistory: { keyIndex: number; timeMs: number; x: number; y: number; depth: number }[] = [];
      for (let i = Math.max(1, from + 1); i <= index; i++) {
        const held = logicalButtons(frames[i - 1].keys);
        const heldKeys = heldOrder.filter((keyIndex) => (held & (1 << keyIndex)) !== 0);
        if (this.options.showInputPaths)
          heldKeys.forEach((keyIndex, order) => {
            const width = (3.2 + (heldKeys.length - order - 1) * 1.7) * pathScale;
            const selected =
              replay.selectedInput?.keyIndex === keyIndex &&
              frames[i].timeMs > replay.selectedInput.startTime &&
              frames[i - 1].timeMs < replay.selectedInput.endTime;
            if (selected)
              this.overlays['input-paths']
                .moveTo(frames[i - 1].x, frames[i - 1].y)
                .lineTo(frames[i].x, frames[i].y)
                .stroke({ color: 0xffffff, width: width + 4 * pathScale, alpha: 0.95, cap: 'round', join: 'round' });
            this.overlays['input-paths']
              .moveTo(frames[i - 1].x, frames[i - 1].y)
              .lineTo(frames[i].x, frames[i].y)
              .stroke({ color: inputVariantColor(color, keyIndex), width, alpha: 0.98, cap: 'round', join: 'round' });
          });
        const transitions = logicalButtonTransitions(frames[i - 1].keys, frames[i].keys);
        const changed = [0, 1, 2, 3].filter(
          (keyIndex) => ((transitions.pressed | transitions.released) & (1 << keyIndex)) !== 0,
        );
        if (this.options.showClickMarkers)
          changed.forEach((keyIndex, order) => {
            const previousMarker = [...markerHistory]
              .reverse()
              .find(
                (marker) =>
                  marker.keyIndex === keyIndex &&
                  frames[i].timeMs - marker.timeMs <= 160 &&
                  Math.hypot(frames[i].x - marker.x, frames[i].y - marker.y) <= 12,
              );
            const depth = previousMarker ? previousMarker.depth + 1 : 0;
            markerHistory.push({ keyIndex, timeMs: frames[i].timeMs, x: frames[i].x, y: frames[i].y, depth });
            const keyColor = inputVariantColor(color, keyIndex);
            const radius =
              (Math.max(3, 7.2 - Math.min(depth, 3) * 1.25) + (changed.length - order - 1) * 1.3) * markerScale;
            if ((transitions.pressed & (1 << keyIndex)) !== 0)
              this.overlays['click-markers']
                .circle(frames[i].x, frames[i].y, radius)
                .fill({ color: 0xffffff, alpha: 1 })
                .stroke({ color: keyColor, width: 2 * markerScale, alpha: 1 });
            else
              this.overlays['click-markers']
                .circle(frames[i].x, frames[i].y, radius)
                .fill({ color: keyColor, alpha: 1 })
                .stroke({ color: 0xffffff, width: 1.6 * markerScale, alpha: 1 });
          });
        heldOrder = updateLogicalButtonOrder(heldOrder, frames[i - 1].keys, frames[i].keys);
      }
      const currentHeld = logicalButtons(frames[index].keys);
      const currentKeys = heldOrder.filter((keyIndex) => (currentHeld & (1 << keyIndex)) !== 0);
      if (this.options.showInputPaths && (point.x !== frames[index].x || point.y !== frames[index].y))
        currentKeys.forEach((keyIndex, order) => {
          const width = (3.2 + (currentKeys.length - order - 1) * 1.7) * pathScale;
          const selected =
            replay.selectedInput?.keyIndex === keyIndex &&
            this.timeMs >= replay.selectedInput.startTime &&
            frames[index].timeMs < replay.selectedInput.endTime;
          if (selected)
            this.overlays['input-paths']
              .moveTo(frames[index].x, frames[index].y)
              .lineTo(point.x, point.y)
              .stroke({ color: 0xffffff, width: width + 4 * pathScale, alpha: 0.95, cap: 'round', join: 'round' });
          this.overlays['input-paths']
            .moveTo(frames[index].x, frames[index].y)
            .lineTo(point.x, point.y)
            .stroke({ color: inputVariantColor(color, keyIndex), width, alpha: 0.98, cap: 'round', join: 'round' });
        });
    }
    drawSelectedRange();
    const cursorScale = clamp(this.options.cursorSize ?? 100, 50, 200) / 100;
    if (this.drawSkinCursor(point.x, point.y, cursorScale)) return;
    this.cursor
      .circle(point.x, point.y, 10 * cursorScale)
      .fill({ color, alpha: 0.96 })
      .stroke({ color: 0xffffff, width: 2.5 * cursorScale, alpha: 1 });
    this.cursor.circle(point.x, point.y, 2.5 * cursorScale).fill(0xffffff);
  }

  private releaseMedia() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener('ended', this.handleEnded);
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    if (this.background) {
      this.background.removeFromParent();
      this.background.texture.destroy(true);
      this.background.destroy();
      this.background = null;
    }
    this.beatmap = null;
    this.replay = null;
    this.objectLayerPool.forEach((layer) => {
      layer.container.visible = false;
      layer.bodyFill.clear();
      layer.bodyCut.clear();
      layer.graphics.clear();
      layer.label.visible = false;
    });
    this.cursorTrail.clear();
    this.clearOverlays();
    this.cursor.clear();
    this.cursorClicks.clear();
  }
}
