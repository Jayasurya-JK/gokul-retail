import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FileClock } from 'lucide-react';
import { type GodownBarrel, type MillOpRow, type MillSheet, type MillSheetSummary } from '@gokul/data';
import { Badge, Button, Dialog, EmptyState, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtQty, fromMilli, longDay, seedLabel, toMilli, PUNNAKU_LABEL } from './millUtil';

const th = 'px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';
const td = 'px-2 py-1 text-sm text-ink';
const num = 'text-right tabular-nums';
const cell = 'h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink num text-right focus:border-primary focus:ring-2 focus:ring-primary/25';

interface MoveRow { id: number; operator: string; seed: MillOpRow['seed']; machine: MillOpRow['machine']; kg: string; oil: string; cake: string; jag: string; barrel: string }

const rowId = (r: MillOpRow) => Number((r.id ?? '').replace(/^mo/, '')) || 0;
const waiting = (r: MillOpRow) => !r.imported && !r.batchNumber;

/**
 * The old manual mill sheets, read-only. Closed sheets already made their pressing batches. A draft never posted anything,
 * so its operator rows can be moved into Production once (reviewed here, saved as real batches dated that day).
 * Nothing in this window can be changed or deleted.
 */
export function OldSheets({ open, onClose, onMoved }: { open: boolean; onClose: () => void; onMoved: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<MillSheetSummary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<MillSheet | null>(null);
  const [barrels, setBarrels] = useState<GodownBarrel[]>([]);
  const [move, setMove] = useState<MoveRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void api.listMillSheets(200).then((l) => { setList(l); setSel((s) => s ?? l[0]?.day ?? null); });
  }, []);
  useEffect(() => { if (open) { refresh(); void api.listGodownBarrels().then(setBarrels); } }, [open, refresh]);
  useEffect(() => { setMove(null); setErr(''); if (sel) void api.getMillSheet(sel).then(setSheet); else setSheet(null); }, [sel]);

  const fillable = (seed: string) => barrels.filter((b) => b.active && b.oil === seed && (b.status === 'filling' || b.status === 'empty'));
  const pending = useMemo(() => (sheet?.status === 'draft' ? sheet.opRows.filter(waiting) : []), [sheet]);

  const startMove = () => setMove(pending.map((r) => ({
    id: rowId(r), operator: r.operator, seed: r.seed, machine: r.machine, kg: fromMilli(r.seedKg), oil: fromMilli(r.oilL), cake: fromMilli(r.cakeKg), jag: fromMilli(r.jaggeryKg),
    barrel: fillable(r.seed)[0]?.id ?? '',
  })));

  const save = async () => {
    if (!sheet || !move) return;
    setErr('');
    const bad = move.findIndex((r) => toMilli(r.kg) <= 0 || toMilli(r.oil) <= 0 || !r.barrel);
    if (bad >= 0) { setErr(`Row ${bad + 1}: enter the seed and the oil that came out, and choose a godown barrel.`); return; }
    setBusy(true);
    try {
      const saved = await api.createPressingBatches({
        day: sheet.day, legacyRowIds: move.map((r) => r.id),
        rows: move.map((r) => ({
          seed: r.seed, seedKg: toMilli(r.kg), cleaningLossKg: 0, jaggeryKg: toMilli(r.jag), oilRawL: toMilli(r.oil), cakeKg: toMilli(r.cake),
          chekku: `${r.machine === 'R' ? 'Rotary' : 'Chekku'} ${r.operator}`, operator: r.operator, machine: r.machine, godownBarrelId: r.barrel,
        })),
      });
      toast.show({ tone: 'success', title: `${saved.length} row${saved.length === 1 ? '' : 's'} moved to Production`, detail: `Saved as pressing batches dated ${sheet.day}.` });
      setMove(null);
      void api.getMillSheet(sheet.day).then(setSheet);
      refresh(); onMoved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not move the rows'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="xl" title="Old sheets"
      description="The old manual mill sheets, kept for reference. Nothing here can be changed or deleted."
      bodyClassName="p-0"
      footer={<Button onClick={onClose} kbd="Esc">Close window</Button>}
    >
      <div className="flex h-[480px]">
        <div className="w-[220px] shrink-0 overflow-y-auto border-r border-line">
          {list.length === 0 && <div className="p-4 text-sm text-muted">No old sheets.</div>}
          {list.map((s) => {
            const d = new Date(`${s.day}T12:00:00`);
            return (
              <button
                key={s.day} type="button" onClick={() => setSel(s.day)}
                className={cn('flex w-full items-center justify-between border-b border-line/70 px-4 py-2 text-left hover:bg-surface-2', sel === s.day && 'bg-primary-soft')}
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="block text-xs text-muted">{s.supervisor || 'No supervisor'}</span>
                </span>
                <Badge tone={s.status === 'closed' ? 'success' : 'warning'}>{s.status === 'closed' ? 'Closed' : 'Draft'}</Badge>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {!sheet ? (
            <EmptyState icon={<FileClock size={22} />} title="Pick an old sheet" hint="Closed sheets already became pressing batches. Drafts can be moved to Production." />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-md font-semibold text-ink">{longDay(sheet.day)}</div>
                  <div className="text-xs text-muted">Supervisor {sheet.supervisor || '-'}{sheet.note ? ` - ${sheet.note}` : ''}</div>
                </div>
                <Badge tone={sheet.status === 'closed' ? 'success' : 'warning'}>{sheet.status === 'closed' ? `Closed by ${sheet.closedBy || 'manager'}` : 'Draft, nothing was posted'}</Badge>
              </div>

              <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Aravai (operator)</h3>
              {sheet.opRows.length === 0 ? <p className="text-sm text-subtle">No operator rows.</p> : move ? (
                <table className="w-full table-fixed">
                  <thead><tr><th className={th}>Operator</th><th className={th}>Seed</th><th className={cn(th, 'w-[74px] text-right')}>Seed kg</th><th className={cn(th, 'w-[74px] text-right')}>Oil L</th><th className={cn(th, 'w-[74px] text-right')}>Cake kg</th><th className={cn(th, 'w-[150px]')}>Godown barrel</th></tr></thead>
                  <tbody>
                    {move.map((r, i) => (
                      <tr key={r.id} className="border-t border-line/70">
                        <td className={td}>{r.operator} <span className="text-xs text-muted">{r.machine}</span></td>
                        <td className={td}>{seedLabel(r.seed)}</td>
                        <td className="p-0.5"><input className={cell} value={r.kg} inputMode="decimal" aria-label={`Row ${i + 1} seed kg`} onChange={(e) => setMove((m) => m && m.map((x, k) => (k === i ? { ...x, kg: e.target.value } : x)))} /></td>
                        <td className="p-0.5"><input className={cell} value={r.oil} inputMode="decimal" aria-label={`Row ${i + 1} oil litres`} onChange={(e) => setMove((m) => m && m.map((x, k) => (k === i ? { ...x, oil: e.target.value } : x)))} /></td>
                        <td className="p-0.5"><input className={cell} value={r.cake} inputMode="decimal" aria-label={`Row ${i + 1} cake kg`} onChange={(e) => setMove((m) => m && m.map((x, k) => (k === i ? { ...x, cake: e.target.value } : x)))} /></td>
                        <td className="p-0.5">
                          <select className="h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-sm" value={r.barrel} aria-label={`Row ${i + 1} godown barrel`} onChange={(e) => setMove((m) => m && m.map((x, k) => (k === i ? { ...x, barrel: e.target.value } : x)))}>
                            {fillable(r.seed).length === 0 && <option value="">No barrel filling</option>}
                            {fillable(r.seed).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full table-fixed">
                  <thead><tr><th className={th}>Operator</th><th className={th}>Seed</th><th className={cn(th, 'w-[56px]')}>Mach.</th><th className={cn(th, 'w-[76px] text-right')}>Seed kg</th><th className={cn(th, 'w-[70px] text-right')}>Oil L</th><th className={cn(th, 'w-[76px] text-right')}>Cake kg</th><th className={cn(th, 'w-[110px]')}>Status</th></tr></thead>
                  <tbody>
                    {sheet.opRows.map((r, i) => (
                      <tr key={r.id ?? i} className="border-t border-line/70">
                        <td className={td}>{r.operator}</td><td className={td}>{seedLabel(r.seed)}</td><td className={td}>{r.machine}</td>
                        <td className={cn(td, num)}>{fmtQty(r.seedKg)}</td><td className={cn(td, num)}>{fmtQty(r.oilL)}</td><td className={cn(td, num)}>{fmtQty(r.cakeKg)}</td>
                        <td className={td}>{r.batchNumber ? <span className="text-success">{r.batchNumber}</span> : r.imported ? 'Moved' : <span className="text-warning">Not posted</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {sheet.custRows.length > 0 && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Aravai (customer)</h3>
                  <table className="w-full table-fixed">
                    <tbody>
                      {sheet.custRows.map((r, i) => (
                        <tr key={r.id ?? i} className="border-t border-line/70">
                          <td className={td}>{r.customerName}</td><td className={td}>{seedLabel(r.seed)}</td><td className={cn(td, num)}>{fmtQty(r.seedKg)} kg</td>
                          <td className={td}>{r.cakeMode === 'kept' ? 'Shop keeps cake' : 'Customer takes cake'}</td><td className={cn(td, 'text-muted')}>{r.billNumber || 'Not billed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheet.status === 'draft' && <p className="mt-1 text-xs text-muted">Customer job work is entered in the Job work tab in Production.</p>}
                </>
              )}
              {sheet.punnakuRows.length > 0 && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Punnaku purchased</h3>
                  <table className="w-full table-fixed">
                    <tbody>
                      {sheet.punnakuRows.map((r, i) => (
                        <tr key={r.id ?? i} className="border-t border-line/70"><td className={td}>{PUNNAKU_LABEL[r.punnaku]}</td><td className={cn(td, num)}>{fmtQty(r.qtyKg)} kg</td><td className={cn(td, 'text-muted')}>{r.supplierName}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {sheet.status === 'draft' && <p className="mt-1 text-xs text-muted">Punnaku bought is entered as an ordinary purchase in Purchases.</p>}
                </>
              )}

              {sheet.status === 'draft' && pending.length > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-card border border-line bg-surface-2 px-3 py-2">
                  <span className="text-sm text-muted">{move ? 'Check the numbers. Each row becomes a pressing batch dated that day, with its oil in the barrel you choose.' : `${pending.length} operator row${pending.length === 1 ? '' : 's'} not posted yet.`}</span>
                  {move ? (
                    <span className="flex shrink-0 gap-2"><Button size="sm" onClick={() => setMove(null)}>Cancel</Button><Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>Save as batches</Button></span>
                  ) : (
                    <Button size="sm" variant="primary" icon={<ArrowRightLeft size={14} />} onClick={startMove}>Move rows to Production</Button>
                  )}
                </div>
              )}
              {err && <div className="mt-2 text-sm text-danger" role="alert">{err}</div>}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
