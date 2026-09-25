import { useEffect, useRef, useState } from 'react';

const stepFor = (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  event.shiftKey ? 100 : event.ctrlKey || event.metaKey ? 10 : 1;

// Number field tuned for quick scrubbing: wheel / arrow keys step by 1, Ctrl by 10, Shift by 100;
// typed values commit on Enter or blur, Escape restores the current value.
export function StepNumberInput({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  title = 'Scroll or ↑/↓ to change · Ctrl ×10 · Shift ×100',
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef({ value, min, max, onChange });
  latest.current = { value, min, max, onChange };
  // Several wheel ticks can land before React re-renders with the new value; step from the
  // last value we emitted so none of them get lost.
  const pendingRef = useRef<number | null>(null);
  useEffect(() => {
    pendingRef.current = null;
  }, [value]);

  const clamp = (next: number) => Math.max(latest.current.min, Math.min(latest.current.max, Math.round(next)));
  const nudge = (delta: number) => {
    const base = pendingRef.current ?? latest.current.value;
    const next = clamp(base + delta);
    if (next === base) return;
    pendingRef.current = next;
    latest.current.onChange(next);
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Native, non-passive listener: the wheel must not also scroll/seek whatever is underneath.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      nudge((event.deltaY < 0 ? 1 : -1) * stepFor(event));
    };
    input.addEventListener('wheel', onWheel, { passive: false });
    return () => input.removeEventListener('wheel', onWheel);
  }, []);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      const next = clamp(parsed);
      if (next !== value) onChange(next);
    }
  };

  return (
    <input
      ref={inputRef}
      className="step-number-input"
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      title={title}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d-]/g, ''))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          setDraft(null);
          nudge((event.key === 'ArrowUp' ? 1 : -1) * stepFor(event));
        }
      }}
    />
  );
}
