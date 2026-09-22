import type { SimulationResult } from '../stores/editor';

export function formatAccuracy(simulation: SimulationResult) {
  const value =
    simulation.client === 'lazer'
      ? Math.floor(simulation.accuracy * 100) / 100
      : Math.round(simulation.accuracy * 100) / 100;
  return value.toFixed(2);
}
