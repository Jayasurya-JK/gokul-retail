import * as RTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '../cn';

export function Tabs({ value, onValueChange, tabs, children, className }: {
  value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode; count?: number }[]; children?: ReactNode; className?: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={cn('flex min-h-0 flex-col', className)}>
      <RTabs.List className="flex shrink-0 gap-1 border-b border-line px-4">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value} value={t.value}
            className="relative -mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=active]:border-primary data-[state=active]:text-ink"
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}
export const TabPanel = RTabs.Content;
