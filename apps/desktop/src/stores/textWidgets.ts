import { create } from 'zustand';

/// User-made text panels on the playfield. Each shows a template such as "{{combo:32b}}x", where
/// {{name:size flags colour}} is replaced by a live value; see components/playfield/TextWidgets.
export type TextWidget = { id: string; template: string };

export const DEFAULT_TEXT_WIDGETS: TextWidget[] = [
  { id: 'score', template: '{{score:30b}}' },
  { id: 'combo', template: '{{combo:34b}}x' },
];

const storageKey = 'osu-replay-editor.text-widgets';

function readSaved(): TextWidget[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved))
      return saved.filter(
        (item): item is TextWidget => item && typeof item.id === 'string' && typeof item.template === 'string',
      );
  } catch {
    /* fall back to the defaults */
  }
  return DEFAULT_TEXT_WIDGETS;
}

type TextWidgetState = {
  widgets: TextWidget[];
  editingId: string | null;
  add: (template?: string) => void;
  update: (id: string, template: string) => void;
  remove: (id: string) => void;
  setEditing: (id: string | null) => void;
};

export const useTextWidgetStore = create<TextWidgetState>((set, get) => {
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(get().widgets));
    } catch {
      /* the layout still applies for this session */
    }
  };
  return {
    widgets: readSaved(),
    editingId: null,
    add: (template = '{{acc:22b}}') => {
      const id = `text-${Date.now().toString(36)}`;
      set((state) => ({ widgets: [...state.widgets, { id, template }], editingId: id }));
      persist();
    },
    update: (id, template) => {
      set((state) => ({ widgets: state.widgets.map((item) => (item.id === id ? { ...item, template } : item)) }));
      persist();
    },
    remove: (id) => {
      set((state) => ({
        widgets: state.widgets.filter((item) => item.id !== id),
        editingId: state.editingId === id ? null : state.editingId,
      }));
      persist();
    },
    setEditing: (editingId) => set({ editingId }),
  };
});
