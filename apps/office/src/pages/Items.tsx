import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barcode, Check, Eye, EyeOff, Package, Plus, Search, X } from 'lucide-react';
import { formatQty, fuzzyFilter, type Category, type Item } from '@gokul/data';
import {
  Badge, Button, Checkbox, DataTable, EmptyState, FilterBar, Input, Kbd, Money, PageHeader, Select, Sheet, useToast, type ColumnDef,
} from '@gokul/ui';
import { api } from '../store';
import { ItemForm } from '../components/catalog/ItemForm';
import { ItemDetailPane } from '../components/catalog/ItemDetailPane';
import { AdjustmentDialog } from '../components/catalog/AdjustmentDialog';
import { unitText } from '../components/catalog/shared';

const stockState = (r: Item) => (r.stock <= 0 ? 'out' : r.stock <= r.reorderLevel ? 'low' : 'ok');

export function Items() {
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [type, setType] = useState('all');
  const [gst, setGst] = useState('all');
  const [stockF, setStockF] = useState('all');
  const [status, setStatus] = useState('active');
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [x, c] = await Promise.all([api.listItems(), api.listCategories()]);
    setItems([...x]); setCats([...c]);
    return x;
  }, []);
  useEffect(() => { void reload().then((x) => setSelId((s) => s ?? x[0]?.id ?? null)); }, [reload]);

  const rows = useMemo(() => {
    const base = items.filter((i) =>
      (cat === 'all' || i.categoryId === cat) &&
      (type === 'all' || (type === 'loose') === i.loose) &&
      (gst === 'all' || i.gstRate === Number(gst)) &&
      (stockF === 'all' || (stockF === 'low' ? stockState(i) !== 'ok' : stockState(i) === 'out')) &&
      (status === 'all' || (status === 'active') === i.active));
    return fuzzyFilter(base, q, (i) => [i.name, i.code, i.barcode, i.nameTa ?? ''], Infinity);
  }, [items, q, cat, type, gst, stockF, status]);

  const sel = items.find((i) => i.id === selId) ?? null;
  const activeFilters = [cat, type, gst, stockF].filter((v) => v !== 'all').length + (status !== 'active' ? 1 : 0) + (q ? 1 : 0);
  const clearFilters = () => { setQ(''); setCat('all'); setType('all'); setGst('all'); setStockF('all'); setStatus('active'); };

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditing({}); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === ' ' && !typing && selId && !editing && !adjusting) { e.preventDefault(); toggle(selId); }
      else if (e.key === 'Escape' && !typing && checked.size && !editing && !adjusting) setChecked(new Set());
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selId, toggle, checked.size, editing, adjusting]);

  const ids = [...checked];
  const bulk = async (label: string, run: () => Promise<void>) => {
    await run(); await reload();
    toast.show({ tone: 'success', title: label, detail: `${ids.length} items updated` });
  };

  return (
    <>
      <PageHeader
        title="Items" subtitle={`${items.length} items, ${items.filter((i) => stockState(i) !== 'ok').length} need reorder`} icon={<Package size={17} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})} kbd="Ctrl+N">New item</Button>}
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
          <div className="w-[180px]"><Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} /></div>
          <div className="w-[140px]"><Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'all', label: 'All types' }, { value: 'loose', label: 'Loose only' }, { value: 'packed', label: 'Packed only' }]} /></div>
          <div className="w-[104px]"><Select value={gst} onChange={(e) => setGst(e.target.value)} options={[{ value: 'all', label: 'Any GST' }, ...[0, 5, 12, 18].map((r) => ({ value: String(r), label: `GST ${r}%` }))]} /></div>
          <div className="w-[124px]"><Select value={stockF} onChange={(e) => setStockF(e.target.value)} options={[{ value: 'all', label: 'Any stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} /></div>
          <div className="w-[150px]"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active only' }, { value: 'inactive', label: 'Inactive only' }, { value: 'all', label: 'All statuses' }]} /></div>
          {activeFilters > 0 && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={clearFilters}>Clear filters</Button>}
        </FilterBar>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <DataTable
          data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)}
          onActivate={(r) => setEditing({ id: r.id })}
          empty={<EmptyState icon={<Package size={22} />} title="No items match" hint="Try a different name, or clear the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />}
          footer={<><span>Up and down to move, Enter to edit, Space to tick</span><span className="flex items-center gap-1"><Check size={12} /> Prices include GST</span></>}
        />
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
