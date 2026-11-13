# T04: Godown barrel actions (Office → Production → Godown)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, items **B1**, **B3** and "Suggested task order" step 2. You built `apps/office/src/components/purchasing/GodownPane.tsx` in T03; extend it. Follow `.claude/skills/gokul-desktop-ui/SKILL.md`.

## Build
Create a new `apps/office/src/components/purchasing/GodownDialogs.tsx` with dialogs that use the existing `@gokul/ui` Dialog, Form and Button components, and wire each one into `GodownPane.tsx`. Check every Api signature in `packages/data/src/areas/production.ts` before calling it.

1. **Add barrels** (`api.addGodownBarrels`): oil type, count, capacity (default 200 L), name prefix.
2. **Edit barrel** (`api.editGodownBarrel`): name and capacity.
3. **Status actions** (`api.setGodownStatus`): "Start settling" (from filling), "Mark ready" (from settling) and "Reopen" (back to filling). Each has a confirm that shows the barrel and its litres.
4. **Stick reading** (`api.recordStickReading`): measured litres plus a note. Show the entered litres alongside, with a live variance, before saving.
5. **Outsourced oil** (`api.recordOutsourcedOil`): supplier (pick from the existing suppliers), oil type, litres, cost ₹, invoice no, date, and target godown barrel. Show `api.listOutsourcedOil` as a small list in the pane, under a heading such as "Bought oil (outsourced)".
6. Put the actions in the barrel side panel and add an "Add barrels" button in the pane header. After every save, reload the list and the open barrel, and show a toast.
7. Make the error messages from the backend readable: show them in the dialog.

## Rules
- Money is in paise, as integers; litres are milli-units where the Api uses them. Check the types and convert properly in the inputs (the ₹ and L inputs show decimals).
- Mouse and keyboard both work: Enter saves, Esc closes.
- Never open `data/import/**`, `*.db`, or AppData.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm run build` → succeeds

## Report
List the files changed, each dialog with the Api it calls, and anything you were unsure about.
