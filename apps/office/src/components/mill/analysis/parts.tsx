import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronRight, CircleCheck, Factory } from 'lucide-react';
import { formatRupees, type AnalysisBarrel, type AnalysisRow, type MillAnalysis, type SeedType } from '@gokul/data';
import { Badge, Button, Card, EmptyState, cn } from '@gokul/ui';

export const fmt = (n: number, d = 1) => n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1)}%`;
export const rupees = (paise: number) => formatRupees(paise, { decimals: false });
const shortDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const varianceTone = (v: number, threshold: number) => (v < -threshold ? 'text-danger' : v < 0 ? 'text-warning' : 'text-success');
const th = 'h-8 px-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const td = 'px-2 py-1 text-right text-sm text-ink num whitespace-nowrap';

const SEED_LINE: Record<SeedType, string> = { groundnut: 'rgb(var(--warning))', sesame: 'rgb(var(--ink))', copra: 'rgb(var(--info))' };
const SEED_NAME: Record<SeedType, string> = { groundnut: 'Groundnut', sesame: 'Sesame', copra: 'Coconut' };
const SEEDS: SeedType[] = ['groundnut', 'sesame', 'copra'];

/* ---------------- yield vs norm table (seed > machine > operator) ---------------- */
export function YieldTable({ a, empty }: { a: MillAnalysis; empty: React.ReactNode }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [net, setNet] = useState(false);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cost = (r: AnalysisRow) => {
    const v = net ? r.netCostPerL : r.costPerL;
    return v === null ? '-' : `${rupees(v)}${r.costEstimated ? ' est.' : ''}`;
  };
  const line = (r: AnalysisRow, depth: number, k: string, canOpen: boolean) => (
    <tr key={k} className="border-b border-line last:border-0 hover:bg-surface-2">
      <td className="py-1 pr-2 text-sm text-ink" style={{ paddingLeft: 12 + depth * 18 }}>
        {canOpen ? (
          <button type="button" aria-expanded={open.has(k)} onClick={() => toggle(k)} className="flex items-center gap-1 font-medium">
            {open.has(k) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{r.label}
          </button>
        ) : <span className={cn(depth > 0 && 'text-muted')}>{r.label}</span>}
      </td>
      <td className={td}>{r.batches}</td>
      <td className={td}>{fmt(r.cleanSeedKg)}</td>
      <td className={td}>{fmt(r.oilL)}</td>
      <td className={cn(td, 'font-semibold')}>{r.litresPer100Kg.toFixed(1)}</td>
      <td className={cn(td, 'text-muted')}>{r.normPer100Kg.toFixed(1)}</td>
      <td className={cn(td, 'font-semibold', varianceTone(r.variancePct, a.thresholdPct))}>{signedPct(r.variancePct)}</td>
      <td className={td}>{fmt(r.cakeKg)}</td>
      <td className={td}>{cost(r)}</td>
      <td className={td}>{r.lowBatches > 0 ? <Badge tone="danger">{r.lowBatches}</Badge> : <span className="text-subtle">0</span>}</td>
    </tr>
  );
  const rows: React.ReactNode[] = [];
  for (const s of a.seeds) {
    rows.push(line(s, 0, s.key, !!s.children?.length));
    if (open.has(s.key)) {
      for (const m of s.children ?? []) {
        const mk = `${s.key}/${m.key}`;
        rows.push(line(m, 1, mk, !!m.children?.length));
        if (open.has(mk)) for (const o of m.children ?? []) rows.push(line(o, 2, `${mk}/${o.key}`, false));
      }
    }
  }
  return (
    <Card
      title="Yield against norm" className="min-h-0"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setNet((n) => !n)} aria-pressed={net}>
          {net ? 'Cost after cake credit' : 'Cost before cake credit'}
        </Button>
      }
      flush bodyClassName="overflow-auto"
    >
      {a.seeds.length === 0 ? empty : (
        <>
          <table className="w-full min-w-[640px] table-fixed">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr className="border-b border-line">
                <th className="h-8 pl-3 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">Seed, machine, operator</th>
                <th className={cn(th, 'w-[56px]')}>Batches</th>
                <th className={cn(th, 'w-[70px]')}>Seed kg</th>
                <th className={cn(th, 'w-[62px]')}>Oil L</th>
                <th className={cn(th, 'w-[74px]')} title="Litres of oil from 100 kg of clean seed">L / 100 kg</th>
                <th className={cn(th, 'w-[56px]')}>Norm</th>
                <th className={cn(th, 'w-[66px]')}>vs norm</th>
                <th className={cn(th, 'w-[62px]')}>Cake kg</th>
                <th className={cn(th, 'w-[92px]')}>Cost per L</th>
                <th className={cn(th, 'w-[48px]')}>Low</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
          <p className="px-3 py-1.5 text-[11px] text-subtle">Cost per litre uses the last purchase price of the seed. Click a seed to see its machines and operators.</p>
        </>
      )}
    </Card>
  );
}

/* ---------------- yield trend ---------------- */
export function TrendCard({ a, empty }: { a: MillAnalysis; empty: React.ReactNode }) {
  const seeds = useMemo(() => SEEDS.filter((s) => a.trend.some((t) => t.seed === s)), [a.trend]);
  const data = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (const t of a.trend) {
      const e = byDay.get(t.day) ?? { day: t.day };
      e[t.seed] = Number(t.litresPer100Kg.toFixed(2));
      e[`${t.seed}Norm`] = Number(t.normPer100Kg.toFixed(2));
      byDay.set(t.day, e);
    }
    return [...byDay.values()];
  }, [a.trend]);
  return (
    <Card
      title="Yield trend (L per 100 kg)" className="min-h-0"
      actions={
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-muted">
          {seeds.map((s) => <span key={s} className="flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: SEED_LINE[s] }} />{SEED_NAME[s]}</span>)}
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-line-strong" />Norm</span>
        </div>
      }
      bodyClassName="min-h-0 px-2 pb-2 pt-3"
    >
      {data.length === 0 ? empty : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 14, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} style={{ stroke: 'rgb(var(--line))' }} />
            <XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }} />
            <YAxis tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} tick={{ fontSize: 11, style: { fill: 'rgb(var(--subtle))' } }} />
            <RTooltip
              cursor={{ style: { stroke: 'rgb(var(--line-strong))' } }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Record<string, number | string>;
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                    <div className="text-muted">{shortDay(String(p.day))}</div>
                    {seeds.map((s) => p[s] !== undefined && (
                      <div key={s} className="num text-sm text-ink">{SEED_NAME[s]} {String(p[s])} L <span className="text-[11px] text-muted">(norm {String(p[`${s}Norm`])})</span></div>
                    ))}
                  </div>
                );
              }}
            />
            {seeds.map((s) => (
              <Line key={`${s}n`} type="monotone" dataKey={`${s}Norm`} isAnimationActive={false} dot={false} strokeWidth={1.2} strokeDasharray="5 4" style={{ stroke: SEED_LINE[s], opacity: 0.5 }} />
            ))}
            {seeds.map((s) => (
              <Line key={s} type="monotone" dataKey={s} isAnimationActive={false} connectNulls dot={{ r: 2.5, fill: SEED_LINE[s] }} strokeWidth={2} style={{ stroke: SEED_LINE[s] }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ---------------- godown and settling ---------------- */
const barrelText = (b: AnalysisBarrel) => {
  if (b.status === 'empty') return 'Empty';
  if (b.status === 'filling') return `Filling${b.fillingDays !== null ? `, day ${b.fillingDays + 1}` : ''}`;
  if (b.status === 'settling') return `Settling, day ${(b.daysSettling ?? 0) + 1} of ${b.settleDays}`;
  return b.readyWaitingDays ? `Ready, waiting ${b.readyWaitingDays} day${b.readyWaitingDays === 1 ? '' : 's'}` : 'Ready';
};
const OIL_BAR: Record<SeedType, string> = { groundnut: 'bg-warning', sesame: 'bg-ink', copra: 'bg-info' };

export function GodownAgeing({ a }: { a: MillAnalysis }) {
  const barrels = a.godown.filter((b) => b.levelL > 0 || b.status !== 'empty');
  return (
    <Card title="Godown and settling" actions={<span className="num text-xs text-muted">{fmt(barrels.reduce((s, b) => s + b.levelL, 0), 0)} L</span>} flush bodyClassName="overflow-y-auto">
      {barrels.length === 0 ? (
        <EmptyState icon={<Factory size={20} />} title="No oil in the godown" hint="Pressed oil appears here once it goes into a godown barrel." />
      ) : (
        <ul className="divide-y divide-line">
          {barrels.map((b) => (
            <li key={b.id} className="px-3 py-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-ink">{b.label} <span className="text-xs font-normal text-muted">{b.oilName}</span></span>
                <span className={cn('num shrink-0 text-xs', b.flag ? 'font-semibold text-danger' : 'text-muted')}>{barrelText(b)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full', OIL_BAR[b.oil])} style={{ width: `${Math.min(100, (b.levelL / Math.max(1, b.capacityL)) * 100)}%` }} />
                </div>
                <span className="num w-[84px] shrink-0 text-right text-[11px] text-muted">{fmt(b.levelL, 0)} of {fmt(b.capacityL, 0)} L</span>
              </div>
              {b.flag === 'stick-variance' && b.stickVarianceL !== null && (
                <div className="mt-0.5 text-[11px] text-danger">Stick was {fmt(Math.abs(b.stickVarianceL))} L {b.stickVarianceL < 0 ? 'short' : 'over'} of the entries</div>
              )}
              {b.flag === 'ready-waiting' && <div className="mt-0.5 text-[11px] text-danger">Settled oil is waiting to go to the store</div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- seed stock and days of cover ---------------- */
export function SeedCover({ a }: { a: MillAnalysis }) {
  return (
    <Card title="Seed stock and days of cover" flush bodyClassName="overflow-y-auto">
      {a.seedCover.length === 0 ? <EmptyState icon={<Factory size={20} />} title="No seed data" /> : (
        <ul className="divide-y divide-line">
          {a.seedCover.map((s) => (
            <li key={s.seed} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{s.label}</div>
                <div className="num text-[11px] text-muted">
                  {fmt(s.stockKg, 0)} kg in stock{s.pressingDays > 0 ? `, ${fmt(s.avgKgPerPressingDay, 0)} kg a pressing day` : ', not pressed lately'}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {s.daysOfCover === null ? <span className="text-sm text-subtle">-</span> : (
                  <>
                    <div className={cn('num text-md font-semibold leading-5', s.low ? 'text-danger' : 'text-ink')}>{fmt(s.daysOfCover, 1)} days</div>
                    {s.low && <div className="text-[11px] text-danger">Order seed soon</div>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- low batches ---------------- */
export function LowBatches({ a, onOpen }: { a: MillAnalysis; onOpen: () => void }) {
  return (
    <Card
      title="Low-yield batches"
      actions={<>
        <Badge tone={a.lowBatches.length ? 'danger' : 'success'}>{a.lowBatches.length}</Badge>
        <Button size="sm" variant="ghost" onClick={onOpen}>Open Production</Button>
      </>}
      flush bodyClassName="overflow-y-auto"
    >
      {a.lowBatches.length === 0 ? (
        <EmptyState icon={<CircleCheck size={20} />} title={`No batch is more than ${fmt(a.thresholdPct)}% below norm`} hint="Every pressing in this period is within the limit." />
      ) : (
        <ul className="divide-y divide-line">
          {a.lowBatches.map((b) => (
            <li key={b.id} className="px-3 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{SEED_NAME[b.seed]} <span className="text-xs font-normal text-muted">{b.machine === 'R' ? 'R rotary' : 'W chekku'}</span></div>
                  <div className="truncate text-[11px] text-muted">{shortDay(b.day)} - {b.number} - {b.operator || 'Operator not recorded'}</div>
                  {b.reason && <div className="truncate text-[11px] text-warning">{b.reason}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-sm font-semibold leading-4 text-danger">{signedPct(b.variancePct)}</div>
                  <div className="num text-[10px] leading-3 text-muted">{fmt(b.oilL)} of {fmt(b.expectedL)} L</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
