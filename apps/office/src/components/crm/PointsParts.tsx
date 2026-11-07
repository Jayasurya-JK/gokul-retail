import { useEffect, useState } from 'react';
import { MinusCircle, PlusCircle } from 'lucide-react';
import { formatPoints, type PointsKind, type PointsLedgerRow } from '@gokul/data';
import { Badge, Button, Dialog, EmptyState, Field, Input, ManagerPinDialog, NumberInput, type Tone } from '@gokul/ui';
import { api, useSession } from '../../store';
import { fmtDate, fmtTime, Segmented } from './common';

export const kindLabel: Record<PointsKind, string> = {
  earn: 'Earned', redeem: 'Used to pay', reverse: 'Reversed', adjust: 'Adjusted', expire: 'Expired', import: 'Opening balance',
};
const kindTone: Record<PointsKind, Tone> = { earn: 'success', redeem: 'info', reverse: 'warning', adjust: 'primary', expire: 'danger', import: 'neutral' };

export function KindBadge({ kind }: { kind: PointsKind }) {
  return <Badge tone={kindTone[kind]}>{kindLabel[kind]}</Badge>;
}

export const signed = (p: number) => `${p > 0 ? '+' : p < 0 ? '-' : ''}${formatPoints(Math.abs(p))}`;

/** One customer's points ledger, newest first: date, entry, bill number, points, balance after, and who did it. */
export function PointsLedgerList({ customerId, version = 0 }: { customerId: string; version?: number }) {
  const [rows, setRows] = useState<PointsLedgerRow[] | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    api.getPointsLedger(customerId, 500).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [customerId, version]);
  if (rows === null) return <div className="p-4 text-sm text-muted">Loading</div>;
  if (rows.length === 0) return <EmptyState title="No points yet" hint="Points are earned on every bill and show here, one line each." />;
  return (
    <div>
      <div className="sticky top-0 z-10 grid grid-cols-[76px_minmax(0,1fr)_74px_78px] gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>Date</span><span>Entry</span><span className="text-right">Points</span><span className="text-right">Balance</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[76px_minmax(0,1fr)_74px_78px] items-center gap-2 border-b border-line/70 px-4 py-2 text-sm">
          <div className="leading-tight"><div className="text-ink">{fmtDate(r.at).slice(0, 6)}</div><div className="text-[11px] text-subtle">{fmtTime(r.at)}</div></div>
          <div className="min-w-0 leading-tight">
            <KindBadge kind={r.kind} />
            <div className="mt-0.5 truncate text-[11px] text-muted" title={`${r.note} (by ${r.by})`}>{r.bill ? <span className="num font-medium text-ink">{r.bill}</span> : r.note || '-'} · {r.by}</div>
          </div>
          <b className={`num text-right ${r.points >= 0 ? 'text-success' : 'text-danger'}`}>{signed(r.points)}</b>
          <span className="num text-right text-ink">{formatPoints(r.balanceAfter)}</span>
        </div>
      ))}
    </div>
  );
}

const toNum = (s: string) => Math.round((parseFloat(s) || 0) * 100) / 100;

/** Add or remove points for one customer. The reason is required and the owner's or a manager's PIN confirms it. */
export function AdjustPointsDialog({ open, customer, onClose, onDone }: {
  open: boolean; customer: { id: string; name: string; points: number } | null; onClose: () => void; onDone: (balance: number) => void;
}) {
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pin, setPin] = useState(false);
  useEffect(() => { if (open) { setDir('add'); setPts(''); setReason(''); setError(''); setPin(false); } }, [open]);
  if (!customer) return null;
  const n = toNum(pts);
  const after = customer.points + (dir === 'add' ? n : -n);
  const review = () => {
    if (n <= 0) { setError('Enter how many points to ' + (dir === 'add' ? 'add.' : 'remove.')); return; }
    if (dir === 'remove' && n > customer.points) { setError(`${customer.name} has only ${formatPoints(customer.points)} points.`); return; }
    if (reason.trim().length < 3) { setError('Write the reason (at least 3 letters).'); return; }
    setError(''); setPin(true);
  };
  const submit = async (managerPin: string): Promise<string | null> => {
    try {
      const r = await api.adjustPoints({ customerId: customer.id, points: dir === 'add' ? n : -n, reason: reason.trim(), managerPin });
      setPin(false);
      onDone(r.balance);
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'Could not change the points.'; }
  };
  return (
    <>
      <Dialog
        open={open && !pin} onOpenChange={(o) => !o && onClose()} size="sm" title="Adjust points" description={`${customer.name} now has ${formatPoints(customer.points)} points`}
        footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={review} kbd="Enter">Review</Button></>}
      >
        <div className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); review(); } }}>
          <Segmented value={dir} onChange={setDir} options={[{ value: 'add', label: <span className="flex items-center gap-1.5"><PlusCircle size={14} /> Add points</span> }, { value: 'remove', label: <span className="flex items-center gap-1.5"><MinusCircle size={14} /> Remove points</span> }]} />
          <Field label="Points" error={undefined}>
            <NumberInput value={pts} decimals={2} data-autofocus onValueChange={(v) => { setPts(v); setError(''); }} placeholder="0.00" />
          </Field>
          <Field label="Reason (kept in the ledger and the audit log)">
            <Input value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setError(''); }} placeholder="Festival gift, wrong bill, old card points" />
          </Field>
          <div className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">Balance after</span>
            <b className={`num ${after < 0 ? 'text-danger' : 'text-ink'}`}>{formatPoints(Math.max(0, after))} points</b>
          </div>
          {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</div>}
        </div>
      </Dialog>
      <ManagerPinDialog
        open={open && pin} title="Manager approval" confirmLabel="Change points"
        message={`${dir === 'add' ? 'Add' : 'Remove'} ${formatPoints(n)} points ${dir === 'add' ? 'to' : 'from'} ${customer.name}. Reason: ${reason.trim()}.`}
        onClose={() => setPin(false)} onSubmit={submit} onLocked={() => useSession.getState().signOut()}
      />
    </>
  );
}

/** The same add or remove for every customer in the list the screen is showing (search and filter), after a clear confirmation. */
export function BulkAdjustDialog({ open, q, filter, matched, scope, onClose, onDone }: {
  open: boolean; q: string; filter: 'all' | 'withPoints' | 'zero'; matched: number; scope: string; onClose: () => void; onDone: (r: { customers: number; points: number }) => void;
}) {
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState('');
  const [error, setError] = useState('');
  const [pin, setPin] = useState(false);
  useEffect(() => { if (open) { setDir('add'); setPts(''); setReason(''); setSure(''); setError(''); setPin(false); } }, [open]);
  const n = toNum(pts);
  const word = String(matched);
  const review = () => {
    if (n <= 0) { setError('Enter how many points to ' + (dir === 'add' ? 'add.' : 'remove.')); return; }
    if (reason.trim().length < 3) { setError('Write the reason (at least 3 letters).'); return; }
    if (sure.trim() !== word) { setError(`Type ${matched.toLocaleString('en-IN')} to confirm the number of customers.`); return; }
    setError(''); setPin(true);
  };
  const submit = async (managerPin: string): Promise<string | null> => {
    try {
      const r = await api.bulkAdjustPoints({ q, filter, points: dir === 'add' ? n : -n, reason: reason.trim(), expectedCount: matched, managerPin });
      setPin(false);
      onDone(r);
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'Could not change the points.'; }
  };
  return (
    <>
      <Dialog
        open={open && !pin} onOpenChange={(o) => !o && onClose()} size="md" title="Adjust points for many customers" description={`Applies to ${matched.toLocaleString('en-IN')} customers: ${scope}`}
        footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={review} kbd="Enter" disabled={matched === 0}>Review</Button></>}
      >
        <div className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); review(); } }}>
          <Segmented value={dir} onChange={setDir} options={[{ value: 'add', label: 'Add to each' }, { value: 'remove', label: 'Remove from each' }]} />
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <Field label="Points each"><NumberInput value={pts} decimals={2} data-autofocus onValueChange={(v) => { setPts(v); setError(''); }} placeholder="0.00" /></Field>
            <Field label="Reason (kept in every ledger and the audit log)"><Input value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setError(''); }} placeholder="Deepavali bonus" /></Field>
          </div>
          <div className="rounded-control border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm text-ink">
            <b>{dir === 'add' ? 'Adds' : 'Removes'} {formatPoints(n)} points {dir === 'add' ? 'to' : 'from'} each of {matched.toLocaleString('en-IN')} customers</b>
            {n > 0 && <> ({formatPoints(n * matched)} points in all{dir === 'remove' ? ' at most; nobody goes below zero' : ''}).</>}
            <div className="mt-0.5 text-xs text-muted">Every customer gets their own ledger line. It cannot be undone, only corrected with another adjustment.</div>
          </div>
          <Field label={`Type ${matched.toLocaleString('en-IN')} to confirm`}>
            <Input value={sure} inputMode="numeric" onChange={(e) => { setSure(e.target.value.replace(/\D/g, '')); setError(''); }} className="num w-40" />
          </Field>
          {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</div>}
        </div>
      </Dialog>
      <ManagerPinDialog
        open={open && pin} title="Manager approval" confirmLabel="Change points"
        message={`${dir === 'add' ? 'Add' : 'Remove'} ${formatPoints(n)} points ${dir === 'add' ? 'to' : 'from'} each of ${matched.toLocaleString('en-IN')} customers (${scope}). Reason: ${reason.trim()}.`}
        onClose={() => setPin(false)} onSubmit={submit} onLocked={() => useSession.getState().signOut()}
      />
    </>
  );
}
