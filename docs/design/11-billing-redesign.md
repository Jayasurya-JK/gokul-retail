# 11 — POS billing redesign (design decision)

## What was wrong
The `Main.dc.html` mockup was never updated after the design system moved to navy/blue. It kept the old brown/cream/amber "wood" palette, so the approved picture and the shipped app were two different looks. It also read like Excel 2003: a hard 1px border on every row, cream header fills, every grid number the same weight, a low-contrast stack of white total boxes, a Pay "banner" pinned as a full-width amber bar, missing MRP/Taxable/GST/Net columns, a dead white gap in the middle, and it only rendered inside the design-canvas wrapper.

## What changed and why
- **Palette** — moved to the system navy `#1e3a5f` / blue `#0b5cad` tokens. Brown is gone.
- **Grid** — square corners, row lines only (no vertical rules, no header fill). The hierarchy now goes: item name (15px/600, Tamil underneath) → Qty and Net emphasised → MRP/GST/Taxable muted 13px tabular numerals. All 12 promised columns are present.
- **Total** — one navy-dark TotalPanel with the amber 40px bill total as the focal number, stats under it, and the Pay action immediately below (blue, 56px, key-labelled).
- **Login** — same tokens and key-cap style so it reads as the same product.

## World-class here means
1. The bill total is the largest element on the screen (40px, `--gk-amber` on navy) and the Pay action sits immediately below it, less than 100px away.
2. The scan row is the only element with a blue 2px border + 3px focus ring — it is unmissably the live cursor target.
3. Every action shows its key (F2–F10, Del, Esc, Ctrl+N/L) and the legend matches the spec keymap exactly.
4. Item names are 15px, Tamil is never clipped (`line-height: 1.55`), row height ≥ 34px (38px used).
5. Amounts are right-aligned with `tabular-nums` and Indian grouping; MRP is struck through where discounted so savings are visible.
6. No decorative animation, no gradient behind text, no grey-on-grey below 4.5:1 contrast.
7. A cashier who knows POSBean can bill without training: scan → Enter → F10.

## Could not fit at 1366×768
None. All 12 grid columns, 9 bill lines, the totals row, the right panel and the 13-key legend fit at 100% zoom.
