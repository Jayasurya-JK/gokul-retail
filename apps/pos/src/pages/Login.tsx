import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Delete, LockKeyhole } from 'lucide-react';
import { countdownText, lockedSeconds, type Settings, type User } from '@gokul/data';
import { Kbd, Logo, PosLayout, cn, darkenForWhite, useCountdown } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { usePrinterStatus } from '../printing';

/** A PIN is 4 to 6 digits (chosen by the person), so nothing is checked until Enter, or at the 6th digit. */
const PIN_MIN = 4;
const PIN_MAX = 6;

export function Login() {
  const nav = useNavigate();
  const printer = usePrinterStatus();
  const signIn = useSession((s) => s.signIn);
  const [users, setUsers] = useState<User[]>([]);
  const [shop, setShop] = useState<Settings | null>(null);
  const [sel, setSel] = useState(0);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lockUntil, setLockUntil] = useState<Record<string, number>>({});

  useEffect(() => { api.getSettings().then(setShop).catch(() => undefined); }, []);
  useEffect(() => {
    api.listUsers().then((u) => {
      setUsers(u);
      setLockUntil(Object.fromEntries(u.filter((x) => x.lockedForSecs).map((x) => [x.id, Date.now() + (x.lockedForSecs ?? 0) * 1000])));
    });
  }, []);
  const user = users[sel];
  const left = useCountdown(user ? lockUntil[user.id] ?? null : null);
  const locked = left > 0;

  const submit = useCallback(async (p: string) => {
    if (!user || busy) return;
    setBusy(true);
    let ok: User | null = null;
    try { ok = await api.verifyPin(user.id, p); } catch (e) {
      // Too many wrong PINs: the backend locks this user for a minute and tells us how long.
      const secs = lockedSeconds(e instanceof Error ? e.message : '');
      if (secs) setLockUntil((m) => ({ ...m, [user.id]: Date.now() + secs * 1000 }));
      setPin(''); setBusy(false);
      return;
    }
    if (ok) {
      await signIn(ok);
      const day = await api.getDayStatus();
      nav(day.open ? '/home' : '/day-open', { replace: true });
    } else {
      setError(true);
      window.setTimeout(() => { setPin(''); setError(false); setBusy(false); }, 450);
    }
  }, [user, busy, signIn, nav]);

  const press = useCallback((d: string) => {
    if (busy || locked) return;
    setPin((p) => {
      if (p.length >= PIN_MAX) return p;
      const next = p + d;
      if (next.length === PIN_MAX) window.setTimeout(() => submit(next), 80);
      return next;
    });
  }, [busy, locked, submit]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') setPin('');
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, users.length - 1)); setPin(''); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); setPin(''); }
      else if (e.key === 'Enter' && pin.length >= PIN_MIN) submit(pin);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press, submit, pin, users.length]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <PosLayout
      topBar={<TopBar minimal />}
      sideWidth={520}
      keys={[
        { key: '0-9', label: 'Enter PIN' },
        { key: 'Up/Down', label: 'Choose user' },
        { key: 'Back', label: 'Delete digit', onClick: () => setPin((p) => p.slice(0, -1)) },
        { key: 'Esc', label: 'Clear', onClick: () => setPin('') },
        { key: 'Enter', label: 'Sign in', tone: 'primary', onClick: () => pin.length >= PIN_MIN && submit(pin) },
      ]}
      side={
        <div className="flex h-full flex-col px-10 py-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-subtle">Who is billing?</div>
          <div className="mt-3 flex flex-col gap-1.5">
            {users.map((u, i) => (
              <button
                key={u.id} tabIndex={-1} onClick={() => { setSel(i); setPin(''); }}
                className={cn(
                  'flex h-[52px] items-center gap-3 rounded-xl border px-3 text-left transition-colors',
                  i === sel ? 'border-primary bg-primary-soft shadow-[0_0_0_1px_rgb(var(--primary))]' : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: darkenForWhite(u.color) }}>{u.initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-ink">{u.name}</span>
                  <span className="block text-xs text-muted"><span className="capitalize">{u.role}</span> - last in {u.lastLogin}</span>
                </span>
                {i === sel && <Kbd>Active</Kbd>}
              </button>
            ))}
          </div>

          <div className="mt-auto flex flex-col items-center">
            <div className={cn('flex gap-3', error && 'animate-[shake_0.35s]', locked && 'opacity-40')}>
              {Array.from({ length: Math.max(PIN_MIN, pin.length) }, (_, i) => (
                <span key={i} className={cn('h-3.5 w-3.5 rounded-full border-2 transition-colors', i < pin.length ? (error ? 'border-danger bg-danger' : 'border-primary bg-primary') : 'border-line-strong bg-transparent')} />
              ))}
            </div>
            {locked
              ? <div className="mt-2 flex h-4 items-center gap-1.5 text-xs font-semibold text-danger"><LockKeyhole size={12} /> Too many wrong PINs. Try again in <span className="num">{countdownText(left)}</span></div>
              : <div className="mt-2 h-4 text-xs font-medium text-danger">{error ? 'Wrong PIN. Try again.' : ''}</div>}
            <div className="mt-2 grid w-[264px] grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <PadKey key={d} onClick={() => press(d)}>{d}</PadKey>
              ))}
              <PadKey muted onClick={() => setPin('')}>Clear</PadKey>
              <PadKey onClick={() => press('0')}>0</PadKey>
              <PadKey muted onClick={() => setPin((p) => p.slice(0, -1))}><Delete size={20} /></PadKey>
            </div>
            <button
              tabIndex={-1} disabled={pin.length < PIN_MIN || busy || locked} onClick={() => submit(pin)}
              className="mt-2 flex h-12 w-[264px] items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white transition-colors enabled:hover:brightness-110 disabled:opacity-40"
            >
              Sign in <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      }
    >
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-chrome px-14 py-12 text-chrome-ink">
        <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-[360px] w-[360px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative text-xs font-medium uppercase tracking-[0.18em] text-chrome-muted">Gokul Retail</div>
        <div className="relative">
          <Logo size={112} className="mb-6 drop-shadow-2xl" />
          <div className="text-3xl font-semibold leading-tight tracking-tight text-white" style={{ fontSize: 40, lineHeight: '46px' }}>{shop?.shopName ?? ''}</div>
          <div className="mt-2 text-md text-chrome-muted">{shop?.address ?? ''}</div>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Info k="Counter" v={shop?.counter ?? '-'} />
            <Info k="Printer" v={printer.configured ? `${printer.name}${printer.ready ? ", ready" : ", not ready"}` : "Not set up yet"} />
            <Info k="Today" v={today} />
          </div>
        </div>
        <div className="relative text-xs text-chrome-muted">Gokul POS 0.1 - Billing counter</div>
      </div>
    </PosLayout>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-chrome-muted">{k}</div><div className="mt-0.5 text-chrome-ink">{v}</div></div>;
}

function PadKey({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button
      tabIndex={-1} onClick={onClick}
      className={cn(
        'flex h-12 items-center justify-center rounded-xl border border-line bg-surface text-lg font-semibold text-ink transition-colors hover:bg-surface-3 active:bg-primary-soft',
        muted && 'text-sm font-medium text-muted',
      )}
    >
      {children}
    </button>
  );
}
