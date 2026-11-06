---
name: gokul-desktop-ui
description: How to design, build and review any screen of Gokul POS or Gokul Office so it feels like world-class DESKTOP software (not a website) - window-filling layouts, keyboard-first POS, design tokens, packages/ui components, mock Api data, and the screenshot check at 1366x768. Use this whenever creating, changing or reviewing a screen, dialog, component, layout or style in apps/pos, apps/office or packages/ui, even if the task just says "make the items page" or "fix the look".
---

# Gokul desktop UI

The bar: looks like a 2026 pro desktop product (Shopify POS, Square terminal, Linear desktop, VS Code), and is faster than POSBean for the counter staff. Full rules are in `docs/design/BRIEF.md`; read it before starting a new screen.

## It is software, not a website
- The app fills the window: `html, body, #root { height: 100%; overflow: hidden }`. Only specific panels and tables scroll inside themselves.
- No web patterns: no hero sections, marketing headings, underlined links, footers, centred narrow page columns, or long scrolling pages.
- Chrome (bars, buttons, labels) is `user-select: none` with `cursor: default`. Text selection is allowed only in inputs and table cells.
- Turn off the browser context menu, reload (F5 / Ctrl+R), print (Ctrl+P) and find (F3 / Ctrl+F) in the global key handler. We provide our own.
- Small tasks open in a dialog or side sheet, not a new page. The Office app uses master-detail (list + detail panel) where it fits.
- Everything is instant: no page transitions, and no spinners for local data.

## Building a screen
1. Use components from `packages/ui` (Button, DataTable, Dialog, Drawer, Money, Kbd, PageHeader, and so on). If something is missing, add it there, not inside the app.
2. Colours, radius and type come only from tokens (`packages/ui/src/tokens.css` via the Tailwind preset). No hex codes in app code.
3. Data comes only from the `Api` interface in `packages/data` (mockApi for now). Screens never compute GST or totals themselves; they call the shared helpers. Money is integer paise.
4. Keyboard: every POS action has a key shown as a `<Kbd>` chip. Focus always lands somewhere useful. Esc closes the top dialog. Office has Ctrl+K command palette, and Enter / arrow keys work in every table.
5. Write real Gokul Oils content (oils, loose kg/L, tins, punnakku, Indian names). Never use lorem ipsum.
6. Show empty, loading, error and very-long-text states.

## Done check (every screen)
- `npm run typecheck` and `npm run build` pass.
- Screenshot it with Playwright at **1366x768** and **1920x1080** into `docs/design/shots/<app>-<screen>-<width>.png`. Look at the shots critically. Nothing should be clipped, have a page scrollbar, be misaligned, look default-browser, or have weak hierarchy. Fix it, then shoot again.
- POS: complete the flow with the keyboard only.
- Matches `docs/design/BRIEF.md` and the look of the approved POS Billing screen.
