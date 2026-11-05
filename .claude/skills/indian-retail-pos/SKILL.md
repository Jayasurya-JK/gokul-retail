---
name: indian-retail-pos
description: How professional Indian retail POS software (GoFrugal RetailEasy, POSBean, Marg, Vyapar) works and what Indian law requires of a bill - counter workflows, F-key habits, item master, barcodes and weighing-scale codes, stock, day-end, cashier fraud controls, GST tax invoice fields (CGST Rule 46), B2C vs B2B, bill of supply, credit notes, e-invoice and e-way bill thresholds, GSTR-1 / GSTR-3B report shapes, record keeping. Use this whenever designing, building or reviewing billing, returns, printing, reports, users/permissions or tax logic for Gokul POS / Gokul Office, even if the task just says "bill" or "report".
---

# Indian retail POS - product and compliance knowledge

Aim: staff who know POSBean feel at home in one hour; the owner trusts the numbers; the CA accepts the reports. **Items marked (verify) must be confirmed with the owner's CA before going live** - put them behind settings.

## What commercial POS products all do (the baseline)
- **Counter**: scan or type code + Enter; F-key driven (search, qty, discount, hold/recall, payment, reprint); cursor never leaves the scan box; works offline; bill saves and prints in under a second; numeric keypad friendly; beep on error.
- **Item master**: code, barcode(s) (one item can have many), name, short name for print, local-language name, category/brand, HSN, GST rate, MRP, sale price(s), purchase cost, unit + conversions, reorder level, active flag.
- **Barcodes**: EAN-13 for branded goods; in-store codes use EAN-13 prefix 200-299 with a correct check digit. **Weighing-scale labels**: EAN-13 starting with a set prefix (e.g. 21-29) carrying PLU + weight or price - parse per scale settings.
- **Stock**: every sale/purchase/return/adjustment moves stock; stock-take with difference approval; low-stock list; stock value at cost.
- **Day-end**: opening cash, cash in/out, X report (mid-day, no reset) and Z report (closes the day); counted cash vs expected; payment mode split.
- **Controls against cashier fraud**: permission for line delete after scan, void/cancel, price override, discount above limit, reprint, refund; all logged with user and time; Z report numbering cannot be reset. Owners look at these first when cash is short.
- **Reports owners use daily**: day summary, bill list, item-wise sales, payment modes, cashier-wise, stock, low stock, profit (needs cost), GST summary. Everything exports to Excel/CSV; many shops also push to Tally.
- **Reliability habits**: auto backup, crash-safe saves, print spooler that never blocks billing, reprint from any bill, data import from Excel.

## GST invoice rules (verify with CA)
- A registered regular taxpayer issues a **Tax Invoice**; a composition taxpayer or seller of only exempt goods issues a **Bill of Supply** (no tax shown). Mixed carts need the right document - ask the owner which scheme applies.
- **Rule 46 particulars** (core): supplier name, address, GSTIN; invoice number (consecutive, unique per financial year, max 16 characters, letters/numbers/`-` `/` only); date; recipient name/address/GSTIN if registered (B2B); HSN; description; quantity and unit; total value; discount; taxable value; tax rate and amount split CGST + SGST (intra-state) or IGST; place of supply for inter-state; signature/digital signature (printed name acceptable on computer bills - verify).
- **B2C**: recipient details are not needed for small bills; for B2C bills of ₹50,000 or more, name, address and state are required (verify).
- **HSN digits** on invoices: 4 digits for annual turnover up to ₹5 crore, 6 above (verify current notification).
- **Credit note** for returns/discount after sale: own number series, must reference the original invoice, reported in GSTR-1; time limit for adjusting is 30 November after the financial year (verify). Never edit or delete a saved invoice - cancel or credit-note it.
- **E-invoice (IRN)**: only B2B, only above the aggregate turnover threshold (₹5 crore as of 2026 (verify)). B2C dynamic QR only for very large turnover. A small oil shop is very likely outside both - keep it as a future setting.
- **E-way bill**: needed when moving goods over a value limit (₹50,000 inter-state; Tamil Nadu intra-state limit (verify)). Relevant for bulk deliveries only.
- **Records**: keep books and invoices for 72 months (6 years) - backups and data retention must allow this.

## Report shapes the CA expects (verify layouts)
- **GSTR-1**: B2B invoices by GSTIN; B2C (small) summarised by rate and place of supply; credit/debit notes; HSN-wise summary (HSN, UQC unit, total qty, taxable value, tax by type); document summary (invoice number ranges issued and cancelled per series).
- **GSTR-3B**: outward taxable supplies (taxable value + tax by type), nil/exempt supplies, inward supplies with ITC (from purchase entries).
- Provide both as screen + Excel export, and totals must tie exactly to the bill register.

## Cashier UX norms that decide adoption
Same keys as their old software where possible; no confirmation popups for common actions; large total and change amount; fast fuzzy search incl. local-language names; scanning an item twice adds qty; recover the bill after a power cut; printing problems never lose a bill; one-key reprint. A feature that slows the counter in rush hour will be rejected, however clever.

## How to use this knowledge
When reviewing a spec or screen, check it against the baseline above and the GST rules; list gaps as MUST-fix (legal/money/fraud) or SHOULD (UX parity with POSBean/GoFrugal). Do not invent tax rates - leave them as settings with a (verify) note.
