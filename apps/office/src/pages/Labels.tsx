import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Barcode as BarcodeIcon, Minus, Plus, Printer, Search, X } from 'lucide-react';
import { fuzzyFilter, LABEL_PRESETS, type Item, type LabelOptions, type LabelPresetId, type LabelPreview, type PrinterSettings } from '@gokul/data';
import { Badge, Button, Checkbox, EmptyState, Input, Money, PageHeader, Select, cn, useToast } from '@gokul/ui';
import { api } from '../store';
import { DEFAULT_FIELDS, GOKUL_FIELDS, LabelRoll, RIBBON_FIELDS } from '../components/catalog/LabelPreview';

/** The fields a sticker size starts with: the Gokul stickers carry their own set. */
const fieldsFor = (p: LabelPresetId) => (p === 'gokul-small' ? GOKUL_FIELDS : p === '32x25-3up' ? RIBBON_FIELDS : DEFAULT_FIELDS);

const MAX_PREVIEW = 24;
/** Today as YYYY-MM-DD in the shop's local time (the default Pkd shown in the dialog). */
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
type Custom = { width: string; height: string; gap: string; columns: string; colGap: string };

export function Labels() {
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [printer, setPrinter] = useState<PrinterSettings | null>(null);
  const [preset, setPreset] = useState<LabelPresetId>('gokul-small');
  const [custom, setCustom] = useState<Custom>({ width: '50', height: '25', gap: '3', columns: '1', colGap: '0' });
  const [fields, setFields] = useState(GOKUL_FIELDS);
  const [months, setMonths] = useState('');
  const [packDate, setPackDate] = useState(todayIso);
  const [expDate, setExpDate] = useState('');
  const [batch, setBatch] = useState('');
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listItems().then((x) => {
      setItems([...x]);
      const fromNav = (loc.state as { ids?: string[] } | null)?.ids;
      const start = fromNav?.length ? x.filter((i) => fromNav.includes(i.id)) : x.filter((i) => !i.loose && i.categoryId === 'oil' && i.packSize === '1 L').slice(0, 3);
      setCopies(Object.fromEntries(start.map((i) => [i.id, fromNav?.length ? 1 : 4])));
    });
  }, [loc.state]);

  // the label printer and size saved in Settings, Printers
  useEffect(() => {
    api.getSettingsBundle().then((b) => {
      const p = b.printers;
      setPrinter(p);
      setPreset(p.labelPreset);
      setFields(fieldsFor(p.labelPreset));
      setCustom({ width: String(p.labelWidth), height: String(p.labelHeight), gap: String(p.labelGap), columns: String(p.labelColumns), colGap: String(p.labelColGap) });
    }).catch(() => undefined);
  }, []);

  const shown = useMemo(() => fuzzyFilter(items.filter((i) => i.active), q, (i) => [i.name, i.code, i.barcode], 200), [items, q]);
  const picked = useMemo(() => items.filter((i) => copies[i.id] > 0), [items, copies]);
  const total = picked.reduce((s, i) => s + copies[i.id], 0);
  const sheet = useMemo(() => picked.flatMap((i) => Array.from({ length: copies[i.id] }, () => i)), [picked, copies]);
  const shownSheet = sheet.slice(0, MAX_PREVIEW);
  const allShown = shown.length > 0 && shown.every((i) => copies[i.id] > 0);

  const opts: LabelOptions = useMemo(() => ({
    preset,
    ...(preset === 'custom' ? { width: Number(custom.width) || 0, height: Number(custom.height) || 0, gap: Number(custom.gap) || 0, columns: Number(custom.columns) || 1, colGap: Number(custom.colGap) || 0 } : {}),
    fields, packDate: packDate || undefined, expDate: expDate || undefined, bestBeforeMonths: months === '' ? undefined : Number(months), batch: batch.trim() || undefined,
  }), [preset, custom, fields, packDate, expDate, months, batch]);
  const columns = preview?.spec?.columns ?? (LABEL_PRESETS.find((p) => p.id === preset)?.columns ?? (Number(custom.columns) || 1));

  // the preview is drawn by the same code that makes the printer commands
  const previewIds = useMemo(() => [...new Set(shownSheet.map((i) => i.id))], [shownSheet]);
  useEffect(() => {
    if (previewIds.length === 0) { setPreview(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.labelPreview(previewIds, opts).then((r) => live && setPreview(r), (e: Error) => live && setPreview({ ok: false, message: e.message, spec: null, labels: [] }));
    }, 150);
    return () => { live = false; window.clearTimeout(t); };
  }, [previewIds, opts]);
  const cells = useMemo(() => {
    const by = new Map((preview?.labels ?? []).map((l) => [l.itemId, l.elements]));
    return shownSheet.flatMap((i) => (by.has(i.id) ? [by.get(i.id)!] : []));
  }, [preview, shownSheet]);

  const setCopy = (id: string, n: number) => setCopies((c) => { const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = Math.min(999, n); return x; });
  const toggleField = (k: keyof typeof fields) => setFields((f) => ({ ...f, [k]: !f[k] }));
  const rows = Math.ceil(total / Math.max(1, columns));
  const dev = printer?.detected.find((d) => d.name === printer.labelPrinter);

  const print = async () => {
    if (busy || !total) return;
    setBusy(true);
    try {
      const r = await api.printLabels(picked.map((i) => ({ itemId: i.id, copies: copies[i.id] })), opts);
      if (r.ok) toast.show({ tone: 'success', title: `${total} ${total === 1 ? 'label' : 'labels'} sent to the printer`, detail: r.message });
      else toast.show({ tone: 'error', title: 'Labels were not printed', detail: r.message, duration: 9000 });
    } catch (e) {
      toast.show({ tone: 'error', title: 'Labels were not printed', detail: e instanceof Error ? e.message : 'The printer could not be reached.' });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); void print(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const numField = (k: keyof Custom, label: string, w = 'w-20') => (
    <label className={cn('flex flex-col gap-1 text-xs font-medium text-muted', w)}>{label}
      <input
        value={custom[k]} inputMode="decimal" onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
        className="h-8 rounded-control border border-line-strong bg-surface px-2 text-right text-sm num text-ink focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
    </label>
  );

  return (
    <>
      <PageHeader
        title="Barcode labels" subtitle="Pick items and copies, choose the sticker size, check the preview" icon={<BarcodeIcon size={17} />}
        actions={<Button variant="primary" icon={<Printer size={15} />} disabled={total === 0 || busy} onClick={() => void print()} kbd="Ctrl+P">{busy ? 'Sending' : `Print ${total || ''} ${total === 1 ? 'label' : 'labels'}`}</Button>}
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
                    <div className="flex items-center gap-1.5 text-xs text-subtle"><span className="num">{i.code}</span><span className="num">{i.barcode}</span><Money paise={i.price} decimals={false} /></div>
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
              <div className="w-64">
                <Select
                  label="Label size" value={preset} onChange={(e) => { const p = e.target.value as LabelPresetId; setPreset(p); setFields(fieldsFor(p)); }}
                  options={[...LABEL_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom size' }]}
                />
                <div className="mt-1 text-xs text-subtle">{LABEL_PRESETS.find((p) => p.id === preset)?.hint ?? 'Type the size below'}</div>
              </div>
              {preset === 'custom' && (
                <div className="flex gap-2">
                  {numField('width', 'Width mm')}{numField('height', 'Height mm')}{numField('gap', 'Gap mm')}{numField('columns', 'Across', 'w-16')}{numField('colGap', 'Across gap mm', 'w-24')}
                </div>
              )}
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted">Show on label</div>
                <div className="flex max-w-[560px] flex-wrap gap-x-4 gap-y-2 pt-1.5">
                  <Checkbox checked={fields.shop} onCheckedChange={() => toggleField('shop')} label="Shop name" />
                  <Checkbox checked={fields.name} onCheckedChange={() => toggleField('name')} label="Item name" />
                  <Checkbox checked={fields.mrp} onCheckedChange={() => toggleField('mrp')} label="MRP" />
                  <Checkbox checked={fields.price} onCheckedChange={() => toggleField('price')} label="Our price" />
                  <Checkbox checked={fields.barcode} onCheckedChange={() => toggleField('barcode')} label="Barcode" />
                  <Checkbox checked={fields.qr} onCheckedChange={() => toggleField('qr')} label="QR code" />
                  <Checkbox checked={fields.dates} onCheckedChange={() => toggleField('dates')} label="Pack and expiry date" />
                  <Checkbox checked={fields.batch} onCheckedChange={() => toggleField('batch')} label="Batch" />
                  <Checkbox checked={fields.net} onCheckedChange={() => toggleField('net')} label="Net quantity" />
                  <Checkbox checked={fields.legal} onCheckedChange={() => toggleField('legal')} label="Legal Metrology line" />
                </div>
              </div>
            </div>
            {(fields.dates || fields.batch) && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">Pkd (packed on)
                  <input type="date" value={packDate} onChange={(e) => setPackDate(e.target.value)} className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm num text-ink" />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">Exp (best before)
                  <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm num text-ink" />
                </label>
                {!(preset === 'gokul-small' || preset === '32x25-3up') && (
                  <label className="flex w-40 flex-col gap-1 text-xs font-medium text-muted">Best before (months)
                    <input value={months} placeholder="blank" inputMode="numeric" onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} className="h-8 rounded-control border border-line-strong bg-surface px-2 text-right text-sm num text-ink" />
                  </label>
                )}
                <label className="flex w-40 flex-col gap-1 text-xs font-medium text-muted">Batch
                  <input value={batch} placeholder="automatic" onChange={(e) => setBatch(e.target.value)} className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm num text-ink" />
                </label>
                <span className="pb-2 text-xs text-subtle">{preset === 'gokul-small' || preset === '32x25-3up' ? 'Pkd is today unless you change it (clear it to leave Pkd and Exp blank). Exp empty: each item uses its shelf life, blank for an item without one. Check the preview before printing.' : 'Exp empty: by months or the shelf life of the item, else oil 6, jaggery 4, other 9 months.'}</span>
              </div>
            )}
          </div>

          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface-2 px-4 text-xs text-muted">
            <span className="flex items-center gap-2 font-medium">
              Preview, the same as the printer draws
              {printer && (
                <button onClick={() => nav('/settings')} className="inline-flex items-center gap-1 font-normal hover:text-ink" title="Change in Settings, Printers">
                  <Badge tone={dev ? (dev.ready ? 'success' : 'danger') : 'warning'}>{dev ? (dev.ready ? printer.labelPrinter : `${printer.labelPrinter} not ready`) : printer.labelPrinter ? `${printer.labelPrinter} not installed` : 'No label printer chosen'}</Badge>
                </button>
              )}
            </span>
            <span className="flex items-center gap-2">
              {preview?.spec && (preview.spec.alignXMm || preview.spec.alignYMm || preview.spec.pitchAdjustMm) ? <span title="From Settings, Printers, Label alignment. The preview shows the sticker; the printer prints the content moved by this much.">Aligned {preview.spec.alignXMm ?? 0} / {preview.spec.alignYMm ?? 0} mm{preview.spec.pitchAdjustMm ? `, pitch ${preview.spec.pitchAdjustMm} mm` : ''}</span> : null}
              {total > MAX_PREVIEW && <span>Showing first {MAX_PREVIEW} of {total}</span>}
              {total > 0 && <Badge tone="primary">{total} labels, {picked.length} {picked.length === 1 ? 'item' : 'items'}</Badge>}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-surface-3 p-5">
            {preview && !preview.ok ? (
              <EmptyState icon={<AlertTriangle size={22} />} title="This size cannot be printed" hint={preview.message} />
            ) : cells.length === 0 || !preview?.spec ? (
              <EmptyState icon={<BarcodeIcon size={22} />} title="No labels yet" hint="Tick items on the left and set how many stickers each needs." />
            ) : (
              <LabelRoll spec={preview.spec} cells={cells} />
            )}
          </div>
          {total > 0 && (
            <div className="flex h-9 shrink-0 items-center justify-between border-t border-line bg-surface-2 px-4 text-xs text-muted">
              <span>{columns > 1 ? `${rows} rows of ${columns} on the roll` : `${total} stickers on the roll`}</span>
              <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setCopies({})}><X size={12} /> Clear all</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
