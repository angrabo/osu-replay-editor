import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
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
import type {
  BeatmapSource,
  BeatmapViewerAdapter,
  PreviewJudgement,
  PreviewReplay,
  ViewerCallbacks,
  ViewerOptions,
} from './index';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function pointOnPath(path: Point[], progress: number): Point {
  if (path.length < 2) return path[0] || { x: 256, y: 192 };
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let remaining = clamp(progress) * total;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const ratio = lengths[index] ? remaining / lengths[index] : 0;
      return {
        x: path[index].x + (path[index + 1].x - path[index].x) * ratio,
        y: path[index].y + (path[index + 1].y - path[index].y) * ratio,
      };
    }
    remaining -= lengths[index];
  }
  return path.at(-1)!;
}

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

export class PixiBeatmapViewer implements BeatmapViewerAdapter {
  private readonly app = new Application();
  private readonly backgroundLayer = new Container();
  private readonly dim = new Graphics();
  private readonly playfield = new Container();
  private readonly grid = new Graphics();
  private readonly objectLayers = new Container();
  private readonly judgementLayers = new Container();
  private readonly judgementPool: Text[] = [];
  private readonly objectLayerPool: { container: Container; graphics: Graphics; label: Text }[] = [];
  private readonly cursorTrail = new Graphics();
  private readonly cursor = new Graphics();
  private readonly cursorClicks = new Graphics();
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
    showClickMarkers: true,
    showBackground: true,
    backgroundDim: 62,
    showGrid: true,
    compactMode: false,
    wireframeGameplay: false,
    fadeAfterClick: false,
    showHitJudgements: false,
    showHiddenFade: false,
    zoom: 1,
    cursorTrailMs: 220,
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
      viewer.cursor,
      viewer.cursorClicks,
    );
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
    this.resize();
    this.draw();
    this.callbacks.onLoaded?.(this.beatmap);
    this.callbacks.onTimeChange?.(0);
  }

  setReplay(replay: PreviewReplay | null): void {
    this.replay = replay;
    this.draw();
  }
  setJudgements(judgements: readonly PreviewJudgement[] | null): void {
    this.judgements = judgements;
    this.draw();
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
    if (this.audio && this.timeMs >= 0)
      void this.audio.play().catch(() => {
        /* visual clock remains available */
      });
  }

  pause(): void {
    this.playing = false;
    this.audio?.pause();
  }
  setRate(rate: number): void {
    this.rate = clamp(rate, 0.25, 4);
    if (this.audio) this.audio.playbackRate = this.rate;
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
  setOptions(options: ViewerOptions): void {
    this.options = options;
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
    this.app.destroy(true, { children: true, texture: true });
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
      if (this.audio && this.timeMs >= 0 && this.audio.paused) {
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

  private resize() {
    if (this.destroyed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
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
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const scale = Math.min(width / 512, height / 384) * clamp(this.options.zoom, 0.5, 2.5);
    const baseX = (width - 512 * scale) / 2;
    const baseY = (height - 384 * scale) / 2;
    const margin = 48;
    this.panX = clamp(this.panX, margin - baseX - 512 * scale, width - margin - baseX);
    this.panY = clamp(this.panY, margin - baseY - 384 * scale, height - margin - baseY);
    this.playfield.scale.set(scale);
    this.playfield.position.set(baseX + this.panX, baseY + this.panY);
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
      container.addChild(graphics, label);
      this.objectLayers.addChild(container);
      this.objectLayerPool.push({ container, graphics, label });
    }
    const layer = this.objectLayerPool[index];
    layer.container.visible = true;
    layer.graphics.clear();
    layer.label.visible = false;
    return layer;
  }

  private drawSlider(graphics: Graphics, slider: HitSlider, radius: number, color: number, alpha: number) {
    if (!slider.path.length) return;
    const path = () => {
      graphics.moveTo(slider.path[0].x, slider.path[0].y);
      slider.path.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
    };
    if (!this.options.wireframeGameplay) {
      path();
      graphics.stroke({ color: 0xffffff, width: radius * 2.05, alpha: 0.82 * alpha, cap: 'round', join: 'round' });
      path();
      graphics.stroke({ color, width: radius * 1.78, alpha: 0.95 * alpha, cap: 'round', join: 'round' });
    }
    path();
    graphics.stroke({
      color: this.options.wireframeGameplay ? color : 0x11151c,
      width: this.options.wireframeGameplay ? 2.4 : radius * 1.48,
      alpha: 0.94 * alpha,
      cap: 'round',
      join: 'round',
    });
    for (let distance = slider.tickDistance; distance < slider.pixelLength - 0.5; distance += slider.tickDistance) {
      const tick = pointOnPath(slider.path, distance / Math.max(1, slider.pixelLength));
      const tickRadius = this.options.compactMode ? Math.max(1.5, radius * 0.065) : Math.max(2.4, radius * 0.11);
      if (this.options.wireframeGameplay)
        graphics.circle(tick.x, tick.y, tickRadius).stroke({ color, width: 1, alpha });
      else
        graphics
          .circle(tick.x, tick.y, tickRadius)
          .fill({ color: 0xffffff, alpha: 0.96 * alpha })
          .stroke({
            color,
            width: this.options.compactMode ? Math.max(0.7, radius * 0.035) : Math.max(1, radius * 0.055),
            alpha,
          });
    }
    const start = pointOnPath(slider.path, 0);
    const finish = pointOnPath(slider.path, 1);
    for (let repeat = 1; repeat < slider.repeats; repeat++) {
      const atStart = repeat % 2 === 0;
      const edge = atStart ? start : finish;
      const angle = pathAngle(slider.path, atStart ? 0 : 1, atStart);
      if (this.options.wireframeGameplay) drawReverseArrow(graphics, edge.x, edge.y, angle, radius * 0.62, alpha);
      else {
        graphics.circle(edge.x, edge.y, radius * 0.42).fill({ color: 0x10141b, alpha: 0.68 * alpha });
        drawReverseArrow(graphics, edge.x, edge.y, angle, radius * 0.62, alpha);
      }
    }
    const tail = slider.repeats % 2 ? finish : start;
    const lazerTail = this.replay?.client === 'lazer';
    if (this.options.wireframeGameplay)
      graphics.circle(tail.x, tail.y, radius * (lazerTail ? 0.3 : 0.22)).stroke({ color, width: 2, alpha });
    else {
      graphics
        .circle(tail.x, tail.y, radius * (lazerTail ? 0.3 : 0.22))
        .fill({ color: 0x10141b, alpha: 0.9 * alpha })
        .stroke({ color: lazerTail ? 0xffffff : color, width: lazerTail ? 3 : 2, alpha });
      graphics.circle(tail.x, tail.y, radius * 0.09).fill({ color: lazerTail ? color : 0xffffff, alpha });
    }
    if (this.timeMs >= slider.startTime && this.timeMs <= slider.endTime) {
      const raw = ((this.timeMs - slider.startTime) / Math.max(1, slider.endTime - slider.startTime)) * slider.repeats;
      const span = Math.floor(raw);
      const progress = span % 2 ? 1 - (raw - span) : raw - span;
      const ball = pointOnPath(slider.path, progress);
      if (this.options.wireframeGameplay)
        graphics.circle(ball.x, ball.y, radius * 0.56).stroke({ color, width: 2.5, alpha });
      else
        graphics
          .circle(ball.x, ball.y, radius * 0.56)
          .fill({ color: 0xffffff, alpha: 0.98 })
          .stroke({ color, width: 4, alpha: 1 });
    }
  }

  private drawCircle(
    layer: { graphics: Graphics; label: Text },
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
    number: number,
  ) {
    if (this.options.wireframeGameplay) {
      layer.graphics.circle(x, y, radius).stroke({ color, width: 2.4, alpha });
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
    const label = layer.label;
    if (label.text !== String(number)) label.text = String(number);
    const fontSize = Math.max(18, radius * 0.76);
    if (label.style.fontSize !== fontSize) label.style.fontSize = fontSize;
    label.position.set(Math.round(x), Math.round(y));
    label.alpha = alpha;
    label.visible = true;
  }

  private draw() {
    this.objectLayerPool.forEach((layer) => {
      layer.container.visible = false;
    });
    this.judgementPool.forEach((label) => {
      label.visible = false;
    });
    this.cursorTrail.clear();
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
      const color = map.comboColors[object.comboIndex % map.comboColors.length];
      if (object.kind === 'spinner') {
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
      if (object.kind === 'slider') this.drawSlider(graphics, object, radius, color, alpha);
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
      if (headAlpha > 0) this.drawCircle(layer, object.x, object.y, radius, color, headAlpha, object.comboNumber);
      if (this.timeMs <= object.startTime && !hiddenFade) {
        const progress = clamp((this.timeMs - (object.startTime - preempt)) / preempt);
        graphics
          .circle(object.x, object.y, radius * (4 - 3 * progress))
          .stroke({ color, width: 3, alpha: 0.9 * alpha });
      }
    }
    this.drawJudgements(map);
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

  private drawCursor() {
    const replay = this.replay;
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
              color: 0xc875ff,
              width: 2.6 * pathScale,
              alpha: 0.98,
              cap: 'round',
              join: 'round',
            });
          }
          this.cursorClicks
            .circle(first.x, first.y, 4.5 * markerScale)
            .fill({ color: 0xc875ff, alpha: 1 })
            .stroke({ color: 0xffffff, width: 1.5 * markerScale, alpha: 1 });
          this.cursorClicks
            .rect(last.x - 4 * markerScale, last.y - 4 * markerScale, 8 * markerScale, 8 * markerScale)
            .fill({ color: 0xc875ff, alpha: 1 })
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
        this.cursorTrail.moveTo(frames[from].x, frames[from].y);
        for (let i = from + 1; i <= index; i++) this.cursorTrail.lineTo(frames[i].x, frames[i].y);
        this.cursorTrail
          .lineTo(point.x, point.y)
          .stroke({ color: 0xc5ccd4, width: 1.35 * pathScale, alpha: 0.68, cap: 'round', join: 'round' });
      }
      const untilTime = Math.min(frames.at(-1)!.timeMs, this.timeMs + clamp(this.options.cursorTrailMs, 0, 5000));
      if (this.options.showCursorFuture && untilTime > this.timeMs) {
        this.cursorTrail.moveTo(point.x, point.y);
        for (let i = index + 1; i < frames.length && frames[i].timeMs < untilTime; i++)
          this.cursorTrail.lineTo(frames[i].x, frames[i].y);
        const future = replayPointAt(frames, untilTime);
        if (future)
          this.cursorTrail
            .lineTo(future.x, future.y)
            .stroke({ color: 0xffffff, width: 1.35 * pathScale, alpha: 0.82, cap: 'round', join: 'round' });
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
              this.cursorTrail
                .moveTo(frames[i - 1].x, frames[i - 1].y)
                .lineTo(frames[i].x, frames[i].y)
                .stroke({ color: 0xffffff, width: width + 4 * pathScale, alpha: 0.95, cap: 'round', join: 'round' });
            this.cursorTrail
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
              this.cursorClicks
                .circle(frames[i].x, frames[i].y, radius)
                .fill({ color: 0xffffff, alpha: 1 })
                .stroke({ color: keyColor, width: 2 * markerScale, alpha: 1 });
            else
              this.cursorClicks
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
            this.cursorTrail
              .moveTo(frames[index].x, frames[index].y)
              .lineTo(point.x, point.y)
              .stroke({ color: 0xffffff, width: width + 4 * pathScale, alpha: 0.95, cap: 'round', join: 'round' });
          this.cursorTrail
            .moveTo(frames[index].x, frames[index].y)
            .lineTo(point.x, point.y)
            .stroke({ color: inputVariantColor(color, keyIndex), width, alpha: 0.98, cap: 'round', join: 'round' });
        });
    }
    drawSelectedRange();
    this.cursor
      .circle(point.x, point.y, 10)
      .fill({ color, alpha: 0.96 })
      .stroke({ color: 0xffffff, width: 2.5, alpha: 1 });
    this.cursor.circle(point.x, point.y, 2.5).fill(0xffffff);
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
      layer.graphics.clear();
      layer.label.visible = false;
    });
    this.cursorTrail.clear();
    this.cursor.clear();
    this.cursorClicks.clear();
  }
}
