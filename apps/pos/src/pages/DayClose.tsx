import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, MoonStar, Printer, ShieldCheck, TriangleAlert } from 'lucide-react';
import { countedTotal, formatRupees, type DenomCounts, type ShiftSummary, type ZReport } from '@gokul/data';
import { Badge, Button, Dialog, Kbd, Money, PosLayout, cn, useToast } from '@gokul/ui';
import { api, useSession } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { DenomCounter } from '../components/DenomCounter';
import { ReportPreview } from '../components/ReportPreview';

type Dlg = null | 'xreport' | 'pin' | 'zreport';
const PIN_LEN = 4;

const DAYCLOSE_KEYS: KeyRows = [
  ['Next count row', ['Enter']],
  ['Print the X report', ['F8']],
  ['Close the day (Z, manager PIN)', ['F12']],
  ['Back to billing', ['Esc']],
];

export function DayClose() {
  useScreenKeys('Day close', DAYCLOSE_KEYS);
  const nav = useNavigate();
  const toast = useToast();
  const { user, settings, signOut } = useSession();
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [counts, setCounts] = useState<DenomCounts>({});
  const [dlg, setDlg] = useState<Dlg>(null);
  const [report, setReport] = useState<ZReport | null>(null);

  useEffect(() => { api.shiftSummary().then(setSummary); }, []);

  const counted = countedTotal(counts);
  const expected = summary?.expectedCash ?? 0;
  const diff = counted - expected;
  const hasCount = counted > 0;

  const askClose = useCallback(() => {
    if (!hasCount) { toast.show({ tone: 'warning', title: 'Count the drawer first', detail: 'Type how many notes of each kind are in the drawer.' }); return; }
    setDlg('pin');
  }, [hasCount, toast]);

  /* After the X report or PIN box closes, the keyboard goes back to the drawer count. */
  useEffect(() => {
    if (dlg === null) requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-label^="Count of"]')?.focus());
  }, [dlg]);

  const finish = useCallback(() => { setDlg(null); signOut(); nav('/login', { replace: true }); }, [nav, signOut]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (dlg || (e.key === 'Escape' && e.defaultPrevented)) return;
      if (e.key === 'Escape') { e.preventDefault(); nav('/billing'); }
      else if (e.key === 'F8') { e.preventDefault(); setDlg('xreport'); }
      else if (e.key === 'F12') { e.preventDefault(); askClose(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dlg, nav, askClose]);

  return (
    <PosLayout
      topBar={<TopBar />}
      sideWidth={440}
      keys={[
        { key: 'Enter', label: 'Next row' },
        { key: 'F8', label: 'Print X report', onClick: () => setDlg('xreport') },
        { key: 'Esc', label: 'Back to billing', onClick: () => nav('/billing') },
        { key: 'F12', label: 'Close day (Z)', tone: 'primary', onClick: askClose },
      ]}
      side={summary ? <XSummary s={summary} onPrint={() => setDlg('xreport')} /> : null}
    >
      <div className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><MoonStar size={21} /></span>
          <div>
            <h1 className="text-lg font-semibold leading-6 text-ink">Close the day</h1>
            <p className="text-sm text-muted">Count the drawer, check it against the books, then close with a manager PIN.</p>
          </div>
        </div>
        <Button variant="primary" onClick={askClose} kbd="F12" icon={<ShieldCheck size={16} />}>Close day (Z)</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-5">
        <div className="mx-auto w-full max-w-[920px]">
          <Compare summary={summary} counted={counted} diff={diff} hasCount={hasCount} />
          <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
            <DenomCounter compact autoFocus counts={counts} onChange={(k, n) => setCounts((c) => ({ ...c, [k]: n }))} onDone={askClose} doneLabel="close the day" />
          </div>
        </div>
      </div>

      <Dialog
        open={dlg === 'xreport'} onOpenChange={(o) => !o && setDlg(null)} size="sm" title="X report (interim)"
        description="Prints the day so far. The day stays open."
        footer={<><Button onClick={() => setDlg(null)} kbd="Esc">Close</Button><Button data-autofocus variant="primary" icon={<Printer size={15} />} kbd="Enter" onClick={() => { setDlg(null); toast.show({ tone: 'success', title: 'X report sent to printer' }); }}>Print</Button></>}
        bodyClassName="bg-surface-3 p-5"
      >
        {summary && <ReportPreview settings={settings} data={{ kind: 'X', summary, cashier: user?.name ?? '', counted: hasCount ? counted : undefined, difference: hasCount ? diff : undefined }} />}
      </Dialog>

      <PinDialog
        open={dlg === 'pin'} diff={diff} counted={counted} expected={expected} onClose={() => setDlg(null)}
        onLocked={() => { signOut(); nav('/login', { replace: true }); }}
        onApprove={async (pin) => {
          const r = await api.closeDay({ userId: user?.id ?? '', counts, managerPin: pin });
          if (r) { setReport(r); setDlg('zreport'); }
          return !!r;
        }}
      />

      <Dialog
        open={dlg === 'zreport'} onOpenChange={(o) => !o && finish()} size="sm"
        title={<span className="flex items-center gap-2"><CheckCircle2 size={18} className="text-success" /> Day closed</span>}
        description={report ? `Z report ${report.number}. Approved by ${report.approvedBy}.` : undefined}
        footer={<><Button icon={<Printer size={15} />} onClick={() => toast.show({ tone: 'success', title: 'Z report sent to printer' })}>Print again</Button><Button data-autofocus variant="primary" onClick={finish} kbd="Enter">Finish and sign out</Button></>}
        bodyClassName="bg-surface-3 p-5"
      >
        {report && <ReportPreview settings={settings} data={{ kind: 'Z', number: report.number, summary: report.summary, counted: report.counted, difference: report.difference, cashier: report.closedBy, approvedBy: report.approvedBy }} />}
      </Dialog>
    </PosLayout>
  );
}

/* ---------- expected vs counted ---------- */
function Compare({ summary, counted, diff, hasCount }: { summary: ShiftSummary | null; counted: number; diff: number; hasCount: boolean }) {
  const tone = !hasCount ? 'idle' : diff === 0 ? 'ok' : diff < 0 ? 'short' : 'excess';
  const box = {
    idle: 'border-line bg-surface text-muted',
    ok: 'border-success/40 bg-success-soft text-success',
    short: 'border-danger/40 bg-danger-soft text-danger',
    excess: 'border-warning/40 bg-warning-soft text-warning',
  }[tone];
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <div className="text-xs font-medium text-muted">Cash that should be in the drawer</div>
        <div className="num mt-0.5 text-2xl font-semibold tracking-tight text-ink"><Money paise={summary?.expectedCash ?? 0} decimals={false} /></div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted">
          <span className="flex justify-between"><span>Opening</span><b className="num text-ink"><Money paise={summary?.openingCash ?? 0} decimals={false} symbol={false} /></b></span>
          <span className="flex justify-between"><span>Cash sales</span><b className="num text-ink"><Money paise={summary?.byMode.cash ?? 0} decimals={false} symbol={false} /></b></span>
          <span className="flex justify-between"><span>+ Cash in</span><b className="num text-success"><Money paise={summary?.cashIn ?? 0} decimals={false} symbol={false} /></b></span>
          <span className="flex justify-between"><span>- Cash out</span><b className="num text-danger"><Money paise={summary?.cashOut ?? 0} decimals={false} symbol={false} /></b></span>
        </div>
      </div>
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <div className="text-xs font-medium text-muted">Cash you counted</div>
        <div className={cn('num mt-0.5 text-2xl font-semibold tracking-tight', hasCount ? 'text-ink' : 'text-subtle')}><Money paise={counted} decimals={false} /></div>
        <div className="mt-1.5 text-xs text-subtle">{hasCount ? 'From the count below' : 'Fill in the count below'}</div>
      </div>
      <div className={cn('rounded-card border px-4 py-3 transition-colors', box)}>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>{tone === 'ok' ? 'Tally' : tone === 'short' ? 'Drawer is SHORT' : tone === 'excess' ? 'Drawer has EXCESS' : 'Difference'}</span>
          {tone === 'short' || tone === 'excess' ? <TriangleAlert size={15} /> : tone === 'ok' ? <CheckCircle2 size={15} /> : null}
        </div>
        <div className="num mt-0.5 text-2xl font-semibold tracking-tight">{hasCount ? <Money paise={Math.abs(diff)} decimals={false} /> : '-'}</div>
        <div className="mt-1.5 text-xs">
          {tone === 'idle' ? 'Compared with the books' : tone === 'ok' ? 'Counted cash matches the books' : tone === 'short' ? 'Less cash than the books show' : 'More cash than the books show'}
        </div>
      </div>
    </div>
  );
}

/* ---------- X summary ---------- */
function XSummary({ s, onPrint }: { s: ShiftSummary; onPrint: () => void }) {
  const modes = useMemo(() => [
    { k: 'Cash', v: s.byMode.cash, c: 'bg-primary' },
    { k: 'UPI', v: s.byMode.upi, c: 'bg-info' },
    { k: 'Card', v: s.byMode.card, c: 'bg-accent' },
    { k: 'Credit', v: s.byMode.credit, c: 'bg-warning' },
  ], [s]);
  const total = modes.reduce((a, m) => a + m.v, 0) || 1;
  const opened = new Date(s.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-line px-5">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-md font-semibold text-ink">X summary</h2><Badge tone="success">Live</Badge></div>
          <p className="text-xs text-muted">{s.counter} - day opened {opened}</p>
        </div>
        <Button size="sm" icon={<Printer size={14} />} onClick={onPrint} kbd="F8" tabIndex={-1}>Print</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs font-medium text-muted">Total sales</div>
            <div className="num text-2xl font-semibold tracking-tight text-ink"><Money paise={s.sales} decimals={false} /></div>
          </div>
          <div className="text-right text-sm text-muted"><b className="num text-md text-ink">{s.billCount}</b> bills<br /><b className="num text-ink">{s.itemCount}</b> items</div>
        </div>

        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
          {modes.map((m) => <span key={m.k} className={m.c} style={{ width: `${(m.v / total) * 100}%` }} />)}
        </div>
        <div className="mt-2 divide-y divide-line/70">
          {modes.map((m) => (
            <div key={m.k} className="flex h-8 items-center justify-between text-base">
              <span className="flex items-center gap-2 text-muted"><span className={cn('h-2.5 w-2.5 rounded-sm', m.c)} />{m.k}<span className="text-xs text-subtle num">{Math.round((m.v / total) * 100)}%</span></span>
              <b className="num text-ink"><Money paise={m.v} decimals={false} /></b>
            </div>
          ))}
        </div>

        <Sec>Returns, cancels, discounts</Sec>
        <div className="divide-y divide-line/70">
          <Row k={`Returns (${s.returnsCount})`} v={<Money paise={s.returnsAmount} decimals={false} />} />
          <Row k={`Cancelled bills (${s.cancelCount})`} v={<Money paise={s.cancelAmount} decimals={false} />} />
          <Row k="Discounts given" v={<Money paise={s.discounts} decimals={false} />} />
        </div>

        <Sec>Drawer movements</Sec>
        <div className="divide-y divide-line/70">
          <Row k="Opening cash" v={<Money paise={s.openingCash} decimals={false} />} />
          <Row k="Cash in" v={<span className="text-success"><Money paise={s.cashIn} decimals={false} sign /></span>} />
          <Row k="Cash out" v={<span className="text-danger"><Money paise={-s.cashOut} decimals={false} /></span>} />
        </div>

        <Sec>GST collected</Sec>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 num text-sm">
          <div className="mb-1 grid grid-cols-[40px_1fr_1fr_1fr] gap-x-2 text-[11px] font-semibold uppercase tracking-wider text-subtle"><span>GST</span><span className="text-right">Taxable</span><span className="text-right">CGST</span><span className="text-right">SGST</span></div>
          {s.slabs.map((x) => (
            <div key={x.rate} className="grid grid-cols-[40px_1fr_1fr_1fr] gap-x-2 py-0.5">
              <span className="font-medium text-ink">{x.rate}%</span>
              <span className="text-right text-muted"><Money paise={x.taxable} decimals={false} symbol={false} /></span>
              <span className="text-right text-ink"><Money paise={x.cgst} decimals={false} symbol={false} /></span>
              <span className="text-right text-ink"><Money paise={x.sgst} decimals={false} symbol={false} /></span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total GST</span><Money paise={s.cgst + s.sgst} decimals={false} /></div>
        </div>
      </div>
    </div>
  );
}
function Sec({ children }: { children: string }) {
  return <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle">{children}</div>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex h-8 items-center justify-between text-base"><span className="text-muted">{k}</span><b className="num text-ink">{v}</b></div>;
}

/* ---------- manager PIN ---------- */
function PinDialog({ open, diff, counted, expected, onClose, onApprove, onLocked }: {
  open: boolean; diff: number; counted: number; expected: number; onClose: () => void; onApprove: (pin: string) => Promise<boolean>; onLocked: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPin(''); setError(null); setBusy(false); } }, [open]);

  const submit = async (p: string) => {
    if (busy) return;
    setBusy(true);
    let ok = false;
    let msg = 'Wrong PIN. Try again.';
    try { ok = await onApprove(p); } catch (e) {
      // Too many wrong PINs locks this user out: say so, then back to the sign-in screen.
      msg = e instanceof Error ? e.message : msg;
      if (/locked for|sign in/i.test(msg)) window.setTimeout(onLocked, 1800);
    }
    if (!ok) { setError(msg); window.setTimeout(() => { setPin(''); setBusy(false); if (!/locked for|sign in/i.test(msg)) setError(null); }, 500); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Manager approval" description="Closing the day (Z) cannot be undone. Ask the manager or owner to enter their PIN."
      footer={<Button onClick={onClose} kbd="Esc">Cancel</Button>}
    >
      <div className={cn('mb-4 rounded-lg px-3 py-2 text-sm', diff === 0 ? 'bg-success-soft text-success' : diff < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
        {diff === 0
          ? `Drawer tally. Counted ${formatRupees(counted, { decimals: false })}.`
          : `${diff < 0 ? 'Short' : 'Excess'} by ${formatRupees(Math.abs(diff), { decimals: false })}. Expected ${formatRupees(expected, { decimals: false })}, counted ${formatRupees(counted, { decimals: false })}.`}
      </div>
      <div className={cn('flex justify-center gap-3', error && 'animate-[shake_0.35s]')}>
        {Array.from({ length: PIN_LEN }, (_, i) => (
          <span key={i} className={cn('h-4 w-4 rounded-full border-2 transition-colors', i < pin.length ? (error ? 'border-danger bg-danger' : 'border-primary bg-primary') : 'border-line-strong')} />
        ))}
      </div>
      <input
        data-autofocus type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={PIN_LEN} aria-label="Manager PIN"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, PIN_LEN);
          setPin(v);
          if (v.length === PIN_LEN) window.setTimeout(() => void submit(v), 80);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === PIN_LEN) { e.preventDefault(); void submit(pin); } }}
        className="sr-only"
      />
      <div className="mt-3 min-h-4 text-center text-xs font-medium text-danger">{error ?? ''}</div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-subtle"><Kbd>0-9</Kbd> type the PIN, it checks by itself</div>
      <div className="mt-1 text-center text-xs text-subtle">Demo PINs: Lakshmi (manager) 2222, Suresh (owner) 1111</div>
    </Dialog>
  );
}
