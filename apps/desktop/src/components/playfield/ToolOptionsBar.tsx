import type { ReactNode } from 'react';
import { Brush, Magnet, Pencil, Spline } from 'lucide-react';
import { SnapWidget } from '../../hooks/useSnapDrag';
import { PanelCloseButton } from '../common/PanelCloseButton';
import { useEditorStore } from '../../stores/editor';

// Options of the active playfield tool, always visible so they can be tweaked mid-edit.
export function ToolOptionsBar() {
  const bar = (label: string, children: ReactNode) => (
    <SnapWidget id="toolOptions" fallback="top-left" order={3} grip className="tool-options-bar" ariaLabel={label}>
      {children}
      <PanelCloseButton panel="toolOptions" className="floating-close" />
    </SnapWidget>
  );
  const tool = useEditorStore((state) => state.tool);
  const brushRadiusPx = useEditorStore((state) => state.brushRadiusPx);
  const setBrushRadiusPx = useEditorStore((state) => state.setBrushRadiusPx);
  const brushStrength = useEditorStore((state) => state.brushStrength);
  const setBrushStrength = useEditorStore((state) => state.setBrushStrength);
  const magneticMove = useEditorStore((state) => state.magneticMove);
  const setMagneticMove = useEditorStore((state) => state.setMagneticMove);
  const cursorSmoothing = useEditorStore((state) => state.cursorSmoothing);
  const setCursorSmoothing = useEditorStore((state) => state.setCursorSmoothing);
  const drawRangeSnap = useEditorStore((state) => state.drawRangeSnap);
  const setDrawRangeSnap = useEditorStore((state) => state.setDrawRangeSnap);

  if (tool === 'brush')
    return bar(
      'Brush options',
      <>
        <Brush size={13} className="tool-options-icon" />
        <label className="tool-option-slider" title="Brush radius">
          <span>Radius</span>
          <input
            type="range"
            min="4"
            max="200"
            step="2"
            value={brushRadiusPx}
            onChange={(event) => setBrushRadiusPx(Number(event.target.value) || 4)}
          />
          <output>{brushRadiusPx}px</output>
        </label>
        <label className="tool-option-slider" title="Share of the drag each dab applies">
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
      </>,
    );

  if (tool === 'curve')
    return bar(
      'Move cursor frames options',
      <>
        <Spline size={13} className="tool-options-icon" />
        <button
          type="button"
          className={`tool-option-toggle${magneticMove ? ' active' : ''}`}
          aria-pressed={magneticMove}
          title="Magnetic: neighbouring frames along the path follow smoothly; corners and reversals stay pinned"
          onClick={() => setMagneticMove(!magneticMove)}
        >
          <Magnet size={12} /> Magnetic
        </button>
      </>,
    );

  if (tool === 'draw')
    return bar(
      'Draw options',
      <>
        <Pencil size={13} className="tool-options-icon" />
        <div className="tool-option-segmented" role="group" aria-label="Draw smoothing" title="Draw smoothing">
          {(['off', 'light', 'medium', 'strong'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cursorSmoothing === value ? 'active' : ''}
              aria-pressed={cursorSmoothing === value}
              onClick={() => setCursorSmoothing(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`tool-option-toggle${drawRangeSnap ? ' active' : ''}`}
          aria-pressed={drawRangeSnap}
          title="Snap drawing to the selected range endpoints"
          onClick={() => setDrawRangeSnap(!drawRangeSnap)}
        >
          Snap ends
        </button>
      </>,
    );

  return null;
}
