import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CreditCard, LayoutGrid, Lock, Moon, Package, Pause, ReceiptIndianRupee, ShoppingCart, Undo2, UserRound, UserRoundCheck, Wallet, type LucideIcon } from 'lucide-react';
import { formatRupees, type DashboardStats, type Paise } from '@gokul/data';
import { Button, Dialog, Kbd, PosLayout, cn, clockTime, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import './home.css';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';

/* The home screen: the shop's name, a live Today strip, then bold coloured tiles. Arrows move, Enter opens. */

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

type Hue = 'pos' | 'sales' | 'paymode' | 'bills' | 'customer' | 'stock' | 'held' | 'more';
interface Tile {
  id: string; name: string; hue: Hue; icon: LucideIcon; path?: string; more?: boolean; shortcut?: string;
  row: number; col: number; rows: number; cols: number;
}

/** 12 columns, 3 rows. Held bills only get a tile while something is on hold. */
function layout(held: boolean): Tile[] {
  const w = held ? [3, 3, 2, 2, 2] : [3, 3, 3, 3];
  const row3: Omit<Tile, 'row' | 'col' | 'rows' | 'cols'>[] = [
    { id: 'bills', name: 'Bills', hue: 'bills', icon: ReceiptIndianRupee, path: '/sales', shortcut: 'Alt+4' },
    { id: 'customer', name: 'Customer', hue: 'customer', icon: UserRound, path: '/customers', shortcut: 'Alt+8' },
    { id: 'stock', name: 'Stock', hue: 'stock', icon: Package, path: '/reports/stock', shortcut: 'Alt+7' },
    ...(held ? [{ id: 'held', name: 'Held bills', hue: 'held' as Hue, icon: Pause, path: '/billing' }] : []),
    { id: 'more', name: 'More', hue: 'more', icon: LayoutGrid, more: true },
  ];
  let col = 1;
  const bottom = row3.map((t, i) => { const x = { ...t, row: 3, col, rows: 1, cols: w[i] }; col += w[i]; return x; });
  return [
    { id: 'pos', name: 'Point of Sale', hue: 'pos', icon: ShoppingCart, path: '/billing', shortcut: 'Alt+1', row: 1, col: 1, rows: 2, cols: 6 },
    { id: 'sales', name: 'Sales Report', hue: 'sales', icon: BarChart3, path: '/reports/sales', shortcut: 'Alt+5', row: 1, col: 7, rows: 1, cols: 6 },
    { id: 'paymode', name: 'Paymode Report', hue: 'paymode', icon: CreditCard, path: '/reports/paymode', shortcut: 'Alt+6', row: 2, col: 7, rows: 1, cols: 6 },
    ...bottom,
  ];
}

function nextTile(tiles: Tile[], from: Tile, dir: 'Up' | 'Down' | 'Left' | 'Right'): Tile | undefined {
  const rowsOverlap = (t: Tile) => t.row < from.row + from.rows && from.row < t.row + t.rows;
  const others = tiles.filter((t) => t !== from);
  const mid = from.col + from.cols / 2;
  const dist = (t: Tile) => Math.abs(t.col + t.cols / 2 - mid);
  const pick = (c: Tile[], score: (t: Tile) => number) => c.sort((a, b) => score(a) - score(b))[0];
  if (dir === 'Right') return pick(others.filter((t) => t.col >= from.col + from.cols && rowsOverlap(t)), (t) => t.col * 10 + t.row);
  if (dir === 'Left') return pick(others.filter((t) => t.col + t.cols <= from.col && rowsOverlap(t)), (t) => -t.col * 10 - t.row);
  if (dir === 'Down') return pick(others.filter((t) => t.row >= from.row + from.rows), (t) => t.row * 100 + dist(t));
  return pick(others.filter((t) => t.row + t.rows <= from.row), (t) => -t.row * 100 + dist(t));
}

/* ---------- live numbers (a few cheap calls, refreshed every 30 s) ---------- */
interface Live {
  dash: DashboardStats | null;
  lastBillAt: string | null; customersToday: number;
  owed: Paise; owing: number; lowStock: number; nextBill: string;
}
const EMPTY: Live = { dash: null, lastBillAt: null, customersToday: 0, owed: 0, owing: 0, lowStock: 0, nextBill: '' };

function useLive(): Live {
  const [live, setLive] = useState<Live>(EMPTY);
  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const [dash, rep, custs, low, nextBill] = await Promise.all([
          api.dashboard(), api.salesReport(), api.listCustomers(), api.lowStock(200), api.peekNextBillNumber(),
        ]);
        if (dead) return;
        let last: string | null = null;
        const names = new Set<string>();
        for (const r of rep.rows) {
          if (r.status === 'cancelled') continue;
          if (!last || r.at > last) last = r.at;
          if (r.customerName && !/^walk-?in$/i.test(r.customerName)) names.add(r.customerName);
        }
        const owing = custs.filter((c) => c.outstanding > 0);
        setLive({
          dash, lastBillAt: last, customersToday: names.size,
          owed: owing.reduce((s, c) => s + c.outstanding, 0), owing: owing.length, lowStock: low.length, nextBill,
        });
      } catch { /* a busy moment: keep what is shown */ }
    };
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => { dead = true; window.clearInterval(t); };
  }, []);
  return live;
}

const rupees = (p: Paise) => formatRupees(p, { decimals: false });

/** Change against yesterday, coloured for a sales number (up is good). Always has an arrow and words. */
function vsYesterday(today: Paise, yesterday: Paise): { text: string; tone: 'good' | 'bad' | 'flat' } {
  if (!yesterday) return { text: today ? 'Nothing sold yesterday' : 'No sales yet', tone: 'flat' };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return { text: 'same as yesterday', tone: 'flat' };
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} yesterday`, tone: pct > 0 ? 'good' : 'bad' };
}
const TONE: Record<string, string> = { good: 'home-soft-good', bad: 'home-soft-bad', flat: 'text-white/85' };

function Stat({ label, value, tone, last }: { label: string; value: ReactNode; tone?: 'owed'; last?: boolean }) {
  return (
    <div className={cn('relative flex min-w-0 flex-1 flex-col justify-center px-6', !last && "after:absolute after:right-0 after:top-1/2 after:h-9 after:w-px after:-translate-y-1/2 after:bg-line after:content-['']")}>
      <span className="truncate text-sm font-medium text-ink">{label}</span>
      <span className={cn('num truncate text-xl min-[1600px]:text-2xl font-semibold leading-7 min-[1600px]:leading-8', tone === 'owed' ? 'text-[rgb(var(--money-owed-ink))]' : 'text-ink')}>{value}</span>
    </div>
  );
}

export function HomePage() {
  useScreenKeys('Home', HOME_KEYS);
  const nav = useNavigate();
  const settings = useSession((s) => s.settings);
  const heldCount = useSession((s) => s.heldCount);
  const live = useLive();
  const [sel, setSel] = useState(0);
  const [now, setNow] = useState(new Date());
  const [moreOpen, setMoreOpen] = useState(false);
  const tiles = useMemo(() => layout(heldCount > 0), [heldCount]);
  const selIdx = Math.min(sel, tiles.length - 1);

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
        const next = nextTile(tiles, tiles[selIdx], dir);
        if (next) setSel(tiles.indexOf(next));
      } else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey) {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
        e.preventDefault(); e.stopPropagation();
        open(tiles[selIdx]);
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIdx, moreOpen, nav, tiles]);

  const shopName = settings?.shopName ?? '';
  const town = (settings?.address ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(-2).join(', ');
  const d = live.dash;
  const cmp = vsYesterday(d?.todaySales ?? 0, d?.yesterdaySales ?? 0);
  const payTotal = d ? d.cash + d.upi + d.card + d.credit : 0;

  const keys: FKey[] = [
    { key: 'Enter', label: 'Open', onClick: () => open(tiles[selIdx]), tone: 'primary' },
    { key: 'Alt+1', label: 'Point of Sale', onClick: () => nav('/billing') },
    { key: 'Esc', label: 'Billing', onClick: () => nav('/billing') },
  ];

  const big = 'home-num num font-semibold leading-none tracking-tight';
  const line = 'home-line num mt-2 text-sm min-[1600px]:text-lg text-white/85';
  const body = (t: Tile): ReactNode => {
    switch (t.id) {
      case 'pos':
        return (
          <div className="mt-auto">
            <div className="text-md text-white/85">Next bill</div>
            <div className="num mt-1 font-semibold leading-none tracking-tight text-[clamp(56px,11vh,112px)]">{live.nextBill || ' '}</div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-white/15 px-3 py-1.5 text-md">Press <Kbd>Enter</Kbd> to start billing</div>
          </div>
        );
      case 'sales':
        return (
          <div className="mt-auto">
            <div className={big}>{rupees(d?.todaySales ?? 0)}</div>
            <div className={line}>today · <span className={cn('font-medium', TONE[cmp.tone])}>{cmp.text}</span></div>
          </div>
        );
      case 'paymode':
        return (
          <div className="mt-auto">
            <div className={big}>{rupees(payTotal)}</div>
            <div className={line}>Cash {rupees(d?.cash ?? 0)} · UPI {rupees(d?.upi ?? 0)}</div>
          </div>
        );
      case 'bills':
        return (
          <div className="mt-auto">
            <div className={big}>{d?.todayBills ?? 0} <span className="text-md font-normal text-white/85">{d?.todayBills === 1 ? 'bill' : 'bills'} today</span></div>
            <div className={line}>{live.lastBillAt ? `last ${clockTime(live.lastBillAt)}` : 'No bill yet'}</div>
          </div>
        );
      case 'customer':
        return (
          <div className="mt-auto">
            <div className={big}>{live.customersToday} <span className="text-md font-normal text-white/85">today</span></div>
            <div className={cn(line, live.owing > 0 && 'home-soft-bad font-medium')}>{live.owing > 0 ? `${live.owing} owe ${rupees(live.owed)}` : 'Nobody owes'}</div>
          </div>
        );
      case 'stock':
        return (
          <div className="mt-auto">
            <div className={big}>{live.lowStock} <span className="text-md font-normal text-white/85">{live.lowStock === 1 ? 'item' : 'items'} low</span></div>
            <div className={cn(line, live.lowStock > 0 && 'home-soft-warn font-medium')}>{live.lowStock > 0 ? 'Needs a look' : 'All stocked'}</div>
          </div>
        );
      case 'held':
        return (
          <div className="mt-auto">
            <div className={big}>{heldCount} <span className="text-md font-normal text-white/85">waiting</span></div>
            <div className={line}>Shift+F6 to recall</div>
          </div>
        );
      default:
        return <div className="mt-auto text-md min-[1600px]:text-lg font-medium leading-snug text-white/90">Returns, expenses, day close</div>;
    }
  };

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

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-8 pb-5 pt-4 min-[1600px]:gap-5 min-[1600px]:px-10">
        <div className="flex shrink-0 items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="home-title truncate text-[34px] min-[1600px]:text-[48px] font-semibold leading-[1.1] tracking-tight text-ink">{shopName || 'Gokul Oils'}</h1>
            <div className="truncate text-md min-[1600px]:text-lg text-muted">{town}</div>
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-md min-[1600px]:text-lg font-semibold text-ink">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div className="text-md min-[1600px]:text-lg text-muted">{clockTime(now)}</div>
          </div>
        </div>

        <div className="home-strip flex h-[64px] min-[1600px]:h-[84px] shrink-0 items-stretch rounded-card border border-line bg-surface py-2.5 shadow-sm">
          <Stat label="Sales today" value={rupees(d?.todaySales ?? 0)} />
          <Stat label="Bills" value={d?.todayBills ?? 0} />
          <Stat label="Cash" value={rupees(d?.cash ?? 0)} />
          <Stat label="UPI" value={rupees(d?.upi ?? 0)} />
          <Stat label="Owed by customers" value={rupees(live.owed)} tone="owed" last />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-3 gap-4 min-[1600px]:gap-5">
          {tiles.map((t, i) => {
            const Icon = t.icon;
            const on = i === selIdx;
            const hero = t.id === 'pos';
            return (
              <button
                key={t.id} type="button" tabIndex={-1} data-hue={t.hue} data-on={on}
                style={{ gridRow: `${t.row} / span ${t.rows}`, gridColumn: `${t.col} / span ${t.cols}` } as CSSProperties}
                onMouseEnter={() => setSel(i)}
                onClick={() => { setSel(i); open(t); }}
                className="home-tile relative flex min-h-0 min-w-0 cursor-default select-none flex-col overflow-hidden rounded-card p-5 text-left text-white min-[1600px]:p-6"
              >
                <Icon aria-hidden strokeWidth={1.25} className="pointer-events-none absolute -bottom-5 -right-3 text-white/[0.08]" size={hero ? 240 : 104} />
                <div className="relative flex items-center gap-3">
                  <span className={cn('flex shrink-0 items-center justify-center rounded-xl bg-white/15', hero ? 'h-12 w-12' : 'home-ico h-9 w-9')}>
                    <Icon size={hero ? 26 : 20} strokeWidth={1.75} />
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate font-semibold tracking-tight', hero ? 'text-[26px] min-[1600px]:text-[34px]' : 'text-lg min-[1600px]:text-xl')}>{t.name}</span>
                  {t.shortcut && <span className="rounded-md bg-black/20 px-2 py-0.5 text-xs font-medium text-white/90">{t.shortcut}</span>}
                </div>
                <div className="relative mt-2 flex min-h-0 flex-1 flex-col">{body(t)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </PosLayout>
  );
}
