export type GroupBy = 'none' | 'category' | 'brand' | 'supplier';

export interface StockGroup<T> {
  key: string;
  label: string;
  rows: T[];
  count: number;
  /** Sum of the quantities (loose and packed units mixed: a rough size of the group, not a stock count) */
  qty: number;
  sales: number;
  cost: number;
  profit: number;
}

export interface Measures { key: string; qty: number; sales: number; cost?: number; profit?: number }

/** Splits rows into groups (A to Z by group name, "No supplier" style group last) with the totals a group header shows. Rows keep their order inside a group. */
export function groupStock<T>(rows: T[], by: GroupBy, get: (r: T) => Measures, emptyLabel = 'Not set'): StockGroup<T>[] {
  if (by === 'none') return [];
  const map = new Map<string, StockGroup<T>>();
  for (const r of rows) {
    const m = get(r);
    const k = m.key.trim();
    let g = map.get(k);
    if (!g) { g = { key: k, label: k || emptyLabel, rows: [], count: 0, qty: 0, sales: 0, cost: 0, profit: 0 }; map.set(k, g); }
    g.rows.push(r);
    g.count += 1;
    g.qty += m.qty;
    g.sales += m.sales;
    g.cost += m.cost ?? 0;
    g.profit += m.profit ?? 0;
  }
  return [...map.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.key.localeCompare(b.key, 'en', { sensitivity: 'base' })));
}

export type StockFilter = 'all' | 'low' | 'out' | 'has';

/** Low = above zero but at or below the reorder level; out = zero or negative; has = above zero. */
export function stockState(qty: number, reorder: number): 'out' | 'low' | 'ok' {
  return qty <= 0 ? 'out' : qty <= reorder ? 'low' : 'ok';
}
export function passesStockFilter(f: StockFilter, qty: number, reorder: number): boolean {
  if (f === 'all') return true;
  const s = stockState(qty, reorder);
  return f === 'low' ? s === 'low' : f === 'out' ? s === 'out' : qty > 0;
}
