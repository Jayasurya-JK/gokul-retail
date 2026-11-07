import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, MessageCircle, Printer, Wallet } from 'lucide-react';
import { formatRupees, fuzzyFilter, type AgeingKey, type CustStatement, type ReceivableRow, type Settings } from '@gokul/data';
import { Badge, Button, DataTable, EmptyState, FilterBar, Money, PageHeader, SearchInput, useToast, type ColumnDef } from '@gokul/ui';
import { api } from '../store';
import { RecordPaymentDialog, ReminderDialog } from '../components/crm/CollectionDialogs';
import { ago, DetailPane, fmtShort, SectionLabel, SplitBar } from '../components/crm/common';

const BUCKETS: { key: AgeingKey; label: string; bar: string; text: string }[] = [
  { key: 'd0_30', label: '0 to 30 days', bar: 'bg-success', text: 'text-success' },
  { key: 'd31_60', label: '31 to 60 days', bar: 'bg-accent', text: 'text-warning' },
  { key: 'd61_90', label: '61 to 90 days', bar: 'bg-warning', text: 'text-warning' },
  { key: 'd90p', label: 'Over 90 days', bar: 'bg-danger', text: 'text-danger' },
];

const bucketCell = (key: AgeingKey) => (c: { row: { original: ReceivableRow } }) => {
  const v = c.row.original.buckets[key];
  return v > 0 ? <Money paise={v} decimals={false} className={key === 'd90p' ? 'font-semibold text-danger' : ''} /> : <span className="text-line-strong">-</span>;
};

const columns: ColumnDef<ReceivableRow>[] = [
  {
    id: 'name', header: 'Customer', meta: { w: 'minmax(140px,1fr)' }, accessorFn: (r) => r.name,
    cell: (c) => {
      const r = c.row.original;
      return <span className="min-w-0"><span className="font-medium text-ink">{r.name}</span><span className="ml-1.5 text-xs text-subtle">{r.business ?? r.area}</span></span>;
    },
  },
  { id: 'total', header: 'Total due', meta: { w: '100px', align: 'right', num: true }, accessorFn: (r) => r.total, cell: (c) => <span className="font-semibold text-ink"><Money paise={c.getValue<number>()} decimals={false} /></span> },
  { id: 'b1', header: '0-30', meta: { w: '78px', align: 'right', num: true }, accessorFn: (r) => r.buckets.d0_30, cell: bucketCell('d0_30') },
  { id: 'b2', header: '31-60', meta: { w: '78px', align: 'right', num: true }, accessorFn: (r) => r.buckets.d31_60, cell: bucketCell('d31_60') },
  { id: 'b3', header: '61-90', meta: { w: '78px', align: 'right', num: true }, accessorFn: (r) => r.buckets.d61_90, cell: bucketCell('d61_90') },
  { id: 'b4', header: '90+', meta: { w: '82px', align: 'right', num: true }, accessorFn: (r) => r.buckets.d90p, cell: bucketCell('d90p') },
];

function Statement({ row, st, onPay, onRemind }: { row: ReceivableRow; st: CustStatement; onPay: () => void; onRemind: () => void }) {
  const toast = useToast();
  const entries = [...st.entries].reverse();
  const over = row.creditLimit > 0 && row.total > row.creditLimit;
  return (
    <DetailPane width={410}>
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-md font-semibold leading-tight text-ink">{row.name}</div>
            <div className="mt-0.5 truncate text-xs text-muted num">{row.business ? `${row.business} · ` : ''}{row.phone} · {row.area}</div>
          </div>
          <Button size="sm" icon={<Printer size={13} />} onClick={() => toast.show({ tone: 'info', title: 'Statement sent to printer', detail: `${row.name}, ${entries.length} entries.` })}>Print</Button>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-muted">Balance due</div>
            <div className="text-2xl font-semibold num text-ink"><Money paise={st.balance} /></div>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Limit <b className="text-ink num">{row.creditLimit < 0 ? 'No limit' : row.creditLimit === 0 ? 'Not allowed' : <Money paise={row.creditLimit} decimals={false} />}</b></div>
            {over && <Badge tone="danger" className="mt-1">Over limit</Badge>}
          </div>
        </div>
        <div className="mt-3"><SplitBar parts={BUCKETS.map((b) => ({ value: st.buckets[b.key], className: b.bar, label: b.label }))} /></div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] text-muted">
          {BUCKETS.map((b) => (
            <div key={b.key}>
              <div className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${b.bar}`} />{b.label.replace(' days', '').replace('Over ', '').replace(' to ', '-') + (b.key === 'd90p' ? '+' : '')}</div>
              <div className="font-semibold text-ink num"><Money paise={st.buckets[b.key]} decimals={false} /></div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" icon={<Banknote size={15} />} kbd="F2" onClick={onPay} className="flex-1">Record payment</Button>
          <Button icon={<MessageCircle size={15} />} onClick={onRemind} className="flex-1">Remind</Button>
        </div>
        <div className="mt-2 text-xs text-subtle">
          {row.lastReminderAt ? `Last reminder ${ago(row.lastReminderAt).toLowerCase()}.` : 'No reminder sent yet.'}
          {row.lastPaymentAt && ` Last payment ${ago(row.lastPaymentAt).toLowerCase()}.`}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-[1] border-b border-line bg-surface-2 px-4 py-1.5"><SectionLabel>Statement of account</SectionLabel></div>
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-line/70 px-4 py-2 text-sm">
            <div className="w-12 shrink-0 text-xs text-muted">{fmtShort(e.date)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{e.ref}</div>
              <div className="truncate text-xs text-muted">{e.kind === 'bill' ? 'Sale on credit' : e.note}</div>
            </div>
            <div className="shrink-0 text-right num">
              {e.kind === 'bill'
                ? <div className="font-medium text-ink">+<Money paise={e.debit} symbol={false} /></div>
                : <div className="font-medium text-success">-<Money paise={e.credit} symbol={false} /></div>}
              <div className="text-xs text-subtle">Bal <Money paise={e.balance} symbol={false} decimals={false} /></div>
            </div>
          </div>
        ))}
      </div>
    </DetailPane>
  );
}

export function Collections() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<AgeingKey | null>(null);
  const [selId, setSelId] = useState<string | null>(params.get('c'));
  const [st, setSt] = useState<CustStatement | null>(null);
  const [shop, setShop] = useState<Settings | null>(null);
  const [pay, setPay] = useState(false);
  const [remind, setRemind] = useState(false);

  const reload = useCallback(async () => {
    const r = await api.listReceivables();
    setRows(r);
    setSelId((cur) => (cur && r.some((x) => x.customerId === cur) ? cur : r[0]?.customerId ?? null));
  }, []);
  useEffect(() => { void reload(); void api.getSettings().then(setShop); }, [reload]);
  useEffect(() => { if (params.get('c')) setParams({}, { replace: true }); }, [params, setParams]);
  useEffect(() => { if (selId) api.getStatement(selId).then(setSt); else setSt(null); }, [selId, rows]);

  const shown = useMemo(() => {
    const base = bucket ? rows.filter((r) => r.buckets[bucket] > 0) : rows;
    return fuzzyFilter(base, q, (r) => [r.name, r.phone.replace(' ', ''), r.business ?? '', r.area], 500);
  }, [rows, q, bucket]);

  const totals = useMemo(() => {
    const t = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    const n = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    for (const r of rows) for (const b of BUCKETS) { t[b.key] += r.buckets[b.key]; if (r.buckets[b.key] > 0) n[b.key] += 1; }
    return { t, n, all: t.d0_30 + t.d31_60 + t.d61_90 + t.d90p };
  }, [rows]);

  const sel = rows.find((r) => r.customerId === selId) ?? null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F2' && sel) { e.preventDefault(); setPay(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sel]);

  return (
    <>
      <PageHeader title="Credit and collections" subtitle={rows.length ? `${rows.length} customers owe ${formatRupees(totals.all, { decimals: false })}` : 'Nobody owes money'} icon={<Wallet size={17} />} />
      <div className="grid shrink-0 grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,1fr))] gap-3 border-b border-line bg-surface px-5 py-3">
        <button type="button" onClick={() => setBucket(null)} className={`rounded-card border px-4 py-2.5 text-left transition-colors ${bucket === null ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2'}`}>
          <div className="text-xs font-medium text-muted">Total outstanding</div>
          <div className="text-xl font-semibold text-ink num"><Money paise={totals.all} decimals={false} /></div>
          <div className="mt-1.5"><SplitBar height={6} parts={BUCKETS.map((b) => ({ value: totals.t[b.key], className: b.bar, label: b.label }))} /></div>
        </button>
        {BUCKETS.map((b) => (
          <button
            key={b.key} type="button" onClick={() => setBucket(bucket === b.key ? null : b.key)}
            className={`rounded-card border px-4 py-2.5 text-left transition-colors ${bucket === b.key ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2'}`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><span className={`h-2 w-2 rounded-full ${b.bar}`} />{b.label}</div>
            <div className="text-xl font-semibold text-ink num"><Money paise={totals.t[b.key]} decimals={false} /></div>
            <div className="mt-1 text-xs text-subtle">{totals.n[b.key]} customers · {totals.all ? Math.round((totals.t[b.key] / totals.all) * 100) : 0}%</div>
          </button>
        ))}
      </div>
      <FilterBar trailing={<span>{shown.length} shown{bucket ? ` · ${BUCKETS.find((b) => b.key === bucket)!.label}` : ''}</span>}>
        <div className="w-72"><SearchInput placeholder="Search customer, phone or area" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {bucket && <Button size="sm" variant="ghost" onClick={() => setBucket(null)}>Clear ageing filter</Button>}
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={shown} columns={columns} getRowId={(r) => r.customerId} selectedId={selId} onSelect={(r) => setSelId(r.customerId)}
          onActivate={() => setPay(true)}
          empty={<EmptyState icon={<Wallet size={20} />} title={rows.length ? 'No customers in this view' : 'Nobody owes money'} hint={rows.length ? 'Clear the ageing filter or search.' : 'Credit sales will show up here with their ageing.'} />}
          footer={<><span>{shown.length} customers</span><span>Enter or F2 records a payment</span></>}
        />
        {sel && st && st.customer.id === sel.customerId && <Statement key={sel.customerId} row={sel} st={st} onPay={() => setPay(true)} onRemind={() => setRemind(true)} />}
      </div>
      <RecordPaymentDialog
        row={sel} open={pay} onClose={() => setPay(false)}
        onSave={async (v) => {
          const next = await api.recordCollection({ customerId: sel!.customerId, amount: v.amount, mode: v.mode, ref: v.ref, note: v.note });
          setPay(false);
          setSt(next);
          await reload();
          const printed = await api.printDocument('receipt', `latest:${sel!.customerId}`, {}).catch(() => ({ ok: false, message: 'the printer could not be reached' }));
          if (!printed.ok) toast.show({ tone: 'warning', title: `Payment saved. Receipt not printed: ${printed.message}`, duration: 8000 });
          toast.show({ tone: 'success', title: `Received ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v.amount / 100)}`, detail: `${sel!.name} · ${v.mode === 'cash' ? 'Cash' : 'UPI'}. Receipt printed.` });
        }}
      />
      <ReminderDialog
        row={sel} shop={shop?.shopName ?? 'Gokul Oils'} open={remind} onClose={() => setRemind(false)}
        onSend={async () => {
          await api.logReminder(sel!.customerId);
          setRemind(false);
          await reload();
          toast.show({ tone: 'success', title: 'WhatsApp opened', detail: `Reminder ready for ${sel!.name}.` });
        }}
      />
    </>
  );
}
