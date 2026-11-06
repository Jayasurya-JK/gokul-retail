import { useEffect, useState } from 'react';
import type { CustomerInput, CustomerRow, CustomerType } from '@gokul/data';
import { Button, Drawer, Field, Input, NumberInput } from '@gokul/ui';
import { paiseToRupees, rupeesToPaise, Segmented } from './common';

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

interface Draft {
  name: string; phone: string; area: string; type: CustomerType; business: string; gstin: string; email: string; address: string; limit: string;
}

const blank: Draft = { name: '', phone: '', area: '', type: 'retail', business: '', gstin: '', email: '', address: '', limit: '0' };

const fromRow = (c: CustomerRow): Draft => ({
  name: c.name, phone: c.phone, area: c.area, type: c.type, business: c.business ?? '', gstin: c.gstin ?? '', email: c.email ?? '',
  address: c.address ?? '', limit: paiseToRupees(c.creditLimit),
});

/** Add / edit customer side sheet. Ctrl+S saves. */
export function CustomerSheet({ open, customer, onClose, onSave }: {
  open: boolean; customer: CustomerRow | null; onClose: () => void; onSave: (input: CustomerInput) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(blank);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setD(customer ? fromRow(customer) : blank); setTouched(false); } }, [open, customer]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) errors.name = 'Enter the customer name';
  if (d.phone.replace(/\D/g, '').length !== 10) errors.phone = 'Phone must be 10 digits';
  if (d.type === 'b2b') {
    if (!d.business.trim()) errors.business = 'Enter the business name for the GST bill';
    if (!GSTIN_RE.test(d.gstin.trim().toUpperCase())) errors.gstin = 'GSTIN is 15 characters, like 33ABCDE1234F1Z5';
  }
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) errors.email = 'Email looks incomplete';
  const valid = Object.keys(errors).length === 0;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave({
        id: customer?.id, name: d.name, phone: d.phone, area: d.area, type: d.type, business: d.business, gstin: d.gstin,
        email: d.email, address: d.address, creditLimit: rupeesToPaise(d.limit),
      });
    } finally { setBusy(false); }
  };

  const err = (k: keyof Draft) => (touched ? errors[k] : undefined);

  return (
    <Drawer
      open={open} onOpenChange={(o) => !o && onClose()} width={460}
      title={customer ? 'Edit customer' : 'New customer'}
      description={customer ? customer.name : 'Saved customers can be picked at the billing counter by name or phone.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} kbd="Esc">Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy} kbd="Ctrl+S">Save customer</Button>
        </>
      }
    >
      <div
        className="flex flex-col gap-4"
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void submit(); } }}
      >
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Customer type</div>
          <Segmented<CustomerType> value={d.type} onChange={(v) => set('type', v)} options={[{ value: 'retail', label: 'Retail' }, { value: 'b2b', label: 'Business (GST bill)' }]} />
        </div>
        <Input label="Name" value={d.name} onChange={(e) => set('name', e.target.value)} error={err('name')} data-autofocus autoFocus />
        {d.type === 'b2b' && (
          <>
            <Input label="Business name" value={d.business} onChange={(e) => set('business', e.target.value)} error={err('business')} />
            <Input label="GSTIN" value={d.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase().slice(0, 15))} error={err('gstin')} placeholder="33ABCDE1234F1Z5" className="num uppercase" hint="Printed on the tax invoice so the buyer can claim input credit." />
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={d.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} error={err('phone')} placeholder="98421 07731" className="num" />
          <Input label="Area" value={d.area} onChange={(e) => set('area', e.target.value)} placeholder="Gandhipuram" />
        </div>
        <Input label="Email (optional)" value={d.email} onChange={(e) => set('email', e.target.value)} error={err('email')} />
        <Input label="Address (optional)" value={d.address} onChange={(e) => set('address', e.target.value)} />
        <div className="rounded-card border border-line bg-surface-2 p-3">
          <div className="mb-2 text-sm font-semibold text-ink">Credit</div>
          <Field label="Credit limit" hint={d.limit === '0' || d.limit === '' ? 'Zero means no credit. The counter will not allow Pay later.' : 'Counter blocks Pay later above this limit unless a manager enters their PIN.'}>
            <NumberInput value={d.limit} onValueChange={(v) => set('limit', v)} decimals={0} prefix={'₹'} />
          </Field>
          {customer && customer.outstanding > 0 && (
            <div className="mt-2 text-xs text-warning">Currently owes {'₹'}{paiseToRupees(customer.outstanding)}. Lowering the limit below this does not erase the dues.</div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
