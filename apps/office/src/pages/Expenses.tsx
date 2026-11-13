import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, IndianRupee, Pencil, Plus, ReceiptIndianRupee, Settings2, Wallet } from 'lucide-react';
import { PAID_FROM_LABEL, type Expense, type ExpenseCategory, type ExpenseList, type ExpensePaidFrom, type ExpenseQuery } from '@gokul/data';
import {
  Badge, Button, DataTable, DateRangePicker, EmptyState, FilterBar, Money, PageHeader, SearchInput, Select, StatTile, dateRangePresets, cn,
  type ColumnDef, type DateRange, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { CategoriesDialog, EditExpenseDialog, NewExpenseDialog, VoidExpenseDialog } from '../components/money/ExpenseDialogs';
import { fmtShort, fmtTime } from '../components/crm/common';

type Status = 'active' | 'void' | 'all';

export function Expenses() {
  const [range, setRange] = useState<DateRange>(() => dateRangePresets[3].get());
  const [catId, setCatId] = useState('all');
  const [from, setFrom] = useState<ExpensePaidFrom | 'all'>('all');
  const [by, setBy] = useState('all');
  const [status, setStatus] = useState<Status>('active');
  const [q, setQ] = useState('');
  const [data, setData] = useState<ExpenseList | null>(null);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [dlg, setDlg] = useState<'new' | 'cats' | null>(null);
  const [edit, setEdit] = useState<Expense | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);

  const query = useMemo<ExpenseQuery>(() => ({ from: range.from, to: range.to, categoryId: catId, paidFrom: from, by, status, query: q }), [range, catId, from, by, status, q]);
  const reload = useCallback(() => {
    void api.listExpenses(query).then(setData);
    void api.listExpenseCategories().then(setCats);
  }, [query]);
  useEffect(() => { reload(); }, [reload]);
  useRefreshOnFocus(reload);
  useEffect(() => { void api.listUsers().then((u) => setUsers(u.map((x) => x.name))); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (dlg || edit || voiding) return;
      if (e.key === 'F2' || (e.ctrlKey && e.key.toLowerCase() === 'n')) { e.preventDefault(); setDlg('new'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dlg, edit, voiding]);

  const rows = data?.rows ?? [];
  const sel = rows.find((r) => r.id === selId) ?? null;
  const maxCat = Math.max(1, ...(data?.byCategory.map((c) => c.amount) ?? [1]));

  const columns = useMemo<ColumnDef<Expense>[]>(() => [
    { id: 'date', header: 'Date', meta: { w: '128px' }, accessorFn: (r) => r.at, cell: (c) => { const r = c.row.original; return <span className={cn('num text-muted', r.status === 'void' && 'line-through')}>{fmtShort(r.at)} {fmtTime(r.at)}</span>; } },
    { id: 'cat', header: 'Category', meta: { w: 'minmax(110px,1fr)' }, accessorFn: (r) => r.category, cell: (c) => <span className={cn('font-medium text-ink', c.row.original.status === 'void' && 'text-subtle line-through')}>{c.getValue<string>()}</span> },
    {
      id: 'to', header: 'Paid to / note', meta: { w: 'minmax(150px,1.5fr)' }, accessorFn: (r) => r.paidTo,
      cell: (c) => {
        const r = c.row.original;
        return <span className="min-w-0 truncate"><span className="text-ink">{r.paidTo || '-'}</span>{(r.note || r.status === 'void') && <span className="ml-1.5 text-xs text-subtle">{r.status === 'void' ? `Void: ${r.voidReason}` : r.note}</span>}</span>;
      },
    },
    { id: 'from', header: 'Paid from', meta: { w: '112px' }, accessorFn: (r) => r.paidFrom, cell: (c) => <Badge tone={c.getValue<string>() === 'cash' ? 'warning' : 'info'}>{PAID_FROM_LABEL[c.getValue<ExpensePaidFrom>()]}</Badge> },
    { id: 'by', header: 'By', meta: { w: '100px' }, accessorFn: (r) => r.by, cell: (c) => <span className="truncate text-muted">{c.getValue<string>()}{c.row.original.approvedBy ? ` (ok ${c.row.original.approvedBy.split(' ')[0]})` : ''}</span> },
    { id: 'amt', header: 'Amount', meta: { w: '112px', align: 'right', num: true }, accessorFn: (r) => r.amount, cell: (c) => <span className={cn('font-semibold', c.row.original.status === 'void' ? 'text-subtle line-through' : 'text-ink')}><Money paise={c.getValue<number>()} decimals={false} /></span> },
  ], []);

  return (
    <>
      <PageHeader
        title="Expenses" icon={<Wallet size={17} />}
        subtitle={data ? `${data.count} expenses, ${data.voidedCount} void in this period` : 'Loading'}
        actions={<><Button icon={<Settings2 size={15} />} onClick={() => setDlg('cats')}>Categories</Button><Button variant="primary" icon={<Plus size={15} />} kbd="F2" onClick={() => setDlg('new')}>New expense</Button></>}
      />
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-line bg-surface px-5 py-3">
        <StatTile label="Total expenses" icon={<ReceiptIndianRupee size={14} />} value={<Money paise={data?.total ?? 0} decimals={false} />} hint={`${data?.count ?? 0} entries`} />
        <StatTile label="Cash drawer" icon={<IndianRupee size={14} />} value={<Money paise={data?.byMode.cash ?? 0} decimals={false} />} hint="Taken off the day-close cash" />
        <StatTile label="UPI" value={<Money paise={data?.byMode.upi ?? 0} decimals={false} />} hint="Paid by UPI" />
        <StatTile label="Bank" value={<Money paise={data?.byMode.bank ?? 0} decimals={false} />} hint="Cheque or transfer" />
      </div>
      <FilterBar trailing={<span>{rows.length} shown</span>}>
        <DateRangePicker value={range} onChange={setRange} />
        <div className="w-44"><Select value={catId} onChange={(e) => setCatId(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <div className="w-36"><Select value={from} onChange={(e) => setFrom(e.target.value as ExpensePaidFrom | 'all')} options={[{ value: 'all', label: 'Any payment' }, ...(['cash', 'upi', 'bank'] as const).map((m) => ({ value: m, label: PAID_FROM_LABEL[m] }))]} /></div>
        <div className="w-36"><Select value={by} onChange={(e) => setBy(e.target.value)} options={[{ value: 'all', label: 'Anyone' }, ...users.map((u) => ({ value: u, label: u }))]} /></div>
        <div className="w-32"><Select value={status} onChange={(e) => setStatus(e.target.value as Status)} options={[{ value: 'active', label: 'Active' }, { value: 'void', label: 'Void only' }, { value: 'all', label: 'All' }]} /></div>
        <div className="w-60"><SearchInput placeholder="Search paid to, note or number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)} onActivate={(r) => r.status === 'active' && setEdit(r)}
          empty={<EmptyState icon={<Wallet size={20} />} title="No expenses in this view" hint="Change the dates or filters, or add an expense." />}
          footer={<><span>{rows.length} expenses</span><span>Enter edits, F2 adds</span></>}
        />
        <aside className="flex w-[290px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex h-10 shrink-0 items-center border-b border-line bg-surface-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted">By category</div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {data && data.byCategory.length > 0 ? data.byCategory.map((c) => (
              <button key={c.categoryId} type="button" onClick={() => setCatId(catId === c.categoryId ? 'all' : c.categoryId)} className="mb-3 block w-full text-left">
                <div className="flex items-center justify-between text-sm"><span className={cn('font-medium', catId === c.categoryId ? 'text-primary' : 'text-ink')}>{c.category}</span><span className="num font-semibold text-ink"><Money paise={c.amount} decimals={false} /></span></div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (c.amount / maxCat) * 100)}%` }} /></div>
                <div className="mt-0.5 text-xs text-subtle">{c.count} {c.count === 1 ? 'entry' : 'entries'} - {data.total ? Math.round((c.amount / data.total) * 100) : 0}%</div>
              </button>
            )) : <div className="text-sm text-muted">Nothing to total yet.</div>}
          </div>
          {sel && (
            <div className="shrink-0 border-t border-line p-4">
              <div className="text-sm font-semibold text-ink">{sel.number}</div>
              <div className="mt-0.5 text-xs text-muted">{sel.category} - <Money paise={sel.amount} decimals={false} /> - {PAID_FROM_LABEL[sel.paidFrom]}</div>
              {sel.status === 'active' ? (
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1" icon={<Pencil size={13} />} onClick={() => setEdit(sel)}>Edit</Button>
                  <Button className="flex-1" variant="danger" icon={<Ban size={13} />} onClick={() => setVoiding(sel)}>Void</Button>
                </div>
              ) : <div className="mt-2 text-xs text-muted">Voided by {sel.voidedBy}: {sel.voidReason}</div>}
            </div>
          )}
        </aside>
      </div>
      <NewExpenseDialog open={dlg === 'new'} cats={cats.filter((c) => c.active)} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload(); }} />
      <CategoriesDialog open={dlg === 'cats'} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload(); }} />
      <EditExpenseDialog expense={edit} cats={cats.filter((c) => c.active)} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />
      <VoidExpenseDialog expense={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); reload(); }} />
    </>
  );
}
