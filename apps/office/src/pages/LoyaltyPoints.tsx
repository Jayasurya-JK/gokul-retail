import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Settings2, Star, Users } from 'lucide-react';
import { customerLabel, formatPoints, formatRupees, isNoName, type PointsCustomerRow, type PointsOverview, type PointsReport } from '@gokul/data';
import {
  Button, Card, DataTable, DateRangePicker, EmptyState, FilterBar, PageHeader, SearchInput, Tabs, TabPanel, dateRangePresets, useToast,
  type ColumnDef, type DateRange,
} from '@gokul/ui';
import { api } from '../store';
import { PointsLedgerList, fmtDay } from '../components/crm/PointsParts';
import { Avatar, DetailPane, csvCell, downloadText, fmtShort, initialsOf, nameColor, Segmented } from '../components/crm/common';

const PAGE = 200;
type Filter = 'all' | 'withPoints' | 'zero' | 'expiring';
type Sort = { id: string; desc: boolean } | null;

const when = (iso: string | null) => (iso ? fmtShort(iso) : <span className="text-subtle">-</span>);

const columns: ColumnDef<PointsCustomerRow>[] = [
  { id: 'code', header: 'Code', meta: { w: '86px', num: true }, accessorFn: (r) => r.id, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
  {
    id: 'name', header: 'Customer', meta: { w: 'minmax(170px,1.4fr)' }, accessorFn: (r) => r.name,
    cell: (c) => {
      const r = c.row.original;
      return (
        <span className="flex items-center gap-2.5">
          <Avatar initials={isNoName(r.name) ? '#' : initialsOf(r.name)} color={nameColor(r.name)} size={24} />
          <span className={isNoName(r.name) ? 'min-w-0 truncate font-medium italic text-muted' : 'min-w-0 truncate font-medium text-ink'}>{customerLabel(r.name)}</span>
        </span>
      );
    },
  },
  { id: 'phone', header: 'Mobile', enableSorting: false, meta: { w: '108px', num: true }, accessorFn: (r) => r.phone },
  { id: 'points', header: 'Points', meta: { w: '104px', align: 'right', num: true }, accessorFn: (r) => r.points, cell: (c) => <b className={c.getValue<number>() > 0 ? 'text-ink' : c.getValue<number>() < 0 ? 'text-danger' : 'text-subtle'}>{formatPoints(c.getValue<number>())}</b> },
  { id: 'expiresOn', header: 'Next expiry', enableSorting: false, meta: { w: '112px', align: 'right' }, accessorFn: (r) => r.expiresOn ?? '', cell: (c) => (c.row.original.expiresOn ? fmtDay(c.row.original.expiresOn) : <span className="text-subtle">-</span>) },
  { id: 'lastEarned', header: 'Last earned', meta: { w: '112px', align: 'right' }, accessorFn: (r) => r.lastEarned ?? '', cell: (c) => when(c.row.original.lastEarned) },
  { id: 'lastRedeemed', header: 'Last redeemed', meta: { w: '124px', align: 'right' }, accessorFn: (r) => r.lastRedeemed ?? '', cell: (c) => when(c.row.original.lastRedeemed) },
];

/* ------------------------------------------------------------------ */
/* Customers tab: server-paged table + ledger side panel               */
/* ------------------------------------------------------------------ */
function CustomersTab({ overview, filterRequest }: { overview: PointsOverview | null; filterRequest: { filter: Filter; n: number } }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => { if (filterRequest.n > 0) setFilter(filterRequest.filter); }, [filterRequest]);
  const [sort, setSort] = useState<Sort>({ id: 'points', desc: true });
  const [rows, setRows] = useState<PointsCustomerRow[]>([]);
  const [matched, setMatched] = useState(0);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [sel, setSel] = useState<PointsCustomerRow | null>(null);
  const seq = useRef(0);
  const busy = useRef(false);
  const rowsRef = useRef<PointsCustomerRow[]>([]);
  const matchedRef = useRef(0);
  rowsRef.current = rows; matchedRef.current = matched;

  const query = useMemo(() => ({ q, filter, sort: (sort?.id ?? 'points') as 'points', dir: sort && !sort.desc ? ('asc' as const) : ('desc' as const) }), [q, filter, sort]);

  useEffect(() => {
    const my = ++seq.current;
    api.listPointsCustomers({ ...query, offset: 0, limit: PAGE }).then((r) => {
      if (my !== seq.current) return;
      setRows(r.rows); setMatched(r.matched); setTotal(r.total); setLoaded(true);
      setSelId((cur) => (cur && r.rows.some((x) => x.id === cur) ? cur : r.rows[0]?.id ?? cur));
    }).catch((e) => toast.show({ tone: 'error', title: 'Could not load customers', detail: e instanceof Error ? e.message : undefined }));
  }, [query, toast]);

  useEffect(() => { setSel((cur) => rows.find((r) => r.id === selId) ?? (cur?.id === selId ? cur : null)); }, [rows, selId]);

  const more = useCallback(() => {
    if (busy.current || rowsRef.current.length >= matchedRef.current) return;
    busy.current = true;
    const my = seq.current;
    api.listPointsCustomers({ ...query, offset: rowsRef.current.length, limit: PAGE }).then((r) => {
      if (my === seq.current) setRows((prev) => [...prev, ...r.rows.filter((x) => !prev.some((p) => p.id === x.id))]);
    }).finally(() => { busy.current = false; });
  }, [query]);

  const exportCsv = async () => {
    const all: PointsCustomerRow[] = [];
    for (let off = 0; ; off += 2000) {
      const r = await api.listPointsCustomers({ ...query, offset: off, limit: 2000 });
      all.push(...r.rows);
      if (all.length >= r.matched || r.rows.length === 0) break;
    }
    const pv = overview?.pointValue ?? 100;
    const head = ['Code', 'Customer', 'Mobile', 'Area', 'Points', 'Value (Rs)', 'Last earned', 'Last redeemed'];
    const iso = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-CA') : '');
    const lines = all.map((r) => [r.id, customerLabel(r.name), r.phone, r.area, r.points.toFixed(2), ((r.points * pv) / 100).toFixed(2), iso(r.lastEarned), iso(r.lastRedeemed)].map(csvCell).join(','));
    downloadText(`gokul-loyalty-points-${new Date().toLocaleDateString('en-CA')}.csv`, '﻿' + [head.join(','), ...lines].join('\r\n'));
    toast.show({ tone: 'success', title: 'Points exported', detail: `${all.length.toLocaleString('en-IN')} customers saved as CSV. Opens in Excel.` });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        trailing={<span><b className="num text-ink">{matched.toLocaleString('en-IN')}</b> of <b className="num text-ink">{total.toLocaleString('en-IN')}</b> customers</span>}
      >
        <div className="w-80"><SearchInput placeholder="Search name, mobile, code or area" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'withPoints', label: 'With points' }, { value: 'zero', label: 'No points' }, { value: 'expiring', label: 'Expiring in 30 days' }]} />
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon={<Download size={14} />} onClick={() => void exportCsv()} disabled={matched === 0}>Export Excel (CSV)</Button>
      </FilterBar>
      <div className="flex min-h-0 flex-1">
        <DataTable
          data={rows} columns={columns} getRowId={(r) => r.id} selectedId={selId} onSelect={(r) => setSelId(r.id)} sort={sort} onSortChange={(s) => setSort(s)} onEndReached={more}
          empty={loaded ? <EmptyState icon={<Users size={20} />} title="No customers match" hint="Check the spelling. You can search by name, mobile, code (like C02607) or area." /> : <div className="p-6 text-center text-sm text-muted">Loading customers</div>}
          footer={<><span>{rows.length.toLocaleString('en-IN')} loaded of {matched.toLocaleString('en-IN')} matching. More load as you scroll.</span></>}
        />
        {sel && (
          <DetailPane width={400}>
            <div className="border-b border-line p-4">
              <div className="flex items-start gap-3">
                <Avatar initials={isNoName(sel.name) ? '#' : initialsOf(sel.name)} color={nameColor(sel.name)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className={isNoName(sel.name) ? 'truncate text-md font-semibold italic leading-tight text-muted' : 'truncate text-md font-semibold leading-tight text-ink'}>{customerLabel(sel.name)}</div>
                  <div className="num mt-0.5 text-sm text-muted">{sel.id} · {sel.phone || 'no mobile'}</div>
                  <div className="text-xs text-subtle">{sel.area || 'No area'}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-control border border-line bg-surface-2 px-3 py-2"><div className="text-xs text-muted">Points balance</div><div className="num mt-0.5 text-lg font-semibold text-ink">{formatPoints(sel.points)}</div></div>
                <div className="rounded-control border border-line bg-surface-2 px-3 py-2"><div className="text-xs text-muted">Worth</div><div className="num mt-0.5 text-lg font-semibold text-ink">{formatRupees(Math.round(sel.points * (overview?.pointValue ?? 100)))}</div></div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto"><PointsLedgerList customerId={sel.id} /></div>
          </DetailPane>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports tab                                                         */
/* ------------------------------------------------------------------ */
function ReportsTab() {
  const toast = useToast();
  const [range, setRange] = useState<DateRange>(() => dateRangePresets.find((p) => p.label === 'This month')!.get());
  const [rep, setRep] = useState<PointsReport | null>(null);
  useEffect(() => {
    let live = true;
    api.pointsReport({ from: range.from, to: range.to }).then((r) => live && setRep(r)).catch((e) => toast.show({ tone: 'error', title: 'Could not load the report', detail: e instanceof Error ? e.message : undefined }));
    return () => { live = false; };
  }, [range, toast]);

  const max = Math.max(1, ...(rep?.byDay ?? []).flatMap((d) => [d.earned, d.redeemed]));
  const tot = (rep?.byDay ?? []).reduce((a, d) => ({ e: a.e + d.earned, r: a.r + d.redeemed, x: a.x + d.expired, j: a.j + d.adjusted }), { e: 0, r: 0, x: 0, j: 0 });

  const exportDays = () => {
    if (!rep) return;
    downloadText(`gokul-points-by-day-${rep.from}-to-${rep.to}.csv`, '﻿' + [['Date', 'Earned', 'Redeemed', 'Expired', 'Adjusted'].join(','), ...rep.byDay.map((d) => [d.date, d.earned.toFixed(2), d.redeemed.toFixed(2), d.expired.toFixed(2), d.adjusted.toFixed(2)].join(','))].join('\r\n'));
  };
  const exportTop = () => {
    if (!rep) return;
    downloadText(`gokul-points-top-customers.csv`, '﻿' + [['Code', 'Customer', 'Mobile', 'Points', 'Earned in period', 'Redeemed in period'].join(','), ...rep.top.map((t) => [t.id, t.name, t.phone, t.points.toFixed(2), t.earned.toFixed(2), t.redeemed.toFixed(2)].map(csvCell).join(','))].join('\r\n'));
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-2"><DateRangePicker value={range} onChange={setRange} /><span className="text-xs text-muted">{rep ? `${rep.from} to ${rep.to}` : ''}</span></div>
      </div>
      {!rep ? <div className="p-6 text-sm text-muted">Loading</div> : (
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 p-4">
          <Card
            title="Points earned and redeemed by day" bodyClassName="p-0"
            actions={<Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={exportDays} disabled={rep.byDay.length === 0}>CSV</Button>}
          >
            {rep.byDay.length === 0 ? <EmptyState title="No points moved in these dates" hint="Pick a wider range." /> : (
              <>
                <div className="px-4 pt-4">
                  <div className="flex h-36 items-end gap-1 border-b border-line">
                    {rep.byDay.map((d) => (
                      <div key={d.date} className="group relative flex h-full min-w-[6px] flex-1 items-end justify-center gap-0.5" title={`${d.date}: earned ${formatPoints(d.earned)}, redeemed ${formatPoints(d.redeemed)}`}>
                        <div className="w-full max-w-[14px] rounded-t-sm bg-primary" style={{ height: `${(d.earned / max) * 100}%`, minHeight: d.earned > 0 ? 2 : 0 }} />
                        <div className="w-full max-w-[14px] rounded-t-sm bg-warning" style={{ height: `${(d.redeemed / max) * 100}%`, minHeight: d.redeemed > 0 ? 2 : 0 }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 py-2 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-primary" /> Earned</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-warning" /> Redeemed</span></div>
                </div>
                <div className="max-h-[360px] overflow-auto border-t border-line">
                  <div className="sticky top-0 grid grid-cols-[1fr_repeat(4,92px)] gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><span>Date</span><span className="text-right">Earned</span><span className="text-right">Redeemed</span><span className="text-right">Expired</span><span className="text-right">Adjusted</span></div>
                  {[...rep.byDay].reverse().map((d) => (
                    <div key={d.date} className="grid grid-cols-[1fr_repeat(4,92px)] gap-2 border-b border-line/70 px-4 py-1.5 text-sm num">
                      <span>{fmtShort(d.date)}</span><span className="text-right text-success">{formatPoints(d.earned)}</span><span className="text-right">{formatPoints(d.redeemed)}</span><span className="text-right text-muted">{formatPoints(d.expired)}</span><span className="text-right text-muted">{formatPoints(d.adjusted)}</span>
                    </div>
                  ))}
                  <div className="sticky bottom-0 grid grid-cols-[1fr_repeat(4,92px)] gap-2 border-t border-line bg-surface-2 px-4 py-2 text-sm font-semibold num"><span>Total</span><span className="text-right">{formatPoints(tot.e)}</span><span className="text-right">{formatPoints(tot.r)}</span><span className="text-right">{formatPoints(tot.x)}</span><span className="text-right">{formatPoints(tot.j)}</span></div>
                </div>
              </>
            )}
          </Card>
          <div className="flex min-w-0 flex-col gap-4">
            <Card title="Liability today">
              <div className="num text-2xl font-semibold text-ink">{formatRupees(rep.liability.value)}</div>
              <div className="mt-1 text-sm text-muted"><b className="num text-ink">{formatPoints(rep.liability.outstanding)}</b> points held by <b className="num text-ink">{rep.liability.customers.toLocaleString('en-IN')}</b> customers, at {formatRupees(rep.liability.pointValue)} a point.</div>
            </Card>
            <Card title="Top customers by points" bodyClassName="p-0" actions={<Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={exportTop} disabled={rep.top.length === 0}>CSV</Button>}>
              <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_84px_70px_70px] gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><span>Customer</span><span className="text-right">Points</span><span className="text-right">Earned</span><span className="text-right">Used</span></div>
              {rep.top.slice(0, 12).map((t, i) => (
                <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_84px_70px_70px] items-center gap-2 border-b border-line/70 px-4 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><span className="num w-4 shrink-0 text-xs text-subtle">{i + 1}</span><span className="truncate font-medium text-ink">{t.name}</span></span>
                  <b className="num text-right text-ink">{formatPoints(t.points)}</b><span className="num text-right text-success">{formatPoints(t.earned)}</span><span className="num text-right text-muted">{formatPoints(t.redeemed)}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint, accent, action }: { label: string; value: string; hint?: string; accent?: boolean; action?: React.ReactNode }) {
  return (
    <div className={`rounded-card border px-3.5 py-2 ${accent ? 'border-primary/30 bg-primary-soft' : 'border-line bg-surface'}`}>
      <div className="flex items-center justify-between text-xs font-medium text-muted"><span>{label}</span>{action}</div>
      <div className="num text-xl font-semibold leading-7 tracking-tight text-ink">{value}</div>
      <div className="truncate text-[11px] text-subtle" title={hint}>{hint}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export function LoyaltyPoints() {
  const nav = useNavigate();
  const [tab, setTab] = useState('customers');
  const [ov, setOv] = useState<PointsOverview | null>(null);
  const [filterReq, setFilterReq] = useState<{ filter: Filter; n: number }>({ filter: 'all', n: 0 });
  const load = useCallback(() => { api.pointsOverview().then(setOv).catch(() => setOv(null)); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Loyalty points"
        subtitle={ov ? `${ov.customers.toLocaleString('en-IN')} customers · 1 point is worth ${formatRupees(ov.pointValue)}${ov.enabled ? '' : ' · points are switched off'}` : 'Customer points'}
        icon={<Star size={17} />}
        actions={<Button icon={<Settings2 size={14} />} onClick={() => nav('/settings?tab=loyalty')}>Points settings</Button>}
      />
      <div className="grid shrink-0 grid-cols-5 gap-3 border-b border-line bg-bg px-4 py-2.5">
        <Tile label="Points outstanding" value={ov ? formatPoints(ov.outstanding) : '-'} hint={ov ? `Liability ${formatRupees(ov.liability, { decimals: false })}${ov.negativeBalances > 0 ? ` · net ${formatPoints(ov.netTotal)} with ${ov.negativeBalances} negative` : ''}` : ''} accent />
        <Tile label="Customers with points" value={ov ? ov.customersWithPoints.toLocaleString('en-IN') : '-'} hint={ov ? `of ${ov.customers.toLocaleString('en-IN')} customers` : ''} />
        <Tile label="Earned this month" value={ov ? formatPoints(ov.earnedMonth) : '-'} hint="On bills since the 1st" />
        <Tile label="Redeemed this month" value={ov ? formatPoints(ov.redeemedMonth) : '-'} hint={ov ? `Worth ${formatRupees(Math.round(ov.redeemedMonth * ov.pointValue), { decimals: false })} off bills` : ''} />
        <Tile label="Expiring in next 30 days" value={ov ? formatPoints(ov.expiring30.points) : '-'}
          hint={ov ? (ov.expiryMonths > 0 ? `${ov.expiring30.customers.toLocaleString('en-IN')} customers · expired this month ${formatPoints(ov.expiredMonth)}` : 'Expiry is off') : ''}
          action={ov && ov.expiring30.customers > 0 ? <button type="button" onClick={() => { setTab('customers'); setFilterReq((f) => ({ filter: 'expiring', n: f.n + 1 })); }} className="text-xs font-medium text-primary hover:underline">See list</button> : undefined} />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1" tabs={[{ value: 'customers', label: 'Customers' }, { value: 'reports', label: 'Reports' }]}>
        <TabPanel value="customers" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"><CustomersTab overview={ov} filterRequest={filterReq} /></TabPanel>
        <TabPanel value="reports" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"><ReportsTab /></TabPanel>
      </Tabs>
    </>
  );
}
