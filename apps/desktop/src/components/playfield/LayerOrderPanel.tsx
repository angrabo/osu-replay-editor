import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

export type LayerOrderItem = { id: string; label: string };

/// Drag-and-drop list for overlay drawing order: the first row is drawn on top.
/// Reorders live while dragging and reports the final order on release.
export function LayerOrderPanel({
  items,
  onChange,
  onDragStateChange,
}: {
  items: LayerOrderItem[];
  onChange: (ids: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const ids = drag?.order ?? items.map((item) => item.id);
  const labels = new Map(items.map((item) => [item.id, item.label]));

  // Window listeners rather than pointer capture: reordering moves the dragged row's DOM node,
  // which would drop a capture held on it.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [])].filter(
        (row) => row.dataset.layerId !== current.id,
      );
      let index = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
      if (index < 0) index = rows.length;
      const next = current.order.filter((item) => item !== current.id);
      next.splice(index, 0, current.id);
      if (next.join() !== current.order.join()) setDrag({ ...current, order: next });
    };
    const end = (event: PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      onDragStateChange?.(false);
      if (current && event.type === 'pointerup') onChange(current.order);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div className="layer-order-list" ref={listRef}>
      <span className="layer-order-edge">Top · drawn above</span>
      {ids.map((id, index) => (
        <div
          key={id}
          data-layer-id={id}
          className={`layer-order-row${drag?.id === id ? ' dragging' : ''}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onDragStateChange?.(true);
            setDrag({ id, order: ids });
          }}
        >
          <GripVertical size={12} />
          <span className="layer-order-index">{index + 1}</span>
          <span>{labels.get(id) ?? id}</span>
        </div>
      ))}
      <span className="layer-order-edge">Bottom · drawn below</span>
    </div>
  );
}
