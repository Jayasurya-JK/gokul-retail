// Overlap, overflow and contrast audit for Gokul POS (5180) and Gokul Office (5181).
// Usage: node tools/qa/overlap-audit.mjs [--out docs/qa/overlap-audit.md] [--json file] [--shots docs/qa/shots/after] [--apps pos,office] [--vp 1280,1366]
// Needs both vite previews running. Opens every route (except /home, which the wip/home-v3 branch is rebuilding) at 1280x720, 1366x768, 1536x864, 1920x1080; POS also with
// no bill, an open bill and a held bill. Finds: (1) content overflowing its box or clipped without an ellipsis, labels cut by an ellipsis,
// (2) sibling boxes that intersect, (3) anything outside the viewport sideways, (4) text contrast below the thresholds.
// Thresholds: grey (neutral) text that staff read (labels, tabs, headings, table headings, buttons, numbers) >= 7:1,
// any other text >= 4.5:1. Meaning-colour text (green/red/amber/blue...) >= 4.5:1. Disabled text is exempt.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('out', 'docs/qa/overlap-audit.md'));
const JSON_OUT = arg('json', '');
const SHOTS = arg('shots', '');
const APPS = arg('apps', 'pos,office').split(',');
const VIEWPORTS = [[1280, 720], [1366, 768], [1536, 864], [1920, 1080]].filter((v) => arg('vp', '').split(',').filter(Boolean).length === 0 || arg('vp', '').split(',').includes(String(v[0])));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POS_ROUTES = ['/billing', '/pos1', '/reports/sales', '/reports/paymode', '/reports/stock', '/reports/staff', '/day-open', '/sales', '/customers', '/returns', '/cash', '/day-close', '/lock'];
const OFFICE_ROUTES = ['/', '/items', '/items/new', '/items/hsn', '/categories', '/labels', '/stock', '/purchases', '/suppliers', '/production', '/production-insights', '/mill-daily', '/sales', '/customers', '/loyalty-points', '/collections', '/expenses', '/reports', '/gst', '/users', '/settings'];

/** Runs inside the page. Returns raw findings. */
function inPage(HI, LO) {
  const out = [];
  const vw = window.innerWidth;
  const sig = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').replace(/\s+/g, '.').slice(0, 50);
    const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ' "' + txt + '"' : ''}`;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    if (el.closest('[aria-hidden="true"]')) return false; // icons, the toolbar measuring copy, chart measuring spans
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = Array.from(document.querySelectorAll('body *')).filter((e) => !['SCRIPT', 'STYLE', 'svg', 'path', 'BR'].includes(e.tagName) && !(e instanceof SVGElement) && visible(e));
  const ownText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());

  // 1. overflow / clipped text
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') continue;
    if (el.closest('.sr-only') || el.closest('[data-overflow-ok]')) continue;
    const dx = el.scrollWidth - el.clientWidth;
    if (dx <= 1) continue;
    const ox = cs.overflowX;
    if (ox === 'auto' || ox === 'scroll') continue; // a real scroll area
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (ox === 'hidden' || ox === 'clip') {
      if (cs.textOverflow === 'ellipsis') {
        if (text.length > 0 && text.length <= 22 && !/^[\d.,\s]+$/.test(text) && !el.title && !el.closest('[title]')) out.push({ type: 'label-truncated', el: sig(el), detail: `"${text}" cut with an ellipsis (${dx}px short)` });
      } else if (text) {
        out.push({ type: 'clipped', el: sig(el), detail: `content ${el.scrollWidth}px in a ${el.clientWidth}px box, no ellipsis` });
      }
    } else if (cs.position !== 'fixed' && el.tagName !== 'BODY' && el.tagName !== 'HTML' && text) {
      out.push({ type: 'overflow', el: sig(el), detail: `content ${el.scrollWidth}px spills out of a ${el.clientWidth}px box` });
    }
  }

  // 2. sibling intersection
  for (const p of [document.body, ...all]) {
    const kids = Array.from(p.children).filter((k) => visible(k) && !(k instanceof SVGElement) && !['absolute', 'fixed', 'sticky'].includes(getComputedStyle(k).position) && getComputedStyle(k).display !== 'inline' && getComputedStyle(k).pointerEvents !== 'none');
    if (kids.length < 2 || kids.length > 60) continue;
    const rs = kids.map((k) => k.getBoundingClientRect());
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = rs[i], b = rs[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 3 && h > 3) {
        const txtA = (kids[i].innerText || '').trim(), txtB = (kids[j].innerText || '').trim();
        if (!txtA && !txtB) continue;
        out.push({ type: 'overlap', el: `${sig(kids[i])}  x  ${sig(kids[j])}`, detail: `${Math.round(w)}x${Math.round(h)}px` });
      }
    }
  }

  // 3. outside the viewport sideways
  if (document.documentElement.scrollWidth > vw + 1) out.push({ type: 'page-scroll', el: 'html', detail: `page is ${document.documentElement.scrollWidth}px wide in a ${vw}px window` });
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o !== 'visible') { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; } }
    }
    if (clipped || getComputedStyle(el).position === 'fixed' && r.left >= -1) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    out.push({ type: 'outside-viewport', el: sig(el), detail: `spans ${Math.round(r.left)}..${Math.round(r.right)} in a ${vw}px window` });
  }

  // 4. contrast
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const bgsFor = (el) => {
    // walk up, compositing translucent layers; a gradient yields several candidate colours (worst case is kept)
    const layers = [];
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /rgb/.test(cs.backgroundImage)) {
        const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean).filter((c) => c.a > 0.5);
        if (stops.length) { layers.push({ multi: stops }); break; }
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bases = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const l of layers.reverse()) bases = l.multi ? l.multi : bases.map((b) => over(l, b));
    return bases;
  };
  const effOpacity = (el) => { let o = 1; for (let a = el; a; a = a.parentElement) o *= +getComputedStyle(a).opacity; return o; };
  let primaryChars = 0, secondaryChars = 0, allChars = 0;
  const seen = new Set();
  for (const el of all) {
    if (!ownText(el)) continue;
    if (el.closest(':disabled,[aria-disabled="true"],[disabled]')) continue;
    const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const op = effOpacity(el);
    const worst = Math.min(...bgsFor(el).map((bg) => ratio(over({ ...fg0, a: fg0.a * op }, bg), bg)));
    const neutral = Math.max(fg0.r, fg0.g, fg0.b) - Math.min(fg0.r, fg0.g, fg0.b) < 36;
    const role = el.closest('th,thead,button,a,label,nav,[role=tab],[role=toolbar],[role=columnheader],[role=button],h1,h2,h3,h4,legend,summary') || +cs.fontWeight >= 600 || el.classList.contains('num');
    // neutral text staff read must reach 7:1, except a few quiet things: keyboard chips, units, row numbers
    const need = neutral && role ? HI : LO;
    allChars += text.length;
    if (worst >= HI) primaryChars += text.length; else secondaryChars += text.length;
    if (worst + 0.01 < need) {
      const key = sig(el) + need;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ type: 'contrast', el: sig(el), detail: `${worst.toFixed(2)}:1, needs ${need}:1 (${neutral ? 'grey' : 'colour'} ${role ? 'label/number' : 'text'}, ${Math.round(parseFloat(cs.fontSize))}px)` });
    }
  }
  out.push({ type: 'stat', el: '', detail: JSON.stringify({ allChars, secondaryChars }) });
  return out;
}

const findings = new Map(); // key -> { app, route, type, el, detail, count, views:Set }
const stats = {};           // app -> { chars, secondary }
const pageCount = {};
function record(app, route, variant, vp, list) {
  for (const f of list) {
    if (f.type === 'stat') { const s = JSON.parse(f.detail); stats[app] ??= { chars: 0, sec: 0 }; stats[app].chars += s.allChars; stats[app].sec += s.secondaryChars; continue; }
    const key = [app, route, f.type, f.el.slice(0, 140)].join('|');
    const e = findings.get(key) ?? { app, route, type: f.type, el: f.el, detail: f.detail, views: new Set(), n: 0 };
    e.views.add(`${vp[0]}${variant ? ' ' + variant : ''}`); e.n++; findings.set(key, e);
  }
}

async function audit(page, app, route, variant, vp) {
  await sleep(350);
  const list = await page.evaluate(`(${inPage.toString()})(7, 4.5)`);
  pageCount[app] = (pageCount[app] ?? 0) + 1;
  record(app, route, variant, vp, list);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(path.resolve(ROOT, SHOTS), { recursive: true });
  await page.screenshot({ path: path.resolve(ROOT, SHOTS, name + '.png') });
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const hash = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

async function auditTabs(page, app, route, variant, vp) {
  const tabs = page.locator('[role=tab]');
  const n = Math.min(await tabs.count(), 8);
  for (let i = 0; i < n; i++) {
    const t = tabs.nth(i);
    if (!(await t.isVisible().catch(() => false))) continue;
    const name = ((await t.innerText().catch(() => '')) || '').trim().split('\n')[0].slice(0, 20);
    await t.click({ timeout: 1500 }).catch(() => {});
    await audit(page, app, `${route} [${name}]`, variant, vp);
  }
}

if (APPS.includes('pos')) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5180/'); await sleep(900);
    for (const d of '1111') { await page.keyboard.press(d); await sleep(60); }
    await sleep(1200);
    const add = async (codes) => { for (const c of codes) { await hash(page, '#/billing'); await sleep(250); const i = page.locator('[data-scan-input]'); await i.focus(); await i.fill(c); await page.keyboard.press('Enter'); await sleep(350); } };
    for (const variant of ['no bill', 'open bill', 'held + open bill']) {
      if (variant === 'open bill') await add(['1', '2']);
      if (variant === 'held + open bill') {
        await hash(page, '#/billing'); await sleep(300);
        await page.locator('button:visible', { hasText: /^Hold/ }).first().click().catch(() => {}); await sleep(700);
        await add(['1', '2']);
      }
      for (const r of POS_ROUTES) {
        await hash(page, '#' + r); await sleep(250);
        await audit(page, 'POS', r, variant, vp);
        if (r === '/billing' || r === '/reports/sales') { await auditTabs(page, 'POS', r, variant, vp); }
        if (r === '/billing') await shot(page, `pos-billing-${vp[0]}-${variant.replace(/[^a-z]+/g, '-')}`);
      }
      // billing with More menu open, a dialog, and wholesale + delivery on
      await hash(page, '#/billing'); await sleep(300);
      await page.getByRole('button', { name: /^More/ }).last().click().catch(() => {}); await sleep(200);
      const menus = page.locator('.g-overlay'); 
      if (await menus.count()) { await audit(page, 'POS', '/billing (More menu open)', variant, vp); await shot(page, `pos-billing-more-${vp[0]}-${variant.replace(/[^a-z]+/g, '-')}`); }
      await page.keyboard.press('Escape'); await sleep(150);
      await page.keyboard.press('Alt+w'); await sleep(250);
      await audit(page, 'POS', '/billing (wholesale on)', variant, vp);
      await shot(page, `pos-billing-wholesale-${vp[0]}-${variant.replace(/[^a-z]+/g, '-')}`);
      await page.keyboard.press('Alt+w'); await sleep(150);
      for (const [label, key] of [['pay dialog', 'F12'], ['shortcuts sheet', 'F1'], ['recent bills', 'F8'], ['delivery dialog', 'F2'], ['staff dialog', 'F7']]) {
        await page.locator('[data-scan-input]').focus().catch(() => {});
        await page.keyboard.press(key); await sleep(450);
        await audit(page, 'POS', `/billing (${label})`, variant, vp);
        await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('Escape'); await sleep(150);
      }
    }
    await ctx.close();
  }
}

if (APPS.includes('office')) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5181/'); await sleep(1000);
    await audit(page, 'Office', '/login', '', vp);
    await page.locator('input[type=password]').fill('1111'); await page.keyboard.press('Enter'); await sleep(1200);
    for (const r of OFFICE_ROUTES) {
      await hash(page, '#' + r); await sleep(350);
      await audit(page, 'Office', r, '', vp);
      await auditTabs(page, 'Office', r, '', vp);
      if (['/', '/items', '/reports', '/production', '/settings'].includes(r)) await shot(page, `office-${r === '/' ? 'dashboard' : r.slice(1)}-${vp[0]}`);
    }
    await ctx.close();
  }
}
await browser.close();

// ---- report
const rows = [...findings.values()];
const byApp = (app) => rows.filter((r) => r.app === app);
const types = ['overflow', 'clipped', 'label-truncated', 'overlap', 'outside-viewport', 'page-scroll', 'contrast'];
let md = `# Overlap and clarity audit\n\nGenerated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`tools/qa/overlap-audit.mjs\`.\n\n`;
md += `Pages checked: ${Object.entries(pageCount).map(([a, n]) => `${a} ${n}`).join(', ')} (every route, plus tab views, dialogs and the More menu, at 1280x720, 1366x768, 1536x864 and 1920x1080; POS with no bill, an open bill and a held bill).\n\n`;
md += `Rules: grey text that staff read (labels, tab names, headings, table headings, buttons, numbers) must be >= 7:1; every other text >= 4.5:1; coloured meaning text >= 4.5:1; disabled text exempt. Content overflow, short labels cut by an ellipsis with no hover title (a cut name that shows in full on hover is accepted), intersecting siblings and anything outside the window sideways are findings.\n\n`;
md += `## Summary\n\n| App | Findings | ${types.join(' | ')} | Quiet text (< 7:1) share |\n|---|---|${types.map(() => '---').join('|')}|---|\n`;
for (const app of ['POS', 'Office']) {
  if (!pageCount[app]) continue;
  const s = stats[app] ?? { chars: 1, sec: 0 };
  md += `| ${app} | **${byApp(app).length}** | ${types.map((t) => byApp(app).filter((r) => r.type === t).length).join(' | ')} | ${(100 * s.sec / s.chars).toFixed(1)}% |\n`;
}
md += `\n"Findings" counts one per element per screen (the same element at several window sizes is one finding).\n\n`;
for (const app of ['POS', 'Office']) {
  if (!byApp(app).length) { if (pageCount[app]) md += `## ${app}\n\nNo findings.\n\n`; continue; }
  md += `## ${app}\n\n| Screen | Type | Element | Detail | Seen at |\n|---|---|---|---|---|\n`;
  for (const r of byApp(app).sort((a, b) => a.route.localeCompare(b.route) || a.type.localeCompare(b.type))) {
    md += `| ${r.route} | ${r.type} | \`${r.el.replace(/[|`]/g, '')}\` | ${r.detail.replace(/\|/g, '/')} | ${[...r.views].join(', ')} |\n`;
  }
  md += '\n';
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
if (JSON_OUT) fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(rows.map((r) => ({ ...r, views: [...r.views] })), null, 1));
for (const app of ['POS', 'Office']) if (pageCount[app]) console.log(`${app}: ${byApp(app).length} findings`, Object.fromEntries(types.map((t) => [t, byApp(app).filter((r) => r.type === t).length])));
console.log('report:', OUT);
