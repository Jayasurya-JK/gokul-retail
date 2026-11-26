import { useEffect, useRef } from 'react';
import { CornerDownLeft, SearchX } from 'lucide-react';
import { formatQty, type Item } from '@gokul/data';
import { Badge, Kbd, Money, cn } from '@gokul/ui';
import { Highlight } from './Dialogs';

export const SUGGEST_MAX = 8;
const COLS = 'grid-cols-[64px_minmax(0,1fr)_96px_100px_92px]';

/** Type-ahead list shown right under the scan box. Pure display: Billing owns the keys. */
export function ScanSuggest({ list, hi, q, qty, left, onHover, onPick }: {
  list: Item[]; hi: number; q: string; qty?: number;
  left: (i: Item) => number; onHover: (i: number) => void; onPick: (i: Item) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.children[hi]?.scrollIntoView({ block: 'nearest' });
  }, [hi]);
  return (
    <div
      role="listbox" aria-label="Matching items"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute inset-x-0 top-full z-30 mt-2 g-popover overflow-hidden bg-surface"
    >
      <div className="flex h-8 items-center gap-2 border-b border-line bg-table-head px-3 text-[11px] font-semibold uppercase tracking-wider text-table-head-ink">
        <span>{list.length === 0 ? 'No match' : `${list.length} ${list.length === 1 ? 'match' : 'matches'}`}</span>
        {qty !== undefined && <span className="rounded bg-primary-soft px-1.5 py-px normal-case tracking-normal text-primary">Qty {formatQty(qty, qty % 1000 !== 0)}</span>}
        <span className="ml-auto flex items-center gap-3 font-normal normal-case tracking-normal text-subtle">
          <span className="flex items-center gap-1"><Kbd>Up</Kbd><Kbd>Down</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd><CornerDownLeft size={10} /></Kbd> add</span>
          <span className="flex items-center gap-1"><Kbd>Tab</Kbd> full search</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> close</span>
        </span>
      </div>
      {list.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 text-sm text-muted">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-3 text-subtle"><SearchX size={18} /></span>
          <span>No item matches <b className="text-ink">"{q}"</b>. Press <Kbd>Tab</Kbd> to open full search.</span>
        </div>
      ) : (
        <ul ref={ref} className="max-h-[368px] overflow-y-auto">
          {list.map((it, i) => {
            const rem = left(it);
            const out = rem <= 0;
            const low = !out && rem <= it.reorderLevel;
            const unit = it.unit === 'l' ? 'L' : it.unit === 'kg' ? 'kg' : '';
            return (
              <li
                key={it.id} role="option" aria-selected={i === hi}
                onMouseMove={() => onHover(i)} onClick={() => onPick(it)}
                className={cn('relative grid h-[46px] items-center border-b border-line/60 px-3 last:border-b-0', COLS, i === hi && 'bg-primary-soft')}
              >
                {i === hi && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                <span className="num text-sm font-medium text-muted"><Highlight text={it.code} q={q} /></span>
                <span className="min-w-0 pr-3 leading-tight">
                  <span className="block truncate text-base font-medium text-ink"><Highlight text={it.name} q={q} /></span>
                  {it.nameTa && <span className="block truncate text-xs text-subtle"><Highlight text={it.nameTa} q={q} /></span>}
                </span>
                <span>{it.loose ? <Badge tone="info">Loose {unit}</Badge> : <span className="text-sm text-muted">{it.packSize ?? it.unit}</span>}</span>
                <span className="num text-right text-base font-semibold"><Money paise={it.price} />{it.loose && <span className="text-xs font-normal text-subtle">/{unit}</span>}</span>
                <span className="flex items-center justify-end gap-1.5">
                  {out ? <Badge tone="danger" className="!h-4 !px-1.5 !text-[10px]">Out</Badge> : low ? <Badge tone="warning" className="!h-4 !px-1.5 !text-[10px]">Low</Badge> : null}
                  <span className={cn('num text-sm', out ? 'font-semibold text-danger' : low ? 'font-semibold text-warning' : 'text-muted')}>{formatQty(Math.max(0, rem), it.loose)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
