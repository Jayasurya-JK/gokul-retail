# Feature menu - owner picks

Mark each line MUST (version 1), LATER, or NO. My suggestion is in brackets.
Phase 0 (skeleton) is always built first and needs no choice.

## Phase 0 - Skeleton (always, built first, test data only)
App shell and login screen, database with migrations, settings screen (shop name, GSTIN, address, bill footer), error log, daily auto-backup and restore, crash recovery, speed tests with 20,000 fake items.

## Billing counter
- [MUST] Scan barcode to add item; type item code or name to search
- [MUST] Change qty, loose sale by weight/volume (e.g. 2.5 L)
- [MUST] Payment: cash, UPI, card, split payment; change to return
- [MUST] Save and print bill (thermal), reprint last bill
- [MUST] Hold bill and recall (serve next customer meanwhile)
- [MUST] Line and bill discount (with limit per user)
- [MUST] Sales return / exchange against old bill
- [LATER] Customer name and phone on bill; customer credit (udhaar) ledger
- [LATER] Send bill on WhatsApp
- [LATER] Loyalty points
- [NO] Restaurant tables / KOT

## Items and barcodes
- [MUST] Item master: name, Tamil name, code, barcode, HSN, GST %, MRP, sale price, unit
- [MUST] Units and conversion: drum / tin / litre / pouch / kg
- [MUST] Print barcode stickers (name, price, MRP, packed date)
- [MUST] Weighing-scale barcode (price/weight embedded), if you sell loose oil this way
- [LATER] Batch and expiry per item
- [LATER] Price lists (retail / wholesale)

## Stock
- [MUST] Stock ledger: every sale, purchase, return, adjustment recorded
- [MUST] Live stock view, low stock alert
- [MUST] Repacking: drum to tins / pouches (stock moves from one item to another)
- [MUST] Stock-take: count, see difference, approve adjustment
- [MUST] Wastage / damage entry
- [LATER] Multi-godown / stock transfer

## Purchases and suppliers
- [MUST] Purchase entry (GRN) adding stock and cost
- [LATER] Supplier ledger and payments, purchase returns
- [LATER] Purchase order and reorder suggestion

## Reports
- [MUST] Day-end: sales by payment mode, cash in drawer, bill count
- [MUST] Item-wise sales, stock report
- [MUST] GST summary for filing (GSTR-1 / 3B figures, HSN summary)
- [LATER] Profit report (needs purchase cost)
- [LATER] Owner view on phone

## Control
- [MUST] User logins: owner / cashier roles; cashier cannot delete or change prices
- [MUST] Audit log of returns, discounts, price changes, deletes
- [LATER] Multiple counters on a LAN sharing one database

## Move from POSBean (done last)
- [LATER] Import items, stock, customers from POSBean export
- [LATER] Run side by side for 1-2 weeks

## Gokul Oils special features (owner decision 5 Nov 2026)

### NOW - build first (after the skeleton)
**A. Pressing / production**
- Seed stock (groundnut, sesame, copra...) in kg with purchase price
- Pressing batch: seed in (kg) -> oil out (L) + oil cake/punnakku out (kg); stock updates automatically
- Yield report: oil per kg seed, per machine, per day
- True cost per litre: seed + labour + power + packing
- Oil cake (punnakku) as its own stock item for sale

**B. Loose oil and packing**
- Loose sale by quantity ("1.5 L") or by amount ("Rs 200 worth"); customer's own can
- Bulk tank -> bottles/tins (e.g. 50 L tank -> 100 x 500ml); tank stock down, bottle stock up
- Packing material stock: empty bottles, caps, tins, labels, with low alerts
- Leakage / spill loss tracking
- Litre <-> kg conversion per oil (density per item)

### WAIT - owner will decide later
- C. One-step price change for all sizes from price per litre; price history; wholesale price
- D. Batch stickers: batch no, packed date, best before, MRP, net qty, FSSAI no; batch trace to seed supplier
- E. One stock for shop and WooCommerce website; online orders in the same list
- F. Refill WhatsApp reminders, tin/can deposit tracking, customer credit
- G. Festival/season planning, near-best-before alert
- H. Owner daily summary: sales, oil pressed, yield %, cash vs UPI, oil-wise profit

## Hard limit: shop computer is old and slow
The final software is one small Windows installer (.exe). Target: installer under 15 MB, under 150 MB RAM while billing, works on a low-end PC. See CLAUDE.md "Stack".

## Questions for you
1. Counter PC: Windows version? How many counters bill at the same time?
2. Printers: bill printer model (2 or 3 inch thermal?), sticker printer model, scanner model.
3. Do you sell loose oil by weight/volume? Do you use a weighing scale that prints barcodes?
4. Roughly how many items?
