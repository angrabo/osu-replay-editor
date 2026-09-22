import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type ResizeSide = 'left' | 'right' | 'viewer';

export function usePanelResize() {
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(320);
  const [viewerHeight, setViewerHeight] = useState(0);
  const centerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    side: ResizeSide;
    x: number;
    y: number;
    initial: number;
    pointerId: number;
    target: HTMLElement;
  } | null>(null);

  const clearResizeState = () => {
    dragRef.current = null;
    document.body.classList.remove('resizing', 'resizing-column', 'resizing-row');
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.side === 'left') setLeftWidth(Math.max(240, Math.min(420, drag.initial + event.clientX - drag.x)));
      else if (drag.side === 'right')
        setRightWidth(Math.max(270, Math.min(430, drag.initial - event.clientX + drag.x)));
      else {
        const available = centerRef.current?.clientHeight ?? Math.max(400, window.innerHeight - 108);
        const maximum = Math.max(180, available - 5 - 54 - 272);
        setViewerHeight(Math.max(180, Math.min(maximum, drag.initial + event.clientY - drag.y)));
      }
    };
    const end = () => {
      const drag = dragRef.current;
      if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
      clearResizeState();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
  }, []);

  const beginResize = (side: ResizeSide, event: ReactPointerEvent) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const initial =
      side === 'left'
        ? (target.previousElementSibling?.getBoundingClientRect().width ?? leftWidth)
        : side === 'right'
          ? (target.nextElementSibling?.getBoundingClientRect().width ?? rightWidth)
          : (target.previousElementSibling?.getBoundingClientRect().height ?? viewerHeight);
    dragRef.current = { side, x: event.clientX, y: event.clientY, initial, pointerId: event.pointerId, target };
    document.body.classList.add('resizing', side === 'viewer' ? 'resizing-row' : 'resizing-column');
  };

  return { leftWidth, rightWidth, viewerHeight, centerRef, beginResize, clearResizeState };
}
