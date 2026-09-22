import { useEffect, useRef, useState } from 'react';
import type { AcquisitionAction } from '../../MapAcquisition';
import { timelineStart, useEditorStore } from '../../stores/editor';
import { FileMenu } from './FileMenu';
import { EditMenu } from './EditMenu';
import { ViewMenu } from './ViewMenu';
import { PlaybackMenu } from './PlaybackMenu';
import { TimelineMenu } from './TimelineMenu';

type MenuName = 'file' | 'edit' | 'view' | 'playback' | 'timeline';

export function MenuBar({
  openAcquisition,
  splitView,
  setSplitView,
  resetLeftSource,
  setSettingsOpen,
  setChangelogOpen,
  onSaveProject,
  onOpenProject,
}: {
  openAcquisition: (action: AcquisitionAction) => void;
  splitView: boolean;
  setSplitView: (value: boolean) => void;
  resetLeftSource: () => void;
  setSettingsOpen: (value: boolean) => void;
  setChangelogOpen: (value: boolean) => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
}) {
  const tracks = useEditorStore((state) => state.tracks);
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const durationMs = useEditorStore((state) => state.durationMs);
  const beatmapObjects = useEditorStore((state) => state.beatmapObjects);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.undoStack.length > 0);
  const canRedo = useEditorStore((state) => state.redoStack.length > 0);
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const invertCursorAxis = useEditorStore((state) => state.invertCursorAxis);
  const pixelsPerSecond = useEditorStore((state) => state.pixelsPerSecond);
  const setPixelsPerSecond = useEditorStore((state) => state.setPixelsPerSecond);
  const timelineWheelMode = useEditorStore((state) => state.timelineWheelMode);
  const timelineWheelStepMs = useEditorStore((state) => state.timelineWheelStepMs);
  const setTimelineWheelMode = useEditorStore((state) => state.setTimelineWheelMode);
  const setTimelineWheelStepMs = useEditorStore((state) => state.setTimelineWheelStepMs);
  const timelineLaneHeight = useEditorStore((state) => state.timelineLaneHeight);
  const timelineDefaultLaneHeight = useEditorStore((state) => state.timelineDefaultLaneHeight);
  const setAllTimelineLaneHeights = useEditorStore((state) => state.setAllTimelineLaneHeights);
  const saveDefaultTimelineLaneHeight = useEditorStore((state) => state.saveDefaultTimelineLaneHeight);
  const resetTimelineLaneHeights = useEditorStore((state) => state.resetTimelineLaneHeights);
  const requestTimelineFocus = useEditorStore((state) => state.requestTimelineFocus);
  const [menuOpen, setMenuOpen] = useState<MenuName | null>(null);
  const [menuLaneHeight, setMenuLaneHeight] = useState(timelineLaneHeight);
  const menuBarRef = useRef<HTMLElement>(null);

  useEffect(() => setMenuLaneHeight(timelineLaneHeight), [timelineLaneHeight]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setMenuOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const runAction = (action: AcquisitionAction) => {
    openAcquisition(action);
    setMenuOpen(null);
  };

  return (
    <nav className="menu-bar" ref={menuBarRef} onPointerLeave={() => setMenuOpen(null)}>
      <div className="menu-item" onPointerEnter={() => setMenuOpen('file')}>
        <button aria-haspopup="menu" aria-expanded={menuOpen === 'file'} onFocus={() => setMenuOpen('file')}>
          File
        </button>
        {menuOpen === 'file' && (
          <FileMenu
            hasTracks={!!tracks.length}
            onAction={runAction}
            onSaveProject={() => {
              onSaveProject();
              setMenuOpen(null);
            }}
            onOpenProject={() => {
              onOpenProject();
              setMenuOpen(null);
            }}
          />
        )}
      </div>
      <div className="menu-item" onPointerEnter={() => setMenuOpen('edit')}>
        <button aria-haspopup="menu" aria-expanded={menuOpen === 'edit'} onFocus={() => setMenuOpen('edit')}>
          Edit
        </button>
        {menuOpen === 'edit' && (
          <EditMenu
            scopeLabel={
              selectedTimeRange
                ? `Selected area: ${selectedTimeRange.startMs}–${selectedTimeRange.endMs} ms`
                : 'Whole replay'
            }
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => {
              undo();
              setMenuOpen(null);
            }}
            onRedo={() => {
              redo();
              setMenuOpen(null);
            }}
            onInvertAxis={(axis) => {
              invertCursorAxis(axis);
              setMenuOpen(null);
            }}
          />
        )}
      </div>
      <div className="menu-item" onPointerEnter={() => setMenuOpen('view')}>
        <button aria-haspopup="menu" aria-expanded={menuOpen === 'view'} onFocus={() => setMenuOpen('view')}>
          View
        </button>
        {menuOpen === 'view' && (
          <ViewMenu
            splitView={splitView}
            onSingleView={() => {
              setSplitView(false);
              resetLeftSource();
              setMenuOpen(null);
            }}
            onSplitView={() => {
              setSplitView(true);
              setMenuOpen(null);
            }}
            onOpenSettings={() => {
              setSettingsOpen(true);
              setMenuOpen(null);
            }}
            onOpenChangelog={() => {
              setChangelogOpen(true);
              setMenuOpen(null);
            }}
          />
        )}
      </div>
      <div className="menu-item" onPointerEnter={() => setMenuOpen('playback')}>
        <button aria-haspopup="menu" aria-expanded={menuOpen === 'playback'} onFocus={() => setMenuOpen('playback')}>
          Playback
        </button>
        {menuOpen === 'playback' && (
          <PlaybackMenu
            playing={playing}
            onTogglePlay={() => setPlaying(!playing)}
            onGoToStart={() => setPlayhead(timelineStart(tracks, beatmapObjects))}
            onGoToEnd={() => setPlayhead(durationMs)}
            wheelMode={timelineWheelMode}
            onWheelModeChange={setTimelineWheelMode}
            wheelStepMs={timelineWheelStepMs}
            onWheelStepChange={setTimelineWheelStepMs}
          />
        )}
      </div>
      <div className="menu-item" onPointerEnter={() => setMenuOpen('timeline')}>
        <button aria-haspopup="menu" aria-expanded={menuOpen === 'timeline'} onFocus={() => setMenuOpen('timeline')}>
          Timeline
        </button>
        {menuOpen === 'timeline' && (
          <TimelineMenu
            onCenterOnPlayhead={() => {
              requestTimelineFocus();
              setMenuOpen(null);
            }}
            onZoomIn={() => setPixelsPerSecond(pixelsPerSecond * 1.25)}
            onZoomOut={() => setPixelsPerSecond(pixelsPerSecond / 1.25)}
            onResetZoom={() => setPixelsPerSecond(138)}
            laneHeightDraft={menuLaneHeight}
            onLaneHeightDraftChange={setMenuLaneHeight}
            onApplyLaneHeight={() => setAllTimelineLaneHeights(menuLaneHeight)}
            onSaveDefaultLaneHeight={() => saveDefaultTimelineLaneHeight(menuLaneHeight)}
            onResetLaneHeights={resetTimelineLaneHeights}
            defaultLaneHeight={timelineDefaultLaneHeight}
          />
        )}
      </div>
    </nav>
  );
}
