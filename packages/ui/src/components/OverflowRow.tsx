import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../cn';

export interface OverflowItem {
  key: string;
  node: ReactNode;
  /** Lower numbers move into the More menu first. Leave it out and the item always stays visible. */
  priority?: number;
  /** Always lives in the More menu, never on the row */
  menuOnly?: boolean;
}

/**
 * A horizontal row of buttons that can never overflow. It measures the room it has (ResizeObserver) and, when the items do not
 * fit, moves the lowest-priority ones into a More menu that the caller draws with `moreButton(hiddenItems)`.
 * Items are measured from an invisible copy, so a hidden item keeps its state and its keyboard shortcut still works
 * (shortcuts must be listened for by the screen, not by the button).
 */
export function OverflowRow({ items, moreButton, className, gap = 2, moreWidth = 92, alwaysMore, role, ariaLabel, leading }: {
  items: OverflowItem[];
  moreButton: (hidden: OverflowItem[]) => ReactNode;
  className?: string;
  gap?: number;
  /** Room kept for the More button when something has to move into it */
  moreWidth?: number;
  /** Draw the More button even when nothing is hidden (a row whose More menu is also a normal menu) */
  alwaysMore?: boolean;
  role?: string;
  ariaLabel?: string;
  leading?: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const measure = useCallback(() => {
    const o = outer.current, m = meter.current;
    if (!o || !m) return;
    const cs = getComputedStyle(o);
    const avail = o.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const widths = new Map<string, number>();
    for (const el of Array.from(m.children) as HTMLElement[]) widths.set(el.dataset.k ?? '', el.getBoundingClientRect().width);
    const lead = o.querySelector<HTMLElement>('[data-lead]')?.getBoundingClientRect().width ?? 0;
    const room = avail - (lead ? lead + gap : 0);
    const total = (keys: string[], more: boolean) => keys.reduce((a, k) => a + (widths.get(k) ?? 0), 0) + gap * Math.max(0, keys.length - 1 + (more ? 1 : 0)) + (more ? moreWidth : 0);
    const all = items.filter((i) => !i.menuOnly).map((i) => i.key);
    let shown = all;
    if (total(shown, !!alwaysMore) > room) {
      const order = items.filter((i) => i.priority !== undefined).sort((a, b) => (a.priority as number) - (b.priority as number)).map((i) => i.key);
      for (const k of order) { shown = shown.filter((x) => x !== k); if (total(shown, true) <= room) break; }
    }
    const hidden = items.filter((i) => i.menuOnly || !shown.includes(i.key)).map((i) => i.key);
    setHiddenKeys((prev) => (prev.join('|') === hidden.join('|') ? prev : hidden));
  }, [items, gap, moreWidth, alwaysMore]);

  useLayoutEffect(() => { measure(); }); // every render: item labels can change width (a staff name, a count)
  useLayoutEffect(() => {
    const o = outer.current, m = meter.current;
    if (!o || !m) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(o); ro.observe(m.firstElementChild ?? m);
    return () => ro.disconnect();
  }, []);
  void tick;

  const hidden = items.filter((i) => hiddenKeys.includes(i.key));
  const visible = items.filter((i) => !i.menuOnly && !hiddenKeys.includes(i.key));
  return (
    <div ref={outer} className={cn('relative flex min-w-0 items-center', className)} style={{ gap }} role={role} aria-label={ariaLabel}>
      {leading && <div data-lead className="flex shrink-0 items-center">{leading}</div>}
      {visible.map((i) => <div key={i.key} className="flex shrink-0 items-center">{i.node}</div>)}
      {(hidden.length > 0 || alwaysMore) && <div className="flex shrink-0 items-center">{moreButton(hidden)}</div>}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden" {...({ inert: '' } as object)}>
        <div ref={meter} className="flex w-max items-center" style={{ gap }}>
          {items.filter((i) => !i.menuOnly).map((i) => <div key={i.key} data-k={i.key} className="flex shrink-0 items-center">{i.node}</div>)}
        </div>
      </div>
    </div>
  );
}
