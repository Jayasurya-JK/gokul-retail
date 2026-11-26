import { useEffect, useRef, useState } from 'react';
import { Printer, Truck, UserPlus } from 'lucide-react';
import { DEFAULT_GST_RATES, GST_STATES, enabledRates, rateText, stateLabel, formatRupees, parsePaise, parseQty, type Bill, type BillLine, type Staff } from '@gokul/data';
import { Button, Dialog, Field, Input, Money, clockTime, cn } from '@gokul/ui';
import { api } from '../store';
import type { Delivery } from '../store';

/* ---------- F2 Home delivery ---------- */
export function DeliveryDialog({ open, current, defaultLocality, defaultAddress, gstRate, onClose, onSave }: {
  open: boolean; current: Delivery; defaultLocality?: string; defaultAddress?: string; gstRate: number;
  onClose: () => void; onSave: (d: Delivery) => void;
}) {
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [charge, setCharge] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setAddress(current.address || defaultAddress || '');
    setLocality(current.locality || defaultLocality || '');
    setCharge(current.charge ? String(current.charge / 100) : '');
    setError('');
  }, [open, current, defaultAddress, defaultLocality]);

  const submit = () => {
    const c = charge.trim() === '' ? 0 : parsePaise(charge);
    if (c === null) { setError('Enter the delivery charge as an amount, like 40'); return; }
    if (!address.trim() && !locality.trim() && c === 0) { setError('Enter the address, or a delivery charge'); return; }
    onSave({ address: address.trim(), locality: locality.trim(), charge: c });
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Home delivery"
      description={gstRate > 0 ? `The delivery charge is billed with ${gstRate}% GST.` : 'The delivery charge is billed without GST.'}
      footer={
        <>
          {(current.address || current.locality || current.charge > 0) && (
            <Button variant="danger" className="mr-auto" onClick={() => onSave({ address: '', locality: '', charge: 0 })}>Remove delivery</Button>
          )}
          <Button onClick={onClose} kbd="Esc">Cancel</Button>
          <Button variant="primary" onClick={submit} kbd="Enter" icon={<Truck size={14} />}>Save delivery</Button>
        </>
      }
    >
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input data-autofocus autoFocus label="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Door no, street, landmark" />
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <Input label="Locality" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Area or route" />
          <Input label="Delivery charge" inputMode="decimal" value={charge} onChange={(e) => { setCharge(e.target.value.replace(/[^\d.]/g, '')); setError(''); }} placeholder="0" className="text-right" />
        </div>
        {error && <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/* ---------- F7 Staff ---------- */
export function StaffDialog({ open, current, onClose, onPick }: { open: boolean; current: string; onClose: () => void; onPick: (name: string) => void }) {
  const [list, setList] = useState<Staff[]>([]);
  const [hi, setHi] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setName(''); setError('');
    void api.listStaff().then((l) => { setList(l); setHi(Math.max(0, l.findIndex((s) => s.name === current) + 1)); });
    window.setTimeout(() => boxRef.current?.focus(), 30);
  }, [open, current]);

  // row 0 is "No staff"; rows 1.. are the staff
  const rows: (Staff | null)[] = [null, ...list];
  const choose = (i: number) => onPick(rows[i]?.name ?? '');
  const add = async () => {
    try {
      const l = await api.addStaff(name);
      setList(l);
      onPick(name.trim());
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add the staff'); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Staff for this bill" description="Who served this customer. Shown in the Staff report." bodyClassName="p-0">
      <div
        ref={boxRef} data-autofocus tabIndex={0} className="max-h-[300px] overflow-y-auto outline-none"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(hi); }
        }}
      >
        {rows.map((s, i) => {
          const on = (s?.name ?? '') === current;
          return (
            <button
              key={s?.id ?? 'none'} type="button" tabIndex={-1} onMouseMove={() => setHi(i)} onClick={() => choose(i)}
              className={cn('flex h-11 w-full items-center gap-3 border-b border-line/70 px-5 text-left text-base', i === hi && 'bg-primary-soft')}
            >
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', on ? 'border-primary bg-primary' : 'border-line-strong')}>{on && <span className="h-2 w-2 rounded-full bg-primary-fg" />}</span>
              <span className={cn('flex-1', !s && 'text-muted')}>{s ? s.name : 'No staff'}</span>
            </button>
          );
        })}
      </div>
      <form className="flex items-end gap-2 border-t border-line bg-surface-2 p-4" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Input label="Add a new staff name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Type a name" error={error} />
        <Button type="submit" icon={<UserPlus size={14} />} disabled={!name.trim()}>Add</Button>
      </form>
    </Dialog>
  );
}

/* ---------- F8 Recent bills ---------- */
export function RecentBillsDialog({ open, onClose, onReprint, onOpenSales }: {
  open: boolean; onClose: () => void; onReprint: (b: Bill) => void; onOpenSales: () => void;
}) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [hi, setHi] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    void api.listBillsOn({ date: day }).then((l) => { setBills(l.slice(0, 15)); setHi(0); setLoaded(true); });
    window.setTimeout(() => boxRef.current?.focus(), 30);
  }, [open]);

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Recent bills" description="Today's last bills. Enter prints a duplicate copy." bodyClassName="p-0"
      footer={<><Button onClick={onOpenSales}>All bills (Sales)</Button><Button onClick={onClose} kbd="Esc">Close</Button></>}
    >
      <div
        ref={boxRef} data-autofocus tabIndex={0} className="max-h-[380px] min-h-[120px] overflow-y-auto outline-none"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(bills.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && bills[hi]) { e.preventDefault(); onReprint(bills[hi]); }
        }}
      >
        {loaded && bills.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted">No bills yet today.</div>}
        {bills.map((b, i) => (
          <div key={b.id} onMouseMove={() => setHi(i)} className={cn('flex h-12 items-center gap-3 border-b border-line/70 px-5 text-sm', i === hi && 'bg-primary-soft')}>
            <span className="min-w-0 flex-1 truncate">
              <span className={cn('num font-semibold', b.status === 'cancelled' && 'text-subtle line-through')}>{b.number}</span>
              <span className="text-muted"> - </span>
              <span className="font-medium">{b.customerName}</span>
            </span>
            <span className="num w-16 text-muted">{clockTime(b.at)}</span>
            <Money paise={b.totals.grand} className="w-24 text-right font-semibold" />
            <button type="button" tabIndex={-1} onClick={() => onReprint(b)} title="Print a duplicate copy" aria-label={`Reprint ${b.number}`} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-primary"><Printer size={15} /></button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- Manual item ---------- */
export function ManualItemDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (line: BillLine) => void }) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [qty, setQty] = useState('1');
  const [gst, setGst] = useState<number>(5);
  const [gstRates, setGstRates] = useState<number[]>([...DEFAULT_GST_RATES]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(''); setRate(''); setQty('1'); setGst(5); setError('');
    api.getSettingsBundle().then((b) => setGstRates(enabledRates(b.tax.rates))).catch(() => undefined);
  }, [open]);

  const submit = () => {
    const r = parsePaise(rate);
    const q = parseQty(qty);
    if (!name.trim()) { setError('Enter what the item is'); return; }
    if (!r || r <= 0) { setError('Enter the price (GST included)'); return; }
    if (!q || q <= 0) { setError('Enter the quantity'); return; }
    const amount = Math.round((r * q) / 1000);
    onAdd({ itemId: '_manual', code: 'MAN', name: name.trim(), unit: 'pc', qty: q, rate: r, discount: 0, gstRate: gst, amount });
  };
  const total = (() => { const r = parsePaise(rate); const q = parseQty(qty); return r && q ? Math.round((r * q) / 1000) : 0; })();

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Manual item" description="For something that is not in the item list. A cashier needs a manager PIN to save the bill."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={submit} kbd="Enter">Add to bill</Button></>}
    >
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input data-autofocus autoFocus label="Item name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Plastic can 5 L" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Price" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value.replace(/[^\d.]/g, '')); setError(''); }} className="text-right" />
          <Input label="Quantity" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value.replace(/[^\d.]/g, '')); setError(''); }} className="text-right" />
          <Field label="GST">
            <select value={gst} onChange={(e) => setGst(Number(e.target.value))} className="h-9 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
              {gstRates.map((g) => <option key={g} value={g}>{rateText(g)}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="text-muted">Line total</span><b className="num">{formatRupees(total)}</b></div>
        {error && <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}


/* ---------- Place of supply ---------- */
/**
 * Where the goods are sold to. Normally this follows the customer (their GSTIN's state); pick another state here for a courier order
 * to a walk-in. The shop's own state means CGST + SGST, any other state means IGST (confirm with CA).
 */
export function PlaceOfSupplyDialog({ open, shopState, chosen, customerState, onClose, onPick }: {
  open: boolean; shopState: string; chosen: string; customerState: string; onClose: () => void; onPick: (state: string) => void;
}) {
  const [value, setValue] = useState('');
  useEffect(() => { if (open) setValue(chosen); }, [open, chosen]);
  const effective = value || customerState || shopState;
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Place of supply"
      description="Sales inside the shop's own state have CGST + SGST. Sales to another state have IGST. The bill total does not change."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={() => onPick(value)} kbd="Enter">Use this</Button></>}
    >
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); onPick(value); }}>
        <Field label="State">
          <select data-autofocus autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
            <option value="">{customerState ? `Customer's state: ${stateLabel(customerState)}` : `Same as the shop: ${stateLabel(shopState)}`}</option>
            {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
        <div className={cn('rounded-lg px-3 py-2 text-sm', effective === shopState ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
          {effective === shopState ? <>Local sale: <b>CGST + SGST</b></> : <>Inter-state sale to <b>{stateLabel(effective)}</b>: <b>IGST</b></>}
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
