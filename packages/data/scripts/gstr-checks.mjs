// GSTR-1 and GSTR-3B built from facts: the sections, the JSON and the Excel sheets must reconcile exactly with the bills.
//
//   node packages/data/scripts/gstr-checks.mjs                 builds a month in the mock shop (intra, inter, B2B, B2CL, returns, a cancelled bill)
//   node packages/data/scripts/gstr-checks.mjs <facts.json>    also checks facts written by the Rust core
//                                                              (GOKUL_GSTR_FACTS_OUT=<file> cargo test -p gokul-core --test gst_returns_facts)
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(tmpdir(), `gokul-gstr-${process.pid}.mjs`);
const src = (f) => resolve(here, '../src', f).split(String.fromCharCode(92)).join('/');
await build({
  stdin: { contents: `export * from '${src('gstr.ts')}'; export * from '${src('xlsx.ts')}'; export * from '${src('money.ts')}'; export { createMockApi } from '${src('mockApi.ts')}';`, resolveDir: here, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error',
});
const m = await import(pathToFileURL(tmp).href);

const sumSlabs = (bills, k) => bills.reduce((s, b) => s + b.slabs.reduce((t, x) => t + x[k], 0), 0);

/** Everything that must hold for one month of facts. */
async function verify(f, label) {
  const g = m.buildGstr1(f);
  const live = f.bills.filter((b) => b.status !== 'cancelled');
  const t = g.totals;
  // the sales totals are the bills' slabs
  for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess']) assert.equal(t.sales[k], sumSlabs(live, k), `${label}: sales ${k}`);
  assert.equal(t.sales.grand, live.reduce((s, b) => s + b.grand, 0), `${label}: invoice value`);
  assert.equal(t.invoices, live.length);
  assert.equal(t.cancelled, f.bills.length - live.length);
  // every internal check holds
  for (const c of g.checks) assert.ok(c.ok, `${label}: ${c.label} (${c.a} vs ${c.b})`);
  // sections
  assert.equal(g.b2b.length, live.filter((b) => b.gstin && b.slabs.some((s) => s.rate > 0)).length, `${label}: b2b invoices`);
  assert.ok(g.b2cl.every((i) => i.value > m.B2CL_THRESHOLD), `${label}: B2CL are above the threshold`);
  assert.equal(g.b2cl.length, live.filter((b) => !b.gstin && b.inter && b.grand > m.B2CL_THRESHOLD).length, `${label}: b2cl invoices`);
  assert.ok(g.b2cs.every((r) => r.rate > 0), `${label}: no nil rows in B2CS`);
  // credit notes
  assert.equal(g.cdnr.length + g.cdnur.length + g.cnAgainstB2cs.length, f.notes.length, `${label}: every credit note is somewhere`);
  assert.equal(t.credit.taxable, f.notes.reduce((s, n) => s + n.slabs.reduce((x, y) => x + y.taxable, 0), 0));
  // JSON: add the rupee figures back up and compare to the totals
  const j = m.gstr1Json(g);
  const items = (arr) => arr.flatMap((x) => x.itms ?? []);
  const sumItems = (its, k) => its.reduce((s, i) => s + (i.itm_det[k] ?? 0), 0);
  const b2bItems = (j.b2b ?? []).flatMap((c) => c.inv.flatMap((i) => i.itms));
  const b2clItems = (j.b2cl ?? []).flatMap((p) => p.inv.flatMap((i) => i.itms));
  assert.equal(j.gstin, f.shop.gstin);
  assert.equal(j.fp, f.period.fp);
  assert.equal(j.version, m.GSTR1_JSON_VERSION);
  assert.equal(Math.round(sumItems(b2bItems, 'txval') * 100), t.b2b.taxable, `${label}: json b2b taxable`);
  assert.equal(Math.round((sumItems(b2bItems, 'iamt') + sumItems(b2bItems, 'camt') + sumItems(b2bItems, 'samt')) * 100), t.b2b.igst + t.b2b.cgst + t.b2b.sgst, `${label}: json b2b tax`);
  assert.equal(Math.round(sumItems(b2clItems, 'txval') * 100), t.b2cl.taxable, `${label}: json b2cl taxable`);
  assert.equal(Math.round((j.b2cs ?? []).reduce((s, r) => s + r.txval, 0) * 100), t.b2csNet.taxable, `${label}: json b2cs taxable (net of consumer credit notes)`);
  assert.equal(Math.round((j.b2cs ?? []).reduce((s, r) => s + (r.iamt ?? 0) + (r.camt ?? 0) + (r.samt ?? 0), 0) * 100), t.b2csNet.igst + t.b2csNet.cgst + t.b2csNet.sgst, `${label}: json b2cs tax`);
  assert.equal(Math.round(j.nil.inv.reduce((s, r) => s + r.nil_amt, 0) * 100), t.nil.taxable, `${label}: json nil`);
  const cdnrItems = (j.cdnr ?? []).flatMap((c) => c.nt.flatMap((n) => n.itms));
  assert.equal(Math.round(sumItems(cdnrItems, 'txval') * 100), t.cdnr.taxable, `${label}: json cdnr`);
  assert.equal(Math.round(items(j.cdnur ?? []).reduce((s, i) => s + i.itm_det.txval, 0) * 100), t.cdnur.taxable, `${label}: json cdnur`);
  // every invoice item is intra or inter, never both
  for (const it of [...b2bItems, ...b2clItems]) assert.ok(!(it.itm_det.iamt !== undefined && it.itm_det.camt !== undefined), `${label}: an item has IGST and CGST`);
  // invoice numbers are valid (at most 16 characters of letters, digits, - and /)
  for (const i of [...(j.b2b ?? []).flatMap((c) => c.inv), ...(j.b2cl ?? []).flatMap((p) => p.inv)]) assert.match(i.inum, /^[A-Za-z0-9/-]{1,16}$/, `${label}: invoice number ${i.inum}`);
  // HSN: B2B plus B2C = bills less credit notes
  const hsn = (rows) => rows.reduce((s, r) => s + Math.round(r.txval * 100), 0);
  assert.equal(hsn(j.hsn.hsn_b2b) + hsn(j.hsn.hsn_b2c), t.net.taxable, `${label}: json hsn taxable`);
  // document summary: the numbers issued and the cancelled ones
  const docTotal = j.doc_issue.doc_det.filter((d) => d.doc_num === 1).flatMap((d) => d.docs).reduce((s, d) => s + d.totnum, 0);
  assert.equal(docTotal, f.bills.length, `${label}: documents issued`);
  assert.equal(j.doc_issue.doc_det.filter((d) => d.doc_num === 1).flatMap((d) => d.docs).reduce((s, d) => s + d.cancel, 0), f.bills.length - live.length, `${label}: cancelled documents`);
  // Excel: every sheet survives a write and a read, and the summary sheet shows the same totals
  const sheets = m.gstr1Sheets(g);
  const back = await m.readXlsx(m.buildXlsx(sheets));
  assert.deepEqual(back.map((s) => s.name), sheets.map((s) => s.name));
  const summary = back.find((s) => s.name === 'Summary').rows;
  const all = summary.find((r) => r[0] === 'All invoices (Sales report)');
  assert.equal(Math.round(Number(all[2]) * 100), t.sales.taxable, `${label}: excel sales taxable`);
  assert.equal(Number(all[1]), live.length);
  assert.ok(summary.some((r) => r[1] === 'OK') && !summary.some((r) => r[1] === 'DIFFERENT'), `${label}: excel reconciliation shows no difference`);
  const b2bSheet = back.find((s) => s.name === 'b2b').rows;
  assert.equal(b2bSheet.length - 1, g.b2b.reduce((s, i) => s + i.items.length, 0), `${label}: b2b rows`);
  // GSTR-3B
  const r3 = m.buildGstr3b(f);
  const outward = f.bills.filter((b) => b.status !== 'cancelled').reduce((o, b) => { for (const s of b.slabs) if (s.rate > 0) { o.taxable += s.taxable; o.tax += s.cgst + s.sgst + s.igst; } return o; }, { taxable: 0, tax: 0 });
  for (const n of f.notes) for (const s of n.slabs) if (s.rate > 0) { outward.taxable -= s.taxable; outward.tax -= s.cgst + s.sgst + s.igst; }
  assert.equal(r3.outward.taxable, outward.taxable, `${label}: 3B 3.1(a) taxable`);
  assert.equal(r3.outward.igst + r3.outward.cgst + r3.outward.sgst, outward.tax, `${label}: 3B 3.1(a) tax`);
  assert.equal(r3.outward.taxable, t.net.taxable - r3.nil, `${label}: 3B outward + nil = net taxable value`);
  const cashTotal = r3.cash.igst + r3.cash.cgst + r3.cash.sgst;
  assert.ok(cashTotal >= 0 && cashTotal <= Math.max(0, outward.tax), `${label}: cash within the tax payable`);
  const back3 = await m.readXlsx(m.buildXlsx(m.gstr3bSheets(r3)));
  assert.equal(back3[0].name, 'GSTR-3B');
  assert.ok(back3[0].rows.some((r) => String(r[1]).startsWith('Paid in cash')));
  return { g, r3 };
}

/* ---- 1. a month in the mock shop ---- */
{
  const api = m.createMockApi();
  const customers = await api.listCustomers();
  const gstins = { '33': '33AAKFG4821M1Z9', '27': '27AAPFU0939F1ZV' };
  const mkCust = async (name, type, gstin, stateCode) => api.saveCustomer({ name, phone: '98400 33333', area: 'X', type, business: type === 'b2b' ? name : undefined, gstin, stateCode, creditLimit: 0 });
  const local = await mkCust('Local Mess', 'b2b', gstins['33']);
  const pune = await mkCust('Pune Traders', 'b2b', gstins['27']);
  const kerala = await mkCust('Kerala Buyer', 'retail', undefined, '32');
  const items = await api.listItems();
  const oil = items.find((i) => i.gstRate === 5), soap = items.find((i) => i.gstRate === 18), zero = items.find((i) => i.gstRate === 0) ?? items.find((i) => i.gstRate === 5);
  const line = (it, qty, rate) => m.makeLine(it, qty, 0, rate ?? it.price);
  const save = async (cust, lines, disc = 0) => {
    const t = m.computeTotals(lines, disc, true, false);
    return api.saveBill({ customerId: cust, lines, billDiscount: disc, payments: [{ mode: 'cash', amount: t.grand }], cashier: 'Karthik' });
  };
  const a = await save(undefined, [line(oil, 2000), line(soap, 1000), line(zero, 1000)], 333);
  const b = await save(kerala.id, [line(oil, 1000), line(soap, 2000)], 100);
  const big = await save(kerala.id, [line(oil, 1000, 12_500_000), line(soap, 500)]);
  const p = await save(pune.id, [line(oil, 3000), line(soap, 1000), line(zero, 2000)], 555);
  const l = await save(local.id, [line(oil, 1000), line(soap, 3000)]);
  const x = await save(undefined, [line(oil, 1000)]);
  await api.cancelBill({ billId: x.id, reason: 'Wrong item', managerPin: '2222', by: 'Lakshmi' });
  const rr = (bill, picks) => api.createReturn({ billId: bill.id, picks, reason: 'Seal broken', refundMode: 'cash', by: 'Lakshmi', managerPin: '2222' });
  await rr(a, [{ lineIndex: 0, qty: 1000 }]);
  await rr(big, [{ lineIndex: 0, qty: 1000 }]);
  await rr(p, [{ lineIndex: 1, qty: 500 }]);
  await rr(l, [{ lineIndex: 0, qty: 1000 }, { lineIndex: 1, qty: 3000 }]);
  assert.equal(a.supplyType, 'intra');
  assert.equal(b.supplyType, 'inter');
  assert.equal(p.customerGstin, gstins['27']);
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const f = await api.getGstrFacts(month);
  assert.ok(f.notes.length >= 4 && f.bills.length >= 6);
  const { g } = await verify(f, 'mock');
  assert.ok(g.b2cl.length >= 1 && g.b2b.length >= 2, 'the month has B2CL and B2B invoices');
  assert.ok(g.totals.sales.igst > 0 && g.totals.sales.cgst > 0, 'IGST and CGST both present');
  assert.ok(g.cdnr.length >= 2 && g.cdnur.length >= 1 && g.cnAgainstB2cs.length >= 1, 'every kind of credit note');
  // the mock customers list is unaffected
  assert.ok(customers.length > 0);
  console.log(`gstr checks OK (mock month ${month}: ${f.bills.length} bills, ${f.notes.length} credit notes, ${g.b2b.length} B2B, ${g.b2cl.length} B2CL)`);
}

/* ---- 2. facts written by the Rust core ---- */
if (process.argv[2]) {
  const f = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  await verify(f, 'rust');
  console.log(`gstr checks OK (Rust facts: ${f.bills.length} bills, ${f.notes.length} credit notes)`);
}
