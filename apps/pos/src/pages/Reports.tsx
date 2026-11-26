import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BarChart3, ChevronRight, CreditCard, Download, Package, RefreshCw, Search, Users } from 'lucide-react';
import {
  formatQty, formatRupees, groupStock, passesStockFilter, type GroupBy, type StockFilter, type StockGroup, type PaymodeReport, type SalesReport, type SalesReportRow, type Staff, type StaffReportRow, type StockReport, type StockRow,
} from '@gokul/data';
import { Badge, Button, ColResizer, DateRangePicker, EmptyState, Money, PosLayout, ROW_COLS, cn, parseTracks, useResizableColumns, useRefreshOnFocus, dateRangePresets, useToast, type DateRange, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { dateTimeOf, timeOf } from '../components/billops/helpers';
import { downloadCsv, rupeesCell } from '../csv';
import { FEATURES } from '../features';
import { plural } from '../plural';
import '../reports.css';

/** A screen can draw this many rows at once; the Excel export always holds every row. */
const ROW_CAP = 1000;

const REPORT_KEYS: KeyRows = [
  ['Move between rows', ['Up', 'Down']],
  ['Open or close the bill lines', ['Enter']],
  ['Fetch again', ['F5']],
  ['Save as Excel (CSV)', ['Ctrl+S']],
  ['Back to billing', ['Esc']],
];

const PAY_HOVER = 'hover:[background-image:linear-gradient(rgb(var(--ink)/0.03),rgb(var(--ink)/0.03))]';

/** Owner and managers see cost and profit; a cashier never gets those numbers from the backend. */
function useCanSeeCost() {
  const role = useSession((s) => s.user?.role);
  return role === 'owner' || role === 'admin' || role === 'manager';
}

function useStaffList() {
  const [staff, setStaff] = useState<Staff[]>([]);
  useEffect(() => { void api.listStaff().then(setStaff).catch(() => undefined); }, []);
  return staff;
}

/** Screen frame: toolbar on top, a table that scrolls both ways, totals pinned at the bottom. */
function Frame({ icon, title, subtitle, controls, actions, footer, children }: {
  icon: ReactNode; title: string; subtitle?: ReactNode; controls: ReactNode; actions: ReactNode; footer?: ReactNode; children: ReactNode;
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
      {footer && <div className="flex h-12 shrink-0 items-center gap-6 overflow-x-auto border-t border-line-strong bg-surface-2 px-4 text-sm">{footer}</div>}
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
  const cashier = useSession((s) => s.user?.role === 'cashier' || s.user?.role === 'staff');
  const staffList = useStaffList();
  const [range, setRange] = useState<DateRange>(today);
  const [staff, setStaff] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);
  useRefreshOnFocus(() => setTick((t) => t + 1), { f5: false });

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
    >
      <Grid
        cols={cols} readable head={['', 'Bill no', 'Time', 'Customer', 'Staff', 'Qty', 'Total', 'Net', ...(canCost ? ['Profit'] : []), 'Remarks']} right={[5, 6, 7, canCost ? 8 : -1]}
        foot={
          <FootRow>
            <span className="col-span-5 px-2 font-bold text-ink">{plural(t?.bills ?? 0, 'bill')}</span>
            <span className={cn('num px-2 text-right font-bold text-ink', PAY_DIVIDER)}>{formatQty(t?.qty ?? 0, (t?.qty ?? 0) % 1000 !== 0)}</span>
            <span className={cn('px-2 text-right font-bold text-ink', PAY_DIVIDER)}><Money paise={t?.total ?? 0} symbol={false} /></span>
            <span className={cn('px-2 text-right font-bold text-ink', PAY_DIVIDER)}><Money paise={t?.net ?? 0} symbol={false} /></span>
            {canCost && <span className={cn('px-2 text-right', PAY_DIVIDER)}><span className={(t?.profit ?? 0) < 0 ? 'rpt-box rpt-mode-credit' : 'rpt-box-good'}><Money paise={t?.profit ?? 0} symbol={false} /></span></span>}
            <span className="truncate px-2 text-xs font-medium text-muted">GST <Money paise={t?.gst ?? 0} symbol={false} /></span>
          </FootRow>
        }
      >
        {rows.length > ROW_CAP && <div className="border-b border-line bg-warning-soft px-4 py-1.5 text-xs text-warning">Showing the first {ROW_CAP} bills. Narrow the dates, or save as Excel for all {rows.length}.</div>}
        {!loading && rows.length === 0 && <EmptyState icon={<BarChart3 size={22} />} title="No bills in this period" hint="Change the dates or the staff, then Fetch." className="py-16" />}
        {shown.map((r, i) => (
          <SalesRow key={r.id} r={r} cols={cols} canCost={canCost} on={i === sel} open={open.has(r.id)} multiDay={range.from !== range.to}
            onSelect={() => setSel(i)} onToggle={() => { setSel(i); toggle(r.id); }} />
        ))}
      </Grid>
    </Frame>
  );
}

function SalesRow({ r, canCost, on, open, multiDay, onSelect, onToggle }: {
  r: SalesReportRow; cols?: string; canCost: boolean; on: boolean; open: boolean; multiDay: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const loose = r.qty % 1000 !== 0;
  return (
    <div className={cn('border-b border-line/70', on && 'bg-primary-soft/60')} onMouseDown={onSelect}>
      <div className="grid h-10 cursor-default items-center px-3 text-sm" style={{ gridTemplateColumns: ROW_COLS }} onDoubleClick={onToggle}>
        <button type="button" tabIndex={-1} onClick={onToggle} aria-label={open ? 'Hide bill lines' : 'Show bill lines'} className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface-3 hover:text-ink">
          <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <span className="num truncate px-2 font-semibold text-ink">{r.number}</span>
        <span className="num px-2 text-muted">{multiDay ? new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' : ''}{timeOf(r.at)}</span>
        <span className="truncate px-2 text-ink">{r.customerName}{r.wholesale && <span className="ml-1.5 rounded bg-accent/20 px-1 text-[10px] font-bold uppercase text-warning">W</span>}</span>
        <span className="truncate px-2 text-muted">{r.staff || '-'}</span>
        <span className={cn('num px-2 text-right font-semibold text-ink', PAY_DIVIDER, SALES_HOVER)} style={selStyle(on)}>{formatQty(r.qty, loose)}</span>
        <span className={cn('px-2 text-right font-semibold text-ink', PAY_DIVIDER, SALES_HOVER)} style={selStyle(on)}><Money paise={r.total} symbol={false} /></span>
        <span className={cn('px-2 text-right font-semibold text-ink', PAY_DIVIDER, SALES_HOVER)} style={selStyle(on)}><Money paise={r.net} symbol={false} /></span>
        {canCost && <span className={cn('px-2 text-right', (r.profit ?? 0) < 0 ? 'rpt-profit-neg' : 'rpt-profit', PAY_DIVIDER, SALES_HOVER)} style={selStyle(on)}><Money paise={r.profit ?? 0} symbol={false} /></span>}
        <RemarkTags r={r} />
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

/** Columns carry no tint; the selected row only gets a translucent overlay. */
const selStyle = (on: boolean): CSSProperties => (on ? { backgroundImage: PAY_SEL_OVERLAY } : {});

/** Remarks as small coloured tags: credit, returned or cancelled, delivery, wholesale; anything else is a grey tag. */
function RemarkTags({ r }: { r: SalesReportRow }) {
  const isDelivery = r.deliveryCharge > 0 || /deliver/i.test(r.remarks);
  const isCancel = /cancel/i.test(r.remarks);
  const other = r.remarks && !/deliver|cancel/i.test(r.remarks) ? r.remarks : '';
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden px-2">
      {r.status === 'credit' && <span className="rpt-tag rpt-tag-red">On credit</span>}
      {r.status === 'returned' && <span className="rpt-tag rpt-tag-outline">Returned</span>}
      {isCancel && <span className="rpt-tag rpt-tag-outline">Cancelled</span>}
      {isDelivery && <span className="rpt-tag rpt-tag-blue">Delivery</span>}
      {r.wholesale && <span className="rpt-tag rpt-tag-purple">Wholesale</span>}
      {other && <span className="rpt-tag rpt-tag-grey truncate" title={other}>{other}</span>}
    </span>
  );
}

const SALES_HOVER = PAY_HOVER;
/** Header plus rows inside one scroll area, so the columns scroll together and the header stays on top. */
function Grid({ cols, head, right, minWidth = 1000, foot, readable, headTone, children }: { cols: string; head: string[]; right: number[]; minWidth?: number; foot?: ReactNode; readable?: boolean; headTone?: (i: number) => { className?: string; style?: CSSProperties } | undefined; children: ReactNode }) {
  const specs = useMemo(() => parseTracks(cols, head.map((h, i) => h || `c${i}`)), [cols, head]);
  const rc = useResizableColumns(`pos-report|${head.join(',')}`, specs);
  return (
    <div className="min-h-0 flex-1 overflow-auto" ref={rc.rootProps.ref} onMouseOver={rc.rootProps.onMouseOver} style={rc.rootProps.style}>
      <div className={cn(!!foot && 'flex min-h-full flex-col')} style={{ minWidth: Math.max(minWidth, rc.customised ? rc.minTotal + 24 : 0) }}>
        <div onContextMenu={rc.headerProps.onContextMenu} className={cn('sticky top-0 z-10 grid h-9 items-center border-b border-line-strong bg-surface-2 px-3 font-semibold uppercase', readable ? 'text-[11.5px] tracking-wide text-ink' : 'text-[10.5px] tracking-wide text-muted')} style={{ gridTemplateColumns: ROW_COLS }}>
          {head.map((h, i) => (
            <div key={i} className={cn('relative h-full min-w-0 truncate px-2 pr-3 leading-9', right.includes(i) && 'text-right', headTone?.(i)?.className)} style={headTone?.(i)?.style}>
              {h}{h && <ColResizer rc={rc} index={i} />}
            </div>
          ))}
        </div>
        {foot ? <div className="flex-1">{children}</div> : children}
        {foot}
      </div>
      {rc.menu}
    </div>
  );
}

/** Totals row that sits under the table columns (same grid, so each total is under its own column). Pinned to the bottom. */
function FootRow({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 grid h-11 items-center border-t-2 border-line-strong bg-surface-2 px-3 text-sm font-semibold" style={{ gridTemplateColumns: ROW_COLS }}>
      {children}
    </div>
  );
}

/* ================================================================== */
/* Paymode Report                                                      */
/* ================================================================== */
type ModeKey = 'cash' | 'upi' | 'card' | 'credit' | 'wallet' | 'points' | 'sodexo';
/** Each pay mode keeps one calm colour everywhere on this screen, so one look shows how a bill was paid. */
const ALL_MODES: { key: ModeKey; label: string; on: boolean }[] = [
  { key: 'cash', label: 'Cash', on: true },
  { key: 'upi', label: 'BharatQR / UPI', on: true },
  { key: 'card', label: 'Card', on: true },
  { key: 'credit', label: 'Credit', on: true },
  { key: 'points', label: 'Cust. points', on: true },
  // disabled 26 Nov 2026 by owner; re-enable by setting FEATURES.wallet=true / FEATURES.sodexo=true (see ../features.ts)
  { key: 'wallet', label: 'Wallet', on: FEATURES.wallet },
  { key: 'sodexo', label: 'Sodexo', on: FEATURES.sodexo },
];
const MODE_COLS = ALL_MODES.filter((m) => m.on);
/* Colours live in reports.css (.rpt-mode-<key>): the ink for text, the bar for the header underline. No column tints. */
const PAY_DIVIDER = 'border-l border-line';
const PAY_SEL_OVERLAY = 'linear-gradient(rgb(var(--primary-soft) / 0.45), rgb(var(--primary-soft) / 0.45))';
const PAY_FIRST_MODE = 5; // header index of the first pay-mode column (Bill no, Time, Customer, Staff, Total come before it)

export function PaymodeReportPage() {
  useScreenKeys('Paymode Report', REPORT_KEYS);
  const toast = useToast();
  const cashier = useSession((s) => s.user?.role === 'cashier' || s.user?.role === 'staff');
  const staffList = useStaffList();
  const [range, setRange] = useState<DateRange>(today);
  const [staff, setStaff] = useState('');
  const [data, setData] = useState<PaymodeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);
  useRefreshOnFocus(() => setTick((t) => t + 1), { f5: false });

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
  const cols = `116px 84px minmax(120px,1.4fr) 84px 124px repeat(${MODE_COLS.length}, minmax(92px,1fr))`;

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
    >
      <Grid
        cols={cols} readable head={['Bill no', 'Time', 'Customer', 'Staff', 'Total', ...MODE_COLS.map((m) => m.label)]} right={[4, 5, 6, 7, 8, 9, 10, 11]}
        headTone={(i) => (i >= PAY_FIRST_MODE ? { className: `${PAY_DIVIDER} rpt-mode-${MODE_COLS[i - PAY_FIRST_MODE].key}`, style: { color: 'var(--pm-ink)', boxShadow: 'inset 0 -3px 0 var(--pm-bar)' } } : undefined)}
        foot={
          <FootRow>
            <span className="col-span-4 px-2 font-bold text-ink">{plural(t?.bills ?? 0, 'bill')}</span>
            <span className="px-2 text-right font-bold text-ink"><Money paise={t?.total ?? 0} symbol={false} /></span>
            {MODE_COLS.map((m) => (
              <span key={m.key} className={cn('rpt-mode-' + m.key, 'px-1.5 text-right', PAY_DIVIDER)}>
                {t?.[m.key] ? <span className="rpt-box"><Money paise={t[m.key]} symbol={false} /></span> : <span className="rpt-empty">–</span>}
              </span>
            ))}
          </FootRow>
        }
      >
        {!loading && rows.length === 0 && <EmptyState icon={<CreditCard size={22} />} title="No bills in this period" hint="Change the dates or the staff, then Fetch." className="py-16" />}
        {shown.map((r, i) => {
          const used = ALL_MODES.filter((m) => r[m.key] > 0).length;
          return (
            <div key={r.id} onMouseDown={() => setSel(i)} className={cn('grid h-10 items-center border-b border-line/70 px-3 text-sm hover:bg-surface-3/60', i === sel && 'bg-primary-soft/60')} style={{ gridTemplateColumns: ROW_COLS }}>
              <span className="num truncate px-2 font-semibold text-ink">{r.number}</span>
              <span className="num px-2 text-muted">{range.from !== range.to ? new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' : ''}{timeOf(r.at)}</span>
              <span className="truncate px-2 text-ink">{r.customerName}</span>
              <span className="truncate px-2 text-muted">{r.staff || '-'}</span>
              <span className="flex items-center justify-end gap-1.5 px-2 text-right font-semibold text-ink">
                {used > 1 && <span className="rounded border border-line-strong bg-surface-3 px-1 text-[10px] font-semibold uppercase leading-4 tracking-wide text-muted" title="Paid in more than one way">Split</span>}
                <Money paise={r.total} symbol={false} />
              </span>
              {MODE_COLS.map((m) => (
                <span key={m.key} className={cn('px-2 text-right', PAY_DIVIDER, PAY_HOVER, r[m.key] ? `rpt-amt rpt-mode-${m.key}` : '')} style={selStyle(i === sel)}>
                  {r[m.key] ? <Money paise={r[m.key]} symbol={false} /> : <span className="rpt-empty">–</span>}
                </span>
              ))}
            </div>
          );
        })}
      </Grid>
    </Frame>
  );
}

/* ================================================================== */
/* Stock                                                               */
/* ================================================================== */
type StockCol = { key: string; label: string; right?: boolean; w: string; cost?: boolean; get: (r: StockRow) => string | number };
const STOCK_COLS: StockCol[] = [
  { key: 'barcode', label: 'Barcode', w: '128px', get: (r) => r.barcode },
  { key: 'name', label: 'Product', w: 'minmax(190px,2.2fr)', get: (r) => r.name.toLowerCase() },
  { key: 'category', label: 'Category', w: 'minmax(130px,1.1fr)', get: (r) => r.category.toLowerCase() },
  { key: 'brand', label: 'Brand', w: 'minmax(110px,1fr)', get: (r) => r.brand.toLowerCase() },
  { key: 'mrp', label: 'MRP', right: true, w: '78px', get: (r) => r.mrp },
  { key: 'cost', label: 'Cost', right: true, w: '78px', cost: true, get: (r) => r.cost ?? 0 },
  { key: 'profitPct', label: 'Profit %', right: true, w: '76px', cost: true, get: (r) => r.profitPct ?? 0 },
  { key: 'profit', label: 'Profit', right: true, w: '78px', cost: true, get: (r) => r.profit ?? 0 },
  { key: 'price', label: 'Sales price', right: true, w: '90px', get: (r) => r.price },
  { key: 'qty', label: 'Qty', right: true, w: '84px', get: (r) => r.qty },
  { key: 'costTotal', label: 'Cost total', right: true, w: '100px', cost: true, get: (r) => r.costTotal ?? 0 },
  { key: 'profitTotal', label: 'Profit total', right: true, w: '100px', cost: true, get: (r) => r.profitTotal ?? 0 },
  { key: 'salesTotal', label: 'Sales total', right: true, w: '104px', get: (r) => r.salesTotal },
  { key: 'supplier', label: 'Supplier', w: 'minmax(130px,1.2fr)', get: (r) => r.supplier.toLowerCase() },
];
const GROUPS: { id: GroupBy; label: string }[] = [{ id: 'none', label: 'None (A-Z)' }, { id: 'category', label: 'Category' }, { id: 'brand', label: 'Brand' }, { id: 'supplier', label: 'Supplier' }];
const QUICK: { id: StockFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'low', label: 'Low stock' }, { id: 'out', label: 'Out / negative' }, { id: 'has', label: 'Has stock' }];
const chip = (on: boolean) => cn('h-8 shrink-0 rounded-control border px-2.5 text-xs font-medium transition-colors', on ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3');

type StockLineItem = { kind: 'group'; g: StockGroup<StockRow> } | { kind: 'row'; r: StockRow };

export function StockPage() {
  useScreenKeys('Stock', [['Search by name, barcode, brand or supplier', ['Type']], ...REPORT_KEYS.slice(2)]);
  const toast = useToast();
  const canCost = useCanSeeCost();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [tick, setTick] = useState(0);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useRefreshOnFocus(() => setTick((t) => t + 1), { f5: false });
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

  const defs = useMemo(() => STOCK_COLS.filter((c) => canCost || !c.cost), [canCost]);
  const cols = defs.map((c) => c.w).join(' ');
  const rcSpecs = useMemo(() => parseTracks(cols, defs.map((c) => c.key)), [cols, defs]);
  const rc = useResizableColumns('pos-stock', rcSpecs);

  /* filter, then sort; the totals in the footer follow the filter */
  const rows = useMemo(() => {
    const f = (data?.rows ?? []).filter((r) => passesStockFilter(filter, r.qty, r.reorderLevel ?? 0));
    const col = STOCK_COLS.find((c) => c.key === sort.key) ?? STOCK_COLS[1];
    return [...f].sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
      return (c || a.name.localeCompare(b.name)) * sort.dir;
    });
  }, [data, filter, sort]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ cost: t.cost + (r.costTotal ?? 0), profit: t.profit + (r.profitTotal ?? 0), sales: t.sales + r.salesTotal }), { cost: 0, profit: 0, sales: 0 }), [rows]);

  const groups = useMemo(() => groupStock(rows, groupBy, (r) => ({ key: groupBy === 'category' ? r.category : groupBy === 'brand' ? r.brand : r.supplier, qty: r.qty, sales: r.salesTotal, cost: r.costTotal, profit: r.profitTotal }), groupBy === 'supplier' ? 'No supplier' : 'Not set'), [rows, groupBy]);
  const lines = useMemo<StockLineItem[]>(() => {
    if (groupBy === 'none') return rows.slice(0, ROW_CAP).map((r) => ({ kind: 'row', r }));
    return groups.flatMap<StockLineItem>((g) => [{ kind: 'group', g }, ...(closed.has(g.key) ? [] : g.rows.map((r) => ({ kind: 'row' as const, r })))]);
  }, [rows, groups, groupBy, closed]);
  const rowCount = lines.filter((l) => l.kind === 'row').length;

  const save = useCallback(() => {
    downloadCsv('stock.csv', defs.map((c) => c.label), rows.map((r) => defs.map((c) => {
      if (['mrp', 'cost', 'profit', 'price', 'costTotal', 'profitTotal', 'salesTotal'].includes(c.key)) return rupeesCell(Number(c.get(r)));
      if (c.key === 'qty') return formatQty(r.qty, r.qty % 1000 !== 0);
      if (c.key === 'name') return r.name;
      if (c.key === 'category') return r.category;
      if (c.key === 'brand') return r.brand;
      if (c.key === 'supplier') return r.supplier;
      return c.get(r);
    })));
  }, [rows, defs]);
  useReportKeys({ move: (by) => setSel((s) => Math.max(0, Math.min(rowCount - 1, s + by))), enter: () => undefined, fetch: () => setTick((t) => t + 1), save });

  const toggle = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: STOCK_COLS.find((c) => c.key === key)?.right ? -1 : 1 }));
  let rowNo = -1;
  return (
    <Frame
      icon={<Package size={18} />} title="Stock" subtitle={data ? `${rows.length} of ${data.totals.items} items` : ' '}
      controls={
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Name, barcode, brand or supplier" inputRef={boxRef} />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">Group by
            <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setClosed(new Set()); }} className={selectCls} aria-label="Group by">
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">{QUICK.map((q) => <button key={q.id} onClick={() => setFilter(q.id)} className={chip(filter === q.id)} tabIndex={-1}>{q.label}</button>)}</div>
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
          <Total label="Items">{rows.length}</Total>
          {canCost && <Total label="Cost total">{formatRupees(totals.cost, { decimals: false })}</Total>}
          {canCost && <Total label="Profit total" tone="success">{formatRupees(totals.profit, { decimals: false })}</Total>}
          <span className="flex-1" />
          <Total label="Sales total" tone="primary">{formatRupees(totals.sales, { decimals: false })}</Total>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto" ref={rc.rootProps.ref} onMouseOver={rc.rootProps.onMouseOver} style={rc.rootProps.style}>
        <div style={{ minWidth: Math.max(canCost ? 1500 : 1000, rc.customised ? rc.minTotal + 24 : 0) }}>
          <div onContextMenu={rc.headerProps.onContextMenu} className="sticky top-0 z-10 grid h-9 items-center border-b border-line-strong bg-surface-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: ROW_COLS }}>
            {defs.map((c, ci) => (
              <div key={c.key} className="relative flex h-full min-w-0 items-center overflow-hidden">
                <button
                  onClick={() => onSort(c.key)} tabIndex={-1} title={`Sort by ${c.label}`}
                  className={cn('flex h-full min-w-0 flex-1 items-center gap-1 truncate px-2 pr-3 uppercase hover:text-ink', c.right && 'justify-end', sort.key === c.key && 'text-primary')}
                >
                  <span className="truncate">{c.label}</span>{sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
                <ColResizer rc={rc} index={ci} />
              </div>
            ))}
          </div>
          {!loading && rows.length === 0 && <EmptyState icon={<Package size={22} />} title={query ? `No item matches "${query}"` : 'No items'} className="py-16" />}
          {lines.map((l) => {
            if (l.kind === 'group') {
              const open = !closed.has(l.g.key);
              return (
                <button key={`g-${l.g.key}`} onClick={() => toggle(l.g.key)} tabIndex={-1} className="flex h-10 w-full items-center gap-3 border-b border-line bg-surface-3 px-3 text-left text-sm font-semibold text-ink hover:bg-surface-2">
                  <ChevronRight size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
                  <span className="truncate">{l.g.label}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">{l.g.count} items</span>
                  <span className="flex-1" />
                  <span className="num shrink-0 text-xs font-medium text-muted">Qty {formatQty(l.g.qty, l.g.qty % 1000 !== 0)}</span>
                  {canCost && <span className="num shrink-0 text-xs font-medium text-muted">Cost {formatRupees(l.g.cost, { decimals: false })}</span>}
                  {canCost && <span className={cn('num shrink-0 text-xs font-medium', l.g.profit < 0 ? 'text-danger' : 'text-success')}>Profit {formatRupees(l.g.profit, { decimals: false })}</span>}
                  <span className="num shrink-0 text-xs font-semibold text-primary">Sales {formatRupees(l.g.sales, { decimals: false })}</span>
                </button>
              );
            }
            rowNo += 1;
            const my = rowNo;
            return <StockLine key={l.r.id} r={l.r} cols={cols} canCost={canCost} on={my === sel} onSelect={() => setSel(my)} />;
          })}
        </div>
        </div>
        {rc.menu}
    </Frame>
  );
}

function StockLine({ r, canCost, on, onSelect }: { r: StockRow; cols?: string; canCost: boolean; on: boolean; onSelect: () => void }) {
  const loose = r.qty % 1000 !== 0 || r.unit === 'kg' || r.unit === 'l';
  const out = r.qty <= 0;
  return (
    <div onMouseDown={onSelect} className={cn('grid h-10 items-center border-b border-line/70 px-3 text-sm', on && 'bg-primary-soft/60')} style={{ gridTemplateColumns: ROW_COLS }}>
      <span className="num truncate px-2 text-xs text-muted">{r.barcode}</span>
      <span className="truncate px-2 font-medium text-ink" title={r.name}>{r.name}</span>
      <span className="truncate px-2 text-muted" title={r.category}>{r.category}</span>
      <span className="truncate px-2 text-muted" title={r.brand}>{r.brand}</span>
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
      <span className="truncate px-2 text-muted" title={r.supplier}>{r.supplier || '-'}</span>
    </div>
  );
}


/* ================================================================== */
/* Staff report                                                        */
/* ================================================================== */
export function StaffReportPage() {
  useScreenKeys('Staff report', [REPORT_KEYS[2], REPORT_KEYS[3], REPORT_KEYS[4]]);
  const toast = useToast();
  const cashier = useSession((s) => s.user?.role === 'cashier' || s.user?.role === 'staff');
  const [range, setRange] = useState<DateRange>(today);
  const [rows, setRows] = useState<StaffReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useRefreshOnFocus(() => setTick((t) => t + 1), { f5: false });

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
          <div key={r.staff} className="grid h-12 items-center border-b border-line/70 px-3 text-sm" style={{ gridTemplateColumns: ROW_COLS }}>
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
