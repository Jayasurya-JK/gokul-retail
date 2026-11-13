import type { MockStore } from './store';
import type { Paise } from '../types';
import type { MillSettings } from './crm';

// Area: the mill daily sheet (the owner's paper form "SRI GOKUL ENTERPRISES").
// A sheet is a draft until it is closed: rows are saved but stock does not move. Closing posts it all at once
// (pressing batches, customer job-work bills, punnaku purchases, stock differences) and the sheet becomes read-only.
// Quantities are milli-units (kg x 1000, litres x 1000), like everywhere else.

export type MillSeed = 'groundnut' | 'sesame' | 'copra';
export type Machine = 'W' | 'R';
export type PunnakuKey = 'kadalai_w' | 'kadalai_r' | 'ellu_w' | 'ellu_r' | 'coco';
export type MillStockKey = MillSeed | PunnakuKey | 'vellam' | 'malli' | 'oil_groundnut' | 'oil_sesame' | 'oil_coconut';

export const MILL_SEEDS: { key: MillSeed; label: string; ta: string }[] = [
  { key: 'groundnut', label: 'Groundnut', ta: 'வேர்க்கடலை' },
  { key: 'sesame', label: 'Sesame (Ellu)', ta: 'எள்' },
  { key: 'copra', label: 'Coconut (Copra)', ta: 'கொப்பரை' },
];
export const PUNNAKU: { key: PunnakuKey; label: string; ta: string }[] = [
  { key: 'kadalai_w', label: 'Kadalai W', ta: 'கடலை W' },
  { key: 'kadalai_r', label: 'Kadalai R', ta: 'கடலை R' },
  { key: 'ellu_w', label: 'Ellu W', ta: 'எள் W' },
  { key: 'ellu_r', label: 'Ellu R', ta: 'எள் R' },
  { key: 'coco', label: 'Coco', ta: 'தேங்காய்' },
];
export const MACHINES: { key: Machine; label: string }[] = [{ key: 'W', label: 'W (chekku)' }, { key: 'R', label: 'R (rotary)' }];

export interface MillOpRow {
  id?: string;
  operator: string;
  seed: MillSeed;
  machine: Machine;
  /** seed in, milli-kg */
  seedKg: number;
  /** oil out, milli-litres */
  oilL: number;
  /** punnaku out, milli-kg */
  cakeKg: number;
  /** vellam (palm jaggery) used with sesame, milli-kg */
  jaggeryKg: number;
  /** Pressing batch made when the sheet was closed, or when the row was moved to Production */
  batchNumber?: string;
  /** The row was moved into Production as a real batch (draft sheets only) */
  imported?: boolean;
}

export interface MillCustRow {
  id?: string;
  customerId: string;
  customerName?: string;
  seed: MillSeed;
  machine: Machine;
  seedKg: number;
  oilL: number;
  cakeKg: number;
  /** taken: customer takes the cake (higher rate). kept: the shop keeps it (lower rate, cake goes into shop stock). */
  cakeMode: 'taken' | 'kept';
  /** Paise per kg, GST included */
  rate?: Paise;
  charge?: Paise;
  billNumber?: string;
}

export interface MillPunnakuRow {
  id?: string;
  punnaku: PunnakuKey;
  qtyKg: number;
  supplierId?: string;
  supplierName?: string;
  note?: string;
}

export interface MillStockLine {
  key: MillStockKey;
  group: 'seed' | 'punnaku' | 'other' | 'oil';
  label: string;
  ta: string;
  unit: 'kg' | 'L';
  opening: number;
  /** seeds used (negative), punnaku made (positive), oil pressed (positive) */
  pressed: number;
  purchased: number;
  /** cake the shop keeps from customer aravai */
  kept: number;
  sold: number;
  packed: number;
  adjusted: number;
  other: number;
  /** opening + everything above */
  computed: number;
  /** counted by the supervisor, if entered */
  physical: number | null;
  /** physical - computed */
  variance: number | null;
}

export interface MillSheet {
  day: string;
  status: 'draft' | 'closed';
  supervisor: string;
  note: string;
  settings: MillSettings;
  opRows: MillOpRow[];
  custRows: MillCustRow[];
  punnakuRows: MillPunnakuRow[];
  stock: MillStockLine[];
  /** Total aravai charge billed to customers */
  aravaiCharge: Paise;
  closedAt?: string | null;
  closedBy?: string;
  approvedBy?: string;
}

export interface MillSheetInput {
  day: string;
  supervisor: string;
  note: string;
  opRows: Omit<MillOpRow, 'id' | 'batchNumber'>[];
  custRows: Omit<MillCustRow, 'id' | 'customerName' | 'rate' | 'charge' | 'billNumber'>[];
  punnakuRows: Omit<MillPunnakuRow, 'id' | 'supplierName'>[];
  /** Counted closing stock by key; a missing key means not counted */
  physical: Partial<Record<MillStockKey, number>>;
}

/** The day sheet: the automatic daily report plus supervisor, note and the optional evening count. Same shape as an old sheet, with no entry rows. */
export interface MillDay extends MillSheet {
  /** Rows of an old manual draft for this day that have not been moved to Production yet */
  legacyOpenRows: number;
}

export interface MillDayInput {
  day: string;
  supervisor: string;
  note: string;
  /** Counted stock by key (seeds, punnaku, vellam, malli); a missing key means not counted */
  physical: Partial<Record<MillStockKey, number>>;
}

/** Job work (aravai for a customer): posted when it is entered. Seed and oil are the customer's own and never touch shop stock. */
export interface JobWorkInput {
  customerId: string;
  seed: MillSeed;
  machine: Machine;
  seedKg: number;
  oilL: number;
  cakeKg: number;
  cakeMode: 'taken' | 'kept';
  /** Default today */
  day?: string;
}

export interface JobWork {
  id: string;
  day: string;
  customerId: string;
  customerName: string;
  seed: MillSeed;
  machine: Machine;
  seedKg: number;
  oilL: number;
  cakeKg: number;
  cakeMode: 'taken' | 'kept';
  /** Paise per kg, GST included */
  rate: Paise;
  charge: Paise;
  billNumber: string;
}

export interface MillSheetSummary {
  day: string;
  status: 'draft' | 'closed';
  supervisor: string;
  closedAt?: string | null;
  aravaiCharge: Paise;
  varianceCount: number;
}

export interface MillApi {
  getMillSheet(day: string): Promise<MillSheet>;
  /** Saves the draft (nothing touches stock). A closed sheet cannot be saved. */
  saveMillSheet(input: MillSheetInput): Promise<MillSheet>;
  /** Posts the sheet and makes it read-only. Needs a manager PIN because it adjusts stock. */
  closeMillSheet(input: { day: string; managerPin?: string }): Promise<MillSheet>;
  listMillSheets(limit?: number): Promise<MillSheetSummary[]>;
  /** The day sheet's count lines (expected stock, counted, difference) */
  getMillDay(day: string): Promise<MillDay>;
  /** Posts a customer's job work now: credit bill for the per-kg charge, and the cake the shop keeps goes into stock */
  recordJobWork(input: JobWorkInput): Promise<JobWork>;
  listJobWork(limit?: number): Promise<JobWork[]>;
  /** Saves supervisor, note and counts. Nothing touches stock. A closed day cannot be saved. */
  saveMillDay(input: MillDayInput): Promise<MillDay>;
  /** Posts the counted differences as stock adjustments and freezes the day. Needs a manager PIN. */
  closeMillDay(input: { day: string; managerPin?: string }): Promise<MillDay>;
}

/** The machine-less key of a seed and machine ("coco" has no W/R split). */
export function punnakuKey(seed: MillSeed, machine: Machine): PunnakuKey {
  if (seed === 'groundnut') return machine === 'R' ? 'kadalai_r' : 'kadalai_w';
  if (seed === 'sesame') return machine === 'R' ? 'ellu_r' : 'ellu_w';
  return 'coco';
}

/* ------------------------------------------------------------------ mock */

interface Def { key: MillStockKey; group: MillStockLine['group']; label: string; ta: string; unit: 'kg' | 'L'; start: number }
const DEFS: Def[] = [
  { key: 'groundnut', group: 'seed', label: 'Groundnut', ta: 'வேர்க்கடலை', unit: 'kg', start: 4200 },
  { key: 'sesame', group: 'seed', label: 'Sesame (Ellu)', ta: 'எள்', unit: 'kg', start: 1800 },
  { key: 'copra', group: 'seed', label: 'Coconut (Copra)', ta: 'கொப்பரை', unit: 'kg', start: 2600 },
  { key: 'kadalai_w', group: 'punnaku', label: 'Punnaku Kadalai W', ta: 'கடலை புண்ணாக்கு W', unit: 'kg', start: 380 },
  { key: 'kadalai_r', group: 'punnaku', label: 'Punnaku Kadalai R', ta: 'கடலை புண்ணாக்கு R', unit: 'kg', start: 150 },
  { key: 'ellu_w', group: 'punnaku', label: 'Punnaku Ellu W', ta: 'எள் புண்ணாக்கு W', unit: 'kg', start: 120 },
  { key: 'ellu_r', group: 'punnaku', label: 'Punnaku Ellu R', ta: 'எள் புண்ணாக்கு R', unit: 'kg', start: 60 },
  { key: 'coco', group: 'punnaku', label: 'Punnaku Coco', ta: 'தேங்காய் புண்ணாக்கு', unit: 'kg', start: 210 },
  { key: 'vellam', group: 'other', label: 'Vellam', ta: 'வெல்லம்', unit: 'kg', start: 85 },
  { key: 'malli', group: 'other', label: 'Malli', ta: 'மல்லி', unit: 'kg', start: 40 },
  { key: 'oil_groundnut', group: 'oil', label: 'Groundnut oil', ta: 'கடலை எண்ணெய்', unit: 'L', start: 780 },
  { key: 'oil_sesame', group: 'oil', label: 'Sesame oil', ta: 'நல்லெண்ணெய்', unit: 'L', start: 340 },
  { key: 'oil_coconut', group: 'oil', label: 'Coconut oil', ta: 'தேங்காய் எண்ணெய்', unit: 'L', start: 520 },
];

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const DEFAULT_SETTINGS: MillSettings = { operators: ['Operator 1', 'Operator 2'], rateCakeTaken: 800, rateCakeKept: 500, serviceSac: '998811', serviceGstRate: 5 };
const oilKey = (s: MillSeed): MillStockKey => (s === 'sesame' ? 'oil_sesame' : s === 'copra' ? 'oil_coconut' : 'oil_groundnut');

export function createMillMock(store: MockStore): MillApi {
  const closed = new Map<string, MillSheet>();
  const drafts = new Map<string, MillSheetInput>();
  let billSeq = 48700;
  const jobs: JobWork[] = [];
  const dayMeta = new Map<string, { supervisor: string; note: string; physical: Partial<Record<MillStockKey, number>> }>();

  const settings = (): MillSettings => store.mill ?? DEFAULT_SETTINGS;
  const soldOf = (key: MillStockKey, day: string): number => {
    const d = DEFS.find((x) => x.key === key)!;
    if (d.group === 'seed' || d.group === 'other') return 0;
    const base = d.group === 'oil' ? 38 : 24;
    return -Math.round((base + (hash(`${key}${day}`) % 22)) * 1000);
  };
  const openingOf = (key: MillStockKey, day: string): number => {
    const prev = [...closed.values()].filter((s) => s.day < day).sort((a, b) => b.day.localeCompare(a.day))[0];
    if (prev) {
      const l = prev.stock.find((x) => x.key === key)!;
      return l.physical ?? l.computed;
    }
    return DEFS.find((x) => x.key === key)!.start * 1000;
  };

  const compute = (day: string, inp: MillSheetInput): MillStockLine[] => {
    return DEFS.map((d) => {
      const l: MillStockLine = {
        key: d.key, group: d.group, label: d.label, ta: d.ta, unit: d.unit, opening: openingOf(d.key, day), pressed: 0, purchased: 0, kept: 0,
        sold: soldOf(d.key, day), packed: 0, adjusted: 0, other: 0, computed: 0, physical: null, variance: null,
      };
      for (const r of inp.opRows) {
        if (r.seed === d.key) l.pressed -= r.seedKg;
        if (punnakuKey(r.seed, r.machine) === d.key) l.pressed += r.cakeKg;
        if (d.key === 'vellam') l.pressed -= r.jaggeryKg;
        if (oilKey(r.seed) === d.key) l.pressed += r.oilL;
      }
      for (const r of inp.custRows) if (r.cakeMode === 'kept' && punnakuKey(r.seed, r.machine) === d.key) l.kept += r.cakeKg;
      for (const r of inp.punnakuRows) if (r.punnaku === d.key) l.purchased += r.qtyKg;
      l.computed = l.opening + l.pressed + l.purchased + l.kept + l.sold + l.packed + l.adjusted + l.other;
      const p = inp.physical[d.key];
      if (typeof p === 'number') { l.physical = p; l.variance = p - l.computed; }
      return l;
    });
  };

  const view = (day: string, status: 'draft' | 'closed', inp: MillSheetInput, closedMeta?: { at: string; by: string; approvedBy: string }): MillSheet => {
    const s = settings();
    const custRows: MillCustRow[] = inp.custRows.map((r, i) => {
      const rate = r.cakeMode === 'kept' ? s.rateCakeKept : s.rateCakeTaken;
      const c = store.customers.find((x) => x.id === r.customerId);
      return { ...r, id: `mj${i + 1}`, customerName: c?.name ?? r.customerId, rate, charge: Math.round((rate * r.seedKg) / 1000), billNumber: status === 'closed' ? `GK-26-${String(billSeq + i).padStart(6, '0')}` : '' };
    });
    return {
      day, status, supervisor: inp.supervisor, note: inp.note, settings: clone(s),
      opRows: inp.opRows.map((r, i) => ({ ...r, id: `mo${legacyId(day, i)}`, imported: store.legacyImported?.has(String(legacyId(day, i))) ?? false, batchNumber: status === 'closed' ? `PB-26-${String(40 + i + hash(day) % 20).padStart(6, '0')}` : '' })),
      custRows, punnakuRows: inp.punnakuRows.map((r, i) => ({ ...r, id: `mp${i + 1}`, supplierName: store.suppliers.find((x) => x.id === r.supplierId)?.name ?? '' })),
      stock: compute(day, inp), aravaiCharge: custRows.reduce((a, r) => a + (r.charge ?? 0), 0),
      closedAt: closedMeta?.at ?? null, closedBy: closedMeta?.by ?? '', approvedBy: closedMeta?.approvedBy ?? '',
    };
  };

  const legacyId = (day: string, i: number) => Number(day.slice(5).replace('-', '')) * 100 + i + 1;
  const empty = (day: string): MillSheetInput => ({ day, supervisor: '', note: '', opRows: [], custRows: [], punnakuRows: [], physical: {} });

  const validate = (inp: MillSheetInput) => {
    if (inp.day > dayKey(new Date())) throw new Error('A mill sheet cannot be for a future day.');
    const ops = settings().operators;
    inp.opRows.forEach((r, i) => {
      if (!ops.includes(r.operator)) throw new Error(`Aravai (operator) row ${i + 1}: choose an operator from the list in Settings.`);
      if (r.seedKg <= 0) throw new Error(`Aravai (operator) row ${i + 1}: enter the seed weight.`);
    });
    inp.custRows.forEach((r, i) => {
      if (!store.customers.some((c) => c.id === r.customerId)) throw new Error(`Aravai (customer) row ${i + 1}: choose the customer.`);
      if (r.seedKg <= 0) throw new Error(`Aravai (customer) row ${i + 1}: enter the seed weight.`);
      if (r.cakeMode === 'kept' && r.cakeKg <= 0) throw new Error(`Aravai (customer) row ${i + 1}: enter the cake the shop keeps.`);
    });
    inp.punnakuRows.forEach((r, i) => { if (r.qtyKg <= 0) throw new Error(`Punnaku purchased row ${i + 1}: enter the weight.`); });
  };

  const closeIt = (day: string, by: string, approvedBy: string) => {
    const inp = drafts.get(day) ?? empty(day);
    inp.opRows.forEach((r, i) => { if (r.oilL <= 0) throw new Error(`Aravai (operator) row ${i + 1}: enter the oil that came out.`); });
    const sheet = view(day, 'closed', inp, { at: new Date().toISOString(), by, approvedBy });
    billSeq += inp.custRows.length;
    closed.set(day, sheet);
    drafts.delete(day);
    return sheet;
  };

  // Three closed days of history so the screen opens with something real.
  const seedDay = (back: number, ops: MillSheetInput['opRows'], cust: MillSheetInput['custRows'], puns: MillSheetInput['punnakuRows'], delta: Partial<Record<MillStockKey, number>>) => {
    const d = new Date(); d.setDate(d.getDate() - back);
    const day = dayKey(d);
    const inp: MillSheetInput = { day, supervisor: 'Mohan', note: '', opRows: ops, custRows: cust, punnakuRows: puns, physical: {} };
    drafts.set(day, inp);
    for (const l of compute(day, inp)) inp.physical[l.key] = Math.max(0, l.computed + (delta[l.key] ?? 0));
    closeIt(day, 'Suresh Kumar', 'Suresh Kumar');
  };
  const c = (i: number) => store.customers[i]?.id ?? 'c1';
  const op = (operator: string, seed: MillSeed, machine: Machine, kg: number, oil: number, cake: number, jag = 0) =>
    ({ operator, seed, machine, seedKg: kg * 1000, oilL: oil * 1000, cakeKg: cake * 1000, jaggeryKg: jag * 1000 });
  seedDay(3, [op('Operator 1', 'groundnut', 'W', 120, 44.5, 70), op('Operator 1', 'sesame', 'W', 60, 21, 38, 6), op('Operator 2', 'groundnut', 'R', 150, 60, 82)],
    [{ customerId: c(2), seed: 'groundnut', machine: 'W', seedKg: 40000, oilL: 15000, cakeKg: 22000, cakeMode: 'taken' }],
    [{ punnaku: 'kadalai_w', qtyKg: 120000 }, { punnaku: 'ellu_r', qtyKg: 45000 }], { kadalai_w: -2500 });
  seedDay(2, [op('Operator 1', 'groundnut', 'W', 140, 51.5, 82), op('Operator 2', 'copra', 'W', 90, 52, 33), op('Operator 2', 'sesame', 'R', 70, 27.5, 40, 7)],
    [{ customerId: c(5), seed: 'sesame', machine: 'W', seedKg: 25000, oilL: 9000, cakeKg: 15000, cakeMode: 'kept' }, { customerId: c(2), seed: 'groundnut', machine: 'R', seedKg: 30000, oilL: 11500, cakeKg: 17000, cakeMode: 'taken' }],
    [{ punnaku: 'kadalai_r', qtyKg: 80000 }], { sesame: -1000 });
  seedDay(1, [op('Operator 1', 'groundnut', 'W', 130, 48, 76), op('Operator 2', 'groundnut', 'R', 110, 44, 60), op('Operator 1', 'copra', 'W', 80, 46, 29)],
    [{ customerId: c(7), seed: 'groundnut', machine: 'W', seedKg: 50000, oilL: 19000, cakeKg: 28000, cakeMode: 'kept' }],
    [{ punnaku: 'coco', qtyKg: 60000 }, { punnaku: 'kadalai_w', qtyKg: 90000 }], { kadalai_r: 1500 });

  // Two old manual drafts (nothing was ever posted for them), shown read-only in the Old sheets archive.
  const draftDay = (back: number, ops: MillSheetInput['opRows'], note: string) => {
    const d = new Date(); d.setDate(d.getDate() - back);
    drafts.set(dayKey(d), { day: dayKey(d), supervisor: 'Mohan', note, opRows: ops, custRows: [], punnakuRows: [], physical: {} });
  };
  draftDay(5, [op('Operator 1', 'groundnut', 'W', 100, 38, 58), op('Operator 2', 'sesame', 'W', 50, 18.5, 30, 5)], 'draft, never closed');
  draftDay(4, [op('Operator 1', 'groundnut', 'R', 120, 45, 66)], 'draft, never closed');

  const api: MillApi = {
    getMillSheet: async (day) => {
      const done = closed.get(day);
      if (done) return clone(done);
      return clone(view(day, 'draft', drafts.get(day) ?? empty(day)));
    },
    saveMillSheet: async (input) => {
      if (closed.has(input.day)) throw new Error('This sheet is closed. Closed sheets cannot be changed.');
      validate(input);
      drafts.set(input.day, clone(input));
      return clone(view(input.day, 'draft', input));
    },
    closeMillSheet: async ({ day, managerPin }) => {
      if (closed.has(day)) throw new Error('This sheet is already closed.');
      if (!drafts.has(day)) throw new Error('Fill and save the sheet before closing it.');
      if (!(managerPin ?? '').trim()) throw new Error('A manager PIN is needed to close the mill sheet (it adjusts stock)');
      const m = store.users.find((u) => (u.role === 'owner' || u.role === 'manager') && u.pin === managerPin!.trim());
      if (!m) throw new Error('Manager PIN is not correct');
      return clone(closeIt(day, m.name, m.name));
    },
    getMillDay: async (day) => {
      const done = closed.get(day);
      if (done) return { ...clone(done), legacyOpenRows: 0 };
      const d = drafts.get(day);
      const inp = { ...empty(day), supervisor: dayMeta.get(day)?.supervisor ?? '', note: dayMeta.get(day)?.note ?? '', physical: dayMeta.get(day)?.physical ?? {} };
      const v = view(day, 'draft', inp);
      for (const l of v.stock) { if (l.group === 'seed') { const s = store.seedStock?.(l.key as 'groundnut' | 'sesame' | 'copra'); if (s) { l.opening = s.stock; l.computed = s.stock + l.sold; if (l.physical !== null) l.variance = l.physical - l.computed; } } }
      return { ...clone(v), opRows: [], legacyOpenRows: d ? d.opRows.filter((_, i) => !store.legacyImported?.has(String(legacyId(day, i)))).length : 0 };
    },
    saveMillDay: async (input) => {
      if (closed.has(input.day)) throw new Error('This day is closed. A closed day cannot be changed.');
      if (input.day > dayKey(new Date())) throw new Error('A mill sheet cannot be for a future day.');
      if (Object.keys(input.physical).some((k) => DEFS.find((d) => d.key === k)?.group === 'oil')) throw new Error('Oil is counted in the godown (stick reading), not on the day sheet.');
      dayMeta.set(input.day, { supervisor: input.supervisor, note: input.note, physical: clone(input.physical) });
      return api.getMillDay(input.day);
    },
    closeMillDay: async ({ day, managerPin }) => {
      if (closed.has(day)) throw new Error('This day is already closed.');
      const d = drafts.get(day);
      if (d && d.opRows.some((_, i) => !store.legacyImported?.has(String(legacyId(day, i))))) throw new Error('This day still has rows from an old manual sheet. Move them to Production (Mill day sheet, Old sheets) before closing the day.');
      if (!(managerPin ?? '').trim()) throw new Error('A manager PIN is needed to close the mill day (it adjusts stock)');
      const m = store.users.find((u) => (u.role === 'owner' || u.role === 'manager') && u.pin === managerPin!.trim());
      if (!m) throw new Error('Manager PIN is not correct');
      const cur = await api.getMillDay(day);
      const meta = dayMeta.get(day);
      const sheet: MillSheet = { ...cur, status: 'closed', closedAt: new Date().toISOString(), closedBy: m.name, approvedBy: m.name, supervisor: meta?.supervisor ?? '', note: meta?.note ?? '' };
      closed.set(day, sheet);
      drafts.delete(day);
      return { ...clone(sheet), legacyOpenRows: 0 };
    },
    recordJobWork: async (i) => {
      if (i.seedKg <= 0) throw new Error('Enter the seed weight.');
      if (i.cakeMode === 'kept' && i.cakeKg <= 0) throw new Error('Enter the cake the shop keeps.');
      const cust = store.customers.find((x) => x.id === i.customerId);
      if (!cust) throw new Error('Choose the customer.');
      const day = i.day || dayKey(new Date());
      if (day > dayKey(new Date())) throw new Error('The day cannot be in the future.');
      if (closed.has(day)) throw new Error('That day is closed. Choose another day.');
      const rate = i.cakeMode === 'kept' ? settings().rateCakeKept : settings().rateCakeTaken;
      billSeq += 1;
      const job: JobWork = {
        id: `mj${900 + jobs.length}`, day, customerId: i.customerId, customerName: cust.name, seed: i.seed, machine: i.machine, seedKg: i.seedKg, oilL: i.oilL, cakeKg: i.cakeKg,
        cakeMode: i.cakeMode, rate, charge: Math.round((rate * i.seedKg) / 1000), billNumber: `GK-26-${String(billSeq).padStart(6, '0')}`,
      };
      jobs.unshift(job);
      return { ...job };
    },
    listJobWork: async (limit = 100) => {
      const old: JobWork[] = [...closed.values()].flatMap((s) => s.custRows.map((r) => ({
        id: r.id ?? '', day: s.day, customerId: r.customerId, customerName: r.customerName ?? '', seed: r.seed, machine: r.machine, seedKg: r.seedKg, oilL: r.oilL,
        cakeKg: r.cakeKg, cakeMode: r.cakeMode, rate: r.rate ?? 0, charge: r.charge ?? 0, billNumber: r.billNumber ?? '',
      })));
      return [...jobs, ...old].sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit).map((j) => ({ ...j }));
    },
    listMillSheets: async (limit = 60) => {
      const all: MillSheetSummary[] = [...closed.values()].map((s) => ({
        day: s.day, status: 'closed', supervisor: s.supervisor, closedAt: s.closedAt, aravaiCharge: s.aravaiCharge,
        varianceCount: s.stock.filter((l) => (l.variance ?? 0) !== 0).length,
      }));
      for (const d of drafts.values()) all.push({ day: d.day, status: 'draft', supervisor: d.supervisor, closedAt: null, aravaiCharge: 0, varianceCount: 0 });
      return all.sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit);
    },
  };
  return api;
}
