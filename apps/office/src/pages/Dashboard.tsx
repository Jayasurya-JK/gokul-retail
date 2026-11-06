import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { IndianRupee, Plus, Receipt, ShoppingBag, TrendingUp } from 'lucide-react';
import { formatQty, formatRupees, type Bill, type DashboardStats, type Item, type TopItem } from '@gokul/data';
import { Badge, Button, Card, Money, PageHeader, StatTile, type Tone } from '@gokul/ui';
import { api } from '../store';
import { rupeeAxis } from '../components/reports/format';

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function SalesChart({ data }: { data: DashboardStats['last30'] }) {
  const id = useId().replace(/:/g, '');
  const rows = data.map((d) => ({ day: d.date, sales: d.sales / 100 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 12, left: -2, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--primary))', stopOpacity: 0.28 }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--primary))', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} style={{ stroke: 'rgb(var(--line))' }} />
        <XAxis dataKey="day" tickFormatter={dayLabel} interval={4} tickLine={false} axisLine={false} tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }} />
        <YAxis tickFormatter={(v: number) => rupeeAxis(v * 100)} tickLine={false} axisLine={false} width={58} tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }} />
        <RTooltip
          cursor={{ style: { stroke: 'rgb(var(--line-strong))' } }}
          content={({ active, payload }) => active && payload?.length ? (
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
              <div className="text-muted">{dayLabel(payload[0].payload.day)}</div>
              <div className="num text-sm font-semibold text-ink">{formatRupees(Math.round(Number(payload[0].value) * 100), { decimals: false })}</div>
            </div>
          ) : null}
        />
        <Area type="monotone" isAnimationActive={false} dataKey="sales" strokeWidth={2} fill={`url(#${id})`} style={{ stroke: 'rgb(var(--primary))' }} activeDot={{ r: 4, style: { fill: 'rgb(var(--primary))' } }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const modeTone: Record<string, Tone> = { cash: 'success', upi: 'info', card: 'neutral', credit: 'warning' };

export function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [top, setTop] = useState<TopItem[]>([]);
  const [low, setLow] = useState<Item[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    api.dashboard().then(setStats);
    api.topItems(30, 5).then(setTop);
    api.lowStock(12).then(setLow);
    api.listBills({ limit: 14 }).then(setBills);
  }, []);

  if (!stats) return <PageHeader title="Dashboard" />;
  const split = [
    { k: 'Cash', v: stats.cash, c: 'bg-success' }, { k: 'UPI', v: stats.upi, c: 'bg-info' },
    { k: 'Card', v: stats.card, c: 'bg-subtle' }, { k: 'Credit', v: stats.credit, c: 'bg-warning' },
  ];
  const splitTotal = Math.max(1, split.reduce((s, x) => s + x.v, 0));
  const maxTop = Math.max(1, ...top.map((t) => t.amount));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title="Dashboard" subtitle={`${today} - live from all counters`}
        actions={<>
          <Button icon={<ShoppingBag size={15} />} onClick={() => nav('/purchases')}>New purchase</Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => nav('/items/new')}>Add item</Button>
        </>}
      />
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1.15fr)_minmax(0,1fr)] gap-3 overflow-hidden p-4">
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Today's sales" icon={<IndianRupee size={14} />} value={<Money paise={stats.todaySales} decimals={false} />} hint={<>Yesterday <Money paise={stats.yesterdaySales} decimals={false} /> (full day)</>} />
          <StatTile label="Bills today" icon={<Receipt size={14} />} value={stats.todayBills} hint={`Yesterday ${stats.yesterdayBills}`} />
          <StatTile label="Average bill" icon={<TrendingUp size={14} />} value={<Money paise={stats.avgBill} decimals={false} />} delta={pct(stats.avgBill, stats.yesterdayAvg)} deltaLabel="vs yesterday" />
          <div className="flex flex-col justify-between rounded-card border border-line bg-surface px-4 py-3">
            <div className="text-xs font-medium text-muted">How customers paid today</div>
            <div className="my-2 flex h-2.5 overflow-hidden rounded-full bg-line">
              {split.map((s) => <div key={s.k} className={s.c} style={{ width: `${(s.v / splitTotal) * 100}%` }} />)}
            </div>
            <div className="grid grid-cols-4 gap-1 text-xs">
              {split.map((s) => (
                <div key={s.k}>
                  <div className="flex items-center gap-1 text-muted"><span className={`h-2 w-2 rounded-full ${s.c}`} />{s.k}</div>
                  <div className="num font-semibold text-ink">{formatRupees(s.v, { decimals: false })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <Card title="Sales, last 30 days" actions={<span className="num text-xs text-muted">Total {formatRupees(stats.last30.reduce((s, d) => s + d.sales, 0), { decimals: false })}</span>} bodyClassName="px-2 pb-2 pt-3">
            <SalesChart data={stats.last30} />
          </Card>
          <Card title="Top items, last 30 days" flush bodyClassName="overflow-hidden">
            <ul className="flex h-full flex-col justify-between px-4 py-1">
              {top.map((t, i) => (
                <li key={t.itemId} className="flex min-h-0 flex-1 flex-col justify-center">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-ink"><span className="mr-1.5 text-xs text-subtle num">{i + 1}</span>{t.name}</span>
                    <span className="num font-semibold">{formatRupees(t.amount, { decimals: false })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{ width: `${(t.amount / maxTop) * 100}%` }} /></div>
                    <span className="w-20 text-right text-xs text-muted num">{formatQty(t.qty, t.qty % 1000 !== 0)} {t.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid min-h-0 grid-cols-2 gap-3">
          <Card title="Low stock" actions={<Badge tone="warning">{low.length} to reorder</Badge>} flush bodyClassName="overflow-y-auto">
            <ul>
              {low.map((i) => {
                const crit = i.stock <= i.reorderLevel * 0.3;
                return (
                  <li key={i.id} className="flex h-9 items-center gap-3 border-b border-line/60 px-4 text-sm last:border-0">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{i.name}</span>
                    <span className="num text-muted">{formatQty(i.stock, i.loose)} / {formatQty(i.reorderLevel, i.loose)} {i.unit}</span>
                    <Badge tone={crit ? 'danger' : 'warning'}>{crit ? 'Critical' : 'Low'}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Recent bills" actions={<Button size="sm" variant="ghost" onClick={() => nav('/sales')}>View all</Button>} flush bodyClassName="overflow-y-auto">
            <ul>
              {bills.map((b) => (
                <li key={b.id} className="flex h-9 items-center gap-3 border-b border-line/60 px-4 text-sm last:border-0">
                  <span className="w-24 num font-medium text-ink">{b.number}</span>
                  <span className="w-12 text-muted num">{new Date(b.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{b.customerName}</span>
                  <Badge tone={modeTone[b.payments[0].mode]}>{b.payments.length > 1 ? 'Split' : b.payments[0].mode.toUpperCase()}</Badge>
                  <span className="w-24 text-right font-semibold"><Money paise={b.totals.grand} /></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
