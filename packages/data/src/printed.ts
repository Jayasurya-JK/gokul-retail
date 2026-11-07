import type { Payment } from './types';
import type { BillFormatSettings, SettingsBundle } from './areas/crm';

/** The bill number as printed: "26/00123" from the internal "GK-26-000123" (or the internal one when the shop chose 'raw'). */
export function printNumber(number: string, format: 'yy/nnnnn' | 'raw' = 'yy/nnnnn'): string {
  if (format === 'raw') return number;
  const m = number.match(/-(\d{2})-(\d+)$/);
  return m ? `${m[1]}/${m[2].padStart(5, '0')}` : number;
}

/** "Cash Bill", "BHARATQR Bill" ...: the heading the shop chose for the payment mode that paid most of the bill. */
export function billTitleFor(payments: Payment[], f: BillFormatSettings): string {
  const top = [...payments].sort((a, b) => b.amount - a.amount)[0];
  const mode = !top ? 'cash' : top.mode === 'credit_note' ? 'other' : top.mode;
  switch (mode) {
    case 'cash': return f.titleCash || 'Cash Bill';
    case 'upi': return f.titleUpi || 'BHARATQR Bill';
    case 'card': return f.titleCard || 'Card Bill';
    case 'credit': return f.titleCredit || 'Credit Bill';
    default: return f.titleOther || 'Bill';
  }
}

/** What the bill preview needs from Settings besides the basics. */
export interface ReceiptConfig {
  tagline: string;
  whatsapp: string;
  footerTamil: string;
  mobile: string;
  billFormat: BillFormatSettings;
}
export const receiptConfigFrom = (b: SettingsBundle): ReceiptConfig => ({
  tagline: b.shop.tagline, whatsapp: b.shop.whatsapp, footerTamil: b.billFormat.footerTamil, mobile: b.shop.phone, billFormat: b.billFormat,
});

/** Points are always shown with two decimals and Indian digit grouping: 4.6 -> "4.60", 78.56 -> "78.56", 116383.98 -> "1,16,383.98". */
export const formatPoints = (p: number): string => (Math.round((Number.isFinite(p) ? p : 0) * 100) / 100 || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Points as stored by the database (hundredths of a point) shown as points: 7856 -> "78.56". */
export const formatPointsHundredths = (h: number): string => formatPoints(Math.round(h) / 100);
