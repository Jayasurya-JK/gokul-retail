import type { BillLine, BillTotals, GstSlab, Item, Milli, Paise } from './types';

/** Indian digit grouping on an integer string: 1234567 -> 12,34,567 */
export function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** 12345600 paise -> "1,23,456.00" (no symbol) */
export function formatPaise(paise: Paise, opts: { decimals?: boolean } = {}): string {
  const { decimals = true } = opts;
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  const s = groupIndian(String(rupees)) + (decimals ? `.${p}` : '');
  return neg ? `-${s}` : s;
}

export const formatRupees = (paise: Paise, opts?: { decimals?: boolean }) => `₹${formatPaise(paise, opts)}`;

/** milli-units -> "1.250" (decimal) or "3" (whole) */
export function formatQty(qty: Milli, decimal: boolean): string {
  if (!decimal) return String(Math.round(qty / 1000));
  return (qty / 1000).toFixed(3);
}

/** Parse "12.5" -> 1250 paise. Returns null for invalid input. */
export function parsePaise(s: string): Paise | null {
  const t = s.trim().replace(/[₹,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(t) || t === '' || t === '.') return null;
  const [r, p = ''] = t.split('.');
  return Number(r || '0') * 100 + Number(p.padEnd(2, '0'));
}

/** Parse "1.250" -> 1250 milli. Null for invalid. */
export function parseQty(s: string): Milli | null {
  const t = s.trim();
  if (!/^\d*\.?\d{0,3}$/.test(t) || t === '' || t === '.') return null;
  const [w, f = ''] = t.split('.');
  return Number(w || '0') * 1000 + Number(f.padEnd(3, '0'));
}

/** gross amount for rate (paise per unit) x qty (milli) */
export const lineGross = (rate: Paise, qty: Milli): Paise => Math.round((rate * qty) / 1000);

/** Prices are GST inclusive; amount is what the customer pays for the line. */
export function makeLine(item: Item, qty: Milli, discount: Paise = 0, rate: Paise = item.price): BillLine {
  const gross = lineGross(rate, qty);
  const d = Math.min(discount, gross);
  return {
    itemId: item.id, code: item.code, name: item.name, unit: item.unit,
    qty, rate, discount: d, gstRate: item.gstRate, amount: gross - d,
  };
}

export function recalcLine(l: BillLine): BillLine {
  const gross = lineGross(l.rate, l.qty);
  const d = Math.min(l.discount, gross);
  return { ...l, discount: d, amount: gross - d };
}

/**
 * Bill totals in integer paise. Bill-level discount is spread pro-rata over lines
 * (remainder to the last line) so GST slabs stay exact. Round-off to whole rupee.
 */
export function computeTotals(lines: BillLine[], billDiscount: Paise = 0, roundToRupee = true): BillTotals {
  const grossAll = lines.reduce((s, l) => s + lineGross(l.rate, l.qty), 0);
  const lineNet = lines.map((l) => l.amount);
  const netSum = lineNet.reduce((a, b) => a + b, 0);
  const bd = Math.min(billDiscount, netSum);
  let allocated = 0;
  const finals = lineNet.map((n, i) => {
    let share = netSum === 0 ? 0 : Math.floor((bd * n) / netSum);
    if (i === lineNet.length - 1) share = bd - allocated;
    allocated += share;
    return n - share;
  });
  const slabMap = new Map<number, { taxable: Paise; gst: Paise }>();
  lines.forEach((l, i) => {
    const fin = finals[i];
    const taxable = Math.round((fin * 100) / (100 + l.gstRate));
    const cur = slabMap.get(l.gstRate) ?? { taxable: 0, gst: 0 };
    cur.taxable += taxable;
    cur.gst += fin - taxable;
    slabMap.set(l.gstRate, cur);
  });
  const slabs: GstSlab[] = [...slabMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => {
      const cgst = Math.floor(v.gst / 2);
      return { rate, taxable: v.taxable, cgst, sgst: v.gst - cgst };
    });
  const beforeRound = finals.reduce((a, b) => a + b, 0);
  const grand = roundToRupee ? Math.round(beforeRound / 100) * 100 : beforeRound;
  const lineDisc = lines.reduce((s, l) => s + l.discount, 0);
  return {
    itemCount: lines.length,
    qtyCount: lines.reduce((s, l) => s + l.qty, 0),
    gross: grossAll,
    discount: lineDisc + bd,
    taxable: slabs.reduce((s, x) => s + x.taxable, 0),
    gst: slabs.reduce((s, x) => s + x.cgst + x.sgst, 0),
    slabs,
    beforeRound,
    roundOff: grand - beforeRound,
    grand,
  };
}

/**
 * One credit rule everywhere: a customer's credit limit is 0 (credit NOT allowed), above 0 (allowed up to that amount)
 * or NO_CREDIT_LIMIT (-1, "no limit", only when the owner chooses it).
 */
export const NO_CREDIT_LIMIT = -1;
export const creditAllowed = (limit: Paise) => limit !== 0;
export const creditUnlimited = (limit: Paise) => limit < 0;
/** What a customer can still take on credit; null when there is no limit, 0 when credit is not allowed. */
export const creditLeft = (c: { creditLimit: Paise; outstanding: Paise }): Paise | null =>
  c.creditLimit < 0 ? null : c.creditLimit === 0 ? 0 : Math.max(0, c.creditLimit - c.outstanding);
