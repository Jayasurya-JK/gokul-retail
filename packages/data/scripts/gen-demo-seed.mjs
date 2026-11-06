// Generates crates/core/seed/demo.json from packages/data/src/seed.ts so the real database starts with the
// same demo shop as mockApi. Run: node packages/data/scripts/gen-demo-seed.mjs
// The Rust side (crates/core/src/seed_demo.rs) reads that file. Delete both when the demo data is no longer wanted.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../crates/core/seed/demo.json');
const tmp = resolve(tmpdir(), `gokul-seed-${process.pid}.mjs`);

await build({ entryPoints: [resolve(here, '../src/seed.ts')], bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error' });
const seed = await import(pathToFileURL(tmp).href);

// The mock seed has a few fractional-paise costs (e.g. price x 0.82); the real database stores whole paise.
const items = seed.buildItems().map((i) => ({ ...i, mrp: Math.round(i.mrp), price: Math.round(i.price), cost: Math.round(i.cost) }));
const customers = seed.buildCustomers();
const bills = seed.buildBills(items, customers);
const itemIdx = new Map(items.map((i, k) => [i.id, k]));

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const today0 = midnight(new Date());
const daysAgoOf = (iso) => Math.round((today0 - midnight(new Date(iso))) / 86400000);
const secOfDay = (iso) => { const d = new Date(iso); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };

const parseLogin = (s) => {
  let m = /^Today, (\d\d:\d\d)$/.exec(s); if (m) return { d: 0, hm: m[1] };
  m = /^Yesterday, (\d\d:\d\d)$/.exec(s); if (m) return { d: 1, hm: m[1] };
  m = /^(\d+) days? ago$/.exec(s); return { d: m ? Number(m[1]) : 7, hm: '10:00' };
};

const data = {
  settings: seed.settings,
  categories: seed.categories,
  users: seed.users.map((u) => ({ id: u.id, name: u.name, role: u.role, initials: u.initials, color: u.color, pin: u.pin, lastLogin: parseLogin(u.lastLogin) })),
  items,
  customers: customers.map((c) => ({ ...c, lastVisitDays: Number((/^(\d+)/.exec(c.lastVisit) ?? [0, 0])[1]), lastVisit: undefined })),
  // [daysAgo, secondOfDay, cashier, customerId|null, [[itemIndex, qtyMilli]], [[mode, paise, ref|null]]]
  bills: bills.map((b) => [
    daysAgoOf(b.at), secOfDay(b.at), b.cashier, b.customerId ?? null,
    b.lines.map((l) => [itemIdx.get(l.itemId), l.qty]),
    b.payments.map((p) => [p.mode, p.amount, p.ref ?? null]),
    b.totals.grand,
  ]),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`wrote ${out}: ${items.length} items, ${customers.length} customers, ${bills.length} bills`);
