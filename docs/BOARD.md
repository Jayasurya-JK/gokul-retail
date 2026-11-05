# Gokul Oils IT Team — task board

Roles and process: `docs/IT-TEAM.md`. Design: `docs/DESIGN-SYSTEM.md`.

## The bar (owner direction 6 Nov 2026)

"Better than GoFrugal and POSBean" is decided by these, in this order. A card that breaks one of them is not done.

1. **Never loses a bill** — crash and power-cut safe from the first bill. No half-saved bill, no gap in bill numbering.
2. **Faster on the same PC** — scan to line < 100 ms, search < 50 ms, save < 150 ms, POS start to billing < 3 s. Fully offline: no licence server, no dongle, no internet.
3. **Same muscle memory** — POSBean F-keys, scan-and-go, no mouse. Staff retrain in minutes, not days.
4. **GST-correct by construction** — inclusive pricing, CGST/SGST to the paisa, Rule 46 bill fields, GSTR-1/3B figures straight out.
5. **Made for an oil shop** — loose oil into customer containers, barrels, pressing batches, punnakku, yield. Generic retail software cannot do this.
6. **Owner sees the truth** — cash expected in the drawer, leaks, margins, without calling a vendor.
7. **Owned, not rented** — one installer, no per-PC licence, no AMC.

## Now

| Card | What | Who | Budget | Status |
|---|---|---|---|---|
| Billing — Bill save | One transaction (bill + lines + payments + stock + audit), gap-free series, migration 004, cancel / hold / draft / return | builder → verifier | medium (~350k) | starting |
| Billing — Screen live | Wire `apps/pos/src/Billing.tsx` preview to real commands; scan, F2 search, payment, save, error paths | ui-builder → verifier | small (~250k) | after Bill save |

## Next (one at a time — build in this order)

1. **Billing maths** — GST-inclusive split, discounts, round-off, MRP cap. *(DONE — `billing.rs`, 13 tests.)*
2. **Bill save** — one SQLite transaction (bill + lines + payments + stock), gap-free series, migration 004. Crash-safe from the first bill.
3. **Billing screen** — scan/search → lines → totals → payment → save. *(Preview built; wire to real commands.)*
4. **Print** — ESC/POS thermal bill + reprint.
5. **Day open/close** — float, cash count, X/Z report.
6. **Items** (Office) — item master, barcode, HSN, GST %, MRP.
7. **Stock** — ledger view, adjustment, low-stock.
8. **Purchases** — GRN adding stock and cost.
9. **Reports** — day summary, item-wise, GST summary.
10. **Production & packing** (Gokul Oils special) — pressing batch, loose/barrel, repack.

## In flight (handover)

| Role | Task | Branch / state | Next step |
|---|---|---|---|
| builder | Billing — Bill save (migration 004, save transaction, gap-free series) | not started | Start at spec 03 build step 2 |
| Head of IT | Gate + commits | `npm run check` green, 3 commits on `main` | Dispatch builder for Bill save |

## Done

| Card | Notes | Merged |
|---|---|---|
| S0-1+2+3 | Skeleton, database, login/shells/settings/users (339 tests) | 6 Nov 2026 |
