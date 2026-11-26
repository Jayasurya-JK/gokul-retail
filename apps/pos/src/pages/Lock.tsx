import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock as LockIcon, LogOut, ShoppingBasket } from 'lucide-react';
import { countdownText, lockedSeconds } from '@gokul/data';
import { Kbd, Logo, StatusDot, clockTime, cn, darkenForWhite, useCountdown } from '@gokul/ui';
import { api, useOpenLines, useSession } from '../store';

/** A PIN is exactly 4 digits: it is checked as soon as the 4th digit is typed. The Sign in button is the mouse and touch way in. */
const PIN_LEN = 4;

/** Ctrl+L lock. The bill in progress stays exactly as it was; only the right PIN brings it back. */
export function Lock() {
  const nav = useNavigate();
  const { user, settings, heldCount, signOut } = useSession();
  const lines = useOpenLines();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const lockedAt = useRef(new Date());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Locking signs the user out of the backend too: only the right PIN brings the session back.
  useEffect(() => { void api.logout().catch(() => undefined); }, []);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const left = useCountdown(lockUntil);
  const pinLocked = left > 0;

  const switchUser = useCallback(() => { signOut(); nav('/login', { replace: true }); }, [signOut, nav]);

  const submit = useCallback(async (p: string) => {
    if (!user || busy) return;
    setBusy(true);
    let ok = null;
    try { ok = await api.verifyPin(user.id, p); } catch (e) {
      const secs = lockedSeconds(e instanceof Error ? e.message : '');
      if (secs) setLockUntil(Date.now() + secs * 1000);
      setPin(''); setBusy(false); inputRef.current?.focus();
      return;
    }
    if (ok) { nav('/billing', { replace: true }); return; }
    setError(true);
    window.setTimeout(() => { setPin(''); setError(false); setBusy(false); inputRef.current?.focus(); }, 450);
  }, [user, busy, nav]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); switchUser(); }
      else if (e.key === 'Escape') { e.preventDefault(); setPin(''); }
      else if (document.activeElement !== inputRef.current && /^\d$/.test(e.key)) inputRef.current?.focus();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [switchUser]);

  if (!user) return null;
  const mins = Math.max(0, Math.floor((now.getTime() - lockedAt.current.getTime()) / 60000));

  return (
    <div data-overflow-ok className="relative flex h-full w-full flex-col overflow-hidden bg-chrome text-chrome-ink">
      <div className="pointer-events-none absolute -right-24 -top-24 h-[480px] w-[480px] rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />

      <header className="relative flex h-16 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-2.5"><Logo size={30} badge="P" /><span className="text-md font-semibold tracking-tight text-white">{settings?.shopName ?? ''}</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-chrome-muted">POS</span></div>
        <div className="text-right">
          <div className="num text-2xl font-semibold leading-none text-white">{clockTime(now)}</div>
          <div className="mt-1 text-xs text-chrome-muted">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-chrome-ink"><LockIcon size={12} /> Counter locked{mins > 0 ? ` ${mins} min ago` : ''}</div>
        <span className="mt-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-overlay ring-4 ring-white/10" style={{ background: darkenForWhite(user.color) }}>{user.initials}</span>
        <div className="mt-4 text-2xl font-semibold tracking-tight text-white">{user.name}</div>
        <div className="mt-0.5 text-sm capitalize text-chrome-muted">{user.role} - {settings?.counter ?? '-'}</div>

        <div className={cn('mt-9 flex gap-4', error && 'animate-[shake_0.35s]')}>
          {Array.from({ length: PIN_LEN }, (_, i) => (
            <span key={i} className={cn('h-4 w-4 rounded-full border-2 transition-colors', i < pin.length ? (error ? 'border-danger bg-danger' : 'border-white bg-white') : 'border-white/35')} />
          ))}
        </div>
        <input
          ref={inputRef} type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={PIN_LEN} aria-label="Enter your PIN to unlock"
          onBlur={() => window.setTimeout(() => inputRef.current?.focus(), 0)}
          onChange={(e) => {
            if (busy || pinLocked) return;
            const v = e.target.value.replace(/\D/g, '').slice(0, PIN_LEN);
            setPin(v);
            if (v.length === PIN_LEN) window.setTimeout(() => void submit(v), 80);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === PIN_LEN) { e.preventDefault(); void submit(pin); } }}
          className="sr-only"
        />
        <div className={cn('mt-4 h-5 text-sm font-medium', error || pinLocked ? 'text-danger' : 'text-chrome-muted')}>
          {pinLocked ? <>Too many wrong PINs. Try again in <span className="num">{countdownText(left)}</span></> : error ? 'Wrong PIN. Try again.' : 'Type your PIN to unlock'}
        </div>

        <div className="mt-10 flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm ring-1 ring-white/10">
          <ShoppingBasket size={16} className="text-chrome-muted" />
          <span>{lines > 0 ? <><b className="num text-white">{lines}</b> items are waiting on the bill</> : 'No bill in progress'}{heldCount > 0 && <> - <b className="num text-white">{heldCount}</b> held</>}</span>
          <span className="flex items-center gap-1.5 text-chrome-muted"><StatusDot tone="success" /> Safe</span>
        </div>
      </main>

      <footer className="relative flex h-14 shrink-0 items-center justify-between px-8 text-sm text-chrome-muted">
        <span className="flex items-center gap-1.5"><Kbd tone="chrome">0-9</Kbd> PIN <Kbd tone="chrome" className="ml-3">Esc</Kbd> clear</span>
        <button tabIndex={-1} onClick={switchUser} className="flex h-9 items-center gap-2 rounded-lg px-3 text-chrome-ink hover:bg-white/10"><LogOut size={15} /> Switch user <Kbd tone="chrome">F2</Kbd></button>
      </footer>
    </div>
  );
}
