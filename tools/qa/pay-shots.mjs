// Screenshots of the Pay now (F12) dialog: normal, long bill, split cash+UPI, points, credit. Usage: node tools/qa/pay-shots.mjs [tag] [widths]
import { chromium } from 'playwright-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = process.argv[2] || 'r1';
const WIDTHS = (process.argv[3] || '1366,1920').split(',').map(Number);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const w of WIDTHS) {
  const h = w === 1366 ? 768 : 1080;
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '.g-toast{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.append(st)); });
  const shot = (n) => page.screenshot({ path: `../../docs/qa/shots/pay-v2-${n}-${TAG}-${w}.png` });
  await page.goto('http://localhost:5180/'); await sleep(900);
  for (const d of '1111') { await page.keyboard.press(d); await sleep(60); }
  await sleep(1200);
  await page.evaluate(() => { location.hash = '#/billing'; }); await sleep(500);
  const add = async (c) => { const i = page.locator('[data-scan-input]'); await i.focus(); await i.fill(c); await page.keyboard.press('Enter'); await sleep(200); };
  const open = async () => { await page.locator('[data-scan-input]').focus(); await page.keyboard.press('F12'); await sleep(500); };
  const close = async () => { await page.keyboard.press('Escape'); await sleep(300); };
  // normal
  for (const c of ['1', '2', '3']) await add(c);
  await open(); await shot('normal');
  // split cash + UPI
  await page.keyboard.type('200'); await sleep(200); await shot('short');
  await page.keyboard.press('Enter'); await sleep(300);
  await page.keyboard.press('F2'); await sleep(300); await shot('split');
  await close();
  // cash with change
  await open(); await page.keyboard.type('2000'); await sleep(200); await shot('change'); await close();
  // customer with credit
  await page.keyboard.press('F11'); await sleep(500);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await sleep(80); }
  await page.keyboard.press('Enter'); await sleep(500);
  await open(); await page.keyboard.press('F4'); await sleep(300); await shot('credit'); await close();
  // points + cash discount applied in the bill panel
  await page.getByLabel('Loyalty points to use on this bill').fill('150'); await page.keyboard.press('Enter'); await sleep(400);
  await page.getByLabel('Cash discount in rupees, like 5').fill('5'); await page.keyboard.press('Enter'); await sleep(400);
  await page.getByLabel('Discount in percent, like 5').fill('2'); await page.keyboard.press('Enter'); await sleep(400);
  await open(); await shot('points'); await close();
  // long bill
  for (let c = 100; c <= 240; c += 1) await add(String(c));
  await open(); await shot('long'); await close();
  await page.close();
}
await browser.close();
