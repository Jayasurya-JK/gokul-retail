import { useRef, useState } from 'react';
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

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ from: value.from, to: value.to });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <Button size="md" variant="secondary" icon={<CalendarDays size={15} />} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
        {value.label ?? `${value.from} to ${value.to}`}
        <ChevronDown size={14} className="text-subtle" />
      </Button>
      {open && (
        <div className="g-overlay absolute left-0 top-full z-40 mt-1 w-64 rounded-card border border-line bg-surface p-2 shadow-pop">
          {dateRangePresets.map((p) => (
            <button
              key={p.label}
              onClick={() => { onChange(p.get()); setOpen(false); }}
              className={cn('flex w-full items-center rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-3', value.label === p.label && 'bg-primary-soft font-medium text-primary')}
            >
              {p.label}
            </button>
          ))}
          <div className="mt-2 border-t border-line px-1 pt-2">
            <div className="mb-1.5 text-xs font-medium text-muted">Custom range</div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-7 w-full rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink focus:border-primary" />
              <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-7 w-full rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink focus:border-primary" />
            </div>
            <Button size="sm" variant="primary" block className="mt-2" onClick={() => { onChange({ ...custom, label: undefined }); setOpen(false); }}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}
