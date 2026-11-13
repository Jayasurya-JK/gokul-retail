import { useCallback, useEffect, useMemo, useState } from 'react';
import { IndianRupee, MapPin, Pencil, Phone, Plus, Truck } from 'lucide-react';
import { fuzzyFilter, type SupplierLedger, type SupplierProfile, type SupplierSummary } from '@gokul/data';
import {
  Badge, Button, DataTable, EmptyState, FilterBar, Money, PageHeader, SearchInput, Select, TabPanel, Tabs, cn, type ColumnDef, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { PaymentDialog } from '../components/purchasing/PaymentDialog';
import { SupplierForm } from '../components/purchasing/SupplierForm';
import { fmtDate, fmtDateYear, SectionLabel, useKeys } from '../components/purchasing/common';

const columns: ColumnDef<SupplierSummary>[] = [
  {
    id: 'name', header: 'Supplier', accessorFn: (r) => r.profile.name, meta: { w: 'minmax(130px,1fr)' },
    cell: (c) => { const r = c.row.original; return <div className="leading-tight"><div className="truncate font-medium text-ink">{r.profile.name}</div><div className="truncate text-xs text-muted">{r.profile.city}</div></div>; },
  },
    { id: 'p30', header: '30 days', accessorFn: (r) => r.purchased30, meta: { w: '100px', align: 'right', num: true }, cell: (c) => <Money paise={c.row.original.purchased30} decimals={false} /> },
  {
    id: 'due', header: 'Balance due', accessorFn: (r) => r.due, meta: { w: '112px', align: 'right', num: true },
    cell: (c) => { const r = c.row.original; return r.due > 0 ? <span className={cn('font-semibold', r.overdue > 0 ? 'text-danger' : 'text-ink')}><Money paise={r.due} decimals={false} /></span> : <span className="text-subtle">Nil</span>; },
  },
  {
    id: 'status', header: '', enableSorting: false, meta: { w: '84px' },
    cell: (c) => { const r = c.row.original; return r.overdue > 0 ? <Badge tone="danger">Overdue</Badge> : r.due > 0 ? <Badge tone="warning">Due</Badge> : <Badge tone="success">Settled</Badge>; },
  },
];

const ageBuckets: { key: 'current' | 'd31' | 'd61' | 'd90'; label: string; cls: string }[] = [
  { key: 'current', label: '0-30 days', cls: 'bg-success' },
  { key: 'd31', label: '31-60', cls: 'bg-info' },
  { key: 'd61', label: '61-90', cls: 'bg-warning' },
  { key: 'd90', label: '90+', cls: 'bg-danger' },
];

function Ageing({ s }: { s: SupplierSummary }) {
  const total = s.ageing.current + s.ageing.d31 + s.ageing.d61 + s.ageing.d90;
  return (
    <div>
      <SectionLabel>Ageing of dues</SectionLabel>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
        {total > 0 && ageBuckets.map((b) => s.ageing[b.key] > 0 && <div key={b.key} className={b.cls} style={{ width: `${(s.ageing[b.key] / total) * 100}%` }} />)}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {ageBuckets.map((b) => (
          <div key={b.key} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className={cn('h-2 w-2 rounded-full', b.cls)} />{b.label}</div>
            <div className="num text-sm font-semibold text-ink"><Money paise={s.ageing[b.key]} decimals={false} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ ledger, onPay, onEdit }: { ledger: SupplierLedger; onPay: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState('ledger');
  const s = ledger.summary;
  const p = s.profile;
  const entries = useMemo(() => [...ledger.entries].reverse(), [ledger.entries]);
  const ledgerCols: ColumnDef<(typeof entries)[number]>[] = useMemo(() => [
    { id: 'date', header: 'Date', accessorFn: (r) => r.date, meta: { w: '72px' }, cell: (c) => fmtDate(c.row.original.date) },
    {
      id: 'ref', header: 'Particulars', accessorFn: (r) => r.ref, meta: { w: 'minmax(120px,1fr)' },
      cell: (c) => { const r = c.row.original; return <div className="leading-tight"><div className="truncate font-medium text-ink">{r.kind === 'purchase' ? r.ref : r.note}</div><div className="truncate text-xs text-muted">{r.kind === 'purchase' ? r.note : r.ref}</div></div>; },
    },
    { id: 'debit', header: 'Bought', accessorFn: (r) => r.debit, meta: { w: '100px', align: 'right', num: true }, cell: (c) => (c.row.original.debit ? <Money paise={c.row.original.debit} symbol={false} /> : <span className="text-subtle">-</span>) },
    { id: 'credit', header: 'Paid', accessorFn: (r) => r.credit, meta: { w: '92px', align: 'right', num: true }, cell: (c) => (c.row.original.credit ? <span className="text-success"><Money paise={c.row.original.credit} symbol={false} /></span> : <span className="text-subtle">-</span>) },
    { id: 'bal', header: 'Balance', accessorFn: (r) => r.balance, meta: { w: '100px', align: 'right', num: true }, cell: (c) => <span className="font-semibold"><Money paise={c.row.original.balance} symbol={false} /></span> },
  ], []);
  const billCols: ColumnDef<(typeof ledger.openBills)[number]>[] = useMemo(() => [
    { id: 'no', header: 'Bill', accessorFn: (r) => r.number, meta: { w: 'minmax(110px,1fr)' }, cell: (c) => <div className="leading-tight"><div className="font-medium text-ink">{c.row.original.number}</div><div className="truncate text-xs text-muted">Inv {c.row.original.invoiceNo}</div></div> },
    { id: 'due', header: 'Due on', accessorFn: (r) => r.dueDate, meta: { w: '96px' }, cell: (c) => <span className={c.row.original.overdue ? 'font-medium text-danger' : ''}>{fmtDate(c.row.original.dueDate)}</span> },
    { id: 'age', header: 'Age', accessorFn: (r) => r.ageDays, meta: { w: '60px', align: 'right', num: true }, cell: (c) => `${c.row.original.ageDays} d` },
    { id: 'tot', header: 'Bill', accessorFn: (r) => r.total, meta: { w: '92px', align: 'right', num: true }, cell: (c) => <Money paise={c.row.original.total} symbol={false} /> },
    { id: 'bdue', header: 'Due', accessorFn: (r) => r.due, meta: { w: '96px', align: 'right', num: true }, cell: (c) => <span className="font-semibold"><Money paise={c.row.original.due} symbol={false} /></span> },
  ], []);

  return (
    <div className="flex h-full w-[600px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-md font-semibold leading-tight text-ink">{p.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1"><Phone size={12} />{p.phone}{p.contact ? ` (${p.contact})` : ''}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={12} />{p.address || p.city}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="num selectable rounded-md bg-surface-3 px-1.5 py-0.5 font-medium text-ink">{p.gstin || 'No GSTIN'}</span>
              <span className="text-muted">Credit {p.creditDays} days</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Edit</Button>
            <Button size="sm" variant="primary" icon={<IndianRupee size={14} />} kbd="F4" onClick={onPay} disabled={s.due <= 0}>Pay</Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">Balance due</div>
            <div className={cn('num text-lg font-semibold', s.due > 0 ? 'text-ink' : 'text-success')}>{s.due > 0 ? <Money paise={s.due} decimals={false} /> : 'Nil'}</div>
          </div>
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">Overdue</div>
            <div className={cn('num text-lg font-semibold', s.overdue > 0 ? 'text-danger' : 'text-ink')}>{s.overdue > 0 ? <Money paise={s.overdue} decimals={false} /> : 'Nil'}</div>
          </div>
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">Bought, 30 days</div>
            <div className="num text-lg font-semibold text-ink"><Money paise={s.purchased30} decimals={false} /></div>
          </div>
        </div>
        <div className="mt-3"><Ageing s={s} /></div>
      </div>
      <Tabs
        value={tab} onValueChange={setTab} className="min-h-0 flex-1"
        tabs={[{ value: 'ledger', label: 'Ledger', count: entries.length }, { value: 'bills', label: 'Open bills', count: ledger.openBills.length }]}
      >
        <TabPanel value="ledger" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <DataTable data={entries} columns={ledgerCols} getRowId={(r) => r.id} rowHeight={40} empty={<EmptyState title="No entries yet" hint="Purchases and payments appear here." />}
            footer={<><span>Last payment {s.lastPaymentOn ? fmtDateYear(s.lastPaymentOn) : 'never'}</span><span>Bought in total <Money paise={s.totalPurchased} decimals={false} /></span></>} />
        </TabPanel>
        <TabPanel value="bills" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <DataTable data={ledger.openBills} columns={billCols} getRowId={(r) => r.grnId} rowHeight={40} empty={<EmptyState title="All bills paid" hint="Nothing is pending for this supplier." />} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

export function Suppliers() {
  const [rows, setRows] = useState<SupplierSummary[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierProfile | null>(null);

  const reload = useCallback(async (keep?: string) => {
    const list = await api.listSupplierSummaries();
    setRows(list);
    setSelId((cur) => keep ?? cur ?? list.slice().sort((a, b) => b.due - a.due)[0]?.profile.id ?? null);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useRefreshOnFocus(() => { void reload(); });
  useEffect(() => {
    if (!selId) return;
    let live = true;
    api.getSupplierLedger(selId).then((l) => { if (live) setLedger(l); });
    return () => { live = false; };
  }, [selId, rows]);

  const shown = useMemo(() => {
    const base = rows.filter((r) => filter === 'all' || (filter === 'due' && r.due > 0) || (filter === 'overdue' && r.overdue > 0));
    return fuzzyFilter(base, q, (r) => [r.profile.name, r.profile.city, r.profile.phone, r.profile.gstin], Infinity);
  }, [rows, q, filter]);
  const totalDue = rows.reduce((a, r) => a + r.due, 0);
  const openNew = () => { setEditing(null); setFormOpen(true); };

  useKeys((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openNew(); }
    else if (e.key === 'F4' && ledger && ledger.summary.due > 0) { e.preventDefault(); setPayOpen(true); }
  });

  return (
    <>
      <PageHeader
        title="Suppliers" icon={<Truck size={17} />}
        subtitle={<>{rows.length} suppliers, <Money paise={totalDue} decimals={false} /> to pay</>}
        actions={<Button variant="primary" icon={<Plus size={15} />} kbd="Ctrl+N" onClick={openNew}>New supplier</Button>}
      />
      <FilterBar trailing={<span>{shown.length} shown</span>}>
        <div className="w-72"><SearchInput placeholder="Search name, city, phone or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: 'all', label: 'All suppliers' }, { value: 'due', label: 'With balance due' }, { value: 'overdue', label: 'Overdue only' }]} />
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={shown} columns={columns} getRowId={(r) => r.profile.id} selectedId={selId} onSelect={(r) => setSelId(r.profile.id)} rowHeight={44}
          empty={<EmptyState icon={<Truck size={22} />} title="No suppliers match" hint="Clear the search or the balance filter." />}
        />
        {ledger && <Detail ledger={ledger} onPay={() => setPayOpen(true)} onEdit={() => { setEditing(ledger.summary.profile); setFormOpen(true); }} />}
      </div>
      <PaymentDialog summary={ledger?.summary ?? null} open={payOpen} onClose={() => setPayOpen(false)} onDone={() => void reload(selId ?? undefined)} />
      <SupplierForm open={formOpen} supplier={editing} onClose={() => setFormOpen(false)} onSaved={(s) => void reload(s.id)} />
    </>
  );
}
