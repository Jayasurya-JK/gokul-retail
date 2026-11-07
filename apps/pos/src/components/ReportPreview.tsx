import { formatPaise, type Settings, type ShiftSummary, type Paise } from '@gokul/data';

export interface ReportData {
  kind: 'X' | 'Z';
  number?: string;
  summary: ShiftSummary;
  counted?: Paise;
  difference?: Paise;
  cashier: string;
  approvedBy?: string;
}

const rs = (p: Paise) => `${p < 0 ? '-' : ''}${formatPaise(Math.abs(p))}`;

function Rule({ dashed = true }: { dashed?: boolean }) {
  return <div className={`my-2 border-t ${dashed ? 'border-dashed' : ''} border-black/40`} />;
}
function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'font-bold' : ''}`}>
      <span>{k}</span><span className="num whitespace-pre">{v}</span>
    </div>
  );
}
function Head({ children }: { children: string }) {
  return <div className="mb-1 mt-3 text-center font-bold tracking-widest">{children}</div>;
}

/** A 80mm thermal-paper style preview of the X (interim) or Z (day close) report. */
export function ReportPreview({ data, settings }: { data: ReportData; settings: Settings | null }) {
  const { summary: s } = data;
  const at = new Date(s.at);
  const d = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <div className="mx-auto w-[330px] rounded-sm bg-white px-4 py-5 font-mono text-[12.5px] leading-[1.5] text-black shadow-pop ring-1 ring-line">
      <div className="text-center">
        <div className="text-[15px] font-bold uppercase tracking-wide">{settings?.shopName ?? 'Gokul Oils'}</div>
        <div>{settings?.address}</div>
        <div>GSTIN {settings?.gstin}</div>
        <div>Ph {settings?.phone}</div>
      </div>
      <Rule />
      <div className="text-center text-[14px] font-bold">{data.kind === 'Z' ? 'Z REPORT - DAY CLOSE' : 'X REPORT - INTERIM'}</div>
      {data.number && <div className="text-center">No. {data.number}</div>}
      <Rule />
      <Line k="Printed" v={d(at.toISOString())} />
      <Line k="Counter" v={s.counter} />
      <Line k="Cashier" v={data.cashier} />
      <Line k="Day opened" v={d(s.openedAt)} />

      <Head>SALES</Head>
      <Line k="Bills" v={String(s.billCount)} />
      <Line k="Items sold" v={String(s.itemCount)} />
      <Line k="Discounts given" v={rs(s.discounts)} />
      <Line k="Total sales" v={rs(s.sales)} bold />

      <Head>BY PAYMENT MODE</Head>
      <Line k="Cash" v={rs(s.byMode.cash)} />
      <Line k="UPI" v={rs(s.byMode.upi)} />
      <Line k="Card" v={rs(s.byMode.card)} />
      <Line k="Credit (unpaid)" v={rs(s.byMode.credit)} />

      <Head>RETURNS AND CANCELS</Head>
      <Line k={`Returns (${s.returnsCount})`} v={rs(s.returnsAmount)} />
      <Line k={`Cancelled (${s.cancelCount})`} v={rs(s.cancelAmount)} />

      <Head>GST COLLECTED</Head>
      {s.slabs.map((x) => (
        <div key={x.rate} className="mb-0.5">
          <Line k={`${x.rate}% taxable`} v={rs(x.taxable)} />
          <Line k="  CGST" v={rs(x.cgst)} />
          <Line k="  SGST" v={rs(x.sgst)} />
        </div>
      ))}
      <Line k="Total GST" v={rs(s.cgst + s.sgst)} bold />

      <Head>EXPENSES</Head>
      {(s.expenseLines ?? []).length === 0 && <Line k="None" v={rs(0)} />}
      {(s.expenseLines ?? []).map((e) => <Line key={e.category} k={`${e.category} x${e.count}`} v={rs(e.cash)} />)}
      <Line k={`Paid from drawer (${s.expensesCount})`} v={rs(s.expensesCash)} />
      <Line k={`Paid by UPI/bank (${s.expensesOtherCount ?? 0}), not in drawer`} v={rs(s.expensesOther ?? 0)} />

      <Head>CASH DRAWER</Head>
      <Line k="Opening cash" v={rs(s.openingCash)} />
      <Line k="+ Cash sales" v={rs(s.byMode.cash)} />
      <Line k="+ Cash added" v={rs(s.cashIn - (s.collectionsCash ?? 0))} />
      <Line k="+ Customer collections" v={rs(s.collectionsCash ?? 0)} />
      <Line k="- Cash taken out" v={rs(s.cashOut - (s.supplierCash ?? 0))} />
      <Line k="- Supplier payments" v={rs(s.supplierCash ?? 0)} />
      <Line k="- Cash refunds" v={rs(s.cashRefunds ?? 0)} />
      <Line k={`- Expenses (cash) (${s.expensesCount})`} v={rs(s.expensesCash)} />
      <Rule dashed={false} />
      <Line k="Expected cash" v={rs(s.expectedCash)} bold />
      {data.counted !== undefined && <Line k="Counted cash" v={rs(data.counted)} bold />}
      {data.difference !== undefined && (
        <Line k={data.difference === 0 ? 'Difference (tally)' : data.difference < 0 ? 'SHORT by' : 'EXCESS by'} v={rs(Math.abs(data.difference))} bold />
      )}
      {data.approvedBy && (
        <>
          <Rule />
          <Line k="Approved by" v={data.approvedBy} />
        </>
      )}
      <Rule />
      <div className="text-center text-[11px] text-neutral-500">{data.kind === 'X' ? 'Interim report. The day is still open.' : 'Day closed. Keep this slip with the cash.'}</div>
    </div>
  );
}
