// Keeps `--fill` on every range input in sync with its value so the styled track can show
// progress (Chromium has no native filled-track pseudo element).
function updateFill(input: HTMLInputElement) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const ratio = max > min ? (value - min) / (max - min) : 0;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(1, ratio)) * 100}%`);
}

function updateWithin(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(updateFill);
}

export function installRangeFill() {
  const isRange = (target: EventTarget | null): target is HTMLInputElement =>
    target instanceof HTMLInputElement && target.type === 'range';
  document.addEventListener(
    'input',
    (event) => {
      if (isRange(event.target)) updateFill(event.target);
    },
    true,
  );
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (isRange(mutation.target)) updateFill(mutation.target);
      } else
        mutation.addedNodes.forEach((node) => {
          if (isRange(node)) updateFill(node);
          else if (node instanceof Element) updateWithin(node);
        });
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['value', 'min', 'max'],
  });
  updateWithin(document);
}
