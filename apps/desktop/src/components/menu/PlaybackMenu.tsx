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
  return (
    <div className="app-menu playback-menu" role="menu">
      <button role="menuitem" onClick={onTogglePlay}>
        {playing ? 'Pause' : 'Play'} <kbd>Space</kbd>
      </button>
      <button role="menuitem" onClick={onGoToStart}>
        Go to start
      </button>
      <button role="menuitem" onClick={onGoToEnd}>
        Go to end
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
