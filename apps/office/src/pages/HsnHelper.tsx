import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, FileSpreadsheet, Hash, Search, Upload, Wand2 } from 'lucide-react';
import {
  buildXlsx, hsnOk, parseCsv, rateText, readXlsx, type HsnConfidence, type HsnImportPreview, type HsnImportRow, type HsnItemRow, type HsnSuggestResult,
} from '@gokul/data';
import { Badge, Button, Checkbox, Dialog, EmptyState, FilterBar, Input, PageHeader, Select, useToast, type ColumnDef, DataTable } from '@gokul/ui';
import { api } from '../store';
import { downloadBytes } from '../components/crm/common';
import { useGstRates } from '../useGstRates';

const conf: Record<HsnConfidence, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  high: { label: 'High', tone: 'success' }, medium: { label: 'Medium', tone: 'warning' }, low: { label: 'Low', tone: 'neutral' },
};

/** One row of the helper table: the item, its current HSN and the suggestion, plus what the owner has decided so far. */
interface Row extends HsnItemRow { id: string }

/**
 * The HSN helper (Items -> HSN helper). Suggests an HSN for every item that has none, from its name, with how sure it is and a GST
 * rate to verify with the CA. NOTHING is applied until the owner ticks rows and presses Confirm; a code can be edited first.
 * "Import from Excel/CSV" loads codes the owner collected, shows what would change, and applies only after confirmation.
 */
export function HsnHelper() {
  const nav = useNavigate();
  const toast = useToast();
  const gstRates = useGstRates();
  const [data, setData] = useState<HsnSuggestResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const [minConf, setMinConf] = useState<'any' | 'high' | 'medium'>('any');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [withRate, setWithRate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api.suggestHsn({ onlyMissing: !showAll });
    setData(r);
  }, [showAll]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<Row[]>(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const list = (data?.rows ?? []).map((r) => ({ ...r, id: r.itemId }));
    const ql = q.trim().toLowerCase();
    return list
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.code.includes(ql) || r.category.toLowerCase().includes(ql))
      .filter((r) => minConf === 'any' || (r.suggestion && order[r.suggestion.confidence] <= (minConf === 'high' ? 0 : 1)))
      .sort((a, b) => (order[a.suggestion?.confidence ?? 'x'] ?? 3) - (order[b.suggestion?.confidence ?? 'x'] ?? 3) || a.name.localeCompare(b.name));
  }, [data, q, minConf]);

  /** The code that would be written for a row: what the owner typed, else the suggestion. */
  const codeOf = useCallback((r: Row) => (edits[r.id] ?? r.suggestion?.hsn ?? '').trim(), [edits]);
  const rateOf = (r: Row) => (r.suggestion?.rate ?? null);
  const readyIds = useMemo(() => rows.filter((r) => picked.has(r.id) && hsnOk(codeOf(r))), [rows, picked, codeOf]);
  const badPicked = rows.filter((r) => picked.has(r.id) && !hsnOk(codeOf(r))).length;

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickAll = (pred: (r: Row) => boolean) => setPicked(new Set(rows.filter(pred).map((r) => r.id)));

  const confirm = async () => {
    if (!readyIds.length || busy) return;
    setBusy(true);
    try {
      const updates = readyIds.map((r) => ({
        itemId: r.id, hsn: codeOf(r),
        ...(withRate && rateOf(r) !== null && gstRates.includes(rateOf(r)!) ? { gstRate: rateOf(r)! } : {}),
      }));
      const res = await api.applyHsn(updates);
      toast.show({ tone: 'success', title: `${res.applied} items updated`, detail: res.ratesChanged ? `${res.ratesChanged} GST rates changed too. Bills already saved are not changed.` : 'HSN saved. Bills already saved are not changed.' });
      setPicked(new Set()); setEdits({});
      await load();
    } catch (e) {
      toast.show({ tone: 'error', title: 'Nothing was changed', detail: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: 'pick', enableSorting: false, meta: { w: '36px' },
      header: () => <Checkbox checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onCheckedChange={(c) => setPicked(c ? new Set(rows.map((r) => r.id)) : new Set())} />,
      cell: (c) => <span onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.has(c.row.original.id)} onCheckedChange={() => toggle(c.row.original.id)} /></span>,
    },
    { accessorKey: 'code', header: 'Code', meta: { w: '58px', num: true } },
    { accessorKey: 'name', header: 'Item', meta: { w: 'minmax(180px,1.3fr)' }, cell: (c) => <span className="font-medium text-ink">{c.getValue<string>()}</span> },
    { accessorKey: 'category', header: 'Category', meta: { w: '130px' }, cell: (c) => <span className="text-muted">{c.getValue<string>()}</span> },
    {
      id: 'current', header: 'HSN now', meta: { w: '90px', num: true }, accessorFn: (r) => r.hsn,
      cell: (c) => (c.row.original.missing ? <Badge tone="warning">Missing</Badge> : <span>{c.row.original.hsn}</span>),
    },
    {
      id: 'new', header: 'Suggested HSN', enableSorting: false, meta: { w: '112px' },
      cell: (c) => {
        const r = c.row.original;
        const v = edits[r.id] ?? r.suggestion?.hsn ?? '';
        const bad = v !== '' && !hsnOk(v);
        return (
          <span onClick={(e) => e.stopPropagation()}>
            <input
              value={v} inputMode="numeric" placeholder="HSN" aria-label={`HSN for ${r.name}`}
              onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              className={`num h-7 w-24 rounded-control border bg-surface px-2 text-sm ${bad ? 'border-danger text-danger' : 'border-line-strong text-ink'}`}
            />
          </span>
        );
      },
    },
    {
      id: 'desc', header: 'What it is', enableSorting: false, meta: { w: 'minmax(180px,1.4fr)' },
      cell: (c) => {
        const s = c.row.original.suggestion;
        return s ? <span className="block truncate text-muted" title={`${s.desc}${s.alternatives.length ? ` (or: ${s.alternatives.map((a) => a.hsn).join(', ')})` : ''}`}>{s.desc}</span> : <span className="text-subtle">No suggestion: type the code</span>;
      },
    },
    {
      id: 'conf', header: 'Sure?', enableSorting: false, meta: { w: '76px' },
      cell: (c) => { const s = c.row.original.suggestion; return s ? <Badge tone={conf[s.confidence].tone}>{conf[s.confidence].label}</Badge> : <span className="text-subtle">-</span>; },
    },
    {
      id: 'rate', header: 'GST rate (verify with CA)', enableSorting: false, meta: { w: '156px', align: 'right', num: true },
      cell: (c) => {
        const r = c.row.original; const s = r.suggestion;
        return (
          <span className="block truncate" title={s?.rateNote}>
            <span className="text-muted">now {rateText(r.gstRate)}</span>{s && s.rate !== null && <> <span className={s.rate !== r.gstRate ? 'font-semibold text-warning' : 'text-success'}>{s.rate === r.gstRate ? 'agrees' : `suggest ${rateText(s.rate)}`}</span></>}
          </span>
        );
      },
    },
  ], [rows, picked, edits]);

  return (
    <>
      <PageHeader
        title="HSN helper" icon={<Wand2 size={17} />}
        subtitle={data ? `${data.stats.missingTotal} items have no valid HSN. Suggestions are only guesses: nothing is saved until you confirm.` : 'Loading'}
        actions={<>
          <Button icon={<ArrowLeft size={15} />} onClick={() => nav('/items')}>Items</Button>
          <Button icon={<Upload size={15} />} onClick={() => setImporting(true)}>Import from Excel / CSV</Button>
        </>}
      />
      <FilterBar trailing={<span className="whitespace-nowrap">{rows.length} shown{picked.size ? `, ${picked.size} ticked` : ''}</span>}>
        <div className="w-[230px]"><Input ref={searchRef} icon={<Search size={15} />} placeholder="Item, code or category" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-[190px]"><Select value={minConf} onChange={(e) => setMinConf(e.target.value as typeof minConf)} options={[{ value: 'any', label: 'Any confidence' }, { value: 'high', label: 'High only' }, { value: 'medium', label: 'High and medium' }]} /></div>
        <div className="w-[190px]"><Select value={showAll ? 'all' : 'missing'} onChange={(e) => setShowAll(e.target.value === 'all')} options={[{ value: 'missing', label: 'Items with no valid HSN' }, { value: 'all', label: 'All items (check existing codes)' }]} /></div>
        <Button size="sm" onClick={() => pickAll((r) => r.suggestion?.confidence === 'high')}>Tick all high confidence</Button>
        <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear ticks</Button>
      </FilterBar>
      <div className="flex min-h-0 flex-1 flex-col">
        {data && rows.length === 0 ? (
          <EmptyState icon={<Hash size={22} />} title={showAll ? 'No items match' : 'Every item has a valid HSN'} hint="Type in the search box, or switch the list to all items." />
        ) : (
          <DataTable
            data={rows} columns={columns} getRowId={(r) => r.id} onActivate={(r) => toggle(r.id)} storageKey="office-hsn-helper"
            footer={<><span>Tick the rows you agree with, change a code if you know better, then Confirm.</span><span className="flex items-center gap-1"><Check size={12} /> Rates are hints: verify with your CA</span></>}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface-2 px-5 py-2.5">
        <Checkbox checked={withRate} onCheckedChange={setWithRate} label="Also set the suggested GST rate on the ticked items (verify with CA first)" />
        <div className="flex-1" />
        {badPicked > 0 && <span className="text-xs text-danger">{badPicked} ticked rows have no valid code (4, 6 or 8 digits)</span>}
        <Button variant="primary" icon={<Check size={15} />} disabled={!readyIds.length || busy} onClick={() => void confirm()}>
          {readyIds.length ? `Confirm ${readyIds.length} ${readyIds.length === 1 ? 'item' : 'items'}` : 'Confirm ticked items'}
        </Button>
      </div>
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} gstRates={gstRates} />
    </>
  );
}

/* ------------------------------------------------------------------ import */

const HEAD_KEY = /^(item|name|product|code|barcode|sku|description)/i;
const HEAD_HSN = /hsn|sac/i;
const HEAD_RATE = /gst|rate|tax|%/i;

/** Rows of a collected file: the item (code or name), its HSN and optionally a GST rate. Headers are found by name; else columns 1, 2, 3. */
export function rowsFromTable(table: string[][]): { rows: HsnImportRow[]; mapped: string } {
  if (!table.length) return { rows: [], mapped: '' };
  const first = table[0].map((c) => String(c ?? '').trim());
  const hasHead = first.some((c) => HEAD_HSN.test(c));
  let ki = 0, hi = 1, ri = -1;
  if (hasHead) {
    hi = first.findIndex((c) => HEAD_HSN.test(c));
    ki = first.findIndex((c, i) => i !== hi && HEAD_KEY.test(c));
    if (ki < 0) ki = hi === 0 ? 1 : 0;
    ri = first.findIndex((c, i) => i !== hi && i !== ki && HEAD_RATE.test(c));
  } else if (first.length > 2) ri = 2;
  const body = hasHead ? table.slice(1) : table;
  const rows: HsnImportRow[] = [];
  for (const r of body) {
    const key = String(r[ki] ?? '').trim();
    const hsn = String(r[hi] ?? '').trim().replace(/\.0+$/, '');
    if (!key && !hsn) continue;
    const rateRaw = ri >= 0 ? String(r[ri] ?? '').trim().replace('%', '') : '';
    const rate = rateRaw !== '' && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : undefined;
    rows.push({ key, hsn, ...(rate !== undefined ? { gstRate: rate } : {}) });
  }
  return { rows, mapped: hasHead ? `Columns found: item "${first[ki]}", HSN "${first[hi]}"${ri >= 0 ? `, GST rate "${first[ri]}"` : ''}.` : 'No header row: column 1 is the item (code or name), column 2 the HSN, column 3 the GST rate (optional).' };
}

function ImportDialog({ open, onClose, onDone, gstRates }: { open: boolean; onClose: () => void; onDone: () => void; gstRates: number[] }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<{ rows: HsnImportRow[]; mapped: string } | null>(null);
  const [preview, setPreview] = useState<HsnImportPreview | null>(null);
  const [withRate, setWithRate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFileName(''); setParsed(null); setPreview(null); setError(''); setWithRate(false); } }, [open]);

  const choose = async (f?: File) => {
    if (!f) return;
    setError(''); setPreview(null); setFileName(f.name);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const isXlsx = /\.xlsx$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
      const table = isXlsx ? ((await readXlsx(bytes))[0]?.rows ?? []) : parseCsv(new TextDecoder().decode(bytes));
      const p = rowsFromTable(table);
      if (!p.rows.length) { setError('No rows found. The file needs the item (name or code) and the HSN in each row.'); setParsed(null); return; }
      setParsed(p);
      setPreview(await api.previewHsnImport(p.rows));
    } catch (e) { setError(e instanceof Error ? e.message : 'This file could not be read.'); setParsed(null); }
  };

  const apply = async () => {
    if (!preview) return;
    const ok = preview.rows.filter((r) => r.status === 'ok' && r.itemId);
    if (!ok.length || busy) return;
    setBusy(true);
    try {
      const res = await api.applyHsn(ok.map((r) => ({ itemId: r.itemId!, hsn: r.newHsn, ...(withRate && r.newRate !== null && gstRates.includes(r.newRate) ? { gstRate: r.newRate } : {}) })));
      toast.show({ tone: 'success', title: `${res.applied} items updated from ${fileName}`, detail: 'Bills already saved are not changed.' });
      onDone();
    } catch (e) { toast.show({ tone: 'error', title: 'Nothing was changed', detail: e instanceof Error ? e.message : undefined }); } finally { setBusy(false); }
  };

  const template = () => downloadBytes('hsn-import-template.xlsx', buildXlsx([{
    name: 'HSN',
    rows: [[{ v: 'Item code or name', style: 'head' }, { v: 'HSN', style: 'head' }, { v: 'GST rate', style: 'head' }], ['101', '1508', 5], ['Gingelly Oil 1 L', '1515', 5]],
    widths: [30, 14, 12],
  }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const tone = { ok: 'success', same: 'neutral', unmatched: 'danger', ambiguous: 'warning', invalid: 'danger' } as const;
  const word = { ok: 'Will change', same: 'No change', unmatched: 'No such item', ambiguous: 'Several items', invalid: 'Not valid' } as const;
  const okCount = preview?.stats.ok ?? 0;
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="xl" title="Import HSN from Excel or CSV"
      description="Columns: item code or name, HSN, GST rate (optional). You see what would change first; nothing is saved until you press Apply."
      bodyClassName="p-0"
      footer={<>
        <Button variant="ghost" icon={<FileSpreadsheet size={15} />} onClick={template}>Download template</Button>
        <div className="flex-1" />
        {preview && <Checkbox checked={withRate} onCheckedChange={setWithRate} label="Also set the GST rate from the file (verify with CA)" />}
        <Button onClick={onClose} kbd="Esc">Cancel</Button>
        <Button variant="primary" disabled={!okCount || busy} onClick={() => void apply()}>{okCount ? `Apply ${okCount} changes` : 'Apply'}</Button>
      </>}
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <Button icon={<Upload size={15} />} onClick={() => file.current?.click()}>{fileName ? 'Choose another file' : 'Choose file (.xlsx or .csv)'}</Button>
          <span className="text-sm text-muted">{fileName || 'No file chosen'}</span>
          <input ref={file} type="file" accept=".xlsx,.csv,.txt,.tsv" className="hidden" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {error && <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        {parsed && <div className="text-xs text-muted">{parsed.mapped} {parsed.rows.length} rows read.</div>}
        {preview && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success">{preview.stats.ok} will change</Badge><Badge tone="neutral">{preview.stats.same} already the same</Badge>
              <Badge tone={preview.stats.problems ? 'danger' : 'neutral'}>{preview.stats.problems} problems</Badge>
            </div>
            <div className="max-h-[360px] overflow-auto rounded-control border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-table-head text-xs uppercase tracking-wide text-table-head-ink">
                  <tr><th className="px-3 py-1.5 text-left">Row</th><th className="px-3 py-1.5 text-left">In the file</th><th className="px-3 py-1.5 text-left">Item</th><th className="px-3 py-1.5 text-left">HSN now</th><th className="px-3 py-1.5 text-left">New HSN</th><th className="px-3 py-1.5 text-left">GST rate</th><th className="px-3 py-1.5 text-left">Result</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.index} className="border-t border-line/70">
                      <td className="num px-3 py-1.5 text-muted">{r.index + 1}</td>
                      <td className="px-3 py-1.5">{r.key || '-'}</td>
                      <td className="px-3 py-1.5 font-medium text-ink">{r.name ?? <span className="text-subtle">-</span>}</td>
                      <td className="num px-3 py-1.5 text-muted">{r.currentHsn || '-'}</td>
                      <td className="num px-3 py-1.5">{r.newHsn || '-'}</td>
                      <td className="num px-3 py-1.5 text-muted">{r.newRate !== null ? rateText(r.newRate) : '-'}</td>
                      <td className="px-3 py-1.5"><Badge tone={tone[r.status]}>{word[r.status]}</Badge>{r.message && r.status !== 'same' && <span className="ml-2 text-xs text-muted">{r.message}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
