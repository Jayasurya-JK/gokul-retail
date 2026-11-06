import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatPaise } from '@gokul/data';
import { cn } from '../cn';

/* ---------- Kbd ---------- */
export function Kbd({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'inverse' | 'chrome'; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border px-1 font-sans text-[11px] font-semibold leading-none',
        tone === 'default' && 'border-line-strong bg-surface-2 text-muted',
        tone === 'inverse' && 'border-white/25 bg-white/15 text-white',
        tone === 'chrome' && 'border-white/15 bg-white/10 text-chrome-ink',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ---------- Money ---------- */
export interface MoneyProps extends HTMLAttributes<HTMLSpanElement> {
  /** integer paise */
  paise: number;
  symbol?: boolean;
  decimals?: boolean;
  /** dim the paise part for a cleaner look at large sizes */
  softPaise?: boolean;
  sign?: boolean;
}
export function Money({ paise, symbol = true, decimals = true, softPaise, sign, className, ...rest }: MoneyProps) {
  const full = formatPaise(Math.abs(paise), { decimals });
  const neg = paise < 0;
  const [int, frac] = full.split('.');
  return (
    <span className={cn('num whitespace-nowrap', className)} {...rest}>
      {neg ? '-' : sign && paise > 0 ? '+' : ''}
      {symbol && <span className="mr-[0.08em]">{'₹'}</span>}
      {int}
      {decimals && frac !== undefined && (softPaise ? <span className="opacity-60">.{frac}</span> : `.${frac}`)}
    </span>
  );
}

/* ---------- Badge / StatusDot ---------- */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-[20px] items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap', toneCls[tone], className)}>
      {children}
    </span>
  );
}

const dotCls: Record<string, string> = {
  success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info', neutral: 'bg-subtle',
};
export function StatusDot({ tone = 'success', pulse, className }: { tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dotCls[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotCls[tone])} />
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ title, actions, children, className, bodyClassName, flush }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean;
}) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-card border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <div className="flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={cn('min-h-0 flex-1', !flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------- Stat tile ---------- */
export function StatTile({ label, value, delta, deltaLabel, icon, hint, className, children }: {
  label: string; value: ReactNode; delta?: number; deltaLabel?: string; icon?: ReactNode; hint?: ReactNode; className?: string; children?: ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={cn('flex flex-col justify-between rounded-card border border-line bg-surface px-4 py-3', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        {icon && <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-primary">{icon}</span>}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-ink num">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
        {delta !== undefined && (
          <span className={cn('inline-flex items-center gap-0.5 font-semibold', up ? 'text-success' : 'text-danger')}>
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {(deltaLabel || hint) && <span>{deltaLabel ?? hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------- EmptyState / PageHeader / Toolbar / FilterBar ---------- */
export function EmptyState({ icon, title, hint, action, className }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 text-center', className)}>
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-subtle">{icon}</div>}
      <div className="text-md font-semibold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-sm text-muted">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>}
        <div className="min-w-0">
          <h1 className="truncate text-md font-semibold leading-5 text-ink">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-4', className)}>{children}</div>;
}

export function FilterBar({ children, trailing, className }: { children: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2', className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {trailing && <div className="flex items-center gap-2 text-xs text-muted">{trailing}</div>}
    </div>
  );
}

export function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <span className={cn('shrink-0 bg-line', vertical ? 'h-4 w-px' : 'h-px w-full', className)} />;
}
