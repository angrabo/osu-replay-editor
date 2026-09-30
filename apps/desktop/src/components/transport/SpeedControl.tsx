import { useEffect, useState } from 'react';
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, useEditorStore } from '../../stores/editor';

const PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];

const label = (rate: number) => `${Number(rate.toPrecision(4))}x`;

/// Playback speed: type any value from 0.001x to 5x, or pick a preset. Below 0.0625x the music
/// stops (browsers cannot play audio that slowly) and the playfield keeps its own clock.
export function SpeedControl() {
  const rate = useEditorStore((state) => state.playbackRate);
  const setPlaybackRate = useEditorStore((state) => state.setPlaybackRate);
  const [draft, setDraft] = useState(label(rate));
  useEffect(() => setDraft(label(rate)), [rate]);
  const commit = () => {
    const value = Number.parseFloat(draft.replace(',', '.').replace(/x$/i, ''));
    if (Number.isFinite(value) && value > 0) setPlaybackRate(value);
    // Out-of-range values are clamped by the store; invalid text reverts.
    setDraft(label(useEditorStore.getState().playbackRate));
  };
  return (
    <label
      className="speed-control"
      title={`Playback speed, ${MIN_PLAYBACK_RATE}x to ${MAX_PLAYBACK_RATE}x. Below 0.0625x the music is silent.`}
    >
      <input
        value={draft}
        list="speed-presets"
        spellCheck={false}
        inputMode="decimal"
        aria-label="Playback speed"
        onChange={(event) => {
          setDraft(event.target.value);
          // Picking a preset from the list applies it straight away.
          const preset = PRESETS.find((item) => label(item) === event.target.value);
          if (preset !== undefined) setPlaybackRate(preset);
        }}
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
      <datalist id="speed-presets">
        {PRESETS.map((item) => (
          <option key={item} value={label(item)} />
        ))}
      </datalist>
    </label>
  );
}
