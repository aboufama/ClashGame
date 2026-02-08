import type { SerializedWorld } from './models.js';

const RATE_TABLE: Record<string, number[]> = {
  solana_collector: [5, 8],
  mine: [5, 8],
  elixir_collector: [5, 8]
};

export function collectorRateForBuilding(type: string, level: number): number {
  const rates = RATE_TABLE[type] ?? RATE_TABLE.solana_collector;
  const idx = Math.max(0, Math.min((level || 1) - 1, rates.length - 1));
  return rates[idx] ?? 0;
}

export function worldProductionRate(world: SerializedWorld): number {
  if (!Array.isArray(world.buildings)) return 0;
  let rate = 0;
  for (const b of world.buildings) {
    if (!b || !RATE_TABLE[b.type]) continue;
    rate += collectorRateForBuilding(b.type, b.level ?? 1);
  }
  return rate;
}

export function producedBetween(world: SerializedWorld, fromMs: number, toMs: number): number {
  const elapsedSec = Math.max(0, (toMs - fromMs) / 1000);
  if (elapsedSec <= 0) return 0;
  const rate = worldProductionRate(world);
  return Math.floor(rate * elapsedSec);
}
