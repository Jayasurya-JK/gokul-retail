import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, ChevronDown, Keyboard, Lock, LogOut, Moon, Pause, Printer, Receipt, ShieldCheck, ShoppingCart, Undo2, UserRound, Users, Wallet,
} from 'lucide-react';
import { Kbd, Logo, Tooltip, cn } from '@gokul/ui';
import { useSession } from '../store';
import { ShortcutsSheet } from './ShortcutsSheet';

const pad = (n: number) => String(n).padStart(2, '0');

const MENU = [
  { label: 'Billing', path: '/billing', icon: ShoppingCart, match: ['/billing'] },
  { label: 'Customers', path: '/customers', icon: Users, match: ['/customers'] },
  { label: 'Sales', path: '/sales', icon: Receipt, match: ['/sales', '/history'] },
  { label: 'Returns', path: '/returns', icon: Undo2, match: ['/returns'] },
  { label: 'Expenses', path: '/cash', icon: Wallet, match: ['/cash'] },
  { label: 'Day close', path: '/day-close', icon: Moon, match: ['/day-close'] },
] as const;

export function TopBar({ onHeld, minimal }: { onHeld?: () => void; onLock?: () => void; onCloseDay?: () => void; minimal?: boolean }) {
  const { user, shift, settings, heldCount, signOut } = useSession();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [now, setNow] = useState(new Date());
  const [keys, setKeys] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  /* Global keys: F1 sheet, Alt+1..6 menu, Alt+U user menu. Capture phase so a screen's own handler never double-fires them. */
  useEffect(() => {
    if (minimal) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); e.stopPropagation(); setKeys((o) => !o); return; }
      if (keys && e.key !== 'Escape' && e.key !== 'Tab' && e.key !== ' ' && e.key !== 'Enter') { e.stopPropagation(); return; } // the sheet is modal: nothing leaks to the screen behind
      if (e.altKey && !e.ctrlKey && /^[1-6]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); nav(MENU[Number(e.key) - 1].path); }
      else if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); e.stopPropagation(); setMenu((o) => !o); }
      else if (menu && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); }
      else if (e.key === 'Escape' && !keys && pathname !== '/billing') {
        // Any other screen: Esc goes back to billing, unless the screen or a dialog used the Esc itself.
        window.setTimeout(() => { if (!e.defaultPrevented && !document.querySelector('[role="dialog"]')) nav('/billing'); }, 0);
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [minimal, keys, menu, nav, pathname]);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [menu]);

  const shiftMs = shift ? now.getTime() - new Date(shift.openedAt).getTime() : 0;
  const hrs = Math.max(0, Math.floor(shiftMs / 3600000));
  const mins = Math.max(0, Math.floor((shiftMs % 3600000) / 60000));
  const opened = shift ? new Date(shift.openedAt) : null;

  const brand = (
    <div className="flex shrink-0 items-center gap-2.5 pr-2">
      <Logo size={30} badge="P" />
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tracking-tight text-white">{settings?.shopName ?? 'Gokul Oils'}</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-chrome-muted">Billing counter</div>
      </div>
    </div>
  );

  if (minimal) {
    return (
      <>
        {brand}
        <div className="flex-1" />
        <span className="num text-xs text-chrome-muted">{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {pad(now.getHours())}:{pad(now.getMinutes())}</span>
      </>
    );
  }

  const go = (p: string) => { setMenu(false); nav(p); };
  const out = () => { setMenu(false); signOut(); nav('/login', { replace: true }); };

  return (
    <>
      {brand}
      <span className="mx-2 h-6 w-px bg-white/10" />
      <nav className="flex h-full items-stretch gap-0.5" aria-label="Main menu">
        {MENU.map((m, i) => {
          const active = (m.match as readonly string[]).includes(pathname);
          const Icon = m.icon;
          return (
            <Tooltip key={m.path} label={m.label} kbd={`Alt+${i + 1}`}>
              <button
                onClick={() => nav(m.path)} tabIndex={-1}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[13px] font-medium transition-colors',
                  active ? 'text-white' : 'text-chrome-muted hover:bg-white/[0.06] hover:text-white',
                )}
              >
                <Icon size={15} className={active ? 'text-yellow' : ''} />
                {m.label}
                {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-yellow" />}
              </button>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex-1" />

      {pathname !== '/billing' && (
        <Tooltip label="Back to billing" kbd="Esc">
          <button onClick={() => nav('/billing')} tabIndex={-1} aria-label="Back to billing (Esc)" className="ml-3 flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/15 px-2 text-xs font-medium text-white hover:bg-white/10">
            <ShoppingCart size={13} className="text-yellow" /> <span className="hidden min-[1500px]:inline">Back to billing</span> <Kbd tone="chrome">Esc</Kbd>
          </button>
        </Tooltip>
      )}

      <button
        onClick={onHeld ?? (() => nav('/billing'))} tabIndex={-1}
        className={cn('ml-2 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors hover:bg-white/10', heldCount ? 'bg-accent/15 text-accent' : 'text-chrome-muted')}
      >
        <Pause size={13} />
        <span className="num font-semibold">{heldCount}</span><span>held</span>
        <Kbd tone="chrome">F7</Kbd>
      </button>

      <div className="mx-1 flex items-center gap-0.5">
        <Tooltip label="Printer ready">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-md text-chrome-muted"><Printer size={15} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-chrome" /></span>
        </Tooltip>
        <Tooltip label="All bills saved on this computer">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-md text-chrome-muted"><ShieldCheck size={15} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-chrome" /></span>
        </Tooltip>
      </div>

      <button onClick={() => setKeys(true)} tabIndex={-1} className="flex h-8 items-center gap-2 rounded-md border border-white/10 px-2.5 text-xs text-chrome-ink hover:bg-white/10">
        <Keyboard size={14} className="text-chrome-muted" /> <span className="hidden min-[1500px]:inline">Shortcuts</span> <Kbd tone="chrome">F1</Kbd>
      </button>

      <span className="num mx-3 text-[13px] font-medium text-chrome-ink">{pad(now.getHours())}:{pad(now.getMinutes())}</span>

      <div ref={menuRef} className="relative">
        <button onClick={() => setMenu((o) => !o)} tabIndex={-1} className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-white/10">
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: user?.color }}>{user?.initials}</span>
          <span className="hidden text-left leading-tight min-[1500px]:block">
            <span className="block text-xs font-semibold text-white">{user?.name}</span>
            <span className="block text-[10px] capitalize text-chrome-muted">{user?.role}</span>
          </span>
          <ChevronDown size={13} className="text-chrome-muted" />
        </button>
        {menu && (
          <div className="g-overlay absolute right-0 top-[calc(100%+6px)] z-[60] w-[248px] overflow-hidden rounded-card border border-line bg-surface text-ink shadow-overlay">
            <div className="border-b border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
              <div className="flex items-center gap-1.5 font-semibold text-ink"><UserRound size={13} /> {user?.name}</div>
              <div className="num mt-1">{shift?.counter ?? 'Counter 1'} - shift since {opened ? `${pad(opened.getHours())}:${pad(opened.getMinutes())}` : '--'} ({hrs}h {pad(mins)}m)</div>
            </div>
            <MenuItem icon={<Lock size={15} />} label="Lock counter" kbd="Ctrl+L" onClick={() => go('/lock')} />
            <MenuItem icon={<ArrowLeftRight size={15} />} label="Switch user" onClick={out} />
            <MenuItem icon={<LogOut size={15} />} label="Sign out" onClick={out} danger />
          </div>
        )}
      </div>

      <ShortcutsSheet open={keys} onClose={() => setKeys(false)} />
    </>
  );
}

function MenuItem({ icon, label, kbd, onClick, danger }: { icon: ReactNode; label: string; kbd?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex h-9 w-full items-center gap-2.5 px-3 text-sm hover:bg-surface-3', danger ? 'text-danger' : 'text-ink')}>
      <span className="text-muted">{icon}</span><span className="flex-1 text-left">{label}</span>{kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}
