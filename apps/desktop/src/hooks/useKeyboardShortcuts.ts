import { useEffect } from 'react';
import { adjacentReplayFrameTime, useEditorStore } from '../stores/editor';
import type { AcquisitionAction } from '../MapAcquisition';

export function useKeyboardShortcuts({
  openAcquisition,
  setSettingsOpen,
  undo,
  redo,
  setPlaying,
}: {
  openAcquisition: (action: AcquisitionAction) => void;
  setSettingsOpen: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  setPlaying: (value: boolean) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        openAcquisition('select-replays');
      } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        useEditorStore.getState().copySelectedInputs();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        useEditorStore.getState().pasteInputs(false);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        useEditorStore.getState().duplicateSelectedInputs();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (
        !event.altKey &&
        useEditorStore.getState().editorSurface === 'gameplay' &&
        event.key.toLowerCase() === 'v'
      ) {
        event.preventDefault();
        useEditorStore.getState().setTool('select');
      } else if (
        !event.altKey &&
        useEditorStore.getState().editorSurface === 'gameplay' &&
        event.key.toLowerCase() === 'h'
      ) {
        event.preventDefault();
        useEditorStore.getState().setTool('hand');
      } else if (event.key === 'Escape') {
        const state = useEditorStore.getState();
        state.selectInput(null);
        state.selectCursorFrame(null);
        state.selectBeatmapObject(null);
      } else if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(!useEditorStore.getState().playing);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const state = useEditorStore.getState();
        const track =
          state.tracks.find((item) => item.id === state.previewTrackId) ??
          state.tracks.find((item) => state.selectedTrackIds.includes(item.id)) ??
          state.tracks[0];
        const frameTime = track
          ? adjacentReplayFrameTime(track.replay.frames, state.playheadMs, event.key === 'ArrowRight' ? 1 : -1)
          : null;
        if (frameTime !== null) {
          event.preventDefault();
          state.setPlaying(false);
          state.setPlayhead(frameTime);
        }
      } else if (event.key === 'Delete') {
        const state = useEditorStore.getState();
        if (state.tool === 'curve' && state.previewTrackId && state.selectedCursorFrameTimes.length) {
          event.preventDefault();
          state.deleteSelectedCursorFrames(state.previewTrackId);
        } else if (state.tool === 'curve' && state.previewTrackId && state.selectedCursorFrameMs !== null) {
          event.preventDefault();
          state.deleteCursorFrame(state.previewTrackId, state.selectedCursorFrameMs);
        } else if (state.selectedInputs.length) {
          event.preventDefault();
          state.deleteSelectedInput();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo, setPlaying]);
}
