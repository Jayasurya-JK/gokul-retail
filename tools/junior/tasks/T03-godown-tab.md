# T03: Godown tab and barrel cards (Office → Production)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, items **B1** and the "Suggested task order" step 1. Also read `.claude/skills/gokul-desktop-ui/SKILL.md` (desktop UI rules: tokens only, no hex colours, components from `@gokul/ui`, keyboard-fast and mouse-friendly) and `.claude/skills/wood-pressed-oil-business/SKILL.md`.

## What the owner wants
Godown barrels are **production stock in litres**, kept separate from store stock. Oil from pressing goes into a 200 L godown barrel, and several batches can go into one barrel. A measuring-stick reading is taken at end of day. When the barrel is nearly full it is left to **settle**, and once settled the oil moves to the store (that's a later task).

## Build (UI only; the backend and Api already exist)
1. In `apps/office/src/pages/Production.tsx`, add a **"Godown"** tab next to the existing tabs.
2. Create a new `apps/office/src/components/purchasing/GodownPane.tsx` that uses `api.listGodownBarrels()` and `api.getGodownBarrel(id)`. Check the exact types in `packages/data/src/areas/production.ts`.
   - Show barrels grouped by oil type (Groundnut, Sesame, Coconut…). For each barrel show:
     - name or number
     - capacity (200 L)
     - a fill level drawn as a simple vertical gauge with the litres number
     - status chip: filling / settling / ready / empty
     - settle start date and days settling
     - last stick reading with its date
   - Clicking a barrel opens a side panel with its history: fills from batches, outsourced purchases, stick readings and transfers, using whatever `getGodownBarrel` returns.
   - Show empty states and loading states.
3. Reload the data on window focus, using the existing `useRefreshOnFocus` hook from `@gokul/ui`.
4. No actions yet (add, settle, reading and transfer come in T04 and T05). Leave a disabled "Actions coming" note only if that's needed for the layout.

## Rules
- Follow `CLAUDE.md`. Use design tokens only. It must fit at 1366×768 with no page scroll.
- Never open `data/import/**`, `*.db`, or AppData.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Report
List the files changed, what each part of the UI shows, and anything you were unsure about.
