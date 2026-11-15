import type { ReactNode } from 'react';
import { formatPaise, formatQty, placeText, rateText, type InvoiceData } from '@gokul/data';
import { cn } from '../cn';

const DECIMAL = ['kg', 'g', 'l', 'ml'];
const money = (p: number) => formatPaise(p);
const rt = (r: number) => (Number.isInteger(r) ? String(r) : r.toString());
const half = (r: number) => rt(r / 2);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

function Stamp({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="-rotate-[18deg] rounded border-[3px] border-red-600/70 px-3 py-1 font-sans text-2xl font-extrabold uppercase tracking-widest text-red-600/70">{text}</span>
    </div>
  );
}

/** Heads of tax a line or a total carries: CGST + SGST within the shop's state, IGST to another state, cess when charged. */
function heads(d: InvoiceData) {
  return { igst: d.inter, cess: (d.totals.cess ?? 0) !== 0 };
}

const stamp = (d: InvoiceData) => (d.cancelled ? 'CANCELLED' : d.duplicate ? 'DUPLICATE COPY' : undefined);

/**
 * A tax invoice, bill of supply or credit note drawn like the paper: a thermal roll (monospace, 80 mm) or an A4 sheet. Pure display;
 * every figure comes in already worked out (see `invoiceFromBill` in @gokul/data). Always white paper, even in the dark theme.
 */
export function TaxInvoicePreview({ data, layout, className }: { data: InvoiceData; layout: 'thermal' | 'a4'; className?: string }) {
  return layout === 'a4' ? <A4 data={data} className={className} /> : <Thermal data={data} className={className} />;
}

/* ------------------------------------------------------------------ thermal */

function Thermal({ data: d, className }: { data: InvoiceData; className?: string }) {
  const rule = <div className="my-1.5 border-t border-dashed border-neutral-400" />;
  const sign = d.kind === 'credit-note' ? '-' : '';
  const taxDoc = d.kind !== 'bill-of-supply';
  const h = heads(d);
  const t = d.totals;
  const cg = t.slabs.reduce((s, x) => s + x.cgst, 0), sg = t.slabs.reduce((s, x) => s + x.sgst, 0), ig = t.slabs.reduce((s, x) => s + x.igst, 0);
  const stampText = stamp(d);
  return (
    <div className={cn('relative mx-auto w-[302px] shrink-0 select-text overflow-hidden bg-white px-4 py-5 font-mono text-[11.5px] leading-[1.45] text-neutral-900 shadow-pop', className)}>
      {stampText && <Stamp text={stampText} />}
      <div className="text-center">
        <div className="text-[15px] font-bold uppercase tracking-wide">{d.supplier.name}</div>
        <div>{d.supplier.address}</div>
        <div className="font-semibold">GSTIN: {d.supplier.gstin}</div>
        {(d.supplier.phone || d.supplier.fssai) && <div>{[d.supplier.phone && `Mobile: ${d.supplier.phone}`, d.supplier.fssai && `FSSAI: ${d.supplier.fssai}`].filter(Boolean).join('   ')}</div>}
      </div>
      {rule}
      <div className="text-center text-[16px] font-extrabold tracking-wide">{d.title}</div>
      {rule}
      <div className="flex justify-between"><span>{d.kind === 'credit-note' ? 'Credit Note No' : 'Invoice No'} : <b>{d.number}</b></span></div>
      <div className="flex justify-between"><span>Date : {fmtDate(d.at)}</span><span>{fmtTime(d.at)}</span></div>
      {d.against && (<><div>Against Invoice No : <b>{d.against.number}</b></div><div>Invoice Date : {fmtDate(d.against.at)}</div>{d.reason && <div>Reason : {d.reason}</div>}</>)}
      {taxDoc && <div>Place of supply : {placeText(d.place)}</div>}
      <div>Reverse charge : No</div>
      {(d.recipient.name || d.recipient.gstin || d.recipient.address) && (
        <>
          {rule}
          <div className="font-bold">{d.kind === 'credit-note' ? 'Credit note issued to' : 'Bill to'}</div>
          {d.recipient.name && <div>Name: {d.recipient.name}</div>}
          {d.recipient.address && <div>Address: {d.recipient.address}</div>}
          {d.recipient.gstin && <div>GSTIN: {d.recipient.gstin}</div>}
          {d.recipient.state && <div>State: {placeText(d.recipient.state)}</div>}
        </>
      )}
      {rule}
      <div className="flex justify-between font-bold"><span>Item</span><span>Amount</span></div>
      <div className="mt-1 space-y-1.5">
        {d.lines.map((l, i) => (
          <div key={i}>
            <div className="break-words font-semibold">{l.name}</div>
            <div className="flex justify-between"><span>{l.hsn ? `HSN ${l.hsn}  ` : ''}{formatQty(l.qty, DECIMAL.includes(l.unit))} {l.unit} x {money(l.rate)}</span><span className="font-semibold">{sign}{money(l.amount)}</span></div>
            {l.discount > 0 && <div className="flex justify-between text-neutral-600"><span>  Discount</span><span>-{money(l.discount)}</span></div>}
            {taxDoc && l.tax && (
              <>
                <div className="text-neutral-700">  Taxable {money(l.tax.taxable)}</div>
                <div className="text-neutral-700">
                  {'  '}{d.inter || l.tax.igst ? `IGST ${rt(l.gstRate)}% ${money(l.tax.igst)}` : `CGST ${half(l.gstRate)}% ${money(l.tax.cgst)}  SGST ${half(l.gstRate)}% ${money(l.tax.sgst)}`}
                  {l.tax.cess ? `  Cess ${rt(l.cessRate ?? 0)}% ${money(l.tax.cess)}` : ''}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {rule}
      <div className="flex justify-between"><span>Items {t.itemCount}</span><span>Qty {formatQty(t.qtyCount, t.qtyCount % 1000 !== 0)}</span></div>
      <div className="flex justify-between"><span>Sub total</span><span>{sign}{money(t.gross)}</span></div>
      {t.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(t.discount)}</span></div>}
      {taxDoc && (
        <>
          <div className="flex justify-between"><span>Taxable value</span><span>{sign}{money(t.taxable)}</span></div>
          {h.igst ? <div className="flex justify-between"><span>IGST</span><span>{sign}{money(ig)}</span></div>
            : <><div className="flex justify-between"><span>CGST</span><span>{sign}{money(cg)}</span></div><div className="flex justify-between"><span>SGST</span><span>{sign}{money(sg)}</span></div></>}
          {h.cess && <div className="flex justify-between"><span>Cess</span><span>{sign}{money(t.cess)}</span></div>}
        </>
      )}
      {t.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span>{t.roundOff > 0 ? '+' : '-'}{money(Math.abs(t.roundOff))}</span></div>}
      <div className="mt-1 flex items-baseline justify-between border-y-2 border-neutral-900 py-1 font-sans text-[16px] font-extrabold">
        <span>{d.kind === 'credit-note' ? 'REFUND' : 'TOTAL'}</span><span className="num">Rs {sign}{money(t.grand)}</span>
      </div>
      <div className="mt-1 font-semibold">{d.words}</div>
      {taxDoc && d.hsnSummary.length > 0 && (
        <>
          {rule}
          <div className="font-bold">TAX SUMMARY (HSN / rate)</div>
          {d.hsnSummary.map((r, i) => (
            <div key={i}>
              <div className="flex justify-between"><span>HSN {r.hsn || '-'} @ {rt(r.rate)}%</span><span>Taxable {money(r.taxable)}</span></div>
              <div className="text-neutral-700">{'  '}{d.inter || r.igst ? `IGST ${money(r.igst)}` : `CGST ${money(r.cgst)}  SGST ${money(r.sgst)}`}{r.cess ? `  Cess ${money(r.cess)}` : ''}</div>
            </div>
          ))}
        </>
      )}
      {d.payments.some((p) => p.amount > 0) && (<>{rule}{d.payments.filter((p) => p.amount > 0).map((p, i) => <div key={i} className="flex justify-between"><span className="uppercase">{p.mode === 'credit_note' ? 'credit note' : p.mode}</span><span>{money(p.amount)}</span></div>)}</>)}
      {d.kind === 'credit-note' && d.refundBy && <><div className="my-1.5 border-t border-dashed border-neutral-400" /><div className="flex justify-between"><span>Refund by</span><span>{d.refundBy}</span></div></>}
      <div className="mt-6 text-right font-bold">For {d.supplier.name.toUpperCase()}</div>
      <div className="mt-5 text-right">Authorised signatory</div>
    </div>
  );
}

/* ------------------------------------------------------------------ A4 */

function Cell({ children, right, bold, className }: { children?: ReactNode; right?: boolean; bold?: boolean; className?: string }) {
  return <td className={cn('border border-neutral-400 px-1.5 py-1 align-top', right && 'text-right num', bold && 'font-semibold', className)}>{children}</td>;
}
function Head({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cn('border border-neutral-500 bg-neutral-100 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide', right ? 'text-right' : 'text-left', className)}>{children}</th>;
}

function A4({ data: d, className }: { data: InvoiceData; className?: string }) {
  const taxDoc = d.kind !== 'bill-of-supply';
  const sign = d.kind === 'credit-note' ? '-' : '';
  const t = d.totals;
  const h = heads(d);
  const cg = t.slabs.reduce((s, x) => s + x.cgst, 0), sg = t.slabs.reduce((s, x) => s + x.sgst, 0), ig = t.slabs.reduce((s, x) => s + x.igst, 0);
  const stampText = stamp(d);
  const sum = d.hsnSummary.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst, cess: a.cess + r.cess }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });
  return (
    <div className={cn('relative mx-auto flex min-h-[1123px] w-[794px] shrink-0 select-text flex-col overflow-hidden bg-white px-10 py-9 font-sans text-[11.5px] leading-snug text-neutral-900 shadow-pop', className)}>
      {stampText && <Stamp text={stampText} />}
      <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
        <div className="min-w-0">
          <div className="text-[22px] font-extrabold uppercase leading-tight tracking-wide">{d.supplier.name}</div>
          <div className="mt-0.5 text-neutral-700">{d.supplier.address}</div>
          <div className="mt-0.5"><b>GSTIN: {d.supplier.gstin}</b>{d.supplier.phone && <span className="ml-4">Mobile: {d.supplier.phone}</span>}{d.supplier.fssai && <span className="ml-4">FSSAI: {d.supplier.fssai}</span>}</div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-extrabold tracking-wide">{d.title}</div>
          <div className="text-[10.5px] text-neutral-600">{d.duplicate ? '(Duplicate copy)' : '(Original for recipient)'}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 border-b border-neutral-300 pb-3">
        <div><span className="text-neutral-600">{d.kind === 'credit-note' ? 'Credit note no.' : 'Invoice no.'}</span> <b className="num">{d.number}</b></div>
        <div><span className="text-neutral-600">Date</span> <b className="num">{fmtDate(d.at)} {fmtTime(d.at)}</b></div>
        {d.against && <div><span className="text-neutral-600">Against invoice no.</span> <b className="num">{d.against.number}</b></div>}
        {d.against && <div><span className="text-neutral-600">Invoice date</span> <b className="num">{fmtDate(d.against.at)}</b></div>}
        {d.reason && <div className="col-span-2"><span className="text-neutral-600">Reason for credit note</span> <b>{d.reason}</b></div>}
        {taxDoc && <div><span className="text-neutral-600">Place of supply</span> <b>{placeText(d.place)}</b></div>}
        <div><span className="text-neutral-600">Reverse charge</span> <b>No</b></div>
      </div>

      {(d.recipient.name || d.recipient.gstin || d.recipient.address) && (
        <div className="mt-3 rounded border border-neutral-300 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{d.kind === 'credit-note' ? 'Credit note issued to (recipient)' : 'Bill to (recipient)'}</div>
          {d.recipient.name && <div className="text-[13px] font-bold">{d.recipient.name}</div>}
          {d.recipient.address && <div>{d.recipient.address}</div>}
          <div className="mt-0.5 flex gap-6">
            {d.recipient.gstin && <span><span className="text-neutral-600">GSTIN</span> <b className="num">{d.recipient.gstin}</b></span>}
            {d.recipient.state && <span><span className="text-neutral-600">State</span> <b>{placeText(d.recipient.state)}</b></span>}
            {d.recipient.phone && <span><span className="text-neutral-600">Phone</span> <b className="num">{d.recipient.phone}</b></span>}
          </div>
        </div>
      )}

      <table className="mt-3 w-full border-collapse text-[10.5px]">
        <thead>
          <tr>
            <Head className="w-6">Sl</Head><Head>Description</Head><Head>HSN</Head><Head right>Qty</Head><Head>Unit</Head><Head right>Rate</Head><Head right>Disc</Head><Head right>Taxable</Head>
            {taxDoc && (h.igst ? <><Head right>IGST %</Head><Head right>IGST</Head></> : <><Head right>CGST %</Head><Head right>CGST</Head><Head right>SGST %</Head><Head right>SGST</Head></>)}
            {taxDoc && h.cess && <Head right>Cess</Head>}
            <Head right>Total</Head>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <Cell>{i + 1}</Cell><Cell className="font-medium">{l.name}</Cell><Cell className="num">{l.hsn || '-'}</Cell>
              <Cell right>{formatQty(l.qty, DECIMAL.includes(l.unit))}</Cell><Cell>{l.unit}</Cell><Cell right>{money(l.rate)}</Cell><Cell right>{l.discount > 0 ? money(l.discount) : '-'}</Cell>
              <Cell right>{money(taxDoc ? l.tax?.taxable ?? 0 : l.amount)}</Cell>
              {taxDoc && (h.igst
                ? <><Cell right>{rt(l.gstRate)}</Cell><Cell right>{money(l.tax?.igst ?? 0)}</Cell></>
                : <><Cell right>{half(l.gstRate)}</Cell><Cell right>{money(l.tax?.cgst ?? 0)}</Cell><Cell right>{half(l.gstRate)}</Cell><Cell right>{money(l.tax?.sgst ?? 0)}</Cell></>)}
              {taxDoc && h.cess && <Cell right>{money(l.tax?.cess ?? 0)}</Cell>}
              <Cell right bold>{sign}{money(l.amount)}</Cell>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-neutral-600">Amount in words</div>
          <div className="font-semibold">{d.words}</div>
          {d.payments.some((p) => p.amount > 0) && <div className="mt-2 text-neutral-700">Payment: {d.payments.filter((p) => p.amount > 0).map((p) => `${p.mode === 'credit_note' ? 'CREDIT NOTE' : p.mode.toUpperCase()} ${money(p.amount)}`).join('   ')}</div>}
          {d.kind === 'credit-note' && d.refundBy && <div className="mt-2 text-neutral-700">Refund by: <b>{d.refundBy}</b></div>}
        </div>
        <table className="w-[260px] shrink-0 text-[11.5px]">
          <tbody>
            <tr><td className="py-0.5 text-neutral-600">Sub total</td><td className="num py-0.5 text-right">{sign}{money(t.gross)}</td></tr>
            {t.discount > 0 && <tr><td className="py-0.5 text-neutral-600">Discount</td><td className="num py-0.5 text-right">-{money(t.discount)}</td></tr>}
            {taxDoc && <tr><td className="py-0.5 text-neutral-600">Taxable value</td><td className="num py-0.5 text-right">{sign}{money(t.taxable)}</td></tr>}
            {taxDoc && (h.igst
              ? <tr><td className="py-0.5 text-neutral-600">IGST</td><td className="num py-0.5 text-right">{sign}{money(ig)}</td></tr>
              : <><tr><td className="py-0.5 text-neutral-600">CGST</td><td className="num py-0.5 text-right">{sign}{money(cg)}</td></tr><tr><td className="py-0.5 text-neutral-600">SGST</td><td className="num py-0.5 text-right">{sign}{money(sg)}</td></tr></>)}
            {taxDoc && h.cess && <tr><td className="py-0.5 text-neutral-600">Cess</td><td className="num py-0.5 text-right">{sign}{money(t.cess)}</td></tr>}
            {t.roundOff !== 0 && <tr><td className="py-0.5 text-neutral-600">Round off</td><td className="num py-0.5 text-right">{t.roundOff > 0 ? '+' : '-'}{money(Math.abs(t.roundOff))}</td></tr>}
            <tr className="border-t-2 border-neutral-900 text-[14px] font-extrabold"><td className="pt-1">{d.kind === 'credit-note' ? 'Total refund' : 'Invoice total'}</td><td className="num pt-1 text-right">₹ {sign}{money(t.grand)}</td></tr>
          </tbody>
        </table>
      </div>

      {taxDoc && d.hsnSummary.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Tax summary (HSN and rate wise)</div>
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr><Head>HSN</Head><Head right>Rate</Head><Head right>Taxable value</Head>{h.igst ? <Head right>IGST</Head> : <><Head right>CGST</Head><Head right>SGST</Head></>}{h.cess && <Head right>Cess</Head>}<Head right>Total tax</Head></tr>
            </thead>
            <tbody>
              {d.hsnSummary.map((r, i) => (
                <tr key={i}><Cell className="num">{r.hsn || '-'}</Cell><Cell right>{rateText(r.rate)}</Cell><Cell right>{money(r.taxable)}</Cell>
                  {h.igst ? <Cell right>{money(r.igst)}</Cell> : <><Cell right>{money(r.cgst)}</Cell><Cell right>{money(r.sgst)}</Cell></>}
                  {h.cess && <Cell right>{money(r.cess)}</Cell>}<Cell right>{money(r.cgst + r.sgst + r.igst)}</Cell></tr>
              ))}
              <tr className="font-bold"><Cell>Total</Cell><Cell /><Cell right>{money(sum.taxable)}</Cell>{h.igst ? <Cell right>{money(sum.igst)}</Cell> : <><Cell right>{money(sum.cgst)}</Cell><Cell right>{money(sum.sgst)}</Cell></>}{h.cess && <Cell right>{money(sum.cess)}</Cell>}<Cell right>{money(sum.cgst + sum.sgst + sum.igst)}</Cell></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-auto pt-6">
        <div className="text-[10.5px] text-neutral-600">
          Reverse charge: No. We declare that this document shows the actual price of the goods described and that all particulars are true and correct. (wording: confirm with CA)
        </div>
        <div className="mt-8 flex items-end justify-between">
          <div className="w-52 border-t border-neutral-500 pt-1 text-center text-[10.5px] text-neutral-600">Recipient&apos;s signature</div>
          <div className="text-center">
            <div className="text-[11px] font-bold">For {d.supplier.name.toUpperCase()}</div>
            <div className="mt-8 w-52 border-t border-neutral-500 pt-1 text-[10.5px] text-neutral-600">Authorised signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
