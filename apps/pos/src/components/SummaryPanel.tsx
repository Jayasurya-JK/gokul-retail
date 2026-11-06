import { useEffect, useState } from 'react';
import { ChevronRight, PackageSearch, Receipt, UserRound } from 'lucide-react';
import type { BillTotals, CreditNote, Customer, Item, Milli } from '@gokul/data';
import { formatPaise, formatQty, formatRupees } from '@gokul/data';
import { Button, Kbd, Money, cn } from '@gokul/ui';
import { plural } from '../plural';

function CustStat({ k, v, tone }: { k: string; v: string; tone?: 'warning' }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-subtle">{k}</span>
      <span className={cn('num block truncate text-sm font-semibold', tone === 'warning' ? 'text-warning' : 'text-ink')}>{v}</span>
    </span>
  );
}

function Row({ label, hint, children, tone }: { label: string; hint?: string; children: React.ReactNode; tone?: 'success' | 'muted' }) {
  return (
    <div className="flex items-baseline justify-between py-[3px] text-base">
      <span className="flex items-center gap-1.5 text-muted">{label}{hint && <Kbd>{hint}</Kbd>}</span>
      <span className={cn('num font-medium', tone === 'success' && 'text-success', tone === 'muted' && 'text-muted')}>{children}</span>
    </div>
  );
}

export interface LastScanned { item: Item; onBill: Milli; left: Milli }

function BillStrip({ billNo }: { billNo: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><Receipt size={16} /></span>
        <div className="leading-tight">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Bill no.</div>
          <div className="num text-md font-semibold tracking-tight text-ink">{billNo || '-'}</div>
        </div>
      </div>
      <div className="text-right leading-tight">
        <div className="num text-md font-semibold text-ink">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div className="num text-xs text-muted">{now.toLocaleDateString('en-IN', { weekday: 'long' })}, {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
      </div>
    </div>
  );
}

function LastItemCard({ last }: { last: LastScanned | null }) {
  if (!last) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm text-subtle">
        <PackageSearch size={18} /> The last scanned item shows here with its stock.
      </div>
    );
  }
  const { item, left } = last;
  const low = left <= item.reorderLevel;
  const unit = item.loose ? (item.unit === 'l' ? 'L' : 'kg') : item.packSize ?? item.unit;
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-subtle">
        <span>Last scanned</span><span className="num normal-case tracking-normal">Code {item.code}</span>
      </div>
      <div className="mt-0.5 truncate text-md font-semibold text-ink">{item.name}</div>
      <div className="mt-1 flex items-end justify-between text-sm">
        <span className="text-muted">Rate <b className="num text-ink">{formatRupees(item.price, { decimals: false })}</b>{item.loose ? ` / ${unit}` : ''}{item.mrp > item.price && <span className="num ml-1.5 text-xs text-subtle line-through">{formatRupees(item.mrp, { decimals: false })}</span>}</span>
        <span className={cn('num font-semibold', left <= 0 ? 'text-danger' : low ? 'text-warning' : 'text-success')}>
          {left <= 0 ? 'No stock left' : `${formatQty(left, item.loose)} ${item.loose ? unit : ''} left`}
        </span>
      </div>
    </div>
  );
}

export function SummaryPanel({ totals, customer, onCustomer, onPay, lastBill, billNo, last, savings, exchange, due }: {
  totals: BillTotals; customer: Customer | null; onCustomer: () => void; onPay: () => void;
  lastBill: { number: string; total: number } | null; billNo: string; last: LastScanned | null; savings: number;
  exchange: CreditNote | null; due: number;
}) {
  const empty = totals.itemCount === 0;
  const avail = customer && customer.creditLimit ? customer.creditLimit - customer.outstanding : null;
  return (
    <>
      <BillStrip billNo={billNo} />
      <button
        tabIndex={-1} onClick={onCustomer}
        className="mx-3 mt-3 flex shrink-0 flex-col rounded-xl border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
      >
        <span className="flex w-full items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', customer ? 'bg-primary text-primary-fg' : 'bg-surface-3 text-subtle')}>
            <UserRound size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Customer <Kbd>F3</Kbd></span>
            <span className="block truncate text-md font-semibold text-ink">{customer ? customer.name : 'Walk-in customer'}</span>
            <span className="block truncate text-xs text-muted">
              {customer ? `${customer.phone} - last visit ${customer.lastVisit}` : 'Press F3 to attach a customer'}
            </span>
          </span>
          <ChevronRight size={16} className="text-subtle" />
        </span>
        {customer && (
          <span className="mt-2 grid w-full grid-cols-3 gap-1.5 border-t border-line pt-2 text-center">
            <CustStat k="Owes" v={formatRupees(customer.outstanding, { decimals: false })} tone={customer.outstanding ? 'warning' : undefined} />
            <CustStat k="Credit left" v={avail !== null ? formatRupees(Math.max(0, avail), { decimals: false }) : 'No limit'} />
            <CustStat k="Points" v={String(customer.loyaltyPoints)} />
          </span>
        )}
      </button>

      <div className="mx-4 mt-2 flex shrink-0 items-center justify-between border-b border-line pb-2 text-sm text-muted">
        <span>Items <b className="num text-ink">{totals.itemCount}</b></span>
        <span>Quantity <b className="num text-ink">{formatQty(totals.qtyCount, totals.qtyCount % 1000 !== 0)}</b></span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
        <Row label="Subtotal"><Money paise={totals.gross} /></Row>
        <Row label="Discount" hint="F5" tone={totals.discount ? 'success' : 'muted'}>{totals.discount ? <Money paise={-totals.discount} /> : <Money paise={0} />}</Row>
        <div className="my-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="mb-1 grid grid-cols-[44px_1fr_1fr_1fr] gap-x-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            <span>GST</span><span className="text-right">Taxable</span><span className="text-right">CGST</span><span className="text-right">SGST</span>
          </div>
          {totals.slabs.length === 0 && <div className="py-0.5 text-sm text-subtle">No tax yet</div>}
          {totals.slabs.map((s) => (
            <div key={s.rate} className="grid grid-cols-[44px_1fr_1fr_1fr] gap-x-2 py-0.5 text-sm num">
              <span className="font-medium text-ink">{s.rate}%</span>
              <span className="text-right text-muted">{formatPaise(s.taxable)}</span>
              <span className="text-right text-ink">{formatPaise(s.cgst)}</span>
              <span className="text-right text-ink">{formatPaise(s.sgst)}</span>
            </div>
          ))}
        </div>
        <Row label="Round off" tone="muted"><Money paise={totals.roundOff} sign decimals /></Row>

        {exchange && (
          <div className="mt-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2">
            <div className="flex items-center justify-between text-sm font-medium text-info">
              <span className="flex items-center gap-1.5">Exchange credit <span className="num">{exchange.number}</span></span>
              <b className="num"><Money paise={-Math.min(exchange.totals.grand, totals.grand || exchange.totals.grand)} /></b>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span className="flex items-center gap-1"><Kbd>Ctrl+Del</Kbd> remove</span>
              <span>To pay <b className="num text-sm text-ink"><Money paise={due} /></b></span>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-3">
          {savings > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-success-soft px-3 py-1.5 text-sm text-success">
              <span>Customer saves against MRP</span>
              <b className="num"><Money paise={savings} decimals={false} /></b>
            </div>
          )}
          <LastItemCard last={last} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        {lastBill && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-success-soft px-3 py-1.5 text-xs text-success">
            <span>Last bill <b className="num">{lastBill.number}</b></span>
            <b className="num">{formatRupees(lastBill.total, { decimals: false })}</b>
          </div>
        )}
        <div className={cn('rounded-xl px-4 pb-3 pt-2.5 transition-colors', empty ? 'bg-surface-3 text-muted' : 'bg-chrome text-white')}>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
            <span>Grand total</span>
            <span className="num">{plural(totals.itemCount, 'item')}</span>
          </div>
          <div className="num text-right font-semibold leading-[1.05] tracking-tight" style={{ fontSize: 'clamp(40px, 3.6vw, 56px)' }}>
            <Money paise={totals.grand} softPaise />
          </div>
        </div>
        <Button variant="primary" size="lg" block className="mt-2.5 !h-[52px] !text-lg" onClick={onPay} kbd="F12" disabled={empty}>
          Pay now
        </Button>
      </div>
    </>
  );
}
