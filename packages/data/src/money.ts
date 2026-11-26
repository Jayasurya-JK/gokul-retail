import type { BillLine, BillTotals, GstSlab, Item, LineTax, Milli, Paise } from './types';

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
    qty, rate, discount: d, gstRate: item.gstRate, ...(item.cessRate ? { cessRate: item.cessRate } : {}), amount: gross - d,
  };
}

export function recalcLine(l: BillLine): BillLine {
  const gross = lineGross(l.rate, l.qty);
  const d = Math.min(l.discount, gross);
  return { ...l, discount: d, amount: gross - d };
}

/** A percent rate (5, 0.25, 12.5) as hundredths of a percent (500, 25, 1250): the integer all tax maths uses. */
export const rateBp = (r: number): number => Math.round(r * 100);

/**
 * Split GST-inclusive line amounts into taxable value, GST and cess, and add them up per GST rate. Same as Rust `split_taxes`.
 * taxable = amount x 10000 / (10000 + rate bp + cess bp); cess = taxable x cess bp / 10000; GST is what is left, so the three
 * always add back to the amount. Intra-state: CGST = SGST = half (odd paisa to SGST); inter-state: IGST = all of it.
 * The odd-paisa split runs on the running total of each rate, so the lines of a rate add up to exactly the slab.
 */
export function splitTaxes(lines: { rate: number; cessRate: number; fin: Paise }[], inter: boolean): { taxes: LineTax[]; slabs: GstSlab[] } {
  const cum = new Map<number, number>();
  const slabMap = new Map<number, GstSlab>();
  const taxes = lines.map(({ rate, cessRate, fin }) => {
    const rb = rateBp(rate);
    const cb = rateBp(cessRate);
    const taxable = Math.round((fin * 10000) / (10000 + rb + cb));
    const cess = cb === 0 ? 0 : Math.round((taxable * cb) / 10000);
    const gst = fin - taxable - cess;
    const before = cum.get(rb) ?? 0;
    const after = before + gst;
    cum.set(rb, after);
    let cgst = 0, sgst = 0, igst = 0;
    if (inter) igst = gst;
    else { cgst = Math.floor(after / 2) - Math.floor(before / 2); sgst = gst - cgst; }
    const slab = slabMap.get(rb) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    slab.taxable += taxable; slab.cgst += cgst; slab.sgst += sgst; slab.igst += igst; slab.cess += cess;
    slabMap.set(rb, slab);
    return { taxable, cgst, sgst, igst, cess };
  });
  return { taxes, slabs: [...slabMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v) };
}

/** A home-delivery charge on a bill: amount (GST inclusive) and its GST / cess percent. */
export interface DeliveryCharge { amount: Paise; gstRate: number; cessRate?: number }

/**
 * The whole bill: totals plus the tax split of every line (item lines in order, then the delivery charge when there is one).
 * Bill-level discount is spread pro-rata over the item lines (remainder to the last) so GST slabs stay exact.
 * Round-off to whole rupee. `inter` = inter-state supply (IGST instead of CGST + SGST). Same as Rust `compute_bill`.
 */
export function computeBill(lines: BillLine[], billDiscount: Paise = 0, roundToRupee = true, inter = false, delivery?: DeliveryCharge): { totals: BillTotals; taxes: LineTax[] } {
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
  const inputs = lines.map((l, i) => ({ rate: l.gstRate, cessRate: l.cessRate ?? 0, fin: finals[i] }));
  const dAmt = delivery && delivery.amount > 0 ? delivery.amount : 0;
  if (delivery && dAmt > 0) inputs.push({ rate: delivery.gstRate, cessRate: delivery.cessRate ?? 0, fin: dAmt });
  const { taxes, slabs } = splitTaxes(inputs, inter);
  const beforeRound = finals.reduce((a, b) => a + b, 0) + dAmt;
  const grand = roundToRupee ? Math.round(beforeRound / 100) * 100 : beforeRound;
  const lineDisc = lines.reduce((s, l) => s + l.discount, 0);
  const totals: BillTotals = {
    itemCount: lines.length,
    qtyCount: lines.reduce((s, l) => s + l.qty, 0),
    gross: grossAll + dAmt,
    discount: lineDisc + bd,
    taxable: slabs.reduce((s, x) => s + x.taxable, 0),
    gst: slabs.reduce((s, x) => s + x.cgst + x.sgst + x.igst, 0),
    cess: slabs.reduce((s, x) => s + x.cess, 0),
    slabs,
    beforeRound,
    roundOff: grand - beforeRound,
    grand,
  };
  return { totals, taxes };
}

/** Intra-state bill totals without delivery (see computeBill). */
export function computeTotals(lines: BillLine[], billDiscount: Paise = 0, roundToRupee = true, inter = false): BillTotals {
  return computeBill(lines, billDiscount, roundToRupee, inter).totals;
}

/** Cash discount in paise: bps (percent x 100) of the item lines' net, rounded. Same as the Rust `cash_discount`. */
export function cashDiscount(lines: BillLine[], bps: number): Paise {
  if (!(bps > 0)) return 0;
  return Math.round((lines.reduce((s, l) => s + l.amount, 0) * bps) / 10000);
}

/**
 * Totals for item lines plus an optional home-delivery charge (a separate taxable amount at `deliveryGst` percent). The bill
 * discount is spread over the item lines only. With no delivery charge this is exactly `computeTotals`. Same as the Rust side.
 */
export function computeTotalsWithDelivery(lines: BillLine[], billDiscount: Paise, roundToRupee: boolean, delivery: Paise, deliveryGst: number, inter = false): BillTotals {
  return computeBill(lines, billDiscount, roundToRupee, inter, delivery > 0 ? { amount: delivery, gstRate: deliveryGst } : undefined).totals;
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

/* ---------- counter discount boxes and points on the bill panel ---------- */

/** Whole-bill discount box: percent only. Returns paise off `net`, or null when the text is not a percent from 0 to 100. */
export function percentDiscount(net: Paise, typed: string): Paise | null {
  const t = typed.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const pct = Number(t);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Math.round((net * pct) / 100);
}

/**
 * Cash discount box: rupees only. The bill keeps it as percent x 100 (bps) of the item lines, so this finds the bps whose
 * rupee result is nearest the typed amount (exact to the paise on normal bills). Capped at the whole bill.
 */
export function cashDiscBpsForRupees(lines: BillLine[], amount: Paise): number {
  const net = lines.reduce((s, l) => s + l.amount, 0);
  if (net <= 0 || !(amount > 0)) return 0;
  if (amount >= net) return 10000;
  const guess = Math.round((amount * 10000) / net);
  let best = guess;
  let bestErr = Infinity;
  for (let b = Math.max(0, guess - 3); b <= Math.min(10000, guess + 3); b++) {
    const err = Math.abs(cashDiscount(lines, b) - amount);
    if (err < bestErr) { best = b; bestErr = err; }
  }
  return best;
}

export interface PointsRules { enabled: boolean; pointValue: Paise; minRedeem: number; maxPct: number }

/**
 * What points can pay on one bill, in whole points. `billTotal` is the bill's grand total (the max-percent rule is on that);
 * `payable` is what is still unpaid after credit and other points. Same checks as loyalty::redeem_for_bill in Rust.
 */
export function pointsLimit(rules: PointsRules | undefined, balance: number, billTotal: Paise, payable: Paise): { maxPoints: number; worth: Paise } {
  if (!rules || !rules.enabled || !(rules.pointValue > 0) || balance <= 0) return { maxPoints: 0, worth: 0 };
  const pv = rules.pointValue;
  const byBalance = Math.floor(balance + 1e-9);
  const byPct = Math.floor(Math.floor((billTotal * rules.maxPct) / 100) / pv);
  const byBill = Math.floor(Math.max(0, payable) / pv);
  const maxPoints = Math.max(0, Math.min(byBalance, byPct, byBill));
  return { maxPoints, worth: maxPoints * pv };
}

/** Checks points typed on the panel. Returns whole points to use, or a plain-words reason why not. */
export function checkPointsTyped(typed: string, rules: PointsRules | undefined, balance: number, billTotal: Paise, payable: Paise): { points: number } | { error: string } {
  if (!rules || !rules.enabled) return { error: 'Loyalty points are switched off.' };
  const t = typed.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: 'Type the number of points, like 200.' };
  const pts = Number(t);
  if (!Number.isInteger(pts)) return { error: 'Use whole points, like 200.' };
  if (pts <= 0) return { error: 'Type the number of points, like 200.' };
  if (pts < rules.minRedeem) return { error: `Below the minimum: at least ${rules.minRedeem} points are needed.` };
  if (pts > Math.floor(balance + 1e-9)) return { error: `More than the balance: the customer has only ${Math.floor(balance + 1e-9)} points.` };
  const byPct = Math.floor(Math.floor((billTotal * rules.maxPct) / 100) / rules.pointValue);
  if (pts > byPct) return { error: `More than ${rules.maxPct}% of the bill: at most ${byPct} points can be used on this bill.` };
  const { maxPoints } = pointsLimit(rules, balance, billTotal, payable);
  if (pts > maxPoints) return { error: `More than the bill needs: at most ${maxPoints} points can be used now.` };
  return { points: pts };
}
