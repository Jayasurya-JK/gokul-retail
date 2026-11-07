import type { Api, CoreApi } from './api';
import type { MockStore } from './areas/store';
import { createShiftMock } from './areas/shift';
import { createBillOpsMock } from './areas/billops';
import { createCatalogMock } from './areas/catalog';
import { createPurchasingMock } from './areas/purchasing';
import { createCrmMock } from './areas/crm';
import { createReportsMock } from './areas/reports';
import { createExpensesMock } from './areas/expenses';
import { createMillMock } from './areas/mill';
import { createPosReportsMock } from './areas/posreports';
import type { Bill, BillDraft, DaySummary, HeldBill, StockMovement, TopItem } from './types';
import { cashDiscount, computeTotalsWithDelivery } from './money';
import { fuzzyFilter } from './fuzzy';
import {
  buildBills, buildCustomers, buildItems, buildProduction, buildPurchases, buildSuppliers, categories, settings, users,
} from './seed';

const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function createMockApi(): Api {
  const items = buildItems();
  const customers = buildCustomers();
  const suppliers = buildSuppliers();
  const purchases = buildPurchases(items, suppliers);
  const production = buildProduction();
  const bills: Bill[] = buildBills(items, customers);
  const held: HeldBill[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  let billSeq = bills.length;
  let heldSeq = 0;
  const shiftStart = new Date();
  shiftStart.setHours(9, 2, 0, 0);
  if (shiftStart.getTime() > Date.now()) shiftStart.setDate(shiftStart.getDate() - 1);

  const todayKey = () => dayKey(new Date());
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const core: CoreApi = {
    getSettings: async () => settings,
    listUsers: async () => users,
    verifyPin: async (userId, pin) => users.find((u) => u.id === userId && u.pin === pin) ?? null,
    logout: async () => undefined,
    currentShift: async (userId) => ({
      id: 'sh-today', userId, counter: settings.counter, openedAt: shiftStart.toISOString(), openingCash: 200000,
    }),

    listItems: async () => items,
    listCategories: async () => categories,
    findItemByCode: async (c) => {
      const k = c.trim();
      // Scan the live list so items created or edited in Office are found at once.
      return items.find((i) => i.code === k || i.barcode === k) ?? null;
    },
    searchItems: async (q, limit = 50) => fuzzyFilter(items, q, (i) => [i.name, i.code, i.barcode, i.nameTa ?? ''], limit),

    listCustomers: async () => customers.filter((c) => c.active !== false),
    searchCustomers: async (q, limit = 30, offset = 0) =>
      fuzzyFilter(customers.filter((c) => c.active !== false), q, (c) => [c.name, c.phone.replace(' ', ''), c.id, c.area], limit + offset).slice(offset),
    getCustomer: async (id) => customers.find((c) => c.id === id) ?? null,
    countCustomers: async () => customers.filter((c) => c.active !== false).length,

    listBills: async (f = {}) => {
      let out = bills;
      if (f.from) out = out.filter((b) => b.at >= f.from!);
      if (f.to) out = out.filter((b) => b.at <= f.to!);
      if (f.query) {
        const q = f.query.toLowerCase();
        out = out.filter((b) => b.number.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q));
      }
      const sorted = [...out].reverse();
      return f.limit ? sorted.slice(0, f.limit) : sorted;
    },
    getBill: async (id) => bills.find((b) => b.id === id) ?? null,
    saveBill: async (draft: BillDraft) => {
      billSeq += 1;
      const cashDisc = cashDiscount(draft.lines, draft.cashDiscBps ?? 0);
      const delivery = draft.deliveryCharge ?? 0;
      const dGst = settings.deliveryGstRate ?? 0;
      const totals = computeTotalsWithDelivery(draft.lines, draft.billDiscount + cashDisc, settings.roundToRupee, delivery, dGst);
      const credit = draft.payments.some((p) => p.mode === 'credit');
      const lines = delivery > 0
        ? [...draft.lines, { itemId: '_delivery', code: 'DLV', name: 'Delivery charge', unit: 'pc' as const, qty: 1000, rate: delivery, discount: 0, gstRate: dGst, amount: delivery }]
        : draft.lines;
      const bill: Bill = {
        id: `b${billSeq}`, number: `${settings.billPrefix}-${String(48200 + billSeq).padStart(6, '0')}`,
        at: new Date().toISOString(), cashier: draft.cashier ?? 'Cashier', counter: settings.counter,
        customerId: draft.customerId, customerName: draft.customerName ?? 'Walk-in',
        lines, totals, payments: draft.payments, status: credit ? 'credit' : 'paid',
        staff: draft.staff ?? '', deliveryAddress: draft.deliveryAddress, deliveryLocality: draft.deliveryLocality, deliveryCharge: delivery,
        wholesale: !!draft.wholesale, cashDiscBps: draft.cashDiscBps ?? 0, cashDisc, remarks: draft.remarks ?? '',
      };
      bills.push(bill);
      for (const l of draft.lines) {
        const it = byId.get(l.itemId);
        if (it) it.stock -= l.qty;
      }
      return bill;
    },

    holdBill: async (draft) => {
      heldSeq += 1;
      const h: HeldBill = {
        id: `h${heldSeq}`, at: new Date().toISOString(), customerName: draft.customerName ?? 'Walk-in',
        customerId: draft.customerId, lines: draft.lines, billDiscount: draft.billDiscount,
        total: computeTotalsWithDelivery(draft.lines, draft.billDiscount + cashDiscount(draft.lines, draft.cashDiscBps ?? 0), true, draft.deliveryCharge ?? 0, settings.deliveryGstRate ?? 0).grand,
        staff: draft.staff, deliveryAddress: draft.deliveryAddress, deliveryLocality: draft.deliveryLocality, deliveryCharge: draft.deliveryCharge,
        wholesale: draft.wholesale, cashDiscBps: draft.cashDiscBps, remarks: draft.remarks,
      };
      held.push(h);
      return h;
    },
    listHeld: async () => [...held],
    recallHeld: async (id) => {
      const i = held.findIndex((h) => h.id === id);
      return i < 0 ? null : held.splice(i, 1)[0];
    },

    dashboard: async () => {
      const perDay = new Map<string, DaySummary>();
      for (let d = 29; d >= 0; d--) {
        const x = new Date(); x.setDate(x.getDate() - d);
        perDay.set(dayKey(x), { date: dayKey(x), sales: 0, bills: 0 });
      }
      for (const b of bills) {
        const s = perDay.get(dayKey(b.at));
        if (s && b.status !== 'cancelled') { s.sales += b.totals.grand; s.bills += 1; }
      }
      const last30 = [...perDay.values()];
      const today = last30[last30.length - 1];
      const yest = last30[last30.length - 2];
      const todays = bills.filter((b) => dayKey(b.at) === todayKey());
      const mode = (m: string) => sum(todays.flatMap((b) => b.payments).filter((p) => p.mode === m).map((p) => p.amount));
      return {
        todaySales: today.sales, yesterdaySales: yest.sales,
        todayBills: today.bills, yesterdayBills: yest.bills,
        avgBill: today.bills ? Math.round(today.sales / today.bills) : 0,
        yesterdayAvg: yest.bills ? Math.round(yest.sales / yest.bills) : 0,
        cash: mode('cash'), upi: mode('upi'), card: mode('card'), credit: mode('credit'), last30,
      };
    },
    topItems: async (days, limit) => {
      const cutoff = Date.now() - days * 86400000;
      const agg = new Map<string, TopItem>();
      for (const b of bills) {
        if (new Date(b.at).getTime() < cutoff) continue;
        for (const l of b.lines) {
          const cur = agg.get(l.itemId) ?? { itemId: l.itemId, name: l.name, qty: 0, unit: l.unit, amount: 0 };
          cur.qty += l.qty; cur.amount += l.amount;
          agg.set(l.itemId, cur);
        }
      }
      return [...agg.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
    },
    lowStock: async (limit) =>
      items.filter((i) => i.stock <= i.reorderLevel).sort((a, b) => a.stock / a.reorderLevel - b.stock / b.reorderLevel).slice(0, limit),

    listSuppliers: async () => suppliers,
    listPurchases: async () => purchases,
    listStockMovements: async (limit) => {
      const out: StockMovement[] = [];
      for (const b of [...bills].reverse()) {
        for (const l of b.lines) {
          out.push({ id: `${b.id}-${l.itemId}`, at: b.at, itemId: l.itemId, itemName: l.name, kind: 'sale', qty: -l.qty, note: b.number });
          if (out.length >= limit) return out;
        }
      }
      return out;
    },
    listProduction: async () => production,
  };
  const store: MockStore = { items, customers, suppliers, purchases, production, bills, held, settings, users, categories };
  const api: Api = {
    ...core,
    ...createShiftMock(store),
    ...createBillOpsMock(store),
    ...createCatalogMock(store),
    ...createPurchasingMock(store),
    ...createCrmMock(store),
    ...createExpensesMock(store),
    ...createMillMock(store),
    ...createPosReportsMock(store),
    ...createReportsMock(store),
  };
  return api;
}

export const mockApi: Api = createMockApi();
