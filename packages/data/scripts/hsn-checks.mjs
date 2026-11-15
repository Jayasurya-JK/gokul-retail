// The HSN helper's matcher in TypeScript must give the same answers as the Rust core on the shared cases
// (packages/data/src/hsn/match_cases.json, also asserted by `cargo test -p gokul-core --test hsn`).
//
//   node packages/data/scripts/hsn-checks.mjs
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(tmpdir(), `gokul-hsn-${process.pid}.mjs`);
const src = resolve(here, '../src/areas/hsn.ts').split(String.fromCharCode(92)).join('/');
await build({ stdin: { contents: `export * from '${src}';`, resolveDir: here, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error' });
const m = await import(pathToFileURL(tmp).href);
const { cases } = JSON.parse(readFileSync(resolve(here, '../src/hsn/match_cases.json'), 'utf8'));
assert.ok(cases.length >= 70);
for (const c of cases) {
  const got = m.suggestHsnFor(c.name);
  if (c.hsn === null) { assert.equal(got, null, `${c.name}: expected no suggestion`); continue; }
  assert.ok(got, `${c.name}: no suggestion`);
  assert.deepEqual([got.hsn, got.confidence, got.matched], [c.hsn, c.confidence, c.matched], c.name);
  assert.deepEqual(got.alternatives.map((a) => a.hsn), c.alt, `${c.name}: alternatives`);
  if ('rate' in c) assert.equal(got.rate, c.rate, `${c.name}: rate`);
}
assert.equal(m.hsnOk('1508'), true);
assert.equal(m.hsnOk('150810'), true);
assert.equal(m.hsnOk('15081000'), true);
assert.equal(m.hsnOk('150'), false);
assert.equal(m.hsnOk('NONE'), false);
console.log(`hsn checks OK: ${cases.length} cases match the Rust core`);
