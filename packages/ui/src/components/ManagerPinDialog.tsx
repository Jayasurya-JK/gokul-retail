import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { Field, Input } from './Form';
import { Dialog } from './Overlay';

/**
 * Asks a manager or owner for their PIN. The PIN is checked by the backend (argon2) together with the action it approves,
 * so `onSubmit` just retries the action with the PIN and answers an error message, or `null` when it worked.
 * Too many wrong PINs lock the signed-in user out: `onLocked` then takes the app back to the sign-in screen.
 */
export function ManagerPinDialog({ open, title = 'Manager approval', message, confirmLabel = 'Approve', onClose, onSubmit, onLocked }: {
  open: boolean;
  title?: string;
  /** What is being approved, in plain words (the backend's own message works well). */
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<string | null>;
  onLocked?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { if (open) { setPin(''); setError(null); setBusy(false); busyRef.current = false; } }, [open]);

  const submit = async () => {
    if (busyRef.current) return;
    if (pin.length < 4) { setError('Enter the 4-digit PIN'); return; }
    busyRef.current = true; setBusy(true);
    const err = await onSubmit(pin);
    busyRef.current = false; setBusy(false);
    if (err) {
      setError(err); setPin('');
      if (/locked for|sign in/i.test(err)) window.setTimeout(() => onLocked?.(), 1600);
    }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm"
      title={<span className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary" /> {title}</span>}
      footer={<>
        <Button onClick={onClose} kbd="Esc">Cancel</Button>
        <Button variant="primary" disabled={pin.length < 4 || busy} onClick={() => void submit()} kbd="Enter">{confirmLabel}</Button>
      </>}
    >
      <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }} className="space-y-4">
        <p className="text-sm text-ink">{message}</p>
        <Field label="Manager or owner PIN" error={error}>
          <Input
            value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
            data-autofocus type="password" inputMode="numeric" autoComplete="off" placeholder="PIN" icon={<KeyRound size={15} />}
            className={error ? 'num tracking-[0.3em] !border-danger' : 'num tracking-[0.3em]'}
          />
        </Field>
        <p className="text-xs text-subtle">It is logged with your name and the approver&apos;s name.</p>
      </div>
    </Dialog>
  );
}
