import type { MockStore } from './store';
import type { Item, Milli, Paise, Purchase, UnitCode } from '../types';
import { rng } from '../seed';
import { fuzzyFilter } from '../fuzzy';
import { entryDate } from '../entryDate';
import type { GodownStatus } from './production';

// Area: Office purchases (GRN), suppliers and supplier ledger, production pressing and packing.
// Quantities are Milli (thousandths of kg / L / pc), money is Paise, rates are GST-exclusive.

/* ====================================================================== */
/* Purchasable things (shop items + raw seeds + packing materials)         */
/* ====================================================================== */

export type PurchasableKind = 'item' | 'seed' | 'material';

export interface Purchasable {
  id: string;
  name: string;
  kind: PurchasableKind;
  unit: UnitCode;
  hsn: string;
  gstRate: number;
  /** Last cost per unit, excluding GST */
  cost: Paise;
  stock: Milli;
  /** Items sold loose accept decimal quantities */
  decimal: boolean;
}

/* ====================================================================== */
/* Purchase entry (GRN)                                                    */
/* ====================================================================== */

export type SupplierPayMode = 'cash' | 'upi' | 'bank' | 'cheque';

export interface GrnDraftLine {
  itemId: string;
  qty: Milli;
  /** Rate per unit, excluding GST */
  rate: Paise;
  /** Trade discount in percent, e.g. 2.5 */
  discountPct: number;
  gstRate: number;
}

export interface GrnLineCalc extends GrnDraftLine {
  gross: Paise;
  discount: Paise;
  taxable: Paise;
  gst: Paise;
  amount: Paise;
}

export interface GrnTotals {
  lines: GrnLineCalc[];
  itemCount: number;
  gross: Paise;
  discount: Paise;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  gst: Paise;
  freight: Paise;
  otherCharges: Paise;
  beforeRound: Paise;
  roundOff: Paise;
  total: Paise;
  slabs: { rate: number; taxable: Paise; gst: Paise }[];
}

/** The one place purchase totals are computed. Screens call this; they never do GST maths. */
export function computeGrn(lines: GrnDraftLine[], freight: Paise = 0, otherCharges: Paise = 0, interstate = false): GrnTotals {
  const calc: GrnLineCalc[] = lines.map((l) => {
    const gross = Math.round((l.rate * l.qty) / 1000);
    const discount = Math.round((gross * l.discountPct) / 100);
    const taxable = gross - discount;
    const gst = Math.round((taxable * l.gstRate) / 100);
    return { ...l, gross, discount, taxable, gst, amount: taxable + gst };
  });
  const sum = (f: (l: GrnLineCalc) => number) => calc.reduce((a, l) => a + f(l), 0);
  const gst = sum((l) => l.gst);
  const slabMap = new Map<number, { rate: number; taxable: Paise; gst: Paise }>();
  for (const l of calc) {
    const s = slabMap.get(l.gstRate) ?? { rate: l.gstRate, taxable: 0, gst: 0 };
    s.taxable += l.taxable; s.gst += l.gst;
    slabMap.set(l.gstRate, s);
  }
  const taxable = sum((l) => l.taxable);
  const beforeRound = taxable + gst + freight + otherCharges;
  const total = Math.round(beforeRound / 100) * 100;
  const half = Math.floor(gst / 2);
  return {
    lines: calc, itemCount: calc.length, gross: sum((l) => l.gross), discount: sum((l) => l.discount), taxable,
    cgst: interstate ? 0 : half, sgst: interstate ? 0 : gst - half, igst: interstate ? gst : 0, gst,
    freight, otherCharges, beforeRound, roundOff: total - beforeRound, total,
    slabs: [...slabMap.values()].sort((a, b) => a.rate - b.rate),
  };
}

export interface GrnLine extends GrnLineCalc {
  name: string;
  unit: UnitCode;
  kind: PurchasableKind;
}

export type PayStatus = 'paid' | 'partial' | 'due';

export interface Grn {
  id: string;
  number: string;
  /** When it was entered */
  date: string;
  supplierId: string;
  supplierName: string;
  invoiceNo: string;
  /** yyyy-mm-dd */
  invoiceDate: string;
  dueDate: string;
  lines: GrnLine[];
  totals: GrnTotals;
  total: Paise;
  paid: Paise;
  paidAtEntry: Paise;
  payMode: SupplierPayMode | null;
  status: PayStatus;
  interstate: boolean;
  costUpdated: boolean;
  notes: string;
}

export interface GrnDraft {
  supplierId: string;
  invoiceNo: string;
  invoiceDate: string;
  lines: GrnDraftLine[];
  freight: Paise;
  otherCharges: Paise;
  paidNow: Paise;
  payMode: SupplierPayMode;
  /** Set each item's cost price to this purchase rate (after discount) */
  updateCost: boolean;
  notes?: string;
}

/* ====================================================================== */
/* Suppliers and ledger                                                    */
/* ====================================================================== */

export interface SupplierProfile {
  id: string;
  name: string;
  phone: string;
  city: string;
  gstin: string;
  address: string;
  contact: string;
  creditDays: number;
  outstanding: Paise;
}

export interface SupplierDraft {
  id?: string;
  name: string;
  phone: string;
  city: string;
  gstin: string;
  address: string;
  contact: string;
  creditDays: number;
}

export interface Ageing { current: Paise; d31: Paise; d61: Paise; d90: Paise }

export interface SupplierSummary {
  profile: SupplierProfile;
  due: Paise;
  overdue: Paise;
  totalPurchased: Paise;
  purchased30: Paise;
  billCount: number;
  lastPurchaseOn: string | null;
  lastPaymentOn: string | null;
  ageing: Ageing;
}

export interface LedgerEntry {
  id: string;
  date: string;
  kind: 'purchase' | 'payment';
  ref: string;
  note: string;
  /** Increases what we owe */
  debit: Paise;
  /** Reduces what we owe */
  credit: Paise;
  balance: Paise;
}

export interface OpenBill {
  grnId: string;
  number: string;
  invoiceNo: string;
  date: string;
  dueDate: string;
  total: Paise;
  due: Paise;
  ageDays: number;
  overdue: boolean;
}

export interface SupplierLedger {
  summary: SupplierSummary;
  /** Oldest first, with running balance */
  entries: LedgerEntry[];
  openBills: OpenBill[];
}

export interface SupplierPaymentDraft {
  supplierId: string;
  amount: Paise;
  mode: SupplierPayMode;
  ref?: string;
  /** yyyy-mm-dd, default today */
  date?: string;
  note?: string;
}

export function isValidGstin(g: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.trim().toUpperCase());
}

/* ====================================================================== */
/* Production: pressing                                                    */
/* ====================================================================== */

export type SeedType = 'groundnut' | 'sesame' | 'copra';

export interface SeedProfile {
  seed: SeedType;
  label: string;
  ta: string;
  oilName: string;
  /** Norm: kg of clean seed per litre of oil (editable setting) */
  kgPerL: number;
  /** kg per litre */
  density: number;
  /** Packing wastage norm in percent (a setting; the same on every profile). Absent in the browser preview. */
  packWastagePct?: number;
  settleDays: number;
  /** Seed in godown, milli-kg */
  stock: Milli;
  /** Last seed cost per kg */
  cost: Paise;
  /** Sesame is pressed with palm jaggery */
  usesJaggery: boolean;
}

export type YieldGrade = 'good' | 'low' | 'poor';

export interface PressingMetrics {
  netSeedKg: number;
  oilKg: number;
  yieldPct: number;
  normPct: number;
  /** Percent above/below the norm, negative = below */
  variancePct: number;
  expectedOilL: number;
  litresPer100Kg: number;
  /** Seed in - oil (litres x kg per litre) - oil cake - cleaning waste. Oil cake is a product, not a loss. */
  lossKg: number;
  lossPct: number;
  grade: YieldGrade;
  /** The seed balance, kg */
  seedInKg: number;
  cleaningKg: number;
  cakeKg: number;
  cakePct: number;
  /** Clean seed per litre of oil, kg: compare with the norm */
  kgSeedPerL: number;
}

export interface PressingInput {
  seed: SeedType;
  seedKg: Milli;
  cleaningLossKg: Milli;
  jaggeryKg: Milli;
  oilRawL: Milli;
  cakeKg: Milli;
}

const SEED_BASE: Record<SeedType, { label: string; ta: string; oilName: string; kgPerL: number; density: number; settleDays: number; rm: string; usesJaggery: boolean }> = {
  groundnut: { label: 'Groundnut', ta: 'வேர்க்கடலை', oilName: 'Groundnut Oil', kgPerL: 2.5, density: 0.91, settleDays: 4, rm: 'rm-gn', usesJaggery: false },
  sesame: { label: 'Sesame (Ellu)', ta: 'எள்', oilName: 'Gingelly Oil', kgPerL: 2.7, density: 0.92, settleDays: 5, rm: 'rm-sesame', usesJaggery: true },
  copra: { label: 'Copra', ta: 'கொப்பரை', oilName: 'Coconut Oil', kgPerL: 1.6, density: 0.92, settleDays: 3, rm: 'rm-copra', usesJaggery: false },
};

/** Yield of one batch against the norm. Screens call this; they never compute it themselves. */
export function pressingMetrics(input: PressingInput, norm?: { kgPerL: number; density: number }): PressingMetrics {
  const base = SEED_BASE[input.seed];
  const kgPerL = norm?.kgPerL ?? base.kgPerL;
  const density = norm?.density ?? base.density;
  const netSeedKg = Math.max(0, (input.seedKg - input.cleaningLossKg) / 1000);
  const oilL = input.oilRawL / 1000;
  const oilKg = oilL * density;
  const yieldPct = netSeedKg > 0 ? (oilKg / netSeedKg) * 100 : 0;
  const normPct = (density / kgPerL) * 100;
  const variancePct = normPct > 0 ? ((yieldPct - normPct) / normPct) * 100 : 0;
  const lossKg = netSeedKg + input.jaggeryKg / 1000 - oilKg - input.cakeKg / 1000;
  const grade: YieldGrade = netSeedKg === 0 || variancePct >= -3 ? 'good' : variancePct >= -6 ? 'low' : 'poor';
  return {
    netSeedKg, oilKg, yieldPct, normPct, variancePct, expectedOilL: netSeedKg / kgPerL,
    litresPer100Kg: netSeedKg > 0 ? (oilL / netSeedKg) * 100 : 0,
    lossKg, lossPct: netSeedKg > 0 ? (lossKg / netSeedKg) * 100 : 0, grade,
    seedInKg: input.seedKg / 1000, cleaningKg: input.cleaningLossKg / 1000, cakeKg: input.cakeKg / 1000,
    cakePct: netSeedKg > 0 ? (input.cakeKg / 1000 / netSeedKg) * 100 : 0, kgSeedPerL: oilL > 0 ? netSeedKg / oilL : 0,
  };
}

export type BatchPhase = 'settling' | 'ready' | 'in-barrel' | 'in-godown';

export interface PressingBatch extends PressingInput {
  id: string;
  number: string;
  date: string;
  seedLabel: string;
  oilName: string;
  chekku: string;
  operator: string;
  phase: BatchPhase;
  settleReadyOn: string;
  clearOilL: Milli | null;
  sedimentL: Milli | null;
  barrelId: string | null;
  barrelLabel: string | null;
  movedOn: string | null;
  /** W = wood-pressed (chekku), R = rotary */
  machine?: 'W' | 'R';
  /** The godown barrel the oil went into */
  godownBarrelId?: string | null;
  godownBarrelLabel?: string | null;
  /** Norm in force when it was pressed: kg of clean seed per litre, and kg per litre of the oil */
  normKgPerL?: number;
  oilKgPerL?: number;
  /** Seed price per kg and jaggery cost stamped when pressed (paise). Absent on batches pressed before the stamp existed */
  seedCostPerKg?: Paise | null;
  jaggeryCost?: Paise | null;
  /** entry = typed in Production, legacy-sheet = moved from an old manual mill sheet */
  source?: 'entry' | 'legacy-sheet';
  /** Set when an owner or admin corrected the batch after it was saved */
  editedAt?: string | null;
  editedBy?: string | null;
  metrics: PressingMetrics;
}

export interface PressingDraft extends PressingInput {
  chekku: string;
  operator: string;
  machine?: 'W' | 'R';
  /** The godown barrel the oil goes into (production stock, not the store) */
  godownBarrelId?: string;
  /** The date the batch was pressed (default today, past days allowed, no future) and an optional HH:MM time */
  day?: string;
  time?: string;
}

/** A saved batch corrected by the owner or admin (reversal + re-post). Date is `day` (yyyy-mm-dd) and optional `time` (HH:MM). */
export interface PressingEditInput extends PressingDraft { id: string }

export interface PressingBatchesInput {
  rows: PressingDraft[];
  /** The day the batches belong to (default today); a back-dated day is stamped 20:00 */
  day?: string;
  /** Old manual-sheet row ids, one per row, when the rows are moved from a draft sheet */
  legacyRowIds?: number[];
}

export interface MoveToBarrelDraft {
  batchId: string;
  barrelId: string;
  /** Clear oil after settling and filtering */
  clearOilL: Milli;
}

export interface Barrel {
  id: string;
  label: string;
  seed: SeedType | null;
  oilName: string | null;
  capacityL: Milli;
  levelL: Milli;
  filledOn: string | null;
}

/* ====================================================================== */
/* Production: packing                                                     */
/* ====================================================================== */

export interface PackTarget {
  itemId: string;
  name: string;
  label: string;
  /** Pack size in millilitres */
  sizeMl: number;
  unit: UnitCode;
  stock: Milli;
}

export interface PackLineDraft { itemId: string; count: number }

export interface PackRunDraft {
  barrelId: string;
  lines: PackLineDraft[];
  /** Measured oil taken from the barrel; defaults to the expected quantity */
  usedL: Milli;
  packer: string;
  day?: string;
  time?: string;
}

export interface PackRunLine { itemId: string; name: string; label: string; sizeMl: number; count: number }

export interface PackRun {
  id: string;
  number: string;
  date: string;
  barrelId: string;
  barrelLabel: string;
  oilName: string;
  lines: PackRunLine[];
  expectedL: Milli;
  usedL: Milli;
  wastageL: Milli;
  wastagePct: number;
  packer: string;
  packs: number;
}

/** Packing wastage norm in percent (editable setting; typical, verify with the owner). */
export const PACK_WASTAGE_NORM_PCT = 0.5;

export function packMetrics(lines: { sizeMl: number; count: number }[], usedL: Milli): { expectedL: Milli; wastageL: Milli; wastagePct: number; packs: number; grade: YieldGrade } {
  const expectedL = lines.reduce((a, l) => a + l.sizeMl * l.count, 0);
  const wastageL = usedL - expectedL;
  const wastagePct = expectedL > 0 ? (wastageL / expectedL) * 100 : 0;
  const grade: YieldGrade = wastagePct <= PACK_WASTAGE_NORM_PCT ? 'good' : wastagePct <= PACK_WASTAGE_NORM_PCT * 3 ? 'low' : 'poor';
  return { expectedL, wastageL, wastagePct, packs: lines.reduce((a, l) => a + l.count, 0), grade };
}

/* ====================================================================== */
/* API                                                                     */
/* ====================================================================== */

export interface PurchasingApi {
  searchPurchasable(query: string, limit?: number): Promise<Purchasable[]>;
  listGrns(): Promise<Grn[]>;
  getGrn(id: string): Promise<Grn | null>;
  createGrn(draft: GrnDraft): Promise<Grn>;

  listSupplierSummaries(): Promise<SupplierSummary[]>;
  getSupplierLedger(supplierId: string): Promise<SupplierLedger | null>;
  saveSupplier(draft: SupplierDraft): Promise<SupplierProfile>;
  recordSupplierPayment(draft: SupplierPaymentDraft): Promise<SupplierLedger>;

  listSeedProfiles(): Promise<SeedProfile[]>;
  listPressingBatches(): Promise<PressingBatch[]>;
  createPressingBatch(draft: PressingDraft): Promise<PressingBatch>;
  /** The pressing grid: every row becomes one batch, all rows or none. legacyRowIds pulls rows of an old manual sheet draft (one id per row) */
  createPressingBatches(input: PressingBatchesInput): Promise<PressingBatch[]>;
  /** Owner and admin only: reverse the saved postings and post the corrected ones. Refused when the oil has moved on from the barrel. */
  editPressingBatch(input: PressingEditInput): Promise<PressingBatch>;
  /** Owner and admin only: reverse the postings and hide the batch (its number is never reused; the audit log keeps it). */
  deletePressingBatch(input: { id: string }): Promise<{ id: string; number: string; deleted: true }>;
  moveBatchToBarrel(draft: MoveToBarrelDraft): Promise<PressingBatch>;
  listBarrels(): Promise<Barrel[]>;
  listPackTargets(barrelId: string): Promise<PackTarget[]>;
  listPackRuns(): Promise<PackRun[]>;
  createPackRun(draft: PackRunDraft): Promise<PackRun>;
}

interface SupplierPaymentRec {
  id: string; supplierId: string; date: string; amount: Paise; mode: SupplierPayMode; ref: string; note: string;
}
interface BatchRec extends PressingInput {
  id: string; number: string; date: string; chekku: string; operator: string; settleReadyOn: string;
  clearOilL: Milli | null; sedimentL: Milli | null; barrelId: string | null; movedOn: string | null;
  machine?: 'W' | 'R'; godownBarrelId?: string | null;
  seedCostPerKg?: Paise | null; jaggeryCost?: Paise | null; source?: 'entry' | 'legacy-sheet';
  deleted?: boolean; editedAt?: string | null; editedBy?: string | null;
}

const R = (n: number) => Math.round(n * 100);
const DAY = 86400000;

const dayStart = (offset: number, hour = 10, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MATERIALS: Purchasable[] = [
  { id: 'rm-gn', name: 'Groundnut Kernels (Verkadalai)', kind: 'seed', unit: 'kg', hsn: '1202', gstRate: 0, cost: R(98), stock: 1850000, decimal: true },
  { id: 'rm-sesame', name: 'Sesame Seed (Ellu)', kind: 'seed', unit: 'kg', hsn: '1207', gstRate: 0, cost: R(138), stock: 720000, decimal: true },
  { id: 'rm-copra', name: 'Copra (Dried Coconut)', kind: 'seed', unit: 'kg', hsn: '1203', gstRate: 5, cost: R(168), stock: 1100000, decimal: true },
  { id: 'rm-btl500', name: 'PET Bottle 500 ml with Cap', kind: 'material', unit: 'pc', hsn: '3923', gstRate: 18, cost: R(7.5), stock: 2400000, decimal: false },
  { id: 'rm-btl1l', name: 'PET Bottle 1 L with Cap', kind: 'material', unit: 'pc', hsn: '3923', gstRate: 18, cost: R(11), stock: 1800000, decimal: false },
  { id: 'rm-tin15', name: 'Tin Container 15 L', kind: 'material', unit: 'pc', hsn: '7310', gstRate: 18, cost: R(165), stock: 46000, decimal: false },
  { id: 'rm-label', name: 'Bottle Label (Gokul)', kind: 'material', unit: 'pc', hsn: '4821', gstRate: 18, cost: R(1.2), stock: 6200000, decimal: false },
];

const SUPPLIER_EXTRA: Record<string, { address: string; contact: string; creditDays: number }> = {
  s1: { address: '14, Perundurai Road, Erode 638011', contact: 'Murugan', creditDays: 15 },
  s2: { address: '7, Kangeyam Road, Tiruppur 641604', contact: 'Kongu Palanisamy', creditDays: 7 },
  s3: { address: '22, Fairlands Main Road, Salem 636016', contact: 'Annamalai', creditDays: 21 },
  s4: { address: '5, Market Yard, Pollachi 642001', contact: 'Thanjai Selvam', creditDays: 30 },
  s5: { address: '31, Jaggery Market Street, Mettur 636401', contact: 'Pandian', creditDays: 10 },
  s6: { address: '88, Oppanakara Street, Coimbatore 641001', contact: 'Ravi (Salesman)', creditDays: 15 },
  s7: { address: '12, Big Bazaar Street, Coimbatore 641001', contact: 'Lakshmi Narayanan', creditDays: 15 },
  s8: { address: '3, SIDCO Industrial Estate, Kurichi, Coimbatore 641021', contact: 'Vinayagam', creditDays: 30 },
};

export function createPurchasingMock(store: MockStore): PurchasingApi {
  const r = rng(4242);
  const materials: Purchasable[] = MATERIALS.map((m) => ({ ...m }));
  const matById = new Map(materials.map((m) => [m.id, m]));
  const itemById = new Map(store.items.map((i) => [i.id, i]));
  const findItem = (name: string) => store.items.find((i) => i.name === name);

  /* ---- suppliers ---- */
  const extra = new Map<string, { address: string; contact: string; creditDays: number }>();
  for (const s of store.suppliers) extra.set(s.id, SUPPLIER_EXTRA[s.id] ?? { address: '', contact: '', creditDays: 15 });
  let supplierSeq = store.suppliers.length;

  const profileOf = (id: string): SupplierProfile | null => {
    const s = store.suppliers.find((x) => x.id === id);
    if (!s) return null;
    const e = extra.get(id) ?? { address: '', contact: '', creditDays: 15 };
    return { ...s, ...e };
  };

  /* ---- purchasable lookup ---- */
  const toPurchasable = (i: Item): Purchasable => ({
    id: i.id, name: i.name, kind: 'item', unit: i.unit, hsn: i.hsn, gstRate: i.gstRate, cost: i.cost, stock: i.stock, decimal: i.loose,
  });
  const purchasableById = (id: string): Purchasable | null => {
    const m = matById.get(id);
    if (m) return m;
    const i = itemById.get(id);
    return i ? toPurchasable(i) : null;
  };
  const allPurchasable = (): Purchasable[] => [...materials, ...store.items.filter((i) => i.active).map(toPurchasable)];

  /* ---- GRNs ---- */
  const grns: Grn[] = [];
  const payments: SupplierPaymentRec[] = [];
  let grnSeq = 1042 - 28;
  let paySeq = 0;
  let nextNumber = 1043;

  const statusOf = (total: Paise, paid: Paise): PayStatus => (paid >= total ? 'paid' : paid > 0 ? 'partial' : 'due');

  const buildGrn = (draft: GrnDraft, at: Date, number: string): Grn => {
    const sup = profileOf(draft.supplierId)!;
    const interstate = !sup.gstin.startsWith('33');
    const totals = computeGrn(draft.lines, draft.freight, draft.otherCharges, interstate);
    const lines: GrnLine[] = totals.lines.map((l) => {
      const p = purchasableById(l.itemId)!;
      return { ...l, name: p.name, unit: p.unit, kind: p.kind };
    });
    const paidAtEntry = Math.min(draft.paidNow, totals.total);
    grnSeq += 1;
    return {
      id: `g${grnSeq}`, number, date: at.toISOString(), supplierId: sup.id, supplierName: sup.name,
      invoiceNo: draft.invoiceNo, invoiceDate: draft.invoiceDate,
      dueDate: ymd(new Date(new Date(draft.invoiceDate).getTime() + sup.creditDays * DAY)),
      lines, totals, total: totals.total, paid: paidAtEntry, paidAtEntry,
      payMode: paidAtEntry > 0 ? draft.payMode : null, status: statusOf(totals.total, paidAtEntry),
      interstate, costUpdated: draft.updateCost, notes: draft.notes ?? '',
    };
  };

  const syncStore = () => {
    for (const s of store.suppliers) {
      s.outstanding = grns.filter((g) => g.supplierId === s.id).reduce((a, g) => a + (g.total - g.paid), 0);
    }
    const asPurchases: Purchase[] = grns.map((g) => ({
      id: g.id, number: g.number, date: g.date, supplierId: g.supplierId, supplierName: g.supplierName,
      lines: g.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, cost: l.rate })),
      total: g.total, paid: g.paid,
    }));
    store.purchases.length = 0;
    store.purchases.push(...asPurchases);
  };

  /** Oldest bill first. */
  const allocate = (supplierId: string, amount: Paise, upTo?: number) => {
    let left = amount;
    const open = grns
      .filter((g) => g.supplierId === supplierId && g.total > g.paid && (upTo === undefined || new Date(g.date).getTime() <= upTo))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const g of open) {
      if (left <= 0) break;
      const take = Math.min(left, g.total - g.paid);
      g.paid += take; left -= take;
      g.status = statusOf(g.total, g.paid);
    }
    return amount - left;
  };

  /* ---- seed GRNs ---- */
  const catalog = (sid: string): { items: Purchasable[]; qty: [number, number]; lines: [number, number] } => {
    const byName = (...names: string[]) => names.map((n) => findItem(n)).filter((x): x is Item => !!x).map(toPurchasable);
    const mats = (...ids: string[]) => ids.map((id) => matById.get(id)!).filter(Boolean);
    switch (sid) {
      case 's1': return { items: mats('rm-sesame', 'rm-gn'), qty: [400, 900], lines: [1, 2] };
      case 's2': return { items: mats('rm-gn'), qty: [800, 2000], lines: [1, 1] };
      case 's3': return { items: mats('rm-sesame'), qty: [300, 800], lines: [1, 1] };
      case 's4': return { items: mats('rm-copra'), qty: [500, 1500], lines: [1, 1] };
      case 's5': return { items: byName('Jaggery Block (Achu Vellam) (Loose)', 'Palm Jaggery (Karupatti) (Loose)', 'Jaggery Powder (Loose)'), qty: [100, 300], lines: [1, 3] };
      case 's6': return { items: store.items.filter((i) => i.categoryId === 'pack').slice(0, 8).map(toPurchasable), qty: [12, 60], lines: [3, 5] };
      case 's7': return { items: store.items.filter((i) => i.loose && (i.categoryId === 'dal' || i.categoryId === 'rice')).slice(0, 8).map(toPurchasable), qty: [50, 200], lines: [2, 4] };
      default: return { items: mats('rm-btl500', 'rm-btl1l', 'rm-tin15', 'rm-label'), qty: [500, 2500], lines: [2, 4] };
    }
  };
  const supplierOrder = ['s2', 's3', 's1', 's4', 's5', 's6', 's7', 's8', 's2', 's3', 's4', 's1', 's6', 's2', 's7', 's5', 's3', 's8', 's4', 's2', 's1', 's6', 's3', 's4', 's7', 's2', 's5', 's3'];
  for (let i = 0; i < supplierOrder.length; i++) {
    const sid = supplierOrder[i];
    const cat = catalog(sid);
    if (cat.items.length === 0) continue;
    const at = dayStart(Math.round(i * 3.1 + 1), 11 + (i % 5), (i * 7) % 60);
    const nLines = Math.min(cat.items.length, cat.lines[0] + Math.floor(r() * (cat.lines[1] - cat.lines[0] + 1)));
    const picks = [...cat.items].sort(() => r() - 0.5).slice(0, nLines);
    const lines: GrnDraftLine[] = picks.map((p) => {
      const isBulk = p.unit === 'kg' || p.unit === 'l';
      let qty = Math.round(cat.qty[0] + r() * (cat.qty[1] - cat.qty[0]));
      if (isBulk) qty = Math.round(qty / 5) * 5;
      return {
        itemId: p.id, qty: qty * 1000, rate: Math.round((p.cost * (0.97 + r() * 0.06)) / 50) * 50,
        discountPct: r() < 0.25 ? [1, 2, 2.5][Math.floor(r() * 3)] : 0, gstRate: p.gstRate,
      };
    });
    const gross = computeGrn(lines, 0, 0).total;
    const old = i >= 14;
    const roll = r();
    const paidNow = old || roll < 0.38 ? gross : roll < 0.62 ? Math.round(gross * 0.5 / 100) * 100 : 0;
    const freight = sid === 's6' || sid === 's5' ? 0 : [0, R(450), R(800), R(1200)][Math.floor(r() * 4)];
    const g = buildGrn({
      supplierId: sid, invoiceNo: `${['SM', 'KG', 'AG', 'TC', 'PJ', 'AD', 'LP', 'VP'][Number(sid.slice(1)) - 1]}/${2600 + i * 7 + Math.floor(r() * 5)}`,
      invoiceDate: ymd(at), lines, freight, otherCharges: 0, paidNow: 0, payMode: r() < 0.5 ? 'upi' : 'bank', updateCost: false,
    }, at, `PU-${String(1015 + supplierOrder.length - 1 - i).padStart(5, '0')}`);
    // payment at entry is applied after totals include freight
    const paid = Math.min(paidNow ? (paidNow >= gross ? g.total : Math.round(g.total * 0.5 / 100) * 100) : 0, g.total);
    g.paid = paid; g.paidAtEntry = paid; g.payMode = paid > 0 ? (r() < 0.5 ? 'upi' : 'bank') : null; g.status = statusOf(g.total, paid);
    grns.push(g);
  }
  nextNumber = 1015 + supplierOrder.length;
  // Standalone supplier payments against older dues (oldest bill first)
  const seedPays: [string, number, number][] = [['s3', 20, 62000], ['s1', 12, 30000], ['s4', 9, 25000], ['s7', 6, 15000], ['s2', 4, 40000]];
  for (const [sid, ago, amt] of seedPays) {
    const when = dayStart(ago, 16, 20);
    const used = allocate(sid, R(amt), when.getTime());
    if (used > 0) {
      paySeq += 1;
      payments.push({ id: `sp${paySeq}`, supplierId: sid, date: when.toISOString(), amount: used, mode: payments.length % 2 ? 'upi' : 'bank', ref: `UTR${4821000 + paySeq * 137}`, note: 'Part payment' });
    }
  }
  grns.sort((a, b) => a.date.localeCompare(b.date));
  syncStore();

  /* ---- supplier views ---- */
  const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));

  const summaryOf = (sid: string): SupplierSummary => {
    const profile = profileOf(sid)!;
    const mine = grns.filter((g) => g.supplierId === sid);
    const ageing: Ageing = { current: 0, d31: 0, d61: 0, d90: 0 };
    let overdue = 0;
    for (const g of mine) {
      const due = g.total - g.paid;
      if (due <= 0) continue;
      const age = ageDays(g.invoiceDate + 'T00:00:00');
      if (age <= 30) ageing.current += due; else if (age <= 60) ageing.d31 += due; else if (age <= 90) ageing.d61 += due; else ageing.d90 += due;
      if (g.dueDate < ymd(new Date())) overdue += due;
    }
    const cutoff = Date.now() - 30 * DAY;
    const pays = payments.filter((p) => p.supplierId === sid);
    const lastPay = [...pays.map((p) => p.date), ...mine.filter((g) => g.paidAtEntry > 0).map((g) => g.date)].sort().pop() ?? null;
    return {
      profile, due: mine.reduce((a, g) => a + (g.total - g.paid), 0), overdue,
      totalPurchased: mine.reduce((a, g) => a + g.total, 0),
      purchased30: mine.filter((g) => new Date(g.date).getTime() >= cutoff).reduce((a, g) => a + g.total, 0),
      billCount: mine.length, lastPurchaseOn: mine.map((g) => g.date).sort().pop() ?? null, lastPaymentOn: lastPay, ageing,
    };
  };

  const ledgerOf = (sid: string): SupplierLedger | null => {
    if (!profileOf(sid)) return null;
    const raw: Omit<LedgerEntry, 'balance'>[] = [];
    for (const g of grns.filter((x) => x.supplierId === sid)) {
      raw.push({ id: `l-${g.id}`, date: g.date, kind: 'purchase', ref: g.number, note: `Invoice ${g.invoiceNo}`, debit: g.total, credit: 0 });
      if (g.paidAtEntry > 0) {
        raw.push({ id: `lp-${g.id}`, date: new Date(new Date(g.date).getTime() + 60000).toISOString(), kind: 'payment', ref: g.number, note: `Paid at purchase (${g.payMode ?? 'cash'})`, debit: 0, credit: g.paidAtEntry });
      }
    }
    for (const p of payments.filter((x) => x.supplierId === sid)) {
      raw.push({ id: `l-${p.id}`, date: p.date, kind: 'payment', ref: p.ref || p.mode.toUpperCase(), note: p.note || `Payment by ${p.mode}`, debit: 0, credit: p.amount });
    }
    raw.sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    const entries = raw.map((e) => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
    const today = ymd(new Date());
    const openBills: OpenBill[] = grns
      .filter((g) => g.supplierId === sid && g.total > g.paid)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => ({ grnId: g.id, number: g.number, invoiceNo: g.invoiceNo, date: g.invoiceDate, dueDate: g.dueDate, total: g.total, due: g.total - g.paid, ageDays: ageDays(g.invoiceDate + 'T00:00:00'), overdue: g.dueDate < today }));
    return { summary: summaryOf(sid), entries, openBills };
  };

  /* ---- production seeds ---- */
  const loose = {
    groundnut: findItem('Groundnut Oil (Loose)'), sesame: findItem('Gingelly Oil (Loose)'), copra: findItem('Coconut Oil (Loose)'),
  } as Record<SeedType, Item | undefined>;
  const cake = {
    groundnut: findItem('Groundnut Oil Cake (Loose)'), sesame: findItem('Gingelly Oil Cake (Loose)'), copra: findItem('Coconut Oil Cake (Loose)'),
  } as Record<SeedType, Item | undefined>;
  const jaggery = findItem('Palm Jaggery (Karupatti) (Loose)');

  const seedStock = (s: SeedType) => matById.get(SEED_BASE[s].rm)!;
  store.seedStock = (s) => { const m = seedStock(s); return { stock: m.stock, cost: m.cost }; };
  const profiles = (): SeedProfile[] =>
    (Object.keys(SEED_BASE) as SeedType[]).map((s) => {
      const b = SEED_BASE[s];
      return { seed: s, label: b.label, ta: b.ta, oilName: b.oilName, kgPerL: b.kgPerL, density: b.density, settleDays: b.settleDays, stock: seedStock(s).stock, cost: seedStock(s).cost, usesJaggery: b.usesJaggery };
    });

  const barrels: Barrel[] = [
    { id: 'BR-01', label: 'Barrel 1', seed: 'groundnut', oilName: 'Groundnut Oil', capacityL: 200000, levelL: 164000, filledOn: dayStart(9).toISOString() },
    { id: 'BR-02', label: 'Barrel 2', seed: 'groundnut', oilName: 'Groundnut Oil', capacityL: 200000, levelL: 92500, filledOn: dayStart(17).toISOString() },
    { id: 'BR-03', label: 'Barrel 3', seed: 'groundnut', oilName: 'Groundnut Oil', capacityL: 200000, levelL: 38000, filledOn: dayStart(26).toISOString() },
    { id: 'BR-04', label: 'Barrel 4', seed: 'sesame', oilName: 'Gingelly Oil', capacityL: 200000, levelL: 121000, filledOn: dayStart(12).toISOString() },
    { id: 'BR-05', label: 'Barrel 5', seed: 'sesame', oilName: 'Gingelly Oil', capacityL: 200000, levelL: 177500, filledOn: dayStart(5).toISOString() },
    { id: 'BR-06', label: 'Barrel 6', seed: 'copra', oilName: 'Coconut Oil', capacityL: 200000, levelL: 66000, filledOn: dayStart(21).toISOString() },
    { id: 'BR-07', label: 'Barrel 7', seed: 'copra', oilName: 'Coconut Oil', capacityL: 200000, levelL: 143000, filledOn: dayStart(7).toISOString() },
    { id: 'BR-08', label: 'Barrel 8', seed: null, oilName: null, capacityL: 200000, levelL: 0, filledOn: null },
  ];
  const barrelById = (id: string) => barrels.find((b) => b.id === id);

  const godownFor: Record<SeedType, string[]> = { groundnut: ['GB-001', 'GB-002', 'GB-003'], sesame: ['GB-004', 'GB-005'], copra: ['GB-006', 'GB-007'] };
  const batchRecs: BatchRec[] = [];
  const operators = ['Ambethkar'];
  const seedCycle: SeedType[] = ['groundnut', 'sesame', 'copra', 'groundnut', 'groundnut', 'sesame', 'copra', 'groundnut', 'sesame', 'groundnut', 'copra', 'sesame', 'groundnut', 'groundnut', 'copra', 'sesame'];
  const loadKg: Record<SeedType, number[]> = { groundnut: [300, 350, 400, 420], sesame: [180, 200, 250], copra: [200, 250, 300] };
  const pressedBarrels: Record<SeedType, string[]> = { groundnut: ['BR-01', 'BR-02', 'BR-03'], sesame: ['BR-04', 'BR-05'], copra: ['BR-06', 'BR-07'] };
  for (let i = 0; i < seedCycle.length; i++) {
    const seed = seedCycle[i];
    const b = SEED_BASE[seed];
    const loads = loadKg[seed];
    const seedKg = loads[Math.floor(r() * loads.length)];
    const cleaning = Math.round(seedKg * (0.012 + r() * 0.012) * 2) / 2;
    const net = seedKg - cleaning;
    // two deliberate weak batches so the yield highlight tells a story
    const variance = i === 3 ? -0.075 : i === 9 ? -0.045 : -0.035 + r() * 0.06;
    const oilKgNorm = (net / b.kgPerL) * b.density;
    const oilL = Math.round((net / b.kgPerL) * (1 + variance) * 2) / 2;
    const jag = b.usesJaggery ? Math.round(seedKg * 0.1) : 0;
    const lossKg = net * (0.006 + r() * 0.012);
    const cakeKg = Math.round((net + jag - oilL * b.density - lossKg) * 2) / 2;
    void oilKgNorm;
    const date = dayStart(i * 2 + (i === 0 ? 0 : 1), 9, 30 + (i % 3) * 10);
    const readyOn = new Date(date.getTime() + b.settleDays * DAY);
    const inBarrel = readyOn.getTime() <= Date.now() - DAY * 0.2;
    const sed = Math.round(oilL * (0.025 + r() * 0.02) * 2) / 2;
    batchRecs.push({
      id: `pb${i + 1}`, number: `PB-${String(412 - i).padStart(4, '0')}`, date: date.toISOString(), seed,
      seedKg: seedKg * 1000, cleaningLossKg: cleaning * 1000, jaggeryKg: jag * 1000, oilRawL: oilL * 1000, cakeKg: cakeKg * 1000,
      chekku: `Chekku ${1 + (i % 3)}`, operator: operators[0], settleReadyOn: readyOn.toISOString(),
      clearOilL: inBarrel ? Math.round((oilL - sed) * 1000) : null, sedimentL: inBarrel ? Math.round(sed * 1000) : null,
      barrelId: inBarrel ? pressedBarrels[seed][i % pressedBarrels[seed].length] : null,
      movedOn: inBarrel ? readyOn.toISOString() : null,
      machine: i % 4 === 3 && seed !== 'copra' ? 'R' : 'W', godownBarrelId: godownFor[seed][i % godownFor[seed].length],
    });
  }
  store.pressing = () => batchRecs.filter((b) => !b.deleted).sort((a, b) => b.date.localeCompare(a.date)).map(enrichBatch);
  let batchSeq = batchRecs.length;
  let batchNo = 413;

  const enrichBatch = (b: BatchRec): PressingBatch => {
    const base = SEED_BASE[b.seed];
    const barrel = b.barrelId ? barrelById(b.barrelId) : undefined;
    const gb = b.godownBarrelId ? store.godown?.barrels.find((x) => x.id === b.godownBarrelId) : undefined;
    const phase: BatchPhase = b.godownBarrelId ? 'in-godown' : b.barrelId ? 'in-barrel' : new Date(b.settleReadyOn).getTime() <= Date.now() ? 'ready' : 'settling';
    return {
      ...b, seedLabel: base.label, oilName: base.oilName, phase, barrelLabel: barrel?.label ?? null,
      godownBarrelLabel: gb?.label ?? null, normKgPerL: base.kgPerL, oilKgPerL: base.density,
      metrics: pressingMetrics(b),
    };
  };

  /* ---- pack runs ---- */
  const parseMl = (label: string): number => {
    const m = label.trim().match(/^([\d.]+)\s*(ml|l)$/i);
    if (!m) return 0;
    return Math.round(Number(m[1]) * (m[2].toLowerCase() === 'l' ? 1000 : 1));
  };
  const targetsFor = (oilName: string): PackTarget[] =>
    store.items
      .filter((i) => !i.loose && i.name.startsWith(`${oilName} `) && i.packSize && parseMl(i.packSize) > 0)
      .map((i) => ({ itemId: i.id, name: i.name, label: i.packSize!, sizeMl: parseMl(i.packSize!), unit: i.unit, stock: i.stock }))
      .sort((a, b) => a.sizeMl - b.sizeMl);

  const packRuns: PackRun[] = [];
  let packSeq = 0;
  const seedPack = (offset: number, barrelId: string, counts: Record<string, number>, wastePct: number, packer: string) => {
    const barrel = barrelById(barrelId)!;
    const targets = targetsFor(barrel.oilName!);
    const lines: PackRunLine[] = targets
      .filter((t) => counts[t.label])
      .map((t) => ({ itemId: t.itemId, name: t.name, label: t.label, sizeMl: t.sizeMl, count: counts[t.label] }));
    const expected = lines.reduce((a, l) => a + l.sizeMl * l.count, 0);
    const used = Math.round(expected * (1 + wastePct / 100) / 10) * 10;
    packSeq += 1;
    const m = packMetrics(lines, used);
    packRuns.push({
      id: `pk${packSeq}`, number: `PK-${String(230 + packSeq).padStart(4, '0')}`, date: dayStart(offset, 14, 15).toISOString(),
      barrelId, barrelLabel: barrel.label, oilName: barrel.oilName!, lines, expectedL: expected, usedL: used,
      wastageL: m.wastageL, wastagePct: m.wastagePct, packer, packs: m.packs,
    });
  };
  seedPack(14, 'BR-01', { '500 ml': 48, '1 L': 60, '5 L': 6 }, 0.3, 'Revathi');
  seedPack(12, 'BR-04', { '200 ml': 60, '500 ml': 40, '1 L': 36 }, 0.4, 'Revathi');
  seedPack(10, 'BR-06', { '500 ml': 36, '1 L': 48, '15 L': 2 }, 0.9, 'Kala');
  seedPack(8, 'BR-02', { '1 L': 72, '5 L': 8 }, 0.2, 'Revathi');
  seedPack(6, 'BR-05', { '500 ml': 60, '1 L': 30 }, 0.5, 'Kala');
  seedPack(4, 'BR-01', { '500 ml': 40, '1 L': 50, '15 L': 3 }, 1.8, 'Kala');
  seedPack(2, 'BR-07', { '200 ml': 48, '500 ml': 48, '1 L': 36 }, 0.4, 'Revathi');
  seedPack(1, 'BR-04', { '500 ml': 36, '1 L': 24, '5 L': 4 }, 0.3, 'Revathi');
  packRuns.sort((a, b) => b.date.localeCompare(a.date));

  /* ---- API ---- */
  const checkDraft = (d: PressingDraft) => {
    const base = SEED_BASE[d.seed];
    const stock = seedStock(d.seed);
    if (d.seedKg <= 0) throw new Error('Enter the seed weight.');
    if (d.oilRawL <= 0) throw new Error('Enter the oil that came out.');
    if (d.cleaningLossKg >= d.seedKg) throw new Error('Cleaning loss cannot be more than the seed weight.');
    if (d.seedKg > stock.stock) throw new Error(`Only ${(stock.stock / 1000).toFixed(0)} kg ${base.label} in the godown.`);
    if (d.jaggeryKg > 0 && jaggery && d.jaggeryKg > jaggery.stock) throw new Error('Not enough palm jaggery in stock.');
    const gstate = store.godown;
    const gb = d.godownBarrelId ? gstate?.barrels.find((x) => x.id === d.godownBarrelId) : undefined;
    if (d.godownBarrelId) {
      if (!gb) throw new Error('Choose a godown barrel.');
      if (gb.oil !== d.seed) throw new Error(`${gb.label} holds ${SEED_BASE[gb.oil].label.split(' ')[0].toLowerCase()} oil. Choose a ${SEED_BASE[d.seed].label.split(' ')[0].toLowerCase()} barrel.`);
      if (gb.status === 'settling' || gb.status === 'ready') throw new Error(`${gb.label} is ${gb.status} and cannot take fresh oil. Pick a barrel that is filling or empty.`);
      if (gb.levelL + d.oilRawL > gb.capacityL) throw new Error(`${gb.label} has room for only ${((gb.capacityL - gb.levelL) / 1000).toFixed(1)} L.`);
    }
    return { base, stock, gstate, gb };
  };
  const applyEffects = (rec: BatchRec, d: PressingDraft, now: Date, c: ReturnType<typeof checkDraft>, suffix = '') => {
    c.stock.stock -= d.seedKg;
    if (d.jaggeryKg > 0 && jaggery) jaggery.stock -= d.jaggeryKg;
    const ck = cake[d.seed];
    if (ck) ck.stock += d.cakeKg;
    if (c.gb && c.gstate) {
      c.gb.levelL += d.oilRawL;
      c.gstate.moves.push({ at: now.toISOString(), kind: 'press', qtyL: d.oilRawL, note: `Oil from ${rec.number}${suffix}`, by: 'Suresh Kumar', barrelId: c.gb.id });
      c.gb.filledOn = c.gb.filledOn ?? now.toISOString();
      c.gstate.stored.set(c.gb.id, 'filling');
      c.gb.settleStartedOn = null;
    }
  };
  /** Take a saved batch's postings back out (a reversing row dated on the original moment). Throws when the oil has moved on. */
  const reverseRec = (rec: BatchRec): (() => void) => {
    const gstate = store.godown;
    const gb = rec.godownBarrelId ? gstate?.barrels.find((x) => x.id === rec.godownBarrelId) : undefined;
    const what = `Batch ${rec.number}`;
    if (rec.barrelId) throw new Error(`${what} was moved into a store barrel (the old way, before godown barrels), so it cannot be changed.`);
    if (gb && gstate) {
      const status = (store.godown?.stored.get(gb.id) ?? 'empty');
      const eff = gb.status === 'settling' || gb.status === 'ready' ? gb.status : status;
      if (eff === 'settling' || eff === 'ready') throw new Error(`${what} cannot be changed: ${gb.label} is ${eff}, so the oil has moved on. Reopen the barrel first if settling was started by mistake.`);
      if (gb.levelL < rec.oilRawL) throw new Error(`${what} cannot be changed: ${gb.label} holds only ${(gb.levelL / 1000).toFixed(1)} L now, so some of that oil has already left the barrel.`);
    }
    const ck = cake[rec.seed];
    if (ck && rec.cakeKg > 0 && ck.stock < rec.cakeKg) throw new Error(`${what} cannot be changed: its oil cake (${Math.round(rec.cakeKg / 1000)} kg) has already been sold or used.`);
    const stock = seedStock(rec.seed);
    stock.stock += rec.seedKg;
    if (rec.jaggeryKg > 0 && jaggery) jaggery.stock += rec.jaggeryKg;
    if (ck) ck.stock -= rec.cakeKg;
    let prevStored: string | undefined;
    if (gb && gstate) {
      prevStored = gstate.stored.get(gb.id);
      gb.levelL -= rec.oilRawL;
      gstate.moves.push({ at: rec.date, kind: 'press', qtyL: -rec.oilRawL, note: `Correction of ${rec.number}`, by: 'Suresh Kumar', barrelId: gb.id });
      if (gb.levelL === 0) { gstate.stored.set(gb.id, 'empty'); gb.filledOn = null; gb.settleStartedOn = null; }
    }
    // undo (used when the corrected values are refused): put the postings back exactly
    return () => {
      stock.stock -= rec.seedKg;
      if (rec.jaggeryKg > 0 && jaggery) jaggery.stock -= rec.jaggeryKg;
      if (ck) ck.stock += rec.cakeKg;
      if (gb && gstate) {
        gb.levelL += rec.oilRawL;
        gstate.moves.pop();
        if (prevStored) gstate.stored.set(gb.id, prevStored as GodownStatus);
      }
    };
  };
  const createBatch = async (d: PressingDraft, at?: Date): Promise<PressingBatch> => {
      const c = checkDraft(d);
      const base = c.base;
      const stock = c.stock;
      batchSeq += 1;
      const now = at ?? entryDate(d.day, d.time);
      const rec: BatchRec = {
        ...d, seedCostPerKg: stock.cost, jaggeryCost: jaggery && d.jaggeryKg > 0 ? Math.round((jaggery.cost * d.jaggeryKg) / 1000) : 0, source: 'entry',
        id: `pb${batchSeq}`, number: `PB-${String(batchNo).padStart(4, '0')}`, date: now.toISOString(),
        settleReadyOn: new Date(now.getTime() + base.settleDays * DAY).toISOString(), clearOilL: null, sedimentL: null, barrelId: null, movedOn: null,
        machine: d.machine ?? 'W', godownBarrelId: d.godownBarrelId ?? null,
      };
      batchNo += 1;
      batchRecs.push(rec);
      applyEffects(rec, d, now, c);
      return enrichBatch(rec);
  };
  const liveRec = (id: string) => {
    const rec = batchRecs.find((b) => b.id === id);
    if (!rec) throw new Error('Batch not found.');
    if (rec.deleted) throw new Error('This batch was already deleted.');
    return rec;
  };

  return {
    searchPurchasable: async (query, limit = 40) => fuzzyFilter(allPurchasable(), query, (p) => [p.name, p.hsn], limit),

    listGrns: async () => [...grns].sort((a, b) => b.date.localeCompare(a.date)),
    getGrn: async (id) => grns.find((g) => g.id === id) ?? null,
    createGrn: async (draft) => {
      const sup = profileOf(draft.supplierId);
      if (!sup) throw new Error('Choose a supplier first.');
      if (draft.lines.length === 0) throw new Error('Add at least one item.');
      for (const l of draft.lines) {
        if (!purchasableById(l.itemId)) throw new Error('One of the items no longer exists.');
        if (l.qty <= 0) throw new Error('Quantity must be more than zero.');
      }
      const number = `PU-${String(nextNumber).padStart(5, '0')}`;
      nextNumber += 1;
      const g = buildGrn(draft, new Date(), number);
      grns.push(g);
      for (const l of g.lines) {
        const m = matById.get(l.itemId);
        if (m) {
          m.stock += l.qty;
          if (draft.updateCost) m.cost = Math.round(l.taxable * 1000 / l.qty);
        } else {
          const it = itemById.get(l.itemId);
          if (it) {
            it.stock += l.qty;
            if (draft.updateCost) it.cost = Math.round((l.taxable * 1000) / l.qty);
          }
        }
      }
      syncStore();
      return g;
    },

    listSupplierSummaries: async () => store.suppliers.map((s) => summaryOf(s.id)),
    getSupplierLedger: async (id) => ledgerOf(id),
    saveSupplier: async (d) => {
      const name = d.name.trim();
      if (!name) throw new Error('Enter the supplier name.');
      if (d.gstin.trim() && !isValidGstin(d.gstin)) throw new Error('GSTIN looks wrong. It has 15 letters and digits, e.g. 33AAKFG4821M1ZQ.');
      if (d.phone.replace(/\D/g, '').length < 10) throw new Error('Enter a 10 digit phone number.');
      if (store.suppliers.some((s) => s.id !== d.id && s.name.toLowerCase() === name.toLowerCase())) throw new Error('A supplier with this name already exists.');
      let id = d.id;
      if (id) {
        const s = store.suppliers.find((x) => x.id === id);
        if (!s) throw new Error('Supplier not found.');
        Object.assign(s, { name, phone: d.phone.trim(), city: d.city.trim(), gstin: d.gstin.trim().toUpperCase() });
      } else {
        supplierSeq += 1;
        id = `s${supplierSeq}`;
        store.suppliers.push({ id, name, phone: d.phone.trim(), city: d.city.trim(), gstin: d.gstin.trim().toUpperCase(), outstanding: 0 });
      }
      extra.set(id, { address: d.address.trim(), contact: d.contact.trim(), creditDays: d.creditDays });
      return profileOf(id)!;
    },
    recordSupplierPayment: async (d) => {
      if (!profileOf(d.supplierId)) throw new Error('Supplier not found.');
      if (d.amount <= 0) throw new Error('Enter an amount more than zero.');
      const summary = summaryOf(d.supplierId);
      if (d.amount > summary.due) throw new Error('This is more than the amount due.');
      const when = d.date ? new Date(`${d.date}T${new Date().toTimeString().slice(0, 8)}`) : new Date();
      allocate(d.supplierId, d.amount);
      paySeq += 1;
      payments.push({ id: `sp${paySeq}`, supplierId: d.supplierId, date: when.toISOString(), amount: d.amount, mode: d.mode, ref: d.ref ?? '', note: d.note ?? '' });
      syncStore();
      return ledgerOf(d.supplierId)!;
    },

    listSeedProfiles: async () => profiles(),
    listPressingBatches: async () => batchRecs.filter((b) => !b.deleted).sort((a, b) => b.date.localeCompare(a.date)).map(enrichBatch),
    createPressingBatch: (d) => createBatch(d),
    createPressingBatches: async (input) => {
      if (input.rows.length === 0) throw new Error('Enter at least one pressing row.');
      if (input.legacyRowIds?.length && input.legacyRowIds.length !== input.rows.length) throw new Error('Every row must come from an old sheet row, or none.');
      const at = input.day && input.day !== new Date().toISOString().slice(0, 10) ? new Date(`${input.day}T20:00:00`) : undefined;
      // all rows or none: remember what a batch changes and put it back when a later row fails
      const gs = store.godown;
      const snap = {
        n: batchRecs.length, seq: batchSeq, no: batchNo,
        seeds: (['groundnut', 'sesame', 'copra'] as SeedType[]).map((s) => [s, seedStock(s).stock] as const),
        jag: jaggery?.stock ?? 0, cakes: Object.entries(cake).map(([k, v]) => [k, v?.stock ?? 0] as const),
        barrels: gs?.barrels.map((b) => ({ id: b.id, level: b.levelL, filledOn: b.filledOn, settle: b.settleStartedOn, st: gs.stored.get(b.id) })) ?? [],
        moves: gs?.moves.length ?? 0,
      };
      const out: PressingBatch[] = [];
      try {
        for (const [i, d] of input.rows.entries()) {
          if (!d.operator.trim()) throw new Error('choose the operator.');
          const b = await createBatch(d, at);
          const rec = batchRecs.find((x) => x.id === b.id)!;
          if (input.legacyRowIds?.length) { rec.source = 'legacy-sheet'; (store.legacyImported ??= new Set()).add(String(input.legacyRowIds[i])); }
          out.push(enrichBatch(rec));
        }
      } catch (e) {
        batchRecs.length = snap.n; batchSeq = snap.seq; batchNo = snap.no;
        snap.seeds.forEach(([s, v]) => { seedStock(s).stock = v; });
        if (jaggery) jaggery.stock = snap.jag;
        snap.cakes.forEach(([k, v]) => { const c = (cake as Record<string, { stock: number } | undefined>)[k]; if (c) c.stock = v; });
        if (gs) {
          snap.barrels.forEach((x) => { const b = gs.barrels.find((y) => y.id === x.id)!; b.levelL = x.level; b.filledOn = x.filledOn; b.settleStartedOn = x.settle; if (x.st) gs.stored.set(x.id, x.st); });
          gs.moves.length = snap.moves;
        }
        throw new Error(`Row ${out.length + 1}: ${e instanceof Error ? e.message : 'could not save'}`);
      }
      return out;
    },
    editPressingBatch: async (input) => {
      const rec = liveRec(input.id);
      if (input.seed !== rec.seed) throw new Error('The seed of a saved batch cannot be changed. Delete the batch and enter it again.');
      if (!input.operator.trim()) throw new Error('Choose the operator.');
      const when = input.day ? entryDate(input.day, input.time) : new Date(rec.date);
      const undo = reverseRec(rec);
      try {
        const c = checkDraft(input);
        applyEffects(rec, input, when, c, ' (corrected)');
        Object.assign(rec, {
          date: when.toISOString(), seedKg: input.seedKg, cleaningLossKg: input.cleaningLossKg, jaggeryKg: input.jaggeryKg, oilRawL: input.oilRawL, cakeKg: input.cakeKg,
          chekku: input.chekku, operator: input.operator, machine: input.machine ?? 'W', godownBarrelId: input.godownBarrelId ?? null,
          settleReadyOn: new Date(when.getTime() + c.base.settleDays * DAY).toISOString(), editedAt: new Date().toISOString(), editedBy: 'Suresh Kumar',
        });
      } catch (e) { undo(); throw e; }
      return enrichBatch(rec);
    },
    deletePressingBatch: async ({ id }) => {
      const rec = liveRec(id);
      reverseRec(rec);
      rec.deleted = true;
      return { id, number: rec.number, deleted: true as const };
    },
    moveBatchToBarrel: async (d) => {
      const rec = batchRecs.find((b) => b.id === d.batchId);
      const barrel = barrelById(d.barrelId);
      if (!rec || !barrel) throw new Error('Batch or barrel not found.');
      if (rec.barrelId) throw new Error('This batch is already in a barrel.');
      if (d.clearOilL <= 0 || d.clearOilL > rec.oilRawL) throw new Error('Clear oil must be more than zero and not more than the raw oil.');
      if (barrel.seed && barrel.seed !== rec.seed && barrel.levelL > 0) throw new Error(`${barrel.label} holds ${barrel.oilName}. Keep one oil per barrel.`);
      if (barrel.levelL + d.clearOilL > barrel.capacityL) throw new Error(`${barrel.label} has room for only ${((barrel.capacityL - barrel.levelL) / 1000).toFixed(1)} L.`);
      barrel.seed = rec.seed; barrel.oilName = SEED_BASE[rec.seed].oilName;
      barrel.levelL += d.clearOilL;
      barrel.filledOn = barrel.filledOn ?? new Date().toISOString();
      rec.barrelId = barrel.id; rec.clearOilL = d.clearOilL; rec.sedimentL = rec.oilRawL - d.clearOilL; rec.movedOn = new Date().toISOString();
      const l = loose[rec.seed];
      if (l) l.stock += d.clearOilL;
      return enrichBatch(rec);
    },
    listBarrels: async () => barrels.map((b) => ({ ...b })),
    listPackTargets: async (barrelId) => {
      const b = barrelById(barrelId);
      return b?.oilName ? targetsFor(b.oilName) : [];
    },
    listPackRuns: async () => [...packRuns].sort((a, b) => b.date.localeCompare(a.date)),
    createPackRun: async (d) => {
      const when = entryDate(d.day, d.time);
      const barrel = barrelById(d.barrelId);
      if (!barrel?.oilName) throw new Error('Choose a barrel that has oil.');
      const targets = targetsFor(barrel.oilName);
      const lines: PackRunLine[] = d.lines
        .filter((l) => l.count > 0)
        .map((l) => {
          const t = targets.find((x) => x.itemId === l.itemId);
          if (!t) throw new Error('That pack size does not belong to this oil.');
          return { itemId: t.itemId, name: t.name, label: t.label, sizeMl: t.sizeMl, count: l.count };
        });
      if (lines.length === 0) throw new Error('Enter how many packs you filled.');
      const m = packMetrics(lines, d.usedL);
      if (d.usedL < m.expectedL) throw new Error('Oil used cannot be less than the oil in the packs.');
      if (d.usedL > barrel.levelL) throw new Error(`${barrel.label} has only ${(barrel.levelL / 1000).toFixed(1)} L.`);
      const oilName = barrel.oilName;
      barrel.levelL -= d.usedL;
      if (barrel.levelL === 0) { barrel.seed = null; barrel.oilName = null; barrel.filledOn = null; }
      const looseItem = findItem(`${oilName} (Loose)`);
      if (looseItem) looseItem.stock = Math.max(0, looseItem.stock - d.usedL);
      for (const l of lines) {
        const it = itemById.get(l.itemId);
        if (it) it.stock += l.count * 1000;
      }
      packSeq += 1;
      const run: PackRun = {
        id: `pk${packSeq}`, number: `PK-${String(230 + packSeq).padStart(4, '0')}`, date: when.toISOString(),
        barrelId: barrel.id, barrelLabel: barrel.label, oilName, lines,
        expectedL: m.expectedL, usedL: d.usedL, wastageL: m.wastageL, wastagePct: m.wastagePct, packer: d.packer, packs: m.packs,
      };
      packRuns.push(run);
      return run;
    },
  };
}
