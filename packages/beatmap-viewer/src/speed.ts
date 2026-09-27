/// Cursor speed colour scale (osu! pixels per millisecond of map time), like a GPS track:
/// blue for slow movement, through cyan, green and yellow, to red for the fastest jumps.
export const SPEED_STOPS: { speed: number; color: number }[] = [
  { speed: 0, color: 0x3a5bff },
  { speed: 0.5, color: 0x2fc8f0 },
  { speed: 1.2, color: 0x3ee07a },
  { speed: 2.2, color: 0xffd84d },
  { speed: 3.5, color: 0xff8a3d },
  { speed: 5, color: 0xff3b4e },
];

const mix = (from: number, to: number, amount: number) => {
  const channel = (shift: number) =>
    Math.round(((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * amount);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

export function speedColor(speed: number): number {
  if (!(speed > SPEED_STOPS[0].speed)) return SPEED_STOPS[0].color;
  for (let index = 1; index < SPEED_STOPS.length; index++) {
    const high = SPEED_STOPS[index];
    if (speed <= high.speed) {
      const low = SPEED_STOPS[index - 1];
      return mix(low.color, high.color, (speed - low.speed) / (high.speed - low.speed));
    }
  }
  return SPEED_STOPS[SPEED_STOPS.length - 1].color;
}
