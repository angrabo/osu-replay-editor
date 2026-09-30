import { sampleCandidates, type HitsoundSample } from '@ore/beatmap-viewer';

type Loader = (file: string) => Promise<ArrayBuffer | null>;

/// Decoded hitsound samples and their playback. Beatmap samples (custom index/file) win over the
/// skin's; anything missing in both stays silent. Buffers are cached per file.
export class HitsoundPlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly resolved = new Map<string, Promise<AudioBuffer | null>>();
  private readonly pending = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly beatmap: Loader,
    private readonly skin: Loader,
    private readonly skinFiles: ReadonlySet<string>,
    // Off: only the beatmap's own samples play.
    private readonly useSkin: boolean,
  ) {}

  private audio(): AudioContext {
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private load(source: 'beatmap' | 'skin', file: string): Promise<AudioBuffer | null> {
    const key = `${source}:${file.toLowerCase()}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      buffer = (source === 'beatmap' ? this.beatmap(file) : this.skin(file))
        .then((bytes) => (bytes && bytes.byteLength ? this.audio().decodeAudioData(bytes.slice(0)) : null))
        .catch(() => null);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  /// The buffer for a sample: its beatmap variants in order, then the skin's.
  resolve(sample: HitsoundSample): Promise<AudioBuffer | null> {
    const key = `${sample.file ?? ''}|${sample.name}|${sample.index}`;
    let buffer = this.resolved.get(key);
    if (!buffer) {
      const candidates = sampleCandidates(sample);
      buffer = (async () => {
        for (const file of candidates.beatmap) {
          const found = await this.load('beatmap', file);
          if (found) return found;
        }
        if (this.useSkin)
          for (const file of candidates.skin) {
            if (!this.skinFiles.has(file.toLowerCase())) continue;
            const found = await this.load('skin', file);
            if (found) return found;
          }
        return null;
      })();
      this.resolved.set(key, buffer);
    }
    return buffer;
  }

  /// Plays samples `delayMs` of real time from now, at `gain` × each sample's own volume.
  play(samples: readonly HitsoundSample[], delayMs: number, gain: number): void {
    if (gain <= 0) return;
    const context = this.audio();
    // The moment it should sound, fixed now: a sample still decoding must not play late, and a
    // batch that finishes decoding together must not all sound at once.
    const when = context.currentTime + Math.max(0, delayMs) / 1000;
    for (const sample of samples) {
      void this.resolve(sample).then((buffer) => {
        if (!buffer || context.currentTime > when + 0.03) return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        const volume = context.createGain();
        volume.gain.value = gain * (sample.volume / 100);
        source.connect(volume).connect(context.destination);
        source.onended = () => this.pending.delete(source);
        this.pending.add(source);
        source.start(Math.max(when, context.currentTime));
      });
    }
  }

  /// Stops samples that were scheduled but have not started (after a pause or seek).
  cancelPending(): void {
    const now = this.context?.currentTime ?? 0;
    for (const source of this.pending) {
      try {
        source.stop(now);
      } catch {
        /* already finished */
      }
    }
    this.pending.clear();
  }

  dispose(): void {
    this.cancelPending();
    void this.context?.close();
    this.context = null;
  }
}
