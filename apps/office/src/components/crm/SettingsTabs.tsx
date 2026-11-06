import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, DatabaseBackup, FolderOpen, ImagePlus, Printer, RotateCcw, Trash2, XCircle } from 'lucide-react';
import type { BackupSettings, BillFormatSettings, ExpenseSettings, MillSettings, PrinterSettings, SecuritySettings, SettingsBundle, ShopSettings, TaxSettings } from '@gokul/data';
import { Badge, Button, Card, Dialog, Field, Input, NumberInput, Select, StatusDot, Switch, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { BillFormatPreview } from './BillFormatPreview';
import { ago, fmtDateTime, Segmented } from './common';

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/70 py-2.5 last:border-b-0">
      <div className="min-w-0"><div className="text-sm font-medium text-ink">{title}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ------------------------------ Shop ------------------------------ */
export function ShopTab({ v, set }: { v: ShopSettings; set: (n: ShopSettings) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const up = <K extends keyof ShopSettings>(k: K, val: ShopSettings[K]) => set({ ...v, [k]: val });
  const gst = v.gstin.trim().toUpperCase();
  const gstOk = GSTIN_RE.test(gst);
  const fssaiOk = /^\d{14}$/.test(v.fssai);
  const pickLogo = (f?: File) => {
    if (!f) return;
    if (f.size > 600 * 1024) { toast.show({ tone: 'error', title: 'Logo is too large', detail: 'Choose an image under 600 KB.' }); return; }
    const r = new FileReader();
    r.onload = () => up('logo', String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Shop details">
        <div className="flex flex-col gap-3">
          <Input label="Shop name (printed on bills)" value={v.name} onChange={(e) => up('name', e.target.value)} />
          <Input label="Legal name" value={v.legalName} onChange={(e) => up('legalName', e.target.value)} />
          <Input label="Address" value={v.address} onChange={(e) => up('address', e.target.value)} />
          <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
            <Input label="City" value={v.city} onChange={(e) => up('city', e.target.value)} />
            <Input label="State" value={v.state} onChange={(e) => up('state', e.target.value)} />
            <Input label="PIN code" value={v.pincode} onChange={(e) => up('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} className="num" />
          </div>
        </div>
      </Card>
      <Card title="Registration">
        <div className="flex flex-col gap-3">
          <Input
            label="GSTIN" value={v.gstin} className="num uppercase" onChange={(e) => up('gstin', e.target.value.toUpperCase().slice(0, 15))}
            error={v.gstin && !gstOk ? 'GSTIN is 15 characters, like 33AAKFG4821M1ZQ' : undefined}
            hint={gstOk ? `Valid format. State code ${gst.slice(0, 2)} is Tamil Nadu.` : 'Printed on every tax invoice.'}
          />
          <Input
            label="FSSAI licence number" value={v.fssai} className="num" onChange={(e) => up('fssai', e.target.value.replace(/\D/g, '').slice(0, 14))}
            error={v.fssai && !fssaiOk ? 'FSSAI number has 14 digits' : undefined} hint={fssaiOk ? 'Printed under the address on bills and labels.' : 'Required on food product labels.'}
          />
        </div>
      </Card>
      <Card title="Contact">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Shop phone" value={v.phone} onChange={(e) => up('phone', e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} className="num" />
          <Input label="Email" value={v.email} onChange={(e) => up('email', e.target.value)} />
        </div>
      </Card>
      <Card title="Logo">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-line-strong bg-surface-2 text-subtle">
            {v.logo ? <img src={v.logo} alt="Shop logo" className="h-full w-full object-contain" /> : <ImagePlus size={24} />}
          </div>
          <div className="min-w-0 flex-1 text-sm text-muted">
            Printed at the top of the bill in black and white. Use a simple square or wide logo, under 600 KB.
            <div className="mt-2 flex gap-2">
              <Button size="sm" icon={<ImagePlus size={13} />} onClick={() => file.current?.click()}>{v.logo ? 'Change logo' : 'Choose logo'}</Button>
              {v.logo && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => up('logo', undefined)}>Remove</Button>}
            </div>
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Tax ------------------------------ */
export function TaxTab({ v, set }: { v: TaxSettings; set: (n: TaxSettings) => void }) {
  const up = <K extends keyof TaxSettings>(k: K, val: TaxSettings[K]) => set({ ...v, [k]: val });
  const schemes: { id: TaxSettings['scheme']; title: string; body: string }[] = [
    { id: 'regular', title: 'Regular GST', body: 'Tax invoice with CGST and SGST split. Input credit on purchases. Files GSTR-1 and GSTR-3B.' },
    { id: 'composition', title: 'Composition scheme', body: 'Bill of supply with no tax shown. Pays a flat percent of turnover each quarter.' },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="GST registration type" className="col-span-2">
        <div className="grid grid-cols-2 gap-3">
          {schemes.map((s) => (
            <button
              key={s.id} type="button" onClick={() => up('scheme', s.id)}
              className={cn('flex items-start gap-3 rounded-card border p-3 text-left transition-colors', v.scheme === s.id ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-2')}
            >
              <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', v.scheme === s.id ? 'border-primary' : 'border-line-strong')}>
                {v.scheme === s.id && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span><span className="block text-sm font-semibold text-ink">{s.title}</span><span className="mt-0.5 block text-xs text-muted">{s.body}</span></span>
            </button>
          ))}
        </div>
        {v.scheme === 'composition' && (
          <div className="mt-3 w-56"><NumberInput label="Composition rate" value={String(v.compositionRatePct)} decimals={1} prefix="%" onValueChange={(x) => up('compositionRatePct', Number(x || 0))} hint="1% for traders" /></div>
        )}
      </Card>
      <Card title="GST rates in use" bodyClassName="!p-0">
        {v.rates.map((r, i) => (
          <div key={r.rate} className="flex items-center gap-4 border-b border-line/70 px-4 py-2.5 last:border-b-0">
            <span className="w-12 text-md font-semibold text-ink num">{r.rate}%</span>
            <span className="min-w-0 flex-1 text-sm text-muted">{r.label}</span>
            <Switch checked={r.enabled} onCheckedChange={(on) => up('rates', v.rates.map((x, j) => (j === i ? { ...x, enabled: on } : x)))} />
          </div>
        ))}
        <div className="px-4 py-2 text-xs text-subtle">Only enabled rates appear in the item form.</div>
      </Card>
      <Card title="Calculation and printing">
        <Row title="Prices include GST" hint="MRP and selling price are tax inclusive, as printed on packs."><Switch checked={v.pricesInclusive} onCheckedChange={(x) => up('pricesInclusive', x)} /></Row>
        <Row title="Round bill to whole rupee" hint="Round off line is printed on the bill."><Switch checked={v.roundToRupee} onCheckedChange={(x) => up('roundToRupee', x)} /></Row>
        <Row title="Show HSN code on bill" hint="Needed for B2B invoices."><Switch checked={v.showHsn} onCheckedChange={(x) => up('showHsn', x)} /></Row>
        <Row title="Interstate supply (IGST)" hint="Turn on only if the shop sells to other states."><Switch checked={v.interState} onCheckedChange={(x) => up('interState', x)} /></Row>
      </Card>
    </div>
  );
}

/* ------------------------------ Bill format ------------------------------ */
export function BillFormatTab({ v, shop, set }: { v: BillFormatSettings; shop: ShopSettings; set: (n: BillFormatSettings) => void }) {
  const up = <K extends keyof BillFormatSettings>(k: K, val: BillFormatSettings[K]) => set({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-4">
      <div className="flex flex-col gap-4">
        <Card title="Header and footer">
          <div className="flex flex-col gap-3">
            <Input label="Header line (under the shop name)" value={v.header} onChange={(e) => up('header', e.target.value)} maxLength={48} hint={`${v.header.length}/48 characters`} />
            <Input label="Footer line" value={v.footer} onChange={(e) => up('footer', e.target.value)} maxLength={48} hint={`${v.footer.length}/48 characters`} />
          </div>
        </Card>
        <Card title="What to print">
          <Row title="Show customer savings" hint={'Prints "You saved" when the price is below MRP.'}><Switch checked={v.showSavings} onCheckedChange={(x) => up('showSavings', x)} /></Row>
          <Row title="Show HSN code per item"><Switch checked={v.showHsn} onCheckedChange={(x) => up('showHsn', x)} /></Row>
          <Row title="Show GST summary table" hint="Taxable value, CGST and SGST per slab."><Switch checked={v.showGstSummary} onCheckedChange={(x) => up('showGstSummary', x)} /></Row>
          <Row title="UPI QR code at the bottom"><Switch checked={v.showQr} onCheckedChange={(x) => up('showQr', x)} /></Row>
        </Card>
        <Card title="Language and paper">
          <Row title="Bill language" hint="Item names print in Tamil when a Tamil name exists."><Segmented value={v.language} onChange={(x) => up('language', x)} options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'Tamil' }]} /></Row>
          <Row title="Paper width"><Segmented value={v.paper} onChange={(x) => up('paper', x)} options={[{ value: '80mm', label: '80 mm' }, { value: '58mm', label: '58 mm' }]} /></Row>
          <Row title="Copies per bill"><div className="w-20"><NumberInput value={String(v.copies)} decimals={0} size="sm" onValueChange={(x) => up('copies', Math.min(3, Math.max(1, Number(x || 1))))} /></div></Row>
        </Card>
      </div>
      <div className="flex flex-col rounded-card border border-line bg-surface-3">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
          <h3 className="text-sm font-semibold text-ink">Live preview</h3>
          <Badge tone="neutral">{v.paper} · sample items</Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-5"><BillFormatPreview shop={shop} fmt={v} /></div>
      </div>
    </div>
  );
}

/* ------------------------------ Printers ------------------------------ */
function TestResult({ r }: { r: { ok: boolean; message: string } | null }) {
  if (!r) return null;
  return (
    <div className={cn('mt-3 flex items-start gap-2 rounded-control px-3 py-2 text-sm', r.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
      {r.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}{r.message}
    </div>
  );
}

export function PrintersTab({ v, set }: { v: PrinterSettings; set: (n: PrinterSettings) => void }) {
  const up = <K extends keyof PrinterSettings>(k: K, val: PrinterSettings[K]) => set({ ...v, [k]: val });
  const [billRes, setBillRes] = useState<{ ok: boolean; message: string } | null>(null);
  const [labelRes, setLabelRes] = useState<{ ok: boolean; message: string } | null>(null);
  const opts = (kinds: string[]) => v.detected.filter((d) => kinds.includes(d.kind)).map((d) => ({ value: d.name, label: d.ready ? d.name : `${d.name} (offline)` }));
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Bill printer" actions={<Badge tone="success">80 mm thermal</Badge>}>
        <Select label="Printer" value={v.billPrinter} onChange={(e) => { up('billPrinter', e.target.value); setBillRes(null); }} options={opts(['thermal', 'other'])} />
        <div className="mt-2">
          <Row title="Print bill automatically" hint="Prints as soon as the bill is saved."><Switch checked={v.autoPrint} onCheckedChange={(x) => up('autoPrint', x)} /></Row>
          <Row title="Open cash drawer on cash sale"><Switch checked={v.openDrawerOnCash} onCheckedChange={(x) => up('openDrawerOnCash', x)} /></Row>
          <Row title="Cut paper after each bill"><Switch checked={v.cutter} onCheckedChange={(x) => up('cutter', x)} /></Row>
        </div>
        <Button className="mt-2" icon={<Printer size={14} />} onClick={async () => setBillRes(await api.testPrint('bill', v.billPrinter))}>Print test bill</Button>
        <TestResult r={billRes} />
      </Card>
      <Card title="Barcode label printer" actions={<Badge tone="info">TSPL label</Badge>}>
        <Select label="Printer" value={v.labelPrinter} onChange={(e) => { up('labelPrinter', e.target.value); setLabelRes(null); }} options={opts(['label', 'other'])} />
        <p className="mt-2 text-xs text-muted">Label size and layout are set on the Barcode labels screen.</p>
        <Button className="mt-3" icon={<Printer size={14} />} onClick={async () => setLabelRes(await api.testPrint('label', v.labelPrinter))}>Print test label</Button>
        <TestResult r={labelRes} />
      </Card>
      <Card title="Printers found on this computer" className="col-span-2" bodyClassName="!p-0">
        {v.detected.map((d) => (
          <div key={d.name} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-b-0">
            <StatusDot tone={d.ready ? 'success' : 'danger'} />
            <span className="flex-1 font-medium text-ink">{d.name}</span>
            <Badge>{d.kind === 'thermal' ? 'Receipt printer' : d.kind === 'label' ? 'Label printer' : 'Other'}</Badge>
            <span className={cn('w-20 text-right text-xs', d.ready ? 'text-muted' : 'text-danger')}>{d.ready ? 'Ready' : 'Offline'}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ------------------------------ Backup ------------------------------ */
const scheduleOptions = [
  { value: 'off', label: 'Off (manual only)' }, { value: 'daily', label: 'Every day' }, { value: 'twice', label: 'Twice a day' }, { value: 'hourly', label: 'Every hour' },
];

export function BackupTab({ v, set, onChanged }: { v: BackupSettings; set: (n: BackupSettings) => void; onChanged: (b: SettingsBundle['backup']) => void }) {
  const toast = useToast();
  const up = <K extends keyof BackupSettings>(k: K, val: BackupSettings[K]) => set({ ...v, [k]: val });
  const [restore, setRestore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = v.history.find((h) => h.ok);
  const target = v.history.find((h) => h.id === restore);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Automatic backup">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="How often" value={v.schedule} onChange={(e) => up('schedule', e.target.value as BackupSettings['schedule'])} options={scheduleOptions} />
            <Field label="Time"><input type="time" value={v.time} disabled={v.schedule === 'off' || v.schedule === 'hourly'} onChange={(e) => up('time', e.target.value)} className="h-8 w-full rounded-control border border-line-strong bg-surface px-2.5 text-sm num focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-surface-3 disabled:opacity-60" /></Field>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Input label="Backup folder" value={v.location} onChange={(e) => up('location', e.target.value)} hint="Use a different drive than the one running Gokul, or a pen drive." /></div>
            <Button icon={<FolderOpen size={14} />} className="mb-[22px]" onClick={() => toast.show({ tone: 'info', title: 'Folder picker opens here', detail: 'The Windows folder dialog is connected with the desktop app.' })}>Browse</Button>
          </div>
          <div className="w-56"><NumberInput label="Keep last backups" value={String(v.keep)} decimals={0} onValueChange={(x) => up('keep', Math.max(1, Number(x || 1)))} hint="Older ones are deleted automatically." /></div>
          <Row title="Also copy to pen drive when plugged in"><Switch checked={v.copyToUsb} onCheckedChange={(x) => up('copyToUsb', x)} /></Row>
        </div>
      </Card>
      <Card title="Backup status">
        <div className={cn('flex items-center gap-3 rounded-card px-3 py-3', last && ago(last.at) !== 'Never' && v.history[0]?.ok ? 'bg-success-soft' : 'bg-warning-soft')}>
          <DatabaseBackup size={22} className={v.history[0]?.ok ? 'text-success' : 'text-warning'} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{v.history[0]?.ok ? 'Last backup succeeded' : 'Last backup failed'}</div>
            <div className="text-xs text-muted">{last ? `${fmtDateTime(last.at)} · ${last.sizeMb.toFixed(1)} MB` : 'No backup taken yet'}</div>
          </div>
          <Button
            variant="primary" disabled={busy}
            onClick={async () => { setBusy(true); const e = await api.backupNow(); onChanged({ ...v, history: [e, ...v.history] }); setBusy(false); toast.show({ tone: 'success', title: 'Backup complete', detail: `${e.sizeMb.toFixed(1)} MB saved to ${v.location}` }); }}
          >
            Back up now
          </Button>
        </div>
        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Recent backups</div>
        <div className="mt-1.5 overflow-hidden rounded-control border border-line">
          {v.history.slice(0, 6).map((h) => (
            <div key={h.id} className="flex items-center gap-3 border-b border-line/70 px-3 py-2 text-sm last:border-b-0">
              <StatusDot tone={h.ok ? 'success' : 'danger'} />
              <span className="flex-1 text-ink">{fmtDateTime(h.at)}</span>
              <Badge tone={h.kind === 'manual' ? 'info' : 'neutral'}>{h.kind === 'manual' ? 'Manual' : h.kind === 'day-close' ? 'Day close' : 'Auto'}</Badge>
              <span className="w-14 text-right text-xs text-muted num">{h.ok ? `${h.sizeMb.toFixed(1)} MB` : 'Failed'}</span>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => setRestore(h.id)}>Restore</Button>
            </div>
          ))}
        </div>
      </Card>
      <Dialog
        open={!!restore} onOpenChange={(o) => !o && setRestore(null)} size="sm" title="Restore this backup?" description={target ? fmtDateTime(target.at) : undefined}
        footer={<><Button variant="ghost" onClick={() => setRestore(null)} kbd="Esc">Cancel</Button><Button variant="danger" onClick={async () => { const r = await api.restoreBackup(restore!); setRestore(null); toast.show({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Backup checked' : 'Cannot restore', detail: r.message }); }}>Restore data</Button></>}
      >
        <p className="text-sm text-muted">Bills and stock saved after this backup will be replaced by the backup. A copy of today&apos;s data is kept first, so you can undo this.</p>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Security ------------------------------ */
export function SecurityTab({ v, set }: { v: SecuritySettings; set: (n: SecuritySettings) => void }) {
  const up = <K extends keyof SecuritySettings>(k: K, val: SecuritySettings[K]) => set({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="PIN lock-out">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Lock after wrong PINs" value={String(v.lockoutAttempts)} decimals={0} onValueChange={(x) => up('lockoutAttempts', Number(x || 0))} hint="Between 3 and 20. Wrong manager PINs count too." />
          <NumberInput label="Locked for (seconds)" value={String(v.lockoutSeconds)} decimals={0} onValueChange={(x) => up('lockoutSeconds', Number(x || 0))} hint="Between 10 and 3600 (one hour)." />
        </div>
        <p className="mt-3 text-xs text-subtle">The same rule applies on the billing counter and in Office. A locked user cannot sign in even with the right PIN until the time is over.</p>
      </Card>
      <Card title="Removing a scanned item">
        <Row title="Ask for a manager PIN" hint="Every removal is logged either way (see Reports, Voided lines). Turn this on to also ask for approval."><Switch checked={v.voidLineNeedsPin} onCheckedChange={(x) => up('voidLineNeedsPin', x)} /></Row>
      </Card>
    </div>
  );
}

/* ------------------------------ Expenses ------------------------------ */
export function ExpensesTab({ v, set }: { v: ExpenseSettings; set: (n: ExpenseSettings) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Approval limit">
        <NumberInput label="Manager PIN needed above" value={String(v.limit / 100)} prefix="₹" decimals={0} onValueChange={(x) => set({ ...v, limit: Math.round(Number(x || 0) * 100) })} hint="A cashier recording a larger expense must have a manager or owner enter their PIN. 0 means every expense needs approval." />
      </Card>
      <Card title="Categories"><p className="text-sm text-muted">The list of categories is edited on the Expenses page (Categories button).</p></Card>
    </div>
  );
}

/* ------------------------------ Mill ------------------------------ */
export function MillTab({ v, set }: { v: MillSettings; set: (n: MillSettings) => void }) {
  const up = <K extends keyof MillSettings>(k: K, val: MillSettings[K]) => set({ ...v, [k]: val });
  const [draft, setDraft] = useState('');
  const add = () => { const n = draft.trim(); if (n && !v.operators.includes(n)) { up('operators', [...v.operators, n]); setDraft(''); } };
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Operators on the mill sheet">
        <div className="flex flex-col gap-1.5">
          {v.operators.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={o} onChange={(e) => up('operators', v.operators.map((x, k) => (k === i ? e.target.value : x)))} className="flex-1" />
              <Button size="sm" variant="ghost" disabled={v.operators.length <= 1} icon={<Trash2 size={13} />} onClick={() => up('operators', v.operators.filter((_, k) => k !== i))} aria-label="Remove operator" />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an operator" className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <Button size="sm" onClick={add}>Add</Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle">Each operator gets a grid on the daily sheet. The name is kept on every pressing batch.</p>
      </Card>
      <Card title="Aravai (customer job work)">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Cake taken by customer, per kg" value={String(v.rateCakeTaken / 100)} prefix="₹" decimals={2} onValueChange={(x) => up('rateCakeTaken', Math.round(Number(x || 0) * 100))} hint="GST included, on the kg of seed." />
          <NumberInput label="Cake kept by the shop, per kg" value={String(v.rateCakeKept / 100)} prefix="₹" decimals={2} onValueChange={(x) => up('rateCakeKept', Math.round(Number(x || 0) * 100))} hint="Lower, as the shop keeps the punnaku." />
          <Input label="Service code (SAC) (verify)" value={v.serviceSac} className="num" onChange={(e) => up('serviceSac', e.target.value.replace(/\D/g, '').slice(0, 8))} hint="Printed on the aravai bill. Confirm with your accountant." />
          <Select label="GST on aravai (verify)" value={String(v.serviceGstRate)} onChange={(e) => up('serviceGstRate', Number(e.target.value) as MillSettings['serviceGstRate'])} options={[0, 5, 12, 18].map((r) => ({ value: String(r), label: `${r}%` }))} />
        </div>
        <p className="mt-3 text-xs text-subtle">The charge goes on the customer&apos;s account as a bill with the service item &quot;Aravai Job Work&quot;. It can also be sold at the counter as that item.</p>
      </Card>
    </div>
  );
}
