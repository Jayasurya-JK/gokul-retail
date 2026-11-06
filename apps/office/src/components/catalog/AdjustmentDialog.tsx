import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { ADJUST_REASONS, formatQty, needsManagerPin, parseQty, type AdjustReason, type Item } from '@gokul/data';
import { Button, Combobox, Dialog, Field, Input, NumberInput, cn, useToast } from '@gokul/ui';
import { KeyRound } from 'lucide-react';
import { api, useSession } from '../../store';
import { Segmented, unitText } from './shared';

/** New stock adjustment: pick item, reason, quantity. Used from Stock and from the item detail pane. */
export function AdjustmentDialog({ open, onOpenChange, itemId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; itemId?: string; onDone?: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [reason, setReason] = useState<AdjustReason>('damage');
  const [dir, setDir] = useState<'add' | 'remove'>('remove');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  /** Shown once the backend says this role needs a manager's PIN for stock changes. */
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (!open) return;
    api.listItems().then((x) => setItems([...x]));
    setId(itemId ?? null); setReason('damage'); setDir('remove'); setQty(''); setNote(''); setError(''); setPinNeeded(false); setPin('');
  }, [open, itemId]);

  const item = items.find((i) => i.id === id);
  const q = parseQty(qty) ?? 0;
  const signed = reason === 'correction' && dir === 'add' ? q : -q;
  const after = item ? item.stock + signed : 0;
  const options = useMemo(() => items.map((i) => ({ value: i.id, label: i.name, hint: `${formatQty(i.stock, i.loose)} ${unitText(i.unit)}` })), [items]);

  const submit = async () => {
    if (!item) { setError('Choose the item first.'); return; }
    let res;
    try {
      res = await api.createAdjustment({ itemId: item.id, reason, qty: signed, note, managerPin: pin || undefined });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not save the adjustment.';
      if (needsManagerPin(m)) { setPinNeeded(true); setError(pin ? 'Manager PIN is not correct' : m); setPin(''); } else setError(m);
      if (/locked for/i.test(m)) window.setTimeout(() => useSession.getState().signOut(), 1600);
      return;
    }
    if (!res.ok) { setError(res.message); return; }
    toast.show({ tone: 'success', title: 'Stock adjusted', detail: `${item.name}: ${signed > 0 ? '+' : '-'}${formatQty(q, item.loose)} ${unitText(item.unit)}` });
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog
      open={open} onOpenChange={onOpenChange} title="New stock adjustment" description="Record stock that is lost, given away or counted wrong. It is kept in the history." size="md"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        const inputs = (e.target as HTMLElement | null)?.querySelectorAll?.('input');
        (itemId ? inputs?.[1] : inputs?.[0])?.focus();
      }}
      footer={<>
        <Button onClick={() => onOpenChange(false)} kbd="Esc">Cancel</Button>
        <Button variant="primary" icon={<Check size={15} />} onClick={() => void submit()} kbd="Ctrl+Enter">Save adjustment</Button>
      </>}
    >
      <div
        className="flex flex-col gap-4"
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit(); } }}
      >
        <div>
          <Combobox label="Item" options={options} value={id} onChange={(v) => { setId(v); setError(''); }} placeholder="Search item name" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Reason</div>
          <div className="grid grid-cols-5 gap-2">
            {ADJUST_REASONS.map((r) => (
              <button
                key={r.value} type="button" onClick={() => { setReason(r.value); if (r.value !== 'correction') setDir('remove'); }}
                className={cn(
                  'rounded-control border px-2 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
                  reason === r.value ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-3',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-xs text-subtle">{ADJUST_REASONS.find((r) => r.value === reason)?.hint}</div>
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label={`Quantity (${item ? unitText(item.unit) : 'units'})`}>
            <NumberInput value={qty} onValueChange={(v) => { setQty(v); setError(''); }} decimals={item?.loose ? 3 : 0} placeholder="0" />
          </Field>
          {reason === 'correction'
            ? <div><div className="mb-1 text-xs font-medium text-muted">Direction</div><Segmented value={dir} onChange={setDir} options={[{ value: 'add', label: 'Add to stock' }, { value: 'remove', label: 'Remove' }]} /></div>
            : <div className="pb-2 text-sm text-muted">This will reduce stock.</div>}
        </div>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 5 L tin dented in transit" />
        {item && (
          <div className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">Stock now {formatQty(item.stock, item.loose)} {unitText(item.unit)}</span>
            <span className={cn('font-semibold num', after < 0 ? 'text-danger' : 'text-ink')}>
              After {q ? `${formatQty(Math.max(0, after), item.loose)} ${unitText(item.unit)}` : '-'}
            </span>
          </div>
        )}
        {pinNeeded && (
          <Input
            label="Manager or owner PIN" type="password" inputMode="numeric" autoComplete="off" icon={<KeyRound size={14} />} className="num tracking-[0.3em]"
            value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="PIN"
          />
        )}
        {error && <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}
