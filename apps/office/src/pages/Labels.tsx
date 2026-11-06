import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Barcode as BarcodeIcon, Minus, Plus, Printer, Search, X } from 'lucide-react';
import { fuzzyFilter, type Item } from '@gokul/data';
import { Badge, Button, Checkbox, EmptyState, Input, Money, PageHeader, cn, useToast } from '@gokul/ui';
import { api } from '../store';
import { LabelCard, MM, SIZES, type LabelFields, type LabelSize } from '../components/catalog/LabelPreview';
import { Segmented } from '../components/catalog/shared';

const MAX_PREVIEW = 24;

export function Labels() {
  const toast = useToast();
  const loc = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [size, setSize] = useState<LabelSize>('38x25');
  const [fields, setFields] = useState<LabelFields>({ name: true, mrp: true, price: true, dates: true, batch: false });

  useEffect(() => {
    api.listItems().then((x) => {
      setItems([...x]);
      const fromNav = (loc.state as { ids?: string[] } | null)?.ids;
      const start = fromNav?.length ? x.filter((i) => fromNav.includes(i.id)) : x.filter((i) => !i.loose && i.categoryId === 'oil' && i.packSize === '1 L').slice(0, 3);
      setCopies(Object.fromEntries(start.map((i) => [i.id, fromNav?.length ? 1 : 4])));
    });
  }, [loc.state]);

  const shown = useMemo(() => fuzzyFilter(items.filter((i) => i.active), q, (i) => [i.name, i.code, i.barcode], 200), [items, q]);
  const picked = useMemo(() => items.filter((i) => copies[i.id] > 0), [items, copies]);
  const total = picked.reduce((s, i) => s + copies[i.id], 0);
  const sheet = useMemo(() => picked.flatMap((i) => Array.from({ length: copies[i.id] }, () => i)), [picked, copies]);
  const preview = sheet.slice(0, MAX_PREVIEW);
  const spec = SIZES.find((s) => s.value === size)!;
  const allShown = shown.length > 0 && shown.every((i) => copies[i.id] > 0);

  const setCopy = (id: string, n: number) => setCopies((c) => { const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = Math.min(999, n); return x; });
  const toggleField = (k: keyof LabelFields) => setFields((f) => ({ ...f, [k]: !f[k] }));
  const print = () => toast.show({ tone: 'success', title: `${total} labels sent to the printer`, detail: `${picked.length} items, ${spec.label}` });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); if (total) print(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <>
      <PageHeader
        title="Barcode labels" subtitle="Pick items and copies, choose the sticker size, check the preview" icon={<BarcodeIcon size={17} />}
        actions={<Button variant="primary" icon={<Printer size={15} />} disabled={total === 0} onClick={print} kbd="Ctrl+P">Print {total || ''} {total === 1 ? 'label' : 'labels'}</Button>}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] gap-3 p-3">
        {/* Item picker */}
        <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface">
          <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
            <div className="flex-1"><Input icon={<Search size={15} />} placeholder="Search name, code or barcode" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-3 text-xs text-muted">
            <Checkbox
              checked={allShown} label={<span className="text-xs font-medium text-muted">Select {shown.length} shown</span>}
              onCheckedChange={(c) => setCopies((cur) => { const n = { ...cur }; for (const i of shown) { if (c) n[i.id] = n[i.id] ?? 1; else delete n[i.id]; } return n; })}
            />
            {picked.length > 0 && <button className="font-medium text-primary hover:underline" onClick={() => setCopies({})}>Clear {picked.length} picked</button>}
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {shown.length === 0 && <EmptyState title="No items match" hint="Try the item name or scan a barcode." />}
            {shown.map((i) => {
              const n = copies[i.id] ?? 0;
              return (
                <li key={i.id} className={cn('flex h-[46px] items-center gap-3 border-b border-line/70 px-3', n > 0 && 'bg-primary-soft/60')}>
                  <Checkbox checked={n > 0} onCheckedChange={(c) => setCopy(i.id, c ? 1 : 0)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setCopy(i.id, n > 0 ? 0 : 1)}>
                    <div className="truncate text-sm font-medium text-ink">{i.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-subtle"><span className="num">{i.barcode}</span><Money paise={i.price} decimals={false} /></div>
                  </button>
                  {n > 0 && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button aria-label="Fewer copies" className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface-3" onClick={() => setCopy(i.id, n - 1)}><Minus size={13} /></button>
                      <input
                        aria-label={`Copies of ${i.name}`} value={n} inputMode="numeric"
                        onChange={(e) => setCopy(i.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-7 w-10 rounded-md border border-line-strong bg-surface text-center text-sm font-semibold num focus:border-primary focus:ring-2 focus:ring-primary/25"
                      />
                      <button aria-label="More copies" className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface-3" onClick={() => setCopy(i.id, n + 1)}><Plus size={13} /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Setup and preview */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-card border border-line bg-surface">
          <div className="shrink-0 border-b border-line p-4">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted">Label size</div>
                <Segmented value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.value, label: s.label }))} />
                <div className="mt-1 text-xs text-subtle">{spec.hint}</div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted">Show on label</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
                  <Checkbox checked={fields.name} onCheckedChange={() => toggleField('name')} label="Item name" />
                  <Checkbox checked={fields.mrp} onCheckedChange={() => toggleField('mrp')} label="MRP" />
                  <Checkbox checked={fields.price} onCheckedChange={() => toggleField('price')} label="Our price" />
                  <Checkbox checked={fields.dates} onCheckedChange={() => toggleField('dates')} label="Pack and expiry date" />
                  <Checkbox checked={fields.batch} onCheckedChange={() => toggleField('batch')} label="Batch" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-4 text-xs text-muted">
            <span className="font-medium">Live preview, drawn to scale</span>
            <span className="flex items-center gap-2">
              {total > MAX_PREVIEW && <span>Showing first {MAX_PREVIEW} of {total}</span>}
              {total > 0 && <Badge tone="primary">{total} labels, {picked.length} {picked.length === 1 ? 'item' : 'items'}</Badge>}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-surface-3 p-5">
            {preview.length === 0 ? (
              <EmptyState icon={<BarcodeIcon size={22} />} title="No labels yet" hint="Tick items on the left and set how many stickers each needs." />
            ) : (
              <div
                className={spec.across === 2 ? 'mx-auto grid w-fit gap-2' : 'flex flex-wrap content-start justify-center gap-3'}
                style={spec.across === 2 ? { gridTemplateColumns: `repeat(2, ${spec.w * MM}px)` } : undefined}
              >
                {preview.map((it, idx) => <LabelCard key={`${it.id}-${idx}`} item={it} size={size} fields={fields} />)}
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="flex h-9 shrink-0 items-center justify-between border-t border-line bg-surface-2 px-4 text-xs text-muted">
              <span>{spec.across === 2 ? `${Math.ceil(total / 2)} rows on the roll` : `${total} stickers on the roll`}</span>
              <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setCopies({})}><X size={12} /> Clear all</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
