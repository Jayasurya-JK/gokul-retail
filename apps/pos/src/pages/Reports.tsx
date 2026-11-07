import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, ChevronRight, CreditCard, Download, Package, RefreshCw, Search, Users } from 'lucide-react';
import {
  formatQty, formatRupees, type PaymodeReport, type SalesReport, type SalesReportRow, type Staff, type StaffReportRow, type StockReport, type StockRow,
} from '@gokul/data';
import { Badge, Button, DateRangePicker, EmptyState, Money, PosLayout, cn, dateRangePresets, useToast, type DateRange, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { dateTimeOf, timeOf } from '../components/billops/helpers';
import { downloadCsv, rupeesCell } from '../csv';

/** A screen can draw this many rows at once; the Excel export always holds every row. */
const ROW_CAP = 1000;

const REPORT_KEYS: KeyRows = [
  ['Move between rows', ['Up', 'Down']],
  ['Open or close the bill lines', ['Enter']],
  ['Fetch again', ['F5']],
  ['Save as Excel (CSV)', ['Ctrl+S']],
  ['Back to billing', ['Esc']],
];

/** Owner and managers see cost and profit; a cashier never gets those numbers from the backend. */
function useCanSeeCost() {
  const role = useSession((s) => s.user?.role);
  return role === 'owner' || role === 'manager';
}

function useStaffList() {
  const [staff, setStaff] = useState<Staff[]>([]);
  useEffect(() => { void api.listStaff().then(setStaff).catch(() => undefined); }, []);
  return staff;
}

/** Screen frame: toolbar on top, a table that scrolls both ways, totals pinned at the bottom. */
function Frame({ icon, title, subtitle, controls, actions, footer, children }: {
  icon: ReactNode; title: string; subtitle?: ReactNode; controls: ReactNode; actions: ReactNode; footer: ReactNode; children: ReactNode;
}) {
  const keys: FKey[] = [];
  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
        <div className="mr-3 leading-tight">
          <h1 className="text-md font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">{controls}</div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col bg-surface">{children}</div>
      <div className="flex h-12 shrink-0 items-center gap-6 overflow-x-auto border-t border-line-strong bg-surface-2 px-4 text-sm">{footer}</div>
    </PosLayout>
  );
}

function Total({ label, children, tone }: { label: string; children: ReactNode; tone?: 'primary' | 'success' }) {
  return (
    <span className="flex shrink-0 items-baseline gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</span>
      <span className={cn('num text-md font-semibold', tone === 'primary' ? 'text-primary' : tone === 'success' ? 'text-success' : 'text-ink')}>{children}</span>
    </span>
  );
}

const selectCls = 'h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink hover:border-subtle focus:border-primary focus:ring-2 focus:ring-primary/25';

function RangeControls({ range, setRange, canPick }: { range: DateRange; setRange: (r: DateRange) => void; canPick: boolean }) {
  if (!canPick) return <Badge tone="neutral">Today</Badge>;
  return <DateRangePicker value={range} onChange={setRange} />;
}

function StaffSelect({ staff, value, onChange }: { staff: Staff[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} aria-label="Staff">
      <option value="">All staff</option>
      {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
    </select>
  );
}

function SearchBox({ value, onChange, placeholder, inputRef }: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.RefObject<HTMLInputElement> }) {
  return (
    <div className="relative w-[clamp(180px,22vw,300px)]">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Search" autoComplete="off" spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        className="h-8 w-full rounded-control border border-line-strong bg-surface pl-8 pr-2.5 text-sm text-ink placeholder:text-subtle hover:border-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
    </div>
  );
}

/** Up / Down / Enter / F5 / Ctrl+S for a report screen (latest closure through a ref). */
function useReportKeys(h: { move: (by: number) => void; enter: () => void; fetch: () => void; save: () => void }) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const inField = (e.target as HTMLElement)?.closest('input,select,textarea');
      if (e.key === 'F5') { e.preventDefault(); ref.current.fetch(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); ref.current.save(); }
      else if (e.key === 'ArrowDown') { if (inField && (e.target as HTMLElement).tagName !== 'INPUT') return; e.preventDefault(); ref.current.move(1); }
      else if (e.key === 'ArrowUp') { if (inField && (e.target as HTMLElement).tagName !== 'INPUT') return; e.preventDefault(); ref.current.move(-1); }
      else if (e.key === 'Enter' && !(inField && (e.target as HTMLElement).tagName !== 'INPUT')) { e.preventDefault(); ref.current.enter(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}

const today = () => dateRangePresets[0].get();

/* ================================================================== */
/* Sales Report                                                        */
/* ================================================================== */
export function SalesReportPage() {
  useScreenKeys('Sales Report', REPORT_KEYS);
  const toast = useToast();
  const canCost = useCanSeeCost();
  const cashier = useSession((s) => s.user?.role === 'cashier');
  const staffList = useStaffList();
  const [range, setRange] = useState<DateRange>(today);
  const [staff, setStaff] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      api.salesReport({ from: range.from, to: range.to, staff: staff || undefined, query: query || undefined })
        .then((r) => { if (live) { setData(r); setSel(0); setOpen(new Set()); } })
        .catch((e) => live && toast.show({ tone: 'error', title: 'Could not load the report', detail: e instanceof Error ? e.message : undefined }))
        .finally(() => live && setLoading(false));
    }, query ? 250 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [range, staff, query, tick, toast]);

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, ROW_CAP);
  const cols = canCost
    ? '28px 124px 84px minmax(140px,1.6fr) 96px 72px 112px 112px 104px minmax(120px,1fr)'
    : '28px 124px 84px minmax(140px,1.6fr) 96px 72px 112px 112px minmax(120px,1fr)';
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = useCallback(() => {
    if (!data) return;
    const head = ['Bill no', 'Date', 'Customer', 'Staff', 'Qty', 'Total', 'Net (ex GST)', ...(canCost ? ['Profit'] : []), 'Remarks'];
    downloadCsv(`sales-report-${data.from}-to-${data.to}.csv`, head, data.rows.map((r) => [
      r.number, dateTimeOf(r.at), r.customerName, r.staff, formatQty(r.qty, r.qty % 1000 !== 0), rupeesCell(r.total), rupeesCell(r.net),
      ...(canCost ? [rupeesCell(r.profit ?? 0)] : []), r.remarks,
    ]));
  }, [data, canCost]);

  useReportKeys({
    move: (by) => setSel((s) => Math.max(0, Math.min(shown.length - 1, s + by))),
    enter: () => shown[sel] && toggle(shown[sel].id),
    fetch: () => setTick((t) => t + 1),
    save,
  });

  const t = data?.totals;
  return (
    <Frame
      icon={<BarChart3 size={18} />} title="Sales Report" subtitle={data ? `${data.from === data.to ? data.from : `${data.from} to ${data.to}`}` : ' '}
      controls={
        <>
          <RangeControls range={range} setRange={setRange} canPick={!cashier} />
          <StaffSelect staff={staffList} value={staff} onChange={setStaff} />
          <SearchBox value={query} onChange={setQuery} placeholder="Bill number or customer" />
        </>
      }
      actions={
        <>
          <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} kbd="F5" onClick={() => setTick((x) => x + 1)}>Fetch</Button>
          <Button icon={<Download size={14} />} kbd="Ctrl+S" onClick={save} disabled={!rows.length}>Excel</Button>
        </>
      }
      footer={
        <>
          <Total label="Bills">{t?.bills ?? 0}</Total>
          <Total label="Qty">{formatQty(t?.qty ?? 0, (t?.qty ?? 0) % 1000 !== 0)}</Total>
          <Total label="Net">{formatRupees(t?.net ?? 0, { decimals: false })}</Total>
          <Total label="GST">{formatRupees(t?.gst ?? 0, { decimals: false })}</Total>
          {canCost && <Total label="Profit" tone="success">{formatRupees(t?.profit ?? 0, { decimals: false })}</Total>}
          <span className="flex-1" />
          {rows.length > ROW_CAP && <span className="text-xs text-warning">Showing the first {ROW_CAP} bills. Narrow the dates, or save as Excel for all {rows.length}.</span>}
          <Total label="Total" tone="primary">{formatRupees(t?.total ?? 0)}</Total>
        </>
      }
    >
      <Grid cols={cols} head={['', 'Bill no', 'Time', 'Customer', 'Staff', 'Qty', 'Total', 'Net', ...(canCost ? ['Profit'] : []), 'Remarks']} right={[5, 6, 7, canCost ? 8 : -1]}>
        {!loading && rows.length === 0 && <EmptyState icon={<BarChart3 size={22} />} title="No bills in this period" hint="Change the dates or the staff, then Fetch." className="py-16" />}
        {shown.map((r, i) => (
          <SalesRow key={r.id} r={r} cols={cols} canCost={canCost} on={i === sel} open={open.has(r.id)} multiDay={range.from !== range.to}
            onSelect={() => setSel(i)} onToggle={() => { setSel(i); toggle(r.id); }} />
        ))}
      </Grid>
    </Frame>
  );
}

function SalesRow({ r, cols, canCost, on, open, multiDay, onSelect, onToggle }: {
  r: SalesReportRow; cols: string; canCost: boolean; on: boolean; open: boolean; multiDay: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const loose = r.qty % 1000 !== 0;
  return (
    <div className={cn('border-b border-line/70', on && 'bg-primary-soft/60')} onMouseDown={onSelect}>
      <div className="grid h-10 cursor-default items-center px-3 text-sm" style={{ gridTemplateColumns: cols }} onDoubleClick={onToggle}>
        <button type="button" tabIndex={-1} onClick={onToggle} aria-label={open ? 'Hide bill lines' : 'Show bill lines'} className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface-3 hover:text-ink">
          <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <span className="num truncate px-2 font-semibold text-ink">{r.number}</span>
        <span className="num px-2 text-muted">{multiDay ? new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' : ''}{timeOf(r.at)}</span>
        <span className="truncate px-2 text-ink">{r.customerName}{r.wholesale && <span className="ml-1.5 rounded bg-accent/20 px-1 text-[10px] font-bold uppercase text-warning">W</span>}</span>
        <span className="truncate px-2 text-muted">{r.staff || '-'}</span>
        <span className="num px-2 text-right text-muted">{formatQty(r.qty, loose)}</span>
        <span className="px-2 text-right font-semibold"><Money paise={r.total} symbol={false} /></span>
        <span className="px-2 text-right text-muted"><Money paise={r.net} symbol={false} /></span>
        {canCost && <span className={cn('px-2 text-right', (r.profit ?? 0) < 0 ? 'text-danger' : 'text-success')}><Money paise={r.profit ?? 0} symbol={false} /></span>}
        <span className="truncate px-2 text-xs text-muted">{r.status === 'credit' ? 'On credit' : r.status === 'returned' ? 'Returned' : r.remarks}</span>
      </div>
      {open && (
        <div className="mx-3 mb-2 ml-[52px] overflow-hidden rounded-lg border border-line bg-surface">
          <div className="grid h-7 items-center bg-surface-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted" style={{ gridTemplateColumns: canCost ? 'minmax(160px,2fr) 80px 90px 90px 70px 100px 90px 90px' : 'minmax(160px,2fr) 80px 90px 90px 70px 100px' }}>
            <span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Disc</span><span className="text-right">GST</span><span className="text-right">Amount</span>
            {canCost && <><span className="text-right">Cost</span><span className="text-right">Profit</span></>}
          </div>
          {r.lines.map((l, k) => (
            <div key={k} className="grid h-8 items-center border-t border-line/60 px-3 text-sm" style={{ gridTemplateColumns: canCost ? 'minmax(160px,2fr) 80px 90px 90px 70px 100px 90px 90px' : 'minmax(160px,2fr) 80px 90px 90px 70px 100px' }}>
              <span className="truncate text-ink">{l.name}</span>
              <span className="num text-right text-muted">{formatQty(l.qty, l.qty % 1000 !== 0)}</span>
              <span className="text-right text-muted"><Money paise={l.rate} symbol={false} /></span>
              <span className="text-right text-muted">{l.discount ? <Money paise={-l.discount} symbol={false} /> : '-'}</span>
              <span className="num text-right text-muted">{l.gstRate}%</span>
              <span className="text-right font-medium"><Money paise={l.amount} symbol={false} /></span>
              {canCost && <><span className="text-right text-muted"><Money paise={l.cost ?? 0} symbol={false} /></span><span className={cn('text-right', (l.profit ?? 0) < 0 ? 'text-danger' : 'text-success')}><Money paise={l.profit ?? 0} symbol={false} /></span></>}
            </div>
          ))}
          {(r.cashDisc > 0 || r.deliveryCharge > 0) && (
            <div className="flex justify-end gap-5 border-t border-line/60 bg-surface-2 px-3 py-1 text-xs text-muted">
              {r.cashDisc > 0 && <span>Cash discount <b className="num text-ink">{formatRupees(r.cashDisc)}</b></span>}
              {r.deliveryCharge > 0 && <span>Delivery <b className="num text-ink">{formatRupees(r.deliveryCharge)}</b></span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Header plus rows inside one scroll area, so the columns scroll together and the header stays on top. */
function Grid({ cols, head, right, minWidth = 1000, children }: { cols: string; head: string[]; right: number[]; minWidth?: number; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div style={{ minWidth }}>
        <div className="sticky top-0 z-10 grid h-9 items-center border-b border-line-strong bg-surface-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: cols }}>
          {head.map((h, i) => <div key={i} className={cn('truncate px-2', right.includes(i) && 'text-right')}>{h}</div>)}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Paymode Report                                                      */
/* ================================================================== */
const MODE_COLS: { key: 'cash' | 'upi' | 'card' | 'credit' | 'wallet' | 'points' | 'sodexo'; label: string }[] = [
  { key: 'cash', label: 'Cash' }, { key: 'upi', label: 'BharatQR / UPI' }, { key: 'card', label: 'Card' }, { key: 'credit', label: 'Credit' },
  { key: 'wallet', label: 'Wallet' }, { key: 'points', label: 'Cust. points' }, { key: 'sodexo', label: 'Sodexo' },
];

export function PaymodeReportPage() {
  useScreenKeys('Paymode Report', REPORT_KEYS);
  const toast = useToast();
  const cashier = useSession((s) => s.user?.role === 'cashier');
  const staffList = useStaffList();
  const [range, setRange] = useState<DateRange>(today);
  const [staff, setStaff] = useState('');
  const [data, setData] = useState<PaymodeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.paymodeReport({ from: range.from, to: range.to, staff: staff || undefined })
      .then((r) => { if (live) { setData(r); setSel(0); } })
      .catch((e) => live && toast.show({ tone: 'error', title: 'Could not load the report', detail: e instanceof Error ? e.message : undefined }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [range, staff, tick, toast]);

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, ROW_CAP);
  const cols = '116px 78px minmax(120px,1.4fr) 84px 100px repeat(7, minmax(80px,1fr))';

  const save = useCallback(() => {
    if (!data) return;
    downloadCsv(`paymode-report-${data.from}-to-${data.to}.csv`, ['Bill no', 'Date', 'Customer', 'Staff', 'Total', ...MODE_COLS.map((m) => m.label)],
      data.rows.map((r) => [r.number, dateTimeOf(r.at), r.customerName, r.staff, rupeesCell(r.total), ...MODE_COLS.map((m) => rupeesCell(r[m.key]))]));
  }, [data]);
  useReportKeys({ move: (by) => setSel((s) => Math.max(0, Math.min(shown.length - 1, s + by))), enter: () => undefined, fetch: () => setTick((t) => t + 1), save });

  const t = data?.totals;
  return (
    <Frame
      icon={<CreditCard size={18} />} title="Paymode Report" subtitle="Every bill split by how it was paid"
      controls={<><RangeControls range={range} setRange={setRange} canPick={!cashier} /><StaffSelect staff={staffList} value={staff} onChange={setStaff} /></>}
      actions={
        <>
          <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} kbd="F5" onClick={() => setTick((x) => x + 1)}>Fetch</Button>
          <Button icon={<Download size={14} />} kbd="Ctrl+S" onClick={save} disabled={!rows.length}>Excel</Button>
        </>
      }
      footer={
        <>
          <Total label="Bills">{t?.bills ?? 0}</Total>
          {MODE_COLS.map((m) => <Total key={m.key} label={m.label}>{formatRupees(t?.[m.key] ?? 0, { decimals: false })}</Total>)}
          <span className="flex-1" />
          <Total label="Total" tone="primary">{formatRupees(t?.total ?? 0)}</Total>
        </>
      }
    >
      <Grid cols={cols} head={['Bill no', 'Time', 'Customer', 'Staff', 'Total', ...MODE_COLS.map((m) => m.label)]} right={[4, 5, 6, 7, 8, 9, 10, 11]}>
        {!loading && rows.length === 0 && <EmptyState icon={<CreditCard size={22} />} title="No bills in this period" hint="Change the dates or the staff, then Fetch." className="py-16" />}
        {shown.map((r, i) => (
          <div key={r.id} onMouseDown={() => setSel(i)} className={cn('grid h-10 items-center border-b border-line/70 px-3 text-sm', i === sel && 'bg-primary-soft/60')} style={{ gridTemplateColumns: cols }}>
            <span className="num truncate px-2 font-semibold text-ink">{r.number}</span>
            <span className="num px-2 text-muted">{range.from !== range.to ? new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' : ''}{timeOf(r.at)}</span>
            <span className="truncate px-2 text-ink">{r.customerName}</span>
            <span className="truncate px-2 text-muted">{r.staff || '-'}</span>
            <span className="px-2 text-right font-semibold"><Money paise={r.total} symbol={false} /></span>
            {MODE_COLS.map((m) => (
              <span key={m.key} className={cn('px-2 text-right', r[m.key] ? 'text-ink' : 'text-subtle')}>{r[m.key] ? <Money paise={r[m.key]} symbol={false} /> : '-'}</span>
            ))}
          </div>
        ))}
      </Grid>
    </Frame>
  );
}

/* ================================================================== */
/* Stock                                                               */
/* ================================================================== */
export function StockPage() {
  useScreenKeys('Stock', [['Search by name, barcode, brand or supplier', ['Type']], ...REPORT_KEYS.slice(2)]);
  const toast = useToast();
  const canCost = useCanSeeCost();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);
  const boxRef = useRef<HTMLInputElement>(null);

  useEffect(() => { boxRef.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      api.stockReport({ query: query || undefined })
        .then((r) => { if (live) { setData(r); setSel(0); } })
        .catch((e) => live && toast.show({ tone: 'error', title: 'Could not load stock', detail: e instanceof Error ? e.message : undefined }))
        .finally(() => live && setLoading(false));
    }, query ? 200 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [query, tick, toast]);

  const rows = data?.rows ?? [];
  const shown = rows.slice(0, ROW_CAP);
  const cols = canCost
    ? '132px minmax(170px,2.2fr) minmax(84px,1fr) minmax(66px,.7fr) minmax(68px,.6fr) minmax(68px,.6fr) minmax(76px,.5fr) minmax(66px,.6fr) minmax(90px,.7fr) minmax(66px,.6fr) minmax(90px,.8fr) minmax(98px,.8fr) minmax(94px,.8fr) minmax(104px,1.2fr)'
    : '122px minmax(190px,2.2fr) 100px 84px 72px 80px 84px 100px 120px';

  const save = useCallback(() => {
    if (!data) return;
    const head = ['Barcode', 'Product', 'Category', 'Brand', 'MRP', ...(canCost ? ['Cost', 'Profit %', 'Profit'] : []), 'Sales price', 'Qty', ...(canCost ? ['Cost total', 'Profit total'] : []), 'Sales total', 'Supplier'];
    downloadCsv('stock.csv', head, data.rows.map((r) => [
      r.barcode, r.name, r.category, r.brand, rupeesCell(r.mrp), ...(canCost ? [rupeesCell(r.cost ?? 0), r.profitPct ?? 0, rupeesCell(r.profit ?? 0)] : []),
      rupeesCell(r.price), formatQty(r.qty, r.qty % 1000 !== 0), ...(canCost ? [rupeesCell(r.costTotal ?? 0), rupeesCell(r.profitTotal ?? 0)] : []), rupeesCell(r.salesTotal), r.supplier,
    ]));
  }, [data, canCost]);
  useReportKeys({ move: (by) => setSel((s) => Math.max(0, Math.min(shown.length - 1, s + by))), enter: () => undefined, fetch: () => setTick((t) => t + 1), save });

  const t = data?.totals;
  return (
    <Frame
      icon={<Package size={18} />} title="Stock" subtitle={data ? `${data.totals.items} items` : ' '}
      controls={<SearchBox value={query} onChange={setQuery} placeholder="Name, barcode, brand or supplier" inputRef={boxRef} />}
      actions={
        <>
          <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} kbd="F5" onClick={() => setTick((x) => x + 1)}>Fetch</Button>
          <Button icon={<Download size={14} />} kbd="Ctrl+S" onClick={save} disabled={!rows.length}>Excel</Button>
        </>
      }
      footer={
        <>
          <Total label="Items">{t?.items ?? 0}</Total>
          {canCost && <Total label="Cost total">{formatRupees(t?.costTotal ?? 0, { decimals: false })}</Total>}
          {canCost && <Total label="Profit total" tone="success">{formatRupees(t?.profitTotal ?? 0, { decimals: false })}</Total>}
          <span className="flex-1" />
          <Total label="Sales total" tone="primary">{formatRupees(t?.salesTotal ?? 0, { decimals: false })}</Total>
        </>
      }
    >
      <Grid
        cols={cols}
        head={canCost
          ? ['Barcode', 'Product', 'Category', 'Brand', 'MRP', 'Cost', 'Profit %', 'Profit', 'Sales price', 'Qty', 'Cost total', 'Profit total', 'Sales total', 'Supplier']
          : ['Barcode', 'Product', 'Category', 'Brand', 'MRP', 'Sales price', 'Qty', 'Sales total', 'Supplier']}
        right={canCost ? [4, 5, 6, 7, 8, 9, 10, 11, 12] : [4, 5, 6, 7]}
        minWidth={canCost ? 1290 : 900}
      >
        {!loading && rows.length === 0 && <EmptyState icon={<Package size={22} />} title={query ? `No item matches "${query}"` : 'No items'} className="py-16" />}
        {shown.map((r, i) => <StockLine key={r.id} r={r} cols={cols} canCost={canCost} on={i === sel} onSelect={() => setSel(i)} />)}
      </Grid>
    </Frame>
  );
}

function StockLine({ r, cols, canCost, on, onSelect }: { r: StockRow; cols: string; canCost: boolean; on: boolean; onSelect: () => void }) {
  const loose = r.qty % 1000 !== 0 || r.unit === 'kg' || r.unit === 'l';
  const out = r.qty <= 0;
  return (
    <div onMouseDown={onSelect} className={cn('grid h-10 items-center border-b border-line/70 px-3 text-sm', on && 'bg-primary-soft/60')} style={{ gridTemplateColumns: cols }}>
      <span className="num truncate px-2 text-xs text-muted">{r.barcode}</span>
      <span className="truncate px-2 font-medium text-ink">{r.name}</span>
      <span className="truncate px-2 text-muted">{r.category}</span>
      <span className="truncate px-2 text-muted">{r.brand}</span>
      <span className="px-2 text-right text-muted"><Money paise={r.mrp} symbol={false} /></span>
      {canCost && <>
        <span className="px-2 text-right text-muted"><Money paise={r.cost ?? 0} symbol={false} /></span>
        <span className={cn('num px-2 text-right', (r.profitPct ?? 0) < 0 ? 'text-danger' : 'text-muted')}>{(r.profitPct ?? 0).toFixed(1)}</span>
        <span className={cn('px-2 text-right', (r.profit ?? 0) < 0 ? 'text-danger' : 'text-success')}><Money paise={r.profit ?? 0} symbol={false} /></span>
      </>}
      <span className="px-2 text-right font-semibold"><Money paise={r.price} symbol={false} /></span>
      <span className={cn('num px-2 text-right font-semibold', out ? 'text-danger' : 'text-ink')}>{formatQty(r.qty, loose)}</span>
      {canCost && <>
        <span className="px-2 text-right text-muted"><Money paise={r.costTotal ?? 0} symbol={false} /></span>
        <span className="px-2 text-right text-muted"><Money paise={r.profitTotal ?? 0} symbol={false} /></span>
      </>}
      <span className="px-2 text-right"><Money paise={r.salesTotal} symbol={false} /></span>
      <span className="truncate px-2 text-muted">{r.supplier || '-'}</span>
    </div>
  );
}


/* ================================================================== */
/* Staff report                                                        */
/* ================================================================== */
export function StaffReportPage() {
  useScreenKeys('Staff report', [REPORT_KEYS[2], REPORT_KEYS[3], REPORT_KEYS[4]]);
  const toast = useToast();
  const cashier = useSession((s) => s.user?.role === 'cashier');
  const [range, setRange] = useState<DateRange>(today);
  const [rows, setRows] = useState<StaffReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.staffReport({ from: range.from, to: range.to })
      .then((r) => live && setRows(r.rows))
      .catch((e) => live && toast.show({ tone: 'error', title: 'Could not load the report', detail: e instanceof Error ? e.message : undefined }))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [range, tick, toast]);

  const save = useCallback(() => {
    downloadCsv(`staff-report-${range.from}-to-${range.to}.csv`, ['Staff', 'Bills', 'Qty', 'Total', 'Net (ex GST)'],
      rows.map((r) => [r.staff, r.bills, formatQty(r.qty, r.qty % 1000 !== 0), rupeesCell(r.total), rupeesCell(r.net)]));
  }, [rows, range]);
  useReportKeys({ move: () => undefined, enter: () => undefined, fetch: () => setTick((t) => t + 1), save });

  const cols = 'minmax(180px,2fr) 100px 110px 140px 140px';
  const total = rows.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Frame
      icon={<Users size={18} />} title="Staff report" subtitle="Sales by the staff picked on each bill (F7)"
      controls={<RangeControls range={range} setRange={setRange} canPick={!cashier} />}
      actions={
        <>
          <Button icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} kbd="F5" onClick={() => setTick((x) => x + 1)}>Fetch</Button>
          <Button icon={<Download size={14} />} kbd="Ctrl+S" onClick={save} disabled={!rows.length}>Excel</Button>
        </>
      }
      footer={
        <>
          <Total label="Staff">{rows.length}</Total>
          <Total label="Bills">{rows.reduce((s, r) => s + r.bills, 0)}</Total>
          <span className="flex-1" />
          <Total label="Total" tone="primary">{formatRupees(total)}</Total>
        </>
      }
    >
      <Grid cols={cols} head={['Staff', 'Bills', 'Qty', 'Net', 'Total']} right={[1, 2, 3, 4]} minWidth={720}>
        {!loading && rows.length === 0 && <EmptyState icon={<Users size={22} />} title="No bills in this period" className="py-16" />}
        {rows.map((r) => (
          <div key={r.staff} className="grid h-12 items-center border-b border-line/70 px-3 text-sm" style={{ gridTemplateColumns: cols }}>
            <span className="min-w-0 px-2">
              <span className="block truncate font-medium text-ink">{r.staff}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.total / max) * 100}%` }} /></span>
            </span>
            <span className="num px-2 text-right text-ink">{r.bills}</span>
            <span className="num px-2 text-right text-muted">{formatQty(r.qty, r.qty % 1000 !== 0)}</span>
            <span className="px-2 text-right text-muted"><Money paise={r.net} symbol={false} /></span>
            <span className="px-2 text-right font-semibold"><Money paise={r.total} symbol={false} /></span>
          </div>
        ))}
      </Grid>
    </Frame>
  );
}
