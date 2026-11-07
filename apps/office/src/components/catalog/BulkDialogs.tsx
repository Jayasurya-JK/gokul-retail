import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button, Dialog, EmptyState, Input, cn } from '@gokul/ui';

export interface PickOption { id: string; name: string; items: number }

/** Search-and-pick list in a dialog: "Move N items to a category" / "Set brand". Click a row, Enter or the button confirms. */
export function PickDialog({ open, onClose, title, noun, count, options, confirmLabel, onConfirm }: {
  open: boolean; onClose: () => void; title: string; noun: string; count: number; options: PickOption[]; confirmLabel: string;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(''); setPick(null); setBusy(false); setError(''); } }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.name.toLowerCase().includes(t)) : options;
  }, [options, q]);
  const chosen = options.find((o) => o.id === pick);

  const go = async (id = pick) => {
    if (!id || busy) return;
    setBusy(true); setError('');
    try { await onConfirm(id); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Nothing was changed.'); setBusy(false); }
  };
  const step = (d: 1 | -1) => {
    const i = shown.findIndex((o) => o.id === pick);
    const next = shown[Math.max(0, Math.min(shown.length - 1, i < 0 ? (d === 1 ? 0 : shown.length - 1) : i + d))];
    if (next) {
      setPick(next.id);
      listRef.current?.querySelector(`[data-pick="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} title={title} size="md"
      description={`${count} ${count === 1 ? 'item is' : 'items are'} ticked. Pick the ${noun}, then confirm.`}
      footer={
        <>
          <Button onClick={onClose} kbd="Esc">Cancel</Button>
          <Button variant="primary" disabled={!chosen || busy} onClick={() => void go()} kbd="Enter">
            {chosen ? `${confirmLabel} ${count} ${count === 1 ? 'item' : 'items'} to ${chosen.name}` : confirmLabel}
          </Button>
        </>
      }
    >
      <Input
        autoFocus icon={<Search size={15} />} placeholder={`Search ${noun}`} value={q}
        onChange={(e) => { setQ(e.target.value); setPick(null); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
          else if (e.key === 'Enter') { e.preventDefault(); if (pick) void go(); else if (shown.length === 1) void go(shown[0].id); else step(1); }
        }}
      />
      <div ref={listRef} className="mt-2 h-[300px] overflow-auto rounded-control border border-line">
        {shown.length === 0 && <EmptyState title={`No ${noun} matches`} hint="Check the spelling, or add it in the left pane first." />}
        {shown.map((o) => (
          <div
            key={o.id} data-pick={o.id} onClick={() => setPick(o.id)} onDoubleClick={() => void go(o.id)}
            className={cn('flex h-9 cursor-default items-center gap-2 border-b border-line/60 px-3 text-sm', pick === o.id ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2')}
          >
            <span className="flex h-4 w-4 items-center justify-center">{pick === o.id && <Check size={14} />}</span>
            <span className={cn('min-w-0 flex-1 truncate', pick === o.id ? 'font-semibold' : 'font-medium text-ink')}>{o.name}</span>
            <span className="text-xs text-muted num">{o.items}</span>
          </div>
        ))}
      </div>
      {error && <div className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
    </Dialog>
  );
}

/** Activate / deactivate confirmation with the item count. */
export function ActiveDialog({ open, onClose, active, count, onConfirm }: {
  open: boolean; onClose: () => void; active: boolean; count: number; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setBusy(false); setError(''); } }, [open]);
  const go = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onConfirm(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Nothing was changed.'); setBusy(false); }
  };
  const noun = `${count} ${count === 1 ? 'item' : 'items'}`;
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} title={active ? `Activate ${noun}?` : `Deactivate ${noun}?`} size="sm"
      footer={
        <>
          <Button onClick={onClose} kbd="Esc">Cancel</Button>
          <Button variant={active ? 'primary' : 'danger'} disabled={busy} onClick={() => void go()} autoFocus>{active ? 'Activate' : 'Deactivate'} {noun}</Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        {active ? 'These items will show up on the billing screen again.' : 'These items will stop appearing on the billing screen. Old bills and stock history are not changed, and you can activate them again any time.'}
      </p>
      {error && <div className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
    </Dialog>
  );
}
