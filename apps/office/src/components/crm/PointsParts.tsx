import { useEffect, useState } from 'react';
import { formatPoints, type PointsKind, type PointsLedgerRow } from '@gokul/data';
import { Badge, EmptyState, type Tone } from '@gokul/ui';
import { api } from '../../store';
import { fmtDate, fmtTime } from './common';

export const kindLabel: Record<PointsKind, string> = {
  earn: 'Earned', redeem: 'Used to pay', reverse: 'Reversed', adjust: 'Adjusted', expire: 'Expired', import: 'From POSBean',
};
const kindTone: Record<PointsKind, Tone> = { earn: 'success', redeem: 'info', reverse: 'warning', adjust: 'primary', expire: 'danger', import: 'neutral' };

export function KindBadge({ kind }: { kind: PointsKind }) {
  return <Badge tone={kindTone[kind]}>{kindLabel[kind]}</Badge>;
}

/** Opening rows from the POSBean import show this instead of their stored note (display only). */
const IMPORT_NOTE = 'Balance on 7 Nov 2026';

/** yyyy-mm-dd (a local day from the server) as 7 Nov 2027 */
export const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const signed = (p: number) => `${p > 0 ? '+' : p < 0 ? '-' : ''}${formatPoints(Math.abs(p))}`;

/** One customer's points ledger, newest first: date, entry, bill number, points, balance after, and who did it. */
export function PointsLedgerList({ customerId, version = 0 }: { customerId: string; version?: number }) {
  const [rows, setRows] = useState<PointsLedgerRow[] | null>(null);
  const [next, setNext] = useState<{ points: number; on: string } | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    setNext(null);
    api.getCustomerWallet(customerId).then((w) => live && setNext(w.nextExpiry)).catch(() => undefined);
    api.getPointsLedger(customerId, 500).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [customerId, version]);
  if (rows === null) return <div className="p-4 text-sm text-muted">Loading</div>;
  if (rows.length === 0) return <EmptyState title="No points yet" hint="Points are earned on every bill and show here, one line each." />;
  return (
    <div>
      {next && <div className="border-b border-line bg-warning-soft px-4 py-2 text-xs text-ink"><b className="num">{formatPoints(next.points)}</b> points expire on <b>{fmtDay(next.on)}</b></div>}
      <div className="sticky top-0 z-10 grid grid-cols-[76px_minmax(0,1fr)_66px_70px] gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>Date</span><span>Entry</span><span className="text-right">Points</span><span className="text-right">Balance</span>
      </div>
      {rows.map((r) => {
        const note = r.kind === 'import' ? IMPORT_NOTE : r.note;
        return (
        <div key={r.id} className="grid grid-cols-[76px_minmax(0,1fr)_66px_70px] items-center gap-2 border-b border-line/70 px-4 py-2 text-sm">
          <div className="leading-tight"><div className="text-ink">{fmtDate(r.at).slice(0, 6)}</div><div className="text-[11px] text-subtle">{fmtTime(r.at)}</div></div>
          <div className="min-w-0 leading-tight">
            <KindBadge kind={r.kind} />
            <div className="mt-0.5 truncate text-[11px] text-muted" title={`${note} (by ${r.by})`}>{r.bill ? <span className="num font-medium text-ink">{r.bill}</span> : note || '-'} · {r.by}</div>
          </div>
          <b className={`num text-right ${r.points >= 0 ? 'text-success' : 'text-danger'}`}>{signed(r.points)}</b>
          <span className="num text-right text-ink">{formatPoints(r.balanceAfter)}</span>
        </div>
        );
      })}
    </div>
  );
}
