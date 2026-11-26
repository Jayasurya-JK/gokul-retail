import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from './Button';
import { Field, Input } from './Form';
import { Dialog } from './Overlay';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/**
 * A person chooses a PIN: type it twice (and the current PIN first when `askOld`). Used for "Change my PIN" (everyone) and
 * "Set PIN" (the owner, for another user). `rule` answers a plain-words problem or `null`; `onSubmit` saves and answers an
 * error message from the backend, or `null` when it worked. The PIN is never shown after saving.
 */
export function PinChangeDialog({ open, title, description, askOld = false, saveLabel = 'Save PIN', rule, onClose, onSubmit }: {
  open: boolean;
  title: string;
  description?: string;
  askOld?: boolean;
  saveLabel?: string;
  rule: (pin: string) => string | null;
  onClose: () => void;
  onSubmit: (oldPin: string, newPin: string) => Promise<string | null>;
}) {
  const [oldPin, setOld] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { if (open) { setOld(''); setPin(''); setAgain(''); setError(null); setBusy(false); busyRef.current = false; } }, [open]);

  const submit = async () => {
    if (busyRef.current) return;
    if (askOld && oldPin.length < 4) { setError('Type your current PIN first.'); return; }
    const problem = rule(pin);
    if (problem) { setError(problem); return; }
    if (pin !== again) { setError('The two new PINs are not the same. Type them again.'); setAgain(''); return; }
    busyRef.current = true; setBusy(true);
    const err = await onSubmit(oldPin, pin);
    busyRef.current = false; setBusy(false);
    if (err) { setError(err); return; }
    onClose();
  };
  const ready = (!askOld || oldPin.length >= 4) && pin.length >= 4 && again.length >= 4 && !busy;
  const field = (label: string, value: string, set: (v: string) => void, auto?: boolean) => (
    <Field label={label}>
      <Input
        value={value} onChange={(e) => { set(digits(e.target.value)); setError(null); }}
        data-autofocus={auto || undefined} type="password" inputMode="numeric" autoComplete="new-password" placeholder="4 to 6 digits"
        icon={<KeyRound size={15} />} className="num tracking-[0.3em]"
      />
    </Field>
  );

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={title} description={description}
      footer={<>
        <Button onClick={onClose} kbd="Esc">Cancel</Button>
        <Button variant="primary" disabled={!ready} onClick={() => void submit()} kbd="Enter">{saveLabel}</Button>
      </>}
    >
      <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }} className="space-y-3">
        {askOld && field('Current PIN', oldPin, setOld, true)}
        {field('New PIN', pin, setPin, !askOld)}
        {field('Type the new PIN again', again, setAgain)}
        <p className={error ? 'min-h-[18px] text-xs font-medium text-danger' : 'min-h-[18px] text-xs text-subtle'}>
          {error ?? 'Use 4 to 6 digits. Not 1111, 1234 or another PIN already in use. It is never shown again.'}
        </p>
      </div>
    </Dialog>
  );
}
