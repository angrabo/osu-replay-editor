const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function objectAlpha(timeMs: number, startTime: number, endTime: number, preempt: number): number {
  const visibleFrom = startTime - preempt;
  if (timeMs < visibleFrom || timeMs > endTime + 240) return 0;
  if (timeMs < startTime) return clamp((timeMs - visibleFrom) / Math.min(400, preempt));
  if (timeMs > endTime) return 1 - clamp((timeMs - endTime) / 240);
  return 1;
}

export function hiddenObjectAlpha(timeMs: number, startTime: number, preempt: number): number {
  const appear = startTime - preempt;
  if (timeMs < appear || timeMs >= startTime) return 0;
  const fadeOutStart = appear + preempt * 0.45;
  return 1 - clamp((timeMs - fadeOutStart) / Math.max(1, startTime - fadeOutStart));
}

export function hitFadeAlpha(timeMs: number, hitTime: number, duration = 180): number {
  return 1 - clamp((timeMs - hitTime) / duration);
}

export function judgementAlpha(timeMs: number, eventTime: number, duration = 550): number {
  return timeMs < eventTime ? 0 : 1 - clamp((timeMs - eventTime) / duration);
}

export function isLogicalPress(previousRaw: number, currentRaw: number): boolean {
  return logicalButtons(previousRaw) === 0 && logicalButtons(currentRaw) !== 0;
}

export function isLogicalRelease(previousRaw: number, currentRaw: number): boolean {
  return logicalButtons(previousRaw) !== 0 && logicalButtons(currentRaw) === 0;
}

export function logicalButtons(raw: number): number {
  return raw & 15 & ~((raw & 12) >> 2);
}

export function logicalButtonTransitions(
  previousRaw: number,
  currentRaw: number,
): { pressed: number; released: number } {
  const previous = logicalButtons(previousRaw);
  const current = logicalButtons(currentRaw);
  return { pressed: current & ~previous, released: previous & ~current };
}

export function updateLogicalButtonOrder(order: readonly number[], previousRaw: number, currentRaw: number): number[] {
  const transitions = logicalButtonTransitions(previousRaw, currentRaw);
  const next = order.filter((keyIndex) => (transitions.released & (1 << keyIndex)) === 0);
  for (let keyIndex = 0; keyIndex < 4; keyIndex++)
    if ((transitions.pressed & (1 << keyIndex)) !== 0) {
      const existing = next.indexOf(keyIndex);
      if (existing >= 0) next.splice(existing, 1);
      next.push(keyIndex);
    }
  return next;
}

export function inputVariantColor(base: number, keyIndex: number): number {
  const r = ((base >> 16) & 255) / 255;
  const g = ((base >> 8) & 255) / 255;
  const b = (base & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const normalizedIndex = Math.max(0, Math.min(3, keyIndex));
  hue = (hue + (normalizedIndex === 1 || normalizedIndex === 3 ? 70 : 0)) % 360;
  const variantLightness = normalizedIndex >= 2 ? lightness * 0.82 : lightness;
  const chroma = (1 - Math.abs(2 * variantLightness - 1)) * Math.max(0.72, saturation);
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const sector = Math.floor(hue / 60);
  const rgb =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const variantMatch = variantLightness - chroma / 2;
  return (
    (Math.round((rgb[0] + variantMatch) * 255) << 16) |
    (Math.round((rgb[1] + variantMatch) * 255) << 8) |
    Math.round((rgb[2] + variantMatch) * 255)
  );
}
