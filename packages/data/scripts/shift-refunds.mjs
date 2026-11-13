// Cash refunds come off expected drawer cash: exchange credit paid back in cash, plus cash refunds on returns.
// Same formula as crates/core/src/shift.rs.
//   node packages/data/scripts/shift-refunds.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(tmpdir(), `gokul-shift-${process.pid}.mjs`);
await build({ entryPoints: [resolve(here, '../src/areas/shift.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { createShiftMock } = await import(pathToFileURL(out).href);

const bill = (id, cash, upi = 0, exchangeRefund) => ({
  id, number: id, at: new Date().toISOString(), cashier: 'Karthik', counter: 'Counter 1', customerName: 'Walk-in',
  lines: [], status: 'paid',
  payments: [...(cash ? [{ mode: 'cash', amount: cash }] : []), ...(upi ? [{ mode: 'upi', amount: upi }] : [])],
  totals: { itemCount: 0, qtyCount: 0, gross: cash + upi, discount: 0, taxable: 0, gst: 0, slabs: [], beforeRound: 0, roundOff: 0, grand: cash + upi },
  exchangeRefund,
});

const note = (refundMode, grand) => ({
  at: new Date().toISOString(), refundMode, totals: { grand },
});

const store = () => ({
  items: [], customers: [], suppliers: [], purchases: [], production: [], bills: [], held: [],
  settings: { counter: 'Counter 1' }, users: [{ id: 'u1', name: 'Karthik', role: 'cashier' }], categories: [],
  creditNotes: [],
});

const open = async (s) => {
  const api = createShiftMock(s);
  await api.openDay({ userId: 'u1', counts: { 500: 4 } }); // Rs 2,000 float
  return api;
};

// Cash sale Rs 1,000, cash exchange refund Rs 322, cash return refund Rs 150.
{
  const s = store();
  const api = await open(s);
  s.bills.push(bill('b1', 100000, 0, { mode: 'cash', amount: 32200, creditNote: 'CN-000001' }));
  s.creditNotes.push(note('cash', 15000));
  const x = await api.shiftSummary();
  assert.equal(x.cashRefunds, 47200);
  // 200000 float + 100000 cash sale + 100000 cash in - 31000 cash out - 47200 refunds
  assert.equal(x.expectedCash, 321800, 'cash refunds come off the expected drawer cash');
}

// UPI refunds never touch the drawer: neither the exchange refund nor the return.
{
  const s = store();
  const api = await open(s);
  s.bills.push(bill('b1', 100000, 0, { mode: 'upi', amount: 32200, creditNote: 'CN-000001' }));
  s.creditNotes.push(note('upi', 15000));
  const x = await api.shiftSummary();
  assert.equal(x.cashRefunds, 0);
  assert.equal(x.expectedCash, 369000);
}

// Exchange credit carried forward as a note (refundMode exchange) is not a cash refund.
{
  const s = store();
  const api = await open(s);
  s.creditNotes.push(note('exchange', 25000));
  const x = await api.shiftSummary();
  assert.equal(x.cashRefunds, 0);
  assert.equal(x.expectedCash, 369000);
}

console.log('shift-refunds: ok');
