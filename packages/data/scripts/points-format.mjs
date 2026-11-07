// Points are shown with two decimals everywhere: 7856 hundredths is "78.56", never "7856".
//   node packages/data/scripts/points-format.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(tmpdir(), `gokul-points-${process.pid}.mjs`);
await build({ entryPoints: [resolve(here, '../src/printed.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { formatPoints, formatPointsHundredths } = await import(pathToFileURL(out).href);

assert.equal(formatPoints(78.56), '78.56');
assert.equal(formatPoints(12), '12.00', 'whole points still show two decimals');
assert.equal(formatPoints(4.6), '4.60');
assert.equal(formatPoints(0), '0.00');
assert.equal(formatPoints(-2.5), '-2.50');
assert.equal(formatPoints(116383.98), '1,16,383.98', 'Indian grouping');
assert.equal(formatPointsHundredths(7856), '78.56', 'the raw database value is never shown as 7856');
assert.equal(formatPointsHundredths(5), '0.05');
assert.equal(formatPoints(Number.NaN), '0.00');
console.log('points-format: ok');
