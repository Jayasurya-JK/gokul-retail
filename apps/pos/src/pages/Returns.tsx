import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, IndianRupee, Check, CornerUpLeft, FileText, ScanBarcode, Smartphone, TriangleAlert } from 'lucide-react';
import {
  RETURN_REASONS, billHasCredit, formatQty, formatRupees, isDecimalUnit, parseQty, quoteReturn,
  type Bill, type BillDetail, type CreditNote, type RefundMode,
} from '@gokul/data';
import { printWithToast } from '../printing';
import { beepError, useScanHandler } from '../scanner';
import { Badge, Button, Kbd, ManagerPinDialog, Money, PosLayout, cn, useRefreshOnFocus, useToast, type FKey } from '@gokul/ui';
import { needsManagerPin } from '@gokul/data';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { CreditNoteDialog } from '../components/billops/CreditNoteDialog';
import { StatusBadge, dateTimeOf, modeLabel, payLabel, timeOf } from '../components/billops/helpers';

type Dlg = null | 'preview' | 'done';
interface Mode { id: RefundMode; label: string; hint: string; key: string; icon: JSX.Element }
const MODES: Mode[] = [
  { id: 'cash', label: 'Cash', hint: 'Give money back now', key: 'F5', icon: <IndianRupee size={16} /> },
  { id: 'upi', label: 'UPI', hint: 'Send back by UPI', key: 'F6', icon: <Smartphone size={16} /> },
  { id: 'credit_note', label: 'Credit note', hint: 'Customer keeps a note', key: 'F7', icon: <FileText size={16} /> },
  { id: 'exchange', label: 'Exchange', hint: 'Use on a new bill now', key: 'F8', icon: <ArrowLeftRight size={16} /> },
];
const COLS = 'grid-cols-[36px_minmax(0,1fr)_84px_84px_104px_96px]';

const defaultMode = (b: Bill): RefundMode => {
  if (billHasCredit(b)) return 'credit_note';
  const m = b.payments[0]?.mode;
  return m === 'cash' ? 'cash' : m === 'upi' ? 'upi' : 'credit_note';
};

const RETURNS_KEYS: KeyRows = [
  ['Move between lines', ['Up', 'Down']],
  ['Tick a line', ['Space']],
  ['Quantity up or down', ['+', '-']],
  ['Edit the quantity', ['Enter']],
  ['Tick all', ['Ctrl+A']],
  ['Reason', ['F3']],
  ['Refund as cash / UPI', ['F5', 'F6']],
  ['Credit note / exchange', ['F7', 'F8']],
  ['Preview', ['F9']],
  ['Complete the return', ['F12']],
  ['Other bill, or back to billing', ['Esc']],
];

export function Returns() {
  useScreenKeys('Returns', RETURNS_KEYS);
  const nav = useNavigate();
  const toast = useToast();
  const loc = useLocation();
  const { user, settings } = useSession();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Bill[]>([]);
  const [hi, setHi] = useState(0);
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<{ i: number; draft: string } | null>(null);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<RefundMode>('cash');
  const [dialog, setDialog] = useState<Dlg>(null);
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [made, setMade] = useState<CreditNote | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);

  const bill = detail?.bill ?? null;
  const returnable = useCallback((i: number) => (detail ? detail.bill.lines[i].qty - detail.returned[i] : 0), [detail]);

  /* ---- load a bill ---- */
  const load = useCallback(async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    const d = await api.findBillForReturn(c);
    if (!d) { setError(`Bill not found: ${c}`); return; }
    if (d.bill.status === 'cancelled') { setError(`Bill ${d.bill.number} was cancelled. Nothing to return.`); return; }
    if (d.bill.lines.every((l, i) => d.returned[i] >= l.qty)) { setError(`Everything on ${d.bill.number} is already returned.`); return; }
    setError(null); setDetail(d); setPicks({}); setEditing(null); setReason(''); setMode(defaultMode(d.bill));
    setActive(Math.max(0, d.bill.lines.findIndex((l, i) => d.returned[i] < l.qty)));
    requestAnimationFrame(() => areaRef.current?.focus());
  }, []);

  const [focusTick, setFocusTick] = useState(0);
  useRefreshOnFocus(() => setFocusTick((t) => t + 1), { f5: false });
  useEffect(() => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    void api.listBillsOn({ date: key }).then((r) => setRecent(r.filter((b) => b.status !== 'cancelled').slice(0, 7)));
  }, [made, focusTick]);

  const prefill = (loc.state as { billNumber?: string } | null)?.billNumber;
  useEffect(() => { if (prefill) void load(prefill); }, [prefill, load]);
  useEffect(() => { if (!detail) requestAnimationFrame(() => codeRef.current?.focus()); }, [detail]);

  /* ---- picks ---- */
  const setQty = (i: number, qty: number) => {
    const max = returnable(i);
    const q = Math.max(0, Math.min(max, qty));
    setPicks((p) => { const n = { ...p }; if (q > 0) n[i] = q; else delete n[i]; return n; });
  };
  const toggle = (i: number) => { if (returnable(i) > 0) setQty(i, picks[i] ? 0 : returnable(i)); };
  const tickAll = () => {
    if (!detail) return;
    const all: Record<number, number> = {};
    detail.bill.lines.forEach((_, i) => { if (returnable(i) > 0) all[i] = returnable(i); });
    setPicks(Object.keys(picks).length === Object.keys(all).length ? {} : all);
  };
  const step = (i: number, dir: 1 | -1) => {
    const l = bill?.lines[i];
    if (!l) return;
    setQty(i, (picks[i] ?? 0) + dir * (isDecimalUnit(l.unit) ? 500 : 1000));
  };
  /* A scanned bill barcode finds the bill. With a bill open, a scanned item ticks one more unit of its line. */
  useScanHandler((raw) => {
    const c = raw.trim();
    if (!c || made || dialog || pinAsk || busy || editing) return;
    if (!bill) { setCode(c); void load(c); return; }
    void api.findItemByCode(c).then(async (item) => {
      const i = item ? bill.lines.findIndex((l, k) => l.itemId === item.id && returnable(k) > 0) : -1;
      if (item && i >= 0) { setActive(i); step(i, 1); return; }
      if (item) { toast.show({ tone: 'warning', title: `${item.name} has nothing left to return on this bill` }); return; }
      const other = await api.findBillForReturn(c);
      if (other) { void load(c); return; }
      beepError();
      toast.show({ tone: 'error', title: `Not found: ${c}`, detail: 'No item on this bill and no other bill has this code.' });
    });
  });
  const startEdit = (i: number) => {
    const l = bill?.lines[i];
    if (!l || returnable(i) <= 0) return;
    setActive(i);
    setEditing({ i, draft: formatQty(picks[i] ?? returnable(i), isDecimalUnit(l.unit)) });
  };
  const commitEdit = () => {
    if (!editing || !bill) return;
    const l = bill.lines[editing.i];
    const q = parseQty(editing.draft);
    if (q === null) toast.show({ tone: 'error', title: 'Enter a quantity' });
    else {
      const qty = isDecimalUnit(l.unit) ? q : Math.round(q / 1000) * 1000;
      if (qty > returnable(editing.i)) toast.show({ tone: 'warning', title: `Only ${formatQty(returnable(editing.i), isDecimalUnit(l.unit))} ${l.unit} can come back`, detail: 'That is what was sold, minus what was already returned.' });
      setQty(editing.i, qty);
    }
    setEditing(null);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  /* ---- quote (shared maths, never computed here) ---- */
  const quote = useMemo(() => {
    if (!bill) return null;
    const list = Object.entries(picks).map(([i, qty]) => ({ lineIndex: Number(i), qty }));
    return { list, ...quoteReturn(bill, list, settings?.roundToRupee ?? true, bill.supplyType === 'inter') };
  }, [bill, picks, settings]);
  const count = quote?.list.length ?? 0;
  const creditBlock = !!bill && billHasCredit(bill);
  const modeBlocked = (m: RefundMode) => creditBlock && (m === 'cash' || m === 'upi');
  const ready = count > 0 && !!reason && !busy;

  const chooseMode = (m: RefundMode) => {
    if (modeBlocked(m)) { toast.show({ tone: 'warning', title: 'This bill was on credit', detail: 'Refund it as a credit note or exchange.' }); return; }
    setMode(m);
  };

  /** Sends the return; the backend says when this role needs a manager's PIN (then the PIN box opens and we retry with it). */
  const sendReturn = useCallback(async (pin?: string): Promise<string | null> => {
    if (!bill || !quote) return 'No bill selected';
    try {
      const n = await api.createReturn({ billId: bill.id, picks: quote.list, reason, refundMode: mode, by: user?.name ?? '', managerPin: pin });
      setPinAsk(null); setMade(n); setDialog('done');
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Nothing was changed. Try again.';
      if (!pin && needsManagerPin(m)) { setPinAsk(m); return null; }
      return m;
    }
  }, [bill, quote, reason, mode, user]);

  const complete = useCallback(async () => {
    if (!bill || !quote) return;
    if (count === 0) { toast.show({ tone: 'info', title: 'Tick the items coming back', detail: 'Press Space on a row.' }); return; }
    if (!reason) { toast.show({ tone: 'info', title: 'Choose a reason', detail: 'Press F3.' }); reasonRef.current?.focus(); return; }
    if (busy) return;
    setBusy(true);
    try {
      const err = await sendReturn();
      if (err) toast.show({ tone: 'error', title: 'Return not saved', detail: err });
    } finally { setBusy(false); }
  }, [bill, quote, count, reason, busy, toast, sendReturn]);

  /* Close dialogs one tick late so the Esc/Enter that closed them is not also read by the screen keys. */
  const closeDialog = useCallback(() => { window.setTimeout(() => setDialog(null), 0); }, []);
  const reset = useCallback(() => {
    setDetail(null); setPicks({}); setCode(''); setError(null); setMade(null); closeDialog();
  }, [closeDialog]);

  const draftNote: CreditNote | null = bill && quote && count > 0 ? {
    id: 'draft', number: 'DRAFT', at: new Date().toISOString(), billId: bill.id, billNumber: bill.number,
    customerId: bill.customerId, customerName: bill.customerName, lines: quote.lines.map((l, i) => ({ ...l, tax: quote.taxes[i] })), totals: quote.totals,
    reason: reason || 'Not chosen yet', refundMode: mode, by: user?.name ?? '',
    billAt: bill.at, placeOfSupply: bill.placeOfSupply, supplyType: bill.supplyType, customerGstin: bill.customerGstin, customerAddress: bill.customerAddress,
  } : null;

  /* ---- keys ---- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (dialog || pinAsk) return;
    const el = e.target as HTMLElement;
    const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) { setEditing(null); requestAnimationFrame(() => areaRef.current?.focus()); }
      else if (detail && count > 0) setPicks({});
      else if (detail) reset();
      else nav('/billing');
      return;
    }
    if (!detail) return;
    switch (e.key) {
      case 'F2': e.preventDefault(); reset(); return;
      case 'F3': e.preventDefault(); reasonRef.current?.focus(); return;
      case 'F5': e.preventDefault(); chooseMode('cash'); return;
      case 'F6': e.preventDefault(); chooseMode('upi'); return;
      case 'F7': e.preventDefault(); chooseMode('credit_note'); return;
      case 'F8': e.preventDefault(); chooseMode('exchange'); return;
      case 'F9': e.preventDefault(); if (draftNote) setDialog('preview'); return;
      case 'F12': e.preventDefault(); void complete(); return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); tickAll(); return; }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); void complete(); return; }
    if (inField) return;
    const last = (bill?.lines.length ?? 1) - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case ' ': e.preventDefault(); toggle(active); break;
      case '+': case '=': e.preventDefault(); step(active, 1); break;
      case '-': e.preventDefault(); step(active, -1); break;
      case 'Enter': e.preventDefault(); startEdit(active); break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const keys: FKey[] = detail
    ? [
      { key: 'Esc', label: count ? 'Clear ticks' : 'Other bill', onClick: () => (count ? setPicks({}) : reset()) },
      { key: 'Space', label: 'Tick row', onClick: () => toggle(active) },
      { key: 'Ctrl+A', label: 'Tick all', onClick: tickAll },
      { key: 'F3', label: 'Reason', onClick: () => reasonRef.current?.focus() },
      { key: 'F5', label: 'Cash', onClick: () => chooseMode('cash'), disabled: modeBlocked('cash') },
      { key: 'F6', label: 'UPI', onClick: () => chooseMode('upi'), disabled: modeBlocked('upi') },
      { key: 'F7', label: 'Credit note', onClick: () => chooseMode('credit_note') },
      { key: 'F8', label: 'Exchange', onClick: () => chooseMode('exchange') },
      { key: 'F9', label: 'Preview', onClick: () => draftNote && setDialog('preview') },
      { key: 'F12', label: 'Complete', tone: 'primary', onClick: () => void complete() },
    ]
    : [{ key: 'Esc', label: 'Back to billing', onClick: () => nav('/billing') }];

  /* ---- step 1: find the bill ---- */
  const onCodeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, recent.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (code.trim()) void load(code);
      else if (recent[hi]) void load(recent[hi].number);
    }
  };

  const finish = () => {
    const n = made;
    if (n?.refundMode === 'exchange') {
      toast.show({ tone: 'success', title: `Credit ${formatRupees(n.totals.grand)} ready for the new bill`, detail: `${n.number} carries to the next bill.` });
      reset(); nav('/billing');
    } else {
      reset();
    }
  };

  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      {!detail || !bill || !quote ? (
        <div className="flex min-h-0 flex-1 flex-col bg-surface">
          <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line px-3">
            <div className="relative flex-1">
              <ScanBarcode size={20} className={cn('pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2', error ? 'text-danger' : 'text-primary')} />
              <input
                ref={codeRef} value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} onKeyDown={onCodeKey}
                autoComplete="off" spellCheck={false} aria-label="Scan bill barcode or type bill number"
                placeholder="Scan the bill barcode or type the bill number, then press Enter"
                className={cn('h-11 w-full rounded-xl border-2 bg-surface pl-11 pr-20 text-md text-ink placeholder:text-subtle', error ? 'border-danger' : 'border-primary/60 focus:border-primary focus:ring-4 focus:ring-primary/15')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-subtle"><Kbd>Enter</Kbd> find</span>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 border-b border-danger/20 bg-danger-soft px-4 py-2 text-sm font-medium text-danger"><TriangleAlert size={15} />{error}</div>
          )}
          <div className="mx-auto w-full max-w-[720px] min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
            <div className="flex flex-col items-center gap-1.5 pb-2 pt-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-muted"><CornerUpLeft size={22} /></span>
              <div className="text-md font-semibold text-ink">Return or exchange</div>
              <p className="max-w-[460px] text-sm text-muted">Find the bill the customer brought. You choose which items come back and how to refund, and the credit note is made for you.</p>
            </div>
            <div className="mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              <span>Recent bills today</span><span className="flex items-center gap-1 normal-case tracking-normal"><Kbd>Up</Kbd><Kbd>Down</Kbd> pick, <Kbd>Enter</Kbd> open</span>
            </div>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {recent.map((b, i) => (
                <li
                  key={b.id} onMouseMove={() => setHi(i)} onClick={() => void load(b.number)}
                  className={cn('flex h-12 cursor-default items-center gap-3 px-4', i === hi && !code.trim() ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  <span className="num w-[110px] text-sm font-semibold text-ink">{b.number}</span>
                  <span className="num w-20 text-xs text-muted">{timeOf(b.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{b.customerName}</span>
                  <span className="text-xs font-medium text-muted">{payLabel(b)}</span>
                  <Money paise={b.totals.grand} className="w-24 text-right text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* ---------- left: original bill and lines ---------- */}
          <div ref={areaRef} tabIndex={0} className="flex min-w-0 flex-1 flex-col bg-surface outline-none">
            <div className="flex items-center gap-4 border-b border-line px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Original bill</span>
                  <span className="num text-lg font-bold text-ink">{bill.number}</span>
                  <StatusBadge bill={bill} detail={detail} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                  <span>{dateTimeOf(bill.at)}</span><span className="font-medium text-ink">{bill.customerName}</span>
                  <span>Paid by {[...new Set(bill.payments.map((p) => modeLabel[p.mode]))].join(' + ')}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bill total</div>
                <Money paise={bill.totals.grand} className="text-xl font-bold text-ink" />
              </div>
              <Button onClick={reset} kbd="F2">Other bill</Button>
            </div>
            {creditBlock && (
              <div className="flex items-center gap-2 border-b border-warning/20 bg-warning-soft px-5 py-2 text-sm text-warning">
                <TriangleAlert size={15} /> This bill was on credit, so the refund can only be a credit note or an exchange.
              </div>
            )}

            <div className={`grid ${COLS} h-8 shrink-0 items-center gap-x-3 border-b border-line bg-table-head px-5 text-[11px] font-semibold uppercase tracking-wider text-table-head-ink`}>
              <span /><span>Item</span><span className="text-right">Sold</span><span className="text-right">Returned</span><span className="text-right">Return now</span><span className="text-right">Refund</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {bill.lines.map((l, i) => {
                const dec = isDecimalUnit(l.unit);
                const max = returnable(i);
                const q = picks[i] ?? 0;
                const ticked = q > 0;
                const done = max <= 0;
                const refund = ticked ? Math.round((l.amount * q) / l.qty) : 0;
                return (
                  <div
                    key={i} onClick={() => { setActive(i); toggle(i); areaRef.current?.focus(); }}
                    ref={(el) => { if (el && i === active) el.scrollIntoView({ block: 'nearest' }); }}
                    className={cn(
                      `relative grid ${COLS} h-[52px] cursor-default items-center gap-x-3 border-b border-line/70 px-5`,
                      done && 'opacity-50', ticked ? 'bg-primary-soft/60' : i === active && 'bg-surface-3',
                    )}
                  >
                    {i === active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-[6px] border', ticked ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong bg-surface')}>
                      {ticked && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-medium text-ink">{l.name}</span>
                      <span className="num text-xs text-subtle">@ {(l.rate / 100).toFixed(2)} - GST {l.gstRate}%</span>
                    </span>
                    <span className="num text-right text-base text-ink">{formatQty(l.qty, dec)} <span className="text-xs text-subtle">{l.unit}</span></span>
                    <span className={cn('num text-right text-sm', detail.returned[i] > 0 ? 'font-semibold text-warning' : 'text-subtle')}>{detail.returned[i] > 0 ? formatQty(detail.returned[i], dec) : '-'}</span>
                    <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {done ? <Badge tone="warning">All returned</Badge>
                        : editing?.i === i ? (
                          <input
                            autoFocus value={editing.draft} onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setEditing({ i, draft: e.target.value.replace(/[^\d.]/g, '') })}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitEdit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); areaRef.current?.focus(); } }}
                            onBlur={() => editing && commitEdit()}
                            aria-label={`Return quantity for ${l.name}`}
                            className="num h-8 w-[92px] rounded-control border-2 border-primary bg-surface px-2 text-right text-base font-semibold text-ink focus:ring-2 focus:ring-primary/25"
                          />
                        ) : (
                          <button
                            tabIndex={-1} onClick={() => startEdit(i)}
                            className={cn('num h-8 w-[92px] rounded-control border px-2 text-right text-base font-semibold', ticked ? 'border-primary/50 bg-surface text-primary' : 'border-line bg-surface-2 text-subtle hover:border-line-strong')}
                          >
                            {ticked ? formatQty(q, dec) : formatQty(0, dec)}
                          </button>
                        )}
                    </span>
                    <span className="text-right">{ticked ? <Money paise={refund} className="text-base font-semibold text-ink" /> : <span className="text-subtle">-</span>}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center gap-4 border-t border-line bg-surface-2 px-5 py-2 text-xs text-muted">
              <span className="flex items-center gap-1"><Kbd>Up</Kbd><Kbd>Down</Kbd> move</span>
              <span className="flex items-center gap-1"><Kbd>Space</Kbd> tick</span>
              <span className="flex items-center gap-1"><Kbd>+</Kbd><Kbd>-</Kbd> quantity</span>
              <span className="flex items-center gap-1"><Kbd>Enter</Kbd> type quantity</span>
              <span className="ml-auto">Cannot return more than sold minus already returned.</span>
            </div>
          </div>

          {/* ---------- right: reason, refund, totals ---------- */}
          <aside className="flex w-[clamp(340px,27vw,420px)] shrink-0 flex-col border-l border-line bg-surface">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted"><span>Reason</span><Kbd>F3</Kbd></div>
                <div className="relative">
                  <select
                    ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); areaRef.current?.focus(); } }}
                    className={cn('h-10 w-full appearance-none rounded-control border bg-surface px-3 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/25', reason ? 'border-line-strong text-ink' : 'border-warning/50 text-subtle')}
                    aria-label="Return reason"
                  >
                    <option value="">Choose a reason...</option>
                    {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Give back as</div>
                <div className="grid grid-cols-2 gap-2">
                  {MODES.map((m) => {
                    const on = mode === m.id;
                    const off = modeBlocked(m.id);
                    return (
                      <button
                        key={m.id} tabIndex={-1} onClick={() => chooseMode(m.id)}
                        className={cn(
                          'flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-left transition-colors',
                          on ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong hover:bg-surface-2', off && 'opacity-40',
                        )}
                      >
                        <span className="flex w-full items-center gap-1.5 text-sm font-semibold text-ink">
                          <span className={on ? 'text-primary' : 'text-muted'}>{m.icon}</span>{m.label}<Kbd className="ml-auto">{m.key}</Kbd>
                        </span>
                        <span className="text-xs text-muted">{m.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-line">
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <span>GST reversal</span><span>{count} {count === 1 ? 'item' : 'items'} returning</span>
                </div>
                {count === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-subtle">Tick the items coming back to see the refund.</div>
                ) : (
                  <div className="space-y-1 p-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted">Value returned</span><Money paise={quote.totals.gross} /></div>
                    {quote.totals.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount given back</span><Money paise={-quote.totals.discount} /></div>}
                    <div className="flex justify-between"><span className="text-muted">Taxable value</span><Money paise={quote.totals.taxable} /></div>
                    {quote.totals.slabs.filter((s) => s.rate > 0).map((s) => (
                      <div key={s.rate} className="flex justify-between text-muted">
                        <span>CGST {s.rate / 2}% + SGST {s.rate / 2}%</span><Money paise={s.cgst + s.sgst} />
                      </div>
                    ))}
                    {quote.totals.roundOff !== 0 && <div className="flex justify-between text-muted"><span>Round off</span><Money paise={quote.totals.roundOff} sign /></div>}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 space-y-2.5 border-t border-line p-4">
              <div className="rounded-xl bg-chrome px-4 py-3 text-chrome-ink">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-chrome-muted">
                  <span>Refund total</span><span>{MODES.find((m) => m.id === mode)?.label}</span>
                </div>
                <Money paise={count ? quote.totals.grand : 0} className="block text-right text-3xl font-bold text-white" softPaise />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" icon={<FileText size={15} />} disabled={!draftNote} onClick={() => setDialog('preview')} kbd="F9">Preview note</Button>
                <Button className="flex-[1.3]" variant="primary" size="md" disabled={busy} onClick={() => void complete()} kbd="F12">
                  {mode === 'exchange' ? 'Complete + exchange' : 'Complete return'}
                </Button>
              </div>
              {!ready && <div className="text-center text-xs text-subtle">{count === 0 ? 'Tick at least one item.' : !reason ? 'Choose a reason to continue.' : ''}</div>}
            </div>
          </aside>
        </div>
      )}

      {settings && (
        <>
          <CreditNoteDialog
            open={dialog === 'preview'} note={draftNote} settings={settings} onClose={closeDialog}
            onPrint={() => toast.show({ tone: 'info', title: 'This is a preview', detail: 'Complete the return to print the credit note.' })}
            primary={{ label: 'Complete return', onClick: () => void complete() }}
          />
          <CreditNoteDialog
            open={dialog === 'done'} note={made} settings={settings} onClose={finish}
            onPrint={() => { if (made) void printWithToast('creditNote', made.id, {}, toast, `Printed ${made.number}`); }}
            onPrintA4={() => { if (made) void printWithToast('creditNote', made.id, { format: 'a4' }, toast, `Printed ${made.number} on A4`); }}
            primary={{ label: made?.refundMode === 'exchange' ? 'New bill with credit' : 'Done', onClick: finish }}
          />
        </>
      )}

      <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval for the refund" message={pinAsk ?? ''} confirmLabel="Approve refund"
        onClose={() => setPinAsk(null)} onSubmit={sendReturn} onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
    </PosLayout>
  );
}
