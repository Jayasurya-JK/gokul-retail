# T08: Blind stock-take sheet (Office → Stock → Stock take)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **B8** and "Suggested task order" step 6. Follow `.claude/skills/gokul-desktop-ui/SKILL.md`.

## What the owner wants
Stock take is for the **first-time count and surprise inspections**. Staff get a **printed sheet** and count by hand. It's a **blind count**: the printed sheet must **NOT** show the system quantity, so staff can't just copy it.

## Build
1. Add `supplier` and `price` to the stock-take line type and the mock in `packages/data/src/areas/catalog.ts`, if they're missing (check the Rust side, which already has the item's supplier).
2. In `apps/office/src/components/catalog/StockTake.tsx` (and a new `CountSheet.tsx` if that's cleaner):
   - **Print count sheet:** A4, grouped by **supplier**, then by item name. Columns: **S.No | Supplier | Item | Price | Count by staff** (an empty box).
   - No system quantity on the sheet. A header with the shop name, date, sheet number and a "Counted by / Checked by" signature line. Use a print stylesheet with page breaks between suppliers if long, and repeat the column header on each page.
   - **Filter before printing:** all items, by supplier, or by category.
   - **Enter counts on screen** in the **same layout and order** as the sheet (S.No, Supplier, Item, Price, Count input). Fast keyboard entry: Enter moves to the next row.
   - **After entry, show the review:** system qty vs counted, the variance in qty, and the variance in ₹ at cost and at selling price, with totals. Only the owner or a manager sees the system qty here.
   - **Keep the existing manager-PIN "post adjustments" flow.**

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds
- `cargo test -p gokul-core` passes, if you touch Rust (`demo_seed_matches_the_mock_shop_and_is_fast` is a known timing flake)

## Rules
Never open `data/import/**`, `*.db`, or AppData.

## Report
List the files changed and anything you were unsure about.
