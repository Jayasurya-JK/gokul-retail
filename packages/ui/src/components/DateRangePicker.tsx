import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import { useClickOutside } from './Overlay';
import { Button } from './Button';

export interface DateRange { from: string; to: string; label?: string }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

export const dateRangePresets: { label: string; get: () => DateRange }[] = [
  { label: 'Today', get: () => ({ from: iso(new Date()), to: iso(new Date()), label: 'Today' }) },
  { label: 'Yesterday', get: () => ({ from: iso(addDays(-1)), to: iso(addDays(-1)), label: 'Yesterday' }) },
  { label: 'Last 7 days', get: () => ({ from: iso(addDays(-6)), to: iso(new Date()), label: 'Last 7 days' }) },
  { label: 'Last 30 days', get: () => ({ from: iso(addDays(-29)), to: iso(new Date()), label: 'Last 30 days' }) },
  { label: 'This month', get: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(n), label: 'This month' }; } },
];

const SHORT: Record<string, string> = { 'Last 7 days': '7 days', 'Last 30 days': '30 days' };
const dmy = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

/**
 * The period control: inline chips [Today] [Yesterday] [7 days] [30 days] [This month] [Custom], the active one filled green.
 * Only Custom opens a small floating card (From, To, Apply). When the row has no room for the chips they fold into one
 * "period" button whose card holds the same choices, so nothing ever overlaps its neighbours.
 */
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [custom, setCustom] = useState({ from: value.from, to: value.to });
  const ref = useRef<HTMLDivElement>(null);
  const chipsW = useRef(0);
  useClickOutside(ref, () => setOpen(false), open);
  useEffect(() => { if (open) setCustom({ from: value.from, to: value.to }); }, [open, value.from, value.to]);

  useLayoutEffect(() => {
    const me = ref.current, parent = me?.parentElement;
    if (!me || !parent) return undefined;
    const check = () => {
      if (!compact) {
        if (parent.scrollWidth > parent.clientWidth + 1) { chipsW.current = me.offsetWidth; setCompact(true); }
      } else if (chipsW.current && parent.scrollWidth - me.offsetWidth + chipsW.current + 8 <= parent.clientWidth) setCompact(false);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [compact]);

  const isCustom = !value.label;
  const range = `${dmy(value.from)}${value.from === value.to ? '' : ` - ${dmy(value.to)}`}`;
  const chip = (on: boolean) => cn(
    'h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    on ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface text-ink hover:bg-surface-3',
  );
  const customCard = (
    <div className="px-1 pt-1">
      <div className="mb-1.5 text-xs font-medium text-muted">Custom range</div>
      <div className="flex items-center gap-1.5">
        <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-8 w-full rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink focus:border-primary" />
        <input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-8 w-full rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink focus:border-primary" />
      </div>
      <Button size="sm" variant="primary" block className="mt-2" onClick={() => { onChange({ ...custom, label: undefined }); setOpen(false); }}>Apply</Button>
    </div>
  );
  const card = (children: ReactNode) => (
    <div className="g-overlay g-popover absolute right-0 top-[calc(100%+8px)] z-[70] w-64 bg-surface p-2">{children}</div>
  );

  if (compact) {
    return (
      <div ref={ref} className="relative shrink-0">
        <Button size="md" variant="secondary" icon={<CalendarDays size={15} />} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {value.label ?? range}
          <ChevronDown size={14} className="text-subtle" />
        </Button>
        {open && card(
          <>
            {dateRangePresets.map((p) => (
              <button
                key={p.label} onClick={() => { onChange(p.get()); setOpen(false); }}
                className={cn('flex w-full items-center rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-3', value.label === p.label && 'bg-primary-soft font-medium text-primary')}
              >
                {p.label}
              </button>
            ))}
            <div className="mt-2 border-t border-line pt-2">{customCard}</div>
          </>,
        )}
      </div>
    );
  }
  return (
    <div ref={ref} role="group" aria-label="Period" className="relative flex shrink-0 items-center gap-1.5">
      {dateRangePresets.map((p) => (
        <button key={p.label} type="button" aria-pressed={value.label === p.label} onClick={() => { onChange(p.get()); setOpen(false); }} className={chip(value.label === p.label)}>
          {SHORT[p.label] ?? p.label}
        </button>
      ))}
      <button type="button" aria-pressed={isCustom} aria-expanded={open} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} className={cn(chip(isCustom), 'inline-flex items-center gap-1')}>
        {isCustom ? range : 'Custom'}<ChevronDown size={13} />
      </button>
      {open && card(customCard)}
    </div>
  );
}
