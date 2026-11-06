import { useEffect, useState } from 'react';
import { Lock, MoonStar, Pause, Printer, ShieldCheck } from 'lucide-react';
import { Kbd, Logo, StatusDot } from '@gokul/ui';
import { useSession } from '../store';

const pad = (n: number) => String(n).padStart(2, '0');

function Sep() {
  return <span className="mx-2 h-4 w-px bg-white/15" />;
}

export function TopBar({ onHeld, onLock, onCloseDay, minimal }: { onHeld?: () => void; onLock?: () => void; onCloseDay?: () => void; minimal?: boolean }) {
  const { user, shift, settings, heldCount } = useSession();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const shiftMs = shift ? now.getTime() - new Date(shift.openedAt).getTime() : 0;
  const hrs = Math.max(0, Math.floor(shiftMs / 3600000));
  const mins = Math.max(0, Math.floor((shiftMs % 3600000) / 60000));
  const opened = shift ? new Date(shift.openedAt) : null;

  return (
    <>
      <div className="flex items-center gap-2">
        <Logo size={20} />
        <span className="text-sm font-semibold tracking-tight">{settings?.shopName ?? 'Gokul Oils'}</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-chrome-muted">POS</span>
      </div>
      {!minimal && user && (
        <>
          <Sep />
          <span className="text-xs text-chrome-muted">{shift?.counter ?? 'Counter 1'}</span>
          <Sep />
          <span className="flex items-center gap-1.5 text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: user.color }}>{user.initials}</span>
            <span className="font-medium">{user.name}</span>
          </span>
          <Sep />
          <span className="text-xs text-chrome-muted num">
            Shift since {opened ? `${pad(opened.getHours())}:${pad(opened.getMinutes())}` : '--'}
            <span className="ml-1.5 text-chrome-ink">{hrs}h {pad(mins)}m</span>
          </span>
        </>
      )}
      <div className="flex-1" />
      {!minimal && (
        <>
          <button onClick={onHeld} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-white/10" tabIndex={-1}>
            <Pause size={13} className={heldCount ? 'text-amber-400' : 'text-chrome-muted'} />
            <span className={heldCount ? 'font-semibold text-amber-300' : 'text-chrome-muted'}>{heldCount} held</span>
            <Kbd tone="chrome">F7</Kbd>
          </button>
          <Sep />
          <span className="flex items-center gap-1.5 text-xs text-chrome-ink"><Printer size={13} className="text-chrome-muted" /><StatusDot tone="success" /> Printer ready</span>
          <Sep />
          <span className="flex items-center gap-1.5 text-xs text-chrome-ink"><ShieldCheck size={13} className="text-chrome-muted" /><StatusDot tone="success" /> All bills saved</span>
          <Sep />
          <span className="num text-xs font-medium text-chrome-ink">{pad(now.getHours())}:{pad(now.getMinutes())}</span>
          {onCloseDay && (
            <button onClick={onCloseDay} tabIndex={-1} className="ml-2 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-chrome-muted hover:bg-white/10 hover:text-white">
              <MoonStar size={13} /> Close day <Kbd tone="chrome">Ctrl+E</Kbd>
            </button>
          )}
          <button onClick={onLock} tabIndex={-1} className="ml-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-chrome-muted hover:bg-white/10 hover:text-white">
            <Lock size={13} /> Lock <Kbd tone="chrome">Ctrl+L</Kbd>
          </button>
        </>
      )}
      {minimal && <span className="num text-xs text-chrome-muted">{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {pad(now.getHours())}:{pad(now.getMinutes())}</span>}
    </>
  );
}
