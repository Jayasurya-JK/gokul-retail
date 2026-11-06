import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { formatPaise, type ReportChart } from '@gokul/data';
import { cn } from '@gokul/ui';
import { rupeeAxis } from './format';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayLabel = (iso: string) => (isDate(iso) ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : iso);
const tick = { fontSize: 11, style: { fill: 'rgb(var(--subtle))' } };
const fmt = (money: boolean, v: number) => (money ? `₹${formatPaise(v, { decimals: false })}` : String(v));

const palette = ['bg-primary', 'bg-info', 'bg-accent', 'bg-success', 'bg-warning', 'bg-subtle'];
const named: Record<string, string> = { Cash: 'bg-success', UPI: 'bg-info', Card: 'bg-subtle', Credit: 'bg-warning', B2B: 'bg-info', B2C: 'bg-primary' };

type Series = Extract<ReportChart, { kind: 'area' | 'bars' }>;

function TimeChart({ chart }: { chart: Series }) {
  const id = useId().replace(/:/g, '');
  const rows = chart.points.map((p) => ({ label: p.label, value: p.value }));
  const interval = Math.max(0, Math.ceil(rows.length / 10) - 1);
  const common = (
    <>
      <CartesianGrid vertical={false} style={{ stroke: 'rgb(var(--line))' }} />
      <XAxis dataKey="label" tickFormatter={dayLabel} interval={interval} tickLine={false} axisLine={false} tick={tick} />
      <YAxis tickFormatter={chart.money ? rupeeAxis : undefined} tickLine={false} axisLine={false} width={chart.money ? 56 : 36} tick={tick} />
      <RTooltip
        cursor={{ style: { fill: 'rgb(var(--primary) / 0.06)', stroke: 'rgb(var(--line-strong))' } }}
        content={({ active, payload }) => active && payload?.length ? (
          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
            <div className="text-muted">{dayLabel(String(payload[0].payload.label))}</div>
            <div className="num text-sm font-semibold text-ink">{fmt(chart.money, Number(payload[0].value))}</div>
          </div>
        ) : null}
      />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart.kind === 'area' ? (
        <AreaChart data={rows} margin={{ top: 6, right: 12, left: -4, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'rgb(var(--primary))', stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(var(--primary))', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {common}
          <Area type="monotone" isAnimationActive={false} dataKey="value" strokeWidth={2} fill={`url(#${id})`} style={{ stroke: 'rgb(var(--primary))' }} activeDot={{ r: 4, style: { fill: 'rgb(var(--primary))' } }} />
        </AreaChart>
      ) : (
        <BarChart data={rows} margin={{ top: 6, right: 12, left: -4, bottom: 0 }}>
          {common}
          <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={28} style={{ fill: 'rgb(var(--primary))' }} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function HBars({ chart }: { chart: Series }) {
  const max = Math.max(1, ...chart.points.map((p) => p.value));
  const two = chart.points.length > 5;
  return (
    <ul
      className={cn('grid h-full gap-y-0.5', two ? 'grid-flow-col gap-x-8' : 'auto-rows-fr')}
      style={two ? { gridTemplateRows: `repeat(${Math.ceil(chart.points.length / 2)}, minmax(0,1fr))`, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' } : undefined}
    >
      {chart.points.map((p, i) => (
        <li key={`${p.label}-${i}`} className="grid min-h-0 grid-cols-[minmax(90px,170px)_minmax(0,1fr)_80px] items-center gap-3 text-xs">
          <span className="truncate text-muted">{p.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (Math.max(0, p.value) / max) * 100)}%` }} /></span>
          <span className="num text-right font-semibold text-ink">{chart.money ? `₹${formatPaise(p.value, { decimals: false })}` : p.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Split({ chart }: { chart: Extract<ReportChart, { kind: 'split' }> }) {
  const total = Math.max(1, chart.parts.reduce((s, p) => s + p.value, 0));
  const cls = (label: string, i: number) => named[label] ?? palette[i % palette.length];
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex h-4 overflow-hidden rounded-full bg-line">
        {chart.parts.map((p, i) => <div key={p.label} className={cls(p.label, i)} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-2">
        {chart.parts.map((p, i) => (
          <div key={p.label} className="text-xs">
            <div className="flex items-center gap-1.5 text-muted"><span className={cn('h-2 w-2 rounded-full', cls(p.label, i))} />{p.label}</div>
            <div className="num text-sm font-semibold text-ink">₹{formatPaise(p.value, { decimals: false })} <span className="text-xs font-normal text-subtle">{((p.value / total) * 100).toFixed(1)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heat({ chart }: { chart: Extract<ReportChart, { kind: 'heat' }> }) {
  const max = Math.max(1, ...chart.cells.flat());
  const cols = `36px repeat(${chart.cols.length}, minmax(0,1fr))`;
  return (
    <div className="flex h-full flex-col gap-[2px]">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: cols }}>
        <span />
        {chart.cols.map((c) => <div key={c} className="text-center text-[11px] text-subtle num">{c}</div>)}
      </div>
      {chart.rows.map((r, ri) => (
        <div key={r} className="grid min-h-0 flex-1 items-stretch gap-[2px]" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-center text-[10px] leading-none text-subtle">{r}</div>
          {chart.cells[ri].map((v, ci) => (
            <div
              key={ci} title={`${r} ${chart.cols[ci]}:00 - ₹${formatPaise(v, { decimals: false })}`}
              className="rounded-[3px]"
              style={{ background: v ? `rgb(var(--primary) / ${(0.1 + 0.9 * (v / max)).toFixed(2)})` : 'rgb(var(--surface-3))' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReportChartView({ chart }: { chart: ReportChart }) {
  switch (chart.kind) {
    case 'area': return <TimeChart chart={chart} />;
    case 'bars': return chart.points.length > 0 && isDate(chart.points[0].label) ? <TimeChart chart={chart} /> : <HBars chart={chart} />;
    case 'split': return <Split chart={chart} />;
    case 'heat': return <Heat chart={chart} />;
  }
}
