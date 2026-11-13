// Browser-preview screenshots (mock data) for round 6: exchange with refund, payment dialog with points input.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'design', 'shots');
const URL = process.env.POS_URL ?? 'http://localhost:5191/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL);
await sleep(800);
console.log((await page.innerText('body')).slice(0, 300));
const shot = async (n) => page.screenshot({ path: path.join(SHOTS, n) });

// sign in with the owner PIN
for (const d of '1111') { await page.keyboard.press(d); await sleep(60); }
await sleep(1200);
console.log('after login:', page.url(), (await page.innerText('body')).slice(0, 200).replace(/\n/g, ' | '));
const btn = page.getByRole('button', { name: /open the day|start the day|open day/i }).first();
console.log('btns', await page.locator('button').allInnerTexts());
await btn.click().catch((e) => console.log('noclick', e.message.slice(0, 80)));
await sleep(1000);
console.log('url', page.url());
await page.goto(URL + '#/returns');
await sleep(800);
await shot('r6-debug-2.png');
console.log((await page.innerText('body')).slice(0, 600).replace(/\s+/g, ' | '));
await browser.close();
