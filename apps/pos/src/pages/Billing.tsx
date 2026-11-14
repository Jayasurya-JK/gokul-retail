import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanBarcode, XCircle } from 'lucide-react';
import {
  cashDiscount, computeTotalsWithDelivery, formatQty, formatRupees, lineGross, parsePaise, parseQty,
  type BillLine, type CreditNote, type Customer, type CustomerWallet, type HeldBill, type Item, type Payment,
} from '@gokul/data';
import { Kbd, ManagerPinDialog, PosLayout, cn, useRefreshOnFocus, useToast, type FKey } from '@gokul/ui';
import { needsManagerPin } from '@gokul/data';
import { api, billingStores, refreshTodaySales, SLOT_LABEL, useSession, type BillSlot, type Delivery } from '../store';
import { plural } from '../plural';
import { TopBar } from '../components/TopBar';
import { BillToolbar } from '../components/BillToolbar';
import { DeliveryDialog, ManualItemDialog, RecentBillsDialog, StaffDialog } from '../components/BillDialogs';
import { BillGrid, type EditField, type EditState } from '../components/BillGrid';
import { SummaryPanel } from '../components/SummaryPanel';
import { ConfirmDialog, CustomerDialog, HeldDialog, ItemSearchDialog, PromptDialog } from '../components/Dialogs';
import { PaymentDialog } from '../components/PaymentDialog';
import { printBillAfterSave, printWithToast } from '../printing';
import { ScanSuggest, SUGGEST_MAX } from '../components/ScanSuggest';
import { beepError, useScanHandler } from '../scanner';

type DialogName = null | 'search' | 'customer' | 'pay' | 'held' | 'cancel' | 'billDisc' | 'dropEx' | 'delivery' | 'staff' | 'recent' | 'manual';
const FIELD_ORDER: EditField[] = ['qty', 'rate', 'disc'];

export function Billing({ slot = 'pos' }: { slot?: BillSlot }) {
  const nav = useNavigate();
  const toast = useToast();
  const { user, settings, heldCount, setHeldCount } = useSession();
  /* Point of Sale and POS 1 are two separate bills: this screen shows the one for its tab, the other keeps its state. */
  const useBilling = billingStores[slot];
  const B = useBilling();
  const { lines, selected, customer, billDiscount, staff, delivery, wholesale, cashDiscBps } = B;

  const [items, setItems] = useState<Item[]>([]);
  const [scan, setScan] = useState('');
  const [scanError, setScanError] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [searchSeed, setSearchSeed] = useState('');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastBill, setLastBill] = useState<{ number: string; total: number } | null>(null);
  const lastBillId = useRef<string | null>(null);
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const customerId = customer?.id;
  const [billNo, setBillNo] = useState('');
  const [exchange, setExchange] = useState<CreditNote | null>(null);
  const [sugg, setSugg] = useState<Item[]>([]);
  const [hi, setHi] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [pinAsk, setPinAsk] = useState<{ message: string; payments: Payment[]; change: number; refund?: 'cash' | 'upi' } | null>(null);
  /** Ctrl+K asks the summary panel to put the cursor in the inline cash-discount box. */
  const [cashFocus, setCashFocus] = useState(0);
  /** Store credit (wallet / credit notes) put on this bill, in paise. A different customer never keeps it. */
  const [storeCredit, setStoreCredit] = useState(0);
  const [storeFocus, setStoreFocus] = useState(0);
  const removed = useRef<{ line: BillLine; at: number } | null>(null);

  const itemMap = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) { m.set(i.code, i); m.set(i.barcode, i); }
    return m;
  }, [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isLoose = useCallback((l: BillLine) => byId.get(l.itemId)?.loose ?? false, [byId]);

  const deliveryGst = settings?.deliveryGstRate ?? 0;
  const cashDisc = useMemo(() => cashDiscount(lines, cashDiscBps), [lines, cashDiscBps]);
  const totals = useMemo(
    () => computeTotalsWithDelivery(lines, billDiscount + cashDisc, settings?.roundToRupee ?? true, delivery.charge, deliveryGst),
    [lines, billDiscount, cashDisc, settings, delivery.charge, deliveryGst],
  );
  /** What goes to the backend next to the lines */
  const extras = () => ({
    staff: staff || undefined, deliveryAddress: delivery.address || undefined, deliveryLocality: delivery.locality || undefined,
    deliveryCharge: delivery.charge || undefined, wholesale: wholesale || undefined, cashDiscBps: cashDiscBps || undefined,
  });
  /* Exchange credit pays part of the bill like a payment (GST on the bill stays as is). A bigger credit than the bill is allowed:
     the difference goes back to the customer (cash or UPI, manager PIN, audited), chosen in the payment window. */
  const exchangeCredit = exchange ? exchange.balance ?? exchange.totals.grand : 0;
  const exchangeUsed = exchange ? Math.min(exchangeCredit, totals.grand) : 0;
  /** Store credit never takes the bill below zero: it can use only what the customer has and what is still payable. */
  const storeCreditAvail = customer ? wallet?.storeCredit ?? 0 : 0;
  const storeCreditUsed = Math.min(storeCredit, storeCreditAvail, Math.max(0, totals.grand - exchangeUsed));
  const due = totals.grand - exchangeUsed - storeCreditUsed;
  const refundDue = exchange && totals.grand > 0 ? Math.max(0, exchangeCredit - totals.grand) : 0;

  /* The store-credit box belongs to one customer: removing or changing them starts it at zero again. */
  useEffect(() => { setStoreCredit(0); }, [customerId]);

  /* Items and stock are read from the database again after every bill and whenever this window comes back to the front
     (Office may have received goods or adjusted stock meanwhile), and the item is re-read when it is added to the bill. */
  const [tick, setTick] = useState(0);
  useEffect(() => { api.listItems().then(setItems).catch(() => undefined); }, [lastBill, tick]);
  useRefreshOnFocus(() => {
    setTick((t) => t + 1);
    if (customerId) api.getCustomer(customerId).then((c) => { if (c) useBilling.getState().setCustomer(c); }).catch(() => undefined);
  }, { f5: false });
  const stockFor = useCallback((l: BillLine) => {
    const it = byId.get(l.itemId);
    if (!it) return null;
    const left = it.stock - lines.filter((x) => x.itemId === l.itemId).reduce((s, x) => s + x.qty, 0);
    return { text: formatQty(left, it.loose), low: left <= 0 };
  }, [byId, lines]);
  useEffect(() => {
    void api.getPendingExchange().then((ex) => {
      setExchange(ex);
      // the customer of the returned bill is attached, so a removed credit goes back to their wallet and a refund has a name
      if (ex?.customerId && !useBilling.getState().customer) {
        void api.getCustomer(ex.customerId).then((c) => { if (c && !useBilling.getState().customer) useBilling.getState().setCustomer(c); }).catch(() => undefined);
      }
    });
  }, [useBilling]);
  // store credit and loyalty points of the attached customer (refreshed after every bill)
  useEffect(() => {
    let live = true;
    if (!customerId) { setWallet(null); return; }
    api.getCustomerWallet(customerId).then((w) => live && setWallet(w)).catch(() => live && setWallet(null));
    return () => { live = false; };
  }, [customerId, lastBill, tick]);
  useEffect(() => { api.peekNextBillNumber().then(setBillNo); }, [lastBill]);

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
  }, [B, byId, useBilling]);

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
  }, [byId, toast, useBilling]);

  /* ---------- adding items ---------- */
  const addItem = useCallback((item: Item, qty?: number) => {
    const idx = B.addItem(item, qty ?? 1000);
    // fresh stock and price straight from the database, for the grid and the "left" figure
    api.findItemByCode(item.barcode || item.code).then((f) => { if (f && f.id === item.id) setItems((cur) => cur.map((i) => (i.id === f.id ? f : i))); }).catch(() => undefined);
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

  /* ---------- scanner ----------
     The global listener (scanner.tsx) recognises the scanner by its typing speed and hands the finished code here, wherever
     the keyboard focus is: scan box, a grid cell being edited, or the type-ahead open. The code goes to the exact code or
     barcode first, never the fuzzy list. The same item scanned again adds one more. */
  const lowerMap = useMemo(() => new Map([...itemMap].map(([k, v]) => [k.toLowerCase(), v])), [itemMap]);
  useScanHandler((raw) => {
    const code = raw.trim();
    if (!code) return;
    if (dialog || pinAsk || saving) { toast.show({ tone: 'info', title: 'Finish or close this window first', detail: 'Then scan the next item.' }); return; }
    if (editRef.current) commitEdit(false);
    let qty: number | undefined;
    const pre = scan.trim().match(/^(\d+(?:\.\d{1,3})?)\*$/);
    if (pre) { qty = parseQty(pre[1]) ?? undefined; setScan(''); }
    const hit = itemMap.get(code) ?? lowerMap.get(code.toLowerCase());
    if (hit) { addItem(hit, qty); return; }
    const miss = () => {
      beepError();
      toast.show({ tone: 'error', title: `Item not found: ${code}`, detail: 'Check the label, or press F2 to search by name.' });
      flashError();
    };
    api.findItemByCode(code).then((found) => {
      if (!found) { miss(); return; }
      setItems((cur) => (cur.some((i) => i.id === found.id) ? cur : [...cur, found]));
      addItem(found, qty);
    }, miss);
  });

  /* ---------- actions ---------- */
  const doHold = async () => {
    if (!lines.length) { toast.show({ tone: 'info', title: 'Nothing to hold', detail: 'Add items to the bill first.' }); return; }
    const h = await api.holdBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: [], ...extras() });
    B.clear();
    setHeldCount((await api.listHeld()).length);
    toast.show({ tone: 'success', title: 'Bill held', detail: `${plural(h.lines.length, 'item')}, ${formatRupees(h.total, { decimals: false })}. Press Shift+F6 to bring it back.` });
  };
  const openHeld = async () => {
    const list = await api.listHeld();
    if (!list.length) { toast.show({ tone: 'info', title: 'No held bills' }); return; }
    setHeld(list); setDialog('held');
  };
  const recall = async (h: HeldBill) => {
    if (lines.length) await api.holdBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: [], ...extras() });
    await api.recallHeld(h.id);
    const cust = h.customerId ? await api.getCustomer(h.customerId) : null;
    B.load(h, cust);
    setHeldCount((await api.listHeld()).length);
    setDialog(null);
    toast.show({ tone: 'success', title: 'Held bill restored' });
  };
  const openPay = () => {
    if (!lines.length) { toast.show({ tone: 'info', title: 'Add items before payment' }); return; }
    setEditNow(null); setDialog('pay');
  };
  /** What the backend wants approved (discount over the limit, changed price, credit over limit): ask for the PIN, then save again. */
  const complete = async (payments: Payment[], change: number, pin?: string, refundMode?: 'cash' | 'upi'): Promise<string | null> => {
    setSaving(true);
    try {
      const all: Payment[] = [
        ...(exchange && exchangeUsed > 0 ? [{ mode: 'credit_note' as const, amount: exchangeUsed, ref: exchange.number }] : []),
        ...(storeCreditUsed > 0 ? storeCreditPayments(storeCreditUsed) : []),
        ...payments,
      ];
      const exchangeRefund = exchange && refundMode && refundDue > 0 ? { mode: refundMode, amount: refundDue, creditNote: exchange.number } : undefined;
      const bill = await api.saveBill({ customerId: customer?.id, customerName: customer?.name, lines, billDiscount, payments: all, cashier: user?.name, managerPin: pin, exchangeRefund, ...extras() });
      if (exchange) { await api.clearPendingExchange(); setExchange(null); }
      B.clear();
      lastBillId.current = bill.id;
      setLastBill({ number: bill.number, total: bill.totals.grand });
      void refreshTodaySales();
      // The bill is committed. Printing starts now but never makes the counter wait.
      printBillAfterSave(bill.id, { change }, toast);
      setPinAsk(null);
      setDialog(null);
      toast.show({
        tone: 'success', title: `Bill ${bill.number} saved`,
        detail: exchangeRefund ? `Give ${formatRupees(exchangeRefund.amount)} back to the customer (${exchangeRefund.mode.toUpperCase()})`
          : change > 0 ? `Give change ${formatRupees(change)}` : payments.length ? payments.map((p) => p.mode.toUpperCase()).join(' + ') + ' received'
          : storeCreditUsed > 0 ? `Paid by store credit (${formatRupees(storeCreditUsed, { decimals: false })})` : 'Paid by exchange credit',
      });
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (!pin && needsManagerPin(m)) { setPinAsk({ message: m, payments, change, refund: refundMode }); setDialog(null); return null; }
      if (pin) return m || 'Could not save the bill';
      toast.show({ tone: 'error', title: 'Could not save the bill', detail: m && !/database|disk|went wrong/i.test(m) ? m : 'Nothing was lost. Try Enter again.' });
      return null;
    } finally {
      setSaving(false);
    }
  };
  /* A scanned line is removed at once; the removal is logged on the backend (user + time) for the "Voided lines" report.
     If Settings asks for a manager PIN for removals, the line comes back and the PIN box opens. */
  const [voidAsk, setVoidAsk] = useState<{ line: BillLine; at: number; message: string } | null>(null);
  const logVoid = async (l: BillLine, pin?: string): Promise<string | null> => {
    try {
      await api.logVoidedLine({ itemId: l.itemId, code: l.code, name: l.name, qty: l.qty, rate: l.rate, amount: l.amount, counter: settings?.counter, managerPin: pin });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not log the removal';
    }
  };
  const removeSelected = () => {
    const st = useBilling.getState();
    const l = st.lines[st.selected];
    if (!l) return;
    const at = st.selected;
    st.remove(at);
    void logVoid(l).then((m) => {
      if (m && needsManagerPin(m)) { useBilling.getState().insert(l, at); setVoidAsk({ line: l, at, message: m }); return; }
      removed.current = { line: l, at };
      toast.show({ tone: 'info', title: `Removed ${l.name}`, detail: 'Press Ctrl+Z to undo.' });
    });
  };
  const lock = () => nav('/lock');

  /** F5: reload everything the screen reads, without touching the bill */
  const refresh = async () => {
    try {
      const [list, held, fresh] = await Promise.all([api.listItems(), api.listHeld(), customerId ? api.getCustomer(customerId) : Promise.resolve(null)]);
      setItems(list);
      setHeldCount(held.length);
      if (fresh) B.setCustomer(fresh);
      setTick((t) => t + 1);
      setBillNo(await api.peekNextBillNumber());
      void refreshTodaySales();
      toast.show({ tone: 'success', title: 'Refreshed', detail: 'Items, stock, customer and today\'s total are up to date.' });
    } catch { toast.show({ tone: 'error', title: 'Could not refresh', detail: 'Nothing on the bill changed. Try again.' }); }
  };
  const toggleWholesale = () => {
    const on = !wholesale;
    B.setWholesale(on, (id) => byId.get(id));
    toast.show({ tone: 'info', title: on ? 'Wholesale prices on' : 'Wholesale prices off', detail: on ? 'Items without a wholesale price keep the normal price.' : 'Back to normal prices.' });
  };
  /** Inline cash discount: "50" is Rs 50 off the bill, "2.5%" is two and a half percent. Stored as percent x 100. */
  const applyCashDiscount = (v: string) => {
    const t = v.trim();
    if (!t || t === '0') { B.setCashDisc(0); return; }
    if (t.endsWith('%')) {
      const pct = Number(t.slice(0, -1));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.show({ tone: 'error', title: 'Cash discount must be between 0% and 100%' }); return; }
      B.setCashDisc(Math.round(pct * 100));
      return;
    }
    const net = lines.reduce((s, l) => s + l.amount, 0);
    const amt = parsePaise(t);
    if (net <= 0) { toast.show({ tone: 'info', title: 'Add items before a cash discount' }); return; }
    if (amt === null || amt < 0) { toast.show({ tone: 'error', title: 'Type an amount like 50, or a percent like 2.5%' }); return; }
    B.setCashDisc(Math.min(10000, Math.round((amt * 10000) / net)));
  };
  /** Store credit typed in the panel: rupees of the customer's wallet (open credit notes) to use on this bill. */
  const applyStoreCredit = (v: string) => {
    const t = v.trim();
    if (!t || t === '0') { setStoreCredit(0); return; }
    if (!customer) { toast.show({ tone: 'info', title: 'Choose a customer first', detail: 'Store credit belongs to a customer.' }); return; }
    if (storeCreditAvail <= 0) { toast.show({ tone: 'info', title: 'No store credit', detail: `${customer.name} has no wallet balance.` }); return; }
    const amt = parsePaise(t);
    if (amt === null || amt <= 0) { toast.show({ tone: 'error', title: 'Type an amount like 350' }); return; }
    const max = Math.min(storeCreditAvail, Math.max(0, totals.grand - exchangeUsed));
    if (amt > max) {
      setStoreCredit(max);
      toast.show({
        tone: 'info', title: `Store credit set to ${formatRupees(max, { decimals: false })}`,
        detail: amt > storeCreditAvail ? `Only ${formatRupees(storeCreditAvail, { decimals: false })} is available.` : 'That is more than this bill.',
      });
      return;
    }
    setStoreCredit(amt);
  };
  /** The same split the Wallet (F5) mode in PaymentDialog makes: oldest credit note first, part of a note is fine. */
  const storeCreditPayments = (amount: number): Payment[] => {
    const out: Payment[] = [];
    let need = amount;
    for (const n of wallet?.creditNotes ?? []) {
      if (need <= 0) break;
      const part = Math.min(n.balance, need);
      if (part > 0) { out.push({ mode: 'credit_note', amount: part, ref: n.number }); need -= part; }
    }
    return out;
  };
  const reprintBill = (b: { id: string; number: string }) => {
    void api.recordReprint(b.id, user?.name ?? '').catch(() => undefined);
    void printWithToast('bill', b.id, { duplicate: true }, toast, `Duplicate of ${b.number} printed`);
  };
  const saveDelivery = (d: Delivery) => { B.setDelivery(d); setDialog(null); };

  /* ---------- global keys (latest closure via ref) ---------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (e.key === 'Escape' && e.defaultPrevented) return; // a dialog already used Esc to close itself
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); return; }
    if (dialog || edit || saving || pinAsk) return;
    // Safety net: if focus ever ended up on the page background (a closed dialog gave it back to nothing), the first
    // printable key goes to the scan box so type-ahead and scanning keep working.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (document.activeElement === document.body || !document.activeElement) && scanRef.current) scanRef.current.focus();
    if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); nav('/day-close'); return; }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchSeed(scanQ.text); setScan(''); setDialog('search'); return; }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); if (selected >= 0) startEdit('disc'); return; }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setCashFocus((n) => n + 1); return; }
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); setStoreFocus((n) => n + 1); return; }
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); toggleWholesale(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const id = lastBillId.current;
      if (!id) { toast.show({ tone: 'info', title: 'No bill to reprint yet', detail: 'Open Sales (F8) to reprint an older bill.' }); return; }
      void api.recordReprint(id, user?.name ?? '').catch(() => undefined);
      void printWithToast('bill', id, { duplicate: true }, toast, 'Duplicate copy printed');
      return;
    }
    const prevent = () => e.preventDefault();
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'c') { prevent(); setDialog('customer'); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      prevent();
      const r = removed.current;
      if (r) { B.insert(r.line, r.at); removed.current = null; toast.show({ tone: 'success', title: `Restored ${r.line.name}` }); }
      return;
    }
    switch (e.key) {
      case 'F2': prevent(); setDialog('delivery'); break;
      case 'F3': prevent(); openPay(); break;
      case 'F4': prevent(); if (selected >= 0) startEdit('qty'); break;
      case 'F5': prevent(); if (e.shiftKey) setDialog('billDisc'); else void refresh(); break;
      case 'F6': prevent(); if (e.shiftKey) void openHeld(); else void doHold(); break;
      case 'F7': prevent(); setDialog('staff'); break;
      case 'F8': prevent(); setDialog('recent'); break;
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

  /** Whole-bill discount typed in the right panel: 50 = Rs 50 off, 5% = five percent off. Empty clears it. */
  const applyBillDiscount = (v: string) => {
    const net = lines.reduce((x, l) => x + l.amount, 0);
    const d = v.trim();
    if (d === '') { B.setBillDiscount(0); return; }
    if (d.endsWith('%')) {
      const pct = Number(d.slice(0, -1));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.show({ tone: 'error', title: 'Discount must be between 0% and 100%' }); return; }
      B.setBillDiscount(Math.round((net * pct) / 100));
    } else {
      const amt = parsePaise(d);
      if (amt === null) { toast.show({ tone: 'error', title: 'Type an amount like 50, or a percent like 5%' }); return; }
      B.setBillDiscount(Math.min(amt, net));
    }
  };

  const pickCustomer = (c: Customer | null) => { B.setCustomer(c); setDialog(null); };

  const keys: FKey[] = [
    { key: 'F1', label: 'Keys' },
    { key: 'F2', label: 'Delivery', onClick: () => setDialog('delivery') },
    { key: 'F3', label: 'Pay mode', onClick: openPay },
    { key: 'F4', label: 'Qty', onClick: () => selected >= 0 && startEdit('qty') },
    { key: 'F5', label: 'Refresh', onClick: () => void refresh() },
    { key: 'F6', label: 'Hold', onClick: () => void doHold() },
    { key: 'F7', label: 'Staff', onClick: () => setDialog('staff') },
    { key: 'F8', label: 'Recent', onClick: () => setDialog('recent') },
    { key: 'F9', label: 'Cash', onClick: () => nav('/cash') },
    { key: 'F10', label: 'Return', onClick: () => nav('/returns') },
    { key: 'Alt+C', label: 'Customer', onClick: () => setDialog('customer') },
    { key: 'F12', label: 'Pay', tone: 'primary', onClick: openPay },
    { key: 'Esc', label: 'Clear', onClick: () => (scan ? setScan('') : lines.length && setDialog('cancel')) },
  ];

  return (
    <PosLayout
      topBar={<TopBar onHeld={() => void openHeld()} onLock={lock} onCloseDay={() => nav('/day-close')} />}
      keys={keys}
      side={
        <SummaryPanel
          totals={totals} customer={customer} wallet={wallet} onCustomer={() => setDialog('customer')} onPay={openPay}
          onDiscount={() => setDialog('billDisc')} onClearDiscount={() => B.setBillDiscount(0)} lastBill={lastBill} exchange={exchange} exchangeCredit={exchangeCredit} due={due} refundDue={refundDue} onDropExchange={() => setDialog('dropEx')} onApplyDiscount={applyBillDiscount} billNo={billNo}
          slotLabel={SLOT_LABEL[slot]} wholesale={wholesale} cashDisc={cashDisc} cashDiscBps={cashDiscBps}
          focusCashDisc={cashFocus} onApplyCashDisc={applyCashDiscount} onClearCashDisc={() => B.setCashDisc(0)}
          storeCredit={storeCreditAvail} storeCreditUsed={storeCreditUsed} focusStoreCredit={storeFocus}
          onApplyStoreCredit={applyStoreCredit} onClearStoreCredit={() => setStoreCredit(0)}
          delivery={delivery} onDelivery={() => setDialog('delivery')} staff={staff} onStaff={() => setDialog('staff')}
        />
      }
    >
      <BillToolbar
        deliveryOn={delivery.charge > 0 || !!delivery.address} staff={staff} wholesale={wholesale} heldCount={heldCount}
        onDelivery={() => setDialog('delivery')} onPay={openPay} onDelete={() => { removeSelected(); scanRef.current?.focus(); }}
        onRefresh={() => void refresh()} onManual={() => setDialog('manual')} onStaff={() => setDialog('staff')} onRecent={() => setDialog('recent')}
        onHold={() => void doHold()} onHeld={() => void openHeld()} onWholesale={toggleWholesale}
      />
      {/* Scan bar */}
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <div className="relative flex-1">
          <ScanBarcode size={20} className={cn('pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2', scanError ? 'text-danger' : 'text-primary')} />
          <input
            ref={scanRef} data-scan-input value={scan} autoComplete="off" spellCheck={false} aria-label="Scan barcode or type item code"
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
              'num h-11 w-full rounded-xl border bg-surface-2 pl-11 pr-4 text-lg font-medium text-ink placeholder:text-base placeholder:font-normal placeholder:text-subtle',
              'transition-colors focus:bg-surface focus:ring-4',
              scanError ? 'animate-[shake_0.35s] border-danger focus:border-danger focus:ring-danger/20' : 'border-line-strong focus:border-primary focus:ring-primary/20',
            )}
          />
          {suggestOpen && (
            <ScanSuggest
              list={sugg} hi={hi} q={scanQ.text} qty={scanQ.qty} left={stockLeft} onHover={setHi}
              onPick={(it) => { addItem(it, scanQ.qty); setScan(''); scanRef.current?.focus(); }}
            />
          )}
        </div>
        <button
          type="button" tabIndex={-1} disabled={!lines.length} onClick={() => setDialog('cancel')} title="Cancel this whole bill (Esc)"
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-danger/40 bg-surface px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
        >
          <XCircle size={17} /> Cancel bill <Kbd>Esc</Kbd>
        </button>
      </div>

      <BillGrid
        lines={lines} selected={selected} edit={edit} loose={isLoose} stock={stockFor}
        onSelect={B.select}
        onDraft={(v) => editRef.current && setEditNow({ ...editRef.current, draft: v })}
        onCommit={commitEdit}
        onCancel={() => { setEditNow(null); scanRef.current?.focus(); }}
        onReject={(m) => toast.show({ tone: 'error', title: 'Numbers only here', detail: m })}
        onEdit={(i, f) => startEdit(f, i)}
        onStep={(i, d) => { const l = useBilling.getState().lines[i]; if (l && (d > 0 || l.qty > 1000)) { B.setQty(i, l.qty + d * 1000); scanRef.current?.focus(); } }}
        onRemove={(i) => { B.select(i); removeSelected(); scanRef.current?.focus(); }}
      />

      <DeliveryDialog
        open={dialog === 'delivery'} current={delivery} gstRate={deliveryGst} onClose={() => setDialog(null)} onSave={saveDelivery}
        defaultLocality={customer?.area} defaultAddress=""
      />
      <StaffDialog open={dialog === 'staff'} current={staff} onClose={() => setDialog(null)} onPick={(n) => { B.setStaff(n); setDialog(null); }} />
      <RecentBillsDialog open={dialog === 'recent'} onClose={() => setDialog(null)} onReprint={reprintBill} onOpenSales={() => { setDialog(null); nav('/sales'); }} />
      <ManualItemDialog open={dialog === 'manual'} onClose={() => setDialog(null)} onAdd={(l) => { B.addLine(l); setDialog(null); }} />
      <ItemSearchDialog open={dialog === 'search'} seed={searchSeed} onClose={() => setDialog(null)} onPick={(it) => { setDialog(null); addItem(it); }} />
      <CustomerDialog open={dialog === 'customer'} current={customer} onClose={() => setDialog(null)} onPick={pickCustomer} />
      <HeldDialog open={dialog === 'held'} held={held} onClose={() => setDialog(null)} onPick={(h) => void recall(h)} />
      <PaymentDialog
        open={dialog === 'pay'} total={due} billTotal={totals.grand} storeCredit={storeCreditUsed} customer={customer} wallet={wallet} busy={saving} onClose={() => setDialog(null)}
        exchange={exchange ? { credit: exchangeCredit, number: exchange.number, billNumber: exchange.billNumber } : null}
        onComplete={(p, c, refund) => void complete(p, c, undefined, refund)} onCustomerUpdate={(c) => B.setCustomer(c)}
      />
      <ManagerPinDialog
        open={voidAsk !== null} title="Manager approval to remove a line" message={voidAsk?.message ?? ''} confirmLabel="Approve and remove"
        onClose={() => setVoidAsk(null)}
        onSubmit={async (pin) => {
          if (!voidAsk) return null;
          const m = await logVoid(voidAsk.line, pin);
          if (m) return m;
          const idx = useBilling.getState().lines.findIndex((x) => x === voidAsk.line);
          if (idx >= 0) useBilling.getState().remove(idx);
          removed.current = { line: voidAsk.line, at: voidAsk.at };
          setVoidAsk(null);
          return null;
        }}
        onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
      <ManagerPinDialog
        open={pinAsk !== null} title="Manager approval" message={pinAsk?.message ?? ''} confirmLabel="Approve and save"
        onClose={() => { setPinAsk(null); setDialog('pay'); }}
        onSubmit={(pin) => (pinAsk ? complete(pinAsk.payments, pinAsk.change, pin, pinAsk.refund) : Promise.resolve(null))}
        onLocked={() => { useSession.getState().signOut(); nav('/login', { replace: true }); }}
      />
      <ConfirmDialog
        open={dialog === 'cancel'} danger focusSafe title="Cancel this bill?" confirmLabel="Cancel this bill"
        message={`The whole bill will be cleared: ${plural(lines.length, 'item')} worth ${formatRupees(totals.grand, { decimals: false })}${exchange ? `. The exchange credit ${exchange.number} is not used and stays with the customer` : ''}. Use F6 instead to hold it for later.`}
        onClose={() => setDialog(null)} onConfirm={() => { B.clear(); setDialog(null); toast.show({ tone: 'info', title: 'Bill cancelled' }); }}
      />
      <ConfirmDialog
        open={dialog === 'dropEx'} danger title="Remove exchange credit only?" confirmLabel="Remove exchange credit only"
        message={exchange ? `Only the exchange credit ${exchange.number} (${formatRupees(exchangeCredit, { decimals: false })}) is taken off this bill. The items on the bill stay. The credit note goes back to the customer as unused store credit.` : ''}
        onClose={() => setDialog(null)} onConfirm={() => { void api.clearPendingExchange(); setExchange(null); setDialog(null); toast.show({ tone: 'info', title: 'Exchange credit removed', detail: 'The credit note stays with the customer, unused. The bill is unchanged.' }); }}
      />
      <PromptDialog
        open={dialog === 'billDisc'} title="Discount on whole bill" label="Discount amount or percent" hint="Type 50 for 50 rupees off, or 5% for five percent off."
        initial={billDiscount ? (billDiscount / 100).toFixed(2) : ''}
        preview={(typed) => {
          const net = lines.reduce((x, l) => x + l.amount, 0);
          const t = typed.trim();
          const d = t === '' ? 0 : t.endsWith('%') ? Math.round((net * Number(t.slice(0, -1) || 0)) / 100) : parsePaise(t) ?? 0;
          const after = computeTotalsWithDelivery(lines, Math.min(d, net) + cashDisc, settings?.roundToRupee ?? true, delivery.charge, deliveryGst);
          return <span className="flex items-center justify-between"><span>Discount <b className="num">{formatRupees(Math.min(d, net))}</b></span><span>New total <b className="num text-md">{formatRupees(after.grand)}</b></span></span>;
        }}
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
