import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Check, Flame, Pencil, Plus, RotateCcw, Scale, Timer, Truck, Warehouse } from 'lucide-react';
import type { GodownBarrel, GodownDetail, GodownMove, GodownStatus, OutsourcedOil, SeedType } from '@gokul/data';
import { Badge, Button, EmptyState, Money, cn, useRefreshOnFocus, type Tone } from '@gokul/ui';
import { api } from '../../store';
import { fmtDate, fmtDateYear, fmtMilli, fmtNum, seedColor, SectionLabel, KV } from './common';
import { AddBarrelsDialog, EditBarrelDialog, OutsourcedOilDialog, StatusDialog, StickReadingDialog, type StatusAction } from './GodownDialogs';

// Production stock lives in the godown in litres: several pressing batches can fill one 200 L barrel, an
// end-of-day measuring-stick reading is the truth, and a full barrel settles before its oil moves to the store.
// Add / edit barrels, settling, stick readings and bought (outsourced) oil are all done from here.

const DAY = 86400000;
const OIL_ORDER: SeedType[] = ['groundnut', 'sesame', 'copra'];

const statusInfo: Record<GodownStatus, { tone: Tone; label: string }> = {
  empty: { tone: 'neutral', label: 'Empty' },
  filling: { tone: 'info', label: 'Filling' },
  settling: { tone: 'warning', label: 'Settling' },
  ready: { tone: 'success', label: 'Ready' },
};

const fillCls: Record<GodownStatus, string> = {
  empty: 'bg-subtle',
  filling: 'bg-primary',
  settling: 'bg-warning',
  ready: 'bg-success',
};

const moveMeta: Record<GodownMove['kind'], { label: string; icon: ReactNode; cls: string }> = {
  press: { label: 'From pressing', icon: <Flame size={13} />, cls: 'bg-primary-soft text-primary' },
  outsourced: { label: 'Outsourced oil', icon: <Truck size={13} />, cls: 'bg-info-soft text-info' },
  stick: { label: 'Stick adjustment', icon: <Scale size={13} />, cls: 'bg-warning-soft text-warning' },
  transfer: { label: 'Moved to store', icon: <ArrowRightLeft size={13} />, cls: 'bg-success-soft text-success' },
};

const pctOf = (b: Pick<GodownBarrel, 'levelL' | 'capacityL'>) => (b.capacityL > 0 ? Math.min(100, (b.levelL / b.capacityL) * 100) : 0);
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));

/** The settle line the shop floor reads: start date and how many days it has been settling. */
function settleText(b: GodownBarrel): string {
  if (!b.settleStartedOn) return '—';
  const days = daysSince(b.settleStartedOn);
  if (b.status === 'ready') return `${fmtDate(b.settleStartedOn)} · ${days} d`;
  return `${fmtDate(b.settleStartedOn)} · day ${Math.min(days + 1, b.settleDays)}/${b.settleDays}`;
}

/* ---------------- barrel card ---------------- */
function Gauge({ pct, status, className }: { pct: number; status: GodownStatus; className?: string }) {
  const height = status === 'empty' ? 0 : Math.max(3, pct);
  return (
    <div className={cn('relative w-2.5 shrink-0 overflow-hidden rounded-full bg-surface-3 ring-1 ring-inset ring-line', className)}>
      <div className={cn('absolute inset-x-0 bottom-0 rounded-full', fillCls[status])} style={{ height: `${height}%` }} />
    </div>
  );
}

function BarrelCard({ barrel, selected, onPick }: { barrel: GodownBarrel; selected: boolean; onPick: () => void }) {
  const pct = pctOf(barrel);
  const st = statusInfo[barrel.status];
  const reading = barrel.lastReading;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col rounded-card border bg-surface p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        selected ? 'border-primary ring-2 ring-primary/25' : 'border-line hover:border-subtle',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{barrel.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', seedColor[barrel.oil])} />
            <span className="truncate">{barrel.oilName}</span>
          </div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <Gauge pct={pct} status={barrel.status} className="h-16" />
        <div className="min-w-0">
          <div className="num text-xl font-semibold leading-none text-ink">
            {fmtMilli(barrel.levelL)}<span className="ml-1 text-xs font-medium text-muted">L</span>
          </div>
          <div className="num mt-1 text-[11px] text-muted">of {fmtMilli(barrel.capacityL, 0)} L</div>
          <div className="num text-[11px] text-subtle">{fmtNum(pct, 0)}% full</div>
        </div>
      </div>

      <div className="mt-2.5 space-y-1 border-t border-line/70 pt-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-muted">Settle</span>
          <span className={cn('num text-right', barrel.settleStartedOn ? 'text-ink' : 'text-subtle')}>{settleText(barrel)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-muted">Last stick</span>
          {reading ? (
            <span className="num text-right text-ink">
              {fmtMilli(reading.measuredL)} L <span className="text-subtle">· {fmtDate(reading.at)}</span>
            </span>
          ) : (
            <span className="text-subtle">No reading yet</span>
          )}
        </div>
      </div>
    </button>
  );
}

function OilGroup({ oil, label, barrels, selId, onPick }: {
  oil: SeedType; label: string; barrels: GodownBarrel[]; selId: string | null; onPick: (id: string) => void;
}) {
  const level = barrels.reduce((a, b) => a + b.levelL, 0);
  const capacity = barrels.reduce((a, b) => a + b.capacityL, 0);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', seedColor[oil])} />
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs font-normal text-muted">{barrels.length} {barrels.length === 1 ? 'barrel' : 'barrels'}</span>
        </div>
        <span className="num shrink-0 text-xs text-muted">{fmtMilli(level)} of {fmtMilli(capacity, 0)} L</span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {barrels.map((b) => <BarrelCard key={b.id} barrel={b} selected={selId === b.id} onPick={() => onPick(b.id)} />)}
      </div>
    </section>
  );
}

/* ---------------- detail side panel ---------------- */
function DetailPanel({ detail, loading, onEdit, onStatus, onStick, onOutsourced }: {
  detail: GodownDetail | null;
  loading: boolean;
  onEdit: (b: GodownBarrel) => void;
  onStatus: (b: GodownBarrel, action: StatusAction) => void;
  onStick: (b: GodownBarrel) => void;
  onOutsourced: () => void;
}) {
  if (!detail) {
    return (
      <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
          {loading ? 'Loading barrel…' : 'Pick a barrel to see its history.'}
        </div>
      </aside>
    );
  }

  const { barrel, ledger, readings } = detail;
  const st = statusInfo[barrel.status];
  const pct = pctOf(barrel);
  const settleDays = barrel.settleStartedOn ? daysSince(barrel.settleStartedOn) : null;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', seedColor[barrel.oil])} />
          <div className="min-w-0 flex-1 truncate text-md font-semibold text-ink">{barrel.label}</div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <div className="mt-0.5 text-sm text-muted">{barrel.oilName}</div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="num text-2xl font-semibold leading-none text-ink">
              {fmtMilli(barrel.levelL)}<span className="ml-1 text-sm font-medium text-muted">L</span>
            </div>
            <div className="num mt-1 text-xs text-muted">of {fmtMilli(barrel.capacityL, 0)} L capacity</div>
          </div>
          <span className="num text-xs text-muted">{fmtNum(pct, 0)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className={cn('h-full rounded-full', fillCls[barrel.status])} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(barrel)}>Edit</Button>
          {barrel.status === 'filling' && (
            <Button size="sm" variant="primary" icon={<Timer size={13} />} onClick={() => onStatus(barrel, 'settle')}>Start settling</Button>
          )}
          {barrel.status === 'settling' && (
            <Button size="sm" variant="primary" icon={<Check size={13} />} onClick={() => onStatus(barrel, 'ready')}>Mark ready</Button>
          )}
          {(barrel.status === 'settling' || barrel.status === 'ready') && (
            <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => onStatus(barrel, 'reopen')}>Reopen</Button>
          )}
          <Button size="sm" icon={<Scale size={13} />} onClick={() => onStick(barrel)}>Stick reading</Button>
          <Button size="sm" icon={<Truck size={13} />} onClick={onOutsourced}>Bought oil</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <SectionLabel>Barrel</SectionLabel>
        <dl className="divide-y divide-line/70 text-sm">
          <KV k="Oil">{barrel.oilName}</KV>
          <KV k="Capacity">{fmtMilli(barrel.capacityL, 0)} L</KV>
          <KV k="Filled on">{barrel.filledOn ? fmtDateYear(barrel.filledOn) : '—'}</KV>
          <KV k="Settle started">{barrel.settleStartedOn ? fmtDateYear(barrel.settleStartedOn) : '—'}</KV>
          <KV k="Days settling">{settleDays === null ? '—' : barrel.status === 'ready' ? `${settleDays} d (settled)` : `Day ${Math.min(settleDays + 1, barrel.settleDays)} of ${barrel.settleDays}`}</KV>
        </dl>

        <div className="mt-4">
          <SectionLabel right={<span className="font-normal normal-case tracking-normal">{readings.length}</span>}>Stick readings</SectionLabel>
          {readings.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-3 py-3 text-xs text-subtle">
              No measuring-stick reading yet. The end-of-day reading shows the difference from the entries.
            </p>
          ) : (
            <div className="space-y-2">
              {readings.map((r) => (
                <div key={`${r.at}-${r.measuredL}`} className="rounded-card border border-line bg-surface-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-semibold text-ink">{fmtMilli(r.measuredL)} L</span>
                    <span className="text-[11px] text-muted">{fmtDate(r.at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-subtle">
                    <span className="num">Entries said {fmtMilli(r.systemL)} L</span>
                    {r.varianceL === 0 ? (
                      <Badge tone="neutral">No variance</Badge>
                    ) : (
                      <Badge tone={r.varianceL < 0 ? 'warning' : 'info'}>{r.varianceL > 0 ? '+' : ''}{fmtMilli(r.varianceL)} L</Badge>
                    )}
                  </div>
                  {(r.note || r.by) && (
                    <div className="mt-1 text-[11px] text-subtle">{[r.note, r.by && `by ${r.by}`].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <SectionLabel right={<span className="font-normal normal-case tracking-normal">{ledger.length} moves</span>}>History</SectionLabel>
          {ledger.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-3 py-3 text-xs text-subtle">
              Nothing in this barrel yet. Pressing batches and outsourced oil appear here.
            </p>
          ) : (
            <div className="divide-y divide-line/70 overflow-hidden rounded-card border border-line">
              {ledger.map((m) => {
                const meta = moveMeta[m.kind];
                return (
                  <div key={`${m.at}-${m.kind}-${m.qtyL}`} className="flex gap-2.5 px-3 py-2">
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', meta.cls)}>{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{meta.label}</span>
                        <span className={cn('num shrink-0 text-sm font-semibold', m.qtyL < 0 ? 'text-danger' : 'text-success')}>
                          {m.qtyL > 0 ? '+' : ''}{fmtMilli(m.qtyL)} L
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted" title={m.note}>{m.note || '—'}</div>
                      <div className="text-[11px] text-subtle">{fmtDateYear(m.at)}{m.by ? ` · ${m.by}` : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ---------------- bought (outsourced) oil ---------------- */
function OutsourcedList({ rows, onAdd }: { rows: OutsourcedOil[] | null; onAdd: () => void }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Truck size={14} className="text-muted" />Bought oil (outsourced)</div>
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={onAdd}>Record purchase</Button>
      </div>
      {rows === null ? (
        <div className="rounded-card border border-line bg-surface px-3 py-2 text-xs text-muted">Loading bought oil…</div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-3 text-xs text-subtle">No oil bought from outside mills yet.</p>
      ) : (
        <div className="divide-y divide-line/70 overflow-hidden rounded-card border border-line bg-surface">
          {rows.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-soft text-info"><Truck size={13} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{o.supplierName}</div>
                <div className="truncate text-[11px] text-muted">{o.number} · {fmtDateYear(o.date)} · {o.oilName} → {o.barrelLabel}</div>
                {o.note && <div className="truncate text-[11px] text-subtle" title={o.note}>{o.note}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-sm font-semibold text-ink">{fmtMilli(o.litresL)} L</div>
                <div className="num text-[11px] text-muted"><Money paise={o.cost} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- pane ---------------- */
export function GodownPane() {
  const [barrels, setBarrels] = useState<GodownBarrel[] | null>(null);
  const [outsourced, setOutsourced] = useState<OutsourcedOil[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GodownDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GodownBarrel | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ barrel: GodownBarrel; action: StatusAction } | null>(null);
  const [sticking, setSticking] = useState<GodownBarrel | null>(null);
  const [outsourcing, setOutsourcing] = useState(false);
  const selRef = useRef<string | null>(null);
  const req = useRef(0);

  const loadDetail = useCallback(async (id: string) => {
    const mine = ++req.current;
    setDetailLoading(true);
    try {
      const d = await api.getGodownBarrel(id);
      if (mine === req.current) setDetail(d);
    } finally {
      if (mine === req.current) setDetailLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const [list, out] = await Promise.all([api.listGodownBarrels(), api.listOutsourcedOil(20)]);
    setBarrels(list);
    setOutsourced(out);
    const keep = selRef.current && list.some((b) => b.id === selRef.current) ? selRef.current : list[0]?.id ?? null;
    if (keep !== selRef.current) { selRef.current = keep; setSelId(keep); }
    if (keep) await loadDetail(keep);
    else { req.current += 1; setDetail(null); setDetailLoading(false); }
  }, [loadDetail]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRefreshOnFocus(() => { void refresh(); });

  const pick = useCallback((id: string) => {
    if (selRef.current === id) return;
    selRef.current = id;
    setSelId(id);
    void loadDetail(id);
  }, [loadDetail]);

  const groups = useMemo(() => {
    const map = new Map<SeedType, GodownBarrel[]>();
    for (const b of barrels ?? []) map.set(b.oil, [...(map.get(b.oil) ?? []), b]);
    return OIL_ORDER.filter((oil) => map.has(oil)).map((oil) => ({ oil, label: map.get(oil)![0].oilName, barrels: map.get(oil)! }));
  }, [barrels]);

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
          {barrels === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">Loading godown barrels…</div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Godown barrels</div>
                  <div className="text-xs text-muted">Pressed and bought oil, measured in litres.</div>
                </div>
                <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add barrels</Button>
              </div>
              {barrels.length === 0 ? (
                <EmptyState icon={<Warehouse size={22} />} title="No godown barrels yet" hint="Press Add barrels to start, then each barrel takes the oil from pressing or an outside mill." />
              ) : (
                groups.map((g) => (
                  <OilGroup key={g.oil} oil={g.oil} label={g.label} barrels={g.barrels} selId={selId} onPick={pick} />
                ))
              )}
              <OutsourcedList rows={outsourced} onAdd={() => setOutsourcing(true)} />
            </div>
          )}
        </div>
        {barrels !== null && barrels.length === 0 ? null : (
          <DetailPanel
            detail={detail}
            loading={detailLoading || barrels === null}
            onEdit={setEditing}
            onStatus={(barrel, action) => setStatusTarget({ barrel, action })}
            onStick={setSticking}
            onOutsourced={() => setOutsourcing(true)}
          />
        )}
      </div>

      <AddBarrelsDialog open={adding} existing={barrels ?? []} onClose={() => setAdding(false)} onSaved={() => void refresh()} />
      <EditBarrelDialog barrel={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
      <StatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} onSaved={() => void refresh()} />
      <StickReadingDialog barrel={sticking} onClose={() => setSticking(null)} onSaved={() => void refresh()} />
      <OutsourcedOilDialog open={outsourcing} barrels={barrels ?? []} onClose={() => setOutsourcing(false)} onSaved={() => void refresh()} />
    </>
  );
}
