import type { GodownBarrel } from './production';
import type { PressingBatch, SeedType } from './purchasing';
import type { Item } from '../types';

// Mill analysis: yield against the norm, value, cost per litre (last purchase price), godown ageing, seed cover, low batches.
// The Rust core (crates/core/src/analysis.rs) is the source of truth. This is the browser-preview twin of it: plain kg and litres, money in paise.

export interface MillAnalysisQuery {
  from: string;
  to: string;
  /** Only this seed; omit or 'all' for every seed */
  seed?: SeedType | 'all';
  /** A batch is low when its oil is this many percent below the norm (default 5) */
  thresholdPct?: number;
}

export interface AnalysisRow {
  key: string;
  label: string;
  batches: number;
  seedKg: number;
  cleanSeedKg: number;
  oilL: number;
  cakeKg: number;
  litresPer100Kg: number;
  normPer100Kg: number;
  variancePct: number;
  lowBatches: number;
  oilValue: number;
  cakeValue: number;
  /** Paise per litre at the last purchase price of the seed; null when no cost is known */
  costPerL: number | null;
  /** The same, after taking the cake's value off */
  netCostPerL: number | null;
  /** True when some batch had no stamped seed price and today's price was used */
  costEstimated: boolean;
  children?: AnalysisRow[];
}

export interface AnalysisBarrel {
  id: string; label: string; oil: SeedType; oilName: string; status: string;
  levelL: number; capacityL: number; settleDays: number;
  daysSettling: number | null; readyWaitingDays: number | null; fillingDays: number | null;
  stickVarianceL: number | null; stickVariancePct: number | null;
  flag: '' | 'ready-waiting' | 'stick-variance';
}

export interface MillAnalysis {
  from: string;
  to: string;
  seed: SeedType | null;
  thresholdPct: number;
  totals: AnalysisRow & { outputValue: number; oilPriceKnown: boolean };
  seeds: AnalysisRow[];
  operatorGrid: { operator: string; seeds: Partial<Record<SeedType, { batches: number; variancePct: number }>> }[];
  trend: { day: string; seed: SeedType; litresPer100Kg: number; normPer100Kg: number }[];
  godown: AnalysisBarrel[];
  seedCover: { seed: SeedType; label: string; stockKg: number; avgKgPerPressingDay: number; pressingDays: number; daysOfCover: number | null; low: boolean }[];
  lowBatches: { id: string; number: string; day: string; seed: SeedType; machine: string; operator: string; variancePct: number; oilL: number; expectedL: number; reason: string }[];
  costBasis: string;
}

const SEEDS: SeedType[] = ['groundnut', 'sesame', 'copra'];
const SEED_LABEL: Record<SeedType, string> = { groundnut: 'Groundnut', sesame: 'Sesame (Ellu)', copra: 'Copra' };
const RM: Record<SeedType, string> = { groundnut: 'rm-gn', sesame: 'rm-sesame', copra: 'rm-copra' };
const OIL_ITEM: Record<SeedType, string> = { groundnut: 'Groundnut Oil (Loose)', sesame: 'Gingelly Oil (Loose)', copra: 'Coconut Oil (Loose)' };
const CAKE_ITEM: Record<SeedType, string> = { groundnut: 'Groundnut Oil Cake (Loose)', sesame: 'Gingelly Oil Cake (Loose)', copra: 'Coconut Oil Cake (Loose)' };
const DAY = 86400000;

const ymd = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

interface B {
  id: string; number: string; day: string; seed: SeedType; machine: string; operator: string;
  seedKg: number; netKg: number; oilL: number; cakeKg: number; expectedL: number;
  cost: number; estimated: boolean; cakeValue: number; oilValue: number;
}

class Agg {
  batches = 0; seedKg = 0; netKg = 0; oilL = 0; cakeKg = 0; expectedL = 0; low = 0; cost = 0; estimated = false; cakeValue = 0; oilValue = 0;
  add(b: B, low: boolean) {
    this.batches += 1; this.seedKg += b.seedKg; this.netKg += b.netKg; this.oilL += b.oilL; this.cakeKg += b.cakeKg; this.expectedL += b.expectedL;
    this.cost += b.cost; this.estimated = this.estimated || b.estimated; this.cakeValue += b.cakeValue; this.oilValue += b.oilValue;
    if (low) this.low += 1;
  }
  row(key: string, label: string): AnalysisRow {
    const known = this.cost > 0 && this.oilL > 0;
    return {
      key, label, batches: this.batches, seedKg: this.seedKg, cleanSeedKg: this.netKg, oilL: this.oilL, cakeKg: this.cakeKg,
      litresPer100Kg: this.netKg > 0 ? (this.oilL / this.netKg) * 100 : 0,
      normPer100Kg: this.netKg > 0 ? (this.expectedL / this.netKg) * 100 : 0,
      variancePct: this.expectedL > 0 ? ((this.oilL - this.expectedL) / this.expectedL) * 100 : 0,
      lowBatches: this.low, oilValue: this.oilValue, cakeValue: this.cakeValue,
      costPerL: known ? Math.round(this.cost / this.oilL) : null,
      netCostPerL: known ? Math.round((this.cost - this.cakeValue) / this.oilL) : null,
      costEstimated: known && this.estimated,
    };
  }
}

export function buildMillAnalysis(q: MillAnalysisQuery, batchesIn: PressingBatch[], barrels: GodownBarrel[], items: Item[]): MillAnalysis {
  if (q.from > q.to) throw new Error('The start date is after the end date.');
  const threshold = Math.min(50, Math.max(0, q.thresholdPct ?? 5));
  const seedFilter = q.seed && q.seed !== 'all' ? q.seed : null;
  const item = (id: string) => items.find((i) => i.id === id);
  const named = (n: string) => items.find((i) => i.name === n);
  const oilPrice = (s: SeedType) => named(OIL_ITEM[s])?.price ?? 0;
  const cakePrice = (s: SeedType) => named(CAKE_ITEM[s])?.price ?? 0;
  const seedCost = (s: SeedType) => item(RM[s])?.cost ?? 0;

  const all: B[] = batchesIn
    .filter((b) => (seedFilter ? b.seed === seedFilter : true))
    .map((b) => {
      const net = b.metrics.netSeedKg;
      const kgPerL = b.normKgPerL && b.normKgPerL > 0 ? b.normKgPerL : 2.5;
      const stamped = b.seedCostPerKg ?? null;
      const perKg = stamped ?? seedCost(b.seed);
      const oilL = b.oilRawL / 1000;
      const cakeKg = b.cakeKg / 1000;
      return {
        id: b.id, number: b.number, day: ymd(b.date), seed: b.seed, machine: b.machine ?? 'W', operator: b.operator,
        seedKg: b.seedKg / 1000, netKg: net, oilL, cakeKg, expectedL: net / kgPerL,
        cost: Math.round((perKg * b.seedKg) / 1000) + (b.jaggeryCost ?? 0), estimated: stamped === null && perKg > 0,
        cakeValue: Math.round(cakeKg * cakePrice(b.seed)), oilValue: Math.round(oilL * oilPrice(b.seed)),
      };
    })
    .filter((b) => b.day >= q.from && b.day <= q.to)
    .sort((a, c) => a.day.localeCompare(c.day));
  const isLow = (b: B) => b.expectedL > 0 && ((b.oilL - b.expectedL) / b.expectedL) * 100 < -threshold;
  const opName = (b: B) => b.operator || 'Not recorded';

  const total = new Agg();
  all.forEach((b) => total.add(b, isLow(b)));

  const seeds: AnalysisRow[] = [];
  for (const seed of SEEDS) {
    const list = all.filter((b) => b.seed === seed);
    if (list.length === 0) continue;
    const sa = new Agg();
    list.forEach((b) => sa.add(b, isLow(b)));
    const row = sa.row(seed, SEED_LABEL[seed]);
    row.children = [];
    for (const m of ['W', 'R']) {
      const ml = list.filter((b) => b.machine === m);
      if (ml.length === 0) continue;
      const ma = new Agg();
      const ops = new Map<string, Agg>();
      for (const b of ml) { ma.add(b, isLow(b)); const o = ops.get(opName(b)) ?? new Agg(); o.add(b, isLow(b)); ops.set(opName(b), o); }
      const mrow = ma.row(m, m === 'R' ? 'R (rotary)' : 'W (wood chekku)');
      mrow.children = [...ops.entries()].sort((a, c) => a[0].localeCompare(c[0])).map(([o, a]) => a.row(o, o));
      row.children.push(mrow);
    }
    seeds.push(row);
  }

  const grid = new Map<string, Map<SeedType, Agg>>();
  for (const b of all) {
    const per = grid.get(opName(b)) ?? new Map<SeedType, Agg>();
    const a = per.get(b.seed) ?? new Agg();
    a.add(b, isLow(b));
    per.set(b.seed, a); grid.set(opName(b), per);
  }
  const operatorGrid = [...grid.entries()].sort((a, c) => a[0].localeCompare(c[0])).map(([operator, per]) => ({
    operator,
    seeds: Object.fromEntries([...per.entries()].map(([s, a]) => [s, { batches: a.batches, variancePct: a.expectedL > 0 ? ((a.oilL - a.expectedL) / a.expectedL) * 100 : 0 }])),
  }));

  const tr = new Map<string, { day: string; seed: SeedType; a: Agg }>();
  for (const b of all) {
    const k = `${b.day}|${b.seed}`;
    const e = tr.get(k) ?? { day: b.day, seed: b.seed, a: new Agg() };
    e.a.add(b, false); tr.set(k, e);
  }
  const trend = [...tr.values()].sort((a, c) => a.day.localeCompare(c.day) || a.seed.localeCompare(c.seed)).map((e) => ({
    day: e.day, seed: e.seed, litresPer100Kg: e.a.netKg > 0 ? (e.a.oilL / e.a.netKg) * 100 : 0, normPer100Kg: e.a.netKg > 0 ? (e.a.expectedL / e.a.netKg) * 100 : 0,
  }));

  const lows = all.filter(isLow);
  const lowBatches = lows.map((b) => {
    const variancePct = ((b.oilL - b.expectedL) / b.expectedL) * 100;
    const byOp = lows.filter((x) => x.operator === b.operator).length;
    const byM = lows.filter((x) => x.machine === b.machine && x.seed === b.seed).length;
    const reason = b.operator && byOp >= 2 ? `${byOp} low batches by ${b.operator} in this period`
      : byM >= 2 ? `${byM} low ${SEED_LABEL[b.seed]} batches on machine ${b.machine}` : '';
    return { id: b.id, number: b.number, day: b.day, seed: b.seed, machine: b.machine, operator: b.operator, variancePct, oilL: b.oilL, expectedL: b.expectedL, reason };
  }).sort((a, c) => a.variancePct - c.variancePct);

  const now = Date.now();
  const godown: AnalysisBarrel[] = barrels.filter((g) => g.active).map((g) => {
    const t = (s: string | null) => (s ? new Date(s).getTime() : null);
    const started = t(g.settleStartedOn); const ready = t(g.readyOn); const filled = t(g.filledOn);
    const daysSettling = started === null ? null : Math.max(0, Math.floor((now - started) / DAY));
    const readyWaitingDays = g.status === 'ready' && ready !== null ? Math.max(0, Math.floor((now - ready) / DAY)) : null;
    const fillingDays = g.status === 'filling' && filled !== null ? Math.max(0, Math.floor((now - filled) / DAY)) : null;
    const r = g.lastReading;
    const stickVarianceL = r ? r.varianceL / 1000 : null;
    const stickVariancePct = r && r.systemL > 0 ? (r.varianceL / r.systemL) * 100 : null;
    const flag = readyWaitingDays !== null && readyWaitingDays >= 3 ? 'ready-waiting' : stickVariancePct !== null && Math.abs(stickVariancePct) > 0.5 ? 'stick-variance' : '';
    return {
      id: g.id, label: g.label, oil: g.oil, oilName: g.oilName, status: g.status, levelL: g.levelL / 1000, capacityL: g.capacityL / 1000,
      settleDays: g.settleDays, daysSettling, readyWaitingDays, fillingDays, stickVarianceL, stickVariancePct, flag,
    } as AnalysisBarrel;
  });

  const seedCover = SEEDS.filter((s) => (seedFilter ? s === seedFilter : true)).map((seed) => {
    const perDay = new Map<string, number>();
    for (const b of batchesIn.filter((x) => x.seed === seed)) perDay.set(ymd(b.date), (perDay.get(ymd(b.date)) ?? 0) + b.seedKg / 1000);
    const last = [...perDay.entries()].sort((a, c) => c[0].localeCompare(a[0])).slice(0, 14).map((e) => e[1]);
    const avg = last.length ? last.reduce((a, v) => a + v, 0) / last.length : 0;
    const stockKg = (item(RM[seed])?.stock ?? 0) / 1000;
    const daysOfCover = avg > 0 ? stockKg / avg : null;
    return { seed, label: SEED_LABEL[seed], stockKg, avgKgPerPressingDay: avg, pressingDays: last.length, daysOfCover, low: daysOfCover !== null && daysOfCover < 5 };
  });

  return {
    from: q.from, to: q.to, seed: seedFilter, thresholdPct: threshold,
    totals: { ...total.row('all', 'All batches'), outputValue: total.oilValue + total.cakeValue, oilPriceKnown: SEEDS.some((s) => oilPrice(s) > 0) },
    seeds, operatorGrid, trend, godown, seedCover, lowBatches, costBasis: 'last purchase price',
  };
}
