import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { PAID_FROM_LABEL, needsManagerPin, type Expense, type ExpenseCategory, type ExpensePaidFrom } from '@gokul/data';
import { Button, Dialog, Field, Input, ManagerPinDialog, Select, Switch, useToast } from '@gokul/ui';
import { api } from '../../store';
import { isoDay, paiseToRupees, rupeesToPaise } from '../crm/common';

const MODES: ExpensePaidFrom[] = ['cash', 'upi', 'bank'];

/** Runs an action; if the backend asks for a manager PIN the PIN box opens and the same action is retried with it. */
function useApproved(run: (pin?: string) => Promise<void>) {
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (pin?: string): Promise<string | null> => {
    setBusy(true);
    try { await run(pin); setPinAsk(null); return null; } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not save';
      if (!pin && needsManagerPin(m)) { setPinAsk(m); return null; }
      if (pin) return m;
      setError(m);
      return null;
    } finally { setBusy(false); }
  };
  const pinDialog = <ManagerPinDialog open={pinAsk !== null} message={pinAsk ?? ''} confirmLabel="Approve" onClose={() => setPinAsk(null)} onSubmit={(pin) => go(pin)} />;
  return { go, error, setError, busy, pinDialog };
}

export function NewExpenseDialog({ open, cats, onClose, onDone }: { open: boolean; cats: ExpenseCategory[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [catId, setCatId] = useState('');
  const [from, setFrom] = useState<ExpensePaidFrom>('bank');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(isoDay(new Date()));
  useEffect(() => {
    if (open) { setCatId(cats[0]?.id ?? ''); setFrom('bank'); setAmount(''); setPaidTo(''); setNote(''); setDay(isoDay(new Date())); }
  }, [open, cats]);
  const { go, error, setError, busy, pinDialog } = useApproved(async (pin) => {
    const paise = rupeesToPaise(amount);
    if (paise <= 0) throw new Error('Enter the amount.');
    if (from === 'cash' && day !== isoDay(new Date())) throw new Error('Cash-drawer expenses can only be recorded for today. Choose UPI or bank for an earlier day.');
    await api.addExpense({ categoryId: catId, paidFrom: from, amount: paise, paidTo, note, day, managerPin: pin });
    toast.show({ tone: 'success', title: 'Expense saved' });
    onDone();
  });
  return (
    <>
      <Dialog
        open={open} onOpenChange={(o) => !o && onClose()} size="md" title="New expense" description="For a cost that was not entered at the counter"
        footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void go()} kbd="Enter">Save expense</Button></>}
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void go(); } }} className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={day} max={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Amount (rupees)" error={error}><Input data-autofocus className="num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError(null); }} /></Field>
          <Select label="Category" value={catId} onChange={(e) => setCatId(e.target.value)} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Paid from" value={from} onChange={(e) => setFrom(e.target.value as ExpensePaidFrom)} options={MODES.map((m) => ({ value: m, label: PAID_FROM_LABEL[m] }))} />
          <Field label="Paid to"><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} /></Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Dialog>
      {pinDialog}
    </>
  );
}

export function EditExpenseDialog({ expense, cats, onClose, onDone }: { expense: Expense | null; cats: ExpenseCategory[]; onClose: () => void; onDone: () => void }) {
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (expense) { setCatId(expense.categoryId); setAmount(paiseToRupees(expense.amount)); setPaidTo(expense.paidTo); setNote(expense.note); setReason(''); }
  }, [expense]);
  const { go, error, setError, busy, pinDialog } = useApproved(async (pin) => {
    if (!expense) return;
    const paise = rupeesToPaise(amount);
    if (paise <= 0) throw new Error('Enter the amount.');
    if (!reason.trim()) throw new Error('Give a reason for the change.');
    await api.editExpense({ id: expense.id, reason, categoryId: catId, amount: paise, paidTo, note, managerPin: pin });
    onDone();
  });
  const opts = [...cats, ...(expense && !cats.some((c) => c.id === expense.categoryId) ? [{ id: expense.categoryId, name: expense.category, active: false }] : [])];
  return (
    <>
      <Dialog
        open={!!expense} onOpenChange={(o) => !o && onClose()} size="md" title="Change this expense" description={expense ? `${expense.number} - what it was is kept in the audit log` : undefined}
        footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void go()} kbd="Enter">Save change</Button></>}
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void go(); } }} className="grid grid-cols-2 gap-3">
          <Select label="Category" value={catId} onChange={(e) => setCatId(e.target.value)} options={opts.map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Amount (rupees)"><Input data-autofocus className="num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError(null); }} /></Field>
          <Field label="Paid to"><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} /></Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field className="col-span-2" label="Reason for the change (needed)" error={error}><Input value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="For example: typed the wrong amount" /></Field>
        </div>
      </Dialog>
      {pinDialog}
    </>
  );
}

export function VoidExpenseDialog({ expense, onClose, onDone }: { expense: Expense | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (expense) setReason(''); }, [expense]);
  const { go, error, setError, busy, pinDialog } = useApproved(async (pin) => {
    if (!expense) return;
    if (!reason.trim()) throw new Error('Give a reason for voiding this expense.');
    await api.voidExpense({ id: expense.id, reason, managerPin: pin });
    onDone();
  });
  return (
    <>
      <Dialog
        open={!!expense} onOpenChange={(o) => !o && onClose()} size="sm" title="Void this expense?" description={expense ? `${expense.number} - ${expense.category}` : undefined}
        footer={<><Button onClick={onClose} kbd="Esc">Keep it</Button><Button variant="danger" disabled={busy} onClick={() => void go()} kbd="Enter">Void expense</Button></>}
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } }} className="space-y-2">
          <p className="text-sm text-muted">The entry stays on record, marked void with your reason, and is left out of totals and profit.</p>
          <Field label="Reason (needed)" error={error}><Input data-autofocus value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="For example: entered twice" /></Field>
        </div>
      </Dialog>
      {pinDialog}
    </>
  );
}

type Row = { id?: string; name: string; active: boolean };

/** Categories editor: rename, switch off, add, reorder. Nothing is deleted, old expenses keep their category name. */
export function CategoriesDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { api.listExpenseCategories().then((c) => setRows(c.map((x) => ({ ...x })))); setNewName(''); setError(null); } }, [open]);
  const move = (i: number, d: number) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = () => { if (newName.trim()) { setRows((r) => [...r, { name: newName.trim(), active: true }]); setNewName(''); } };
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.saveExpenseCategories(rows); toast.show({ tone: 'success', title: 'Categories saved' }); onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Expense categories" description="What staff pick at the counter. A category that is switched off stays on old expenses."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>Save categories</Button></>}
    >
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.id ?? `n${i}`} className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5">
            <div className="flex flex-col"><button type="button" tabIndex={-1} onClick={() => move(i, -1)} className="text-subtle hover:text-ink"><ArrowUp size={12} /></button><button type="button" tabIndex={-1} onClick={() => move(i, 1)} className="text-subtle hover:text-ink"><ArrowDown size={12} /></button></div>
            <Input value={r.name} onChange={(e) => setRows((x) => x.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} className="flex-1" />
            <Switch checked={r.active} onCheckedChange={(v) => setRows((x) => x.map((y, k) => (k === i ? { ...y, active: v } : y)))} label={r.active ? 'On' : 'Off'} />
            {!r.id && <button type="button" tabIndex={-1} onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="text-subtle hover:text-danger" aria-label="Remove"><Trash2 size={14} /></button>}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category" className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button icon={<Plus size={14} />} onClick={add}>Add</Button>
        </div>
        {error && <div className="text-sm text-danger" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
