import { Ban, FileText } from 'lucide-react';
import { formatQty, isDecimalUnit, type BillDetail, type CreditNote } from '@gokul/data';
import { Badge, Money } from '@gokul/ui';
import { StatusBadge, dateTimeOf, modeLabel, refundLabel } from './helpers';

const COLS = 'grid-cols-[minmax(0,1fr)_72px_72px_56px_40px_92px]';

/** Full bill detail: header, lines, GST and payments. The receipt sits beside it (see History). */
export function BillDetailPane({ detail, onOpenNote }: { detail: BillDetail; onOpenNote: (n: CreditNote) => void }) {
  const { bill, returned, creditNotes, cancel, reprints } = detail;
  const t = bill.totals;
  const cancelled = bill.status === 'cancelled';
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="num text-xl font-bold tracking-tight text-ink">{bill.number}</h2>
            <StatusBadge bill={bill} detail={detail} />
            {reprints > 0 && <Badge tone="neutral">Printed again x{reprints}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-muted">
            <span>{dateTimeOf(bill.at)}</span><span>{bill.counter}</span><span>Cashier {bill.cashier}</span>
            <span className="font-medium text-ink">{bill.customerName}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bill total</div>
          <Money paise={t.grand} className={`text-2xl font-bold ${cancelled ? 'text-subtle line-through' : 'text-ink'}`} />
        </div>
      </div>

      {cancelled && cancel && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-control border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <Ban size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Cancelled - {cancel.reason}</div>
            <div className="text-xs opacity-90">By {cancel.by}, approved by {cancel.approvedBy}, {dateTimeOf(cancel.at)}. Stock put back.</div>
          </div>
        </div>
      )}

      <div className="px-5 pt-4">
        <div className={`grid ${COLS} h-8 items-center gap-x-2.5 rounded-t-control border border-b-0 border-line bg-table-head px-3 text-[11px] font-semibold uppercase tracking-wider text-table-head-ink`}>
          <span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Disc</span><span className="text-right">GST</span><span className="text-right">Amount</span>
        </div>
        <div className="divide-y divide-line rounded-b-control border border-line">
          {bill.lines.map((l, i) => (
            <div key={i} className={`grid ${COLS} items-center gap-x-2.5 px-3 py-2 text-sm`}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{l.name}</span>
                {returned[i] > 0 && <span className="text-xs font-medium text-warning">Returned {formatQty(returned[i], isDecimalUnit(l.unit))} {l.unit}</span>}
              </span>
              <span className="num text-right font-medium text-ink">{formatQty(l.qty, isDecimalUnit(l.unit))} <span className="text-xs font-normal text-subtle">{l.unit}</span></span>
              <span className="num text-right text-muted">{(l.rate / 100).toFixed(2)}</span>
              <span className="num text-right text-muted">{l.discount ? (l.discount / 100).toFixed(2) : '-'}</span>
              <span className="num text-right text-muted">{l.gstRate}%</span>
              <Money paise={l.amount} symbol={false} className="text-right font-semibold text-ink" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 px-5 py-4">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Payment</div>
            <ul className="space-y-1">
              {bill.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-1.5 text-sm">
                  <span className="font-medium text-ink">{modeLabel[p.mode]}{p.ref && <span className="num ml-2 text-xs font-normal text-subtle">{p.ref}</span>}</span>
                  <Money paise={p.amount} className="font-semibold" />
                </li>
              ))}
            </ul>
          </div>
          {creditNotes.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Credit notes</div>
              <ul className="space-y-1">
                {creditNotes.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => onOpenNote(n)} tabIndex={-1} className="flex w-full items-center gap-2 rounded-control border border-line px-3 py-1.5 text-left text-sm hover:bg-surface-3">
                      <FileText size={14} className="text-subtle" />
                      <span className="num whitespace-nowrap font-medium text-ink">{n.number}</span>
                      <span className="truncate text-xs text-muted">{refundLabel[n.refundMode]}</span>
                      <Money paise={n.totals.grand} className="ml-auto font-semibold text-warning" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Totals</div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items / qty</dt><dd className="num">{t.itemCount} / {formatQty(t.qtyCount, t.qtyCount % 1000 !== 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd><Money paise={t.gross} /></dd></div>
            {t.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd><Money paise={-t.discount} /></dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd><Money paise={t.taxable} /></dd></div>
            {t.slabs.filter((s) => s.rate > 0).map((s) => (
              <div key={s.rate} className="flex justify-between text-muted"><dt>CGST + SGST {s.rate}%</dt><dd><Money paise={s.cgst + s.sgst} /></dd></div>
            ))}
            {t.roundOff !== 0 && <div className="flex justify-between text-muted"><dt>Round off</dt><dd><Money paise={t.roundOff} sign /></dd></div>}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold"><dt>Grand total</dt><dd><Money paise={t.grand} /></dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
