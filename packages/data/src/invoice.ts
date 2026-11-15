import type { Bill, BillLine, BillTotals, Payment, Settings } from './types';
import type { CreditNote } from './areas/billops';
import { amountInWords } from './words';
import { stateName } from './gst';
import { printNumber } from './printed';
import { rateBp } from './money';

/**
 * GST tax invoices, bills of supply and credit notes: the facts a printed document must carry (CGST Rule 46, confirm with CA),
 * worked out once here and drawn by the preview (thermal roll or A4). Same rules as crates/core/src/invoice.rs, which draws the
 * paper itself.
 */
export type InvoiceKind = 'tax-invoice' | 'bill-of-supply' | 'credit-note';

/** A consumer bill from this amount up carries the buyer's name, address and state too (confirm with CA: Rs 50,000). */
export const B2C_DETAILS_FROM = 5_000_000;

export interface HsnRow { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number }

export interface SupplierInfo { name: string; address: string; gstin: string; phone: string; fssai?: string }

export interface InvoiceData {
  kind: InvoiceKind;
  title: string;
  /** The number as printed ("26/00123", or a credit note's number) */
  number: string;
  at: string;
  /** Credit note: the invoice it is against (printed number and its date) */
  against?: { number: string; at: string };
  reason?: string;
  supplier: SupplierInfo;
  recipient: { name: string; address: string; gstin: string; phone: string; state: string };
  place: string;
  inter: boolean;
  lines: BillLine[];
  totals: BillTotals;
  payments: Payment[];
  counter?: string;
  /** Credit note: how the money goes back */
  refundBy?: string;
  duplicate?: boolean;
  cancelled?: boolean;
  hsnSummary: HsnRow[];
  words: string;
}

/** Bill of supply only when every line is exempt or nil rated (0%) and no cess is charged; a mixed cart is a tax invoice. */
export const isBillOfSupply = (lines: BillLine[], totals: BillTotals, composition = false): boolean =>
  composition || (totals.gst === 0 && (totals.cess ?? 0) === 0 && lines.every((l) => l.gstRate === 0 && !l.cessRate));

/** Whether a bill prints as the full tax invoice on a roll: a registered buyer, or a consumer bill from Rs 50,000. */
export const needsFullInvoice = (b: Pick<Bill, 'customerGstin' | 'totals'>): boolean => !!b.customerGstin || b.totals.grand >= B2C_DETAILS_FROM;

export function hsnSummary(lines: BillLine[]): HsnRow[] {
  const m = new Map<string, HsnRow>();
  for (const l of lines) {
    if (!l.tax) continue;
    const key = `${l.hsn ?? ''}|${rateBp(l.gstRate)}`;
    const r = m.get(key) ?? { hsn: l.hsn ?? '', rate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    r.taxable += l.tax.taxable; r.cgst += l.tax.cgst; r.sgst += l.tax.sgst; r.igst += l.tax.igst; r.cess += l.tax.cess;
    m.set(key, r);
  }
  return [...m.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

export interface InvoiceContext {
  supplier: SupplierInfo;
  /** The customer's business name and phone (the GSTIN, state and address are already on the bill) */
  customer?: { business?: string; phone?: string; address?: string };
  numberFormat?: 'yy/nnnnn' | 'raw';
  composition?: boolean;
  duplicate?: boolean;
}

const title = (k: InvoiceKind) => (k === 'tax-invoice' ? 'TAX INVOICE' : k === 'bill-of-supply' ? 'BILL OF SUPPLY' : 'CREDIT NOTE');

function recipientOf(name: string, gstin: string, address: string, ctx: InvoiceContext, place: string) {
  const walkIn = !name || name === 'Walk-in';
  return {
    name: gstin && ctx.customer?.business ? ctx.customer.business : walkIn ? '' : name,
    address: address || ctx.customer?.address || '',
    gstin,
    phone: ctx.customer?.phone ?? '',
    state: place,
  };
}

export function invoiceFromBill(b: Bill, ctx: InvoiceContext): InvoiceData {
  const kind: InvoiceKind = isBillOfSupply(b.lines, b.totals, ctx.composition) ? 'bill-of-supply' : 'tax-invoice';
  const place = b.placeOfSupply ?? '';
  return {
    kind, title: title(kind), number: printNumber(b.number, ctx.numberFormat), at: b.at, supplier: ctx.supplier,
    recipient: recipientOf(b.customerName, b.customerGstin ?? '', b.customerAddress ?? '', ctx, place),
    place, inter: b.supplyType === 'inter', lines: b.lines, totals: b.totals, payments: b.payments, counter: b.counter,
    duplicate: ctx.duplicate, cancelled: b.status === 'cancelled', hsnSummary: hsnSummary(b.lines), words: amountInWords(b.totals.grand),
  };
}

const REFUND_BY: Record<string, string> = { cash: 'CASH', upi: 'UPI', credit_note: 'CREDIT NOTE', exchange: 'EXCHANGE CREDIT' };

export function invoiceFromCreditNote(n: CreditNote, ctx: InvoiceContext): InvoiceData {
  const place = n.placeOfSupply ?? '';
  return {
    kind: 'credit-note', title: 'CREDIT NOTE', number: n.number, at: n.at, supplier: ctx.supplier,
    against: { number: printNumber(n.billNumber, ctx.numberFormat), at: n.billAt ?? n.at }, reason: n.reason,
    recipient: recipientOf(n.customerName, n.customerGstin ?? '', n.customerAddress ?? '', ctx, place),
    place, inter: n.supplyType === 'inter', lines: n.lines, totals: n.totals, payments: [], refundBy: REFUND_BY[n.refundMode] ?? 'OTHER',
    duplicate: ctx.duplicate, hsnSummary: hsnSummary(n.lines), words: amountInWords(n.totals.grand),
  };
}

export const placeText = (code: string): string => (stateName(code) ? `${stateName(code)} (${code})` : code);

export const supplierFromSettings = (s: Settings, extra: { fssai?: string } = {}): SupplierInfo => ({ name: s.shopName, address: s.address, gstin: s.gstin, phone: s.phone, fssai: extra.fssai });
