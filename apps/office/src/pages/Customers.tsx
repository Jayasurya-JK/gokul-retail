import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MessageCircle, Pencil, Phone, Plus, Users, Wallet } from 'lucide-react';
import { formatPoints, formatQty, fuzzyFilter, type CustomerProfile, type CustomerRow } from '@gokul/data';
import { Badge, Button, DataTable, EmptyState, FilterBar, Money, PageHeader, SearchInput, Tabs, TabPanel, useToast, type ColumnDef } from '@gokul/ui';
import { api } from '../store';
import { CustomerSheet } from '../components/crm/CustomerSheet';
import { PointsLedgerList } from '../components/crm/PointsParts';
import { Avatar, DetailPane, fmtDate, fmtDateTime, initialsOf, nameColor, PropRow, Segmented, SectionLabel, StatusBadge, ago } from '../components/crm/common';

const DECIMAL = ['kg', 'g', 'l', 'ml'];

const columns: ColumnDef<CustomerRow>[] = [
  {
    id: 'name', header: 'Customer', meta: { w: 'minmax(170px,1.3fr)' }, accessorFn: (r) => r.name,
    cell: (c) => {
      const r = c.row.original;
      return (
        <span className="flex items-center gap-2.5">
          <Avatar initials={initialsOf(r.name)} color={nameColor(r.name)} size={26} />
          <span className="min-w-0 truncate">
            <span className="font-medium text-ink">{r.name}</span>
            {r.business && <span className="ml-1.5 text-xs text-subtle">{r.business}</span>}
          </span>
        </span>
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', meta: { w: '116px', num: true } },
  { accessorKey: 'area', header: 'Area', meta: { w: '128px' } },
  { id: 'spend', header: 'Total spend', meta: { w: '112px', align: 'right', num: true }, accessorFn: (r) => r.totalSpend, cell: (c) => <Money paise={c.getValue<number>()} decimals={false} /> },
  {
    id: 'due', header: 'Outstanding', meta: { w: '112px', align: 'right', num: true }, accessorFn: (r) => r.outstanding,
    cell: (c) => (c.getValue<number>() > 0 ? <span className="font-semibold text-warning"><Money paise={c.getValue<number>()} decimals={false} /></span> : <span className="text-subtle">-</span>),
  },
];

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-md font-semibold text-ink num">{children}</div>
    </div>
  );
}

function Detail({ profile, onEdit, onCollect }: { profile: CustomerProfile; onEdit: () => void; onCollect: () => void }) {
  const { customer: c, favourites, bills } = profile;
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const used = c.creditLimit > 0 ? Math.min(100, (c.outstanding / c.creditLimit) * 100) : 0;
  const maxFav = Math.max(1, ...favourites.map((f) => f.amount));
  return (
    <DetailPane width={420}>
      <div className="border-b border-line p-4">
        <div className="flex items-start gap-3">
          <Avatar initials={initialsOf(c.name)} color={nameColor(c.name)} size={42} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-md font-semibold leading-tight text-ink">{c.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted num"><Phone size={13} /> {c.phone}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.type === 'b2b' ? <Badge tone="info"><Building2 size={11} /> Business</Badge> : <Badge>Retail</Badge>}
              {c.creditLimit !== 0 && <Badge tone="primary">Credit customer</Badge>}
              {c.outstanding > 0 && <Badge tone="warning">Owes money</Badge>}
            </div>
          </div>
          <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Edit</Button>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1" tabs={[{ value: 'overview', label: 'Overview' }, { value: 'history', label: 'Purchase history', count: bills.length }, { value: 'points', label: 'Points' }]}>
        <TabPanel value="overview" className="min-h-0 flex-1 overflow-auto p-4 outline-none">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Stat label="Total spend (30 days)"><Money paise={c.totalSpend} decimals={false} /></Stat>
            <Stat label="Visits">{c.visits}</Stat>
            <Stat label="Average bill"><Money paise={c.avgBill} decimals={false} /></Stat>
            <Stat label="Last visit">{c.lastBillAt ? ago(c.lastBillAt) : 'No bills yet'}</Stat>
          </div>

          <div className="mb-4 rounded-card border border-line p-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Credit account</SectionLabel>
              {c.outstanding > 0 && <Button size="sm" variant="primary" icon={<Wallet size={13} />} onClick={onCollect}>Collect</Button>}
            </div>
            {c.creditLimit !== 0 ? (
              <>
                <div className="flex items-end justify-between">
                  <div><div className="text-xs text-muted">Outstanding</div><div className={`text-lg font-semibold num ${c.outstanding > 0 ? 'text-warning' : 'text-ink'}`}><Money paise={c.outstanding} /></div></div>
                  <div className="text-right"><div className="text-xs text-muted">Credit limit</div><div className="text-base font-medium num">{c.creditLimit < 0 ? 'No limit' : <Money paise={c.creditLimit} decimals={false} />}</div></div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className={used > 85 ? 'h-full bg-danger' : used > 60 ? 'h-full bg-warning' : 'h-full bg-primary'} style={{ width: `${used}%` }} />
                </div>
                <div className="mt-1 text-xs text-subtle">{Math.round(used)}% of limit used</div>
              </>
            ) : (
              <div className="text-sm text-muted">Credit not allowed. Set a credit limit with Edit to allow Pay later at the counter.</div>
            )}
          </div>

          <SectionLabel>Contact</SectionLabel>
          <dl className="mb-4">
            {c.business && <PropRow k="Business">{c.business}</PropRow>}
            {c.type === 'b2b' && <PropRow k="GSTIN"><span className="selectable num">{c.gstin}</span></PropRow>}
            <PropRow k="Area">{c.area}</PropRow>
            <PropRow k="Address">{c.address ?? '-'}</PropRow>
            <PropRow k="Email">{c.email ?? '-'}</PropRow>
            <PropRow k="Customer since">{fmtDate(c.since)}</PropRow>
            <PropRow k="Loyalty points"><span className="num">{formatPoints(c.loyaltyPoints)}</span></PropRow>
          </dl>

          <SectionLabel>Favourite items</SectionLabel>
          {favourites.length === 0 ? (
            <div className="rounded-control bg-surface-2 px-3 py-3 text-sm text-muted">Favourites appear after the first few bills.</div>
          ) : (
            <div className="space-y-2.5">
              {favourites.map((f) => (
                <div key={f.itemId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-ink">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted num">{formatQty(f.qty, DECIMAL.includes(f.unit))} {f.unit} · <Money paise={f.amount} decimals={false} /></span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-primary/70" style={{ width: `${(f.amount / maxFav) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          <Button
            className="mt-5" block icon={<MessageCircle size={14} />} disabled={!c.phone}
            onClick={() => toast.show({ tone: 'info', title: 'WhatsApp message drafted', detail: `Offer message ready for ${c.name}.` })}
          >
            Send offer on WhatsApp
          </Button>
        </TabPanel>
        <TabPanel value="points" className="min-h-0 flex-1 overflow-auto outline-none">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm"><span className="text-muted">Balance</span><b className="num text-ink">{formatPoints(c.loyaltyPoints)} points</b></div>
          <PointsLedgerList customerId={c.id} />
        </TabPanel>
        <TabPanel value="history" className="min-h-0 flex-1 overflow-auto outline-none">
          {bills.length === 0 ? (
            <EmptyState title="No purchases yet" hint="Bills billed to this customer appear here." />
          ) : (
            bills.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{b.number}</div>
                  <div className="truncate text-xs text-muted">{fmtDateTime(b.at)} · {b.lines.length} items</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5"><Money paise={b.totals.grand} className="font-medium" /><StatusBadge status={b.status} /></div>
              </div>
            ))
          )}
        </TabPanel>
      </Tabs>
    </DetailPane>
  );
}

type View = 'all' | 'credit' | 'dues' | 'b2b';

export function Customers() {
  const toast = useToast();
  const nav = useNavigate();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; edit: CustomerRow | null }>({ open: false, edit: null });

  const reload = useCallback(async (keep?: string) => {
    const r = await api.listCustomerRows();
    setRows(r);
    setSelId((cur) => keep ?? cur ?? r[0]?.id ?? null);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (selId) api.getCustomerProfile(selId).then(setProfile); }, [selId, rows]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setSheet({ open: true, edit: null }); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const shown = useMemo(() => {
    const base = rows.filter((r) => (view === 'credit' ? r.creditLimit !== 0 : view === 'dues' ? r.outstanding > 0 : view === 'b2b' ? r.type === 'b2b' : true));
    // no cap: every customer is searchable (the table below is virtualised, so thousands of rows stay fast)
    return fuzzyFilter(base, q, (r) => [r.name, r.id, r.phone.replace(' ', ''), r.business ?? '', r.area], Infinity);
  }, [rows, q, view]);

  const owing = rows.filter((r) => r.outstanding > 0);

  return (
    <>
      <PageHeader
        title="Customers" subtitle={`${rows.length.toLocaleString('en-IN')} customers · ${owing.length} with dues`} icon={<Users size={17} />}
        actions={<Button variant="primary" icon={<Plus size={15} />} kbd="Ctrl+N" onClick={() => setSheet({ open: true, edit: null })}>New customer</Button>}
      />
      <FilterBar trailing={<span><b className="num text-ink">{shown.length.toLocaleString('en-IN')}</b> shown of <b className="num text-ink">{rows.length.toLocaleString('en-IN')}</b> customers</span>}>
        <div className="w-72"><SearchInput placeholder="Search name, phone, code, business or area" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'credit', label: 'Credit' }, { value: 'dues', label: 'With dues' }, { value: 'b2b', label: 'Business' }]} />
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={shown} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)}
          onActivate={(r) => setSheet({ open: true, edit: r })}
          empty={<EmptyState icon={<Users size={20} />} title="No customers match" hint="Check the spelling, or add a new customer with Ctrl+N." />}
          footer={<><span>{shown.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} customers</span><span>Enter edits the selected customer</span></>}
        />
        {profile && profile.customer.id === selId && (
          <Detail
            key={profile.customer.id} profile={profile}
            onEdit={() => setSheet({ open: true, edit: profile.customer })}
            onCollect={() => nav(`/collections?c=${profile.customer.id}`)}
          />
        )}
      </div>
      <CustomerSheet
        open={sheet.open} customer={sheet.edit} onClose={() => setSheet({ open: false, edit: null })}
        onSave={async (input) => {
          const saved = await api.saveCustomer(input);
          setSheet({ open: false, edit: null });
          await reload(saved.id);
          toast.show({ tone: 'success', title: input.id ? 'Customer updated' : 'Customer added', detail: saved.name });
        }}
      />
    </>
  );
}
