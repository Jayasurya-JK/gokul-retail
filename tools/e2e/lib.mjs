// Shared helpers for the real-app end-to-end test (see docs/BACKEND.md, "End-to-end test").
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = path.join(ROOT, 'docs', 'design', 'shots');
export const DB_DIR = path.join(process.env.APPDATA, 'GokulRetail');
export const DB = path.join(DB_DIR, 'gokul.db');
export const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

export function killApps() {
  for (const n of ['gokul-pos.exe', 'gokul-office.exe']) { try { execSync(`taskkill /F /IM ${n}`, { stdio: 'ignore' }); } catch { /* not running */ } }
}

/** Move any existing database aside so the app starts from the demo seed. */
export function freshDb() {
  killApps();
  for (const ext of ['', '-wal', '-shm']) {
    const f = DB + ext;
    if (fs.existsSync(f)) fs.renameSync(f, `${f}.bak-${Date.now()}`);
  }
}

export async function launch(app = 'pos') {
  const exe = path.join(ROOT, 'target', 'release', `gokul-${app}.exe`);
  const child = spawn(exe, [], {
    detached: true, stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  });
  child.unref();
  return attach();
}

export async function attach() {
  let lastErr;
  for (let i = 0; i < 60; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
      const ctx = browser.contexts()[0];
      let page = ctx.pages()[0];
      for (let k = 0; !page && k < 20; k++) { await sleep(250); page = ctx.pages()[0]; }
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.waitForLoadState('domcontentloaded');
      return { browser, page, errors };
    } catch (e) { lastErr = e; await sleep(500); }
  }
  throw lastErr;
}

export async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `e2e-${name}.png`) });
}

export const kb = (page) => page.keyboard;
export async function type(page, text, delay = 15) { await page.keyboard.type(text, { delay }); }
export async function press(page, key, wait = 150) { await page.keyboard.press(key); await sleep(wait); }
export async function bodyText(page) { return (await page.locator('body').innerText()).replace(/\s+/g, ' '); }

/** Call the Rust backend from the open page, exactly like a screen does (Tauri command gokul_call). */
export async function rpc(page, method, ...args) {
  return page.evaluate(([m, a]) => window.__TAURI_INTERNALS__.invoke('gokul_call', { method: m, args: a }), [method, args]);
}

import { DatabaseSync } from 'node:sqlite';
/** Read-only look at the shop database (safe while the app runs, WAL mode). */
export function q(sql, ...params) {
  const db = new DatabaseSync(DB, { readOnly: true });
  try { return db.prepare(sql).all(...params); } finally { db.close(); }
}

const results = [];
export async function step(name, fn, page) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log('FAIL', name, '-', e.message.split('\n')[0]);
    if (page) { try { await shot(page, 'FAIL-' + name.replace(/\W+/g, '-').slice(0, 40)); } catch { /* ignore */ } }
  }
}
export function expect(cond, msg) { if (!cond) throw new Error(msg); }
export function summary() {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  bad.forEach((r) => console.log(' FAIL', r.name, '-', r.err));
  return bad.length;
}
