import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { CASH_REASONS, formatRupees, needsManagerPin, parsePaise, type CashEntry, type CashKind } from '@gokul/data';
import { Button, EmptyState, Kbd, ManagerPinDialog, Money, PosLayout, cn, useToast } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';

const COLS = '84px 100px minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1fr) 120px';
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export function CashInOut() {
  const nav = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [kind, setKind] = useState<CashKind>('out');
  const [amount, setAmount] = useState('');
  const [reasonIdx, setReasonIdx] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const reasons = CASH_REASONS[kind];
  const reason = reasons[reasonIdx] ?? reasons[0];

  const refresh = useCallback(() => api.listCashEntries().then(setEntries), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const totals = useMemo(() => {
    const out = entries.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
    const inn = entries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
    return { out, inn, net: inn - out };
  }, [entries]);

  const switchKind = useCallback((k: CashKind) => {
    setKind(k); setReasonIdx(0); setError(null);
    requestAnimationFrame(() => amountRef.current?.focus());
  }, []);

  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const save = useCallback(async (pin?: string): Promise<string | null> => {
    if (saving) return null;
    const paise = parsePaise(amount);
    if (paise === null || paise <= 0) { setError('Enter the amount first.'); amountRef.current?.focus(); return null; }
    if (paise > 99_99_999_00) { setError('That amount looks too large. Check the digits.'); amountRef.current?.focus(); return null; }
    if (reason === 'Other' && !note.trim()) { setError('Add a short note when the reason is Other.'); noteRef.current?.focus(); return null; }
    setSaving(true);
    try {
      await api.addCashEntry({ kind, reason, amount: paise, note: note.trim(), by: user?.name ?? 'Cashier', managerPin: pin });
      toast.show({
        tone: 'success', title: kind === 'out' ? 'Cash out saved' : 'Cash in saved',
        detail: `${formatRupees(paise, { decimals: false })} - ${reason}. Drawer total updated.`,
      });
      setAmount(''); setNote(''); setReasonIdx(0); setError(null);
      await refresh();
      setPinAsk(null);
      amountRef.current?.focus();
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (!pin && needsManagerPin(m)) { setPinAsk(m); return null; }
      if (pin) return m || 'Could not save';
      setError(/permission/i.test(m) ? m : 'Could not save. Nothing was changed, press Enter to try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [amount, kind, note, reason, refresh, saving, toast, user]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (pinAsk) return;
      if (e.key === 'Escape') { e.preventDefault(); nav('/billing'); }
      else if (e.key === 'F3') { e.preventDefault(); switchKind('out'); }
      else if (e.key === 'F4') { e.preventDefault(); switchKind('in'); }
      else if (e.key === 'F12') { e.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav, save, switchKind, pinAsk]);

  useEffect(() => { amountRef.current?.focus(); }, []);

  const moveReason = (d: number) => setReasonIdx((i) => (i + d + reasons.length) % reasons.length);

  return (
    <PosLayout
      topBar={<TopBar />}
      sideWidth={460}
      keys={[
        { key: 'F3', label: 'Cash out', onClick: () => switchKind('out') },
        { key: 'F4', label: 'Cash in', onClick: () => switchKind('in') },
        { key: 'Tab', label: 'Next field' },
        { key: 'Esc', label: 'Back to billing', onClick: () => nav('/billing') },
        { key: 'F12', label: 'Save entry', tone: 'primary', onClick: () => void save() },
      ]}
      side={
        <div className="flex h-full flex-col">
          <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Wallet size={20} /></span>
            <div>
              <h1 className="text-md font-semibold leading-5 text-ink">New cash entry</h1>
              <p className="text-xs text-muted">Money taken out of, or added to, the drawer</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-3 p-1">
              <KindButton active={kind === 'out'} tone="danger" onClick={() => switchKind('out')} icon={<ArrowUpRight size={16} />} label="Cash out" k="F3" />
              <KindButton active={kind === 'in'} tone="success" onClick={() => switchKind('in')} icon={<ArrowDownLeft size={16} />} label="Cash in" k="F4" />
            </div>

            <label className="mt-5 block text-xs font-medium text-muted">Amount</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-semibold text-subtle">₹</span>
              <input
                ref={amountRef} value={amount} inputMode="decimal" autoComplete="off" placeholder="0"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); reasonRef.current?.focus(); } }}
                aria-label="Amount in rupees"
                className="num h-14 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-4 text-right text-2xl font-semibold text-ink placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary/20"
              />
            </div>

            <label className="mt-5 flex items-center justify-between text-xs font-medium text-muted">
              <span>Reason</span>
              <span className="flex items-center gap-1 text-subtle"><Kbd>Left</Kbd><Kbd>Right</Kbd> change <Kbd>Enter</Kbd> next</span>
            </label>
            <div
              ref={reasonRef} tabIndex={0} role="radiogroup" aria-label="Reason"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveReason(1); }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveReason(-1); }
                else if (e.key === 'Enter') { e.preventDefault(); noteRef.current?.focus(); }
              }}
              className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {reasons.map((r, i) => (
                <button
                  key={r} type="button" tabIndex={-1} role="radio" aria-checked={i === reasonIdx}
                  onClick={() => setReasonIdx(i)}
                  className={cn(
                    'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
                    i === reasonIdx ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong bg-surface text-ink hover:bg-surface-3',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-medium text-muted">Note {reason === 'Other' ? '(needed)' : '(optional)'}</label>
            <input
              ref={noteRef} value={note} autoComplete="off" spellCheck={false} maxLength={80}
              placeholder={kind === 'out' ? 'Who was it paid to, and for what' : 'Where did the money come from'}
              onChange={(e) => { setNote(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
              className="mt-1 h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
            />

            <div className="mt-3 h-5 text-sm font-medium text-danger" role="alert">{error}</div>
          </div>

          <div className="shrink-0 border-t border-line p-4">
            <Button variant={kind === 'out' ? 'danger' : 'primary'} size="lg" block className="!h-[52px] !text-lg" disabled={saving} onClick={() => void save()} kbd="F12">
              {kind === 'out' ? 'Save cash out' : 'Save cash in'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid shrink-0 grid-cols-3 gap-3 border-b border-line bg-surface p-4">
        <Stat label="Cash out today" tone="danger" value={<Money paise={totals.out} decimals={false} />} hint={count(entries, "out")} />
        <Stat label="Cash in today" tone="success" value={<Money paise={totals.inn} decimals={false} />} hint={count(entries, "in")} />
        <Stat label="Net effect on drawer" value={<Money paise={totals.net} decimals={false} sign />} hint={totals.net < 0 ? 'Drawer has less cash' : 'Drawer has more cash'} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <div className="grid h-8 shrink-0 items-center border-b border-line bg-surface-2 px-5 text-[11px] font-semibold uppercase tracking-wider text-muted" style={{ gridTemplateColumns: COLS }}>
          <span>Time</span><span>Type</span><span>Reason</span><span>Note</span><span>By</span><span className="text-right">Amount</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No cash entries yet today" hint="Tea money, transport, supplier cash or change added will show up here." />
          ) : entries.map((e) => (
            <div key={e.id} className="grid h-[54px] items-center border-b border-line/70 px-5 text-base min-[1700px]:h-[60px]" style={{ gridTemplateColumns: COLS }}>
              <span className="num text-sm text-muted">{time(e.at)}</span>
              <span>
                <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold', e.kind === 'out' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
                  {e.kind === 'out' ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}{e.kind === 'out' ? 'Out' : 'In'}
                </span>
              </span>
              <span className="truncate pr-3 font-medium text-ink">{e.reason}</span>
              <span className="truncate pr-3 text-muted" title={e.note}>{e.note || <span className="text-subtle">-</span>}</span>
              <span className="truncate pr-3 text-sm text-muted">{e.by}</span>
              <span className={cn('num text-right text-md font-semibold', e.kind === 'out' ? 'text-danger' : 'text-success')}>
                <Money paise={e.kind === 'out' ? -e.amount : e.amount} decimals={false} sign />
              </span>
            </div>
          ))}
        </div>
      </div>
    <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval for cash out" message={pinAsk ?? ''} confirmLabel="Approve and save"
        onClose={() => setPinAsk(null)} onSubmit={(pin) => save(pin)}
        onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
    </PosLayout>
  );
}

function KindButton({ active, tone, onClick, icon, label, k }: { active: boolean; tone: 'danger' | 'success'; onClick: () => void; icon: React.ReactNode; label: string; k: string }) {
  return (
    <button
      type="button" tabIndex={-1} onClick={onClick}
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-lg text-base font-semibold transition-colors',
        active ? 'bg-surface shadow-sm ' + (tone === 'danger' ? 'text-danger' : 'text-success') : 'text-muted hover:text-ink',
      )}
    >
      {icon}{label}<Kbd>{k}</Kbd>
    </button>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('num mt-0.5 text-xl font-semibold tracking-tight', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 text-xs text-subtle">{hint}</div>
    </div>
  );
}

function count(entries: CashEntry[], kind: CashKind) {
  const n = entries.filter((e) => e.kind === kind).length;
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}
