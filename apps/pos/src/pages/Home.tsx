import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CreditCard, LayoutGrid, Lock, Moon, Package, ReceiptIndianRupee, ShoppingCart, Undo2, UserRound, UserRoundCheck, Wallet, type LucideIcon } from 'lucide-react';
import { formatRupees, type DashboardStats, type Paise } from '@gokul/data';
import { Button, Dialog, Kbd, PosLayout, Tooltip, clockTime, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import './home.css';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';

/* The home screen: a calm launcher. Shop name, one line of today's numbers, then square coloured tiles. Arrows move, Enter opens. */

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

type Hue = 'pos' | 'sales' | 'paymode' | 'bills' | 'customer' | 'stock' | 'more';
interface Tile { id: string; name: string; hue: Hue; icon: LucideIcon; path?: string; more?: boolean; shortcut?: string; row: number; col: number; cols: number }

/* Four equal squares across, two rows. Point of Sale is two squares wide. */
const TILES: Tile[] = [
  { id: 'pos', name: 'Point of Sale', hue: 'pos', icon: ShoppingCart, path: '/billing', shortcut: 'Alt+1', row: 1, col: 1, cols: 2 },
  { id: 'sales', name: 'Sales Report', hue: 'sales', icon: BarChart3, path: '/reports/sales', shortcut: 'Alt+5', row: 1, col: 3, cols: 1 },
  { id: 'paymode', name: 'Paymode Report', hue: 'paymode', icon: CreditCard, path: '/reports/paymode', shortcut: 'Alt+6', row: 1, col: 4, cols: 1 },
  { id: 'bills', name: 'Bills', hue: 'bills', icon: ReceiptIndianRupee, path: '/sales', shortcut: 'Alt+4', row: 2, col: 1, cols: 1 },
  { id: 'customer', name: 'Customer', hue: 'customer', icon: UserRound, path: '/customers', shortcut: 'Alt+8', row: 2, col: 2, cols: 1 },
  { id: 'stock', name: 'Stock', hue: 'stock', icon: Package, path: '/reports/stock', shortcut: 'Alt+7', row: 2, col: 3, cols: 1 },
  { id: 'more', name: 'More', hue: 'more', icon: LayoutGrid, more: true, row: 2, col: 4, cols: 1 },
];

function nextTile(from: Tile, dir: 'Up' | 'Down' | 'Left' | 'Right'): Tile | undefined {
  const mid = from.col + from.cols / 2;
  const dist = (t: Tile) => Math.abs(t.col + t.cols / 2 - mid);
  const pick = (c: Tile[], score: (t: Tile) => number) => c.sort((a, b) => score(a) - score(b))[0];
  const others = TILES.filter((t) => t !== from);
  if (dir === 'Right') return pick(others.filter((t) => t.row === from.row && t.col >= from.col + from.cols), (t) => t.col);
  if (dir === 'Left') return pick(others.filter((t) => t.row === from.row && t.col + t.cols <= from.col), (t) => -t.col);
  return pick(others.filter((t) => (dir === 'Down' ? t.row > from.row : t.row < from.row)), dist);
}

/* ---------- live numbers (a few cheap calls, refreshed every 30 s) ---------- */
interface Live { dash: DashboardStats | null; owed: Paise; lowStock: number }

function useLive(): Live {
  const [live, setLive] = useState<Live>({ dash: null, owed: 0, lowStock: 0 });
  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const [dash, custs, low] = await Promise.all([api.dashboard(), api.listCustomers(), api.lowStock(200)]);
        if (dead) return;
        setLive({ dash, owed: custs.reduce((s, c) => s + Math.max(0, c.outstanding), 0), lowStock: low.length });
      } catch { /* a busy moment: keep what is shown */ }
    };
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => { dead = true; window.clearInterval(t); };
  }, []);
  return live;
}

const rupees = (p: Paise) => formatRupees(p, { decimals: false });

export function HomePage() {
  useScreenKeys('Home', HOME_KEYS);
  const nav = useNavigate();
  const settings = useSession((s) => s.settings);
  const heldCount = useSession((s) => s.heldCount);
  const live = useLive();
  const [sel, setSel] = useState(0);
  const [now, setNow] = useState(new Date());
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

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
        open(TILES[sel]);
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, moreOpen, nav]);

  const shopName = settings?.shopName ?? '';
  const town = (settings?.address ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(-2).join(', ');
  const d = live.dash;

  const keys: FKey[] = [
    { key: 'Enter', label: 'Open', onClick: () => open(TILES[sel]), tone: 'primary' },
    { key: 'Alt+1', label: 'Point of Sale', onClick: () => nav('/billing') },
    { key: 'Esc', label: 'Billing', onClick: () => nav('/billing') },
  ];

  const sep = <span className="mx-2.5 text-line-strong">·</span>;

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

      <div className="home-page flex min-h-0 flex-1 flex-col overflow-hidden px-10 pb-6 pt-6 min-[1600px]:px-14 min-[1600px]:pt-9">
        <div className="flex shrink-0 items-start justify-between gap-8">
          <div className="min-w-0">
            <h1 className="home-title truncate text-[40px] font-semibold leading-[1.1] tracking-tight text-ink min-[1600px]:text-[52px]">{shopName || 'Gokul Oils'}</h1>
            <div className="mt-1 truncate text-md text-muted min-[1600px]:text-lg">{town}</div>
            <div className="num mt-4 flex flex-wrap items-baseline whitespace-nowrap text-md text-ink min-[1600px]:text-lg">
              <span className="mr-3 font-semibold text-muted">Today</span>
              <span className="font-semibold">{rupees(d?.todaySales ?? 0)}</span>{sep}
              <span>{d?.todayBills ?? 0} {d?.todayBills === 1 ? 'bill' : 'bills'}</span>{sep}
              <span>Cash {rupees(d?.cash ?? 0)}</span>{sep}
              <span>UPI {rupees(d?.upi ?? 0)}</span>{sep}
              <span className="font-semibold text-[rgb(var(--money-owed-ink))]">Owed {rupees(live.owed)}</span>
            </div>
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-md font-semibold text-ink min-[1600px]:text-lg">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div className="text-md text-muted min-[1600px]:text-lg">{clockTime(now)}</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="home-grid">
            {TILES.map((t, i) => {
              const Icon = t.icon;
              const badge = t.id === 'stock' ? live.lowStock : t.id === 'pos' ? heldCount : 0;
              const badgeText = t.id === 'stock' ? `${badge} low` : `${badge} held`;
              return (
                <Tooltip key={t.id} label={t.name} kbd={t.shortcut}>
                  <button
                    type="button" tabIndex={-1} data-hue={t.hue} data-on={i === sel}
                    style={{ gridRow: t.row, gridColumn: `${t.col} / span ${t.cols}` } as CSSProperties}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => { setSel(i); open(t); }}
                    className="home-tile"
                  >
                    {badge > 0 && <span className="home-badge num">{badgeText}</span>}
                    <Icon className="home-icon" strokeWidth={1.5} aria-hidden />
                    <span className="home-name">{t.name}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </PosLayout>
  );
}
