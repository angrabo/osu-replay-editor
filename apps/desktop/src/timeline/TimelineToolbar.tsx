import { useEffect, useState } from 'react';
import { Activity, ChevronRight, Hand, Layers3, Magnet, MousePointer2, RefreshCw, Rows3, Scissors } from 'lucide-react';
import { useEditorStore } from '../stores/editor';
import type { Resolution } from '../MapAcquisition';
import { useSimulationRunner } from '../hooks/useSimulationRunner';
import { InfoTip } from '../components/InfoTip';

const baseLaneHeight = 48;
export type TimelineLayout = 'stack' | 'overlap';
export type TimelineTool = 'select' | 'hand' | 'cut';

const timelineTools: { id: TimelineTool; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: 'select',
    label: 'Select (V)',
    hint: 'Select and edit inputs without panning the timeline',
    icon: <MousePointer2 size={15} />,
  },
  {
    id: 'hand',
    label: 'Hand (H)',
    hint: 'Pan the visible time range without selecting elements',
    icon: <Hand size={15} />,
  },
  {
    id: 'cut',
    label: 'Blade (B)',
    hint: 'Preview and split an input at the pointer without moving the playhead',
    icon: <Scissors size={15} />,
  },
];

export function TimelineToolbar({
  timelineTool,
  setTimelineTool,
  layoutMode,
  setLayoutMode,
  resolution,
}: {
  timelineTool: TimelineTool;
  setTimelineTool: (tool: TimelineTool) => void;
  layoutMode: TimelineLayout;
  setLayoutMode: (updater: (value: TimelineLayout) => TimelineLayout) => void;
  resolution: Resolution | null;
}) {
  const snap = useEditorStore((state) => state.snap);
  const setSnap = useEditorStore((state) => state.setSnap);
  const timelineLaneHeight = useEditorStore((state) => state.timelineLaneHeight);
  const timelineDefaultLaneHeight = useEditorStore((state) => state.timelineDefaultLaneHeight);
  const timelineLaneHeightRequest = useEditorStore((state) => state.timelineLaneHeightRequest);
  const selectedTimeRange = useEditorStore((state) => state.selectedTimeRange);
  const setAllTimelineLaneHeights = useEditorStore((state) => state.setAllTimelineLaneHeights);
  const saveDefaultTimelineLaneHeight = useEditorStore((state) => state.saveDefaultTimelineLaneHeight);
  const resetTimelineLaneHeights = useEditorStore((state) => state.resetTimelineLaneHeights);
  const [laneHeightDraft, setLaneHeightDraft] = useState(timelineLaneHeight);
  const { previewTrack, simulationState, simulationScope, setSimulationScope, runSimulation } =
    useSimulationRunner(resolution);

  useEffect(() => setLaneHeightDraft(timelineLaneHeight), [timelineLaneHeightRequest, timelineLaneHeight]);

  return (
    <div className="timeline-toolbar" aria-label="Timeline tools">
      {timelineTools.map((item) => (
        <div className="timeline-tool-host" key={item.id}>
          <button
            className={timelineTool === item.id ? 'active' : ''}
            title={item.label}
            aria-label={item.label}
            onClick={() => setTimelineTool(item.id)}
          >
            {item.icon}
          </button>
          <div className="timeline-tool-flyout">
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </div>
        </div>
      ))}
      <div className="timeline-toolbar-spacer" />
      <div className="timeline-simulation-host">
        <button
          className={
            simulationState?.status === 'running'
              ? 'active running'
              : simulationState?.status === 'error'
                ? 'error'
                : ''
          }
          title="Live simulation"
          aria-label="Live simulation"
          disabled={!previewTrack || !resolution}
          onClick={() => void runSimulation()}
        >
          {simulationState?.status === 'running' ? <RefreshCw size={15} /> : <Activity size={15} />}
          <span className="live-dot" />
        </button>
        <div className="premiere-popover timeline-simulation-panel">
          <strong className="popover-title">
            Simulation · Live
            <InfoTip text="Recalculates 350 ms after replay or metadata changes." />
          </strong>
          <label>
            <span>Scope</span>
            <select
              value={simulationScope}
              onChange={(event) => setSimulationScope(event.target.value as 'whole-replay' | 'selected-area')}
            >
              <option value="whole-replay">Whole replay</option>
              <option value="selected-area" disabled={!selectedTimeRange}>
                Selected area
              </option>
            </select>
          </label>
          <button
            disabled={!previewTrack || !resolution || simulationState?.status === 'running'}
            onClick={() => void runSimulation()}
          >
            {simulationState?.status === 'running' ? 'Updating…' : 'Run now'}
          </button>
          {simulationState?.result && (
            <span className="simulation-toolbar-result">
              {simulationState.result.score.toLocaleString('en-US')} · {simulationState.result.accuracy.toFixed(2)}%
            </span>
          )}
          {simulationState?.status === 'error' && (
            <span className="simulation-toolbar-error">{simulationState.error}</span>
          )}
        </div>
      </div>
      <div className="timeline-snap-host">
        <button
          className={snap !== 'off' ? 'active' : ''}
          title="Playhead snap (Shift+S)"
          aria-label={`Playhead snap: ${snap === 'off' ? 'Off' : snap === 'hit-window' ? 'Input Hit' : snap === 'hit-object' ? 'Hit Object' : 'Input + Object'}`}
        >
          <Magnet size={15} />
          {snap !== 'off' && (
            <span className="snap-mode-badge">{snap === 'hit-window' ? '1' : snap === 'hit-object' ? '2' : '3'}</span>
          )}
        </button>
        <div className="premiere-popover timeline-snap-panel">
          <strong className="popover-title">
            Playhead Snap · Shift+S
            <InfoTip text="Snaps only near a boundary. Shift+S cycles modes 1–3, then turns snap off." />
          </strong>
          <button className={snap === 'off' ? 'active' : ''} onClick={() => setSnap('off')}>
            Off
          </button>
          <button className={snap === 'hit-window' ? 'active' : ''} onClick={() => setSnap('hit-window')}>
            <b>1</b> Input Hit
          </button>
          <button className={snap === 'hit-object' ? 'active' : ''} onClick={() => setSnap('hit-object')}>
            <b>2</b> Hit Object start/end
          </button>
          <button className={snap === 'all' ? 'active' : ''} onClick={() => setSnap('all')}>
            <b>3</b> Input + Object
          </button>
        </div>
      </div>
      <button
        className={layoutMode === 'overlap' ? 'active' : ''}
        title={layoutMode === 'overlap' ? 'Overlap tracks' : 'Stack tracks'}
        aria-label="Toggle track overlap"
        onClick={() => setLayoutMode((value) => (value === 'stack' ? 'overlap' : 'stack'))}
      >
        {layoutMode === 'overlap' ? <Layers3 size={15} /> : <Rows3 size={15} />}
      </button>
      <div className="timeline-options-host">
        <button title="Timeline modes and filters" aria-label="Timeline modes and filters">
          <ChevronRight size={15} />
        </button>
        <div className="premiere-popover timeline-options-panel">
          <strong>Timeline display</strong>
          <div className="mode-buttons">
            <button className={layoutMode === 'stack' ? 'active' : ''} onClick={() => setLayoutMode(() => 'stack')}>
              <Rows3 size={13} /> Stack
            </button>
            <button className={layoutMode === 'overlap' ? 'active' : ''} onClick={() => setLayoutMode(() => 'overlap')}>
              <Layers3 size={13} /> Overlap
            </button>
          </div>
          <label className="timeline-lane-height">
            <span>All track heights</span>
            <input
              type="number"
              min="20"
              max="140"
              value={laneHeightDraft}
              onChange={(event) => setLaneHeightDraft(Number(event.target.value))}
            />
          </label>
          <div className="timeline-lane-actions">
            <button onClick={() => setAllTimelineLaneHeights(laneHeightDraft)}>
              Set to {Math.max(20, Math.min(140, Math.round(laneHeightDraft || baseLaneHeight)))} px
            </button>
            <button onClick={() => saveDefaultTimelineLaneHeight(laneHeightDraft)}>Set as default</button>
          </div>
          <button className="reset-lanes" onClick={resetTimelineLaneHeights}>
            Use default ({timelineDefaultLaneHeight} px)
          </button>
        </div>
      </div>
    </div>
  );
}
