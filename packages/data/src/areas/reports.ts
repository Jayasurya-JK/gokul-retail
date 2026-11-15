import type { MockStore } from './store';
import { mockExpensesReport, mockVoidedLinesReport } from './expenses';
import type { Bill, BillLine, Item, Paise, PayMode, UnitCode } from '../types';
import { setOff } from '../gst';

// Area: Office reports: sales, item-wise, GST (GSTR-1, 3B, HSN), stock, profit, day-wise cash.
// Every report returns the same generic shape (KPIs + optional chart + columns/rows/totals) so the
// workspace UI renders them all with one table component. Money is integer paise, qty is milli-units.

export type ReportId =
  | 'daily-summary' | 'bill-wise' | 'item-wise' | 'category-wise' | 'cashier-wise' | 'payment-mode' | 'hourly-heatmap'
  | 'gstr1' | 'gstr3b' | 'hsn-wise' | 'tax-rate'
  | 'stock-summary' | 'stock-valuation' | 'stock-movement' | 'low-dead'
  | 'item-margin' | 'daily-profit'
  | 'cash-book' | 'day-close'
  | 'yield'
  | 'expenses' | 'voided-lines';

export interface ReportParams {
  /** inclusive, YYYY-MM-DD (local) */
  from: string;
  to: string;
  categoryId?: string;
  cashier?: string;
  mode?: PayMode;
}

export type ReportColKind = 'text' | 'date' | 'int' | 'money' | 'qty' | 'pct' | 'dec1' | 'badge';
export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportColKind;
  /** CSS grid track, default 1fr */
  w?: string;
  /** For kind 'qty': row key that holds the unit label */
  unitKey?: string;
}
export type ReportRow = { [key: string]: string | number | undefined; _style?: 'head' | 'strong' | 'muted' };

export interface ReportKpi {
  label: string;
  kind: 'money' | 'int' | 'pct' | 'text' | 'dec1';
  value: number | string;
  hint?: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'primary';
}

export type ReportChart =
  | { kind: 'area' | 'bars'; title: string; money: boolean; points: { label: string; value: number }[] }
  | { kind: 'split'; title: string; parts: { label: string; value: number }[] }
  | { kind: 'heat'; title: string; cols: string[]; rows: string[]; cells: number[][] };

export interface ReportResult {
  id: ReportId;
  title: string;
  /** One line under the title, e.g. "Intra-state supplies only" */
  note?: string;
  kpis: ReportKpi[];
  chart?: ReportChart;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Footer totals row (same keys as rows) */
  totals?: ReportRow;
}

export interface ReportsApi {
  runReport(id: ReportId, params: ReportParams): Promise<ReportResult>;
}

/* ------------------------------------------------------------------ helpers */

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pctOf = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const taxableOf = (amount: Paise, rate: number) => Math.round((amount * 10000) / (10000 + Math.round(rate * 100)));

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end && out.length < 400) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
  return out;
}

const UQC: Record<UnitCode, string> = { kg: 'KGS', g: 'GMS', l: 'LTR', ml: 'MLT', pc: 'PCS', tin: 'NOS', btl: 'BTL', pkt: 'PAC' };
const UNIT_LABEL: Record<UnitCode, string> = { kg: 'kg', g: 'g', l: 'L', ml: 'ml', pc: 'pc', tin: 'tin', btl: 'btl', pkt: 'pkt' };
const MODE_LABEL: Record<PayMode, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit', credit_note: 'Credit note', points: 'Points', sodexo: 'Sodexo' };
const hourLabel = (h: number) => `${pad(h)}:00`;

interface Ctx { store: MockStore; p: ReportParams; items: Map<string, Item>; bills: Bill[] }
interface LineFact { bill: Bill; line: BillLine; item: Item | undefined; taxable: Paise; tax: Paise; cost: Paise }

function context(store: MockStore, p: ReportParams): Ctx {
  const bills = store.bills.filter((b) => {
    if (b.status === 'cancelled') return false;
    const k = dayKey(b.at);
    if (k < p.from || k > p.to) return false;
    if (p.cashier && b.cashier !== p.cashier) return false;
    if (p.mode && !b.payments.some((x) => x.mode === p.mode)) return false;
    return true;
  });
  return { store, p, items: new Map(store.items.map((i) => [i.id, i])), bills };
}

function lineFacts(c: Ctx): LineFact[] {
  const out: LineFact[] = [];
  for (const bill of c.bills) {
    for (const line of bill.lines) {
      const item = c.items.get(line.itemId);
      if (c.p.categoryId && item?.categoryId !== c.p.categoryId) continue;
      const taxable = taxableOf(line.amount, line.gstRate);
      const unitCost = item ? taxableOf(item.cost, line.gstRate) : 0;
      out.push({ bill, line, item, taxable, tax: line.amount - taxable, cost: Math.round((unitCost * line.qty) / 1000) });
    }
  }
  return out;
}

const timeText = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const rangeNote = (p: ReportParams) => (p.from === p.to ? p.from : `${p.from} to ${p.to}`);

/* ------------------------------------------------------------------ reports */

function dailySummary(c: Ctx): ReportResult {
  const days = daysBetween(c.p.from, c.p.to);
  const rows: ReportRow[] = days.map((date) => {
    const bs = c.bills.filter((b) => dayKey(b.at) === date);
    const net = sum(bs.map((b) => b.totals.grand));
    return {
      date, bills: bs.length, lines: sum(bs.map((b) => b.totals.itemCount)),
      gross: sum(bs.map((b) => b.totals.gross)), discount: sum(bs.map((b) => b.totals.discount)),
      taxable: sum(bs.map((b) => b.totals.taxable)), gst: sum(bs.map((b) => b.totals.gst)),
      roundOff: sum(bs.map((b) => b.totals.roundOff)), net, avg: bs.length ? Math.round(net / bs.length) : 0,
    };
  });
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  const net = t('net'); const bills = t('bills');
  return {
    id: 'daily-summary', title: 'Daily sales summary', note: `${days.length} days, all counters`,
    kpis: [
      { label: 'Net sales', kind: 'money', value: net, hint: `${days.length} days`, tone: 'primary' },
      { label: 'Bills', kind: 'int', value: bills, hint: `${(bills / Math.max(1, days.length)).toFixed(0)} per day` },
      { label: 'Average bill', kind: 'money', value: bills ? Math.round(net / bills) : 0 },
      { label: 'GST collected', kind: 'money', value: t('gst'), hint: 'included in net sales' },
      { label: 'Discount given', kind: 'money', value: t('discount'), tone: 'warning' },
    ],
    chart: { kind: 'area', title: 'Net sales per day', money: true, points: rows.map((r) => ({ label: String(r.date), value: Number(r.net) })) },
    columns: [
      { key: 'date', label: 'Date', kind: 'date', w: '1.1fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.6fr' },
      { key: 'lines', label: 'Lines', kind: 'int', w: '0.6fr' }, { key: 'gross', label: 'Gross', kind: 'money' },
      { key: 'discount', label: 'Discount', kind: 'money' }, { key: 'taxable', label: 'Taxable', kind: 'money' },
      { key: 'gst', label: 'GST', kind: 'money' }, { key: 'roundOff', label: 'Round off', kind: 'money', w: '1fr' },
      { key: 'net', label: 'Net sales', kind: 'money', w: '1.1fr' }, { key: 'avg', label: 'Avg bill', kind: 'money', w: '0.9fr' },
    ],
    rows: [...rows].reverse(),
    totals: { date: 'Total', bills, lines: t('lines'), gross: t('gross'), discount: t('discount'), taxable: t('taxable'), gst: t('gst'), roundOff: t('roundOff'), net, avg: bills ? Math.round(net / bills) : 0 },
  };
}

function billWise(c: Ctx): ReportResult {
  const rows: ReportRow[] = [...c.bills].reverse().map((b) => ({
    id: b.id, number: b.number, date: dayKey(b.at), time: timeText(b.at), cashier: b.cashier, customer: b.customerName,
    lines: b.totals.itemCount, mode: b.payments.length > 1 ? 'Split' : MODE_LABEL[b.payments[0].mode],
    gst: b.totals.gst, discount: b.totals.discount, amount: b.totals.grand,
  }));
  const net = sum(rows.map((r) => Number(r.amount)));
  return {
    id: 'bill-wise', title: 'Bill-wise sales', note: `${rows.length} bills, newest first`,
    kpis: [
      { label: 'Bills', kind: 'int', value: rows.length, tone: 'primary' },
      { label: 'Net sales', kind: 'money', value: net },
      { label: 'Average bill', kind: 'money', value: rows.length ? Math.round(net / rows.length) : 0 },
      { label: 'Largest bill', kind: 'money', value: Math.max(0, ...rows.map((r) => Number(r.amount))) },
      { label: 'Credit bills', kind: 'int', value: c.bills.filter((b) => b.status === 'credit').length, tone: 'warning' },
    ],
    columns: [
      { key: 'number', label: 'Bill no', kind: 'text', w: '1.2fr' }, { key: 'date', label: 'Date', kind: 'date', w: '1fr' },
      { key: 'time', label: 'Time', kind: 'text', w: '0.6fr' }, { key: 'cashier', label: 'Cashier', kind: 'text', w: '1.1fr' },
      { key: 'customer', label: 'Customer', kind: 'text', w: '1.4fr' }, { key: 'lines', label: 'Lines', kind: 'int', w: '0.6fr' },
      { key: 'mode', label: 'Paid by', kind: 'text', w: '0.7fr' }, { key: 'discount', label: 'Discount', kind: 'money', w: '0.8fr' },
      { key: 'gst', label: 'GST', kind: 'money', w: '0.8fr' }, { key: 'amount', label: 'Amount', kind: 'money', w: '1fr' },
    ],
    rows,
    totals: { number: 'Total', lines: sum(rows.map((r) => Number(r.lines))), discount: sum(rows.map((r) => Number(r.discount))), gst: sum(rows.map((r) => Number(r.gst))), amount: net },
  };
}

function itemWise(c: Ctx): ReportResult {
  const agg = new Map<string, { item?: Item; name: string; unit: UnitCode; qty: number; amount: number; bills: Set<string> }>();
  for (const f of lineFacts(c)) {
    const cur = agg.get(f.line.itemId) ?? { item: f.item, name: f.line.name, unit: f.line.unit, qty: 0, amount: 0, bills: new Set<string>() };
    cur.qty += f.line.qty; cur.amount += f.line.amount; cur.bills.add(f.bill.id);
    agg.set(f.line.itemId, cur);
  }
  const list = [...agg.values()].sort((a, b) => b.amount - a.amount);
  const total = sum(list.map((x) => x.amount));
  const rows: ReportRow[] = list.map((x, i) => ({
    rank: i + 1, name: x.name, category: x.item?.category ?? '-', qty: x.qty, unit: UNIT_LABEL[x.unit],
    bills: x.bills.size, avgRate: x.qty ? Math.round((x.amount * 1000) / x.qty) : 0, amount: x.amount, share: pctOf(x.amount, total),
  }));
  return {
    id: 'item-wise', title: 'Item-wise sales', note: 'Sorted by sales value',
    kpis: [
      { label: 'Sales value', kind: 'money', value: total, tone: 'primary' },
      { label: 'Items sold', kind: 'int', value: list.length, hint: 'distinct items' },
      { label: 'Top item', kind: 'text', value: list[0]?.name ?? '-', hint: list[0] ? `${pctOf(list[0].amount, total).toFixed(1)}% of sales` : undefined },
      { label: 'Top 5 share', kind: 'pct', value: pctOf(sum(list.slice(0, 5).map((x) => x.amount)), total), hint: 'of total sales' },
    ],
    chart: { kind: 'bars', title: 'Top 8 items by sales', money: true, points: list.slice(0, 8).map((x) => ({ label: x.name, value: x.amount })) },
    columns: [
      { key: 'rank', label: '#', kind: 'int', w: '0.3fr' }, { key: 'name', label: 'Item', kind: 'text', w: '2.2fr' },
      { key: 'category', label: 'Category', kind: 'text', w: '1.4fr' }, { key: 'qty', label: 'Qty sold', kind: 'qty', unitKey: 'unit', w: '1fr' },
      { key: 'bills', label: 'Bills', kind: 'int', w: '0.6fr' }, { key: 'avgRate', label: 'Avg rate', kind: 'money', w: '0.9fr' },
      { key: 'amount', label: 'Sales', kind: 'money', w: '1.1fr' }, { key: 'share', label: 'Share', kind: 'pct', w: '0.7fr' },
    ],
    rows,
    totals: { name: 'Total', bills: sum(rows.map((r) => Number(r.bills))), amount: total, share: total ? 100 : 0 },
  };
}

function categoryWise(c: Ctx): ReportResult {
  const agg = new Map<string, { name: string; items: Set<string>; bills: Set<string>; taxable: number; tax: number; amount: number }>();
  for (const f of lineFacts(c)) {
    const key = f.item?.categoryId ?? '-';
    const cur = agg.get(key) ?? { name: f.item?.category ?? 'Other', items: new Set(), bills: new Set(), taxable: 0, tax: 0, amount: 0 };
    cur.items.add(f.line.itemId); cur.bills.add(f.bill.id); cur.taxable += f.taxable; cur.tax += f.tax; cur.amount += f.line.amount;
    agg.set(key, cur);
  }
  const list = [...agg.values()].sort((a, b) => b.amount - a.amount);
  const total = sum(list.map((x) => x.amount));
  const rows: ReportRow[] = list.map((x) => ({ name: x.name, items: x.items.size, bills: x.bills.size, taxable: x.taxable, tax: x.tax, amount: x.amount, share: pctOf(x.amount, total) }));
  return {
    id: 'category-wise', title: 'Category-wise sales',
    kpis: [
      { label: 'Sales value', kind: 'money', value: total, tone: 'primary' },
      { label: 'Categories sold', kind: 'int', value: list.length },
      { label: 'Top category', kind: 'text', value: list[0]?.name ?? '-', hint: list[0] ? `${pctOf(list[0].amount, total).toFixed(1)}% of sales` : undefined },
      { label: 'GST in sales', kind: 'money', value: sum(list.map((x) => x.tax)) },
    ],
    chart: { kind: 'bars', title: 'Sales by category', money: true, points: list.map((x) => ({ label: x.name, value: x.amount })) },
    columns: [
      { key: 'name', label: 'Category', kind: 'text', w: '2fr' }, { key: 'items', label: 'Items', kind: 'int', w: '0.7fr' },
      { key: 'bills', label: 'Bills', kind: 'int', w: '0.7fr' }, { key: 'taxable', label: 'Taxable', kind: 'money' },
      { key: 'tax', label: 'GST', kind: 'money' }, { key: 'amount', label: 'Sales', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct', w: '0.7fr' },
    ],
    rows,
    totals: { name: 'Total', taxable: sum(rows.map((r) => Number(r.taxable))), tax: sum(rows.map((r) => Number(r.tax))), amount: total, share: total ? 100 : 0 },
  };
}

function cashierWise(c: Ctx): ReportResult {
  const names = [...new Set(c.bills.map((b) => b.cashier))].sort();
  const rows: ReportRow[] = names.map((name) => {
    const bs = c.bills.filter((b) => b.cashier === name);
    const mode = (m: PayMode) => sum(bs.flatMap((b) => b.payments).filter((p) => p.mode === m).map((p) => p.amount));
    const total = sum(bs.map((b) => b.totals.grand));
    return { name, bills: bs.length, avg: bs.length ? Math.round(total / bs.length) : 0, discount: sum(bs.map((b) => b.totals.discount)), cash: mode('cash'), upi: mode('upi'), card: mode('card'), credit: mode('credit'), total };
  }).sort((a, b) => Number(b.total) - Number(a.total));
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  return {
    id: 'cashier-wise', title: 'Cashier-wise sales',
    kpis: [
      { label: 'Net sales', kind: 'money', value: t('total'), tone: 'primary' },
      { label: 'Cashiers', kind: 'int', value: rows.length },
      { label: 'Top cashier', kind: 'text', value: String(rows[0]?.name ?? '-'), hint: rows[0] ? `${rows[0].bills} bills` : undefined },
      { label: 'Discounts given', kind: 'money', value: t('discount'), tone: 'warning' },
    ],
    chart: { kind: 'bars', title: 'Sales by cashier', money: true, points: rows.map((r) => ({ label: String(r.name), value: Number(r.total) })) },
    columns: [
      { key: 'name', label: 'Cashier', kind: 'text', w: '1.6fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.6fr' },
      { key: 'avg', label: 'Avg bill', kind: 'money', w: '0.9fr' }, { key: 'discount', label: 'Discount', kind: 'money', w: '0.9fr' },
      { key: 'cash', label: 'Cash', kind: 'money' }, { key: 'upi', label: 'UPI', kind: 'money' }, { key: 'card', label: 'Card', kind: 'money', w: '0.9fr' },
      { key: 'credit', label: 'Credit', kind: 'money', w: '0.9fr' }, { key: 'total', label: 'Total', kind: 'money', w: '1.1fr' },
    ],
    rows,
    totals: { name: 'Total', bills: t('bills'), discount: t('discount'), cash: t('cash'), upi: t('upi'), card: t('card'), credit: t('credit'), total: t('total') },
  };
}

function paymentMode(c: Ctx): ReportResult {
  const modes: PayMode[] = ['cash', 'upi', 'card', 'credit'];
  const pays = c.bills.flatMap((b) => b.payments.map((p) => ({ ...p, bill: b.id })));
  const total = sum(pays.map((p) => p.amount));
  const rows: ReportRow[] = modes.map((m) => {
    const ps = pays.filter((p) => p.mode === m);
    const amount = sum(ps.map((p) => p.amount));
    return { name: MODE_LABEL[m], bills: new Set(ps.map((p) => p.bill)).size, avg: ps.length ? Math.round(amount / ps.length) : 0, amount, share: pctOf(amount, total) };
  });
  const digital = rows[1].amount as number + (rows[2].amount as number);
  return {
    id: 'payment-mode', title: 'Payment-mode summary',
    kpis: [
      { label: 'Collected', kind: 'money', value: total - (rows[3].amount as number), hint: 'cash + UPI + card', tone: 'primary' },
      { label: 'Cash', kind: 'money', value: rows[0].amount as number, hint: `${(rows[0].share as number).toFixed(1)}% of sales`, tone: 'success' },
      { label: 'Digital (UPI + card)', kind: 'money', value: digital, hint: `${pctOf(digital, total).toFixed(1)}% of sales`, tone: 'info' },
      { label: 'On credit', kind: 'money', value: rows[3].amount as number, hint: 'to be collected', tone: 'warning' },
    ],
    chart: { kind: 'split', title: 'How customers paid', parts: rows.map((r) => ({ label: String(r.name), value: Number(r.amount) })) },
    columns: [
      { key: 'name', label: 'Payment mode', kind: 'text', w: '2fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.8fr' },
      { key: 'avg', label: 'Avg payment', kind: 'money' }, { key: 'amount', label: 'Amount', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct', w: '0.8fr' },
    ],
    rows,
    totals: { name: 'Total', bills: c.bills.length, amount: total, share: total ? 100 : 0 },
  };
}

function hourlyHeatmap(c: Ctx): ReportResult {
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i); // 08:00 .. 21:00
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dowName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = dowOrder.map(() => hours.map(() => 0));
  const hourBills = hours.map(() => 0);
  const hourSales = hours.map(() => 0);
  for (const b of c.bills) {
    const d = new Date(b.at);
    const hi = Math.min(hours.length - 1, Math.max(0, d.getHours() - 8));
    cells[dowOrder.indexOf(d.getDay())][hi] += b.totals.grand;
    hourBills[hi] += 1; hourSales[hi] += b.totals.grand;
  }
  const total = sum(hourSales);
  const rows: ReportRow[] = hours.map((h, i) => ({
    hour: `${hourLabel(h)} - ${hourLabel(h + 1)}`, bills: hourBills[i], avg: hourBills[i] ? Math.round(hourSales[i] / hourBills[i]) : 0, amount: hourSales[i], share: pctOf(hourSales[i], total),
  }));
  const peak = hourSales.indexOf(Math.max(...hourSales));
  const dowTotals = cells.map((r) => sum(r));
  const busiest = dowTotals.indexOf(Math.max(...dowTotals));
  return {
    id: 'hourly-heatmap', title: 'Hourly sales heatmap', note: 'Sales value by weekday and hour',
    kpis: [
      { label: 'Peak hour', kind: 'text', value: total ? hourLabel(hours[peak]) : '-', hint: total ? `${hourBills[peak]} bills, ${pctOf(hourSales[peak], total).toFixed(1)}% of sales` : undefined, tone: 'primary' },
      { label: 'Busiest weekday', kind: 'text', value: total ? dowName[dowOrder[busiest]] : '-', hint: total ? `${pctOf(dowTotals[busiest], total).toFixed(1)}% of sales` : undefined },
      { label: 'Bills per hour', kind: 'dec1', value: c.bills.length / hours.length, hint: 'average, 08:00 to 22:00' },
      { label: 'Quietest hour', kind: 'text', value: total ? hourLabel(hours[hourSales.indexOf(Math.min(...hourSales))]) : '-', hint: 'good time for stock work' },
    ],
    chart: { kind: 'heat', title: 'Sales value, weekday by hour', cols: hours.map((h) => pad(h)), rows: dowOrder.map((d) => dowName[d]), cells },
    columns: [
      { key: 'hour', label: 'Hour', kind: 'text', w: '1.6fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.7fr' },
      { key: 'avg', label: 'Avg bill', kind: 'money' }, { key: 'amount', label: 'Sales', kind: 'money' }, { key: 'share', label: 'Share', kind: 'pct', w: '0.7fr' },
    ],
    rows,
    totals: { hour: 'Total', bills: c.bills.length, amount: total, share: total ? 100 : 0 },
  };
}

/* ------------------------------------------------------------------ GST */

/** A bill is B2B when it carries a valid GSTIN (the one the customer had when the bill was written), same as the Rust report. */
const isB2B = (b: Bill) => !!b.customerGstin;

/** Credit notes dated in the period, with their slabs added up. */
function creditNoteSums(c: Ctx) {
  const notes = (c.store.creditNotes ?? []).filter((n) => { const k = dayKey(n.at); return k >= c.p.from && k <= c.p.to; });
  const sl = notes.flatMap((n) => n.totals.slabs);
  return {
    count: notes.length, taxable: sum(sl.map((s) => s.taxable)), cgst: sum(sl.map((s) => s.cgst)), sgst: sum(sl.map((s) => s.sgst)),
    igst: sum(sl.map((s) => s.igst ?? 0)), cess: sum(sl.map((s) => s.cess ?? 0)),
  };
}

function gstr1(c: Ctx): ReportResult {
  interface Acc { bills: Set<string>; taxable: number; cgst: number; sgst: number; igst: number; cess: number }
  const mk = (): Map<number, Acc> => new Map();
  const b2b = mk(); const b2c = mk();
  for (const b of c.bills) {
    const target = isB2B(b) ? b2b : b2c;
    for (const s of b.totals.slabs) {
      const cur = target.get(s.rate) ?? { bills: new Set(), taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      cur.bills.add(b.id); cur.taxable += s.taxable; cur.cgst += s.cgst; cur.sgst += s.sgst; cur.igst += s.igst ?? 0; cur.cess += s.cess ?? 0;
      target.set(s.rate, cur);
    }
  }
  const rows: ReportRow[] = [];
  const tot = { invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
  const section = (ref: string, title: string, m: Map<number, Acc>, bills: Bill[]) => {
    rows.push({ _style: 'head', ref, desc: title });
    const rates = [...m.keys()].sort((a, b) => a - b);
    if (!rates.length) rows.push({ ref: '', desc: 'No supplies in this period', _style: 'muted' });
    for (const r of rates) {
      const a = m.get(r)!;
      rows.push({
        ref: '', desc: r === 0 ? 'Nil rated / exempt (0%)' : `Taxable supplies @ ${r}%`, invoices: a.bills.size, taxable: a.taxable,
        cgst: a.cgst, sgst: a.sgst, igst: a.igst, cess: a.cess, tax: a.cgst + a.sgst + a.igst, value: a.taxable + a.cgst + a.sgst + a.igst + a.cess,
      });
      tot.taxable += a.taxable; tot.cgst += a.cgst; tot.sgst += a.sgst; tot.igst += a.igst; tot.cess += a.cess;
    }
    tot.invoices += bills.length;
  };
  const b2bBills = c.bills.filter(isB2B);
  const b2cBills = c.bills.filter((b) => !isB2B(b));
  section('4A', 'B2B - registered customers', b2b, b2bBills);
  rows.push({ _style: 'head', ref: '5', desc: 'B2C Large - inter-state above Rs 2.5 lakh (see the GSTR-1 export)' });
  rows.push({ ref: '', desc: 'Listed invoice by invoice in the GSTR-1 export', _style: 'muted' });
  section('7', 'B2C - unregistered customers', b2c, b2cBills);
  const cn = creditNoteSums(c);
  rows.push({ _style: 'head', ref: '9B', desc: 'Credit / debit notes' });
  rows.push(cn.count
    ? { ref: '', desc: 'Sales returns (credit notes)', invoices: cn.count, taxable: cn.taxable, cgst: cn.cgst, sgst: cn.sgst, igst: cn.igst, cess: cn.cess, tax: cn.cgst + cn.sgst + cn.igst, value: cn.taxable + cn.cgst + cn.sgst + cn.igst + cn.cess }
    : { ref: '', desc: 'No credit notes in this period', invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0, value: 0, _style: 'muted' });
  const b2bTaxable = sum([...b2b.values()].map((a) => a.taxable));
  const b2cTaxable = sum([...b2c.values()].map((a) => a.taxable));
  return {
    id: 'gstr1', title: 'GSTR-1 summary', note: "Outward supplies: CGST + SGST within the shop's state, IGST to other states. Totals are sales; credit notes are shown in 9B.",
    kpis: [
      { label: 'Taxable value', kind: 'money', value: tot.taxable, tone: 'primary' },
      { label: 'Total GST', kind: 'money', value: tot.cgst + tot.sgst + tot.igst, hint: 'CGST + SGST + IGST' },
      { label: 'B2B invoices', kind: 'int', value: b2bBills.length, hint: b2bBills.length ? 'with GSTIN' : 'none in period' },
      { label: 'B2C invoices', kind: 'int', value: b2cBills.length, hint: 'unregistered customers' },
    ],
    chart: { kind: 'split', title: 'Taxable value: B2B vs B2C', parts: [{ label: 'B2B', value: b2bTaxable }, { label: 'B2C', value: b2cTaxable }] },
    columns: [
      { key: 'ref', label: 'Ref', kind: 'text', w: '0.5fr' }, { key: 'desc', label: 'Description', kind: 'text', w: '3fr' },
      { key: 'invoices', label: 'Invoices', kind: 'int', w: '0.9fr' }, { key: 'taxable', label: 'Taxable value', kind: 'money', w: '1.5fr' },
      { key: 'cgst', label: 'CGST', kind: 'money' }, { key: 'sgst', label: 'SGST', kind: 'money' }, { key: 'igst', label: 'IGST', kind: 'money', w: '0.8fr' },
      { key: 'cess', label: 'Cess', kind: 'money', w: '0.7fr' }, { key: 'tax', label: 'Total tax', kind: 'money' }, { key: 'value', label: 'Total value', kind: 'money', w: '1.5fr' },
    ],
    rows,
    totals: { desc: 'Total outward supplies', invoices: tot.invoices, taxable: tot.taxable, cgst: tot.cgst, sgst: tot.sgst, igst: tot.igst, cess: tot.cess, tax: tot.cgst + tot.sgst + tot.igst, value: tot.taxable + tot.cgst + tot.sgst + tot.igst + tot.cess },
  };
}

function gstr3b(c: Ctx): ReportResult {
  const slabs = c.bills.flatMap((b) => b.totals.slabs);
  const taxed = slabs.filter((s) => s.rate > 0);
  const nil = slabs.filter((s) => s.rate === 0);
  const a = { taxable: sum(taxed.map((s) => s.taxable)), cgst: sum(taxed.map((s) => s.cgst)), sgst: sum(taxed.map((s) => s.sgst)), igst: sum(taxed.map((s) => s.igst ?? 0)) };
  const nilTaxable = sum(nil.map((s) => s.taxable));
  const cn = creditNoteSums(c);
  // ITC: purchases in range, cost is GST inclusive
  let itcTaxable = 0; let itcGst = 0;
  for (const p of c.store.purchases) {
    const k = dayKey(p.date);
    if (k < c.p.from || k > c.p.to) continue;
    for (const l of p.lines) {
      const it = c.items.get(l.itemId);
      const amount = Math.round((l.cost * l.qty) / 1000);
      const tx = taxableOf(amount, it?.gstRate ?? 5);
      itcTaxable += tx; itcGst += amount - tx;
    }
  }
  const itcC = Math.floor(itcGst / 2); const itcS = itcGst - itcC;
  const outI = a.igst - cn.igst; const outC = a.cgst - cn.cgst; const outS = a.sgst - cn.sgst;
  const net = setOff([outI, outC, outS], [0, itcC, itcS]);
  const out = outI + outC + outS;
  const payable = net[0] + net[1] + net[2];
  const rows: ReportRow[] = [
    { _style: 'head', ref: '3.1', desc: 'Outward supplies and reverse-charge inward' },
    { ref: '(a)', desc: 'Outward taxable supplies (other than zero/nil/exempt)', taxable: a.taxable, igst: a.igst, cgst: a.cgst, sgst: a.sgst },
    { ref: '(b)', desc: 'Outward taxable supplies (zero rated)', taxable: 0, igst: 0, cgst: 0, sgst: 0, _style: 'muted' },
    { ref: '(c)', desc: 'Other outward supplies (nil rated, exempted)', taxable: nilTaxable, igst: 0, cgst: 0, sgst: 0 },
    { ref: '(d)', desc: 'Inward supplies (liable to reverse charge)', taxable: 0, igst: 0, cgst: 0, sgst: 0, _style: 'muted' },
    { ref: '(e)', desc: 'Non-GST outward supplies', taxable: 0, igst: 0, cgst: 0, sgst: 0, _style: 'muted' },
    { ref: '', desc: `Less: credit notes for sales returns (${cn.count})`, taxable: -cn.taxable, igst: -cn.igst, cgst: -cn.cgst, sgst: -cn.sgst, _style: cn.count ? undefined : 'muted' },
    { _style: 'head', ref: '4', desc: 'Eligible input tax credit' },
    { ref: '(A)(5)', desc: 'All other ITC (from purchase bills in this period)', taxable: itcTaxable, igst: 0, cgst: itcC, sgst: itcS },
    { _style: 'head', ref: '6.1', desc: 'Payment of tax' },
    { _style: 'strong', ref: '', desc: 'Net tax payable in cash (output tax minus ITC)', taxable: undefined, igst: net[0], cgst: net[1], sgst: net[2] },
  ];
  return {
    id: 'gstr3b', title: 'GSTR-3B summary', note: 'ITC is taken from purchase bills dated in this period; sales returns reduce the output tax. IGST credit is set off against IGST, then CGST, then SGST (confirm with CA)',
    kpis: [
      { label: 'Output GST', kind: 'money', value: out, hint: 'on sales, after returns', tone: 'primary' },
      { label: 'Input tax credit', kind: 'money', value: itcGst, hint: 'on purchases', tone: 'success' },
      { label: 'Net GST payable', kind: 'money', value: payable, tone: 'warning' },
      { label: 'Taxable turnover', kind: 'money', value: a.taxable + nilTaxable - cn.taxable },
    ],
    chart: { kind: 'bars', title: 'Output tax vs input credit vs payable', money: true, points: [{ label: 'Output GST', value: out }, { label: 'Input credit', value: itcGst }, { label: 'Net payable', value: payable }] },
    columns: [
      { key: 'ref', label: 'Ref', kind: 'text', w: '0.6fr' }, { key: 'desc', label: 'Nature of supply', kind: 'text', w: '4fr' },
      { key: 'taxable', label: 'Taxable value', kind: 'money', w: '1.2fr' }, { key: 'igst', label: 'IGST', kind: 'money', w: '0.8fr' },
      { key: 'cgst', label: 'CGST', kind: 'money' }, { key: 'sgst', label: 'SGST / UTGST', kind: 'money' },
    ],
    rows,
  };
}

function hsnWise(c: Ctx): ReportResult {
  interface Acc { hsn: string; desc: string; uqc: string; rate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number; value: number }
  const agg = new Map<string, Acc>();
  for (const f of lineFacts(c)) {
    const hsn = f.line.hsn || f.item?.hsn || '0000';
    const uqc = UQC[f.line.unit];
    const key = `${hsn}|${f.line.gstRate}|${uqc}`;
    const t = f.line.tax ?? { taxable: f.taxable, cgst: Math.floor(f.tax / 2), sgst: f.tax - Math.floor(f.tax / 2), igst: 0, cess: 0 };
    const cur = agg.get(key) ?? { hsn, desc: f.item?.category ?? 'Goods', uqc, rate: f.line.gstRate, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, value: 0 };
    cur.qty += f.line.qty; cur.taxable += t.taxable; cur.cgst += t.cgst; cur.sgst += t.sgst; cur.igst += t.igst; cur.cess += t.cess; cur.value += f.line.amount;
    agg.set(key, cur);
  }
  const list = [...agg.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.uqc.localeCompare(b.uqc));
  const rows: ReportRow[] = list.map((x) => ({
    hsn: x.hsn, desc: x.desc, uqc: x.uqc, qty: x.qty, rate: x.rate, taxable: x.taxable, cgst: x.cgst, sgst: x.sgst, igst: x.igst, cess: x.cess,
    tax: x.cgst + x.sgst + x.igst, value: x.taxable + x.cgst + x.sgst + x.igst + x.cess,
  }));
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  return {
    id: 'hsn-wise', title: 'HSN-wise summary', note: 'GSTR-1 table 12. Quantities are per unit of measure (UQC). Items with no HSN show as 0000.',
    kpis: [
      { label: 'Taxable value', kind: 'money', value: t('taxable'), tone: 'primary' },
      { label: 'Total GST', kind: 'money', value: t('tax') },
      { label: 'HSN codes', kind: 'int', value: new Set(list.map((x) => x.hsn)).size, hint: 'in this period' },
      { label: 'Invoice value', kind: 'money', value: t('value') },
    ],
    chart: { kind: 'bars', title: 'Taxable value by HSN', money: true, points: [...rows].sort((a, b) => Number(b.taxable) - Number(a.taxable)).slice(0, 8).map((r) => ({ label: `${r.hsn} @ ${r.rate}% (${r.uqc})`, value: Number(r.taxable) })) },
    columns: [
      { key: 'hsn', label: 'HSN', kind: 'text', w: '0.9fr' }, { key: 'desc', label: 'Description', kind: 'text', w: '2fr' },
      { key: 'uqc', label: 'UQC', kind: 'text', w: '0.6fr' }, { key: 'qty', label: 'Total qty', kind: 'qty', w: '1fr' },
      { key: 'rate', label: 'Rate', kind: 'pct', w: '0.6fr' }, { key: 'taxable', label: 'Taxable value', kind: 'money', w: '1.2fr' },
      { key: 'igst', label: 'IGST', kind: 'money', w: '0.8fr' }, { key: 'cgst', label: 'CGST', kind: 'money', w: '0.9fr' }, { key: 'sgst', label: 'SGST', kind: 'money', w: '0.9fr' },
      { key: 'cess', label: 'Cess', kind: 'money', w: '0.7fr' }, { key: 'value', label: 'Total value', kind: 'money', w: '1.2fr' },
    ],
    rows,
    totals: { hsn: 'Total', taxable: t('taxable'), igst: t('igst'), cgst: t('cgst'), sgst: t('sgst'), cess: t('cess'), value: t('value') },
  };
}

function taxRate(c: Ctx): ReportResult {
  const agg = new Map<number, { bills: Set<string>; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  for (const b of c.bills) for (const s of b.totals.slabs) {
    const cur = agg.get(s.rate) ?? { bills: new Set(), taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    cur.bills.add(b.id); cur.taxable += s.taxable; cur.cgst += s.cgst; cur.sgst += s.sgst; cur.igst += s.igst ?? 0; cur.cess += s.cess ?? 0;
    agg.set(s.rate, cur);
  }
  const rows: ReportRow[] = [...agg.entries()].sort((a, b) => a[0] - b[0]).map(([rate, a]) => ({
    rate, bills: a.bills.size, taxable: a.taxable, cgst: a.cgst, sgst: a.sgst, igst: a.igst, cess: a.cess,
    tax: a.cgst + a.sgst + a.igst, value: a.taxable + a.cgst + a.sgst + a.igst + a.cess,
  }));
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  return {
    id: 'tax-rate', title: 'Tax-rate-wise summary',
    kpis: [
      { label: 'Taxable value', kind: 'money', value: t('taxable'), tone: 'primary' },
      { label: 'CGST + SGST', kind: 'money', value: t('cgst') + t('sgst') }, { label: 'IGST', kind: 'money', value: t('igst') },
      { label: 'Slabs used', kind: 'int', value: rows.length },
    ],
    chart: { kind: 'split', title: 'GST collected by slab', parts: rows.map((r) => ({ label: `${r.rate}%`, value: Number(r.tax) })) },
    columns: [
      { key: 'rate', label: 'GST rate', kind: 'pct', w: '1fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.7fr' },
      { key: 'taxable', label: 'Taxable value', kind: 'money' }, { key: 'cgst', label: 'CGST', kind: 'money' }, { key: 'sgst', label: 'SGST', kind: 'money' }, { key: 'igst', label: 'IGST', kind: 'money' },
      { key: 'cess', label: 'Cess', kind: 'money', w: '0.7fr' }, { key: 'tax', label: 'Total tax', kind: 'money' }, { key: 'value', label: 'Total value', kind: 'money' },
    ],
    rows,
    totals: { rate: 'Total', taxable: t('taxable'), cgst: t('cgst'), sgst: t('sgst'), igst: t('igst'), cess: t('cess'), tax: t('tax'), value: t('value') },
  };
}

/* ------------------------------------------------------------------ stock */

function activeItems(c: Ctx) {
  return c.store.items.filter((i) => i.active && (!c.p.categoryId || i.categoryId === c.p.categoryId));
}

function stockSummary(c: Ctx): ReportResult {
  const sold30 = new Map<string, number>();
  const cutoff = Date.now() - 30 * 86400000;
  for (const b of c.store.bills) {
    if (b.status === 'cancelled' || new Date(b.at).getTime() < cutoff) continue;
    for (const l of b.lines) sold30.set(l.itemId, (sold30.get(l.itemId) ?? 0) + l.qty);
  }
  const rows: ReportRow[] = activeItems(c).map((i) => {
    const perDay = (sold30.get(i.id) ?? 0) / 30;
    const status = i.stock <= i.reorderLevel * 0.3 ? 'Critical' : i.stock <= i.reorderLevel ? 'Low' : 'OK';
    return { name: i.name, category: i.category, stock: i.stock, unit: UNIT_LABEL[i.unit], reorder: i.reorderLevel, cover: perDay ? i.stock / perDay : 999, status };
  }).sort((a, b) => Number(a.cover) - Number(b.cover));
  const low = rows.filter((r) => r.status !== 'OK').length;
  return {
    id: 'stock-summary', title: 'Stock summary', note: 'Cover = days the current stock lasts at the last 30 days average sale',
    kpis: [
      { label: 'Items in stock', kind: 'int', value: rows.length, tone: 'primary' },
      { label: 'Below reorder level', kind: 'int', value: low, tone: 'warning', hint: 'needs a purchase' },
      { label: 'Critical', kind: 'int', value: rows.filter((r) => r.status === 'Critical').length, tone: 'danger', hint: 'under 30% of reorder level' },
      { label: 'Out of stock', kind: 'int', value: rows.filter((r) => Number(r.stock) <= 0).length },
    ],
    columns: [
      { key: 'name', label: 'Item', kind: 'text', w: '2.4fr' }, { key: 'category', label: 'Category', kind: 'text', w: '1.5fr' },
      { key: 'stock', label: 'In stock', kind: 'qty', unitKey: 'unit', w: '1fr' }, { key: 'reorder', label: 'Reorder at', kind: 'qty', unitKey: 'unit', w: '1fr' },
      { key: 'cover', label: 'Cover (days)', kind: 'dec1', w: '0.8fr' }, { key: 'status', label: 'Status', kind: 'badge', w: '0.8fr' },
    ],
    rows: rows.map((r) => ({ ...r, cover: Math.min(Number(r.cover), 999) })),
  };
}

function stockValuation(c: Ctx): ReportResult {
  const list = activeItems(c);
  const rows: ReportRow[] = list.map((i) => {
    const costValue = Math.round((i.cost * i.stock) / 1000);
    const saleValue = Math.round((i.price * i.stock) / 1000);
    return { name: i.name, category: i.category, stock: i.stock, unit: UNIT_LABEL[i.unit], cost: i.cost, costValue, saleValue, margin: saleValue - costValue };
  }).sort((a, b) => Number(b.costValue) - Number(a.costValue));
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(String(r.category), (byCat.get(String(r.category)) ?? 0) + Number(r.costValue));
  return {
    id: 'stock-valuation', title: 'Stock valuation', note: 'Valued at cost price and at selling price (GST inclusive)',
    kpis: [
      { label: 'Stock value at cost', kind: 'money', value: t('costValue'), tone: 'primary' },
      { label: 'Value at selling price', kind: 'money', value: t('saleValue') },
      { label: 'Potential margin', kind: 'money', value: t('margin'), tone: 'success', hint: `${pctOf(t('margin'), t('saleValue')).toFixed(1)}% of selling value` },
      { label: 'Items', kind: 'int', value: rows.length, hint: 'with stock on hand' },
    ],
    chart: { kind: 'bars', title: 'Stock value at cost, by category', money: true, points: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })) },
    columns: [
      { key: 'name', label: 'Item', kind: 'text', w: '2.4fr' }, { key: 'category', label: 'Category', kind: 'text', w: '1.5fr' },
      { key: 'stock', label: 'In stock', kind: 'qty', unitKey: 'unit', w: '1fr' }, { key: 'cost', label: 'Cost rate', kind: 'money', w: '0.9fr' },
      { key: 'costValue', label: 'Value at cost', kind: 'money', w: '1.1fr' }, { key: 'saleValue', label: 'Value at price', kind: 'money', w: '1.1fr' },
      { key: 'margin', label: 'Margin', kind: 'money', w: '1fr' },
    ],
    rows,
    totals: { name: 'Total', costValue: t('costValue'), saleValue: t('saleValue'), margin: t('margin') },
  };
}

/* ------------------------------------------------------------------ profit */

function itemMargin(c: Ctx): ReportResult {
  const agg = new Map<string, { name: string; unit: UnitCode; qty: number; sales: number; cost: number }>();
  for (const f of lineFacts(c)) {
    const cur = agg.get(f.line.itemId) ?? { name: f.line.name, unit: f.line.unit, qty: 0, sales: 0, cost: 0 };
    cur.qty += f.line.qty; cur.sales += f.taxable; cur.cost += f.cost;
    agg.set(f.line.itemId, cur);
  }
  const rows: ReportRow[] = [...agg.values()].map((x) => ({
    name: x.name, qty: x.qty, unit: UNIT_LABEL[x.unit], sales: x.sales, cost: x.cost, profit: x.sales - x.cost, margin: pctOf(x.sales - x.cost, x.sales),
  })).sort((a, b) => Number(b.profit) - Number(a.profit));
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  return {
    id: 'item-margin', title: 'Item-wise margin', note: 'Sales are ex-GST (taxable value); cost is the item cost price ex-GST',
    kpis: [
      { label: 'Gross profit', kind: 'money', value: t('profit'), tone: 'success' },
      { label: 'Margin', kind: 'pct', value: pctOf(t('profit'), t('sales')), hint: 'of taxable sales' },
      { label: 'Best item', kind: 'text', value: String(rows[0]?.name ?? '-'), hint: rows[0] ? 'highest profit' : undefined },
      { label: 'Cost of goods sold', kind: 'money', value: t('cost') },
    ],
    chart: { kind: 'bars', title: 'Top 8 items by profit', money: true, points: rows.slice(0, 8).map((r) => ({ label: String(r.name), value: Number(r.profit) })) },
    columns: [
      { key: 'name', label: 'Item', kind: 'text', w: '2.4fr' }, { key: 'qty', label: 'Qty sold', kind: 'qty', unitKey: 'unit', w: '1fr' },
      { key: 'sales', label: 'Sales (ex-GST)', kind: 'money', w: '1.1fr' }, { key: 'cost', label: 'Cost', kind: 'money', w: '1fr' },
      { key: 'profit', label: 'Profit', kind: 'money', w: '1fr' }, { key: 'margin', label: 'Margin', kind: 'pct', w: '0.7fr' },
    ],
    rows,
    totals: { name: 'Total', sales: t('sales'), cost: t('cost'), profit: t('profit'), margin: pctOf(t('profit'), t('sales')) },
  };
}

function dailyProfit(c: Ctx): ReportResult {
  const facts = lineFacts(c);
  const days = daysBetween(c.p.from, c.p.to);
  const rows: ReportRow[] = days.map((date) => {
    const fs = facts.filter((f) => dayKey(f.bill.at) === date);
    const sales = sum(fs.map((f) => f.taxable)); const cost = sum(fs.map((f) => f.cost));
    return { date, bills: new Set(fs.map((f) => f.bill.id)).size, sales, cost, profit: sales - cost, margin: pctOf(sales - cost, sales) };
  });
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  const best = [...rows].sort((a, b) => Number(b.profit) - Number(a.profit))[0];
  return {
    id: 'daily-profit', title: 'Daily profit', note: 'Taxable sales minus cost of goods sold',
    kpis: [
      { label: 'Gross profit', kind: 'money', value: t('profit'), tone: 'success' },
      { label: 'Margin', kind: 'pct', value: pctOf(t('profit'), t('sales')) },
      { label: 'Best day', kind: 'text', value: best ? best.date as string : '-', hint: best ? `profit ${Math.round(Number(best.profit) / 100).toLocaleString('en-IN')} rupees` : undefined },
      { label: 'Average per day', kind: 'money', value: Math.round(t('profit') / Math.max(1, days.length)) },
    ],
    chart: { kind: 'area', title: 'Gross profit per day', money: true, points: rows.map((r) => ({ label: String(r.date), value: Number(r.profit) })) },
    columns: [
      { key: 'date', label: 'Date', kind: 'date', w: '1.2fr' }, { key: 'bills', label: 'Bills', kind: 'int', w: '0.6fr' },
      { key: 'sales', label: 'Sales (ex-GST)', kind: 'money' }, { key: 'cost', label: 'Cost', kind: 'money' },
      { key: 'profit', label: 'Profit', kind: 'money' }, { key: 'margin', label: 'Margin', kind: 'pct', w: '0.7fr' },
    ],
    rows: [...rows].reverse(),
    totals: { date: 'Total', bills: t('bills'), sales: t('sales'), cost: t('cost'), profit: t('profit'), margin: pctOf(t('profit'), t('sales')) },
  };
}

/* ------------------------------------------------------------------ cash */

function cashBook(c: Ctx): ReportResult {
  // chain from the earliest day of data so opening cash carries forward correctly
  const all = c.store.bills.filter((b) => b.status !== 'cancelled');
  const firstDay = all.length ? dayKey(all[0].at) : c.p.from;
  const start = firstDay < c.p.from ? firstDay : c.p.from;
  const days = daysBetween(start, c.p.to);
  let opening = 500000;
  const out: ReportRow[] = [];
  for (const date of days) {
    const cashSales = sum(all.filter((b) => dayKey(b.at) === date).flatMap((b) => b.payments).filter((p) => p.mode === 'cash').map((p) => p.amount));
    const suppliers = sum(c.store.purchases.filter((p) => dayKey(p.date) === date).map((p) => p.paid));
    const supplierCash = Math.round(suppliers * 0.35 / 100) * 100; // rest is paid by bank transfer
    const expenses = 30000 + (hash(date) % 12) * 15000;
    const pre = opening + cashSales - supplierCash - expenses;
    const deposit = Math.max(0, Math.floor((pre - 500000) / 100000) * 100000);
    const expected = pre - deposit;
    const h = hash(date + 'x') % 9;
    const diff = h === 0 ? -5000 : h === 1 ? 2000 : h === 2 ? -1000 : 0;
    out.push({ date, opening, cashSales, supplierCash, expenses, deposit, closing: expected, diff, counted: expected + diff });
    opening = expected + diff;
  }
  const rows = out.filter((r) => String(r.date) >= c.p.from);
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  return {
    id: 'cash-book', title: 'Day-wise cash book', note: 'Opening + cash sales - suppliers - expenses - deposit = expected closing',
    kpis: [
      { label: 'Cash sales', kind: 'money', value: t('cashSales'), tone: 'success' },
      { label: 'Cash out', kind: 'money', value: t('supplierCash') + t('expenses'), hint: 'suppliers + expenses', tone: 'warning' },
      { label: 'Banked', kind: 'money', value: t('deposit'), tone: 'info' },
      { label: 'Cash in drawer', kind: 'money', value: rows.length ? Number(rows[rows.length - 1].counted) : 0, hint: 'last closing, counted', tone: 'primary' },
    ],
    chart: { kind: 'bars', title: 'Cash sales per day', money: true, points: rows.map((r) => ({ label: String(r.date), value: Number(r.cashSales) })) },
    columns: [
      { key: 'date', label: 'Date', kind: 'date', w: '1.1fr' }, { key: 'opening', label: 'Opening', kind: 'money' },
      { key: 'cashSales', label: 'Cash sales', kind: 'money' }, { key: 'supplierCash', label: 'Suppliers', kind: 'money', w: '0.9fr' },
      { key: 'expenses', label: 'Expenses', kind: 'money', w: '0.9fr' }, { key: 'deposit', label: 'Bank deposit', kind: 'money' },
      { key: 'closing', label: 'Expected', kind: 'money' }, { key: 'diff', label: 'Short / excess', kind: 'money', w: '0.9fr' }, { key: 'counted', label: 'Counted', kind: 'money' },
    ],
    rows: [...rows].reverse(),
    totals: {
      date: 'Total', opening: rows.length ? Number(rows[0].opening) : 0, cashSales: t('cashSales'), supplierCash: t('supplierCash'), expenses: t('expenses'),
      deposit: t('deposit'), closing: rows.length ? Number(rows[rows.length - 1].closing) : 0, diff: t('diff'), counted: rows.length ? Number(rows[rows.length - 1].counted) : 0,
    },
  };
}

/* ------------------------------------------------------------------ production */

function yieldReport(c: Ctx): ReportResult {
  const batches = c.store.production.filter((b) => { const k = dayKey(b.date); return k >= c.p.from && k <= c.p.to; })
    .sort((a, b) => b.date.localeCompare(a.date));
  const rows: ReportRow[] = batches.map((b) => {
    const oilKg = b.oilL * 0.92;
    return {
      date: dayKey(b.date), batch: `PB-${b.id.replace('b', '').padStart(3, '0')}`, seed: b.seed, seedKg: b.seedKg * 1000, oil: b.oil, oilL: b.oilL * 1000,
      yield: (b.oilL / b.seedKg) * 100, cakeKg: b.cakeKg * 1000, cakePct: pctOf(b.cakeKg, b.seedKg), wastage: Math.max(0, (b.seedKg - oilKg - b.cakeKg) * 1000),
      status: b.status === 'done' ? 'Done' : 'Running',
    };
  });
  const t = (k: string) => sum(rows.map((r) => Number(r[k])));
  const seed = t('seedKg');
  return {
    id: 'yield', title: 'Production yield', note: 'Oil per 100 kg of seed; wastage = seed - oil (at 0.92 kg/L) - cake',
    kpis: [
      { label: 'Seed pressed', kind: 'text', value: `${(seed / 1000).toLocaleString('en-IN')} kg`, tone: 'primary' },
      { label: 'Oil produced', kind: 'text', value: `${(t('oilL') / 1000).toLocaleString('en-IN')} L` },
      { label: 'Average oil yield', kind: 'dec1', value: seed ? (t('oilL') / seed) * 100 : 0, hint: 'litres per 100 kg seed', tone: 'success' },
      { label: 'Oil cake', kind: 'text', value: `${(t('cakeKg') / 1000).toLocaleString('en-IN')} kg`, hint: `${pctOf(t('cakeKg'), seed).toFixed(1)}% of seed` },
    ],
    chart: { kind: 'bars', title: 'Oil yield per batch (L per 100 kg seed)', money: false, points: [...rows].reverse().map((r) => ({ label: `${r.batch} ${r.seed}`, value: Math.round(Number(r.yield) * 10) / 10 })) },
    columns: [
      { key: 'date', label: 'Date', kind: 'date', w: '1fr' }, { key: 'batch', label: 'Batch', kind: 'text', w: '0.8fr' },
      { key: 'seed', label: 'Seed', kind: 'text', w: '1fr' }, { key: 'seedKg', label: 'Seed (kg)', kind: 'qty', w: '1fr' },
      { key: 'oilL', label: 'Oil (L)', kind: 'qty', w: '1fr' }, { key: 'yield', label: 'Yield /100 kg', kind: 'dec1', w: '1fr' },
      { key: 'cakeKg', label: 'Cake (kg)', kind: 'qty', w: '1fr' }, { key: 'cakePct', label: 'Cake %', kind: 'pct', w: '0.7fr' },
      { key: 'wastage', label: 'Wastage (kg)', kind: 'qty', w: '1fr' }, { key: 'status', label: 'Status', kind: 'badge', w: '0.8fr' },
    ],
    rows,
    totals: { date: 'Total', seedKg: seed, oilL: t('oilL'), yield: seed ? (t('oilL') / seed) * 100 : 0, cakeKg: t('cakeKg'), cakePct: pctOf(t('cakeKg'), seed), wastage: t('wastage') },
  };
}

/* ------------------------------------------------------------------ api */

const SOON: Record<string, string> = {
  'stock-movement': 'Stock movement',
  'low-dead': 'Low and dead stock',
  'day-close': 'Day close history',
};

export function createReportsMock(store: MockStore): ReportsApi {
  return {
    runReport: async (id, params) => {
      const c = context(store, params);
      switch (id) {
        case 'daily-summary': return dailySummary(c);
        case 'bill-wise': return billWise(c);
        case 'item-wise': return itemWise(c);
        case 'category-wise': return categoryWise(c);
        case 'cashier-wise': return cashierWise(c);
        case 'payment-mode': return paymentMode(c);
        case 'hourly-heatmap': return hourlyHeatmap(c);
        case 'gstr1': return gstr1(c);
        case 'gstr3b': return gstr3b(c);
        case 'hsn-wise': return hsnWise(c);
        case 'tax-rate': return taxRate(c);
        case 'stock-summary': return stockSummary(c);
        case 'stock-valuation': return stockValuation(c);
        case 'item-margin': return itemMargin(c);
        case 'daily-profit': return dailyProfit(c);
        case 'cash-book': return cashBook(c);
        case 'yield': return yieldReport(c);
        case 'expenses': return mockExpensesReport(store, params);
        case 'voided-lines': return mockVoidedLinesReport(store, params);
        default:
          return { id, title: SOON[id] ?? id, note: rangeNote(params), kpis: [], columns: [], rows: [] };
      }
    },
  };
}
