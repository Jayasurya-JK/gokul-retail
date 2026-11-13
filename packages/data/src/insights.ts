import type { PressingBatch, SeedType } from './areas/purchasing';

// Production insights: pure maths over the pressing batches (kg and litres). The screen only draws what this returns.

export type InsightBy = 'day' | 'month' | 'seed' | 'machine' | 'operator';

export interface InsightRow {
  key: string;
  label: string;
  batches: number;
  /** Clean seed pressed, kg */
  seedKg: number;
  oilL: number;
  cakeKg: number;
  lossKg: number;
  lossPct: number;
  /** Oil weight / clean seed, percent */
  yieldPct: number;
  /** Weighted norm yield of these batches, percent */
  normPct: number;
  /** Percent above/below the norm */
  variancePct: number;
  /** Litres of oil per kg of seed */
  oilPerKg: number;
  /** kg of cake per kg of seed */
  cakePerKg: number;
  kgSeedPerL: number;
  /** Batches graded low or poor */
  lowBatches: number;
}

const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const SEED_LABEL: Record<string, string> = { groundnut: 'Groundnut', sesame: 'Sesame', copra: 'Coconut (copra)' };

export function keyOf(b: PressingBatch, by: InsightBy): { key: string; label: string } {
  switch (by) {
    case 'day': { const k = ymd(b.date); return { key: k, label: k }; }
    case 'month': { const k = ymd(b.date).slice(0, 7); return { key: k, label: k }; }
    case 'seed': return { key: b.seed, label: SEED_LABEL[b.seed] ?? b.seed };
    case 'machine': { const m = b.machine ?? 'W'; return { key: m, label: m === 'R' ? 'R (rotary)' : 'W (wood chekku)' }; }
    default: { const o = b.operator || 'Not recorded'; return { key: o, label: o }; }
  }
}

export function summarise(key: string, label: string, list: PressingBatch[]): InsightRow {
  let net = 0; let oilKg = 0; let oilL = 0; let cake = 0; let loss = 0; let normWeighted = 0; let low = 0;
  for (const b of list) {
    const m = b.metrics;
    net += m.netSeedKg; oilKg += m.oilKg; oilL += b.oilRawL / 1000; cake += m.cakeKg; loss += m.lossKg;
    normWeighted += m.normPct * m.netSeedKg;
    if (m.grade !== 'good') low += 1;
  }
  const yieldPct = net > 0 ? (oilKg / net) * 100 : 0;
  const normPct = net > 0 ? normWeighted / net : 0;
  return {
    key, label, batches: list.length, seedKg: net, oilL, cakeKg: cake, lossKg: loss, lossPct: net > 0 ? (loss / net) * 100 : 0,
    yieldPct, normPct, variancePct: normPct > 0 ? ((yieldPct - normPct) / normPct) * 100 : 0,
    oilPerKg: net > 0 ? oilL / net : 0, cakePerKg: net > 0 ? cake / net : 0, kgSeedPerL: oilL > 0 ? net / oilL : 0, lowBatches: low,
  };
}

export function groupBatches(batches: PressingBatch[], by: InsightBy): InsightRow[] {
  const map = new Map<string, { label: string; list: PressingBatch[] }>();
  for (const b of batches) {
    const k = keyOf(b, by);
    const g = map.get(k.key) ?? { label: k.label, list: [] };
    g.list.push(b);
    map.set(k.key, g);
  }
  const rows = [...map.entries()].map(([key, g]) => summarise(key, g.label, g.list));
  return by === 'day' || by === 'month' ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.seedKg - a.seedKg);
}

/** The owner's own average over the last N batches of one seed (newest first input is fine). Used to help set the norm. */
export function recentAverage(batches: PressingBatch[], seed: SeedType, n: number): { count: number; kgSeedPerL: number; yieldPct: number } | null {
  const list = [...batches].filter((b) => b.seed === seed && b.metrics.kgSeedPerL > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  if (list.length === 0) return null;
  const r = summarise(seed, seed, list);
  return { count: list.length, kgSeedPerL: r.kgSeedPerL, yieldPct: r.yieldPct };
}
