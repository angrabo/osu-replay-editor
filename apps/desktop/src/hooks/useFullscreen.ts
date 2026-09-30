import { useSyncExternalStore } from 'react';

/// Fullscreen playfield. The playfield always covers the whole app window (a fixed layer), and the
/// document additionally asks for real screen fullscreen; where that is refused (permissions, some
/// WebViews) the window-filling layer still works. Esc leaves either way.
let active = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && active) {
    event.stopPropagation();
    exitFullscreen();
  }
}

function onFullscreenChange() {
  // Leaving screen fullscreen (Esc, F11, system) also leaves the playfield mode.
  if (!document.fullscreenElement && active) exitFullscreen();
}

export function enterFullscreen(): void {
  if (active) return;
  active = true;
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  void document.documentElement.requestFullscreen?.().catch(() => {});
  emit();
}

export function exitFullscreen(): void {
  if (!active) return;
  active = false;
  window.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  emit();
}

export function toggleFullscreen(): void {
  if (active) exitFullscreen();
  else enterFullscreen();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsFullscreen(): boolean {
  return useSyncExternalStore(subscribe, () => active);
}
