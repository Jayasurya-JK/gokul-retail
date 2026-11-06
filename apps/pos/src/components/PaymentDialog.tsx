import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, HandCoins, QrCode, X } from 'lucide-react';
import { formatPaise, formatRupees, parsePaise, type Customer, type PayMode, type Payment } from '@gokul/data';
import { Button, Dialog, Kbd, Money, cn } from '@gokul/ui';

const MODES: { mode: PayMode; label: string; key: string; icon: React.ReactNode }[] = [
  { mode: 'cash', label: 'Cash', key: 'F1', icon: <Banknote size={20} /> },
  { mode: 'upi', label: 'UPI', key: 'F2', icon: <QrCode size={20} /> },
  { mode: 'card', label: 'Card', key: 'F3', icon: <CreditCard size={20} /> },
  { mode: 'credit', label: 'Credit', key: 'F4', icon: <HandCoins size={20} /> },
];
const modeLabel = (m: PayMode) => MODES.find((x) => x.mode === m)!.label;

const toField = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
const ceilTo = (paise: number, step: number) => Math.ceil(paise / step) * step;

export function PaymentDialog({ open, total, customer, onClose, onComplete, busy }: {
  open: boolean; total: number; customer: Customer | null; onClose: () => void; busy: boolean;
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

  const choose = (m: PayMode) => { setMode(m); setField(toField(remaining)); setError(''); selectField(); };

  const apply = () => {
    if (busy) return;
    let amt = parsePaise(field) ?? remaining;
    if (amt <= 0) amt = remaining;
    if (mode === 'credit') {
      if (!customer) { setError('Credit needs a customer. Close this and press F3 to choose one.'); return; }
      const limit = customer.creditLimit;
      const use = Math.min(amt, remaining);
      if (limit > 0 && customer.outstanding + use > limit) {
        setError(`Over credit limit. ${customer.name} can take ${formatRupees(Math.max(0, limit - customer.outstanding), { decimals: false })} more.`);
        return;
      }
      if (limit === 0) { setError(`${customer.name} has no credit account.`); return; }
    }
    const use = Math.min(amt, remaining);
    const next: Payment[] = [...payments, { mode, amount: use }];
    const left = remaining - use;
    if (left <= 0) { onComplete(next, mode === 'cash' ? Math.max(0, amt - remaining) : 0); return; }
    setPayments(next);
    setField(toField(left));
    setError('');
    selectField();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = ['F1', 'F2', 'F3', 'F4'].indexOf(e.key);
    if (idx >= 0) { e.preventDefault(); e.stopPropagation(); choose(MODES[idx].mode); }
    else if (e.key === 'z' && e.ctrlKey && payments.length) { e.preventDefault(); const last = payments[payments.length - 1]; setPayments(payments.slice(0, -1)); setMode(last.mode); setField(toField(remaining + last.amount)); }
  };

  return (
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
            <div className="grid grid-cols-4 gap-2">
              {MODES.map((m) => (
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
              {mode === 'cash' ? 'Cash received' : mode === 'credit' ? 'Put on credit' : `${modeLabel(mode)} amount`}
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
              ) : mode === 'credit' && customer ? (
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
                  {customer.name} owes {formatRupees(customer.outstanding, { decimals: false })}. Limit {formatRupees(customer.creditLimit, { decimals: false })}.
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
            <span className="flex items-center gap-1"><Kbd>F1</Kbd>-<Kbd>F4</Kbd> method</span>
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
  );
}
