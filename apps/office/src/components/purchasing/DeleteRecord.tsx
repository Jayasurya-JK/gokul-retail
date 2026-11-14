import { useState, type ReactNode } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { Button, Dialog, useToast } from '@gokul/ui';
import { useSession } from '../../store';

/** Only the owner and admin may correct or delete saved records (the backend refuses everyone else too). */
export function useCanEditRecords(): boolean {
  const role = useSession((s) => s.user?.role);
  return role === 'owner' || role === 'admin';
}

/** A delete button with a confirmation. The refusal text from the backend (oil already moved on, and so on) is shown as is. */
export function DeleteRecord({ title, message, doneText, onConfirm, onDone, trigger }: {
  title: string; message: ReactNode; doneText: string; onConfirm: () => Promise<unknown>; onDone: () => void;
  trigger?: (open: () => void) => ReactNode;
}) {
  const allowed = useCanEditRecords();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!allowed) return null;
  const run = async () => {
    setBusy(true); setErr('');
    try { await onConfirm(); toast.show({ tone: 'success', title: doneText }); setOpen(false); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.'); } finally { setBusy(false); }
  };
  const openIt = () => { setErr(''); setOpen(true); };
  return (
    <>
      {trigger ? trigger(openIt) : <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={openIt}>Delete</Button>}
      <Dialog
        open={open} onOpenChange={(o) => !o && setOpen(false)} size="sm" title={title}
        footer={<><Button onClick={() => setOpen(false)} kbd="Esc">Cancel</Button><Button variant="danger" icon={<Trash2 size={15} />} disabled={busy} onClick={() => void run()}>Delete</Button></>}
      >
        <p className="text-sm text-muted">{message}</p>
        <p className="mt-2 text-xs text-subtle">The stock and godown entries are reversed on the original date. The record stays in the audit log.</p>
        {err && <div className="mt-3 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger" role="alert"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{err}</div>}
      </Dialog>
    </>
  );
}
