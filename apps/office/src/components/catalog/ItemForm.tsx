import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, Star, Wand2, X } from 'lucide-react';
import {
  formatQty, marginPercent, parsePaise, parseQty,
  type Brand, type Category, type Item, type ItemInput, type ItemIssues, type UnitCode,
} from '@gokul/data';
import { Badge, Button, Field, Input, Money, NumberInput, Select, Switch, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { useGstRates } from '../../useGstRates';
import { Barcode } from './Barcode';
import { Section, Segmented, unitText } from './shared';

interface FormState {
  name: string; nameTa: string; code: string; barcodes: string[]; barcodeDraft: string;
  categoryId: string; brand: string; unit: UnitCode; loose: boolean; packSize: string; parentId: string; scaleCode: string;
  shelfLife: string; shelfLifeUnit: 'days' | 'months';
  hsn: string; gstRate: string; cessRate: string; mrp: string; price: string; wholesale: string; cost: string; reorder: string; active: boolean; supplierId: string;
}

const LOOSE_UNITS: UnitCode[] = ['kg', 'l', 'g', 'ml'];
const PACKED_UNITS: UnitCode[] = ['btl', 'tin', 'pkt', 'pc'];
const unitOptions = (u: UnitCode[]) => u.map((x) => ({ value: x, label: unitText(x) }));
const rupees = (p: number) => (p ? (p / 100).toFixed(2).replace(/\.00$/, '') : '');

const blank = (): FormState => ({
  name: '', nameTa: '', code: '', barcodes: [], barcodeDraft: '', categoryId: '', brand: 'Gokul', unit: 'btl', loose: false,
  packSize: '', parentId: '', scaleCode: '', shelfLife: '', shelfLifeUnit: 'months', hsn: '', gstRate: '5', cessRate: '', mrp: '', price: '', wholesale: '', cost: '', reorder: '', active: true, supplierId: '',
});

function toInput(f: FormState, id?: string): ItemInput {
  return {
    id, name: f.name, nameTa: f.nameTa, code: f.code, barcodes: f.barcodes, categoryId: f.categoryId, brand: f.brand,
    unit: f.unit, loose: f.loose, packSize: f.packSize, parentId: f.parentId, scaleCode: f.scaleCode, hsn: f.hsn,
    shelfLife: Number(f.shelfLife) > 0 ? Number(f.shelfLife) : undefined, shelfLifeUnit: f.shelfLifeUnit,
    gstRate: Number(f.gstRate), cessRate: Number(f.cessRate) > 0 ? Number(f.cessRate) : undefined,
    mrp: parsePaise(f.mrp) ?? 0, price: parsePaise(f.price) ?? 0, cost: parsePaise(f.cost) ?? 0, wholesalePrice: parsePaise(f.wholesale) ?? undefined,
    reorderLevel: parseQty(f.reorder) ?? 0, active: f.active, supplierId: f.supplierId,
  };
}

/**
 * The item editor. Used as the body of the large side sheet on Items and as the full pane at /items/new.
 * Owns its scroll area and pinned footer, so the parent just gives it a height.
 */
export function ItemForm({ itemId, onSaved, onCancel, layout = 'sheet', defaults }: {
  itemId?: string; onSaved: (item: Item) => void; onCancel: () => void; layout?: 'sheet' | 'pane';
  /** New items only: start with this category and brand (Categories and brands screen). */
  defaults?: { categoryId?: string; brand?: string };
}) {
  const toast = useToast();
  const gstRates = useGstRates();
  const [f, setF] = useState<FormState>(blank);
  const [loaded, setLoaded] = useState(!itemId);
  const [cats, setCats] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [looseItems, setLooseItems] = useState<Item[]>([]);
  const [issues, setIssues] = useState<ItemIssues>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [c, b, l, sup] = await Promise.all([api.listCategories(), api.listBrands(), api.listLooseItems(), api.listSuppliers()]);
      if (!live) return;
      setCats(c); setBrands(b); setLooseItems(l); setSuppliers(sup.map((x) => ({ id: x.id, name: x.name })));
      if (itemId) {
        const d = await api.getItemDetail(itemId);
        if (!live || !d) return;
        const i = d.item;
        setF({
          name: i.name, nameTa: i.nameTa ?? '', code: i.code, barcodes: d.barcodes, barcodeDraft: '', categoryId: i.categoryId, brand: i.brand,
          unit: i.unit, loose: i.loose, packSize: i.packSize ?? '', parentId: d.parentId, scaleCode: d.scaleCode, shelfLife: i.shelfLife ? String(i.shelfLife) : '', shelfLifeUnit: i.shelfLifeUnit ?? 'months', hsn: i.hsn,
          gstRate: String(i.gstRate), cessRate: i.cessRate ? String(i.cessRate) : '', mrp: rupees(i.mrp), price: rupees(i.price), wholesale: rupees(i.wholesalePrice ?? 0), cost: rupees(i.cost),
          reorder: i.reorderLevel ? String(i.reorderLevel / 1000) : '', active: i.active, supplierId: i.supplierId ?? '',
        });
        setLoaded(true);
      } else {
        const code = await api.nextItemCode();
        if (live) setF((s) => ({ ...s, code, categoryId: defaults?.categoryId || c[0]?.id || '', brand: defaults?.brand || s.brand }));
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const input = useMemo(() => toInput(f, itemId), [f, itemId]);
  useEffect(() => {
    let live = true;
    api.validateItem(input).then((x) => { if (live) setIssues(x); });
    return () => { live = false; };
  }, [input]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const err = (k: string) => (attempted || touched.has(k) ? issues[k] : undefined);
  const blockingCount = Object.keys(issues).filter((k) => !(k === 'cost' && input.cost > input.price)).length;
  const costWarn = issues.cost && input.cost > input.price && input.price > 0 ? issues.cost : undefined;

  const setLoose = (loose: boolean) =>
    setF((s) => ({ ...s, loose, unit: (loose ? LOOSE_UNITS : PACKED_UNITS).includes(s.unit) ? s.unit : loose ? 'kg' : 'btl' }));

  const addBarcode = useCallback((raw: string) => {
    const b = raw.trim();
    if (!b) return;
    setF((s) => (s.barcodes.includes(b) ? { ...s, barcodeDraft: '' } : { ...s, barcodes: [...s.barcodes, b], barcodeDraft: '' }));
    touch('barcodes');
  }, []);
  const generate = async () => addBarcode(await api.generateBarcode());

  const save = useCallback(async () => {
    if (saving) return;
    setAttempted(true);
    const res = await api.saveItem(input);
    if (!res.ok) { setIssues(res.issues); return; }
    setSaving(true);
    toast.show({ tone: 'success', title: itemId ? 'Item updated' : 'Item added', detail: res.item.name });
    onSaved(res.item);
  }, [saving, input, itemId, onSaved, toast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); void save(); }
      else if (layout === 'pane' && e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save, layout, onCancel]);

  const margin = marginPercent(input.price, input.cost, input.gstRate, input.cessRate ?? 0);
  const taxable = input.price ? Math.round((input.price * 10000) / (10000 + Math.round((input.gstRate + (input.cessRate ?? 0)) * 100))) : 0;
  const profit = taxable - input.cost;
  const mrpOff = input.mrp > 0 && input.price > 0 && input.price <= input.mrp ? ((input.mrp - input.price) / input.mrp) * 100 : 0;
  const marginTone = margin === null ? 'text-subtle' : margin < 0 ? 'text-danger' : margin < 10 ? 'text-warning' : 'text-success';
  const per = f.loose ? ` per ${unitText(f.unit)}` : '';
  const parent = looseItems.find((l) => l.id === f.parentId);

  const stockSection = (
    <Section title="Stock and status" hint={itemId ? <CurrentStock itemId={itemId} loose={f.loose} unit={f.unit} /> : undefined}>
      <div className="grid grid-cols-2 items-end gap-3">
        <NumberInputField label={`Reorder level (${unitText(f.unit)})`} value={f.reorder} onChange={(v) => set('reorder', v)} decimals={f.loose ? 3 : 0} error={err('reorderLevel')} hint="Warn when stock falls to this." />
        <div className="pb-1"><Switch checked={f.active} onCheckedChange={(v) => set('active', v)} label={<span className="font-medium">{f.active ? 'Active, can be billed' : 'Inactive, hidden from billing'}</span>} /></div>
      </div>
    </Section>
  );

  if (!loaded) return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading item...</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-bg p-3">
        <div className={cn('mx-auto grid grid-cols-2 items-start gap-3', layout === 'pane' && 'max-w-[1100px]')}>
          <div className="flex flex-col gap-3">
            <Section title="Item">
              <Input
                label="Name (English)" value={f.name} autoFocus placeholder="e.g. Groundnut Oil 1 L"
                onChange={(e) => set('name', e.target.value)} onBlur={() => touch('name')} error={err('name')}
              />
              <div className="mt-3 grid grid-cols-6 gap-3">
                <div className="col-span-4"><Input label="Name (Tamil)" value={f.nameTa} placeholder="கடலை எண்ணெய்" onChange={(e) => set('nameTa', e.target.value)} /></div>
                <div className="col-span-2"><Input label="Counter code" value={f.code} inputMode="numeric" className="num" onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))} onBlur={() => touch('code')} error={err('code')} /></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Select label="Category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} options={[{ value: '', label: 'Choose category' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
                <Select label="Brand" value={f.brand} onChange={(e) => set('brand', e.target.value)} options={brands.map((b) => ({ value: b.name, label: b.name }))} />
              </div>
              <div className="mt-3"><Select label="Supplier" value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)} options={[{ value: '', label: 'No supplier' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} /></div>
              {err('categoryId') && <div className="mt-1 text-xs text-danger">{err('categoryId')}</div>}
            </Section>

            <Section title="Sold as" hint="Loose is weighed, packed has a fixed size">
              <div className="flex items-center gap-4">
                <Segmented value={f.loose ? 'loose' : 'packed'} onChange={(v) => setLoose(v === 'loose')} options={[{ value: 'loose', label: 'Loose (kg / L)' }, { value: 'packed', label: 'Packed' }]} />
                <div className="w-36"><Select value={f.unit} onChange={(e) => set('unit', e.target.value as UnitCode)} options={unitOptions(f.loose ? LOOSE_UNITS : PACKED_UNITS)} aria-label="Unit" /></div>
              </div>
              <div className="mt-1.5 text-xs text-subtle">{f.loose ? 'Quantity at the counter can have decimals, like 1.250 kg.' : 'Quantity is whole numbers only.'}</div>
              {f.loose ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input label="Weighing scale code" value={f.scaleCode} inputMode="numeric" className="num" placeholder="e.g. 101" onChange={(e) => set('scaleCode', e.target.value.replace(/\D/g, '').slice(0, 5))} onBlur={() => touch('scaleCode')} error={err('scaleCode')} hint="The product number set on the scale (PLU)." />
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input label="Pack size" value={f.packSize} placeholder="e.g. 1 L, 500 g, 15 L tin" onChange={(e) => set('packSize', e.target.value)} onBlur={() => touch('packSize')} error={err('packSize')} />
                  <Field label="Filled from loose item" hint={parent ? `Packing a ${f.packSize || 'pack'} takes oil from ${parent.name}.` : 'Leave empty if you buy it ready packed.'}>
                    <Select value={f.parentId} onChange={(e) => set('parentId', e.target.value)} options={[{ value: '', label: 'None, bought packed' }, ...looseItems.map((l) => ({ value: l.id, label: l.name.replace(' (Loose)', '') }))]} />
                  </Field>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Shelf life (optional)" hint="Used for the Exp date on barcode stickers. Leave empty to print Exp blank.">
                  <div className="flex gap-2">
                    <Input value={f.shelfLife} inputMode="numeric" className="num" placeholder="e.g. 6" onChange={(e) => set('shelfLife', e.target.value.replace(/\D/g, '').slice(0, 4))} />
                    <Select value={f.shelfLifeUnit} onChange={(e) => set('shelfLifeUnit', e.target.value as 'days' | 'months')} options={[{ value: 'months', label: 'months' }, { value: 'days', label: 'days' }]} />
                  </div>
                </Field>
              </div>
            </Section>

            {layout === 'sheet' && stockSection}
          </div>

          <div className="flex flex-col gap-3">
            <Section title="Tax and prices" hint={`Prices include GST${per}`}>
              <div className="grid grid-cols-3 gap-3">
                <Input label="HSN code" value={f.hsn} inputMode="numeric" className="num" placeholder="e.g. 1508" onChange={(e) => set('hsn', e.target.value.replace(/\D/g, '').slice(0, 8))} onBlur={() => touch('hsn')} error={err('hsn')} />
                <Select label="GST rate" value={f.gstRate} title={err('gstRate')}
                  onChange={(e) => set('gstRate', e.target.value)}
                  options={[...new Set([...gstRates, Number(f.gstRate)])].sort((a, b) => a - b).map((r) => ({ value: String(r), label: r === 0 ? '0% (exempt)' : `${r}%` }))} />
                <Input label="Cess %" value={f.cessRate} inputMode="decimal" className="num" placeholder="None" hint="Only for goods that carry cess (confirm with CA)" onChange={(e) => set('cessRate', e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} error={err('cessRate')} />
              </div>
              {err('gstRate') && <div className="mt-1 text-xs text-danger">{err('gstRate')}</div>}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label={`MRP${per}`} error={err('mrp')}><NumberInput prefix="₹" value={f.mrp} onValueChange={(v) => set('mrp', v)} onBlur={() => touch('mrp')} placeholder="0.00" /></Field>
                <Field label={`Selling price${per}`} error={err('price')}><NumberInput prefix="₹" value={f.price} onValueChange={(v) => set('price', v)} onBlur={() => touch('price')} placeholder="0.00" /></Field>
                <Field label={`Purchase cost${per}`} error={err('cost') && !costWarn ? err('cost') : undefined}><NumberInput prefix="₹" value={f.cost} onValueChange={(v) => set('cost', v)} onBlur={() => touch('cost')} placeholder="0.00" /></Field>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label={`Wholesale price${per}`} hint="Optional. Used when a POS bill is switched to wholesale."><NumberInput prefix="₹" value={f.wholesale} onValueChange={(v) => set('wholesale', v)} placeholder="None" /></Field>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
                <div className="bg-surface-2 px-3 py-2">
                  <div className="text-xs text-muted">Margin</div>
                  <div className={cn('text-lg font-semibold num', marginTone)}>{margin === null ? '-' : `${margin.toFixed(1)}%`}</div>
                </div>
                <div className="bg-surface-2 px-3 py-2">
                  <div className="text-xs text-muted">Profit{per}</div>
                  <div className={cn('text-lg font-semibold num', input.price ? marginTone : 'text-subtle')}>{input.price ? <Money paise={profit} /> : '-'}</div>
                </div>
                <div className="bg-surface-2 px-3 py-2">
                  <div className="text-xs text-muted">Below MRP</div>
                  <div className="text-lg font-semibold num text-ink">{mrpOff ? `${mrpOff.toFixed(1)}%` : '-'}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-subtle">
                {input.price > 0 ? <>Price without GST <Money paise={taxable} />, GST{input.cessRate ? ' and cess' : ''} <Money paise={input.price - taxable} /> at {input.gstRate}%{input.cessRate ? ` + ${input.cessRate}% cess` : ''}. Margin is on the price without GST.</> : 'Margin is shown once you enter the selling price.'}
              </div>
              {costWarn && <div className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">{costWarn}</div>}
            </Section>

            <Section title="Barcodes" hint="First one prints on labels">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={f.barcodeDraft} inputMode="numeric" className="num" placeholder="Scan or type a barcode"
                    onChange={(e) => set('barcodeDraft', e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addBarcode(f.barcodeDraft); } }}
                    onBlur={() => touch('barcodes')}
                    error={err('barcodes')}
                  />
                </div>
                <Button icon={<Plus size={14} />} onClick={() => addBarcode(f.barcodeDraft)} disabled={!f.barcodeDraft}>Add</Button>
                <Button icon={<Wand2 size={14} />} onClick={generate}>Generate EAN-13</Button>
              </div>
              {f.barcodes.length > 0 && (
                <div className="mt-3 flex items-stretch gap-4">
                  <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {f.barcodes.map((b, i) => (
                      <li key={b} className="flex h-8 items-center gap-2 rounded-control border border-line bg-surface-2 pl-3 pr-1">
                        <span className="selectable num flex-1 text-sm font-medium text-ink">{b}</span>
                        {i === 0
                          ? <Badge tone="primary"><Star size={10} /> Primary</Badge>
                          : <button type="button" className="rounded px-1.5 text-xs text-muted hover:bg-surface-3 hover:text-ink" onClick={() => setF((s) => ({ ...s, barcodes: [b, ...s.barcodes.filter((x) => x !== b)] }))}>Make primary</button>}
                        <button type="button" aria-label={`Remove barcode ${b}`} className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-surface-3 hover:text-danger" onClick={() => setF((s) => ({ ...s, barcodes: s.barcodes.filter((x) => x !== b) }))}><X size={13} /></button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex w-[150px] shrink-0 items-center justify-center rounded-control border border-line bg-white p-2 text-black">
                    <Barcode code={f.barcodes[0]} className="h-[58px] w-full" />
                  </div>
                </div>
              )}
            </Section>
            {layout === 'pane' && stockSection}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3">
        <div className="text-sm">
          {attempted && blockingCount > 0
            ? <span className="font-medium text-danger">{blockingCount} {blockingCount === 1 ? 'thing needs' : 'things need'} fixing before you can save.</span>
            : <span className="text-muted">{itemId ? 'Changes apply to new bills straight away.' : 'New items start with zero stock. Add stock from Purchases or Stock.'}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onCancel} kbd="Esc">Cancel</Button>
          <Button variant="primary" icon={<Check size={15} />} onClick={() => void save()} kbd="Ctrl+S">{itemId ? 'Save changes' : 'Save item'}</Button>
        </div>
      </div>
    </div>
  );
}

function NumberInputField({ label, value, onChange, decimals, error, hint }: {
  label: string; value: string; onChange: (v: string) => void; decimals: number; error?: string; hint?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      <NumberInput value={value} onValueChange={onChange} decimals={decimals} placeholder="0" />
    </Field>
  );
}

function CurrentStock({ itemId, loose, unit }: { itemId: string; loose: boolean; unit: string }) {
  const [stock, setStock] = useState<number | null>(null);
  useEffect(() => { api.getItemDetail(itemId).then((d) => setStock(d?.item.stock ?? null)); }, [itemId]);
  if (stock === null) return null;
  return <>In hand <span className="font-semibold text-ink num">{formatQty(stock, loose)} {unitText(unit)}</span></>;
}
