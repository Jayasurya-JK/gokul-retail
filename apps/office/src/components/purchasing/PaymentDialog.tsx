import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { parsePaise, type SupplierLedger, type SupplierPayMode, type SupplierSummary } from '@gokul/data';
import { Button, Dialog, Field, Input, Money, NumberInput, Select, useToast } from '@gokul/ui';
import { api } from '../../store';
import { todayYmd } from './common';

const modes: { value: SupplierPayMode; label: string }[] = [
  { value: 'bank', label: 'Bank transfer (NEFT/IMPS)' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

/** Record a payment to a supplier. Allocated to the oldest bills first. */
export function PaymentDialog({ summary, open, onClose, onDone }: {
  summary: SupplierSummary | null; open: boolean; onClose: () => void; onDone: (l: SupplierLedger) => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<SupplierPayMode>('bank');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && summary) { setAmount(String(summary.due / 100)); setMode('bank'); setRef(''); setDate(todayYmd()); setErr(''); }
  }, [open, summary]);
  if (!summary) return null;

  const paise = parsePaise(amount) ?? 0;
  const left = summary.due - paise;
  const save = async () => {
    if (paise <= 0) { setErr('Enter an amount more than zero.'); return; }
    if (paise > summary.due) { setErr('This is more than the amount due.'); return; }
    setBusy(true);
    try {
      const l = await api.recordSupplierPayment({ supplierId: summary.profile.id, amount: paise, mode, ref: ref.trim(), date });
      toast.show({ tone: 'success', title: 'Payment recorded', detail: <>Paid <Money paise={paise} /> to {summary.profile.name}.</> });
      onDone(l); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the payment.'); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Record payment" description={summary.profile.name}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Enter" disabled={busy} onClick={save}>Save payment</Button></>}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="flex items-center justify-between rounded-card border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-sm text-muted">Balance due</span>
          <Money paise={summary.due} className="text-lg font-semibold text-ink" />
        </div>
        <Field label="Amount paid" error={err}>
          <NumberInput data-autofocus prefix={'₹'} value={amount} onValueChange={(v) => { setAmount(v); setErr(''); }} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Paid by" value={mode} onChange={(e) => setMode(e.target.value as SupplierPayMode)} options={modes} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input label="Reference" placeholder={mode === 'cheque' ? 'Cheque number' : 'UTR / transaction id (optional)'} value={ref} onChange={(e) => setRef(e.target.value)} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Balance after payment</span>
          <Money paise={Math.max(0, left)} className="font-semibold text-ink" />
        </div>
        <p className="-mt-2 text-xs text-subtle">Settles the oldest bills first.</p>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
