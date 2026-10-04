import { useSyncExternalStore } from 'react';

/// Rebindable keyboard shortcuts. A combo is written as modifiers in a fixed order followed by
/// the physical key code, e.g. "Ctrl+KeyZ", "Shift+Digit1", "Alt+ArrowLeft" or "Space", so
/// bindings do not depend on the keyboard layout.

// Where an action listens: everywhere, only while the playfield is the active editor surface,
// or only while the timeline is. Playfield and timeline actions may share a combo.
export type KeyScope = 'global' | 'playfield' | 'timeline';

export type KeyActionId =
  | 'open-replays'
  | 'open-settings'
  | 'save-project'
  | 'save-project-as'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'deselect'
  | 'play-pause'
  | 'previous-frame'
  | 'next-frame'
  | 'next-object'
  | 'previous-object'
  | 'next-miss'
  | 'previous-miss'
  | 'next-100'
  | 'previous-100'
  | 'next-50'
  | 'previous-50'
  | 'next-combo-break'
  | 'previous-combo-break'
  | 'add-marker'
  | 'toggle-fullscreen'
  | 'next-marker'
  | 'previous-marker'
  | 'tool-move-frames'
  | 'tool-select'
  | 'tool-hand'
  | 'tool-draw'
  | 'tool-brush'
  | 'tool-zoom'
  | 'timeline-select'
  | 'timeline-hand'
  | 'timeline-blade'
  | 'timeline-cut-at-playhead'
  | 'timeline-cycle-snap';

export type KeyAction = { id: KeyActionId; label: string; group: string; scope: KeyScope; defaults: string[] };

export const keyActions: KeyAction[] = [
  { id: 'open-replays', label: 'Select replay files', group: 'File', scope: 'global', defaults: ['Ctrl+KeyO'] },
  { id: 'open-settings', label: 'Open settings', group: 'File', scope: 'global', defaults: ['Ctrl+Comma'] },
  { id: 'save-project', label: 'Save project', group: 'File', scope: 'global', defaults: ['Ctrl+KeyS'] },
  { id: 'save-project-as', label: 'Save project as', group: 'File', scope: 'global', defaults: ['Ctrl+Shift+KeyS'] },
  { id: 'undo', label: 'Undo', group: 'Edit', scope: 'global', defaults: ['Ctrl+KeyZ'] },
  { id: 'redo', label: 'Redo', group: 'Edit', scope: 'global', defaults: ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ'] },
  { id: 'copy', label: 'Copy selected inputs', group: 'Edit', scope: 'global', defaults: ['Ctrl+KeyC'] },
  { id: 'paste', label: 'Paste inputs', group: 'Edit', scope: 'global', defaults: ['Ctrl+KeyV'] },
  { id: 'duplicate', label: 'Duplicate selected inputs', group: 'Edit', scope: 'global', defaults: ['Ctrl+KeyD'] },
  { id: 'delete', label: 'Delete selection', group: 'Edit', scope: 'global', defaults: ['Delete'] },
  { id: 'deselect', label: 'Clear selection', group: 'Edit', scope: 'global', defaults: ['Escape'] },
  { id: 'play-pause', label: 'Play / pause', group: 'Playback', scope: 'global', defaults: ['Space'] },
  { id: 'previous-frame', label: 'Previous replay frame', group: 'Playback', scope: 'global', defaults: ['ArrowLeft'] },
  { id: 'next-frame', label: 'Next replay frame', group: 'Playback', scope: 'global', defaults: ['ArrowRight'] },
  { id: 'next-object', label: 'Next hit object', group: 'Navigate', scope: 'global', defaults: ['BracketRight'] },
  {
    id: 'previous-object',
    label: 'Previous hit object',
    group: 'Navigate',
    scope: 'global',
    defaults: ['BracketLeft'],
  },
  { id: 'next-miss', label: 'Next miss', group: 'Navigate', scope: 'global', defaults: ['KeyX'] },
  { id: 'previous-miss', label: 'Previous miss', group: 'Navigate', scope: 'global', defaults: ['Shift+KeyX'] },
  { id: 'next-100', label: 'Next 100', group: 'Navigate', scope: 'global', defaults: ['Digit1'] },
  { id: 'previous-100', label: 'Previous 100', group: 'Navigate', scope: 'global', defaults: ['Shift+Digit1'] },
  { id: 'next-50', label: 'Next 50', group: 'Navigate', scope: 'global', defaults: ['Digit5'] },
  { id: 'previous-50', label: 'Previous 50', group: 'Navigate', scope: 'global', defaults: ['Shift+Digit5'] },
  { id: 'next-combo-break', label: 'Next combo break', group: 'Navigate', scope: 'global', defaults: ['KeyC'] },
  {
    id: 'previous-combo-break',
    label: 'Previous combo break',
    group: 'Navigate',
    scope: 'global',
    defaults: ['Shift+KeyC'],
  },
  { id: 'add-marker', label: 'Add marker at playhead', group: 'Markers', scope: 'global', defaults: ['KeyM'] },
  { id: 'toggle-fullscreen', label: 'Fullscreen playfield', group: 'Playback', scope: 'global', defaults: ['KeyF'] },
  { id: 'next-marker', label: 'Next marker', group: 'Markers', scope: 'global', defaults: ['Alt+ArrowRight'] },
  { id: 'previous-marker', label: 'Previous marker', group: 'Markers', scope: 'global', defaults: ['Alt+ArrowLeft'] },
  {
    id: 'tool-move-frames',
    label: 'Move cursor frames tool',
    group: 'Playfield tools',
    scope: 'global',
    defaults: ['KeyT'],
  },
  { id: 'tool-select', label: 'Select tool', group: 'Playfield tools', scope: 'playfield', defaults: ['KeyV'] },
  { id: 'tool-hand', label: 'Pan tool', group: 'Playfield tools', scope: 'playfield', defaults: ['KeyH'] },
  { id: 'tool-draw', label: 'Draw cursor path tool', group: 'Playfield tools', scope: 'playfield', defaults: ['KeyP'] },
  { id: 'tool-brush', label: 'Brush tool', group: 'Playfield tools', scope: 'playfield', defaults: [] },
  { id: 'tool-zoom', label: 'Zoom tool', group: 'Playfield tools', scope: 'playfield', defaults: [] },
  { id: 'timeline-select', label: 'Select tool', group: 'Timeline tools', scope: 'timeline', defaults: ['KeyV'] },
  { id: 'timeline-hand', label: 'Pan tool', group: 'Timeline tools', scope: 'timeline', defaults: ['KeyH'] },
  { id: 'timeline-blade', label: 'Blade tool', group: 'Timeline tools', scope: 'timeline', defaults: ['KeyB'] },
  {
    id: 'timeline-cut-at-playhead',
    label: 'Cut selected input at playhead',
    group: 'Timeline tools',
    scope: 'timeline',
    defaults: ['KeyS'],
  },
  {
    id: 'timeline-cycle-snap',
    label: 'Cycle playhead snap',
    group: 'Timeline tools',
    scope: 'timeline',
    defaults: ['Shift+KeyS'],
  },
];

const storageKey = 'osu-replay-editor.keybindings';
const modifierCodes = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

function readOverrides(): Partial<Record<KeyActionId, string[]>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let overrides = readOverrides();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: Partial<Record<KeyActionId, string[]>>) {
  overrides = next;
  version++;
  try {
    localStorage.setItem(storageKey, JSON.stringify(overrides));
  } catch {
    /* Bindings still apply for this session. */
  }
  listeners.forEach((listener) => listener());
}

export function bindingsFor(id: KeyActionId): string[] {
  return overrides[id] ?? keyActions.find((action) => action.id === id)?.defaults ?? [];
}

export function isCustomized(id: KeyActionId): boolean {
  return overrides[id] !== undefined;
}

export function comboFromEvent(event: KeyboardEvent): string | null {
  if (!event.code || modifierCodes.has(event.code)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.code);
  return parts.join('+');
}

const keyNames: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del',
};

export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map(
      (part) =>
        keyNames[part] ??
        (part.startsWith('Key')
          ? part.slice(3)
          : part.startsWith('Digit')
            ? part.slice(5)
            : part.replace(/^Numpad/, 'Num ')),
    )
    .join('+');
}

/// First binding of an action, formatted for menus and tooltips ('' when unbound).
export function shortcutLabel(id: KeyActionId): string {
  const [first] = bindingsFor(id);
  return first ? formatCombo(first) : '';
}

const scopesOverlap = (first: KeyScope, second: KeyScope) =>
  first === second || first === 'global' || second === 'global';

/// The action bound to this key press among the given scopes, if any.
export function actionForEvent(event: KeyboardEvent, scopes: readonly KeyScope[]): KeyActionId | null {
  const combo = comboFromEvent(event);
  if (!combo) return null;
  const action = keyActions.find((item) => scopes.includes(item.scope) && bindingsFor(item.id).includes(combo));
  return action?.id ?? null;
}

/// Adds a combo to an action. Other actions that would react to the same keys in an overlapping
/// scope lose it; their labels are returned so the UI can say what moved.
export function addBinding(id: KeyActionId, combo: string): string[] {
  const target = keyActions.find((action) => action.id === id);
  if (!target) return [];
  const next = { ...overrides };
  const moved: string[] = [];
  for (const action of keyActions) {
    if (action.id === id || !scopesOverlap(action.scope, target.scope)) continue;
    const current = bindingsFor(action.id);
    if (current.includes(combo)) {
      next[action.id] = current.filter((item) => item !== combo);
      moved.push(`${action.group} › ${action.label}`);
    }
  }
  const own = bindingsFor(id);
  if (!own.includes(combo)) next[id] = [...own, combo];
  commit(next);
  return moved;
}

export function removeBinding(id: KeyActionId, combo: string): void {
  commit({ ...overrides, [id]: bindingsFor(id).filter((item) => item !== combo) });
}

export function resetBindings(id?: KeyActionId): void {
  if (!id) return commit({});
  const next = { ...overrides };
  delete next[id];
  commit(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/// Re-renders the caller whenever bindings change.
export function useKeybindingsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
