import type { ReactNode } from 'react';
import { cn } from '@gokul/ui';

/** Small segmented switch, e.g. Loose / Packed. */
export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-control border border-line-strong bg-surface-3 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cn(
            'h-7 whitespace-nowrap rounded-[6px] px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Titled group of fields. */
export function Section({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export const UNIT_LABEL: Record<string, string> = {
  kg: 'kg', g: 'g', l: 'L', ml: 'ml', pc: 'pc', tin: 'tin', btl: 'bottle', pkt: 'packet',
};
export const unitText = (unit: string) => UNIT_LABEL[unit] ?? unit;

export const todayLabel = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
export const relTime = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${time}`;
};
