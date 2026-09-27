import type { PixiBeatmapViewer } from '@ore/beatmap-viewer';

/// The main playfield's viewer, used by clip export to render frames. Split-view panes never
/// register, so exports always match the main preview.
let current: PixiBeatmapViewer | null = null;

export function setExportViewer(viewer: PixiBeatmapViewer | null): void {
  current = viewer;
}

export function releaseExportViewer(viewer: unknown): void {
  if (current === viewer) current = null;
}

export function exportViewer(): PixiBeatmapViewer | null {
  return current;
}
