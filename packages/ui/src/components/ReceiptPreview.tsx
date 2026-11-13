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
  lines: (BillLine & { mrp?: number })[];
  totals: BillTotals;
  payments?: Payment[];
  /** Credit note: amounts are going back to the customer */
  refund?: boolean;
  /** Big diagonal stamp, e.g. CANCELLED or DUPLICATE COPY */
  stamp?: string;
  /** Extra line under the totals, e.g. refund mode */
  note?: ReactNode;
  /** Small line under the title: TAX INVOICE */
  subtitle?: string;
  counter?: string;
  customerId?: string;
  customerPhone?: string;
  customerAddress?: string;
  /** Loyalty balance, shown with two decimals */
  points?: number;
  /** Points that lapse next (yyyy-mm-dd). Shown as "N pts expire dd/mm/yy" only when within 30 days; pass it only when loyalty.printExpiry is on. */
  pointsExpiry?: { points: number; on: string } | null;
  /** Cash handed over (cash paid + change), for "Amount Received" */
  received?: number;
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

/** "N pts expire dd/mm/yy" when the next points lapse within 30 days (same rule as the printed bill), else null. */
export function pointsExpiryLine(e: { points: number; on: string } | null | undefined, now: Date = new Date()): string | null {
  if (!e || !(e.points > 0)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.on);
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days > 30) return null;
  return `${e.points.toFixed(2)} pts expire ${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

/** The shop's printed-bill details that are not in the basic settings (Gokul Office, Settings, Shop and Bill format). */
export interface ReceiptShop {
  /** Tamil line under the shop name */
  tagline?: string;
  /** "For Orders: WhatsApp" number */
  whatsapp?: string;
  /** Tamil line above the footer */
  footerTamil?: string;
  /** Mobile number line ("Mobile.No : ...") */
  mobile?: string;
}

/**
 * 80mm thermal receipt, drawn like the paper (monospace, black on white, even in dark theme). A sale follows the shop's own
 * bill: logo, name, Tamil line, address, GSTIN, title by payment mode, customer, BILL NO / DATE, product table, NET AMOUNT, tax
 * table, payment box, footer. A credit note keeps the simple refund layout.
 * Pure display: all amounts come in already computed. Used by POS Sales/Returns and Gokul Office.
 */
export function ReceiptPreview({ data, settings, shop, className }: { data: ReceiptData; settings: Settings; shop?: ReceiptShop; className?: string }) {
  const expiryLine = pointsExpiryLine(data.pointsExpiry);
  const { totals: t } = data;
  const dt = new Date(data.at);
  const date = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();
  const sign = data.refund ? '-' : '';
  const isBill = !data.refund;
  const rule = <div className="my-1.5 border-t border-dashed border-neutral-400" />;
  const cash = (data.payments ?? []).filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
  const row = 'grid grid-cols-[1fr_52px_52px_34px_62px] gap-x-1 text-right';
  return (
    <div
      className={cn(
        'relative mx-auto w-[302px] shrink-0 select-text overflow-hidden bg-white px-4 py-5 font-mono text-[11.5px] leading-[1.45] text-neutral-900 shadow-pop',
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
        {/* about 25 mm on paper, the same as the printed bill's logo */}
        <Logo size={92} className="mx-auto mb-1 grayscale contrast-125" />
        <div className="text-[15px] font-bold uppercase tracking-wide">{settings.shopName}</div>
        {shop?.tagline && <div className="font-sans text-[12px] font-semibold">{shop.tagline}</div>}
        <div>{settings.address}</div>
        <div className="font-semibold">GSTIN: {settings.gstin}.</div>
        {isBill && settings.phone && <div>Mobile.No : {settings.phone}.</div>}
        {!isBill && <div>Ph: {settings.phone}</div>}
      </div>
      {rule}
      <div className="text-center text-[14px] font-bold tracking-wide">{data.title}</div>
      {data.subtitle && <div className="text-center text-[10.5px] tracking-widest">{data.subtitle}</div>}
      {rule}
      {isBill && data.customerName && data.customerName !== 'Walk-in' && (
        <>
          <div>Customer Name : {data.customerName}</div>
          {data.customerId && <div>Cust ID : {data.customerId}</div>}
          {data.customerPhone && <div>Contact No : {data.customerPhone}</div>}
          {data.customerAddress && <div>Address : {data.customerAddress}</div>}
          {data.points !== undefined && <div>Points : {data.points.toFixed(2)}</div>}
          {data.points !== undefined && expiryLine && <div>{expiryLine}</div>}
          {rule}
        </>
      )}
      {isBill ? (
        <>
          <div className="flex justify-between"><span>BILL NO : <b>{data.number}</b></span><span>DATE : {date}</span></div>
          <div className="flex justify-between"><span>Counter : {data.counter ?? data.cashier}</span><span>TIME : {time}</span></div>
        </>
      ) : (
        <>
          <div className="flex justify-between"><span>No: <b>{data.number}</b></span><span>{date}</span></div>
          <div className="flex justify-between"><span>By: {data.cashier}</span><span>{time}</span></div>
          {data.customerName && data.customerName !== 'Walk-in' && <div>Customer: {data.customerName}</div>}
          {data.reference && <div className="font-semibold">{data.reference}</div>}
        </>
      )}
      {rule}
      {isBill ? (
        <>
          <div className={cn(row, 'font-bold')}><span className="text-left">PRODUCT</span><span>MRP</span><span>RATE</span><span>QTY</span><span>AMT</span></div>
          {rule}
          <div className="space-y-1.5">
            {data.lines.map((l, i) => (
              <div key={i}>
                <div className="break-words font-semibold">{l.name}</div>
                <div className={row}>
                  <span />
                  <span>{l.mrp ? money(l.mrp) : ''}</span><span>{money(l.rate)}</span>
                  <span>{formatQty(l.qty, DECIMAL.includes(l.unit))}</span><span className="font-semibold">{money(l.amount)}</span>
                </div>
                {l.discount > 0 && <div className="flex justify-between text-neutral-600"><span>  Discount</span><span>-{money(l.discount)}</span></div>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between font-bold"><span>Item</span><span>Amount</span></div>
          <div className="mt-1 space-y-1.5">
            {data.lines.map((l, i) => (
              <div key={i}>
                <div className="break-words font-semibold">{l.name}</div>
                <div className="flex justify-between">
                  <span>{formatQty(l.qty, DECIMAL.includes(l.unit))} {l.unit} x {money(l.rate)}{l.gstRate ? ` (${l.gstRate}%)` : ''}</span>
                  <span className="font-semibold">{sign}{money(l.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {rule}
      <div className="flex justify-between"><span>ITEMS : {t.itemCount}</span><span>TOTAL QTY : {formatQty(t.qtyCount, t.qtyCount % 1000 !== 0)}</span></div>
      <div className="flex justify-between font-bold"><span>{isBill ? 'TOTAL' : 'Sub total'}</span><span>{sign}{money(t.gross)}</span></div>
      {t.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(t.discount)}</span></div>}
      {t.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span>{t.roundOff > 0 ? '+' : '-'}{money(Math.abs(t.roundOff))}</span></div>}
      <div className="mt-1 flex items-baseline justify-between border-y-2 border-neutral-900 py-1 font-sans text-[16px] font-extrabold">
        <span>{data.refund ? 'REFUND' : 'NET AMOUNT ₹ :'}</span><span className="num">{sign}{money(t.grand)}</span>
      </div>
      {rule}
      <div className="grid grid-cols-[34px_1fr_1fr_1fr_1fr] gap-x-1 text-[10.5px]">
        <span className="font-bold">Tax %</span><span className="text-right font-bold">Taxable Val</span><span className="text-right font-bold">SGST</span><span className="text-right font-bold">CGST</span><span className="text-right font-bold">Total Amt</span>
        {t.slabs.map((s) => (
          <div key={s.rate} className="contents">
            <span>{s.rate}%</span><span className="text-right">{money(s.taxable)}</span><span className="text-right">{money(s.sgst)}</span><span className="text-right">{money(s.cgst)}</span><span className="text-right">{money(s.taxable + s.cgst + s.sgst)}</span>
          </div>
        ))}
      </div>
      {data.payments && data.payments.length > 0 && (
        <>
          {rule}
          <div className="border border-neutral-900 px-2 py-1">
            <div className="font-bold">Payment Details:</div>
            {data.payments.map((p, i) => (
              <div key={i} className="flex justify-between"><span className="uppercase">{p.mode === 'credit_note' && p.ref === 'PTS' ? 'points' : p.mode}{p.ref && p.ref !== 'PTS' ? ` (${p.ref.slice(-6)})` : ''}</span><span>{money(p.amount)}</span></div>
            ))}
          </div>
          {cash > 0 && (
            <>
              <div className="mt-1 flex justify-between"><span>Amount Received</span><span>{money(data.received ?? cash)}</span></div>
              <div className="flex justify-between"><span>Balance Amount</span><span>{money(Math.max(0, (data.received ?? cash) - cash))}</span></div>
            </>
          )}
        </>
      )}
      {data.note && <>{rule}<div className="text-center font-semibold">{data.note}</div></>}
      {rule}
      {isBill && shop?.whatsapp && <div className="text-center font-bold">For Orders: WhatsApp : {shop.whatsapp}</div>}
      {isBill && shop?.footerTamil && <div className="text-center font-sans text-[12.5px] font-semibold">{shop.footerTamil}</div>}
      <div className="text-center font-semibold">{settings.receiptFooter}</div>
      <div className="mt-2 text-neutral-900"><BarStrip value={data.number} /></div>
      <div className="text-center text-[10px] tracking-[0.2em]">{data.number}</div>
    </div>
  );
}
