import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, FileJson, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import {
  B2CL_THRESHOLD, GSTR1_JSON_VERSION, buildGstr1, buildGstr3b, buildXlsx, formatPaise, gstr1Json, gstr1Sheets, gstr3bSheets, placeText, rateText,
  type Gstr1, type Gstr1HsnRow, type Gstr3b, type GstrFacts, type Heads,
} from '@gokul/data';
import { Badge, Button, EmptyState, PageHeader, useToast } from '@gokul/ui';
import { api } from '../store';
import { downloadBytes, Segmented } from '../components/crm/common';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const money = (p: number) => formatPaise(p);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

type Tab = 'gstr1' | 'gstr3b' | 'hsn';
type Detail = 'sections' | 'b2b' | 'b2cl' | 'b2cs' | 'notes' | 'docs' | 'checks';

/** A plain table in the report style: right-aligned money, a thin rule, the header kept in view. */
function Table({ head, rows, foot, empty }: { head: { label: string; right?: boolean; w?: string }[]; rows: ReactNode[][]; foot?: ReactNode[]; empty?: string }) {
  if (!rows.length && !foot) return <EmptyState title={empty ?? 'Nothing in this month'} />;
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-table-head text-[11px] font-semibold uppercase tracking-wider text-table-head-ink">
        <tr>{head.map((h, i) => <th key={i} style={{ width: h.w }} className={`border-b border-line px-3 py-2 ${h.right ? 'text-right' : 'text-left'}`}>{h.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => <tr key={i} className="border-b border-line/60 hover:bg-surface-2">{r.map((c, k) => <td key={k} className={`px-3 py-1.5 ${head[k]?.right ? 'num text-right' : ''}`}>{c}</td>)}</tr>)}
      </tbody>
      {foot && <tfoot className="sticky bottom-0 bg-surface-2 font-semibold"><tr>{foot.map((c, k) => <td key={k} className={`border-t-2 border-line px-3 py-2 ${head[k]?.right ? 'num text-right' : ''}`}>{c}</td>)}</tr></tfoot>}
    </table>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'primary' | 'success' | 'warning' }) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-line bg-surface px-4 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div className={`num truncate text-xl font-semibold ${tone === 'primary' ? 'text-primary' : tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-ink'}`}>{value}</div>
      {hint && <div className="truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

const heads = (h: Heads): ReactNode[] => [money(h.taxable), money(h.igst), money(h.cgst), money(h.sgst), money(h.cess)];

/**
 * Office -> GST returns: GSTR-1 for a month with every section (B2B invoice by invoice, B2CL, B2CS, nil, credit notes, HSN, documents),
 * exported to Excel (one sheet per section, like the GST offline tool) and to the offline tool's JSON, and the GSTR-3B summary
 * with Excel. The figures are added up from the bills and credit notes as they were saved, and checked against them on screen.
 */
export function GstReturns() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState<Tab>('gstr1');
  const [detail, setDetail] = useState<Detail>('sections');
  const [facts, setFacts] = useState<GstrFacts | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setFacts(await api.getGstrFacts(month)); } catch (e) { setFacts(null); setError(e instanceof Error ? e.message : 'Could not read the month.'); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const g1 = useMemo<Gstr1 | null>(() => (facts ? buildGstr1(facts) : null), [facts]);
  const g3 = useMemo<Gstr3b | null>(() => (facts ? buildGstr3b(facts) : null), [facts]);
  const bad = g1?.checks.filter((c) => !c.ok).length ?? 0;
  const file = (name: string) => `${name}-${month}`;

  const exportExcel = () => {
    if (tab === 'gstr3b' && g3) downloadBytes(`${file('GSTR3B')}.xlsx`, buildXlsx(gstr3bSheets(g3)), XLSX);
    else if (g1) downloadBytes(`${file('GSTR1')}.xlsx`, buildXlsx(gstr1Sheets(g1)), XLSX);
    toast.show({ tone: 'success', title: 'Excel file saved', detail: tab === 'gstr3b' ? `GSTR-3B for ${month}` : `GSTR-1 for ${month}, one sheet per section` });
  };
  const exportJson = () => {
    if (!g1) return;
    downloadBytes(`${file('GSTR1')}.json`, JSON.stringify(gstr1Json(g1), null, 1), 'application/json');
    toast.show({ tone: 'success', title: 'JSON file saved', detail: `GSTR-1 for ${month}, offline tool layout ${GSTR1_JSON_VERSION} (confirm with CA)` });
  };

  const t = g1?.totals;
  return (
    <>
      <PageHeader
        title="GST returns" icon={<FileSpreadsheet size={17} />}
        subtitle={facts ? `${facts.shop.name}  GSTIN ${facts.shop.gstin || 'not set'}  ${facts.period.from} to ${facts.period.to}` : 'Choose a month'}
        actions={<>
          <input
            type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month"
            className="h-8 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink"
          />
          <Button icon={<FileSpreadsheet size={15} />} onClick={exportExcel} disabled={!g1}>Excel</Button>
          <Button icon={<FileJson size={15} />} onClick={exportJson} disabled={!g1 || tab === 'gstr3b'} title="GSTR-1 in the GST offline tool's JSON layout">JSON (GSTR-1)</Button>
        </>}
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 py-2">
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'gstr1', label: 'GSTR-1' }, { value: 'gstr3b', label: 'GSTR-3B' }, { value: 'hsn', label: 'HSN summary (table 12)' }]} />
        <div className="flex-1" />
        {g1 && (bad === 0
          ? <Badge tone="success"><CheckCircle2 size={12} /> Totals tie to the bills and credit notes</Badge>
          : <Badge tone="danger"><TriangleAlert size={12} /> {bad} totals do not tie: see Checks</Badge>)}
      </div>
      {error && <div className="m-5 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {!facts && !error && <EmptyState title="Reading the month" />}

      {facts && g1 && g3 && tab === 'gstr1' && t && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-3 px-5 pt-3">
            <Kpi label="Invoices" value={t.invoices} hint={`${t.cancelled} cancelled, ${t.notes} credit notes`} />
            <Kpi label="Taxable value" value={`₹${money(t.net.taxable)}`} hint={`after credit notes (₹${money(t.sales.taxable)} before)`} tone="primary" />
            <Kpi label="Tax payable on sales" value={`₹${money(t.net.cgst + t.net.sgst + t.net.igst)}`} hint={`CGST ${money(t.net.cgst)}  SGST ${money(t.net.sgst)}  IGST ${money(t.net.igst)}`} />
            <Kpi label="B2B / B2CL" value={`${g1.b2b.length} / ${g1.b2cl.length}`} hint={`B2CL above ₹${(B2CL_THRESHOLD / 100).toLocaleString('en-IN')} (confirm with CA)`} />
          </div>
          <div className="flex shrink-0 items-center gap-2 px-5 py-3">
            <Segmented<Detail> value={detail} onChange={setDetail} options={[
              { value: 'sections', label: 'Sections' }, { value: 'b2b', label: `B2B (${g1.b2b.length})` }, { value: 'b2cl', label: `B2CL (${g1.b2cl.length})` }, { value: 'b2cs', label: `B2CS (${g1.b2cs.length})` },
              { value: 'notes', label: `Credit notes (${t.notes})` }, { value: 'docs', label: 'Documents' }, { value: 'checks', label: 'Checks and notes' },
            ]} />
          </div>
          <div className="mx-5 mb-4 min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface">
            {detail === 'sections' && (
              <Table
                head={[{ label: 'Table', w: '36%' }, { label: 'Documents', right: true }, { label: 'Taxable value', right: true }, { label: 'IGST', right: true }, { label: 'CGST', right: true }, { label: 'SGST', right: true }, { label: 'Cess', right: true }]}
                rows={[
                  ['4A  B2B invoices (registered buyers)', g1.b2b.length, ...heads(t.b2b)],
                  ['5  B2CL (inter-state, consumer, large)', g1.b2cl.length, ...heads(t.b2cl)],
                  ['7  B2CS (other consumers), before credit notes', '', ...heads(t.b2csGross)],
                  ['8  Nil rated (0%)', '', money(t.nil.taxable), '0.00', '0.00', '0.00', '0.00'],
                  [<b key="a">All invoices (the Sales report)</b>, <b key="n">{t.invoices}</b>, ...heads(t.sales).map((x, i) => <b key={i}>{x}</b>)],
                  ['9B  Credit notes to registered buyers (CDNR)', g1.cdnr.length, ...heads(t.cdnr)],
                  ['9B  Credit notes against B2CL (CDNUR)', g1.cdnur.length, ...heads(t.cdnur)],
                  ['Credit notes to consumers (taken off B2CS)', g1.cnAgainstB2cs.length, ...heads(t.cnB2cs)],
                  [<b key="c">All credit notes</b>, <b key="m">{t.notes}</b>, ...heads(t.credit).map((x, i) => <b key={i}>{x}</b>)],
                ]}
                foot={['Net: invoices less credit notes', '', ...heads(t.net)]}
              />
            )}
            {detail === 'b2b' && (
              <Table
                head={[{ label: 'GSTIN' }, { label: 'Buyer' }, { label: 'Invoice' }, { label: 'Date' }, { label: 'Place of supply' }, { label: 'Invoice value', right: true }, { label: 'Taxable value', right: true }, { label: 'Tax', right: true }]}
                rows={g1.b2b.map((i) => [i.ctin, i.name, i.number, fmtDate(i.at), placeText(i.pos), money(i.value), money(i.items.reduce((s, x) => s + x.taxable, 0)), money(i.items.reduce((s, x) => s + x.igst + x.cgst + x.sgst, 0))])}
                empty="No sales to registered buyers in this month"
              />
            )}
            {detail === 'b2cl' && (
              <Table
                head={[{ label: 'Invoice' }, { label: 'Date' }, { label: 'Place of supply' }, { label: 'Invoice value', right: true }, { label: 'Taxable value', right: true }, { label: 'IGST', right: true }]}
                rows={g1.b2cl.map((i) => [i.number, fmtDate(i.at), placeText(i.pos), money(i.value), money(i.items.reduce((s, x) => s + x.taxable, 0)), money(i.items.reduce((s, x) => s + x.igst, 0))])}
                empty="No large inter-state consumer invoices in this month"
              />
            )}
            {detail === 'b2cs' && (
              <Table
                head={[{ label: 'Supply' }, { label: 'Place of supply' }, { label: 'Rate', right: true }, { label: 'Taxable value', right: true }, { label: 'IGST', right: true }, { label: 'CGST', right: true }, { label: 'SGST', right: true }, { label: 'Cess', right: true }]}
                rows={g1.b2cs.map((r) => [r.supply === 'INTER' ? 'Inter-state' : 'Local', placeText(r.pos), rateText(r.rate), money(r.taxable), money(r.igst), money(r.cgst), money(r.sgst), money(r.cess)])}
                foot={['Total, after credit notes to consumers', '', '', ...[g1.totals.b2csNet.taxable, g1.totals.b2csNet.igst, g1.totals.b2csNet.cgst, g1.totals.b2csNet.sgst, g1.totals.b2csNet.cess].map(money)]}
              />
            )}
            {detail === 'notes' && (
              <Table
                head={[{ label: 'Credit note' }, { label: 'Date' }, { label: 'Against invoice' }, { label: 'Invoice date' }, { label: 'Buyer' }, { label: 'Section' }, { label: 'Note value', right: true }, { label: 'Tax reversed', right: true }]}
                rows={[
                  ...g1.cdnr.map((n) => [n.number, fmtDate(n.at), n.billNumber, fmtDate(n.billAt), `${n.name} ${n.ctin}`, <Badge key="s" tone="info">CDNR</Badge>, money(n.value), money(n.items.reduce((s, x) => s + x.igst + x.cgst + x.sgst, 0))]),
                  ...g1.cdnur.map((n) => [n.number, fmtDate(n.at), n.billNumber, fmtDate(n.billAt), n.name || 'Consumer', <Badge key="s" tone="warning">CDNUR</Badge>, money(n.value), money(n.items.reduce((s, x) => s + x.igst + x.cgst + x.sgst, 0))]),
                  ...g1.cnAgainstB2cs.map((n) => [n.number, fmtDate(n.at), n.billNumber, fmtDate(n.billAt), n.name || 'Consumer', <Badge key="s" tone="neutral">Off B2CS</Badge>, money(n.value), money(n.items.reduce((s, x) => s + x.igst + x.cgst + x.sgst, 0))]),
                ]}
                empty="No credit notes in this month"
              />
            )}
            {detail === 'docs' && (
              <Table
                head={[{ label: 'Nature of document' }, { label: 'From' }, { label: 'To' }, { label: 'Issued', right: true }, { label: 'Cancelled', right: true }, { label: 'Net issued', right: true }]}
                rows={g1.docs.map((d) => [d.label, d.from, d.to, d.total, d.cancelled, d.total - d.cancelled])}
                empty="No documents in this month"
              />
            )}
            {detail === 'checks' && (
              <div className="p-4">
                <Table
                  head={[{ label: 'Check' }, { label: 'Result' }, { label: 'Figure A', right: true }, { label: 'Figure B', right: true }]}
                  rows={g1.checks.map((c) => [c.label, <Badge key="r" tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'OK' : 'Different'}</Badge>, money(c.a), money(c.b)])}
                />
                <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Notes for your CA (confirm with CA)</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{g1.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {facts && g3 && tab === 'gstr3b' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-3 px-5 py-3">
            <Kpi label="Output tax" value={`₹${money(g3.outward.igst + g3.outward.cgst + g3.outward.sgst)}`} hint="after credit notes" tone="primary" />
            <Kpi label="Input tax credit" value={`₹${money(g3.itc.igst + g3.itc.cgst + g3.itc.sgst)}`} hint="from purchases in the month" tone="success" />
            <Kpi label="Pay in cash" value={`₹${money(g3.cash.igst + g3.cash.cgst + g3.cash.sgst)}`} hint={`IGST ${money(g3.cash.igst)}  CGST ${money(g3.cash.cgst)}  SGST ${money(g3.cash.sgst)}`} tone="warning" />
            <Kpi label="Nil rated sales" value={`₹${money(g3.nil)}`} hint="table 3.1(c)" />
          </div>
          <div className="mx-5 mb-2 min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-table-head text-[11px] font-semibold uppercase tracking-wider text-table-head-ink">
                <tr><th className="w-[70px] border-b border-line px-3 py-2 text-left">Table</th><th className="border-b border-line px-3 py-2 text-left">Description</th><th className="border-b border-line px-3 py-2 text-right">Taxable value</th><th className="border-b border-line px-3 py-2 text-right">IGST</th><th className="border-b border-line px-3 py-2 text-right">CGST</th><th className="border-b border-line px-3 py-2 text-right">SGST / UTGST</th><th className="border-b border-line px-3 py-2 text-right">Cess</th></tr>
              </thead>
              <tbody>
                {g3.rows.map((r, i) => r.style === 'head'
                  ? <tr key={i} className="bg-surface-3"><td className="px-3 py-1.5 font-semibold text-ink">{r.ref}</td><td colSpan={6} className="px-3 py-1.5 font-semibold text-ink">{r.desc}</td></tr>
                  : (
                    <tr key={i} className={`border-b border-line/60 ${r.style === 'muted' ? 'text-subtle' : ''} ${r.style === 'strong' ? 'bg-primary-soft font-semibold' : ''}`}>
                      <td className="px-3 py-1.5 text-muted">{r.ref}</td><td className="px-3 py-1.5">{r.desc}</td>
                      {[r.taxable, r.igst, r.cgst, r.sgst, r.cess].map((v, k) => <td key={k} className="num px-3 py-1.5 text-right">{v === undefined ? '' : money(v)}</td>)}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ul className="mx-5 mb-3 list-disc space-y-0.5 pl-5 text-xs text-muted">{g3.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {facts && g1 && tab === 'hsn' && (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <div className="mb-3 text-sm text-muted">GSTR-1 table 12, split into B2B and B2C, after credit notes (confirm the layout with your CA). Items with no HSN show as 0000: fix them in Items, HSN helper.</div>
          {([['Supplies to registered buyers (B2B)', g1.hsnB2b], ['Supplies to consumers and unregistered buyers (B2C)', g1.hsnB2c]] as [string, Gstr1HsnRow[]][]).map(([title, list]) => (
            <div key={title} className="mb-4 overflow-hidden rounded-card border border-line bg-surface">
              <div className="border-b border-line bg-surface-3 px-3 py-2 text-sm font-semibold text-ink">{title}</div>
              <Table
                head={[{ label: 'HSN' }, { label: 'Description' }, { label: 'UQC' }, { label: 'Quantity', right: true }, { label: 'Rate', right: true }, { label: 'Taxable value', right: true }, { label: 'IGST', right: true }, { label: 'CGST', right: true }, { label: 'SGST', right: true }, { label: 'Cess', right: true }, { label: 'Total value', right: true }]}
                rows={list.map((r) => [r.hsn, r.desc, r.uqc, (r.qty / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }), rateText(r.rate), money(r.taxable), money(r.igst), money(r.cgst), money(r.sgst), money(r.cess), money(r.value)])}
                foot={list.length ? ['Total', '', '', '', '', ...[list.reduce((s, r) => s + r.taxable, 0), list.reduce((s, r) => s + r.igst, 0), list.reduce((s, r) => s + r.cgst, 0), list.reduce((s, r) => s + r.sgst, 0), list.reduce((s, r) => s + r.cess, 0), list.reduce((s, r) => s + r.value, 0)].map(money)] : undefined}
                empty="Nothing in this month"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
