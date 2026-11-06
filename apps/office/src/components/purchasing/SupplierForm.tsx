import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { isValidGstin, type SupplierProfile } from '@gokul/data';
import { Button, Dialog, Input, NumberInput, useToast } from '@gokul/ui';
import { api } from '../../store';

interface Form { name: string; phone: string; city: string; gstin: string; address: string; contact: string; creditDays: string }
const empty: Form = { name: '', phone: '', city: '', gstin: '', address: '', contact: '', creditDays: '15' };

export function SupplierForm({ open, supplier, onClose, onSaved }: {
  open: boolean; supplier: SupplierProfile | null; onClose: () => void; onSaved: (s: SupplierProfile) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(empty);
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrs({});
    setF(supplier ? { name: supplier.name, phone: supplier.phone, city: supplier.city, gstin: supplier.gstin, address: supplier.address, contact: supplier.contact, creditDays: String(supplier.creditDays) } : empty);
  }, [open, supplier]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrs((x) => ({ ...x, [k]: undefined })); };

  const save = async () => {
    const e: typeof errs = {};
    if (!f.name.trim()) e.name = 'Enter the supplier name.';
    if (f.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10 digit phone number.';
    if (f.gstin.trim() && !isValidGstin(f.gstin)) e.gstin = '15 characters, e.g. 33AAKFG4821M1ZQ.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const s = await api.saveSupplier({ id: supplier?.id, name: f.name, phone: f.phone, city: f.city, gstin: f.gstin, address: f.address, contact: f.contact, creditDays: Number(f.creditDays) || 0 });
      toast.show({ tone: 'success', title: supplier ? 'Supplier updated' : 'Supplier added', detail: s.name });
      onSaved(s); onClose();
    } catch (x) { setErrs({ name: x instanceof Error ? x.message : 'Could not save.' }); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title={supplier ? 'Edit supplier' : 'New supplier'}
      description="GSTIN lets purchases claim input tax credit."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy} onClick={save}>Save supplier</Button></>}
    >
      <form
        className="grid grid-cols-2 gap-x-4 gap-y-3.5"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } }}
      >
        <div className="col-span-2"><Input data-autofocus label="Supplier name" value={f.name} onChange={set('name')} error={errs.name} placeholder="e.g. Sri Murugan Oil Seeds" /></div>
        <Input label="Phone" value={f.phone} onChange={set('phone')} error={errs.phone} placeholder="94430 12871" inputMode="tel" />
        <Input label="Contact person" value={f.contact} onChange={set('contact')} placeholder="Who we speak to" />
        <div className="col-span-2"><Input label="GSTIN" value={f.gstin} onChange={(e) => { setF((x) => ({ ...x, gstin: e.target.value.toUpperCase() })); setErrs((x) => ({ ...x, gstin: undefined })); }} error={errs.gstin} placeholder="33AAKFG4821M1ZQ" maxLength={15} className="num uppercase" /></div>
        <div className="col-span-2"><Input label="Address" value={f.address} onChange={set('address')} placeholder="Street, area" /></div>
        <Input label="City" value={f.city} onChange={set('city')} placeholder="Erode" />
        <div>
          <span className="text-xs font-medium text-muted">Credit days</span>
          <div className="mt-1"><NumberInput decimals={0} value={f.creditDays} onValueChange={(v) => setF((x) => ({ ...x, creditDays: v }))} /></div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
