import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, Pencil, ReceiptIndianRupee, Truck, Wallet, Ban } from 'lucide-react';
import {
  CASH_REASONS, PAID_FROM_LABEL, formatRupees, fuzzyFilter, needsManagerPin, parsePaise,
  type Expense, type ExpenseCategory, type ExpenseList, type ExpensePaidFrom, type SupplierSummary,
} from '@gokul/data';
import { printDoc } from '../printing';
import { Badge, Button, Dialog, EmptyState, Field, Input, Kbd, ManagerPinDialog, Money, PosLayout, clockTime, cn, useRefreshOnFocus, useToast } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';

const COLS = '64px minmax(104px,1fr) minmax(130px,1.5fr) 104px minmax(120px,0.9fr) 96px 150px';
const MODES: ExpensePaidFrom[] = ['cash', 'upi', 'bank'];
const time = (iso: string) => clockTime(iso);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const KEYS: KeyRows = [
  ['Record an expense', ['F3']], ['Pay a supplier', ['F2']], ['Cash added to the drawer', ['F4']], ['Next field', ['Tab']],
  ['Change category or paid-from', ['Left', 'Right']], ['Save the entry', ['F12', 'Enter']],
  ['Select an entry in the list', ['Up', 'Down']], ['Edit the selected entry', ['E']], ['Void the selected entry', ['V']],
  ['Back to billing', ['Esc']],
];

type Mode = 'expense' | 'supplier' | 'in';
const SUPPLIER_FROM = ['Cash from drawer', 'UPI', 'Bank'];

export function Expenses() {
  const nav = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const [data, setData] = useState<ExpenseList | null>(null);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [cashIn, setCashIn] = useState(0);
  const [mode, setMode] = useState<Mode>('expense');
  const [amount, setAmount] = useState('');
  const [catIdx, setCatIdx] = useState(0);
  const [fromIdx, setFromIdx] = useState(0);
  const [reasonIdx, setReasonIdx] = useState(0);
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [supQ, setSupQ] = useState('');
  const [supPick, setSupPick] = useState<SupplierSummary | null>(null);
  const [supHi, setSupHi] = useState(0);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [sel, setSel] = useState(-1);
  const [edit, setEdit] = useState<Expense | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const supRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  useScreenKeys('Expenses', KEYS);

  const refresh = useCallback(async () => {
    const t = todayKey();
    const [l, c, entries, sups] = await Promise.all([
      api.listExpenses({ from: t, to: t, status: 'all' }), api.listExpenseCategories(), api.listCashEntries(),
      api.listSupplierSummaries().catch(() => [] as SupplierSummary[]),
    ]);
    setData(l);
    setSuppliers(sups);
    setSupPick((p) => (p ? sups.find((x) => x.profile.id === p.profile.id) ?? p : p));
    // 'Supplier cash' category hidden: use Paid to supplier instead, 26 Nov 2026. The category and old rows stay in the data.
    setCats(c.filter((x) => x.active && x.id !== 'supplier_cash'));
    setCashIn(entries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useRefreshOnFocus(() => { void refresh(); });
  useEffect(() => { amountRef.current?.focus(); }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const reasons = CASH_REASONS.in;
  const paidFrom = MODES[fromIdx];
  const cat = cats[catIdx];

  const switchMode = useCallback((m: Mode) => {
    setMode(m); setError(null);
    requestAnimationFrame(() => amountRef.current?.focus());
  }, []);

  // Suppliers that owe us money come first when nothing is typed yet.
  const supMatches = useMemo(() => {
    const q = supQ.trim();
    if (!q) return [...suppliers].sort((a, b) => b.due - a.due || a.profile.name.localeCompare(b.profile.name)).slice(0, 6);
    return fuzzyFilter(suppliers, q, (x) => [x.profile.name, x.profile.city], 6);
  }, [suppliers, supQ]);
  const showSupList = !supPick;
  const pickSupplier = (x: SupplierSummary) => {
    setSupPick(x); setSupQ(x.profile.name); setError(null);
    requestAnimationFrame(() => fromRef.current?.focus());
  };

  const save = useCallback(async (pin?: string): Promise<string | null> => {
    if (saving) return null;
    const paise = parsePaise(amount);
    if (paise === null || paise <= 0) { setError('Enter the amount first.'); amountRef.current?.focus(); return null; }
    if (paise > 99_99_999_00) { setError('That amount looks too large. Check the digits.'); amountRef.current?.focus(); return null; }
    if (mode === 'supplier') {
      if (!supPick) { setError('Choose the supplier first.'); supRef.current?.focus(); return null; }
      if (supPick.due <= 0) { setError(`Nothing is due to ${supPick.profile.name}. Record the purchase in Office first.`); return null; }
      if (paise > supPick.due) { setError(`${supPick.profile.name} is owed only ${formatRupees(supPick.due, { decimals: false })}. Enter that or less.`); amountRef.current?.focus(); return null; }
    }
    if (mode === 'expense' && !cat) { setError('Choose a category.'); return null; }
    if (mode === 'expense' && cat?.id === 'other' && !note.trim() && !paidTo.trim()) { setError('Add who it was paid to, or a note, when the category is Other.'); toRef.current?.focus(); return null; }
    setSaving(true);
    try {
      if (mode === 'expense') {
        const saved = await api.addExpense({ categoryId: cat!.id, paidFrom, amount: paise, paidTo: paidTo.trim(), note: note.trim(), by: user?.name ?? 'Cashier', managerPin: pin });
        const no = (saved as { number?: string } | undefined)?.number;
        if (no) void printDoc('expense', no).then((p) => { if (!p.ok) toast.show({ tone: 'warning', title: `Expense saved. Voucher not printed: ${p.message}` }); });
        toast.show({
          tone: 'success', title: 'Expense saved',
          detail: `${formatRupees(paise, { decimals: false })} - ${cat!.name}${paidFrom === 'cash' ? '. Taken off the drawer total.' : `, paid by ${PAID_FROM_LABEL[paidFrom]}.`}`,
        });
      } else if (mode === 'supplier') {
        const mode2 = (['cash', 'upi', 'bank'] as const)[fromIdx];
        const ledger = await api.recordSupplierPayment({ supplierId: supPick!.profile.id, amount: paise, mode: mode2, ref: invoiceNo.trim() || undefined, note: note.trim() || undefined, managerPin: pin });
        toast.show({
          tone: 'success', title: `Paid ${supPick!.profile.name} ${formatRupees(paise, { decimals: false })}`,
          detail: `${mode2 === 'cash' ? 'Taken from the drawer' : `Paid by ${PAID_FROM_LABEL[mode2]}`}. Still due to this supplier: ${formatRupees(ledger.summary.due, { decimals: false })}.`,
        });
        setSupPick(null); setSupQ(''); setInvoiceNo('');
      } else {
        await api.addCashEntry({ kind: 'in', reason: reasons[reasonIdx], amount: paise, note: note.trim(), by: user?.name ?? 'Cashier' });
        toast.show({ tone: 'success', title: 'Cash added to drawer', detail: `${formatRupees(paise, { decimals: false })} - ${reasons[reasonIdx]}.` });
      }
      setAmount(''); setPaidTo(''); setNote(''); setError(null); setPinAsk(null);
      await refresh();
      amountRef.current?.focus();
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (!pin && needsManagerPin(m)) { setPinAsk(m); return null; }
      if (pin) return m || 'Could not save';
      setError(/permission|day/i.test(m) ? m : 'Could not save. Nothing was changed, press Enter to try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [amount, cat, fromIdx, invoiceNo, mode, note, paidFrom, paidTo, reasonIdx, reasons, refresh, saving, supPick, toast, user]);

  const typing = () => {
    const t = document.activeElement;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.getAttribute('role') === 'radiogroup');
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (pinAsk || edit || voiding) return;
      if (e.key === 'F3') { e.preventDefault(); switchMode('expense'); }
      else if (e.key === 'F2') { e.preventDefault(); switchMode('supplier'); }
      else if (e.key === 'F4') { e.preventDefault(); switchMode('in'); }
      else if (e.key === 'F12') { e.preventDefault(); void save(); }
      else if (!typing() && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) {
        e.preventDefault();
        setSel((i) => Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))));
      } else if (!typing() && !e.ctrlKey && !e.altKey && sel >= 0 && rows[sel]) {
        const r = rows[sel];
        if (e.key.toLowerCase() === 'e' && r.status === 'active') { e.preventDefault(); setEdit(r); }
        else if (e.key.toLowerCase() === 'v' && r.status === 'active') { e.preventDefault(); setVoiding(r); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pinAsk, edit, voiding, save, switchMode, rows, sel]);

  const radioKeys = (len: number, set: (f: (i: number) => number) => void, next: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); set((i) => (i + 1) % len); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); set((i) => (i - 1 + len) % len); }
    else if (e.key === 'Enter') { e.preventDefault(); next(); }
  };

  const active = rows.filter((r) => r.status === 'active');
  const cashSpent = data?.byMode.cash ?? 0;

  return (
    <PosLayout
      topBar={<TopBar />}
      sideWidth={470}
      keys={[
        { key: 'F3', label: 'Expense', onClick: () => switchMode('expense') },
        { key: 'F2', label: 'Pay supplier', onClick: () => switchMode('supplier') },
        { key: 'F4', label: 'Cash added', onClick: () => switchMode('in') },
        { key: 'Tab', label: 'Next field' },
        { key: 'E / V', label: 'Edit / void selected' },
        { key: 'Esc', label: 'Back to billing', onClick: () => nav('/billing') },
        { key: 'F12', label: 'Save entry', tone: 'primary', onClick: () => void save() },
      ]}
      side={
        <div className="flex h-full flex-col">
          <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Wallet size={20} /></span>
            <div>
              <h1 className="text-md font-semibold leading-5 text-ink">{mode === 'expense' ? 'New shop expense' : mode === 'supplier' ? 'Paid to a supplier' : 'Cash added to drawer'}</h1>
              <p className="text-xs text-muted">{mode === 'expense' ? 'Tea, transport, wages and every other shop cost' : mode === 'supplier' ? 'Lowers what the shop owes that supplier' : 'Change or float put into the drawer'}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-3 p-1">
              <Seg active={mode === 'expense'} onClick={() => switchMode('expense')} icon={<ReceiptIndianRupee size={16} />} label="Shop expense" k="F3" />
              <Seg active={mode === 'supplier'} onClick={() => switchMode('supplier')} icon={<Truck size={16} />} label="Paid to supplier" k="F2" />
              <Seg active={mode === 'in'} onClick={() => switchMode('in')} icon={<ArrowDownLeft size={16} />} label="Cash added" k="F4" />
            </div>

            <label className="mt-5 block text-xs font-medium text-muted">Amount</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-semibold text-subtle">₹</span>
              <input
                ref={amountRef} value={amount} inputMode="decimal" autoComplete="off" placeholder="0"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (mode === 'expense' ? catRef : mode === 'supplier' ? supRef : reasonRef).current?.focus(); } }}
                aria-label="Amount in rupees"
                className="num h-14 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-4 text-right text-2xl font-semibold text-ink placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary/20"
              />
            </div>

            {mode === 'expense' ? (
              <>
                <label className="mt-5 flex items-center justify-between text-xs font-medium text-muted">
                  <span>Category</span>
                  <span className="flex items-center gap-1 text-subtle"><Kbd>Left</Kbd><Kbd>Right</Kbd> change <Kbd>Enter</Kbd> next</span>
                </label>
                <Chips refEl={catRef} label="Category" items={cats.map((c) => c.name)} idx={catIdx} setIdx={setCatIdx} onKeyDown={radioKeys(cats.length || 1, setCatIdx, () => fromRef.current?.focus())} />

                <label className="mt-5 block text-xs font-medium text-muted">Paid from</label>
                <Chips refEl={fromRef} label="Paid from" items={MODES.map((m) => PAID_FROM_LABEL[m])} idx={fromIdx} setIdx={setFromIdx} onKeyDown={radioKeys(3, setFromIdx, () => toRef.current?.focus())} />

                <label className="mt-5 block text-xs font-medium text-muted">Paid to</label>
                <input
                  ref={toRef} value={paidTo} autoComplete="off" spellCheck={false} maxLength={60} placeholder="Name of the person or shop"
                  onChange={(e) => { setPaidTo(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); noteRef.current?.focus(); } }}
                  className="mt-1 h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </>
            ) : mode === 'supplier' ? (
              <>
                <label className="mt-5 flex items-center justify-between text-xs font-medium text-muted">
                  <span>Supplier</span>
                  <span className="flex items-center gap-1 text-subtle"><Kbd>Up</Kbd><Kbd>Down</Kbd> choose <Kbd>Enter</Kbd> pick</span>
                </label>
                <input
                  ref={supRef} value={supQ} autoComplete="off" spellCheck={false} placeholder="Type the supplier name" aria-label="Supplier"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => { setSupQ(e.target.value); setSupPick(null); setSupHi(0); setError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (supMatches.length) setSupHi((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + supMatches.length) % supMatches.length); }
                    else if (e.key === 'Enter') { e.preventDefault(); if (supPick) fromRef.current?.focus(); else if (supMatches[supHi]) pickSupplier(supMatches[supHi]); }
                  }}
                  className="mt-1 h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
                {showSupList && (
                  <div role="listbox" aria-label="Suppliers" className="mt-1.5 overflow-hidden rounded-xl border border-line bg-surface">
                    {supMatches.length === 0 && <div className="px-3 py-3 text-sm text-muted">No supplier with that name. Add new suppliers in Office.</div>}
                    {supMatches.map((x, i) => (
                      <button
                        key={x.profile.id} type="button" tabIndex={-1} role="option" aria-selected={i === supHi}
                        onMouseEnter={() => setSupHi(i)} onClick={() => pickSupplier(x)}
                        className={cn('flex h-12 w-full items-center justify-between gap-3 border-b border-line/70 px-3 text-left last:border-b-0', i === supHi ? 'bg-primary-soft' : 'hover:bg-surface-3')}
                      >
                        <span className="min-w-0"><span className="block truncate text-base font-medium text-ink">{x.profile.name}</span><span className="block truncate text-xs text-muted">{x.profile.city || 'Supplier'}</span></span>
                        <span className="shrink-0 text-right"><span className="block text-[11px] text-subtle">Due</span><b className={cn('num text-base', x.due > 0 ? 'text-warning' : 'text-subtle')}><Money paise={x.due} decimals={false} /></b></span>
                      </button>
                    ))}
                  </div>
                )}
                {supPick && (
                  <div className={cn('mt-1.5 flex items-center justify-between rounded-xl px-3 py-2 text-sm', supPick.due > 0 ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-muted')}>
                    <span>Owed to {supPick.profile.name}</span><b className="num text-base"><Money paise={supPick.due} decimals={false} /></b>
                  </div>
                )}

                <label className="mt-5 block text-xs font-medium text-muted">Paid from</label>
                <Chips refEl={fromRef} label="Paid from" items={SUPPLIER_FROM} idx={fromIdx} setIdx={setFromIdx} onKeyDown={radioKeys(3, setFromIdx, () => toRef.current?.focus())} />

                <label className="mt-5 block text-xs font-medium text-muted">Supplier bill number (optional)</label>
                <input
                  ref={toRef} value={invoiceNo} autoComplete="off" spellCheck={false} maxLength={30} placeholder="Number printed on the supplier's bill"
                  onChange={(e) => { setInvoiceNo(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); noteRef.current?.focus(); } }}
                  className="mt-1 h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </>
            ) : (
              <>
                <label className="mt-5 block text-xs font-medium text-muted">Reason</label>
                <Chips refEl={reasonRef} label="Reason" items={reasons} idx={reasonIdx} setIdx={setReasonIdx} onKeyDown={radioKeys(reasons.length, setReasonIdx, () => noteRef.current?.focus())} />
              </>
            )}

            <label className="mt-5 block text-xs font-medium text-muted">Note (optional)</label>
            <input
              ref={noteRef} value={note} autoComplete="off" spellCheck={false} maxLength={80}
              placeholder={mode === 'expense' ? 'What it was for' : mode === 'supplier' ? 'Anything to remember about this payment' : 'Where did the money come from'}
              onChange={(e) => { setNote(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
              className="mt-1 h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <div className="mt-3 min-h-5 text-sm font-medium text-danger" role="alert">{error}</div>
          </div>

          <div className="shrink-0 border-t border-line p-4">
            <Button variant="primary" size="lg" block className="!h-[52px] !text-lg" disabled={saving} onClick={() => void save()} kbd="F12">
              {mode === 'expense' ? 'Save expense' : mode === 'supplier' ? 'Save supplier payment' : 'Add cash to drawer'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid shrink-0 grid-cols-3 gap-3 border-b border-line bg-surface p-4">
        <Stat label="Expenses today" tone="danger" value={<Money paise={data?.total ?? 0} decimals={false} />} hint={`${data?.count ?? 0} ${data?.count === 1 ? 'entry' : 'entries'}${data?.voidedCount ? `, ${data.voidedCount} void` : ''}`} />
        <Stat label="Paid from the drawer" value={<Money paise={cashSpent} decimals={false} />} hint="Already taken off the day-close total" />
        <Stat label="Cash added to drawer" tone="success" value={<Money paise={cashIn} decimals={false} />} hint={`UPI and bank expenses: ${formatRupees((data?.byMode.upi ?? 0) + (data?.byMode.bank ?? 0), { decimals: false })}`} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <div className="grid h-8 shrink-0 items-center border-b border-line bg-table-head px-5 text-[11px] font-semibold uppercase tracking-wider text-table-head-ink" style={{ gridTemplateColumns: COLS }}>
          <span>Time</span><span>Category</span><span>Paid to / note</span><span>Paid from</span><span>By</span><span className="text-right">Amount</span><span className="text-right">Edit / void</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No expenses yet today" hint="Tea money, transport and wages will show up here. Supplier payments are listed in Close the day. Entries are never deleted: a wrong one is voided with a reason." />
          ) : rows.map((e, i) => (
            <div
              key={e.id} onClick={() => setSel(i)}
              className={cn('grid min-h-[56px] items-center border-b border-line/70 px-5 text-base', i === sel && 'bg-primary-soft', e.status === 'void' && 'text-subtle')}
              style={{ gridTemplateColumns: COLS }}
            >
              <span className="num text-sm text-muted">{time(e.at)}</span>
              <span className={cn('truncate pr-3 font-medium', e.status === 'void' ? 'line-through' : 'text-ink')}>{e.category}</span>
              <span className="min-w-0 pr-3">
                <span className={cn('block truncate', e.status === 'void' && 'line-through')}>{e.paidTo || <span className="text-subtle">-</span>}</span>
                <span className="block truncate text-xs text-muted" title={e.note}>
                  {e.status === 'void' ? `Void: ${e.voidReason}` : e.note}{e.editCount > 0 && e.status !== 'void' ? ' (edited)' : ''}{e.approvedBy ? ` - approved by ${e.approvedBy}` : ''}
                </span>
              </span>
              <span><Badge tone={e.paidFrom === 'cash' ? 'warning' : 'info'}>{PAID_FROM_LABEL[e.paidFrom]}</Badge></span>
              <span className="truncate pr-3 text-sm text-muted">{e.by}</span>
              <span className={cn('num text-right text-md font-semibold', e.status === 'void' ? 'pr-3 text-subtle line-through' : 'pr-3 text-danger')}><Money paise={e.amount} decimals={false} /></span>
              <span className="flex justify-end gap-1">
                {e.status === 'active' ? (
                  <>
                    <button tabIndex={-1} onClick={(ev) => { ev.stopPropagation(); setEdit(e); }} className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-3 hover:text-ink"><Pencil size={13} />Edit <Kbd>E</Kbd></button>
                    <button tabIndex={-1} onClick={(ev) => { ev.stopPropagation(); setVoiding(e); }} className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-danger hover:bg-danger-soft"><Ban size={13} />Void <Kbd>V</Kbd></button>
                  </>
                ) : <Badge tone="neutral">Void</Badge>}
              </span>
            </div>
          ))}
        </div>
        {active.length > 0 && <div className="shrink-0 border-t border-line bg-surface-2 px-5 py-2 text-xs text-muted">Entries are never deleted. Over the limit, an expense needs a manager PIN.</div>}
      </div>

      <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval for a large expense" message={pinAsk ?? ''} confirmLabel="Approve and save"
        onClose={() => setPinAsk(null)} onSubmit={(pin) => save(pin)}
        onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
      <EditDialog expense={edit} cats={cats} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void refresh(); }} />
      <VoidDialog expense={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); void refresh(); }} />
    </PosLayout>
  );
}

/** Edit or void with a reason; a counter user needs a manager PIN for both. */
function useApproved(run: (pin?: string) => Promise<void>, onClose: () => void) {
  const nav = useNavigate();
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
  const dialog = (
    <ManagerPinDialog
      open={pinAsk !== null} message={pinAsk ?? ''} confirmLabel="Approve"
      onClose={() => { setPinAsk(null); onClose(); }} onSubmit={(pin) => go(pin)}
      onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
    />
  );
  return { go, error, setError, busy, dialog };
}

function EditDialog({ expense, cats, onClose, onDone }: { expense: Expense | null; cats: ExpenseCategory[]; onClose: () => void; onDone: () => void }) {
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (expense) { setCatId(expense.categoryId); setAmount(String(expense.amount / 100)); setPaidTo(expense.paidTo); setNote(expense.note); setReason(''); }
  }, [expense]);
  const { go, error, setError, busy, dialog } = useApproved(async (pin) => {
    if (!expense) return;
    const paise = parsePaise(amount);
    if (paise === null || paise <= 0) throw new Error('Enter the amount.');
    if (!reason.trim()) throw new Error('Give a reason for the change.');
    await api.editExpense({ id: expense.id, reason, categoryId: catId, amount: paise, paidTo, note, managerPin: pin });
    onDone();
  }, onClose);
  return (
    <>
      <Dialog
        open={!!expense} onOpenChange={(o) => !o && onClose()} size="md" title="Change this expense" description={expense ? `${expense.number} - the old values stay in the audit log` : undefined}
        footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void go()} kbd="Enter">Save change</Button></>}
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void go(); } }} className="space-y-3">
          <Field label="Category">
            <select value={catId} onChange={(e) => setCatId(e.target.value)} className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (rupees)"><Input data-autofocus value={amount} inputMode="decimal" onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError(null); }} className="num" /></Field>
            <Field label="Paid to"><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} /></Field>
          </div>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label="Reason for the change (needed)" error={error}><Input value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="For example: typed the wrong amount" /></Field>
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

function VoidDialog({ expense, onClose, onDone }: { expense: Expense | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (expense) setReason(''); }, [expense]);
  const { go, error, setError, busy, dialog } = useApproved(async (pin) => {
    if (!expense) return;
    if (!reason.trim()) throw new Error('Give a reason for voiding this expense.');
    await api.voidExpense({ id: expense.id, reason, managerPin: pin });
    onDone();
  }, onClose);
  return (
    <>
      <Dialog
        open={!!expense} onOpenChange={(o) => !o && onClose()} size="sm" title="Void this expense?"
        description={expense ? `${expense.category}, ${formatRupees(expense.amount, { decimals: false })}${expense.paidTo ? ` to ${expense.paidTo}` : ''}` : undefined}
        footer={<><Button onClick={onClose} kbd="Esc">Keep it</Button><Button variant="danger" disabled={busy} onClick={() => void go()} kbd="Enter">Void expense</Button></>}
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } }} className="space-y-2">
          <p className="text-sm text-muted">The entry stays on record, marked void with your reason. If it was paid from the drawer, the money comes back into the drawer total.</p>
          <Field label="Reason (needed)" error={error}><Input data-autofocus value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="For example: entered twice" /></Field>
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

function Chips({ refEl, label, items, idx, setIdx, onKeyDown }: {
  refEl: React.RefObject<HTMLDivElement>; label: string; items: string[]; idx: number; setIdx: (i: number) => void; onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div ref={refEl} tabIndex={0} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      {items.map((r, i) => (
        <button
          key={r} type="button" tabIndex={-1} role="radio" aria-checked={i === idx} onClick={() => setIdx(i)}
          className={cn('h-9 rounded-full border px-3.5 text-sm font-medium transition-colors', i === idx ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong bg-surface text-ink hover:bg-surface-3')}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Seg({ active, onClick, icon, label, k }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; k: string }) {
  return (
    <button type="button" tabIndex={-1} onClick={onClick} className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-sm font-semibold transition-colors', active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-ink')}>
      <span className="flex items-center gap-1.5 whitespace-nowrap">{icon}{label}</span><Kbd>{k}</Kbd>
    </button>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('num mt-0.5 text-xl font-semibold tracking-tight', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 text-xs text-subtle">{hint}</div>
    </div>
  );
}
