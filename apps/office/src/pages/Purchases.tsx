import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, FileText, Plus, ShoppingCart } from 'lucide-react';
import { fuzzyFilter, type Grn, type SupplierSummary } from '@gokul/data';
import {
  Badge, Button, DataTable, EmptyState, FilterBar, Money, PageHeader, SearchInput, Select, StatTile, cn, type ColumnDef,
} from '@gokul/ui';
import { api } from '../store';
import { PurchaseEntry } from '../components/purchasing/PurchaseEntry';
import { PaymentDialog } from '../components/purchasing/PaymentDialog';
import { fmtDate, fmtDateYear, fmtMilli, KV, PayBadge, SectionLabel, useKeys } from '../components/purchasing/common';

const columns: ColumnDef<Grn>[] = [
  {
    id: 'date', header: 'Date', accessorFn: (r) => r.date, meta: { w: '88px' },
    cell: (c) => <div className="leading-tight"><div className="font-medium text-ink">{fmtDate(c.row.original.date)}</div><div className="num text-xs text-muted">{c.row.original.number}</div></div>,
  },
  {
    id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplierName, meta: { w: 'minmax(140px,1fr)' },
    cell: (c) => <div className="leading-tight"><div className="truncate font-medium text-ink">{c.row.original.supplierName}</div><div className="truncate text-xs text-muted">{c.row.original.lines.map((l) => l.name.replace(/\s*\(.*?\)/g, '')).join(', ')}</div></div>,
  },
  { id: 'inv', header: 'Invoice', accessorFn: (r) => r.invoiceNo, meta: { w: '88px', num: true } },
  { id: 'gst', header: 'GST', accessorFn: (r) => r.totals.gst, meta: { w: '88px', align: 'right', num: true }, cell: (c) => (c.row.original.totals.gst ? <Money paise={c.row.original.totals.gst} symbol={false} decimals={false} /> : <span className="text-subtle">Nil</span>) },
  { id: 'total', header: 'Amount', accessorFn: (r) => r.total, meta: { w: '112px', align: 'right', num: true }, cell: (c) => <span className="font-semibold text-ink"><Money paise={c.row.original.total} decimals={false} /></span> },
  { id: 'status', header: 'Payment', accessorFn: (r) => r.status, meta: { w: '96px' }, cell: (c) => <PayBadge status={c.row.original.status} /> },
];

function Detail({ g, onPay, payable }: { g: Grn; onPay: () => void; payable: boolean }) {
  const t = g.totals;
  const due = g.total - g.paid;
  return (
    <div className="flex h-full w-[370px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-md font-semibold leading-tight text-ink">{g.number}<PayBadge status={g.status} /></div>
            <div className="mt-0.5 truncate text-sm text-muted">{g.supplierName}</div>
          </div>
          {due > 0 && payable && <Button size="sm" variant="primary" icon={<Banknote size={14} />} onClick={onPay}>Pay</Button>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-muted">Invoice</div><div className="num mt-0.5 truncate text-sm font-medium text-ink">{g.invoiceNo}</div></div>
          <div><div className="text-muted">Invoice date</div><div className="mt-0.5 text-sm font-medium text-ink">{fmtDateYear(g.invoiceDate)}</div></div>
          <div><div className="text-muted">Due date</div><div className={cn('mt-0.5 text-sm font-medium', due > 0 && g.dueDate < new Date().toISOString().slice(0, 10) ? 'text-danger' : 'text-ink')}>{fmtDateYear(g.dueDate)}</div></div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <SectionLabel right={<span className="font-normal normal-case tracking-normal">{g.lines.length} items</span>}>Items received</SectionLabel>
        <div className="overflow-hidden rounded-card border border-line">
          {g.lines.map((l, i) => (
            <div key={l.itemId} className={cn('flex items-start justify-between gap-3 px-3 py-2 text-sm', i > 0 && 'border-t border-line/70')}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="truncate font-medium text-ink">{l.name}</span>{l.kind === 'seed' && <Badge tone="warning">Seed</Badge>}</div>
                <div className="num mt-0.5 text-xs text-muted">{fmtMilli(l.qty, 3)} {l.unit} at <Money paise={l.rate} />{l.discountPct > 0 ? `, less ${l.discountPct}%` : ''}, GST {l.gstRate}%</div>
              </div>
              <Money paise={l.amount} className="shrink-0 font-semibold text-ink" />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <SectionLabel>Totals</SectionLabel>
          <div className="divide-y divide-line/70">
            <KV k="Taxable value"><Money paise={t.taxable} /></KV>
            {t.igst > 0 ? <KV k="IGST"><Money paise={t.igst} /></KV> : <><KV k="CGST"><Money paise={t.cgst} /></KV><KV k="SGST"><Money paise={t.sgst} /></KV></>}
            {t.freight > 0 && <KV k="Freight"><Money paise={t.freight} /></KV>}
            {t.otherCharges > 0 && <KV k="Other charges"><Money paise={t.otherCharges} /></KV>}
            {t.roundOff !== 0 && <KV k="Round off"><Money paise={t.roundOff} sign /></KV>}
            <KV k="Bill total" strong><Money paise={g.total} /></KV>
            <KV k={g.paidAtEntry > 0 ? `Paid (${g.payMode ?? ''})` : 'Paid'}><span className="text-success"><Money paise={g.paid} /></span></KV>
            <KV k="Balance" strong><span className={due > 0 ? 'text-danger' : 'text-success'}><Money paise={due} /></span></KV>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {g.costUpdated && <Badge tone="primary">Cost price updated</Badge>}
          <Badge>{g.interstate ? 'Other state: IGST' : 'Tamil Nadu: CGST + SGST'}</Badge>
        </div>
      </div>
    </div>
  );
}

export function Purchases() {
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [grns, setGrns] = useState<Grn[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [q, setQ] = useState('');
  const [sup, setSup] = useState('all');
  const [status, setStatus] = useState('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async (select?: string) => {
    const [g, s] = await Promise.all([api.listGrns(), api.listSupplierSummaries()]);
    setGrns(g); setSuppliers(s);
    setSelId((cur) => select ?? cur ?? g[0]?.id ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const base = grns.filter((g) => (sup === 'all' || g.supplierId === sup) && (status === 'all' || g.status === status));
    return fuzzyFilter(base, q, (g) => [g.number, g.invoiceNo, g.supplierName, ...g.lines.map((l) => l.name)], Infinity);
  }, [grns, q, sup, status]);
  const sel = grns.find((g) => g.id === selId) ?? null;
  const paySummary = suppliers.find((s) => s.profile.id === sel?.supplierId) ?? null;

  const stats = useMemo(() => {
    const monthStart = new Date(Date.now() - 30 * 86400000);
    const month = grns.filter((g) => new Date(g.date) >= monthStart);
    const sum = (xs: Grn[], f: (g: Grn) => number) => xs.reduce((a, g) => a + f(g), 0);
    return {
      monthTotal: sum(month, (g) => g.total), monthBills: month.length, monthGst: sum(month, (g) => g.totals.gst),
      due: sum(grns, (g) => g.total - g.paid), unpaid: grns.filter((g) => g.total > g.paid).length,
      overdue: sum(grns.filter((g) => g.dueDate < new Date().toISOString().slice(0, 10)), (g) => g.total - g.paid),
    };
  }, [grns]);
  const seedMonthKg = useMemo(() => {
    const monthStart = new Date(Date.now() - 30 * 86400000);
    return grns.filter((g) => new Date(g.date) >= monthStart).flatMap((g) => g.lines).filter((l) => l.kind === 'seed').reduce((a, l) => a + l.qty, 0);
  }, [grns]);

  useKeys((e) => {
    if (mode !== 'list') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setMode('new'); }
  });

  if (mode === 'new') {
    return <PurchaseEntry suppliers={suppliers} onCancel={() => setMode('list')} onSaved={(g) => { setMode('list'); void load(g.id); }} />;
  }

  return (
    <>
      <PageHeader
        title="Purchases" icon={<ShoppingCart size={17} />} subtitle={`${grns.length} purchase entries, newest first`}
        actions={<Button variant="primary" icon={<Plus size={15} />} kbd="Ctrl+N" onClick={() => setMode('new')}>New purchase</Button>}
      />
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-line bg-bg px-4 py-2.5">
        <StatTile label="Bought, 30 days" value={<Money paise={stats.monthTotal} decimals={false} />} hint={`${stats.monthBills} bills`} icon={<ShoppingCart size={14} />} />
        <StatTile label="Seed received, 30 days" value={<>{fmtMilli(seedMonthKg, 0)} <span className="text-sm font-normal text-muted">kg</span></>} hint="Groundnut, sesame, copra" icon={<FileText size={14} />} />
        <StatTile label="Input GST, 30 days" value={<Money paise={stats.monthGst} decimals={false} />} hint="Claim in GSTR-3B" icon={<FileText size={14} />} />
        <StatTile label="Owed to suppliers" value={<Money paise={stats.due} decimals={false} />} hint={<>{stats.unpaid} unpaid bills, <span className="font-semibold text-danger"><Money paise={stats.overdue} decimals={false} /></span> overdue</>} icon={<Banknote size={14} />} />
      </div>
      <FilterBar trailing={<span>{rows.length} shown{grns.length >= 1000 ? ' · latest 1,000 purchases (use Reports for older ones)' : ''}</span>}>
        <div className="w-72"><SearchInput placeholder="Search entry, invoice, supplier or item" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={sup} onChange={(e) => setSup(e.target.value)} options={[{ value: 'all', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.profile.id, label: s.profile.name }))]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'all', label: 'Any payment status' }, { value: 'due', label: 'Unpaid' }, { value: 'partial', label: 'Part paid' }, { value: 'paid', label: 'Paid' }]} />
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)} rowHeight={44} autoFocus
          empty={<EmptyState icon={<ShoppingCart size={22} />} title="No purchases match" hint="Clear the search or the filters, or press Ctrl+N to enter a new purchase." />}
        />
        {sel && <Detail g={sel} payable={!!paySummary} onPay={() => setPayOpen(true)} />}
      </div>
      <PaymentDialog summary={paySummary} open={payOpen} onClose={() => setPayOpen(false)} onDone={() => void load(selId ?? undefined)} />
    </>
  );
}
