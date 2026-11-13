# T09: Items list grouped and filtered by supplier (Office → Items)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **B9**. Follow `.claude/skills/gokul-desktop-ui/SKILL.md`.

## Build (in `apps/office/src/pages/Items.tsx`)
1. Add a **Supplier filter**: a searchable select listing all suppliers with item counts, plus "No supplier".
2. Add a **"Group by supplier"** toggle: collapsible group headers showing the supplier name, item count and stock value at cost (the cost value is visible to the owner and managers only, as other screens already do).
3. Show a Supplier column in the table, resizable like the other columns.
4. Keep the existing filters, sorting, bulk actions and keyboard navigation working.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Rules
Never open `data/import/**`, `*.db`, or AppData.

## Report
List the files changed and anything you were unsure about.
