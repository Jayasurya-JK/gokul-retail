import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Boxes, ChevronRight, IndianRupee, PackageX, Search, TriangleAlert } from 'lucide-react';
import { formatQty, fuzzyFilter, groupStock, type Category, type GroupBy, type Item } from '@gokul/data';
import { Badge, ColResizer, DataTable, EmptyState, FilterBar, Input, Money, ROW_COLS, Select, StatTile, cn, parseTracks, useResizableColumns, type ColumnDef } from '@gokul/ui';
import { api } from '../../store';
import { unitText } from './shared';

const state = (r: Item) => (r.stock <= 0 ? 'out' : r.stock <= r.reorderLevel ? 'low' : 'ok');
const worth = (r: Item) => Math.round((r.cost * r.stock) / 1000);

const columns: ColumnDef<Item>[] = [
  { accessorKey: 'code', header: 'Code', meta: { w: '64px', num: true } },
  { accessorKey: 'name', header: 'Item', meta: { w: 'minmax(160px,1fr)' }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
  { accessorKey: 'category', header: 'Category', meta: { w: 'minmax(130px,.6fr)' }, cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>()}</span> },
  { accessorKey: 'brand', header: 'Brand', meta: { w: 'minmax(110px,.5fr)' }, cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>()}</span> },
  { id: 'supplier', header: 'Supplier', meta: { w: 'minmax(120px,.6fr)' }, accessorFn: (r) => r.supplier ?? '', cell: (c) => <span className="block truncate text-muted" title={c.getValue<string>()}>{c.getValue<string>() || '-'}</span> },
  {
    accessorKey: 'stock', header: 'In stock', meta: { w: '120px', align: 'right', num: true },
    cell: (c) => { const r = c.row.original; const s = state(r); return <span className={s === 'out' ? 'font-semibold text-danger' : s === 'low' ? 'font-semibold text-warning' : 'font-medium text-ink'}>{formatQty(r.stock, r.loose)} {unitText(r.unit)}</span>; },
  },
  { accessorKey: 'reorderLevel', header: 'Reorder at', meta: { w: '104px', align: 'right', num: true }, cell: (c) => { const r = c.row.original; return <span className="text-muted">{formatQty(r.reorderLevel, r.loose)}</span>; } },
  { accessorKey: 'cost', header: 'Cost', meta: { w: '96px', align: 'right', num: true }, cell: (c) => <Money paise={c.getValue<number>()} /> },
  { id: 'value', header: 'Stock value', meta: { w: '116px', align: 'right', num: true }, accessorFn: worth, cell: (c) => <span className="font-medium text-ink"><Money paise={c.getValue<number>()} /></span> },
  {
    id: 'status', header: 'Status', meta: { w: '92px' }, accessorFn: (r) => state(r),
    cell: (c) => { const s = c.getValue<string>(); return s === 'out' ? <Badge tone="danger">Out</Badge> : s === 'low' ? <Badge tone="warning">Low</Badge> : <Badge tone="success">OK</Badge>; },
  },
];

const GROUP_COLS = '64px minmax(180px,1.4fr) minmax(130px,.8fr) minmax(110px,.6fr) minmax(120px,.7fr) 120px 96px 116px';
const GROUP_HEAD: [string, string, boolean][] = [['code', 'Code', false], ['name', 'Item', false], ['category', 'Category', false], ['brand', 'Brand', false], ['supplier', 'Supplier', false], ['stock', 'In stock', true], ['cost', 'Cost', true], ['value', 'Stock value', true]];

export function StockLevels({ version }: { version: number }) {
  const rc = useResizableColumns('office-stock-groups', parseTracks(GROUP_COLS, GROUP_HEAD.map((h) => h[0])));
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [level, setLevel] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  useEffect(() => { api.listItems().then((x) => setItems([...x])); api.listCategories().then((c) => setCats([...c])); }, [version]);

  const active = useMemo(() => items.filter((i) => i.active), [items]);
  const rows = useMemo(() => fuzzyFilter(
    active.filter((i) => (cat === 'all' || i.categoryId === cat) && (level === 'all' || (level === 'low' ? state(i) !== 'ok' : state(i) === 'out'))),
    q, (i) => [i.name, i.code, i.barcode], Infinity), [active, cat, level, q]);
  const sorted = useMemo(() => {
    const get: Record<string, (i: Item) => string | number> = {
      code: (i) => i.code, name: (i) => i.name.toLowerCase(), category: (i) => i.category.toLowerCase(), brand: (i) => i.brand.toLowerCase(),
      supplier: (i) => (i.supplier ?? '').toLowerCase(), stock: (i) => i.stock, cost: (i) => i.cost, value: worth,
    };
    const g = get[sort.key] ?? get.name;
    return [...rows].sort((a, b) => { const x = g(a), y = g(b); return ((typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) || a.name.localeCompare(b.name)) * sort.dir; });
  }, [rows, sort]);
  const groups = useMemo(() => groupStock(sorted, groupBy, (i) => ({ key: groupBy === 'category' ? i.category : groupBy === 'brand' ? i.brand : (i.supplier ?? ''), qty: i.stock, sales: Math.round((i.price * i.stock) / 1000), cost: worth(i) }), groupBy === 'supplier' ? 'No supplier' : 'Not set'), [sorted, groupBy]);
  const totalValue = active.reduce((s, i) => s + worth(i), 0);
  const low = active.filter((i) => state(i) === 'low').length;
  const out = active.filter((i) => state(i) === 'out').length;
  const shownValue = rows.reduce((s, i) => s + worth(i), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-4 gap-3 px-4 pb-3 pt-3">
        <StatTile label="Items in stock" icon={<Boxes size={14} />} value={active.length} hint="Active items" />
        <StatTile label="Stock value at cost" icon={<IndianRupee size={14} />} value={<Money paise={totalValue} decimals={false} />} hint="Quantity x purchase cost" />
        <StatTile label="Low stock" icon={<TriangleAlert size={14} />} value={low} hint="At or below reorder level" />
        <StatTile label="Out of stock" icon={<PackageX size={14} />} value={out} hint="Nothing left to sell" />
      </div>
      <FilterBar className="border-t" trailing={<span>{rows.length} items, worth <Money paise={shownValue} decimals={false} /></span>}>
        <div className="w-64"><Input icon={<Search size={15} />} placeholder="Name, code or barcode" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setClosed(new Set()); }} options={[{ value: 'none', label: 'Group by: None (A-Z)' }, { value: 'category', label: 'Group by: Category' }, { value: 'brand', label: 'Group by: Brand' }, { value: 'supplier', label: 'Group by: Supplier' }]} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
        <div className="flex gap-1">
          {([['all', 'All'], ['low', 'Low and out'], ['out', 'Out / negative']] as const).map(([v, l]) => (
            <button
              key={v} onClick={() => setLevel(v)}
              className={`h-8 rounded-control border px-3 text-sm font-medium transition-colors ${level === v ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3'}`}
            >{l}</button>
          ))}
        </div>
      </FilterBar>
      {groupBy !== 'none' ? (
        <div className="min-h-0 flex-1 overflow-auto" ref={rc.rootProps.ref} onMouseOver={rc.rootProps.onMouseOver} style={rc.rootProps.style}>
          <div onContextMenu={rc.headerProps.onContextMenu} className="sticky top-0 z-10 grid h-9 items-center border-b border-line-strong bg-surface-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: ROW_COLS }}>
            {GROUP_HEAD.map(([k, label, right], hi) => (
              <div key={k} className="relative flex h-full min-w-0 items-center overflow-hidden pr-1"><button onClick={() => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }))} className={cn('flex min-w-0 flex-1 items-center gap-1 truncate text-left uppercase hover:text-ink', right && 'justify-end', sort.key === k && 'text-primary')}>
                <span className="truncate">{label}</span>{sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button><ColResizer rc={rc} index={hi} /></div>
            ))}
          </div>
          {groups.length === 0 && <EmptyState icon={<Boxes size={22} />} title="Nothing to show" hint="No item matches these filters." />}
          {groups.map((g) => {
            const open = !closed.has(g.key);
            return (
              <div key={g.key || '_'}>
                <button onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} className="flex h-10 w-full items-center gap-3 border-b border-line bg-surface-3 px-4 text-left text-sm font-semibold text-ink hover:bg-surface-2">
                  <ChevronRight size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
                  <span className="truncate">{g.label}</span><span className="shrink-0 text-xs font-normal text-muted">{g.count} items</span><span className="flex-1" />
                  <span className="num shrink-0 text-xs font-medium text-muted">Qty {formatQty(g.qty, g.qty % 1000 !== 0)}</span>
                  <span className="num shrink-0 text-xs font-semibold text-primary">Value <Money paise={g.cost} decimals={false} /></span>
                </button>
                {open && g.rows.map((r) => {
                  const st = state(r);
                  return (
                    <div key={r.id} className="grid h-9 items-center border-b border-line/70 px-4 text-sm" style={{ gridTemplateColumns: ROW_COLS }}>
                      <span className="num text-muted">{r.code}</span>
                      <span className="truncate font-medium text-ink" title={r.name}>{r.name}</span>
                      <span className="truncate text-muted" title={r.category}>{r.category}</span>
                      <span className="truncate text-muted" title={r.brand}>{r.brand}</span>
                      <span className="truncate text-muted" title={r.supplier}>{r.supplier || '-'}</span>
                      <span className={cn('num text-right', st === 'out' ? 'font-semibold text-danger' : st === 'low' ? 'font-semibold text-warning' : 'font-medium text-ink')}>{formatQty(r.stock, r.loose)} {unitText(r.unit)}</span>
                      <span className="num text-right text-muted"><Money paise={r.cost} /></span>
                      <span className="num text-right font-medium text-ink"><Money paise={worth(r)} /></span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
      <DataTable
        data={rows} columns={columns} getRowId={(r) => r.id}
        empty={<EmptyState icon={<Boxes size={22} />} title="Nothing to show" hint={level === 'out' ? 'No item is completely out of stock.' : 'No item matches these filters.'} />}
      />
      )}
      {rc.menu}
    </div>
  );
}
