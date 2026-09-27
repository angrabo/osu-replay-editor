import { CAPTURE_SCALE } from '@ore/beatmap-viewer';
import { exportViewer } from '../playfield/exportTarget';
import { buildPalette, GifEncoder } from './gifEncoder';

export type ClipFormat = 'mp4' | 'gif';
export type ClipOptions = {
  format: ClipFormat;
  startMs: number;
  endMs: number;
  width: number;
  fps: number;
  // Map-time speed of the replay's mods (DT/NC 1.5, HT 0.75), so the clip plays in real time.
  rate: number;
  // Nightcore raises the pitch with the speed; DT keeps it.
  nightcore: boolean;
  // Record the beatmap audio into video clips (GIFs cannot hold audio).
  audio: boolean;
};
export type ClipResult = { bytes: Uint8Array; extension: string; mimeType: string };

/// Output height for a given width: frames are 4:3 like the playfield, which fills
/// CAPTURE_SCALE of them.
export function clipHeight(width: number): number {
  return Math.round((width * 0.75) / 2) * 2;
}

export const captureScalePercent = Math.round(CAPTURE_SCALE * 100);

/// The best video container this WebView can record: MP4 when supported, otherwise WebM.
export function videoMimeType(withAudio = true): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: [string, string][] = withAudio
    ? [
        ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
        ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
        ['video/mp4;codecs=avc1.640028,opus', 'mp4'],
        ['video/mp4', 'mp4'],
        ['video/webm;codecs=vp9,opus', 'webm'],
        ['video/webm', 'webm'],
      ]
    : [
        ['video/mp4;codecs=avc1.640028', 'mp4'],
        ['video/mp4;codecs=avc1', 'mp4'],
        ['video/mp4', 'mp4'],
        ['video/webm;codecs=vp9', 'webm'],
        ['video/webm', 'webm'],
      ];
  const match = candidates.find(([type]) => MediaRecorder.isTypeSupported(type));
  return match ? { mimeType: match[0], extension: match[1] } : null;
}

// Hidden windows never fire animation frames, so a timeout backs it up.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 50);
  });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/// Renders the clip frame by frame from the main playfield viewer. `onProgress` gets 0..1;
/// aborting the signal stops at the next frame and rejects with an AbortError.
export async function exportClip(
  options: ClipOptions,
  onProgress: (progress: number, stage: string) => void,
  signal: AbortSignal,
  restoreTimeMs: number,
): Promise<ClipResult> {
  const viewer = exportViewer();
  if (!viewer) throw new Error('The playfield is not ready yet.');
  const height = clipHeight(options.width);
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: options.format === 'gif' });
  if (!context) throw new Error('Could not create a drawing surface.');
  const stepMs = (1000 / options.fps) * options.rate;
  const frameCount = Math.max(1, Math.floor((options.endMs - options.startMs) / stepMs) + 1);
  const timeAt = (frame: number) => options.startMs + frame * stepMs;
  const checkAbort = () => {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  };

  viewer.beginCapture(options.width, height);
  try {
    await nextFrame();
    if (options.format === 'gif') {
      onProgress(0, 'Building colour palette…');
      const samples: Uint8ClampedArray[] = [];
      const sampleCount = Math.min(8, frameCount);
      for (let index = 0; index < sampleCount; index++) {
        viewer.captureFrame(
          timeAt(Math.floor((index * (frameCount - 1)) / Math.max(1, sampleCount - 1))),
          context,
          options.width,
          height,
        );
        samples.push(context.getImageData(0, 0, options.width, height).data);
      }
      const encoder = new GifEncoder(options.width, height, buildPalette(samples));
      let shownCs = 0;
      for (let frame = 0; frame < frameCount; frame++) {
        checkAbort();
        viewer.captureFrame(timeAt(frame), context, options.width, height);
        // Round the running total so frame timing does not drift over long clips.
        const targetCs = Math.round(((frame + 1) * 100) / options.fps);
        encoder.addFrame(context.getImageData(0, 0, options.width, height).data, targetCs - shownCs);
        shownCs = targetCs;
        if (frame % 4 === 3) {
          onProgress((frame + 1) / frameCount, `Encoding frame ${frame + 1} of ${frameCount}`);
          await wait(0);
        }
      }
      return { bytes: encoder.finish(), extension: 'gif', mimeType: 'image/gif' };
    }

    const audioUrl = options.audio ? viewer.audioUrl() : null;
    const video = videoMimeType(!!audioUrl);
    if (!video) throw new Error('Video recording is not available in this app version.');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    // Beatmap audio: a separate element routed only into the recording (not the speakers), at the
    // mods' speed so it stays in step with the frames.
    let audio: HTMLAudioElement | null = null;
    let audioContext: AudioContext | null = null;
    if (audioUrl) {
      onProgress(0, 'Loading audio…');
      audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.playbackRate = options.rate;
      audio.preservesPitch = !options.nightcore;
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaElementSource(audio).connect(destination);
      destination.stream.getAudioTracks().forEach((audioTrack) => stream.addTrack(audioTrack));
      await new Promise<void>((resolve, reject) => {
        const element = audio!;
        element.onloadedmetadata = () => {
          element.currentTime = Math.max(0, options.startMs / 1000);
        };
        element.onseeked = () => resolve();
        element.onerror = () => reject(new Error('Could not load the beatmap audio.'));
        if (options.startMs <= 0) element.oncanplay = () => resolve();
        element.load();
      });
      await audioContext.resume();
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: video.mimeType,
      videoBitsPerSecond: Math.round(options.width * height * options.fps * 0.25),
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    // MediaRecorder stamps frames with wall-clock time, so frames are paced in real time.
    viewer.captureFrame(timeAt(0), context, options.width, height);
    recorder.start();
    const startedAt = performance.now();
    // A clip starting in the lead-in (negative time) holds the audio back until time 0.
    const audioDelayMs = Math.max(0, -options.startMs / options.rate);
    const audioTimer = audio ? window.setTimeout(() => void audio!.play().catch(() => {}), audioDelayMs) : 0;
    try {
      for (let frame = 0; frame < frameCount; frame++) {
        checkAbort();
        viewer.captureFrame(timeAt(frame), context, options.width, height);
        track.requestFrame?.();
        onProgress((frame + 1) / frameCount, `Recording frame ${frame + 1} of ${frameCount}`);
        await wait(startedAt + ((frame + 1) * 1000) / options.fps - performance.now());
      }
    } finally {
      window.clearTimeout(audioTimer);
      audio?.pause();
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((item) => item.stop());
      void audioContext?.close();
    }
    checkAbort();
    const blob = new Blob(chunks, { type: video.mimeType });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: video.extension, mimeType: video.mimeType };
  } finally {
    viewer.endCapture(restoreTimeMs);
  }
}

/// Saves the clip: native save dialog in the desktop app, a download in the browser preview.
export async function saveClip(result: ClipResult, baseName: string): Promise<string | null> {
  const fileName = `${baseName}.${result.extension}`;
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (isTauri()) {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const path = await save({
        defaultPath: fileName,
        filters: [{ name: result.extension.toUpperCase(), extensions: [result.extension] }],
      });
      if (!path) return null;
      await writeFile(path, result.bytes);
      return path;
    }
  } catch (error) {
    if ((error as Error).message !== 'not-tauri') throw error;
  }
  const url = URL.createObjectURL(new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: result.mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return fileName;
}
