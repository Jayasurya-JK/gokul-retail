import type { Paise } from './types';
import { setOff, stateName } from './gst';
import { rateBp } from './money';
import type { Cell, Sheet } from './xlsx';

/**
 * GSTR-1 and GSTR-3B for one month, built from plain facts (what was saved on each bill, credit note and purchase). The Rust core
 * (crates/core/src/gstr.rs) and the browser-preview mock both hand over the same facts, and this one builder makes the sections, the
 * Excel sheets and the JSON, so the desktop app and the preview can never disagree.
 *
 * Everything marked (confirm with CA) is a rule or a file layout the shop's CA should confirm before the file is uploaded.
 */

/** Inter-state sale to an unregistered buyer is a "large" invoice (table 5, B2CL) above this value: Rs 1 lakh since 1 Aug 2024 (confirm with CA). */
export const B2CL_THRESHOLD: Paise = 10_000_000;

/** The offline-tool JSON schema version this file is written for (confirm with CA: check it against the version the GST portal offers). */
export const GSTR1_JSON_VERSION = 'GST3.0.4';

export interface GstrSlab { rate: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; cess: Paise }
export interface GstrBill {
  number: string; shown: string; fy: string; seq: number; at: string; day: string; status: string; grand: Paise;
  place: string; inter: boolean; gstin: string; name: string; slabs: GstrSlab[];
}
export interface GstrNote {
  number: string; shown: string; fy: string; seq: number; at: string; day: string; grand: Paise;
  place: string; inter: boolean; gstin: string; name: string;
  billNumber: string; billShown: string; billAt: string; billGrand: Paise; billInter: boolean; slabs: GstrSlab[];
}
export interface GstrHsnFact {
  b2b: boolean; hsn: string; desc: string; unit: string; uqc: string; rate: number;
  qty: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; cess: Paise; value: Paise;
}
export interface GstrFacts {
  period: { month: string; from: string; to: string; fp: string };
  shop: { name: string; gstin: string; address: string; stateCode: string; stateName: string };
  bills: GstrBill[];
  notes: GstrNote[];
  hsn: { sales: GstrHsnFact[]; returns: GstrHsnFact[] };
  purchases: { count: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; nilIntra: Paise; nilInter: Paise };
}

export interface Heads { taxable: Paise; igst: Paise; cgst: Paise; sgst: Paise; cess: Paise }
const zero = (): Heads => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
const addSlab = (h: Heads, s: GstrSlab, sign = 1) => { h.taxable += sign * s.taxable; h.igst += sign * s.igst; h.cgst += sign * s.cgst; h.sgst += sign * s.sgst; h.cess += sign * s.cess; };
const addHeads = (a: Heads, b: Heads, sign = 1) => { a.taxable += sign * b.taxable; a.igst += sign * b.igst; a.cgst += sign * b.cgst; a.sgst += sign * b.sgst; a.cess += sign * b.cess; };
export const taxOf = (h: Heads): Paise => h.igst + h.cgst + h.sgst;

export interface InvoiceItem { rate: number; taxable: Paise; igst: Paise; cgst: Paise; sgst: Paise; cess: Paise }
export interface B2bInvoice { ctin: string; name: string; number: string; at: string; value: Paise; pos: string; items: InvoiceItem[] }
export interface B2clInvoice { number: string; at: string; value: Paise; pos: string; items: InvoiceItem[] }
export interface B2csRow { supply: 'INTRA' | 'INTER'; pos: string; rate: number; taxable: Paise; igst: Paise; cgst: Paise; sgst: Paise; cess: Paise }
export interface NoteRow { ctin: string; name: string; number: string; at: string; value: Paise; pos: string; billNumber: string; billAt: string; items: InvoiceItem[]; urType?: 'B2CL' }
export interface NilRow { key: 'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C'; label: string; nil: Paise }
export interface Gstr1HsnRow { hsn: string; desc: string; uqc: string; qty: number; rate: number; value: Paise; taxable: Paise; igst: Paise; cgst: Paise; sgst: Paise; cess: Paise }
export interface DocRange { nature: number; label: string; from: string; to: string; total: number; cancelled: number }

export interface Check { label: string; ok: boolean; a: Paise; b: Paise }

export interface Gstr1 {
  period: GstrFacts['period']; shop: GstrFacts['shop'];
  b2b: B2bInvoice[]; b2cl: B2clInvoice[]; b2cs: B2csRow[];
  /** Credit notes to registered buyers (table 9B CDNR) and to unregistered buyers against B2CL invoices (CDNUR) */
  cdnr: NoteRow[]; cdnur: NoteRow[];
  /** Credit notes to consumers that are not B2CL: taken off the B2CS rows (netted) */
  cnAgainstB2cs: NoteRow[];
  nil: NilRow[];
  hsnB2b: Gstr1HsnRow[]; hsnB2c: Gstr1HsnRow[];
  docs: DocRange[];
  totals: {
    invoices: number; cancelled: number; notes: number;
    sales: Heads & { grand: Paise }; b2b: Heads; b2cl: Heads; b2csGross: Heads; nil: Heads;
    credit: Heads & { grand: Paise }; cdnr: Heads; cdnur: Heads; cnB2cs: Heads;
    b2csNet: Heads; net: Heads;
  };
  checks: Check[];
  notes: string[];
}

const itemOf = (s: GstrSlab): InvoiceItem => ({ rate: s.rate, taxable: s.taxable, igst: s.igst, cgst: s.cgst, sgst: s.sgst, cess: s.cess });

/** Sections of GSTR-1 for the month, with totals that must (and are checked to) add up to the bills and credit notes. */
export function buildGstr1(f: GstrFacts): Gstr1 {
  const live = f.bills.filter((b) => b.status !== 'cancelled');
  const b2b: B2bInvoice[] = [], b2cl: B2clInvoice[] = [];
  const b2csMap = new Map<string, B2csRow>();
  const nilMap = new Map<NilRow['key'], number>();
  const tot = { sales: { ...zero(), grand: 0 }, b2b: zero(), b2cl: zero(), b2csGross: zero(), nil: zero() };
  const nilKey = (b: { gstin: string; inter: boolean }): NilRow['key'] => (b.gstin ? (b.inter ? 'INTRB2B' : 'INTRAB2B') : b.inter ? 'INTRB2C' : 'INTRAB2C');

  for (const b of live) {
    const taxed = b.slabs.filter((s) => s.rate > 0);
    const nil = b.slabs.filter((s) => s.rate === 0);
    for (const s of b.slabs) addSlab(tot.sales, s);
    tot.sales.grand += b.grand;
    const large = !b.gstin && b.inter && b.grand > B2CL_THRESHOLD;
    for (const s of taxed) addSlab(b.gstin ? tot.b2b : large ? tot.b2cl : tot.b2csGross, s);
    for (const s of nil) { addSlab(tot.nil, s); nilMap.set(nilKey(b), (nilMap.get(nilKey(b)) ?? 0) + s.taxable); }
    if (b.gstin && taxed.length) b2b.push({ ctin: b.gstin, name: b.name, number: b.shown, at: b.at, value: b.grand, pos: b.place, items: taxed.map(itemOf) });
    else if (large && taxed.length) b2cl.push({ number: b.shown, at: b.at, value: b.grand, pos: b.place, items: taxed.map(itemOf) });
    else if (!b.gstin) {
      for (const s of taxed) {
        const key = `${b.inter ? 'INTER' : 'INTRA'}|${b.place}|${rateBp(s.rate)}`;
        const r = b2csMap.get(key) ?? { supply: b.inter ? 'INTER' as const : 'INTRA' as const, pos: b.place, rate: s.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
        r.taxable += s.taxable; r.igst += s.igst; r.cgst += s.cgst; r.sgst += s.sgst; r.cess += s.cess;
        b2csMap.set(key, r);
      }
    }
  }

  // credit notes: registered -> CDNR; unregistered against a B2CL invoice -> CDNUR; other consumers -> taken off B2CS
  const cdnr: NoteRow[] = [], cdnur: NoteRow[] = [], cnAgainstB2cs: NoteRow[] = [];
  const credit = { ...zero(), grand: 0 }, tCdnr = zero(), tCdnur = zero(), tCnB2cs = zero();
  const creditNil = zero();
  for (const n of f.notes) {
    const taxed = n.slabs.filter((s) => s.rate > 0);
    for (const s of n.slabs) { addSlab(credit, s); if (s.rate === 0) addSlab(creditNil, s); }
    credit.grand += n.grand;
    const row: NoteRow = { ctin: n.gstin, name: n.name, number: n.shown, at: n.at, value: n.grand, pos: n.place, billNumber: n.billShown, billAt: n.billAt, items: taxed.map(itemOf) };
    if (n.gstin) { cdnr.push(row); for (const s of taxed) addSlab(tCdnr, s); }
    else if (n.billInter && n.billGrand > B2CL_THRESHOLD) { cdnur.push({ ...row, urType: 'B2CL' }); for (const s of taxed) addSlab(tCdnur, s); }
    else {
      cnAgainstB2cs.push(row);
      for (const s of taxed) {
        addSlab(tCnB2cs, s);
        const key = `${n.inter ? 'INTER' : 'INTRA'}|${n.place}|${rateBp(s.rate)}`;
        const r = b2csMap.get(key) ?? { supply: n.inter ? 'INTER' as const : 'INTRA' as const, pos: n.place, rate: s.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
        r.taxable -= s.taxable; r.igst -= s.igst; r.cgst -= s.cgst; r.sgst -= s.sgst; r.cess -= s.cess;
        b2csMap.set(key, r);
      }
    }
  }
  const b2cs = [...b2csMap.values()].filter((r) => r.taxable !== 0 || r.igst !== 0 || r.cgst !== 0 || r.sgst !== 0 || r.cess !== 0)
    .sort((a, b) => a.supply.localeCompare(b.supply) || a.pos.localeCompare(b.pos) || a.rate - b.rate);
  const b2csNet = zero();
  addHeads(b2csNet, tot.b2csGross);
  addHeads(b2csNet, tCnB2cs, -1);

  const nilLabels: Record<NilRow['key'], string> = { INTRB2B: 'Inter-state supplies to registered persons', INTRAB2B: 'Intra-state supplies to registered persons', INTRB2C: 'Inter-state supplies to unregistered persons', INTRAB2C: 'Intra-state supplies to unregistered persons' };
  const nil: NilRow[] = (['INTRB2B', 'INTRAB2B', 'INTRB2C', 'INTRAB2C'] as const).map((key) => ({ key, label: nilLabels[key], nil: nilMap.get(key) ?? 0 }));

  // table 12: sales less returns, split B2B and B2C (confirm with CA)
  const hsnMap = new Map<string, Gstr1HsnRow & { b2b: boolean }>();
  const addHsn = (h: GstrHsnFact, sign: number) => {
    const key = `${h.b2b}|${h.hsn}|${h.uqc}|${rateBp(h.rate)}`;
    const r = hsnMap.get(key) ?? { b2b: h.b2b, hsn: h.hsn || '0000', desc: h.desc || 'Goods', uqc: h.uqc, qty: 0, rate: h.rate, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    r.qty += sign * h.qty; r.value += sign * h.value; r.taxable += sign * h.taxable; r.igst += sign * h.igst; r.cgst += sign * h.cgst; r.sgst += sign * h.sgst; r.cess += sign * h.cess;
    hsnMap.set(key, r);
  };
  f.hsn.sales.forEach((h) => addHsn(h, 1));
  f.hsn.returns.forEach((h) => addHsn(h, -1));
  const hsnRows = [...hsnMap.values()].filter((r) => r.qty !== 0 || r.taxable !== 0 || r.value !== 0).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.uqc.localeCompare(b.uqc) || a.rate - b.rate);
  const strip = (r: Gstr1HsnRow & { b2b: boolean }): Gstr1HsnRow => ({ hsn: r.hsn, desc: r.desc, uqc: r.uqc, qty: r.qty, rate: r.rate, value: r.value, taxable: r.taxable, igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess });

  // table 13: documents issued (every bill counts, a cancelled one is listed as cancelled), per financial year
  const docs: DocRange[] = [];
  const byFy = new Map<string, GstrBill[]>();
  for (const b of f.bills) byFy.set(b.fy, [...(byFy.get(b.fy) ?? []), b]);
  for (const [, list] of [...byFy.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...list].sort((a, b) => a.seq - b.seq);
    docs.push({ nature: 1, label: 'Invoices for outward supply', from: sorted[0].shown, to: sorted[sorted.length - 1].shown, total: sorted.length, cancelled: sorted.filter((b) => b.status === 'cancelled').length });
  }
  const notesByFy = new Map<string, GstrNote[]>();
  for (const n of f.notes) notesByFy.set(n.fy, [...(notesByFy.get(n.fy) ?? []), n]);
  for (const [, list] of [...notesByFy.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...list].sort((a, b) => a.seq - b.seq);
    docs.push({ nature: 5, label: 'Credit Note', from: sorted[0].shown, to: sorted[sorted.length - 1].shown, total: sorted.length, cancelled: 0 });
  }

  const net = zero();
  addHeads(net, tot.sales); addHeads(net, credit, -1);
  const eq = (label: string, a: number, b: number): Check => ({ label, ok: a === b, a, b });
  const parts = zero();
  addHeads(parts, tot.b2b); addHeads(parts, tot.b2cl); addHeads(parts, tot.b2csGross); addHeads(parts, tot.nil);
  const cnParts = zero();
  addHeads(cnParts, tCdnr); addHeads(cnParts, tCdnur); addHeads(cnParts, tCnB2cs); addHeads(cnParts, creditNil);
  const hsnB2bRows = hsnRows.filter((r) => r.b2b), hsnB2cRows = hsnRows.filter((r) => !r.b2b);
  const hsnTotal = zero();
  for (const r of hsnRows) { hsnTotal.taxable += r.taxable; hsnTotal.igst += r.igst; hsnTotal.cgst += r.cgst; hsnTotal.sgst += r.sgst; hsnTotal.cess += r.cess; }
  const checks: Check[] = [
    eq('Taxable value: B2B + B2CL + B2CS + nil = all bills', parts.taxable, tot.sales.taxable),
    eq('IGST: sections = all bills', parts.igst, tot.sales.igst),
    eq('CGST: sections = all bills', parts.cgst, tot.sales.cgst),
    eq('SGST: sections = all bills', parts.sgst, tot.sales.sgst),
    eq('Cess: sections = all bills', parts.cess, tot.sales.cess),
    eq('Credit notes: CDNR + CDNUR + consumers + nil = all credit notes (taxable)', cnParts.taxable, credit.taxable),
    eq('Credit notes: tax reversed = all credit notes', cnParts.igst + cnParts.cgst + cnParts.sgst, credit.igst + credit.cgst + credit.sgst),
    eq('HSN table: taxable value = bills less credit notes', hsnTotal.taxable, net.taxable),
    eq('HSN table: IGST + CGST + SGST = bills less credit notes', hsnTotal.igst + hsnTotal.cgst + hsnTotal.sgst, taxOf(net)),
    eq('HSN table: cess = bills less credit notes', hsnTotal.cess, net.cess),
  ];

  return {
    period: f.period, shop: f.shop, b2b, b2cl, b2cs, cdnr, cdnur, cnAgainstB2cs, nil,
    hsnB2b: hsnB2bRows.map(strip), hsnB2c: hsnB2cRows.map(strip), docs,
    totals: {
      invoices: live.length, cancelled: f.bills.length - live.length, notes: f.notes.length,
      sales: tot.sales, b2b: tot.b2b, b2cl: tot.b2cl, b2csGross: tot.b2csGross, nil: tot.nil,
      credit, cdnr: tCdnr, cdnur: tCdnur, cnB2cs: tCnB2cs, b2csNet, net,
    },
    checks,
    notes: [
      `B2CL means an inter-state sale to an unregistered buyer above Rs ${(B2CL_THRESHOLD / 100).toLocaleString('en-IN')} per invoice (confirm with CA).`,
      'Nil rated, exempt and non-GST sales are not split: every 0% line is reported as nil rated in table 8 (confirm with CA).',
      'Credit notes to consumers that are not against a B2CL invoice are taken off the B2CS rows of the month (confirm with CA).',
      'HSN summary (table 12) is shown net of credit notes, split into B2B and B2C (confirm the layout and treatment with CA).',
      'Gross turnover fields (gt, cur_gt) in the JSON are 0: fill them in the offline tool or on the portal.',
    ],
  };
}

/* ------------------------------------------------------------------ JSON (GSTN offline tool) */

const rs = (p: Paise): number => Math.round(p) / 100;
const dmy = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
const itm = (it: InvoiceItem, num: number, inter: boolean) => ({
  num,
  itm_det: { rt: it.rate, txval: rs(it.taxable), ...(inter ? { iamt: rs(it.igst) } : { camt: rs(it.cgst), samt: rs(it.sgst) }), csamt: rs(it.cess) },
});

/**
 * GSTR-1 in the JSON layout of the GSTN offline tool (version GSTR1_JSON_VERSION, confirm with CA). Amounts are in rupees.
 * Sections: b2b, b2cl, b2cs, cdnr, cdnur, nil, hsn (B2B and B2C), doc_issue.
 */
export function gstr1Json(g: Gstr1): Record<string, unknown> {
  const home = g.shop.stateCode;
  const group = <T extends { ctin: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) m.set(r.ctin, [...(m.get(r.ctin) ?? []), r]); return [...m.entries()]; };
  const hsnJson = (rows: Gstr1HsnRow[]) => rows.map((r, i) => ({ num: i + 1, hsn_sc: r.hsn, desc: r.desc, uqc: r.uqc, qty: Math.round(r.qty) / 1000, rt: r.rate, val: rs(r.value), txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: rs(r.cess) }));
  const out: Record<string, unknown> = {
    gstin: g.shop.gstin, fp: g.period.fp, version: GSTR1_JSON_VERSION, hash: 'hash', gt: 0, cur_gt: 0,
  };
  if (g.b2b.length) out.b2b = group(g.b2b).map(([ctin, inv]) => ({ ctin, inv: inv.map((i) => ({ inum: i.number, idt: dmy(i.at), val: rs(i.value), pos: i.pos, rchrg: 'N', inv_typ: 'R', itms: i.items.map((it, k) => itm(it, k + 1, i.pos !== home)) })) }));
  if (g.b2cl.length) {
    const m = new Map<string, B2clInvoice[]>();
    for (const i of g.b2cl) m.set(i.pos, [...(m.get(i.pos) ?? []), i]);
    out.b2cl = [...m.entries()].map(([pos, inv]) => ({ pos, inv: inv.map((i) => ({ inum: i.number, idt: dmy(i.at), val: rs(i.value), itms: i.items.map((it, k) => ({ num: k + 1, itm_det: { rt: it.rate, txval: rs(it.taxable), iamt: rs(it.igst), csamt: rs(it.cess) } })) })) }));
  }
  if (g.b2cs.length) out.b2cs = g.b2cs.map((r) => ({ sply_ty: r.supply, rt: r.rate, typ: 'OE', pos: r.pos, txval: rs(r.taxable), ...(r.supply === 'INTER' ? { iamt: rs(r.igst) } : { camt: rs(r.cgst), samt: rs(r.sgst) }), csamt: rs(r.cess) }));
  if (g.cdnr.length) out.cdnr = group(g.cdnr).map(([ctin, nt]) => ({ ctin, nt: nt.map((n) => ({ ntty: 'C', nt_num: n.number, nt_dt: dmy(n.at), val: rs(n.value), pos: n.pos, rchrg: 'N', inv_typ: 'R', itms: n.items.map((it, k) => itm(it, k + 1, n.pos !== home)) })) }));
  if (g.cdnur.length) out.cdnur = g.cdnur.map((n) => ({ typ: n.urType ?? 'B2CL', ntty: 'C', nt_num: n.number, nt_dt: dmy(n.at), val: rs(n.value), pos: n.pos, itms: n.items.map((it, k) => ({ num: k + 1, itm_det: { rt: it.rate, txval: rs(it.taxable), iamt: rs(it.igst), csamt: rs(it.cess) } })) }));
  out.nil = { inv: g.nil.map((n) => ({ sply_ty: n.key, expt_amt: 0, nil_amt: rs(n.nil), ngsup_amt: 0 })) };
  out.hsn = { hsn_b2b: hsnJson(g.hsnB2b), hsn_b2c: hsnJson(g.hsnB2c) };
  out.doc_issue = { doc_det: [...new Set(g.docs.map((d) => d.nature))].map((nature) => ({ doc_num: nature, doc_typ: g.docs.find((d) => d.nature === nature)!.label, docs: g.docs.filter((d) => d.nature === nature).map((d, i) => ({ num: i + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.total - d.cancelled })) })) };
  return out;
}

/* ------------------------------------------------------------------ Excel (one sheet per section, like the offline tool) */

const m2 = (p: Paise): Cell => ({ v: rs(p), style: 'money' });
const head = (...cols: string[]): Cell[] => cols.map((c) => ({ v: c, style: 'head' as const }));
const place = (code: string) => `${code}-${stateName(code) ?? ''}`;

export function gstr1Sheets(g: Gstr1): Sheet[] {
  const t = g.totals;
  const sum: Cell[][] = [
    [{ v: `GSTR-1 ${g.period.month}`, style: 'title' }],
    ['Shop', g.shop.name, 'GSTIN', g.shop.gstin, 'Period', `${g.period.from} to ${g.period.to}`],
    [],
    head('Section', 'Documents', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess'),
    ['4A B2B invoices', g.b2b.length, m2(t.b2b.taxable), m2(t.b2b.igst), m2(t.b2b.cgst), m2(t.b2b.sgst), m2(t.b2b.cess)],
    ['5 B2CL invoices', g.b2cl.length, m2(t.b2cl.taxable), m2(t.b2cl.igst), m2(t.b2cl.cgst), m2(t.b2cl.sgst), m2(t.b2cl.cess)],
    ['7 B2CS (before credit notes)', '', m2(t.b2csGross.taxable), m2(t.b2csGross.igst), m2(t.b2csGross.cgst), m2(t.b2csGross.sgst), m2(t.b2csGross.cess)],
    ['8 Nil rated', '', m2(t.nil.taxable), m2(0), m2(0), m2(0), m2(0)],
    [{ v: 'All invoices (Sales report)', style: 'bold' }, t.invoices, m2(t.sales.taxable), m2(t.sales.igst), m2(t.sales.cgst), m2(t.sales.sgst), m2(t.sales.cess)],
    [],
    ['9B CDNR credit notes (registered)', g.cdnr.length, m2(t.cdnr.taxable), m2(t.cdnr.igst), m2(t.cdnr.cgst), m2(t.cdnr.sgst), m2(t.cdnr.cess)],
    ['9B CDNUR credit notes (B2CL)', g.cdnur.length, m2(t.cdnur.taxable), m2(t.cdnur.igst), m2(t.cdnur.cgst), m2(t.cdnur.sgst), m2(t.cdnur.cess)],
    ['Credit notes to consumers (taken off B2CS)', g.cnAgainstB2cs.length, m2(t.cnB2cs.taxable), m2(t.cnB2cs.igst), m2(t.cnB2cs.cgst), m2(t.cnB2cs.sgst), m2(t.cnB2cs.cess)],
    [{ v: 'All credit notes', style: 'bold' }, t.notes, m2(t.credit.taxable), m2(t.credit.igst), m2(t.credit.cgst), m2(t.credit.sgst), m2(t.credit.cess)],
    [],
    [{ v: 'Net (invoices less credit notes)', style: 'bold' }, '', m2(t.net.taxable), m2(t.net.igst), m2(t.net.cgst), m2(t.net.sgst), m2(t.net.cess)],
    [],
    head('Reconciliation', 'Result', 'Figure A', 'Figure B'),
    ...g.checks.map((c): Cell[] => [c.label, c.ok ? 'OK' : 'DIFFERENT', m2(c.a), m2(c.b)]),
    [],
    head('Notes for the CA (confirm with CA)'),
    ...g.notes.map((n): Cell[] => [n]),
  ];
  const b2b: Cell[][] = [head('GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount')];
  for (const i of g.b2b) i.items.forEach((it, k) => b2b.push([i.ctin, i.name, i.number, dmy(i.at), k === 0 ? m2(i.value) : null, place(i.pos), 'N', '', 'Regular', '', it.rate, m2(it.taxable), m2(it.cess)]));
  const b2cl: Cell[][] = [head('Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN')];
  for (const i of g.b2cl) i.items.forEach((it, k) => b2cl.push([i.number, dmy(i.at), k === 0 ? m2(i.value) : null, place(i.pos), '', it.rate, m2(it.taxable), m2(it.cess), '']));
  const b2cs: Cell[][] = [head('Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN')];
  for (const r of g.b2cs) b2cs.push(['OE', place(r.pos), '', r.rate, m2(r.taxable), m2(r.cess), '']);
  const cdnr: Cell[][] = [head('GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'Against Invoice', 'Invoice Date')];
  for (const n of g.cdnr) n.items.forEach((it, k) => cdnr.push([n.ctin, n.name, n.number, dmy(n.at), 'C', place(n.pos), 'N', 'Regular', k === 0 ? m2(n.value) : null, '', it.rate, m2(it.taxable), m2(it.cess), n.billNumber, dmy(n.billAt)]));
  const cdnur: Cell[][] = [head('UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'Against Invoice', 'Invoice Date')];
  for (const n of g.cdnur) n.items.forEach((it, k) => cdnur.push([n.urType ?? 'B2CL', n.number, dmy(n.at), 'C', place(n.pos), k === 0 ? m2(n.value) : null, '', it.rate, m2(it.taxable), m2(it.cess), n.billNumber, dmy(n.billAt)]));
  const cnc: Cell[][] = [head('Note Number', 'Note Date', 'Place Of Supply', 'Note Value', 'Rate', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess Amount', 'Against Invoice', 'Invoice Date')];
  for (const n of g.cnAgainstB2cs) n.items.forEach((it, k) => cnc.push([n.number, dmy(n.at), place(n.pos), k === 0 ? m2(n.value) : null, it.rate, m2(it.taxable), m2(it.igst), m2(it.cgst), m2(it.sgst), m2(it.cess), n.billNumber, dmy(n.billAt)]));
  const exemp: Cell[][] = [head('Description', 'Nil Rated Supplies', 'Exempted (Other than Nil rated/non GST supply )', 'Non-GST Supplies'), ...g.nil.map((n): Cell[] => [n.label, m2(n.nil), m2(0), m2(0)])];
  const hsn = (rows: Gstr1HsnRow[]): Cell[][] => [head('HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'),
    ...rows.map((r): Cell[] => [r.hsn, r.desc, r.uqc, Math.round(r.qty) / 1000, m2(r.value), r.rate, m2(r.taxable), m2(r.igst), m2(r.cgst), m2(r.sgst), m2(r.cess)])];
  const docs: Cell[][] = [head('Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'), ...g.docs.map((d): Cell[] => [d.label, d.from, d.to, d.total, d.cancelled])];
  const w = (...n: number[]) => n;
  return [
    { name: 'Summary', rows: sum, widths: w(46, 12, 16, 14, 14, 14, 12) },
    { name: 'b2b', rows: b2b, widths: w(18, 24, 16, 12, 14, 24, 10, 12, 10, 14, 8, 14, 12) },
    { name: 'b2cl', rows: b2cl, widths: w(16, 12, 14, 24, 12, 8, 14, 12, 14) },
    { name: 'b2cs', rows: b2cs, widths: w(8, 24, 12, 8, 14, 12, 14) },
    { name: 'cdnr', rows: cdnr, widths: w(18, 24, 16, 12, 8, 24, 10, 12, 14, 12, 8, 14, 12, 16, 12) },
    { name: 'cdnur', rows: cdnur, widths: w(10, 16, 12, 8, 24, 14, 12, 8, 14, 12, 16, 12) },
    { name: 'Credit notes (consumers)', rows: cnc, widths: w(16, 12, 24, 14, 8, 14, 12, 12, 12, 12, 16, 12) },
    { name: 'exemp', rows: exemp, widths: w(46, 18, 24, 16) },
    { name: 'hsn(b2b)', rows: hsn(g.hsnB2b), widths: w(10, 40, 8, 14, 14, 8, 14, 16, 16, 16, 12) },
    { name: 'hsn(b2c)', rows: hsn(g.hsnB2c), widths: w(10, 40, 8, 14, 14, 8, 14, 16, 16, 16, 12) },
    { name: 'docs', rows: docs, widths: w(30, 16, 16, 14, 12) },
  ];
}

/* ------------------------------------------------------------------ GSTR-3B */

export interface Gstr3bRow { ref: string; desc: string; taxable?: Paise; igst?: Paise; cgst?: Paise; sgst?: Paise; cess?: Paise; style?: 'head' | 'strong' | 'muted' }
export interface Gstr3b {
  period: GstrFacts['period']; shop: GstrFacts['shop'];
  rows: Gstr3bRow[];
  outward: Heads; nil: Paise; itc: Heads; interUnregistered: { pos: string; taxable: Paise; igst: Paise }[];
  /** Tax to pay: after set-off of input credit, in cash (IGST, CGST, SGST) */
  cash: { igst: Paise; cgst: Paise; sgst: Paise; cess: Paise };
  notes: string[];
}

export function buildGstr3b(f: GstrFacts): Gstr3b {
  const outward = zero();
  let nil = 0;
  const inter = new Map<string, { pos: string; taxable: Paise; igst: Paise }>();
  const add = (slabs: GstrSlab[], sign: number, who: { gstin: string; inter: boolean; place: string }) => {
    for (const s of slabs) {
      if (s.rate > 0) {
        addSlab(outward, s, sign);
        if (who.inter && !who.gstin) {
          const r = inter.get(who.place) ?? { pos: who.place, taxable: 0, igst: 0 };
          r.taxable += sign * s.taxable; r.igst += sign * s.igst;
          inter.set(who.place, r);
        }
      } else nil += sign * s.taxable;
    }
  };
  for (const b of f.bills) if (b.status !== 'cancelled') add(b.slabs, 1, b);
  for (const n of f.notes) add(n.slabs, -1, n);
  const itc: Heads = { taxable: f.purchases.taxable, igst: f.purchases.igst, cgst: f.purchases.cgst, sgst: f.purchases.sgst, cess: 0 };
  const [ci, cc, cs] = setOff([outward.igst, outward.cgst, outward.sgst], [itc.igst, itc.cgst, itc.sgst]);
  const cash = { igst: ci, cgst: cc, sgst: cs, cess: outward.cess };
  const usedI = Math.max(0, outward.igst) - ci, usedC = Math.max(0, outward.cgst) - cc, usedS = Math.max(0, outward.sgst) - cs;
  const rows: Gstr3bRow[] = [
    { ref: '3.1', desc: 'Outward supplies and inward supplies liable to reverse charge', style: 'head' },
    { ref: '(a)', desc: 'Outward taxable supplies (other than zero rated, nil rated and exempted), after credit notes', taxable: outward.taxable, igst: outward.igst, cgst: outward.cgst, sgst: outward.sgst, cess: outward.cess },
    { ref: '(b)', desc: 'Outward taxable supplies (zero rated)', taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, style: 'muted' },
    { ref: '(c)', desc: 'Other outward supplies (nil rated, exempted)', taxable: nil, igst: 0, cgst: 0, sgst: 0, cess: 0 },
    { ref: '(d)', desc: 'Inward supplies (liable to reverse charge)', taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, style: 'muted' },
    { ref: '(e)', desc: 'Non-GST outward supplies', taxable: 0, style: 'muted' },
    { ref: '3.2', desc: 'Inter-state supplies to unregistered persons, by place of supply', style: 'head' },
    ...[...inter.values()].filter((r) => r.taxable !== 0 || r.igst !== 0).sort((a, b) => a.pos.localeCompare(b.pos)).map((r): Gstr3bRow => ({ ref: '', desc: place(r.pos), taxable: r.taxable, igst: r.igst })),
    { ref: '4', desc: 'Eligible input tax credit (from purchase bills dated in the month)', style: 'head' },
    { ref: '(A)(5)', desc: 'All other ITC', taxable: itc.taxable, igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst, cess: 0 },
    { ref: '(C)', desc: 'Net ITC available', igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst, cess: 0 },
    { ref: '5', desc: 'Exempt, nil rated and non-GST inward supplies', style: 'head' },
    { ref: '', desc: 'Inter-State supplies', taxable: f.purchases.nilInter },
    { ref: '', desc: 'Intra-State supplies', taxable: f.purchases.nilIntra },
    { ref: '6.1', desc: 'Payment of tax', style: 'head' },
    { ref: '', desc: 'Tax payable (output tax after credit notes)', igst: Math.max(0, outward.igst), cgst: Math.max(0, outward.cgst), sgst: Math.max(0, outward.sgst), cess: Math.max(0, outward.cess) },
    { ref: '', desc: 'Paid through input tax credit', igst: usedI, cgst: usedC, sgst: usedS, cess: 0 },
    { ref: '', desc: 'Paid in cash', igst: ci, cgst: cc, sgst: cs, cess: outward.cess, style: 'strong' },
  ];
  return {
    period: f.period, shop: f.shop, rows, outward, nil, itc, interUnregistered: [...inter.values()], cash,
    notes: [
      'Output tax is the tax on the month\'s bills less credit notes. Input credit is taken from the purchase bills of the month.',
      'IGST credit is set off against IGST, then CGST, then SGST; CGST credit against CGST then IGST; SGST credit against SGST then IGST (confirm with CA).',
      'Rule 86B (limit on using credit), interest and late fee are not worked out here (confirm with CA).',
    ],
  };
}

export function gstr3bSheets(g: Gstr3b): Sheet[] {
  const rows: Cell[][] = [
    [{ v: `GSTR-3B ${g.period.month}`, style: 'title' }],
    ['Shop', g.shop.name, 'GSTIN', g.shop.gstin, 'Period', `${g.period.from} to ${g.period.to}`],
    [],
    head('Table', 'Description', 'Taxable value', 'IGST', 'CGST', 'SGST / UTGST', 'Cess'),
    ...g.rows.map((r): Cell[] => (r.style === 'head'
      ? [{ v: r.ref, style: 'head' }, { v: r.desc, style: 'head' }, null, null, null, null, null]
      : [r.ref, r.desc, r.taxable === undefined ? null : m2(r.taxable), r.igst === undefined ? null : m2(r.igst), r.cgst === undefined ? null : m2(r.cgst), r.sgst === undefined ? null : m2(r.sgst), r.cess === undefined ? null : m2(r.cess)])),
    [],
    head('Notes for the CA (confirm with CA)'),
    ...g.notes.map((n): Cell[] => [n]),
  ];
  return [{ name: 'GSTR-3B', rows, widths: [10, 78, 16, 14, 14, 14, 12] }];
}
