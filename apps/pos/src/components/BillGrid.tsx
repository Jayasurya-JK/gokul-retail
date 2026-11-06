import { useEffect, useRef } from 'react';
import { ScanBarcode } from 'lucide-react';
import { formatQty, type BillLine } from '@gokul/data';
import { EmptyState, Kbd, Money, cn } from '@gokul/ui';

export type EditField = 'qty' | 'rate' | 'disc';
export interface EditState { i: number; field: EditField; draft: string }

/**
 * Numbers share the spare width with the name (fr units), so on a 1920 screen the quantities and
 * amounts stay close to the item name instead of drifting to the far edge.
 */
export const GRID_COLS = '52px minmax(0,3.2fr) minmax(104px,1.15fr) minmax(46px,.5fr) minmax(96px,1fr) minmax(80px,.85fr) minmax(52px,.5fr) minmax(124px,1.3fr)';

const unitLabel: Record<string, string> = { kg: 'kg', g: 'g', l: 'L', ml: 'ml', pc: 'pc', tin: 'tin', btl: 'btl', pkt: 'pkt' };

export function BillGrid({ lines, selected, edit, loose, onSelect, onDraft, onCommit, onCancel, onReject }: {
  lines: BillLine[];
  selected: number;
  edit: EditState | null;
  loose: (l: BillLine) => boolean;
  onSelect: (i: number) => void;
  onDraft: (v: string) => void;
  onCommit: (tab: boolean) => void;
  onCancel: () => void;
  /** Called when a typed character is refused (e.g. `*` in the weight box). */
  onReject?: (message: string) => void;
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' }); }, [selected, lines.length]);

  const cellInput = (field: EditField, i: number, placeholder: string) => (
    <input
      autoFocus
      value={edit?.draft ?? ''}
      placeholder={placeholder}
      inputMode="decimal"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.includes('*')) {
          onReject?.(field === 'qty'
            ? 'This box takes a plain number like 2.5. To bill 3 of item 103, type 3*103 in the scan box.'
            : 'This box takes a plain number. Type quantity x code in the scan box.');
        }
        onDraft(raw.replace(/[^\d.%]/g, ''));
      }}
      onBlur={() => onCommit(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); onCommit(false); }
        else if (e.key === 'Tab') { e.preventDefault(); onCommit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      aria-label={`${field} for row ${i + 1}`}
      className="num h-8 w-full rounded-md border border-primary min-[1700px]:h-10 min-[1700px]:text-lg bg-surface px-2 text-right text-base font-semibold text-ink ring-2 ring-primary/25 placeholder:font-normal placeholder:text-subtle"
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="grid h-8 shrink-0 items-center border-b border-line bg-surface-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted min-[1700px]:h-10 min-[1700px]:text-xs" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="px-2 text-center">S.No</div>
        <div className="px-2">Item</div>
        <div className="px-2 text-right">Qty</div>
        <div className="px-2">Unit</div>
        <div className="px-2 text-right">Rate</div>
        <div className="px-2 text-right">Disc</div>
        <div className="px-2 text-right">GST</div>
        <div className="px-2 text-right">Amount</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            icon={<ScanBarcode size={24} />}
            title="Ready to bill"
            hint={
              <span className="flex flex-col items-center gap-2">
                <span>Scan a barcode or type an item code and press Enter.</span>
                <span className="flex items-center gap-1.5 text-xs text-subtle"><Kbd>F2</Kbd> search items <span className="mx-1">-</span> <Kbd>5*101</Kbd> five of item 101</span>
              </span>
            }
          />
        ) : (
          lines.map((l, i) => {
            const active = i === selected;
            const isLoose = loose(l);
            const editing = edit?.i === i ? edit.field : null;
            return (
              <div
                key={`${l.itemId}-${i}`}
                ref={(el) => { rowRefs.current[i] = el; }}
                onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input')) onSelect(i); }}
                className={cn('relative grid h-[46px] items-center border-b border-line/70 px-3 text-base min-[1700px]:h-[62px] min-[1700px]:text-[19px]', active ? 'bg-primary-soft' : i % 2 ? 'bg-surface-2/50' : 'bg-surface')}
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                <div className="px-2 text-center text-sm text-subtle num min-[1700px]:text-base">{i + 1}</div>
                <div className="min-w-0 px-2">
                  <div className="truncate font-medium text-ink">{l.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-subtle min-[1700px]:text-sm"><span className="num rounded bg-surface-3 px-1 text-[11px] font-medium text-muted min-[1700px]:text-xs">{l.code}</span>{isLoose && <span>Loose, by weight</span>}</div>
                </div>
                <div className="px-1.5 text-right num">
                  {editing === 'qty' ? cellInput('qty', i, formatQty(l.qty, isLoose)) : <span className={cn('font-semibold', isLoose && 'text-primary')}>{formatQty(l.qty, isLoose)}</span>}
                </div>
                <div className="px-2 text-sm text-muted min-[1700px]:text-base">{unitLabel[l.unit]}</div>
                <div className="px-1.5 text-right num">
                  {editing === 'rate' ? cellInput('rate', i, (l.rate / 100).toFixed(2)) : <Money paise={l.rate} symbol={false} />}
                </div>
                <div className="px-1.5 text-right num">
                  {editing === 'disc' ? cellInput('disc', i, '0 or 5%') : l.discount ? <span className="text-success"><Money paise={-l.discount} symbol={false} /></span> : <span className="text-subtle">-</span>}
                </div>
                <div className="px-2 text-right text-sm text-muted num min-[1700px]:text-base">{l.gstRate}%</div>
                <div className="px-2 text-right text-md font-semibold num min-[1700px]:text-xl"><Money paise={l.amount} symbol={false} /></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
