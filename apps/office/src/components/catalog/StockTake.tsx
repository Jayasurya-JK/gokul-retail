import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClipboardCheck, ClipboardList, Eye, ListChecks, Printer, RotateCcw } from 'lucide-react';
import { formatQty, needsManagerPin, parseQty, type Category, type Milli, type StockTakeLine, type Supplier } from '@gokul/data';
import { Button, Dialog, EmptyState, FilterBar, ManagerPinDialog, Money, Select, cn, useToast } from '@gokul/ui';
import { api, useSession } from '../../store';
import { unitText } from './shared';
import { CountSheetPaper, lineSupplier, orderForSheet } from './CountSheet';

const countedOf = (raw: string | undefined): Milli | null => (raw === undefined || raw === '' ? null : parseQty(raw));
/** Variance in paise for a quantity difference: cost or selling price per unit is per whole unit. */
const valueOf = (paise: number, diff: Milli) => Math.round((paise * diff) / 1000);
const signed = (n: number, loose: boolean) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatQty(Math.abs(n), loose)}`;
const cleanQty = (raw: string, loose: boolean) => {
  const v = raw.replace(/[^\d.]/g, '');
  const [w, f] = v.split('.');
  return f === undefined ? w : `${w}.${f.slice(0, loose ? 3 : 0)}`.replace(/\.$/, loose ? '.' : '');
};

const th = 'sticky top-0 z-10 border-b border-line bg-surface-2 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted';
const td = 'border-b border-line/60 px-3 text-sm';

/** Enter and the arrow keys walk down the Count column, so a staff member can type the whole sheet without the mouse. */
const CountInput = memo(function CountInput({ line, raw, onCount }: { line: StockTakeLine; raw: string; onCount: (id: string, v: string) => void }) {
  const bad = raw !== '' && parseQty(raw) === null;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <input
        data-count={line.itemId} value={raw} inputMode="decimal" placeholder="-"
        aria-label={`Counted quantity of ${line.name}`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onCount(line.itemId, cleanQty(e.target.value, line.loose))}
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
});

/** One sheet row. Memoised so typing in one Count box does not re-render every other row on a long sheet. */
const SheetRow = memo(function SheetRow({ line, index, raw, onCount }: {
  line: StockTakeLine; index: number; raw: string; onCount: (id: string, v: string) => void;
}) {
  return (
    <tr className="h-10 hover:bg-surface-2/60">
      <td className={cn(td, 'text-center text-xs text-subtle num')}>{index + 1}</td>
      <td className={td} title={lineSupplier(line)}><span className="block truncate text-muted">{lineSupplier(line)}</span></td>
      <td className={td}>
        <span className="block truncate"><span className="font-medium text-ink">{line.name}</span>
          <span className="ml-1.5 text-[11px] text-subtle num">{line.code}</span></span>
      </td>
      <td className={cn(td, 'text-right num text-muted')}><Money paise={line.price} /></td>
      <td className={cn(td, 'text-right')}>
        <CountInput line={line} raw={raw} onCount={onCount} />
      </td>
    </tr>
  );
});

function Stat({ label, children, bad }: { label: string; children: ReactNode; bad?: boolean }) {
  return <div><div className="text-xs text-muted">{label}</div><div className={cn('font-semibold num', bad && 'text-danger')}>{children}</div></div>;
}

export function StockTake({ onPosted }: { onPosted: () => void }) {
  const toast = useToast();
  const role = useSession((s) => s.user?.role);
  /** Counts are blind: the counter staff never see the system quantity, and neither does the printed sheet. */
  const canSeeSystem = role === 'owner' || role === 'manager';

  const [cats, setCats] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [shop, setShop] = useState('');
  const [lines, setLines] = useState<StockTakeLine[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<'all' | 'supplier' | 'category'>('all');
  const [supplierId, setSupplierId] = useState('all');
  const [catId, setCatId] = useState('all');
  const [phase, setPhase] = useState<'count' | 'review'>('count');
  const [preview, setPreview] = useState(false);
  const [sheet, setSheet] = useState<{ no: string; date: string } | null>(null);
  const focusPending = useRef(false);

  useEffect(() => {
    api.listCategories().then((c) => setCats([...c])).catch(() => undefined);
    api.listSuppliers().then((s) => setSuppliers([...s])).catch(() => undefined);
    api.getSettings().then((s) => setShop(s.shopName)).catch(() => undefined);
  }, []);

  const catName = cats.find((c) => c.id === catId)?.name ?? '';
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? '';
  const filterLabel = scope === 'supplier'
    ? (supplierId === 'all' ? 'All suppliers' : supplierName)
    : scope === 'category' ? (catId === 'all' ? 'All categories' : catName) : 'All items';

  const sheetLines = useMemo(() => (lines ?? []).filter((l) =>
    scope === 'all' ? true
      : scope === 'supplier' ? (supplierId === 'all' || (l.supplierId ?? '') === supplierId)
        : (catId === 'all' || l.category === catName)), [lines, scope, supplierId, catId, catName]);
  const sheetRows = useMemo(() => orderForSheet(sheetLines), [sheetLines]);

  const countedLines = useMemo(() => {
    const out: { line: StockTakeLine; counted: Milli }[] = [];
    for (const l of lines ?? []) { const c = countedOf(counts[l.itemId]); if (c !== null) out.push({ line: l, counted: c }); }
    return out;
  }, [lines, counts]);

  const stats = useMemo(() => {
    let variances = 0; let cost = 0; let sale = 0;
    for (const { line, counted } of countedLines) {
      const diff = counted - line.system;
      if (diff === 0) continue;
      variances += 1; cost += valueOf(line.cost, diff); sale += valueOf(line.price, diff);
    }
    return { counted: countedLines.length, variances, cost, sale };
  }, [countedLines]);

  const sheetCounted = sheetRows.filter((l) => countedOf(counts[l.itemId]) !== null).length;
  const setCount = useCallback((id: string, v: string) => setCounts((c) => ({ ...c, [id]: v })), []);
  /** Items the current sheet has not counted yet, in sheet order. */
  const matchRest = () => setCounts((c) => {
    const n = { ...c };
    for (const l of sheetRows) if (countedOf(n[l.itemId]) === null) n[l.itemId] = formatQty(l.system, l.loose);
    return n;
  });

  const start = async () => {
    const data = await api.startStockTake('all');
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setLines(data);
    setCounts({});
    setPhase('count');
    setSheet({
      no: `ST-${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`,
      date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    });
    focusPending.current = true;
  };

  useEffect(() => {
    if (!focusPending.current || phase !== 'count' || !lines) return;
    const el = document.querySelector<HTMLInputElement>('input[data-count]');
    if (el) { focusPending.current = false; el.focus(); el.select(); }
  }, [phase, lines, sheetRows]);

  /** Enter prints the sheet while its preview is open; Esc closes the preview (Dialog handles it). */
  useEffect(() => {
    if (!preview) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); window.print(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview]);

  /** Corrections need a manager's PIN for some roles: the backend says so, then the PIN box opens and we post again with it. */
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const post = async (pin?: string): Promise<string | null> => {
    const list = countedLines.map(({ line, counted }) => ({ itemId: line.itemId, counted }));
    let res;
    try {
      res = await api.postStockTake(list, `Stock take, ${filterLabel}`, pin);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not post the stock take.';
      if (!pin && needsManagerPin(m)) { setConfirm(false); setPinAsk(m); return null; }
      if (pin) return m;
      toast.show({ tone: 'error', title: 'Stock take not posted', detail: m });
      return null;
    }
    setPinAsk(null); setConfirm(false); setLines(null); setCounts({}); setSheet(null); setPhase('count');
    toast.show({ tone: 'success', title: 'Stock take posted', detail: `${res.adjusted} items corrected, ${res.unchanged} matched.` });
    onPosted();
    return null;
  };

  const reviewRows = useMemo(() => orderForSheet(countedLines.map((r) => r.line)).map((l) => {
    const counted = countedOf(counts[l.itemId]) as Milli;
    return { line: l, counted, diff: counted - l.system };
  }), [countedLines, counts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        trailing={lines ? <span>Sheet <b className="text-ink num">{sheetRows.length}</b> items - counted <b className="text-ink num">{sheetCounted}</b></span> : undefined}
      >
        {([['all', 'All items'], ['supplier', 'By supplier'], ['category', 'By category']] as const).map(([v, l]) => (
          <button
            key={v} onClick={() => setScope(v)}
            className={cn('h-8 rounded-control border px-3 text-sm font-medium transition-colors', scope === v ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3')}
          >{l}</button>
        ))}
        {scope === 'supplier' && (
          <Select
            value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier to count"
            options={[{ value: 'all', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        )}
        {scope === 'category' && (
          <Select
            value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="Category to count"
            options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
        <span className="mx-1 h-5 w-px bg-line" />
        <Button variant={lines ? 'secondary' : 'primary'} icon={lines ? <RotateCcw size={14} /> : <ClipboardList size={14} />} onClick={() => void start()}>
          {lines ? 'Restart count' : 'Start count sheet'}
        </Button>
        {lines && (
          <>
            <Button icon={<Printer size={14} />} onClick={() => setPreview(true)} disabled={sheetRows.length === 0}>Print count sheet</Button>
            <span className="mx-1 h-5 w-px bg-line" />
            {([['count', 'Count', sheetRows.length], ['review', 'Review', stats.counted]] as const).map(([v, l, n]) => (
              <button
                key={v} onClick={() => setPhase(v)}
                className={cn('flex h-8 items-center gap-1.5 rounded-control border px-3 text-sm font-medium transition-colors', phase === v ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-muted hover:bg-surface-3')}
              >{l} <span className="num text-[11px] opacity-70">{n}</span></button>
            ))}
            {phase === 'count' && canSeeSystem && (
              <Button variant="ghost" onClick={matchRest} disabled={sheetCounted === sheetRows.length}>Match system for the rest</Button>
            )}
          </>
        )}
      </FilterBar>

      {!lines ? (
        <EmptyState
          icon={<ClipboardCheck size={22} />} title="Count the shelf, then post the difference"
          hint="Start a count sheet and print it. Staff count the shelf by hand and write the quantity; the sheet never shows the system quantity. Type the counts back here and review the difference before posting."
          action={<Button variant="primary" icon={<ClipboardList size={14} />} onClick={() => void start()}>Start count sheet</Button>}
        />
      ) : phase === 'count' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col className="w-14" /><col className="w-40" /><col /><col className="w-28" /><col className="w-44" /></colgroup>
            <thead>
              <tr className="[&>th]:h-9">
                <th className={cn(th, 'text-center')}>S.No</th>
                <th className={th}>Supplier</th>
                <th className={th}>Item</th>
                <th className={cn(th, 'text-right')}>Price</th>
                <th className={cn(th, 'text-right')}>Count by staff</th>
              </tr>
            </thead>
            <tbody>
              {sheetRows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-subtle">No items for this filter.</td></tr>
              )}
              {sheetRows.map((l, i) => (
                <SheetRow key={l.itemId} line={l} index={i} raw={counts[l.itemId] ?? ''} onCount={setCount} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {!canSeeSystem && (
            <div className="shrink-0 border-b border-line bg-surface-2 px-4 py-2 text-xs text-muted">
              System quantity and variance are shown only to the owner and manager. Your counts are recorded; a manager can review and post them.
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-14" /><col /><col className="w-40" /><col className="w-28" />
                {canSeeSystem && <><col className="w-28" /><col className="w-28" /><col className="w-32" /><col className="w-32" /></>}
              </colgroup>
              <thead>
                <tr className="[&>th]:h-9">
                  <th className={cn(th, 'text-center')}>S.No</th>
                  <th className={th}>Item</th>
                  <th className={th}>Supplier</th>
                  <th className={cn(th, 'text-right')}>Counted</th>
                  {canSeeSystem && <>
                    <th className={cn(th, 'text-right')}>System</th>
                    <th className={cn(th, 'text-right')}>Variance qty</th>
                    <th className={cn(th, 'text-right')}>Variance ₹ at cost</th>
                    <th className={cn(th, 'text-right')}>Variance ₹ at price</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {reviewRows.length === 0 && (
                  <tr><td colSpan={canSeeSystem ? 8 : 4} className="px-3 py-10 text-center text-sm text-subtle">Nothing counted yet. Enter counts in the Count tab.</td></tr>
                )}
                {reviewRows.map(({ line: l, counted, diff }, i) => (
                  <tr key={l.itemId} className="h-10 hover:bg-surface-2/60">
                    <td className={cn(td, 'text-center text-xs text-subtle num')}>{i + 1}</td>
                    <td className={td}><span className="block truncate"><span className="font-medium text-ink">{l.name}</span> <span className="ml-1.5 text-[11px] text-subtle num">{l.code}</span></span></td>
                    <td className={td} title={lineSupplier(l)}><span className="block truncate text-muted">{lineSupplier(l)}</span></td>
                    <td className={cn(td, 'text-right num font-medium')}>{formatQty(counted, l.loose)} <span className="text-xs text-subtle">{unitText(l.unit)}</span></td>
                    {canSeeSystem && <>
                      <td className={cn(td, 'text-right num text-muted')}>{formatQty(l.system, l.loose)} <span className="text-xs text-subtle">{unitText(l.unit)}</span></td>
                      <td className={cn(td, 'text-right num', diff === 0 ? 'text-success' : diff < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning')}>
                        {diff === 0 ? 'Matches' : signed(diff, l.loose)}
                      </td>
                      <td className={cn(td, 'text-right num', diff === 0 ? '' : diff < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning')}>
                        {diff === 0 ? '-' : <Money paise={valueOf(l.cost, diff)} sign />}
                      </td>
                      <td className={cn(td, 'text-right num', diff === 0 ? '' : diff < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning')}>
                        {diff === 0 ? '-' : <Money paise={valueOf(l.price, diff)} sign />}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
              {canSeeSystem && reviewRows.length > 0 && (
                <tfoot>
                  <tr className="sticky bottom-0 h-10 border-t-2 border-line-strong bg-surface-2 font-semibold">
                    <td className={cn(td, 'text-center')} />
                    <td className={cn(td, 'text-ink')}>Total, {reviewRows.length} items</td>
                    <td className={td} />
                    <td className={cn(td, 'text-right num')}>{stats.counted}</td>
                    <td className={td} />
                    <td className={cn(td, 'text-right num', stats.variances > 0 && 'text-warning')}>{stats.variances} differ</td>
                    <td className={cn(td, 'text-right num', stats.cost < 0 ? 'text-danger' : stats.cost > 0 ? 'text-warning' : '')}><Money paise={stats.cost} sign /></td>
                    <td className={cn(td, 'text-right num', stats.sale < 0 ? 'text-danger' : stats.sale > 0 ? 'text-warning' : '')}><Money paise={stats.sale} sign /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {lines && (
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-4">
          {phase === 'count' ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted">
                <Eye size={15} className="text-subtle" />
                Blind count. The system quantity is hidden while counting and never printed on the sheet.
              </div>
              <Button variant="primary" size="lg" icon={<ListChecks size={16} />} disabled={stats.counted === 0} onClick={() => setPhase('review')}>
                Review counts ({stats.counted})
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-6 text-sm">
                <Stat label="Counted">{stats.counted} / {(lines ?? []).length}</Stat>
                {canSeeSystem ? (
                  <>
                    <Stat label="Items with a difference" bad={stats.variances > 0}>{stats.variances}</Stat>
                    <Stat label="Net variance at cost" bad={stats.cost < 0}><Money paise={stats.cost} sign /></Stat>
                    <Stat label="Net variance at price" bad={stats.sale < 0}><Money paise={stats.sale} sign /></Stat>
                  </>
                ) : <Stat label="Items with a difference">Hidden</Stat>}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setPhase('count')}>Back to count</Button>
                <Button variant="primary" size="lg" icon={<ClipboardCheck size={16} />} disabled={stats.counted === 0} onClick={() => setConfirm(true)}>Post stock take</Button>
              </div>
            </>
          )}
        </div>
      )}

      <Dialog
        open={preview} onOpenChange={setPreview} size="xl" title="Count sheet preview"
        description="A4 blind count sheet grouped by supplier. The Count column is left blank for staff to fill by hand. Choose Save as PDF in the print window to keep a copy."
        bodyClassName="bg-neutral-300 p-4"
        footer={<><Button onClick={() => setPreview(false)} kbd="Esc">Close</Button><Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()} kbd="Enter">Print or save as PDF</Button></>}
      >
        {sheet && <CountSheetPaper lines={sheetRows} shop={shop} sheetNo={sheet.no} date={sheet.date} filterLabel={filterLabel} />}
      </Dialog>

      <Dialog
        open={confirm} onOpenChange={setConfirm} title="Post this stock take?" size="sm"
        footer={<><Button onClick={() => setConfirm(false)} kbd="Esc">Not yet</Button><Button variant="primary" onClick={() => void post()} kbd="Enter">Post and adjust stock</Button></>}
      >
        <div
          className="space-y-3 text-sm text-ink" tabIndex={0} data-autofocus
          onKeyDown={(e) => { if (e.key === 'Enter') void post(); }}
        >
          {canSeeSystem ? (
            <>
              <p>{stats.variances} {stats.variances === 1 ? 'item has' : 'items have'} a different count and will be corrected. {stats.counted - stats.variances} matched. Items you did not count are left alone.</p>
              <div className="space-y-1.5 rounded-control bg-surface-2 px-3 py-2">
                <div className="flex items-center justify-between"><span className="text-muted">Net change at cost</span><span className={cn('font-semibold num', stats.cost < 0 && 'text-danger')}><Money paise={stats.cost} sign /></span></div>
                <div className="flex items-center justify-between"><span className="text-muted">Net change at selling price</span><span className={cn('font-semibold num', stats.sale < 0 && 'text-danger')}><Money paise={stats.sale} sign /></span></div>
              </div>
            </>
          ) : (
            <p>{stats.counted} {stats.counted === 1 ? 'item was' : 'items were'} counted and will be checked before stock changes. A manager may be asked to approve.</p>
          )}
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
