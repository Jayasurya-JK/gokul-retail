# Spec 03 - Complete normal billing (POS) + items, stock, purchase basics (Office)

Status: APPROVED by owner direction 5 Nov 2026 ("complete normal billing first, world-class, like GoFrugal").
Depends on: spec 00 skeleton. Gokul-specific loose/barrel and production come after (specs 01, 02).

## Billing rules (gokul-core, all unit tested)
- **Prices are GST-inclusive** (retail). Per line: amount = qty x rate - discount; taxable = amount x 10000 / (10000 + gst_rate_bp), rounded half-up to paise; tax = amount - taxable; split CGST/SGST equally (odd paisa goes to CGST). Totals = sum of lines.
- **Bill round-off** to nearest rupee (setting: none / 0.50 / 1.00), shown as its own line.
- **MRP cap**: sale rate can never exceed MRP. Rate change below sale price needs `price_override` permission.
- **Discounts**: line (% or amount) and bill (% or amount, spread over lines pro-rata for GST, remainder to largest line). Max % per role.
- **Qty**: decimal for ml/g items (stored base units), whole for pcs. Zero or negative qty not allowed in sale mode.
- **Bill numbers**: gap-free per series per financial year, assigned inside the save transaction, max 16 chars (GST rule), e.g. `GO2627-000123`. Credit notes have their own series `CN2627-000012`.
- **Save** = one transaction: bill, lines, payments, stock movements (`post_stock`, ref `sale`), audit row. Saved bills are never edited or deleted.
- **Cancel** (owner, or permission; same business day by default): marks bill cancelled with reason, reverses stock. Still listed in reports as cancelled.
- **Returns**: against original bill number; pick lines and qty up to what is not yet returned; refund mode; makes a credit note, stock back in (or to damage, chosen per line). Exchange = return + new bill in one flow.

## Gokul POS screen (keyboard-first, POSBean-familiar)
Layout at 1366x768: top bar (bill no, date/time, counter, cashier, customer); centre line grid (S.No, code, item, qty, unit, rate, disc, GST %, amount); right panel with big total, item count, savings; bottom F-key legend.

| Key | Action |
|---|---|
| Scan / type + Enter | add item by barcode or code; repeat scan increments qty (setting) |
| F2 | item search popup (name, Tamil name, code; type-ahead) |
| F3 | customer (phone lookup / new; GSTIN for B2B) |
| F4 or * | change qty of current line |
| F5 / F6 | hold bill / recall held bill |
| F7 | discount (line, then Shift+F7 bill) |
| F8 | return / exchange mode |
| F9 | reprint last bill (marked DUPLICATE); Shift+F9 reprint by number |
| F10 or End | payment and save |
| Del | remove current line (logged) |
| Esc | close popup / ask to clear bill |
| Ctrl+N | new bill; Ctrl+L lock screen |

- Unknown barcode: beep, message "Not found: 8901234...", opens search with the code filled.
- Cursor always returns to the scan box. Scanner keystrokes are never dropped (input buffer test with 30 chars at 5 ms).
- **Payment popup**: cash (tendered -> change shown large), UPI, card, split across modes; quick keys for amounts (exact, 100, 200, 500, 2000). Save only when paid = total (credit/udhaar comes later).
- **Autosave**: current bill saved to drafts on every change; after crash or power cut POS offers to restore it.
- **Hold**: up to 9 held bills, persist across restart.
- **Day open / close**: opening cash float; close with cash count by denomination, expected vs counted, difference with reason; prints X (mid-day) / Z (day-end) report.
- **Cash in / out**: petty expenses and cash withdrawals with reason, included in cash expected.
- Lock screen after N minutes idle (setting); PIN to unlock.

## Printing (gokul-core `print` module, printer-agnostic)
- Drivers: ESC/POS raw (2" / 3" thermal), TSPL and ZPL raw (label printers), and Windows GDI fallback (any installed printer, incl. A4). Raw jobs go through the Windows spooler by printer name, so USB printers installed in Windows work. Printer chosen per job type in Office settings, with a test print button.
- **Bill layout** (template with settings): shop name, address, phone, GSTIN, FSSAI no; bill no, date-time, cashier, customer; lines (Tamil name option); subtotal, discount, round-off, total; GST summary by rate (taxable, CGST, SGST); payment modes and change; footer text; optional UPI QR. Duplicate bills say DUPLICATE.
- Printing never blocks the counter: bill is saved first, print runs on a worker; failure shows "Print failed - F9 to reprint", bill stays saved.
- **Barcode stickers** (Office): pick items + count or from a purchase; layout per sticker size (38x25 mm default): name, MRP, sale price, barcode (EAN-13 / Code128), packed date. Internal barcodes generated as EAN-13 with prefix 200-299 and a correct check digit.

## Gokul Office screens
- **Dashboard**: today and this month - sales, bills, average bill, payment mode split, hourly sales chart, top 10 items, low stock list, cash expected in drawer. Refresh on open and every 60 s (no busy polling).
- **Items**: fast list (virtualised, search, filter by category/brand/active), add/edit form, barcode generate, category and brand masters, HSN and GST rate, MRP, sale price, reorder level, Tamil name. Price change history (audit). CSV import with preview and error rows (used later for POSBean data).
- **Stock**: current stock with value (at last cost), item ledger (every movement with reference link), stock adjustment with reason (owner/permission), low stock report.
- **Purchases (basic)**: supplier master; purchase entry - supplier, invoice no/date, lines (item, qty, cost, GST %, MRP check), totals; posts stock in and updates last cost; option to print stickers for the received items.
- **Reports** (screen + print + CSV export): day summary, bill list (with cancelled and returns), bill detail, item-wise sales, category-wise, payment mode, cashier-wise, hourly, GST summary by rate and by HSN (GSTR-1 B2C/B2B and 3B figures), credit notes, cash in/out, day close history, stock movement.
- **Users and permissions**: roles owner / manager / cashier with a permission matrix (price override, discount limit, delete line, cancel bill, return, reprint, cash out, day close, stock adjust, view reports, settings).
- **Settings**: shop details, bill series, round-off, scan behaviour, printers, bill template preview, lock time, backup folder.

## Speed budgets (tested with 20,000 items, 1 year of bills at 600/day)
Scan to line < 100 ms; F2 search keystroke to results < 50 ms; bill save < 150 ms; save to print start < 300 ms; POS start to billing < 3 s; dashboard load < 1 s; day report < 2 s.

## Build steps (each: builder or ui-builder -> verifier PASS -> commit)
1. Core: billing maths (GST-inclusive split, discounts, round-off, MRP cap) with exhaustive tests incl. property tests against a reference calculation.
2. Core: bill save / number series / cancel / return / credit note / hold / draft; migration 004.
3. Core: day open/close, cash in/out, X/Z data; permissions model.
4. Core: print module (ESC/POS, TSPL/ZPL, GDI fallback), bill and sticker templates, spooler output; tests compare generated bytes to golden files.
5. Office UI: items, categories, barcode generate, CSV import; stock and adjustments; purchases.
6. POS UI: billing screen, search, payment, hold/recall, returns, reprint, day open/close, lock.
7. Office UI: dashboard, reports, users and permissions, settings, sticker printing.
8. Hardening: speed tests, crash/power-cut tests, 8-hour soak test (simulated 1,000 bills), installer test on a clean low-spec Windows 10 VM, side-by-side with POSBean.

## Acceptance (owner)
A cashier who knows POSBean can bill 20 mixed bills, hold/recall, do a return and close the day without help and without the mouse. Totals and GST match a hand calculation. Pulling the power plug mid-bill loses nothing that was saved and restores the bill in progress.

## Open (does not block steps 1-4)
Printer, sticker printer and scanner models; sticker size; bill paper width; does any customer need a GST (B2B) invoice.
