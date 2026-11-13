import { useEffect, useState } from 'react';
import { IndianRupee, MessageCircle, Smartphone } from 'lucide-react';
import { formatRupees, type ReceivableRow } from '@gokul/data';
import { Button, Dialog, Field, Input, Money, NumberInput } from '@gokul/ui';
import { paiseToRupees, rupeesToPaise, Segmented } from './common';

export function RecordPaymentDialog({ row, open, onClose, onSave }: {
  row: ReceivableRow | null; open: boolean; onClose: () => void;
  onSave: (v: { amount: number; mode: 'cash' | 'upi'; ref: string; note: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi'>('cash');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && row) { setAmount(paiseToRupees(row.total)); setMode('cash'); setRef(''); setNote(''); setError(''); }
  }, [open, row]);

  if (!row) return null;
  const paise = rupeesToPaise(amount);
  const left = Math.max(0, row.total - paise);

  const submit = async () => {
    if (busy) return;
    if (paise <= 0) return setError('Enter the amount received');
    if (paise > row.total) return setError(`Amount is more than the ${formatRupees(row.total)} outstanding`);
    if (mode === 'upi' && ref.trim().length < 6) return setError('Enter the last digits of the UPI reference so it can be matched later');
    setBusy(true);
    try { await onSave({ amount: paise, mode, ref: ref.trim(), note: note.trim() }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the payment'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Record payment" description={`${row.name}${row.business ? ` · ${row.business}` : ''}`}
      footer={<><Button variant="ghost" onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={submit} disabled={busy} kbd="Enter">Save payment</Button></>}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="flex items-center justify-between rounded-control bg-surface-2 px-3 py-2.5">
          <span className="text-sm text-muted">Outstanding now</span>
          <span className="text-lg font-semibold text-ink num"><Money paise={row.total} /></span>
        </div>
        <Field label="Amount received" error={error || undefined}>
          <NumberInput value={amount} onValueChange={(v) => { setAmount(v); setError(''); }} prefix={'₹'} size="lg" data-autofocus autoFocus onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div className="-mt-2 flex gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <button key={f} type="button" onClick={() => setAmount(paiseToRupees(Math.round((row.total * f) / 100) * 100))} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-medium text-muted hover:bg-surface-3 hover:text-ink">
              {f === 1 ? 'Full amount' : `${f * 100}%`}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Received as</div>
          <Segmented<'cash' | 'upi'> value={mode} onChange={setMode} options={[{ value: 'cash', label: <span className="flex items-center gap-1.5"><IndianRupee size={14} /> Cash</span> }, { value: 'upi', label: <span className="flex items-center gap-1.5"><Smartphone size={14} /> UPI</span> }]} />
        </div>
        {mode === 'upi' && <Input label="UPI reference" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Last digits of UTR" className="num" />}
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by son, part payment" />
        <div className="rounded-control border border-line px-3 py-2 text-sm text-muted">
          Applied to the oldest bills first. Balance after this payment <b className="ml-1 text-ink num"><Money paise={left} /></b>
        </div>
      </form>
    </Dialog>
  );
}

export const reminderText = (row: ReceivableRow, shop: string) =>
  `Hello ${row.name.split(' ')[0]}, this is a gentle reminder from ${shop}. Your outstanding balance is ${formatRupees(row.total, { decimals: false })}` +
  `${row.oldestDays > 30 ? `, with bills pending for ${row.oldestDays} days` : ''}. ` +
  'You can pay by cash at the shop or UPI to 98421 07731. Thank you!';

export function ReminderDialog({ row, shop, open, onClose, onSend }: {
  row: ReceivableRow | null; shop: string; open: boolean; onClose: () => void; onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  useEffect(() => { if (open && row) setText(reminderText(row, shop)); }, [open, row, shop]);
  if (!row) return null;
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="WhatsApp reminder" description={`To ${row.name} · ${row.phone}`}
      footer={<><Button variant="ghost" onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<MessageCircle size={15} />} onClick={() => void onSend(text)}>Open in WhatsApp</Button></>}
    >
      <div className="rounded-card bg-surface-3 p-4">
        <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-primary-soft px-3 py-2 text-sm leading-relaxed text-ink shadow-sm">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={6} data-autofocus
            className="w-full resize-none bg-transparent outline-none"
          />
          <div className="mt-0.5 text-right text-[11px] text-subtle">Preview</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">This opens WhatsApp on this computer with the message ready. You press send there.</p>
    </Dialog>
  );
}
