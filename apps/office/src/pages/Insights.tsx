import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, CircleCheck, Droplets, Factory, Gauge, Layers, Package, Target, TrendingDown, TriangleAlert, Wheat } from 'lucide-react';
import { groupBatches, summarise, type InsightBy, type InsightRow, type PressingBatch } from '@gokul/data';
import { Badge, Card, EmptyState, FilterBar, Input, PageHeader, Select, StatTile, cn, useRefreshOnFocus } from '@gokul/ui';
import { api } from '../store';
import { isoDay } from '../components/crm/common';

type Period = 'today' | 'week' | 'month' | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

const GROUPS: { value: InsightBy; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'month', label: 'Monthly' },
  { value: 'seed', label: 'Seed' },
  { value: 'machine', label: 'Machine (W/R)' },
  { value: 'operator', label: 'Operator' },
];

const GROUP_TITLE: Record<InsightBy, string> = {
  day: 'By day', month: 'By month', seed: 'By seed', machine: 'By machine (W/R)', operator: 'By operator',
};

const GROUP_HEAD: Record<InsightBy, string> = {
  day: 'Day', month: 'Month', seed: 'Seed', machine: 'Machine', operator: 'Operator',
};

const fmt = (n: number, decimals = 1) => n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1)}%`;

const dayKey = (iso: string) => isoDay(new Date(iso));

const shortDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const longDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});

const tickDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function rangeFor(period: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  if (period === 'today') return { from: isoDay(now), to: isoDay(now) };
  if (period === 'week') {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return { from: isoDay(monday), to: isoDay(now) };
  }
  if (period === 'month') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

const rowLabel = (row: InsightRow, by: InsightBy) => {
  if (by === 'day') return shortDay(row.key);
  if (by === 'month') return monthLabel(row.key);
  return row.label;
};

const machineLabel = (b: PressingBatch) => {
  if (b.machine === 'R') return 'R rotary';
  if (b.machine === 'W') return 'W chekku';
  return 'No machine';
};

const varianceTone = (variance: number, threshold: number) =>
  variance < -threshold ? 'text-danger' : variance < 0 ? 'text-warning' : 'text-success';

const th = 'h-8 px-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const td = 'px-2 py-1.5 text-right text-sm text-ink num whitespace-nowrap';

/**
 * Production insights: yield, loss and machine/operator performance from the pressing batches.
 * Every number is computed by packages/data/src/insights.ts; this page only picks the period and draws it.
 */
export function Insights() {
  const [batches, setBatches] = useState<PressingBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState(() => {
    const now = new Date();
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  });
  const [by, setBy] = useState<InsightBy>('day');
  const [thresholdText, setThresholdText] = useState('5');
  const threshold = Math.min(30, Math.max(0, Number(thresholdText) || 0));

  const load = useCallback(() => {
    api.listPressingBatches()
      .then((list) => { setBatches(list); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the pressing batches'));
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnFocus(load);

  const range = rangeFor(period, custom);
  const { from, to } = range;
  const today = isoDay(new Date());

  const filtered = useMemo(
    () => (batches ?? []).filter((b) => { const d = dayKey(b.date); return d >= from && d <= to; }),
    [batches, from, to],
  );
  const rows = useMemo(() => groupBatches(filtered, by), [filtered, by]);
  const totals = useMemo(() => summarise('all', 'All batches', filtered), [filtered]);
  const trend = useMemo(
    () => groupBatches(filtered, 'day').map((r) => ({
      key: r.key, batches: r.batches, yieldPct: r.yieldPct, normPct: r.normPct,
    })),
    [filtered],
  );
  const flagged = useMemo(
    () => filtered.filter((b) => b.metrics.variancePct < -threshold)
      .sort((a, b) => a.metrics.variancePct - b.metrics.variancePct),
    [filtered, threshold],
  );

  const noBatches = filtered.length === 0;
  const neverPressed = batches !== null && batches.length === 0;
  const rangeLabel = from === to ? longDay(from) : `${shortDay(from)} to ${longDay(to)}`;
  const emptyTitle = neverPressed ? 'No pressing batches yet' : 'No pressing batches in this period';
  const emptyHint = neverPressed
    ? 'Record pressings in Production and the yield, loss and low-yield flags will appear here automatically.'
    : 'Widen the period or pick a custom range. Pressings entered in Production show up here.';

  return (
    <>
      <PageHeader
        title="Production insights" icon={<Gauge size={17} />}
        subtitle={`${rangeLabel} - yield, loss and machine performance`}
        actions={
          <div className="flex items-center rounded-control border border-line-strong bg-surface p-0.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.value} type="button" aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'h-7 rounded-[6px] px-2.5 text-sm font-medium transition-colors',
                  period === p.value ? 'bg-primary text-primary-fg shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <div className="shrink-0 border-b border-danger/30 bg-danger-soft px-5 py-2 text-sm text-danger" role="alert">{error}</div>}

      <FilterBar
        trailing={
          <label className="flex items-center gap-1.5">
            <span>Flag below</span>
            <Input
              type="number" size="sm" min={0} max={30} step={0.5} aria-label="Low-yield threshold, percent below norm"
              value={thresholdText} className="num w-16 text-right"
              onChange={(e) => setThresholdText(e.target.value)}
              onBlur={() => setThresholdText(String(threshold))}
            />
            <span>% of norm</span>
          </label>
        }
      >
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span>Group by</span>
          <span className="inline-block w-40">
            <Select size="sm" aria-label="Group by" value={by} options={GROUPS} onChange={(e) => setBy(e.target.value as InsightBy)} />
          </span>
        </label>
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarDays size={14} className="text-subtle" />
            <Input
              type="date" size="sm" aria-label="From date" className="num w-[132px]" value={custom.from} max={custom.to <= today ? custom.to : today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <span>to</span>
            <Input
              type="date" size="sm" aria-label="To date" className="num w-[132px]" value={custom.to} min={custom.from} max={today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        )}
      </FilterBar>

      <div className="grid shrink-0 grid-cols-6 gap-2 border-b border-line bg-bg px-4 py-2">
        <StatTile label="Seed in" icon={<Wheat size={14} />} value={noBatches ? '-' : `${fmt(totals.seedKg)} kg`} hint="clean seed pressed" />
        <StatTile label="Oil out" icon={<Droplets size={14} />} value={noBatches ? '-' : `${fmt(totals.oilL)} L`} hint="raw oil from the press" />
        <StatTile label="Cake out" icon={<Package size={14} />} value={noBatches ? '-' : `${fmt(totals.cakeKg)} kg`} hint="punnakku made" />
        <StatTile
          label="Average yield vs norm" icon={<Target size={14} />}
          value={noBatches ? '-' : `${totals.yieldPct.toFixed(1)}%`}
          delta={noBatches ? undefined : totals.variancePct}
          deltaLabel={noBatches ? 'no pressings' : `norm ${totals.normPct.toFixed(1)}%`}
        />
        <StatTile
          label="Oil loss" icon={<TrendingDown size={14} />}
          value={noBatches ? '-' : `${totals.lossPct.toFixed(2)}%`}
          hint={noBatches ? 'no pressings' : `${fmt(totals.lossKg)} kg`}
        />
        <StatTile
          label="Batches" icon={<Layers size={14} />} value={totals.batches}
          hint={noBatches ? 'none in this period' : `${totals.lowBatches} graded low or poor`}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 overflow-hidden bg-bg p-4">
        <Card
          title="Yield trend" className="col-start-1 row-start-1"
          actions={
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-primary" /> Yield</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-line-strong" /> Norm</span>
            </div>
          }
          bodyClassName="min-h-0 px-2 pb-2 pt-3"
        >
          {trend.length === 0 ? (
            <EmptyState icon={<Factory size={22} />} title={emptyTitle} hint={emptyHint} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 6, right: 14, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} style={{ stroke: 'rgb(var(--line))' }} />
                <XAxis
                  dataKey="key" tickFormatter={tickDay} interval="preserveStartEnd" minTickGap={24}
                  tickLine={false} axisLine={false} tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44}
                  tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }}
                />
                <RTooltip
                  cursor={{ style: { stroke: 'rgb(var(--line-strong))' } }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { key: string; batches: number; yieldPct: number; normPct: number };
                    return (
                      <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                        <div className="text-muted">{longDay(p.key)}</div>
                        <div className="num mt-0.5 text-sm font-semibold text-ink">{p.yieldPct.toFixed(1)}% yield</div>
                        <div className="num text-[11px] text-muted">Norm {p.normPct.toFixed(1)}% - {p.batches} batch{p.batches === 1 ? '' : 'es'}</div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone" dataKey="normPct" name="Norm" isAnimationActive={false} dot={false}
                  strokeWidth={1.5} strokeDasharray="5 4" style={{ stroke: 'rgb(var(--subtle))' }}
                />
                <Line
                  type="monotone" dataKey="yieldPct" name="Yield" isAnimationActive={false}
                  dot={{ r: 2.5, fill: 'rgb(var(--primary))' }} activeDot={{ r: 4, style: { fill: 'rgb(var(--primary))' } }}
                  strokeWidth={2} style={{ stroke: 'rgb(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card
          title={GROUP_TITLE[by]} className="col-start-1 row-start-2"
          actions={<span className="num text-xs text-muted">{rows.length} {rows.length === 1 ? 'group' : 'groups'}</span>}
          flush bodyClassName="overflow-auto"
        >
          {rows.length === 0 ? (
            <EmptyState icon={<Factory size={22} />} title={emptyTitle} hint={emptyHint} />
          ) : (
            <table className="w-full table-fixed">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr className="border-b border-line">
                  <th className="h-8 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">{GROUP_HEAD[by]}</th>
                  <th className={cn(th, 'w-[58px]')}>Batches</th>
                  <th className={cn(th, 'w-[82px]')}>Seed kg</th>
                  <th className={cn(th, 'w-[70px]')}>Oil L</th>
                  <th className={cn(th, 'w-[74px]')}>Oil / kg</th>
                  <th className={cn(th, 'w-[78px]')}>Cake / kg</th>
                  <th className={cn(th, 'w-[64px]')}>Loss %</th>
                  <th className={cn(th, 'w-[104px]')}>Yield vs norm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const variance = row.variancePct;
                  return (
                    <tr key={row.key} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="truncate py-1.5 pl-4 pr-2 text-sm font-medium text-ink">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{rowLabel(row, by)}</span>
                          {row.lowBatches > 0 && (
                            <span title={`${row.lowBatches} batch${row.lowBatches === 1 ? '' : 'es'} graded low or poor`} className="shrink-0">
                              <TriangleAlert size={12} className="text-warning" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={td}>{row.batches}</td>
                      <td className={td}>{fmt(row.seedKg)}</td>
                      <td className={td}>{fmt(row.oilL)}</td>
                      <td className={td}>{row.oilPerKg.toFixed(3)}</td>
                      <td className={td}>{row.cakePerKg.toFixed(3)}</td>
                      <td className={td}>{row.lossPct.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <div className={cn('num text-sm font-semibold leading-4', varianceTone(variance, threshold))}>{signedPct(variance)}</div>
                        <div className="num text-[10px] leading-3 text-subtle">{row.yieldPct.toFixed(1)}% / {row.normPct.toFixed(1)}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Low-yield batches" className="col-start-2 row-span-2 row-start-1"
          actions={<Badge tone={flagged.length ? 'danger' : 'success'}>{flagged.length}</Badge>}
          flush bodyClassName="overflow-y-auto"
        >
          {flagged.length === 0 ? (
            <EmptyState
              icon={<CircleCheck size={22} />}
              title={noBatches ? emptyTitle : `No batch is more than ${fmt(threshold)}% below norm`}
              hint={noBatches ? emptyHint : `Every pressing in this period is within the ${fmt(threshold)}% low-yield limit. Raise the setting to see smaller dips.`}
            />
          ) : (
            <ul className="divide-y divide-line">
              {flagged.map((b) => (
                <li key={b.id} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">{b.seedLabel}</span>
                        <Badge tone={b.machine ? 'neutral' : 'warning'} className="h-[18px] shrink-0 px-1.5 text-[10px]" >
                          {machineLabel(b)}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {shortDay(dayKey(b.date))} - {b.number} - {b.operator || 'Operator not recorded'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-sm font-semibold leading-4 text-danger">{b.metrics.yieldPct.toFixed(1)}%</div>
                      <div className="num text-[10px] leading-3 text-danger">{signedPct(b.metrics.variancePct)} vs norm</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
