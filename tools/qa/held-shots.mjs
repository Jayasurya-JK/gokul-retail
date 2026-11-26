// Takes the "N waiting + Delivery on + Wholesale on" billing shots at the given widths into docs/qa/shots/after (used for the QA notes)
import { chromium } from 'playwright-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const w of [1280, 1366]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: w === 1280 ? 720 : 768 } })).newPage();
  await page.goto('http://localhost:5180/'); await sleep(800);
  for (const d of '1111') { await page.keyboard.press(d); await sleep(60); }
  await sleep(1200);
  await page.evaluate(() => { location.hash = '#/billing'; }); await sleep(500);
  const add = async (c) => { const i = page.locator('[data-scan-input]'); await i.focus(); await i.fill(c); await page.keyboard.press('Enter'); await sleep(400); };
  await add('1');
  await page.locator('button:visible', { hasText: /^Hold/ }).first().click(); await sleep(700);
  await add('2'); await add('1');
  await page.keyboard.press('Alt+w'); await sleep(300);
  await page.screenshot({ path: `../../docs/qa/shots/after/pos-billing-waiting-wholesale-${w}.png` });
  await page.locator('button:visible', { hasText: /^More/ }).last().click(); await sleep(300);
  await page.screenshot({ path: `../../docs/qa/shots/after/pos-billing-waiting-more-menu-${w}.png` });
  await page.close();
}
await browser.close();
