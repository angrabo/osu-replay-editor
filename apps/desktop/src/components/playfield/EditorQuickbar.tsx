import {
  Brush,
  Eye,
  Hand,
  MousePointer2,
  Pencil,
  Scan,
  Scissors,
  SlidersHorizontal,
  Spline,
  Clock3,
} from 'lucide-react';
import { useEditorStore, type Tool } from '../../stores/editor';
import { OptionTilesPopover } from './OptionTilesPopover';
import { SnapWidget } from '../../hooks/useSnapDrag';
import { optionPreviews } from './optionPreviews';
import { InfoTip } from '../InfoTip';

export function EditorQuickbar() {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const wheelMode = useEditorStore((state) => state.timelineWheelMode);
  const wheelStep = useEditorStore((state) => state.timelineWheelStepMs);
  const setWheelMode = useEditorStore((state) => state.setTimelineWheelMode);
  const setWheelStep = useEditorStore((state) => state.setTimelineWheelStepMs);
  const showCursorPast = useEditorStore((state) => state.showCursorPast);
  const showCursorFuture = useEditorStore((state) => state.showCursorFuture);
  const showInputPaths = useEditorStore((state) => state.showInputPaths);
  const showClickMarkers = useEditorStore((state) => state.showClickMarkers);
  const setCursorDisplay = useEditorStore((state) => state.setCursorDisplay);
  const wireframeGameplay = useEditorStore((state) => state.wireframeGameplay);
  const fadeAfterClick = useEditorStore((state) => state.fadeAfterClick);
  const showHitJudgements = useEditorStore((state) => state.showHitJudgements);
  const showHiddenFade = useEditorStore((state) => state.showHiddenFade);
  const setGameplayFilter = useEditorStore((state) => state.setGameplayFilter);
  const cursorSmoothing = useEditorStore((state) => state.cursorSmoothing);
  const setCursorSmoothing = useEditorStore((state) => state.setCursorSmoothing);
  const drawRangeSnap = useEditorStore((state) => state.drawRangeSnap);
  const setDrawRangeSnap = useEditorStore((state) => state.setDrawRangeSnap);
  const brushRadiusPx = useEditorStore((state) => state.brushRadiusPx);
  const setBrushRadiusPx = useEditorStore((state) => state.setBrushRadiusPx);
  const brushStrength = useEditorStore((state) => state.brushStrength);
  const setBrushStrength = useEditorStore((state) => state.setBrushStrength);
  const magneticMove = useEditorStore((state) => state.magneticMove);
  const setMagneticMove = useEditorStore((state) => state.setMagneticMove);
  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: 'Select cursor frames, Ctrl+click adds (V)' },
    { id: 'hand', icon: <Hand size={16} />, label: 'Pan playfield (H)' },
    { id: 'draw', icon: <Pencil size={16} />, label: 'Draw cursor path in selected time range' },
    { id: 'curve', icon: <Spline size={16} />, label: 'Move cursor frames (T)' },
    { id: 'brush', icon: <Brush size={16} />, label: 'Warp nearby cursor points, strongest at the center' },
    { id: 'split', icon: <Scissors size={16} />, label: 'Split selected input at playhead' },
    { id: 'zoom', icon: <Scan size={16} />, label: 'Zoom playfield' },
  ];
  return (
    <SnapWidget
      id="quickbar"
      panel="quickbar"
      fallback="top-left"
      order={1}
      grip
      className="editor-quickbar"
      ariaLabel="Editor tools"
    >
      {tools.map((item) =>
        item.id === 'draw' ? (
          <div className="quickbar-popover-host" key={item.id}>
            <button
              className={tool === item.id ? 'active' : ''}
              title={item.label}
              aria-label={item.label}
              onClick={() => setTool(item.id)}
            >
              {item.icon}
            </button>
            <div className="premiere-popover quickbar-popover draw-smoothing-popover">
              <strong className="popover-title">
                Draw smoothing
                <InfoTip text="Smoothing is applied when the drawn stroke is committed." />
              </strong>
              <div className="quickbar-choice-grid">
                {(['off', 'light', 'medium', 'strong'] as const).map((value) => (
                  <button
                    key={value}
                    className={cursorSmoothing === value ? 'active' : ''}
                    onClick={() => setCursorSmoothing(value)}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <label className="quickbar-toggle">
                <input
                  type="checkbox"
                  checked={drawRangeSnap}
                  onChange={(event) => setDrawRangeSnap(event.target.checked)}
                />
                <span>Snap drawing to range endpoints</span>
              </label>
            </div>
          </div>
        ) : item.id === 'curve' ? (
          <div className="quickbar-popover-host" key={item.id}>
            <button
              className={tool === item.id ? 'active' : ''}
              title={item.label}
              aria-label={item.label}
              onClick={() => setTool(item.id)}
            >
              {item.icon}
            </button>
            <div className="premiere-popover quickbar-popover">
              <strong className="popover-title">
                Move cursor frames
                <InfoTip text="Drag a frame to move it with every selected frame. Ctrl+click adds to the selection." />
              </strong>
              <label className="quickbar-toggle">
                <input
                  type="checkbox"
                  checked={magneticMove}
                  onChange={(event) => setMagneticMove(event.target.checked)}
                />
                <span>
                  Magnetic
                  <InfoTip text="Neighbouring frames along the path follow smoothly. Reach grows with the drag; sharp corners and cursor reversals stay pinned." />
                </span>
              </label>
            </div>
          </div>
        ) : item.id === 'brush' ? (
          <div className="quickbar-popover-host" key={item.id}>
            <button
              className={tool === item.id ? 'active' : ''}
              title={item.label}
              aria-label={item.label}
              onClick={() => setTool(item.id)}
            >
              {item.icon}
            </button>
            <div className="premiere-popover quickbar-popover">
              <strong className="popover-title">
                Brush
                <InfoTip text="Nearby cursor points warp toward the drag, strongest at the brush center. Strength sets how much of the drag each dab applies." />
              </strong>
              <label>
                <span>Radius</span>
                <input
                  type="range"
                  min="4"
                  max="200"
                  step="2"
                  value={brushRadiusPx}
                  onChange={(event) => setBrushRadiusPx(Number(event.target.value) || 4)}
                />
                <output>{brushRadiusPx} px</output>
              </label>
              <label>
                <span>Strength</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={Math.round(brushStrength * 100)}
                  onChange={(event) => setBrushStrength(Number(event.target.value) / 100)}
                />
                <output>{Math.round(brushStrength * 100)}%</output>
              </label>
            </div>
          </div>
        ) : (
          <button
            key={item.id}
            className={tool === item.id ? 'active' : ''}
            title={item.label}
            aria-label={item.label}
            onClick={() => setTool(item.id)}
          >
            {item.icon}
          </button>
        ),
      )}
      <div className="quickbar-divider" />
      <OptionTilesPopover
        icon={<Eye size={16} />}
        label="Cursor overlay visibility"
        title="Cursor overlays"
        description="Choose which replay guides are drawn around the current cursor."
        storageKey="osu-replay-editor.popover-size.cursor-overlays"
        tiles={(
          [
            ['past', 'Gray past trail', showCursorPast, optionPreviews.pastTrail],
            ['future', 'White future trail', showCursorFuture, optionPreviews.futureTrail],
            ['input-paths', 'Input colour paths', showInputPaths, optionPreviews.inputPaths],
            ['click-markers', 'Press/release circles', showClickMarkers, optionPreviews.clickMarkers],
          ] as const
        ).map(([option, label, checked, preview]) => ({
          id: option,
          label,
          checked,
          preview,
          onToggle: (next) => setCursorDisplay(option, next),
        }))}
      />
      <OptionTilesPopover
        icon={<SlidersHorizontal size={16} />}
        label="Gameplay filters"
        title="Gameplay filters"
        description="Changes apply immediately to the playfield."
        storageKey="osu-replay-editor.popover-size.gameplay-filters"
        active={wireframeGameplay || fadeAfterClick || showHitJudgements || showHiddenFade}
        tiles={(
          [
            ['wireframeGameplay', 'Wireframe gameplay', wireframeGameplay, optionPreviews.wireframe],
            ['fadeAfterClick', 'Fade after click', fadeAfterClick, optionPreviews.fadeAfterClick],
            ['showHitJudgements', 'Show 100, 50 and misses', showHitJudgements, optionPreviews.judgements],
            ['showHiddenFade', 'Show Hidden fade', showHiddenFade, optionPreviews.hiddenFade],
          ] as const
        ).map(([filter, label, checked, preview]) => ({
          id: filter,
          label,
          checked,
          preview,
          onToggle: (next) => setGameplayFilter(filter, next),
        }))}
      />
      <div className="quickbar-popover-host">
        <button title="Timeline scroll step" aria-label="Timeline scroll step">
          <Clock3 size={16} />
        </button>
        <div className="premiere-popover quickbar-popover">
          <strong className="popover-title">
            Scroll controls
            <InfoTip text="Wheel seeks time · Ctrl zooms · Alt resizes the hovered timeline lane" />
          </strong>
          <label>
            <span>Step</span>
            <select
              value={wheelMode}
              onChange={(event) => setWheelMode(event.target.value as 'frame' | 'milliseconds')}
            >
              <option value="frame">1 replay frame</option>
              <option value="milliseconds">Milliseconds</option>
            </select>
          </label>
          <label>
            <span>Milliseconds</span>
            <input
              type="number"
              min="1"
              max="10000"
              value={wheelStep}
              disabled={wheelMode === 'frame'}
              onChange={(event) => setWheelStep(Number(event.target.value))}
            />
          </label>
          <div className="popover-presets">
            {[1, 5, 10, 17, 50, 100].map((value) => (
              <button key={value} disabled={wheelMode === 'frame'} onClick={() => setWheelStep(value)}>
                {value} ms
              </button>
            ))}
          </div>
        </div>
      </div>
    </SnapWidget>
  );
}
