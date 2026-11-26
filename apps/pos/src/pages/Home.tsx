import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CreditCard, LayoutGrid, Lock, Moon, Package, Pause, ReceiptIndianRupee, ShoppingCart, Undo2, UserRound, UserRoundCheck, Wallet, type LucideIcon } from 'lucide-react';
import { formatRupees, type DashboardStats, type Paise } from '@gokul/data';
import { Button, Dialog, Kbd, PosLayout, cn, clockTime, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
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
  hourly: number[]; lastBillAt: string | null; customersToday: number;
  owed: Paise; owing: number; lowStock: number; nextBill: string;
}
const EMPTY: Live = { dash: null, hourly: [], lastBillAt: null, customersToday: 0, owed: 0, owing: 0, lowStock: 0, nextBill: '' };
const HOUR_FROM = 7, HOUR_TO = 21;

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
        const hourly = Array.from({ length: HOUR_TO - HOUR_FROM + 1 }, () => 0);
        let last: string | null = null;
        const names = new Set<string>();
        for (const r of rep.rows) {
          if (r.status === 'cancelled') continue;
          const h = Math.min(HOUR_TO, Math.max(HOUR_FROM, new Date(r.at).getHours()));
          hourly[h - HOUR_FROM] += r.total;
          if (!last || r.at > last) last = r.at;
          if (r.customerName && !/^walk-?in$/i.test(r.customerName)) names.add(r.customerName);
        }
        const owing = custs.filter((c) => c.outstanding > 0);
        setLive({
          dash, hourly, lastBillAt: last, customersToday: names.size,
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
  if (pct === 0) return { text: 'Same as yesterday', tone: 'flat' };
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs yesterday`, tone: pct > 0 ? 'good' : 'bad' };
}
const TONE: Record<string, string> = { good: 'text-[rgb(var(--on-tile-good))]', bad: 'text-[rgb(var(--on-tile-bad))]', flat: 'text-white/80' };

function Sparkline({ data }: { data: number[] }) {
  const W = 220, H = 56, max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 4 - (v / max) * (H - 12)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.35" /><stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#spark)" />
      <path d={line} fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const MODES = [
  { k: 'cash', label: 'Cash', c: '--mode-cash' }, { k: 'upi', label: 'UPI', c: '--mode-upi' },
  { k: 'card', label: 'Card', c: '--mode-card' }, { k: 'credit', label: 'Credit', c: '--mode-credit' },
] as const;

function Stat({ label, value, tone, last }: { label: string; value: ReactNode; tone?: 'owed'; last?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col justify-center px-5', !last && 'border-r border-line')}>
      <span className="text-xs min-[1600px]:text-sm text-muted">{label}</span>
      <span className={cn('num truncate text-lg min-[1600px]:text-2xl font-semibold leading-6 min-[1600px]:leading-8', tone === 'owed' ? 'text-[rgb(var(--money-owed-ink))]' : 'text-ink')}>{value}</span>
    </div>
  );
}

export function HomePage() {
  useScreenKeys('Home', HOME_KEYS);
  const nav = useNavigate();
  const settings = useSession((s) => s.settings);
  const shift = useSession((s) => s.shift);
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
  const rawCounter = String(shift?.counter ?? settings?.counter ?? '');
  const counterLabel = /^counter/i.test(rawCounter) ? rawCounter : `Counter ${rawCounter}`;
  const d = live.dash;
  const cmp = vsYesterday(d?.todaySales ?? 0, d?.yesterdaySales ?? 0);
  const payTotal = d ? d.cash + d.upi + d.card + d.credit : 0;

  const keys: FKey[] = [
    { key: 'Enter', label: 'Open', onClick: () => open(tiles[selIdx]), tone: 'primary' },
    { key: 'Alt+1', label: 'Point of Sale', onClick: () => nav('/billing') },
    { key: 'Esc', label: 'Billing', onClick: () => nav('/billing') },
  ];

  const body = (t: Tile): ReactNode => {
    const sub = 'num text-sm min-[1600px]:text-md text-white/80';
    switch (t.id) {
      case 'pos':
        return (
          <div className="mt-auto">
            <div className="text-sm text-white/80">Next bill</div>
            <div className="num text-[60px] min-[1600px]:text-[104px] font-semibold leading-none tracking-tight">{live.nextBill || ' '}</div>
            <div className="mt-3 flex items-center gap-2 text-md min-[1600px]:text-xl text-white/90">
              <span className={cn('h-2.5 w-2.5 rounded-full', shift ? 'bg-[rgb(var(--on-tile-good))]' : 'bg-[rgb(var(--on-tile-bad))]')} />
              {shift ? `${counterLabel} open` : 'Counter not open'}
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-0.5 text-sm">Press <Kbd>Enter</Kbd></span>
            </div>
          </div>
        );
      case 'sales':
        return (
          <div className="mt-auto flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="num text-[34px] min-[1600px]:text-[54px] font-semibold leading-none tracking-tight">{rupees(d?.todaySales ?? 0)}</div>
              <div className={cn('num mt-2 text-sm font-medium', TONE[cmp.tone])}>{cmp.text}</div>
            </div>
            <div className="h-14 min-[1600px]:h-24 w-[44%] max-w-[420px] shrink-0"><Sparkline data={live.hourly.length ? live.hourly : [0, 0]} /></div>
          </div>
        );
      case 'paymode':
        return (
          <div className="mt-auto">
            <div className="flex items-baseline justify-between">
              <span className="num text-[30px] min-[1600px]:text-[54px] font-semibold leading-none tracking-tight">{rupees(payTotal)}</span>
              <span className={sub}>today, by how paid</span>
            </div>
            <div className="mt-2.5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-white p-0.5">
              {payTotal > 0 && d && MODES.map((m) => d[m.k] > 0 && (
                <span key={m.k} className="h-full rounded-full" style={{ flex: d[m.k], background: `rgb(var(${m.c}))` } as CSSProperties} />
              ))}
            </div>
            <div className="num mt-2 flex gap-4 text-xs min-[1600px]:text-sm text-white/85">
              {MODES.map((m) => (
                <span key={m.k} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 4px rgb(var(${m.c}))` }} />
                  {m.label} {payTotal ? `${Math.round(((d?.[m.k] ?? 0) / payTotal) * 100)}%` : '0%'}
                </span>
              ))}
            </div>
          </div>
        );
      case 'bills':
        return (
          <div className="mt-auto">
            <div className="num text-2xl min-[1600px]:text-[46px] font-semibold leading-none">{d?.todayBills ?? 0} <span className="text-sm font-normal text-white/80">{d?.todayBills === 1 ? 'bill' : 'bills'} today</span></div>
            <div className={cn(sub, 'mt-1.5')}>{live.lastBillAt ? `Last bill ${clockTime(live.lastBillAt)}` : 'No bill yet'}</div>
          </div>
        );
      case 'customer':
        return (
          <div className="mt-auto">
            <div className="num text-2xl min-[1600px]:text-[46px] font-semibold leading-none">{live.customersToday} <span className="text-sm font-normal text-white/80">today</span></div>
            <div className={cn(sub, 'mt-1.5', live.owing > 0 && 'font-medium text-[rgb(var(--on-tile-bad))]')}>
              {live.owing > 0 ? `${live.owing} owe ${rupees(live.owed)}` : 'Nobody owes'}
            </div>
          </div>
        );
      case 'stock':
        return (
          <div className="mt-auto">
            <div className="num text-2xl min-[1600px]:text-[46px] font-semibold leading-none">{live.lowStock} <span className="text-sm font-normal text-white/80">{live.lowStock === 1 ? 'item' : 'items'} low</span></div>
            <div className={cn(sub, 'mt-1.5', live.lowStock > 0 && 'font-medium text-[rgb(var(--on-tile-warn))]')}>{live.lowStock > 0 ? 'Needs a look' : 'All stocked'}</div>
          </div>
        );
      case 'held':
        return (
          <div className="mt-auto">
            <div className="num text-2xl min-[1600px]:text-[46px] font-semibold leading-none">{heldCount} <span className="text-sm font-normal text-white/80">waiting</span></div>
            <div className={cn(sub, 'mt-1.5')}>Shift+F6 to recall</div>
          </div>
        );
      default:
        return <div className={cn(sub, 'mt-auto')}>Returns, expenses, day close</div>;
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-8 pb-5 pt-5">
        <div className="flex shrink-0 items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="truncate text-[38px] min-[1600px]:text-[52px] font-semibold leading-[44px] min-[1600px]:leading-[58px] tracking-tight text-ink">{shopName || ' '}</div>
            <div className="truncate text-md text-muted">{town}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-md font-semibold',
              shift ? 'bg-[rgb(var(--money-good-tint))] text-[rgb(var(--money-good-ink))]' : 'bg-[rgb(var(--money-owed-tint))] text-[rgb(var(--money-owed-ink))]',
            )}>
              <span className={cn('h-2.5 w-2.5 rounded-full', shift ? 'bg-[rgb(var(--money-good))]' : 'bg-[rgb(var(--money-owed))]')} />
              {shift ? `${counterLabel} open` : 'Counter not open'}
            </span>
            <span className="num text-sm text-muted">
              {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {clockTime(now)}
            </span>
          </div>
        </div>

        <div className="flex h-[60px] min-[1600px]:h-[80px] shrink-0 items-stretch rounded-card border border-line bg-surface py-2 shadow-sm">
          <Stat label="Sales today" value={rupees(d?.todaySales ?? 0)} />
          <Stat label="Bills" value={d?.todayBills ?? 0} />
          <Stat label="Cash" value={rupees(d?.cash ?? 0)} />
          <Stat label="UPI" value={rupees(d?.upi ?? 0)} />
          <Stat label="Owed by customers" value={rupees(live.owed)} tone="owed" last />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-3 gap-4">
          {tiles.map((t, i) => {
            const Icon = t.icon;
            const on = i === selIdx;
            const big = t.id === 'pos';
            const style = {
              gridRow: `${t.row} / span ${t.rows}`, gridColumn: `${t.col} / span ${t.cols}`,
              background: `radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / 0.14), transparent 55%), linear-gradient(145deg, rgb(var(--tile-${t.hue}-a)), rgb(var(--tile-${t.hue}-b)))`,
              boxShadow: on
                ? '0 0 0 3px rgb(var(--bg)), 0 0 0 6px rgb(var(--ink)), 0 14px 28px -10px rgb(0 0 0 / 0.45)'
                : '0 1px 0 rgb(255 255 255 / 0.18) inset, 0 6px 14px -8px rgb(0 0 0 / 0.5)',
            } as CSSProperties;
            return (
              <button
                key={t.id} type="button" tabIndex={-1} style={style}
                onMouseEnter={() => setSel(i)}
                onClick={() => { setSel(i); open(t); }}
                className={cn(
                  'relative flex min-h-[110px] min-w-0 cursor-default select-none flex-col overflow-hidden rounded-card text-left text-white transition-transform duration-150',
                  big ? 'p-7' : 'p-5', on ? '-translate-y-0.5' : 'hover:-translate-y-0.5',
                )}
              >
                {(big || t.cols < 6) && <Icon aria-hidden strokeWidth={1.25} className="pointer-events-none absolute -bottom-6 -right-4 text-white/[0.07]" size={big ? 260 : 110} />}
                <div className="relative flex items-center gap-3">
                  <span className={cn('flex shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25', big ? 'h-14 w-14' : 'h-10 w-10')}>
                    <Icon size={big ? 30 : 22} strokeWidth={1.75} />
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate font-semibold tracking-tight', big ? 'text-[28px] min-[1600px]:text-[40px]' : 'text-md min-[1600px]:text-xl')}>{t.name}</span>
                  {t.shortcut && <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs font-medium text-white/85">{t.shortcut}</span>}
                </div>
                <div className="relative mt-3 flex min-h-0 flex-1 flex-col">{body(t)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </PosLayout>
  );
}
