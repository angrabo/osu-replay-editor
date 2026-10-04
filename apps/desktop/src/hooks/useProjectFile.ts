import { useEffect, useRef } from 'react';
import type { Resolution } from '../MapAcquisition';
import { PROJECT_FILE_EXTENSION, currentProjectView, projectFileName, serializeProject } from '../project';
import { recordRecentFile } from '../recentFiles';
import { useAutosaveStore } from '../stores/autosave';
import { useEditorStore, type EditorState } from '../stores/editor';

// What a project file holds beyond view preferences; a change to any of these makes it unsaved.
const content = (state: EditorState) => [state.tracks, state.archivedTracks, state.markers, state.ignoredSuspicions];

const say = (lastEditMessage: string) => useEditorStore.setState({ lastEditMessage });
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function desktop() {
  const { isTauri, invoke } = await import('@tauri-apps/api/core');
  return isTauri() ? invoke : null;
}

/// The project file behind the editor: where it was saved or opened from, saving in place, and
/// autosave. Autosave writes to the project's own file; a project that was never saved goes to
/// the app's autosave folder instead (and shows up under File › Open recent).
export function useProjectFile(resolution: Resolution | null) {
  const pathRef = useRef<string | null>(null);
  const savedRef = useRef<unknown[] | null>(null);
  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;

  const build = () => {
    const state = useEditorStore.getState();
    const project = serializeProject(
      state.tracks,
      currentProjectView(state),
      resolutionRef.current,
      state.archivedTracks,
      state.archivedMapInfo,
      state.markers,
      state.ignoredSuspicions,
    );
    return { json: JSON.stringify(project), name: projectFileName(project), saved: content(state) };
  };
  const unsaved = () => {
    const state = useEditorStore.getState();
    const now = content(state);
    return (
      state.tracks.length > 0 && !(savedRef.current && now.every((item, index) => item === savedRef.current![index]))
    );
  };

  /// Writes the project to `path` without asking; false when not on desktop or the write failed.
  const writeTo = async (path: string, remember: boolean): Promise<boolean> => {
    const invoke = await desktop();
    if (!invoke) return false;
    const { json, saved } = build();
    await invoke('write_project_file', { path, contents: json });
    if (remember) {
      pathRef.current = path;
      savedRef.current = saved;
    }
    return true;
  };

  /// File › Save project: in place when the project has a file, otherwise (or with `as`) it asks where.
  const save = async (options: { as?: boolean } = {}) => {
    try {
      if (pathRef.current && !options.as) {
        await writeTo(pathRef.current, true);
        say(`Saved project · ${clock()}`);
        return;
      }
      const { name, json } = build();
      if (!(await desktop())) {
        // Browser preview: hand the file to the browser instead.
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      const { save: pickPath } = await import('@tauri-apps/plugin-dialog');
      const path = await pickPath({
        defaultPath: pathRef.current ?? name,
        filters: [{ name: 'osu! Replay Editor project', extensions: [PROJECT_FILE_EXTENSION] }],
      });
      if (!path) return;
      await writeTo(path, true);
      recordRecentFile('project', [path]);
      say(`Saved project · ${clock()}`);
    } catch (error) {
      say(`Could not save the project: ${String((error as Error)?.message ?? error)}`);
    }
  };

  /// A project was opened: from `path` when known, so saving goes back to that file.
  const opened = (path: string | null) => {
    pathRef.current = path;
    savedRef.current = content(useEditorStore.getState());
  };

  const autosave = async () => {
    if (!unsaved()) return;
    try {
      if (pathRef.current) {
        if (await writeTo(pathRef.current, true)) say(`Autosaved project · ${clock()}`);
        return;
      }
      if (!(await desktop())) return;
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const path = await join(await appDataDir(), 'autosave', build().name);
      await writeTo(path, false);
      // Not adopted as the project's file: Save still asks where the project should live.
      savedRef.current = content(useEditorStore.getState());
      recordRecentFile('project', [path]);
      say(`Autosaved a copy · ${clock()} · find it under File › Open recent`);
    } catch (error) {
      say(`Autosave failed: ${String((error as Error)?.message ?? error)}`);
    }
  };
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  const enabled = useAutosaveStore((state) => state.enabled);
  const minutes = useAutosaveStore((state) => state.minutes);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => void autosaveRef.current(), minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, minutes]);

  // Ignoring a suspicious stretch is a decision about the project, so it is written straight away
  // when the project has a file.
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        // All replays cleared: whatever comes next is a new project, not the old file.
        if (!state.tracks.length && previous.tracks.length) {
          pathRef.current = null;
          savedRef.current = null;
        }
        if (state.ignoredSuspicions === previous.ignoredSuspicions || !pathRef.current) return;
        if (savedRef.current && state.ignoredSuspicions === savedRef.current[3]) return;
        void writeTo(pathRef.current, true).catch((error) =>
          say(`Could not save the project: ${String((error as Error)?.message ?? error)}`),
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { save, opened };
}
