# T07: Production insights page (Office)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **B7** and "Suggested task order" step 5. Follow `.claude/skills/gokul-desktop-ui/SKILL.md` and `.claude/skills/wood-pressed-oil-business/SKILL.md`.

## Build
1. Create a new page `apps/office/src/pages/Insights.tsx`, titled **"Production insights"**. Use `groupBatches` and the other helpers in `packages/data/src/insights.ts`, with batches from the existing Api; check which call lists pressing batches with machine, operator and norm.
2. A period selector: Today / This week / This month / Custom range.
3. Group by: **Daily | Monthly | Seed | Machine (W/R) | Operator**.
4. KPI tiles: seed kg in, oil litres out, cake kg out, **average yield vs norm**, loss %, and number of batches.
5. A chart of the yield trend over time with a norm line (recharts is already in the repo), and a table per group: batches, seed kg, oil L, oil per kg, cake per kg, loss %, and yield vs norm (coloured: below norm in amber or red).
6. **Low-yield flags:** list the batches more than X% below norm, with X as a setting on the page that defaults to 5%. Each row shows the date, seed, machine, operator and yield.
7. Wire it in `apps/office/src/App.tsx` and `nav.tsx` under Production, with the label **"Production insights"**.
8. Use design tokens only, and make it fit 1366×768 with internal scroll. Include empty states.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Rules
Never open `data/import/**`, `*.db`, or AppData.

## Report
List the files changed and anything you were unsure about (for example, missing machine data on old batches).
