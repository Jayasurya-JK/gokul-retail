import { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, Flame, PackageOpen, Pencil, Plus, Warehouse, Wheat } from 'lucide-react';
import { type Barrel, type GodownBarrel, type PackRun, type PressingBatch, type SeedProfile, type SeedType } from '@gokul/data';
import {
  Badge, Button, DataTable, EmptyState, FilterBar, PageHeader, Select, TabPanel, Tabs, cn, type ColumnDef, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { PressingForm } from '../components/purchasing/PressingForm';
import { PackForm } from '../components/purchasing/PackForm';
import { DeleteRecord, useCanEditRecords } from '../components/purchasing/DeleteRecord';
import { JobWorkPane } from '../components/purchasing/JobWorkPane';
import { GodownPane } from '../components/purchasing/GodownPane';
import {
  fmtDate, fmtDateYear, fmtMilli, fmtNum, fmtTime, normPer100, phaseInfo, SectionLabel, seedColor, signedPct, useKeys, vsNormText, yieldTextCls, yieldTone,
} from '../components/purchasing/common';

/* ---------------- yield trend (bars per batch, norm line) ---------------- */
function YieldTrend({ batches, seed, selectedId, norm }: { batches: PressingBatch[]; seed: SeedType; selectedId: string; norm: number }) {
  const list = batches.filter((b) => b.seed === seed).slice(0, 10).reverse();
  if (list.length < 2) return <div className="py-4 text-center text-xs text-subtle">Not enough batches yet.</div>;
  const lo = Math.min(norm, ...list.map((b) => b.metrics.litresPer100Kg)) - 2;
  const hi = Math.max(norm, ...list.map((b) => b.metrics.litresPer100Kg)) + 1;
  const h = 84;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  return (
    <div>
      <div className="relative" style={{ height: h }}>
        <div className="absolute inset-x-0 border-t border-dashed border-subtle" style={{ top: y(norm) }} />
        <span className="absolute right-0 rounded bg-surface px-1 text-[10px] font-medium text-muted" style={{ top: y(norm) - 7 }}>Norm {fmtNum(norm)}</span>
        <div className="flex h-full items-end gap-1.5 pr-14">
          {list.map((b) => (
            <div key={b.id} className="group relative flex h-full flex-1 items-end" title={`${b.number}: ${fmtNum(b.metrics.litresPer100Kg)} L / 100 kg`}>
              <div
                className={cn('w-full rounded-t-sm', b.id === selectedId ? 'ring-2 ring-primary/40' : '', yieldTone(b.metrics.variancePct) === 'success' ? 'bg-success' : yieldTone(b.metrics.variancePct) === 'warning' ? 'bg-warning' : 'bg-danger')}
                style={{ height: Math.max(4, h - y(b.metrics.litresPer100Kg)) }}
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
function BatchDetail({ b, all, profiles, onOpenGodown, onEdit, onDeleted }: {
  b: PressingBatch; all: PressingBatch[]; profiles: SeedProfile[]; onOpenGodown: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const canEdit = useCanEditRecords();
  const m = b.metrics;
  const phase = phaseInfo[b.phase];
  const base = m.netSeedKg + b.jaggeryKg / 1000;
  const jagKg = b.jaggeryKg / 1000;
  const lossKg = Math.max(0, m.lossKg);
  const cakeKg = b.cakeKg / 1000;
  // Oil cake is a by-product, never a loss. Loss (moisture, foots) is only red above a normal range (about 10% of the seed, verify with the owner).
  const lossBad = m.lossPct > 10;
  const parts = [
    { l: 'Oil', v: m.oilKg, cls: 'bg-primary', main: `${fmtNum(b.oilRawL / 1000)} L`, sub: `(${fmtNum(m.oilKg)} kg)` },
    { l: 'Oil cake', v: cakeKg, cls: 'bg-info', main: `${fmtNum(cakeKg)} kg`, sub: '' },
    { l: 'Loss (moisture, foots)', v: lossKg, cls: lossBad ? 'bg-danger' : 'bg-line-strong', main: `${fmtNum(lossKg)} kg`, sub: `(${fmtNum(m.lossPct)}%)` },
  ];
  const norm100 = normPer100(m);
  const prof = profiles.find((p) => p.seed === b.seed);
  return (
    <div className="flex h-full w-[350px] shrink-0 flex-col border-l border-line bg-surface 2xl:w-[420px]">
      <div className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-md font-semibold text-ink">{b.number}<Badge tone={phase.tone}>{phase.label}</Badge></div>
            <div className="mt-0.5 text-sm text-muted">{b.seedLabel} to {b.oilName}</div>
            <div className="text-xs text-subtle">
              {fmtDateYear(b.date)}, {fmtTime(b.date)} - {(b.machine ?? 'W') === 'R' ? 'R · Rotary' : 'W · Wood-pressed'} - {b.chekku} - {b.operator}
            </div>
            {b.editedAt && <div className="text-[11px] text-subtle">Corrected {fmtDateYear(b.editedAt)}{b.editedBy ? ` by ${b.editedBy}` : ''}</div>}
          </div>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Edit</Button>
              <DeleteRecord
                title={`Delete batch ${b.number}?`}
                message={`${b.number} (${fmtMilli(b.seedKg, 0)} kg ${b.seedLabel}, ${fmtMilli(b.oilRawL)} L oil) leaves the lists, the analysis and the day sheet. Its seed goes back to stock and its oil and cake come out.`}
                doneText={`${b.number} deleted`} onConfirm={() => api.deletePressingBatch({ id: b.id })} onDone={onDeleted}
              />
            </div>
          )}
        </div>
        <div className="mt-3" title={`Oil weight is ${fmtNum(m.yieldPct)}% of the clean seed`}>
          <div className="text-xs text-muted">Yield</div>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('num text-3xl font-semibold', yieldTextCls(m.variancePct))}>{fmtNum(m.litresPer100Kg)}</span>
            <span className="text-sm font-medium text-muted">L / 100 kg</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="num">Norm {fmtNum(norm100)} L / 100 kg</span>
            <Badge tone={yieldTone(m.variancePct)}>{vsNormText(m.variancePct)}</Badge>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-b border-line px-4 py-3">
        <SectionLabel right={<span className="num font-normal normal-case tracking-normal">seed in {fmtNum(m.netSeedKg)} kg{jagKg > 0 ? `, vellam ${fmtNum(jagKg)} kg` : ''}</span>}>Where the seed went</SectionLabel>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
          {parts.map((p) => <div key={p.l} className={p.cls} style={{ width: `${(p.v / base) * 100}%` }} />)}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.l} className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] leading-tight text-muted"><span className={cn('h-2 w-2 shrink-0 rounded-full', p.cls)} />{p.l}</div>
              <div className="num text-sm font-semibold text-ink">{p.main}</div>
              {p.sub && <div className="num text-[11px] text-subtle">{p.sub}</div>}
            </div>
          ))}
        </div>
        <p className="num mt-2 text-xs text-muted">
          Seed {fmtNum(m.netSeedKg)} kg{jagKg > 0 ? ` + vellam ${fmtNum(jagKg)} kg` : ''} = oil {fmtNum(m.oilKg)} + cake {fmtNum(cakeKg)} + loss {fmtNum(lossKg)} kg
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <dl className="divide-y divide-line/70 text-sm">
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
          <YieldTrend batches={all} seed={b.seed} selectedId={b.id} norm={prof ? 100 / prof.kgPerL : normPer100(m)} />
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
  {
    id: 'yield', header: 'L / 100 kg', accessorFn: (r) => r.metrics.litresPer100Kg, meta: { w: '88px', align: 'right', num: true },
    cell: (c) => <span title={`Oil weight ${fmtNum(c.row.original.metrics.yieldPct)}% of the seed`}>{fmtNum(c.row.original.metrics.litresPer100Kg)}</span>,
  },
  {
    id: 'vs', header: 'vs norm', accessorFn: (r) => r.metrics.variancePct, meta: { w: '84px', align: 'right' },
    cell: (c) => { const m = c.row.original.metrics; return <Badge tone={yieldTone(m.variancePct)}>{signedPct(m.variancePct)}</Badge>; },
  },
  { id: 'op', header: 'Operator', accessorFn: (r) => r.operator, meta: { w: '100px' }, cell: (c) => <span className="truncate text-ink">{c.row.original.operator || '-'}</span> },
  {
    id: 'barrel', header: 'Godown barrel', accessorFn: (r) => r.godownBarrelLabel ?? '', meta: { w: '112px' },
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

/* ---------------- one compact row above the tabs: oil in the godown (click opens the Godown tab), and seed stock ---------------- */
function StockSummary({ barrels, profiles, onOpen }: { barrels: GodownBarrel[]; profiles: SeedProfile[]; onOpen: () => void }) {
  const oils: { seed: SeedType; label: string }[] = [{ seed: 'groundnut', label: 'Groundnut' }, { seed: 'sesame', label: 'Sesame' }, { seed: 'copra', label: 'Coconut' }];
  const caption = 'shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted';
  return (
    <div className="flex h-9 min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs">
      <span className={caption}>Oil in godown</span>
      {oils.map(({ seed, label }) => {
        const mine = barrels.filter((b) => b.active && b.oil === seed);
        const litres = mine.reduce((a, b) => a + b.levelL, 0);
        const n = mine.length;
        return (
          <button
            key={seed} type="button" onClick={onOpen} title={`${label} oil in the godown: ${n} barrel${n === 1 ? '' : 's'}. Open the Godown tab`}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2"
          >
            <span className={cn('h-2 w-2 rounded-full', seedColor[seed])} />
            <span className="font-medium text-ink">{label}</span>
            <span className="num text-ink">{fmtMilli(litres, 0)} L</span>
            <span className="hidden text-muted 2xl:inline">· {n} barrel{n === 1 ? '' : 's'}</span>
          </button>
        );
      })}
      <span className="mx-1 h-4 w-px shrink-0 bg-line" />
      <span className={caption}>Seed stock</span>
      {profiles.map((p, i) => (
        <span key={p.seed} className="flex shrink-0 items-center gap-1.5">
          {i > 0 && <span className="text-subtle">·</span>}
          <span className="font-medium text-ink">{p.label.split(' ')[0]}</span>
          <span className={cn('num', p.stock < 300000 ? 'font-semibold text-warning' : 'text-ink')}>{fmtMilli(p.stock, 0)} kg</span>
        </span>
      ))}
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
  const [newBatch, setNewBatch] = useState(false);
  const [editBatch, setEditBatch] = useState<PressingBatch | null>(null);
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
  useEffect(() => { void load(); }, [load]);
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

  return (
    <>
      <PageHeader
        title="Production" icon={<Factory size={17} />}
        subtitle={`${month.n} pressing batches in 30 days, ${fmtMilli(month.oil, 0)} L oil from ${fmtMilli(month.seed, 0)} kg seed`}
        actions={tab === 'godown' || tab === 'jobwork' ? undefined : (
          <Button icon={<Plus size={15} />} kbd="Ctrl+N" onClick={start}>{tab === 'pressing' ? 'Batch with details' : 'New packing run'}</Button>
        )}
      />
      <div className="flex h-9 shrink-0 items-center border-b border-line bg-bg px-4">
        <StockSummary barrels={godownBarrels} profiles={profiles} onOpen={() => setTab('godown')} />
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
        <TabPanel value="pressing" className="flex min-h-0 flex-1 flex-row outline-none data-[state=inactive]:hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <FilterBar
            trailing={<span>{month.low > 0 && <span className="mr-3 font-medium text-warning">{month.low} low yield in 30 days</span>}{shown.length} shown</span>}
          >
            <Select value={seedFilter} onChange={(e) => setSeedFilter(e.target.value)} options={[{ value: 'all', label: 'All seeds' }, ...profiles.map((p) => ({ value: p.seed, label: p.label }))]} />
          </FilterBar>
          <div className="flex min-h-0 min-w-0 flex-1">
            <DataTable
              data={shown} columns={pressCols} getRowId={(r) => r.id} selectedId={selBatch} onSelect={(r) => setSelBatch(r.id)} rowHeight={44}
              empty={<EmptyState icon={<Flame size={22} />} title="No batches match" hint="Change the seed filter, or record a new pressing batch." />}
            />
          </div>
          </div>
          {batch && (
            <BatchDetail
              b={batch} all={batches} profiles={profiles} onOpenGodown={() => setTab('godown')} onEdit={() => setEditBatch(batch)}
              onDeleted={() => { setSelBatch(null); setGodownKey((k) => k + 1); void load(); }}
            />
          )}
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
      <PressingForm
        open={editBatch !== null} edit={editBatch} profiles={profiles} barrels={godownBarrels}
        onClose={() => setEditBatch(null)}
        onSaved={(b) => { setGodownKey((k) => k + 1); void load({ batch: b.id }); }}
      />
      <PackForm open={newPack} barrels={barrels} initialBarrelId={packBarrel} onClose={() => setNewPack(false)} onSaved={(r) => { setTab('packing'); void load({ run: r.id }); }} />
    </>
  );
}
