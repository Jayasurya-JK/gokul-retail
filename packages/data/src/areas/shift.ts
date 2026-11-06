import type { MockStore } from './store';
import type { Paise, Shift, User } from '../types';

// Area: POS day open, cash in/out, day close (X/Z), lock, plus two small billing-screen helpers.

/* ---------- Denominations ---------- */
export interface Denom { key: string; label: string; value: Paise }
/** Notes counted by piece. Coins are typed as one rupee amount (key "coins"). */
export const DENOMS: Denom[] = [
  { key: '2000', label: '2,000', value: 200000 },
  { key: '500', label: '500', value: 50000 },
  { key: '200', label: '200', value: 20000 },
  { key: '100', label: '100', value: 10000 },
  { key: '50', label: '50', value: 5000 },
  { key: '20', label: '20', value: 2000 },
  { key: '10', label: '10', value: 1000 },
];
export const COINS_KEY = 'coins';
/** counts[key] = number of notes; counts.coins = rupees in coins. */
export type DenomCounts = Record<string, number>;

export function countedTotal(counts: DenomCounts): Paise {
  let t = (counts[COINS_KEY] ?? 0) * 100;
  for (const d of DENOMS) t += (counts[d.key] ?? 0) * d.value;
  return t;
}

/** A tidy Rs 2,000 float used by "same as usual" in the day-open screen. */
export const USUAL_FLOAT: DenomCounts = { '500': 2, '200': 2, '100': 3, '50': 4, '20': 5 };

/* ---------- Cash in / out ---------- */
export type CashKind = 'out' | 'in';
export interface CashEntry {
  id: string; at: string; kind: CashKind; reason: string; amount: Paise; note: string; by: string;
}
export const CASH_REASONS: Record<CashKind, string[]> = {
  out: ['Tea and snacks', 'Transport', 'Supplier payment', 'Staff advance', 'Courier and freight', 'Shop expense', 'Owner withdrawal', 'Other'],
  in: ['Change added', 'Owner deposit', 'Bank withdrawal', 'Other'],
};
export interface CashEntryInput { kind: CashKind; reason: string; amount: Paise; note: string; by: string; /** needed for cash out unless the role may open the drawer */ managerPin?: string }

/* ---------- Day status / summary ---------- */
export interface DayStatus {
  open: boolean;
  shift: Shift | null;
  /** Float the drawer was left with at the last Z close, offered as the default at day open */
  suggestedFloat: Paise;
  lastClosedAt?: string;
}

export interface ModeTotals { cash: Paise; upi: Paise; card: Paise; credit: Paise }
export interface ShiftSummary {
  at: string;
  counter: string;
  openedAt: string;
  openedBy: string;
  openingCash: Paise;
  billCount: number;
  itemCount: number;
  sales: Paise;
  byMode: ModeTotals;
  returnsCount: number;
  returnsAmount: Paise;
  cancelCount: number;
  cancelAmount: Paise;
  cashIn: Paise;
  cashOut: Paise;
  discounts: Paise;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  slabs: { rate: number; taxable: Paise; cgst: Paise; sgst: Paise }[];
  /** opening + cash sales + cash in - cash out */
  expectedCash: Paise;
}

export interface ZReport {
  number: string;
  closedAt: string;
  closedBy: string;
  approvedBy: string;
  counted: Paise;
  expected: Paise;
  /** counted - expected: negative is short, positive is excess */
  difference: Paise;
  counts: DenomCounts;
  summary: ShiftSummary;
}

export interface ShiftApi {
  /** Overrides the core stub: returns the real shift once the day is open. */
  currentShift(userId: string): Promise<Shift>;
  getDayStatus(): Promise<DayStatus>;
  openDay(input: { userId: string; counts: DenomCounts }): Promise<Shift>;

  listCashEntries(): Promise<CashEntry[]>;
  addCashEntry(input: CashEntryInput): Promise<CashEntry>;

  /** X report: live summary of the day so far. */
  shiftSummary(): Promise<ShiftSummary>;
  /** Manager or owner PIN check (for Z close). */
  verifyManagerPin(pin: string): Promise<User | null>;
  /** Z close. Returns null when the manager PIN is wrong. */
  closeDay(input: { userId: string; counts: DenomCounts; managerPin: string }): Promise<ZReport | null>;

  /** Billing helpers: the number the next saved bill will get, and inline "add customer" from F3. */
  peekNextBillNumber(): Promise<string>;
  quickAddCustomer(input: { name: string; phone: string }): Promise<import('../types').Customer>;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sameDay = (a: string | Date, b: Date) => {
  const x = new Date(a);
  return x.getFullYear() === b.getFullYear() && x.getMonth() === b.getMonth() && x.getDate() === b.getDate();
};

export function createShiftMock(store: MockStore): ShiftApi {
  let shift: Shift | null = null;
  let suggestedFloat: Paise = 200000;
  let lastClosedAt: string | undefined;
  let zSeq = 41;
  let cashSeq = 0;
  const entries: CashEntry[] = [];

  const seedEntry = (minsAgo: number, kind: CashKind, reason: string, amount: Paise, note: string, by: string) => {
    cashSeq += 1;
    entries.push({ id: `c${cashSeq}`, at: new Date(Date.now() - minsAgo * 60000).toISOString(), kind, reason, amount, note, by });
  };
  seedEntry(190, 'in', 'Change added', 100000, 'Coins and 10 rupee notes from owner', 'Suresh Kumar');
  seedEntry(120, 'out', 'Tea and snacks', 6000, 'Tea for 4 staff', 'Karthik Murugan');
  seedEntry(55, 'out', 'Transport', 25000, 'Auto charge, barrel pickup from mill', 'Karthik Murugan');

  const todaysBills = () => {
    const now = new Date();
    return store.bills.filter((b) => sameDay(b.at, now));
  };

  const summarise = (): ShiftSummary => {
    const bills = todaysBills();
    const sold = bills.filter((b) => b.status === 'paid' || b.status === 'credit');
    const mode = (m: keyof ModeTotals) => sum(sold.flatMap((b) => b.payments).filter((p) => p.mode === m).map((p) => p.amount));
    const byMode: ModeTotals = { cash: mode('cash'), upi: mode('upi'), card: mode('card'), credit: mode('credit') };
    const returned = bills.filter((b) => b.status === 'returned');
    const cancelled = bills.filter((b) => b.status === 'cancelled');
    const slabMap = new Map<number, { taxable: Paise; cgst: Paise; sgst: Paise }>();
    for (const b of sold) {
      for (const s of b.totals.slabs) {
        const cur = slabMap.get(s.rate) ?? { taxable: 0, cgst: 0, sgst: 0 };
        cur.taxable += s.taxable; cur.cgst += s.cgst; cur.sgst += s.sgst;
        slabMap.set(s.rate, cur);
      }
    }
    const slabs = [...slabMap.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v }));
    const cashIn = sum(entries.filter((e) => e.kind === 'in').map((e) => e.amount));
    const cashOut = sum(entries.filter((e) => e.kind === 'out').map((e) => e.amount));
    const openingCash = shift?.openingCash ?? 0;
    return {
      at: new Date().toISOString(),
      counter: store.settings.counter,
      openedAt: shift?.openedAt ?? new Date().toISOString(),
      openedBy: store.users.find((u) => u.id === shift?.userId)?.name ?? 'Cashier',
      openingCash,
      billCount: sold.length,
      itemCount: sum(sold.map((b) => b.totals.itemCount)),
      sales: sum(sold.map((b) => b.totals.grand)),
      byMode,
      returnsCount: returned.length,
      returnsAmount: sum(returned.map((b) => b.totals.grand)),
      cancelCount: cancelled.length,
      cancelAmount: sum(cancelled.map((b) => b.totals.grand)),
      cashIn, cashOut,
      discounts: sum(sold.map((b) => b.totals.discount)),
      taxable: sum(slabs.map((s) => s.taxable)),
      cgst: sum(slabs.map((s) => s.cgst)),
      sgst: sum(slabs.map((s) => s.sgst)),
      slabs,
      expectedCash: openingCash + byMode.cash + cashIn - cashOut,
    };
  };

  const pad6 = (n: number) => String(n).padStart(6, '0');

  return {
    currentShift: async (userId) =>
      shift ?? { id: 'sh-none', userId, counter: store.settings.counter, openedAt: new Date().toISOString(), openingCash: 0 },
    getDayStatus: async () => ({ open: !!shift, shift, suggestedFloat, lastClosedAt }),
    openDay: async ({ userId, counts }) => {
      shift = {
        id: `sh-${Date.now()}`, userId, counter: store.settings.counter,
        openedAt: new Date().toISOString(), openingCash: countedTotal(counts),
      };
      return shift;
    },

    listCashEntries: async () => [...entries].reverse(),
    addCashEntry: async (input) => {
      cashSeq += 1;
      const e: CashEntry = { id: `c${cashSeq}`, at: new Date().toISOString(), ...input };
      entries.push(e);
      return e;
    },

    shiftSummary: async () => summarise(),
    verifyManagerPin: async (pin) =>
      store.users.find((u) => (u.role === 'manager' || u.role === 'owner') && u.pin === pin) ?? null,
    closeDay: async ({ userId, counts, managerPin }) => {
      const approver = store.users.find((u) => (u.role === 'manager' || u.role === 'owner') && u.pin === managerPin);
      if (!approver) return null;
      const summary = summarise();
      const counted = countedTotal(counts);
      zSeq += 1;
      const report: ZReport = {
        number: `Z-${pad6(zSeq)}`, closedAt: new Date().toISOString(),
        closedBy: store.users.find((u) => u.id === userId)?.name ?? 'Cashier', approvedBy: approver.name,
        counted, expected: summary.expectedCash, difference: counted - summary.expectedCash, counts, summary,
      };
      suggestedFloat = summary.openingCash || suggestedFloat;
      lastClosedAt = report.closedAt;
      shift = null;
      return report;
    },

    peekNextBillNumber: async () => `${store.settings.billPrefix}-${pad6(48200 + store.bills.length + 1)}`,
    quickAddCustomer: async ({ name, phone }) => {
      const c = {
        id: `c-new-${store.customers.length + 1}`, name: name.trim(), phone: phone.trim(), area: 'Coimbatore',
        creditLimit: 0, outstanding: 0, loyaltyPoints: 0, lastVisit: 'Today',
      };
      store.customers.unshift(c);
      return c;
    },
  };
}
