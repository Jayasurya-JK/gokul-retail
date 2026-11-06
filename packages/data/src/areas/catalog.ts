import type { MockStore } from './store';
import type { Brand, Category, Item, Milli, Paise, StockMovement, UnitCode } from '../types';

// Area: Office items editor, categories, brands, barcode labels, stock levels/adjustments/stock take.

/* ---------- Items ---------- */
export interface ItemInput {
  /** Present when editing an existing item. */
  id?: string;
  name: string;
  nameTa: string;
  code: string;
  /** First barcode is the primary one printed on labels. */
  barcodes: string[];
  categoryId: string;
  brand: string;
  unit: UnitCode;
  loose: boolean;
  /** Packed items only, e.g. "1 L". */
  packSize: string;
  /** Packed items only: the loose item this pack is filled from. */
  parentId: string;
  /** Loose items only: product code on the weighing scale. */
  scaleCode: string;
  hsn: string;
  gstRate: Item['gstRate'];
  mrp: Paise;
  price: Paise;
  cost: Paise;
  reorderLevel: Milli;
  active: boolean;
}

export interface ItemDetail {
  item: Item;
  barcodes: string[];
  parentId: string;
  scaleCode: string;
}

export interface ItemIssues { [field: string]: string }

export type SaveItemResult = { ok: true; item: Item } | { ok: false; issues: ItemIssues };

/* ---------- Stock ---------- */
export type AdjustReason = 'damage' | 'leak' | 'spill' | 'sample' | 'correction';
export const ADJUST_REASONS: { value: AdjustReason; label: string; hint: string }[] = [
  { value: 'damage', label: 'Damage', hint: 'Broken, expired or spoiled stock' },
  { value: 'leak', label: 'Leak', hint: 'Leaking tin or bottle' },
  { value: 'spill', label: 'Spill', hint: 'Spilled while filling or weighing' },
  { value: 'sample', label: 'Sample', hint: 'Given as a free sample' },
  { value: 'correction', label: 'Correction', hint: 'Fix a wrong count, up or down' },
];

export interface StockAdjustment {
  id: string;
  at: string;
  itemId: string;
  itemName: string;
  unit: UnitCode;
  loose: boolean;
  reason: AdjustReason;
  /** Signed, milli-units. Negative reduces stock. */
  qty: Milli;
  /** qty valued at cost, signed. */
  value: Paise;
  note: string;
  by: string;
}

export interface AdjustmentInput { itemId: string; reason: AdjustReason; qty: Milli; note: string; /** manager/owner PIN when the role must ask for approval */ managerPin?: string }
export type AdjustmentResult = { ok: true; adjustment: StockAdjustment } | { ok: false; message: string };

export interface StockTakeLine {
  itemId: string;
  code: string;
  name: string;
  unit: UnitCode;
  loose: boolean;
  category: string;
  system: Milli;
  cost: Paise;
}
export interface StockTakeCount { itemId: string; counted: Milli }
export interface StockTakeResult { adjusted: number; unchanged: number; netValue: Paise }

/* ---------- Categories and brands ---------- */
export interface CountedCategory extends Category { items: number }
export interface CountedBrand extends Brand { items: number }
export type NameResult = { ok: true } | { ok: false; message: string };

export interface CatalogApi {
  getItemDetail(id: string): Promise<ItemDetail | null>;
  /** Pure checks, same ones saveItem runs. */
  validateItem(input: ItemInput): Promise<ItemIssues>;
  saveItem(input: ItemInput): Promise<SaveItemResult>;
  /** Next free internal EAN-13 (prefix 2000, checksum included). */
  generateBarcode(): Promise<string>;
  nextItemCode(): Promise<string>;
  listLooseItems(): Promise<Item[]>;
  setItemsActive(ids: string[], active: boolean): Promise<void>;
  setItemsCategory(ids: string[], categoryId: string): Promise<void>;
  setItemsGst(ids: string[], rate: Item['gstRate']): Promise<void>;
  itemMovements(itemId: string, limit: number): Promise<StockMovement[]>;

  listCategoriesWithCounts(): Promise<CountedCategory[]>;
  addCategory(name: string): Promise<NameResult>;
  renameCategory(id: string, name: string): Promise<NameResult>;
  deleteCategory(id: string): Promise<NameResult>;
  moveCategory(id: string, delta: -1 | 1): Promise<void>;
  listBrands(): Promise<CountedBrand[]>;
  addBrand(name: string): Promise<NameResult>;
  renameBrand(id: string, name: string): Promise<NameResult>;
  deleteBrand(id: string): Promise<NameResult>;
  moveBrand(id: string, delta: -1 | 1): Promise<void>;

  createAdjustment(input: AdjustmentInput): Promise<AdjustmentResult>;
  listAdjustments(): Promise<StockAdjustment[]>;
  startStockTake(categoryId: string): Promise<StockTakeLine[]>;
  postStockTake(counts: StockTakeCount[], note: string, managerPin?: string): Promise<StockTakeResult>;
}

/** EAN-13 check digit for a 12 digit body. */
export function ean13Checksum(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}
export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Checksum(code.slice(0, 12)) === code[12];
}

/** Margin on selling price, in percent. Prices are GST inclusive, so margin is taken on the taxable value. */
export function marginPercent(price: Paise, cost: Paise, gstRate: number): number | null {
  if (price <= 0) return null;
  const taxable = (price * 100) / (100 + gstRate);
  return ((taxable - cost) / taxable) * 100;
}

export function validateItemInput(i: ItemInput, others: { id: string; code: string; barcodes: string[] }[]): ItemIssues {
  const e: ItemIssues = {};
  if (!i.name.trim()) e.name = 'Enter the item name.';
  else if (i.name.trim().length < 3) e.name = 'Item name is too short. Use at least 3 letters.';
  if (!/^\d{1,6}$/.test(i.code.trim())) e.code = 'Counter code must be 1 to 6 digits, for example 142.';
  else if (others.some((o) => o.id !== i.id && o.code === i.code.trim())) e.code = `Code ${i.code.trim()} is already used by another item.`;
  if (!i.categoryId) e.categoryId = 'Choose a category.';
  if (i.barcodes.length === 0) e.barcodes = 'Add at least one barcode. Use Generate for items without one.';
  else {
    const bad = i.barcodes.find((b) => !/^\d{6,14}$/.test(b));
    const dup = i.barcodes.find((b) => others.some((o) => o.id !== i.id && o.barcodes.includes(b)));
    const same = i.barcodes.find((b, k) => i.barcodes.indexOf(b) !== k);
    if (bad) e.barcodes = `Barcode ${bad} should be 6 to 14 digits.`;
    else if (same) e.barcodes = `Barcode ${same} is listed twice.`;
    else if (dup) e.barcodes = `Barcode ${dup} already belongs to another item.`;
  }
  if (!i.loose && !i.packSize.trim()) e.packSize = 'Enter the pack size, for example 1 L or 500 g.';
  if (i.loose && i.scaleCode && !/^\d{1,5}$/.test(i.scaleCode)) e.scaleCode = 'Scale code is 1 to 5 digits.';
  if (!/^\d{4}(\d{2}|\d{4})?$/.test(i.hsn.trim())) e.hsn = 'HSN is 4, 6 or 8 digits, for example 1508.';
  if (i.price <= 0) e.price = 'Selling price must be more than zero.';
  if (i.mrp <= 0) e.mrp = 'Enter the MRP printed on the pack.';
  else if (i.price > i.mrp) e.price = 'Selling price cannot be higher than the MRP.';
  if (i.cost < 0) e.cost = 'Purchase cost cannot be negative.';
  else if (i.price > 0 && i.cost > i.price) e.cost = 'Purchase cost is higher than the selling price. Check this before saving.';
  if (i.reorderLevel < 0) e.reorderLevel = 'Reorder level cannot be negative.';
  return e;
}

export function createCatalogMock(store: MockStore): CatalogApi {
  const items = store.items;
  const extraBarcodes = new Map<string, string[]>();
  const scaleCodes = new Map<string, string>();
  const parents = new Map<string, string>();
  const movements: StockMovement[] = [];
  const adjustments: StockAdjustment[] = [];
  let seq = 0;
  let nextInternal = 1;

  // Seed: scale codes for loose items, parent links from packed items to their loose item, a few spare barcodes.
  const looseByBase = new Map<string, Item>();
  for (const it of items) if (it.loose) {
    looseByBase.set(it.name.replace(/ \(Loose\)$/, ''), it);
    scaleCodes.set(it.id, it.code);
  }
  for (const it of items) if (!it.loose && it.packSize) {
    const base = it.name.slice(0, it.name.length - it.packSize.length).trim();
    const p = looseByBase.get(base);
    if (p) parents.set(it.id, p.id);
  }
  items.filter((i) => !i.loose && i.categoryId === 'oil').slice(0, 6).forEach((it, k) => {
    const body = `8906${String(70000 + k * 7).padStart(8, '0')}`;
    extraBarcodes.set(it.id, [body + ean13Checksum(body)]);
  });

  const brandNames = ['Gokul', 'Loose', ...new Set(items.map((i) => i.brand))];
  const brands: Brand[] = [...new Set(brandNames)].map((name, k) => ({ id: `br${k + 1}`, name }));

  const allBarcodes = (it: Item) => [it.barcode, ...(extraBarcodes.get(it.id) ?? [])];
  const byId = (id: string) => items.find((i) => i.id === id);
  const catName = (id: string) => store.categories.find((c) => c.id === id)?.name ?? '';
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  const clash = (list: { id: string; name: string }[], name: string, selfId?: string) =>
    list.some((x) => x.id !== selfId && x.name.toLowerCase() === name.toLowerCase());
  const move = <T,>(list: T[], idx: number, delta: -1 | 1) => {
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= list.length) return;
    const [x] = list.splice(idx, 1);
    list.splice(to, 0, x);
  };
  const log = (it: Item, kind: StockMovement['kind'], qty: Milli, note: string) => {
    seq += 1;
    movements.unshift({ id: `m${seq}`, at: new Date().toISOString(), itemId: it.id, itemName: it.name, kind, qty, note });
  };
  const current = () => items.map((i) => ({ id: i.id, code: i.code, barcodes: allBarcodes(i) }));

  const apply = (it: Item, qty: Milli, reason: AdjustReason, note: string, by = 'Suresh Kumar'): StockAdjustment => {
    it.stock = Math.max(0, it.stock + qty);
    seq += 1;
    const adj: StockAdjustment = {
      id: `a${seq}`, at: new Date().toISOString(), itemId: it.id, itemName: it.name, unit: it.unit, loose: it.loose,
      reason, qty, value: Math.round((it.cost * qty) / 1000), note, by,
    };
    adjustments.unshift(adj);
    log(it, 'adjustment', qty, `${ADJUST_REASONS.find((r) => r.value === reason)?.label}${note ? `: ${note}` : ''}`);
    return adj;
  };

  // A little history so the adjustments tab is not empty on first open.
  const seedAdj: [number, AdjustReason, number, string, number][] = [
    [1, 'leak', -2000, '200 ml bottles leaking at the cap', 1],
    [0, 'spill', -1250, 'Spilled while filling a customer can', 2],
    [6, 'sample', -500, 'Sample for Kovai fair stall', 3],
    [2, 'damage', -3000, 'Bottles broken in rack', 5],
    [20, 'correction', 4000, 'Recount after stock take', 8],
  ];
  for (const [idx, reason, qty, note, daysAgo] of seedAdj) {
    const it = items[idx];
    if (!it) continue;
    const q = it.loose ? qty : Math.round(qty / 1000) * 1000;
    const stock = it.stock;
    const a = apply(it, q, reason, note);
    it.stock = stock;
    const at = new Date(Date.now() - daysAgo * 86400000 - (daysAgo * 2.7 + 1) * 3600000).toISOString();
    a.at = at;
    movements[0].at = at;
  }

  return {
    getItemDetail: async (id) => {
      const it = byId(id);
      if (!it) return null;
      return { item: it, barcodes: allBarcodes(it), parentId: parents.get(id) ?? '', scaleCode: scaleCodes.get(id) ?? '' };
    },
    validateItem: async (input) => validateItemInput(input, current()),
    saveItem: async (input) => {
      const issues = validateItemInput(input, current());
      const blocking = Object.keys(issues).filter((k) => !(k === 'cost' && input.cost > input.price));
      if (blocking.length) return { ok: false, issues };
      const existing = input.id ? byId(input.id) : undefined;
      const fields = {
        code: input.code.trim(), barcode: input.barcodes[0], name: norm(input.name), nameTa: input.nameTa.trim() || undefined,
        categoryId: input.categoryId, category: catName(input.categoryId), brand: input.brand.trim() || 'Loose',
        unit: input.unit, loose: input.loose, packSize: input.loose ? undefined : input.packSize.trim(),
        hsn: input.hsn.trim(), gstRate: input.gstRate, mrp: input.mrp, price: input.price, cost: input.cost,
        reorderLevel: input.reorderLevel, active: input.active,
      };
      let it: Item;
      if (existing) { Object.assign(existing, fields); it = existing; }
      else {
        seq += 1;
        it = { id: `i${1000 + seq}`, stock: 0, ...fields };
        items.push(it);
      }
      extraBarcodes.set(it.id, input.barcodes.slice(1));
      if (input.loose && input.scaleCode) scaleCodes.set(it.id, input.scaleCode); else scaleCodes.delete(it.id);
      if (!input.loose && input.parentId) parents.set(it.id, input.parentId); else parents.delete(it.id);
      if (!brands.some((b) => b.name.toLowerCase() === it.brand.toLowerCase())) brands.push({ id: `br${brands.length + 1}-${seq}`, name: it.brand });
      return { ok: true, item: it };
    },
    generateBarcode: async () => {
      const used = new Set(items.flatMap(allBarcodes));
      for (;;) {
        const body = `2000${String(nextInternal).padStart(8, '0')}`;
        nextInternal += 1;
        const code = body + ean13Checksum(body);
        if (!used.has(code)) return code;
      }
    },
    nextItemCode: async () => String(Math.max(100, ...items.map((i) => Number(i.code) || 0)) + 1),
    listLooseItems: async () => items.filter((i) => i.loose),
    setItemsActive: async (ids, active) => { for (const id of ids) { const it = byId(id); if (it) it.active = active; } },
    setItemsCategory: async (ids, categoryId) => {
      for (const id of ids) { const it = byId(id); if (it) { it.categoryId = categoryId; it.category = catName(categoryId); } }
    },
    setItemsGst: async (ids, rate) => { for (const id of ids) { const it = byId(id); if (it) it.gstRate = rate; } },
    itemMovements: async (itemId, limit) => {
      const out: StockMovement[] = movements.filter((m) => m.itemId === itemId);
      for (const b of store.bills) for (const l of b.lines) if (l.itemId === itemId) {
        out.push({ id: `${b.id}-${itemId}`, at: b.at, itemId, itemName: l.name, kind: 'sale', qty: -l.qty, note: b.number });
      }
      for (const p of store.purchases) for (const l of p.lines) if (l.itemId === itemId) {
        out.push({ id: `${p.id}-${itemId}`, at: p.date, itemId, itemName: l.name, kind: 'purchase', qty: l.qty, note: `${p.number}, ${p.supplierName}` });
      }
      return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },

    listCategoriesWithCounts: async () => store.categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id).length })),
    addCategory: async (name) => {
      const n = norm(name);
      if (!n) return { ok: false, message: 'Enter a category name.' };
      if (clash(store.categories, n)) return { ok: false, message: `"${n}" already exists.` };
      seq += 1;
      store.categories.push({ id: `cat${seq}`, name: n });
      return { ok: true };
    },
    renameCategory: async (id, name) => {
      const n = norm(name);
      const c = store.categories.find((x) => x.id === id);
      if (!c) return { ok: false, message: 'Category not found.' };
      if (!n) return { ok: false, message: 'Enter a category name.' };
      if (clash(store.categories, n, id)) return { ok: false, message: `"${n}" already exists.` };
      c.name = n;
      for (const it of items) if (it.categoryId === id) it.category = n;
      return { ok: true };
    },
    deleteCategory: async (id) => {
      const count = items.filter((i) => i.categoryId === id).length;
      if (count > 0) return { ok: false, message: `${count} items still use this category. Move them to another category first.` };
      const idx = store.categories.findIndex((c) => c.id === id);
      if (idx >= 0) store.categories.splice(idx, 1);
      return { ok: true };
    },
    moveCategory: async (id, delta) => move(store.categories, store.categories.findIndex((c) => c.id === id), delta),

    listBrands: async () => brands.map((b) => ({ ...b, items: items.filter((i) => i.brand === b.name).length })),
    addBrand: async (name) => {
      const n = norm(name);
      if (!n) return { ok: false, message: 'Enter a brand name.' };
      if (clash(brands, n)) return { ok: false, message: `"${n}" already exists.` };
      seq += 1;
      brands.push({ id: `brn${seq}`, name: n });
      return { ok: true };
    },
    renameBrand: async (id, name) => {
      const n = norm(name);
      const b = brands.find((x) => x.id === id);
      if (!b) return { ok: false, message: 'Brand not found.' };
      if (!n) return { ok: false, message: 'Enter a brand name.' };
      if (clash(brands, n, id)) return { ok: false, message: `"${n}" already exists.` };
      for (const it of items) if (it.brand === b.name) it.brand = n;
      b.name = n;
      return { ok: true };
    },
    deleteBrand: async (id) => {
      const b = brands.find((x) => x.id === id);
      if (!b) return { ok: true };
      const count = items.filter((i) => i.brand === b.name).length;
      if (count > 0) return { ok: false, message: `${count} items still use this brand. Change their brand first.` };
      brands.splice(brands.indexOf(b), 1);
      return { ok: true };
    },
    moveBrand: async (id, delta) => move(brands, brands.findIndex((b) => b.id === id), delta),

    createAdjustment: async ({ itemId, reason, qty, note }) => {
      const it = byId(itemId);
      if (!it) return { ok: false, message: 'Choose an item first.' };
      if (qty === 0) return { ok: false, message: 'Enter a quantity more than zero.' };
      if (reason !== 'correction' && qty > 0) return { ok: false, message: `${reason[0].toUpperCase() + reason.slice(1)} can only reduce stock.` };
      if (it.stock + qty < 0) return { ok: false, message: `Only ${(it.stock / 1000).toFixed(it.loose ? 3 : 0)} ${it.unit} in stock. You cannot remove more than that.` };
      return { ok: true, adjustment: apply(it, qty, reason, note.trim()) };
    },
    listAdjustments: async () => [...adjustments].sort((a, b) => b.at.localeCompare(a.at)),
    startStockTake: async (categoryId) =>
      items.filter((i) => i.active && (categoryId === 'all' || i.categoryId === categoryId)).map((i) => ({
        itemId: i.id, code: i.code, name: i.name, unit: i.unit, loose: i.loose, category: i.category, system: i.stock, cost: i.cost,
      })),
    postStockTake: async (counts, note) => {
      let adjusted = 0; let unchanged = 0; let netValue = 0;
      for (const c of counts) {
        const it = byId(c.itemId);
        if (!it) continue;
        const diff = c.counted - it.stock;
        if (diff === 0) { unchanged += 1; continue; }
        const a = apply(it, diff, 'correction', note.trim() || 'Stock take');
        adjusted += 1; netValue += a.value;
      }
      return { adjusted, unchanged, netValue };
    },
  };
}
