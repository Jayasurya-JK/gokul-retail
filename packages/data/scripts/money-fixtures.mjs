// Shared GST / rounding fixtures. The TypeScript money.ts is the reference; the Rust port in
// crates/core/src/money.rs must give identical results (cargo test reads the same file).
//
//   node packages/data/scripts/money-fixtures.mjs           check: recompute with money.ts and compare to the file
//   node packages/data/scripts/money-fixtures.mjs --write   regenerate crates/core/tests/fixtures/money_cases.json
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '../../../crates/core/tests/fixtures/money_cases.json');
const tmp = resolve(tmpdir(), `gokul-money-${process.pid}.mjs`);

// billops.ts pulls in types only at runtime for quoteReturn; bundle it with money.ts.
await build({
  stdin: {
    contents: `export * from '${resolve(here, '../src/money.ts').replace(/\\/g, '/')}';
               export { quoteReturn } from '${resolve(here, '../src/areas/billops.ts').replace(/\\/g, '/')}';`,
    resolveDir: here, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error',
});
const m = await import(pathToFileURL(tmp).href);

const mkLine = (l, i) => ({
  itemId: `i${i}`, code: String(i), name: `Item ${i}`, unit: 'pc',
  qty: l.qty, rate: l.rate, discount: l.discount, gstRate: l.gstRate, ...(l.cessRate ? { cessRate: l.cessRate } : {}), amount: 0,
});
const solve = (c) => {
  const lines = c.lines.map(mkLine).map(m.recalcLine);
  const inter = !!c.inter;
  const totals = m.computeTotals(lines, c.billDiscount, c.round, inter);
  const out = { lines: lines.map((l) => ({ discount: l.discount, amount: l.amount })), totals };
  if (c.kind === 'return') {
    const bill = { lines, totals };
    const q = m.quoteReturn(bill, c.picks, c.round, inter);
    out.ret = { lines: q.lines.map((l) => ({ qty: l.qty, amount: l.amount, discount: l.discount })), totals: q.totals };
  }
  return out;
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildInputs() {
  const cases = [];
  const L = (rate, qty, gstRate, discount = 0, cessRate = 0) => ({ rate, qty, gstRate, discount, ...(cessRate ? { cessRate } : {}) });
  const add = (name, lines, billDiscount = 0, round = true, picks, inter = false) =>
    cases.push({ name, kind: picks ? 'return' : 'totals', round, billDiscount, lines, ...(picks ? { picks } : {}), ...(inter ? { inter: true } : {}) });

  // Hand-picked edge cases
  add('single pack 5%', [L(36000, 1000, 5)]);
  add('half paise gross (rate 105 x 0.5)', [L(105, 500, 5)], 0, false);
  add('half paise gross (rate 1 x 0.5)', [L(1, 500, 0)], 0, false);
  add('gst half-paise taxable', [L(10500, 1000, 5), L(10500, 1000, 12)], 0, false);
  add('round-off half rupee up', [L(12350, 1000, 0)]);
  add('round-off 49 paise down', [L(12349, 1000, 0)]);
  add('round-off 50 paise up', [L(12350, 1000, 0), L(100, 1000, 0)], 0, true);
  add('no round-off', [L(12350, 1000, 12)], 0, false);
  add('loose oil 1.250 L', [L(36000, 1250, 5)]);
  add('loose oil 0.375 L', [L(54000, 375, 5)]);
  add('loose oil 0.001 L', [L(54000, 1, 5)]);
  add('line discount', [L(36000, 2000, 5, 5000)]);
  add('discount above gross is capped', [L(1000, 1000, 5, 99999)]);
  add('bill discount spread pro rata', [L(10000, 1000, 5), L(20000, 1000, 12), L(3333, 3000, 0)], 1000);
  add('bill discount remainder to last line', [L(3333, 1000, 18), L(3333, 1000, 18), L(3333, 1000, 18)], 100);
  add('bill discount above net is capped', [L(1000, 1000, 5)], 999999);
  add('zero-priced line', [L(0, 1000, 5), L(5000, 1000, 5)], 100);
  add('all slabs', [L(10000, 1000, 0), L(10000, 1000, 5), L(10000, 1000, 12), L(10000, 1000, 18)], 777);
  add('odd gst split', [L(10001, 1000, 5)], 0, false);
  add('big bill', [L(2400000, 1500, 5), L(78000, 3250, 5), L(110000, 750, 12)], 12345);
  add('single line return half', [L(36000, 2000, 5)], 0, true, [{ lineIndex: 0, qty: 1000 }]);
  add('partial return with bill discount', [L(10000, 3000, 5), L(2500, 4000, 12)], 1500, true, [{ lineIndex: 0, qty: 1000 }, { lineIndex: 1, qty: 1500 }]);
  add('return full line', [L(10000, 1000, 5), L(2500, 1000, 12)], 700, true, [{ lineIndex: 1, qty: 1000 }]);
  add('return qty above sold is capped', [L(10000, 1000, 5)], 0, true, [{ lineIndex: 0, qty: 5000 }]);
  add('return with line discount', [L(10000, 3000, 5, 1111)], 0, true, [{ lineIndex: 0, qty: 1000 }]);

  // Pseudo-random cases (fixed seed, so the file is stable)
  const r = rng(20261106);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  for (let i = 0; i < 600; i++) {
    const n = 1 + Math.floor(r() * 8);
    const lines = [];
    for (let k = 0; k < n; k++) {
      const rate = 100 + Math.floor(r() * 500000);
      const qty = r() < 0.5 ? (1 + Math.floor(r() * 12)) * 500 : 1 + Math.floor(r() * 50000);
      const gross = Math.round((rate * qty) / 1000);
      const discount = r() < 0.3 ? Math.floor(r() * gross * 0.3) : 0;
      lines.push(L(rate, qty, pick([0, 5, 12, 18]), discount));
    }
    const billDiscount = r() < 0.35 ? Math.floor(r() * 20000) : 0;
    const round = r() < 0.8;
    let picks;
    if (i % 3 === 0) {
      picks = [];
      for (let k = 0; k < lines.length; k++) if (r() < 0.6) picks.push({ lineIndex: k, qty: 1 + Math.floor(r() * lines[k].qty) });
      if (!picks.length) picks.push({ lineIndex: 0, qty: 1 + Math.floor(r() * lines[0].qty) });
    }
    add(`random ${i}`, lines, billDiscount, round, picks);
  }

  // GST 2.0 rates, special rates, cess and inter-state (IGST) supply. Added after the original cases so those stay unchanged.
  add('40% line', [L(14000, 1000, 40)], 0, false);
  add('0.25% special rate', [L(1000000, 1000, 0.25)], 0, false);
  add('3% special rate odd split', [L(10001, 1000, 3)], 0, false);
  add('cess 12 on 28', [L(100000, 1000, 28, 0, 12)], 0, false);
  add('cess 5 on 5 odd paise', [L(10001, 3000, 5, 0, 5)], 0, false);
  add('cess with bill discount', [L(50000, 1000, 28, 0, 12), L(30000, 1000, 5, 0, 1.5)], 777);
  add('all main slabs 0 5 18 40', [L(10000, 1000, 0), L(10000, 1000, 5), L(10000, 1000, 18), L(10000, 1000, 40)], 333);
  add('inter-state 5%', [L(36000, 1000, 5)], 0, true, undefined, true);
  add('inter-state mixed with discount', [L(10000, 1000, 5), L(20000, 1000, 18), L(3333, 3000, 0), L(7777, 1000, 40)], 1234, true, undefined, true);
  add('inter-state odd paise', [L(10001, 1000, 5), L(10001, 1000, 5)], 0, false, undefined, true);
  add('inter-state return', [L(10000, 3000, 5), L(2500, 4000, 18)], 1500, true, [{ lineIndex: 0, qty: 1000 }, { lineIndex: 1, qty: 1500 }], true);
  add('intra-state return with cess', [L(50000, 2000, 28, 0, 12)], 0, true, [{ lineIndex: 0, qty: 1000 }]);
  const r2 = rng(20251002);
  const pick2 = (arr) => arr[Math.floor(r2() * arr.length)];
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(r2() * 6);
    const lines = [];
    for (let k = 0; k < n; k++) {
      const rate = 100 + Math.floor(r2() * 300000);
      const qty = r2() < 0.5 ? (1 + Math.floor(r2() * 12)) * 500 : 1 + Math.floor(r2() * 20000);
      const gross = Math.round((rate * qty) / 1000);
      const discount = r2() < 0.25 ? Math.floor(r2() * gross * 0.3) : 0;
      const cess = r2() < 0.2 ? pick2([1, 1.5, 5, 12, 21]) : 0;
      lines.push(L(rate, qty, pick2([0, 0.25, 3, 5, 12, 18, 28, 40]), discount, cess));
    }
    const billDiscount = r2() < 0.35 ? Math.floor(r2() * 20000) : 0;
    let picks;
    if (i % 3 === 0) {
      picks = [];
      for (let k = 0; k < lines.length; k++) if (r2() < 0.6) picks.push({ lineIndex: k, qty: 1 + Math.floor(r2() * lines[k].qty) });
      if (!picks.length) picks.push({ lineIndex: 0, qty: 1 + Math.floor(r2() * lines[0].qty) });
    }
    add(`gst2 random ${i}`, lines, billDiscount, r2() < 0.8, picks, r2() < 0.4);
  }
  return cases;
}

if (process.argv.includes('--write')) {
  const cases = buildInputs().map((c) => ({ ...c, expect: solve(c) }));
  writeFileSync(file, JSON.stringify({ note: 'Generated by packages/data/scripts/money-fixtures.mjs from money.ts. Do not edit by hand.', cases }));
  console.log(`wrote ${cases.length} cases to ${file}`);
} else {
  const { cases } = JSON.parse(readFileSync(file, 'utf8'));
  let bad = 0;
  for (const c of cases) {
    if (!isDeepStrictEqual(solve(c), c.expect)) {
      bad++;
      if (bad <= 5) console.error(`MISMATCH: ${c.name}`);
    }
  }
  if (bad) { console.error(`${bad} of ${cases.length} money fixtures differ from money.ts`); process.exit(1); }
  console.log(`money fixtures OK: ${cases.length} cases match money.ts`);
}
