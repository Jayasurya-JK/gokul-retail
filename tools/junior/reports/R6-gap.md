# Round-6 gap audit (wip/r6)

Read-only audit of the work in `c6a45a8` plus the typecheck fixes in `7c76056`.
Evidence is file:line. "Backend" means Rust in `crates/core`; "Api" means `packages/data`; "mock" means the browser preview in `packages/data/src/areas/*`.

Summary: **the whole POS side (A1-A10) is effectively finished.** Most of the Office production backend is also finished and tested, but **none of the new godown/transfer/outsourced-oil/mill-daily/insights UI exists**, and the stock take is not yet the blind supplier-grouped sheet.

---

## A. POS billing

### A1. Exchange credit; smaller new bill refunds the difference (cash/UPI, manager PIN, audited); drawer + receipt + panel + GST

**Status: DONE**

**Evidence**
- Schema: `crates/core/migrations/012_exchange_refund.sql:5-16` (`exchange_refunds`, indexes, no-delete trigger).
- Refund logic: `crates/core/src/bills.rs:173-175` calls `give_back_exchange_balance`; `crates/core/src/bills.rs:235-272` checks cash/UPI only, checks the credit-note mode, requires the refund to equal `grand - used`, asks for a manager PIN through `crm::needs_manager_pin`, marks the note consumed, inserts `exchange_refunds` and audits `exchange_refund`.
- Drawer / X / Z: `crates/core/src/shift.rs:204-206` sums `exchange_refunds WHERE shift_id=? AND mode='cash'`; `shift.rs:273` adds it to `cash_refunds`; `shift.rs:277` subtracts it from `expected_cash`. UPI refunds never touch the drawer.
- Receipt: `crates/core/src/printing.rs:488-490` prints `Exchange balance refunded (Cash|UPI)` inside the payment box.
- Right panel: `apps/pos/src/components/SummaryPanel.tsx:186-222` shows "Exchange credit", "New items", then "Customer pays" / "Refund to customer" / "Credit covers the bill exactly".
- Payment dialog: `apps/pos/src/components/PaymentDialog.tsx:38` computes the refund; `:76-82` limits modes to Cash/UPI when refunding; `:158-160` labels the field "Refund in cash / Refund by UPI"; `:178-182` shows new items minus credit; `:265-275` explains the refund and the manager PIN; `:326-341` shows new items / exchange credit / received / refund.
- Wiring: `apps/pos/src/pages/Billing.tsx:75-80` computes `exchangeUsed`, `due`, `refundDue`; `:291-296` sends the credit-note payment plus `exchangeRefund`; `:313` retries with the manager PIN; `:305-309` toasts the refund.
- GST: the exchange is a payment, not a discount, so `totals` still come from `computeTotalsWithDelivery` (`Billing.tsx:66-69`) and the bill slabs are untouched.
- Tests: `crates/core/tests/exchange.rs:30` cash refund follows the drawer, `:77` UPI refund does not touch the drawer, `:95` removing exchange keeps the credit as store credit.

**What's left**
- Nothing required for the installed app.
- Optional mock parity for the browser preview: `packages/data/src/areas/shift.ts:151-196` (`summarise`) does not set `cashRefunds` or subtract `bill.exchangeRefund` from `expectedCash`, although `packages/data/src/mockApi.ts:96-103` stores the refund on the bill.

**Size: S** (optional mock-only change)

---

### A2. Visible "Cancel bill (Esc)" button above the scan box, with a confirm

**Status: DONE**

**Evidence**
- Button: `apps/pos/src/pages/Billing.tsx:520-525` — `Cancel bill` with `<Kbd>Esc</Kbd>`, disabled when the bill is empty, sits in the scan bar row immediately above `BillGrid`.
- Keyboard: `Billing.tsx:423-427` Esc clears the typed code first, otherwise opens the cancel dialog only when there are lines; `Billing.tsx:468` advertises it in the key hints.
- Confirm: `Billing.tsx:589-591` — danger dialog "Cancel this bill?" with a confirm action that clears the bill.

**What's left:** none. **Size: S**

---

### A3. "Remove exchange (Ctrl+Del)" on the exchange card; removes only credit; different confirm text

**Status: DONE**

**Evidence**
- Button: `apps/pos/src/components/SummaryPanel.tsx:214-220` — "Remove exchange `<Kbd>Ctrl+Del</Kbd>`" inside the exchange card, title "Take only the exchange credit off this bill. The items stay."
- Key: `apps/pos/src/pages/Billing.tsx:417` — `Delete` with `ctrlKey && exchange` opens `dropEx`.
- Confirm (deliberately different from cancel): `Billing.tsx:594-597` — "Remove exchange credit only?", explains the credit note goes back to the customer as unused store credit and the items stay.
- Backend: `crates/core/src/billops.rs:364-377` `clear_pending_exchange` changes `refund_mode` from `exchange` to `credit_note` instead of deleting it, and audits `release_exchange`.
- Test: `crates/core/tests/exchange.rs:95-116` remove-exchange keeps the credit as store credit.

**What's left:** none. **Size: S**

---

### A4. Payment dialog: no overlap, opaque, fits at 1366 and 1920

**Status: DONE** (static evidence; worth one visual check)

**Evidence**
- The dialog is a Radix portal rendered at document level: `packages/ui/src/components/Overlay.tsx:49-78`, overlay `fixed inset-0 z-50` (`:51`), content `relative z-50 ... overflow-hidden bg-surface` (`:62-64`) — `bg-surface` is opaque.
- Size is `xl` = 960 px (`Overlay.tsx:30`, used at `apps/pos/src/components/PaymentDialog.tsx:166`), with `max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)]`, so it fits 1366x768 (1318 available width, 720 height) and 1920x1080.
- The inner layout is a fixed header, a two-column grid (`PaymentDialog.tsx:186`), and a footer; the dialog body itself scrolls (`Overlay.tsx:75`) rather than spilling over the panel behind it.
- Header has `hideHeader` and `bodyClassName="p-0"` (`PaymentDialog.tsx:166`) to avoid double padding.

**What's left:** a 1366x768 and 1920x1080 screenshot check only (no code change known).

**Size: S**

---

### A5. Points input in Payment (available points + worth, type ₹ or "Use max", min-redeem, max-%)

**Status: DONE**

**Evidence**
- Rules/availability: `apps/pos/src/components/PaymentDialog.tsx:63-74` — `creditAvail`, `pointsCap` (max share of bill), `pointsAvail`, `pointsWorth`, `minRedeemWorth`.
- Input mode: `PaymentDialog.tsx:17-18` marks points/credit_note as typed modes; `:81` clears the field when chosen; `:95-97` refuses an empty typed amount with a helpful message.
- Redemption checks: `PaymentDialog.tsx:128-140` — whole points only, `rules.minRedeem`, `rules.maxPct` and remaining balance checks.
- Helpers: `PaymentDialog.tsx:213-215` "Use max" button; `:250-256` shows Customer has / Can use now / Points left after; `:296-299` explains partial use.
- The big header shows only the money to pay (`PaymentDialog.tsx:169-175`); points are not in it.

**What's left:** none. **Size: S**

---

### A6. Store credit / credit note redeem with input box and partial redemption

**Status: DONE**

**Evidence**
- Wallet balance: `apps/pos/src/components/PaymentDialog.tsx:63-65` subtracts already-spent notes.
- Input: `PaymentDialog.tsx:95-97` typed mode; `:113-127` validates against `creditAvail` and splits the requested amount across the customer's oldest credit notes, one part per note (partial notes allowed).
- Helpers: `PaymentDialog.tsx:257-263` wallet balance / this bill needs / wallet left after, with "partial use is fine"; `:296-299` text.
- "Use max" works for the wallet too (`:80-82`, `:213-215`).

**What's left:** none. **Size: S**

---

### A7. Payment flow shows bill amount → received → change clearly

**Status: DONE**

**Evidence**
- Summary column: `apps/pos/src/components/PaymentDialog.tsx:326-341` — `Bill amount`, `Received`, `Balance`, or `Refund to customer` when the exchange is larger.
- Change: `PaymentDialog.tsx:54-55` computes `change`; `:272-276` shows "Change to give back" with the amount; `:277-281` shows the part-payment balance still due.
- Header label changes with state: `:171-173` "Bill amount / Customer pays / Balance to pay / Refund to customer / Nothing to pay".

**What's left:** none. **Size: S**

---

### A8. Discount amount and % input boxes obvious (grid and right panel)

**Status: DONE**

**Evidence**
- Grid: `apps/pos/src/components/BillGrid.tsx:137` — the discount cell shows `+ Disc` when empty and an input with placeholder `0 or 5%`; `:160` menu entry "Discount" with `Percent` icon.
- Parsing accepts rupees or `%`: `apps/pos/src/pages/Billing.tsx:180-189`.
- Right panel: `apps/pos/src/components/SummaryPanel.tsx:250-263` `DiscountBox` with placeholder "Rs or %" and a `%` shortcut; wired at `Billing.tsx:478` and `:437-446`.
- Whole-bill dialog also says "Discount amount or percent" with examples: `Billing.tsx:599-603`.

**What's left:** none. **Size: S**

---

### A9. No `$`-style lucide icons anywhere

**Status: DONE**

**Evidence**
- Grep across `apps/` and `packages/` for `DollarSign`, `CircleDollarSign`, `BadgeDollarSign`, `HandCoins`, `ReceiptText` and a bare `Receipt` icon import returns **no matches**. The only "Receipt" hits are plain text ("Receipt printer", "Receipt preview") and `ReceiptPreview` components.
- The replacements are in place, e.g. `apps/pos/src/components/BillToolbar.tsx:2,92` (`ReceiptIndianRupee`), `apps/pos/src/components/SummaryPanel.tsx:2,36`, `apps/pos/src/components/TopBar.tsx:3,16-18`, `apps/office/src/nav.tsx:1,27`, `apps/office/src/pages/Dashboard.tsx:4,82`, `apps/office/src/pages/Expenses.tsx:2,74`, `apps/office/src/pages/Sales.tsx:2,202`.
- The banned imports were removed in `c6a45a8` (see `git show c6a45a8 -- apps/pos/src/components/BillToolbar.tsx`: `Receipt` → `ReceiptIndianRupee`).

**Files/lines still using a banned icon:** none.

**What's left:** none. **Size: S**

---

### A10. `Billing.tsx` no longer passes deprecated `tools` / `counterName` to `<BillToolbar>`

**Status: DONE**

**Evidence**
- `apps/pos/src/pages/Billing.tsx:485-490` — only `deliveryOn, staff, wholesale, heldCount, onDelivery, onPay, onDelete, onRefresh, onManual, onStaff, onRecent, onHold, onHeld, onWholesale`.
- `apps/pos/src/components/BillToolbar.tsx:75-81` keeps them as optional deprecated props for backwards compatibility but the caller no longer sends them (also confirmed by the `c6a45a8` diff).

**What's left:** optionally delete the deprecated props from `BillToolbar` after checking no other caller. **Size: S**

---

## B. Office production and stock

### B1. Godown barrels in litres (fill from pressing + outsourced, stick reading, status filling/settling/ready/empty, settle start date)

**Status: PARTIAL — backend, Api, mock and tests are done; no screen uses them.**

**Evidence (done)**
- Schema: `crates/core/migrations/013_godown.sql:5-16` (`godown_barrels`: oil, capacity, level, `status` check, `filled_on`, `settle_started_on`), `:19-34` movements ledger (press/outsourced/stick/transfer, no update/delete), `:37-50` stick readings, `:53-72` outsourced purchases, `:75-94` transfers, `:96-97` `pressing_batches.godown_barrel_id`.
- Fill/status/reading: `crates/core/src/godown.rs:123-165` (`post`, `check_fill`, `fill`), `:82-95` effective status with settle days, `:255-291` settle/ready/reopen with `settle_started_on`, `:307-334` stick reading posts the variance and audits.
- Pressing fills a barrel: `crates/core/src/purchasing.rs:945-966` (`check_fill` then `godown::fill(..., "press", ...)`), `:895-975` batch create.
- Api/mock: `packages/data/src/areas/production.ts:12-92` types + interface, `:131-342` full mock; `packages/data/src/tauri/tauriApi.ts:242-251`; dispatch `crates/core/src/dispatch.rs:272-283`.
- Tests: `crates/core/tests/godown.rs:67-98` (pressing fills a godown barrel and never store stock), `:99-129` (stick variance), `:181-198` (settling turns ready by itself), `:258-273` (add/edit/unique names).

**What's left (UI only)**
- `apps/office/src/pages/Production.tsx:259-297` has only Pressing / Packing / Norms tabs. Add a **Godown** tab with a barrel card per barrel (level / capacity, oil, status, settle date, last stick reading).
- `apps/office/src/components/purchasing/PressingForm.tsx:31-41` never sends `godownBarrelId`, so pressing from the UI does not fill a godown barrel. Add a barrel picker filtered to the selected oil and send `godownBarrelId` (the Api field already exists at `packages/data/src/areas/purchasing.ts:352`).
- Add dialogs for add/edit barrel and settle/ready/reopen, calling `api.addGodownBarrels`, `editGodownBarrel`, `setGodownStatus`.

**Size: M–L** (one new pane + dialogs + pressing-form change)

---

### B2. Transfer settled litres to store loose-oil stock (ledger both sides, audited); godown oil never in store/POS stock

**Status: PARTIAL — backend and tests are done; no transfer screen.**

**Evidence (done)**
- `crates/core/src/godown.rs:447-504` `transfer_to_store`: only a `ready` barrel, litres <= level, destination must be an active loose-oil item, optional store barrel level update, inserts `godown_transfers`, posts `-litres` on the godown ledger (`:495`) and `+litres` on the store item ledger (`:499`), audits (`:500`).
- Pressing does not touch store stock: `crates/core/src/purchasing.rs:964-966` only fills godown; test `crates/core/tests/godown.rs:67-98`.
- Store transfer test: `crates/core/tests/godown.rs:130-179`.
- Api/mock: `packages/data/src/areas/production.ts:44-48,277-295`.

**What's left (UI only)**
- Add a "Move to store" dialog: pick a ready barrel, a loose-oil item (`api.listItems` filtered `loose`), litres, optional store barrel, note; call `api.transferToStore`.
- Show the transfer history (`api.listGodownTransfers`) in the Godown tab.
- The old `MoveToBarrelDialog` (`apps/office/src/components/purchasing/PressingForm.tsx:123-181`, used at `Production.tsx:300`) still moves oil into the **store** `barrels` and loose stock via `moveBatchToBarrel`. Decide to retire it or keep it only for the old store-barrel flow, otherwise it contradicts "godown oil only reaches the store by transfer".

**Size: M**

---

### B3. Outsourced-oil purchase into a godown barrel (supplier, cost)

**Status: PARTIAL — backend, Api, mock and test are done; no screen.**

**Evidence (done)**
- `crates/core/src/godown.rs:336-408` `record_outsourced_oil`: litres > 0, cost >= 0, barrel must be fillable, supplier id or free-text name required, number series `GP`, inserts `godown_purchases`, fills the barrel, audits.
- `crates/core/tests/godown.rs:199-224`.
- Api/mock: `packages/data/src/areas/production.ts:38-42,259-276`.

**What's left**
- UI: dialog (barrel, supplier picker or name, litres, total cost, note) in the Godown tab.
- Backend decision: the record stores `supplier_id/name` and `cost` but does **not** post a supplier ledger/payable row. If "purchase" means it should appear in the supplier account, add that in `record_outsourced_oil` and a test.

**Size: S–M**

---

### B4. Oil cake is a product, not a loss; loss = seed − oil (kg/L factor) − cake − cleaning waste

**Status: DONE**

**Evidence**
- Formula: `crates/core/src/purchasing.rs:765-786` `pressing_metrics` — `loss = net + jaggery - oil_kg - cake`, `net = seed - cleaning`; per-seed `kg_per_l` and `density` are the stored norm fields.
- Cake becomes stock: `crates/core/src/purchasing.rs:940-973` ensures/posts the cake item as `production` stock, not a loss.
- TS mirror: `packages/data/src/areas/purchasing.ts:269-315` (`lossKg` comment says "Oil cake is a product, not a loss"; `pressingMetrics`).
- UI: `apps/office/src/components/purchasing/PressingForm.tsx:89-111` shows yield/norm and unaccounted loss; `apps/office/src/pages/Production.tsx:70,96,104` shows vs-norm and loss.
- Test: `crates/core/tests/godown.rs:48-65` ("loss maths counts oil cake as a product not a loss").

**What's left:** none. **Size: S**

---

### B5. Norm yield per seed (owner-set) with a helper showing the owner's recent average; each batch compared

**Status: PARTIAL — norms and comparison are done; the recent-average helper is not shown on screen.**

**Evidence**
- Norms screen: `apps/office/src/components/purchasing/NormsEditor.tsx:16-88` edits `kgPerL`, `density`, `settleDays` per seed and packing wastage, saves through `saveSeedNorms`, shows the calculated norm yield (`:56,63`).
- Stored per batch at save time: `crates/core/src/purchasing.rs:955-959` (`norm_kg_per_l`, `norm_density`); comparison in `apps/office/src/components/purchasing/PressingForm.tsx:95-100` and `apps/office/src/pages/Production.tsx:70`.
- The helper maths exists but is unused: `packages/data/src/insights.ts:77-83` `recentAverage(batches, seed, n)` has **no caller** anywhere in `apps/`.

**What's left**
- `NormsEditor` already receives `profiles`; pass `batches` in from `Production.tsx:295` and show, per seed, e.g. "Your last 10 batches: 2.51 kg seed/L (39.8% yield)" with a "Use this" button. Call `recentAverage`.
- Keep the current note that old batches keep their norm.

**Size: S**

---

### B6. Mill daily sheet is view/report only, auto-filled from production entries, printable

**Status: PARTIAL — auto-filled report exists in Rust, Api and mock; there is no screen. The existing Mill sheet is a manual data-entry form.**

**Evidence**
- Auto report backend: `crates/core/src/godown.rs:557-663` `mill_daily`: seeds (opening/bought/to press/closing), barrels (press/outsourced/stick/transfer/closing + reading), oils, cake, batches and totals.
- Dispatch/API/mock: `crates/core/src/dispatch.rs:283`; `packages/data/src/areas/production.ts:55-74,296-341`; `tauriApi.ts:252`.
- The existing page is editable and posts stock on close: `apps/office/src/pages/MillSheet.tsx:29-35` (`toInput` from the form), `:78-89` auto-save, `:157` Print/PDF, `:324-325` print preview. It does not call `getMillDaily`.
- Test: `crates/core/tests/godown.rs:230-256` (mill daily filled from the day's entries).

**What's left**
- New read-only page/tab (e.g. `apps/office/src/pages/MillDaily.tsx`) that loads `api.getMillDaily(day)` and renders seeds / barrels / oils / cake / batches / totals.
- Print action using the A4 layout (reuse the `SheetPaper` pattern at `apps/office/src/components/mill/SheetPaper.tsx`) with `window.print()`.
- Route in `apps/office/src/App.tsx` and nav entry in `apps/office/src/nav.tsx` (currently `/mill` points at the editable `MillSheet`). Decide whether to keep the old manual sheet separately.

**Size: M**

---

### B7. Production insights page: daily/monthly/by seed/by machine (W/R)/by operator, yield vs norm, oil per kg, cake per kg, loss %, trends, low-yield flags

**Status: PARTIAL — all the maths exists in `packages/data/src/insights.ts`; no page imports it, and machine data is incomplete.**

**Evidence**
- `packages/data/src/insights.ts:5-75` — `InsightBy = 'day' | 'month' | 'seed' | 'machine' | 'operator'`, `summarise` (yield, norm, variance, oilPerKg, cakePerKg, lossPct, lowBatches), `groupBatches` sorted for day/month.
- No caller: grep for `groupBatches` / `summarise` / `insights` in `apps/` returns nothing.
- Machine capture gap: the Rust input defaults to `W` (`crates/core/src/purchasing.rs:880-887` `default_machine`), and `apps/office/src/components/purchasing/PressingForm.tsx:31-41` never sends `machine`; only the mock assigns W/R randomly (`packages/data/src/areas/purchasing.ts:748`). A machine selector is needed before "by machine (W/R)" is real.
- Operator is captured (`PressingForm.tsx:22,83`), so "by operator" works once a screen exists.

**What's left**
- Add a W/R machine selector to `PressingForm.tsx` and send `machine` in the create call (types already allow it at `packages/data/src/areas/purchasing.ts:350`).
- New `apps/office/src/pages/Insights.tsx` with tabs Day / Month / Seed / Machine / Operator, a KPI row (yield vs norm, oil per kg, cake per kg, loss %, low-yield count) and a trend table/chart from `groupBatches`.
- Route + nav entry.
- Optional: use `recentAverage` for a "your recent average" line.

**Size: M**

---

### B8. Blind stock take: printable A4 sheet grouped by supplier (S.No | Supplier | Item | Price | Count, no system qty); same layout on screen; system vs counted variance in qty and ₹; posting needs manager PIN

**Status: PARTIAL — counting, variance and manager-PIN posting exist; the blind supplier-grouped sheet does not.**

**Evidence (done)**
- Backend now returns supplier and price: `crates/core/src/catalog.rs:611-628` (`supplierId`, `supplier`, `price`); test `crates/core/tests/godown.rs:275-292` asserts "Kongu Traders", supplier id, price and the ₹ variance.
- Screen has System / Counted / Variance qty / Variance value: `apps/office/src/components/catalog/StockTake.tsx:57-64`.
- Posting asks for a manager PIN when the backend says so and retries: `StockTake.tsx:95-113`, dialog `:186-190`; backend permission `crates/core/src/authz.rs:144`.
- Variance maths: `StockTake.tsx:12,47-55`.

**Gaps**
- `packages/data/src/areas/catalog.ts:81-90` `StockTakeLine` has no `supplierId`, `supplier` or `price` even though the Rust response now has them; the mock `:415-418` also omits them.
- No printable A4 count sheet, no supplier grouping, no blind mode: the screen always shows `system` (`StockTake.tsx:60`), and no `window.print()`/sheet component exists for stock take.
- The layout required is S.No | Supplier | Item | Price | Count with no system qty; the screen has no supplier column and no print button.

**What's left**
- Api: add `supplierId?`, `supplier?`, `price` to `StockTakeLine`; return them in the mock `startStockTake` from the item's supplier.
- UI: add a "Blind count sheet" view/print grouped by supplier with the five columns and blank Count; hide the System column until posting.
- After entry, show system vs counted variance in qty and ₹ (already computed) and keep the manager-PIN post flow.
- Optional: a category/supplier filter for a smaller sheet.

**Size: M**

---

### B9. Office Items list grouped or filtered by supplier

**Status: PARTIAL — the data exists and one screen sorts/shows supplier, but the main Items list has no supplier filter or grouping.**

**Evidence**
- Item carries supplier: `packages/data/src/types.ts:37-39`; Rust `crates/core/src/store.rs:174-205` (`ITEM_SELECT` + `item_from_row`) returns `supplierId`/`supplier`.
- `apps/office/src/components/catalog/CatalogItemsPane.tsx:61,121` has a supplier sort/column, but that pane is only used on the Categories and brands page (`apps/office/src/pages/Categories.tsx:69`), not the Items list.
- `apps/office/src/pages/Items.tsx:41-49` filters by category/type/GST/stock/status only; `:128-136` has no supplier control and `:58-87` no supplier column.
- `api.listItems()` loads all items with supplier, so a client-side filter/group is enough; `listItemsPage` (`crates/core/src/catalog.rs:690-731`) has no supplier filter if a server-side option is preferred later.

**What's left**
- In `Items.tsx` only: load `api.listSuppliers()` (or derive distinct `item.supplier`), add an "All suppliers" Select, a "No supplier" option, and an optional "Group by supplier" toggle/section header.
- Optional: add the supplier column to the row table and to the bulk bar.

**Size: S**

---

## Suggested task order

Each task below is small enough to touch only a few files. T09 and T10 are quick wins; T03–T05 carry the owner's main production workflow.

1. **T03 — Godown tab and barrel cards (B1, UI shell).**
   Files: `apps/office/src/pages/Production.tsx`, new `apps/office/src/components/purchasing/GodownPane.tsx`, `apps/office/src/nav.tsx`.
   Read `api.listGodownBarrels`/`getGodownBarrel`, show litre levels, status, settle date, readings.

2. **T04 — Godown barrel actions (B1 + B3).**
   Files: new `apps/office/src/components/purchasing/GodownDialogs.tsx` (add/edit barrel, settle/ready/reopen, stick reading, outsourced oil), small wiring in `GodownPane.tsx`.
   Calls `addGodownBarrels`, `editGodownBarrel`, `setGodownStatus`, `recordStickReading`, `recordOutsourcedOil`; show `listOutsourcedOil`.

3. **T05 — Pressing into godown + transfer to store (B1 + B2).**
   Files: `apps/office/src/components/purchasing/PressingForm.tsx` (godown barrel picker + W/R machine selector), `GodownDialogs.tsx` (transfer dialog), `Production.tsx` (retire/reword the old `MoveToBarrelDialog`).
   Sends `godownBarrelId` and `machine`; calls `transferToStore` and lists transfers.

4. **T06 — Read-only Mill daily sheet + print (B6).**
   Files: new `apps/office/src/pages/MillDaily.tsx`, `apps/office/src/App.tsx`, `apps/office/src/nav.tsx`, optionally `apps/office/src/components/mill/SheetPaper.tsx`.
   Loads `api.getMillDaily(day)`; no edits; A4 print button.

5. **T07 — Production insights page (B7).**
   Files: new `apps/office/src/pages/Insights.tsx`, `apps/office/src/App.tsx`, `apps/office/src/nav.tsx`.
   Uses `groupBatches` from `packages/data/src/insights.ts`; depends on the machine selector from T05.

6. **T08 — Blind supplier-grouped stock take sheet (B8).**
   Files: `packages/data/src/areas/catalog.ts` (StockTakeLine + mock), `apps/office/src/components/catalog/StockTake.tsx`, optionally new `apps/office/src/components/catalog/CountSheet.tsx`.
   Supplier/price in the type and mock, blind A4 sheet with S.No | Supplier | Item | Price | Count, variance after entry, keep the PIN post.

7. **T09 — Items supplier filter/group (B9).**
   File: `apps/office/src/pages/Items.tsx` (single file).

8. **T10 — Norm helper with recent average (B5).**
   Files: `apps/office/src/components/purchasing/NormsEditor.tsx` (accept `batches`, show `recentAverage`), `Production.tsx` (pass batches).

9. **T11 — Mock parity for exchange refunds (A1 optional).**
   Files: `packages/data/src/areas/shift.ts` (`summarise` adds `cashRefunds` and subtracts cash exchange refunds from `expectedCash`), maybe `packages/data/src/mockApi.ts`.
