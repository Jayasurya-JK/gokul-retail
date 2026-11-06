import { useMemo, type ReactNode } from 'react';
import { formatPaise, formatQty, type BillLine, type BillTotals, type Payment, type Settings } from '@gokul/data';
import { cn } from '../cn';
import { Logo } from './Logo';

export interface ReceiptData {
  /** "TAX INVOICE", "CREDIT NOTE" */
  title: string;
  number: string;
  at: string;
  cashier: string;
  customerName?: string;
  /** e.g. "Against bill GK-048201" on a credit note */
  reference?: string;
  lines: BillLine[];
  totals: BillTotals;
  payments?: Payment[];
  /** Credit note: amounts are going back to the customer */
  refund?: boolean;
  /** Big diagonal stamp, e.g. CANCELLED or DUPLICATE COPY */
  stamp?: string;
  /** Extra line under the totals, e.g. refund mode */
  note?: ReactNode;
}

const DECIMAL = ['kg', 'g', 'l', 'ml'];
const money = (p: number) => formatPaise(p);

/** Decorative bar pattern derived from the bill number (the real printer draws Code 128). */
function BarStrip({ value }: { value: string }) {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; i < value.length * 3 + 8; i++) {
      const code = value.charCodeAt(i % value.length) + i * 7;
      const w = 1 + (code % 3);
      if (i % 2 === 0) out.push({ x, w });
      x += w;
    }
    return { out, width: x };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${bars.width} 30`} preserveAspectRatio="none" className="mx-auto h-8 w-[220px]" aria-hidden>
      {bars.out.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={30} fill="currentColor" />)}
    </svg>
  );
}

/**
 * 80mm thermal receipt, drawn like the paper (monospace, black on white, even in dark theme).
 * Pure display: all amounts come in already computed. Used by POS History/Returns and Gokul Office.
 */
export function ReceiptPreview({ data, settings, className }: { data: ReceiptData; settings: Settings; className?: string }) {
  const { totals: t } = data;
  const dt = new Date(data.at);
  const date = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const sign = data.refund ? '-' : '';
  const rule = <div className="my-1.5 border-t border-dashed border-neutral-400" />;
  return (
    <div
      className={cn(
        'relative mx-auto w-[302px] select-text overflow-hidden bg-white px-4 py-5 font-mono text-[11.5px] leading-[1.45] text-neutral-900 shadow-pop',
        className,
      )}
      style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 6px),97% 100%,94% calc(100% - 6px),91% 100%,88% calc(100% - 6px),85% 100%,82% calc(100% - 6px),79% 100%,76% calc(100% - 6px),73% 100%,70% calc(100% - 6px),67% 100%,64% calc(100% - 6px),61% 100%,58% calc(100% - 6px),55% 100%,52% calc(100% - 6px),49% 100%,46% calc(100% - 6px),43% 100%,40% calc(100% - 6px),37% 100%,34% calc(100% - 6px),31% 100%,28% calc(100% - 6px),25% 100%,22% calc(100% - 6px),19% 100%,16% calc(100% - 6px),13% 100%,10% calc(100% - 6px),7% 100%,4% calc(100% - 6px),1% 100%,0 calc(100% - 6px))' }}
    >
      {data.stamp && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-[18deg] rounded border-[3px] border-red-600/70 px-3 py-1 font-sans text-2xl font-extrabold uppercase tracking-widest text-red-600/70">
            {data.stamp}
          </span>
        </div>
      )}
      <div className="text-center">
        <Logo size={44} className="mx-auto mb-1 grayscale contrast-125" />
        <div className="text-[15px] font-bold uppercase tracking-wide">{settings.shopName}</div>
        <div>{settings.address}</div>
        <div>Ph: {settings.phone}</div>
        <div className="font-semibold">GSTIN: {settings.gstin}</div>
      </div>
      {rule}
      <div className="text-center text-[12.5px] font-bold tracking-widest">{data.title}</div>
      {rule}
      <div className="flex justify-between"><span>No: <b>{data.number}</b></span><span>{date}</span></div>
      <div className="flex justify-between"><span>Cashier: {data.cashier}</span><span>{time}</span></div>
      {data.customerName && data.customerName !== 'Walk-in' && <div>Customer: {data.customerName}</div>}
      {data.reference && <div className="font-semibold">{data.reference}</div>}
      {rule}
      <div className="flex justify-between font-bold"><span>Item</span><span>Amount</span></div>
      <div className="mt-1 space-y-1.5">
        {data.lines.map((l, i) => (
          <div key={i}>
            <div className="break-words font-semibold">{l.name}</div>
            <div className="flex justify-between">
              <span>{formatQty(l.qty, DECIMAL.includes(l.unit))} {l.unit} x {money(l.rate)}{l.gstRate ? ` (${l.gstRate}%)` : ''}</span>
              <span className="font-semibold">{sign}{money(l.amount)}</span>
            </div>
            {l.discount > 0 && <div className="flex justify-between text-neutral-600"><span>  Disc</span><span>-{money(l.discount)}</span></div>}
          </div>
        ))}
      </div>
      {rule}
      <div className="flex justify-between"><span>Items {t.itemCount}</span><span>Qty {formatQty(t.qtyCount, t.qtyCount % 1000 !== 0)}</span></div>
      <div className="flex justify-between"><span>Sub total</span><span>{sign}{money(t.gross)}</span></div>
      {t.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(t.discount)}</span></div>}
      {t.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span>{t.roundOff > 0 ? '+' : '-'}{money(Math.abs(t.roundOff))}</span></div>}
      <div className="mt-1 flex items-baseline justify-between border-y border-neutral-900 py-1 font-sans text-[16px] font-extrabold">
        <span>{data.refund ? 'REFUND' : 'TOTAL'}</span><span className="num">{sign}₹{money(t.grand)}</span>
      </div>
      {rule}
      <div className="grid grid-cols-[34px_1fr_1fr_1fr] gap-x-1 text-[10.5px]">
        <span className="font-bold">GST</span><span className="text-right font-bold">Taxable</span><span className="text-right font-bold">CGST</span><span className="text-right font-bold">SGST</span>
        {t.slabs.map((s) => (
          <div key={s.rate} className="contents">
            <span>{s.rate}%</span><span className="text-right">{money(s.taxable)}</span><span className="text-right">{money(s.cgst)}</span><span className="text-right">{money(s.sgst)}</span>
          </div>
        ))}
      </div>
      {data.payments && data.payments.length > 0 && (
        <>
          {rule}
          {data.payments.map((p, i) => (
            <div key={i} className="flex justify-between"><span className="uppercase">{p.mode}{p.ref ? ` (${p.ref.slice(-6)})` : ''}</span><span>{money(p.amount)}</span></div>
          ))}
        </>
      )}
      {data.note && <>{rule}<div className="text-center font-semibold">{data.note}</div></>}
      {rule}
      <div className="text-center">{settings.receiptFooter}</div>
      <div className="mt-2 text-neutral-900"><BarStrip value={data.number} /></div>
      <div className="text-center text-[10px] tracking-[0.2em]">{data.number}</div>
    </div>
  );
}
