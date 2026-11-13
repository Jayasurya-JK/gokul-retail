import type { PressingBatch, SeedType } from './areas/purchasing';

// Helpers for the norm editor. The Mill analysis page gets all its numbers from `getMillAnalysis` (Rust core, browser twin in areas/analysis.ts).

/** The last N batches of one seed that have a usable yield, newest first. */
export function recentBatches(batches: PressingBatch[], seed: SeedType, n: number): PressingBatch[] {
  return [...batches].filter((b) => b.seed === seed && b.metrics.kgSeedPerL > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}

/** The owner's own average over the last N batches of one seed (newest first input is fine). Used to help set the norm. */
export function recentAverage(batches: PressingBatch[], seed: SeedType, n: number): { count: number; kgSeedPerL: number; yieldPct: number } | null {
  const list = recentBatches(batches, seed, n);
  if (list.length === 0) return null;
  let net = 0; let oilKg = 0; let oilL = 0;
  for (const b of list) { net += b.metrics.netSeedKg; oilKg += b.metrics.oilKg; oilL += b.oilRawL / 1000; }
  return { count: list.length, kgSeedPerL: oilL > 0 ? net / oilL : 0, yieldPct: net > 0 ? (oilKg / net) * 100 : 0 };
}
