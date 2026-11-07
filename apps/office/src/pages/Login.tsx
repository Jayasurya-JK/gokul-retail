import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { countdownText, lockedSeconds, type User } from '@gokul/data';
import { Button, Input, Kbd, Logo, Select, useCountdown } from '@gokul/ui';
import { api, useSession } from '../store';

export function Login() {
  const nav = useNavigate();
  const signIn = useSession((s) => s.signIn);
  const [users, setUsers] = useState<User[]>([]);
  const [uid, setUid] = useState('u1');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const [lockUntil, setLockUntil] = useState<Record<string, number>>({});

  useEffect(() => {
    api.listUsers().then((u) => {
      setUsers(u.filter((x) => x.role !== 'cashier'));
      setLockUntil(Object.fromEntries(u.filter((x) => x.lockedForSecs).map((x) => [x.id, Date.now() + (x.lockedForSecs ?? 0) * 1000])));
    });
  }, []);
  const left = useCountdown(lockUntil[uid] ?? null);
  const locked = left > 0;

  const submit = async () => {
    if (locked) return;
    try {
      const u = await api.verifyPin(uid, pw);
      if (u) { signIn(u); nav('/', { replace: true }); } else { setError('Wrong password. Try again.'); setPw(''); }
    } catch (e) {
      // 5 wrong PINs lock the user for a minute; the backend says how long.
      const msg = e instanceof Error ? e.message : 'Could not sign in.';
      const secs = lockedSeconds(msg);
      if (secs) { setLockUntil((m) => ({ ...m, [uid]: Date.now() + secs * 1000 })); setError(''); } else setError(msg);
      setPw('');
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2.5 bg-chrome px-3 text-chrome-ink shadow-[0_1px_0_rgb(0_0_0/0.25)]">
        <Logo size={30} badge="O" /><span className="text-[13px] font-semibold tracking-tight text-white">Gokul Office</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-chrome px-14 py-12 text-chrome-ink">
          <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-10 h-[360px] w-[360px] rounded-full bg-accent/10 blur-3xl" />
          <div className="relative text-xs font-medium uppercase tracking-[0.18em] text-chrome-muted">Gokul Retail</div>
          <div className="relative">
            <Logo size={112} className="mb-6 drop-shadow-2xl" />
            <div className="font-semibold tracking-tight text-white" style={{ fontSize: 40, lineHeight: '46px' }}>Gokul Office</div>
            <div className="mt-2 text-md text-chrome-muted">Items, stock, production, purchases and reports.</div>
          </div>
          <div className="relative text-xs text-chrome-muted">Gokul Office 0.1 - Back office</div>
        </div>
        <div className="flex w-[480px] shrink-0 flex-col justify-center border-l border-line bg-surface px-12">
          <h1 className="text-xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Owner and manager accounts only.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Select label="User" value={uid} onChange={(e) => setUid(e.target.value)} options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))} />
            <Input label="Password" type="password" autoFocus disabled={locked} icon={<Lock size={14} />} value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }} error={locked ? `Too many wrong passwords. Try again in ${countdownText(left)}.` : error} placeholder="PIN" />
            <Button type="submit" variant="primary" size="lg" block kbd="Enter" disabled={locked}>{locked ? `Locked ${countdownText(left)}` : 'Sign in'}</Button>
          </form>
          <div className="mt-6 flex items-center gap-1.5 text-xs text-subtle"><Kbd>Ctrl+K</Kbd> opens search once you are in.</div>
        </div>
      </div>
    </div>
  );
}
