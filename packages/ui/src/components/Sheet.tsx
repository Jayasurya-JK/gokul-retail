import type { ReactNode } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/**
 * Large right-hand side sheet for editors. Unlike Drawer the body is not padded or scrolled for you,
 * so the content can own its own scroll area and pinned footer.
 */
export function Sheet({ open, onOpenChange, title, description, width = 760, children, onOpenAutoFocus }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; width?: number; children: ReactNode;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="g-overlay fixed inset-0 z-50 bg-overlay/30" />
        <RDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          style={{ width }}
          className="g-drawer fixed right-0 top-0 z-50 flex h-full max-w-full flex-col border-l border-line bg-surface shadow-overlay"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3">
            <div className="min-w-0">
              <RDialog.Title className="truncate text-md font-semibold text-ink">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-0.5 truncate text-sm text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close tabIndex={-1} className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-surface-3 hover:text-ink" aria-label="Close">
              <X size={16} />
            </RDialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
