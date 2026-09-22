import { Eye, Hand, MousePointer2, Pencil, Scan, Scissors, SlidersHorizontal, Spline, Clock3 } from 'lucide-react';
import { useEditorStore, type Tool } from '../../stores/editor';

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
  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: 'Move cursor frame' },
    { id: 'hand', icon: <Hand size={16} />, label: 'Pan playfield' },
    { id: 'draw', icon: <Pencil size={16} />, label: 'Draw cursor path in selected time range' },
    { id: 'curve', icon: <Spline size={16} />, label: 'Edit cursor line nodes' },
    { id: 'split', icon: <Scissors size={16} />, label: 'Split selected input at playhead' },
    { id: 'zoom', icon: <Scan size={16} />, label: 'Zoom playfield' },
  ];
  return (
    <div className="editor-quickbar" aria-label="Editor tools">
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
              <strong>Draw smoothing</strong>
              <small>Smoothing is applied when the drawn stroke is committed.</small>
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
      <div className="quickbar-popover-host">
        <button title="Cursor overlay visibility" aria-label="Cursor overlay visibility">
          <Eye size={16} />
        </button>
        <div className="premiere-popover quickbar-popover cursor-overlay-popover">
          <strong>Cursor overlays</strong>
          <small>Choose which replay guides are drawn around the current cursor.</small>
          {(
            [
              ['past', 'Gray past trail', showCursorPast],
              ['future', 'White future trail', showCursorFuture],
              ['input-paths', 'Input colour paths', showInputPaths],
              ['click-markers', 'Press/release circles', showClickMarkers],
            ] as const
          ).map(([option, label, checked]) => (
            <label className="quickbar-toggle" key={option}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setCursorDisplay(option, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="quickbar-popover-host">
        <button
          className={wireframeGameplay || fadeAfterClick || showHitJudgements || showHiddenFade ? 'active' : ''}
          title="Gameplay filters"
          aria-label="Gameplay filters"
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="premiere-popover quickbar-popover gameplay-filters-popover">
          <strong>Gameplay filters</strong>
          <small>Changes apply immediately to the playfield.</small>
          {(
            [
              ['wireframeGameplay', 'Wireframe gameplay', wireframeGameplay],
              ['fadeAfterClick', 'Fade after click', fadeAfterClick],
              ['showHitJudgements', 'Show 100, 50 and misses', showHitJudgements],
              ['showHiddenFade', 'Show Hidden fade', showHiddenFade],
            ] as const
          ).map(([filter, label, checked]) => (
            <label className="quickbar-toggle" key={filter}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setGameplayFilter(filter, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="quickbar-popover-host">
        <button title="Timeline scroll step" aria-label="Timeline scroll step">
          <Clock3 size={16} />
        </button>
        <div className="premiere-popover quickbar-popover">
          <strong>Scroll controls</strong>
          <small>Wheel seeks time · Ctrl zooms · Alt resizes the hovered timeline lane</small>
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
    </div>
  );
}
