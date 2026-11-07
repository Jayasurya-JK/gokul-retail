import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReportColumn, ReportRow } from '@gokul/data';
import { ColResizer, ROW_COLS, cn, useResizableColumns, type ColSpec } from '@gokul/ui';
import { cellValue, formatCell, isRight } from './format';

const ROW_H = 32;
const HEAD_H = 32;

/** Dense report grid: sticky header, sticky totals footer, windowed rows, click-to-sort, arrow-key row selection. */
export function ReportTable({ columns, rows, totals }: { columns: ReportColumn[]; rows: ReportRow[]; totals?: ReportRow }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState(-1);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(400);
  const scroller = useRef<HTMLDivElement>(null);

  const sortable = useMemo(() => rows.every((r) => !r._style), [rows]);
  useEffect(() => { setSort(null); setSel(-1); scroller.current?.scrollTo({ top: 0 }); }, [columns]);

  const sorted = useMemo(() => {
    if (!sort || !sortable) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = cellValue(a, key); const y = cellValue(b, key);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x ?? '').localeCompare(String(y ?? ''), 'en-IN', { numeric: true }) * dir;
    });
  }, [rows, sort, sortable]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Each column keeps a floor wide enough for its numbers; the table scrolls sideways only if the floors do not fit.
  const floor = (c: (typeof columns)[number]) => (c.kind === 'money' ? 108 : c.kind === 'int' ? 66 : c.kind === 'pct' ? 56 : c.kind === 'qty' ? 84 : c.kind === 'badge' ? 80 : c.kind === 'date' ? 88 : 64);
  const specs: ColSpec[] = columns.map((c) => ({ id: c.key, track: `minmax(${floor(c)}px,${c.w ?? (c.kind === 'money' ? '1.5fr' : c.kind === 'int' || c.kind === 'pct' ? '0.8fr' : '1fr')})`, min: Math.min(floor(c), 48) }));
  const rc = useResizableColumns(`office-report|${columns.map((c) => c.key).join(',')}`, specs);
  const minWidth = (rc.customised ? rc.minTotal : columns.reduce((n, c) => n + floor(c), 0)) + 24;
  const start = Math.max(0, Math.floor(top / ROW_H) - 8);
  const end = Math.min(sorted.length, Math.ceil((top + height) / ROW_H) + 8);

  const choose = (i: number) => {
    const n = Math.max(0, Math.min(sorted.length - 1, i));
    setSel(n);
    const el = scroller.current;
    if (!el) return;
    const rowTop = n * ROW_H;
    if (rowTop < el.scrollTop) el.scrollTop = rowTop;
    else if (rowTop + ROW_H + HEAD_H * 2 > el.scrollTop + el.clientHeight) el.scrollTop = rowTop + ROW_H + HEAD_H * 2 - el.clientHeight;
  };
  const onKey = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(height / ROW_H) - 2);
    if (e.key === 'ArrowDown') { e.preventDefault(); choose(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); choose(sel < 0 ? 0 : sel - 1); }
    else if (e.key === 'Home') { e.preventDefault(); choose(0); }
    else if (e.key === 'End') { e.preventDefault(); choose(sorted.length - 1); }
    else if (e.key === 'PageDown') { e.preventDefault(); choose(sel + page); }
    else if (e.key === 'PageUp') { e.preventDefault(); choose(sel - page); }
  };

  return (
    <div
      ref={scroller} tabIndex={0} onKeyDown={onKey} onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-auto bg-surface outline-none"
    >
      <div role="table" ref={rc.rootProps.ref} onMouseOver={rc.rootProps.onMouseOver} className="flex min-h-full flex-col" style={{ ...rc.rootProps.style, minWidth }}>
        <div role="row" onContextMenu={rc.headerProps.onContextMenu} className="sticky top-0 z-10 grid min-h-10 shrink-0 items-center py-1 border-b border-line bg-surface-2 px-3" style={{ gridTemplateColumns: ROW_COLS }}>
          {columns.map((c, ci) => {
            const active = sort?.key === c.key;
            return (
              <div
                key={c.key} role="columnheader"
                onClick={() => sortable && setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: isRight(c) ? -1 : 1 })}
                className={cn('relative flex min-w-0 items-center gap-1 px-1 pr-2 text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted', sortable && 'cursor-pointer hover:text-ink', isRight(c) && 'justify-end')}
              >
                <span className="line-clamp-2 break-words">{c.label}</span>
                {active && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                <ColResizer rc={rc} index={ci} />
              </div>
            );
          })}
        </div>

        <div role="rowgroup" className="relative flex-1" style={{ minHeight: sorted.length * ROW_H }}>
          {sorted.slice(start, end).map((row, k) => {
            const i = start + k;
            const style = row._style;
            return (
              <div
                key={i} role="row" onClick={() => setSel(i)}
                className={cn(
                  'absolute left-0 right-0 grid items-center border-b border-line/70 px-3 text-[13px]',
                  style === 'head' ? 'bg-surface-2 font-semibold text-ink' : style === 'strong' ? 'bg-primary-soft font-semibold text-ink' : style === 'muted' ? 'text-subtle' : 'text-ink',
                  !style && (sel === i ? 'bg-primary-soft' : 'hover:bg-surface-2'),
                )}
                style={{ height: ROW_H, top: i * ROW_H, gridTemplateColumns: ROW_COLS }}
              >
                {columns.map((c) => (
                  <div key={c.key} role="cell" className={cn('truncate px-1', isRight(c) && 'text-right num')}>
                    {formatCell(c, row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {totals && (
          <div role="row" className="sticky bottom-0 z-10 grid h-9 shrink-0 items-center border-t-2 border-line-strong bg-surface-2 px-3 text-[13px] font-semibold text-ink" style={{ gridTemplateColumns: ROW_COLS }}>
            {columns.map((c) => (
              <div key={c.key} role="cell" className={cn('truncate px-1', isRight(c) && 'text-right num')}>{formatCell(c, totals, { footer: true })}</div>
            ))}
          </div>
        )}
      </div>
      {rc.menu}
    </div>
  );
}
