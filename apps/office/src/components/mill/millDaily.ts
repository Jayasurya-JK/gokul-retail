import type { GodownStatus, MillDaily, MillDailyBarrel, PressingBatch } from '@gokul/data';
import { fmtQty } from './millUtil';

/** One line of the pressing section: a seed on a machine, run by one operator. All quantities are milli-units. */
export interface MillPressingRow {
  key: string;
  operator: string;
  seed: PressingBatch['seed'];
  seedLabel: string;
  machine: 'W' | 'R';
  batches: number;
  seedKg: number;
  cleaningKg: number;
  oilL: number;
  cakeKg: number;
}

/** Litres of oil per 100 kg of clean seed for one row, or null when there is no seed. */
export const rowLitresPer100 = (r: MillPressingRow): number | null => {
  const clean = r.seedKg - r.cleaningKg;
  return clean > 0 ? (r.oilL * 100) / clean : null;
};

export const millPressingRows = (data: MillDaily): MillPressingRow[] => {
  const map = new Map<string, MillPressingRow>();
  for (const b of data.batches) {
    const machine = b.machine ?? 'W';
    const key = `${b.operator}|${b.seed}|${machine}`;
    const row = map.get(key) ?? {
      key, operator: b.operator, seed: b.seed, seedLabel: b.seedLabel, machine,
      batches: 0, seedKg: 0, cleaningKg: 0, oilL: 0, cakeKg: 0,
    };
    row.batches += 1;
    row.seedKg += b.seedKg;
    row.cleaningKg += b.cleaningLossKg;
    row.oilL += b.oilRawL;
    row.cakeKg += b.cakeKg;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) =>
    a.operator.localeCompare(b.operator) || a.seedLabel.localeCompare(b.seedLabel) || a.machine.localeCompare(b.machine));
};

export const sumPressing = (rows: MillPressingRow[]) => rows.reduce(
  (t, r) => ({ batches: t.batches + r.batches, seedKg: t.seedKg + r.seedKg, cleaningKg: t.cleaningKg + r.cleaningKg, oilL: t.oilL + r.oilL, cakeKg: t.cakeKg + r.cakeKg }),
  { batches: 0, seedKg: 0, cleaningKg: 0, oilL: 0, cakeKg: 0 },
);

/** Oil types that moved at all today; the others would only be a row of dashes. */
export const activeOils = (data: MillDaily) =>
  data.oils.filter((o) => o.openingL || o.pressedL || o.outsourcedL || o.transferredL || o.stickAdjustL || o.closingL);

const barrelNums = ['openingL', 'pressedL', 'outsourcedL', 'transferredL', 'stickAdjustL', 'closingL'] as const;

export const sumBarrels = (barrels: MillDailyBarrel[]) =>
  Object.fromEntries(barrelNums.map((k) => [k, barrels.reduce((a, b) => a + b[k], 0)])) as Record<(typeof barrelNums)[number], number>;

export const STATUS_LABEL: Record<GodownStatus, string> = { empty: 'Empty', filling: 'Filling', settling: 'Settling', ready: 'Ready' };

/** True when anything at all was entered or moved on the day; otherwise the page shows its empty state. */
export const hasMillData = (data: MillDaily): boolean =>
  data.batches.length > 0 ||
  data.barrels.length > 0 ||
  data.outsourced.length > 0 ||
  data.transfers.length > 0 ||
  data.seeds.some((s) => s.opening || s.bought || s.toPress || s.other || s.closing) ||
  data.cake.some((c) => c.opening || c.made || c.sold || c.other || c.closing);

/** Plain kg / litre numbers from the report totals (they are not milli-units) with Indian grouping. */
export const fmtNum = (n: number, decimals = 1): string =>
  n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

/** A signed litre/kilogram figure from milli-units, e.g. -500 -> "-0.5". */
export const signed = (m: number): string => `${m > 0 ? '+' : m < 0 ? '-' : ''}${fmtQty(Math.abs(m))}`;
