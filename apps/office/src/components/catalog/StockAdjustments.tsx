import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ADJUST_REASONS, formatQty, fuzzyFilter, type AdjustReason, type StockAdjustment } from '@gokul/data';
import { Badge, Button, DataTable, EmptyState, FilterBar, Input, Money, Select, type ColumnDef, type Tone } from '@gokul/ui';
import { api } from '../../store';
import { relTime, unitText } from './shared';

const reasonTone: Record<AdjustReason, Tone> = { damage: 'danger', leak: 'warning', spill: 'warning', sample: 'info', correction: 'neutral' };

const columns: ColumnDef<StockAdjustment>[] = [
  { accessorKey: 'at', header: 'When', meta: { w: '170px' }, cell: (c) => <span className="text-muted">{relTime(c.getValue<string>())}</span> },
  { accessorKey: 'itemName', header: 'Item', meta: { w: 'minmax(160px,1fr)' }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
  {
    accessorKey: 'reason', header: 'Reason', meta: { w: '112px' },
    cell: (c) => <Badge tone={reasonTone[c.getValue<AdjustReason>()]}>{ADJUST_REASONS.find((r) => r.value === c.getValue<string>())?.label}</Badge>,
  },
  {
    accessorKey: 'qty', header: 'Quantity', meta: { w: '120px', align: 'right', num: true },
    cell: (c) => { const r = c.row.original; return <span className={r.qty < 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>{r.qty > 0 ? '+' : '-'}{formatQty(Math.abs(r.qty), r.loose)} {unitText(r.unit)}</span>; },
  },
  { accessorKey: 'value', header: 'Value at cost', meta: { w: '116px', align: 'right', num: true }, cell: (c) => <Money paise={c.getValue<number>()} sign /> },
  { accessorKey: 'note', header: 'Note', meta: { w: 'minmax(140px,1.2fr)' }, cell: (c) => <span className="text-muted">{c.getValue<string>() || '-'}</span> },
  { accessorKey: 'by', header: 'By', meta: { w: '130px' }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
];

export function StockAdjustments({ version, onNew }: { version: number; onNew: () => void }) {
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('all');
  useEffect(() => { api.listAdjustments().then(setRows); }, [version]);
  const shown = useMemo(() => fuzzyFilter(rows.filter((r) => reason === 'all' || r.reason === reason), q, (r) => [r.itemName, r.note], Infinity), [rows, q, reason]);
  const lost = shown.reduce((s, r) => s + Math.min(0, r.value), 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar trailing={<span>{shown.length} adjustments, net <Money paise={shown.reduce((s, r) => s + r.value, 0)} sign /> {lost < 0 && <span className="text-danger">(lost <Money paise={lost} />)</span>}</span>}>
        <div className="w-64"><Input placeholder="Search item or note" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: 'all', label: 'All reasons' }, ...ADJUST_REASONS.map((r) => ({ value: r.value, label: r.label }))]} />
      </FilterBar>
      <DataTable
        data={shown} columns={columns} getRowId={(r) => r.id}
        empty={<EmptyState icon={<SlidersHorizontal size={22} />} title="No adjustments yet" hint="Record damage, leaks, spills, samples and count corrections here." action={<Button variant="primary" onClick={onNew}>New adjustment</Button>} />}
      />
    </div>
  );
}
