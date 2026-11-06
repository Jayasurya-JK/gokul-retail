import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../cn';

export type { ColumnDef };

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  getRowId: (row: T) => string;
  rowHeight?: number;
  /** Highlighted (keyboard) row */
  selectedId?: string | null;
  onSelect?: (row: T) => void;
  /** Enter or double click */
  onActivate?: (row: T) => void;
  empty?: ReactNode;
  autoFocus?: boolean;
  className?: string;
  footer?: ReactNode;
}

/** Virtualised, sortable table with keyboard row navigation (arrows, Home/End, PageUp/PageDown, Enter). */
export function DataTable<T>({
  data, columns, getRowId, rowHeight = 36, selectedId, onSelect, onActivate, empty, autoFocus, className, footer,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalSel, setInternalSel] = useState<string | null>(null);
  const sel = selectedId !== undefined ? selectedId : internalSel;
  const scroller = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data, columns, getRowId, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => rowHeight, overscan: 12 });

  const selIndex = useMemo(() => rows.findIndex((r) => r.id === sel), [rows, sel]);
  const choose = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!r) return;
    setInternalSel(r.id);
    onSelect?.(r.original);
    virt.scrollToIndex(rows.indexOf(r), { align: 'auto' });
  };
  useEffect(() => { if (autoFocus) scroller.current?.focus(); }, [autoFocus]);

  const onKey = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 300) / rowHeight) - 1);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); choose(selIndex < 0 ? 0 : selIndex + 1); break;
      case 'ArrowUp': e.preventDefault(); choose(selIndex < 0 ? 0 : selIndex - 1); break;
      case 'PageDown': e.preventDefault(); choose(selIndex + page); break;
      case 'PageUp': e.preventDefault(); choose(selIndex - page); break;
      case 'Home': e.preventDefault(); choose(0); break;
      case 'End': e.preventDefault(); choose(rows.length - 1); break;
      case 'Enter': if (selIndex >= 0) { e.preventDefault(); onActivate?.(rows[selIndex].original); } break;
    }
  };

  const widths = table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as { w?: string } | undefined)?.w ?? 'minmax(0,1fr)');
  const template = widths.join(' ');

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-surface', className)}>
      <div
        ref={scroller} tabIndex={0} onKeyDown={onKey}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:[&_[data-sel=true]]:ring-1 focus-visible:[&_[data-sel=true]]:ring-inset focus-visible:[&_[data-sel=true]]:ring-primary/50"
      >
        <div role="table" style={{ minWidth: 'max-content' }} className="min-w-full">
          <div role="rowgroup" className="sticky top-0 z-10 border-b border-line bg-surface-2">
            {table.getHeaderGroups().map((hg) => (
              <div key={hg.id} role="row" className="grid h-8 items-center px-4" style={{ gridTemplateColumns: template }}>
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  const dir = h.column.getIsSorted();
                  return (
                    <div
                      key={h.id} role="columnheader"
                      onClick={h.column.getToggleSortingHandler()}
                      className={cn('flex items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted', h.column.getCanSort() && 'hover:text-ink', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir === 'asc' && <ArrowUp size={12} />}
                      {dir === 'desc' && <ArrowDown size={12} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="py-10">{empty}</div>
          ) : (
            <div role="rowgroup" style={{ height: virt.getTotalSize(), position: 'relative' }}>
              {virt.getVirtualItems().map((v) => {
                const row = rows[v.index];
                const active = row.id === sel;
                return (
                  <div
                    key={row.id} role="row" data-sel={active}
                    onClick={() => { setInternalSel(row.id); onSelect?.(row.original); }}
                    onDoubleClick={() => onActivate?.(row.original)}
                    className={cn('absolute left-0 right-0 grid items-center border-b border-line/70 px-4 text-sm', active ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                    style={{ height: v.size, transform: `translateY(${v.start}px)`, gridTemplateColumns: template }}
                  >
                    {row.getVisibleCells().map((c) => {
                      const meta = c.column.columnDef.meta as { align?: string; num?: boolean } | undefined;
                      return (
                        <div
                          key={c.id} role="cell"
                          className={cn('truncate px-2', meta?.align === 'right' && 'text-right', meta?.align === 'center' && 'text-center', meta?.num && 'num')}
                        >
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {footer && <div className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-surface-2 px-4 text-xs text-muted">{footer}</div>}
    </div>
  );
}
