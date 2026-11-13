# T10: Norm yield helper showing the owner's recent average

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **B5**. Follow `.claude/skills/gokul-desktop-ui/SKILL.md` and `.claude/skills/wood-pressed-oil-business/SKILL.md`.

## Build
1. Change `apps/office/src/components/purchasing/NormsEditor.tsx` to accept the pressing batches. Pass them in from `apps/office/src/pages/Production.tsx`.
2. For each seed type, show next to the norm input:
   - "Your average: X% over the last N batches" (N defaults to 10, selectable as 5, 10 or 20)
   - min and max
   - a tiny sparkline
   - a "Use average" button that fills the norm input; it doesn't save automatically
3. If there are fewer than 3 batches, show "Not enough batches yet".
4. Explain what the norm means in one muted line: "Expected oil from 100 kg of seed. Each batch is compared to this."

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Rules
Never open `data/import/**`, `*.db`, or AppData.

## Report
List the files changed and anything you were unsure about.
