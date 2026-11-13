import type { MockStore } from './store';
import type { Bill, BillLine, BillTotals, Milli, Paise, UnitCode } from '../types';
import { computeTotals, lineGross } from '../money';

// Area: POS bill history, reprint, cancel, returns and exchange.

export type RefundMode = 'cash' | 'upi' | 'credit_note' | 'exchange';

export interface CreditNote {
  id: string;
  /** Own number series, never mixed with bill numbers */
  number: string;
  at: string;
  billId: string;
  billNumber: string;
  customerId?: string;
  customerName: string;
  /** Returned lines (qty is the returned qty; amounts are what is refunded, GST inclusive) */
  lines: BillLine[];
  totals: BillTotals;
  reason: string;
  refundMode: RefundMode;
  by: string;
  /** Still unused on this note (total minus what was already spent); missing means all of it */
  balance?: Paise;
}

export interface CancelInfo { reason: string; by: string; approvedBy: string; at: string }

export interface BillDetail {
  bill: Bill;
  /** Already returned qty per bill line (same order as bill.lines) */
  returned: Milli[];
  creditNotes: CreditNote[];
  cancel?: CancelInfo;
  reprints: number;
}

export interface BillSearch {
  /** Local day, yyyy-mm-dd */
  date: string;
  /** Bill no, customer name or amount */
  query?: string;
  /** Ignore the date and search every day */
  allDays?: boolean;
}

export interface CancelRequest { billId: string; reason: string; managerPin: string; by: string }
export interface ReturnPick { lineIndex: number; qty: Milli }
export interface ReturnRequest { billId: string; picks: ReturnPick[]; reason: string; refundMode: RefundMode; by: string; /** manager/owner PIN when the role must ask for approval to refund */ managerPin?: string }

export const CANCEL_REASONS = ['Wrong item billed', 'Customer changed mind', 'Duplicate bill', 'Wrong payment mode', 'Price mistake', 'Other'];
export const RETURN_REASONS = ['Seal broken / leaking', 'Wrong item given', 'Customer changed mind', 'Quality complaint', 'Excess quantity', 'Other'];

const DECIMAL_UNITS: UnitCode[] = ['kg', 'g', 'l', 'ml'];
/** Loose-by-weight/volume lines can be returned in fractions; packed lines in whole units */
export const isDecimalUnit = (u: UnitCode) => DECIMAL_UNITS.includes(u);

/** True when part of the bill was put on the customer's account (cash/UPI cannot be refunded then) */
export const billHasCredit = (b: Bill) => b.payments.some((p) => p.mode === 'credit');

/**
 * Pure return maths shared by the screen preview and the mock backend (and later Rust).
 * Each returned line refunds its own (discounted) amount pro-rata, plus its share of any
 * bill-level discount, then GST is reversed with the same slab rules as a bill.
 */
export function quoteReturn(bill: Bill, picks: ReturnPick[], roundToRupee = true): { lines: BillLine[]; totals: BillTotals } {
  const lines: BillLine[] = [];
  for (const p of picks) {
    const l = bill.lines[p.lineIndex];
    if (!l || p.qty <= 0) continue;
    const qty = Math.min(p.qty, l.qty);
    const amount = qty === l.qty ? l.amount : Math.round((l.amount * qty) / l.qty);
    lines.push({ ...l, qty, amount, discount: Math.max(0, lineGross(l.rate, qty) - amount) });
  }
  const lineDisc = bill.lines.reduce((s, l) => s + l.discount, 0);
  const billDisc = Math.max(0, bill.totals.discount - lineDisc);
  const billNet = bill.lines.reduce((s, l) => s + l.amount, 0);
  const retNet = lines.reduce((s, l) => s + l.amount, 0);
  const share = billNet > 0 ? Math.round((billDisc * retNet) / billNet) : 0;
  return { lines, totals: computeTotals(lines, share, roundToRupee) };
}

export interface BillOpsApi {
  listBillsOn(search: BillSearch): Promise<Bill[]>;
  getBillDetail(id: string): Promise<BillDetail | null>;
  /** Scan or type a bill number (full, or just the trailing digits) */
  findBillForReturn(code: string): Promise<BillDetail | null>;
  /** Needs an owner/manager PIN. Never deletes: marks the bill cancelled and puts stock back. */
  cancelBill(req: CancelRequest): Promise<BillDetail>;
  recordReprint(billId: string, by: string): Promise<number>;
  createReturn(req: ReturnRequest): Promise<CreditNote>;
  listCreditNotes(limit?: number): Promise<CreditNote[]>;
  /** Credit carried from an exchange, waiting to be used on the next bill */
  getPendingExchange(): Promise<CreditNote | null>;
  clearPendingExchange(): Promise<void>;
}

const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function createBillOpsMock(store: MockStore): BillOpsApi {
  const returnedByBill = new Map<string, Milli[]>();
  const notes: CreditNote[] = [];
  store.creditNotes = notes;
  const cancels = new Map<string, CancelInfo>();
  const reprints = new Map<string, number>();
  let pendingExchange: CreditNote | null = null;
  let cnSeq = 0;

  const billById = (id: string) => store.bills.find((b) => b.id === id);
  const returnedOf = (b: Bill) => returnedByBill.get(b.id) ?? b.lines.map(() => 0);
  const detail = (b: Bill): BillDetail => ({
    bill: b, returned: [...returnedOf(b)], creditNotes: notes.filter((n) => n.billId === b.id),
    cancel: cancels.get(b.id), reprints: reprints.get(b.id) ?? 0,
  });

  return {
    listBillsOn: async ({ date, query, allDays }) => {
      const q = (query ?? '').trim().toLowerCase();
      let out = store.bills.filter((b) => allDays || dayKey(b.at) === date);
      if (q) {
        const numeric = /^\d+(\.\d{0,2})?$/.test(q);
        out = out.filter((b) =>
          b.number.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q) ||
          (numeric && (() => { const r = String(b.totals.grand / 100); return r === q || (q.length >= 3 && r.startsWith(q)); })()));
      }
      return [...out].reverse().slice(0, 400);
    },
    getBillDetail: async (id) => {
      const b = billById(id);
      return b ? detail(b) : null;
    },
    findBillForReturn: async (code) => {
      const c = code.trim().toLowerCase();
      if (!c) return null;
      const exact = store.bills.find((b) => b.number.toLowerCase() === c);
      if (exact) return detail(exact);
      if (/^\d{3,}$/.test(c)) {
        const hits = store.bills.filter((b) => b.number.replace(/\D/g, '').replace(/^0+/, '').endsWith(c.replace(/^0+/, '')));
        if (hits.length) return detail(hits[hits.length - 1]);
      }
      return null;
    },
    cancelBill: async ({ billId, reason, managerPin, by }) => {
      const b = billById(billId);
      if (!b) throw new Error('Bill not found');
      if (b.status === 'cancelled') throw new Error('This bill is already cancelled');
      if (returnedOf(b).some((q) => q > 0)) throw new Error('Items were already returned on this bill. Cancel is not allowed.');
      if (!reason.trim()) throw new Error('Choose a reason');
      const mgr = store.users.find((u) => (u.role === 'owner' || u.role === 'manager') && u.pin === managerPin);
      if (!mgr) throw new Error('Manager PIN is not correct');
      b.status = 'cancelled';
      for (const l of b.lines) {
        const it = store.items.find((i) => i.id === l.itemId);
        if (it) it.stock += l.qty;
      }
      cancels.set(b.id, { reason, by, approvedBy: mgr.name, at: new Date().toISOString() });
      return detail(b);
    },
    recordReprint: async (billId, by) => {
      void by;
      const n = (reprints.get(billId) ?? 0) + 1;
      reprints.set(billId, n);
      return n;
    },
    createReturn: async ({ billId, picks, reason, refundMode, by }) => {
      const b = billById(billId);
      if (!b) throw new Error('Bill not found');
      if (b.status === 'cancelled') throw new Error('This bill was cancelled');
      if (!reason.trim()) throw new Error('Choose a reason');
      if (billHasCredit(b) && (refundMode === 'cash' || refundMode === 'upi')) {
        throw new Error('This bill was on credit. Refund as a credit note.');
      }
      const done = [...returnedOf(b)];
      const valid = picks.filter((p) => p.qty > 0);
      if (!valid.length) throw new Error('Tick at least one item to return');
      for (const p of valid) {
        const l = b.lines[p.lineIndex];
        if (!l) throw new Error('Line not found');
        if (p.qty + done[p.lineIndex] > l.qty) throw new Error(`Cannot return more than sold for ${l.name}`);
      }
      const q = quoteReturn(b, valid, store.settings.roundToRupee);
      for (const p of valid) {
        done[p.lineIndex] += p.qty;
        const it = store.items.find((i) => i.id === b.lines[p.lineIndex].itemId);
        if (it) it.stock += p.qty;
      }
      returnedByBill.set(b.id, done);
      if (b.lines.every((l, i) => done[i] >= l.qty)) b.status = 'returned';
      cnSeq += 1;
      const note: CreditNote = {
        id: `cn${cnSeq}`, number: `CN-${String(cnSeq).padStart(6, '0')}`, at: new Date().toISOString(),
        billId: b.id, billNumber: b.number, customerId: b.customerId, customerName: b.customerName,
        lines: q.lines, totals: q.totals, reason, refundMode, by,
      };
      notes.push(note);
      if (refundMode === 'exchange') pendingExchange = note;
      return note;
    },
    listCreditNotes: async (limit = 50) => [...notes].reverse().slice(0, limit),
    getPendingExchange: async () => pendingExchange,
    clearPendingExchange: async () => { pendingExchange = null; },
  };
}
