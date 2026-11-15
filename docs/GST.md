# GST in Gokul Retail

What the software does for GST, and every point the shop's CA (auditor) must confirm. Everything marked **(confirm with CA)** is a rule, a
rate or a file layout that is not settled by the software alone.

## What is built
- **Rates are data.** Settings, Tax holds the list (default 0, 0.25, 3, 5, 12, 18, 28, 40). Items, bill lines and purchases are checked against it.
  Optional cess % per item, taken out of the GST-inclusive price. Money is integer paise; taxable = amount x 10000 / (10000 + rate bp + cess bp).
- **Place of supply.** Shop state from Settings (33 Tamil Nadu). Customer state and GSTIN (pattern, state code, check character, state prefix).
  Same state = CGST + SGST (odd paisa to SGST, split on the running total per rate so lines add up to the slab). Other state = IGST.
  Walk-in = local. The bill stores place of supply, intra/inter, and the buyer's GSTIN and address as they were that day.
- **Invoices.** Thermal (58/80 mm) and A4 with the Rule 46 particulars, HSN/rate summary, amount in words, reverse charge "No", signature.
  Bill of supply only when every line is 0% and no cess. Consumer bills keep the familiar counter-bill layout.
- **Credit notes.** Own series (CN-yy-nnnnnn), against the original invoice number and date, recipient GSTIN, place of supply, tax reversed
  per rate (IGST variant). Cannot be deleted.
- **HSN.** Item HSN (4/6/8 digits, "missing HSN" filter), HSN helper (keyword dictionary, confidence, suggested rate, bulk confirm, Excel/CSV import with preview).
- **Returns.** Office, GST returns: GSTR-1 (Excel one sheet per section, JSON in the offline-tool layout), GSTR-3B (screen + Excel), HSN table 12.
  Every total is checked on screen against the bills and credit notes.
- Existing bills are not rewritten. Migration 19 only adds columns and fills the per-line tax split of old lines with the same engine that wrote them.

## Confirm with CA
1. **Rate list and slabs** after 22 Sep 2025: 0, 5, 18, 40 main; 0.25 and 3 special; 12 and 28 kept for old bills. Every suggested rate in the HSN helper is a hint only.
2. **Edible oils, oil cake, pulses, rice, flours, jaggery, salt:** which are 0% (unbranded) and which 5% (pre-packed, branded). The oil items billed at 0% in the old data need review.
3. **HSN digits:** 4 up to Rs 5 crore turnover, 6 above. The dictionary uses 4 digits for most goods.
4. **Camphor (karpooram)** is suggested as 2914 (tariff heading for camphor); the brief listed 2906 (cyclic alcohols). Kumkum, vibhuti, pooja items, lamp oil, empty bottles/tins: classification varies.
5. **Consumer bills of Rs 50,000 or more** print the buyer's name, address and state (full invoice layout).
6. **B2CL threshold** Rs 1,00,000 inter-state to an unregistered buyer (since 1 Aug 2024).
7. **Nil/exempt/non-GST:** every 0% line is reported as nil rated (table 8); no split into exempt and non-GST.
8. **Credit notes to consumers** (not against a B2CL invoice) are taken off the B2CS rows of the month; CDNR for registered buyers; CDNUR only against B2CL.
9. **HSN summary (table 12)** is net of credit notes and split B2B / B2C; UQC codes used: KGS, GMS, LTR, MLT, PCS, BTL, PAC, CAN (tin), OTH.
10. **GSTR-1 JSON** layout version `GST3.0.4` with `hsn_b2b` / `hsn_b2c`; `gt` and `cur_gt` are written as 0. Compare with the version the portal's offline tool asks for.
11. **GSTR-3B:** input credit from purchase bills of the month; set-off IGST -> CGST -> SGST (CGST and SGST credit against their own head, then IGST); Rule 86B, interest and late fee are not worked out.
12. **Amount in words / declaration wording** on the invoice, and printing "Original for recipient" only.
13. **Document summary (table 13):** one range per financial year from the first to the last number in the month; cancelled bills counted as cancelled.
14. **E-invoice and e-way bill** are not implemented (turnover limits to be confirmed).
15. **Old POSBean-style data** (not imported): the 72 inter-state bills carrying both CGST and IGST, 0.10% items, the 28% items.
