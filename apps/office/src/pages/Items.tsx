import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Barcode, Check, ChevronRight, Eye, EyeOff, Package, Plus, Search, X } from 'lucide-react';
import { formatQty, fuzzyFilter, groupStock, type Category, type Item, type Supplier } from '@gokul/data';
import {
  Badge, Button, Checkbox, ColResizer, Combobox, DataTable, EmptyState, FilterBar, Input, Kbd, Money, PageHeader, ROW_COLS, Select, Sheet, Switch, cn,
  parseTracks, useResizableColumns, useToast, type ColumnDef, useRefreshOnFocus
} from '@gokul/ui';
import { api, useSession } from '../store';
import { ItemForm } from '../components/catalog/ItemForm';
import { ItemDetailPane } from '../components/catalog/ItemDetailPane';
import { AdjustmentDialog } from '../components/catalog/AdjustmentDialog';
import { unitText } from '../components/catalog/shared';

const stockState = (r: Item) => (r.stock <= 0 ? 'out' : r.stock <= r.reorderLevel ? 'low' : 'ok');
const worth = (r: Item) => Math.round((r.cost * r.stock) / 1000);

/** Column order for the grouped view. The first entry is the tick box, the rest are sortable headings. */
const GHEAD: [string, string, boolean][] = [
  ['pick', '', false], ['code', 'Code', false], ['name', 'Item', false], ['category', 'Category', false], ['type', 'Type', false],
  ['supplier', 'Supplier', false], ['price', 'Price', true], ['gst', 'GST', true], ['stock', 'Stock', true],
];
const GROUP_COLS = '36px 58px minmax(120px,1fr) 150px 86px 130px 92px 52px 104px';

export function Items() {
  const nav = useNavigate();
  const toast = useToast();
  const role = useSession((s) => s.user?.role);
  /** Purchase cost is for the owner and managers only, like the stock take screen. */
  const canSeeCost = role === 'owner' || role === 'manager';
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [supplierF, setSupplierF] = useState('all');
  const [type, setType] = useState('all');
  const [gst, setGst] = useState('all');
  const [stockF, setStockF] = useState('all');
  const [status, setStatus] = useState('active');
  const [groupBy, setGroupBy] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [gsort, setGsort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupScroll = useRef<HTMLDivElement>(null);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const rc = useResizableColumns('office-items-groups', parseTracks(GROUP_COLS, GHEAD.map((g) => g[0])));

  const reload = useCallback(async () => {
    const [x, c, s] = await Promise.all([api.listItems(), api.listCategories(), api.listSuppliers()]);
    setItems([...x]); setCats([...c]); setSuppliers([...s]);
    return x;
  }, []);
  useEffect(() => { void reload().then((x) => setSelId((s) => s ?? x[0]?.id ?? null)); }, [reload]);
  useRefreshOnFocus(() => { void reload(); });

  const rows = useMemo(() => {
    const base = items.filter((i) =>
      (cat === 'all' || i.categoryId === cat) &&
      (supplierF === 'all' || (supplierF === 'none' ? !i.supplierId : i.supplierId === supplierF)) &&
      (type === 'all' || (type === 'loose') === i.loose) &&
      (gst === 'all' || i.gstRate === Number(gst)) &&
      (stockF === 'all' || (stockF === 'low' ? stockState(i) !== 'ok' : stockState(i) === 'out')) &&
      (status === 'all' || (status === 'active') === i.active));
    return fuzzyFilter(base, q, (i) => [i.name, i.code, i.barcode, i.nameTa ?? ''], Infinity);
  }, [items, q, cat, supplierF, type, gst, stockF, status]);

  /** Searchable supplier filter: every supplier with how many items it supplies, plus the items with none. */
  const supplierOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of items) if (i.supplierId) count.set(i.supplierId, (count.get(i.supplierId) ?? 0) + 1);
    const known = new Set(suppliers.map((s) => s.id));
    const extra = new Map(items.filter((i) => i.supplierId && !known.has(i.supplierId)).map((i) => [i.supplierId!, i.supplier || i.supplierId!]));
    const hint = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
    return [
      { value: 'all', label: 'All suppliers', hint: hint(items.length) },
      ...suppliers.map((s) => ({ value: s.id, label: s.name, hint: hint(count.get(s.id) ?? 0) })),
      ...[...extra].map(([id, name]) => ({ value: id, label: name, hint: hint(count.get(id) ?? 0) })),
      { value: 'none', label: 'No supplier', hint: hint(items.filter((i) => !i.supplierId).length) },
    ];
  }, [items, suppliers]);

  const sortedGroupRows = useMemo(() => {
    const get: Record<string, (i: Item) => string | number> = {
      code: (i) => Number(i.code) || 0, name: (i) => i.name.toLowerCase(), category: (i) => i.category.toLowerCase(),
      type: (i) => (i.loose ? 'Loose' : 'Packed'), supplier: (i) => (i.supplier ?? '').toLowerCase(),
      price: (i) => i.price, gst: (i) => i.gstRate, stock: (i) => i.stock,
    };
    const f = get[gsort.key] ?? get.name;
    return [...rows].sort((a, b) => {
      const x = f(a); const y = f(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
      return (c || a.name.localeCompare(b.name)) * gsort.dir;
    });
  }, [rows, gsort]);
  const groups = useMemo(() => groupStock(sortedGroupRows, 'supplier', (i) => (
    { key: i.supplier ?? '', qty: i.stock, sales: Math.round((i.price * i.stock) / 1000), cost: worth(i) }
  ), 'No supplier'), [sortedGroupRows]);
  const visibleIds = useMemo(() => (groupBy ? groups.filter((g) => !closed.has(g.key)).flatMap((g) => g.rows.map((r) => r.id)) : []), [groupBy, groups, closed]);

  const sortBy = useCallback((key: string) => setGsort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 })), []);
  const chooseGroupRow = useCallback((i: number) => {
    const id = visibleIds[Math.max(0, Math.min(visibleIds.length - 1, i))];
    if (!id) return;
    setSelId(id);
    rowEls.current.get(id)?.scrollIntoView({ block: 'nearest' });
  }, [visibleIds]);

  const sel = items.find((i) => i.id === selId) ?? null;
  const activeFilters = [cat, type, gst, stockF].filter((v) => v !== 'all').length + (supplierF !== 'all' ? 1 : 0) + (status !== 'active' ? 1 : 0) + (q ? 1 : 0);
  const clearFilters = () => { setQ(''); setCat('all'); setSupplierF('all'); setType('all'); setGst('all'); setStockF('all'); setStatus('active'); };

  const toggle = useCallback((id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const allShown = rows.length > 0 && rows.every((r) => checked.has(r.id));

  const columns = useMemo<ColumnDef<Item>[]>(() => [
    {
      id: 'pick', enableSorting: false, meta: { w: '36px' },
      header: () => (
        <Checkbox checked={allShown} onCheckedChange={(c) => setChecked(c ? new Set(rows.map((r) => r.id)) : new Set())} />
      ),
      cell: (c) => <span onClick={(e) => e.stopPropagation()}><Checkbox checked={checked.has(c.row.original.id)} onCheckedChange={() => toggle(c.row.original.id)} /></span>,
    },
    { accessorKey: 'code', header: 'Code', meta: { w: '58px', num: true } },
    {
      accessorKey: 'name', header: 'Item', meta: { w: 'minmax(120px,1fr)' },
      cell: (c) => (
        <span className={c.row.original.active ? 'font-medium text-ink' : 'font-medium text-subtle line-through'}>{c.getValue<string>()}</span>
      ),
    },
    { accessorKey: 'category', header: 'Category', meta: { w: '150px' }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
    {
      accessorKey: 'supplier', header: 'Supplier', meta: { w: '130px' },
      cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>() ?? ''}>{c.getValue<string>() || '-'}</span>,
    },
    {
      id: 'type', header: 'Type', meta: { w: '86px' }, accessorFn: (r) => (r.loose ? 'Loose' : 'Packed'),
      cell: (c) => <Badge tone={c.getValue<string>() === 'Loose' ? 'info' : 'neutral'}>{c.getValue<string>()}</Badge>,
    },
    { accessorKey: 'price', header: 'Price', meta: { w: '92px', align: 'right', num: true }, cell: (c) => <Money paise={c.getValue<number>()} /> },
    { accessorKey: 'gstRate', header: 'GST', meta: { w: '52px', align: 'right', num: true }, cell: (c) => `${c.getValue<number>()}%` },
    {
      accessorKey: 'stock', header: 'Stock', meta: { w: '104px', align: 'right', num: true },
      cell: (c) => {
        const r = c.row.original; const s = stockState(r);
        return <span className={s === 'out' ? 'font-semibold text-danger' : s === 'low' ? 'font-semibold text-warning' : ''}>{formatQty(r.stock, r.loose)} {unitText(r.unit)}</span>;
      },
    },
  ], [allShown, checked, rows, toggle]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      const control = t?.closest('button, a, [role="combobox"], [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditing({}); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === ' ' && !typing && selId && !editing && !adjusting) { e.preventDefault(); toggle(selId); }
      else if (e.key === 'Escape' && !typing && checked.size && !editing && !adjusting) setChecked(new Set());
      else if (groupBy && !typing && !control && !editing && !adjusting) {
        // The grouped view is a plain grid (no DataTable), so it carries the same row keys itself.
        const i = visibleIds.indexOf(selId ?? '');
        const page = Math.max(1, Math.floor((groupScroll.current?.clientHeight ?? 300) / 36) - 1);
        if (e.key === 'ArrowDown') { e.preventDefault(); chooseGroupRow(i < 0 ? 0 : i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); chooseGroupRow(i < 0 ? 0 : i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); chooseGroupRow(0); }
        else if (e.key === 'End') { e.preventDefault(); chooseGroupRow(visibleIds.length - 1); }
        else if (e.key === 'PageDown') { e.preventDefault(); chooseGroupRow(i + page); }
        else if (e.key === 'PageUp') { e.preventDefault(); chooseGroupRow(i - page); }
        else if (e.key === 'Enter' && selId) { e.preventDefault(); setEditing({ id: selId }); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selId, toggle, checked.size, editing, adjusting, groupBy, visibleIds, chooseGroupRow]);

  const ids = [...checked];
  const bulk = async (label: string, run: () => Promise<void>) => {
    await run(); await reload();
    toast.show({ tone: 'success', title: label, detail: `${ids.length} items updated` });
  };

  return (
    <>
      <PageHeader
        title="Items" subtitle={`${items.length} items, ${items.filter((i) => stockState(i) !== 'ok').length} need reorder`} icon={<Package size={17} />}
        actions={<>
          <Switch checked={groupBy} onCheckedChange={setGroupBy} label="Group by supplier" />
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})} kbd="Ctrl+N">New item</Button>
        </>}
      />
      {checked.size > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary-soft px-4 py-2">
          <span className="text-sm font-semibold text-primary">{checked.size} selected</span>
          <span className="mx-1 h-4 w-px bg-primary/30" />
          <div className="w-44"><Select size="sm" value="" onChange={(e) => e.target.value && void bulk('Category changed', () => api.setItemsCategory(ids, e.target.value))} options={[{ value: '', label: 'Move to category...' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} /></div>
          <div className="w-32"><Select size="sm" value="" onChange={(e) => e.target.value !== '' && void bulk('GST rate changed', () => api.setItemsGst(ids, Number(e.target.value) as Item['gstRate']))} options={[{ value: '', label: 'Set GST...' }, ...[0, 5, 12, 18].map((r) => ({ value: String(r), label: `${r}%` }))]} /></div>
          <Button size="sm" icon={<Eye size={13} />} onClick={() => void bulk('Items activated', () => api.setItemsActive(ids, true))}>Activate</Button>
          <Button size="sm" icon={<EyeOff size={13} />} onClick={() => void bulk('Items deactivated', () => api.setItemsActive(ids, false))}>Deactivate</Button>
          <Button size="sm" icon={<Barcode size={13} />} onClick={() => nav('/labels', { state: { ids } })}>Print labels</Button>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-xs text-muted"><Kbd>Space</Kbd> tick row</span>
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setChecked(new Set())} kbd="Esc">Clear</Button>
        </div>
      ) : (
        <FilterBar trailing={<span className="whitespace-nowrap">{rows.length} of {items.length}</span>}>
          <div className="w-[230px]"><Input ref={searchRef} icon={<Search size={15} />} placeholder="Name, code or barcode" kbd="Ctrl+F" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="w-[180px]"><Combobox options={supplierOptions} value={supplierF} onChange={setSupplierF} placeholder="All suppliers" /></div>
          <div className="w-[180px]"><Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} /></div>
          <div className="w-[140px]"><Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'all', label: 'All types' }, { value: 'loose', label: 'Loose only' }, { value: 'packed', label: 'Packed only' }]} /></div>
          <div className="w-[104px]"><Select value={gst} onChange={(e) => setGst(e.target.value)} options={[{ value: 'all', label: 'Any GST' }, ...[0, 5, 12, 18].map((r) => ({ value: String(r), label: `GST ${r}%` }))]} /></div>
          <div className="w-[124px]"><Select value={stockF} onChange={(e) => setStockF(e.target.value)} options={[{ value: 'all', label: 'Any stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} /></div>
          <div className="w-[150px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active only' }, { value: 'inactive', label: 'Inactive only' }, { value: 'all', label: 'All statuses' }]} /></div>
          {activeFilters > 0 && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={clearFilters}>Clear filters</Button>}
        </FilterBar>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        {groupBy ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            <div ref={groupScroll} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none">
              <div ref={rc.rootProps.ref} onMouseOver={rc.rootProps.onMouseOver} style={rc.rootProps.style} className="min-w-full">
                <div onContextMenu={rc.headerProps.onContextMenu} className="sticky top-0 z-10 grid h-8 items-center border-b border-line bg-surface-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: ROW_COLS }}>
                  {GHEAD.map(([key, label, right], hi) => (
                    <div key={key} className={cn('relative flex h-full min-w-0 items-center overflow-hidden px-2', right && 'justify-end')}>
                      {key === 'pick' ? (
                        <Checkbox checked={allShown} onCheckedChange={(c) => setChecked(c ? new Set(rows.map((r) => r.id)) : new Set())} />
                      ) : (
                        <button onClick={() => sortBy(key)} className={cn('flex min-w-0 flex-1 items-center gap-1 truncate text-left uppercase hover:text-ink', right && 'justify-end', gsort.key === key && 'text-primary')}>
                          <span className="truncate">{label}</span>
                          {gsort.key === key && (gsort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </button>
                      )}
                      <ColResizer rc={rc} index={hi} />
                    </div>
                  ))}
                </div>
                {groups.length === 0 && (
                  <div className="py-10"><EmptyState icon={<Package size={22} />} title="No items match" hint="Try a different name, or clear the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} /></div>
                )}
                {groups.map((g) => {
                  const open = !closed.has(g.key);
                  return (
                    <div key={g.key || '_none'}>
                      <button
                        onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                        className="flex h-10 w-full items-center gap-3 border-b border-line bg-surface-3 px-4 text-left text-sm font-semibold text-ink hover:bg-surface-2"
                      >
                        <ChevronRight size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
                        <span className="truncate">{g.label}</span>
                        <span className="num shrink-0 text-xs font-normal text-muted">{g.count} {g.count === 1 ? 'item' : 'items'}</span>
                        <span className="flex-1" />
                        {canSeeCost && <span className="num shrink-0 text-xs font-semibold text-primary">Value at cost <Money paise={g.cost} decimals={false} /></span>}
                      </button>
                      {open && g.rows.map((r) => {
                        const s = stockState(r);
                        return (
                          <div
                            key={r.id}
                            ref={(el) => { if (el) rowEls.current.set(r.id, el); else rowEls.current.delete(r.id); }}
                            onClick={() => setSelId(r.id)}
                            onDoubleClick={() => setEditing({ id: r.id })}
                            className={cn('grid h-9 cursor-default items-center border-b border-line/70 px-4 text-sm', selId === r.id ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                            style={{ gridTemplateColumns: ROW_COLS }}
                          >
                            <span onClick={(e) => e.stopPropagation()} className="flex items-center px-2"><Checkbox checked={checked.has(r.id)} onCheckedChange={() => toggle(r.id)} /></span>
                            <span className="num truncate px-2 text-muted">{r.code}</span>
                            <span className={cn('truncate px-2 font-medium', r.active ? 'text-ink' : 'text-subtle line-through')} title={r.name}>{r.name}</span>
                            <span className="truncate px-2 text-muted" title={r.category}>{r.category}</span>
                            <span className="px-2"><Badge tone={r.loose ? 'info' : 'neutral'}>{r.loose ? 'Loose' : 'Packed'}</Badge></span>
                            <span className="truncate px-2 text-muted" title={r.supplier ?? ''}>{r.supplier || '-'}</span>
                            <span className="num px-2 text-right"><Money paise={r.price} /></span>
                            <span className="num px-2 text-right">{r.gstRate}%</span>
                            <span className={cn('num truncate px-2 text-right', s === 'out' ? 'font-semibold text-danger' : s === 'low' ? 'font-semibold text-warning' : '')}>{formatQty(r.stock, r.loose)} {unitText(r.unit)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-surface-2 px-4 text-xs text-muted">
              <span>Up and down to move, Enter to edit, Space to tick</span>
              <span className="flex items-center gap-1"><Check size={12} /> Prices include GST</span>
            </div>
          </div>
        ) : (
          <DataTable
            data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)}
            onActivate={(r) => setEditing({ id: r.id })}
            empty={<EmptyState icon={<Package size={22} />} title="No items match" hint="Try a different name, or clear the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />}
            footer={<><span>Up and down to move, Enter to edit, Space to tick</span><span className="flex items-center gap-1"><Check size={12} /> Prices include GST</span></>}
          />
        )}
        {sel && <ItemDetailPane item={sel} onEdit={() => setEditing({ id: sel.id })} onAdjust={() => setAdjusting(true)} />}
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} width={1000} title={editing?.id ? 'Edit item' : 'New item'} description="Barcodes, units, loose or packed, GST, MRP and prices">
        {editing && (
          <ItemForm
            itemId={editing.id}
            onCancel={() => setEditing(null)}
            onSaved={(it) => { setEditing(null); void reload().then(() => { setSelId(it.id); setQ(''); }); }}
          />
        )}
      </Sheet>
      <AdjustmentDialog open={adjusting} onOpenChange={setAdjusting} itemId={sel?.id} onDone={() => void reload()} />
    </>
  );
}
