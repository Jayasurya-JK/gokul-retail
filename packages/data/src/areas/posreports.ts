import type { MockStore } from './store';
import type { Bill, Milli, Paise, UnitCode } from '../types';

// Area: reports and lists inside Gokul POS (Sales Report, Paymode Report, Stock, staff).
// Cost and profit fields are filled for the owner and managers only: the backend removes them from every answer given to a
// cashier, so they are optional here and the screens hide those columns when they are absent.

export interface Staff { id: string; name: string }

export interface ReportQuery {
  /** yyyy-mm-dd inclusive, local. Both default to today. A cashier is always held to today. */
  from?: string;
  to?: string;
  staff?: string;
  /** bill number or customer (sales), item text (stock) */
  query?: string;
}

export interface SalesReportLine {
  name: string; code: string; unit: UnitCode; qty: Milli; rate: Paise; discount: Paise; amount: Paise; gstRate: number;
  cost?: Paise; profit?: Paise;
}
export interface SalesReportRow {
  id: string; number: string; at: string; customerName: string; staff: string; cashier: string; status: Bill['status'];
  qty: Milli; items: number;
  /** Bill total (grand), GST inclusive */
  total: Paise;
  /** Net sales: taxable value, GST excluded */
  net: Paise;
  gst: Paise; discount: Paise; cashDisc: Paise; deliveryCharge: Paise; remarks: string; wholesale: boolean;
  profit?: Paise;
  lines: SalesReportLine[];
}
export interface SalesReport {
  from: string; to: string; rows: SalesReportRow[];
  totals: { bills: number; qty: Milli; total: Paise; net: Paise; gst: Paise; discount: Paise; profit?: Paise };
}

export interface PaymodeRow {
  id: string; number: string; at: string; customerName: string; staff: string; total: Paise;
  cash: Paise; upi: Paise; card: Paise; credit: Paise; wallet: Paise; points: Paise; sodexo: Paise;
}
export interface PaymodeReport {
  from: string; to: string; rows: PaymodeRow[];
  totals: { bills: number; total: Paise; cash: Paise; upi: Paise; card: Paise; credit: Paise; wallet: Paise; points: Paise; sodexo: Paise };
}

export interface StaffReportRow { staff: string; bills: number; qty: Milli; total: Paise; net: Paise }

export interface StockRow {
  id: string; barcode: string; code: string; name: string; category: string; brand: string; mrp: Paise;
  price: Paise; qty: Milli; unit: UnitCode; salesTotal: Paise; supplier: string; reorderLevel?: Milli;
  cost?: Paise; profitPct?: number; profit?: Paise; costTotal?: Paise; profitTotal?: Paise;
}
export interface StockReport {
  rows: StockRow[];
  totals: { items: number; salesTotal: Paise; costTotal?: Paise; profitTotal?: Paise };
}

export interface PosReportsApi {
  listStaff(): Promise<Staff[]>;
  addStaff(name: string): Promise<Staff[]>;
  salesReport(q?: ReportQuery): Promise<SalesReport>;
  paymodeReport(q?: ReportQuery): Promise<PaymodeReport>;
  staffReport(q?: ReportQuery): Promise<{ from: string; to: string; rows: StaffReportRow[] }>;
  stockReport(q?: ReportQuery): Promise<StockReport>;
}

/* ===================================================================== */

const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const delay = <T>(v: T): Promise<T> => Promise.resolve(v);

/** The mock plays the owner (it has no sign-in), so cost and profit are included. */
export function createPosReportsMock(store: MockStore): PosReportsApi {
  const staff: Staff[] = ['Ravi', 'Mala', 'Selvi', 'Karthik'].map((name, i) => ({ id: String(i + 1), name }));
  const range = (q?: ReportQuery) => {
    const from = q?.from || dayKey(new Date());
    return { from, to: q?.to || from };
  };
  const inRange = (b: Bill, from: string, to: string) => b.status !== 'cancelled' && dayKey(b.at) >= from && dayKey(b.at) <= to;
  const itemOf = (id: string) => store.items.find((i) => i.id === id);
  const costOf = (itemId: string, qty: Milli) => Math.round(((itemOf(itemId)?.cost ?? 0) * qty) / 1000);

  // give the seed bills a salesman so the staff filter and report have something to show
  store.bills.forEach((b, i) => { if (b.staff === undefined) b.staff = staff[i % staff.length].name; });

  const mode = (b: Bill, m: string) => b.payments.filter((p) => p.mode === m).reduce((s, p) => s + p.amount, 0);

  return {
    listStaff: () => delay([...staff]),
    addStaff: (name) => {
      const n = name.trim();
      if (!n) return Promise.reject(new Error('Enter the staff name'));
      if (!staff.some((s) => s.name.toLowerCase() === n.toLowerCase())) staff.push({ id: String(staff.length + 1), name: n });
      return delay([...staff]);
    },
    salesReport: (q) => {
      const { from, to } = range(q);
      const text = q?.query?.trim().toLowerCase();
      const bills = store.bills
        .filter((b) => inRange(b, from, to) && (!q?.staff || b.staff === q.staff) && (!text || b.number.toLowerCase().includes(text) || b.customerName.toLowerCase().includes(text)))
        .slice().reverse().slice(0, 5000);
      const rows: SalesReportRow[] = bills.map((b) => {
        const lines: SalesReportLine[] = b.lines.map((l) => {
          const cost = costOf(l.itemId, l.qty);
          return { name: l.name, code: l.code, unit: l.unit, qty: l.qty, rate: l.rate, discount: l.discount, amount: l.amount, gstRate: l.gstRate, cost, profit: Math.round((l.amount * 100) / (100 + l.gstRate)) - cost };
        });
        const costTotal = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
        return {
          id: b.id, number: b.number, at: b.at, customerName: b.customerName, staff: b.staff ?? '', cashier: b.cashier, status: b.status,
          qty: b.totals.qtyCount, items: b.totals.itemCount, total: b.totals.grand, net: b.totals.taxable, gst: b.totals.gst,
          discount: b.totals.discount, cashDisc: b.cashDisc ?? 0, deliveryCharge: b.deliveryCharge ?? 0, remarks: b.remarks ?? '',
          wholesale: !!b.wholesale, profit: b.totals.taxable - costTotal, lines,
        };
      });
      const t = (f: (r: SalesReportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
      return delay({ from, to, rows, totals: { bills: rows.length, qty: t((r) => r.qty), total: t((r) => r.total), net: t((r) => r.net), gst: t((r) => r.gst), discount: t((r) => r.discount), profit: t((r) => r.profit ?? 0) } });
    },
    paymodeReport: (q) => {
      const { from, to } = range(q);
      const rows: PaymodeRow[] = store.bills.filter((b) => inRange(b, from, to) && (!q?.staff || b.staff === q.staff)).slice().reverse().slice(0, 5000).map((b) => ({
        id: b.id, number: b.number, at: b.at, customerName: b.customerName, staff: b.staff ?? '', total: b.totals.grand,
        cash: mode(b, 'cash'), upi: mode(b, 'upi'), card: mode(b, 'card'), credit: mode(b, 'credit'),
        wallet: mode(b, 'credit_note'), points: mode(b, 'points'), sodexo: mode(b, 'sodexo'),
      }));
      const t = (k: keyof PaymodeRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
      return delay({ from, to, rows, totals: { bills: rows.length, total: t('total'), cash: t('cash'), upi: t('upi'), card: t('card'), credit: t('credit'), wallet: t('wallet'), points: t('points'), sodexo: t('sodexo') } });
    },
    staffReport: (q) => {
      const { from, to } = range(q);
      const m = new Map<string, StaffReportRow>();
      for (const b of store.bills) {
        if (!inRange(b, from, to)) continue;
        const k = b.staff || '(no staff)';
        const r = m.get(k) ?? { staff: k, bills: 0, qty: 0, total: 0, net: 0 };
        r.bills += 1; r.qty += b.totals.qtyCount; r.total += b.totals.grand; r.net += b.totals.taxable;
        m.set(k, r);
      }
      return delay({ from, to, rows: [...m.values()].sort((a, b) => b.total - a.total) });
    },
    stockReport: (q) => {
      const words = (q?.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const rows: StockRow[] = store.items
        .filter((i) => i.active && words.every((w) => `${i.barcode} ${i.code} ${i.name} ${i.category} ${i.brand}`.toLowerCase().includes(w)))
        .map((i) => {
          const priceEx = Math.round((i.price * 100) / (100 + i.gstRate));
          const profit = priceEx - i.cost;
          return {
            id: i.id, barcode: i.barcode, code: i.code, name: i.name, category: i.category, brand: i.brand, mrp: i.mrp, cost: i.cost,
            profitPct: i.cost > 0 ? Math.round((profit / i.cost) * 1000) / 10 : 0, profit, price: i.price, qty: i.stock, unit: i.unit,
            costTotal: Math.round((i.cost * i.stock) / 1000), profitTotal: Math.round((profit * i.stock) / 1000),
            salesTotal: Math.round((i.price * i.stock) / 1000), supplier: store.suppliers[Number(i.id.replace(/\D/g, '')) % store.suppliers.length]?.name ?? '',
          };
        });
      const t = (f: (r: StockRow) => number) => rows.reduce((s, r) => s + f(r), 0);
      return delay({ rows, totals: { items: rows.length, salesTotal: t((r) => r.salesTotal), costTotal: t((r) => r.costTotal ?? 0), profitTotal: t((r) => r.profitTotal ?? 0) } });
    },
  };
}
