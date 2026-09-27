import { useEffect, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import {
  addBinding,
  bindingsFor,
  comboFromEvent,
  formatCombo,
  isCustomized,
  keyActions,
  removeBinding,
  resetBindings,
  useKeybindingsVersion,
  type KeyActionId,
} from '../../keybindings';

const scopeNote = { global: '', playfield: 'Playfield', timeline: 'Timeline' } as const;

/// Keyboard settings: every action with its key combos. "+" records the next key press;
/// Esc cancels recording. A combo taken from another action is moved and the move is reported.
export function KeybindSettings({ query }: { query: string }) {
  useKeybindingsVersion();
  const [recording, setRecording] = useState<KeyActionId | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
      // Capture phase on window runs before every other shortcut handler.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      const moved = addBinding(recording, combo);
      setNotice(moved.length ? `${formatCombo(combo)} was removed from ${moved.join(', ')}.` : '');
      setRecording(null);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [recording]);

  const filter = query.trim().toLowerCase();
  const visible = keyActions.filter(
    (action) =>
      !filter ||
      `${action.group} ${action.label} ${bindingsFor(action.id).map(formatCombo).join(' ')}`
        .toLowerCase()
        .includes(filter) ||
      'keyboard shortcuts keybind hotkeys'.includes(filter),
  );
  const groups = [...new Set(visible.map((action) => action.group))];

  return (
    <div className="keybind-settings">
      <div className="keybind-toolbar">
        <small>Click + and press a key combination. Esc cancels.</small>
        <button
          type="button"
          onClick={() => {
            resetBindings();
            setNotice('All shortcuts restored to their defaults.');
          }}
        >
          <RotateCcw size={12} /> Reset all
        </button>
      </div>
      {notice && <p className="keybind-notice">{notice}</p>}
      {groups.map((group) => (
        <div className="keybind-group" key={group}>
          <h4>{group}</h4>
          {visible
            .filter((action) => action.group === group)
            .map((action) => {
              const combos = bindingsFor(action.id);
              return (
                <div className="keybind-row" key={action.id}>
                  <span className="keybind-label">
                    {action.label}
                    {scopeNote[action.scope] && <em>{scopeNote[action.scope]}</em>}
                  </span>
                  <span className="keybind-combos">
                    {combos.map((combo) => (
                      <span className="keybind-chip" key={combo}>
                        <kbd>{formatCombo(combo)}</kbd>
                        <button
                          type="button"
                          aria-label={`Remove ${formatCombo(combo)}`}
                          onClick={() => removeBinding(action.id, combo)}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {recording === action.id ? (
                      <span className="keybind-chip recording">Press keys…</span>
                    ) : (
                      <button
                        type="button"
                        className="keybind-add"
                        title="Add shortcut"
                        onClick={() => {
                          setNotice('');
                          setRecording(action.id);
                        }}
                      >
                        <Plus size={11} />
                      </button>
                    )}
                    {isCustomized(action.id) && (
                      <button
                        type="button"
                        className="keybind-add"
                        title="Restore default"
                        onClick={() => resetBindings(action.id)}
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
