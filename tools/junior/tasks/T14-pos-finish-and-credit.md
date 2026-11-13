# T14: Finish T13, and add a store-credit box to the billing summary

**Branch:** wip/r6. **Do not commit.** Follow `.claude/skills/gokul-desktop-ui/SKILL.md` and `.claude/skills/indian-retail-pos/SKILL.md`. Screens must fit 1366×768 and look right at 1920×1080. Every action must work by keyboard AND mouse. Use design tokens only, and never a `$` sign.

## Part A: finish T13
The last run (`tools/junior/tasks/T13-pos-owner-fixes.md`) stopped before it was done. Partial work is committed as HEAD.

The top bar (item 1) and the staff fix (item 5) are DONE. **Item 4 (whole points) was cancelled by the owner: points stay at two decimals. Do not change points display.**

Open each of the items below, check what is already done in the code, and finish whatever is missing:
- **Item 2 (summary panel):**
  - Subtotal, Discount and Cash discount sit on one aligned grid.
  - Cash discount is an inline input box exactly like Discount, with no dialog, and Ctrl+K focuses it.
  - Grand Total is about half its old height, with the amount at roughly 36px.
  - The full exchange box is visible without scrolling at 1366×768.
- **Item 3 (Bills screen):** the receipt preview shows the WHOLE receipt and scrolls inside its panel. The torn edge comes after the last line.

## Part B (new, from the owner): Store credit box
Under Discount and Cash discount, add a third aligned row: **Store credit**, with the same inline input style (₹ amount, Apply or Enter).
- Show it only when the bill has a customer with a store-credit (wallet / credit note) balance above 0. Show the available amount as muted text, e.g. "₹350 available".
- Entering an amount uses that much of the customer's store credit on this bill.
  - The row shows "−₹X" in the amount column.
  - Grand Total / amount to pay goes down by X straight away.
  - The amount can't be more than the available credit or the bill total. Clamp it and show a short hint.
- On payment, it must be recorded exactly as the existing wallet / credit-note payment (the "Wallet F5" mode in PaymentDialog) records it. **Reuse that same backend path. Do not invent a new payment type.** The payment dialog then shows only the remaining amount to collect.
- **Printed bill and receipt preview:** print a clear line "Store credit used  -X.XX" in the totals, and "Store credit balance  Y.XX" in the customer block, so the customer can see it.
- Give it a keyboard shortcut that isn't already used (check ShortcutsSheet and BillToolbar). Show the kbd pill like Cash discount's, and add it to the F1 shortcuts sheet.
- When the customer is removed or changed, clear the store-credit amount.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds
- `npm test` → passes
- `cargo test -p gokul-core --no-fail-fast` → passes (`demo_seed_matches_the_mock_shop_and_is_fast` is a known timing flake)

## Rules
Never open `data/import/**`, `*.db`, or AppData. Change only what is listed above.

## Report
For Part A, list what was already done and what you finished. For Part B, give the files changed, the shortcut chosen, and how the payment is recorded.
