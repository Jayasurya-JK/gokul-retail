import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, House, ChevronDown, Maximize, Minimize, Minimize2, CreditCard, Keyboard, Lock, LogOut, Moon, Package, Printer, ReceiptIndianRupee, ShoppingCart, Undo2, UserRound, UserRoundCheck, Wallet, type LucideIcon } from 'lucide-react';
import { Kbd, Logo, Tooltip, WindowButtons, clockTime, cn, useWindowControls } from '@gokul/ui';
import { billingStores, useSession } from '../store';
import { ShortcutsSheet } from './ShortcutsSheet';
import { usePrinterStatus } from '../printing';
import { DropMenu, type MenuEntry } from './BillToolbar';

const pad = (n: number) => String(n).padStart(2, '0');

/* Two rows. Row 1 is a quiet information row (home, shop, counter, printer, time, user, window buttons).
   Row 2 is the main tabs on a light background. Alt+1..8 reach every screen (the key is shown in each tooltip). */
const TABS = [
  { label: 'Point of Sale', path: '/billing', kbd: 'Alt+1', icon: ShoppingCart, match: ['/billing'] },
  { label: 'Sales Report', path: '/reports/sales', kbd: 'Alt+5', icon: BarChart3, match: ['/reports/sales'] },
  { label: 'Paymode Report', path: '/reports/paymode', kbd: 'Alt+6', icon: CreditCard, match: ['/reports/paymode'] },
  { label: 'Bills', path: '/sales', kbd: 'Alt+4', icon: ReceiptIndianRupee, match: ['/sales', '/history'] },
  { label: 'Customer', path: '/customers', kbd: 'Alt+8', icon: UserRound, match: ['/customers'] },
  { label: 'POS 1', path: '/pos1', kbd: 'Alt+2', icon: ReceiptIndianRupee, match: ['/pos1'] },
] as const;

interface MoreItem { label: string; path?: string; kbd?: string; icon: LucideIcon; match: string[]; divider?: boolean }

/** The More menu. Items without a path are actions (Keyboard shortcuts opens the F1 sheet). */
const MORE: MoreItem[] = [
  { label: 'Stock', path: '/reports/stock', kbd: 'Alt+7', icon: Package, match: ['/reports/stock'] },
  { label: 'Returns and exchange', path: '/returns', kbd: 'F10', icon: Undo2, match: ['/returns'], divider: true },
  { label: 'Expenses and cash', path: '/cash', kbd: 'F9', icon: Wallet, match: ['/cash'] },
  { label: 'Day close', path: '/day-close', kbd: 'Ctrl+E', icon: Moon, match: ['/day-close'] },
  { label: 'Staff report', path: '/reports/staff', icon: UserRoundCheck, match: ['/reports/staff'] },
  { label: 'Lock counter', path: '/lock', kbd: 'Ctrl+L', icon: Lock, match: ['/lock'], divider: true },
  { label: 'Keyboard shortcuts', kbd: 'F1', icon: Keyboard, match: [] },
];

/** Every navigable screen by its Alt number (Alt+1..8). Alt+3 is gone with POS2. */
const SCREENS: (string | null)[] = ['/billing', '/pos1', null, '/sales', '/reports/sales', '/reports/paymode', '/reports/stock', '/customers'];
/** The two bill screens and Home: Esc from any other screen comes back to billing (Home stays put) */
export const BILL_PATHS = ['/billing', '/pos1', '/home'];

export function TopBar({ minimal }: { onHeld?: () => void; onLock?: () => void; onCloseDay?: () => void; minimal?: boolean }) {
  const printer = usePrinterStatus();
  const openLines: Record<string, number> = {
    '/billing': billingStores.pos((s) => s.lines.length),
    '/pos1': billingStores.pos1((s) => s.lines.length),
  };
  const { user, shift, settings, signOut } = useSession();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [now, setNow] = useState(new Date());
  const [keys, setKeys] = useState(false);
  const [menu, setMenu] = useState(false);
  const win = useWindowControls();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  /* Global keys: F1 sheet, Alt+1..8 screens, Alt+U user menu. Capture phase so a screen's own handler never double-fires them. */
  useEffect(() => {
    if (minimal) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); e.stopPropagation(); setKeys((o) => !o); return; }
      if (keys && e.key !== 'Escape' && e.key !== 'Tab' && e.key !== ' ' && e.key !== 'Enter') { e.stopPropagation(); return; } // the sheet is modal: nothing leaks to the screen behind
      if (e.altKey && !e.ctrlKey && /^[0-8]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); const target = e.key === '0' ? '/home' : SCREENS[Number(e.key) - 1]; if (target) nav(target); }
      else if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); e.stopPropagation(); setMenu((o) => !o); }
      else if (menu && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); }
      else if (e.key === 'Escape' && !keys && !BILL_PATHS.includes(pathname)) {
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
  const rawCounter = String(shift?.counter ?? settings?.counter ?? '');
  const counterLabel = /^counter/i.test(rawCounter) ? rawCounter : `Counter ${rawCounter}`;

  const brand = (
    <div className="flex shrink-0 items-center gap-2.5">
      {!minimal && (
        <Tooltip label="Home" kbd="Alt+0">
          <button type="button" tabIndex={-1} onClick={() => nav('/home')} aria-label="Home" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <House size={15} />
          </button>
        </Tooltip>
      )}
      <Logo size={24} badge="P" />
      <div className="whitespace-nowrap text-[13px] text-chrome-ink">
        <span className="font-semibold text-white">{settings?.shopName ?? ''}</span>
        <span className="text-chrome-muted"> · Billing Counter</span>
      </div>
    </div>
  );

  const rowOne = 'flex h-9 shrink-0 items-center gap-2 bg-chrome px-3 text-chrome-ink shadow-[0_1px_0_rgb(0_0_0/0.25)]';

  if (minimal) {
    return (
      <div className={cn(rowOne, '!h-12')}>
        {brand}
        <div className="flex-1" />
        <span className="num text-xs text-chrome-muted">{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {clockTime(now)}</span>
      </div>
    );
  }

  const out = () => { setMenu(false); signOut(); nav('/login', { replace: true }); };

  /* The More button names the screen you are on when that screen lives under More */
  const current = MORE.find((m) => (m.match as readonly string[]).includes(pathname));
  const moreItems: MenuEntry[] = MORE.map((m) => ({
    label: m.label,
    kbd: m.kbd,
    icon: <m.icon size={15} />,
    divider: m.divider,
    onClick: () => (m.path ? nav(m.path) : setKeys(true)),
  }));

  const printerText = printer.ready ? 'Printer ready' : printer.configured ? 'Printer problem' : 'No printer';
  const printerTone = printer.ready ? 'text-chrome-ink' : printer.configured ? 'text-[rgb(var(--on-tile-bad))]' : 'text-[rgb(var(--on-tile-warn))]';

  return (
    <>
      <div className={rowOne}>
        {brand}
        <div className="flex-1" />

        {shift ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-xs font-medium text-chrome-ink">
            <span className="h-2 w-2 rounded-full bg-[rgb(var(--on-tile-good))]" />{counterLabel} open
          </span>
        ) : (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger px-3 text-xs font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-white" />Counter not open
          </span>
        )}

        <Tooltip label={printer.ready ? `Printer ready: ${printer.name}` : printer.message}>
          <span className={cn('ml-2 inline-flex items-center gap-1.5 text-xs', printerTone)}><Printer size={14} />{printerText}</span>
        </Tooltip>

        <span className="num mx-3 text-xs font-medium text-chrome-ink">{clockTime(now)}</span>

        <div ref={menuRef} className="relative">
          <button onClick={() => setMenu((o) => !o)} tabIndex={-1} className="flex h-7 items-center gap-1.5 rounded-md pl-0.5 pr-1.5 hover:bg-white/10">
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: user?.color }}>{user?.initials}</span>
            <span className="whitespace-nowrap text-xs font-medium text-white">{(user?.name ?? '').split(' ')[0]}</span>
            <ChevronDown size={12} className="text-chrome-muted" />
          </button>
          {menu && (
            <div className="g-overlay absolute right-0 top-[calc(100%+6px)] z-[60] w-[248px] overflow-hidden rounded-card border border-line bg-surface text-ink shadow-overlay">
              <div className="border-b border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
                <div className="flex items-center gap-1.5 font-semibold text-ink"><UserRound size={13} /> {user?.name}<span className="font-normal capitalize text-muted">· {user?.role}</span></div>
                <div className="num mt-1">{shift?.counter ?? settings?.counter ?? '-'} - shift since {opened ? clockTime(opened) : '--'} ({hrs}h {pad(mins)}m)</div>
              </div>
              {win.available && (
                <>
                  <MenuItem icon={win.fullscreen ? <Minimize2 size={15} /> : <Maximize size={15} />} label={win.fullscreen ? 'Exit full screen' : 'Full screen'} kbd="Shift+F11" onClick={() => { setMenu(false); win.toggleFullscreen(); }} />
                  <MenuItem icon={<Minimize size={15} />} label="Minimize" onClick={() => { setMenu(false); win.minimize(); }} />
                </>
              )}
              <MenuItem icon={<ArrowLeftRight size={15} />} label="Switch user" onClick={out} />
              <MenuItem icon={<LogOut size={15} />} label="Sign out" onClick={out} danger />
            </div>
          )}
        </div>

        <WindowButtons />
      </div>

      <nav className="flex h-[50px] shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3" aria-label="Main menu">
        {TABS.map((m) => {
          const active = (m.match as readonly string[]).includes(pathname);
          const Icon = m.icon;
          return (
            <Tooltip key={m.path} label={m.label} kbd={m.kbd}>
              <button
                onClick={() => nav(m.path)} tabIndex={-1}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-[16px] font-medium transition-colors',
                  active ? 'bg-primary-soft text-primary shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.25)]' : 'text-muted hover:bg-surface-3 hover:text-ink',
                )}
              >
                <Icon size={18} className={active ? 'text-primary' : 'text-subtle'} />
                {m.label}
                {openLines[m.path] > 0 && <span className="num rounded-full bg-primary px-1.5 text-[11px] font-bold leading-[18px] text-primary-fg" title="Items on this bill">{openLines[m.path]}</span>}
              </button>
            </Tooltip>
          );
        })}
        <DropMenu label={current?.label ?? 'More'} icon={<ChevronDown size={16} />} variant="tab" active={!!current} items={moreItems} heading="More" />
      </nav>

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
