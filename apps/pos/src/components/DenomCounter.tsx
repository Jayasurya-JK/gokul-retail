import { useEffect, useRef } from 'react';
import { COINS_KEY, DENOMS, countedTotal, type DenomCounts } from '@gokul/data';
import { Kbd, Money, cn } from '@gokul/ui';

/**
 * Cash drawer count: one row per note, coins as a single rupee amount.
 * Enter or Down moves to the next row, Up goes back. Enter on the last row calls onDone.
 */
export function DenomCounter({ counts, onChange, onDone, autoFocus = true, doneLabel, compact }: {
  counts: DenomCounts; onChange: (key: string, n: number) => void; onDone?: () => void;
  autoFocus?: boolean; doneLabel?: string; compact?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const rows = [...DENOMS.map((d) => ({ key: d.key, label: d.label, value: d.value, coin: false })), { key: COINS_KEY, label: 'Coins', value: 100, coin: true }];
  useEffect(() => { if (autoFocus) requestAnimationFrame(() => refs.current[0]?.focus()); }, [autoFocus]);

  const noteCount = DENOMS.reduce((s, d) => s + (counts[d.key] ?? 0), 0);
  const rowH = compact ? 'h-11 min-[1700px]:h-[52px]' : 'h-12 min-[1700px]:h-[58px]';

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid h-8 shrink-0 grid-cols-[minmax(110px,1.1fr)_28px_minmax(110px,1fr)_28px_minmax(120px,1.2fr)] items-center border-b border-line bg-surface-2 px-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>Note</span><span /><span className="text-right">Count</span><span /><span className="text-right">Amount</span>
      </div>
      {rows.map((r, i) => {
        const n = counts[r.key] ?? 0;
        const amount = n * r.value;
        return (
          <label
            key={r.key}
            className={cn('grid shrink-0 grid-cols-[minmax(110px,1.1fr)_28px_minmax(110px,1fr)_28px_minmax(120px,1.2fr)] items-center border-b border-line/70 px-5', rowH, 'focus-within:bg-primary-soft')}
          >
            <span className="flex items-center gap-2.5">
              <span className={cn('flex h-8 min-w-[64px] items-center justify-center rounded-md px-2 num text-md font-semibold', r.coin ? 'bg-surface-3 text-muted' : 'bg-chrome text-white')}>
                {r.coin ? 'Coins' : `₹${r.label}`}
              </span>
              {r.coin && <span className="text-xs text-subtle">type the rupee total</span>}
            </span>
            <span className="text-center text-muted">{r.coin ? '' : '×'}</span>
            <input
              ref={(el) => { refs.current[i] = el; }}
              value={n ? String(n) : ''} inputMode="numeric" autoComplete="off" placeholder="0"
              aria-label={r.coin ? 'Coins total in rupees' : `Count of ${r.label} rupee notes`}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => onChange(r.key, Math.min(99999, Number(e.target.value.replace(/\D/g, '')) || 0))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i === rows.length - 1) onDone?.(); else refs.current[i + 1]?.focus();
                } else if (e.key === 'ArrowDown') { e.preventDefault(); refs.current[Math.min(i + 1, rows.length - 1)]?.focus(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); refs.current[Math.max(i - 1, 0)]?.focus(); }
              }}
              className="num h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-right text-lg font-semibold text-ink placeholder:font-normal placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <span className="text-center text-muted">=</span>
            <span className={cn('num text-right text-lg font-semibold', amount ? 'text-ink' : 'text-subtle')}><Money paise={amount} decimals={false} /></span>
          </label>
        );
      })}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-5 text-sm text-muted">
        <span>{noteCount} notes{(counts[COINS_KEY] ?? 0) > 0 ? ` and coins` : ''}</span>
        <span className="flex items-center gap-3">
          {doneLabel && <span className="flex items-center gap-1.5 text-xs"><Kbd>Enter</Kbd> on Coins to {doneLabel}</span>}
          <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Total</span>
          <b className="num text-xl text-ink"><Money paise={countedTotal(counts)} decimals={false} /></b>
        </span>
      </div>
    </div>
  );
}
