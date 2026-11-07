import { useEffect, useMemo, useState } from 'react';
import { Boxes, IndianRupee, PackageX, Search, TriangleAlert } from 'lucide-react';
import { formatQty, fuzzyFilter, type Category, type Item } from '@gokul/data';
import { Badge, DataTable, EmptyState, FilterBar, Input, Money, Select, StatTile, type ColumnDef } from '@gokul/ui';
import { api } from '../../store';
import { unitText } from './shared';

const state = (r: Item) => (r.stock <= 0 ? 'out' : r.stock <= r.reorderLevel ? 'low' : 'ok');
const worth = (r: Item) => Math.round((r.cost * r.stock) / 1000);

const columns: ColumnDef<Item>[] = [
  { accessorKey: 'code', header: 'Code', meta: { w: '64px', num: true } },
  { accessorKey: 'name', header: 'Item', meta: { w: 'minmax(160px,1fr)' }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
  { accessorKey: 'category', header: 'Category', meta: { w: '160px' }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
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

export function StockLevels({ version }: { version: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [level, setLevel] = useState('all');
  useEffect(() => { api.listItems().then((x) => setItems([...x])); api.listCategories().then((c) => setCats([...c])); }, [version]);

  const active = useMemo(() => items.filter((i) => i.active), [items]);
  const rows = useMemo(() => fuzzyFilter(
    active.filter((i) => (cat === 'all' || i.categoryId === cat) && (level === 'all' || (level === 'low' ? state(i) !== 'ok' : state(i) === 'out'))),
    q, (i) => [i.name, i.code, i.barcode], Infinity), [active, cat, level, q]);
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
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
        <div className="flex gap-1">
          {([['all', 'All'], ['low', 'Low and out'], ['out', 'Out only']] as const).map(([v, l]) => (
            <button
              key={v} onClick={() => setLevel(v)}
              className={`h-8 rounded-control border px-3 text-sm font-medium transition-colors ${level === v ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3'}`}
            >{l}</button>
          ))}
        </div>
      </FilterBar>
      <DataTable
        data={rows} columns={columns} getRowId={(r) => r.id}
        empty={<EmptyState icon={<Boxes size={22} />} title="Nothing to show" hint={level === 'out' ? 'No item is completely out of stock.' : 'No item matches these filters.'} />}
      />
    </div>
  );
}
