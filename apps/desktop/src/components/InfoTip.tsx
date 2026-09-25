import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

// Small "i" badge whose explanation shows on hover/focus; rendered in a fixed portal so
// scrolling panels and clipped popovers never cut the tooltip off.
export function InfoTip({ text }: { text: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = (element: HTMLElement) => setAnchor(element.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const width = 240;
  const left = anchor
    ? Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8))
    : 0;
  const below = anchor ? anchor.bottom + 110 < window.innerHeight : true;
  return (
    <span
      className="info-tip"
      tabIndex={0}
      role="img"
      aria-label={text}
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerLeave={hide}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={hide}
    >
      <Info size={12} strokeWidth={2.2} />
      {anchor &&
        createPortal(
          <span
            className="info-tip-bubble"
            role="tooltip"
            style={{
              left,
              width,
              ...(below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 }),
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
