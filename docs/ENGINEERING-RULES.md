# Engineering rules (verifier checks every one)

## Money
- Store all money as integer paise. Never floats. Format only at display.
- GST computed per line, rounded per a single documented rule, totals = sum of lines. Round-off shown as its own line.
- A saved bill is never edited. Corrections are a return/credit note that references the original.

## Stock
- Stock is a ledger: every movement (sale, purchase, return, repack, wastage, adjustment) is one row with item, qty, unit, reason, reference, user, time.
- Current stock = sum of ledger (a cached balance is allowed but must be rebuildable from the ledger and checked by a test).
- Units: store qty in the item's base unit (e.g. ml or g). Drum/tin/litre/pouch are conversions defined per item.
- Negative stock: allowed at billing only if the setting is on, and always logged.

## Crash safety
- Saving a bill = one SQLite transaction (bill + lines + payments + stock rows). All or nothing.
- SQLite in WAL mode, `synchronous=NORMAL` minimum. Bill numbers are gap-free per series and assigned inside the transaction.
- Unsaved bill in progress is autosaved, so a power cut or crash restores it on restart.
- Automatic backup daily and on app close; keep 30 days; restore is tested.
- Any uncaught error is logged to a file and shown as a plain message. The app never shows a white screen.

## Speed budgets (on the shop's actual counter PC)
- App start to billing screen: under 3 s
- Barcode scan to line on screen: under 100 ms
- Item search as you type: under 50 ms with 20,000 items
- Save + print bill: under 300 ms (printer time excluded)
- Day-end report: under 2 s with 1 year of data
- Installer size: under 15 MB. RAM while billing: under 150 MB total (app + WebView2).
- Idle CPU: near 0% (no polling loops, no heavy animations).
Each budget gets an automated test with seeded data. Slower than budget = FAIL.

## Units
- Integer base units only: `ml` for liquids, `g` for weights, `pcs` for counts. 1.5 L = 1500 ml.
- Litre <-> kg uses the item's density stored as integer mg per ml (groundnut oil ~ 910). Conversion rounds once, at the end.

## Code
- TypeScript strict, no `any` in business logic. Business rules live in plain functions with unit tests, not inside React components.
- Database access only through one data layer. All schema changes are numbered migrations; never edit an old migration.
- No new dependency without a reason written in the spec.
- Every feature has: unit tests for the rules, one end-to-end test for the main flow, and tests for the listed edge cases.

## Done means
Spec acceptance tests pass, all old tests pass, typecheck and lint clean, speed budgets met, verifier says PASS, owner has seen it.
