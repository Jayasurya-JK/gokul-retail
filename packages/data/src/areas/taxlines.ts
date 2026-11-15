import type { MockStore } from './store';
import { computeBill } from '../money';
import { isRealGstin } from '../gst';

/**
 * Seed bills are written before places of supply, GSTINs and per-line taxes existed in the mock. Fill them in the way the
 * Rust migration 19 does for old rows: every old bill is intra-state in the shop's own state, each line gets its HSN and its
 * tax split worked out again from the saved line amounts, and a registered customer's valid GSTIN is copied onto the bill.
 */
export function finalizeSeedBills(store: MockStore): void {
  const shop = store.settings.stateCode ?? '33';
  const items = new Map(store.items.map((i) => [i.id, i]));
  for (const b of store.bills) {
    if (b.supplyType) continue;
    b.placeOfSupply = shop;
    b.supplyType = 'intra';
    const cust = store.customers.find((c) => c.id === b.customerId);
    const g = (cust?.gstin ?? '').trim().toUpperCase();
    if (g && isRealGstin(g)) b.customerGstin = g;
    const delivery = b.lines.length && b.lines[b.lines.length - 1].itemId === '_delivery' ? b.lines[b.lines.length - 1] : undefined;
    const itemLines = delivery ? b.lines.slice(0, -1) : b.lines;
    const bd = Math.max(0, b.totals.discount - itemLines.reduce((s, l) => s + l.discount, 0));
    const { taxes } = computeBill(itemLines, bd, false, false, delivery ? { amount: delivery.amount, gstRate: delivery.gstRate } : undefined);
    b.lines = b.lines.map((l, i) => ({ ...l, hsn: items.get(l.itemId)?.hsn ?? (l.itemId === '_delivery' ? '9965' : ''), tax: taxes[i] }));
  }
}
