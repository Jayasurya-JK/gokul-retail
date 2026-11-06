import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, ShoppingCart, Trash2 } from 'lucide-react';
import {
  computeGrn, parsePaise, parseQty, type Grn, type GrnDraftLine, type Purchasable, type SupplierPayMode, type SupplierSummary,
} from '@gokul/data';
import { Badge, Button, Checkbox, Combobox, Dialog, Field, Input, Money, NumberInput, PageHeader, Select, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtMilli, fmtDate, todayYmd, useKeys } from './common';

interface Row { key: number; item: Purchasable | null; q: string; qty: string; rate: string; disc: string; gst: string }
const newRow = (key: number): Row => ({ key, item: null, q: '', qty: '', rate: '', disc: '', gst: '' });
const COLS = 5; // item, qty, rate, disc, gst
const grid = '32px minmax(160px,1fr) 92px 44px 100px 66px 58px 112px 32px';

const rupees = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
const modeOptions: { value: SupplierPayMode; label: string }[] = [
  { value: 'bank', label: 'Bank transfer' }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' },
];

/* ---------------- item picker cell ---------------- */
function ItemCell({ row, rowIndex, onText, onPick, onNav, onFocusRow }: {
  row: Row; rowIndex: number; onText: (v: string) => void; onPick: (p: Purchasable) => void;
  onNav: (e: KeyboardEvent<HTMLInputElement>) => void; onFocusRow: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Purchasable[]>([]);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.searchPurchasable(row.q, 8).then((r) => { if (live) { setResults(r); setHi(0); } });
    return () => { live = false; };
  }, [row.q, open]);

  const show = () => { setRect(ref.current?.getBoundingClientRect() ?? null); setOpen(true); };
  const pick = (p: Purchasable) => { onPick(p); setOpen(false); };

  return (
    <div className="relative">
      <input
        ref={ref} data-cell={`${rowIndex}-0`} value={row.q} placeholder={rowIndex === 0 ? 'Type seed or item name' : ''}
        autoComplete="off" spellCheck={false}
        className="h-8 w-full rounded-control border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-subtle hover:border-line-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/25"
        onFocus={(e) => { onFocusRow(); e.currentTarget.select(); show(); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onText(e.target.value); show(); }}
        onKeyDown={(e) => {
          if (open && results.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
            if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && row.q.trim() && !row.item)) {
              if (row.q.trim() && (!row.item || row.item.name !== row.q)) { e.preventDefault(); pick(results[hi]); return; }
            }
          }
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); return; }
          onNav(e);
        }}
      />
      {open && rect && results.length > 0 && createPortal(
        <ul
          style={{ position: 'fixed', left: rect.left, top: rect.bottom + 4, width: Math.max(380, rect.width), zIndex: 90 }}
          className="g-overlay max-h-72 overflow-auto rounded-control border border-line bg-surface p-1 shadow-pop"
        >
          {results.map((p, i) => (
            <li
              key={p.id} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHi(i)}
              className={cn('flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm', i === hi && 'bg-primary-soft')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-ink">{p.name}</span>
                {p.kind === 'seed' && <Badge tone="warning">Seed</Badge>}
                {p.kind === 'material' && <Badge tone="info">Packing</Badge>}
              </span>
              <span className="num shrink-0 text-xs text-subtle">{fmtMilli(p.stock, 0)} {p.unit} in stock</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

function NumCell({ rowIndex, col, value, onChange, onNav, onFocusRow, disabled, decimals = 3, align = 'right', placeholder }: {
  rowIndex: number; col: number; value: string; onChange: (v: string) => void; onNav: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocusRow: () => void; disabled?: boolean; decimals?: number; align?: 'right'; placeholder?: string;
}) {
  return (
    <input
      data-cell={`${rowIndex}-${col}`} value={value} disabled={disabled} inputMode="decimal" autoComplete="off" placeholder={placeholder}
      onFocus={(e) => { onFocusRow(); e.currentTarget.select(); }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '');
        const p = raw.split('.');
        onChange(p.length > 1 ? `${p[0]}.${p.slice(1).join('').slice(0, decimals)}` : raw);
      }}
      onKeyDown={onNav}
      className={cn(
        'num h-8 w-full rounded-control border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-subtle hover:border-line-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/25 disabled:hover:border-transparent',
        align === 'right' && 'text-right',
      )}
    />
  );
}

/* ---------------- main entry screen ---------------- */
export function PurchaseEntry({ suppliers, onCancel, onSaved }: { suppliers: SupplierSummary[]; onCancel: () => void; onSaved: (g: Grn) => void }) {
  const toast = useToast();
  const seq = useRef(1);
  const [rows, setRows] = useState<Row[]>([newRow(0)]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayYmd());
  const [freight, setFreight] = useState('');
  const [other, setOther] = useState('');
  const [payNow, setPayNow] = useState(false);
  const [paidText, setPaidText] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<SupplierPayMode>('bank');
  const [updateCost, setUpdateCost] = useState(true);
  const [activeRow, setActiveRow] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const supplier = suppliers.find((s) => s.profile.id === supplierId) ?? null;
  const interstate = !!supplier && !supplier.profile.gstin.startsWith('33');

  useEffect(() => { wrap.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, []);

  const focusCell = useCallback((r: number, c: number) => {
    window.setTimeout(() => wrap.current?.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)?.focus(), 0);
  }, []);

  const patch = (i: number, p: Partial<Row>) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const valid = useMemo(() => rows.map((r) => {
    const qty = parseQty(r.qty); const rate = parsePaise(r.rate);
    return r.item && qty && qty > 0 && rate !== null && rate > 0 ? { itemId: r.item.id, qty, rate, discountPct: Number(r.disc) || 0, gstRate: Number(r.gst) || 0 } as GrnDraftLine : null;
  }), [rows]);
  const lines = useMemo(() => valid.filter((l): l is GrnDraftLine => !!l), [valid]);
  const freightP = parsePaise(freight) ?? 0;
  const otherP = parsePaise(other) ?? 0;
  const totals = useMemo(() => computeGrn(lines, freightP, otherP, interstate), [lines, freightP, otherP, interstate]);
  const lineAmount = (i: number) => {
    const l = valid[i];
    if (!l) return null;
    return computeGrn([l], 0, 0, false).lines[0].amount;
  };
  const paidP = payNow ? Math.min(parsePaise(paidText ?? '') ?? (paidText === null ? totals.total : 0), totals.total) : 0;
  const dueP = totals.total - paidP;
  const dirty = rows.some((r) => r.item) || invoiceNo.trim() !== '';

  const addRowIfLast = (i: number) => { if (i === rows.length - 1) setRows((xs) => [...xs, newRow(seq.current++)]); };

  const nav = (i: number, c: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    const row = rows[i];
    if (e.key === 'Enter') {
      e.preventDefault();
      if (c === 0) { if (row.item) focusCell(i, 1); return; }
      if (c < 3) { focusCell(i, c + 1); return; }
      // after discount, jump to the next row's item
      if (row.item) { addRowIfLast(i); focusCell(i + 1, 0); }
      return;
    }
    if (e.key === 'ArrowDown' && !e.altKey) { e.preventDefault(); if (i < rows.length - 1) focusCell(i + 1, c); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) focusCell(i - 1, c); return; }
    if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); removeRow(i); return; }
    if (e.key === 'Tab' && !e.shiftKey && c === COLS - 1 && row.item) { e.preventDefault(); addRowIfLast(i); focusCell(i + 1, 0); }
  };

  const removeRow = (i: number) => {
    setRows((xs) => (xs.length === 1 ? [newRow(seq.current++)] : xs.filter((_, j) => j !== i)));
    focusCell(Math.max(0, Math.min(i, rows.length - 2)), 0);
  };

  const pickItem = (i: number, p: Purchasable) => {
    patch(i, { item: p, q: p.name, rate: rupees(p.cost), gst: String(p.gstRate), qty: rows[i].qty, disc: rows[i].disc });
    addRowIfLast(i);
    focusCell(i, 1);
  };

  const save = async () => {
    const errs: string[] = [];
    if (!supplier) errs.push('Choose the supplier.');
    if (!invoiceNo.trim()) errs.push('Enter the supplier invoice number.');
    if (lines.length === 0) errs.push('Add at least one item with quantity and rate.');
    const half = rows.findIndex((r, i) => r.item && !valid[i]);
    if (half >= 0) errs.push(`Row ${half + 1} needs a quantity and a rate.`);
    if (payNow && (parsePaise(paidText ?? '') ?? paidP) > totals.total) errs.push('Paid amount is more than the bill total.');
    setErrors(errs);
    if (errs.length || !supplier) return;
    setBusy(true);
    try {
      const g = await api.createGrn({
        supplierId: supplier.profile.id, invoiceNo: invoiceNo.trim(), invoiceDate, lines, freight: freightP, otherCharges: otherP,
        paidNow: paidP, payMode, updateCost,
      });
      toast.show({ tone: 'success', title: `Purchase ${g.number} saved`, detail: `${g.lines.length} items added to stock from ${g.supplierName}.` });
      onSaved(g);
    } catch (e) { setErrors([e instanceof Error ? e.message : 'Could not save the purchase.']); } finally { setBusy(false); }
  };

  const tryCancel = () => { if (dirty) setConfirmCancel(true); else onCancel(); };

  useKeys((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    else if (e.key === 'Escape') { e.preventDefault(); tryCancel(); }
  });

  const dueDate = supplier ? new Date(new Date(invoiceDate).getTime() + supplier.profile.creditDays * 86400000).toISOString() : null;
  const active = rows[activeRow]?.item ?? null;

  return (
    <>
      <PageHeader
        title="New purchase" subtitle="Goods received note. Stock and supplier balance update when you save." icon={<ShoppingCart size={17} />}
        actions={<><Button onClick={tryCancel} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy} onClick={() => void save()}>Save purchase</Button></>}
      />
      <div ref={wrap} className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* bill header */}
          <div className="grid shrink-0 grid-cols-[minmax(200px,1.6fr)_minmax(140px,1fr)_160px] items-start gap-4 border-b border-line bg-surface px-5 py-3">
            <div>
              <Combobox
                label="Supplier" placeholder="Search supplier" value={supplierId} onChange={(v) => { setSupplierId(v); window.setTimeout(() => wrap.current?.querySelector<HTMLInputElement>('[data-hdr="inv"]')?.focus(), 0); }}
                options={suppliers.map((s) => ({ value: s.profile.id, label: s.profile.name, hint: s.profile.city }))}
              />
              <div className="mt-1 h-4 truncate text-xs text-subtle">
                {supplier ? <><span className="num">{supplier.profile.gstin || 'No GSTIN'}</span> - {interstate ? 'Other state, IGST' : 'Tamil Nadu, CGST + SGST'}</> : 'Pick the party on the supplier invoice'}
              </div>
            </div>
            <div>
              <Input label="Supplier invoice no" data-hdr="inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); wrap.current?.querySelector<HTMLInputElement>('[data-hdr="date"]')?.focus(); } }} placeholder="e.g. SM/2641" className="num" />
              <div className="mt-1 h-4 text-xs text-subtle">Needed for input GST</div>
            </div>
            <div>
              <Input label="Invoice date" type="date" data-hdr="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusCell(0, 0); } }} />
              <div className="mt-1 h-4 text-xs text-subtle">{dueDate ? <>Due {fmtDate(dueDate)}</> : ''}</div>
            </div>
          </div>

          {/* item grid */}
          <div className="min-h-0 flex-1 overflow-auto bg-surface">
            <div className="sticky top-0 z-10 grid h-8 items-center border-b border-line bg-surface-2 px-5 text-xs font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: grid }}>
              <span>#</span><span className="px-2">Item</span><span className="px-2 text-right">Qty</span><span className="px-2">Unit</span>
              <span className="px-2 text-right">Rate</span><span className="px-2 text-right">Disc %</span><span className="px-2 text-right">GST %</span>
              <span className="px-2 text-right">Amount</span><span />
            </div>
            {rows.map((r, i) => {
              const amt = lineAmount(i);
              const incomplete = r.item && !valid[i];
              return (
                <div
                  key={r.key} onFocusCapture={() => setActiveRow(i)}
                  className={cn('grid h-10 items-center border-b border-line/70 px-5', activeRow === i ? 'bg-primary-soft/60' : 'hover:bg-surface-2/60')}
                  style={{ gridTemplateColumns: grid }}
                >
                  <span className="num text-xs text-subtle">{i + 1}</span>
                  <ItemCell
                    row={r} rowIndex={i} onFocusRow={() => setActiveRow(i)} onNav={nav(i, 0)}
                    onText={(v) => patch(i, v === '' ? { q: '', item: null, rate: '', gst: '', qty: '', disc: '' } : { q: v, item: r.item && r.item.name === v ? r.item : null })}
                    onPick={(p) => pickItem(i, p)}
                  />
                  <NumCell rowIndex={i} col={1} value={r.qty} onChange={(v) => patch(i, { qty: v })} onNav={nav(i, 1)} onFocusRow={() => setActiveRow(i)} placeholder={r.item ? '0' : ''} />
                  <span className="px-2 text-xs text-muted">{r.item?.unit ?? ''}</span>
                  <NumCell rowIndex={i} col={2} value={r.rate} decimals={2} onChange={(v) => patch(i, { rate: v })} onNav={nav(i, 2)} onFocusRow={() => setActiveRow(i)} />
                  <NumCell rowIndex={i} col={3} value={r.disc} decimals={2} onChange={(v) => patch(i, { disc: v })} onNav={nav(i, 3)} onFocusRow={() => setActiveRow(i)} placeholder={r.item ? '0' : ''} />
                  <NumCell rowIndex={i} col={4} value={r.gst} decimals={0} onChange={(v) => patch(i, { gst: v })} onNav={nav(i, 4)} onFocusRow={() => setActiveRow(i)} />
                  <span className="num px-2 text-right text-sm font-semibold text-ink">
                    {amt !== null ? <Money paise={amt} symbol={false} /> : incomplete ? <span className="text-xs font-normal text-warning">Qty and rate</span> : ''}
                  </span>
                  <button tabIndex={-1} aria-label="Remove row" onClick={() => removeRow(i)} className={cn('flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-danger-soft hover:text-danger', !r.item && 'invisible')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* context bar */}
          <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface-2 px-5 text-xs text-muted">
            {active ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate font-medium text-ink">{active.name}</span>
                <span className="num">In stock {fmtMilli(active.stock)} {active.unit}</span>
                <span className="num">Last cost <Money paise={active.cost} />/{active.unit}</span>
                <span className="num">HSN {active.hsn}</span>
              </span>
            ) : <span>Type an item name, then Enter for quantity, rate and discount.</span>}
            <span className="shrink-0">Enter next field  |  Ctrl+Del remove row  |  Up/Down move rows</span>
          </div>
        </div>

        {/* summary */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Bill summary</div>
            <dl className="mt-2 text-sm">
              <SumRow k="Items value"><Money paise={totals.gross} /></SumRow>
              {totals.discount > 0 && <SumRow k="Trade discount"><span className="text-success">-<Money paise={totals.discount} symbol={false} /></span></SumRow>}
              <SumRow k="Taxable value"><Money paise={totals.taxable} /></SumRow>
              {interstate
                ? <SumRow k="IGST (input)"><Money paise={totals.igst} /></SumRow>
                : <><SumRow k="CGST (input)"><Money paise={totals.cgst} /></SumRow><SumRow k="SGST (input)"><Money paise={totals.sgst} /></SumRow></>}
              <div className="flex items-center justify-between gap-3 py-1">
                <dt className="text-muted">Freight</dt>
                <dd className="w-28"><NumberInput size="sm" prefix={'₹'} value={freight} onValueChange={setFreight} placeholder="0" /></dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <dt className="text-muted">Other charges</dt>
                <dd className="w-28"><NumberInput size="sm" prefix={'₹'} value={other} onValueChange={setOther} placeholder="0" /></dd>
              </div>
              {totals.roundOff !== 0 && <SumRow k="Round off"><Money paise={totals.roundOff} sign symbol={false} /></SumRow>}
            </dl>
            <div className="mt-2 flex items-end justify-between border-t border-line pt-3">
              <span className="text-sm font-medium text-ink">Total payable</span>
              <Money paise={totals.total} className="text-2xl font-semibold text-ink" />
            </div>

            <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Payment</div>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-control bg-surface-3 p-1">
              {[{ v: false, l: 'On credit' }, { v: true, l: 'Paid now' }].map((o) => (
                <button
                  key={o.l} type="button" onClick={() => { setPayNow(o.v); setPaidText(null); }}
                  className={cn('h-7 rounded-md text-sm font-medium transition-colors', payNow === o.v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
                >{o.l}</button>
              ))}
            </div>
            {payNow && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Amount paid"><NumberInput prefix={'₹'} value={paidText ?? rupees(totals.total)} onValueChange={setPaidText} onFocus={(e) => e.currentTarget.select()} /></Field>
                <Select label="Paid by" value={payMode} onChange={(e) => setPayMode(e.target.value as SupplierPayMode)} options={modeOptions} />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between rounded-card border border-line bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Balance added to supplier</span>
              <Money paise={dueP} className={cn('font-semibold', dueP > 0 ? 'text-ink' : 'text-success')} />
            </div>

            <div className="mt-4 rounded-card border border-line p-3">
              <Checkbox checked={updateCost} onCheckedChange={setUpdateCost} label="Update cost price of these items" />
              <p className="mt-1.5 pl-6 text-xs text-subtle">Sets each item cost to this purchase rate after discount, so margin reports stay right.</p>
            </div>
          </div>
          {errors.length > 0 && (
            <div className="shrink-0 border-t border-danger/30 bg-danger-soft px-4 py-2.5">
              {errors.map((x) => <div key={x} className="flex items-start gap-2 text-sm text-danger"><CircleAlert size={14} className="mt-0.5 shrink-0" />{x}</div>)}
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={confirmCancel} onOpenChange={setConfirmCancel} size="sm" title="Discard this purchase?" description="Nothing has been saved. The items you entered will be lost."
        footer={<><Button onClick={() => setConfirmCancel(false)} kbd="Esc">Keep editing</Button><Button variant="danger" onClick={onCancel}>Discard</Button></>}
      ><span /></Dialog>
    </>
  );
}

function SumRow({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between py-1"><dt className="text-muted">{k}</dt><dd className="num text-ink">{children}</dd></div>;
}
