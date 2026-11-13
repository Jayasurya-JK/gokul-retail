# T13: POS fixes from the owner's test of round 6

**Branch:** wip/r6. **Do not commit.** Follow `.claude/skills/gokul-desktop-ui/SKILL.md`. Screens must fit 1366×768 and also look right at 1920×1080. Use design tokens only. Every action must work by keyboard AND mouse.

## 1. Top bar (apps/pos, TopBar and routes)
- Billing tabs become exactly **Point of Sale** and **POS 1**. Remove the POS2 tab, its route and its keyboard shortcut.
  - If the POS2 slot has an open bill in saved state when the app starts, move it to the held bills (the same as F6 Hold), so nothing is lost.
  - Rename "POS1" to "POS 1".
- Move **Customer**, **Sales Report** and **Paymode Report** out of the More menu and onto the top bar as their own tabs. The order is: Point of Sale | POS 1 | Bills | Customer | Sales Report | Paymode Report. Keep their Alt+8, Alt+5 and Alt+6 shortcuts. "Customer" is the old "Customer Profile" item.
  - Remove them from More, so nothing appears twice.
  - Top-bar tabs show text names, never icon-only.

## 2. Billing summary panel (apps/pos/src/components/SummaryPanel.tsx and related)
- **Alignment:** Subtotal, Discount and Cash discount must sit on one clean grid. The label goes left. The input box sits right-aligned, just left of the amount column. The amount goes right.
  - Every row has the same height and lines up vertically with the others.
  - Right now the Discount input floats in the middle.
- **Cash discount must be an inline input box**, the same style as the Discount box ("₹" amount, with an Apply button or Enter to apply). It must NOT open a separate dialog.
  - Ctrl+K puts the cursor straight into that box.
  - Keep any existing permission or manager-PIN rule that the old dialog enforced. If a PIN is needed, ask for it only when applying.
- **Grand total is too big.** Make the Grand Total block about half its current height: the amount at roughly 36px instead of the current huge size, still bold and clear.
- **Nothing in the summary may be hidden behind Grand Total or need scrolling** at 1366×768. That includes the full exchange box: credit, new items, refund, the whole "Cash or UPI is chosen in payment. A manager PIN is…" sentence, and the "Remove exchange Ctrl+Del" row.
  - Use the space freed from Grand Total.
  - If it still doesn't fit, make the GST table compact (one line) before anything else.

## 3. Bills screen (apps/pos, Bills page)
- The receipt preview is cut off at the bottom: the tax table, footer and the rest of the receipt can't be seen. Show the **whole receipt**, with the preview panel scrolling inside itself.
  - The torn-paper edge must come after the last line of the receipt, not cover it.
  - Check it with a long bill (10+ items) too.

## 4. Points shown as whole numbers everywhere
- The receipt shows "Points : 5.15". Points must be shown as whole numbers (floor) on the receipt, the customer card, the payment dialog and reports.
  - Change only the display. Don't change how points are stored or earned.

## 5. Sales Report: staff missing
- A bill made by the logged-in owner "Suresh Kumar" shows Staff "-" in the Sales Report. Find out why the staff name is empty: check how `listSalesBills` fills staff in the real Rust backend (`crates/core`) and in the mock.
  - Fix it so the cashier who made the bill is shown.
  - If the fix is in Rust, add a test and run `cargo test -p gokul-core --no-fail-fast` (`demo_seed_matches_the_mock_shop_and_is_fast` is a known timing flake).

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds
- `npm test` → passes
- `cargo test -p gokul-core --no-fail-fast` → passes, if you touched Rust

## Rules
Never open `data/import/**`, `*.db`, or AppData. Change only what is listed above.

## Report
For each item 1–5, give the file(s) changed and one line on what you did. For item 5, say what the cause was.
