# T12: Round-6 visual QA fixes

**Branch:** wip/r6. **Do not commit.** Follow `.claude/skills/gokul-desktop-ui/SKILL.md`. Screens must fit 1366×768. Use design tokens only, and never a `$` sign or icon (use ₹).

Screenshots of each problem are in `docs/design/shots/r6-qa-*.png`.

## Fix these (in order of importance)

1. **Mill daily unit bug.** In `apps/office/src/components/mill/millDaily.ts`, the "Stick adj. L" column prints raw milli-litres: it shows -500 where it should show -0.5. `signed()` (or whoever calls it) must divide milli-units by 1000 the same way the other litre columns do. Check every column in that file for the same mistake.
2. **POS "Cancel this bill?" dialog.** When Esc opens the dialog, the default focus must be **Keep bill**, not the red Cancel button, so a stray Enter never cancels a bill. Find the dialog in `apps/pos`.
3. **POS Returns, exchange mode.** The "Complete + exchange F12" button runs past the right window edge, which cuts off its F12 key pill. Make the action row wrap or shrink so everything fits at 1366 wide.
4. **POS payment, points.**
   - The "Points left after" tile shows "₹555". It must show points with no ₹ sign.
   - Show the customer's points as a whole number (floor), because the hint says "Whole points only".
5. **POS exchange summary.** Add proper spacing between the exchange box ("Remove exchange Ctrl+Del" row) and the Grand Total block.
6. **Office Godown.** Clicking a barrel in the top strip must select that barrel, so the side panel shows it. Right now the highlight moves but the panel stays on the old barrel. Find this in `apps/office/src/components/purchasing/GodownPane.tsx`.
7. **Office Items** (`apps/office/src/pages/Items.tsx`):
   - In the supplier dropdown, the count hint wraps ("42 / items"). Keep it on one line.
   - In grouped view, when the detail pane is open, the Item column truncates badly and the Stock column is clipped. Give Item a sensible min width, and stop the table from being clipped by the pane (it can scroll horizontally inside the table, or hide less important columns while the pane is open).
8. **Office Stock take** (`apps/office/src/components/catalog/StockTake.tsx`):
   - Put the "Match system for the rest" button in the toolbar row instead of on its own line.
   - Stop "Sheet N items · counted N" from wrapping.
   - In the review table, format quantities consistently: kg/L with up to 3 decimals and trailing zeros trimmed (113 kg, 4.56 kg); count units as whole numbers.
9. **Pressing form.** The "Godown barrel" label crowds its hint text. Add spacing.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds
- `npm test` → passes

## Rules
Never open `data/import/**`, `*.db`, or AppData. Change only what is listed above.

## Report
For each item 1–9, give the file(s) changed and one line on what you did. Say which items you could not do.
