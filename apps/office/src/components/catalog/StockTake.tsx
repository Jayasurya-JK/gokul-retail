import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardList, RotateCcw } from 'lucide-react';
import { formatQty, needsManagerPin, parseQty, type Category, type Milli, type StockTakeLine } from '@gokul/data';
import { Button, DataTable, Dialog, EmptyState, FilterBar, ManagerPinDialog, Money, Select, cn, useToast, type ColumnDef } from '@gokul/ui';
import { api, useSession } from '../../store';
import { unitText } from './shared';

interface CountCtx { counts: Record<string, string>; setCount: (id: string, v: string) => void }
const Ctx = createContext<CountCtx>({ counts: {}, setCount: () => undefined });

const countedOf = (raw: string | undefined): Milli | null => (raw === undefined || raw === '' ? null : parseQty(raw));
const valueOf = (l: StockTakeLine, diff: Milli) => Math.round((l.cost * diff) / 1000);
const signed = (n: number, loose: boolean) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatQty(Math.abs(n), loose)}`;

function CountCell({ line }: { line: StockTakeLine }) {
  const { counts, setCount } = useContext(Ctx);
  const raw = counts[line.itemId] ?? '';
  const bad = raw !== '' && parseQty(raw) === null;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <input
        data-count={line.itemId} value={raw} inputMode="decimal" placeholder="-" aria-label={`Counted quantity of ${line.name}`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          const [w, f] = v.split('.');
          setCount(line.itemId, f === undefined ? w : `${w}.${f.slice(0, line.loose ? 3 : 0)}`.replace(/\.$/, line.loose ? '.' : ''));
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const dir = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const all = [...document.querySelectorAll<HTMLInputElement>('input[data-count]')];
          all[all.indexOf(e.currentTarget) + dir]?.focus();
        }}
        className={cn(
          'h-7 w-24 rounded-md border bg-surface px-2 text-right text-sm font-semibold num placeholder:font-normal placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25',
          bad ? 'border-danger' : 'border-line-strong hover:border-subtle',
        )}
      />
      <span className="w-8 text-xs text-subtle">{unitText(line.unit)}</span>
    </div>
  );
}

function VarianceCell({ line, money }: { line: StockTakeLine; money?: boolean }) {
  const { counts } = useContext(Ctx);
  const c = countedOf(counts[line.itemId]);
  if (c === null) return <span className="text-subtle">-</span>;
  const diff = c - line.system;
  if (diff === 0) return <span className="text-success">{money ? '' : 'Matches'}</span>;
  const cls = diff < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning';
  return money ? <span className={cls}><Money paise={valueOf(line, diff)} sign /></span> : <span className={cls}>{signed(diff, line.loose)}</span>;
}

const columns: ColumnDef<StockTakeLine>[] = [
  { accessorKey: 'code', header: 'Code', meta: { w: '64px', num: true } },
  { accessorKey: 'name', header: 'Item', meta: { w: 'minmax(160px,1fr)' }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
  { accessorKey: 'system', header: 'System', meta: { w: '110px', align: 'right', num: true }, cell: (c) => { const l = c.row.original; return <span className="text-muted">{formatQty(l.system, l.loose)} {unitText(l.unit)}</span>; } },
  { id: 'counted', header: 'Counted', enableSorting: false, meta: { w: '160px', align: 'right' }, cell: (c) => <CountCell line={c.row.original} /> },
  { id: 'variance', header: 'Variance', enableSorting: false, meta: { w: '110px', align: 'right', num: true }, cell: (c) => <VarianceCell line={c.row.original} /> },
  { id: 'vvalue', header: 'Value', enableSorting: false, meta: { w: '110px', align: 'right', num: true }, cell: (c) => <VarianceCell line={c.row.original} money /> },
];

export function StockTake({ onPosted }: { onPosted: () => void }) {
  const toast = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState('oil');
  const [lines, setLines] = useState<StockTakeLine[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [view, setView] = useState<'all' | 'open' | 'var'>('all');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.listCategories().then((c) => setCats([...c])); }, []);

  const start = async () => { setLines(await api.startStockTake(cat)); setCounts({}); setView('all'); };
  const ctx = useMemo<CountCtx>(() => ({ counts, setCount: (id, v) => setCounts((c) => ({ ...c, [id]: v })) }), [counts]);

  const stats = useMemo(() => {
    let counted = 0; let variances = 0; let net = 0;
    for (const l of lines ?? []) {
      const c = countedOf(counts[l.itemId]);
      if (c === null) continue;
      counted += 1;
      if (c !== l.system) { variances += 1; net += valueOf(l, c - l.system); }
    }
    return { counted, variances, net };
  }, [lines, counts]);

  const rows = useMemo(() => (lines ?? []).filter((l) => {
    const c = countedOf(counts[l.itemId]);
    return view === 'all' || (view === 'open' ? c === null : c !== null && c !== l.system);
  }), [lines, counts, view]);

  /** Corrections need a manager's PIN for some roles: the backend says so, then the PIN box opens and we post again with it. */
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const post = async (pin?: string): Promise<string | null> => {
    const list = (lines ?? []).flatMap((l) => { const c = countedOf(counts[l.itemId]); return c === null ? [] : [{ itemId: l.itemId, counted: c }]; });
    let res;
    try {
      res = await api.postStockTake(list, `Stock take, ${cats.find((c) => c.id === cat)?.name ?? 'all items'}`, pin);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not post the stock take.';
      if (!pin && needsManagerPin(m)) { setConfirm(false); setPinAsk(m); return null; }
      if (pin) return m;
      toast.show({ tone: 'error', title: 'Stock take not posted', detail: m });
      return null;
    }
    setPinAsk(null); setConfirm(false); setLines(null); setCounts({});
    toast.show({ tone: 'success', title: 'Stock take posted', detail: `${res.adjusted} items corrected, ${res.unchanged} matched.` });
    onPosted();
    return null;
  };

  const matchRest = () => setCounts((c) => {
    const n = { ...c };
    for (const l of lines ?? []) if (countedOf(n[l.itemId]) === null) n[l.itemId] = formatQty(l.system, l.loose);
    return n;
  });
  const total = lines?.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        trailing={lines ? <span>Counted <b className="text-ink num">{stats.counted}</b> of <b className="text-ink num">{total}</b></span> : undefined}
      >
        <Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} aria-label="Category to count" />
        <Button variant={lines ? 'secondary' : 'primary'} icon={lines ? <RotateCcw size={14} /> : <ClipboardList size={14} />} onClick={() => void start()}>{lines ? 'Restart count' : 'Start count sheet'}</Button>
        {lines && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
            {([['all', `All ${total}`], ['open', `Not counted ${total - stats.counted}`], ['var', `Variances ${stats.variances}`]] as const).map(([v, l]) => (
              <button
                key={v} onClick={() => setView(v)}
                className={cn('h-8 rounded-control border px-3 text-sm font-medium transition-colors', view === v ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3')}
              >{l}</button>
            ))}
            <Button variant="ghost" onClick={matchRest} disabled={stats.counted === total}>Match system for the rest</Button>
          </>
        )}
      </FilterBar>

      {!lines ? (
        <EmptyState
          icon={<ClipboardCheck size={22} />} title="Count the shelf, then post the difference"
          hint="Pick a category and start a count sheet. Type what you actually counted for each item. Enter moves to the next row. Nothing changes in stock until you post."
          action={<Button variant="primary" icon={<ClipboardList size={14} />} onClick={() => void start()}>Start count sheet</Button>}
        />
      ) : (
        <Ctx.Provider value={ctx}>
          <DataTable
            data={rows} columns={columns} getRowId={(r) => r.itemId} rowHeight={40}
            empty={<EmptyState title={view === 'var' ? 'No variances yet' : 'Everything is counted'} hint={view === 'var' ? 'Counts that differ from the system quantity show up here.' : 'Post the count when you are ready.'} />}
          />
        </Ctx.Provider>
      )}

      {lines && (
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-4">
          <div className="flex items-center gap-6 text-sm">
            <div><div className="text-xs text-muted">Counted</div><div className="font-semibold num">{stats.counted} / {total}</div></div>
            <div><div className="text-xs text-muted">Items with a difference</div><div className={cn('font-semibold num', stats.variances > 0 && 'text-warning')}>{stats.variances}</div></div>
            <div><div className="text-xs text-muted">Net variance value</div><div className={cn('font-semibold num', stats.net < 0 ? 'text-danger' : stats.net > 0 ? 'text-warning' : '')}><Money paise={stats.net} sign /></div></div>
          </div>
          <Button variant="primary" size="lg" icon={<ClipboardCheck size={16} />} disabled={stats.counted === 0} onClick={() => setConfirm(true)}>Post stock take</Button>
        </div>
      )}

      <Dialog
        open={confirm} onOpenChange={setConfirm} title="Post this stock take?" size="sm"
        footer={<><Button onClick={() => setConfirm(false)} kbd="Esc">Not yet</Button><Button variant="primary" onClick={() => void post()} kbd="Enter">Post and adjust stock</Button></>}
      >
        <div
          className="space-y-3 text-sm text-ink" tabIndex={0} data-autofocus
          onKeyDown={(e) => { if (e.key === 'Enter') void post(); }}
        >
          <p>{stats.variances} {stats.variances === 1 ? 'item has' : 'items have'} a different count and will be corrected. {stats.counted - stats.variances} matched. Items you did not count are left alone.</p>
          <div className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-2">
            <span className="text-muted">Net change at cost</span>
            <span className={cn('font-semibold num', stats.net < 0 ? 'text-danger' : '')}><Money paise={stats.net} sign /></span>
          </div>
          <p className="text-xs text-subtle">Each correction is saved in Adjustments with the reason Correction.</p>
        </div>
      </Dialog>

      <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval for stock changes" message={pinAsk ?? ''} confirmLabel="Approve and post"
        onClose={() => setPinAsk(null)} onSubmit={(pin) => post(pin)}
        onLocked={() => useSession.getState().signOut()}
      />
    </div>
  );
}
