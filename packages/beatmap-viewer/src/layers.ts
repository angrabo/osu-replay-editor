/// Cursor overlay layers the playfield draws, and their default order.
export type CursorLayerId = 'past' | 'future' | 'speed' | 'input-paths' | 'frame-markers' | 'click-markers' | 'ghosts';
// Default cursor overlay order, first = drawn on top.
export const DEFAULT_CURSOR_LAYER_ORDER: readonly CursorLayerId[] = [
  'click-markers',
  'frame-markers',
  'input-paths',
  'speed',
  'future',
  'past',
  'ghosts',
];
export function normalizeCursorLayerOrder(order: readonly unknown[] | null | undefined): CursorLayerId[] {
  const known = DEFAULT_CURSOR_LAYER_ORDER as readonly unknown[];
  const kept = (order ?? []).filter(
    (id, index, all): id is CursorLayerId => known.includes(id) && all.indexOf(id) === index,
  );
  return [...kept, ...DEFAULT_CURSOR_LAYER_ORDER.filter((id) => !kept.includes(id))];
}
