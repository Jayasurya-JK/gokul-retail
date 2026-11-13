import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Factory, FileClock, Lock, Printer } from 'lucide-react';
import { formatRupees, type GodownStatus, type MillDaily, type MillDay } from '@gokul/data';
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, StatTile, cn, useRefreshOnFocus, type Tone } from '@gokul/ui';
import { api } from '../store';
import { isoDay } from '../components/crm/common';
import { fmtQty, longDay } from '../components/mill/millUtil';
import {
  STATUS_LABEL, activeOils, fmtNum, hasMillData, millPressingRows, rowLitresPer100, signed, sumBarrels, sumPressing,
} from '../components/mill/millDaily';
import { MillDailyPaper } from '../components/mill/MillDailyPaper';
import { CountDialog } from '../components/mill/CountDialog';
import { OldSheets } from '../components/mill/OldSheets';

const statusTone: Record<GodownStatus, Tone> = { empty: 'neutral', filling: 'info', settling: 'warning', ready: 'success' };
const shiftDay = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const th = 'px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';
const td = 'px-2 py-1 text-sm text-ink';
const num = 'text-right tabular-nums';
const totalRow = 'border-t-2 border-line bg-surface-2 font-semibold';

/**
 * The mill day sheet: an automatic record, every number comes from what was already entered in Production and the Godown.
 * Only the supervisor's name, a note and the optional evening count are typed (Count and close). Printing gives the paper sheet.
 */
export function MillDailyPage() {
  const today = isoDay(new Date());
  const [day, setDay] = useState(today);
  const [data, setData] = useState<MillDaily | null>(null);
  const [shop, setShop] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [info, setInfo] = useState<MillDay | null>(null);
  const [counting, setCounting] = useState(false);
  const [old, setOld] = useState(false);

  useEffect(() => { void api.getSettings().then((s) => setShop(s.shopName)).catch(() => undefined); }, []);

  const load = useCallback(() => {
    void api.getMillDaily(day).then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the mill day'));
    void api.getMillDay(day).then(setInfo).catch(() => setInfo(null));
  }, [day]);
  useEffect(() => { setData(null); load(); }, [load]);
  useRefreshOnFocus(load);

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPreview(true); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'k' && e.shiftKey) { e.preventDefault(); setCounting(true); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setDay((d) => shiftDay(d, -1)); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setDay((d) => (d < today ? shiftDay(d, 1) : d)); }
      else if (preview && e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); window.print(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview, today]);

  const rows = data ? millPressingRows(data) : [];
  const press = sumPressing(rows);
  const pressPer100 = press.seedKg > press.cleaningKg ? (press.oilL * 100) / (press.seedKg - press.cleaningKg) : null;
  const l100 = data && data.totals.seedInKg > data.totals.cleaningKg ? (data.totals.oilL * 100) / (data.totals.seedInKg - data.totals.cleaningKg) : null;
  const oils = data ? activeOils(data) : [];
  const barrels = data?.barrels ?? [];
  const bt = sumBarrels(barrels);
  const oilT = (k: 'openingL' | 'pressedL' | 'outsourcedL' | 'transferredL' | 'stickAdjustL' | 'closingL') => oils.reduce((a, o) => a + o[k], 0);
  const outL = data?.outsourced.reduce((a, o) => a + o.litresL, 0) ?? 0;
  const outCost = data?.outsourced.reduce((a, o) => a + o.cost, 0) ?? 0;
  const trL = data?.transfers.reduce((a, t) => a + t.litresL, 0) ?? 0;
  const oilLabel = (oil: MillDaily['oils'][number]['oil']) => data?.oils.find((o) => o.oil === oil)?.label ?? oil;

  return (
    <>
      <PageHeader
        title="Mill day sheet" icon={<ClipboardList size={17} />} subtitle={`${shop} - ${longDay(day)}`}
        actions={
          <>
            <div className="flex items-center rounded-control border border-line-strong bg-surface">
              <button type="button" tabIndex={-1} onClick={() => setDay(shiftDay(day, -1))} className="flex h-9 w-8 items-center justify-center text-muted hover:text-ink" aria-label="Day before"><ChevronLeft size={16} /></button>
              <label className="flex items-center gap-1.5 px-1 text-sm text-ink"><CalendarDays size={14} className="text-subtle" /><input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="num h-9 w-[130px] bg-transparent text-sm outline-none" /></label>
              <button type="button" tabIndex={-1} disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))} className="flex h-9 w-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30" aria-label="Day after"><ChevronRight size={16} /></button>
            </div>
            {info?.status === 'closed' ? <Badge tone="success"><Lock size={11} /> Closed</Badge> : <Badge tone="info">Open</Badge>}
            <Button icon={<FileClock size={15} />} onClick={() => setOld(true)}>Old sheets</Button>
            <Button icon={<Lock size={15} />} onClick={() => setCounting(true)} kbd="Ctrl+Shift+K">{info?.status === 'closed' ? 'View count' : 'Count and close'}</Button>
            <Button icon={<Printer size={15} />} kbd="Ctrl+P" onClick={() => setPreview(true)}>Print</Button>
          </>
        }
      />
      {error && <div className="shrink-0 border-b border-danger/30 bg-danger-soft px-5 py-2 text-sm text-danger" role="alert">{error}</div>}

      {info && (info.supervisor || info.note || info.stock.some((l) => l.physical !== null) || info.status === 'closed') && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-surface px-5 py-1.5 text-xs text-muted">
          {info.supervisor && <span>Supervisor <span className="font-medium text-ink">{info.supervisor}</span></span>}
          {info.stock.some((l) => l.physical !== null) && (
            <span>Count: <span className="font-medium text-ink">{info.stock.filter((l) => l.physical !== null).length} lines counted</span>, {info.stock.filter((l) => (l.variance ?? 0) !== 0).length} with a difference</span>
          )}
          {info.note && <span className="truncate">Note: <span className="text-ink">{info.note}</span></span>}
          {info.status === 'closed' && <span>Closed by <span className="font-medium text-ink">{info.closedBy}</span></span>}
        </div>
      )}

      {data && (
        <div className="grid shrink-0 grid-cols-6 gap-2 border-b border-line bg-bg px-4 py-2">
          <StatTile label="Batches" value={data.totals.batches} hint="pressed today" />
          <StatTile label="Seed in" value={`${fmtNum(data.totals.seedInKg)} kg`} hint="clean seed to press" />
          <StatTile label="Oil out" value={`${fmtNum(data.totals.oilL)} L`} hint="from the press" />
          <StatTile label="Cake out" value={`${fmtNum(data.totals.cakeKg)} kg`} hint="punnakku made" />
          <StatTile label="Litres from 100 kg" value={l100 === null ? '-' : l100.toFixed(1)} hint="oil per 100 kg of clean seed" />
          <StatTile label="Loss (moisture, foots)" value={data.totals.batches ? `${data.totals.lossPct.toFixed(1)}%` : '-'} hint={data.totals.batches ? `${fmtNum(data.totals.lossKg)} kg of seed` : 'no pressings'} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-bg p-4">
        {!data ? null : !hasMillData(data) ? (
          <div className="mx-auto flex h-full max-w-[1180px] items-center justify-center">
            <EmptyState
              icon={<Factory size={22} />}
              title={`No mill work recorded on ${longDay(day)}`}
              hint="This sheet fills itself from the Production entries. Pressings, godown barrel work, outsourced oil and store transfers made that day appear here automatically - nothing is typed on this page."
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-[1180px] flex-col gap-3">
            <Card title={<Sec n={1} t="Seeds in the godown" hint="kg. Opening, seed received, seed taken to the press and the closing balance" />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[170px]')}>Seed</th>
                    {['Opening', 'Received', 'Taken to press', 'Other', 'Closing'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.seeds.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-sm text-subtle">No seed movement today.</td></tr>}
                  {data.seeds.map((s) => (
                    <tr key={s.seed}>
                      <td className={cn(td, 'font-medium')}>{s.label}</td>
                      <td className={cn(td, num)}>{fmtQty(s.opening)}</td>
                      <td className={cn(td, num)}>{fmtQty(s.bought)}</td>
                      <td className={cn(td, num)}>{fmtQty(s.toPress)}</td>
                      <td className={cn(td, num)}>{s.other ? fmtQty(s.other) : '-'}</td>
                      <td className={cn(td, num, 'font-semibold')}>{fmtQty(s.closing)}</td>
                    </tr>
                  ))}
                  {data.seeds.length > 0 && (
                    <tr className={totalRow}>
                      <td className={td}>Total</td>
                      <td className={cn(td, num)}>{fmtQty(data.seeds.reduce((a, s) => a + s.opening, 0))}</td>
                      <td className={cn(td, num)}>{fmtQty(data.seeds.reduce((a, s) => a + s.bought, 0))}</td>
                      <td className={cn(td, num)}>{fmtQty(data.seeds.reduce((a, s) => a + s.toPress, 0))}</td>
                      <td className={cn(td, num)}>{fmtQty(data.seeds.reduce((a, s) => a + s.other, 0))}</td>
                      <td className={cn(td, num)}>{fmtQty(data.seeds.reduce((a, s) => a + s.closing, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card title={<Sec n={2} t="Pressing" hint="Seed in, oil out and cake out for every batch, grouped by operator, seed and machine" />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[150px]')}>Operator</th>
                    <th className={cn(th, 'w-[150px]')}>Seed</th>
                    <th className={cn(th, 'w-[74px]')}>Machine</th>
                    {['Batches', 'Seed in kg', 'Oil out L', 'Cake out kg'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                    <th className={cn(th, 'w-[92px] text-right')}>L / 100 kg</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-sm text-subtle">No pressings today.</td></tr>}
                  {rows.map((r) => {
                    const l100 = rowLitresPer100(r);
                    return (
                      <tr key={r.key}>
                        <td className={cn(td, 'font-medium')}>{r.operator}</td>
                        <td className={td}>{r.seedLabel}</td>
                        <td className={td}>{r.machine}</td>
                        <td className={cn(td, num)}>{r.batches}</td>
                        <td className={cn(td, num)}>{fmtQty(r.seedKg)}</td>
                        <td className={cn(td, num)}>{fmtQty(r.oilL)}</td>
                        <td className={cn(td, num)}>{fmtQty(r.cakeKg)}</td>
                        <td className={cn(td, num, 'font-semibold')}>{l100 === null ? '-' : l100.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                  {rows.length > 0 && (
                    <tr className={totalRow}>
                      <td className={td} colSpan={3}>Total, {press.batches} batch{press.batches === 1 ? '' : 'es'}</td>
                      <td className={cn(td, num)}>{press.batches}</td>
                      <td className={cn(td, num)}>{fmtQty(press.seedKg)}</td>
                      <td className={cn(td, num)}>{fmtQty(press.oilL)}</td>
                      <td className={cn(td, num)}>{fmtQty(press.cakeKg)}</td>
                      <td className={cn(td, num)}>{pressPer100 === null ? '-' : pressPer100.toFixed(1)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {rows.length > 0 && (
                <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
                  <span>Cleaning waste {fmtNum(data.totals.cleaningKg)} kg. Loss (moisture, foots) {fmtNum(data.totals.lossKg)} kg of clean seed ({data.totals.lossPct.toFixed(1)}%).</span>
                  <span className="font-semibold text-ink">{l100 === null ? '' : `${l100.toFixed(1)} L / 100 kg`}</span>
                </div>
              )}
            </Card>

            <Card title={<Sec n={3} t="Godown barrels and stick readings" hint="Litres. The stick reading is the end-of-day measure; the difference to the entries is the variance" />}>
              <table className="mb-3 w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[190px]')}>Oil</th>
                    {['Opening L', 'Pressed L', 'Outsourced L', 'To store L', 'Stick adj. L', 'Closing L'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {oils.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-sm text-subtle">No oil movement today.</td></tr>}
                  {oils.map((o) => (
                    <tr key={o.oil}>
                      <td className={cn(td, 'font-medium')}>{o.label}</td>
                      <td className={cn(td, num)}>{fmtQty(o.openingL)}</td>
                      <td className={cn(td, num)}>{fmtQty(o.pressedL)}</td>
                      <td className={cn(td, num)}>{fmtQty(o.outsourcedL)}</td>
                      <td className={cn(td, num)}>{fmtQty(o.transferredL)}</td>
                      <td className={cn(td, num)}>{o.stickAdjustL ? signed(o.stickAdjustL) : '-'}</td>
                      <td className={cn(td, num, 'font-semibold')}>{fmtQty(o.closingL)}</td>
                    </tr>
                  ))}
                  {oils.length > 1 && (
                    <tr className={totalRow}>
                      <td className={td}>Total</td>
                      <td className={cn(td, num)}>{fmtQty(oilT('openingL'))}</td>
                      <td className={cn(td, num)}>{fmtQty(oilT('pressedL'))}</td>
                      <td className={cn(td, num)}>{fmtQty(oilT('outsourcedL'))}</td>
                      <td className={cn(td, num)}>{fmtQty(oilT('transferredL'))}</td>
                      <td className={cn(td, num)}>{signed(oilT('stickAdjustL'))}</td>
                      <td className={cn(td, num)}>{fmtQty(oilT('closingL'))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[140px]')}>Barrel</th>
                    <th className={cn(th, 'w-[140px]')}>Oil</th>
                    <th className={cn(th, 'w-[92px]')}>Status</th>
                    {['Opening L', 'Pressed L', 'Outsourced L', 'To store L', 'Stick adj. L', 'Closing L'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                    <th className={cn(th, 'w-[130px] text-right')}>Stick reading</th>
                  </tr>
                </thead>
                <tbody>
                  {barrels.length === 0 && <tr><td colSpan={11} className="px-2 py-3 text-sm text-subtle">No barrels held oil today.</td></tr>}
                  {barrels.map((b) => (
                    <tr key={b.id}>
                      <td className={cn(td, 'font-medium')}>{b.label}</td>
                      <td className={td}>{oilLabel(b.oil)}</td>
                      <td className={td}><Badge tone={statusTone[b.status]}>{STATUS_LABEL[b.status]}</Badge></td>
                      <td className={cn(td, num)}>{fmtQty(b.openingL)}</td>
                      <td className={cn(td, num)}>{b.pressedL ? fmtQty(b.pressedL) : '-'}</td>
                      <td className={cn(td, num)}>{b.outsourcedL ? fmtQty(b.outsourcedL) : '-'}</td>
                      <td className={cn(td, num)}>{b.transferredL ? fmtQty(b.transferredL) : '-'}</td>
                      <td className={cn(td, num)}>{b.stickAdjustL ? signed(b.stickAdjustL) : '-'}</td>
                      <td className={cn(td, num, 'font-semibold')}>{fmtQty(b.closingL)}</td>
                      <td className={cn(td, num)}>
                        {b.reading ? (
                          <span className="inline-flex items-center gap-1.5">
                            {fmtQty(b.reading.measuredL)} L
                            <Badge tone={b.reading.varianceL === 0 ? 'success' : 'warning'}>{signed(b.reading.varianceL)}</Badge>
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                  {barrels.length > 1 && (
                    <tr className={totalRow}>
                      <td className={td} colSpan={3}>Total</td>
                      <td className={cn(td, num)}>{fmtQty(bt.openingL)}</td>
                      <td className={cn(td, num)}>{fmtQty(bt.pressedL)}</td>
                      <td className={cn(td, num)}>{fmtQty(bt.outsourcedL)}</td>
                      <td className={cn(td, num)}>{fmtQty(bt.transferredL)}</td>
                      <td className={cn(td, num)}>{signed(bt.stickAdjustL)}</td>
                      <td className={cn(td, num)}>{fmtQty(bt.closingL)}</td>
                      <td className={td} />
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card title={<Sec n={4} t="Outsourced oil bought" hint="Bought-in oil added to a godown barrel" />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[84px]')}>No.</th>
                    <th className={cn(th, 'w-[130px]')}>Oil</th>
                    <th className={cn(th, 'w-[130px]')}>Barrel</th>
                    <th className={cn(th, 'w-[170px]')}>Supplier</th>
                    {['Litres', 'Rate / L', 'Cost'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                    <th className={th}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.outsourced.length && <tr><td colSpan={8} className="px-2 py-3 text-sm text-subtle">None today.</td></tr>}
                  {data.outsourced.map((o) => (
                    <tr key={o.id}>
                      <td className={td}>{o.number}</td>
                      <td className={td}>{o.oilName}</td>
                      <td className={td}>{o.barrelLabel}</td>
                      <td className={td}>{o.supplierName}</td>
                      <td className={cn(td, num)}>{fmtQty(o.litresL)}</td>
                      <td className={cn(td, num)}>{formatRupees(o.ratePerL)}</td>
                      <td className={cn(td, num, 'font-semibold')}>{formatRupees(o.cost)}</td>
                      <td className={cn(td, 'truncate text-muted')}>{o.note}</td>
                    </tr>
                  ))}
                  {data.outsourced.length > 0 && (
                    <tr className={totalRow}>
                      <td className={td} colSpan={4}>Total</td>
                      <td className={cn(td, num)}>{fmtQty(outL)} L</td>
                      <td className={td} />
                      <td className={cn(td, num)}>{formatRupees(outCost, { decimals: false })}</td>
                      <td className={td} />
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card title={<Sec n={5} t="Transfers to the store" hint="Settled oil taken from a godown barrel into store stock" />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[84px]')}>No.</th>
                    <th className={cn(th, 'w-[130px]')}>Oil</th>
                    <th className={cn(th, 'w-[130px]')}>Barrel</th>
                    <th className={cn(th, 'w-[190px]')}>To store item</th>
                    <th className={cn(th, 'w-[100px] text-right')}>Litres</th>
                    <th className={cn(th, 'w-[110px]')}>By</th>
                    <th className={th}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.transfers.length && <tr><td colSpan={7} className="px-2 py-3 text-sm text-subtle">None today.</td></tr>}
                  {data.transfers.map((t) => (
                    <tr key={t.id}>
                      <td className={td}>{t.number}</td>
                      <td className={td}>{t.oilName}</td>
                      <td className={td}>{t.barrelLabel}</td>
                      <td className={td}>{t.itemName}</td>
                      <td className={cn(td, num, 'font-semibold')}>{fmtQty(t.litresL)}</td>
                      <td className={cn(td, 'text-muted')}>{t.by ?? '-'}</td>
                      <td className={cn(td, 'truncate text-muted')}>{t.note}</td>
                    </tr>
                  ))}
                  {data.transfers.length > 0 && (
                    <tr className={totalRow}>
                      <td className={td} colSpan={4}>Total</td>
                      <td className={cn(td, num)}>{fmtQty(trL)} L</td>
                      <td className={td} colSpan={2} />
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card title={<Sec n={6} t="Oil cake (punnaku)" hint="kg. Made by the press, sold and the closing balance" />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[210px]')}>Cake</th>
                    {['Opening', 'Made', 'Sold', 'Other', 'Closing'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.cake.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-sm text-subtle">No oil cake movement today.</td></tr>}
                  {data.cake.map((c) => (
                    <tr key={c.key}>
                      <td className={cn(td, 'font-medium')}>{c.label}</td>
                      <td className={cn(td, num)}>{fmtQty(c.opening)}</td>
                      <td className={cn(td, num)}>{c.made ? fmtQty(c.made) : '-'}</td>
                      <td className={cn(td, num)}>{c.sold ? fmtQty(c.sold) : '-'}</td>
                      <td className={cn(td, num)}>{c.other ? fmtQty(c.other) : '-'}</td>
                      <td className={cn(td, num, 'font-semibold')}>{fmtQty(c.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>

      <CountDialog open={counting} day={day} info={info} onClose={() => setCounting(false)} onChanged={(d) => { setInfo(d); load(); }} />
      <OldSheets open={old} onClose={() => setOld(false)} onMoved={load} />

      <Dialog
        open={preview} onOpenChange={setPreview} size="xl" title="Print preview" description="The day at the mill on one A4 sheet. Choose Save as PDF in the print window to keep a copy."
        bodyClassName="bg-neutral-300 p-4"
        footer={<><Button onClick={() => setPreview(false)} kbd="Esc">Close</Button><Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()} kbd="Enter">Print or save as PDF</Button></>}
      >
        {data && <MillDailyPaper data={data} shop={shop} info={info} />}
      </Dialog>
    </>
  );
}

function Sec({ n, t, hint }: { n: number; t: string; hint?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">{n}</span>
      <span>{t}</span>
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </span>
  );
}
