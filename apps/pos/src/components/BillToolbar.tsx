import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Layers, Tags, Pause, PencilLine, ReceiptIndianRupee, RefreshCw, Trash2, Truck, UserRoundCheck, Wallet } from 'lucide-react';
import { Kbd, Tooltip, cn } from '@gokul/ui';

export interface MenuEntry { label: string; kbd?: string; icon?: ReactNode; onClick: () => void; danger?: boolean; /** Draws a rule above this entry */ divider?: boolean }

/** A compact dropdown button. Mouse or touch only; every entry has its own key as well. */
export function DropMenu({ label, icon, items, active, variant, heading }: { label: string; icon: ReactNode; items: MenuEntry[]; active?: boolean; variant?: 'chrome' | 'tab'; heading?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {variant === 'tab' ? (
        <button
          type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[16px] font-medium transition-colors', active || open ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-3 hover:text-ink')}
        >
          {label}{icon}
        </button>
      ) : variant === 'chrome' ? (
        <button
          type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)}
          className={cn('relative ml-1 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-white/10', active || open ? 'text-white' : 'text-chrome-ink')}
        >
          {label}{icon}
          {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-yellow" />}
        </button>
      ) : (
        <TBtn label={label} icon={icon} active={active || open} onClick={() => setOpen((o) => !o)} trailing={<ChevronDown size={12} className="text-subtle" />} />
      )}
      {open && (
        <div className={cn("g-overlay absolute top-[calc(100%+4px)] z-[60] w-64 overflow-hidden rounded-card border border-line bg-surface py-1 text-ink shadow-overlay", variant === "tab" ? "left-0" : "right-0")}>
          {heading && <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{heading}</div>}
          {items.map((m) => (
            <div key={m.label}>
              {m.divider && <div className="my-1 border-t border-line" />}
              <button
                type="button" tabIndex={-1} onClick={() => { setOpen(false); m.onClick(); }}
                className={cn('flex h-9 w-full items-center gap-2.5 px-3 text-sm hover:bg-surface-3', m.danger ? 'text-danger' : 'text-ink')}
              >
                <span className="text-muted">{m.icon}</span><span className="flex-1 text-left">{m.label}</span>{m.kbd && <Kbd>{m.kbd}</Kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TBtn({ label, icon, kbd, onClick, active, trailing, tip, alwaysKbd }: {
  label: string; icon: ReactNode; kbd?: string; onClick: () => void; active?: boolean; trailing?: ReactNode; tip?: string; alwaysKbd?: boolean;
}) {
  return (
    <Tooltip label={tip ?? label} kbd={kbd}>
      <button
        type="button" tabIndex={-1} onClick={onClick}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] font-medium transition-colors',
          active ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-3',
        )}
      >
        <span className={active ? 'text-primary' : 'text-muted'}>{icon}</span>
        {label}
        {kbd && <span className={alwaysKbd ? "inline-flex" : "hidden min-[1500px]:inline-flex"}><Kbd>{kbd}</Kbd></span>}
        {trailing}
      </button>
    </Tooltip>
  );
}

/** The billing actions staff reach for with the mouse; each also has a key (shown on wide screens and in the F1 sheet).
 *  The old Tools menu is gone: Lock counter, Returns, Expenses, Day close, Staff report and Keyboard shortcuts live once,
 *  under the top bar's More menu. `tools` and `counterName` are ignored; callers should stop passing them. */
export function BillToolbar({ deliveryOn, staff, wholesale, heldCount, onDelivery, onPay, onDelete, onRefresh, onManual, onStaff, onRecent, onHold, onHeld, onWholesale }: {
  deliveryOn: boolean; staff: string; wholesale: boolean; heldCount: number;
  onDelivery: () => void; onPay: () => void; onDelete: () => void; onRefresh: () => void; onManual: () => void; onStaff: () => void;
  onRecent: () => void; onHold: () => void; onHeld: () => void; onWholesale: () => void;
  /** @deprecated unused: the Tools menu moved to the top bar's More menu */
  counterName?: string; /** @deprecated unused: see above */ tools?: MenuEntry[];
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-surface px-2" role="toolbar" aria-label="Billing actions">
      <TBtn label="Delivery" tip="Home delivery: address and delivery charge" kbd="F2" icon={<Truck size={15} />} active={deliveryOn} onClick={onDelivery} />
      <TBtn label="Pay mode" tip="Take payment" kbd="F3" icon={<Wallet size={15} />} onClick={onPay} />
      <TBtn label="Delete" tip="Delete the selected item" kbd="Del" icon={<Trash2 size={15} />} onClick={onDelete} active={false} />
      <TBtn label="Refresh" tip="Reload items, customer and totals" kbd="F5" icon={<RefreshCw size={15} />} onClick={onRefresh} />
      <TBtn label="Manual" tip="Add an item that is not in the list" icon={<PencilLine size={15} />} onClick={onManual} />
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <TBtn label={staff ? staff : 'Staff'} tip="Staff for this bill" kbd="F7" icon={<UserRoundCheck size={15} />} active={!!staff} onClick={onStaff} />
      <TBtn label="Recent" tip="Recent bills: reprint" kbd="F8" icon={<ReceiptIndianRupee size={15} />} onClick={onRecent} />
      <TBtn label="Hold" tip="Hold this bill for later" kbd="F6" icon={<Pause size={15} />} onClick={onHold} alwaysKbd />
      {heldCount > 0 && (
        <Tooltip label="Bring back a held bill" kbd="Shift+F6">
          <button
            type="button" tabIndex={-1} onClick={onHeld}
            className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[rgb(var(--attention-tint))] px-2 text-[13px] font-semibold text-[rgb(var(--attention-ink))] transition-colors hover:brightness-95"
          >
            <Layers size={14} /><span className="num">{heldCount}</span> waiting
          </button>
        </Tooltip>
      )}
      <TBtn label="Wholesale" tip="Use wholesale prices on this bill" kbd="Alt+W" icon={<Tags size={15} />} active={wholesale} onClick={onWholesale} />
    </div>
  );
}
