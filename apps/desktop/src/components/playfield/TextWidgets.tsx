import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X } from 'lucide-react';
import { SnapWidget } from '../../hooks/useSnapDrag';
import { LIVE_VARIABLES, useLiveValues, useSimulationStale, type LiveValues } from '../../liveStats';
import { useTextWidgetStore, type TextWidget } from '../../stores/textWidgets';

// {{name}} or {{name:SIZE FLAGS COLOUR}}, e.g. {{combo:32b}}, {{acc:18i}}, {{score:28b#ffd84d}}.
const TOKEN = /\{\{\s*([a-z0-9]+)\s*(?::\s*(\d{1,3})?\s*([bi]*)\s*(#[0-9a-f]{6})?\s*)?\}\}/gi;

/// Turns a template into styled text: plain text keeps the widget's base style, each token is its
/// live value in the token's own size, weight, style and colour.
export function renderTemplate(template: string, values: LiveValues): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of template.matchAll(TOKEN)) {
    if (match.index > last) parts.push(template.slice(last, match.index));
    const [, name, size, flags = '', colour] = match;
    const value = values[name.toLowerCase()];
    const style: CSSProperties = {};
    if (size) style.fontSize = Math.min(200, Math.max(6, Number(size)));
    if (flags.includes('b')) style.fontWeight = 800;
    if (flags.includes('i')) style.fontStyle = 'italic';
    if (colour) style.color = colour;
    parts.push(
      <span key={key++} style={style} className={value === undefined ? 'text-widget-unknown' : undefined}>
        {value ?? `{{${name}}}`}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < template.length) parts.push(template.slice(last));
  return parts;
}

function TextWidgetEditor({ widget, values }: { widget: TextWidget; values: LiveValues }) {
  const update = useTextWidgetStore((state) => state.update);
  const setEditing = useTextWidgetStore((state) => state.setEditing);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Rendered in a portal next to the panel, so the playfield's clipping never hides it.
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector(`[data-text-widget="${CSS.escape(widget.id)}"]`);
      const box = anchor?.closest('.snap-widget')?.getBoundingClientRect();
      if (!box) return;
      const width = 290;
      const height = 230;
      const below = box.bottom + 6 + height <= window.innerHeight;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - width - 8, box.right - width)),
        top: below ? box.bottom + 6 : Math.max(8, box.top - height - 6),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [widget.id]);
  const insert = (token: string) => {
    const input = inputRef.current;
    if (!input) return update(widget.id, widget.template + token);
    const start = input.selectionStart;
    const next = widget.template.slice(0, start) + token + widget.template.slice(input.selectionEnd);
    update(widget.id, next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  };
  if (!position) return null;
  return createPortal(
    <div
      className="premiere-popover text-widget-editor"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') setEditing(null);
      }}
    >
      <textarea
        ref={inputRef}
        autoFocus
        rows={2}
        spellCheck={false}
        value={widget.template}
        onChange={(event) => update(widget.id, event.target.value)}
      />
      <small className="text-widget-help">
        <code>{'{{combo:32b}}'}</code> = combo at 32 px, bold. Flags: <code>b</code> bold, <code>i</code> italic,{' '}
        <code>#ff66aa</code> colour.
      </small>
      <div className="text-widget-variables">
        {LIVE_VARIABLES.map((variable) => (
          <button
            type="button"
            key={variable.name}
            title={`${variable.description} · now ${values[variable.name] ?? ''}`}
            onClick={() => insert(`{{${variable.name}}}`)}
          >
            {variable.name}
          </button>
        ))}
      </div>
      <div className="text-widget-editor-actions">
        <button type="button" className="primary" onClick={() => setEditing(null)}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/// The user's text panels for one playfield pane, showing that pane's replay.
export function TextWidgets({ trackId, editable }: { trackId: string | null | undefined; editable: boolean }) {
  const widgets = useTextWidgetStore((state) => state.widgets);
  const editingId = useTextWidgetStore((state) => state.editingId);
  const setEditing = useTextWidgetStore((state) => state.setEditing);
  const remove = useTextWidgetStore((state) => state.remove);
  const values = useLiveValues(trackId);
  const stale = useSimulationStale(trackId);
  return (
    <>
      {widgets.map((widget, index) => (
        <SnapWidget
          key={widget.id}
          id={`text-widget:${widget.id}`}
          fallback="top-right"
          order={10 + index}
          className={`text-widget${editingId === widget.id ? ' editing' : ''}${stale ? ' stale' : ''}`}
          title="Drag to move"
        >
          <span className="text-widget-content" data-text-widget={widget.id}>
            {renderTemplate(widget.template, values)}
          </span>
          {editable && (
            <span className="text-widget-actions">
              <button
                type="button"
                title="Edit text"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setEditing(editingId === widget.id ? null : widget.id)}
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                title="Remove panel"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => remove(widget.id)}
              >
                <X size={11} />
              </button>
            </span>
          )}
          {editable && editingId === widget.id && <TextWidgetEditor widget={widget} values={values} />}
        </SnapWidget>
      ))}
    </>
  );
}
