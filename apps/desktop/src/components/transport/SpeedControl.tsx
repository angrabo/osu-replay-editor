import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, useEditorStore } from '../../stores/editor';

const PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5];

const label = (rate: number) => `${Number(rate.toPrecision(4))}x`;

/// Playback speed: type any value from 0.001x to 5x, or open the list and pick a preset. Below
/// 0.0625x the music stops (browsers cannot play audio that slowly) and the playfield keeps its
/// own clock.
export function SpeedControl() {
  const rate = useEditorStore((state) => state.playbackRate);
  const setPlaybackRate = useEditorStore((state) => state.setPlaybackRate);
  const [draft, setDraft] = useState(label(rate));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(label(rate)), [rate]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const commit = () => {
    const value = Number.parseFloat(draft.replace(',', '.').replace(/x$/i, ''));
    if (Number.isFinite(value) && value > 0) setPlaybackRate(value);
    // Out-of-range values are clamped by the store; invalid text reverts.
    setDraft(label(useEditorStore.getState().playbackRate));
  };
  return (
    <div
      className="speed-control"
      ref={rootRef}
      title={`Playback speed, ${MIN_PLAYBACK_RATE}x to ${MAX_PLAYBACK_RATE}x. Below 0.0625x the music is silent.`}
    >
      <input
        value={draft}
        spellCheck={false}
        inputMode="decimal"
        aria-label="Playback speed"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(label(rate));
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="speed-control-toggle"
        aria-label="Speed presets"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="speed-control-menu" role="listbox">
          {PRESETS.map((preset) => (
            <button
              type="button"
              role="option"
              key={preset}
              aria-selected={preset === rate}
              className={preset === rate ? 'active' : undefined}
              onClick={() => {
                setPlaybackRate(preset);
                setOpen(false);
              }}
            >
              {label(preset)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
