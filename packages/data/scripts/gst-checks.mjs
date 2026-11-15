// GST rules that must agree between the TypeScript mock (packages/data) and the Rust core (crates/core).
// The same cases are asserted in crates/core/src/invoice.rs, crates/core/src/gst.rs and crates/core/tests/gst_*.rs.
//
//   node packages/data/scripts/gst-checks.mjs
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(tmpdir(), `gokul-gst-${process.pid}.mjs`);
const src = (f) => resolve(here, '../src', f).replaceAll(String.fromCharCode(92), '/');
await build({
  stdin: { contents: `export * from '${src('words.ts')}'; export * from '${src('gst.ts')}'; export * from '${src('invoice.ts')}'; export * from '${src('money.ts')}';`, resolveDir: here, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error',
});
const m = await import(pathToFileURL(tmp).href);

// amounts in words (Indian system)
assert.equal(m.amountInWords(0), 'Rupees Zero Only');
assert.equal(m.amountInWords(100), 'Rupees One Only');
assert.equal(m.amountInWords(5), 'Rupees Zero and Five Paise Only');
assert.equal(m.amountInWords(123_456), 'Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only');
assert.equal(m.amountInWords(10_000_000), 'Rupees One Lakh Only');
assert.equal(m.amountInWords(12_345_678_900), 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
assert.equal(m.amountInWords(100_000_000_000), 'Rupees One Hundred Crore Only');
assert.equal(m.amountInWords(-5_000), 'Minus Rupees Fifty Only');

// GSTIN: pattern, state code, check character, state match
assert.equal(m.gstinProblem('33EAEPK8839P2ZX'), null);
assert.equal(m.gstinProblem('27aapfu0939f1zv'), null);
assert.equal(m.gstinCheckChar('27AAPFU0939F1Z'), 'V');
assert.equal(m.gstinCheckChar('33EAEPK8839P2Z'), 'X');
assert.match(m.gstinProblem('33EAEPK8839P2ZY'), /should be X/);
assert.match(m.gstinProblem('33EAEPK8839P2Z'), /15/);
assert.match(m.gstinProblem('33EAEPK8839P2QX'), /pattern/);
assert.ok(m.gstinProblem('NONE'));
assert.match(m.gstinProblem('50AAPFU0939F1Z' + m.gstinCheckChar('50AAPFU0939F1Z')), /not a GST state code/);
assert.match(m.gstinProblem('27AAPFU0939F1ZV', '33'), /Maharashtra/);
assert.equal(m.gstinProblem('27AAPFU0939F1ZV', '27'), null);

// place of supply
assert.deepEqual(m.supplyFor('33', undefined), { place: '33', inter: false, gstin: '' });
assert.deepEqual(m.supplyFor('33', { stateCode: '32' }), { place: '32', inter: true, gstin: '' });
assert.deepEqual(m.supplyFor('33', { gstin: '27AAPFU0939F1ZV' }), { place: '27', inter: true, gstin: '27AAPFU0939F1ZV' });
assert.deepEqual(m.supplyFor('33', { gstin: 'NONE' }), { place: '33', inter: false, gstin: '' });
assert.deepEqual(m.supplyFor('33', undefined, '29'), { place: '29', inter: true, gstin: '' });
assert.equal(m.supplyFor('33', { stateCode: '32' }, '33').inter, false);

// set-off of input credit
assert.deepEqual(m.setOff([0, 100, 100], [0, 30, 30]), [0, 70, 70]);
assert.deepEqual(m.setOff([50, 100, 100], [80, 0, 0]), [0, 70, 100]);
assert.deepEqual(m.setOff([40, 0, 0], [0, 10, 10]), [20, 0, 0]);
assert.deepEqual(m.setOff([-5, 10, 10], [0, 0, 0]), [0, 10, 10]);

// the rate list
assert.deepEqual([...m.DEFAULT_GST_RATES], [0, 0.25, 3, 5, 12, 18, 28, 40]);
assert.equal(m.rateOk(0.25), true);
assert.equal(m.rateOk(0.255), false);
assert.equal(m.rateOk(101), false);

// bill of supply only when every line is exempt; a mixed cart is a tax invoice
const line = (gstRate, rate = 10_000) => ({ itemId: 'i', code: '1', name: 'x', unit: 'pc', qty: 1000, rate, discount: 0, gstRate, amount: rate });
const totalsOf = (lines) => m.computeTotals(lines, 0, false);
assert.equal(m.isBillOfSupply([line(0), line(0)], totalsOf([line(0), line(0)])), true);
assert.equal(m.isBillOfSupply([line(0), line(5)], totalsOf([line(0), line(5)])), false);
assert.equal(m.isBillOfSupply([{ ...line(0), cessRate: 12 }], totalsOf([{ ...line(0), cessRate: 12 }])), false);

// HSN and rate wise summary adds the saved line taxes
const lines = m.computeBill([line(5), line(5), line(18)], 0, false, false).taxes.map((t, i) => ({ ...[line(5), line(5), line(18)][i], hsn: i === 2 ? '3401' : '1508', tax: t }));
const sum = m.hsnSummary(lines);
assert.equal(sum.length, 2);
assert.equal(sum[0].hsn, '1508');
assert.equal(sum[0].taxable, lines[0].tax.taxable + lines[1].tax.taxable);
assert.equal(sum[0].cgst + sum[0].sgst, lines[0].tax.cgst + lines[0].tax.sgst + lines[1].tax.cgst + lines[1].tax.sgst);
console.log('gst checks OK');
