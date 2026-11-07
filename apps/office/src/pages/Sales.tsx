import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer, Receipt, Search } from 'lucide-react';
import { billTitleFor, formatQty, formatRupees, printNumber, type PayMode, type SalesBill, type SalesFilterOptions, type SalesStatus, type Settings } from '@gokul/data';
import {
  Badge, Button, DataTable, DateRangePicker, EmptyState, FilterBar, Kbd, Money, PageHeader, ReceiptPreview, SearchInput, Select, Tabs, TabPanel,
  dateRangePresets, useToast, type ColumnDef, type DateRange, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { useReceiptConfig } from '../receiptConfig';
import { billMode, csvCell, DetailPane, downloadText, fmtDate, fmtDateTime, fmtShort, fmtTime, modeLabel, PropRow, SectionLabel, SplitBar, StatusBadge } from '../components/crm/common';

const DECIMAL = ['kg', 'g', 'l', 'ml'];

const columns: ColumnDef<SalesBill>[] = [
  { accessorKey: 'number', header: 'Bill no', meta: { w: '132px', num: true }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
  {
    id: 'when', header: 'Date', meta: { w: '140px' }, accessorFn: (r) => r.at,
    cell: (c) => <span className="text-muted">{fmtShort(c.getValue<string>())}, {fmtTime(c.getValue<string>())}</span>,
  },
  { accessorKey: 'customerName', header: 'Customer', meta: { w: 'minmax(96px,1fr)' }, cell: (c) => <span className={c.getValue<string>() === 'Walk-in' ? 'text-subtle' : ''}>{c.getValue<string>()}</span> },
  {
    id: 'cashier', header: 'Cashier', meta: { w: '100px' }, accessorFn: (r) => r.cashier,
    cell: (c) => <span>{c.row.original.cashier.split(' ')[0]} <span className="text-subtle">C{c.row.original.counter.slice(-1)}</span></span>,
  },
  { id: 'mode', header: 'Mode', meta: { w: '60px' }, accessorFn: (r) => billMode(r) },
  { id: 'amount', header: 'Amount', meta: { w: '98px', align: 'right', num: true }, accessorFn: (r) => r.totals.grand, cell: (c) => <Money paise={c.getValue<number>()} /> },
  { id: 'status', header: 'Status', meta: { w: '96px' }, accessorFn: (r) => r.status, cell: (c) => <StatusBadge status={c.row.original.status} /> },
];

function BillDetail({ bill, settings }: { bill: SalesBill; settings: Settings | null }) {
  const cfg = useReceiptConfig();
  const toast = useToast();
  const [tab, setTab] = useState('details');
  const t = bill.totals;
  return (
    <DetailPane width={390}>
      <div className="border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-md font-semibold leading-tight text-ink">{bill.number}</div>
            <div className="mt-0.5 text-xs text-muted">{fmtDateTime(bill.at)}</div>
          </div>
          <StatusBadge status={bill.status} />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-muted">Bill total</div>
            <div className="text-2xl font-semibold num"><Money paise={t.grand} /></div>
          </div>
          <Button size="sm" icon={<Printer size={14} />} onClick={() => void api.printDocument('bill', bill.id, { duplicate: true }).then((r) => toast.show(r.ok ? { tone: 'success', title: 'Reprint sent', detail: `${bill.number} printed as DUPLICATE COPY.` } : { tone: 'error', title: `Printing failed: ${r.message}` }))}>Reprint</Button>
        </div>
        {bill.reason && (
          <div className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium text-ink">{bill.status === 'cancelled' ? 'Cancelled' : 'Returned'}:</span>{' '}
            <span className="text-muted">{bill.reason}. Approved by {bill.approvedBy}.</span>
          </div>
        )}
      </div>
      <Tabs
        value={tab} onValueChange={setTab} className="min-h-0 flex-1"
        tabs={[{ value: 'details', label: 'Details' }, { value: 'receipt', label: 'Bill preview' }]}
      >
        <TabPanel value="details" className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-3 outline-none">
          <dl className="mb-4">
            <PropRow k="Customer">{bill.customerName}</PropRow>
            <PropRow k="Cashier">{bill.cashier}</PropRow>
            <PropRow k="Counter">{bill.counter}</PropRow>
          </dl>
          <SectionLabel right={<span className="text-xs text-subtle">{t.itemCount} items</span>}>Items</SectionLabel>
          <div className="mb-4 overflow-hidden rounded-control border border-line">
            {bill.lines.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-line/70 px-3 py-2 text-sm last:border-b-0">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{l.name}</div>
                  <div className="text-xs text-muted num">{formatQty(l.qty, DECIMAL.includes(l.unit))} {l.unit} x {formatRupees(l.rate)} · GST {l.gstRate}%</div>
                </div>
                <Money paise={l.amount} className="shrink-0 font-medium" />
              </div>
            ))}
          </div>
          <SectionLabel>GST summary</SectionLabel>
          <div className="mb-4 overflow-hidden rounded-control border border-line text-xs">
            <div className="grid grid-cols-4 bg-surface-2 px-3 py-1.5 font-semibold text-muted"><span>Slab</span><span className="text-right">Taxable</span><span className="text-right">CGST</span><span className="text-right">SGST</span></div>
            {t.slabs.map((s) => (
              <div key={s.rate} className="grid grid-cols-4 border-t border-line/70 px-3 py-1.5 num">
                <span>{s.rate}%</span><span className="text-right">{formatRupees(s.taxable)}</span><span className="text-right">{formatRupees(s.cgst)}</span><span className="text-right">{formatRupees(s.sgst)}</span>
              </div>
            ))}
          </div>
          <div className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between text-muted"><span>Sub total</span><Money paise={t.gross} /></div>
            {t.discount > 0 && <div className="flex justify-between text-muted"><span>Discount</span><Money paise={-t.discount} /></div>}
            <div className="flex justify-between text-muted"><span>GST included</span><Money paise={t.gst} /></div>
            {t.roundOff !== 0 && <div className="flex justify-between text-muted"><span>Round off</span><Money paise={t.roundOff} sign /></div>}
            <div className="flex justify-between border-t border-line pt-1.5 text-md font-semibold text-ink"><span>Total</span><Money paise={t.grand} /></div>
          </div>
          <SectionLabel>Payments</SectionLabel>
          <div className="overflow-hidden rounded-control border border-line">
            {bill.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between border-b border-line/70 px-3 py-2 text-sm last:border-b-0">
                <span className="flex items-center gap-2">
                  <Badge tone={p.mode === 'credit' ? 'warning' : p.mode === 'upi' ? 'info' : p.mode === 'cash' ? 'success' : 'neutral'}>{modeLabel[p.mode]}</Badge>
                  {p.ref && <span className="text-xs text-subtle num">{p.ref}</span>}
                </span>
                <Money paise={p.amount} className="font-medium" />
              </div>
            ))}
          </div>
        </TabPanel>
        <TabPanel value="receipt" className="min-h-0 flex-1 overflow-auto bg-surface-3 px-4 py-5 outline-none">
          {settings && (
            <ReceiptPreview
              settings={settings} shop={cfg}
              data={{
                title: cfg ? billTitleFor(bill.payments, cfg.billFormat) : 'TAX INVOICE', subtitle: cfg ? 'TAX INVOICE' : undefined,
                number: cfg ? printNumber(bill.number, cfg.billFormat.numberFormat) : bill.number, at: bill.at, cashier: bill.cashier, customerName: bill.customerName,
                lines: bill.lines, totals: bill.totals, payments: bill.payments,
                stamp: bill.status === 'cancelled' ? 'CANCELLED' : bill.status === 'returned' ? 'RETURNED' : undefined,
              }}
            />
          )}
        </TabPanel>
      </Tabs>
    </DetailPane>
  );
}

const statusOptions: { value: SalesStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' }, { value: 'paid', label: 'Paid' }, { value: 'credit', label: 'On credit' },
  { value: 'cancelled', label: 'Cancelled' }, { value: 'returned', label: 'Returned' },
];

export function Sales() {
  const toast = useToast();
  const searchRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<DateRange>(dateRangePresets[2].get());
  const [q, setQ] = useState('');
  const [counter, setCounter] = useState('all');
  const [cashier, setCashier] = useState('all');
  const [mode, setMode] = useState<PayMode | 'all'>('all');
  const [status, setStatus] = useState<SalesStatus>('all');
  const [opts, setOpts] = useState<SalesFilterOptions>({ counters: [], cashiers: [] });
  const [rows, setRows] = useState<SalesBill[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useRefreshOnFocus(() => setTick((t) => t + 1));
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => { api.salesFilterOptions().then(setOpts); api.getSettings().then(setSettings); }, []);
  useEffect(() => {
    let live = true;
    api.listSalesBills({ from: range.from, to: range.to, query: q, counter, cashier, mode, status }).then((r) => {
      if (!live) return;
      setRows(r);
      setSelId((cur) => (cur && r.some((b) => b.id === cur) ? cur : r[0]?.id ?? null));
    });
    return () => { live = false; };
  }, [range, q, counter, cashier, mode, status, tick]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.querySelector("input")?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const sel = rows.find((b) => b.id === selId) ?? null;
  const sums = useMemo(() => {
    const live = rows.filter((b) => b.status !== 'cancelled' && b.status !== 'returned');
    const by = (m: PayMode) => live.flatMap((b) => b.payments).filter((p) => p.mode === m).reduce((a, p) => a + p.amount, 0);
    return {
      net: live.reduce((a, b) => a + b.totals.grand, 0), count: live.length,
      cash: by('cash'), upi: by('upi'), card: by('card'), credit: by('credit'),
      cancelled: rows.filter((b) => b.status === 'cancelled').length, returned: rows.filter((b) => b.status === 'returned').length,
    };
  }, [rows]);

  const exportCsv = useCallback(() => {
    const head = ['Bill no', 'Date', 'Time', 'Counter', 'Cashier', 'Customer', 'Mode', 'Taxable', 'GST', 'Total', 'Status'];
    const lines = rows.map((b) => [
      b.number, fmtDate(b.at), fmtTime(b.at), b.counter, b.cashier, b.customerName, billMode(b),
      (b.totals.taxable / 100).toFixed(2), (b.totals.gst / 100).toFixed(2), (b.totals.grand / 100).toFixed(2), b.status,
    ].map(csvCell).join(','));
    downloadText(`gokul-bills-${range.from}-to-${range.to}.csv`, [head.join(','), ...lines].join('\n'));
    toast.show({ tone: 'success', title: 'Bills exported', detail: `${rows.length} bills saved as CSV.` });
  }, [rows, range, toast]);

  return (
    <>
      <PageHeader
        title="Bills" subtitle={`All counters · ${rows.length} bills in range`} icon={<Receipt size={17} />}
        actions={<Button icon={<Download size={15} />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>}
      />
      <FilterBar trailing={<span className="flex items-center gap-1.5">Press <Kbd>/</Kbd> to search</span>}>
        <DateRangePicker value={range} onChange={setRange} />
        <div ref={searchRef} className="w-60"><SearchInput placeholder="Bill no, customer or UPI ref" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={counter} onChange={(e) => setCounter(e.target.value)} options={[{ value: 'all', label: 'All counters' }, ...opts.counters.map((c) => ({ value: c, label: c }))]} />
        <Select value={cashier} onChange={(e) => setCashier(e.target.value)} options={[{ value: 'all', label: 'All cashiers' }, ...opts.cashiers.map((c) => ({ value: c, label: c }))]} />
        <Select value={mode} onChange={(e) => setMode(e.target.value as PayMode | 'all')} options={[{ value: 'all', label: 'All payment modes' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'credit', label: 'Credit' }]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value as SalesStatus)} options={statusOptions} />
      </FilterBar>
      <div className="flex shrink-0 items-center gap-5 border-b border-line bg-surface-2 px-5 py-2 text-sm">
        <div><span className="text-xs text-muted">Net sales</span> <span className="ml-1.5 font-semibold text-ink"><Money paise={sums.net} /></span> <span className="text-xs text-subtle">({sums.count} bills)</span></div>
        <div className="h-4 w-px bg-line" />
        <div className="flex items-center gap-4 text-muted">
          <span>Cash <b className="font-semibold text-ink"><Money paise={sums.cash} decimals={false} /></b></span>
          <span>UPI <b className="font-semibold text-ink"><Money paise={sums.upi} decimals={false} /></b></span>
          <span>Card <b className="font-semibold text-ink"><Money paise={sums.card} decimals={false} /></b></span>
          <span>Credit <b className="font-semibold text-ink"><Money paise={sums.credit} decimals={false} /></b></span>
        </div>
        <div className="w-40">
          <SplitBar height={6} parts={[{ value: sums.cash, className: 'bg-success', label: 'Cash' }, { value: sums.upi, className: 'bg-info', label: 'UPI' }, { value: sums.card, className: 'bg-subtle', label: 'Card' }, { value: sums.credit, className: 'bg-warning', label: 'Credit' }]} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sums.cancelled > 0 && <Badge tone="danger">{sums.cancelled} cancelled</Badge>}
          {sums.returned > 0 && <Badge tone="info">{sums.returned} returned</Badge>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)}
          empty={<EmptyState icon={<Search size={20} />} title="No bills match" hint="Widen the date range or clear a filter. Cancelled and returned bills are listed under Status." />}
          footer={<><span>{rows.length} bills</span><span>Up and down arrows move through bills</span></>}
        />
        {sel && <BillDetail key={sel.id} bill={sel} settings={settings} />}
      </div>
    </>
  );
}
