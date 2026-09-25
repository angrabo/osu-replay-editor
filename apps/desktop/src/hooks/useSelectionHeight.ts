import { useState, type PointerEvent as ReactPointerEvent } from 'react';

const storageKey = 'osu-replay-editor.selection-height';
const MIN_HEIGHT = 160;
const MIN_INSPECTOR = 140;

function readHeight(): number {
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= MIN_HEIGHT) return saved;
  } catch {
    /* storage unavailable: use the default */
  }
  return 340;
}

// Height of the Selection panel under the Inspector, dragged from the splitter between them.
export function useSelectionHeight() {
  const [selectionHeight, setSelectionHeight] = useState(readHeight);

  const beginSelectionResize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const splitter = event.currentTarget;
    const column = splitter.parentElement;
    if (!column) return;
    splitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing', 'resizing-row');
    const startY = event.clientY;
    const startHeight = splitter.nextElementSibling?.getBoundingClientRect().height ?? selectionHeight;
    let latest = startHeight;
    const move = (moveEvent: PointerEvent) => {
      const maximum = Math.max(MIN_HEIGHT, column.clientHeight - MIN_INSPECTOR - splitter.offsetHeight);
      latest = Math.round(Math.max(MIN_HEIGHT, Math.min(maximum, startHeight - (moveEvent.clientY - startY))));
      setSelectionHeight(latest);
    };
    const end = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', end);
      splitter.removeEventListener('pointercancel', end);
      document.body.classList.remove('resizing', 'resizing-row');
      try {
        localStorage.setItem(storageKey, String(latest));
      } catch {
        /* storage unavailable: height just won't persist */
      }
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', end);
    splitter.addEventListener('pointercancel', end);
  };

  return { selectionHeight, beginSelectionResize };
}
