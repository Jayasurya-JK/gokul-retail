# Gokul Retail: build plan

Goal: world-class retail billing software (GoFrugal / POSBean class or better) for Gokul Oils. Two apps share one database.

## Phases
1. **UI/UX first (now).** Every screen of both apps is built as a real React screen running on fake data. Click-through, keyboard-ready, final look. The owner approves it screen by screen.
2. **Backend.** Rust core with SQLite (bills, stock, GST, printing, backup). The fake data layer is swapped for real Tauri commands behind the same `Api` interface. Screens don't change.
3. **Desktop packaging.** Tauri 2 installers (.exe) for POS and Office, plus printers, scanner and scale.
4. **Data import and go-live** alongside POSBean.

## Stack
| Part | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2 (WebView2) | Small, fast .exe and low RAM |
| Core | Rust + SQLite (WAL) | Never loses a bill, fast, offline |
| Screens | React 18 + TypeScript (strict) + Vite | Fast to build, huge ecosystem |
| Styling | Tailwind CSS v3 + CSS variable tokens | One design system, consistent |
| Primitives | Radix UI (dialog, popover, dropdown, tabs, tooltip) | Accessible and keyboard-correct |
| Tables | TanStack Table + TanStack Virtual | Thousands of rows without lag |
| State | Zustand | Simple and fast |
| Icons | lucide-react | Clean, consistent |
| Charts | Recharts | Dashboard and reports |
| Font | Inter (bundled, offline) with tabular numbers | Readable at the counter |

## Repo layout
```
apps/pos/          Gokul POS: billing counter
apps/office/       Gokul Office: back office
packages/ui/       design system: tokens, components, layouts
packages/data/     shared types + Api interface + mock implementation (fake shop data)
docs/design/BRIEF.md   design rules every screen follows
```

## Screen list (phase 1)
### Gokul POS
1. Login: pick user, then PIN
2. Day open: opening cash float
3. **Billing**: the main screen (scan, qty, rate, discount, totals, F-keys)
4. Item search (F2): fast search popup
5. Customer pick/add (F3)
6. Payment (F12/End): cash, UPI, card, credit and split; change due
7. Hold and recall bills (F6/F7)
8. Bill history, reprint and cancel
9. Return and exchange
10. Cash in/out (petty)
11. Day close: cash count, X/Z summary
12. Lock screen, plus a keyboard help overlay (F1)

### Gokul Office
1. Login
2. Dashboard: today's sales, trends, low stock, top items
3. Items list, plus item editor (barcodes, units, loose/packed, GST, MRP, prices)
4. Categories and brands
5. Stock: levels, adjustments, stock take
6. Purchases: entry (GRN), list, suppliers
7. Production: pressing batches (seeds to oil + cake), packing (loose to bottles)
8. Customers: list, credit ledger, collections
9. Sales: bills list and bill detail
10. Reports: sales, item-wise, GST (GSTR-1/3B, HSN), stock, profit, day-wise cash
11. Barcode label printing
12. Users and roles
13. Settings: shop, tax, bill format, printers, backup

## Round 2: owner feedback (6 Nov 2026)
1. **Brand theme from the logo** (`C:\Users\jksur\OneDrive\Desktop\Gokul Oils\`). Primary is deep forest green (about `#0E4330`), with bright yellow (`#FFED00`) and an amber oil drop (`#F5A800`) as accents, plus white. Replace the teal everywhere through the tokens. Light and dark themes. The real logo appears in the POS and Office top bars, on login screens, in app icons and on the receipt header.
2. **POS shortcuts are hidden by default.** Remove the hint chips beside the scan box and the always-on F-key bar. Add a "Shortcuts (F1)" button in the top bar that opens a clean key sheet. A setting ("Show key bar", per counter) turns the bottom bar back on for staff in training. All keys keep working.
3. **POS top menu**, a proper app-style navigation bar: Billing | Customers | Sales | Returns | Expenses | Day close. On the right: held bills, printer/saved status, clock, and a user menu (lock, switch user, sign out).
   - **Customers:** search list, add/edit (name, phone, address, GSTIN, credit limit, notes), the customer's bills, dues, collect payment, and start a bill for them.
   - **Sales:** today's bills (any date for managers), today's totals and payment-mode split. **Everyone** sees totals (owner's choice).
   - **Returns:** the existing screen.
   - **Day close:** the existing screen.
4. **Expenses** become a proper module, not just petty cash.
   - Each entry has: category (tea/snacks, transport, salary advance, wages, electricity, rent, repairs, packing material, supplier cash, other), paid from (cash drawer / UPI / bank), amount, paid to, note, and the user who entered it.
   - Amounts over a limit (setting) need a manager PIN.
   - The day's list has edit/void with a reason (never delete).
   - Cash-drawer expenses flow into day close.
   - Office gets an Expenses screen (filters, category totals, categories editor) and an expense report. Profit reports subtract expenses.
5. **A better top bar:** clearer hierarchy, the logo, the menu, and status that's easy to scan, without crowding.

6. **Mill daily sheet** (from the owner's paper form `Mill stock.pdf`, "SRI GOKUL ENTERPRISES"). This is one Office screen laid out like the paper and filled by the mill supervisor at day end.
   - **Stock items:** seeds Groundnut, Sesame and Coconut (copra). Punnaku Kadalai, Ellu and Coco. Vellam and Malli. Oils Groundnut, Sesame and Coconut.
   - **Machines:** W = wood-pressed (chekku), R = rotary. Every pressing batch records its machine type. Kadalai and Ellu punnaku stock is kept separately for W and R (Coco punnaku has no split).
   - **Opening stock** is filled automatically from the previous day's closing.
   - **Aravai (Operator):** a grid per operator (Operator 1, Operator 2, and so on; operators are a list in settings). For each seed type it records seed kg in, oil out and punnaku out, with the machine. These become our pressing batches (yield vs norm kept).
   - **Aravai (Customer):** a job-work service. The customer brings their own seeds, and we record customer, seed type, kg, machine, oil returned, and punnaku returned or kept by the shop. The charge is per kg, at one rate if the customer takes the cake and a lower rate if the shop keeps it (both rates are settings). The charge is billed (it can also be billed in POS as a service item), and cake kept by the shop is added to stock. Customer seeds and oil never touch shop stock.
   - **Punnaku purchased:** Kadalai W/R, Ellu W/R and Coco, which goes into stock (and can link to a supplier purchase).
   - **Closing stock** is calculated (opening + pressed + purchased + kept − sold − packed − adjusted). The supervisor enters the physical count, the difference is shown, and posting it creates adjustment rows with a reason.
   - The sheet prints and exports as a PDF in the same layout as the paper. Past sheets are read-only once closed.

## Round 4: POSBean-familiar POS (owner, 7 Nov 2026)
Staff are used to POSBean, so Gokul POS takes **inspiration** from it but **keeps our own look**: our top menu, grid, and right-side panel with totals, GST, grand total and Pay. From POSBean we take the parallel-bill tabs, the report tabs, the toolbar actions, the F-keys, a Stock column, and a compact customer, delivery and staff info area. We do not replicate POSBean's dense bottom panel, red header total or grey Windows-form styling. The detailed list below is the source of features; the visual layout stays ours.
- **One window, tabs on top:** Point of Sale | Sales Report | Paymode Report | Stock | Customer Profile | POS1 | POS2. POS1 and POS2 are extra bills open in parallel; each tab keeps its own bill.
- **Toolbar:** Save, Home Delivery (F2), Pay Mode (F3), Delete item, Refresh (F5), Manual, Staff (F7), Recent Bill, Bill Hold, Wholesale, Counter, Tools. **The F-keys are the same as POSBean**, and our extra actions get the free keys.
- **Header:** Date, Bill No, a Customer picker, the green "Total Qty/NOS" chip, and a big red grand total on the right.
- **Grid:** S.No | Barcode | Product | MRP | Discount | Discount % | Sales Price | Quantity | Total | Stock. Entry happens in the grid's last row (type or scan a barcode in the cell); everything is mouse-editable as well.
- **Bottom panel:**
  - Customer (Code, Name, Mobile, Last Visit, Closing Bal, Points), with tabs for Recent Bill, Hold Bill and Agent Details.
  - Wallet, Locality, Address, Delivery ₹.
  - Totals: No of Qty, No of Items, Gross, Item Disc %, Item Disc, Total; Cash Disc %, Cash Disc, Tax Inclusive, Tax Exclusive, Sodexo.
- **Status bar:** User, Counter, TOTAL SALES today, Location, version.
- **Sales Report:** date range; bills with expandable lines, Qty, Total, Net, Profit, Customer, Remarks; footer totals.
- **Paymode Report:** each bill split by payment mode (Cash, BharatQR/UPI, Card, Credit, Customer Points, Sodexo).
- **Stock:** Barcode, Product, Category, Brand, MRP, Cost, Profit %, Profit, Sales Price, Qty, Cost Total, Profit Total, Sales Total, Supplier; Fetch.
- **Customer Profile:** list plus a detail panel with Father name, DOB, Anniversary, GST, PAN, Locality, Route, Credit limit and days, Opening balance.
- **Cost and profit** columns and fields are visible to owner and manager only, enforced server-side.
- **New features:** parallel bills, home delivery (address and delivery charge), staff per bill, wholesale price mode, cash discount on top of item discounts, and Sodexo/wallet as payment modes.

## Loyalty rule (owner, 7 Nov 2026)
- Customers earn 1 point per ₹100 spent; when used, 1 point = ₹1. Points are kept to 2 decimals.
- **Points change only through bills:** they are earned on a sale, used in payment, and reversed when a bill is cancelled or returned. There is no manual add or remove, and the server refuses it. Opening balances were brought from POSBean on 7 Nov 2026.
- **Expiry:** points expire **1 year after they were earned**. Each earning keeps its own expiry date, and points used are taken from the oldest first (FIFO). The opening balances' earn dates depend on the history check (`data/import/POINTS-HISTORY-CHECK.md`).

## Notes for later (from the owner, 7 Nov 2026)
- **Packing pouch sizes (SSS Brand), in inches:** 50 g → 4×5, 100 g → 4×6, ¼ kg → 5×7, ½ kg → 6×8, 1 kg → 7×10. When packing runs are recorded, the matching pouch should be taken from packing-material stock automatically.
- **TSC TE244 stickers:** 3 across, ribbon on. One blank row comes partly out after each print, which is the printer's tear-off position. Confirm the printer pulls it back on the next print; otherwise adjust the tear/feed settings.

## How the design work runs
- Wave 1 (one Sonnet designer): design system, both app shells, POS Billing (the flagship screen). The owner approves the look.
- Wave 2 (parallel Sonnet designers): the remaining POS screens and Office screens, all on the Wave 1 system.
- Each screen is checked in the browser with a screenshot before it counts as done.
