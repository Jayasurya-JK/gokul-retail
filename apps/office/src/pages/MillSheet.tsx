import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Factory, Lock, Plus, Printer, Save, Trash2 } from 'lucide-react';
import {
  MACHINES, MILL_SEEDS, PUNNAKU, formatRupees, type Customer, type Machine, type MillSeed, type MillSheet, type MillSheetInput, type MillSheetSummary,
  type MillStockKey, type MillStockLine, type PunnakuKey, type Supplier,
} from '@gokul/data';
import { Badge, Button, Card, Dialog, Field, Input, Kbd, ManagerPinDialog, PageHeader, cn, useToast } from '@gokul/ui';
import { api } from '../store';
import { isoDay } from '../components/crm/common';
import { fmtQty, fromMilli, longDay, toMilli } from '../components/mill/millUtil';
import { SheetPaper } from '../components/mill/SheetPaper';

interface OpS { operator: string; seed: MillSeed; machine: Machine; kg: string; oil: string; cake: string; jag: string }
interface CustS { customerId: string; seed: MillSeed; machine: Machine; kg: string; oil: string; cake: string; mode: 'taken' | 'kept' }
interface PunS { punnaku: PunnakuKey; kg: string; supplierId: string; note: string }
interface Form { supervisor: string; note: string; ops: OpS[]; custs: CustS[]; puns: PunS[]; physical: Record<string, string> }

const EMPTY: Form = { supervisor: '', note: '', ops: [], custs: [], puns: [], physical: {} };

const toForm = (s: MillSheet): Form => ({
  supervisor: s.supervisor, note: s.note,
  ops: s.opRows.map((r) => ({ operator: r.operator, seed: r.seed, machine: r.machine, kg: fromMilli(r.seedKg), oil: fromMilli(r.oilL), cake: fromMilli(r.cakeKg), jag: fromMilli(r.jaggeryKg) })),
  custs: s.custRows.map((r) => ({ customerId: r.customerId, seed: r.seed, machine: r.machine, kg: fromMilli(r.seedKg), oil: fromMilli(r.oilL), cake: fromMilli(r.cakeKg), mode: r.cakeMode })),
  puns: s.punnakuRows.map((r) => ({ punnaku: r.punnaku, kg: fromMilli(r.qtyKg), supplierId: r.supplierId ?? '', note: r.note ?? '' })),
  physical: Object.fromEntries(s.stock.filter((l) => l.physical !== null).map((l) => [l.key, fromMilli(l.physical ?? 0) || '0'])),
});

/** Only complete rows go to the backend while typing; the rest stay on screen until they are filled in. */
const toInput = (day: string, f: Form): MillSheetInput => ({
  day, supervisor: f.supervisor, note: f.note,
  opRows: f.ops.filter((r) => toMilli(r.kg) > 0 && r.operator).map((r) => ({ operator: r.operator, seed: r.seed, machine: r.machine, seedKg: toMilli(r.kg), oilL: toMilli(r.oil), cakeKg: toMilli(r.cake), jaggeryKg: toMilli(r.jag) })),
  custRows: f.custs.filter((r) => toMilli(r.kg) > 0 && r.customerId && (r.mode !== 'kept' || toMilli(r.cake) > 0)).map((r) => ({ customerId: r.customerId, seed: r.seed, machine: r.machine, seedKg: toMilli(r.kg), oilL: toMilli(r.oil), cakeKg: toMilli(r.cake), cakeMode: r.mode })),
  punnakuRows: f.puns.filter((r) => toMilli(r.kg) > 0).map((r) => ({ punnaku: r.punnaku, qtyKg: toMilli(r.kg), supplierId: r.supplierId || undefined, note: r.note })),
  physical: Object.fromEntries(Object.entries(f.physical).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, toMilli(v)])) as Partial<Record<MillStockKey, number>>,
});

const shiftDay = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const cellCls = 'h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:border-transparent disabled:bg-transparent disabled:text-ink';
const numCls = `${cellCls} num text-right`;
const th = 'px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';

export function MillSheetPage() {
  const toast = useToast();
  const today = isoDay(new Date());
  const [day, setDay] = useState(today);
  const [sheet, setSheet] = useState<MillSheet | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [list, setList] = useState<MillSheetSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [shop, setShop] = useState('Gokul Oils');
  const [state, setState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [closing, setClosing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const loaded = useRef('');
  const closed = sheet?.status === 'closed';

  const refreshList = useCallback(() => { void api.listMillSheets(40).then(setList); }, []);
  useEffect(() => {
    void api.listCustomers().then(setCustomers);
    void api.listSuppliers().then(setSuppliers);
    void api.getSettings().then((s) => setShop(s.shopName));
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    let live = true;
    setState('saved'); setError(null);
    void api.getMillSheet(day).then((s) => { if (!live) return; loaded.current = day; setSheet(s); setForm(toForm(s)); });
    return () => { live = false; };
  }, [day]);

  /* Auto-save the draft a moment after typing stops (it only saves; nothing touches stock until the sheet is closed). */
  const formRef = useRef(form);
  formRef.current = form;
  const saveNow = useCallback(async (): Promise<MillSheet | null> => {
    if (loaded.current !== day) return null;
    setState('saving');
    try {
      const s = await api.saveMillSheet(toInput(day, formRef.current));
      setSheet(s); setError(null); setState('saved'); refreshList();
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save'); setState('dirty');
      return null;
    }
  }, [day, refreshList]);
  useEffect(() => {
    if (state !== 'dirty' || closed) return;
    const t = window.setTimeout(() => void saveNow(), 700);
    return () => window.clearTimeout(t);
  }, [form, state, closed, saveNow]);

  const edit = (f: (p: Form) => Form) => { if (closed) return; setForm(f); setState('dirty'); };

  /* Enter walks to the next cell of the same grid; on the very last cell it adds a row. */
  const gridKey = (grid: string, add: () => void) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    const cells = Array.from(root.current?.querySelectorAll<HTMLElement>(`[data-grid="${grid}"]:not(:disabled)`) ?? []);
    const i = cells.indexOf(e.target as HTMLElement);
    if (i >= 0 && i < cells.length - 1) { cells[i + 1].focus(); (cells[i + 1] as HTMLInputElement).select?.(); return; }
    add();
    window.setTimeout(() => {
      const again = Array.from(root.current?.querySelectorAll<HTMLElement>(`[data-grid="${grid}"]:not(:disabled)`) ?? []);
      again[cells.length]?.focus();
    }, 30);
  };

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (preview || closing) return;
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); void saveNow().then(() => setPreview(true)); }
      else if (e.key === 'F12') { e.preventDefault(); if (!closed) void saveNow().then((s) => s && setClosing(true)); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setDay((d) => shiftDay(d, -1)); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setDay((d) => (d < today ? shiftDay(d, 1) : d)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview, closing, closed, saveNow, today]);

  const operators = sheet?.settings.operators ?? [];
  const stock = sheet?.stock ?? [];
  const by = (g: MillStockLine['group']) => stock.filter((l) => l.group === g);
  const variances = stock.filter((l) => (l.variance ?? 0) !== 0);
  const closeMessage = sheet
    ? `Closing ${longDay(day)} makes ${sheet.opRows.length} pressing batches, bills ${formatRupees(sheet.aravaiCharge, { decimals: false })} of aravai to ${sheet.custRows.length} customer jobs, adds the punnaku purchased and adjusts stock for ${variances.length} counted difference${variances.length === 1 ? '' : 's'}. The sheet then becomes read-only.`
    : '';

  const setOp = (i: number, p: Partial<OpS>) => edit((f) => ({ ...f, ops: f.ops.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const setCust = (i: number, p: Partial<CustS>) => edit((f) => ({ ...f, custs: f.custs.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const setPun = (i: number, p: Partial<PunS>) => edit((f) => ({ ...f, puns: f.puns.map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const addOp = (operator: string) => edit((f) => ({ ...f, ops: [...f.ops, { operator, seed: 'groundnut', machine: 'W', kg: '', oil: '', cake: '', jag: '' }] }));
  const addCust = () => edit((f) => ({ ...f, custs: [...f.custs, { customerId: '', seed: 'groundnut', machine: 'W', kg: '', oil: '', cake: '', mode: 'taken' }] }));
  const addPun = () => edit((f) => ({ ...f, puns: [...f.puns, { punnaku: 'kadalai_w', kg: '', supplierId: '', note: '' }] }));

  const sessionHint = state === 'saving' ? 'Saving...' : state === 'dirty' ? 'Unsaved' : closed ? 'Closed' : 'Draft saved';
  const rate = (mode: 'taken' | 'kept') => (mode === 'kept' ? sheet?.settings.rateCakeKept : sheet?.settings.rateCakeTaken) ?? 0;

  const dayChips = useMemo(() => list.slice(0, 12), [list]);

  return (
    <>
      <PageHeader
        title="Mill daily sheet" icon={<Factory size={17} />} subtitle={`${shop} - ${longDay(day)}`}
        actions={
          <>
            <div className="flex items-center rounded-control border border-line-strong bg-surface">
              <button type="button" tabIndex={-1} onClick={() => setDay(shiftDay(day, -1))} className="flex h-9 w-8 items-center justify-center text-muted hover:text-ink" aria-label="Day before"><ChevronLeft size={16} /></button>
              <label className="flex items-center gap-1.5 px-1 text-sm text-ink"><CalendarDays size={14} className="text-subtle" /><input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="num h-9 w-[130px] bg-transparent text-sm outline-none" /></label>
              <button type="button" tabIndex={-1} disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))} className="flex h-9 w-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30" aria-label="Day after"><ChevronRight size={16} /></button>
            </div>
            <Badge tone={closed ? 'success' : state === 'dirty' ? 'warning' : 'info'}>{closed ? <Lock size={11} /> : <CheckCircle2 size={11} />}{sessionHint}</Badge>
            <Button icon={<Printer size={15} />} kbd="Ctrl+P" onClick={() => void saveNow().then(() => setPreview(true))}>Print / PDF</Button>
            {!closed && <Button icon={<Save size={15} />} kbd="Ctrl+S" onClick={() => void saveNow()}>Save</Button>}
            {!closed && <Button variant="primary" icon={<Lock size={15} />} kbd="F12" onClick={() => void saveNow().then((s) => s && setClosing(true))}>Close sheet</Button>}
          </>
        }
      />
      {error && <div className="shrink-0 border-b border-danger/30 bg-danger-soft px-5 py-2 text-sm text-danger" role="alert">{error}</div>}
      {closed && <div className="flex shrink-0 items-center gap-2 border-b border-success/30 bg-success-soft px-5 py-2 text-sm text-success"><Lock size={14} /> Closed by {sheet?.closedBy}{sheet?.approvedBy && sheet.approvedBy !== sheet.closedBy ? `, approved by ${sheet.approvedBy}` : ''}. This sheet is read-only; its stock movements are already posted.</div>}

      <div className="flex min-h-0 flex-1">
        <div ref={root} className="min-h-0 flex-1 overflow-auto bg-bg p-5">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
            <div className="grid grid-cols-[260px_1fr] gap-3">
              <Field label="Supervisor"><Input value={form.supervisor} disabled={closed} onChange={(e) => edit((f) => ({ ...f, supervisor: e.target.value }))} placeholder="Who filled this sheet" /></Field>
              <Field label="Note"><Input value={form.note} disabled={closed} onChange={(e) => edit((f) => ({ ...f, note: e.target.value }))} placeholder="Anything to remember about this day" /></Field>
            </div>

            <Card title={<Sec n={1} t="Opening stock" hint="Filled in from the stock ledger, after the previous day's count" />}>
              <div className="grid grid-cols-5 gap-x-4 gap-y-3 p-4">
                {[...by('seed'), ...by('punnaku'), ...by('other'), ...by('oil')].map((l) => (
                  <div key={l.key} className="min-w-0">
                    <div className="truncate text-xs text-muted">{l.label}</div>
                    <div className="num text-md font-semibold text-ink">{fmtQty(l.opening)} <span className="text-xs font-normal text-subtle">{l.unit}</span></div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={<Sec n={2} t="Aravai (Operator)" hint="Seed in, oil out and punnaku out for every pressing. Each row becomes a pressing batch when the sheet is closed." />}>
              <div className="grid grid-cols-1 gap-4 p-4 min-[1700px]:grid-cols-2">
                {operators.map((op) => {
                  const idx = form.ops.map((r, i) => (r.operator === op ? i : -1)).filter((i) => i >= 0);
                  const sum = (k: 'kg' | 'oil' | 'cake') => idx.reduce((a, i) => a + toMilli(form.ops[i][k]), 0);
                  return (
                    <div key={op} className="rounded-card border border-line">
                      <div className="flex h-9 items-center justify-between border-b border-line bg-surface-2 px-3">
                        <span className="text-sm font-semibold text-ink">{op}</span>
                        {!closed && <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => addOp(op)}>Add row</Button>}
                      </div>
                      <table className="w-full table-fixed">
                        <thead><tr><th className={cn(th, 'w-[120px]')}>Seed</th><th className={cn(th, 'w-[72px]')}>Mach.</th><th className={cn(th, 'text-right')}>Seed in kg</th><th className={cn(th, 'text-right')}>Oil out L</th><th className={cn(th, 'text-right')}>Punnaku kg</th><th className={cn(th, 'w-[84px] text-right')}>Vellam kg</th><th className="w-7" /></tr></thead>
                        <tbody onKeyDown={gridKey(`op-${op}`, () => addOp(op))}>
                          {idx.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-sm text-subtle">No rows. {closed ? '' : 'Click Add row, then Enter moves along the cells.'}</td></tr>}
                          {idx.map((i) => {
                            const r = form.ops[i];
                            return (
                              <tr key={i}>
                                <td className="px-1 py-0.5"><select data-grid={`op-${op}`} disabled={closed} value={r.seed} onChange={(e) => setOp(i, { seed: e.target.value as MillSeed })} className={cellCls}>{MILL_SEEDS.map((s) => <option key={s.key} value={s.key}>{s.label.split(' ')[0]}</option>)}</select></td>
                                <td className="px-1 py-0.5"><select data-grid={`op-${op}`} disabled={closed} value={r.machine} onChange={(e) => setOp(i, { machine: e.target.value as Machine })} className={cellCls}>{MACHINES.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}</select></td>
                                <td className="px-1 py-0.5"><input data-grid={`op-${op}`} disabled={closed} inputMode="decimal" value={r.kg} onChange={(e) => setOp(i, { kg: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                                <td className="px-1 py-0.5"><input data-grid={`op-${op}`} disabled={closed} inputMode="decimal" value={r.oil} onChange={(e) => setOp(i, { oil: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                                <td className="px-1 py-0.5"><input data-grid={`op-${op}`} disabled={closed} inputMode="decimal" value={r.cake} onChange={(e) => setOp(i, { cake: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                                <td className="px-1 py-0.5"><input data-grid={`op-${op}`} disabled={closed || r.seed !== 'sesame'} inputMode="decimal" value={r.seed === 'sesame' ? r.jag : ''} placeholder={r.seed === 'sesame' ? '' : '-'} onChange={(e) => setOp(i, { jag: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                                <td className="pr-1">{!closed && <button type="button" tabIndex={-1} onClick={() => edit((f) => ({ ...f, ops: f.ops.filter((_, k) => k !== i) }))} className="text-subtle hover:text-danger" aria-label="Remove row"><Trash2 size={13} /></button>}</td>
                              </tr>
                            );
                          })}
                          {idx.length > 0 && (
                            <tr className="border-t border-line bg-surface-2 text-sm font-semibold"><td className="px-3 py-1.5" colSpan={2}>Total</td><td className="num px-3 text-right">{fmtQty(sum('kg'))}</td><td className="num px-3 text-right">{fmtQty(sum('oil'))}</td><td className="num px-3 text-right">{fmtQty(sum('cake'))}</td><td colSpan={2} /></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title={<Sec n={3} t="Aravai (Customer)" hint="Customer's own seed. It never enters shop stock. The charge goes on the customer's account." />} actions={!closed ? <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={addCust}>Add row</Button> : undefined}>
              <table className="w-full table-fixed">
                <thead><tr><th className={cn(th, 'w-[170px]')}>Customer</th><th className={cn(th, 'w-[104px]')}>Seed</th><th className={cn(th, 'w-[66px]')}>Mach.</th><th className={cn(th, 'w-[84px] text-right')}>Seed kg</th><th className={cn(th, 'w-[84px] text-right')}>Oil back L</th><th className={cn(th, 'w-[92px] text-right')}>Punnaku kg</th><th className={cn(th, 'w-[132px]')}>Cake</th><th className={cn(th, 'text-right')}>Charge</th><th className="w-7" /></tr></thead>
                <tbody onKeyDown={gridKey('cust', addCust)}>
                  {form.custs.length === 0 && <tr><td colSpan={9} className="px-3 py-3 text-sm text-subtle">No customer aravai today.</td></tr>}
                  {form.custs.map((r, i) => {
                    const row = sheet?.custRows.find((x) => x.customerId === r.customerId && x.seedKg === toMilli(r.kg) && x.cakeMode === r.mode);
                    const charge = row?.charge ?? Math.round((rate(r.mode) * toMilli(r.kg)) / 1000);
                    return (
                      <tr key={i}>
                        <td className="px-1 py-0.5"><select data-grid="cust" disabled={closed} value={r.customerId} onChange={(e) => setCust(i, { customerId: e.target.value })} className={cellCls}><option value="">Choose customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                        <td className="px-1 py-0.5"><select data-grid="cust" disabled={closed} value={r.seed} onChange={(e) => setCust(i, { seed: e.target.value as MillSeed })} className={cellCls}>{MILL_SEEDS.map((s) => <option key={s.key} value={s.key}>{s.label.split(' ')[0]}</option>)}</select></td>
                        <td className="px-1 py-0.5"><select data-grid="cust" disabled={closed} value={r.machine} onChange={(e) => setCust(i, { machine: e.target.value as Machine })} className={cellCls}>{MACHINES.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}</select></td>
                        <td className="px-1 py-0.5"><input data-grid="cust" disabled={closed} inputMode="decimal" value={r.kg} onChange={(e) => setCust(i, { kg: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                        <td className="px-1 py-0.5"><input data-grid="cust" disabled={closed} inputMode="decimal" value={r.oil} onChange={(e) => setCust(i, { oil: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                        <td className="px-1 py-0.5"><input data-grid="cust" disabled={closed} inputMode="decimal" value={r.cake} onChange={(e) => setCust(i, { cake: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                        <td className="px-1 py-0.5"><select data-grid="cust" disabled={closed} value={r.mode} onChange={(e) => setCust(i, { mode: e.target.value as 'taken' | 'kept' })} className={cellCls}><option value="taken">Customer takes</option><option value="kept">Shop keeps</option></select></td>
                        <td className="num px-3 text-right text-sm font-semibold text-ink">{toMilli(r.kg) ? formatRupees(charge, { decimals: false }) : ''}{row?.billNumber ? <span className="block text-[10px] font-normal text-subtle">{row.billNumber}</span> : null}</td>
                        <td className="pr-1">{!closed && <button type="button" tabIndex={-1} onClick={() => edit((f) => ({ ...f, custs: f.custs.filter((_, k) => k !== i) }))} className="text-subtle hover:text-danger" aria-label="Remove row"><Trash2 size={13} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
                <span>Rate per kg of seed (GST {sheet?.settings.serviceGstRate ?? 5}% included): cake taken {formatRupees(sheet?.settings.rateCakeTaken ?? 0, { decimals: false })}, cake kept by shop {formatRupees(sheet?.settings.rateCakeKept ?? 0, { decimals: false })}. Change them in Settings, Mill.</span>
                <span className="font-semibold text-ink">Total charge {formatRupees(sheet?.aravaiCharge ?? 0, { decimals: false })}</span>
              </div>
            </Card>

            <Card title={<Sec n={4} t="Punnaku purchased" hint="Goes into stock when the sheet is closed" />} actions={!closed ? <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={addPun}>Add row</Button> : undefined}>
              <table className="w-full table-fixed">
                <thead><tr><th className={cn(th, 'w-[170px]')}>Punnaku</th><th className={cn(th, 'w-[140px] text-right')}>Qty kg</th><th className={cn(th, 'w-[260px]')}>Bought from</th><th className={th}>Note</th><th className="w-7" /></tr></thead>
                <tbody onKeyDown={gridKey('pun', addPun)}>
                  {form.puns.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-sm text-subtle">No punnaku bought today.</td></tr>}
                  {form.puns.map((r, i) => (
                    <tr key={i}>
                      <td className="px-1 py-0.5"><select data-grid="pun" disabled={closed} value={r.punnaku} onChange={(e) => setPun(i, { punnaku: e.target.value as PunnakuKey })} className={cellCls}>{PUNNAKU.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></td>
                      <td className="px-1 py-0.5"><input data-grid="pun" disabled={closed} inputMode="decimal" value={r.kg} onChange={(e) => setPun(i, { kg: e.target.value.replace(/[^\d.]/g, '') })} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                      <td className="px-1 py-0.5"><select data-grid="pun" disabled={closed} value={r.supplierId} onChange={(e) => setPun(i, { supplierId: e.target.value })} className={cellCls}><option value="">No supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                      <td className="px-1 py-0.5"><input data-grid="pun" disabled={closed} value={r.note} onChange={(e) => setPun(i, { note: e.target.value })} className={cellCls} /></td>
                      <td className="pr-1">{!closed && <button type="button" tabIndex={-1} onClick={() => edit((f) => ({ ...f, puns: f.puns.filter((_, k) => k !== i) }))} className="text-subtle hover:text-danger" aria-label="Remove row"><Trash2 size={13} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title={<Sec n={5} t="Closing stock" hint="Computed from opening, today's pressing, purchases, sales and packing. Enter what was counted." />}>
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    <th className={cn(th, 'w-[170px]')}>Item</th>
                    {['Opening', 'Pressed', 'Bought', 'Kept', 'Sold', 'Packed', 'Adjusted'].map((h) => <th key={h} className={cn(th, 'text-right')}>{h}</th>)}
                    <th className={cn(th, 'text-right')}>Closing (calc.)</th><th className={cn(th, 'w-[120px] text-right')}>Counted</th><th className={cn(th, 'w-[90px] text-right')}>Difference</th>
                  </tr>
                </thead>
                <tbody onKeyDown={gridKey('phys', () => undefined)}>
                  {stock.map((l, i) => {
                    const typed = form.physical[l.key];
                    const counted = typed !== undefined && typed.trim() !== '' ? toMilli(typed) : null;
                    const diff = counted === null ? null : counted - l.computed;
                    const head = i === 0 || stock[i - 1].group !== l.group;
                    return (
                      <tr key={l.key} className={cn(head && i > 0 && 'border-t-2 border-line')}>
                        <td className="px-3 py-1 text-sm font-medium text-ink">{l.label} <span className="text-xs font-normal text-subtle">{l.unit}</span></td>
                        {[l.opening, l.pressed, l.purchased, l.kept, l.sold, l.packed, l.adjusted].map((v, k) => <td key={k} className={cn('num px-2 text-right text-sm', v === 0 ? 'text-line-strong' : v < 0 ? 'text-danger' : 'text-ink')}>{v === 0 ? '-' : fmtQty(v)}</td>)}
                        <td className="num px-2 text-right text-sm font-semibold text-ink">{fmtQty(l.computed)}</td>
                        <td className="px-1 py-0.5"><input data-grid="phys" disabled={closed} inputMode="decimal" value={typed ?? ''} placeholder={closed ? '' : fmtQty(l.computed)} onChange={(e) => edit((f) => ({ ...f, physical: { ...f.physical, [l.key]: e.target.value.replace(/[^\d.]/g, '') } }))} onFocus={(e) => e.currentTarget.select()} className={numCls} /></td>
                        <td className={cn('num px-2 text-right text-sm font-semibold', diff === null ? 'text-subtle' : diff === 0 ? 'text-success' : 'text-danger')}>{diff === null ? '' : diff === 0 ? 'OK' : `${diff > 0 ? '+' : ''}${fmtQty(diff)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
                {closed ? 'Counted differences were posted as stock adjustments with the reason "Mill sheet".' : 'When you close the sheet, each difference is posted as a stock adjustment (reason: correction, note: the sheet date). Oil differences are noted on the sheet only: settle them with a barrel stock take.'}
              </div>
            </Card>
          </div>
        </div>

        <aside className="flex w-[210px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex h-10 shrink-0 items-center border-b border-line bg-surface-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted">Recent days</div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!list.some((s) => s.day === today) && <DayRow day={today} active={day === today} onClick={() => setDay(today)} sub="Not started" tone="neutral" label="Today" />}
            {dayChips.map((s) => (
              <DayRow key={s.day} day={s.day} active={day === s.day} onClick={() => setDay(s.day)} label={s.day === today ? 'Today' : undefined}
                sub={s.status === 'closed' ? `Closed${s.varianceCount ? `, ${s.varianceCount} diff.` : ''}` : 'Draft'} tone={s.status === 'closed' ? 'success' : 'warning'} />
            ))}
          </div>
          <div className="shrink-0 border-t border-line p-3 text-xs text-subtle">
            <div className="flex items-center gap-1.5"><Kbd>Alt</Kbd><Kbd>Left</Kbd><Kbd>Right</Kbd> change day</div>
            <div className="mt-1 flex items-center gap-1.5"><Kbd>Enter</Kbd> next cell, new row at the end</div>
          </div>
        </aside>
      </div>

      <Dialog
        open={preview} onOpenChange={setPreview} size="xl" title="Print preview" description="The same layout as the paper form. Choose Save as PDF in the print window to keep a copy." bodyClassName="bg-neutral-300 p-4"
        footer={<><Button onClick={() => setPreview(false)} kbd="Esc">Close</Button><Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()} kbd="Enter">Print or save as PDF</Button></>}
      >
        {sheet && <SheetPaper sheet={sheet} shop={shop} />}
      </Dialog>

      <ManagerPinDialog
        open={closing} title="Close the mill sheet" message={closeMessage} confirmLabel="Approve and close"
        onClose={() => setClosing(false)}
        onSubmit={async (pin) => {
          try {
            const s = await api.closeMillSheet({ day, managerPin: pin });
            setSheet(s); setForm(toForm(s)); setClosing(false); setState('saved'); refreshList();
            toast.show({ tone: 'success', title: 'Mill sheet closed', detail: `${s.opRows.length} pressing batches posted, aravai billed ${formatRupees(s.aravaiCharge, { decimals: false })}.` });
            return null;
          } catch (e) { return e instanceof Error ? e.message : 'Could not close the sheet'; }
        }}
      />
    </>
  );
}

function Sec({ n, t, hint }: { n: number; t: string; hint?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">{n}</span>
      <span>{t}</span>
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </span>
  );
}

function DayRow({ day, active, onClick, sub, tone, label }: { day: string; active: boolean; onClick: () => void; sub: string; tone: 'success' | 'warning' | 'neutral'; label?: string }) {
  const d = new Date(`${day}T12:00:00`);
  return (
    <button type="button" tabIndex={-1} onClick={onClick} className={cn('flex w-full items-center justify-between border-b border-line/70 px-4 py-2 text-left hover:bg-surface-2', active && 'bg-primary-soft')}>
      <span>
        <span className="block text-sm font-medium text-ink">{label ?? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className={cn('h-2 w-2 rounded-full', tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-line-strong')} />
    </button>
  );
}
