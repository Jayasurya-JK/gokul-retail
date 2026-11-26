import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CreditCard, Lock, Moon, Package, ReceiptIndianRupee, ShoppingCart, Undo2, UserRound, UserRoundCheck, Wallet, LayoutGrid, type LucideIcon } from 'lucide-react';
import { formatRupees } from '@gokul/data';
import { Button, Dialog, Kbd, PosLayout, cn, clockTime, type FKey } from '@gokul/ui';
import { useSession, useTodaySales } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';

/* The home screen: the shop's name large, then big square tiles. Arrow keys move between tiles, Enter opens. */

const HOME_KEYS: KeyRows = [
  ['Move between tiles', ['Up', 'Down', 'Left', 'Right']],
  ['Open the selected tile', ['Enter']],
  ['Point of Sale', ['Alt+1']],
  ['Back to billing', ['Esc']],
];

/** The screens behind More (same list as the top bar's More menu). */
const MORE_SCREENS: { label: string; path: string; icon: LucideIcon; kbd?: string }[] = [
  { label: 'Returns and exchange', path: '/returns', icon: Undo2, kbd: 'F10' },
  { label: 'Expenses and cash', path: '/cash', icon: Wallet, kbd: 'F9' },
  { label: 'Day close', path: '/day-close', icon: Moon, kbd: 'Ctrl+E' },
  { label: 'Staff report', path: '/reports/staff', icon: UserRoundCheck },
  { label: 'Lock counter', path: '/lock', icon: Lock, kbd: 'Ctrl+L' },
];

interface Tile {
  id: string;
  name: string;
  path?: string;
  /** Opens the More menu's screens (they have no tile of their own) */
  more?: boolean;
  icon: LucideIcon;
  shortcut?: string;
  /** Calm colour for the icon chip. Never the meaning greens or reds. */
  chip: string;
  row: number; col: number; rows: number; cols: number;
  big?: boolean;
}

/* 4 columns, 3 rows. Point of Sale is the large tile at the top left. */
const TILES: Tile[] = [
  { id: 'pos', name: 'Point of Sale', path: '/billing', icon: ShoppingCart, shortcut: 'Enter', chip: 'bg-primary-soft text-primary', row: 1, col: 1, rows: 2, cols: 2, big: true },
  { id: 'sales', name: 'Sales Report', path: '/reports/sales', icon: BarChart3, shortcut: 'Alt+5', chip: 'bg-info-soft text-info', row: 1, col: 3, rows: 1, cols: 1 },
  { id: 'paymode', name: 'Paymode Report', path: '/reports/paymode', icon: CreditCard, shortcut: 'Alt+6', chip: 'bg-[rgb(var(--mode-cash-tint))] text-[rgb(var(--mode-cash-ink))]', row: 1, col: 4, rows: 1, cols: 1 },
  { id: 'bills', name: 'Bills', path: '/sales', icon: ReceiptIndianRupee, shortcut: 'Alt+4', chip: 'bg-[rgb(var(--mode-card-tint))] text-[rgb(var(--mode-card-ink))]', row: 2, col: 3, rows: 1, cols: 1 },
  { id: 'customer', name: 'Customer', path: '/customers', icon: UserRound, shortcut: 'Alt+8', chip: 'bg-[rgb(var(--mode-points-tint))] text-[rgb(var(--mode-points-ink))]', row: 2, col: 4, rows: 1, cols: 1 },
  { id: 'stock', name: 'Stock', path: '/reports/stock', icon: Package, shortcut: 'Alt+7', chip: 'bg-[rgb(var(--neutral-tint))] text-[rgb(var(--neutral))]', row: 3, col: 1, rows: 1, cols: 2 },
  { id: 'more', name: 'More', more: true, icon: LayoutGrid, chip: 'bg-[rgb(var(--neutral-tint))] text-[rgb(var(--neutral))]', row: 3, col: 3, rows: 1, cols: 2 },
];

/** Tile moves: the nearest tile in the arrow's direction that shares the row (or column) band. */
function nextTile(from: Tile, dir: 'Up' | 'Down' | 'Left' | 'Right'): Tile | undefined {
  const rowsOverlap = (t: Tile) => t.row < from.row + from.rows && from.row < t.row + t.rows;
  const colsOverlap = (t: Tile) => t.col < from.col + from.cols && from.col < t.col + t.cols;
  const others = TILES.filter((t) => t !== from);
  const pick = (cands: Tile[], score: (t: Tile) => number) => cands.sort((a, b) => score(a) - score(b))[0];
  if (dir === 'Right') return pick(others.filter((t) => t.col > from.col && rowsOverlap(t)), (t) => t.col * 10 + t.row);
  if (dir === 'Left') return pick(others.filter((t) => t.col < from.col && rowsOverlap(t)), (t) => -t.col * 10 - t.row);
  if (dir === 'Down') return pick(others.filter((t) => t.row > from.row && colsOverlap(t)), (t) => t.row * 10 + t.col);
  return pick(others.filter((t) => t.row < from.row && colsOverlap(t)), (t) => -t.row * 10 - t.col);
}

export function HomePage() {
  useScreenKeys('Home', HOME_KEYS);
  const nav = useNavigate();
  const settings = useSession((s) => s.settings);
  const shift = useSession((s) => s.shift);
  const today = useTodaySales();
  const [sel, setSel] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const [moreOpen, setMoreOpen] = useState(false);
  const open = (t: Tile) => {
    if (t.path) nav(t.path);
    else if (t.more) setMoreOpen(true);
  };

  /* Arrows and Enter drive the tiles. Capture phase so the screens behind never see them. */
  useEffect(() => {
    if (moreOpen) return undefined;
    const h = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const dir = e.key === 'ArrowUp' ? 'Up' : e.key === 'ArrowDown' ? 'Down' : e.key === 'ArrowLeft' ? 'Left' : e.key === 'ArrowRight' ? 'Right' : null;
      if (dir) {
        e.preventDefault(); e.stopPropagation();
        const next = nextTile(TILES[sel], dir);
        if (next) setSel(TILES.indexOf(next));
      } else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey) {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
        e.preventDefault(); e.stopPropagation();
        const t = TILES[sel];
        if (t.path) nav(t.path); else if (t.more) setMoreOpen(true);
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [sel, moreOpen, nav]);

  const shopName = settings?.shopName ?? '';
  const place = (settings?.address ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(-2).join(', ');
  const counter = shift?.counter ?? settings?.counter ?? '-';

  const hint = (id: string): ReactNode => {
    if (id === 'pos') return `${counter} is ready for the next bill`;
    if (id === 'sales') return `Today ${formatRupees(today.sales, { decimals: false })}`;
    if (id === 'bills') return `${today.bills} ${today.bills === 1 ? 'bill' : 'bills'} today`;
    return null;
  };

  const keys: FKey[] = [
    { key: 'Enter', label: 'Open', onClick: () => open(TILES[sel]), tone: 'primary' },
    { key: 'Alt+1', label: 'Point of Sale', onClick: () => nav('/billing') },
    { key: 'Esc', label: 'Billing', onClick: () => nav('/billing') },
  ];

  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      <Dialog
        open={moreOpen} onOpenChange={setMoreOpen} title="More screens" size="sm"
        footer={<Button variant="ghost" kbd="Esc" onClick={() => setMoreOpen(false)}>Close</Button>}
      >
        <div className="flex flex-col">
          {MORE_SCREENS.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.path} type="button" onClick={() => { setMoreOpen(false); nav(m.path); }}
                className="flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm text-ink hover:bg-surface-3">
                <span className="text-muted"><Icon size={16} /></span>
                <span className="flex-1">{m.label}</span>
                {m.kbd && <Kbd>{m.kbd}</Kbd>}
              </button>
            );
          })}
        </div>
      </Dialog>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-8 py-6">
        <div className="flex shrink-0 items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="truncate text-[34px] font-bold leading-tight tracking-tight text-ink">{shopName || ' '}</div>
            <div className="mt-1 truncate text-md text-muted">{place}</div>
          </div>
          <div className="num shrink-0 text-right text-sm text-muted">
            <div className="font-semibold text-ink">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div>{clockTime(now)} · Counter {counter}</div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-4">
          {TILES.map((t, i) => {
            const Icon = t.icon;
            const on = i === sel;
            return (
              <button
                key={t.id}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setSel(i)}
                onClick={() => { setSel(i); open(t); }}
                style={{ gridRow: `${t.row} / span ${t.rows}`, gridColumn: `${t.col} / span ${t.cols}` }}
                className={cn(
                  'group relative flex min-h-0 cursor-default flex-col rounded-card border bg-surface text-left transition-colors',
                  t.big ? 'p-7' : 'p-5',
                  on ? 'border-primary ring-2 ring-primary/60' : 'border-line hover:border-line-strong hover:bg-surface-2',
                )}
              >
                <span className={cn('flex items-center justify-center rounded-2xl', t.chip, t.big ? 'h-20 w-20' : 'h-12 w-12')}>
                  <Icon size={t.big ? 40 : 24} />
                </span>
                <span className="mt-auto flex items-end justify-between gap-3">
                  <span className="min-w-0">
                    <span className={cn('block font-semibold tracking-tight text-ink', t.big ? 'text-[32px] leading-tight' : 'text-lg')}>{t.name}</span>
                    <span className="num mt-1 block min-h-5 truncate text-sm text-muted">{hint(t.id)}</span>
                  </span>
                  {t.shortcut && <Kbd>{t.shortcut}</Kbd>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </PosLayout>
  );
}
