import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, FolderInput, Package, Plus, Search, Tag, Tags, X } from 'lucide-react';
import { formatQty, type CountedBrand, type CountedCategory, type Item } from '@gokul/data';
import { Badge, Button, Checkbox, DataTable, EmptyState, Input, Kbd, Money, Select, Sheet, cn, useToast, type ColumnDef } from '@gokul/ui';
import { api } from '../../store';
import { ItemForm } from './ItemForm';
import { ActiveDialog, PickDialog } from './BulkDialogs';
import { unitText } from './shared';

type Status = 'all' | 'active' | 'inactive';
type SortKey = 'code' | 'name' | 'category' | 'brand' | 'supplier' | 'mrp' | 'price' | 'stock' | 'active';
const PAGE = 1000;

const stockState = (r: Item) => (r.stock < 0 ? 'negative' : r.stock === 0 ? 'out' : r.stock <= r.reorderLevel ? 'low' : 'ok');

/** Products in the current category / brand selection, with bulk clean-up actions. Loads every match (no cap). */
export function CatalogItemsPane({ category, brand, cats, brands, canEdit, onClearCategory, onClearBrand, onChanged }: {
  category: CountedCategory | null; brand: CountedBrand | null; cats: CountedCategory[]; brands: CountedBrand[]; canEdit: boolean;
  onClearCategory: () => void; onClearBrand: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [dialog, setDialog] = useState<null | 'category' | 'brand' | 'activate' | 'deactivate'>(null);
  const anchor = useRef<string | null>(null);
  const reqId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const categoryId = category?.id;
  const brandId = brand?.id;

  useEffect(() => { const t = window.setTimeout(() => setTerm(search), 120); return () => window.clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    const mine = ++reqId.current;
    let acc: Item[] = [];
    for (;;) {
      const p = await api.listItemsPage({ categoryId, brandId, search: term, status, offset: acc.length, limit: PAGE });
      if (mine !== reqId.current) return;
      acc = acc.concat(p.items);
      setItems(acc); setTotal(p.total); setLoaded(true);
      if (acc.length >= p.total || p.items.length === 0) break;
    }
    setChecked((c) => { const ids = new Set(acc.map((i) => i.id)); const n = new Set([...c].filter((x) => ids.has(x))); return n.size === c.size ? c : n; });
  }, [categoryId, brandId, term, status]);
  useEffect(() => { void load(); }, [load]);
  // A different selection is a fresh start for ticks.
  useEffect(() => { setChecked(new Set()); anchor.current = null; }, [categoryId, brandId, term, status]);

  const rows = useMemo(() => {
    if (!sort) return items;
    const key: Record<string, (i: Item) => string | number> = {
      code: (i) => Number(i.code) || 0, name: (i) => i.name.toLowerCase(), category: (i) => i.category.toLowerCase(), brand: (i) => i.brand.toLowerCase(), supplier: (i) => (i.supplier ?? '').toLowerCase(),
      mrp: (i) => i.mrp, price: (i) => i.price, stock: (i) => i.stock, active: (i) => (i.active ? 1 : 0),
    };
    const f = key[sort.id as SortKey];
    if (!f) return items;
    return [...items].sort((a, b) => { const x = f(a); const y = f(b); const c = x < y ? -1 : x > y ? 1 : 0; return sort.desc ? -c : c; });
  }, [items, sort]);

  const index = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const tick = useCallback((id: string, range: boolean) => {
    setChecked((s) => {
      const n = new Set(s);
      const a = anchor.current;
      if (range && a && index.has(a) && index.has(id)) {
        const [from, to] = [index.get(a)!, index.get(id)!].sort((x, y) => x - y);
        const on = !s.has(id);
        for (let k = from; k <= to; k++) { if (on) n.add(rows[k].id); else n.delete(rows[k].id); }
      } else if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    anchor.current = id;
  }, [index, rows]);

  const allShown = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const someShown = checked.size > 0 && !allShown;
  const ids = useMemo(() => [...checked], [checked]);

  const columns = useMemo<ColumnDef<Item>[]>(() => {
    const cols: ColumnDef<Item>[] = [
      {
        id: 'pick', enableSorting: false, meta: { w: '36px' },
        header: () => (
          <span title="Select all in view (Ctrl+A)" className={cn(someShown && 'opacity-70')}>
            <Checkbox checked={allShown} onCheckedChange={(c) => setChecked(c ? new Set(rows.map((r) => r.id)) : new Set())} />
          </span>
        ),
        cell: (c) => {
          const id = c.row.original.id;
          // The wrapper sees the click with its Shift state; the checkbox itself only reports on/off.
          return <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); tick(id, e.shiftKey); }} className="flex h-8 w-6 items-center"><Checkbox checked={checked.has(id)} onCheckedChange={() => undefined} /></span>;
        },
      },
      { id: 'code', accessorKey: 'code', header: 'Code', meta: { w: '52px', num: true }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
      {
        id: 'name', accessorKey: 'name', header: 'Item name', meta: { w: 'minmax(150px,1fr)' },
        cell: (c) => {
          const r = c.row.original;
          return (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className={cn('truncate font-medium', r.active ? 'text-ink' : 'text-subtle')}>{r.name}</span>
              {r.nameTa && <span className="truncate text-[11px] text-muted">{r.nameTa}</span>}
            </span>
          );
        },
      },
    ];
    if (!category) cols.push({ id: 'category', accessorKey: 'category', header: 'Category', meta: { w: '128px' }, cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>()}</span> });
    if (!brand) cols.push({ id: 'brand', accessorKey: 'brand', header: 'Brand', meta: { w: '110px' }, cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>()}</span> });
    cols.push(
      { id: 'supplier', accessorKey: 'supplier', header: 'Supplier', meta: { w: '120px' }, cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>() ?? ''}>{c.getValue<string>() || '-'}</span> },
      { id: 'mrp', accessorKey: 'mrp', header: 'MRP', meta: { w: '86px', align: 'right', num: true }, cell: (c) => <span className="text-muted"><Money paise={c.getValue<number>()} /></span> },
      { id: 'price', accessorKey: 'price', header: 'Price', meta: { w: '86px', align: 'right', num: true }, cell: (c) => <Money paise={c.getValue<number>()} /> },
      {
        id: 'stock', accessorKey: 'stock', header: 'Stock', meta: { w: '90px', align: 'right', num: true },
        cell: (c) => {
          const r = c.row.original; const s = stockState(r);
          const txt = `${formatQty(r.stock, r.loose)} ${unitText(r.unit)}`;
          if (s === 'negative') return <span className="font-semibold text-danger" title="Negative stock: check purchases and stock take">{txt}</span>;
          if (s === 'out') return <span className="font-semibold text-danger">{txt}</span>;
          if (s === 'low') return <span className="font-semibold text-warning" title="At or below the reorder level">{txt}</span>;
          return <span>{txt}</span>;
        },
      },
      { id: 'active', accessorKey: 'active', header: 'Active', meta: { w: '60px', align: 'center' }, cell: (c) => (c.getValue<boolean>() ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>) },
    );
    return cols;
  }, [allShown, someShown, checked, rows, tick, category, brand]);

  const sel = rows.find((r) => r.id === selId) ?? null;
  const head = [category?.name, brand?.name].filter(Boolean).join(' · ') || 'All items';
  const clearSearch = () => { setSearch(''); setTerm(''); searchRef.current?.focus(); };

  /** Keys for the table area: Space ticks the row, Shift+Up/Down extends the ticks, Ctrl+A ticks everything in view, Esc clears. */
  const onTableKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON') return;
    if (e.key === ' ' && selId) { e.preventDefault(); tick(selId, false); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setChecked(new Set(rows.map((r) => r.id))); }
    else if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && selId) {
      const i = index.get(selId) ?? 0;
      const j = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      setChecked((s) => new Set(s).add(rows[i].id).add(rows[j].id));
    } else if (e.key === 'Escape' && checked.size) { setChecked(new Set()); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editing || dialog) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditing({}); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editing, dialog]);

  const done = async (title: string, detail: string) => {
    setChecked(new Set()); anchor.current = null;
    await load(); onChanged();
    toast.show({ tone: 'success', title, detail });
  };
  const n = ids.length;
  const noun = `${n} ${n === 1 ? 'item' : 'items'}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" onKeyDown={onTableKey}>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight text-ink">
            {head}<span className="font-normal text-muted"> · <span className="num">{total}</span> {total === 1 ? 'product' : 'products'}</span>
          </h2>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})} kbd="Ctrl+N">New item</Button>
      </div>

      {n > 0 ? (
        <div className="flex h-11 shrink-0 items-center gap-2 border-y border-primary/30 bg-primary-soft px-4">
          <span className="whitespace-nowrap text-sm font-semibold text-primary num">{n} selected</span>
          <span className="mx-1 h-4 w-px bg-primary/30" />
          {canEdit ? (
            <>
              <Button size="sm" icon={<FolderInput size={13} />} onClick={() => setDialog('category')}>Move to category</Button>
              <Button size="sm" icon={<Tag size={13} />} onClick={() => setDialog('brand')}>Set brand</Button>
              <Button size="sm" icon={<Eye size={13} />} onClick={() => setDialog('activate')}>Activate</Button>
              <Button size="sm" icon={<EyeOff size={13} />} onClick={() => setDialog('deactivate')}>Deactivate</Button>
            </>
          ) : <span className="text-xs text-muted">Only the owner or a manager can change items.</span>}
          <div className="flex-1" />
          {!allShown && <Button size="sm" variant="ghost" onClick={() => setChecked(new Set(rows.map((r) => r.id)))}>Select all {rows.length}</Button>}
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setChecked(new Set())} kbd="Esc">Clear</Button>
        </div>
      ) : (
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
          <div className="w-[260px]">
            <Input ref={searchRef} icon={<Search size={15} />} placeholder="Name, code or barcode" kbd="Ctrl+F" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.stopPropagation(); setSearch(''); } }} />
          </div>
          {category && <Chip icon={<Tags size={12} />} label={category.name} onClear={onClearCategory} />}
          {brand && <Chip icon={<Tag size={12} />} label={brand.name} onClear={onClearBrand} />}
          <div className="flex-1" />
          <div className="w-[128px]">
            <Select size="sm" value={status} onChange={(e) => setStatus(e.target.value as Status)} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active only' }, { value: 'inactive', label: 'Inactive only' }]} />
          </div>
        </div>
      )}

      <DataTable
        data={rows} columns={columns} getRowId={(r) => r.id} rowHeight={44} selectedId={selId} onSelect={(r) => setSelId(r.id)}
        onActivate={(r) => setEditing({ id: r.id })} sort={sort} onSortChange={setSort}
        empty={!loaded ? <div className="py-10 text-center text-sm text-muted">Loading items...</div> : term ? (
          <EmptyState icon={<Search size={22} />} title={`Nothing matches "${term}"`} hint={`Check the spelling, or search by code or barcode.${category || brand ? ' Only the selected category and brand are searched.' : ''}`} action={<Button onClick={clearSearch}>Clear search</Button>} />
        ) : (
          <EmptyState
            icon={<Package size={22} />} title={category || brand ? `No products in ${head} yet` : 'No items yet'}
            hint={category || brand ? 'Add one with New item, or tick products elsewhere and move them here.' : 'Add your first item to start billing.'}
            action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>New item</Button>}
          />
        )}
        footer={
          <>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Kbd>Space</Kbd> tick</span>
              <span className="flex items-center gap-1"><Kbd>Shift</Kbd> click for a range</span>
              <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>A</Kbd> all in view</span>
              <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
            </span>
            <span className="num">{sel ? `${sel.name}` : `${rows.length} shown`}</span>
          </>
        }
      />

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} width={1000} title={editing?.id ? 'Edit item' : 'New item'} description="Barcodes, units, loose or packed, GST, MRP and prices">
        {editing && (
          <ItemForm
            itemId={editing.id} defaults={{ categoryId: category?.id, brand: brand?.name }}
            onCancel={() => setEditing(null)}
            onSaved={(it) => { setEditing(null); setSelId(it.id); void load(); onChanged(); }}
          />
        )}
      </Sheet>

      <PickDialog
        open={dialog === 'category'} onClose={() => setDialog(null)} title="Move to category" noun="category" count={n} options={cats} confirmLabel="Move"
        onConfirm={async (id) => { await api.setItemsCategory(ids, id); await done('Moved', `${noun} moved to ${cats.find((c) => c.id === id)?.name}`); }}
      />
      <PickDialog
        open={dialog === 'brand'} onClose={() => setDialog(null)} title="Set brand" noun="brand" count={n} options={brands} confirmLabel="Set brand for"
        onConfirm={async (id) => { await api.setItemsBrand(ids, id); await done('Brand changed', `${noun} now ${brands.find((b) => b.id === id)?.name}`); }}
      />
      <ActiveDialog
        open={dialog === 'activate' || dialog === 'deactivate'} onClose={() => setDialog(null)} active={dialog === 'activate'} count={n}
        onConfirm={async () => { const on = dialog === 'activate'; await api.setItemsActive(ids, on); await done(on ? 'Activated' : 'Deactivated', noun); }}
      />
    </div>
  );
}

function Chip({ icon, label, onClear }: { icon: React.ReactNode; label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded-full bg-primary-soft pl-2 pr-1 text-sm font-medium text-primary">
      {icon}<span className="truncate">{label}</span>
      <button type="button" aria-label={`Clear ${label}`} title="Clear" onClick={onClear} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/15"><X size={12} /></button>
    </span>
  );
}
