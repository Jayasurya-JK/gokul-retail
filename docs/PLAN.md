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

## How the design work runs
- Wave 1 (one Sonnet designer): design system, both app shells, POS Billing (the flagship screen). The owner approves the look.
- Wave 2 (parallel Sonnet designers): the remaining POS screens and Office screens, all on the Wave 1 system.
- Each screen is checked in the browser with a screenshot before it counts as done.
