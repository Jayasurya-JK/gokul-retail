# T02: Round-6 gap audit (READ-ONLY; write one report file)

**Branch:** wip/r6. **Do not change any code.** Only create the file `tools/junior/reports/R6-gap.md`.

## Context
Round-6 work was started by earlier developers and stopped part-way. The commits are `c6a45a8` (the work) and `7c76056` (typecheck fixes). Find out exactly what is **done**, **partly done**, or **missing** for each requirement below, by reading the code: Rust in `crates/core/src`, migrations, the TS Api in `packages/data/src`, and screens in `apps/pos/src` and `apps/office/src`. Use Grep and Glob, and read files in parts (offset/limit). Never read whole large files.

## Requirements to check

**A. POS billing (owner's notes)**
1. Exchange: returned items become credit on a new bill. If the new bill is **smaller** than the credit, it is **allowed** and the difference is **refunded** (Cash or UPI, manager PIN, audited). The cash refund reduces drawer cash in day close and X/Z. The right panel shows "Exchange credit ₹X", "New items ₹Y" and "Customer pays ₹Z" or "Refund ₹Z". The receipt shows a refund line. GST stays correct.
2. A visible "Cancel bill (Esc)" button above the scan box, with a confirm.
3. A "Remove exchange (Ctrl+Del)" button on the exchange card, which removes only the exchange credit (the credit note goes back to the customer, unused). The confirm text differs from cancel.
4. The Payment dialog has no overlap with the panel behind it, is opaque, and fits at 1366 and 1920.
5. Points: an INPUT box in Payment (available points and their worth; type the ₹ to redeem or "Use max"; min-redeem and max-% rules). Points are not shown in the big amount-to-pay header.
6. Store credit / credit note redeem works the same way, with an input box and partial redemption allowed.
7. The payment flow shows bill amount → received → change clearly.
8. Discount amount and % input boxes are obvious (grid and right panel).
9. No icon that draws a "$" anywhere (lucide `Receipt`, `ReceiptText`, `DollarSign`, `CircleDollarSign`, `BadgeDollarSign`, `HandCoins`). They should be replaced with `ReceiptIndianRupee`, `IndianRupee` or `BadgeIndianRupee`. **List every file and line** that still uses one.
10. `Billing.tsx` no longer passes the deprecated `tools` / `counterName` props to `<BillToolbar>`.

**B. Office production and stock**
1. Godown barrels in litres: filled from pressing batches and outsourced purchases, an end-of-day measuring-stick reading, and status filling / settling / ready / empty, with a settle start date.
2. Transfer to store: settled litres go to the store loose-oil item stock (ledger both sides, audited). Godown barrels are never in store or POS stock.
3. An outsourced-oil purchase into a godown barrel (supplier, cost).
4. Oil cake is a product, not a loss. Loss = seed − oil (via a per-oil kg/L factor setting) − cake − cleaning waste.
5. Norm yield per seed type, set by the owner, with a helper showing their own recent average. Each batch is compared to it.
6. The Mill daily sheet is view/report only and auto-filled from production entries. It is printable.
7. "Production insights" page: daily / monthly / by seed / by machine (W/R) / by operator; yield vs norm, oil per kg, cake per kg, loss %, trends, and low-yield flags.
8. Blind stock take: a printable A4 sheet grouped by supplier (S.No | Supplier | Item | Price | Count, with **no system qty**). The same layout on screen for entry, then system vs counted variance in qty and ₹, with posting needing a manager PIN.
9. The Office Items list can be grouped or filtered by supplier.

## Output: `tools/junior/reports/R6-gap.md`
For **each** numbered item (A1–A10, B1–B9), write:
- **Status:** DONE / PARTIAL / MISSING
- **Evidence:** file paths with line numbers, plus function or component names
- **What's left:** concrete, small, file-level steps (backend / Api / mock / UI / tests)
- **Size:** S / M / L

Then add a final section, "Suggested task order", splitting the remaining work into tasks that each touch only a few files.

## Rules
Follow `CLAUDE.md`. Never open `data/import/**`, `*.db`, or AppData. Don't edit any file except the report.
