import { formatRupees } from '@gokul/data';
import { StatusDot } from '@gokul/ui';
import { useSession, useTodaySales } from '../store';

/** One quiet line at the bottom of every POS screen: who, which counter, today's sales, where, which version. */
export function StatusBar() {
  const { user, shift, settings } = useSession();
  const today = useTodaySales();
  if (!user) return null;
  const place = (settings?.address ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(-2).join(', ');
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-surface-2 px-3 text-xs text-muted">
      <span className="flex items-center gap-1.5"><StatusDot tone="success" /> User <b className="font-semibold text-ink">{user.name}</b></span>
      <span className="h-3 w-px bg-line-strong" />
      <span>Counter <b className="font-semibold text-ink">{shift?.counter ?? settings?.counter ?? '-'}</b></span>
      <span className="h-3 w-px bg-line-strong" />
      <span className="flex items-center gap-1.5">
        <span className="font-semibold uppercase tracking-wider text-subtle">Total sales</span>
        <b className="num text-sm font-semibold text-primary">{formatRupees(today.sales, { decimals: false })}</b>
        <span className="num text-subtle">({today.bills} {today.bills === 1 ? 'bill' : 'bills'} today)</span>
      </span>
      <span className="flex-1" />
      {place && <span className="max-w-[40ch] truncate">Location <b className="font-semibold text-ink">{place}</b></span>}
      <span className="h-3 w-px bg-line-strong" />
      <span className="num">v{__APP_VERSION__}</span>
    </footer>
  );
}
