import type { ReactNode } from 'react';
import { Badge, type Tone } from '@gokul/ui';
import type { Bill, PayMode } from '@gokul/data';

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
export const ago = (iso?: string) => {
  if (!iso) return 'Never';
  const d = daysSince(iso);
  return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const rupeesToPaise = (s: string): number => Math.round((parseFloat(s) || 0) * 100);
export const paiseToRupees = (p: number): string => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

export const statusTone: Record<Bill['status'], Tone> = { paid: 'success', credit: 'warning', cancelled: 'danger', returned: 'info' };
export const statusLabel: Record<Bill['status'], string> = { paid: 'Paid', credit: 'On credit', cancelled: 'Cancelled', returned: 'Returned' };
export function StatusBadge({ status }: { status: Bill['status'] }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export const modeLabel: Record<PayMode, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit', credit_note: 'Credit note', points: 'Points' };
export const modeTone: Record<PayMode, Tone> = { cash: 'success', upi: 'info', card: 'neutral', credit: 'warning', credit_note: 'neutral', points: 'neutral' };
export function billMode(b: Bill): string {
  return b.payments.length > 1 ? 'Split' : modeLabel[b.payments[0]?.mode ?? 'cash'];
}

export function PropRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h4>
      {right}
    </div>
  );
}

export function Avatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

const PALETTE = ['#0E4330', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#0891B2', '#65A30D'];
export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export const initialsOf = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase();

/** Compact horizontal bar split by value, used for ageing and payment mix. */
export function SplitBar({ parts, height = 8 }: { parts: { value: number; className: string; label?: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-line" style={{ height }}>
      {total > 0 && parts.map((p, i) => p.value > 0 && <div key={i} title={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
    </div>
  );
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Master/detail right pane shell. */
export function DetailPane({ children, width = 400 }: { children: ReactNode; width?: number }) {
  return <aside style={{ width }} className="flex h-full shrink-0 flex-col border-l border-line bg-surface">{children}</aside>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex h-8 items-center rounded-control bg-surface-3 p-0.5">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`h-7 rounded-[6px] px-3 text-sm font-medium transition-colors ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
