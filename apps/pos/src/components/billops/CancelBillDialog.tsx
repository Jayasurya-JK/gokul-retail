import { useEffect, useState } from 'react';
import { Ban, KeyRound, TriangleAlert } from 'lucide-react';
import { CANCEL_REASONS, type BillDetail } from '@gokul/data';
import { Button, Dialog, Field, Input, Money, Select } from '@gokul/ui';
import { StatusBadge, dateTimeOf } from './helpers';

/** Cancel a bill: reason + owner/manager PIN. The bill is kept (marked cancelled), stock goes back. */
export function CancelBillDialog({ open, detail, onClose, onConfirm }: {
  open: boolean; detail: BillDetail | null; onClose: () => void;
  onConfirm: (reason: string, pin: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [other, setOther] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(CANCEL_REASONS[0]); setOther(''); setPin(''); setError(null); } }, [open]);
  if (!detail) return null;
  const { bill } = detail;
  const finalReason = reason === 'Other' ? other.trim() : reason;
  const ready = finalReason.length > 0 && pin.length >= 4 && !busy;

  const submit = async () => {
    if (!ready) {
      if (!finalReason) setError('Write the reason for cancelling');
      else setError('Enter the manager PIN (4 to 6 digits)');
      return;
    }
    setBusy(true);
    const err = await onConfirm(finalReason, pin);
    setBusy(false);
    if (err) { setError(err); setPin(''); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm"
      title={<span className="flex items-center gap-2"><Ban size={18} className="text-danger" /> Cancel bill</span>}
      footer={<>
        <Button onClick={onClose} kbd="Esc">Keep bill</Button>
        <Button variant="danger" disabled={!ready} onClick={() => void submit()} kbd="Enter">Cancel bill</Button>
      </>}
    >
      <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }} className="space-y-4">
        <div className="flex items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="num text-base font-semibold text-ink">{bill.number}</div>
            <div className="truncate text-xs text-muted">{dateTimeOf(bill.at)} - {bill.customerName}</div>
          </div>
          <div className="text-right">
            <Money paise={bill.totals.grand} className="text-md font-semibold" />
            <div className="mt-0.5"><StatusBadge bill={bill} detail={detail} /></div>
          </div>
        </div>

        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        {reason === 'Other' && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Write the reason" maxLength={80} />}

        <Field label="Manager or owner PIN" error={error}>
          <Input
            value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
            data-autofocus type="password" inputMode="numeric" autoComplete="off" placeholder="PIN" icon={<KeyRound size={15} />}
            className={error ? 'num tracking-[0.3em] !border-danger' : 'num tracking-[0.3em]'}
          />
        </Field>

        <div className="flex gap-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>The bill is not deleted. It stays in history as Cancelled, the stock goes back to the shelf, and this is logged with your name.</span>
        </div>
      </div>
    </Dialog>
  );
}
