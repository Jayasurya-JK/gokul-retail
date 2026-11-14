import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Check, Plus, RotateCcw, Save, Timer, Truck } from 'lucide-react';
import type { GodownBarrel, GodownStatus, Item, SeedType, Supplier } from '@gokul/data';
import { Badge, Button, Dialog, Field, Input, Money, NumberInput, Select, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { EntryDate, fmtMilli, useEntryDate } from './common';

// Every action on a godown barrel lives here. Amounts are typed as the shop floor says them (L and rupees) and are
// converted to the Api units at the edge: litres x 1000 for milli-litres, rupees x 100 for paise.

export type StatusAction = 'settle' | 'ready' | 'reopen';

export const OIL_LABEL: Record<SeedType, string> = {
  groundnut: 'Groundnut',
  sesame: 'Sesame (gingelly)',
  copra: 'Coconut (copra)',
};

const OILS: SeedType[] = ['groundnut', 'sesame', 'copra'];

const STATUS_LABEL: Record<GodownStatus, string> = { empty: 'Empty', filling: 'Filling', settling: 'Settling', ready: 'Ready' };

const litresToMilli = (s: string) => Math.round((parseFloat(s) || 0) * 1000);
const rupeesToPaise = (s: string) => Math.round((parseFloat(s) || 0) * 100);
const reason = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function ErrorBox({ children }: { children: string }) {
  return <div role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{children}</div>;
}

const isFillable = (b: GodownBarrel) => b.status === 'filling' || b.status === 'empty';

/* ---------------- add barrels ---------------- */
export function AddBarrelsDialog({ open, existing, onClose, onSaved }: {
  open: boolean; existing: GodownBarrel[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [oil, setOil] = useState<SeedType>('groundnut');
  const [count, setCount] = useState('1');
  const [capacity, setCapacity] = useState('200');
  const [prefix, setPrefix] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOil('groundnut'); setCount('1'); setCapacity('200'); setPrefix(''); setErr(''); setBusy(false); resetEntry();
  }, [open, resetEntry]);

  const save = async () => {
    const n = parseInt(count, 10) || 0;
    const cap = litresToMilli(capacity);
    if (n < 1 || n > 30) { setErr('Add between 1 and 30 barrels at a time.'); return; }
    if (cap <= 0) { setErr('Enter the size of each barrel in litres.'); return; }
    setBusy(true); setErr('');
    try {
      const before = new Set(existing.map((b) => b.id));
      const list = await api.addGodownBarrels({ oil, count: n, capacityL: cap, ...entry.when });
      // The Api numbers barrels itself; a name prefix is applied with a follow-up edit so the names read the way the shop says them.
      const fresh = list.filter((b) => !before.has(b.id));
      const p = prefix.trim();
      if (p && fresh.length > 0) {
        const taken = new Set(list.map((b) => b.label.toLowerCase()));
        let k = 1;
        for (const b of fresh) {
          let label = '';
          do { label = `${p} ${k++}`; } while (taken.has(label.toLowerCase()));
          taken.add(label.toLowerCase());
          await api.editGodownBarrel({ id: b.id, label, capacityL: b.capacityL, active: b.active });
        }
      }
      toast.show({
        tone: 'success',
        title: fresh.length === 1 ? 'Barrel added' : `${fresh.length} barrels added`,
        detail: `${OIL_LABEL[oil]} · ${fmtMilli(cap, 0)} L each`,
      });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not add the barrels.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Add barrels"
      description="Empty godown barrels ready to take pressed or bought oil."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Plus size={15} />} kbd="Enter" disabled={busy} onClick={() => void save()}>Add barrels</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Select label="Oil" data-autofocus value={oil} onChange={(e) => { setOil(e.target.value as SeedType); setErr(''); }} options={OILS.map((o) => ({ value: o, label: OIL_LABEL[o] }))} />
          </div>
          <Field label="How many">
            <NumberInput decimals={0} value={count} onValueChange={(v) => { setCount(v); setErr(''); }} placeholder="1" />
          </Field>
          <Field label="Size of each (litres)">
            <NumberInput decimals={1} value={capacity} onValueChange={(v) => { setCapacity(v); setErr(''); }} placeholder="200" />
          </Field>
          <div className="col-span-2">
            <Input label="Name prefix (optional)" value={prefix} onChange={(e) => { setPrefix(e.target.value); setErr(''); }} placeholder="e.g. Groundnut" hint="Leave blank to use the usual oil numbers, like Groundnut 8." />
          </div>
        </div>
        <EntryDate entry={entry} />
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* ---------------- edit barrel ---------------- */
export function EditBarrelDialog({ barrel, onClose, onSaved }: {
  barrel: GodownBarrel | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [capacity, setCapacity] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!barrel) return;
    setLabel(barrel.label);
    setCapacity(String(barrel.capacityL / 1000));
    setErr(''); setBusy(false);
  }, [barrel]);

  const save = async () => {
    if (!barrel) return;
    const cap = litresToMilli(capacity);
    if (!label.trim()) { setErr('Give the barrel a name.'); return; }
    if (cap <= 0) { setErr('Enter the size of the barrel in litres.'); return; }
    setBusy(true); setErr('');
    try {
      const b = await api.editGodownBarrel({ id: barrel.id, label: label.trim(), capacityL: cap, active: barrel.active });
      toast.show({ tone: 'success', title: 'Barrel updated', detail: `${b.label} · ${fmtMilli(b.capacityL, 0)} L` });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not save the barrel.'));
    } finally { setBusy(false); }
  };

  const nowL = barrel ? fmtMilli(barrel.levelL) : '0';
  return (
    <Dialog
      open={barrel !== null} onOpenChange={(o) => !o && onClose()} size="sm" title="Edit barrel"
      description={barrel ? `${barrel.oilName} · holds ${nowL} L now` : undefined}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Enter" disabled={busy || !barrel} onClick={() => void save()}>Save barrel</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        <Input data-autofocus label="Name" value={label} onChange={(e) => { setLabel(e.target.value); setErr(''); }} placeholder="e.g. Groundnut 1" />
        <Field label="Size (litres)" hint={barrel ? `It holds ${nowL} L now, so the size cannot be less than that.` : undefined}>
          <NumberInput decimals={1} value={capacity} onValueChange={(v) => { setCapacity(v); setErr(''); }} placeholder="200" />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* ---------------- settle / ready / reopen ---------------- */
const statusCopy: Record<StatusAction, { title: (b: GodownBarrel) => string; body: (b: GodownBarrel) => string; cta: string; done: (b: GodownBarrel) => string }> = {
  settle: {
    title: (b) => `Start settling ${b.label}?`,
    body: (b) => `${b.label} holds ${fmtMilli(b.levelL)} L of ${b.oilName}. It can take no more oil and settles for ${b.settleDays} days before the oil can move to the store.`,
    cta: 'Start settling',
    done: (b) => `${b.label} is settling · ${fmtMilli(b.levelL)} L`,
  },
  ready: {
    title: (b) => `Mark ${b.label} ready?`,
    body: (b) => `${b.label} holds ${fmtMilli(b.levelL)} L of ${b.oilName}. Mark it ready without waiting the full settle days, then move the oil to the store.`,
    cta: 'Mark ready',
    done: (b) => `${b.label} is ready · ${fmtMilli(b.levelL)} L`,
  },
  reopen: {
    title: (b) => `Fill ${b.label} again?`,
    body: (b) => `${b.label} holds ${fmtMilli(b.levelL)} L of ${b.oilName}. It goes back to filling and the settle start is cleared.`,
    cta: 'Reopen',
    done: (b) => `${b.label} is filling again`,
  },
};

const statusIcon: Record<StatusAction, ReactNode> = {
  settle: <Timer size={15} />,
  ready: <Check size={15} />,
  reopen: <RotateCcw size={15} />,
};

export function StatusDialog({ target, onClose, onSaved }: {
  target: { barrel: GodownBarrel; action: StatusAction } | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(''); setBusy(false); resetEntry(); }, [target, resetEntry]);

  const save = async () => {
    if (!target) return;
    const { barrel, action } = target;
    setBusy(true); setErr('');
    try {
      const b = await api.setGodownStatus({ barrelId: barrel.id, action, ...entry.when });
      toast.show({ tone: 'success', title: action === 'reopen' ? 'Barrel reopened' : action === 'settle' ? 'Barrel settling' : 'Barrel ready', detail: statusCopy[action].done(b) });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not change the barrel status.'));
    } finally { setBusy(false); }
  };

  const b = target?.barrel;
  const copy = target ? statusCopy[target.action] : null;
  return (
    <Dialog
      open={target !== null} onOpenChange={(o) => !o && onClose()} size="sm"
      title={b && copy ? copy.title(b) : 'Change barrel status'}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={target ? statusIcon[target.action] : undefined} kbd="Enter" disabled={busy} onClick={() => void save()}>{copy?.cta}</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        {b && (
          <div className="divide-y divide-line/70 rounded-card border border-line bg-surface-2 px-3 text-sm">
            <div className="flex items-center justify-between gap-3 py-2"><span className="text-muted">Barrel</span><span className="font-semibold text-ink">{b.label}</span></div>
            <div className="flex items-center justify-between gap-3 py-2"><span className="text-muted">Oil</span><span className="text-ink">{b.oilName}</span></div>
            <div className="flex items-center justify-between gap-3 py-2"><span className="text-muted">In the barrel</span><span className="num font-semibold text-ink">{fmtMilli(b.levelL)} L</span></div>
            <div className="flex items-center justify-between gap-3 py-2"><span className="text-muted">Status now</span><Badge tone={b.status === 'ready' ? 'success' : b.status === 'settling' ? 'warning' : b.status === 'filling' ? 'info' : 'neutral'}>{STATUS_LABEL[b.status]}</Badge></div>
          </div>
        )}
        {b && copy && <p className="text-sm text-muted">{copy.body(b)}</p>}
        <EntryDate entry={entry} />
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* ---------------- stick reading ---------------- */
export function StickReadingDialog({ barrel, onClose, onSaved }: {
  barrel: GodownBarrel | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [measured, setMeasured] = useState('');
  const [note, setNote] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMeasured(''); setNote(''); setErr(''); setBusy(false); resetEntry(); }, [barrel, resetEntry]);

  const entered = measured.trim() === '' ? null : litresToMilli(measured);
  const variance = barrel && entered !== null ? entered - barrel.levelL : null;

  const save = async () => {
    if (!barrel) return;
    if (entered === null) { setErr('Enter the litres the stick shows.'); return; }
    if (entered < 0) { setErr('The reading cannot be negative.'); return; }
    if (entered > barrel.capacityL) { setErr(`${barrel.label} holds ${fmtMilli(barrel.capacityL, 0)} L at most. Check the reading.`); return; }
    setBusy(true); setErr('');
    try {
      await api.recordStickReading({ barrelId: barrel.id, measuredL: entered, note: note.trim(), ...entry.when });
      toast.show({
        tone: 'success',
        title: 'Stick reading saved',
        detail: `${barrel.label} · ${fmtMilli(entered)} L${variance && variance !== 0 ? ` · ${variance > 0 ? '+' : ''}${fmtMilli(variance)} L variance` : ''}`,
      });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not save the reading.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={barrel !== null} onOpenChange={(o) => !o && onClose()} size="sm" title="Stick reading"
      description={barrel ? `${barrel.label} · ${barrel.oilName}` : undefined}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Save size={15} />} kbd="Enter" disabled={busy || !barrel} onClick={() => void save()}>Save reading</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        <Field label="Litres on the stick" hint={barrel ? `The barrel holds ${fmtMilli(barrel.capacityL, 0)} L at most.` : undefined}>
          <NumberInput data-autofocus decimals={1} value={measured} onValueChange={(v) => { setMeasured(v); setErr(''); }} placeholder={barrel ? fmtMilli(barrel.levelL) : '0'} />
        </Field>

        {barrel && (
          <div className="grid grid-cols-3 gap-2 rounded-card border border-line bg-surface-2 p-3">
            <div>
              <div className="text-[11px] text-muted">Entries say</div>
              <div className="num text-sm font-semibold text-ink">{fmtMilli(barrel.levelL)} L</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Stick says</div>
              <div className="num text-sm font-semibold text-ink">{entered === null ? '—' : `${fmtMilli(entered)} L`}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Variance</div>
              {variance === null ? (
                <span className="text-sm text-subtle">—</span>
              ) : variance === 0 ? (
                <Badge tone="neutral">No variance</Badge>
              ) : (
                <Badge tone={variance < 0 ? 'warning' : 'info'}>{variance > 0 ? '+' : ''}{fmtMilli(variance)} L</Badge>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-subtle">The stick is the truth: the barrel level becomes the measured litres and the difference to the entries is kept as a variance.</p>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. end of day" />
        <EntryDate entry={entry} />
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* ---------------- outsourced oil ---------------- */
export function OutsourcedOilDialog({ open, barrels, onClose, onSaved }: {
  open: boolean; barrels: GodownBarrel[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [oil, setOil] = useState<SeedType>('groundnut');
  const [barrelId, setBarrelId] = useState('');
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
  const [invoice, setInvoice] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const fillable = useMemo(() => barrels.filter(isFillable), [barrels]);

  useEffect(() => {
    if (!open) return;
    void api.listSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = barrels.find(isFillable);
    setOil(first?.oil ?? 'groundnut');
    setBarrelId(first?.id ?? '');
    setSupplierId(''); setLitres(''); setCost(''); setInvoice(''); resetEntry(); setErr(''); setBusy(false);
  }, [open, barrels, resetEntry]);

  const oilBarrels = fillable.filter((b) => b.oil === oil);
  const barrel = barrels.find((b) => b.id === barrelId) ?? null;
  const litresM = litresToMilli(litres);
  const costP = rupeesToPaise(cost);
  const rate = litresM > 0 ? Math.round((costP * 1000) / litresM) : 0;
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;

  const pickOil = (o: SeedType) => {
    setOil(o);
    setBarrelId(fillable.find((b) => b.oil === o)?.id ?? '');
    setErr('');
  };

  const save = async () => {
    if (!supplierId) { setErr('Pick the supplier or manufacturer you bought the oil from.'); return; }
    if (!barrelId || !barrel) { setErr('Pick the godown barrel that receives the oil.'); return; }
    if (litresM <= 0) { setErr('Enter the litres bought.'); return; }
    if (costP < 0) { setErr('The cost cannot be negative.'); return; }
    setBusy(true); setErr('');
    try {
      const note = invoice.trim() ? `Invoice ${invoice.trim()}` : '';
      await api.recordOutsourcedOil({ barrelId: barrel.id, supplierId, supplierName: supplier?.name, litresL: litresM, cost: costP, note, ...entry.when });
      toast.show({ tone: 'success', title: 'Bought oil recorded', detail: `${fmtMilli(litresM)} L ${barrel.oilName} from ${supplier?.name ?? 'supplier'}` });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not record the bought oil.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Bought oil (outsourced)"
      description="Oil bought from an outside mill, poured into a godown barrel."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Truck size={15} />} kbd="Enter" disabled={busy} onClick={() => void save()}>Record purchase</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Select
              label="Supplier" data-autofocus value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setErr(''); }}
              options={[{ value: '', label: suppliers.length ? 'Pick a supplier' : 'No suppliers yet' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            />
            {suppliers.length === 0 && <p className="mt-1 text-xs text-subtle">Add the supplier in Purchases first, then come back.</p>}
          </div>
          <Select label="Oil type" value={oil} onChange={(e) => pickOil(e.target.value as SeedType)} options={OILS.map((o) => ({ value: o, label: OIL_LABEL[o] }))} />
          <Select
            label="Godown barrel" value={barrelId} onChange={(e) => { setBarrelId(e.target.value); setErr(''); }}
            options={oilBarrels.length ? oilBarrels.map((b) => ({ value: b.id, label: `${b.label} · ${fmtMilli(b.levelL)}/${fmtMilli(b.capacityL, 0)} L` })) : [{ value: '', label: 'No filling or empty barrel' }]}
            disabled={oilBarrels.length === 0}
          />
          <Field label="Litres bought">
            <NumberInput decimals={1} value={litres} onValueChange={(v) => { setLitres(v); setErr(''); }} placeholder="0" />
          </Field>
          <Field label="Cost (rupees)">
            <NumberInput prefix="₹" decimals={2} value={cost} onValueChange={(v) => { setCost(v); setErr(''); }} placeholder="0.00" />
          </Field>
          <Field label="Invoice no">
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="e.g. KCM/1042" className="num" />
          </Field>
        </div>
        <EntryDate entry={entry} label="Date bought" />

        {barrel && litresM > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">{fmtMilli(litresM)} L into <span className="font-medium text-ink">{barrel.label}</span></span>
            <span className="text-muted">Room <span className="num font-medium text-ink">{fmtMilli(barrel.capacityL - barrel.levelL)} L</span></span>
            {costP > 0 && <span className="text-muted"><Money paise={rate} /> / L</span>}
          </div>
        )}
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/* ---------------- transfer settled oil to the store ---------------- */
/** A store loose-oil item belongs to a godown oil when its name (without " (Loose)") is the oil's name. */
const looseOilFor = (item: Item, oilName: string) =>
  item.loose && item.active && item.categoryId === 'oil' && item.name.replace(/ \(Loose\)$/, '').toLowerCase() === oilName.toLowerCase();

export function TransferToStoreDialog({ barrel, onClose, onSaved }: {
  barrel: GodownBarrel | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [itemId, setItemId] = useState('');
  const [litres, setLitres] = useState('');
  const [note, setNote] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!barrel) return;
    // Default to everything in the barrel; a partly emptied barrel can move only some litres.
    setLitres(String(Math.floor(barrel.levelL / 100) / 10));
    setItemId(''); setNote(''); setErr(''); setBusy(false); resetEntry();
    void api.listItems().then(setItems).catch(() => setItems([]));
  }, [barrel, resetEntry]);

  const oilItems = useMemo(
    () => (barrel ? items.filter((i) => looseOilFor(i, barrel.oilName)) : []),
    [items, barrel],
  );
  useEffect(() => {
    if (!barrel) return;
    setItemId((cur) => (oilItems.some((i) => i.id === cur) ? cur : oilItems[0]?.id ?? ''));
  }, [barrel, oilItems]);

  const item = oilItems.find((i) => i.id === itemId) ?? null;
  const litresM = litresToMilli(litres);
  const afterL = barrel ? barrel.levelL - litresM : 0;
  const tooMuch = barrel !== null && litresM > barrel.levelL;

  const save = async () => {
    if (!barrel) return;
    if (!item) { setErr(`No loose ${barrel.oilName} item to receive the oil. Add it in Items first.`); return; }
    if (litresM <= 0) { setErr('Enter the litres to move to the store.'); return; }
    if (litresM > barrel.levelL) { setErr(`${barrel.label} holds only ${fmtMilli(barrel.levelL)} L.`); return; }
    setBusy(true); setErr('');
    try {
      const t = await api.transferToStore({ barrelId: barrel.id, itemId: item.id, litresL: litresM, note: note.trim(), ...entry.when });
      toast.show({
        tone: 'success',
        title: `${fmtMilli(t.litresL)} L moved to the store`,
        detail: `${t.number} · ${barrel.label} to ${item.name}`,
      });
      onSaved(); onClose();
    } catch (e) {
      setErr(reason(e, 'Could not move the oil to the store.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={barrel !== null} onOpenChange={(o) => !o && onClose()} size="md" title="Transfer to store"
      description={barrel ? `${barrel.label} · ${barrel.oilName} · settled and ready` : undefined}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<ArrowRightLeft size={15} />} kbd="Enter" disabled={busy || !item || tooMuch || litresM <= 0} onClick={() => void save()}>Transfer to store</Button></>}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLSelectElement) e.preventDefault(); }}
      >
        {barrel && (
          <div className="grid grid-cols-3 gap-2 rounded-card border border-line bg-surface-2 p-3">
            <div>
              <div className="text-[11px] text-muted">In the barrel</div>
              <div className="num text-sm font-semibold text-ink">{fmtMilli(barrel.levelL)} L</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Moving now</div>
              <div className="num text-sm font-semibold text-ink">{litresM > 0 ? `${fmtMilli(litresM)} L` : '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Left in barrel</div>
              <div className={cn('num text-sm font-semibold', afterL < 0 ? 'text-danger' : 'text-ink')}>{afterL >= 0 ? `${fmtMilli(afterL)} L` : `${fmtMilli(-afterL)} L short`}</div>
            </div>
          </div>
        )}

        <Select
          label="Store loose-oil item" data-autofocus value={itemId} onChange={(e) => { setItemId(e.target.value); setErr(''); }}
          options={oilItems.length ? oilItems.map((i) => ({ value: i.id, label: `${i.name} · ${fmtMilli(i.stock)} L in store` })) : [{ value: '', label: 'No matching loose-oil item' }]}
          disabled={oilItems.length === 0}
        />
        {barrel && oilItems.length === 0 && (
          <p className="text-xs text-warning">No active loose {barrel.oilName} item. Add it in Items, then come back — the oil can only go to a loose-oil item sold by the litre.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Litres to move" hint={barrel ? `${barrel.label} holds ${fmtMilli(barrel.levelL)} L. Part of it can stay.` : undefined}>
            <NumberInput decimals={1} value={litres} onValueChange={(v) => { setLitres(v); setErr(''); }} placeholder="0" />
          </Field>
          <div className="flex items-end">
            <Button type="button" size="sm" onClick={() => setLitres(String(Math.floor((barrel?.levelL ?? 0) / 100) / 10))} disabled={!barrel}>All of it</Button>
          </div>
        </div>

        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. barrel 3 settled, filled the counter barrel" />

        <p className="text-xs text-subtle">The litres leave the godown barrel and are added to this item's store stock. Godown oil never appears in store or POS stock until this transfer.</p>
        {tooMuch && <div className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">The barrel holds {fmtMilli(barrel?.levelL ?? 0)} L. Move that much or less.</div>}
        <EntryDate entry={entry} />
        {err && <ErrorBox>{err}</ErrorBox>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
