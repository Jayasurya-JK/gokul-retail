import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, HandCoins, QrCode, Star, Ticket, Wallet, X } from 'lucide-react';
import { NO_CREDIT_LIMIT, creditLeft, formatPaise, formatRupees, parsePaise, type Customer, type CustomerWallet, type PayMode, type Payment } from '@gokul/data';
import { Button, Dialog, Field, Input, Kbd, ManagerPinDialog, Money, cn } from '@gokul/ui';
import { api } from '../store';

const MODES: { mode: PayMode; label: string; key: string; icon: React.ReactNode }[] = [
  { mode: 'cash', label: 'Cash', key: 'F1', icon: <Banknote size={20} /> },
  { mode: 'upi', label: 'UPI', key: 'F2', icon: <QrCode size={20} /> },
  { mode: 'card', label: 'Card', key: 'F3', icon: <CreditCard size={20} /> },
  { mode: 'credit', label: 'Credit', key: 'F4', icon: <HandCoins size={20} /> },
  { mode: 'credit_note', label: 'Wallet', key: 'F5', icon: <Wallet size={20} /> },
  { mode: 'points', label: 'Points', key: 'F6', icon: <Star size={20} /> },
  { mode: 'sodexo', label: 'Sodexo', key: 'F7', icon: <Ticket size={20} /> },
];
const modeLabel = (m: PayMode) => MODES.find((x) => x.mode === m)?.label ?? m;

const toField = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
const ceilTo = (paise: number, step: number) => Math.ceil(paise / step) * step;

export function PaymentDialog({ open, total, customer, wallet, onClose, onComplete, busy, onCustomerUpdate }: {
  open: boolean; total: number; customer: Customer | null; wallet?: CustomerWallet | null; onClose: () => void; busy: boolean;
  onCustomerUpdate?: (c: Customer) => void;
  onComplete: (payments: Payment[], change: number) => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mode, setMode] = useState<PayMode>('cash');
  const [field, setField] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectField = () => window.setTimeout(() => inputRef.current?.select(), 20);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);

  useEffect(() => {
    if (open) { setPayments([]); setMode('cash'); setField(toField(total)); setError(''); selectField(); }
  }, [open, total]);

  const amount = parsePaise(field) ?? 0;
  const change = mode === 'cash' ? Math.max(0, amount - remaining) : 0;
  const short = mode === 'cash' && amount > 0 && amount < remaining;

  const chips = useMemo(() => {
    const set = new Set<number>([remaining, ceilTo(remaining, 5000), ceilTo(remaining, 10000), ceilTo(remaining, 50000), ceilTo(remaining, 200000)]);
    return [...set].filter((x) => x >= remaining && x > 0).slice(0, 5);
  }, [remaining]);

  /* Store credit (credit notes spent in parts) and loyalty points: offered only when the customer has some. */
  const spentCredit = payments.filter((p) => p.mode === 'credit_note').reduce((s, p) => s + p.amount, 0);
  const creditAvail = Math.max(0, (wallet?.storeCredit ?? 0) - spentCredit);
  const rules = wallet?.rules;
  const spentPoints = payments.filter((p) => p.mode === 'points').reduce((s, p) => s + p.amount, 0);
  const pv = rules?.pointValue ?? 100;
  const pointsCap = rules && wallet && rules.enabled
    ? Math.min(Math.floor(wallet.points) * pv - spentPoints, Math.floor((total * rules.maxPct) / 100) - spentPoints, remaining)
    : 0;
  const pointsAvail = Math.max(0, Math.floor(pointsCap / pv) * pv);

  const visibleModes = MODES.filter((m) => (m.mode === 'credit_note' ? creditAvail > 0 : m.mode === 'points' ? !!customer && !!wallet && wallet.points > 0 : true));
  const availFor = (m: PayMode) => (m === 'credit_note' ? Math.min(remaining, creditAvail) : m === 'points' ? Math.min(remaining, pointsAvail) : remaining);
  const choose = (m: PayMode) => { setMode(m); setField(toField(availFor(m))); setError(''); selectField(); };

  const [allowOpen, setAllowOpen] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const noCredit = mode === 'credit' && !!customer && customer.creditLimit === 0;
  const newLimit = unlimited ? NO_CREDIT_LIMIT : parsePaise(limitText) ?? 0;

  const apply = () => {
    if (busy) return;
    let amt = parsePaise(field) ?? remaining;
    if (amt <= 0) amt = remaining;
    if (mode === 'credit') {
      if (!customer) { setError('Credit needs a customer. Close this and press F11 to choose one.'); return; }
      const limit = customer.creditLimit;
      const use = Math.min(amt, remaining);
      if (limit > 0 && customer.outstanding + use > limit) {
        setError(`Over credit limit. ${customer.name} can take ${formatRupees(creditLeft(customer) ?? 0, { decimals: false })} more.`);
        return;
      }
      // Credit not allowed: Enter continues as a one-time manager override (the backend asks for the PIN and audits it).
    }
    let use = Math.min(amt, remaining);
    let added: Payment[] = [{ mode, amount: use }];
    if (mode === 'credit_note') {
      use = Math.min(use, creditAvail);
      if (use <= 0) { setError('This customer has no wallet balance left.'); return; }
      // oldest credit note first, each note only for what is left on it
      const taken: Record<string, number> = {};
      payments.filter((p) => p.mode === 'credit_note' && p.ref).forEach((p) => { taken[p.ref!] = (taken[p.ref!] ?? 0) + p.amount; });
      let need = use;
      added = [];
      for (const n of wallet?.creditNotes ?? []) {
        const room = n.balance - (taken[n.number] ?? 0);
        const part = Math.min(room, need);
        if (part > 0) { added.push({ mode, amount: part, ref: n.number }); need -= part; }
        if (need <= 0) break;
      }
    } else if (mode === 'points') {
      const pts = Math.floor(Math.min(use, pointsAvail) / pv);
      if (!rules || pts < rules.minRedeem) { setError(`At least ${rules?.minRedeem ?? 100} points are needed to redeem. This customer can use ${Math.floor(pointsAvail / pv)} now.`); return; }
      use = pts * pv;
      added = [{ mode, amount: use }];
    }
    const next: Payment[] = [...payments, ...added];
    const left = remaining - use;
    if (left <= 0) { onComplete(next, mode === 'cash' ? Math.max(0, amt - remaining) : 0); return; }
    setPayments(next);
    setField(toField(left));
    setError('');
    selectField();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const hit = MODES.find((m) => m.key === e.key && visibleModes.some((v) => v.mode === m.mode));
    if (hit) { e.preventDefault(); e.stopPropagation(); choose(hit.mode); }
    else if (e.key === 'z' && e.ctrlKey && payments.length) { e.preventDefault(); const last = payments[payments.length - 1]; setPayments(payments.slice(0, -1)); setMode(last.mode); setField(toField(remaining + last.amount)); }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Payment" size="lg" hideHeader bodyClassName="p-0">
      <div onKeyDown={onKeyDown}>
        {/* Due band */}
        <div className="flex items-end justify-between bg-chrome px-6 pb-4 pt-4 text-white">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-chrome-muted">{payments.length ? 'Balance to pay' : 'Amount to pay'}</div>
            <div className="num text-3xl font-semibold leading-none tracking-tight" style={{ fontSize: 52 }}><Money paise={remaining} softPaise /></div>
          </div>
          <div className="text-right text-sm text-chrome-muted">
            <div>{customer ? customer.name : 'Walk-in customer'}</div>
            {payments.length > 0 && <div className="num mt-0.5 text-chrome-ink">Bill total {formatRupees(total)}</div>}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_260px]">
          <div className="border-r border-line p-5">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleModes.length}, minmax(0, 1fr))` }}>
              {visibleModes.map((m) => (
                <button
                  key={m.mode} tabIndex={-1} onClick={() => choose(m.mode)}
                  className={cn(
                    'flex h-[72px] flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors',
                    mode === m.mode ? 'border-primary bg-primary-soft text-primary shadow-[0_0_0_1px_rgb(var(--primary))]' : 'border-line bg-surface text-ink hover:bg-surface-2',
                  )}
                >
                  {m.icon}
                  <span className="flex items-center gap-1.5">{m.label}<Kbd>{m.key}</Kbd></span>
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted">
              {mode === 'cash' ? 'Cash received' : mode === 'credit' ? 'Put on credit' : mode === 'points' ? 'Points to use (value in rupees)' : `${modeLabel(mode)} amount`}
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-subtle">{'₹'}</span>
              <input
                ref={inputRef} data-autofocus autoComplete="off" inputMode="decimal" value={field}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  const [a, ...b] = v.split('.');
                  setField(b.length ? `${a}.${b.join('').slice(0, 2)}` : v); setError('');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
                className="num h-16 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-4 text-right text-3xl font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-primary/20"
                style={{ fontSize: 32 }}
              />
            </div>

            {mode === 'cash' && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <button key={c} tabIndex={-1} onClick={() => setField(toField(c))} className="h-8 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium text-ink num hover:bg-surface-3">
                    {i === 0 ? 'Exact' : formatRupees(c, { decimals: false })}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 min-h-[44px]">
              {error ? (
                <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</div>
              ) : mode === 'cash' && amount > 0 && !short ? (
                <div className="flex items-center justify-between rounded-lg bg-success-soft px-4 py-2.5">
                  <span className="text-sm font-semibold text-success">Change to give back</span>
                  <span className="num text-2xl font-bold text-success"><Money paise={change} /></span>
                </div>
              ) : short ? (
                <div className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
                  Short by {formatRupees(remaining - amount)}. Press Enter to take this part and pay the rest another way.
                </div>
              ) : noCredit && customer ? (
                <div className="space-y-2 rounded-lg bg-warning-soft px-3 py-2.5">
                  <div className="text-sm font-semibold text-warning">Credit is not allowed for {customer.name}.</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setLimitText(''); setUnlimited(false); setAllowOpen(true); }}>Allow credit for this customer</Button>
                    <Button size="sm" kbd="Enter" onClick={apply}>One-time manager override for this bill</Button>
                  </div>
                  <div className="text-xs text-muted">Both need a manager or owner PIN and are logged.</div>
                </div>
              ) : mode === 'credit' && customer ? (
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
                  {customer.name} owes {formatRupees(customer.outstanding, { decimals: false })}.{' '}
                  {customer.creditLimit < 0 ? 'No credit limit.' : <>Can take {formatRupees(creditLeft(customer) ?? 0, { decimals: false })} more (limit {formatRupees(customer.creditLimit, { decimals: false })}).</>}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col bg-surface-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Payments</div>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5">
              {payments.length === 0 && <div className="text-sm text-subtle">Nothing taken yet. Type the amount and press Enter.</div>}
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-medium">{modeLabel(p.mode)}</span>
                  <span className="flex items-center gap-2 num font-semibold">
                    {formatPaise(p.amount)}
                    <button tabIndex={-1} aria-label="Remove payment" onClick={() => { setPayments(payments.filter((_, k) => k !== i)); setField(toField(remaining + p.amount)); }} className="text-subtle hover:text-danger"><X size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between text-muted"><span>Bill total</span><span className="num">{formatRupees(total)}</span></div>
              <div className="flex justify-between text-muted"><span>Received</span><span className="num">{formatRupees(paid)}</span></div>
              <div className="flex justify-between font-semibold text-ink"><span>Balance</span><span className="num">{formatRupees(remaining)}</span></div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line bg-surface px-5 py-3">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><Kbd>F1</Kbd>-<Kbd>F7</Kbd> method</span>
            <span className="flex items-center gap-1"><Kbd>Ctrl+Z</Kbd> undo split</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} kbd="Esc">Back to bill</Button>
            <Button variant="primary" size="lg" onClick={apply} kbd="Enter" disabled={busy} className="min-w-[200px]">
              {short ? 'Take part payment' : 'Complete and save'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
    <Dialog
      open={open && allowOpen} onOpenChange={(o) => !o && setAllowOpen(false)} size="sm" title="Allow credit"
      description={customer ? `Set how much ${customer.name} can owe.` : undefined}
      footer={<><Button onClick={() => setAllowOpen(false)} kbd="Esc">Cancel</Button><Button variant="primary" kbd="Enter" disabled={!unlimited && newLimit <= 0} onClick={() => setPinOpen(true)}>Next: manager PIN</Button></>}
    >
      <div className="space-y-3" onKeyDown={(e) => { if (e.key === 'Enter' && (unlimited || newLimit > 0)) { e.preventDefault(); setPinOpen(true); } }}>
        <Field label="Credit limit (Rs)"><Input data-autofocus inputMode="decimal" value={unlimited ? '' : limitText} disabled={unlimited} placeholder="e.g. 5000" onChange={(e) => setLimitText(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} /> No limit (only for customers you fully trust)</label>
      </div>
    </Dialog>
    <ManagerPinDialog
      open={open && allowOpen && pinOpen} title="Allow credit" confirmLabel="Allow credit" onClose={() => setPinOpen(false)}
      message={customer ? `Allow credit for ${customer.name}: ${unlimited ? 'no limit' : 'up to ' + formatRupees(newLimit, { decimals: false })}.` : ''}
      onSubmit={async (pin) => {
        if (!customer) return 'No customer';
        try {
          await api.setCustomerCredit(customer.id, newLimit, pin);
          onCustomerUpdate?.({ ...customer, creditLimit: newLimit });
          setPinOpen(false); setAllowOpen(false); setError('');
          return null;
        } catch (e) { return e instanceof Error ? e.message : 'Could not change the credit limit'; }
      }}
    />
    </>
  );
}
