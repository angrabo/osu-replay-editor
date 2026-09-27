import { jumpTo } from '../../navigation';
import { shortcutLabel, useKeybindingsVersion, type KeyActionId } from '../../keybindings';
import { useEditorStore } from '../../stores/editor';

export function PlaybackMenu({
  playing,
  onTogglePlay,
  onGoToStart,
  onGoToEnd,
  wheelMode,
  onWheelModeChange,
  wheelStepMs,
  onWheelStepChange,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  wheelMode: 'frame' | 'milliseconds';
  onWheelModeChange: (mode: 'frame' | 'milliseconds') => void;
  wheelStepMs: number;
  onWheelStepChange: (ms: number) => void;
}) {
  useKeybindingsVersion();
  const kbd = (id: KeyActionId) => {
    const label = shortcutLabel(id);
    return label ? <kbd>{label}</kbd> : null;
  };
  return (
    <div className="app-menu playback-menu" role="menu">
      <button role="menuitem" onClick={onTogglePlay}>
        {playing ? 'Pause' : 'Play'} {kbd('play-pause')}
      </button>
      <button role="menuitem" onClick={onGoToStart}>
        Go to start
      </button>
      <button role="menuitem" onClick={onGoToEnd}>
        Go to end
      </button>
      <div className="menu-separator" />
      <span className="menu-heading">Navigate</span>
      <button role="menuitem" onClick={() => jumpTo('object', 1)}>
        Next hit object {kbd('next-object')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('object', -1)}>
        Previous hit object {kbd('previous-object')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('miss', 1)}>
        Next miss {kbd('next-miss')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('miss', -1)}>
        Previous miss {kbd('previous-miss')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('100', 1)}>
        Next 100 {kbd('next-100')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('100', -1)}>
        Previous 100 {kbd('previous-100')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('50', 1)}>
        Next 50 {kbd('next-50')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('50', -1)}>
        Previous 50 {kbd('previous-50')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('combo-break', 1)}>
        Next combo break {kbd('next-combo-break')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('combo-break', -1)}>
        Previous combo break {kbd('previous-combo-break')}
      </button>
      <div className="menu-separator" />
      <span className="menu-heading">Markers</span>
      <button
        role="menuitem"
        onClick={() => {
          const state = useEditorStore.getState();
          state.setEditingMarker(state.addMarker(state.playheadMs));
        }}
      >
        Add marker at playhead {kbd('add-marker')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('marker', 1)}>
        Next marker {kbd('next-marker')}
      </button>
      <button role="menuitem" onClick={() => jumpTo('marker', -1)}>
        Previous marker {kbd('previous-marker')}
      </button>
      <div className="menu-separator" />
      <span className="menu-heading">Scroll controls</span>
      <label>
        <span>Wheel step</span>
        <select
          value={wheelMode}
          onChange={(event) => onWheelModeChange(event.target.value as 'frame' | 'milliseconds')}
        >
          <option value="frame">Replay frame</option>
          <option value="milliseconds">Milliseconds</option>
        </select>
      </label>
      <label>
        <span>Milliseconds</span>
        <input
          type="number"
          min="1"
          max="10000"
          disabled={wheelMode === 'frame'}
          value={wheelStepMs}
          onChange={(event) => onWheelStepChange(Number(event.target.value))}
        />
      </label>
      <div className="menu-presets">
        {[1, 5, 10, 17, 50, 100].map((value) => (
          <button key={value} disabled={wheelMode === 'frame'} onClick={() => onWheelStepChange(value)}>
            {value} ms
          </button>
        ))}
      </div>
    </div>
  );
}
