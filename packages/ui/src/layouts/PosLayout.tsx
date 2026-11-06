import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Kbd } from '../components/Display';

export interface FKey { key: string; label: string; onClick?: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean }

export function FKeyBar({ keys }: { keys: FKey[] }) {
  return (
    <div className="flex h-10 shrink-0 items-stretch border-t border-line bg-surface">
      {keys.map((k, i) => (
        <button
          key={k.key}
          onClick={k.onClick}
          tabIndex={-1}
          disabled={k.disabled}
          className={cn(
            'group flex min-w-0 flex-1 items-center justify-center gap-2 px-1 text-sm font-medium transition-colors disabled:opacity-40',
            i > 0 && 'border-l border-line',
            k.tone === 'primary' ? 'bg-primary text-primary-fg hover:bg-primary-hover' : 'text-ink hover:bg-surface-3',
            k.tone === 'danger' && 'text-danger',
          )}
        >
          <Kbd tone={k.tone === 'primary' ? 'inverse' : 'default'}>{k.key}</Kbd>
          <span className="truncate">{k.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Billing-counter shell. Fills the window: status bar on top, work area (main + right panel),
 * F-key bar at the bottom. Nothing here ever scrolls the page.
 */
export function PosLayout({ topBar, side, keys, children, sideWidth }: {
  topBar: ReactNode; side?: ReactNode; keys: FKey[]; children: ReactNode; sideWidth?: number;
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <header className="flex h-10 shrink-0 items-center gap-1 bg-chrome px-3 text-chrome-ink">{topBar}</header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        {side && (
          <aside
            className="flex shrink-0 flex-col border-l border-line bg-surface"
            style={{ width: sideWidth ?? 'clamp(340px, 26vw, 440px)' }}
          >
            {side}
          </aside>
        )}
      </div>
      <FKeyBar keys={keys} />
    </div>
  );
}
