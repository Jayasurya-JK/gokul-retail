import { useEffect, useRef, useState } from 'react';
import { Minus, Percent, Pencil, Plus, ScanBarcode, Tag, Trash2 } from 'lucide-react';
import { formatQty, type BillLine } from '@gokul/data';
import { EmptyState, Kbd, Money, cn } from '@gokul/ui';

export type EditField = 'qty' | 'rate' | 'disc';
export interface EditState { i: number; field: EditField; draft: string }

/**
 * Numbers share the spare width with the name (fr units), so on a 1920 screen the quantities and
 * amounts stay close to the item name instead of drifting to the far edge.
 */
export const GRID_COLS = '52px minmax(0,3.2fr) minmax(104px,1.15fr) minmax(46px,.5fr) minmax(68px,.7fr) minmax(96px,1fr) minmax(80px,.85fr) minmax(52px,.5fr) minmax(124px,1.3fr)';

const unitLabel: Record<string, string> = { kg: 'kg', g: 'g', l: 'L', ml: 'ml', pc: 'pc', tin: 'tin', btl: 'btl', pkt: 'pkt' };

export function BillGrid({ lines, selected, edit, loose, stock, onSelect, onDraft, onCommit, onCancel, onReject, onEdit, onStep, onRemove }: {
  lines: BillLine[];
  selected: number;
  edit: EditState | null;
  loose: (l: BillLine) => boolean;
  /** Stock left for the row's item after what is already on the bill */
  stock: (l: BillLine) => { text: string; low: boolean } | null;
  onSelect: (i: number) => void;
  onDraft: (v: string) => void;
  onCommit: (tab: boolean) => void;
  onCancel: () => void;
  /** Called when a typed character is refused (e.g. `*` in the weight box). */
  onReject?: (message: string) => void;
  /** Mouse or touch: click a Qty, Rate or Disc cell to edit it in place */
  onEdit: (i: number, field: EditField) => void;
  /** - / + buttons: change the quantity by one (1 kg or 1 unit) */
  onStep: (i: number, delta: 1 | -1) => void;
  onRemove: (i: number) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; i: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close); window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); window.removeEventListener('blur', close); };
  }, [menu]);
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
        // F-keys (F6 hold, F3 pay...) pass through to the screen's shortcuts; every other key stays in the box.
        if (!/^F\d{1,2}$/.test(e.key)) e.stopPropagation();
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
        <div className="px-2 text-right">Stock</div>
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
            const stk = stock(l);
            return (
              <div
                key={`${l.itemId}-${i}`}
                ref={(el) => { rowRefs.current[i] = el; }}
                onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input')) onSelect(i); }}
                onContextMenu={(e) => { e.preventDefault(); onSelect(i); setMenu({ x: e.clientX, y: e.clientY, i }); }}
                className={cn('group relative grid h-[46px] items-center border-b border-line/70 px-3 text-base min-[1700px]:h-[62px] min-[1700px]:text-[19px]', active ? 'bg-primary-soft' : i % 2 ? 'bg-surface-2/50' : 'bg-surface')}
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                <div className="px-2 text-center text-sm text-subtle num min-[1700px]:text-base">{i + 1}</div>
                <div className="min-w-0 px-2">
                  <div className="truncate font-medium text-ink">{l.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-subtle min-[1700px]:text-sm"><span className="num rounded bg-surface-3 px-1 text-[11px] font-medium text-muted min-[1700px]:text-xs">{l.code}</span>{isLoose && <span>Loose, by weight</span>}</div>
                </div>
                <div className="relative px-1.5 text-right num">
                  {editing === 'qty' ? cellInput('qty', i, formatQty(l.qty, isLoose)) : (
                    <>
                      <span className={cn('absolute inset-y-0 left-1 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100', active && 'opacity-100')}>
                        <StepBtn label="One less" disabled={l.qty <= 1000} onClick={() => onStep(i, -1)}><Minus size={12} /></StepBtn>
                        <StepBtn label="One more" onClick={() => onStep(i, 1)}><Plus size={12} /></StepBtn>
                      </span>
                      <CellButton label="Change quantity" onClick={() => onEdit(i, 'qty')} className={cn('font-semibold', isLoose && 'text-primary')}>{formatQty(l.qty, isLoose)}</CellButton>
                    </>
                  )}
                </div>
                <div className="px-2 text-sm text-muted min-[1700px]:text-base">{unitLabel[l.unit]}</div>
                <div className={cn('px-2 text-right text-sm num min-[1700px]:text-base', stk?.low ? 'font-semibold text-danger' : 'text-muted')}>{stk ? stk.text : ''}</div>
                <div className="px-1.5 text-right num">
                  {editing === 'rate' ? cellInput('rate', i, (l.rate / 100).toFixed(2)) : <CellButton label="Change rate" onClick={() => onEdit(i, 'rate')}><Money paise={l.rate} symbol={false} /></CellButton>}
                </div>
                <div className="px-1.5 text-right num">
                  {editing === 'disc' ? cellInput('disc', i, '0 or 5%') : <CellButton label="Add discount" onClick={() => onEdit(i, 'disc')}>{l.discount ? <span className="text-success"><Money paise={-l.discount} symbol={false} /></span> : <span className="inline-block rounded border border-dashed border-line-strong px-1.5 text-xs font-medium text-subtle">+ Disc</span>}</CellButton>}
                </div>
                <div className="px-2 text-right text-sm text-muted num min-[1700px]:text-base">{l.gstRate}%</div>
                <div className="relative px-2 text-right text-md font-semibold num min-[1700px]:text-xl">
                  <button
                    type="button" tabIndex={-1} title="Remove this item (Del)" aria-label={`Remove ${l.name}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => onRemove(i)}
                    className={cn('absolute left-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100', active && 'opacity-100')}
                  ><Trash2 size={14} /></button>
                  <Money paise={l.amount} symbol={false} />
                </div>
              </div>
            );
          })
        )}
      </div>
      {menu && (
        <div
          role="menu" onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[80] w-48 rounded-lg border border-line bg-surface p-1 text-sm shadow-pop"
          style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 170) }}
        >
          <MenuItem icon={<Pencil size={14} />} label="Edit quantity" onClick={() => { onEdit(menu.i, 'qty'); setMenu(null); }} />
          <MenuItem icon={<Tag size={14} />} label="Edit rate" onClick={() => { onEdit(menu.i, 'rate'); setMenu(null); }} />
          <MenuItem icon={<Percent size={14} />} label="Discount" onClick={() => { onEdit(menu.i, 'disc'); setMenu(null); }} />
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<Trash2 size={14} />} label="Remove" danger onClick={() => { onRemove(menu.i); setMenu(null); }} />
        </div>
      )}
    </div>
  );
}

/** A number the cashier can click to edit; the hover state shows it is not plain text. */
function CellButton({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button" tabIndex={-1} title={label} aria-label={label}
      onMouseDown={(e) => e.stopPropagation()} onClick={onClick}
      className={cn('-my-1 inline-block min-w-[2.5rem] rounded-md px-1.5 py-1 text-right transition-colors hover:bg-surface hover:ring-1 hover:ring-primary/40', className)}
    >{children}</button>
  );
}

function StepBtn({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" tabIndex={-1} title={label} aria-label={label} disabled={disabled} onMouseDown={(e) => e.stopPropagation()} onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-35"
    >{children}</button>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn('flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left hover:bg-surface-3', danger ? 'text-danger' : 'text-ink')}>
      <span className="text-muted">{icon}</span>{label}
    </button>
  );
}
