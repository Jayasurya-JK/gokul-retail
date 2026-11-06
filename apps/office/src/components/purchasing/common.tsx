import { useEffect, useRef, type ReactNode } from 'react';
import { Droplets } from 'lucide-react';
import type { Barrel, BatchPhase, PayStatus, SeedType, YieldGrade } from '@gokul/data';
import { Badge, cn, type Tone } from '@gokul/ui';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const dateYearFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtDateYear = (iso: string) => dateYearFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** milli-units to a readable number with Indian grouping, trimming needless zeros */
export function fmtMilli(m: number, maxDecimals = 1): string {
  const v = m / 1000;
  return v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
}
export const fmtNum = (v: number, d = 1) => v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export const payTone: Record<PayStatus, { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  partial: { tone: 'warning', label: 'Part paid' },
  due: { tone: 'danger', label: 'Unpaid' },
};
export function PayBadge({ status }: { status: PayStatus }) {
  return <Badge tone={payTone[status].tone}>{payTone[status].label}</Badge>;
}

export const gradeTone: Record<YieldGrade, Tone> = { good: 'success', low: 'warning', poor: 'danger' };

export const phaseInfo: Record<BatchPhase, { tone: Tone; label: string }> = {
  settling: { tone: 'warning', label: 'Settling' },
  ready: { tone: 'info', label: 'Ready to filter' },
  'in-barrel': { tone: 'success', label: 'In barrel' },
};

export const seedColor: Record<SeedType, string> = {
  groundnut: 'bg-warning',
  sesame: 'bg-ink',
  copra: 'bg-info',
};

/** Small section label used inside panes */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
      <span>{children}</span>{right}
    </div>
  );
}

export function KV({ k, children, strong }: { k: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className={cn('num text-right', strong ? 'font-semibold text-ink' : 'text-ink')}>{children}</span>
    </div>
  );
}

/** Run a key handler on the window. Skipped while any dialog is open unless `inDialog` is true. */
export function useKeys(handler: (e: KeyboardEvent) => void, enabled = true, inDialog = false) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (!inDialog && document.querySelector('[role="dialog"]')) return;
      ref.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled, inDialog]);
}

/** A barrel gauge: how the shop floor looks at the barrels. */
export function BarrelCard({ barrel, selected, onClick, disabled }: { barrel: Barrel; selected?: boolean; onClick?: () => void; disabled?: boolean }) {
  const pct = Math.min(100, (barrel.levelL / barrel.capacityL) * 100);
  const low = barrel.oilName !== null && pct < 25;
  const empty = barrel.oilName === null;
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={cn(
        'relative flex min-w-0 flex-1 flex-col gap-1 rounded-card border bg-surface px-2.5 py-2 text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/25' : 'border-line',
        onClick && !disabled && 'hover:border-subtle',
        disabled && 'opacity-45',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="whitespace-nowrap text-xs font-semibold text-ink">{barrel.label}</span>
        <Droplets size={12} className={empty ? 'text-subtle' : low ? 'text-warning' : 'text-primary'} />
      </div>
      <div className="truncate text-[11px] text-muted">{barrel.oilName ?? 'Free to fill'}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', low ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <div className="num flex items-baseline justify-between text-[11px]">
        <span className={cn('font-semibold', low ? 'text-warning' : 'text-ink')}>{fmtMilli(barrel.levelL)} L</span>
        <span className="text-subtle">/ {fmtMilli(barrel.capacityL, 0)}</span>
      </div>
    </Comp>
  );
}

export function BarrelStrip({ barrels, selectedId, onPick, accept }: { barrels: Barrel[]; selectedId?: string | null; onPick?: (b: Barrel) => void; accept?: (b: Barrel) => boolean }) {
  return (
    <div className="flex gap-2">
      {barrels.map((b) => (
        <BarrelCard key={b.id} barrel={b} selected={selectedId === b.id} onClick={onPick ? () => onPick(b) : undefined} disabled={accept ? !accept(b) : false} />
      ))}
    </div>
  );
}
