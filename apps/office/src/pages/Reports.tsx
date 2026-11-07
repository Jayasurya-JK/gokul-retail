import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChartNoAxesColumn, FileSpreadsheet, FileText, Printer, Wrench } from 'lucide-react';
import type { PayMode, ReportParams, ReportResult } from '@gokul/data';
import {
  Badge, Button, Card, DateRangePicker, EmptyState, FilterBar, Money, PageHeader, Select, dateRangePresets, cn, useToast,
  type DateRange, useRefreshOnFocus
} from '@gokul/ui';
import { api } from '../store';
import { allReports, reportGroups, type ReportDef } from '../components/reports/catalog';
import { ReportTable } from '../components/reports/ReportTable';
import { ReportChartView } from '../components/reports/ReportChartView';

type Kpi = ReportResult['kpis'][number];
const kpiTone: Record<NonNullable<Kpi['tone']>, string> = {
  primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info',
};

function KpiValue({ k }: { k: Kpi }) {
  switch (k.kind) {
    case 'money': return <Money paise={Number(k.value)} decimals={false} />;
    case 'int': return <>{Number(k.value).toLocaleString('en-IN')}</>;
    case 'pct': return <>{Number(k.value).toFixed(1)}%</>;
    case 'dec1': return <>{Number(k.value).toFixed(1)}</>;
    default: return <>{String(k.value)}</>;
  }
}

function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="grid shrink-0 gap-3 border-b border-line bg-bg px-4 py-2.5" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0,1fr))` }}>
      {kpis.map((k) => (
        <div key={k.label} className="relative min-w-0 overflow-hidden rounded-card border border-line bg-surface px-3.5 py-1.5">
          {k.tone && <span className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full', kpiTone[k.tone])} />}
          <div className="truncate text-xs font-medium text-muted">{k.label}</div>
          <div className="truncate text-lg font-semibold leading-6 tracking-tight text-ink num"><KpiValue k={k} /></div>
          <div className="h-4 truncate text-xs leading-4 text-subtle">{k.hint}</div>
        </div>
      ))}
    </div>
  );
}

function ReportList({ selected, onSelect }: { selected: ReportDef; onSelect: (r: ReportDef) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = allReports.findIndex((r) => r.id === selected.id);
    const next = allReports[Math.max(0, Math.min(allReports.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    onSelect(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-report="${next.id}"]`)?.focus());
  };
  return (
    <nav aria-label="Reports" onKeyDown={onKey} className="min-h-0 overflow-y-auto border-r border-line bg-surface px-2 py-2">
      {reportGroups.map((g) => (
        <div key={g.name} className="mb-2">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.name}</div>
          {g.reports.map((r) => {
            const active = r.id === selected.id;
            return (
              <button
                key={r.id} data-report={r.id} onClick={() => onSelect(r)}
                className={cn(
                  'relative flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
                  active ? 'bg-primary-soft font-medium text-primary' : 'text-ink hover:bg-surface-3',
                )}
              >
                <span className="truncate">{r.name}</span>
                {r.soon && <span className="rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-subtle">Soon</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const ALL = '';

export function Reports() {
  const toast = useToast();
  const [def, setDef] = useState<ReportDef>(allReports[0]);
  const [range, setRange] = useState<DateRange>(() => dateRangePresets[3].get());
  const [category, setCategory] = useState(ALL);
  const [cashier, setCashier] = useState(ALL);
  const [mode, setMode] = useState(ALL);
  const [showChart, setShowChart] = useState(true);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [cats, setCats] = useState<{ value: string; label: string }[]>([]);
  const [cashiers, setCashiers] = useState<{ value: string; label: string }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    api.listCategories().then((c) => setCats([{ value: ALL, label: 'All categories' }, ...c.map((x) => ({ value: x.id, label: x.name }))]));
    api.listUsers().then((u) => setCashiers([{ value: ALL, label: 'All cashiers' }, ...u.filter((x) => x.role === 'cashier').map((x) => ({ value: x.name, label: x.name }))]));
  }, []);

  const params = useMemo<ReportParams>(() => ({
    from: range.from, to: range.to,
    categoryId: def.filters.includes('category') && category ? category : undefined,
    cashier: def.filters.includes('cashier') && cashier ? cashier : undefined,
    mode: def.filters.includes('mode') && mode ? (mode as PayMode) : undefined,
  }), [range, category, cashier, mode, def]);

  const [tick, setTick] = useState(0);
  useRefreshOnFocus(() => setTick((t) => t + 1));
  useEffect(() => {
    if (def.soon) { setResult(null); return; }
    const n = ++seq.current;
    api.runReport(def.id, params).then((r) => { if (n === seq.current) setResult(r); });
  }, [def, params, tick]);

  const act = useCallback((what: string) => toast.show({ tone: 'info', title: `${what} - ${def.name}`, detail: 'Preview only. Exporting is connected when the real database arrives.' }), [toast, def]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() === 'p') { e.preventDefault(); act('Print'); }
      else if (e.key.toLowerCase() === 'e') { e.preventDefault(); act('Export to Excel'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [act]);

  const dated = def.dated !== false;
  const current = result && result.id === def.id ? result : null;
  const hasChart = !!current?.chart;
  const rowCount = current ? current.rows.filter((r) => !r._style).length : 0;

  return (
    <>
      <PageHeader title="Reports" subtitle="Sales, GST, stock, profit and cash for any period" icon={<BarChart3 size={18} />} />
      <div className="grid min-h-0 flex-1 grid-cols-[208px_minmax(0,1fr)]">
        <ReportList selected={def} onSelect={setDef} />

        <section className="flex min-h-0 min-w-0 flex-col bg-surface">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <div className="min-w-0">
              <h2 className="truncate text-md font-semibold leading-5 text-ink">{def.name}</h2>
              <p className="truncate text-xs text-muted">{current?.note ?? def.hint}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasChart && (
                <Button size="sm" variant="ghost" icon={<ChartNoAxesColumn size={15} />} onClick={() => setShowChart((s) => !s)}>{showChart ? 'Hide chart' : 'Show chart'}</Button>
              )}
              <Button size="sm" icon={<FileSpreadsheet size={15} />} disabled={def.soon} onClick={() => act('Export to Excel')} kbd="Ctrl+E">Excel</Button>
              <Button size="sm" icon={<FileText size={15} />} disabled={def.soon} onClick={() => act('Export to PDF')}>PDF</Button>
              <Button size="sm" icon={<Printer size={15} />} disabled={def.soon} onClick={() => act('Print')} kbd="Ctrl+P">Print</Button>
            </div>
          </div>

          <FilterBar
            trailing={current && !def.soon ? <><span className="num">{rowCount.toLocaleString('en-IN')}</span> rows</> : undefined}
          >
            {dated ? <DateRangePicker value={range} onChange={setRange} /> : <Badge tone="neutral">As on today</Badge>}
            {def.filters.includes('category') && <div className="w-48"><Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={cats} /></div>}
            {def.filters.includes('cashier') && <div className="w-44"><Select aria-label="Cashier" value={cashier} onChange={(e) => setCashier(e.target.value)} options={cashiers} /></div>}
            {def.filters.includes('mode') && (
              <div className="w-40">
                <Select
                  aria-label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}
                  options={[{ value: ALL, label: 'All payment modes' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'credit', label: 'Credit' }]}
                />
              </div>
            )}
          </FilterBar>

          {def.soon ? (
            <div className="min-h-0 flex-1">
              <EmptyState
                icon={<Wrench size={22} />} title={`${def.name} is coming soon`}
                hint={`${def.hint}. This report is next in line, the others in the list are ready to use.`}
                action={<Button onClick={() => setDef(allReports[0])}>Open Daily summary</Button>}
              />
            </div>
          ) : !current ? (
            <div className="min-h-0 flex-1" />
          ) : (
            <>
              <KpiStrip kpis={current.kpis} />
              {hasChart && showChart && current.chart && (
                <div className="shrink-0 px-4 pb-2.5 pt-0">
                  <Card title={current.chart.title} className={cn(current.chart.kind === 'split' ? 'h-[112px]' : current.chart.kind === 'heat' ? 'h-[180px]' : 'h-[150px]')} bodyClassName="px-4 py-2">
                    <ReportChartView chart={current.chart} />
                  </Card>
                </div>
              )}
              {current.rows.length === 0 ? (
                <div className="min-h-0 flex-1 border-t border-line">
                  <EmptyState icon={<BarChart3 size={22} />} title="Nothing to show for this period" hint="Try a longer date range or clear the filters." />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col border-t border-line">
                  <ReportTable columns={current.columns} rows={current.rows} totals={current.totals} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
