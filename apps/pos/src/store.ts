import { useEffect, useReducer } from 'react';
import { create } from 'zustand';
import { configureKeyBar, reloadKeyBar } from '@gokul/ui';
import {
  makeLine, recalcLine, api as backendApi, type Api, type BillLine, type Customer, type HeldBill, type Item, type Paise, type Settings, type Shift, type User,
} from '@gokul/data';

/**
 * The one place screens get data from. The signed-in user lives in the Rust backend; if it ever says "sign in first"
 * (locked out after too many wrong PINs, user deactivated) the screens go back to the login page.
 */
function guarded(a: Api): Api {
  return new Proxy(a, {
    get(target, key) {
      const f = (target as unknown as Record<string | symbol, unknown>)[key];
      if (typeof f !== 'function') return f;
      return async (...args: unknown[]) => {
        try { return await (f as (...a: unknown[]) => Promise<unknown>).apply(target, args); } catch (e) {
          if (e instanceof Error && /sign in first|no longer active/i.test(e.message)) useSession.getState().signOut();
          throw e;
        }
      };
    },
  });
}
export const api: Api = guarded(backendApi);
configureKeyBar({ get: () => backendApi.getUiPref('showKeyBar'), set: (v) => backendApi.setUiPref('showKeyBar', v) });

interface SessionState {
  user: User | null;
  shift: Shift | null;
  settings: Settings | null;
  heldCount: number;
  signIn: (user: User) => Promise<void>;
  signOut: () => void;
  setShift: (s: Shift | null) => void;
  setHeldCount: (n: number) => void;
}
export const useSession = create<SessionState>((set) => ({
  user: null, shift: null, settings: null, heldCount: 0,
  signIn: async (user) => {
    const [shift, settings, held] = await Promise.all([api.currentShift(user.id), api.getSettings(), api.listHeld()]);
    set({ user, shift, settings, heldCount: held.length });
    void reloadKeyBar();
  },
  signOut: () => { set({ user: null, shift: null }); void backendApi.logout().catch(() => undefined); },
  setShift: (shift) => set({ shift }),
  setHeldCount: (heldCount) => set({ heldCount }),
}));

/** Round 4 per-bill extras that live next to the lines. */
export interface Delivery { address: string; locality: string; charge: Paise }
export const NO_DELIVERY: Delivery = { address: '', locality: '', charge: 0 };

interface BillingState {
  lines: BillLine[];
  selected: number;
  customer: Customer | null;
  billDiscount: Paise;
  /** Salesman / staff picked for this bill (F7) */
  staff: string;
  /** Home delivery (F2) */
  delivery: Delivery;
  /** The bill uses wholesale prices */
  wholesale: boolean;
  /** Cash discount percent x 100 (250 = 2.5%), on top of item discounts */
  cashDiscBps: number;
  /** Add an item; returns the row index it landed on. Packed items merge, loose items get a new row. */
  addItem: (item: Item, qty?: number) => number;
  /** Add a one-off line that is not an item (Manual) */
  addLine: (line: BillLine) => number;
  setQty: (i: number, qty: number) => void;
  setRate: (i: number, rate: Paise) => void;
  setDiscount: (i: number, d: Paise) => void;
  remove: (i: number) => void;
  insert: (line: BillLine, at: number) => void;
  select: (i: number) => void;
  setCustomer: (c: Customer | null) => void;
  setBillDiscount: (d: Paise) => void;
  setStaff: (s: string) => void;
  setDelivery: (d: Delivery) => void;
  setCashDisc: (bps: number) => void;
  /** Switch wholesale on or off and re-price the lines that still carry the other mode's price. */
  setWholesale: (on: boolean, itemOf: (id: string) => Item | undefined) => void;
  clear: () => void;
  load: (h: HeldBill, customer: Customer | null) => void;
}

/** The rate an item is billed at in the current mode. */
export const rateFor = (item: Item, wholesale: boolean): Paise => (wholesale && item.wholesalePrice ? item.wholesalePrice : item.price);

const EMPTY = { lines: [] as BillLine[], selected: -1, customer: null as Customer | null, billDiscount: 0, staff: '', delivery: NO_DELIVERY, wholesale: false, cashDiscBps: 0 };

function makeBillingStore() {
  return create<BillingState>((set, get) => ({
    ...EMPTY,
    addItem: (item, qty = 1000) => {
      const { lines, wholesale } = get();
      const rate = rateFor(item, wholesale);
      const existing = item.loose ? -1 : lines.findIndex((l) => l.itemId === item.id && l.discount === 0 && l.rate === rate);
      if (existing >= 0) {
        const next = lines.slice();
        next[existing] = recalcLine({ ...lines[existing], qty: lines[existing].qty + qty });
        set({ lines: next, selected: existing });
        return existing;
      }
      set({ lines: [...lines, makeLine(item, qty, 0, rate)], selected: lines.length });
      return lines.length;
    },
    addLine: (line) => { const n = get().lines.length; set((s) => ({ lines: [...s.lines, line], selected: n })); return n; },
    setQty: (i, qty) => set((s) => ({ lines: s.lines.map((l, k) => (k === i ? recalcLine({ ...l, qty }) : l)) })),
    setRate: (i, rate) => set((s) => ({ lines: s.lines.map((l, k) => (k === i ? recalcLine({ ...l, rate }) : l)) })),
    setDiscount: (i, discount) => set((s) => ({ lines: s.lines.map((l, k) => (k === i ? recalcLine({ ...l, discount }) : l)) })),
    remove: (i) => set((s) => {
      const lines = s.lines.filter((_, k) => k !== i);
      return { lines, selected: Math.min(i, lines.length - 1) };
    }),
    insert: (line, at) => set((s) => {
      const lines = s.lines.slice();
      lines.splice(Math.min(at, lines.length), 0, line);
      return { lines, selected: Math.min(at, lines.length - 1) };
    }),
    select: (i) => set((s) => ({ selected: Math.max(-1, Math.min(i, s.lines.length - 1)) })),
    setCustomer: (customer) => set({ customer }),
    setBillDiscount: (billDiscount) => set({ billDiscount }),
    setStaff: (staff) => set({ staff }),
    setDelivery: (delivery) => set({ delivery }),
    setCashDisc: (cashDiscBps) => set({ cashDiscBps }),
    setWholesale: (on, itemOf) => set((s) => ({
      wholesale: on,
      lines: s.lines.map((l) => {
        const it = itemOf(l.itemId);
        // only lines still at the other mode's price move; a hand-typed rate is left alone
        if (!it || l.rate !== rateFor(it, !on)) return l;
        return recalcLine({ ...l, rate: rateFor(it, on) });
      }),
    })),
    clear: () => set({ ...EMPTY }),
    load: (h, customer) => set({
      lines: h.lines, selected: h.lines.length - 1, customer, billDiscount: h.billDiscount, staff: h.staff ?? '',
      delivery: { address: h.deliveryAddress ?? '', locality: h.deliveryLocality ?? '', charge: h.deliveryCharge ?? 0 },
      wholesale: !!h.wholesale, cashDiscBps: h.cashDiscBps ?? 0,
    }),
  }));
}

/**
 * Two independent bills: the main Point of Sale tab and POS 1. Each keeps its own lines, customer, discounts, staff and
 * delivery while the other tab is in front.
 */
export const billingStores = { pos: makeBillingStore(), pos1: makeBillingStore() };
export type BillSlot = keyof typeof billingStores;
export const SLOTS: BillSlot[] = ['pos', 'pos1'];
export const SLOT_LABEL: Record<BillSlot, string> = { pos: 'Point of Sale', pos1: 'POS 1' };
/** The main bill (the Customers screen starts a bill here) */
export const useBilling = billingStores.pos;

/** Lines open across both bills (the lock screen warns about them) */
export function useOpenLines(): number {
  const a = billingStores.pos((s) => s.lines.length);
  const b = billingStores.pos1((s) => s.lines.length);
  return a + b;
}

/* ---------- today's sales (status bar) ---------- */
interface TodaySales { sales: Paise; bills: number }
let today: TodaySales = { sales: 0, bills: 0 };
const todaySubs = new Set<() => void>();
/** Re-reads today's total; called after a bill is saved and on a timer. Never throws. */
export async function refreshTodaySales() {
  try {
    const d = await backendApi.dashboard();
    today = { sales: d.todaySales, bills: d.todayBills };
    todaySubs.forEach((f) => f());
  } catch { /* signed out or a busy moment: keep the last number */ }
}
export function useTodaySales(): TodaySales {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    todaySubs.add(bump);
    void refreshTodaySales();
    const t = window.setInterval(() => void refreshTodaySales(), 30_000);
    return () => { todaySubs.delete(bump); window.clearInterval(t); };
  }, []);
  return today;
}
