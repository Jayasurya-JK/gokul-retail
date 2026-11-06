import { create } from 'zustand';
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
  },
  signOut: () => { set({ user: null, shift: null }); void backendApi.logout().catch(() => undefined); },
  setShift: (shift) => set({ shift }),
  setHeldCount: (heldCount) => set({ heldCount }),
}));

interface BillingState {
  lines: BillLine[];
  selected: number;
  customer: Customer | null;
  billDiscount: Paise;
  /** Add an item; returns the row index it landed on. Packed items merge, loose items get a new row. */
  addItem: (item: Item, qty?: number) => number;
  setQty: (i: number, qty: number) => void;
  setRate: (i: number, rate: Paise) => void;
  setDiscount: (i: number, d: Paise) => void;
  remove: (i: number) => void;
  insert: (line: BillLine, at: number) => void;
  select: (i: number) => void;
  setCustomer: (c: Customer | null) => void;
  setBillDiscount: (d: Paise) => void;
  clear: () => void;
  load: (h: HeldBill, customer: Customer | null) => void;
}

export const useBilling = create<BillingState>((set, get) => ({
  lines: [], selected: -1, customer: null, billDiscount: 0,
  addItem: (item, qty = 1000) => {
    const { lines } = get();
    const existing = item.loose ? -1 : lines.findIndex((l) => l.itemId === item.id && l.discount === 0);
    if (existing >= 0) {
      const next = lines.slice();
      next[existing] = recalcLine({ ...lines[existing], qty: lines[existing].qty + qty });
      set({ lines: next, selected: existing });
      return existing;
    }
    set({ lines: [...lines, makeLine(item, qty)], selected: lines.length });
    return lines.length;
  },
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
  clear: () => set({ lines: [], selected: -1, customer: null, billDiscount: 0 }),
  load: (h, customer) => set({ lines: h.lines, selected: h.lines.length - 1, customer, billDiscount: h.billDiscount }),
}));
