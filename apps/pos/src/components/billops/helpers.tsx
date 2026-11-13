import { Ban, CheckCircle2, CornerUpLeft, IndianRupee } from 'lucide-react';
import { billTitleFor, printNumber, type Bill, type BillDetail, type CreditNote, type PayMode, type ReceiptConfig, type RefundMode } from '@gokul/data';
import { Badge } from '@gokul/ui';
import type { ReceiptData } from '@gokul/ui';

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftDay = (key: string, by: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + by));
};
export const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const txt = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const today = dayKey(new Date());
  if (key === today) return `Today, ${txt}`;
  if (key === shiftDay(today, -1)) return `Yesterday, ${txt}`;
  return txt;
};
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
export const dateTimeOf = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

export const modeLabel: Record<PayMode, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit', credit_note: 'Credit note', points: 'Points', sodexo: 'Sodexo' };
export const payLabel = (b: Bill) => {
  const modes = [...new Set(b.payments.map((p) => p.mode))];
  return modes.length > 1 ? 'Split' : modeLabel[modes[0]] ?? '';
};
export const refundLabel: Record<RefundMode, string> = {
  cash: 'Cash refund', upi: 'UPI refund', credit_note: 'Credit note', exchange: 'Exchange credit',
};

export function StatusBadge({ bill, detail }: { bill: Bill; detail?: BillDetail | null }) {
  if (bill.status === 'cancelled') return <Badge tone="danger"><Ban size={11} /> Cancelled</Badge>;
  if (bill.status === 'returned') return <Badge tone="warning"><CornerUpLeft size={11} /> Returned</Badge>;
  if (detail && detail.returned.some((q) => q > 0)) return <Badge tone="warning"><CornerUpLeft size={11} /> Part returned</Badge>;
  if (bill.status === 'credit') return <Badge tone="info"><IndianRupee size={11} /> On credit</Badge>;
  return <Badge tone="success"><CheckCircle2 size={11} /> Paid</Badge>;
}

export function billReceipt(d: BillDetail, cfg?: ReceiptConfig): ReceiptData {
  const { bill } = d;
  const f = cfg?.billFormat;
  const cash = bill.payments.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
  // Store credit is the Wallet (F5) part of the credit-note payments. Points and Sodexo are stored under that mode too, and
  // exchange credit (a returned bill's credit note) is one as well: the server reports that part as extras.exchangeCredit.
  // Same split as the printed bill (loyalty::split_credit_payments).
  const creditPaid = bill.payments
    .filter((p) => p.mode === 'credit_note' && p.ref && p.ref !== 'PTS' && p.ref !== 'SODEXO')
    .reduce((s, p) => s + p.amount, 0);
  const storeCreditUsed = Math.max(0, creditPaid - (bill.exchangeCredit ?? 0));
  return {
    title: f ? billTitleFor(bill.payments, f) : 'TAX INVOICE', subtitle: f ? 'TAX INVOICE' : undefined,
    number: f ? printNumber(bill.number, f.numberFormat) : bill.number, at: bill.at, cashier: bill.cashier, counter: bill.counter,
    customerName: bill.customerName, customerId: bill.customerId,
    lines: bill.lines, totals: bill.totals, payments: bill.payments, received: cash || undefined,
    storeCreditUsed: storeCreditUsed || undefined,
    stamp: bill.status === 'cancelled' ? 'Cancelled' : undefined,
    note: d.reprints > 0 ? `DUPLICATE COPY - reprint ${d.reprints}` : undefined,
  };
}

export function noteReceipt(n: CreditNote): ReceiptData {
  return {
    title: 'CREDIT NOTE', number: n.number, at: n.at, cashier: n.by, customerName: n.customerName,
    reference: `Against bill ${n.billNumber}`, lines: n.lines, totals: n.totals, refund: true,
    note: <>{refundLabel[n.refundMode]}{n.refundMode === 'credit_note' || n.refundMode === 'exchange' ? ' - adjust on a future bill' : ' - paid to customer'}</>,
  };
}

