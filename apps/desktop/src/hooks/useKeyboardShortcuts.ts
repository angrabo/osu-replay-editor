import { useEffect } from 'react';
import { adjacentReplayFrameTime, useEditorStore, type Tool } from '../stores/editor';
import type { AcquisitionAction } from '../MapAcquisition';
import { jumpTo } from '../navigation';
import { actionForEvent, type KeyScope } from '../keybindings';

const playfieldTools: Partial<Record<string, Tool>> = {
  'tool-select': 'select',
  'tool-hand': 'hand',
  'tool-draw': 'draw',
  'tool-brush': 'brush',
  'tool-zoom': 'zoom',
};

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
      if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const scopes: KeyScope[] =
        useEditorStore.getState().editorSurface === 'gameplay' ? ['global', 'playfield'] : ['global'];
      const action = actionForEvent(event, scopes);
      if (!action) return;
      const state = useEditorStore.getState();
      const tool = playfieldTools[action];
      if (tool) {
        event.preventDefault();
        state.setTool(tool);
        return;
      }
      switch (action) {
        case 'open-replays':
          event.preventDefault();
          openAcquisition('select-replays');
          break;
        case 'open-settings':
          event.preventDefault();
          setSettingsOpen(true);
          break;
        case 'copy':
          event.preventDefault();
          state.copySelectedInputs();
          break;
        case 'paste':
          event.preventDefault();
          state.pasteInputs(false);
          break;
        case 'duplicate':
          event.preventDefault();
          state.duplicateSelectedInputs();
          break;
        case 'undo':
          event.preventDefault();
          undo();
          break;
        case 'redo':
          event.preventDefault();
          redo();
          break;
        case 'next-object':
        case 'previous-object':
          event.preventDefault();
          jumpTo('object', action === 'next-object' ? 1 : -1);
          break;
        case 'next-miss':
        case 'previous-miss':
          event.preventDefault();
          jumpTo('miss', action === 'next-miss' ? 1 : -1);
          break;
        case 'next-100':
        case 'previous-100':
          event.preventDefault();
          jumpTo('100', action === 'next-100' ? 1 : -1);
          break;
        case 'next-50':
        case 'previous-50':
          event.preventDefault();
          jumpTo('50', action === 'next-50' ? 1 : -1);
          break;
        case 'next-combo-break':
        case 'previous-combo-break':
          event.preventDefault();
          jumpTo('combo-break', action === 'next-combo-break' ? 1 : -1);
          break;
        case 'add-marker':
          event.preventDefault();
          state.setEditingMarker(state.addMarker(state.playheadMs));
          break;
        case 'next-marker':
        case 'previous-marker':
          event.preventDefault();
          jumpTo('marker', action === 'next-marker' ? 1 : -1);
          break;
        case 'tool-move-frames':
          event.preventDefault();
          state.setEditorSurface('gameplay');
          state.setTool('curve');
          break;
        case 'deselect':
          state.setEditingMarker(null);
          state.selectInput(null);
          state.selectCursorFrame(null);
          state.selectBeatmapObject(null);
          break;
        case 'play-pause':
          event.preventDefault();
          setPlaying(!state.playing);
          break;
        case 'previous-frame':
        case 'next-frame': {
          const track =
            state.tracks.find((item) => item.id === state.previewTrackId) ??
            state.tracks.find((item) => state.selectedTrackIds.includes(item.id)) ??
            state.tracks[0];
          const frameTime = track
            ? adjacentReplayFrameTime(track.replay.frames, state.playheadMs, action === 'next-frame' ? 1 : -1)
            : null;
          if (frameTime !== null) {
            event.preventDefault();
            state.setPlaying(false);
            state.setPlayhead(frameTime);
          }
          break;
        }
        case 'delete': {
          const nodeTool = state.tool === 'curve' || state.tool === 'select';
          if (nodeTool && state.previewTrackId && state.selectedCursorFrameTimes.length) {
            event.preventDefault();
            state.deleteSelectedCursorFrames(state.previewTrackId);
          } else if (nodeTool && state.previewTrackId && state.selectedCursorFrameMs !== null) {
            event.preventDefault();
            state.deleteCursorFrame(state.previewTrackId, state.selectedCursorFrameMs);
          } else if (state.selectedInputs.length) {
            event.preventDefault();
            state.deleteSelectedInput();
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo, setPlaying]);
}
