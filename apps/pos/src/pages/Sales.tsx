import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, ChevronLeft, ChevronRight, CornerUpLeft, Lock, Printer, Receipt, Search } from 'lucide-react';
import { type Bill, type BillDetail, type CreditNote, type PayMode } from '@gokul/data';
import { printWithToast } from '../printing';
import { useScanHandler } from '../scanner';
import { useReceiptConfig } from '../receiptConfig';
import { Badge, Button, EmptyState, IconButton, Input, Kbd, Money, PosLayout, ReceiptPreview, cn, useToast, type FKey } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { BillDetailPane } from '../components/billops/BillDetailPane';
import { CancelBillDialog } from '../components/billops/CancelBillDialog';
import { CreditNoteDialog } from '../components/billops/CreditNoteDialog';
import { billReceipt, dayKey, dayLabel, modeLabel, payLabel, shiftDay, timeOf } from '../components/billops/helpers';

type Dialog = null | 'cancel' | 'note';

const SALES_KEYS: KeyRows = [
  ['Move between bills', ['Up', 'Down']],
  ['Jump a page', ['PageUp', 'PageDown']],
  ['Reprint the selected bill', ['Enter', 'Ctrl+P']],
  ['Back to today', ['F2']],
  ['Cancel the bill (manager PIN)', ['F6']],
  ['Return items from the bill', ['F10']],
  ['Day before / after', ['Ctrl+Left', 'Ctrl+Right']],
  ['All days (manager)', ['Ctrl+Enter']],
  ['Clear search, or back to billing', ['Esc']],
];

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
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState<CreditNote | null>(null);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const today = dayKey(new Date());
  /** Cashiers see today only; the owner and managers can open any day. Totals are visible to everyone. */
  const canBrowse = user?.role !== 'cashier';
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
      setSelId((cur) => (cur && r.some((b) => b.id === cur) ? cur : r[0]?.id ?? null));
    });
    return () => { live = false; };
  }, [date, query, allDays, version]);

  useEffect(() => { void api.listCreditNotes(500).then(setNotes); }, [version]);

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

  const reprint = useCallback(async () => {
    if (!detail || detail.bill.status === 'cancelled') { toast.show({ tone: 'info', title: 'Cancelled bills cannot be printed' }); return; }
    await api.recordReprint(detail.bill.id, user?.name ?? '');
    setVersion((v) => v + 1);
    await printWithToast('bill', detail.bill.id, { duplicate: true }, toast, `Printed ${detail.bill.number}`);
  }, [detail, toast, user]);

  const startReturn = useCallback(() => {
    if (!detail) return;
    if (detail.bill.status === 'cancelled') { toast.show({ tone: 'warning', title: 'This bill is cancelled', detail: 'Nothing to return.' }); return; }
    nav('/returns', { state: { billNumber: detail.bill.number } });
  }, [detail, nav, toast]);

  const askCancel = useCallback(() => {
    if (!detail) return;
    if (detail.bill.status === 'cancelled') { toast.show({ tone: 'info', title: 'Already cancelled' }); return; }
    if (detail.returned.some((q) => q > 0)) { toast.show({ tone: 'warning', title: 'Items were returned on this bill', detail: 'A bill with returns cannot be cancelled.' }); return; }
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
    setSelId((cur) => {
      if (!bills.length) return null;
      const i = bills.findIndex((b) => b.id === cur);
      return bills[Math.max(0, Math.min(bills.length - 1, (i < 0 ? 0 : i) + by))].id;
    });
  }, [bills]);

  const changeDay = (by: number) => {
    if (!canBrowse) return;
    setAllDays(false);
    setDate((d) => { const n = shiftDay(d, by); return n > today ? d : n; });
  };

  /* keys (latest closure via ref) */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (dialog) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'p') { e.preventDefault(); void reprint(); return; }
    if (e.ctrlKey && k === 'arrowleft') { e.preventDefault(); changeDay(-1); return; }
    if (e.ctrlKey && k === 'arrowright') { e.preventDefault(); changeDay(1); return; }
    if (e.ctrlKey && k === 'enter') { e.preventDefault(); if (canBrowse) setAllDays((v) => !v); return; }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'PageDown': e.preventDefault(); move(8); break;
      case 'PageUp': e.preventDefault(); move(-8); break;
      case 'Enter': e.preventDefault(); void reprint(); break;
      case 'F2': e.preventDefault(); setAllDays(false); setDate(today); setQuery(''); break;
      case 'F6': e.preventDefault(); askCancel(); break;
      case 'F10': e.preventDefault(); startReturn(); break;
      case 'Escape':
        e.preventDefault();
        if (query) setQuery(''); else nav('/billing');
        break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const keys: FKey[] = [
    { key: 'Esc', label: query ? 'Clear search' : 'Back to billing', onClick: () => (query ? setQuery('') : nav('/billing')) },
    { key: 'F2', label: 'Today', onClick: () => { setAllDays(false); setDate(today); setQuery(''); } },
    ...(canBrowse ? [
      { key: 'Ctrl+Left', label: 'Day before', onClick: () => changeDay(-1) },
      { key: 'Ctrl+Right', label: 'Day after', onClick: () => changeDay(1) },
      { key: 'Ctrl+Enter', label: allDays ? 'This day only' : 'All days', onClick: () => setAllDays((v) => !v) },
    ] : []),
    { key: 'Enter', label: 'Reprint', onClick: () => void reprint() },
    { key: 'F6', label: 'Cancel bill', tone: 'danger', onClick: askCancel },
    { key: 'F10', label: 'Return items', tone: 'primary', onClick: startReturn },
  ];

  const cancelled = detail?.bill.status === 'cancelled';
  const scope = allDays ? 'All days' : dayLabel(date);

  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      <TotalsStrip s={summary} scope={scope} />
      <div className="flex min-h-0 flex-1">
        {/* ---------- left: list ---------- */}
        <section className="flex w-[clamp(360px,28vw,500px)] shrink-0 flex-col border-r border-line bg-surface">
          <div className="space-y-2.5 border-b border-line p-3">
            <Input
              icon={<Search size={16} />} ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} size="lg" autoComplete="off" spellCheck={false}
              placeholder="Bill no, customer or amount" aria-label="Search bills"
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
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs">
            <span className="font-semibold text-ink">{scope}</span>
            {canBrowse
              ? <span className="text-muted"><b className="num text-ink">{summary.count}</b> {summary.count === 1 ? 'bill' : 'bills'}</span>
              : <span className="flex items-center gap-1 text-subtle"><Lock size={11} /> Today only</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {loaded && bills.length === 0 && (
              <li className="px-4 py-10">
                <EmptyState
                  icon={<Search size={20} />} title={query ? `No bill matches "${query}"` : 'No bills on this day'}
                  hint={query && !allDays && canBrowse ? <span className="flex items-center justify-center gap-1.5">Search every day with <Kbd>Ctrl+Enter</Kbd></span> : canBrowse ? 'Pick another day with Ctrl + arrow keys.' : undefined}
                />
              </li>
            )}
            {bills.map((b) => {
              const on = b.id === selId;
              const dead = b.status === 'cancelled';
              return (
                <li
                  key={b.id} onClick={() => { setSelId(b.id); refocus(); }}
                  ref={(el) => { if (el && on) el.scrollIntoView({ block: 'nearest' }); }}
                  className={cn('relative flex h-[58px] cursor-default items-center gap-3 border-b border-line/70 px-4', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('num text-sm font-semibold', dead ? 'text-subtle line-through' : 'text-ink')}>{b.number}</span>
                      {dead && <Badge tone="danger" className="!h-[18px] !px-1.5 text-[11px]">Cancelled</Badge>}
                      {b.status === 'returned' && <Badge tone="warning" className="!h-[18px] !px-1.5 text-[11px]">Returned</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {allDays && <>{new Date(b.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - </>}{timeOf(b.at)} - {b.customerName}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money paise={b.totals.grand} className={cn('text-base font-semibold', dead ? 'text-subtle line-through' : 'text-ink')} />
                    <div className="text-[11px] font-medium text-muted">{payLabel(b)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- right: detail + receipt ---------- */}
        <section className="flex min-w-0 flex-1 flex-col bg-surface">
          {detail && settings ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <BillDetailPane detail={detail} onOpenNote={(n) => { setNote(n); setDialog('note'); }} />
                <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
                  <Button variant="primary" icon={<Printer size={15} />} kbd="Ctrl+P" disabled={cancelled} onClick={() => void reprint()}>Reprint bill</Button>
                  <Button icon={<CornerUpLeft size={15} />} kbd="F10" disabled={cancelled} onClick={startReturn}>Return items</Button>
                  <div className="flex-1" />
                  <Button variant="danger" icon={<Ban size={15} />} kbd="F6" disabled={cancelled} onClick={askCancel}>Cancel bill</Button>
                </div>
              </div>
              <div className="w-[356px] shrink-0 overflow-y-auto border-l border-line bg-surface-3 px-3 py-4">
                <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">Receipt preview - 80 mm</div>
                <ReceiptPreview data={billReceipt(detail, receiptCfg)} settings={settings} shop={receiptCfg} />
              </div>
            </div>
          ) : (
            <EmptyState icon={<Receipt size={22} />} title="Select a bill" hint="Use the Up and Down keys to move through the bills." className="flex-1" />
          )}
        </section>
      </div>

      <CancelBillDialog open={dialog === 'cancel'} detail={detail} onClose={closeDialog} onConfirm={doCancel} />
      {settings && (
        <CreditNoteDialog
          open={dialog === 'note'} note={note} settings={settings} onClose={closeDialog}
          onPrint={() => { if (note) void printWithToast('creditNote', note.id, { duplicate: true }, toast, `Printed ${note.number}`); }}
        />
      )}
    </PosLayout>
  );
}

const MODE_ORDER: PayMode[] = ['cash', 'upi', 'card', 'credit', 'credit_note'];
const MODE_BAR: Record<PayMode, string> = { cash: 'bg-primary', upi: 'bg-info', card: 'bg-accent', credit: 'bg-warning', credit_note: 'bg-subtle', points: 'bg-subtle' };

interface Totals { live: number; cancelled: number; total: number; avg: number; returns: number; returned: number; byMode: Partial<Record<PayMode, number>> }

/** Day totals. Visible to every user (owner's choice), so a cashier can tell the manager how the day is going. */
function TotalsStrip({ s, scope }: { s: Totals; scope: string }) {
  const modes = MODE_ORDER.filter((m) => (s.byMode[m] ?? 0) > 0);
  const sum = modes.reduce((t, m) => t + (s.byMode[m] ?? 0), 0) || 1;
  return (
    <div className="flex shrink-0 items-stretch gap-px border-b border-line bg-line">
      <Stat label={`Sales - ${scope}`} wide><Money paise={s.total} className="text-2xl font-bold tracking-tight text-ink" /></Stat>
      <Stat label="Bills" hint={s.cancelled ? `${s.cancelled} cancelled` : undefined}><span className="num text-xl font-semibold text-ink">{s.live}</span></Stat>
      <Stat label="Average bill"><Money paise={s.avg} className="text-xl font-semibold text-ink" decimals={false} /></Stat>
      <Stat label="Returns" hint={s.returns ? `${s.returns} credit ${s.returns === 1 ? 'note' : 'notes'}` : 'None'}>
        <Money paise={s.returned} className={cn('text-xl font-semibold', s.returned ? 'text-warning' : 'text-ink')} decimals={false} />
      </Stat>
      <div className="min-w-0 flex-[1.6] bg-surface px-5 py-2.5">
        <div className="text-xs font-medium text-muted">Received by</div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-3">
          {modes.map((m) => <span key={m} className={MODE_BAR[m]} style={{ width: `${((s.byMode[m] ?? 0) / sum) * 100}%` }} />)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {modes.length === 0 && <span className="text-subtle">No payments yet</span>}
          {modes.map((m) => (
            <span key={m} className="flex items-center gap-1.5 text-muted">
              <span className={cn('h-2 w-2 rounded-sm', MODE_BAR[m])} />{modeLabel[m]} <Money paise={s.byMode[m] ?? 0} decimals={false} className="font-semibold text-ink" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('bg-surface px-5 py-2.5', wide ? 'flex-[1.3]' : 'flex-1')}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
      <div className="h-4 text-xs text-subtle">{hint}</div>
    </div>
  );
}
