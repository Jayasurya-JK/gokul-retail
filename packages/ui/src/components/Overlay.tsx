import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import * as RTooltip from '@radix-ui/react-tooltip';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { cn } from '../cn';
import { Kbd } from './Display';

/* ---------- Tooltip ---------- */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={400} skipDelayDuration={200}>{children}</RTooltip.Provider>;
}
export function Tooltip({ label, kbd, children, side = 'bottom' }: { label: string; kbd?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side} sideOffset={6}
          className="g-overlay z-[100] flex items-center gap-2 rounded-md bg-chrome px-2 py-1 text-xs font-medium text-chrome-ink shadow-pop"
        >
          {label}
          {kbd && <Kbd tone="chrome">{kbd}</Kbd>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/* ---------- Dialog ---------- */
const dialogSizes = { sm: 'w-[420px]', md: 'w-[560px]', lg: 'w-[760px]', xl: 'w-[960px]' };
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof dialogSizes;
  footer?: ReactNode;
  children: ReactNode;
  /** Radix focuses the first focusable; pass a handler to focus something specific */
  onOpenAutoFocus?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
  bodyClassName?: string;
  hideHeader?: boolean;
}
export function Dialog({ open, onOpenChange, title, description, size = 'md', footer, children, onOpenAutoFocus, onCloseAutoFocus, bodyClassName, hideHeader }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        {/* Centred by a full-screen flex box (no percentage translate), so text always lands on whole pixels. */}
        <RDialog.Overlay className="g-overlay fixed inset-0 z-50 flex items-center justify-center bg-overlay/45">
        <RDialog.Content
          ref={contentRef}
          onOpenAutoFocus={(e) => {
            const el = contentRef.current?.querySelector<HTMLElement>('[data-autofocus]');
            if (el) { e.preventDefault(); el.focus(); }
            onOpenAutoFocus?.(e);
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          aria-describedby={undefined}
          className={cn(
            'g-dialog relative z-50 max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] shrink-0',
            'flex flex-col overflow-hidden rounded-card bg-surface shadow-overlay', dialogSizes[size],
          )}
        >
          <div data-dialog-chrome className={cn('flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3', hideHeader && 'sr-only')}>
            <div className="min-w-0">
              <RDialog.Title className="text-md font-semibold text-ink">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close tabIndex={-1} className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-surface-3 hover:text-ink" aria-label="Close">
              <X size={16} />
            </RDialog.Close>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-auto', bodyClassName ?? 'p-5')}>{children}</div>
          {footer && <div data-dialog-chrome className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
        </RDialog.Content>
        </RDialog.Overlay>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ---------- Drawer (right side sheet) ---------- */
export function Drawer({ open, onOpenChange, title, description, width = 440, footer, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; width?: number; footer?: ReactNode; children: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="g-overlay fixed inset-0 z-50 bg-overlay/30" />
        <RDialog.Content
          aria-describedby={undefined}
          style={{ width }}
          className="g-drawer fixed right-0 top-0 z-50 flex h-full max-w-full flex-col border-l border-line bg-surface shadow-overlay"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3">
            <div>
              <RDialog.Title className="text-md font-semibold text-ink">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close tabIndex={-1} className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-surface-3 hover:text-ink" aria-label="Close">
              <X size={16} />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
          {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ---------- Toast ---------- */
export type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: number; tone: ToastTone; title: string; detail?: ReactNode }
interface ToastApi { show: (t: Omit<ToastItem, 'id'> & { duration?: number }) => void }
const ToastCtx = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastCtx);

const toastIcon = {
  success: <CheckCircle2 size={18} className="text-success" />,
  error: <XCircle size={18} className="text-danger" />,
  info: <Info size={18} className="text-info" />,
  warning: <TriangleAlert size={18} className="text-warning" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(({ duration = 3500, ...t }) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-12 left-4 z-[120] flex w-[340px] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="g-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-pop">
            <span className="mt-0.5">{toastIcon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-sm text-muted">{t.detail}</div>}
            </div>
            <button className="text-subtle hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- click-outside hook ---------- */
export function useClickOutside(ref: React.RefObject<HTMLElement>, onOut: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut, active]);
}
