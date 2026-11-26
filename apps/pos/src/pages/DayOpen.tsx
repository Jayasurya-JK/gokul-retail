import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, History, Sunrise } from 'lucide-react';
import { USUAL_FLOAT, countedTotal, type DayStatus, type DenomCounts } from '@gokul/data';
import { Button, Kbd, Money, PosLayout, cn, useToast } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { DenomCounter } from '../components/DenomCounter';

export function DayOpen() {
  const nav = useNavigate();
  const toast = useToast();
  const { user, signOut, setShift } = useSession();
  const [counts, setCounts] = useState<DenomCounts>({});
  const [status, setStatus] = useState<DayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const total = countedTotal(counts);
  const [gen, setGen] = useState(0);

  useEffect(() => { api.getDayStatus().then((d) => { setStatus(d); if (d.open) nav('/home', { replace: true }); }); }, [nav]);

  const start = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const shift = await api.openDay({ userId: user.id, counts });
      setShift(shift);
      toast.show({ tone: 'success', title: 'Day started', detail: `Opening cash ₹${(total / 100).toLocaleString('en-IN')}. Happy billing.` });
      nav('/home', { replace: true });
    } catch {
      toast.show({ tone: 'error', title: 'Could not start the day', detail: 'Nothing was changed. Try Enter again.' });
      setBusy(false);
    }
  }, [user, busy, counts, setShift, toast, total, nav]);

  const fillUsual = useCallback(() => {
    setCounts({ ...USUAL_FLOAT });
    setGen((n) => n + 1);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); void start(); }
      else if (e.key === 'F3') { e.preventDefault(); fillUsual(); }
      else if (e.key === 'Escape') { e.preventDefault(); signOut(); nav('/login'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [start, fillUsual, signOut, nav]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const suggested = status?.suggestedFloat ?? 0;

  return (
    <PosLayout
      topBar={<TopBar minimal />}
      sideWidth={420}
      keys={[
        { key: 'Enter', label: 'Next row' },
        { key: 'Up/Down', label: 'Move' },
        { key: 'F3', label: 'Usual float', onClick: fillUsual },
        { key: 'Esc', label: 'Sign out', onClick: () => { signOut(); nav('/login'); } },
        { key: 'F12', label: 'Start the day', tone: 'primary', onClick: () => void start() },
      ]}
      side={
        <div className="flex h-full flex-col">
          <div className="p-4">
            <div className="rounded-xl bg-chrome px-5 pb-4 pt-3 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">Opening cash in drawer</div>
              <div className="num mt-1 text-right font-semibold leading-none tracking-tight" style={{ fontSize: 'clamp(40px, 3.4vw, 54px)' }}>
                <Money paise={total} decimals={false} />
              </div>
            </div>
          </div>

          <div className="mx-4 divide-y divide-line rounded-xl border border-line text-base">
            <Info k="Date" v={today} />
            <Info k="Counter" v={status?.shift?.counter ?? '-'} />
            <Info k="Cashier" v={user?.name ?? ''} />
          </div>

          <button
            tabIndex={-1} onClick={fillUsual}
            className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><History size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Yesterday's closing float</span>
              <span className="block text-xs text-muted">Left in the drawer after the last Z close</span>
            </span>
            <span className="text-right">
              <span className="block text-md font-semibold num text-ink"><Money paise={suggested} decimals={false} /></span>
              <span className="flex items-center justify-end gap-1 text-xs text-subtle"><Kbd>F3</Kbd> use</span>
            </span>
          </button>

          <div className="min-h-0 flex-1" />

          <div className="p-4">
            {total === 0 && (
              <div className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                The drawer count is zero. Bills will start with no change in hand.
              </div>
            )}
            <Button variant="primary" size="lg" block className="!h-[52px] !text-lg" disabled={busy} onClick={() => void start()} kbd="F12" icon={<Sunrise size={20} />}>
              Start the day
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col bg-bg">
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><IndianRupee size={22} /></span>
          <div>
            <h1 className="text-lg font-semibold leading-6 text-ink">Open the day</h1>
            <p className="text-sm text-muted">Count the notes and coins in the drawer before the first bill.</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className={cn('mx-auto w-full max-w-[880px] overflow-hidden rounded-card border border-line bg-surface')}>
            <DenomCounter key={gen} counts={counts} onChange={(k, n) => setCounts((c) => ({ ...c, [k]: n }))} onDone={() => void start()} doneLabel="start the day" />
          </div>
        </div>
      </div>
    </PosLayout>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-muted">{k}</span>
      <span className="truncate text-right font-medium text-ink">{v}</span>
    </div>
  );
}
