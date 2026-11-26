import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ReceiptIndianRupee, Truck, UserRound, UserRoundCheck, X, XCircle } from 'lucide-react';
import { FEATURES } from '../features';
import type { BillTotals, CreditNote, Customer, CustomerWallet, Supply } from '@gokul/data';
import type { Delivery } from '../store';
import { creditLeft, formatPoints, formatPaise, formatQty, formatRupees, stateName } from '@gokul/data';
import { Button, Kbd, Money, clockTime, cn } from '@gokul/ui';

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

function GridRow({ label, sub, hint, onLabel, box, amount, clear, tone }: {
  label: React.ReactNode; sub?: string; hint?: string; onLabel?: () => void; box?: React.ReactNode; amount: React.ReactNode; clear?: React.ReactNode;
  tone?: 'success' | 'muted';
}) {
  const labelCls = cn('flex min-w-0 items-center gap-1.5 text-left', tone === 'success' ? 'text-success' : 'text-muted');
  const inner = <>
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {sub && <span className="num block truncate text-[10px] leading-tight text-subtle">{sub}</span>}
    </span>
    {hint && <span className="hidden min-[1366px]:inline-flex"><Kbd>{hint}</Kbd></span>}
  </>;
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

function BillStrip({ billNo, label, wholesale, deliveryOn, onDelivery, onWholesale }: { billNo: string; label?: string; wholesale?: boolean; deliveryOn?: boolean; onDelivery?: () => void; onWholesale?: () => void }) {
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
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num whitespace-nowrap text-md font-semibold tracking-tight text-ink">{billNo || '-'}</span>
            {deliveryOn && <button type="button" tabIndex={-1} onClick={onDelivery} title="Home delivery is on for this bill. Click to change (F2)" className="whitespace-nowrap rounded-full bg-[rgb(var(--mode-upi-tint))] px-2 py-px text-[11px] font-bold text-[rgb(var(--mode-upi-ink))] ring-1 ring-[rgb(var(--mode-upi)/0.35)]">Delivery on</button>}
            {wholesale && <button type="button" tabIndex={-1} onClick={onWholesale} title="Wholesale prices are on for this bill. Click to turn off (Alt+W)" className="whitespace-nowrap rounded-full bg-[rgb(var(--mode-card-tint))] px-2 py-px text-[11px] font-bold text-[rgb(var(--mode-card-ink))] ring-1 ring-[rgb(var(--mode-card)/0.35)]">Wholesale price</button>}
          </div>
        </div>
      </div>
      <div className="whitespace-nowrap text-right leading-tight">
        <div className="num text-md font-semibold text-ink">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div className="num text-xs text-muted">{now.toLocaleDateString('en-IN', { weekday: 'long' })}, {clockTime(now)}</div>
      </div>
    </div>
  );
}

type Slab = BillTotals['slabs'][number];

/** Tax breakup under the money rows: a labelled header, one row per GST rate, Cess only when some slab has it, and a total when there is more than one rate. */
function TaxBox({ slabs, inter }: { slabs: Slab[]; inter: boolean }) {
  const hasCess = slabs.some((s) => (s.cess ?? 0) > 0);
  const cols: { label: string; get: (s: Slab) => number }[] = [
    ...(inter ? [{ label: 'IGST', get: (s: Slab) => s.igst ?? 0 }] : [{ label: 'CGST', get: (s: Slab) => s.cgst }, { label: 'SGST', get: (s: Slab) => s.sgst }]),
    ...(hasCess ? [{ label: 'Cess', get: (s: Slab) => s.cess ?? 0 }] : []),
  ];
  const gridStyle = { gridTemplateColumns: `36px minmax(0,1fr) repeat(${cols.length}, minmax(0,1fr))` };
  const totalTax = slabs.reduce((n, s) => n + s.cgst + s.sgst + (s.igst ?? 0) + (s.cess ?? 0), 0);
  return (
    <div className="my-1.5 rounded-md border border-line bg-surface-2 px-2 py-1">
      {slabs.length === 0 ? <div className="py-0.5 text-xs text-subtle">No tax yet</div> : (
        <>
          <div className="grid items-center gap-x-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-subtle" style={gridStyle}>
            <span>GST</span>
            <span className="min-w-0 text-right">Taxable</span>
            {cols.map((c) => <span key={c.label} className="min-w-0 text-right">{c.label}</span>)}
          </div>
          {slabs.map((s) => (
            <div key={s.rate} className="num grid items-center gap-x-1.5 text-[11px] leading-4" style={gridStyle}>
              <span className="font-semibold text-ink">{s.rate}%</span>
              <span className="min-w-0 text-right text-muted">{formatPaise(s.taxable)}</span>
              {cols.map((c) => <span key={c.label} className="min-w-0 text-right text-ink">{formatPaise(c.get(s))}</span>)}
            </div>
          ))}
          {slabs.length > 1 && (
            <div className="num mt-0.5 flex items-center justify-between border-t border-line pt-0.5 text-[11px] leading-4">
              <span className="text-muted">Total tax</span>
              <b className="text-ink">{formatRupees(totalTax)}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SummaryPanel({ totals, customer, wallet, onCustomer, onPay, onDiscount, onClearDiscount, onApplyDiscount, lastBill, billNo, exchange, exchangeCredit, due, refundDue, onDropExchange, slotLabel, wholesale, cashDisc, focusCashDisc, onApplyCashDisc, onClearCashDisc, pointsRow, focusPoints, onApplyPoints, onClearPoints, storeCredit, storeCreditUsed, focusStoreCredit, onApplyStoreCredit, onClearStoreCredit, delivery, onDelivery, onWholesale, staff, onStaff, supply, shopState, onPlace }: {
  totals: BillTotals; customer: Customer | null; wallet?: CustomerWallet | null; onCustomer: () => void; onPay: () => void;
  /** Opens the whole-bill discount box (Shift+F5 does the same) */
  onDiscount: () => void; onClearDiscount: () => void;
  lastBill: { number: string; total: number } | null; billNo: string;
  /** Typed discount from the box in this panel ("50" rupees or "5%"); empty clears it */
  onApplyDiscount: (typed: string) => void;
  /** Exchange credit carried into this bill, what is left to pay after it, and what goes back to the customer when the bill is smaller */
  exchange: CreditNote | null; exchangeCredit: number; due: number; refundDue: number; onDropExchange: () => void;
  slotLabel?: string; wholesale?: boolean;
  /** Cash discount in paise, typed in rupees; separate from item discounts (Ctrl+K). */
  cashDisc: number; focusCashDisc: number; onApplyCashDisc: (typed: string) => void; onClearCashDisc: () => void;
  /** Points row: shown only when the customer has points and loyalty is on. `maxPoints` / `maxWorth` is what the rules allow on this bill today. */
  pointsRow: { balance: number; maxPoints: number; maxWorth: number; minRedeem: number; applied: number; amount: number } | null;
  focusPoints: number; onApplyPoints: (typed: string) => string | null; onClearPoints: () => void;
  /** Store credit (the customer's wallet / open credit notes) put on this bill, and how much of it this bill can use (Alt+C). */
  storeCredit: number; storeCreditUsed: number; focusStoreCredit: number; onApplyStoreCredit: (typed: string) => void; onClearStoreCredit: () => void;
  delivery: Delivery; onDelivery: () => void; onWholesale: () => void;
  staff: string; onStaff: () => void;
  /** Place of supply of this bill (customer's state, else the shop's), the shop's own state, and the click to change it */
  supply: Supply; shopState: string; onPlace: () => void;
}) {
  const cashRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<HTMLInputElement>(null);
  const pointsRef = useRef<HTMLInputElement>(null);
  const [pointsMsg, setPointsMsg] = useState('');
  useEffect(() => { if (focusCashDisc > 0) { cashRef.current?.focus(); cashRef.current?.select(); } }, [focusCashDisc]);
  useEffect(() => { if (focusPoints > 0) { pointsRef.current?.focus(); pointsRef.current?.select(); } }, [focusPoints]);
  useEffect(() => { if (focusStoreCredit > 0) { storeRef.current?.focus(); storeRef.current?.select(); } }, [focusStoreCredit]);
  const itemDisc = totals.discount - cashDisc;
  const goods = totals.gross - delivery.charge;
  const pct = goods > 0 && itemDisc > 0 ? Math.round((itemDisc / goods) * 1000) / 10 : 0;
  const hasDelivery = !!(delivery.address || delivery.locality || delivery.charge > 0);
  const empty = totals.itemCount === 0;
  const creditText = !customer ? '' : customer.creditLimit === 0 ? 'No credit' : customer.creditLimit < 0 ? 'No limit' : formatRupees(creditLeft(customer) ?? 0, { decimals: false });
  return (
    <>
      <BillStrip billNo={billNo} label={slotLabel} wholesale={wholesale} deliveryOn={hasDelivery} onDelivery={onDelivery} onWholesale={onWholesale} />
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
        {FEATURES.wallet && customer && (wallet?.storeCredit ?? 0) > 0 && ( // disabled 26 Nov 2026 by owner; re-enable by setting FEATURES.wallet=true
          <span className="mt-1.5 flex w-full items-center justify-between rounded-md bg-success-soft px-2 py-1 text-xs font-medium text-success">
            <span>Wallet balance</span><b className="num">{formatRupees(wallet!.storeCredit, { decimals: false })}</b>
          </span>
        )}
      </button>

      <div className="mx-3 mt-2 flex shrink-0 flex-wrap items-center gap-1.5">
        {supply.gstin && (
          <span className="flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-bold tracking-wide text-primary" title={`Recipient GSTIN ${supply.gstin}`}>
            B2B · Tax invoice <span className="num font-semibold tracking-normal text-ink/80">{supply.gstin}</span>
          </span>
        )}
        <button
          type="button" tabIndex={-1} onClick={onPlace}
          title={supply.inter ? 'Place of supply (click to change)' : `Same state as the shop: ${stateName(shopState) ?? shopState} (click to change)`}
          className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
            supply.inter ? 'bg-warning-soft text-warning hover:bg-warning/20' : 'bg-success-soft text-success hover:bg-success/20')}
        >
          {supply.inter ? `Other state (${stateName(supply.place) ?? supply.place}) · IGST` : 'Same state · CGST + SGST'}
        </button>
      </div>

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
          box={<AmountBox kind="percent" disabled={empty} onApply={onApplyDiscount} onEmpty={onDiscount} placeholder="0" ariaLabel="Discount in percent, like 5" title="Discount on the whole bill, in percent" />}
          amount={<Money paise={-itemDisc} />}
          clear={itemDisc > 0
            ? <button type="button" tabIndex={-1} onClick={onClearDiscount} title="Remove the discount" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
            : undefined}
        />
        <GridRow
          label="Cash discount" hint="Ctrl+K" tone={cashDisc ? 'success' : undefined}
          onLabel={() => { cashRef.current?.focus(); cashRef.current?.select(); }}
          box={<AmountBox kind="rupees" inputRef={cashRef} disabled={empty} onApply={onApplyCashDisc} placeholder="0" ariaLabel="Cash discount in rupees, like 5" title="Cash discount in rupees on the whole bill, on top of item discounts" />}
          amount={<Money paise={-cashDisc} />}
          clear={cashDisc > 0
            ? <button type="button" tabIndex={-1} onClick={onClearCashDisc} title="Remove the cash discount" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
            : undefined}
        />
        {customer && pointsRow && (
          <>
            <GridRow
              label="Points" hint="Alt+P" tone={pointsRow.amount > 0 ? 'success' : undefined}
              onLabel={() => { pointsRef.current?.focus(); pointsRef.current?.select(); }}
              box={<AmountBox kind="points" inputRef={pointsRef} disabled={empty} onType={() => setPointsMsg('')}
                onApply={(v) => { const m = onApplyPoints(v); setPointsMsg(m ?? ''); return m; }} onEmpty={onClearPoints}
                placeholder="pts" ariaLabel="Loyalty points to use on this bill" title="Use the customer's loyalty points to pay part of this bill" />}
              amount={<Money paise={-pointsRow.amount} />}
              clear={pointsRow.amount > 0
                ? <button type="button" tabIndex={-1} onClick={() => { setPointsMsg(''); onClearPoints(); }} title="Take the points off this bill" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
                : undefined}
            />
            <div className={cn('num -mt-0.5 mb-0.5 text-[11px] leading-snug', pointsMsg ? 'font-medium text-danger' : 'text-subtle')} role={pointsMsg ? 'alert' : undefined}>
              {pointsMsg
                ? pointsMsg
                : pointsRow.applied > 0
                  ? `Using ${pointsRow.applied} pts · ${formatPoints(Math.max(0, pointsRow.balance - pointsRow.applied))} pts left`
                  : <>Has {formatPoints(pointsRow.balance)} pts · {pointsRow.maxPoints >= pointsRow.minRedeem ? <>up to {formatRupees(pointsRow.maxWorth, { decimals: false })} today</> : empty ? 'add items to use them' : `needs ${pointsRow.minRedeem} pts to use`}</>}
            </div>
          </>
        )}
        {customer && storeCredit > 0 && (
          <GridRow
            label="Store credit" sub={`${formatRupees(storeCredit - storeCreditUsed, { decimals: false })} available`} hint="Alt+C"
            tone={storeCreditUsed > 0 ? 'success' : undefined}
            onLabel={() => { storeRef.current?.focus(); storeRef.current?.select(); }}
            box={<AmountBox kind="rupees" inputRef={storeRef} disabled={empty} onApply={onApplyStoreCredit} onEmpty={onClearStoreCredit} placeholder="amount" ariaLabel="Store credit in rupees to use on this bill" title="Use the customer's store credit (wallet) on this bill" />}
            amount={<Money paise={-storeCreditUsed} />}
            clear={storeCreditUsed > 0
              ? <button type="button" tabIndex={-1} onClick={onClearStoreCredit} title="Remove the store credit from this bill" className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-danger-soft hover:text-danger"><X size={13} /></button>
              : undefined}
          />
        )}
        {delivery.charge > 0 && <GridRow label="Delivery charge" hint="F2" amount={<Money paise={delivery.charge} />} />}
        <TaxBox slabs={totals.slabs} inter={supply.inter} />
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
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-95">Grand total</span>
          <span className="num font-semibold leading-none tracking-tight" style={{ fontSize: 36 }}>
            <Money paise={totals.grand - storeCreditUsed} softPaise />
          </span>
        </div>
        {pointsRow && pointsRow.amount > 0 && !empty && (
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary-soft px-3.5 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">To pay</span>
            <span className="num text-[24px] font-semibold leading-none tracking-tight text-ink"><Money paise={due} softPaise /></span>
          </div>
        )}
        <Button variant="primary" size="lg" block className="mt-2 !h-[48px] !text-base" onClick={onPay} kbd="F12" disabled={empty}>
          Pay now
        </Button>
      </div>
    </>
  );
}

/** A box in the panel: percent only, rupees only or whole points. The sign sits inside the box. Enter or Apply applies it; empty clears it.
    `onApply` may answer with a plain-words reason (a string): the typed value then stays so it can be fixed. */
function AmountBox({ kind, disabled, onApply, onEmpty, onType, placeholder, ariaLabel, title, inputRef }: {
  kind: 'percent' | 'rupees' | 'points';
  disabled?: boolean; onApply: (v: string) => void | string | null; onEmpty?: () => void; onType?: () => void; placeholder: string; ariaLabel: string; title?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [v, setV] = useState('');
  const go = () => {
    if (v.trim() !== '') {
      const r = onApply(v);
      if (typeof r === 'string') return;
      setV(''); document.querySelector<HTMLInputElement>('[data-scan-input]')?.focus();
    } else onEmpty?.();
  };
  const keep = kind === 'points' ? /[^\d]/g : /[^\d.]/g; // a percent box ignores rupee signs, a rupee box ignores %, points are whole
  return (
    <span className={cn('flex h-7 w-full min-w-0 items-center overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20', disabled && 'opacity-50')}>
      {kind === 'rupees' && <span aria-hidden className="shrink-0 pl-1.5 text-[13px] font-medium text-subtle">{'\u20B9'}</span>}
      <input
        ref={inputRef} value={v} disabled={disabled} inputMode={kind === 'points' ? 'numeric' : 'decimal'} placeholder={placeholder} aria-label={ariaLabel} title={title}
        onChange={(e) => { setV(e.target.value.replace(keep, '')); onType?.(); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { setV(''); onType?.(); (e.target as HTMLInputElement).blur(); } }}
        className={cn('num h-full min-w-0 flex-1 bg-transparent text-right text-[13px] font-medium text-ink placeholder:font-normal placeholder:text-subtle', kind === 'percent' ? 'pl-1.5 pr-0.5' : 'px-1.5')}
      />
      {kind === 'percent' && <span aria-hidden className="shrink-0 pr-1.5 text-[13px] font-medium text-subtle">%</span>}
      <button type="button" tabIndex={-1} disabled={disabled} onClick={go} title={title ? `${title} (Enter)` : 'Apply (Enter)'}
        className="flex h-full shrink-0 items-center border-l border-line bg-surface-2 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary-soft">Apply</button>
    </span>
  );
}
