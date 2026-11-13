# T06: Read-only Mill daily sheet (auto-filled, printable)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **B6** and "Suggested task order" step 4. Follow `.claude/skills/gokul-desktop-ui/SKILL.md` and `.claude/skills/wood-pressed-oil-business/SKILL.md`.

## What the owner wants
The Mill daily sheet is a **VIEW and REPORT only**, filled automatically from what operators already entered in Production. There's **no double entry**. It shows the day at the mill:
- seeds in the godown (opening, received, taken to press, closing, in kg)
- pressing: kg of seed in, litres of oil out and kg of cake out, per seed type and machine (W/R) and operator
- godown barrel levels and stick readings
- outsourced oil bought
- transfers to the store

It has to be printable on A4.

## Build
1. Create a new page `apps/office/src/pages/MillDaily.tsx` that uses `api.getMillDaily(day)`. Check the `MillDaily` type in `packages/data/src/areas/production.ts`.
   - Add a date picker with previous/next day buttons (default: today). The sheet is **read-only**, with no inputs.
   - Lay it out in sections in the order above, with totals rows, using `@gokul/ui` components and design tokens only.
   - Add a "Print" button that prints a clean A4 layout using a print stylesheet: the shop name from settings, the date, and the sections. You may reuse `apps/office/src/components/mill/SheetPaper.tsx` if it fits.
2. Wire it in `apps/office/src/App.tsx` and `apps/office/src/nav.tsx` under Production, with the label **"Mill daily sheet"**.
3. The existing manual Mill sheet entry page: rename its nav label to **"Mill sheet (manual – old)"** and keep it reachable. Don't delete it; the owner decides later.
4. Reload on window focus (`useRefreshOnFocus` from `@gokul/ui`), and show an empty state for days with no data.

## Rules
- Litres are milli-units and kg are milli-units, as integers; format them for display.
- It must fit at 1366×768 with internal scroll only.
- Never open `data/import/**`, `*.db`, or AppData.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Report
List the files changed, the sections shown, and anything you were unsure about.
