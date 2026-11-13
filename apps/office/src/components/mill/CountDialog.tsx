import { useEffect, useMemo, useState } from 'react';
import { Lock, Save } from 'lucide-react';
import type { MillDay, MillStockKey } from '@gokul/data';
import { Badge, Button, Dialog, Field, Input, ManagerPinDialog, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtQty, fromMilli, longDay, toMilli } from './millUtil';

const th = 'px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';
const cell = 'h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink num text-right focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:border-transparent disabled:bg-transparent';

/**
 * Count and close: the supervisor's optional evening count of seeds, oil cake, vellam and malli against what the books expect.
 * Saving keeps the count. Closing the day posts each difference as a stock adjustment (manager PIN) and makes the sheet read-only.
 */
export function CountDialog({ open, day, info, onClose, onChanged }: {
  open: boolean; day: string; info: MillDay | null; onClose: () => void; onChanged: (d: MillDay) => void;
}) {
  const toast = useToast();
  const [supervisor, setSupervisor] = useState('');
  const [note, setNote] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [closing, setClosing] = useState(false);
  const closed = info?.status === 'closed';

  useEffect(() => {
    if (!open || !info) return;
    setSupervisor(info.supervisor); setNote(info.note); setErr('');
    setCounts(Object.fromEntries(info.stock.filter((l) => l.physical !== null).map((l) => [l.key, fromMilli(l.physical ?? 0) || '0'])));
  }, [open, info]);

  const lines = useMemo(() => (info?.stock ?? []).filter((l) => l.group !== 'oil'), [info]);
  const physical = () => Object.fromEntries(Object.entries(counts).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, toMilli(v)])) as Partial<Record<MillStockKey, number>>;
  const differences = lines.filter((l) => counts[l.key]?.trim() && toMilli(counts[l.key]) !== l.computed).length;

  const save = async (): Promise<MillDay | null> => {
    setBusy(true); setErr('');
    try {
      const d = await api.saveMillDay({ day, supervisor, note, physical: physical() });
      onChanged(d);
      return d;
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); return null; } finally { setBusy(false); }
  };

  const noOpen = (info?.legacyOpenRows ?? 0) === 0;

  return (
    <>
      <Dialog
        open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Count and close" description={`${longDay(day)}. The evening count is optional.`}
        footer={closed ? <Button onClick={onClose} kbd="Esc">Close window</Button> : (
          <>
            <Button onClick={onClose} kbd="Esc">Cancel</Button>
            <Button icon={<Save size={15} />} disabled={busy} onClick={async () => { if (await save()) toast.show({ tone: 'success', title: 'Count saved' }); }}>Save count</Button>
            <Button variant="primary" icon={<Lock size={15} />} disabled={busy || !noOpen} onClick={async () => { if (await save()) setClosing(true); }}>Close the day</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supervisor"><Input value={supervisor} disabled={closed} onChange={(e) => setSupervisor(e.target.value)} data-autofocus /></Field>
          <Field label="Note"><Input value={note} disabled={closed} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <table className="mt-3 w-full table-fixed">
          <thead>
            <tr>
              <th className={th}>Stock</th>
              <th className={cn(th, 'w-[110px] text-right')}>Books say</th>
              <th className={cn(th, 'w-[130px] text-right')}>Counted</th>
              <th className={cn(th, 'w-[110px] text-right')}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = counts[l.key];
              const diff = c?.trim() ? toMilli(c) - l.computed : null;
              return (
                <tr key={l.key} className="border-t border-line/70">
                  <td className="px-2 py-1 text-sm text-ink">{l.label} <span className="text-xs text-subtle">{l.unit}</span></td>
                  <td className="num px-2 py-1 text-right text-sm text-muted">{fmtQty(l.computed)}</td>
                  <td className="px-2 py-1">
                    <input className={cell} inputMode="decimal" value={c ?? ''} disabled={closed} onChange={(e) => setCounts((s) => ({ ...s, [l.key]: e.target.value }))} aria-label={`${l.label} counted`} />
                  </td>
                  <td className={cn('num px-2 py-1 text-right text-sm font-semibold', diff === null ? 'text-subtle' : diff === 0 ? 'text-success' : 'text-danger')}>
                    {diff === null ? '-' : diff === 0 ? 'matches' : `${diff > 0 ? '+' : '-'}${fmtQty(Math.abs(diff))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Oil is counted in the godown with the stick reading. Leave a line empty if you did not count it.
          {!closed && differences > 0 && <> Closing posts {differences} stock {differences === 1 ? 'adjustment' : 'adjustments'} with the reason "Mill sheet {day}".</>}
        </p>
        {closed && <div className="mt-2"><Badge tone="success">Closed by {info?.closedBy || 'the manager'}</Badge></div>}
        {!noOpen && !closed && (
          <div className="mt-2 rounded-card border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            This day still has {info?.legacyOpenRows} row{info?.legacyOpenRows === 1 ? '' : 's'} from an old manual sheet. Move them to Production from Old sheets before closing.
          </div>
        )}
        {err && <div className="mt-2 text-sm text-danger" role="alert">{err}</div>}
      </Dialog>
      <ManagerPinDialog
        open={closing} title="Close the mill day" message="Closing the day posts the counted differences as stock adjustments and makes the sheet read-only." confirmLabel="Approve and close"
        onClose={() => setClosing(false)}
        onSubmit={async (pin) => {
          try {
            const d = await api.closeMillDay({ day, managerPin: pin });
            onChanged(d); setClosing(false); onClose();
            toast.show({ tone: 'success', title: 'Mill day closed' });
            return null;
          } catch (e) { return e instanceof Error ? e.message : 'Could not close the day'; }
        }}
      />
    </>
  );
}
