import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, SlidersHorizontal } from 'lucide-react';
import { formatQty, marginPercent, type Item, type ItemDetail, type StockMovement } from '@gokul/data';
import { Badge, Button, Money, cn } from '@gokul/ui';
import { api } from '../../store';
import { relTime, unitText } from './shared';

const kindLabel: Record<StockMovement['kind'], string> = {
  sale: 'Sold', purchase: 'Received', adjustment: 'Adjusted', production: 'Produced', return: 'Returned',
};

export function ItemDetailPane({ item, onEdit, onAdjust }: { item: Item; onEdit: () => void; onAdjust: () => void }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [moves, setMoves] = useState<StockMovement[]>([]);
  useEffect(() => {
    let live = true;
    api.getItemDetail(item.id).then((d) => live && setDetail(d));
    api.itemMovements(item.id, 7).then((m) => live && setMoves(m));
    return () => { live = false; };
  }, [item]);

  const out = item.stock <= 0;
  const low = !out && item.stock <= item.reorderLevel;
  const margin = marginPercent(item.price, item.cost, item.gstRate);
  const u = unitText(item.unit);
  const rows: [string, React.ReactNode][] = [
    ['Counter code', <span key="c" className="num">{item.code}</span>],
    ['Category', item.category],
    ['Brand', item.brand],
    ['HSN / GST', <span key="h" className="num">{item.hsn} / {item.gstRate}%</span>],
    ['MRP', <Money key="m" paise={item.mrp} />],
    ['Purchase cost', <Money key="co" paise={item.cost} />],
    ['Margin', margin === null ? '-' : <span key="mg" className={cn('num', margin < 10 && 'text-warning')}>{margin.toFixed(1)}%</span>],
  ];
  if (item.loose && detail?.scaleCode) rows.splice(1, 0, ['Scale code', <span key="sc" className="num">{detail.scaleCode}</span>]);
  if (!item.loose && item.packSize) rows.splice(1, 0, ['Pack size', item.packSize]);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="shrink-0 border-b border-line p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-md font-semibold leading-tight text-ink">{item.name}</div>
            {item.nameTa && <div className="mt-0.5 text-sm text-muted">{item.nameTa}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={item.loose ? 'info' : 'neutral'}>{item.loose ? 'Loose' : 'Packed'}</Badge>
            {!item.active && <Badge tone="danger">Inactive</Badge>}
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-muted">Selling price{item.loose ? ` per ${u}` : ''}</div>
            <div className="text-2xl font-semibold num"><Money paise={item.price} /></div>
          </div>
          <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit} kbd="Enter">Edit</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="m-4 rounded-card border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>In stock</span>
            {out ? <Badge tone="danger">Out of stock</Badge> : low ? <Badge tone="warning">Reorder</Badge> : <Badge tone="success">OK</Badge>}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <div className="text-xl font-semibold num">{formatQty(item.stock, item.loose)} <span className="text-sm font-normal text-muted">{u}</span></div>
            <div className="text-xs text-muted num">Worth <Money paise={Math.round((item.cost * item.stock) / 1000)} decimals={false} /></div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className={cn('h-full', out ? 'bg-danger' : low ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, (item.stock / Math.max(1, item.reorderLevel * 3)) * 100)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-subtle">
            <span>Reorder at {formatQty(item.reorderLevel, item.loose)} {u}</span>
            <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={onAdjust}><SlidersHorizontal size={12} /> Adjust</button>
          </div>
        </div>

        <dl className="px-4">
          <div className="flex items-start justify-between gap-3 border-b border-line/70 py-2 text-sm">
            <dt className="text-muted">Barcodes</dt>
            <dd className="selectable num flex flex-col items-end font-medium text-ink">{(detail?.barcodes ?? [item.barcode]).map((b) => <span key={b}>{b}</span>)}</dd>
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-line/70 py-2 text-sm">
              <dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="px-4 pb-4 pt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent movement</div>
          {moves.length === 0 && <div className="py-3 text-sm text-subtle">No movement yet.</div>}
          <ul>
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 border-b border-line/70 py-2 text-sm last:border-0">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', m.qty < 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
                  {m.qty < 0 ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{kindLabel[m.kind]} <span className="font-normal text-subtle">{m.note}</span></div>
                  <div className="text-xs text-subtle">{relTime(m.at)}</div>
                </div>
                <div className={cn('text-right font-semibold num', m.qty < 0 ? 'text-danger' : 'text-success')}>
                  {m.qty > 0 ? '+' : '-'}{formatQty(Math.abs(m.qty), item.loose)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
