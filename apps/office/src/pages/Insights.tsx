import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Coins, Droplets, Factory, Gauge, Package, SlidersHorizontal, Target, Wheat } from 'lucide-react';
import { type MillAnalysis, type PressingBatch, type SeedProfile, type SeedType } from '@gokul/data';
import { Button, Dialog, EmptyState, FilterBar, Input, PageHeader, StatTile, cn, useRefreshOnFocus } from '@gokul/ui';
import { api } from '../store';
import { isoDay } from '../components/crm/common';
import { NormsEditor } from '../components/purchasing/NormsEditor';
import { GodownAgeing, LowBatches, SeedCover, TrendCard, YieldTable, fmt, rupees, signedPct } from '../components/mill/analysis/parts';

type Period = 'today' | 'week' | 'month' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];
const SEEDS: { value: SeedType | 'all'; label: string }[] = [
  { value: 'all', label: 'All seeds' },
  { value: 'groundnut', label: 'Groundnut' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'copra', label: 'Coconut' },
];

const longDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function rangeFor(period: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  if (period === 'today') return { from: isoDay(now), to: isoDay(now) };
  if (period === 'week') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: isoDay(now) };
  if (period === 'month') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center rounded-control border border-line-strong bg-surface p-0.5" role="group" aria-label={label}>
      {options.map((p) => (
        <button
          key={p.value} type="button" aria-pressed={value === p.value} onClick={() => onChange(p.value)}
          className={cn('h-7 rounded-[6px] px-2.5 text-sm font-medium transition-colors', value === p.value ? 'bg-primary text-primary-fg shadow-sm' : 'text-muted hover:text-ink')}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Mill analysis: yield against the norm, value, cost per litre, godown settling, seed cover and low batches.
 * All the maths is done by the backend (`getMillAnalysis`); this page only picks the period and draws it.
 */
export function Insights() {
  const navigate = useNavigate();
  const [data, setData] = useState<MillAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [seed, setSeed] = useState<SeedType | 'all'>('all');
  const [custom, setCustom] = useState(() => {
    const now = new Date();
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  });
  const [thresholdText, setThresholdText] = useState('5');
  const threshold = Math.min(30, Math.max(0, Number(thresholdText) || 0));
  const [norms, setNorms] = useState(false);
  const [profiles, setProfiles] = useState<SeedProfile[]>([]);
  const [batches, setBatches] = useState<PressingBatch[]>([]);
  const { from, to } = rangeFor(period, custom);
  const today = isoDay(new Date());

  const load = useCallback(() => {
    api.getMillAnalysis({ from, to, seed, thresholdPct: threshold })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the analysis'));
  }, [from, to, seed, threshold]);
  useEffect(() => { load(); }, [load]);
  useRefreshOnFocus(load);

  const openNorms = () => {
    void Promise.all([api.listSeedProfiles(), api.listPressingBatches()]).then(([p, b]) => { setProfiles(p); setBatches(b); setNorms(true); });
  };

  const t = data?.totals;
  const none = !t || t.batches === 0;
  const empty = useMemo(() => (
    <EmptyState icon={<Factory size={22} />} title="No pressing batches in this period" hint="Widen the period or pick a custom range. Pressings entered in Production show up here." />
  ), []);
  const rangeLabel = from === to ? longDay(from) : `${longDay(from)} to ${longDay(to)}`;

  return (
    <>
      <PageHeader
        title="Mill analysis" icon={<Gauge size={17} />}
        subtitle={`${rangeLabel} - yield, value, cost, godown and seed stock`}
        actions={<Button icon={<SlidersHorizontal size={15} />} onClick={openNorms}>Set norms</Button>}
      />
      {error && <div className="shrink-0 border-b border-danger/30 bg-danger-soft px-5 py-2 text-sm text-danger" role="alert">{error}</div>}

      <FilterBar
        trailing={
          <label className="flex items-center gap-1.5">
            <span>Flag batches more than</span>
            <Input
              type="number" size="sm" min={0} max={30} step={0.5} aria-label="Low-yield threshold, percent below norm"
              value={thresholdText} className="num w-16 text-right"
              onChange={(e) => setThresholdText(e.target.value)} onBlur={() => setThresholdText(String(threshold))}
            />
            <span>% below norm</span>
          </label>
        }
      >
        <Chips label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <Chips label="Seed" value={seed} options={SEEDS} onChange={setSeed} />
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarDays size={14} className="text-subtle" />
            <Input type="date" size="sm" aria-label="From date" className="num w-[132px]" value={custom.from} max={custom.to <= today ? custom.to : today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span>to</span>
            <Input type="date" size="sm" aria-label="To date" className="num w-[132px]" value={custom.to} min={custom.from} max={today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </FilterBar>

      <div className="grid shrink-0 grid-cols-5 gap-2 border-b border-line bg-bg px-4 py-2">
        <StatTile label="Seed pressed" icon={<Wheat size={14} />} value={none ? '-' : `${fmt(t.cleanSeedKg)} kg`} hint={none ? 'no pressings' : `${t.batches} batch${t.batches === 1 ? '' : 'es'}`} />
        <StatTile label="Oil out" icon={<Droplets size={14} />} value={none ? '-' : `${fmt(t.oilL)} L`} hint="raw oil from the press" />
        <StatTile
          label="Litres from 100 kg" icon={<Target size={14} />} value={none ? '-' : t.litresPer100Kg.toFixed(1)}
          delta={none ? undefined : t.variancePct} deltaLabel={none ? 'no pressings' : `norm ${t.normPer100Kg.toFixed(1)}`}
        />
        <StatTile label="Cake out" icon={<Package size={14} />} value={none ? '-' : `${fmt(t.cakeKg)} kg`} hint="punnaku made" />
        <StatTile
          label="Output value" icon={<Coins size={14} />} value={none || !t.oilPriceKnown ? '-' : rupees(t.outputValue)}
          hint={none ? 'no pressings' : !t.oilPriceKnown ? 'add the loose oil prices' : `oil ${rupees(t.oilValue)}, cake ${rupees(t.cakeValue)}`}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 overflow-hidden bg-bg p-3">
        {data ? (
          <>
            <div className="col-span-2 min-h-0 [&>section]:h-full"><YieldTable a={data} empty={empty} /></div>
            <div className="min-h-0 [&>section]:h-full"><TrendCard a={data} empty={empty} /></div>
            <div className="min-h-0 [&>section]:h-full"><GodownAgeing a={data} /></div>
            <div className="min-h-0 [&>section]:h-full"><SeedCover a={data} /></div>
            <div className="min-h-0 [&>section]:h-full"><LowBatches a={data} onOpen={() => navigate('/production')} /></div>
          </>
        ) : null}
      </div>
      {!none && t.variancePct !== 0 && <span className="sr-only">Yield is {signedPct(t.variancePct)} against the norm</span>}

      <Dialog open={norms} onOpenChange={setNorms} title="Production norms" description="What each batch and packing run is judged against" size="xl" bodyClassName="p-3">
        <NormsEditor profiles={profiles} batches={batches} onSaved={() => { void api.listSeedProfiles().then(setProfiles); load(); }} />
      </Dialog>
    </>
  );
}
