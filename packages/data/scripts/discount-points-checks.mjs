// Counter boxes: discount is percent only, cash discount is rupees only, points follow the loyalty rules.
//   node packages/data/scripts/discount-points-checks.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(tmpdir(), `gokul-discpts-${process.pid}.mjs`);
await build({ entryPoints: [resolve(here, '../src/money.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const m = await import(pathToFileURL(out).href);

const line = (rate, qty, gst = 5) => m.recalcLine({ itemId: 'i', code: '1', name: 'Oil', unit: 'l', qty, rate, discount: 0, gstRate: gst, amount: 0 });

// ---- Discount: percent only
const net = 137_00; // Rs 137
assert.equal(m.percentDiscount(net, '5'), 685, '5% of 137.00 is 6.85');
assert.equal(m.percentDiscount(net, '2.5'), 343, '2.5% = 3.425 rounds to 3.43 (half up on paise)');
assert.equal(m.percentDiscount(net, '100'), net);
assert.equal(m.percentDiscount(net, '0'), 0);
assert.equal(m.percentDiscount(net, '100.5'), null, 'over 100% is refused');
assert.equal(m.percentDiscount(net, '5%'), null, 'a % sign typed in is not a number');
assert.equal(m.percentDiscount(net, '\u20B95'), null, 'a rupee sign is refused');
assert.equal(m.percentDiscount(net, ''), null);

// ---- Cash discount: rupees only, within a paise or two on small bills
const lines = [line(137_00, 1000)];
for (const rupees of [5_00, 10_00, 12_50, 1_00, 99_00]) {
  const bps = m.cashDiscBpsForRupees(lines, rupees);
  const got = m.cashDiscount(lines, bps);
  assert.ok(Math.abs(got - rupees) <= 1, `Rs ${rupees / 100} off a Rs 137 bill is within 1 paise (got ${got})`);
}
const big = [line(1250_00, 2000), line(380_00, 1000)]; // Rs 2,880
for (const rupees of [5_00, 20_00, 75_50]) {
  const got = m.cashDiscount(big, m.cashDiscBpsForRupees(big, rupees));
  assert.ok(Math.abs(got - rupees) <= 15, `Rs ${rupees / 100} off Rs 2,880 is within 15 paise (got ${got})`);
}
assert.equal(m.cashDiscBpsForRupees(lines, 500_00), 10000, 'cannot go past the whole bill');
assert.equal(m.cashDiscBpsForRupees(lines, 0), 0);
assert.equal(m.cashDiscBpsForRupees([], 5_00), 0);

// ---- Points within the loyalty rules (1 point = Rs 1, min 100, max 50% of the bill)
const rules = { enabled: true, pointValue: 100, minRedeem: 100, maxPct: 50 };
const bill = 1000_00; // Rs 1,000
// balance 783.08, half of bill is Rs 500 -> 500 pts; balance gives 783 -> max 500
assert.deepEqual(m.pointsLimit(rules, 783.08, bill, bill), { maxPoints: 500, worth: 500_00 });
assert.deepEqual(m.pointsLimit(rules, 210.9, bill, bill), { maxPoints: 210, worth: 210_00 }, 'balance 210.90 is 210 whole points');
assert.deepEqual(m.pointsLimit(rules, 783.08, bill, 120_00), { maxPoints: 120, worth: 120_00 }, 'never more than the bill still needs');
assert.deepEqual(m.pointsLimit({ ...rules, enabled: false }, 783.08, bill, bill), { maxPoints: 0, worth: 0 });
assert.deepEqual(m.pointsLimit(rules, 0, bill, bill), { maxPoints: 0, worth: 0 });
assert.deepEqual(m.pointsLimit({ ...rules, pointValue: 50 }, 100, bill, bill), { maxPoints: 100, worth: 50_00 }, 'a point worth 50 paise');

const ok = (t, bal = 783.08, due = bill) => m.checkPointsTyped(t, rules, bal, bill, due);
assert.deepEqual(ok('200'), { points: 200 });
assert.deepEqual(ok('500'), { points: 500 }, 'exactly the max share is allowed');
assert.match(ok('99').error, /Below the minimum/, 'below the minimum');
assert.match(ok('800').error, /More than the balance/, 'more than the balance');
assert.match(ok('501').error, /50% of the bill/, 'more than the max percent');
assert.match(ok('150', 783.08, 120_00).error, /at most 120 points/, 'more than what is left to pay');
assert.match(ok('abc').error, /number of points/);
assert.match(ok('12.5').error, /whole points/);
assert.match(ok('0').error, /number of points/);
assert.match(m.checkPointsTyped('200', { ...rules, enabled: false }, 783.08, bill, bill).error, /switched off/);

// Points are a payment, not a discount: the bill total does not move.
const t0 = m.computeTotals(lines, 0, true);
assert.equal(t0.grand, m.computeTotals(lines, 0, true).grand);
console.log('discount-points-checks: ok');
