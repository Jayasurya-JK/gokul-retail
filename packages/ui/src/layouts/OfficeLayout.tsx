import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight, CornerDownLeft, Moon, Search, Sun } from 'lucide-react';
import { cn } from '../cn';
import { Kbd } from '../components/Display';
import { Dialog, Tooltip } from '../components/Overlay';
import { IconButton } from '../components/Button';
import { Logo } from '../components/Logo';

export interface NavItem { path: string; label: string; icon: ReactNode; keywords?: string }
export interface NavGroup { title: string; items: NavItem[] }
export interface OfficeUser { name: string; role: string; initials: string }

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('gokul-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('gokul-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export function OfficeLayout({ nav, activePath, onNavigate, user, children, statusLeft, statusRight, onLogout }: {
  nav: NavGroup[]; activePath: string; onNavigate: (path: string) => void; user: OfficeUser; children: ReactNode;
  statusLeft?: ReactNode; statusRight?: ReactNode; onLogout?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); setCollapsed((c) => !c); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const activeLabel = useMemo(() => nav.flatMap((g) => g.items).find((i) => activePath === i.path || (i.path !== '/' && activePath.startsWith(i.path)))?.label, [nav, activePath]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 bg-chrome px-3 text-chrome-ink shadow-[0_1px_0_rgb(0_0_0/0.25)]">
        <div className="flex w-[216px] shrink-0 items-center gap-2.5">
          <Logo size={30} badge="O" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight text-white">Gokul Office</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-chrome-muted">Back office</div>
          </div>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-auto flex h-8 w-full min-w-0 max-w-[460px] items-center gap-2 rounded-md border border-white/10 bg-white/[0.07] px-2.5 text-xs text-chrome-muted transition-colors hover:bg-white/[0.12]"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search screens and actions</span>
          <Kbd tone="chrome">Ctrl+K</Kbd>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            <button onClick={toggleTheme} className="flex h-8 w-8 items-center justify-center rounded-md text-chrome-muted hover:bg-white/10 hover:text-white" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </Tooltip>
          <span className="mx-1 h-6 w-px bg-white/10" />
          <button onClick={onLogout} className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2.5 hover:bg-white/10" title="Sign out">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow text-[11px] font-bold text-forest-950">{user.initials}</span>
            <span className="text-left leading-tight">
              <span className="block text-xs font-semibold text-white">{user.name}</span>
              <span className="block text-[10px] capitalize text-chrome-muted">{user.role}</span>
            </span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className={cn('flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150', collapsed ? 'w-[52px]' : 'w-[232px]')}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
            {nav.map((g, gi) => (
              <div key={g.title} className={cn(gi > 0 && 'mt-3')}>
                {!collapsed ? (
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.title}</div>
                ) : gi > 0 ? <div className="mx-2 mb-2 h-px bg-line" /> : null}
                {g.items.map((it) => {
                  const active = activePath === it.path || (it.path !== '/' && activePath.startsWith(it.path + '/'));
                  const btn = (
                    <button
                      key={it.path}
                      onClick={() => onNavigate(it.path)}
                      className={cn(
                        'relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
                        active ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-3 hover:text-ink',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      {active && <span className="absolute -left-2 top-1.5 h-5 w-[3px] rounded-r bg-primary" />}
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </button>
                  );
                  return collapsed ? <Tooltip key={it.path} label={it.label} side="right">{btn}</Tooltip> : btn;
                })}
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-line p-2">
            {!collapsed && <span className="pl-2 text-xs text-subtle">Collapse</span>}
            <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} kbd="Ctrl+B" size="sm" onClick={() => setCollapsed((c) => !c)} className={collapsed ? 'mx-auto' : ''}>
              {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
            </IconButton>
          </div>
        </nav>

        {/* Content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between bg-chrome px-3 text-[11px] text-chrome-muted">
        <div className="flex items-center gap-3">{statusLeft}</div>
        <div className="flex items-center gap-3">{statusRight}<span>{activeLabel}</span></div>
      </footer>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} onNavigate={(p) => { setPaletteOpen(false); onNavigate(p); }} />
    </div>
  );
}

function CommandPalette({ open, onOpenChange, nav, onNavigate }: { open: boolean; onOpenChange: (o: boolean) => void; nav: NavGroup[]; onNavigate: (p: string) => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const all = useMemo(() => nav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title }))), [nav]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? all.filter((i) => `${i.label} ${i.group} ${i.keywords ?? ''}`.toLowerCase().includes(t)) : all;
  }, [all, q]);
  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Command palette" size="md" hideHeader bodyClassName="p-0">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search size={16} className="text-subtle" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a screen..."
          className="h-12 flex-1 bg-transparent text-md text-ink placeholder:text-subtle"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter' && list[hi]) onNavigate(list[hi].path);
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul className="max-h-[360px] overflow-auto p-2">
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">Nothing matches "{q}"</li>}
        {list.map((i, idx) => (
          <li
            key={i.path} onMouseEnter={() => setHi(idx)} onClick={() => onNavigate(i.path)}
            ref={(el) => { if (el && idx === hi) el.scrollIntoView({ block: 'nearest' }); }}
            className={cn('flex h-9 items-center gap-3 rounded-md px-3 text-sm', idx === hi ? 'bg-primary-soft text-ink' : 'text-ink')}
          >
            <span className="text-subtle [&>svg]:h-4 [&>svg]:w-4">{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            <span className="text-xs text-subtle">{i.group}</span>
            {idx === hi && <CornerDownLeft size={13} className="text-subtle" />}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
