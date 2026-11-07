// End-to-end test of the REAL Gokul POS and Office (Tauri + SQLite) driven like a cashier.
//   node tools/e2e/e2e.mjs
// Needs target/release/gokul-pos.exe and gokul-office.exe (cd apps/pos && npx tauri build --no-bundle; same in apps/office).
// It also runs the Office flow (item with 2 barcodes -> POS sale -> purchase -> adjustment -> pressing/packing -> Bills -> collection -> GSTR-1).
// It moves the shop database (%APPDATA%\GokulRetail\gokul.db) aside first and leaves a fresh demo DB behind.
// Screenshots go to docs/design/shots/e2e-*.png. The WebView console is checked for errors.
import path from 'node:path';
import fs from 'node:fs';
import { freshDb, launch, killApps, shot, press, type, bodyText, sleep, q, step, expect, summary, rpc, DB_DIR } from './lib.mjs';

freshDb();
let { page, errors } = await launch('pos');
await sleep(2000);

const on = (route) => page.url().endsWith('#/' + route);
const waitRoute = async (route) => { for (let i = 0; i < 40; i++) { if (on(route)) return; await sleep(150); } throw new Error(`expected route ${route}, at ${page.url()}`); };
const has = async (t) => (await bodyText(page)).toLowerCase().includes(t.toLowerCase());
const waitText = async (t, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await has(t)) return; await sleep(100); } throw new Error(`text not shown: ${t}`); };
const lastBill = () => q('SELECT * FROM bills ORDER BY id DESC LIMIT 1')[0];
const stockOf = (code) => q('SELECT stock FROM items WHERE code=?', code)[0].stock;
const billCount = () => q('SELECT COUNT(*) n FROM bills')[0].n;
const scanTo = async (t) => { await type(page, t); await press(page, 'Enter', 250); };
const login = async (pin) => { await waitRoute('login'); await type(page, pin); };
/** The backend asked for a manager's PIN (discount over the limit, refund, cash out ...): type it into the approval box. */
const approve = async (pin = '2222') => { await waitText('Manager approval'); await type(page, pin); await press(page, 'Enter', 900); };
const gnBarrels = () => q("SELECT COALESCE(SUM(level_ml),0) s FROM barrels WHERE oil_name='Groundnut Oil'")[0].s;
const barrelStart = gnBarrels();
const auditStart = q('SELECT MAX(id) m FROM audit_log')[0].m;
const rpcErr = async (method, ...args) => { try { await rpc(page, method, ...args); return null; } catch (e) { return String(e?.message ?? e); } };

const startStock = {};
for (const c of ['101', '102', '103', '104', '105']) startStock[c] = stockOf(c);
const seedBills = billCount();
const seedLastId = q('SELECT MAX(id) m FROM bills')[0].m;

/* ---------------- login ---------------- */
await step('login: 5 wrong PINs lock that user with a countdown, audited, other users unaffected', async () => {
  await waitRoute('login');
  await press(page, 'ArrowDown', 300); // Divya
  for (let i = 0; i < 5; i++) { await type(page, '0000'); await sleep(750); }
  await waitText('Too many wrong PINs');
  expect(await has('Try again in'), 'no countdown shown');
  await shot(page, '00-lockout');
  const u = q("SELECT id, locked_until FROM users WHERE name LIKE 'Divya%'")[0];
  expect(u && u.locked_until, 'user not locked in the database: ' + JSON.stringify(u));
  expect(q("SELECT COUNT(*) n FROM audit_log WHERE action='lockout'")[0].n === 1, 'lockout not audited');
  await type(page, '4321'); await sleep(900); // the right PIN is refused while locked
  expect(on('login'), 'a locked user got in');
  await press(page, 'ArrowUp', 300); // Karthik is not affected
}, page);
await step('login: wrong PIN shows a friendly message and stays on login', async () => {
  await waitRoute('login');
  await type(page, '9999'); await sleep(300);
  expect(await has('Wrong PIN'), 'no wrong-PIN message');
  await shot(page, '00-wrong-pin');
  await sleep(700);
  expect(on('login'), 'left login');
}, page);
await step('login: Esc clears typed digits, Karthik 1234 gets in', async () => {
  await type(page, '12'); await press(page, 'Escape'); await type(page, '1234'); await waitRoute('day-open');
}, page);

/* ---------------- day open ---------------- */
await step('day open: F3 usual float then F12 starts the day', async () => {
  await press(page, 'F3'); await waitText('2,000');
  await shot(page, '01-day-open');
  await press(page, 'F12', 600); await waitRoute('billing');
  const s = q('SELECT * FROM shifts WHERE closed_at IS NULL')[0];
  expect(s && s.opening_cash === 200000, 'shift/opening cash wrong: ' + JSON.stringify(s));
}, page);

/* ---------------- billing ---------------- */
await step('billing: unknown code shows a friendly message, no crash', async () => {
  await scanTo('99999'); await waitText('Item not found: 99999');
  await press(page, 'Escape');
}, page);
await step('billing: loose item by code + weight 2.5', async () => {
  await scanTo('101'); await sleep(200);
  await type(page, '2.5'); await press(page, 'Enter', 300);
  expect(await has('Groundnut Oil (Loose)'), 'line not shown');
}, page);
await step('billing: barcode scan (item 102)', async () => { await scanTo('8904000001024'); expect(await has('Groundnut Oil 200 ml'), 'line missing'); }, page);
await step('billing: typing "gro" in the scan box shows the type-ahead dropdown with the Groundnut items (real backend)', async () => {
  await type(page, 'gro'); await sleep(700);
  expect(await page.locator('[role=listbox]').count() === 1, 'no type-ahead dropdown for "gro"');
  const t = await page.locator('[role=listbox]').innerText();
  expect(/Groundnut Oil \(Loose\)/.test(t) && /Groundnut Oil 200 ml/.test(t) && /Groundnut Oil 500 ml/.test(t), 'dropdown does not list the Groundnut items: ' + t.slice(0, 200));
  await shot(page, '01b-typeahead-gro');
  await press(page, 'Escape', 300); // closes the list
  for (let i = 0; i < 3; i++) await press(page, 'Backspace', 80);
  expect(await page.locator('[role=listbox]').count() === 0, 'list did not close');
}, page);
await step('billing: type-ahead "gr" + Enter adds the top suggestion', async () => {
  await type(page, 'gr'); await sleep(400); await shot(page, '02-typeahead'); await press(page, 'Enter', 300);
  await type(page, '1'); await press(page, 'Enter', 300); // top match is a loose item: it asks for the weight
}, page);
await step('billing: qty x code (3*103)', async () => { await scanTo('3*103'); expect(await has('Groundnut Oil 500 ml'), 'line missing'); }, page);
await step('billing: F4 qty change then Ctrl+D line discount 10%', async () => {
  await press(page, 'F4'); await sleep(100); await type(page, '4'); await press(page, 'Enter', 250);
  await press(page, 'Control+d'); await sleep(100); await type(page, '10%'); await press(page, 'Enter', 250);
  await shot(page, '03-billing-lines');
}, page);
await step('billing: F6 hold then Shift+F6 recall', async () => {
  await press(page, 'F6', 500); await waitText('Bill held');
  expect(q('SELECT COUNT(*) n FROM held_bills WHERE recalled_at IS NULL')[0].n === 1, 'held bill not saved');
  await press(page, 'Shift+F6', 500); await waitText('Held bills'); await press(page, 'Enter', 600);
  await waitText('Held bill restored');
  expect(q('SELECT COUNT(*) n FROM held_bills WHERE recalled_at IS NULL')[0].n === 0, 'held bill still open');
  expect(await has('Groundnut Oil 500 ml'), 'lines not back');
}, page);
let bill1;
await step('billing: F12 pay cash with change saves the bill', async () => {
  await press(page, 'F12', 500); await waitText('Amount to pay');
  await shot(page, '04-payment');
  await type(page, '5000'); await sleep(200); await waitText('Change to give back');
  await press(page, 'Enter', 800);
  await shot(page, '04b-manager-pin-for-discount');
  await approve(); // Karthik gave 10 percent; his limit is 2 percent, so the backend asks for a manager PIN
  await waitText('saved');
  bill1 = lastBill();
  expect(q("SELECT COUNT(*) n FROM audit_log WHERE action='override' AND by_name LIKE 'Karthik%'")[0].n === 1, 'override not audited');
  expect(billCount() === seedBills + 1, 'bill not in DB');
  const pays = q('SELECT mode, amount FROM bill_payments WHERE bill_id=?', bill1.id);
  expect(pays.length === 1 && pays[0].mode === 'cash' && pays[0].amount === bill1.grand, 'payment wrong ' + JSON.stringify(pays));
  expect(stockOf('102') === startStock['102'] - 1000, 'stock 102 not reduced: ' + stockOf('102'));
  expect(stockOf('103') === startStock['103'] - 4000, 'stock 103 not reduced (qty 4): ' + stockOf('103'));
  expect(stockOf('101') === startStock['101'] - 3500, 'loose stock not reduced: ' + stockOf('101'));
  const drawn = Math.min(startStock['101'] - stockOf('101'), barrelStart); // both loose Groundnut lines of the bill: 2.5 L + 1 L
  expect(gnBarrels() === barrelStart - drawn, `loose sale did not move the barrel level: ${barrelStart} -> ${gnBarrels()} (expected -${drawn})`);
  expect(q('SELECT COALESCE(SUM(qty_ml),0) s FROM barrel_movements WHERE bill_id=?', bill1.id)[0].s === -drawn, 'barrel ledger rows for the bill');
  console.log('   ', bill1.number, JSON.stringify(q('SELECT code,qty,rate,discount,amount FROM bill_lines WHERE bill_id=?', bill1.id)), 'payment', JSON.stringify(pays));
}, page);
let bill2;
await step('billing: split cash + UPI', async () => {
  await scanTo('104'); await scanTo('105'); await press(page, 'F12', 500);
  await type(page, '100'); await press(page, 'Enter', 400);
  await waitText('Balance to pay');
  await press(page, 'F2', 300); await shot(page, '05-split');
  await press(page, 'Enter', 800); await waitText('saved');
  bill2 = lastBill();
  const pays = q('SELECT mode, amount FROM bill_payments WHERE bill_id=? ORDER BY id', bill2.id);
  expect(pays.length === 2 && pays[0].mode === 'cash' && pays[0].amount === 10000 && pays[1].mode === 'upi', 'split wrong ' + JSON.stringify(pays));
}, page);
await step('billing: Esc with items asks to cancel, Esc keeps the bill', async () => {
  await scanTo('102'); await press(page, 'Escape', 300); await waitText('Cancel this bill?'); await press(page, 'Escape', 300);
  expect(!(await has('Cancel this bill?')), 'dialog still open'); expect(await has('Groundnut Oil 200 ml'), 'line lost');
  await press(page, 'Delete', 300); // empty the bill again
}, page);
await shot(page, '06-after-billing');

/* ---------------- restart: bills and stock survive ---------------- */
const stockBefore = { 101: stockOf('101'), 102: stockOf('102'), 103: stockOf('103'), 104: stockOf('104'), 105: stockOf('105') };
await step('restart: app closed and reopened, bills are still there (Bills, Alt+4) and stock stayed down', async () => {
  await sleep(500);
  killApps(); await sleep(1500);
  ({ page, errors } = await launch('pos')); await sleep(2000);
  expect(billCount() === seedBills + 2, 'bills lost on restart');
  await login('1234'); await waitRoute('billing');
  await press(page, 'Alt+4', 800); await waitRoute('sales');
  expect(await has(bill1.number) && await has(bill2.number), 'saved bills not listed on the Sales screen');
  await shot(page, '07-history');
  for (const c of Object.keys(stockBefore)) expect(stockOf(c) === stockBefore[c], 'stock changed over restart ' + c);
}, page);
await step('restart: stock numbers shown in item search match the database', async () => {
  await press(page, 'Escape', 500); await waitRoute('billing');
  await press(page, 'Control+f', 500); await type(page, '103'); await sleep(400);
  const s = stockOf('103') / 1000;
  expect(await has(String(s)), `search does not show stock ${s}`);
  await shot(page, '08-search-stock');
  await press(page, 'Escape', 300);
}, page);

/* ---------------- history: reprint, cancel ---------------- */
await step('sales: Enter reprints (recorded), cancel with wrong then right manager PIN', async () => {
  await press(page, 'Alt+4', 800); await waitRoute('sales');
  await press(page, 'Enter', 500); await waitText('Duplicate copy');
  expect(q('SELECT COUNT(*) n FROM bill_reprints')[0].n === 1, 'reprint not recorded');
  await press(page, 'ArrowDown', 300); // newest first: the second row is bill 1
  await press(page, 'F6', 500); await waitText('Manager or owner PIN');
  await type(page, '0000'); await press(page, 'Enter', 600);
  expect(await has('PIN') && q('SELECT COUNT(*) n FROM bill_cancellations')[0].n === 0, 'wrong PIN cancelled the bill!');
  await shot(page, '09-cancel-wrong-pin');
  await type(page, '2222'); await press(page, 'Enter', 800);
  expect(q('SELECT COUNT(*) n FROM bill_cancellations')[0].n === 1, 'cancel not stored');
  const st = q("SELECT number,status FROM bills WHERE status='cancelled'");
  console.log('   cancelled', JSON.stringify(st));
  expect(st[0].number === bill1.number, 'wrong bill cancelled');
  expect(stockOf('103') === startStock['103'], 'stock not put back by the cancel: ' + stockOf('103'));
  expect(gnBarrels() === barrelStart, 'cancel did not put the loose oil back in the barrel: ' + gnBarrels());
  await shot(page, '10-cancelled');
}, page);

/* ---------------- server-side permissions (the cashier is signed in) ---------------- */
await step('permissions: a cashier cannot cancel, refund, adjust stock or edit users by calling the backend directly', async () => {
  const b = q("SELECT id, number, status FROM bills WHERE number=?", bill2.number)[0];
  const id = 'b' + b.id;
  let e = await rpcErr('cancelBill', { billId: id, reason: 'Duplicate bill', managerPin: '', by: 'Suresh' });
  expect(e && /manager PIN is needed/i.test(e), 'cancel without PIN was not refused: ' + e);
  e = await rpcErr('cancelBill', { billId: id, reason: 'Duplicate bill', managerPin: '1234', by: 'Suresh' });
  expect(e && /not correct/i.test(e), 'cancel with the cashier PIN was not refused: ' + e);
  expect(q('SELECT status FROM bills WHERE id=?', b.id)[0].status !== 'cancelled', 'bill got cancelled');
  e = await rpcErr('createReturn', { billId: id, picks: [{ lineIndex: 0, qty: 1000 }], reason: 'Other', refundMode: 'cash', by: 'Suresh', managerPin: '' });
  expect(e && /manager PIN is needed/i.test(e), 'refund without PIN was not refused: ' + e);
  e = await rpcErr('createAdjustment', { itemId: 'i1', reason: 'damage', qty: -1000, note: '' });
  expect(e && /manager PIN is needed/i.test(e), 'stock adjustment without PIN was not refused: ' + e);
  e = await rpcErr('saveUserAccount', { name: 'Sneaky', role: 'owner', pin: '1357' });
  expect(e && /permission/i.test(e), 'user creation was not refused: ' + e);
  e = await rpcErr('runReport', 'daily-summary', { from: '2026-01-01', to: '2026-12-31' });
  expect(e && /permission/i.test(e), 'report was not refused: ' + e);
  // a name sent from the screen never reaches the audit trail
  await rpc(page, 'recordReprint', id, 'Suresh');
  const last = q("SELECT by_name FROM audit_log WHERE action='reprint' ORDER BY id DESC LIMIT 1")[0];
  expect(last.by_name.startsWith('Karthik'), 'audit says ' + last.by_name);
  const generic = q("SELECT COUNT(*) n FROM audit_log WHERE id > ? AND by_name IN ('Office','Cashier','counter')", auditStart)[0].n;
  expect(generic === 0, 'audit rows with a generic name: ' + generic);
}, page);

/* ---------------- return with credit note, exchange ---------------- */
await step('return: bill 2 (UPI split) items back as a credit note', async () => {
  await press(page, 'Escape', 500); await waitRoute('billing');
  await press(page, 'F10', 600); await waitRoute('returns');
  await type(page, bill2.number); await press(page, 'Enter', 700);
  await waitText('Reason');
  await press(page, ' ', 200); // tick row 1
  await press(page, 'F3', 200); await press(page, 'ArrowDown', 100); await press(page, 'Enter', 200);
  await press(page, 'F7', 200);
  await shot(page, '11-return');
  await press(page, 'F12', 800);
  await shot(page, '11b-return-pin');
  await approve();
  const n = q('SELECT * FROM credit_notes ORDER BY id DESC LIMIT 1')[0];
  expect(n && n.refund_mode === 'credit_note', 'credit note not saved: ' + JSON.stringify(n));
  console.log('   ', n.number);
  await shot(page, '12-return-done');
}, page);
await step('exchange: return gives credit that is applied to a new bill', async () => {
  await press(page, 'Escape', 400); await sleep(300);
  if (!on('returns')) { await press(page, 'F10', 600); }
  await waitRoute('returns');
  await type(page, bill2.number); await press(page, 'Enter', 700);
  await waitText('Reason');
  await press(page, 'ArrowDown', 100); await press(page, ' ', 200);
  await press(page, 'F3', 200); await press(page, 'ArrowDown', 100); await press(page, 'Enter', 200);
  await press(page, 'F8', 200);
  await press(page, 'F12', 800);
  await approve();
  const n = q('SELECT * FROM credit_notes ORDER BY id DESC LIMIT 1')[0];
  expect(n.refund_mode === 'exchange', 'exchange note not saved ' + JSON.stringify(n));
  await press(page, 'Enter', 800); // done dialog
  await waitRoute('billing');
  await waitText(n.number);
  await shot(page, '13-exchange-credit');
  await scanTo('10*103'); await press(page, 'F12', 500);
  await press(page, 'Enter', 900); await waitText('saved');
  const b = lastBill();
  const pays = q('SELECT mode,amount,ref FROM bill_payments WHERE bill_id=? ORDER BY id', b.id);
  expect(pays.some((p) => p.mode === 'credit_note' && p.ref === n.number), 'credit note not applied as payment ' + JSON.stringify(pays));
  console.log('   exchange bill', b.number, JSON.stringify(pays));
}, page);

/* ---------------- Esc paths and lock ---------------- */
await step('esc paths: F1 help, Ctrl+F search, F11 customer all close with Esc; Ctrl+L lock keeps the bill', async () => {
  await press(page, 'F1', 400); await waitText('Keyboard shortcuts'); await press(page, 'Escape', 400);
  expect(!(await has('Keyboard shortcuts')), 'help did not close');
  await press(page, 'Control+f', 400); await press(page, 'Escape', 400); expect(on('billing'), 'left billing after Ctrl+F Esc');
  await press(page, 'F11', 400); await press(page, 'Escape', 400); expect(on('billing'), 'left billing after F11 Esc');
  await scanTo('105'); // a line on the bill while locked
  await page.keyboard.press('Control+l'); await waitRoute('lock');
  await type(page, '0000'); await sleep(700); expect(on('lock'), 'wrong PIN unlocked');
  await type(page, '1234'); await waitRoute('billing');
  expect(await has('Groundnut Oil 5 L'), 'bill lost over lock');
  await press(page, 'Delete', 300);
  expect(errors.length === 0, 'console errors: ' + errors.join(' | '));
}, page);

/* ---------------- menu on every screen ---------------- */
await step('menu: Alt+1..8 reach every tab, F1 opens the shortcuts sheet on each, Esc returns to billing', async () => {
  // Round 4 tabs: Point of Sale, POS1, POS2, Bills, Sales Report, Paymode Report, Stock, Customer Profile (Returns, Expenses, Day close: F10, F9, Ctrl+E)
  const tabs = [['1', 'billing'], ['2', 'pos1'], ['3', 'pos2'], ['4', 'sales'], ['5', 'reports/sales'], ['6', 'reports/paymode'], ['7', 'reports/stock'], ['8', 'customers']];
  for (const [n, route] of tabs) {
    await press(page, 'Alt+' + n, 700); await waitRoute(route);
    expect(await has('Point of Sale') && await has('Sales Report') && await has('Paymode Report') && await has('Customer Profile'), 'menu missing on ' + route);
    await press(page, 'F1', 500); await waitText('Keyboard shortcuts');
    if (!['billing', 'pos1', 'pos2'].includes(route)) expect(await has('On this screen'), 'no screen keys listed first on ' + route);
    if (route === 'sales' || route === 'reports/sales') await shot(page, 'nav-' + route.replace('/', '-'));
    await press(page, 'Escape', 500); expect(!(await has('Keyboard shortcuts')), 'F1 sheet did not close on ' + route);
    if (!['billing', 'pos1', 'pos2'].includes(route)) { await press(page, 'Escape', 700); await waitRoute('billing'); }
  }
  expect(errors.length === 0, 'console errors: ' + errors.join(' | '));
}, page);

/* ---------------- expenses, voided lines, day close ---------------- */
await step('expenses: Rs 100 tea from the drawer, then Rs 1,500 over the limit needs a manager PIN, void with a reason', async () => {
  await press(page, 'F9', 700); await waitRoute('cash');
  await press(page, 'F3', 200); await type(page, '100'); await press(page, 'Enter', 200); await press(page, 'Enter', 200); await press(page, 'Enter', 200);
  await type(page, 'Tea stall'); await press(page, 'Enter', 200); await type(page, 'tea for staff'); await shot(page, '14-expense'); await press(page, 'F12', 800);
  const mine = () => q("SELECT * FROM expenses WHERE shift_id IS NOT NULL AND status='active' ORDER BY id"); // the demo has older expenses
  let r = mine();
  expect(r.length === 1 && r[0].amount === 10000 && r[0].paid_from === 'cash' && r[0].category_id === 'tea' && r[0].shift_id, 'expense wrong ' + JSON.stringify(r));
  await type(page, '1500'); await press(page, 'Enter', 200); await press(page, 'ArrowRight', 100); await press(page, 'ArrowRight', 100); await press(page, 'ArrowRight', 100);
  await press(page, 'Enter', 200); await press(page, 'Enter', 200); await type(page, 'Loadmen'); await press(page, 'F12', 800);
  await approve();
  r = mine();
  expect(r.length === 2 && r[1].amount === 150000 && r[1].approved_by === 'Lakshmi Rajan' && r[1].by_name === 'Karthik Murugan', 'over-limit expense wrong ' + JSON.stringify(r));
  const x = await rpc(page, 'shiftSummary');
  expect(x.expensesCash === 160000 && x.expectedCash === 200000 + 22500 - 160000, 'X report drawer maths ' + JSON.stringify([x.expensesCash, x.expectedCash]));
  // void the big one (a cashier needs a manager PIN) and the drawer total comes back
  let e = await rpcErr('voidExpense', { id: 'ex' + r[1].id, reason: 'Entered twice', managerPin: '' });
  expect(e && /manager PIN is needed/i.test(e), 'void without PIN was not refused: ' + e);
  await rpc(page, 'voidExpense', { id: 'ex' + r[1].id, reason: 'Entered twice', managerPin: '2222' });
  expect(q("SELECT status, void_reason FROM expenses WHERE id=?", r[1].id)[0].status === 'void', 'void not stored');
  expect((await rpc(page, 'shiftSummary')).expectedCash === 200000 + 22500 - 10000, 'void did not return the cash');
  await press(page, 'Escape', 500); await waitRoute('billing');
}, page);
await step('voided lines: a scanned line removed with Del is logged with the user', async () => {
  const v0 = q('SELECT COUNT(*) n FROM voided_lines')[0].n;
  await scanTo('103'); await press(page, 'Delete', 600);
  const v = q('SELECT * FROM voided_lines ORDER BY id DESC LIMIT 1')[0];
  expect(q('SELECT COUNT(*) n FROM voided_lines')[0].n === v0 + 1 && v.by_name === 'Karthik Murugan' && v.code === '103', 'voided line not logged ' + JSON.stringify(v));
}, page);
await step('day close: X report, wrong manager PIN refused, Z with 2222', async () => {
  await page.keyboard.press('Control+e'); await waitRoute('day-close'); await sleep(500);
  await press(page, 'F8', 600); await waitText('X report'); await shot(page, '15-x-report'); await press(page, 'Escape', 400);
  await type(page, '1'); await press(page, 'Enter', 100); // one 2000 note: the drawer is short, that is fine
  await press(page, 'F12', 600); await waitText('Manager approval');
  await type(page, '0000'); await sleep(900);
  expect(q('SELECT COUNT(*) n FROM shifts WHERE closed_at IS NOT NULL')[0].n === 0, 'wrong PIN closed the day');
  await type(page, '2222'); await sleep(1200);
  await waitText('Day closed'); await shot(page, '16-z-report');
  const s = q('SELECT z_number, approved_by, counted, expected, difference FROM shifts')[0];
  expect(s.z_number && s.approved_by, 'Z not stored ' + JSON.stringify(s));
  expect(s.expected === 200000 + 22500 - 10000 && s.difference === s.counted - s.expected, 'X/Z maths wrong ' + JSON.stringify(s));
  console.log('   Z', JSON.stringify(s));
  await press(page, 'Enter', 800); await waitRoute('login');
}, page);

await step('day close: a backup file is written to the backup folder in the background', async () => {
  const dir = path.join(DB_DIR, 'Backups');
  let files = [];
  for (let i = 0; i < 60; i++) {
    files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^gokul-.*\.db$/.test(f)) : [];
    if (files.length) break;
    await sleep(250);
  }
  expect(files.length >= 1, 'no backup file after the Z close');
  const row = q("SELECT kind, ok, size_b FROM backup_log ORDER BY id DESC LIMIT 1")[0];
  expect(row && row.ok === 1 && row.kind === 'day-close' && row.size_b > 100000, 'backup_log ' + JSON.stringify(row));
  // it is a real, complete database: open the copy and count the bills
  const { DatabaseSync } = await import('node:sqlite');
  const copy = new DatabaseSync(path.join(dir, files.sort().pop()), { readOnly: true });
  try { expect(copy.prepare('SELECT COUNT(*) n FROM bills').get().n >= seedBills + 2, 'the backup copy is missing bills'); } finally { copy.close(); }
}, page);

/* ---------------- next day: credit sale, new customer ---------------- */
await step('after Z: signing in again asks to open a new day', async () => {
  await login('1234'); await waitRoute('day-open');
  await press(page, 'F3', 300); await press(page, 'F12', 700); await waitRoute('billing');
  expect(q('SELECT COUNT(*) n FROM shifts')[0].n === 2, 'second shift not created');
}, page);
await step('credit sale: customer picked with F11, paid on credit (F4), balance goes up', async () => {
  const before = q("SELECT outstanding FROM customers WHERE id='c3'")[0].outstanding;
  await press(page, 'F11', 500); await type(page, 'Geetha'); await sleep(500); await press(page, 'ArrowDown', 150); await press(page, 'Enter', 500);
  await waitText('Geetha Subramanian');
  await scanTo('104'); await press(page, 'F12', 500);
  await press(page, 'F4', 300); await press(page, 'Enter', 900);
  if (await has('Manager approval')) await approve(); // credit above the customer's limit needs a manager PIN
  await waitText('saved');
  const b = lastBill();
  const pays = q('SELECT mode,amount FROM bill_payments WHERE bill_id=?', b.id);
  expect(pays.length === 1 && pays[0].mode === 'credit', 'credit payment wrong ' + JSON.stringify(pays));
  const after = q("SELECT outstanding FROM customers WHERE id='c3'")[0].outstanding;
  expect(after === before + pays[0].amount, `outstanding ${before} -> ${after}, expected +${pays[0].amount}`);
  expect(b.status === 'credit', 'bill status ' + b.status);
}, page);
await step('new customer from F11 (name + phone) is saved and attached', async () => {
  await press(page, 'F11', 500); await type(page, 'Ravi Testkumar'); await sleep(500);
  for (let i = 0; i < 3; i++) await press(page, 'ArrowDown', 100); // walk-in, (no match), new
  await press(page, 'Enter', 500);
  await page.keyboard.press('Tab'); await type(page, '9876501234'); await press(page, 'Enter', 800);
  const c = q("SELECT * FROM customers WHERE name LIKE 'Ravi Testkumar%'");
  expect(c.length === 1, 'customer not saved: ' + JSON.stringify(c));
  await shot(page, '17-new-customer');
}, page);
await step('bills and payments balance: every new bill equals its payments', async () => {
  const bad = q('SELECT b.number, b.grand, (SELECT SUM(amount) FROM bill_payments p WHERE p.bill_id=b.id) paid FROM bills b WHERE b.id > ? AND b.grand != paid', seedLastId);
  expect(bad.length === 0, 'unbalanced: ' + JSON.stringify(bad));
}, page);

/* ---------------- Gokul Office on the same database ---------------- */
await step("office: login 1111, dashboard shows today's real sales and the bills made in POS", async () => {
  killApps(); await sleep(1500);
  ({ page, errors } = await launch('office')); await sleep(2500);
  await type(page, '1111'); await press(page, 'Enter', 1500);
  const day = q('SELECT MAX(day) d FROM bills')[0].d;
  const t = q("SELECT SUM(grand) s, COUNT(*) n FROM bills WHERE day=? AND status!='cancelled'", day)[0];
  const rupees = (t.s / 100).toLocaleString('en-IN');
  await waitText('Today');
  expect(await has('₹' + rupees), `dashboard does not show today's sales ₹${rupees}`);
  expect(await has('Bills today ' + t.n), `dashboard bill count is not ${t.n}`);
  expect(await has(lastBill().number), 'latest POS bill not in recent bills');
  await shot(page, '18-office-dashboard');
}, page);
await step('office: status bar shows the real last backup (not a made-up time) and the Norms tab edits production norms', async () => {
  const st = await rpc(page, 'backupStatus');
  expect(st.lastAt && st.stale === false, 'backupStatus ' + JSON.stringify(st));
  expect(await has('Last backup'), 'status bar does not show the last backup');
  expect(!(await has('Last backup today 02:00')) || new Date(st.lastAt).toTimeString().startsWith('02:00'), 'status bar still shows the hard-coded time');
  await page.evaluate(() => { location.hash = '#/production'; }); await sleep(1500);
  await page.getByRole('tab', { name: /Norms/ }).click(); await sleep(500);
  expect(await has('Yield and settling norms') && await has('Wastage norm'), 'Norms tab not shown');
  await shot(page, '19-office-norms');
  const before = await rpc(page, 'listSeedProfiles');
  const g = before.find((p) => p.seed === 'groundnut');
  await rpc(page, 'saveSeedNorms', { seeds: [{ seed: 'groundnut', kgPerL: 2.6 }], packWastagePct: 0.6 });
  const after = (await rpc(page, 'listSeedProfiles')).find((p) => p.seed === 'groundnut');
  expect(after.kgPerL === 2.6 && after.packWastagePct === 0.6, 'norms not saved ' + JSON.stringify(after));
  await rpc(page, 'saveSeedNorms', { seeds: [{ seed: 'groundnut', kgPerL: g.kgPerL }], packWastagePct: g.packWastagePct });
  expect(q("SELECT COUNT(*) n FROM audit_log WHERE action='update' AND entity='norms' AND by_name LIKE 'Suresh%'")[0].n === 2, 'norms change not audited with the real user');
}, page);
/* ---------------- Office flow: item -> POS sale -> purchase -> adjustment -> pressing + packing -> Bills -> collection -> GSTR-1 ---------------- */
// Office actions go through the same Tauri command the screens use (gokul_call); the checks read the SQLite file directly.
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = localDay();
const BC1 = '8906001000011';
const BC2 = '8906001000028';
let newItem; let posBill; let supplierId; let grnRes;
const ledgerOk = () => q('SELECT i.code, i.stock s, COALESCE((SELECT SUM(qty) FROM stock_movements m WHERE m.item_id=i.id),0) l FROM items i').filter((r) => r.s !== r.l);

await step('office: Items page opens on the real catalogue and saveItem stores two barcodes, Tamil name and the loose link', async () => {
  const looseId = q("SELECT id FROM items WHERE code='101'")[0].id;
  const r = await rpc(page, 'saveItem', {
    name: 'Test Sesame Oil 750 ml', nameTa: 'நல்லெண்ணெய் 750', code: '901', barcodes: [BC1, BC2], categoryId: 'oil', brand: 'Gokul', unit: 'btl', loose: false,
    packSize: '750 ml', parentId: looseId, scaleCode: '', hsn: '1515', gstRate: 5, mrp: 42000, price: 40000, cost: 30000, reorderLevel: 5000, active: true,
  });
  expect(r.ok, 'saveItem refused: ' + JSON.stringify(r));
  newItem = r.item;
  const bcs = q('SELECT barcode, is_primary FROM barcodes WHERE item_id=? ORDER BY is_primary DESC, rowid', newItem.id);
  expect(bcs.length === 2 && bcs[0].barcode === BC1 && bcs[1].barcode === BC2, 'barcodes wrong ' + JSON.stringify(bcs));
  const row = q('SELECT name_ta, parent_id FROM items WHERE id=?', newItem.id)[0];
  expect(row.name_ta === 'நல்லெண்ணெய் 750' && row.parent_id === looseId, 'Tamil name or parent link wrong ' + JSON.stringify(row));
  await page.evaluate(() => { location.hash = '#/items'; }); await sleep(1500);
  expect(await has('Items'), 'no Items page');
  await shot(page, '20-office-items');
  expect(errors.length === 0, 'console errors: ' + errors.join(' | '));
}, page);

await step('pos: the new item sells by its SECOND barcode', async () => {
  killApps(); await sleep(1500);
  ({ page, errors } = await launch('pos')); await sleep(2000);
  await login('1234');
  for (let i = 0; i < 40 && !(on('billing') || on('day-open')); i++) await sleep(150);
  if (on('day-open')) { await press(page, 'F3'); await press(page, 'F12', 700); }
  await waitRoute('billing');
  await scanTo(BC2); await waitText('Test Sesame Oil 750 ml');
  await press(page, 'F12', 500); await waitText('Amount to pay');
  await type(page, '500'); await sleep(250); await press(page, 'Enter', 900); await waitText('saved');
  posBill = lastBill();
  const l = q('SELECT item_id, qty, rate FROM bill_lines WHERE bill_id=?', posBill.id);
  expect(l.length === 1 && l[0].item_id === newItem.id && l[0].qty === 1000 && l[0].rate === 40000, 'bill line wrong ' + JSON.stringify(l));
  expect(stockOf('901') === -1000, 'stock after sale ' + stockOf('901'));
  await shot(page, '21-pos-second-barcode');
}, page);

await step('pos: weight box refuses the * form (3*103 must not become 3103 L)', async () => {
  await scanTo('101'); await sleep(250);
  await type(page, '3*103'); await sleep(300);
  expect(await has('Numbers only here'), 'no message for * in the weight box');
  await shot(page, '22-weight-star');
  await press(page, 'Escape', 300); await press(page, 'Delete', 300);
  expect(!(await has('3,103')) && !(await has('3103')), 'weight box accepted 3103');
}, page);

await step('office: purchase (GRN) in one go: stock, supplier balance, cost, ledger', async () => {
  killApps(); await sleep(1500);
  ({ page, errors } = await launch('office')); await sleep(2500);
  await type(page, '1111'); await press(page, 'Enter', 1500);
  const sup = await rpc(page, 'saveSupplier', { name: 'E2E Traders', phone: '98400 99999', city: 'Erode', gstin: '33AAAAA0000A1Z5', address: '', contact: '', creditDays: 10 });
  supplierId = sup.id;
  const rawBefore = stockOf('RM-GN');
  grnRes = await rpc(page, 'createGrn', {
    supplierId, invoiceNo: 'E2E/1', invoiceDate: today, freight: 0, otherCharges: 0, paidNow: 100000, payMode: 'upi', updateCost: true,
    lines: [{ itemId: newItem.id, qty: 10000, rate: 29000, discountPct: 0, gstRate: 5 }, { itemId: 'rm-gn', qty: 200000, rate: 9800, discountPct: 0, gstRate: 0 }],
  });
  expect(grnRes.total === 2_264_500, 'GRN total ' + grnRes.total + ' (taxable 2,250,000 + GST 14,500)');
  expect(stockOf('901') === -1000 + 10000, 'new item stock ' + stockOf('901'));
  expect(stockOf('RM-GN') === rawBefore + 200000, 'raw seed stock ' + stockOf('RM-GN'));
  const p = q('SELECT total, paid, supplier_id FROM purchases WHERE number=?', grnRes.number)[0];
  expect(p && p.total === grnRes.total && p.paid === 100000, 'purchase row ' + JSON.stringify(p));
  expect(q("SELECT cost FROM items WHERE code='901'")[0].cost === 29000, 'cost not updated');
  expect(q("SELECT COUNT(*) n FROM stock_movements WHERE kind='purchase' AND ref_id=?", String(q('SELECT id FROM purchases WHERE number=?', grnRes.number)[0].id))[0].n === 2, 'purchase ledger rows');
  const led = await rpc(page, 'getSupplierLedger', supplierId);
  expect(led.summary.due === grnRes.total - 100000, 'supplier due ' + led.summary.due);
  await page.evaluate(() => { location.hash = '#/purchases'; }); await sleep(1500);
  expect(await has(grnRes.number), 'Purchases page does not list ' + grnRes.number);
  await shot(page, '23-office-purchases');
}, page);

await step('office: stock adjustment (leak) writes a ledger row with its reason', async () => {
  const a = await rpc(page, 'createAdjustment', { itemId: newItem.id, reason: 'leak', qty: -1000, note: 'e2e leak' });
  expect(a.ok, JSON.stringify(a));
  expect(stockOf('901') === 8000, 'stock after adjustment ' + stockOf('901'));
  const r = q("SELECT reason, qty, note FROM stock_adjustments ORDER BY id DESC LIMIT 1")[0];
  expect(r.reason === 'leak' && r.qty === -1000, 'adjustment row ' + JSON.stringify(r));
  const m = q("SELECT kind, qty, note FROM stock_movements WHERE item_id=? ORDER BY id DESC LIMIT 1", newItem.id)[0];
  expect(m.kind === 'adjustment' && m.note.includes('e2e leak'), 'ledger row ' + JSON.stringify(m));
  expect(q("SELECT by_name FROM audit_log WHERE action='stock_adjust' ORDER BY id DESC LIMIT 1")[0].by_name.startsWith('Suresh'), 'Office audit row does not carry the signed-in owner');
}, page);

await step('office: pressing batch -> barrel -> packing run move seed, oil, cake and bottles through the ledger', async () => {
  const oil = q("SELECT id FROM items WHERE name='Groundnut Oil (Loose)'")[0].id;
  const cake = q("SELECT id FROM items WHERE name='Groundnut Oil Cake (Loose)'")[0].id;
  const oneL = q("SELECT id FROM items WHERE name='Groundnut Oil 1 L'")[0].id;
  const st = (id) => q('SELECT stock FROM items WHERE id=?', id)[0].stock;
  const before = { seed: st('rm-gn'), oil: st(oil), cake: st(cake), oneL: st(oneL) };
  const b = await rpc(page, 'createPressingBatch', { seed: 'groundnut', seedKg: 100000, cleaningLossKg: 2000, jaggeryKg: 0, oilRawL: 38000, cakeKg: 55000, chekku: 'Chekku 1', operator: 'E2E' });
  expect(st('rm-gn') === before.seed - 100000 && st(cake) === before.cake + 55000 && st(oil) === before.oil, 'pressing movements wrong');
  expect(b.metrics.grade === 'low' && Math.abs(b.metrics.yieldPct - 35.29) < 0.05, 'yield maths ' + JSON.stringify(b.metrics));
  await rpc(page, 'moveBatchToBarrel', { batchId: b.id, barrelId: 'BR-08', clearOilL: 36500 });
  expect(st(oil) === before.oil + 36500, 'oil into barrel not stocked');
  const targets = await rpc(page, 'listPackTargets', 'BR-08');
  expect(targets.some((t) => t.itemId === oneL), 'packed items not linked to the loose oil');
  const run = await rpc(page, 'createPackRun', { barrelId: 'BR-08', lines: [{ itemId: oneL, count: 20 }], usedL: 20100, packer: 'E2E' });
  expect(run.wastageL === 100 && run.packs === 20, 'pack run ' + JSON.stringify(run));
  expect(st(oil) === before.oil + 36500 - 20100 && st(oneL) === before.oneL + 20000, 'packing movements wrong');
  expect(q("SELECT level_ml FROM barrels WHERE id='BR-08'")[0].level_ml === 16400, 'barrel level');
  await page.evaluate(() => { location.hash = '#/production'; }); await sleep(1500);
  expect(await has(b.number), 'Production page does not list ' + b.number);
  await shot(page, '24-office-production');
}, page);

await step('office: Bills page lists the bill made in POS', async () => {
  await page.evaluate(() => { location.hash = '#/sales'; }); await sleep(1800);
  expect(await has(posBill.number), 'Office Bills does not show the POS bill ' + posBill.number);
  const list = await rpc(page, 'listSalesBills', { query: posBill.number });
  expect(list.length === 1 && list[0].lines[0].itemId === newItem.id && list[0].totals.grand === posBill.grand, 'listSalesBills ' + JSON.stringify(list).slice(0, 200));
  await shot(page, '25-office-bills');
}, page);

await step('office: customer payment is applied to the oldest credit and reaches the drawer', async () => {
  const before = q("SELECT outstanding FROM customers WHERE id='c3'")[0].outstanding;
  expect(before > 20000, 'c3 has no credit to collect: ' + before);
  const rBefore = (await rpc(page, 'listReceivables')).find((r) => r.customerId === 'c3');
  const st = await rpc(page, 'recordCollection', { customerId: 'c3', amount: 10000, mode: 'cash', ref: '', note: 'e2e' });
  expect(q("SELECT outstanding FROM customers WHERE id='c3'")[0].outstanding === before - 10000, 'outstanding not reduced');
  expect(st.balance === before - 10000 && st.entries[st.entries.length - 1].balance === st.balance, 'statement balance');
  const rc = q('SELECT amount, mode FROM customer_payments ORDER BY id DESC LIMIT 1')[0];
  expect(rc.amount === 10000 && rc.mode === 'cash', 'receipt row');
  const rAfter = (await rpc(page, 'listReceivables')).find((r) => r.customerId === 'c3');
  const bk = ['d90p', 'd61_90', 'd31_60', 'd0_30'];
  const firstDrop = bk.find((k) => rAfter.buckets[k] !== rBefore.buckets[k]);
  const firstFull = bk.find((k) => rBefore.buckets[k] > 0);
  expect(firstDrop === firstFull, `payment hit ${firstDrop} before the oldest bucket ${firstFull}`);
  expect(q("SELECT COUNT(*) n FROM cash_movements WHERE kind='in' AND reason='Credit collection' AND amount=10000")[0].n === 1, 'cash not in the drawer');
  await page.evaluate(() => { location.hash = '#/collections'; }); await sleep(1500);
  expect(await has('Geetha'), 'Collections page does not show Geetha');
  await shot(page, '26-office-collections');
}, page);

await step('office: GSTR-1 and GSTR-3B totals equal the bills (today and the last 30 days)', async () => {
  for (const [from, label] of [[today, 'today'], [new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), '30 days']]) {
    const t = q("SELECT COALESCE(SUM(taxable),0) taxable, COALESCE(SUM(gst),0) gst, COALESCE(SUM(before_round),0) value, COALESCE(SUM(grand),0) grand, COUNT(*) n FROM bills WHERE day>=? AND day<=? AND status!='cancelled'", from, today)[0];
    const g1 = await rpc(page, 'runReport', 'gstr1', { from, to: today });
    expect(g1.totals.taxable === t.taxable && g1.totals.tax === t.gst && g1.totals.value === t.value && g1.totals.invoices === t.n,
      `${label}: GSTR-1 ${JSON.stringify(g1.totals)} vs bills ${JSON.stringify(t)}`);
    const g3 = await rpc(page, 'runReport', 'gstr3b', { from, to: today });
    const row = (ref) => g3.rows.find((r) => r.ref === ref);
    expect(row('(a)').taxable + row('(c)').taxable === t.taxable, `${label}: 3B taxable`);
    const cn = q('SELECT totals_json FROM credit_notes WHERE day>=? AND day<=?', from, today).map((r) => JSON.parse(r.totals_json)).reduce((a, x) => a + x.slabs.reduce((s, y) => s + y.cgst + y.sgst, 0), 0);
    expect(g3.kpis[0].value === t.gst - cn, `${label}: output GST ${g3.kpis[0].value} vs ${t.gst} - credit notes ${cn}`);
    const ds = await rpc(page, 'runReport', 'daily-summary', { from, to: today });
    expect(ds.totals.net === t.grand, `${label}: daily summary ${ds.totals.net} vs ${t.grand}`);
  }
  await page.evaluate(() => { location.hash = '#/reports'; }); await sleep(2000);
  await shot(page, '27-office-reports');
  expect(await has('Reports'), 'no Reports page');
  expect(errors.length === 0, 'console errors: ' + errors.join(' | '));
}, page);

await step('integrity: supplier balances, barrel levels and the stock ledger agree', async () => {
  const bad = ledgerOk();
  expect(bad.length === 0, 'ledger mismatch ' + JSON.stringify(bad.slice(0, 3)));
  const sup = q('SELECT s.id, COALESCE((SELECT SUM(total-paid) FROM purchases p WHERE p.supplier_id=s.id),0) due FROM suppliers s');
  for (const s of sup) {
    const l = await rpc(page, 'getSupplierLedger', s.id);
    expect(l.summary.due === s.due && (l.entries.length === 0 || l.entries[l.entries.length - 1].balance === s.due), 'supplier ledger ' + s.id);
  }
  const barrels = q('SELECT b.id, b.level_ml, COALESCE((SELECT SUM(clear_oil_ml) FROM pressing_batches p WHERE p.barrel_id=b.id),0) - COALESCE((SELECT SUM(used_ml) FROM pack_runs r WHERE r.barrel_id=b.id),0) + COALESCE((SELECT SUM(qty_ml) FROM barrel_movements m WHERE m.barrel_id=b.id),0) calc FROM barrels b').filter((b) => b.level_ml !== b.calc);
  expect(barrels.length === 0, 'barrel levels ' + JSON.stringify(barrels));
}, page);

await step('integrity: stock ledger equals items.stock', async () => {
  const bad = q('SELECT i.code, i.stock s, COALESCE((SELECT SUM(qty) FROM stock_movements m WHERE m.item_id=i.id),0) l FROM items i').filter((r) => r.s !== r.l);
  expect(bad.length === 0, 'ledger mismatch ' + JSON.stringify(bad.slice(0, 3)));
}, page);

/* ---------------- Office: a full mill sheet day ---------------- */
await step('office: a mill sheet day (operators W and R, customer aravai, punnaku bought) closes and posts', async () => {
  const today = localDay();
  const rm = (id) => q('SELECT stock FROM items WHERE id=?', id)[0].stock;
  const seed0 = rm('rm-gn');
  expect(seed0 > 300000, 'demo has too little groundnut for the sheet: ' + seed0);
  const w0 = q("SELECT stock FROM items WHERE name='Groundnut Oil Cake (Loose)'")[0].stock;
  const input = {
    day: today, supervisor: 'Mohan', note: 'e2e',
    opRows: [
      { operator: 'Operator 1', seed: 'groundnut', machine: 'W', seedKg: 100000, oilL: 38000, cakeKg: 58000, jaggeryKg: 0 },
      { operator: 'Operator 2', seed: 'groundnut', machine: 'R', seedKg: 60000, oilL: 24000, cakeKg: 33000, jaggeryKg: 0 },
    ],
    custRows: [{ customerId: 'c3', seed: 'groundnut', machine: 'W', seedKg: 40000, oilL: 15000, cakeKg: 22000, cakeMode: 'kept' }],
    punnakuRows: [{ punnaku: 'kadalai_w', qtyKg: 10000 }],
    physical: {},
  };
  let sheet = await rpc(page, 'saveMillSheet', input);
  expect(rm('rm-gn') === seed0, 'a draft moved stock');
  const line = (k) => sheet.stock.find((l) => l.key === k);
  const earlier = q("SELECT COALESCE(SUM(seed_g),0) s FROM pressing_batches WHERE day=? AND seed='groundnut'", today)[0].s; // batches the Office flow pressed today
  expect(line('groundnut').pressed === -(earlier + 160000), 'shop seed use ' + line('groundnut').pressed + ' (the customer seed must not count)');
  const physical = {};
  for (const l of sheet.stock) physical[l.key] = l.computed;
  physical.groundnut = line('groundnut').computed - 1500; // 1.5 kg short
  await rpc(page, 'saveMillSheet', { ...input, physical });
  const bills0 = billCount();
  const kept0 = q("SELECT COUNT(*) n FROM stock_movements WHERE ref_type='mill_job'")[0].n; // the demo sheets kept some cake too
  const adj0 = q("SELECT COUNT(*) n FROM stock_adjustments WHERE note LIKE 'Mill sheet%'")[0].n;
  sheet = await rpc(page, 'closeMillSheet', { day: today });
  expect(sheet.status === 'closed' && sheet.opRows.every((r) => r.batchNumber), 'sheet not closed with batches');
  expect(rm('rm-gn') === seed0 - 160000 - 1500, 'seed stock after close ' + rm('rm-gn'));
  expect(q("SELECT stock FROM items WHERE name='Groundnut Oil Cake (Loose)'")[0].stock === w0 + 58000 + 22000 + 10000, 'W cake stock');
  expect(q("SELECT stock FROM items WHERE name='Groundnut Oil Cake R (Loose)'")[0].stock >= 33000, 'R cake is its own item');
  expect(q("SELECT machine FROM pressing_batches ORDER BY id DESC LIMIT 2").map((r) => r.machine).sort().join('') === 'RW', 'machines W/R not stored');
  expect(billCount() === bills0 + 1, 'the aravai charge was not billed');
  const bill = lastBill();
  expect(bill.customer_id === 'c3' && bill.status === 'credit' && bill.grand === 20000, 'aravai bill ' + JSON.stringify(bill)); // 40 kg x Rs 5 (cake kept)
  expect(q("SELECT COUNT(*) n FROM stock_movements WHERE ref_type='mill_job'")[0].n === kept0 + 1, 'only the kept cake may touch stock');
  expect(q("SELECT COUNT(*) n FROM stock_adjustments WHERE note LIKE 'Mill sheet%'")[0].n === adj0 + 1, 'the 1.5 kg difference was not posted');
  const again = await rpc(page, 'getMillSheet', today);
  expect(again.stock.find((l) => l.key === 'groundnut').variance === -1500, 'variance on the closed sheet');
  const e = await rpcErr('saveMillSheet', { ...input, note: 'changed' });
  expect(e && /closed/i.test(e), 'a closed sheet was editable: ' + e);
  await page.evaluate(() => { location.hash = '#/mill'; }); await sleep(2000);
  expect(await has('Mill daily sheet') && await has('Closed'), 'Mill page does not show the closed sheet');
  await shot(page, '28-office-mill');
  await page.evaluate(() => { location.hash = '#/expenses'; }); await sleep(1500);
  expect(await has('Expenses') && await has('By category'), 'Office Expenses page');
  await shot(page, '29-office-expenses');
  const ex = await rpc(page, 'runReport', 'expenses', { from: today, to: today });
  expect(ex.totals.amount === 10000, 'expense report total ' + ex.totals.amount);
  const vl = await rpc(page, 'runReport', 'voided-lines', { from: today, to: today });
  expect(vl.rows.length >= 1 && vl.rows.every((r) => r.by), 'voided lines report');
  expect(errors.length === 0, 'console errors: ' + errors.join(' | '));
}, page);

const failed = summary();
killApps();
process.exit(failed ? 1 : 0);
