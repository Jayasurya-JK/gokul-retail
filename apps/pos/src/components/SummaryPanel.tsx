import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ReceiptIndianRupee, Truck, UserRound, UserRoundCheck, X, XCircle } from 'lucide-react';
import type { BillTotals, CreditNote, Customer, CustomerWallet } from '@gokul/data';
import type { Delivery } from '../store';
import { creditLeft, formatPoints, formatPaise, formatQty, formatRupees } from '@gokul/data';
import { Button, Kbd, Money, cn } from '@gokul/ui';

function CustStat({ k, v, tone }: { k: string; v: string; tone?: 'warning' }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-subtle">{k}</span>
      <span className={cn('num block truncate text-sm font-semibold', tone === 'warning' ? 'text-warning' : 'text-ink')}>{v}</span>
    </span>
  );
}

/** One shared grid for every money row: label left, input just left of the amount column, amount right. */
const ROW_GRID = 'grid h-8 grid-cols-[minmax(0,1fr)_104px_88px_20px] items-center gap-x-1.5 text-sm';

function GridRow({ label, hint, onLabel, box, amount, clear, tone }: {
  label: React.ReactNode; hint?: string; onLabel?: () => void; box?: React.ReactNode; amount: React.ReactNode; clear?: React.ReactNode;
  tone?: 'success' | 'muted';
}) {
  const labelCls = cn('flex min-w-0 items-center gap-1.5 text-left', tone === 'success' ? 'text-success' : 'text-muted');
  const inner = <><span className="truncate">{label}</span>{hint && <Kbd>{hint}</Kbd>}</>;
  return (
    <div className={ROW_GRID}>
      {onLabel
        ? <button type="button" tabIndex={-1} onClick={onLabel} className={cn(labelCls, '-mx-1.5 rounded px-1.5 hover:bg-primary-soft hover:text-primary')}>{inner}</button>
        : <span className={labelCls}>{inner}</span>}
      <span className="flex min-w-0 justify-end">{box}</span>
      <span className={cn('num text-right font-medium', tone === 'success' ? 'text-success' : tone === 'muted' ? 'text-muted' : 'text-ink')}>{amount}</span>
      <span className="flex justify-end">{clear}</span>
    </div>
  );
}

function BillStrip({ billNo, label, wholesale }: { billNo: string; label?: string; wholesale?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><ReceiptIndianRupee size={16} /></span>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Bill no.
            {label && label !== 'Point of Sale' && <span className="rounded bg-primary-soft px-1.5 py-px text-[10px] font-bold tracking-wide text-primary">{label}</span>}
            {wholesale && <span className="rounded bg-accent/25 px-1.5 py-px text-[10px] font-bold tracking-wide text-warning">WHOLESALE</span>}
          </div>
          <div className="num whitespace-nowrap text-md font-semibold tracking-tight text-ink">{billNo || '-'}</div>
        </div>
      </div>
      <div className="whitespace-nowrap text-right leading-tight">
        <div className="num text-md font-semibold text-ink">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div className="num text-xs text-muted">{now.toLocaleDateString('en-IN', { weekday: 'long' })}, {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
      </div>
    </div>
  );
}

export function SummaryPanel({ totals, customer, wallet, onCustomer, onPay, onDiscount, onClearDiscount, onApplyDiscount, lastBill, billNo, exchange, exchangeCredit, due, refundDue, onDropExchange, slotLabel, wholesale, cashDisc, cashDiscBps, focusCashDisc, onApplyCashDisc, onClearCashDisc, delivery, onDelivery, staff, onStaff }: {
  totals: BillTotals; customer: Customer | null; wallet?: CustomerWallet | null; onCustomer: () => void; onPay: () => void;
  /** Opens the whole-bill discount box (Shift+F5 does the same) */
  onDiscount: () => void; onClearDiscount: () => void;
  lastBill: { number: string; total: number } | null; billNo: string;
  /** Typed discount from the box in this panel ("50" rupees or "5%"); empty clears it */
  onApplyDiscount: (typed: string) => void;
  /** Exchange credit carried into this bill, what is left to pay after it, and what goes back to the customer when the bill is smaller */
  exchange: CreditNote | null; exchangeCredit: number; due: number; refundDue: number; onDropExchange: () => void;
  slotLabel?: string; wholesale?: boolean;
  /** Cash discount in paise and as percent x 100; separate from item discounts (Ctrl+K). The box applies a rupee amount or a percent. */
  cashDisc: number; cashDiscBps: number; focusCashDisc: number; onApplyCashDisc: (typed: string) => void; onClearCashDisc: () => void;
  delivery: Delivery; onDelivery: () => void;
  staff: string; onStaff: () => void;
}) {
  const cashRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusCashDisc > 0) { cashRef.current?.focus(); cashRef.current?.select(); } }, [focusCashDisc]);
  const itemDisc = totals.discount - cashDisc;
  const goods = totals.gross - delivery.charge;
  const pct = goods > 0 && itemDisc > 0 ? Math.round((itemDisc / goods) * 1000) / 10 : 0;
  const hasDelivery = !!(delivery.address || delivery.locality || delivery.charge > 0);
  const empty = totals.itemCount === 0;
  const creditText = !customer ? '' : customer.creditLimit === 0 ? 'No credit' : customer.creditLimit < 0 ? 'No limit' : formatRupees(creditLeft(customer) ?? 0, { decimals: false });
  return (
    <>
      <BillStrip billNo={billNo} label={slotLabel} wholesale={wholesale} />
      <button
        tabIndex={-1} onClick={onCustomer}
        className="mx-3 mt-3 flex shrink-0 flex-col rounded-xl border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
      >
        <span className="flex w-full items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', customer ? 'bg-primary text-primary-fg' : 'bg-surface-3 text-subtle')}>
            <UserRound size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Customer <Kbd>F11</Kbd></span>
            <span className="block truncate text-md font-semibold text-ink">{customer ? customer.name : 'Walk-in customer'}</span>
            <span className="block truncate text-xs text-muted">
              {customer ? `${customer.phone} - last visit ${customer.lastVisit}` : 'Press F11 to attach a customer'}
            </span>
          </span>
          <ChevronRight size={16} className="text-subtle" />
        </span>
        {customer && (
          <span className="mt-2 grid w-full grid-cols-4 gap-1.5 border-t border-line pt-2 text-center">
            <CustStat k="Code" v={customer.id.toUpperCase()} />
            <CustStat k="Closing bal" v={formatRupees(customer.outstanding, { decimals: false })} tone={customer.outstanding ? 'warning' : undefined} />
            <CustStat k={customer.creditLimit === 0 ? 'Credit' : 'Credit left'} v={creditText} />
            <CustStat k="Points" v={formatPoints(wallet?.points ?? customer.loyaltyPoints)} />
          </span>
        )}
        {customer && wallet?.nextExpiry && (
          <span className="mt-1.5 flex w-full items-center justify-between rounded-md bg-warning-soft px-2 py-1 text-xs font-medium text-warning">
            <span><b className="num">{formatPoints(wallet.nextExpiry.points)}</b> points expire on</span><b className="num">{new Date(`${wallet.nextExpiry.on}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
          </span>
        )}
        {customer && (wallet?.storeCredit ?? 0) > 0 && (
          <span className="mt-1.5 flex w-full items-center justify-between rounded-md bg-success-soft px-2 py-1 text-xs font-medium text-success">
            <span>Wallet balance</span><b className="num">{formatRupees(wallet!.storeCredit, { decimals: false })}</b>
          </span>
        )}
      </button>

      {(hasDelivery || staff) && (
        <div className="mx-3 mt-2 flex shrink-0 flex-col gap-1">
          {hasDelivery && (
            <button type="button" tabIndex={-1} onClick={onDelivery} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-line-strong hover:bg-surface-3">
              <Truck size={14} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">Home delivery{delivery.locality ? ` - ${delivery.locality}` : ''}</span>
                {delivery.address && <span className="block truncate text-muted">{delivery.address}</span>}
              </span>
              {delivery.charge > 0 && <b className="num text-ink">{formatRupees(delivery.charge, { decimals: false })}</b>}
            </button>
          )}
          {staff && (
            <button type="button" tabIndex={-1} onClick={onStaff} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-line-strong hover:bg-surface-3">
              <UserRoundCheck size={14} className="shrink-0 text-primary" />
              <span className="flex-1 text-muted">Staff</span><b className="text-ink">{staff}</b><Kbd>F7</Kbd>
            </button>
          )}
        </div>
      )}

      <div className="mx-4 mt-1.5 flex shrink-0 items-center justify-between border-b border-line pb-1.5 text-xs text-muted">
        <span>Items <b className="num text-ink">{totals.itemCount}</b></span>
        <span>Quantity <b className="num text-ink">{formatQty(totals.qtyCount, totals.qtyCount % 1000 !== 0)}</b></span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-1.5">
        <GridRow label="Subtotal" amount={<Money paise={goods} />} />
        <GridRow
          label={itemDisc ? `Discount ${pct}%` : 'Discount'} tone={itemDisc ? 'success' : undefined}
          box={<AmountBox disabled={empty} onApply={onApplyDiscount} onEmpty={onDiscount} placeholder="₹ or %" ariaLabel="Discount in rupees, or percent like 5%" />}
          amount={<Money paise={-itemDisc} />}
          clear={itemDisc > 0
            ? <button type="button" tabIndex={-1} onClick={onClearDiscount} title="Remove the discount" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
            : undefined}
        />
        <GridRow
          label={cashDisc ? `Cash discount ${cashDiscBps / 100}%` : 'Cash discount'} hint="Ctrl+K" tone={cashDisc ? 'success' : undefined}
          onLabel={() => { cashRef.current?.focus(); cashRef.current?.select(); }}
          box={<AmountBox inputRef={cashRef} disabled={empty} onApply={onApplyCashDisc} placeholder="₹ or %" ariaLabel="Cash discount in rupees, or percent like 5%" title="Cash discount on the whole bill, on top of item discounts" />}
          amount={<Money paise={-cashDisc} />}
          clear={cashDisc > 0
            ? <button type="button" tabIndex={-1} onClick={onClearCashDisc} title="Remove the cash discount" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
            : undefined}
        />
        {delivery.charge > 0 && <GridRow label="Delivery charge" hint="F2" amount={<Money paise={delivery.charge} />} />}
        <div className="my-1.5 rounded-md border border-line bg-surface-2 px-2 py-1">
          {totals.slabs.length === 0 && <div className="py-0.5 text-xs text-subtle">No tax yet</div>}
          {totals.slabs.map((s) => (
            <div key={s.rate} className="grid grid-cols-[34px_1fr_1fr_1fr] gap-x-1.5 text-[11px] leading-4 num">
              <span className="font-semibold text-ink">{s.rate}%</span>
              <span className="text-right text-muted">{formatPaise(s.taxable)}</span>
              <span className="text-right text-ink"><span className="text-subtle">C </span>{formatPaise(s.cgst)}</span>
              <span className="text-right text-ink"><span className="text-subtle">S </span>{formatPaise(s.sgst)}</span>
            </div>
          ))}
        </div>
        {totals.roundOff !== 0 && <GridRow label="Round off" tone="muted" amount={<Money paise={totals.roundOff} sign decimals />} />}

        {exchange && (
          <div className="mb-1.5 mt-1 rounded-md border border-info/30 bg-info-soft px-2.5 py-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs font-medium text-info">
              <span className="min-w-0 truncate">Exchange credit <span className="text-[10px] font-normal text-muted">(from <span className="num">{exchange.billNumber}</span>)</span></span>
              <b className="num shrink-0"><Money paise={exchangeCredit} /></b>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between text-xs text-ink">
              <span className="text-muted">New items</span>
              <b className="num"><Money paise={totals.grand} /></b>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-info/25 pt-1">
              {empty ? (
                <span className="text-xs text-muted">Add the new items the customer wants</span>
              ) : refundDue > 0 ? (
                <>
                  <span className="text-xs font-semibold text-warning">Refund to customer</span>
                  <b className="num text-sm text-warning"><Money paise={refundDue} /></b>
                </>
              ) : due > 0 ? (
                <>
                  <span className="text-xs font-semibold text-ink">Customer pays</span>
                  <b className="num text-sm text-ink"><Money paise={due} /></b>
                </>
              ) : (
                <span className="text-xs font-semibold text-success">Credit covers the bill exactly</span>
              )}
            </div>
            {refundDue > 0 && !empty && <div className="mt-0.5 text-[11px] leading-snug text-muted">Cash or UPI is chosen in payment. A manager PIN is asked.</div>}
            <button
              type="button" tabIndex={-1} onClick={onDropExchange}
              className="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-danger/40 bg-surface text-[11px] font-semibold text-danger transition-colors hover:bg-danger-soft"
              title="Take only the exchange credit off this bill. The items stay."
            >
              <XCircle size={13} /> Remove exchange <Kbd>Ctrl+Del</Kbd>
            </button>
          </div>
        )}

      </div>

      <div className="shrink-0 px-3 pb-3">
        {lastBill && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-success-soft px-3 py-1.5 text-xs text-success">
            <span>Last bill <b className="num">{lastBill.number}</b></span>
            <b className="num">{formatRupees(lastBill.total, { decimals: false })}</b>
          </div>
        )}
        <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3.5 py-1.5 transition-colors', empty ? 'bg-surface-3 text-muted' : 'bg-chrome text-white')}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">Grand total</span>
          <span className="num font-semibold leading-none tracking-tight" style={{ fontSize: 36 }}>
            <Money paise={totals.grand} softPaise />
          </span>
        </div>
        <Button variant="primary" size="lg" block className="mt-2 !h-[48px] !text-base" onClick={onPay} kbd="F12" disabled={empty}>
          Pay now
        </Button>
      </div>
    </>
  );
}

/** Discount typed in the panel itself: "50" is rupees, "5%" is percent. Enter or Apply applies it; empty clears it. */
function AmountBox({ disabled, onApply, onEmpty, placeholder, ariaLabel, title, inputRef }: {
  disabled?: boolean; onApply: (v: string) => void; onEmpty?: () => void; placeholder: string; ariaLabel: string; title?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [v, setV] = useState('');
  const go = () => {
    if (v.trim() !== '') { onApply(v); setV(''); document.querySelector<HTMLInputElement>('[data-scan-input]')?.focus(); }
    else onEmpty?.();
  };
  return (
    <span className={cn('flex h-7 w-full min-w-0 items-center overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20', disabled && 'opacity-50')}>
      <input
        ref={inputRef} value={v} disabled={disabled} inputMode="decimal" placeholder={placeholder} aria-label={ariaLabel} title={title}
        onChange={(e) => setV(e.target.value.replace(/[^\d.%]/g, ''))}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { setV(''); (e.target as HTMLInputElement).blur(); } }}
        className="num h-full min-w-0 flex-1 bg-transparent px-1.5 text-right text-[13px] font-medium text-ink placeholder:font-normal placeholder:text-subtle"
      />
      <button type="button" tabIndex={-1} disabled={disabled} onClick={go} title={title ? `${title} (Enter)` : 'Apply (Enter)'}
        className="flex h-full shrink-0 items-center border-l border-line bg-surface-2 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary-soft">Apply</button>
    </span>
  );
}
