import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanBarcode } from 'lucide-react';
import {
  computeTotals, formatQty, formatRupees, lineGross, parsePaise, parseQty,
  type BillLine, type CreditNote, type Customer, type HeldBill, type Item, type Payment,
} from '@gokul/data';
import { Kbd, ManagerPinDialog, PosLayout, cn, useToast, type FKey } from '@gokul/ui';
import { needsManagerPin } from '@gokul/data';
import { api, useBilling, useSession } from '../store';
import { plural } from '../plural';
import { TopBar } from '../components/TopBar';
import { BillGrid, type EditField, type EditState } from '../components/BillGrid';
import { SummaryPanel } from '../components/SummaryPanel';
import { ConfirmDialog, CustomerDialog, HeldDialog, HelpDialog, ItemSearchDialog, PromptDialog } from '../components/Dialogs';
import { PaymentDialog } from '../components/PaymentDialog';
import { ScanSuggest, SUGGEST_MAX } from '../components/ScanSuggest';

type DialogName = null | 'search' | 'customer' | 'pay' | 'help' | 'held' | 'cancel' | 'billDisc' | 'dropEx';
const FIELD_ORDER: EditField[] = ['qty', 'rate', 'disc'];

export function Billing() {
  const nav = useNavigate();
  const toast = useToast();
  const { user, settings, setHeldCount } = useSession();
  const B = useBilling();
  const { lines, selected, customer, billDiscount } = B;

  const [items, setItems] = useState<Item[]>([]);
  const [scan, setScan] = useState('');
  const [scanError, setScanError] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [searchSeed, setSearchSeed] = useState('');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastBill, setLastBill] = useState<{ number: string; total: number } | null>(null);
  const [lastItem, setLastItem] = useState<Item | null>(null);
  const [billNo, setBillNo] = useState('');
  const [exchange, setExchange] = useState<CreditNote | null>(null);
  const [sugg, setSugg] = useState<Item[]>([]);
  const [hi, setHi] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [pinAsk, setPinAsk] = useState<{ message: string; payments: Payment[]; change: number } | null>(null);
  const removed = useRef<{ line: BillLine; at: number } | null>(null);

  const itemMap = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) { m.set(i.code, i); m.set(i.barcode, i); }
    return m;
  }, [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isLoose = useCallback((l: BillLine) => byId.get(l.itemId)?.loose ?? false, [byId]);

  const totals = useMemo(() => computeTotals(lines, billDiscount, settings?.roundToRupee ?? true), [lines, billDiscount, settings]);
  /* Exchange credit pays part of the bill like a payment (GST on the bill stays as is). */
  const exchangeUsed = exchange ? Math.min(exchange.totals.grand, totals.grand) : 0;
  const due = totals.grand - exchangeUsed;

  useEffect(() => { api.listItems().then(setItems); }, []);
  useEffect(() => { api.getPendingExchange().then(setExchange); }, []);
  useEffect(() => { api.peekNextBillNumber().then(setBillNo); }, [lastBill]);

  /* Right-panel extras: last scanned item (with stock left after this bill) and savings against MRP. */
  const lastScanned = useMemo(() => {
    if (!lastItem) return null;
    const fresh = byId.get(lastItem.id) ?? lastItem;
    const onBill = lines.filter((l) => l.itemId === fresh.id).reduce((s, l) => s + l.qty, 0);
    return { item: fresh, onBill, left: fresh.stock - onBill };
  }, [lastItem, byId, lines]);
  const savings = useMemo(() => lines.reduce((s, l) => {
    const mrp = byId.get(l.itemId)?.mrp ?? 0;
    return s + Math.max(0, lineGross(mrp, l.qty) - lineGross(l.rate, l.qty) + l.discount);
  }, 0) + billDiscount, [lines, byId, billDiscount]);

  /* Focus: the scan box owns the keyboard unless a dialog or cell editor is open. */
  const focusScan = useCallback(() => requestAnimationFrame(() => scanRef.current?.focus()), []);
  useEffect(() => { if (!dialog && !edit && !pinAsk) focusScan(); }, [dialog, edit, pinAsk, focusScan]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dialog || edit) return;
      const t = e.target as HTMLElement;
      if (!t.closest('input,textarea')) focusScan();
    };
    document.addEventListener('mouseup', h);
    return () => document.removeEventListener('mouseup', h);
  }, [dialog, edit, focusScan]);

  /* Type-ahead: letters (or a short code) in the scan box list matching items. Long digit strings are barcodes and never open it. */
  const scanQ = useMemo(() => {
    const m = scan.trim().match(/^(\d+(?:\.\d{1,3})?)\*(.*)$/);
    return { text: (m ? m[2] : scan).trim(), qty: m ? parseQty(m[1]) ?? undefined : undefined };
  }, [scan]);
  const digits = /^\d+$/.test(scanQ.text);
  const wantSugg = scanQ.text.length > 0 && !(digits && (scanQ.text.length > 4 || itemMap.has(scanQ.text)));
  useEffect(() => {
    if (!wantSugg) { setSugg([]); return; }
    let live = true;
    api.searchItems(scanQ.text, 40).then((r) => {
      if (!live) return;
      const t = scanQ.text.toLowerCase();
      setSugg((digits ? r.filter((i) => i.code.startsWith(t) || i.barcode.startsWith(t)) : r).slice(0, SUGGEST_MAX));
      setHi(0);
    });
    return () => { live = false; };
  }, [wantSugg, scanQ.text, digits]);
  const suggestOpen = wantSugg && !dismissed && !dialog && !edit && (sugg.length > 0 || !digits);
  const stockLeft = useCallback((i: Item) => i.stock - lines.filter((l) => l.itemId === i.id).reduce((s, l) => s + l.qty, 0), [lines]);

  const flashError = () => { setScanError(true); window.setTimeout(() => setScanError(false), 500); };

  /* ---------- editing ---------- */
  const startEdit = useCallback((field: EditField, i = useBilling.getState().selected, draft?: string) => {
    const l = useBilling.getState().lines[i];
    if (!l) return;
    B.select(i);
    const init = field === 'qty' ? formatQty(l.qty, byId.get(l.itemId)?.loose ?? false) : field === 'rate' ? (l.rate / 100).toFixed(2) : l.discount ? (l.discount / 100).toFixed(2) : '';
    setEditNow({ i, field, draft: draft ?? init });
  }, [B, byId]);

  const editRef = useRef<EditState | null>(null);
  editRef.current = edit;
  const setEditNow = (v: EditState | null) => { editRef.current = v; setEdit(v); };

  const commitEdit = useCallback((tab: boolean) => {
    const cur = editRef.current;
    if (!cur) return;
    const st = useBilling.getState();
    const l = st.lines[cur.i];
    if (!l) { editRef.current = null; setEdit(null); return; }
    const d = cur.draft.trim();
    if (cur.field === 'qty') {
      const q = parseQty(d);
      if (d !== '' && q !== null && q > 0) {
        const loose = byId.get(l.itemId)?.loose ?? false;
        st.setQty(cur.i, loose ? q : Math.max(1000, Math.round(q / 1000) * 1000));
      } else if (d !== '') toast.show({ tone: 'error', title: 'Enter a quantity above zero' });
    } else if (cur.field === 'rate') {
      const r = parsePaise(d);
      if (d !== '' && r !== null && r > 0) st.setRate(cur.i, r);
      else if (d !== '') toast.show({ tone: 'error', title: 'Enter a valid rate' });
    } else if (d === '') {
      st.setDiscount(cur.i, 0);
    } else if (d.endsWith('%')) {
      const pct = Number(d.slice(0, -1));
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) st.setDiscount(cur.i, Math.round((lineGross(l.rate, l.qty) * pct) / 100));
      else toast.show({ tone: 'error', title: 'Discount must be between 0% and 100%' });
    } else {
      const v = parsePaise(d);
      if (v !== null) st.setDiscount(cur.i, v);
    }
    if (tab) {
      const next = FIELD_ORDER[(FIELD_ORDER.indexOf(cur.field) + 1) % FIELD_ORDER.length];
      const nl = useBilling.getState().lines[cur.i];
      const init = next === 'qty' ? formatQty(nl.qty, byId.get(nl.itemId)?.loose ?? false) : next === 'rate' ? (nl.rate / 100).toFixed(2) : nl.discount ? (nl.discount / 100).toFixed(2) : '';
      setEditNow({ i: cur.i, field: next, draft: init });
    } else { setEditNow(null); scanRef.current?.focus(); }
  }, [byId, toast]);

  /* ---------- adding items ---------- */
  const addItem = useCallback((item: Item, qty?: number) => {
    const idx = B.addItem(item, qty ?? 1000);
    setLastItem(item);
    if (item.stock <= 0) toast.show({ tone: 'warning', title: `${item.name} shows no stock`, detail: 'Billing allowed. Check the shelf.' });
    if (item.loose && qty === undefined) startEdit('qty', idx, '');
  }, [B, startEdit, toast]);

  const submitScan = () => {
    let text = scan.trim();
    let qty: number | undefined;
    const m = text.match(/^(\d+(?:\.\d{1,3})?)\*(.+)$/);
    if (m) { qty = parseQty(m[1]) ?? undefined; text = m[2]; }
    if (!text) { if (selected >= 0) startEdit('qty'); return; }
    const item = itemMap.get(text);
    if (item) { addItem(item, qty); setScan(''); return; }
    if (suggestOpen && sugg[hi]) { addItem(sugg[hi], qty); setScan(''); return; }
    if (/^\d+$/.test(text)) {
      // Not in the list loaded at start: another barcode of an item, or an item Office created meanwhile. Ask the database.
      const notFound = () => {
        toast.show({ tone: 'error', title: `Item not found: ${text}`, detail: 'Check the code or press F2 to search by name.' });
        flashError();
        scanRef.current?.select();
      };
      api.findItemByCode(text).then((found) => {
        if (!found) { notFound(); return; }
        setItems((cur) => (cur.some((i) => i.id === found.id) ? cur : [...cur, found]));
        addItem(found, qty);
        setScan('');
      }, notFound);
    } else {
      setSearchSeed(text); setScan(''); setDialog('search');
    }
  };

  /* ---------- actions ---------- */
  const doHold = async () => {
    if (!lines.length) { toast.show({ tone: 'info', title: 'Nothing to hold', detail: 'Add items to the bill first.' }); return; }
    const h = await api.holdBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: [] });
    B.clear();
    setHeldCount((await api.listHeld()).length);
    toast.show({ tone: 'success', title: 'Bill held', detail: `${plural(h.lines.length, 'item')}, ${formatRupees(h.total, { decimals: false })}. Press F7 to bring it back.` });
  };
  const openHeld = async () => {
    const list = await api.listHeld();
    if (!list.length) { toast.show({ tone: 'info', title: 'No held bills' }); return; }
    setHeld(list); setDialog('held');
  };
  const recall = async (h: HeldBill) => {
    if (lines.length) await api.holdBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: [] });
    await api.recallHeld(h.id);
    const cust = h.customerId ? (await api.listCustomers()).find((c) => c.id === h.customerId) ?? null : null;
    B.load(h, cust);
    setHeldCount((await api.listHeld()).length);
    setDialog(null);
    toast.show({ tone: 'success', title: 'Held bill restored' });
  };
  const openPay = () => {
    if (!lines.length) { toast.show({ tone: 'info', title: 'Add items before payment' }); return; }
    if (exchange && totals.grand < exchange.totals.grand) {
      toast.show({ tone: 'warning', title: 'Exchange credit is more than this bill', detail: `Add items worth ${formatRupees(exchange.totals.grand - totals.grand, { decimals: false })} more to use all of ${exchange.number}.` });
      return;
    }
    setEditNow(null); setDialog('pay');
  };
  /** What the backend wants approved (discount over the limit, changed price, credit over limit): ask for the PIN, then save again. */
  const complete = async (payments: Payment[], change: number, pin?: string): Promise<string | null> => {
    setSaving(true);
    try {
      const all: Payment[] = exchange && exchangeUsed > 0
        ? [{ mode: 'credit_note' as const, amount: exchangeUsed, ref: exchange.number }, ...payments]
        : payments;
      const bill = await api.saveBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: all, cashier: user?.name, managerPin: pin });
      if (exchange) { await api.clearPendingExchange(); setExchange(null); }
      B.clear();
      setLastBill({ number: bill.number, total: bill.totals.grand });
      setPinAsk(null);
      setDialog(null);
      toast.show({
        tone: 'success', title: `Bill ${bill.number} saved`,
        detail: change > 0 ? `Give change ${formatRupees(change)}` : payments.map((p) => p.mode.toUpperCase()).join(' + ') + ' received',
      });
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (!pin && needsManagerPin(m)) { setPinAsk({ message: m, payments, change }); setDialog(null); return null; }
      if (pin) return m || 'Could not save the bill';
      toast.show({ tone: 'error', title: 'Could not save the bill', detail: m && !/database|disk|went wrong/i.test(m) ? m : 'Nothing was lost. Try Enter again.' });
      return null;
    } finally {
      setSaving(false);
    }
  };
  const removeSelected = () => {
    const st = useBilling.getState();
    const l = st.lines[st.selected];
    if (!l) return;
    removed.current = { line: l, at: st.selected };
    st.remove(st.selected);
    toast.show({ tone: 'info', title: `Removed ${l.name}`, detail: 'Press Ctrl+Z to undo.' });
  };
  const lock = () => nav('/lock');

  /* ---------- global keys (latest closure via ref) ---------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (e.key === 'Escape' && e.defaultPrevented) return; // a dialog already used Esc to close itself
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); return; }
    if (dialog || edit || saving || pinAsk) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); nav('/day-close'); return; }
    const prevent = () => e.preventDefault();
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      prevent();
      const r = removed.current;
      if (r) { B.insert(r.line, r.at); removed.current = null; toast.show({ tone: 'success', title: `Restored ${r.line.name}` }); }
      return;
    }
    switch (e.key) {
      case 'F1': prevent(); setDialog('help'); break;
      case 'F2': prevent(); setSearchSeed(scanQ.text); setScan(''); setDialog('search'); break;
      case 'F3': prevent(); setDialog('customer'); break;
      case 'F4': prevent(); if (selected >= 0) startEdit('qty'); break;
      case 'F5': prevent(); if (e.shiftKey) setDialog('billDisc'); else if (selected >= 0) startEdit('disc'); break;
      case 'F6': prevent(); void doHold(); break;
      case 'F7': prevent(); void openHeld(); break;
      case 'F8': prevent(); nav('/history'); break;
      case 'F9': prevent(); nav('/cash'); break;
      case 'F10': prevent(); nav('/returns'); break;
      case 'Delete': if (e.ctrlKey && exchange) { prevent(); setDialog('dropEx'); } else if (!scan) { prevent(); removeSelected(); } break;
      case 'F12': case 'End': prevent(); openPay(); break;
      case 'ArrowDown': prevent(); B.select(selected + 1); break;
      case 'ArrowUp': prevent(); B.select(selected - 1); break;
      case '+': case '=': if (selected >= 0 && !scan) { prevent(); const l = lines[selected]; B.setQty(selected, l.qty + 1000); } break;
      case '-': if (selected >= 0 && !scan) { prevent(); const l = lines[selected]; if (l.qty > 1000) B.setQty(selected, l.qty - 1000); } break;
      case 'Escape':
        prevent();
        if (suggestOpen) setDismissed(true);
        else if (scan) setScan('');
        else if (lines.length) setDialog('cancel');
        break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pickCustomer = (c: Customer | null) => { B.setCustomer(c); setDialog(null); };

  const keys: FKey[] = [
    { key: 'F1', label: 'Help', onClick: () => setDialog('help') },
    { key: 'F2', label: 'Search', onClick: () => { setSearchSeed(''); setDialog('search'); } },
    { key: 'F3', label: 'Customer', onClick: () => setDialog('customer') },
    { key: 'F4', label: 'Qty', onClick: () => selected >= 0 && startEdit('qty') },
    { key: 'F5', label: 'Discount', onClick: () => selected >= 0 && startEdit('disc') },
    { key: 'F6', label: 'Hold', onClick: () => void doHold() },
    { key: 'F7', label: 'Recall', onClick: () => void openHeld() },
    { key: 'F8', label: 'History', onClick: () => nav('/history') },
    { key: 'F9', label: 'Cash', onClick: () => nav('/cash') },
    { key: 'F10', label: 'Return', onClick: () => nav('/returns') },
    { key: 'F12', label: 'Pay', tone: 'primary', onClick: openPay },
    { key: 'Esc', label: 'Clear', onClick: () => (scan ? setScan('') : lines.length && setDialog('cancel')) },
  ];

  return (
    <PosLayout
      topBar={<TopBar onHeld={() => void openHeld()} onLock={lock} onCloseDay={() => nav('/day-close')} />}
      keys={keys}
      side={<SummaryPanel totals={totals} customer={customer} onCustomer={() => setDialog('customer')} onPay={openPay} lastBill={lastBill} exchange={exchange} due={due} billNo={billNo} last={lastScanned} savings={savings} />}
    >
      {/* Scan bar */}
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <div className="relative flex-1">
          <ScanBarcode size={20} className={cn('pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2', scanError ? 'text-danger' : 'text-primary')} />
          <input
            ref={scanRef} value={scan} autoComplete="off" spellCheck={false} aria-label="Scan barcode or type item code"
            onChange={(e) => { setScan(e.target.value); setDismissed(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitScan(); }
              else if (e.key === 'Tab' && scanQ.text) { e.preventDefault(); setSearchSeed(scanQ.text); setScan(''); setDialog('search'); }
              else if (suggestOpen && sugg.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault(); e.stopPropagation();
                setHi((h) => Math.max(0, Math.min(sugg.length - 1, h + (e.key === 'ArrowDown' ? 1 : -1))));
              }
            }}
            placeholder="Scan barcode or type item code, then press Enter"
            className={cn(
              'num h-11 w-full rounded-xl border bg-surface-2 pl-11 pr-28 text-lg font-medium text-ink placeholder:text-base placeholder:font-normal placeholder:text-subtle',
              'transition-colors focus:bg-surface focus:ring-4',
              scanError ? 'animate-[shake_0.35s] border-danger focus:border-danger focus:ring-danger/20' : 'border-line-strong focus:border-primary focus:ring-primary/20',
            )}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-subtle"><Kbd>Enter</Kbd> add</span>
          {suggestOpen && (
            <ScanSuggest
              list={sugg} hi={hi} q={scanQ.text} qty={scanQ.qty} left={stockLeft} onHover={setHi}
              onPick={(it) => { addItem(it, scanQ.qty); setScan(''); scanRef.current?.focus(); }}
            />
          )}
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted min-[1500px]:flex">
          <span className="flex items-center gap-1.5"><Kbd>5*101</Kbd> qty x code</span>
          <span className="flex items-center gap-1.5"><Kbd>+</Kbd><Kbd>-</Kbd> qty</span>
          <span className="flex items-center gap-1.5"><Kbd>Del</Kbd> remove</span>
        </div>
      </div>

      <BillGrid
        lines={lines} selected={selected} edit={edit} loose={isLoose}
        onSelect={B.select}
        onDraft={(v) => editRef.current && setEditNow({ ...editRef.current, draft: v })}
        onCommit={commitEdit}
        onCancel={() => { setEditNow(null); scanRef.current?.focus(); }}
        onReject={(m) => toast.show({ tone: 'error', title: 'Numbers only here', detail: m })}
      />

      <ItemSearchDialog open={dialog === 'search'} seed={searchSeed} onClose={() => setDialog(null)} onPick={(it) => { setDialog(null); addItem(it); }} />
      <CustomerDialog open={dialog === 'customer'} current={customer} onClose={() => setDialog(null)} onPick={pickCustomer} />
      <HeldDialog open={dialog === 'held'} held={held} onClose={() => setDialog(null)} onPick={(h) => void recall(h)} />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
      <PaymentDialog open={dialog === 'pay'} total={due} customer={customer} busy={saving} onClose={() => setDialog(null)} onComplete={(p, c) => void complete(p, c)} />
      <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval" message={pinAsk?.message ?? ''} confirmLabel="Approve and save"
        onClose={() => { setPinAsk(null); setDialog('pay'); }}
        onSubmit={(pin) => (pinAsk ? complete(pinAsk.payments, pinAsk.change, pin) : Promise.resolve(null))}
        onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
      <ConfirmDialog
        open={dialog === 'cancel'} danger title="Cancel this bill?" confirmLabel="Cancel bill"
        message={`${plural(lines.length, 'item')} worth ${formatRupees(totals.grand, { decimals: false })} will be cleared. Use F6 instead to hold it for later.`}
        onClose={() => setDialog(null)} onConfirm={() => { B.clear(); setDialog(null); toast.show({ tone: 'info', title: 'Bill cancelled' }); }}
      />
      <ConfirmDialog
        open={dialog === 'dropEx'} danger title="Remove exchange credit?" confirmLabel="Remove credit"
        message={exchange ? `${exchange.number} (${formatRupees(exchange.totals.grand, { decimals: false })}) will no longer be used on this bill. Do this only if the customer does not want to use it now.` : ''}
        onClose={() => setDialog(null)} onConfirm={() => { void api.clearPendingExchange(); setExchange(null); setDialog(null); toast.show({ tone: 'info', title: 'Exchange credit removed' }); }}
      />
      <PromptDialog
        open={dialog === 'billDisc'} title="Discount on whole bill" label="Discount amount or percent" hint="Type 50 for 50 rupees off, or 5% for five percent off."
        initial={billDiscount ? (billDiscount / 100).toFixed(2) : ''}
        onClose={() => setDialog(null)}
        onSubmit={(v) => {
          const net = lines.reduce((s, l) => s + l.amount, 0);
          const d = v.trim();
          if (d === '') B.setBillDiscount(0);
          else if (d.endsWith('%')) B.setBillDiscount(Math.round((net * Number(d.slice(0, -1))) / 100));
          else B.setBillDiscount(parsePaise(d) ?? 0);
          setDialog(null);
        }}
      />
    </PosLayout>
  );
}
