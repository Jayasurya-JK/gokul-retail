import { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, Flame, PackageOpen, Plus, Warehouse, Wheat } from 'lucide-react';
import { type Barrel, type GodownBarrel, type PackRun, type PressingBatch, type SeedProfile, type SeedType } from '@gokul/data';
import {
  Badge, Button, DataTable, EmptyState, FilterBar, PageHeader, Select, TabPanel, Tabs, cn, type ColumnDef, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { PressingForm } from '../components/purchasing/PressingForm';
import { PackForm } from '../components/purchasing/PackForm';
import { PressingGrid } from '../components/purchasing/PressingGrid';
import { JobWorkPane } from '../components/purchasing/JobWorkPane';
import { GodownPane } from '../components/purchasing/GodownPane';
import {
  BarrelStrip, fmtDate, fmtDateYear, fmtMilli, fmtNum, fmtTime, gradeTone, phaseInfo, SectionLabel, seedColor, useKeys,
} from '../components/purchasing/common';

/* ---------------- yield trend (bars per batch, norm line) ---------------- */
function YieldTrend({ batches, seed, selectedId, norm }: { batches: PressingBatch[]; seed: SeedType; selectedId: string; norm: number }) {
  const list = batches.filter((b) => b.seed === seed).slice(0, 10).reverse();
  if (list.length < 2) return <div className="py-4 text-center text-xs text-subtle">Not enough batches yet.</div>;
  const lo = Math.min(norm, ...list.map((b) => b.metrics.yieldPct)) - 2;
  const hi = Math.max(norm, ...list.map((b) => b.metrics.yieldPct)) + 1;
  const h = 84;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  return (
    <div>
      <div className="relative" style={{ height: h }}>
        <div className="absolute inset-x-0 border-t border-dashed border-subtle" style={{ top: y(norm) }} />
        <span className="absolute right-0 rounded bg-surface px-1 text-[10px] font-medium text-muted" style={{ top: y(norm) - 7 }}>Norm {fmtNum(norm)}%</span>
        <div className="flex h-full items-end gap-1.5 pr-14">
          {list.map((b) => (
            <div key={b.id} className="group relative flex h-full flex-1 items-end" title={`${b.number}: ${fmtNum(b.metrics.yieldPct)}%`}>
              <div
                className={cn('w-full rounded-t-sm', b.id === selectedId ? 'ring-2 ring-primary/40' : '', b.metrics.grade === 'good' ? 'bg-success' : b.metrics.grade === 'low' ? 'bg-warning' : 'bg-danger')}
                style={{ height: Math.max(4, h - y(b.metrics.yieldPct)) }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pr-14 text-[10px] text-subtle"><span>{fmtDate(list[0].date)}</span><span>{fmtDate(list[list.length - 1].date)}</span></div>
    </div>
  );
}

/* ---------------- batch detail ---------------- */
function BatchDetail({ b, all, profiles, onOpenGodown }: { b: PressingBatch; all: PressingBatch[]; profiles: SeedProfile[]; onOpenGodown: () => void }) {
  const m = b.metrics;
  const phase = phaseInfo[b.phase];
  const base = m.netSeedKg + b.jaggeryKg / 1000;
  const parts = [
    { l: 'Oil', v: m.oilKg, cls: 'bg-primary' },
    { l: 'Oil cake', v: b.cakeKg / 1000, cls: 'bg-warning' },
    { l: 'Loss', v: Math.max(0, m.lossKg), cls: 'bg-danger' },
  ];
  const prof = profiles.find((p) => p.seed === b.seed);
  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-md font-semibold text-ink">{b.number}<Badge tone={phase.tone}>{phase.label}</Badge></div>
            <div className="mt-0.5 text-sm text-muted">{b.seedLabel} to {b.oilName}</div>
            <div className="text-xs text-subtle">
              {fmtDateYear(b.date)}, {fmtTime(b.date)} - {(b.machine ?? 'W') === 'R' ? 'R · Rotary' : 'W · Wood-pressed'} - {b.chekku} - {b.operator}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-muted">Yield (oil weight / clean seed)</div>
            <div className="flex items-baseline gap-2">
              <span className={cn('num text-3xl font-semibold', m.grade === 'good' ? 'text-success' : m.grade === 'low' ? 'text-warning' : 'text-danger')}>{fmtNum(m.yieldPct)}%</span>
              <Badge tone={gradeTone[m.grade]}>{m.variancePct >= 0 ? '+' : ''}{fmtNum(m.variancePct)}% vs norm</Badge>
            </div>
          </div>
          <div className="text-right text-xs text-muted"><div>Norm {fmtNum(m.normPct)}%</div><div className="num">{fmtNum(m.litresPer100Kg)} L per 100 kg</div></div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <SectionLabel>Where the seed went</SectionLabel>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
          {parts.map((p) => <div key={p.l} className={p.cls} style={{ width: `${(p.v / base) * 100}%` }} />)}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.l}>
              <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className={cn('h-2 w-2 rounded-full', p.cls)} />{p.l}</div>
              <div className="num text-sm font-semibold text-ink">{fmtNum(p.v)} kg</div>
              <div className="num text-[11px] text-subtle">{fmtNum((p.v / base) * 100)}%</div>
            </div>
          ))}
        </div>

        <dl className="mt-4 divide-y divide-line/70 text-sm">
          <Line k="Seed taken">{fmtMilli(b.seedKg)} kg</Line>
          <Line k="Cleaning loss">{fmtMilli(b.cleaningLossKg)} kg</Line>
          {b.jaggeryKg > 0 && <Line k="Palm jaggery added">{fmtMilli(b.jaggeryKg)} kg</Line>}
          <Line k="Raw oil out" strong>{fmtMilli(b.oilRawL)} L</Line>
          <Line k="Oil expected at norm">{fmtNum(m.expectedOilL)} L</Line>
          <Line k="Oil cake out">{fmtMilli(b.cakeKg)} kg</Line>
          <Line k="Clear oil after settling" strong>{b.clearOilL !== null ? `${fmtMilli(b.clearOilL)} L` : 'Not filtered yet'}</Line>
          {b.sedimentL !== null && <Line k="Sediment (kasadu)">{fmtMilli(b.sedimentL)} L ({fmtNum((b.sedimentL / b.oilRawL) * 100)}%)</Line>}
          <Line k="Godown barrel" strong>{b.godownBarrelLabel ?? '—'}</Line>
          {b.barrelLabel && <Line k="Old store barrel">{b.barrelLabel}</Line>}
        </dl>

        {b.phase !== 'in-barrel' && b.phase !== 'in-godown' && (
          <div className="mt-4 rounded-card border border-line bg-surface-2 p-3">
            <div className="text-sm font-medium text-ink">Oil not in a godown barrel</div>
            <p className="mt-0.5 text-xs text-muted">
              This batch was recorded before oil went straight into a godown barrel. New batches fill a barrel from the pressing form, and oil reaches the shop only by Transfer to store.
            </p>
            <Button className="mt-2" size="sm" icon={<Warehouse size={14} />} onClick={onOpenGodown}>Open Godown</Button>
          </div>
        )}

        <div className="mt-5">
          <SectionLabel right={<span className="font-normal normal-case tracking-normal">last 10 {b.seedLabel.split(' ')[0]} batches</span>}>Yield trend</SectionLabel>
          <YieldTrend batches={all} seed={b.seed} selectedId={b.id} norm={prof ? (prof.density / prof.kgPerL) * 100 : m.normPct} />
        </div>
      </div>
    </div>
  );
}
function Line({ k, children, strong }: { k: string; children: React.ReactNode; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className={cn('num text-right', strong ? 'font-semibold text-ink' : 'text-ink')}>{children}</dd></div>;
}

const pressCols: ColumnDef<PressingBatch>[] = [
  {
    id: 'batch', header: 'Batch', accessorFn: (r) => r.date, meta: { w: '140px' },
    cell: (c) => <div className="leading-tight"><div className="font-medium text-ink">{c.row.original.number}</div><div className="text-xs text-muted">{fmtDate(c.row.original.date)}, {fmtTime(c.row.original.date)}</div></div>,
  },
  {
    id: 'seed', header: 'Seed', accessorFn: (r) => r.seedLabel, meta: { w: 'minmax(90px,1fr)' },
    cell: (c) => <span className="flex items-center gap-2"><span className={cn('h-2 w-2 shrink-0 rounded-full', seedColor[c.row.original.seed])} /><span className="truncate font-medium text-ink">{c.row.original.seedLabel}</span></span>,
  },
  { id: 'in', header: 'Seed in', accessorFn: (r) => r.seedKg, meta: { w: '76px', align: 'right', num: true }, cell: (c) => `${fmtMilli(c.row.original.seedKg, 0)} kg` },
  { id: 'oil', header: 'Raw oil', accessorFn: (r) => r.oilRawL, meta: { w: '76px', align: 'right', num: true }, cell: (c) => `${fmtMilli(c.row.original.oilRawL)} L` },
  { id: 'yield', header: 'Yield', accessorFn: (r) => r.metrics.yieldPct, meta: { w: '64px', align: 'right', num: true }, cell: (c) => `${fmtNum(c.row.original.metrics.yieldPct)}%` },
  {
    id: 'vs', header: 'vs norm', accessorFn: (r) => r.metrics.variancePct, meta: { w: '80px', align: 'right' },
    cell: (c) => { const m = c.row.original.metrics; return <Badge tone={gradeTone[m.grade]}>{m.variancePct >= 0 ? '+' : ''}{fmtNum(m.variancePct)}%</Badge>; },
  },
  { id: 'op', header: 'Operator', accessorFn: (r) => r.operator, meta: { w: '110px' }, cell: (c) => <span className="truncate text-ink">{c.row.original.operator || '-'}</span> },
  {
    id: 'barrel', header: 'Godown barrel', accessorFn: (r) => r.godownBarrelLabel ?? '', meta: { w: '120px' },
    cell: (c) => <span className="truncate text-ink">{c.row.original.godownBarrelLabel ?? <span className="text-subtle">not in a barrel</span>}</span>,
  },
];

/* ---------------- packing ---------------- */
function packSummary(r: PackRun) {
  return r.lines.map((l) => `${l.count} x ${l.label}`).join(', ');
}

const packCols: ColumnDef<PackRun>[] = [
  {
    id: 'run', header: 'Run', accessorFn: (r) => r.date, meta: { w: '140px' },
    cell: (c) => <div className="leading-tight"><div className="font-medium text-ink">{c.row.original.number}</div><div className="text-xs text-muted">{fmtDate(c.row.original.date)}, {fmtTime(c.row.original.date)}</div></div>,
  },
  {
    id: 'src', header: 'Oil and barrel', accessorFn: (r) => r.oilName, meta: { w: '150px' },
    cell: (c) => <div className="leading-tight"><div className="truncate font-medium text-ink">{c.row.original.oilName}</div><div className="text-xs text-muted">{c.row.original.barrelLabel}</div></div>,
  },
  { id: 'packs', header: 'Packs filled', accessorFn: (r) => r.packs, meta: { w: 'minmax(120px,1fr)' }, cell: (c) => <span className="text-ink">{packSummary(c.row.original)}</span> },
  { id: 'exp', header: 'In packs', accessorFn: (r) => r.expectedL, meta: { w: '76px', align: 'right', num: true }, cell: (c) => `${fmtMilli(c.row.original.expectedL)} L` },
  { id: 'used', header: 'Taken', accessorFn: (r) => r.usedL, meta: { w: '76px', align: 'right', num: true }, cell: (c) => `${fmtMilli(c.row.original.usedL)} L` },
  {
    id: 'waste', header: 'Wastage', accessorFn: (r) => r.wastagePct, meta: { w: '108px', align: 'right' },
    cell: (c) => {
      const r = c.row.original;
      const tone = r.wastagePct <= 0.5 ? 'success' : r.wastagePct <= 1.5 ? 'warning' : 'danger';
      return <span className="inline-flex items-center gap-2"><span className="num text-xs text-muted">{fmtNum(r.wastageL / 1000, 2)} L</span><Badge tone={tone}>{fmtNum(r.wastagePct, 1)}%</Badge></span>;
    },
  },
];

function PackDetail({ r }: { r: PackRun }) {
  const tone = r.wastagePct <= 0.5 ? 'success' : r.wastagePct <= 1.5 ? 'warning' : 'danger';
  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="text-md font-semibold text-ink">{r.number}</div>
        <div className="mt-0.5 text-sm text-muted">{r.oilName} from {r.barrelLabel}</div>
        <div className="text-xs text-subtle">{fmtDateYear(r.date)}, {fmtTime(r.date)} - packed by {r.packer}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2"><div className="text-xs text-muted">In packs</div><div className="num text-lg font-semibold text-ink">{fmtMilli(r.expectedL)} L</div></div>
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2"><div className="text-xs text-muted">Taken</div><div className="num text-lg font-semibold text-ink">{fmtMilli(r.usedL)} L</div></div>
          <div className="rounded-card border border-line bg-surface-2 px-3 py-2"><div className="text-xs text-muted">Wastage</div><div className="flex items-center gap-1.5"><span className="num text-lg font-semibold text-ink">{fmtNum(r.wastageL / 1000, 2)}</span><Badge tone={tone}>{fmtNum(r.wastagePct, 1)}%</Badge></div></div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <SectionLabel>Added to stock</SectionLabel>
        <div className="overflow-hidden rounded-card border border-line">
          {r.lines.map((l, i) => (
            <div key={l.itemId} className={cn('flex items-center justify-between gap-3 px-3 py-2 text-sm', i > 0 && 'border-t border-line/70')}>
              <div className="min-w-0"><div className="truncate font-medium text-ink">{l.name}</div><div className="num text-xs text-muted">{fmtNum((l.sizeMl * l.count) / 1000)} L of oil</div></div>
              <span className="num shrink-0 text-md font-semibold text-ink">{l.count}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-subtle">Usual wastage is up to 0.5%. Higher means spills, tap drips or a miscount. Check the barrel with a dip stick.</p>
      </div>
    </div>
  );
}

/* ---------------- godown chips on the Pressing tab: where the oil goes, and what is settling ---------------- */
function GodownChips({ barrels, onOpen }: { barrels: GodownBarrel[]; onOpen: () => void }) {
  const oils: { seed: SeedType; label: string }[] = [{ seed: 'groundnut', label: 'Groundnut' }, { seed: 'sesame', label: 'Sesame' }, { seed: 'copra', label: 'Coconut' }];
  return (
    <div className="flex items-center gap-2">
      {oils.map(({ seed, label }) => {
        const list = barrels.filter((b) => b.active && b.oil === seed && b.levelL > 0);
        const litres = list.reduce((a, b) => a + b.levelL, 0);
        const settling = list.filter((b) => b.status === 'settling').length;
        const ready = list.filter((b) => b.status === 'ready').length;
        return (
          <button key={seed} type="button" onClick={onOpen} title="Open the Godown tab" className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-left text-xs hover:bg-surface-2">
            <span className="flex items-center gap-1.5 text-muted"><span className={cn('h-2 w-2 rounded-full', seedColor[seed])} />{label} oil in godown</span>
            <span className="num text-right"><span className="font-semibold text-ink">{fmtMilli(litres, 0)} L</span>{(settling > 0 || ready > 0) && <span className="ml-2 text-muted">{settling > 0 ? `${settling} settling` : ''}{settling > 0 && ready > 0 ? ', ' : ''}{ready > 0 ? `${ready} ready` : ''}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- page ---------------- */
export function Production() {
  const [tab, setTab] = useState('pressing');
  const [batches, setBatches] = useState<PressingBatch[]>([]);
  const [runs, setRuns] = useState<PackRun[]>([]);
  const [barrels, setBarrels] = useState<Barrel[]>([]);
  const [godownBarrels, setGodownBarrels] = useState<GodownBarrel[]>([]);
  const [godownSelId, setGodownSelId] = useState<string | null>(null);
  const [godownKey, setGodownKey] = useState(0);
  const [profiles, setProfiles] = useState<SeedProfile[]>([]);
  const [selBatch, setSelBatch] = useState<string | null>(null);
  const [selRun, setSelRun] = useState<string | null>(null);
  const [seedFilter, setSeedFilter] = useState('all');
  const [operators, setOperators] = useState<string[]>([]);
  const [newBatch, setNewBatch] = useState(false);
  const [newPack, setNewPack] = useState(false);
  const [packBarrel, setPackBarrel] = useState<string | null>(null);

  const load = useCallback(async (opts?: { batch?: string; run?: string }) => {
    const [b, r, br, p, g] = await Promise.all([
      api.listPressingBatches(), api.listPackRuns(), api.listBarrels(), api.listSeedProfiles(), api.listGodownBarrels(),
    ]);
    setBatches(b); setRuns(r); setBarrels(br); setProfiles(p); setGodownBarrels(g);
    setSelBatch((c) => opts?.batch ?? c ?? b[0]?.id ?? null);
    setSelRun((c) => opts?.run ?? c ?? r[0]?.id ?? null);
  }, []);
  useEffect(() => { void load(); void api.getSettingsBundle().then((b) => setOperators(b.mill.operators)).catch(() => undefined); }, [load]);
  useRefreshOnFocus(() => { void load(); });

  const shown = useMemo(() => batches.filter((b) => seedFilter === 'all' || b.seed === seedFilter), [batches, seedFilter]);
  const batch = batches.find((b) => b.id === selBatch) ?? null;
  const run = runs.find((r) => r.id === selRun) ?? null;

  const month = useMemo(() => {
    const cut = Date.now() - 30 * 86400000;
    const recent = batches.filter((b) => new Date(b.date).getTime() >= cut);
    const seed = recent.reduce((a, b) => a + b.seedKg, 0);
    const oil = recent.reduce((a, b) => a + b.oilRawL, 0);
    return { n: recent.length, seed, oil, low: recent.filter((b) => b.metrics.grade !== 'good').length };
  }, [batches]);

  const start = () => (tab === 'pressing' ? setNewBatch(true) : tab === 'packing' ? (setPackBarrel(null), setNewPack(true)) : undefined);
  useKeys((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); start(); } });

  /** In the Godown tab the strip shows the production barrels, so a click can pick the side panel's barrel. */
  const godownStrip = useMemo<Barrel[]>(() => godownBarrels.map((g) => ({
    id: g.id, label: g.label, seed: g.oil, oilName: g.oilName,
    capacityL: g.capacityL, levelL: g.levelL, filledOn: g.filledOn,
  })), [godownBarrels]);

  return (
    <>
      <PageHeader
        title="Production" icon={<Factory size={17} />}
        subtitle={`${month.n} pressing batches in 30 days, ${fmtMilli(month.oil, 0)} L oil from ${fmtMilli(month.seed, 0)} kg seed`}
        actions={tab === 'godown' || tab === 'jobwork' ? undefined : (
          <Button icon={<Plus size={15} />} kbd="Ctrl+N" onClick={start}>{tab === 'pressing' ? 'Batch with details' : 'New packing run'}</Button>
        )}
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-bg px-4 py-3">
        <div className="min-w-0 flex-1">
          {tab === 'pressing' ? <GodownChips barrels={godownBarrels} onOpen={() => setTab('godown')} /> : tab === 'jobwork' ? <GodownChips barrels={godownBarrels} onOpen={() => setTab('godown')} /> : (
            <BarrelStrip
              barrels={tab === 'godown' ? godownStrip : barrels}
              selectedId={tab === 'godown' ? godownSelId : run?.barrelId}
              onPick={tab === 'godown' ? (b) => setGodownSelId(b.id) : undefined}
            />
          )}
        </div>
        <div className="flex w-[248px] shrink-0 flex-col gap-1.5">
          {profiles.map((p) => (
            <div key={p.seed} className="flex items-center justify-between rounded-md border border-line bg-surface px-2.5 py-1 text-xs">
              <span className="flex items-center gap-1.5 text-muted"><span className={cn('h-2 w-2 rounded-full', seedColor[p.seed])} />{p.label} in godown</span>
              <span className={cn('num font-semibold', p.stock < 300000 ? 'text-warning' : 'text-ink')}>{fmtMilli(p.stock, 0)} kg</span>
            </div>
          ))}
        </div>
      </div>
      <Tabs
        value={tab} onValueChange={setTab} className="min-h-0 flex-1"
        tabs={[
          { value: 'pressing', label: <><Flame size={14} />Pressing</>, count: batches.length },
          { value: 'godown', label: <><Warehouse size={14} />Godown</> },
          { value: 'packing', label: <><PackageOpen size={14} />Packing</>, count: runs.length },
          { value: 'jobwork', label: <><Wheat size={14} />Job work</> },
        ]}
      >
        <TabPanel value="pressing" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <PressingGrid profiles={profiles} barrels={godownBarrels} operators={operators} onSaved={(saved) => { setGodownKey((k) => k + 1); void load({ batch: saved[0]?.id }); }} />
          <FilterBar
            trailing={<span>{month.low > 0 && <span className="mr-3 font-medium text-warning">{month.low} low yield in 30 days</span>}{shown.length} shown</span>}
          >
            <Select value={seedFilter} onChange={(e) => setSeedFilter(e.target.value)} options={[{ value: 'all', label: 'All seeds' }, ...profiles.map((p) => ({ value: p.seed, label: p.label }))]} />
          </FilterBar>
          <div className="flex min-h-0 flex-1">
            <DataTable
              data={shown} columns={pressCols} getRowId={(r) => r.id} selectedId={selBatch} onSelect={(r) => setSelBatch(r.id)} rowHeight={44}
              empty={<EmptyState icon={<Flame size={22} />} title="No batches match" hint="Change the seed or stage filter, or record a new pressing batch." />}
            />
            {batch && <BatchDetail b={batch} all={batches} profiles={profiles} onOpenGodown={() => setTab('godown')} />}
          </div>
        </TabPanel>
        <TabPanel value="godown" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <GodownPane reloadKey={godownKey} onBarrels={setGodownBarrels} selectedId={godownSelId} onSelect={setGodownSelId} />
        </TabPanel>
        <TabPanel value="jobwork" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <JobWorkPane />
        </TabPanel>
        <TabPanel value="packing" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
          <FilterBar trailing={<span>{runs.length} packing runs</span>}>
            <span className="text-sm text-muted">Loose oil from a barrel into bottles and tins. Packs are added to item stock.</span>
          </FilterBar>
          <div className="flex min-h-0 flex-1">
            <DataTable
              data={runs} columns={packCols} getRowId={(r) => r.id} selectedId={selRun} onSelect={(r) => setSelRun(r.id)} rowHeight={44}
              empty={<EmptyState icon={<PackageOpen size={22} />} title="No packing runs yet" hint="Record the first one with Ctrl+N." />}
            />
            {run && <PackDetail r={run} />}
          </div>
        </TabPanel>
      </Tabs>

      <PressingForm
        open={newBatch} profiles={profiles} barrels={godownBarrels}
        onClose={() => setNewBatch(false)}
        onSaved={(b) => { setTab('pressing'); setGodownKey((k) => k + 1); void load({ batch: b.id }); }}
      />
      <PackForm open={newPack} barrels={barrels} initialBarrelId={packBarrel} onClose={() => setNewPack(false)} onSaved={(r) => { setTab('packing'); void load({ run: r.id }); }} />
    </>
  );
}
