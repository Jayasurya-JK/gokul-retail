import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, ChevronLeft, ChevronRight, CornerUpLeft, FileText, Lock, Printer, ReceiptIndianRupee, Search, X } from 'lucide-react';
import { formatQty, invoiceFromBill, invoiceFromCreditNote, isDecimalUnit, needsFullInvoice, supplierFromSettings, type Bill, type BillDetail, type CreditNote, type InvoiceData, type PayMode } from '@gokul/data';
import { printWithToast } from '../printing';
import { useScanHandler } from '../scanner';
import { useReceiptConfig } from '../receiptConfig';
import { Badge, Button, EmptyState, IconButton, InvoiceDialog, Input, Kbd, Money, PosLayout, ReceiptPreview, TaxInvoicePreview, cn, useRefreshOnFocus, useToast, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { BillDetailPane } from '../components/billops/BillDetailPane';
import { CancelBillDialog } from '../components/billops/CancelBillDialog';
import { CreditNoteDialog } from '../components/billops/CreditNoteDialog';
import { billReceipt, dayKey, dayLabel, dateTimeOf, modeLabel, payLabel, refundLabel, shiftDay, timeOf } from '../components/billops/helpers';

type Dialog = null | 'cancel' | 'note';
/** The list shows bills (default) or the credit notes of the day (the Returns tile) */
type View = 'bills' | 'returns';

const SALES_KEYS: KeyRows = [
  ['Move between bills', ['Up', 'Down']],
  ['Jump a page', ['PageUp', 'PageDown']],
  ['Reprint the selected bill (or credit note)', ['Enter', 'Ctrl+P']],
  ['Back to today', ['F2']],
  ['Cancel the bill (manager PIN)', ['F6']],
  ['Return items from the bill', ['F10']],
  ['Day before / after', ['Ctrl+Left', 'Ctrl+Right']],
  ['All days (manager)', ['Ctrl+Enter']],
  ['Clear search, or back to bills', ['Esc']],
];

/** The receipt column is shown on wide windows; below this width the bill detail needs the room */
const RECEIPT_MIN_WIDTH = 1340;

const stepId = (ids: string[], cur: string | null, by: number) => {
  if (!ids.length) return null;
  const i = ids.indexOf(cur ?? '');
  return ids[Math.max(0, Math.min(ids.length - 1, (i < 0 ? 0 : i) + by))];
};

export function Sales() {
  useScreenKeys('Sales', SALES_KEYS);
  const nav = useNavigate();
  const toast = useToast();
  const { user, settings } = useSession();
  const receiptCfg = useReceiptConfig();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [query, setQuery] = useState('');
  const [allDays, setAllDays] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [walletBits, setWalletBits] = useState<{ points?: number; pointsExpiry?: { points: number; on: string } | null; storeCreditBalance?: number }>({});
  const detailCustomer = detail?.bill.customerId;
  useEffect(() => {
    let live = true;
    if (!detailCustomer) { setWalletBits({}); return undefined; }
    api.getCustomerWallet(detailCustomer).then((w) => {
      if (live) setWalletBits({
        ...(w.rules.enabled ? { points: w.points, pointsExpiry: w.rules.printExpiry ? w.nextExpiry : null } : {}),
        storeCreditBalance: w.storeCredit,
      });
    }).catch(() => { if (live) setWalletBits({}); });
    return () => { live = false; };
  }, [detailCustomer]);
  const [version, setVersion] = useState(0);
  useRefreshOnFocus(() => setVersion((v) => v + 1));
  const [dialog, setDialog] = useState<Dialog>(null);
  /** The tax invoice / credit note as it prints, with the choice of an A4 sheet or the roll */
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<{ kind: 'bill' | 'creditNote'; id: string } | null>(null);
  const [note, setNote] = useState<CreditNote | null>(null);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [view, setView] = useState<View>('bills');
  const [payFilter, setPayFilter] = useState<PayMode | null>(null);
  const [selNoteId, setSelNoteId] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(() => window.innerWidth >= RECEIPT_MIN_WIDTH);
  const searchRef = useRef<HTMLInputElement>(null);
  const today = dayKey(new Date());
  /** Cashiers see today only; the owner and managers can open any day. Totals are visible to everyone. */
  const canBrowse = user?.role !== 'cashier' && user?.role !== 'staff';
  /* A scanned bill barcode (the bill number) finds that bill. */
  useScanHandler((raw) => {
    const c = raw.trim();
    if (!c || dialog) return;
    setQuery(c);
    if (canBrowse) setAllDays(true);
  });

  /* list */
  useEffect(() => {
    let live = true;
    void api.listBillsOn({ date, query, allDays }).then((r) => {
      if (!live) return;
      setBills(r); setLoaded(true);
    });
    return () => { live = false; };
  }, [date, query, allDays, version]);

  useEffect(() => { void api.listCreditNotes(500).then(setNotes); }, [version]);

  /* bills shown in the list: the payment-mode filter (Cash, UPI, Card, Credit tiles) narrows them */
  const listBills = useMemo(
    () => (payFilter ? bills.filter((b) => b.payments.some((p) => p.mode === payFilter)) : bills),
    [bills, payFilter],
  );
  /* credit notes shown when the Returns tile is open: same day (or all days), matched by the search text */
  const q = query.trim().toLowerCase();
  const listNotes = useMemo(
    () => notes.filter((n) => (allDays || dayKey(new Date(n.at)) === date)
      && (!q || [n.number, n.billNumber, n.customerName].some((s) => s.toLowerCase().includes(q)))),
    [notes, date, allDays, q],
  );
  const selNote = notes.find((n) => n.id === selNoteId) ?? null;
  const showingNotes = view === 'returns';

  useEffect(() => {
    setSelId((cur) => (listBills.some((b) => b.id === cur) ? cur : listBills[0]?.id ?? null));
  }, [listBills]);
  useEffect(() => {
    setSelNoteId((cur) => (listNotes.some((n) => n.id === cur) ? cur : listNotes[0]?.id ?? null));
  }, [listNotes]);

  /* detail */
  useEffect(() => {
    if (!selId) { setDetail(null); return; }
    let live = true;
    void api.getBillDetail(selId).then((d) => live && setDetail(d));
    return () => { live = false; };
  }, [selId, version]);

  const summary = useMemo(() => {
    const live = bills.filter((b) => b.status !== 'cancelled');
    const total = live.reduce((s, b) => s + b.totals.grand, 0);
    const byMode: Partial<Record<PayMode, number>> = {};
    live.forEach((b) => b.payments.forEach((p) => { byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount; }));
    const ret = notes.filter((n) => allDays || dayKey(new Date(n.at)) === date);
    return {
      count: bills.length, live: live.length, cancelled: bills.length - live.length, total, byMode,
      avg: live.length ? Math.round(total / live.length) : 0, returns: ret.length, returned: ret.reduce((s, n) => s + n.totals.grand, 0),
    };
  }, [bills, notes, date, allDays]);

  const refocus = useCallback(() => requestAnimationFrame(() => searchRef.current?.focus()), []);
  useEffect(() => { refocus(); }, [refocus]);

  const invoiceCtx = useMemo(() => ({ supplier: supplierFromSettings(settings ?? { shopName: '', address: '', gstin: '', phone: '', counter: '', billPrefix: '', receiptFooter: '', printer: '', roundToRupee: true }), numberFormat: receiptCfg?.billFormat.numberFormat }), [settings, receiptCfg]);
  const openInvoice = useCallback((target: { kind: 'bill' | 'creditNote'; id: string }, data: InvoiceData) => { setInvoiceFor(target); setInvoice(data); }, []);
  const reprint = useCallback(async () => {
    if (!detail || detail.bill.status === 'cancelled') { toast.show({ tone: 'info', title: 'Cancelled bills cannot be printed' }); return; }
    await api.recordReprint(detail.bill.id, user?.name ?? '');
    setVersion((v) => v + 1);
    await printWithToast('bill', detail.bill.id, { duplicate: true }, toast, `Printed ${detail.bill.number}`);
  }, [detail, toast, user]);

  const printNote = useCallback(() => {
    if (!selNote) return;
    void printWithToast('creditNote', selNote.id, { duplicate: true }, toast, `Printed ${selNote.number}`);
  }, [selNote, toast]);

  const primaryPrint = useCallback(() => { if (showingNotes) printNote(); else void reprint(); }, [showingNotes, printNote, reprint]);

  const startReturn = useCallback(() => {
    if (!detail) return;
    if (detail.bill.status === 'cancelled') { toast.show({ tone: 'warning', title: 'This bill is cancelled', detail: 'Nothing to return.' }); return; }
    nav('/returns', { state: { billNumber: detail.bill.number } });
  }, [detail, nav, toast]);

  const askCancel = useCallback(() => {
    if (!detail) return;
    if (detail.bill.status === 'cancelled') { toast.show({ tone: 'info', title: 'Already cancelled' }); return; }
    if (detail.returned.some((n) => n > 0)) { toast.show({ tone: 'warning', title: 'Items were returned on this bill', detail: 'A bill with returns cannot be cancelled.' }); return; }
    setDialog('cancel');
  }, [detail, toast]);

  const doCancel = async (reason: string, pin: string): Promise<string | null> => {
    if (!detail) return 'No bill selected';
    try {
      await api.cancelBill({ billId: detail.bill.id, reason, managerPin: pin, by: user?.name ?? '' });
      closeDialog(); setVersion((v) => v + 1);
      toast.show({ tone: 'success', title: `Bill ${detail.bill.number} cancelled`, detail: 'Kept in history. Stock put back.' });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not cancel the bill';
    }
  };

  const closeDialog = useCallback(() => { window.setTimeout(() => setDialog(null), 0); refocus(); }, [refocus]);

  const move = useCallback((by: number) => {
    if (showingNotes) setSelNoteId((cur) => stepId(listNotes.map((n) => n.id), cur, by));
    else setSelId((cur) => stepId(listBills.map((b) => b.id), cur, by));
  }, [showingNotes, listNotes, listBills]);

  const changeDay = (by: number) => {
    if (!canBrowse) return;
    setAllDays(false);
    setDate((d) => { const n = shiftDay(d, by); return n > today ? d : n; });
  };

  /* Summary tiles and the mode chips are filters: a second click clears them */
  const toggleReturns = () => setView((v) => (v === 'returns' ? 'bills' : 'returns'));
  const togglePay = (m: PayMode) => { setView('bills'); setPayFilter((cur) => (cur === m ? null : m)); };
  const openBillOfNote = (n: CreditNote) => {
    setView('bills'); setQuery(n.billNumber);
    if (canBrowse) setAllDays(true);
  };

  /* keys (latest closure via ref) */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (dialog) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'p') { e.preventDefault(); primaryPrint(); return; }
    if (e.ctrlKey && k === 'arrowleft') { e.preventDefault(); changeDay(-1); return; }
    if (e.ctrlKey && k === 'arrowright') { e.preventDefault(); changeDay(1); return; }
    if (e.ctrlKey && k === 'enter') { e.preventDefault(); if (canBrowse) setAllDays((v) => !v); return; }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'PageDown': e.preventDefault(); move(8); break;
      case 'PageUp': e.preventDefault(); move(-8); break;
      case 'Enter': e.preventDefault(); primaryPrint(); break;
      case 'F2': e.preventDefault(); setAllDays(false); setDate(today); setQuery(''); break;
      case 'F6': e.preventDefault(); if (!showingNotes) askCancel(); break;
      case 'F10': e.preventDefault(); if (!showingNotes) startReturn(); break;
      case 'Escape':
        e.preventDefault();
        if (query) setQuery('');
        else if (showingNotes) setView('bills');
        else nav('/billing');
        break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const keys: FKey[] = [
    { key: 'Esc', label: query ? 'Clear search' : showingNotes ? 'Back to bills' : 'Back to billing', onClick: () => (query ? setQuery('') : showingNotes ? setView('bills') : nav('/billing')) },
    { key: 'F2', label: 'Today', onClick: () => { setAllDays(false); setDate(today); setQuery(''); } },
    ...(canBrowse ? [
      { key: 'Ctrl+Left', label: 'Day before', onClick: () => changeDay(-1) },
      { key: 'Ctrl+Right', label: 'Day after', onClick: () => changeDay(1) },
      { key: 'Ctrl+Enter', label: allDays ? 'This day only' : 'All days', onClick: () => setAllDays((v) => !v) },
    ] : []),
    { key: 'Enter', label: showingNotes ? 'Print credit note' : 'Reprint', onClick: primaryPrint },
    ...(showingNotes ? [] : [
      { key: 'F6', label: 'Cancel bill', tone: 'danger' as const, onClick: askCancel },
      { key: 'F10', label: 'Return items', tone: 'primary' as const, onClick: startReturn },
    ]),
  ];

  const cancelled = detail?.bill.status === 'cancelled';
  const scope = allDays ? 'All days' : dayLabel(date);

  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      <TotalsStrip
        s={summary} scope={scope} returnsOpen={showingNotes} payFilter={payFilter}
        onReturns={toggleReturns} onPayFilter={togglePay}
      />
      <div className="flex min-h-0 flex-1">
        {/* ---------- left: list ---------- */}
        <section className="flex w-[clamp(360px,28vw,500px)] shrink-0 flex-col border-r border-line bg-surface">
          <div className="space-y-2.5 border-b border-line p-3">
            <Input
              icon={<Search size={16} />} ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} size="lg" autoComplete="off" spellCheck={false}
              placeholder={showingNotes ? 'Credit note, bill no or customer' : 'Bill no, customer or amount'} aria-label="Search bills"
            />
            <div className="flex items-center gap-1.5">
              <IconButton label="Day before" onClick={() => changeDay(-1)} disabled={!canBrowse} tabIndex={-1}><ChevronLeft size={16} /></IconButton>
              <input
                type="date" value={date} max={today} disabled={!canBrowse} aria-label="Pick a date" tabIndex={-1}
                onChange={(e) => { if (e.target.value && e.target.value <= today) { setAllDays(false); setDate(e.target.value); refocus(); } }}
                className="h-8 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 text-center text-sm font-semibold text-ink focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-surface-3"
              />
              <IconButton label="Day after" onClick={() => changeDay(1)} disabled={!canBrowse || date >= today || allDays} tabIndex={-1}><ChevronRight size={16} /></IconButton>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ink">
              <span className="truncate">{showingNotes ? `Credit notes - ${scope}` : scope}</span>
              {!showingNotes && payFilter && (
                <button
                  type="button" tabIndex={-1} onClick={() => setPayFilter(null)} title="Clear this filter"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-px text-[11px] font-semibold text-primary hover:bg-primary/15"
                >
                  {modeLabel[payFilter]} only <X size={11} />
                </button>
              )}
            </span>
            {!canBrowse
              ? <span className="flex shrink-0 items-center gap-1 text-subtle"><Lock size={11} /> Today only</span>
              : showingNotes
                ? <span className="shrink-0 text-muted"><b className="num text-ink">{listNotes.length}</b> {listNotes.length === 1 ? 'note' : 'notes'}</span>
                : <span className="shrink-0 text-muted"><b className="num text-ink">{listBills.length}</b> {listBills.length === 1 ? 'bill' : 'bills'}</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!showingNotes && loaded && listBills.length === 0 && (
              <li className="px-4 py-10">
                <EmptyState
                  icon={<Search size={20} />}
                  title={payFilter ? `No ${modeLabel[payFilter].toLowerCase()} bills here` : query ? `No bill matches "${query}"` : 'No bills on this day'}
                  hint={payFilter ? 'Click the amount again to show all bills.' : query && !allDays && canBrowse ? <span className="flex items-center justify-center gap-1.5">Search every day with <Kbd>Ctrl+Enter</Kbd></span> : canBrowse ? 'Pick another day with Ctrl + arrow keys.' : undefined}
                />
              </li>
            )}
            {showingNotes && listNotes.length === 0 && (
              <li className="px-4 py-10">
                <EmptyState icon={<CornerUpLeft size={20} />} title="No credit notes" hint={query ? 'Nothing matches the search.' : 'Returns and exchanges for this day show here.'} />
              </li>
            )}
            {showingNotes && listNotes.map((n) => {
              const on = n.id === selNoteId;
              return (
                <li
                  key={n.id} onClick={() => { setSelNoteId(n.id); refocus(); }}
                  ref={(el) => { if (el && on) el.scrollIntoView({ block: 'nearest' }); }}
                  className={cn('relative flex h-[58px] cursor-default items-center gap-3 border-b border-line/70 px-4', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="num shrink-0 font-semibold text-ink">{n.number}</span>
                      <span className="shrink-0 text-subtle">·</span>
                      <span className="min-w-0 truncate font-medium text-ink">{n.customerName}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {allDays && <>{new Date(n.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - </>}{timeOf(n.at)} - against <span className="num">{n.billNumber}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <Money paise={n.totals.grand} className="text-base font-semibold text-warning" />
                    <div className="text-[11px] font-medium text-muted">{refundLabel[n.refundMode]}</div>
                  </div>
                </li>
              );
            })}
            {!showingNotes && listBills.map((b) => {
              const on = b.id === selId;
              const dead = b.status === 'cancelled';
              const due = b.payments.filter((p) => p.mode === 'credit').reduce((s, p) => s + p.amount, 0);
              return (
                <li
                  key={b.id} onClick={() => { setSelId(b.id); refocus(); }}
                  ref={(el) => { if (el && on) el.scrollIntoView({ block: 'nearest' }); }}
                  className={cn('relative flex h-[58px] cursor-default items-center gap-3 border-b border-line/70 px-4', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className={cn('num shrink-0 font-semibold', dead ? 'text-subtle line-through' : 'text-ink')}>{b.number}</span>
                      <span className="shrink-0 text-subtle">·</span>
                      <span className={cn('min-w-0 truncate font-medium', dead ? 'text-subtle line-through' : 'text-ink')}>{b.customerName}</span>
                      {dead && <Badge tone="danger" className="!h-[18px] !px-1.5 shrink-0 text-[11px]">Cancelled</Badge>}
                      {b.status === 'returned' && <Badge tone="warning" className="!h-[18px] !px-1.5 shrink-0 text-[11px]">Returned</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {allDays && <>{new Date(b.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - </>}{timeOf(b.at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money paise={b.totals.grand} className={cn('text-base font-semibold', dead ? 'text-subtle line-through' : 'text-ink')} />
                    {payFilter === 'credit' && due > 0
                      ? <div className="text-[11px] font-medium text-warning">Due <Money paise={due} decimals={false} className="font-semibold" /></div>
                      : <div className="text-[11px] font-medium text-muted">{payLabel(b)}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- right: detail (+ receipt on wide windows) ---------- */}
        <section className="flex min-w-0 flex-1 bg-surface">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {showingNotes ? (
              selNote && settings ? (
                <>
                  <NotePane note={selNote} />
                  <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
                    <Button variant="primary" icon={<Printer size={15} />} kbd="Enter" onClick={printNote}>Print credit note</Button>
                    <Button icon={<FileText size={15} />} onClick={() => openInvoice({ kind: 'creditNote', id: selNote.id }, invoiceFromCreditNote(selNote, invoiceCtx))}>Credit note on A4</Button>
                    <Button icon={<ReceiptIndianRupee size={15} />} onClick={() => openBillOfNote(selNote)}>Open bill {selNote.billNumber}</Button>
                    <div className="flex-1" />
                    <ReceiptToggle on={showReceipt} onToggle={() => setShowReceipt((v) => !v)} />
                  </div>
                </>
              ) : (
                <EmptyState icon={<CornerUpLeft size={22} />} title="Select a credit note" hint="Use the Up and Down keys to move through the notes." className="flex-1" />
              )
            ) : detail && settings ? (
              <>
                <BillDetailPane detail={detail} onOpenNote={(n) => { setNote(n); setDialog('note'); }} />
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
                  <Button variant="primary" icon={<Printer size={15} />} kbd="Ctrl+P" disabled={cancelled} onClick={() => void reprint()}>Reprint bill</Button>
                  <Button icon={<FileText size={15} />} disabled={cancelled} onClick={() => openInvoice({ kind: 'bill', id: detail.bill.id }, invoiceFromBill(detail.bill, invoiceCtx))}>Tax invoice</Button>
                  <Button icon={<CornerUpLeft size={15} />} kbd="F10" disabled={cancelled} onClick={startReturn}>Return items</Button>
                  <ReceiptToggle on={showReceipt} onToggle={() => setShowReceipt((v) => !v)} />
                  <div className="flex-1" />
                  <Button variant="danger" icon={<Ban size={15} />} kbd="F6" disabled={cancelled} onClick={askCancel}>Cancel bill</Button>
                </div>
              </>
            ) : (
              <EmptyState icon={<ReceiptIndianRupee size={22} />} title="Select a bill" hint="Use the Up and Down keys to move through the bills." className="flex-1" />
            )}
          </div>
          {showReceipt && settings && (!showingNotes || selNote) && (
            <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface-3 px-3 pt-3">
              <div className="mb-2 shrink-0 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
                {showingNotes ? 'Credit note preview - 80 mm' : 'Receipt preview - 80 mm'}
              </div>
              {/* The whole receipt scrolls inside this panel; the torn bottom edge stays after the last line. */}
              <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                {showingNotes
                  ? selNote && <TaxInvoicePreview layout="thermal" data={invoiceFromCreditNote(selNote, invoiceCtx)} />
                  : detail && (needsFullInvoice(detail.bill)
                    ? <TaxInvoicePreview layout="thermal" data={invoiceFromBill(detail.bill, invoiceCtx)} />
                    : <ReceiptPreview data={{ ...billReceipt(detail, receiptCfg), ...walletBits }} settings={settings} shop={receiptCfg} />)}
              </div>
            </aside>
          )}
        </section>
      </div>

      <InvoiceDialog
        open={!!invoice} data={invoice} onClose={() => setInvoice(null)}
        onPrint={(layout) => { if (invoiceFor) void printWithToast(invoiceFor.kind, invoiceFor.id, { duplicate: true, format: layout === 'a4' ? 'a4' : undefined }, toast, `Printed ${invoice?.number ?? ''}`); }}
      />
      <CancelBillDialog open={dialog === 'cancel'} detail={detail} onClose={closeDialog} onConfirm={doCancel} />
      {settings && (
        <CreditNoteDialog
          open={dialog === 'note'} note={note} settings={settings} onClose={closeDialog}
          onPrint={() => { if (note) void printWithToast('creditNote', note.id, { duplicate: true }, toast, `Printed ${note.number}`); }}
          onPrintA4={() => { if (note) void printWithToast('creditNote', note.id, { duplicate: true, format: 'a4' }, toast, `Printed ${note.number} on A4`); }}
        />
      )}
    </PosLayout>
  );
}

function ReceiptToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<ReceiptIndianRupee size={14} />} onClick={onToggle} aria-pressed={on}>
      {on ? 'Hide receipt' : 'Show receipt'}
    </Button>
  );
}

/** Credit note body: what was returned, why, and how it was refunded. The receipt preview sits beside it. */
function NotePane({ note }: { note: CreditNote }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-start gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="num text-xl font-bold tracking-tight text-ink">{note.number}</h2>
            <Badge tone="warning"><CornerUpLeft size={11} /> Credit note</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-muted">
            <span>{dateTimeOf(note.at)}</span><span>By {note.by}</span>
            <span className="font-medium text-ink">{note.customerName}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Refund value</div>
          <Money paise={note.totals.grand} className="text-2xl font-bold text-warning" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 text-sm">
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Against bill</div>
          <div className="num mt-0.5 font-semibold text-ink">{note.billNumber}</div>
        </div>
        <div className="rounded-control bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Refunded as</div>
          <div className="mt-0.5 font-semibold text-ink">{refundLabel[note.refundMode]}</div>
        </div>
        <div className="col-span-2 rounded-control bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Reason</div>
          <div className="mt-0.5 text-ink">{note.reason || '-'}</div>
        </div>
      </div>
      <div className="px-5 pt-4">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_110px] h-8 items-center gap-x-2.5 rounded-t-control border border-b-0 border-line bg-surface-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span>Item returned</span><span className="text-right">Qty</span><span className="text-right">Amount</span>
        </div>
        <div className="divide-y divide-line rounded-b-control border border-line">
          {note.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_110px] items-center gap-x-2.5 px-3 py-2 text-sm">
              <span className="truncate font-medium text-ink">{l.name}</span>
              <span className="num text-right text-muted">{formatQty(l.qty, isDecimalUnit(l.unit))} {l.unit}</span>
              <Money paise={l.amount} className="text-right font-semibold text-ink" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MODE_ORDER: PayMode[] = ['cash', 'upi', 'card', 'credit', 'credit_note', 'sodexo'];
const MODE_BAR: Record<PayMode, string> = { cash: 'bg-primary', upi: 'bg-info', card: 'bg-accent', credit: 'bg-warning', credit_note: 'bg-subtle', points: 'bg-subtle', sodexo: 'bg-subtle' };

interface Totals { live: number; cancelled: number; total: number; avg: number; returns: number; returned: number; byMode: Partial<Record<PayMode, number>> }

/** Day totals. Visible to every user (owner's choice), so a cashier can tell the manager how the day is going.
 *  Returns opens the credit notes; each payment mode filters the bill list. Click again to clear. */
function TotalsStrip({ s, scope, returnsOpen, payFilter, onReturns, onPayFilter }: {
  s: Totals; scope: string; returnsOpen: boolean; payFilter: PayMode | null; onReturns: () => void; onPayFilter: (m: PayMode) => void;
}) {
  const modes = MODE_ORDER.filter((m) => (s.byMode[m] ?? 0) > 0);
  const sum = modes.reduce((t, m) => t + (s.byMode[m] ?? 0), 0) || 1;
  return (
    <div className="flex shrink-0 items-stretch gap-px border-b border-line bg-line">
      <Stat label={`Sales - ${scope}`} wide><Money paise={s.total} className="text-2xl font-bold tracking-tight text-ink" /></Stat>
      <Stat label="Bills" hint={s.cancelled ? `${s.cancelled} cancelled` : undefined}><span className="num text-xl font-semibold text-ink">{s.live}</span></Stat>
      <Stat label="Average bill"><Money paise={s.avg} className="text-xl font-semibold text-ink" decimals={false} /></Stat>
      <Stat
        label="Returns" hint={s.returns ? `${s.returns} credit ${s.returns === 1 ? 'note' : 'notes'} - ${returnsOpen ? 'showing' : 'show'}` : 'None'}
        onClick={onReturns} active={returnsOpen} title={returnsOpen ? 'Back to bills' : 'Show the credit notes'}
      >
        <Money paise={s.returned} className={cn('text-xl font-semibold', s.returned ? 'text-warning' : 'text-ink')} decimals={false} />
      </Stat>
      <div className="min-w-0 flex-[1.6] bg-surface px-5 py-2.5">
        <div className="text-xs font-medium text-muted">Received by <span className="text-subtle">(click to filter bills)</span></div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-3">
          {modes.map((m) => <span key={m} className={cn(MODE_BAR[m], payFilter && payFilter !== m && 'opacity-30')} style={{ width: `${((s.byMode[m] ?? 0) / sum) * 100}%` }} />)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5 text-xs">
          {modes.length === 0 && <span className="text-subtle">No payments yet</span>}
          {modes.map((m) => {
            const on = payFilter === m;
            return (
              <button
                key={m} type="button" tabIndex={-1} aria-pressed={on} onClick={() => onPayFilter(m)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors',
                  on ? 'bg-primary-soft text-ink ring-1 ring-primary/40' : 'text-muted hover:bg-surface-2',
                )}
              >
                <span className={cn('h-2 w-2 rounded-sm', MODE_BAR[m])} />{modeLabel[m]} <Money paise={s.byMode[m] ?? 0} decimals={false} className="font-semibold text-ink" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, hint, wide, children, onClick, active, title }: {
  label: string; hint?: string; wide?: boolean; children: ReactNode; onClick?: () => void; active?: boolean; title?: string;
}) {
  const body = (
    <>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
      <div className="h-4 text-xs text-subtle">{hint}</div>
      {active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-primary" />}
    </>
  );
  const cls = cn('relative min-w-0 px-5 py-2.5 text-left', wide ? 'flex-[1.3]' : 'flex-1', active ? 'bg-primary-soft' : 'bg-surface');
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" tabIndex={-1} aria-pressed={active} title={title} onClick={onClick} className={cn(cls, 'cursor-default transition-colors hover:bg-surface-2')}>
      {body}
    </button>
  );
}
