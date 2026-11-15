import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, DatabaseBackup, Star, FolderOpen, ImagePlus, Printer, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { GST_STATES, LABEL_PRESETS, enabledRates, gstinProblem, rateOk, rateText, stateName, type HardwareSettings, type LabelPresetId } from '@gokul/data';
import type { Category } from '@gokul/data';
import type { BackupSettings, BillFormatSettings, ExpenseSettings, LoyaltySettings, MillSettings, PrinterSettings, SecuritySettings, SettingsBundle, ShopSettings, TaxSettings } from '@gokul/data';
import { Badge, Button, Card, Dialog, Field, Checkbox, Input, NumberInput, Select, StatusDot, Switch, cn, useToast } from '@gokul/ui';
import { api, useSession } from '../../store';
import { BillFormatPreview } from './BillFormatPreview';
import { useGstRates } from '../../useGstRates';
import { ago, fmtDateTime, Segmented } from './common';


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
  const gstProblem = gst ? gstinProblem(gst, v.stateCode) : null;
  const gstOk = !!gst && !gstProblem;
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
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Input label="Tamil line under the name (printed as a picture)" value={v.tagline} onChange={(e) => up('tagline', e.target.value)} />
            <Input label="Short name (stickers)" value={v.shortName} onChange={(e) => up('shortName', e.target.value)} maxLength={11} />
          </div>
          <Input label="Legal name" value={v.legalName} onChange={(e) => up('legalName', e.target.value)} />
          <Input label="Address" value={v.address} onChange={(e) => up('address', e.target.value)} />
          <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
            <Input label="City" value={v.city} onChange={(e) => up('city', e.target.value)} />
            <Select label="State (place of supply for local sales)" value={v.stateCode} onChange={(e) => set({ ...v, stateCode: e.target.value, state: stateName(e.target.value) ?? v.state })}
              options={GST_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
            <Input label="PIN code" value={v.pincode} onChange={(e) => up('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} className="num" />
          </div>
        </div>
      </Card>
      <Card title="Registration">
        <div className="flex flex-col gap-3">
          <Input
            label="GSTIN" value={v.gstin} className="num uppercase" onChange={(e) => up('gstin', e.target.value.toUpperCase().slice(0, 15))}
            error={gst && gstProblem ? gstProblem : undefined}
            hint={gstOk ? `Valid. State code ${gst.slice(0, 2)} is ${stateName(gst.slice(0, 2)) ?? ''}.` : 'Printed on every tax invoice. Its first two digits must match the state.'}
          />
          <Input
            label="FSSAI licence number" value={v.fssai} className="num" onChange={(e) => up('fssai', e.target.value.replace(/\D/g, '').slice(0, 14))}
            error={v.fssai && !fssaiOk ? 'FSSAI number has 14 digits' : undefined} hint={fssaiOk ? 'Printed under the address on bills and labels.' : 'Required on food product labels.'}
          />
        </div>
      </Card>
      <Card title="Contact">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Mobile (printed on bills)" value={v.phone} onChange={(e) => up('phone', e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} className="num" />
          <Input label="WhatsApp for orders (printed at the foot)" value={v.whatsapp} onChange={(e) => up('whatsapp', e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} className="num" />
          <Input label="Email" value={v.email} onChange={(e) => up('email', e.target.value)} className="col-span-2" />
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
  const [newRate, setNewRate] = useState('');
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
            <span className="w-14 text-md font-semibold text-ink num">{rateText(r.rate)}</span>
            <span className="min-w-0 flex-1 text-sm text-muted">{r.label}</span>
            <Switch checked={r.enabled} onCheckedChange={(on) => up('rates', v.rates.map((x, j) => (j === i ? { ...x, enabled: on } : x)))} />
          </div>
        ))}
        <div className="flex items-end gap-2 border-t border-line/70 px-4 py-3">
          <div className="w-28"><Input label="Add a rate %" value={newRate} inputMode="decimal" className="num" placeholder="e.g. 7.5" onChange={(e) => setNewRate(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} /></div>
          <Button size="sm" disabled={!newRate || !rateOk(Number(newRate)) || v.rates.some((x) => x.rate === Number(newRate))}
            onClick={() => { up('rates', [...v.rates, { rate: Number(newRate), enabled: true, label: 'Added by owner' }].sort((a, b) => a.rate - b.rate)); setNewRate(''); }}>Add</Button>
        </div>
        <div className="px-4 py-2 text-xs text-subtle">
          Only enabled rates can be used on items, bills and purchases. Since 22 Sep 2025 the main slabs are 0, 5, 18 and 40%, with special rates 0.25% and 3%;
          12% and 28% are kept for older bills and items (confirm with CA). Changing this list never changes bills already saved.
        </div>
      </Card>
      <Card title="Calculation and printing">
        <Row title="Prices include GST" hint="MRP and selling price are tax inclusive, as printed on packs."><Switch checked={v.pricesInclusive} onCheckedChange={(x) => up('pricesInclusive', x)} /></Row>
        <Row title="Round bill to whole rupee" hint="Round off line is printed on the bill."><Switch checked={v.roundToRupee} onCheckedChange={(x) => up('roundToRupee', x)} /></Row>
        <Row title="GST on home delivery charge" hint="The delivery charge added at the POS counter. 0 means it is billed without GST.">
          <Select value={String(v.deliveryGstRate ?? 0)} onChange={(e) => up('deliveryGstRate', Number(e.target.value))} options={enabledRates(v.rates).map((r) => ({ value: String(r), label: r === 0 ? 'No GST' : rateText(r) }))} />
        </Row>
        <Row title="Show HSN code on bill" hint="Needed for B2B invoices."><Switch checked={v.showHsn} onCheckedChange={(x) => up('showHsn', x)} /></Row>
        <Row title="Sales to other states (IGST)" hint="Automatic. A customer in another state, or a state chosen on the bill, gets IGST instead of CGST + SGST (confirm with CA)."><span className="text-xs text-subtle">Always on</span></Row>
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
            <Input label="Tamil footer line (printed as a picture)" value={v.footerTamil} onChange={(e) => up('footerTamil', e.target.value)} maxLength={60} />
            <Input label="Footer line" value={v.footer} onChange={(e) => up('footer', e.target.value)} maxLength={48} hint={`${v.footer.length}/48 characters`} />
          </div>
        </Card>
        <Card title="Bill heading by how it was paid">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cash" value={v.titleCash} onChange={(e) => up('titleCash', e.target.value)} maxLength={20} />
            <Input label="UPI / QR" value={v.titleUpi} onChange={(e) => up('titleUpi', e.target.value)} maxLength={20} />
            <Input label="Card" value={v.titleCard} onChange={(e) => up('titleCard', e.target.value)} maxLength={20} />
            <Input label="Credit (pay later)" value={v.titleCredit} onChange={(e) => up('titleCredit', e.target.value)} maxLength={20} />
            <Input label="Anything else" value={v.titleOther} onChange={(e) => up('titleOther', e.target.value)} maxLength={20} className="col-span-2" />
          </div>
          <p className="mt-2 text-xs text-muted">The small line TAX INVOICE (or BILL OF SUPPLY) stays under the heading, as the GST rules ask.</p>
        </Card>
        <Card title="What to print">
          <Row title="Show customer savings" hint={'Prints "You saved" when the price is below MRP.'}><Switch checked={v.showSavings} onCheckedChange={(x) => up('showSavings', x)} /></Row>
          <Row title="Show HSN code per item"><Switch checked={v.showHsn} onCheckedChange={(x) => up('showHsn', x)} /></Row>
          <Row title="Show GST summary table" hint="Taxable value, CGST and SGST per slab."><Switch checked={v.showGstSummary} onCheckedChange={(x) => up('showGstSummary', x)} /></Row>
          <Row title="QR code at the bottom" hint="A UPI pay QR when a UPI id is set below, otherwise the bill number."><Switch checked={v.showQr} onCheckedChange={(x) => up('showQr', x)} /></Row>
          {v.showQr && <div className="px-1 pb-2"><Input label="UPI id for the QR (e.g. gokuloils@okaxis)" value={v.upiId ?? ''} onChange={(e) => up('upiId', e.target.value.trim())} /></div>}
        </Card>
        <Card title="Language and paper">
          <Row title="Print Tamil item names" hint="Tamil names are drawn as pictures (Nirmala UI). Off prints the English name."><Switch checked={v.tamilNames} onCheckedChange={(x) => up('tamilNames', x)} /></Row>
          <Row title="Printed bill number" hint="26/00123 is the financial year and a five digit running number. Numbers are still gapless."><Segmented value={v.numberFormat} onChange={(x) => up('numberFormat', x)} options={[{ value: 'yy/nnnnn', label: '26/00123' }, { value: 'raw', label: 'GK-26-000123' }]} /></Row>
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

/** Checks how fast characters arrive: a scanner types a whole code in a few milliseconds, a person cannot. */
function ScannerCheck({ gapMs }: { gapMs: number }) {
  const [val, setVal] = useState('');
  const stamps = useRef<number[]>([]);
  const [info, setInfo] = useState<{ chars: number; fastest: number; slowest: number } | null>(null);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const t = stamps.current;
      const gaps = t.slice(1).map((x, i) => x - t[i]);
      if (t.length > 0) setInfo({ chars: t.length, fastest: gaps.length ? Math.round(Math.min(...gaps)) : 0, slowest: gaps.length ? Math.round(Math.max(...gaps)) : 0 });
      stamps.current = [];
      return;
    }
    if (e.key.length === 1) stamps.current.push(e.timeStamp);
  };
  const scanner = info && info.chars >= 3 && info.slowest <= gapMs;
  return (
    <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
      <div className="mb-1.5 text-xs font-medium text-muted">Scanner check: click here, then scan any label (or type) and press Enter</div>
      <Input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={onKey} placeholder="Scan a barcode here" autoComplete="off" />
      {info && (
        <div className={cn('mt-2 flex items-start gap-2 text-sm', scanner ? 'text-success' : 'text-warning')}>
          {scanner ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
          <span>
            {info.chars} characters, {info.slowest} ms between keys at the slowest.{' '}
            {scanner ? 'This looks like the scanner. The counter will treat it as a scan.' : info.slowest > gapMs ? `Slower than ${gapMs} ms: the counter would treat this as typing. If this was the scanner, raise the limit above ${info.slowest} ms.` : 'Too short to be a scan (needs 3 characters).'}
          </span>
        </div>
      )}
    </div>
  );
}

export function PrintersTab({ v, set, hardware, setHardware, paper = '80mm' }: {
  v: PrinterSettings; set: (n: PrinterSettings) => void; hardware: HardwareSettings; setHardware: (n: HardwareSettings) => void; paper?: string;
}) {
  const cur = v.detected.find((d) => d.name === v.billPrinter);
  const labelCur = v.detected.find((d) => d.name === v.labelPrinter);
  const up = <K extends keyof PrinterSettings>(k: K, val: PrinterSettings[K]) => set({ ...v, [k]: val });
  const upHw = <K extends keyof HardwareSettings>(k: K, val: HardwareSettings[K]) => setHardware({ ...hardware, [k]: val });
  const [billRes, setBillRes] = useState<{ ok: boolean; message: string } | null>(null);
  const [labelRes, setLabelRes] = useState<{ ok: boolean; message: string } | null>(null);
  const isTvs = /rp ?3200|tvs/i.test(v.billPrinter);
  const labelOpts = () => ({
    preset: v.labelPreset, width: v.labelWidth, height: v.labelHeight, gap: v.labelGap, columns: v.labelColumns, colGap: v.labelColGap,
    darkness: v.labelDarkness, speed: v.labelSpeed, offsetX: v.labelOffsetX, offsetY: v.labelOffsetY, flip: v.labelFlip, startMm: v.labelStartMm, ribbon: v.labelRibbon, rupee: v.labelRupee,
    alignX: v.labelAlignX, alignY: v.labelAlignY, pitchAdjust: v.labelPitchAdjust, pullBack: v.labelPullBack, pullBackMm: v.labelPullBackMm,
  });
  const labelOptions = v.detected.filter((d) => d.kind === 'label' || d.kind === 'other').map((d) => ({ value: d.name, label: d.ready ? d.name : `${d.name} (${d.note || 'not ready'})` }));
  const num = (k: 'labelWidth' | 'labelHeight' | 'labelGap' | 'labelColumns' | 'labelColGap', label: string) => (
    <NumberInput label={label} value={String(v[k])} decimals={1} size="sm" onValueChange={(x) => up(k, Number(x || 0))} />
  );
  const signed = (k: 'labelOffsetX' | 'labelOffsetY', label: string) => (
    <Input
      label={label} type="number" size="sm" value={v[k]} className="text-right num"
      onChange={(e) => up(k, Math.max(-80, Math.min(80, Math.round(Number(e.target.value) || 0))))}
    />
  );
  const stepMm = (k: 'labelAlignX' | 'labelAlignY' | 'labelPitchAdjust', label: string, step: number, lim: number, hint?: string) => (
    <Input
      label={label} type="number" size="sm" step={step} min={-lim} max={lim} value={v[k]} className="text-right num" hint={hint}
      onChange={(e) => up(k, Math.max(-lim, Math.min(lim, Math.round((Number(e.target.value) || 0) / step) * step)))}
    />
  );
  const [alignRes, setAlignRes] = useState<{ ok: boolean; message: string } | null>(null);
  const [read, setRead] = useState({ x1: '', x3: '', y: '' });
  const readNum = (s: string) => Math.max(-4, Math.min(4, Number(s.replace(',', '.')) || 0));
  const useReadings = () => {
    const x1 = readNum(read.x1), x3 = read.x3.trim() === '' ? x1 : readNum(read.x3);
    const cols = Math.max(1, v.labelColumns);
    set({
      ...v, labelAlignX: Math.round(x1 * 2) / 2, labelAlignY: Math.round(readNum(read.y) * 2) / 2,
      labelPitchAdjust: cols > 1 ? Math.max(-1, Math.min(1, Math.round(((x3 - x1) / (cols - 1)) * 10) / 10)) : 0,
    });
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Bill printer" actions={<Badge tone={cur ? (cur.ready ? 'success' : 'danger') : 'warning'}>{cur ? (cur.ready ? 'Ready' : cur.note || 'Not ready') : v.billPrinter ? 'Not installed' : 'Not chosen'}</Badge>}>
        <Select label="Printer" value={v.billPrinter} onChange={(e) => { up('billPrinter', e.target.value); setBillRes(null); }}
          options={[{ value: '', label: 'Choose a printer' }, ...v.detected.filter((d) => d.kind !== 'label').map((d) => ({ value: d.name, label: d.ready ? d.name : `${d.name} (${d.note || 'not ready'})` }))]} />
        {cur && <p className="mt-1.5 text-xs text-muted">Port {cur.port || '-'} - driver {cur.driver || '-'}{isTvs ? ' - TVS RP3200 Plus: 80 mm, ESC/POS, cutter and cash drawer port' : ''}</p>}
        <div className="mt-2">
          <Row title="How to print" hint={v.mode === 'escpos' ? 'Fast raw receipt commands for thermal printers (TVS, Epson, Posiflex, Retsol ...).' : 'Uses the normal Windows driver. For laser, inkjet or PDF printers.'}>
            <Segmented value={v.mode} onChange={(x) => up('mode', x)} options={[{ value: 'escpos', label: 'Thermal (ESC/POS)' }, { value: 'driver', label: 'Windows driver' }]} />
          </Row>
          <Row title="Paper width" hint="Set in Bill format. 80 mm prints 48 columns, 58 mm prints 32."><span className="text-sm font-medium text-ink">{paper}</span></Row>
          <Row title="Print bill automatically" hint="Prints as soon as the bill is saved. Bills are always saved first."><Switch checked={v.autoPrint} onCheckedChange={(x) => up('autoPrint', x)} /></Row>
          <Row title="Print the shop logo"><Switch checked={v.printLogo} onCheckedChange={(x) => up('printLogo', x)} /></Row>
          <Row title="Open cash drawer on cash sale" hint="Needs a drawer plugged into the printer (RJ11)."><Switch checked={v.openDrawerOnCash} onCheckedChange={(x) => up('openDrawerOnCash', x)} /></Row>
          <Row title="Cut paper after each bill"><Switch checked={v.cutter} onCheckedChange={(x) => up('cutter', x)} /></Row>
          <Row title="Compatibility mode" hint="Turn on only if the printer prints rubbish or stops: sends no logo, no QR and no Tamil pictures, only plain text, barcode and cut."><Switch checked={v.compat} onCheckedChange={(x) => up('compat', x)} /></Row>
        </div>
        <Button className="mt-2" icon={<Printer size={14} />} onClick={async () => setBillRes(await api.testPrint('bill', v.billPrinter, { paper, mode: v.mode, printLogo: v.printLogo, compat: v.compat }))}>Print test bill</Button>
        <TestResult r={billRes} />
      </Card>

      <Card title="Barcode label printer" actions={<Badge tone={labelCur ? (labelCur.ready ? 'success' : 'danger') : 'warning'}>{labelCur ? (labelCur.ready ? 'Ready' : labelCur.note || 'Not ready') : v.labelPrinter ? 'Not installed' : 'Not chosen'}</Badge>}>
        <Select label="Printer (TSC TE244)" value={v.labelPrinter} onChange={(e) => { up('labelPrinter', e.target.value); setLabelRes(null); }} options={[{ value: '', label: 'Choose a printer' }, ...labelOptions]} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Select
            label="Label size" value={v.labelPreset} onChange={(e) => {
              const id = e.target.value as LabelPresetId;
              const p = LABEL_PRESETS.find((x) => x.id === id);
              set(p ? { ...v, labelPreset: id, labelWidth: p.width, labelHeight: p.height, labelGap: p.gap, labelColumns: p.columns, labelColGap: p.colGap } : { ...v, labelPreset: id });
            }}
            options={[...LABEL_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom size' }]}
          />
          <Input label="Text before the price" size="sm" value={v.labelPricePrefix} maxLength={4} onChange={(e) => up('labelPricePrefix', e.target.value)} hint="Used with Rs. (see Rupee sign)" />
          <Select label="Rupee sign" value={v.labelRupee} onChange={(e) => up('labelRupee', e.target.value as PrinterSettings['labelRupee'])} options={[{ value: 'both', label: 'Picture of ₹, then Rs.' }, { value: 'symbol', label: 'Picture of ₹ only' }, { value: 'text', label: 'Rs. text only' }]} />
        </div>
        {v.labelPreset === 'custom' && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {num('labelWidth', 'Width mm')}{num('labelHeight', 'Height mm')}{num('labelGap', 'Gap mm')}{num('labelColumns', 'Across')}{num('labelColGap', 'Across gap')}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberInput label="Darkness (0 to 15)" value={String(v.labelDarkness)} decimals={0} size="sm" onValueChange={(x) => up('labelDarkness', Math.min(15, Number(x || 0)))} />
          <NumberInput label="Speed (inches per second)" value={String(v.labelSpeed)} decimals={0} size="sm" onValueChange={(x) => up('labelSpeed', Math.min(8, Math.max(1, Number(x || 1))))} />
          {signed('labelOffsetX', 'Shift right (dots, 8 = 1 mm)')}
          {signed('labelOffsetY', 'Shift down (dots, 8 = 1 mm)')}
          <NumberInput label="Start from left edge (mm, 0 to 5)" value={String(v.labelStartMm)} decimals={1} size="sm" onValueChange={(x) => up('labelStartMm', Math.min(5, Math.max(0, Number(x || 0))))} hint="Adds to the 2 mm safe margin. 0 is normal." />
        </div>
        <Row title="Labels come out upside down" hint="Turns the print 180 degrees."><Switch checked={v.labelFlip} onCheckedChange={(x) => up('labelFlip', x)} /></Row>
        <Row title="Pull back to print head before printing" hint="After a job the TE244 pushes the last row out to the tear bar. This backs the roll up by the distance below before the next job, so no blank row is wasted. Turn off if the first sticker prints too high.">
          <Switch checked={v.labelPullBack} onCheckedChange={(x) => up('labelPullBack', x)} />
        </Row>
        {v.labelPullBack && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <NumberInput label="Tear bar distance (mm)" value={String(v.labelPullBackMm)} decimals={1} size="sm" onValueChange={(x) => up('labelPullBackMm', Math.min(30, Math.max(0, Number(x || 0))))} hint="TE244 about 12 mm. Too high a number: the first sticker prints too high." />
          </div>
        )}
        <p className="mt-1 text-xs text-muted">Barcode labels are made on the Barcode labels screen.</p>
        <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
          <div className="text-sm font-semibold text-ink">Label alignment</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted">
            <li>Press <b>Print alignment row</b>. One row of 3 stickers comes out with rulers (numbers are millimetres) along the top and the left side.</li>
            <li>On each sticker, find where the real edge of the sticker crosses the ruler, for example left edge at +1.5, top edge at -1.</li>
            <li>Type the numbers below (sticker 1 left edge, sticker 3 left edge, top edge) and press <b>Use these numbers</b>, then <b>Save changes</b>.</li>
            <li>Press <b>Check with my correction</b>: the thick box must sit on the sticker edge on all three.</li>
          </ol>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button icon={<Printer size={14} />} onClick={async () => setAlignRes(await api.testPrint('labelAlign', v.labelPrinter, { ...labelOpts(), verify: false }))}>Print alignment row</Button>
            <Button icon={<Printer size={14} />} onClick={async () => setAlignRes(await api.testPrint('labelAlign', v.labelPrinter, { ...labelOpts(), verify: true }))}>Check with my correction</Button>
          </div>
          <TestResult r={alignRes} />
          <div className="mt-3 grid grid-cols-4 items-end gap-2">
            <Input label="Sticker 1 left edge (mm)" size="sm" value={read.x1} placeholder="e.g. 1.5" className="text-right num" onChange={(e) => setRead({ ...read, x1: e.target.value })} />
            <Input label="Sticker 3 left edge (mm)" size="sm" value={read.x3} placeholder="same as 1" className="text-right num" onChange={(e) => setRead({ ...read, x3: e.target.value })} />
            <Input label="Top edge (mm)" size="sm" value={read.y} placeholder="e.g. -1" className="text-right num" onChange={(e) => setRead({ ...read, y: e.target.value })} />
            <Button onClick={useReadings}>Use these numbers</Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {stepMm('labelAlignX', 'Move right (mm)', 0.5, 4, 'Steps of 0.5')}
            {stepMm('labelAlignY', 'Move down (mm)', 0.5, 4, 'Steps of 0.5')}
            {stepMm('labelPitchAdjust', 'Column drift (mm per column)', 0.1, 1, 'Steps of 0.1, if sticker 3 is off')}
          </div>
        </div>
        <Button className="mt-3" icon={<Printer size={14} />} onClick={async () => setLabelRes(await api.testPrint('label', v.labelPrinter, labelOpts()))}>Print test label</Button>
        <TestResult r={labelRes} />
      </Card>

      <Card title="Barcode scanner (Retsol, USB)" className="col-span-2">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
          <NumberInput
            label="Fastest key gap that counts as a scan (ms)" value={String(hardware.scanGapMs)} decimals={0} size="sm"
            onValueChange={(x) => upHw('scanGapMs', Math.min(100, Math.max(10, Number(x || 30))))} hint="Scanners type in under 15 ms; people are slower than 40 ms. Default 30."
          />
          <NumberInput
            label="Shortest code (characters)" value={String(hardware.scanMinLen)} decimals={0} size="sm"
            onValueChange={(x) => upHw('scanMinLen', Math.min(12, Math.max(2, Number(x || 3))))}
          />
          <div className="pt-1"><Row title="Beep for an unknown code"><Switch checked={hardware.scanBeep} onCheckedChange={(x) => upHw('scanBeep', x)} /></Row></div>
        </div>
        <ScannerCheck gapMs={hardware.scanGapMs} />
        <p className="mt-2 text-xs text-muted">QR code stickers need a 2D (imager) scanner. A laser scanner reads barcodes only. Save with the Save button below; the counter picks it up when the window is next focused.</p>
      </Card>

      <Card title="Printers found on this computer" className="col-span-2" bodyClassName="!p-0">
        {v.detected.map((d) => (
          <div key={d.name} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-b-0">
            <StatusDot tone={d.ready ? 'success' : 'danger'} />
            <span className="flex-1 font-medium text-ink">{d.name}</span>
            <Badge>{d.kind === 'thermal' ? 'Receipt printer' : d.kind === 'label' ? 'Label printer' : 'Other'}</Badge>
            <span className={cn('w-44 truncate text-right text-xs', d.ready ? 'text-muted' : 'text-danger')} title={d.port}>{d.ready ? `Ready${d.isDefault ? ' (Windows default)' : ''}` : d.note || 'Offline'}</span>
          </div>
        ))}
        {v.detected.length === 0 && <div className="px-4 py-3 text-sm text-muted">No printer is installed on this computer yet. Install the TVS and TSC printer drivers first.</div>}
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
  const gstRates = useGstRates();
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
          <Select label="GST on aravai (verify)" value={String(v.serviceGstRate)} onChange={(e) => up('serviceGstRate', Number(e.target.value))} options={gstRates.map((r) => ({ value: String(r), label: rateText(r) }))} />
        </div>
        <p className="mt-3 text-xs text-subtle">The charge goes on the customer&apos;s account as a bill with the service item &quot;Aravai Job Work&quot;. It can also be sold at the counter as that item.</p>
      </Card>
    </div>
  );
}


/* ------------------------------ Loyalty ------------------------------ */
export function LoyaltyTab({ v, set }: { v: LoyaltySettings; set: (n: LoyaltySettings) => void }) {
  const up = <K extends keyof LoyaltySettings>(k: K, val: LoyaltySettings[K]) => set({ ...v, [k]: val });
  const num = (x: string, min: number, max: number) => Math.min(max, Math.max(min, Number(x || min)));
  const nav = useNavigate();
  const toast = useToast();
  const isOwner = useSession((s) => s.user?.role) === 'owner';
  const [goLive, setGoLive] = useState(v.goLiveDate);
  const [savedGoLive, setSavedGoLive] = useState(v.goLiveDate);
  const [savingGoLive, setSavingGoLive] = useState(false);
  const changeGoLive = async () => {
    setSavingGoLive(true);
    try {
      await api.setLoyaltyGoLive(goLive);
      setSavedGoLive(goLive); up('goLiveDate', goLive);
      toast.show({ tone: 'success', title: 'Go-live date changed', detail: 'Imported points now count as earned on that day.' });
    } catch (e) { toast.show({ tone: 'error', title: 'Go-live date not changed', detail: e instanceof Error ? e.message : undefined }); }
    setSavingGoLive(false);
  };
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => { let live = true; api.listCategories().then((c) => live && setCats([...c])); return () => { live = false; }; }, []);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Loyalty points">
        <Row title="Points on" hint="Customers earn points on every bill and can use them to pay."><Switch checked={v.enabled} onCheckedChange={(x) => up('enabled', x)} /></Row>
        <Row title="Rupees for one point" hint="1 point for every this many rupees of the bill after discount. The part paid with a credit note or points earns nothing.">
          <div className="w-28"><NumberInput value={String(v.rupeesPerPoint)} decimals={0} prefix={'₹'} size="sm" onValueChange={(x) => up('rupeesPerPoint', num(x, 1, 100000))} /></div>
        </Row>
      </Card>
      <Card title="Using points to pay">
        <Row title="Value of one point (confirm with the owner)" hint="What 1 point is worth at the counter.">
          <div className="w-28"><NumberInput value={String(v.pointValue / 100)} decimals={0} prefix={'₹'} size="sm" onValueChange={(x) => up('pointValue', num(x, 1, 1000) * 100)} /></div>
        </Row>
        <Row title="Fewest points to use" hint="A customer needs at least this many points to pay with them.">
          <div className="w-28"><NumberInput value={String(v.minRedeem)} decimals={0} size="sm" onValueChange={(x) => up('minRedeem', num(x, 1, 1000000))} /></div>
        </Row>
        <Row title="Most of a bill points can pay" hint="Percent of the bill total.">
          <div className="w-28"><NumberInput value={String(v.maxPct)} decimals={0} size="sm" onValueChange={(x) => up('maxPct', num(x, 1, 100))} /></div>
        </Row>
      </Card>
      <Card title="Points expiry">
        <Row title="Points expire" hint="On by default. Each earning expires this many months after it was earned, and points used are taken from the oldest first. Expiry runs by itself when the app starts and when the day opens.">
          <Switch checked={v.expiryMonths > 0} onCheckedChange={(x) => up('expiryMonths', x ? 12 : 0)} />
        </Row>
        <Row title="Expire after (months)" hint="Applies to points earned from now on. Points already earned keep their own expiry date.">
          <div className="w-28"><NumberInput value={String(v.expiryMonths || '')} decimals={0} size="sm" disabled={v.expiryMonths === 0} onValueChange={(x) => up('expiryMonths', num(x, 1, 120))} /></div>
        </Row>
        <Row title="Print expiry on the bill" hint="Adds a line such as 12.40 pts expire 07/11/27 when a customer's points lapse within 30 days.">
          <Switch checked={v.printExpiry} onCheckedChange={(x) => up('printExpiry', x)} />
        </Row>
        <Row title="Go-live date for imported points" hint={isOwner ? 'The day the POSBean balances count as earned; they expire one year after it. Changing it moves only the imported points. Saved at once and recorded in the audit log.' : 'Only the owner can change this date.'}>
          <div className="flex items-center gap-2">
            <input type="date" value={goLive} max={new Date().toISOString().slice(0, 10)} disabled={!isOwner} onChange={(e) => e.target.value && setGoLive(e.target.value)} aria-label="Go-live date for imported points" className="num h-8 w-[136px] rounded-control border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-primary disabled:opacity-60" />
            <Button size="sm" disabled={!isOwner || savingGoLive || goLive === savedGoLive || !goLive} onClick={() => void changeGoLive()}>Change</Button>
          </div>
        </Row>
      </Card>
      <Card title="Not earned on these categories">
        <p className="mb-2 text-xs text-muted">Lines in a ticked category earn no points (for example Service charges). Their share of the bill is left out.</p>
        {cats.length === 0 ? <div className="text-sm text-subtle">Loading categories</div> : (
          <div className="grid max-h-44 grid-cols-2 gap-x-4 gap-y-1.5 overflow-auto">
            {[...cats, { id: '_service', name: 'Service charges (delivery, manual lines)' }].map((c) => (
              <Checkbox key={c.id} label={c.name} checked={v.excludeCategories.includes(c.id)}
                onCheckedChange={(on) => up('excludeCategories', on ? [...v.excludeCategories, c.id] : v.excludeCategories.filter((x) => x !== c.id))} />
            ))}
          </div>
        )}
      </Card>
      <Card title="Customer points">
        <p className="text-sm text-muted">See who holds points, the full ledger, expiry and reports.</p>
        <Button className="mt-3" icon={<Star size={14} />} onClick={() => nav('/loyalty-points')}>Open Loyalty points</Button>
        <p className="mt-2 text-xs text-subtle">Only the owner can change these settings. Points change only through bills.</p>
      </Card>
    </div>
  );
}
