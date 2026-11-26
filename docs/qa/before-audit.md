# Overlap and clarity audit

Generated 2026-11-26 12:06 by `tools/qa/overlap-audit.mjs`.

Pages checked: POS 252, Office 192 (every route, plus tab views, dialogs and the More menu, at 1280x720, 1366x768, 1536x864 and 1920x1080; POS with no bill, an open bill and a held bill).

Rules: grey text that staff read (labels, tab names, headings, table headings, buttons, numbers) must be >= 7:1; every other text >= 4.5:1; coloured meaning text >= 4.5:1; disabled text exempt. Content overflow, ellipsis-cut labels, intersecting siblings and anything outside the window sideways are findings.

## Summary

| App | Findings | overflow | clipped | label-truncated | overlap | outside-viewport | page-scroll | contrast | Quiet text (< 7:1) share |
|---|---|---|---|---|---|---|---|---|---|
| POS | **652** | 24 | 12 | 15 | 8 | 0 | 0 | 593 | 12.7% |
| Office | **1788** | 66 | 4 | 71 | 14 | 0 | 0 | 1633 | 23.7% |

"Findings" counts one per element per screen (the same element at several window sizes is one finding).

## POS

| Screen | Type | Element | Detail | Seen at |
|---|---|---|---|---|
| /billing | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (delivery dialog) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `button.inline-flex.items-center.justify-center.rounded-co "Cancel this bill Enter"` | 4.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `kbd.inline-flex.h-[18px].min-w-[18px].items-center.jus "Enter"` | 4.05:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (delivery dialog) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (delivery dialog) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (delivery dialog) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.border-b.border-line.bg-surface-2.px-3.py-1.5.text "MORE"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (More menu open) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (More menu open) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (More menu open) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (More menu open) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (More menu open) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (More menu open) | overflow | `div.relative "More MORE Stock Alt+7 Return"` | content 256px spills out of a 94px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (pay dialog) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (pay dialog) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (pay dialog) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (pay dialog) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.pointer-events-none.absolute.left-4.top-1/2.-trans "₹"` | 3.83:1, needs 4.5:1 (grey text, 24px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.text-sm.font-semibold.text-success "Change to give back"` | 3.00:1, needs 4.5:1 (colour label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.text-sm.text-subtle "Nothing taken yet. Type the "` | 3.63:1, needs 4.5:1 (grey text, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (pay dialog) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (pay dialog) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (pay dialog) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (recent bills) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (recent bills) | contrast | `span.num.w-16.text-muted "5:27 pm"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (recent bills) | contrast | `span.num.font-semibold.text-subtle.line-through "GK-049725"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (recent bills) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.num.w-16.text-muted "5:29 pm"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /billing (recent bills) | contrast | `span.num.w-16.text-muted "5:30 pm"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (recent bills) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | contrast | `span.num.w-16.text-muted "5:32 pm"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (recent bills) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (recent bills) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (shortcuts sheet) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (shortcuts sheet) | contrast | `h3.mb-1.5.text-[11px].font-semibold.uppercase.trackin "ADDING ITEMS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.text-[11px].text-subtle "or"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `h3.mb-1.5.text-[11px].font-semibold.uppercase.trackin "EDITING A ROW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `h3.mb-1.5.text-[11px].font-semibold.uppercase.trackin "FINISHING"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `h3.mb-1.5.text-[11px].font-semibold.uppercase.trackin "GO TO"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `button.inline-flex.items-center.justify-center.rounded-co "Cancel this bill Enter"` | 4.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `kbd.inline-flex.h-[18px].min-w-[18px].items-center.jus "Enter"` | 4.05:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (shortcuts sheet) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (shortcuts sheet) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO."` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (staff dialog) | contrast | `span.flex-1.text-muted "No staff"` | 6.51:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (staff dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (staff dialog) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `button.inline-flex.items-center.justify-center.rounded-co "Cancel this bill Enter"` | 4.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `kbd.inline-flex.h-[18px].min-w-[18px].items-center.jus "Enter"` | 4.05:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (staff dialog) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (staff dialog) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (staff dialog) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO. WHOLESALE"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.rounded.bg-accent/25.px-1.5.py-px.text-[10px].font "WHOLESALE"` | 4.03:1, needs 4.5:1 (colour label/number, 10px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1366 no bill, 1536 no bill, 1920 no bill |
| /billing (wholesale on) | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "1"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "101"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span "Loose, by weight"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.inline-block.rounded.border.border-dashed.border-l "+ Disc"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "2"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.num.rounded.bg-surface-3.px-1.text-[11px].font-med "200"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "26.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1366 open bill, 1536 open bill, 1920 open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-right.text-sm.text-muted.num.min-[1700px "5%"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.min-w-0.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.min-w-0.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.min-w-0.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 10px) | 1280 open bill, 1280 held + open bill, 1366 open bill, 1366 held + open bill, 1536 open bill, 1536 held + open bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-center.text-sm.text-subtle.num.min-[1700 "3"` | 3.24:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `div.px-2.text-right.text-sm.num.min-[1700px]:text-base "25.000"` | 6.51:1, needs 7:1 (grey label/number, 13px) | 1280 held + open bill, 1366 held + open bill, 1536 held + open bill, 1920 held + open bill |
| /billing (wholesale on) | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /billing (wholesale on) | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /billing (wholesale on) | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `div.mt-0.5.text-xs.text-subtle "3 entries"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `div.mt-0.5.text-xs.text-subtle "Already taken off the day-cl"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.num.whitespace-nowrap "₹1,000"` | 3.13:1, needs 4.5:1 (colour label/number, 24px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.mr-[0.08em] "₹"` | 3.13:1, needs 4.5:1 (colour label/number, 24px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `div.mt-0.5.text-xs.text-subtle "UPI and bank expenses: ₹0"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `button.flex.h-11.items-center.justify-center.gap-2.rounde "Cash added F4"` | 6.92:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.pointer-events-none.absolute.left-3.5.top-1/2.-tra "₹"` | 3.83:1, needs 7:1 (grey label/number, 24px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.flex.items-center.gap-1.text-subtle "Left Right change Enter next"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /cash | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /cash | label-truncated | `span.truncate.pr-3.text-sm.text-muted "Lakshmi Rajan"` | "Lakshmi Rajan" cut with an ellipsis (30px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill |
| /cash | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "PI"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `div.num.mt-0.5.truncate.text-xs.text-muted "93977 27704 - Gandhipuram"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.num.whitespace-nowrap.text-sm.font-semibold.text-w "₹4,000.00"` | 4.25:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.mr-[0.08em] "₹"` | 4.25:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SC"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "VI"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "DN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "NS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "JN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GC"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "PS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GR"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "AD"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.text-[11px].text-subtle "No dues"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "BG"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "BM"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "BP"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "BR"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "BS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GD"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GG"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "GN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KC"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KI"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KP"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KR"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "KK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "LD"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MI"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MP"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MM"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "MS"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "ND"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "NK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "NN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "NP"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "PN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "RG"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SI"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SD"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "SP"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "VK"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.flex.h-9.w-9.shrink-0.items-center.justify-center. "VN"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `div.mt-0.5.h-4.truncate.text-xs.text-subtle "7 visits"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `div.mt-0.5.h-4.truncate.text-xs.text-subtle "Last 26 Nov 2026, 04:53 pm"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "FATHER NAME"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dd.mt-0.5.truncate.text-sm.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "DATE OF BIRTH"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "ANNIVERSARY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "GST"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "PAN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "LOCALITY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "ROUTE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "CREDIT LIMIT"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "CREDIT DAYS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `dt.text-[11px].font-semibold.uppercase.tracking-wider "OPENING BALANCE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `div.ml-auto.text-right.text-xs.text-subtle "Needs 100 points to use Earn"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `b.num.w-16.text-right.text-success "+101.45"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `b.num.w-16.text-right.text-success "+144.93"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `b.num.w-16.text-right.text-success "+478.28"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "On credit"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /customers | contrast | `div.mt-0.5.h-4.truncate.text-xs.text-subtle "Last 26 Nov 2026, 04:54 pm"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1366 no bill, 1366 open bill, 1366 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | contrast | `div.mt-0.5.h-4.truncate.text-xs.text-subtle "Last 26 Nov 2026, 04:55 pm"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /customers | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /customers | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.whitespace-nowrap "1,000"` | 3.30:1, needs 4.5:1 (colour label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.whitespace-nowrap "0"` | 3.30:1, needs 4.5:1 (colour label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.whitespace-nowrap "₹0"` | 3.83:1, needs 7:1 (grey label/number, 32px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.mr-[0.08em] "₹"` | 3.83:1, needs 7:1 (grey label/number, 32px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `div.mt-1.5.text-xs.text-subtle "Fill in the count below"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-center.text-muted "×"` | 6.51:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-center.text-muted "="` | 6.51:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.flex.h-8.min-w-[64px].items-center.justify-center. "Coins"` | 6.92:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle "type the rupee total"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.font-semibold.uppercase.tracking-wider.tex "TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Live"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "56%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "39%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "2%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "4%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /day-close | contrast | `div.mb-1.mt-4.text-[11px].font-semibold.uppercase.trac "RETURNS, CANCELS, DISCOUNTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `div.mb-1.mt-4.text-[11px].font-semibold.uppercase.trac "DRAWER MOVEMENTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.whitespace-nowrap "₹1,000"` | 3.30:1, needs 4.5:1 (colour label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `div.mb-1.mt-4.text-[11px].font-semibold.uppercase.trac "EXPENSES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `div.mb-1.mt-4.text-[11px].font-semibold.uppercase.trac "GST COLLECTED"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span "GST"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-right "TAXABLE"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-right "CGST"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-right "SGST"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "53%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "42%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.text-xs.text-subtle.num "3%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-close | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.text-center.text-muted "×"` | 6.51:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.text-center.text-muted "="` | 6.51:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.num.whitespace-nowrap "₹0"` | 3.24:1, needs 7:1 (grey label/number, 20px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.mr-[0.08em] "₹"` | 3.24:1, needs 7:1 (grey label/number, 20px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.flex.h-8.min-w-[64px].items-center.justify-center. "Coins"` | 6.92:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.text-xs.text-subtle "type the rupee total"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.text-xs.font-semibold.uppercase.tracking-wider.tex "TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.flex.items-center.justify-end.gap-1.text-xs.text-s "F3 use"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /day-open | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /day-open | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "Point of Sale Alt+1 Next bil"` | content 616px in a 600px box, no ellipsis | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "Bills Alt+4 40 bills today L"` | content 308px in a 292px box, no ellipsis | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "Customer Alt+8 13 today 11 o"` | content 308px in a 292px box, no ellipsis | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "Stock Alt+7 16 items low Nee"` | content 308px in a 292px box, no ellipsis | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "More Returns, expenses, day "` | content 308px in a 292px box, no ellipsis | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | clipped | `button.relative.flex.min-h-[110px].min-w-0.cursor-default "Bills Alt+4 41 bills today L"` | content 468px in a 452px box, no ellipsis | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.num.text-sm.text-muted "Thursday, 26 November 2026 ·"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.min-w-0.flex-1.truncate.font-semibold.tracking-tig "Point of Sale"` | 6.75:1, needs 7:1 (grey label/number, 28px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.text-sm.text-white/80 "Next bill"` | 4.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-[60px].min-[1600px]:text-[104px].font-sem "GK-049737"` | 6.75:1, needs 7:1 (grey label/number, 60px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `div.mt-3.flex.items-center.gap-2.text-md.min-[1600px]: "Counter 1 open Press Enter"` | 5.81:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.ml-2.inline-flex.items-center.gap-1.5.rounded-md.b "Press Enter"` | 4.23:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.min-w-0.flex-1.truncate.font-semibold.tracking-tig "Sales Report"` | 6.75:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-[34px].min-[1600px]:text-[54px].font-semi "₹1,12,686"` | 6.75:1, needs 7:1 (grey label/number, 34px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `div.num.mt-2.text-sm.font-medium.text-[rgb(var(--on-ti "▼ 17% vs yesterday"` | 4.29:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `span.min-w-0.flex-1.truncate.font-semibold.tracking-tig "Paymode Report"` | 5.64:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.rounded-md.bg-black/20.px-1.5.py-0.5.text-xs.font- "Alt+6"` | 6.12:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.num.text-[30px].min-[1600px]:text-[54px].font-semi "₹1,12,842"` | 5.64:1, needs 7:1 (grey label/number, 30px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `span.num.text-sm.min-[1600px]:text-md.text-white/80 "today, by how paid"` | 4.23:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "Cash 56%"` | 4.56:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "UPI 39%"` | 4.56:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "Card 2%"` | 4.56:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "Credit 4%"` | 4.56:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `span.text-sm.font-normal.text-white/80 "bills today"` | 5.47:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "Last bill 5:27 pm"` | 5.47:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /home | contrast | `span.text-sm.font-normal.text-white/80 "today"` | 5.39:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "11 owe ₹24,878"` | 5.39:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.min-w-0.flex-1.truncate.font-semibold.tracking-tig "Stock"` | 5.47:1, needs 7:1 (grey label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.rounded-md.bg-black/20.px-1.5.py-0.5.text-xs.font- "Alt+7"` | 6.00:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-2xl.min-[1600px]:text-[46px].font-semibol "16 items low"` | 5.47:1, needs 7:1 (grey label/number, 32px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.text-sm.font-normal.text-white/80 "items low"` | 4.17:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "Needs a look"` | 4.17:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "Last bill 5:29 pm"` | 5.47:1, needs 7:1 (grey label/number, 13px) | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "Last bill 5:30 pm"` | 5.47:1, needs 7:1 (grey label/number, 13px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /home | contrast | `div.num.text-[60px].min-[1600px]:text-[104px].font-sem "GK-049738"` | 6.75:1, needs 7:1 (grey label/number, 104px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-[34px].min-[1600px]:text-[54px].font-semi "₹1,17,590"` | 6.75:1, needs 7:1 (grey label/number, 54px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.mt-2.text-sm.font-medium.text-[rgb(var(--on-ti "▼ 14% vs yesterday"` | 4.29:1, needs 4.5:1 (colour label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.num.text-[30px].min-[1600px]:text-[54px].font-semi "₹1,17,746"` | 5.64:1, needs 7:1 (grey label/number, 54px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "Cash 53%"` | 4.56:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "UPI 42%"` | 4.56:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.inline-flex.items-center.gap-1.5 "Credit 3%"` | 4.56:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `div.num.text-sm.min-[1600px]:text-md.text-white/80.mt- "Last bill 5:32 pm"` | 5.47:1, needs 7:1 (grey label/number, 16px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /home | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:28 pm Thu"` | content 1376px in a 1280px box, no ellipsis | 1280 no bill, 1280 open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:29 pm Thu"` | content 1376px in a 1280px box, no ellipsis | 1280 held + open bill, 1366 no bill, 1366 open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:30 pm Thu"` | content 1462px in a 1366px box, no ellipsis | 1366 held + open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:31 pm Thu"` | content 1632px in a 1536px box, no ellipsis | 1536 no bill, 1536 open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:32 pm Thu"` | content 1632px in a 1536px box, no ellipsis | 1536 held + open bill, 1920 no bill, 1920 open bill |
| /lock | clipped | `div.relative.flex.h-full.w-full.flex-col.overflow-hidd "P Gokul Oils POS 5:33 pm Thu"` | content 2016px in a 1920px box, no ellipsis | 1920 held + open bill |
| /lock | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 34px spills out of a 30px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.flex.items-center.gap-1.5.text-xs.text-subtle "F2 search items - 5*101 five"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.mx-1 "-"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `div.flex.items-center.gap-1.5.text-[11px].font-semibol "BILL NO. POS 1"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.flex.items-center.gap-1.5.text-[11px].font-semibol "CUSTOMER F11"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `button.flex.items-center.gap-1.rounded-md.px-2.py-1.text- "Same state · CGST + SGST"` | 3.00:1, needs 4.5:1 (colour label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `div.py-0.5.text-xs.text-subtle "No tax yet"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.text-[11px].font-semibold.uppercase.tracking-[0.14 "GRAND TOTAL"` | 4.27:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.num.whitespace-nowrap "₹0.00"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.mr-[0.08em] "₹"` | 6.92:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.opacity-60 ".00"` | 2.77:1, needs 7:1 (grey label/number, 36px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /pos1 | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /pos1 | label-truncated | `span.block.truncate "Cash discount"` | "Cash discount" cut with an ellipsis (18px short) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /pos1 | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | contrast | `span.num.px-2.text-muted "5:27 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /reports/paymode | contrast | `span.rpt-empty "–"` | 1.38:1, needs 4.5:1 (grey text, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/paymode | contrast | `span.num.px-2.text-muted "5:29 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /reports/paymode | contrast | `span.num.px-2.text-muted "5:30 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/paymode | contrast | `span.num.px-2.text-muted "5:32 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/paymode | overlap | `div.flex-1 "GK-049736 5:27 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 1,12,686.00 62,635."` | 1280x44px | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /reports/paymode | overlap | `div.flex-1 "GK-049736 5:29 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 1,12,686.00 62,635."` | 1366x44px | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /reports/paymode | overlap | `div.flex-1 "GK-049736 5:30 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 1,12,686.00 62,635."` | 1536x44px | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/paymode | overlap | `div.flex-1 "GK-049737 5:32 pm Walk-in Ra"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "41 bills 1,17,590.00 62,635."` | 1920x44px | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/sales | contrast | `span.num.px-2.text-muted "5:27 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /reports/sales | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/sales | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/sales | contrast | `span.num.px-2.text-muted "5:29 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /reports/sales | contrast | `span.num.px-2.text-muted "5:30 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/sales | contrast | `span.num.px-2.text-muted "5:32 pm"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/sales | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/sales | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/sales | overlap | `div.flex-1 "GK-049736 5:27 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 132.500 1,12,686.00"` | 1280x44px | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /reports/sales | overlap | `div.flex-1 "GK-049736 5:29 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 132.500 1,12,686.00"` | 1366x44px | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /reports/sales | overlap | `div.flex-1 "GK-049736 5:30 pm Walk-in Ka"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "40 bills 132.500 1,12,686.00"` | 1536x44px | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/sales | overlap | `div.flex-1 "GK-049737 5:32 pm Walk-in Ra"  x  div.sticky.bottom-0.z-10.grid.h-11.items-center.border "41 bills 142.500 1,17,590.00"` | 1920x44px | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "STAFF"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "BILLS"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/staff | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/staff | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.truncate.px-2.text-xs.text-muted "8904000002144"` | 6.97:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "281.00"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "228.00"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.px-2.text-right.text-muted "16.2"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "37.00"` | 2.99:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "9,576.00"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "1,554.00"` | 6.97:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "1.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "56.86"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.11"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "8.29"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "12.10"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "11.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "29.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "51.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "1.57"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "173.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "34.62"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "35.08"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "168.79"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "495.77"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.41"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "18.14"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "13.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "17.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.10"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "79.62"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "43.29"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "44.61"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "213.80"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "628.81"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "9.40"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "22.90"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "10.60"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "16.31"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "6.67"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "10.33"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "0.86"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "38.57"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "41.23"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "9.51"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "22.20"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "35.14"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "15.52"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "13.64"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "14.13"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "67.83"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "199.26"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.99"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.29"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "21.19"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "20.67"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "24.48"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "22.76"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "13.33"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "71.29"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "72.94"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "350.15"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "1,029.26"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "15.49"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "37.60"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "13.88"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "19.60"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "26.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "10.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "47.86"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "48.58"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "233.65"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "686.40"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "25.02"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "12.11"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "17.83"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "11.05"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "8.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "4.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "11.70"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.90"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "12.75"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "8.75"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "16.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.43"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "5.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.89"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "21.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "38.19"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "39.18"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "187.98"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "552.69"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "8.34"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "20.12"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "22.79"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "23.02"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "110.74"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "325.31"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "4.88"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "11.88"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "30.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "63.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "25.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "0.79"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "8.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "28.95"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "19.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "4.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "6.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.50"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "3.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "6.19"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "12.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "3.81"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "7.62"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "12.57"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "20.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "24.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "19.33"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "18.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "22.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.whitespace-nowrap "2.67"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "ITEMS"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "COST TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "PROFIT TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.text-md.font-semibold.text-success "₹2,38,884"` | 3.13:1, needs 4.5:1 (colour label/number, 16px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.text-[11px].font-semibold.uppercase.tracking-wider "SALES TOTAL"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /reports/stock | label-truncated | `span.truncate.px-2.text-muted "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (23px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | label-truncated | `span.truncate.px-2.text-muted "Pandian Jaggery Works"` | "Pandian Jaggery Works" cut with an ellipsis (32px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | label-truncated | `span.truncate.px-2.text-muted "Wood-pressed oils"` | "Wood-pressed oils" cut with an ellipsis (4px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | label-truncated | `span.truncate.px-2.text-muted "Vinayaga Packaging"` | "Vinayaga Packaging" cut with an ellipsis (10px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | label-truncated | `span.truncate.px-2.text-muted "Jaggery & sweeteners"` | "Jaggery & sweeteners" cut with an ellipsis (23px short) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /reports/stock | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /returns | contrast | `span.pointer-events-none.absolute.right-3.top-1/2.flex. "Enter find"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /returns | contrast | `span.num.w-20.text-xs.text-muted "5:27 pm"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill |
| /returns | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /returns | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /returns | contrast | `span.num.w-20.text-xs.text-muted "5:29 pm"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /returns | contrast | `span.num.w-20.text-xs.text-muted "5:30 pm"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1536 no bill, 1536 open bill, 1536 held + open bill |
| /returns | contrast | `span.num.w-20.text-xs.text-muted "5:32 pm"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /returns | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /returns | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `div.h-4.text-xs.text-subtle "1 cancelled"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `div.h-4.text-xs.text-subtle "None"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.text-subtle "(click to filter bills)"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.shrink-0.text-subtle "·"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.num.shrink-0.font-semibold.text-subtle.line-throug "GK-049725"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.min-w-0.truncate.font-medium.text-subtle.line-thro "Walk-in"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.num.whitespace-nowrap.text-base.font-semibold.text "₹156.00"` | 3.83:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.mr-[0.08em] "₹"` | 3.83:1, needs 7:1 (grey label/number, 14px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.text-xs.font-normal.text-subtle "tin"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `button.inline-flex.items-center.justify-center.rounded-co "Cancel bill F6"` | 4.83:1, needs 7:1 (grey label/number, 13px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `kbd.inline-flex.h-[18px].min-w-[18px].items-center.jus "F6"` | 4.05:1, needs 7:1 (grey label/number, 11px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.font-semibold.uppercase.tracking-wider.text-subtle "TOTAL SALES"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.num.text-subtle "(40 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill |
| /sales | contrast | `div.mb-2.shrink-0.text-center.text-[11px].font-semibol "RECEIPT PREVIEW - 80 MM"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.text-xs.font-normal.text-subtle "btl"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.text-xs.font-normal.text-subtle "l"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.text-xs.font-normal.text-subtle "kg"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.num.ml-2.text-xs.font-normal.text-subtle "UPI1529055246"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | contrast | `span.num.text-subtle "(41 bills today)"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | overflow | `span.relative.inline-flex.shrink-0. "P"` | content 28px spills out of a 24px box | 1280 no bill, 1280 open bill, 1280 held + open bill, 1366 no bill, 1366 open bill, 1366 held + open bill, 1536 no bill, 1536 open bill, 1536 held + open bill, 1920 no bill, 1920 open bill, 1920 held + open bill |
| /sales | overflow | `div.flex.min-h-0.min-w-0.flex-1.flex-col "GK-049736 Paid 26 Nov 2026, "` | content 766px spills out of a 644px box | 1366 no bill, 1366 open bill, 1366 held + open bill |
| /sales | overflow | `div.flex.shrink-0.items-center.gap-2.border-t.border-l "Reprint bill Ctrl+P Tax invo"` | content 766px spills out of a 644px box | 1366 no bill, 1366 open bill, 1366 held + open bill |

## Office

| Screen | Type | Element | Detail | Seen at |
|---|---|---|---|---|
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span "Yesterday ₹1,36,134 (full da"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.num.whitespace-nowrap "₹1,36,134"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-[0.08em] "₹"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span "Yesterday 49"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.inline-flex.items-center.gap-0.5.font-semibold.tex "3.2%"` | 3.30:1, needs 4.5:1 (colour label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span "vs yesterday"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-1.5.text-xs.text-subtle.num "1"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-1.5.text-xs.text-subtle.num "2"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-1.5.text-xs.text-subtle.num "3"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-1.5.text-xs.text-subtle.num "4"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.mr-1.5.text-xs.text-subtle.num "5"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Critical"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "UPI"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "CASH"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| / | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| / | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.rounded-full.px-2.py-0.5.text-xs.num.bg-primary-fg "132"` | 6.26:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "76"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "41"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "1"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "6"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "2"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "42"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "7"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "4"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "14"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "8"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.min-w-[32px].rounded-full.px-2.py-0.5.text-center. "23"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "On"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /categories | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /categories | label-truncated | `span.truncate.font-medium.text-ink "Groundnut Oil (Loose)"` | "Groundnut Oil (Loose)" cut with an ellipsis (3px short) | 1280, 1366 |
| /categories | label-truncated | `span.block.truncate.text-muted "Wood-pressed oils"` | "Wood-pressed oils" cut with an ellipsis (6px short) | 1280, 1366, 1536, 1920 |
| /categories | label-truncated | `span.block.truncate.text-muted "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (33px short) | 1280, 1366, 1536, 1920 |
| /categories | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.font-medium.text-muted "Total outstanding"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.mt-1.text-xs.text-subtle "6 customers · 24%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.mt-1.text-xs.text-subtle "7 customers · 23%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.mt-1.text-xs.text-subtle "7 customers · 22%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.mt-1.text-xs.text-subtle "6 customers · 31%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Gandhipuram"` | 3.24:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap.font-semibold.text-danger "₹1,271"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.mr-[0.08em] "₹"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Saravanampatti"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.text-line-strong "-"` | 1.47:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Ramanathapuram"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "RS Puram"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Singanallur"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Ganapathy"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.ml-1.5.text-xs.text-subtle "Pandian Provision Stores"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.mt-2.text-xs.text-subtle "No reminder sent yet. Last p"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 4,000"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "4,000"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 3,181"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "3,181"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 1,795"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "1,795"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 1,271"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "1,271"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.font-medium.text-success "-5,129.00"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "5,129.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 0"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "0"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `div.text-xs.text-subtle "Bal 5,129"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span.num.whitespace-nowrap "5,129"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /collections | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /collections | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Credit"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With dues"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Business"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Inactive"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No name (needs cleanup) 0"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "AD"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.ml-1.5.text-xs.text-subtle "Pandian Provision Stores"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BG"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BP"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.ml-1.5.text-xs.text-subtle "Murugan Idli Kadai"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KR"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LD"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1366, 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1536, 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "ND"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NK"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers | contrast | `span.ml-1.5.text-xs.text-subtle "Kovai Sweets and Snacks"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NS"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers | label-truncated | `span.min-w-0.truncate "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (4px short) | 1280 |
| /customers | label-truncated | `span.min-w-0.truncate "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (12px short) | 1280 |
| /customers | label-truncated | `span.min-w-0.truncate "Karthikeyan Chettiar"` | "Karthikeyan Chettiar" cut with an ellipsis (9px short) | 1280 |
| /customers | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /customers | overlap | `span.font-medium.text-ink "Karthikeyan Pillai"  x  span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 5x15px | 1280 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Credit"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With dues"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Business"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Inactive"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No name (needs cleanup) 0"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "AD"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.ml-1.5.text-xs.text-subtle "Pandian Provision Stores"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BG"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BP"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.ml-1.5.text-xs.text-subtle "Murugan Idli Kadai"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KR"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LD"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1366, 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1536, 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "ND"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NK"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Overview] | contrast | `span.ml-1.5.text-xs.text-subtle "Kovai Sweets and Snacks"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Overview] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NS"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Overview] | label-truncated | `span.min-w-0.truncate "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (4px short) | 1280 |
| /customers [Overview] | label-truncated | `span.min-w-0.truncate "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (12px short) | 1280 |
| /customers [Overview] | label-truncated | `span.min-w-0.truncate "Karthikeyan Chettiar"` | "Karthikeyan Chettiar" cut with an ellipsis (9px short) | 1280 |
| /customers [Overview] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /customers [Overview] | overlap | `span.font-medium.text-ink "Karthikeyan Pillai"  x  span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 5x15px | 1280 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Credit"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With dues"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Business"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Inactive"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No name (needs cleanup) 0"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "AD"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.ml-1.5.text-xs.text-subtle "Pandian Provision Stores"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BG"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BP"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.ml-1.5.text-xs.text-subtle "Murugan Idli Kadai"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KR"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LD"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.text-[11px].text-subtle "11:22 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Earned"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `b.num.text-right.text-success "+195.77"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.text-[11px].text-subtle "11:40 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `b.num.text-right.text-success "+156.62"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `div.text-[11px].text-subtle "11:29 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `b.num.text-right.text-success "+430.69"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1366, 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1536, 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "ND"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NK"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Points] | contrast | `span.ml-1.5.text-xs.text-subtle "Kovai Sweets and Snacks"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Points] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NS"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Points] | label-truncated | `span.min-w-0.truncate "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (4px short) | 1280 |
| /customers [Points] | label-truncated | `span.min-w-0.truncate "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (12px short) | 1280 |
| /customers [Points] | label-truncated | `span.min-w-0.truncate "Karthikeyan Chettiar"` | "Karthikeyan Chettiar" cut with an ellipsis (9px short) | 1280 |
| /customers [Points] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /customers [Points] | overlap | `span.font-medium.text-ink "Karthikeyan Pillai"  x  span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 5x15px | 1280 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Credit"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With dues"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Business"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Inactive"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No name (needs cleanup) 0"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "AD"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.ml-1.5.text-xs.text-subtle "Pandian Provision Stores"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BG"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BP"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.ml-1.5.text-xs.text-subtle "Murugan Idli Kadai"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 5.70:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KR"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LD"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MI"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Returned"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1366, 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1536, 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "ND"` | 4.60:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NK"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Purchase history] | contrast | `span.ml-1.5.text-xs.text-subtle "Kovai Sweets and Snacks"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Purchase history] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NS"` | 3.19:1, needs 7:1 (grey label/number, 10px) | 1920 |
| /customers [Purchase history] | label-truncated | `span.min-w-0.truncate "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (4px short) | 1280 |
| /customers [Purchase history] | label-truncated | `span.min-w-0.truncate "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (12px short) | 1280 |
| /customers [Purchase history] | label-truncated | `span.min-w-0.truncate "Karthikeyan Chettiar"` | "Karthikeyan Chettiar" cut with an ellipsis (9px short) | 1280 |
| /customers [Purchase history] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /customers [Purchase history] | overlap | `span.font-medium.text-ink "Karthikeyan Pillai"  x  span.ml-1.5.text-xs.text-subtle "Velavan Traders"` | 5x15px | 1280 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span "11 entries"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span "Taken off the day-close cash"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span "Paid by UPI"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span "Cheque or transfer"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Unloading groundnut lorry"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Bringing seeds from market"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Tea for staff"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Tea"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Labels and cartons"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "UPI"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Salary advance"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Mill electricity bill"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Bank"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Delivery to Pollachi"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Godown rent"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span.ml-1.5.text-xs.text-subtle "Unloading sesame"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "1 entry - 55%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "1 entry - 19%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "2 entries - 7%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "1 entry - 7%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "1 entry - 6%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "2 entries - 5%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `div.mt-0.5.text-xs.text-subtle "3 entries - 1%"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /expenses | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /expenses | label-truncated | `div.truncate.px-2 "Lakshmi Rajan"` | "Lakshmi Rajan" cut with an ellipsis (4px short) | 1280, 1366, 1536, 1920 |
| /expenses | label-truncated | `div.truncate.px-2 "Packing material"` | "Packing material" cut with an ellipsis (9px short) | 1280 |
| /expenses | label-truncated | `div.truncate.px-2 "Suresh Kumar"` | "Suresh Kumar" cut with an ellipsis (2px short) | 1280, 1366, 1536, 1920 |
| /expenses | label-truncated | `div.truncate.px-2 "Salary advance"` | "Salary advance" cut with an ellipsis (2px short) | 1280 |
| /expenses | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "GSTR-3B"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "HSN summary (table 12)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Totals tie to the bills and "` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.text-[11px].font-semibold.uppercase.tracking-wider "INVOICES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.text-[11px].font-semibold.uppercase.tracking-wider "TAXABLE VALUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.text-[11px].font-semibold.uppercase.tracking-wider "TAX PAYABLE ON SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `div.text-[11px].font-semibold.uppercase.tracking-wider "B2B / B2CL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "B2B (85)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "B2CL (0)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "B2CS (3)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Credit notes (0)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Documents"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Checks and notes"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /gst | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /gst | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Loose"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "OK"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span "Reorder at 60.000 L"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "GK-049666"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "Yesterday 01:40 pm"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "GK-049654"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "Yesterday 11:21 am"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "GK-049632"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "24 Nov 03:35 pm"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "GK-049626"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "24 Nov 02:15 pm"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "GK-049619"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "24 Nov 12:13 pm"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span.font-normal.text-subtle "Spill: Spilled while filling"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "24 Nov 11:10 am"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366 |
| /items | contrast | `span.font-normal.text-subtle "GK-049605"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "23 Nov 08:49 pm"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /items | contrast | `div.text-xs.text-subtle "24 Nov 11:11 am"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1536, 1920 |
| /items | label-truncated | `div.truncate.px-2 "Groundnut Oil (Loose)"` | "Groundnut Oil (Loose)" cut with an ellipsis (3px short) | 1280, 1366 |
| /items | label-truncated | `span.block.truncate.text-muted "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (23px short) | 1280, 1366, 1536, 1920 |
| /items | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/hsn | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /items/hsn | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Loose is weighed, packed has"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `button.h-7.whitespace-nowrap.rounded-[6px].px-3.text-sm.f "Loose (kg / L)"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.mt-1.5.text-xs.text-subtle "Quantity is whole numbers on"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Leave empty if you buy it re"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Used for the Exp date on bar"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Prices include GST"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Only for goods that carry ce"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.pointer-events-none.absolute.left-2.5.flex.h-full. "₹"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Optional. Used when a POS bi"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.text-lg.font-semibold.num.text-subtle "-"` | 3.63:1, needs 7:1 (grey label/number, 20px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `div.mt-2.text-xs.text-subtle "Margin is shown once you ent"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "First one prints on labels"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span.text-xs.text-subtle "Warn when stock falls to thi"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /items/new | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /items/new | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "101"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001017"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹360"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.mr-[0.08em] "₹"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "102"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001024"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹78"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "103"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001031"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹189"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "104"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001048"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹367"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "105"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001055"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,765"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "106"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001062"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹5,185"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "107"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001079"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹540"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "108"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001086"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹117"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "109"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001093"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹284"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "110"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001109"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹551"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "111"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001116"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹2,645"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "112"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001123"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹7,775"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "113"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001130"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹330"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "114"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001147"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹71"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "115"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001154"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹173"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "116"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001161"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹337"` | 3.47:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "117"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001178"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,615"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "118"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001185"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹4,750"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "119"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001192"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹290"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "120"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001208"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹63"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "121"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001215"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹152"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "122"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001222"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹296"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "123"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001239"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,420"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "124"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001246"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹4,175"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "125"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001253"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹260"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "126"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001260"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹56"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "127"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001277"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹137"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "128"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001284"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹265"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "129"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001291"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,275"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "130"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001307"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹3,745"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "131"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001314"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹310"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "132"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001321"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹67"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "133"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001338"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹163"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "134"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001345"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹316"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "135"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001352"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,520"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "136"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001369"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹4,465"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "137"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001376"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹190"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "138"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001383"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹41"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "139"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001390"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹100"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "140"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001406"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹194"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "141"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001413"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹931"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "142"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001420"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹2,735"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "143"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001437"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹48"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "144"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001444"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹54"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "145"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001451"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹42"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "146"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001468"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "147"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001475"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹55"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "148"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001482"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹61"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "149"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001499"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "150"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001505"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹43"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "151"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001512"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹420"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "152"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001529"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹214"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "153"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001536"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹85"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "154"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001543"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹47"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "155"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001550"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹140"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "156"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001567"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹180"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "157"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001574"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "158"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001581"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹780"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "159"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001598"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹760"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "160"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001604"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹165"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "161"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001611"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹169"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "162"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001628"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹150"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "163"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001635"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹154"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "164"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001642"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "165"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001659"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "166"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001666"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹144"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "167"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001673"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹105"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "168"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001680"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹109"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "169"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001697"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹95"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "170"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001703"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹130"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "171"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001710"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹90"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "172"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001727"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "173"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001734"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹160"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "174"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001741"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹62"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "175"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001758"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹66"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "176"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001765"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "177"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001772"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹59"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "178"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001789"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹68"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "179"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001796"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹72"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "180"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001802"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹120"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "181"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001819"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹124"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "182"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001826"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹45"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "183"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001833"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹60"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "184"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001840"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "185"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001857"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹44"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "186"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001864"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹70"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "187"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001871"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹80"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "188"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001888"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹46"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "189"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001895"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹50"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "190"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001901"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹22"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "191"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001918"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹220"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "192"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001925"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹224"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "193"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001932"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹280"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "194"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001949"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "195"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001956"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "196"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001963"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "197"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001970"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "198"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001987"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹720"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "199"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000001994"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹480"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "200"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002007"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "201"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002014"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "202"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002021"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹320"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "203"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002038"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹2,400"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "204"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002045"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹1,100"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "205"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002052"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "206"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002069"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹400"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "207"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002076"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "208"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002083"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "209"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002090"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "210"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002106"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "211"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002113"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹240"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "212"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002120"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "213"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002137"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹28"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "214"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002144"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "215"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002151"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹135"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "216"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002168"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "217"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002175"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹125"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "218"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002182"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "219"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002199"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "220"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002205"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "221"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002212"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "222"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002229"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹82"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "223"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002236"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "224"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002243"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "225"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002250"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "226"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002267"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "227"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002274"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "228"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002281"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹30"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "229"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002298"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "230"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002304"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹40"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "231"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002311"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹20"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "232"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num "8904000002328"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.num.whitespace-nowrap "₹38"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `div.mt-1.text-xs.text-subtle "Ribbon sticker: GOKUL, name,"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.pb-2.text-xs.text-subtle "Pkd is today unless you chan"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "TSC TE244"` | 3.00:1, needs 4.5:1 (colour label/number, 12px) | 1280, 1366, 1536, 1920 |
| /labels | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /labels | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /login | clipped | `div.relative.flex.flex-1.flex-col.justify-between.over "GOKUL RETAIL Gokul Office It"` | content 896px in a 800px box, no ellipsis | 1280, 1366, 1536, 1920 |
| /login | contrast | `div.mt-6.flex.items-center.gap-1.5.text-xs.text-subtle "Ctrl+K opens search once you"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /login | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.truncate.text-[11px].text-subtle "Liability ₹27,771"` | 3.24:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.truncate.text-[11px].text-subtle "of 60 customers"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.truncate.text-[11px].text-subtle "On bills since the 1st"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.truncate.text-[11px].text-subtle "Worth ₹1,090 off bills"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.truncate.text-[11px].text-subtle "0 customers · expired this m"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Reports"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With points"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No points"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Expiring in 30 days"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.text-subtle "-"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SI"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "VK"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "PI"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.text-xs.text-subtle "RS Puram"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.text-[11px].text-subtle "11:23 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Earned"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `b.num.text-right.text-success "+103.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.text-[11px].text-subtle "11:36 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `b.num.text-right.text-success "+172.85"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `div.text-[11px].text-subtle "11:42 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `b.num.text-right.text-success "+587.70"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1366, 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "VI"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SK"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SN"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SS"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SC"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (2px short) | 1280, 1366 |
| /loyalty-points | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Murugan Subramanian"` | "Murugan Subramanian" cut with an ellipsis (21px short) | 1280, 1366 |
| /loyalty-points | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (10px short) | 1280, 1366 |
| /loyalty-points | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /loyalty-points | overflow | `div.min-w-0.leading-tight "Brought from POSBean Balance"` | content 149px spills out of a 131px box | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.truncate.text-[11px].text-subtle "Liability ₹27,771"` | 3.24:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.truncate.text-[11px].text-subtle "of 60 customers"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.truncate.text-[11px].text-subtle "On bills since the 1st"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.truncate.text-[11px].text-subtle "Worth ₹1,090 off bills"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.truncate.text-[11px].text-subtle "0 customers · expired this m"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Reports"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "With points"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "No points"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Expiring in 30 days"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.text-subtle "-"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SI"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KN"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MK"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "VK"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MM"` | 3.19:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "PI"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "JN"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BM"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "NP"` | 3.09:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GG"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DN"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GR"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "MS"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GS"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "GN"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.text-xs.text-subtle "RS Puram"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.text-[11px].text-subtle "11:23 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Earned"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `b.num.text-right.text-success "+103.71"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.text-[11px].text-subtle "11:36 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `b.num.text-right.text-success "+172.85"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `div.text-[11px].text-subtle "11:42 am"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `b.num.text-right.text-success "+587.70"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KP"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1366, 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KC"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "BR"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "VI"` | 5.17:1, needs 7:1 (grey label/number, 9px) | 1536, 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SK"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SN"` | 3.68:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SS"` | 5.70:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points [Customers] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "SC"` | 4.60:1, needs 7:1 (grey label/number, 9px) | 1920 |
| /loyalty-points [Customers] | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Dhanam Narayanan"` | "Dhanam Narayanan" cut with an ellipsis (2px short) | 1280, 1366 |
| /loyalty-points [Customers] | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Murugan Subramanian"` | "Murugan Subramanian" cut with an ellipsis (21px short) | 1280, 1366 |
| /loyalty-points [Customers] | label-truncated | `span.min-w-0.truncate.font-medium.text-ink "Geetha Subramanian"` | "Geetha Subramanian" cut with an ellipsis (10px short) | 1280, 1366 |
| /loyalty-points [Customers] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /loyalty-points [Customers] | overflow | `div.min-w-0.leading-tight "Brought from POSBean Balance"` | content 149px spills out of a 131px box | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.truncate.text-[11px].text-subtle "Liability ₹27,771"` | 3.24:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.truncate.text-[11px].text-subtle "of 60 customers"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.truncate.text-[11px].text-subtle "On bills since the 1st"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.truncate.text-[11px].text-subtle "Worth ₹1,090 off bills"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `div.truncate.text-[11px].text-subtle "0 customers · expired this m"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Customers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "1,922.74"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "2,143.99"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "1,346.62"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "1,325.31"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "0.00"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "386.59"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "820.57"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "540.33"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "675.68"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "470.57"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "454.87"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "755.03"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "811.79"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.text-right.text-success "638.95"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "1"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "276.56"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "2"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "423.40"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "3"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "352.39"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "4"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "343.45"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "5"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "412.48"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "6"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "350.02"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "7"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "349.56"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "8"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "257.46"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "9"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "326.40"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "10"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "246.38"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "11"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "303.20"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.w-4.shrink-0.text-xs.text-subtle "12"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span.num.text-right.text-success "230.53"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Senthil Pillai"` | "Senthil Pillai" cut with an ellipsis (13px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Saravanan Iyer"` | "Saravanan Iyer" cut with an ellipsis (31px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Karthikeyan Naidu"` | "Karthikeyan Naidu" cut with an ellipsis (52px short) | 1280, 1366 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Meena Kumar"` | "Meena Kumar" cut with an ellipsis (24px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Vimala Krishnan"` | "Vimala Krishnan" cut with an ellipsis (39px short) | 1280, 1366 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Mani Krishnan"` | "Mani Krishnan" cut with an ellipsis (27px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Kavitha Krishnan"` | "Kavitha Krishnan" cut with an ellipsis (43px short) | 1280, 1366 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Meena Mudaliar"` | "Meena Mudaliar" cut with an ellipsis (38px short) | 1280, 1366 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Palani Iyer"` | "Palani Iyer" cut with an ellipsis (2px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Murugan Pillai"` | "Murugan Pillai" cut with an ellipsis (26px short) | 1280 |
| /loyalty-points [Reports] | label-truncated | `span.truncate.font-medium.text-ink "Ganesh Kumar"` | "Ganesh Kumar" cut with an ellipsis (29px short) | 1280 |
| /loyalty-points [Reports] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | overlap | `div.grid.grid-cols-[1fr_repeat(4,92px)].gap-2.border-b "10 Nov 470.57 0.00 0.00 0.00"  x  div.sticky.bottom-0.grid.grid-cols-[1fr_repeat(4,92px) "Total 12,293.04 1,090.38 0.0"` | 566x16px | 1280, 1366, 1536, 1920 |
| /loyalty-points [Reports] | overlap | `div.grid.grid-cols-[1fr_repeat(4,92px)].gap-2.border-b "09 Nov 454.87 0.00 0.00 0.00"  x  div.sticky.bottom-0.grid.grid-cols-[1fr_repeat(4,92px) "Total 12,293.04 1,090.38 0.0"` | 566x20px | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Open"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "pressed today"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "clean seed to press"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "from the press"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "punnakku made"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "oil per 100 kg of clean seed"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "4.7 kg of seed"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "kg. Opening, seed received, "` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "Seed in, oil out and cake ou"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "Litres. The stick reading is"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Filling"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Ready"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "Bought-in oil added to a god"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `td.px-2.py-3.text-sm.text-subtle "None today."` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "Settled oil taken from a god"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span.text-xs.font-normal.text-subtle "kg. Made by the press, sold "` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /mill-daily | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /mill-daily | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /mill-daily | overflow | `th.px-2.py-1.5.text-left.text-[11px].font-semibold.up "OUTSOURCED L"` | content 91px spills out of a 80px box | 1280 |
| /production | clipped | `div.relative.flex.min-w-0.items-center.gap-1.overflow- "GODOWN BARREL"` | content 127px in a 112px box, no ellipsis | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "OIL IN GODOWN"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "SEED STOCK"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.text-subtle "·"` | 3.47:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "16"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Godown"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Packing 8"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Job work"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.8%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+1.4%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−7.6%"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.1%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.7%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−0.8%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.3%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.5%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.6%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "In godown"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.text-xs.text-subtle "26 Nov 2026, 09:30 am - W · "` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.num.text-3xl.font-semibold.text-success "39.3"` | 3.30:1, needs 4.5:1 (colour label/number, 48px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.8% below norm"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.num.text-[11px].text-subtle "(148.3 kg)"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `div.num.text-[11px].text-subtle "(1.1%)"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span "30 Oct"` | 3.83:1, needs 4.5:1 (grey text, 10px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span "26 Nov"` | 3.83:1, needs 4.5:1 (grey text, 10px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production | contrast | `span.hidden.text-muted.2xl:inline "· 3 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production | contrast | `span.hidden.text-muted.2xl:inline "· 2 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production | label-truncated | `span.truncate.font-medium.text-ink "Groundnut"` | "Groundnut" cut with an ellipsis (8px short) | 1280, 1366 |
| /production | label-truncated | `span.truncate.font-medium.text-ink "Sesame (Ellu)"` | "Sesame (Ellu)" cut with an ellipsis (27px short) | 1280, 1366 |
| /production | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "OIL IN GODOWN"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "SEED STOCK"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.text-subtle "·"` | 3.47:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Pressing 16"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "16"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Packing 8"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Job work"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-xs.text-muted "537 of 600 L"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Filling"` | 4.24:1, needs 4.5:1 (colour label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "71% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.text-right.text-subtle "—"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.text-subtle "· 25 Nov"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "98% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.text-subtle "No reading yet"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Ready"` | 3.00:1, needs 4.5:1 (colour label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "99% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-xs.text-muted "88 of 400 L"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "44% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.text-subtle "· 26 Nov"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Empty"` | 6.92:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "0% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-xs.text-muted "191 of 400 L"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.num.text-[11px].text-subtle "96% full"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `button.inline-flex.items-center.justify-center.rounded-co "Record purchase"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.truncate.text-[11px].text-subtle "copra short this week"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num "Entries said 144 L"` | 3.63:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.mt-1.text-[11px].text-subtle "end of day"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `p.rounded-card.border.border-dashed.border-line.px-3 "Nothing moved to the store f"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-sm.font-semibold.text-success "+27.5 L"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.text-[11px].text-subtle "26 Nov 2026 · Suresh Kumar"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-sm.font-semibold.text-success "+36.5 L"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.text-[11px].text-subtle "25 Nov 2026 · Suresh Kumar"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-sm.font-semibold.text-success "+41.5 L"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.text-[11px].text-subtle "24 Nov 2026 · Suresh Kumar"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.num.shrink-0.text-sm.font-semibold.text-success "+38 L"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `div.text-[11px].text-subtle "23 Nov 2026 · Suresh Kumar"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Godown] | contrast | `span.hidden.text-muted.2xl:inline "· 3 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Godown] | contrast | `span.hidden.text-muted.2xl:inline "· 2 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Godown] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production [Job work] | clipped | `main.flex.min-w-0.flex-1.flex-col.overflow-hidden "Production 15 pressing batch"` | content 1090px in a 1048px box, no ellipsis | 1280 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "OIL IN GODOWN"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "SEED STOCK"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.text-subtle "·"` | 3.47:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Pressing 16"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "16"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Godown"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Packing 8"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Shop keeps"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Job work] | contrast | `span.hidden.text-muted.2xl:inline "· 3 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Job work] | contrast | `span.hidden.text-muted.2xl:inline "· 2 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Job work] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production [Job work] | overflow | `div.flex.min-h-0.flex-col.min-h-0.flex-1 "Pressing 16 Godown Packing 8"` | content 1090px spills out of a 1048px box | 1280 |
| /production [Job work] | overflow | `div.flex.min-h-0.flex-1.flex-col.outline-none.data-[st "New job work the customer br"` | content 1090px spills out of a 1048px box | 1280 |
| /production [Job work] | overflow | `div.flex.min-h-0.flex-1.flex-col.bg-bg "New job work the customer br"` | content 1090px spills out of a 1048px box | 1280 |
| /production [Job work] | overflow | `div.shrink-0.border-b.border-line.bg-surface.px-4.py-3 "New job work the customer br"` | content 1090px spills out of a 1048px box | 1280 |
| /production [Job work] | overflow | `div.grid.grid-cols-[130px_minmax(180px,2fr)_120px_120p "Date Customer Seed Groundnut"` | content 1074px spills out of a 1016px box | 1280 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "OIL IN GODOWN"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "SEED STOCK"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.text-subtle "·"` | 3.47:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Pressing 16"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "16"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Godown"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Job work"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.num.text-xs.text-muted "0.19 L"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "0.3%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "0.4%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "1.8%"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "0.5%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "0.2%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `div.text-xs.text-subtle "25 Nov 2026, 02:15 pm - pack"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `p.mt-3.text-xs.text-subtle "Usual wastage is up to 0.5%."` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Packing] | contrast | `span.hidden.text-muted.2xl:inline "· 3 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Packing] | contrast | `span.hidden.text-muted.2xl:inline "· 2 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Packing] | label-truncated | `div.truncate.px-2 "60 x 500 ml, 30 x 1 L"` | "60 x 500 ml, 30 x 1 L" cut with an ellipsis (30px short) | 1280 |
| /production [Packing] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production [Packing] | overflow | `div.mt-3.grid.grid-cols-3.gap-2 "In packs 62 L Taken 62.2 L W"` | content 333px spills out of a 327px box | 1280, 1366, 1536, 1920 |
| /production [Packing] | overflow | `div.rounded-card.border.border-line.bg-surface-2.px-3. "Wastage 0.19 0.3%"` | content 109px spills out of a 102px box | 1280, 1366, 1536, 1920 |
| /production [Packing] | overflow | `div.flex.items-center.gap-1.5 "0.19 0.3%"` | content 97px spills out of a 78px box | 1280, 1366, 1536, 1920 |
| /production [Pressing] | clipped | `div.relative.flex.min-w-0.items-center.gap-1.overflow- "GODOWN BARREL"` | content 127px in a 112px box, no ellipsis | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "OIL IN GODOWN"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.shrink-0.text-[11px].font-semibold.uppercase.track "SEED STOCK"` | 6.98:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.text-subtle "·"` | 3.47:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "16"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Godown"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Packing 8"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "8"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Job work"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.8%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+1.4%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−7.6%"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.1%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.7%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−0.8%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.3%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "+0.5%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.6%"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "In godown"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.text-xs.text-subtle "26 Nov 2026, 09:30 am - W · "` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.num.text-3xl.font-semibold.text-success "39.3"` | 3.30:1, needs 4.5:1 (colour label/number, 48px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "−1.8% below norm"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.num.text-[11px].text-subtle "(148.3 kg)"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `div.num.text-[11px].text-subtle "(1.1%)"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span "30 Oct"` | 3.83:1, needs 4.5:1 (grey text, 10px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span "26 Nov"` | 3.83:1, needs 4.5:1 (grey text, 10px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production [Pressing] | contrast | `span.hidden.text-muted.2xl:inline "· 3 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Pressing] | contrast | `span.hidden.text-muted.2xl:inline "· 2 barrels"` | 6.98:1, needs 7:1 (grey label/number, 12px) | 1536, 1920 |
| /production [Pressing] | label-truncated | `span.truncate.font-medium.text-ink "Groundnut"` | "Groundnut" cut with an ellipsis (8px short) | 1280, 1366 |
| /production [Pressing] | label-truncated | `span.truncate.font-medium.text-ink "Sesame (Ellu)"` | "Sesame (Ellu)" cut with an ellipsis (27px short) | 1280, 1366 |
| /production [Pressing] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "13 batches"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "raw oil from the press"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "norm 44.7"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "punnaku made"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "oil ₹6,30,090, cake ₹1,12,01"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "1"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `td.px-2.py-1.text-right.text-sm.text-ink.num.whitespa "+0.5%"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span.text-subtle "0"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `td.px-2.py-1.text-right.text-sm.text-ink.num.whitespa "-1.6%"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `p.px-3.py-1.5.text-[11px].text-subtle "Cost per litre uses the last"` | 3.83:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /production-insights | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /production-insights | overflow | `th.h-8.px-2.text-right.text-[10px].font-semibold.uppe "BATCHES"` | content 58px spills out of a 56px box | 1280, 1366, 1536, 1920 |
| /production-insights | overflow | `td.py-1.pr-2.text-sm.text-ink "Groundnut"` | content 95px spills out of a 91px box | 1280 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span "10 bills"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span "Groundnut, sesame, copra"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span "Claim in GSTR-3B"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span "9 unpaid bills, ₹2,57,756 ov"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `div.num.text-xs.text-muted "PU-01042"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.text-subtle "Nil"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Unpaid"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.num.whitespace-nowrap "₹0.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span.mr-[0.08em] "₹"` | 3.30:1, needs 4.5:1 (colour text, 13px) | 1280, 1366, 1536, 1920 |
| /purchases | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /purchases | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "GST"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "STOCK"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[10px].font- "Soon"` | 3.44:1, needs 7:1 (grey label/number, 10px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "PROFIT"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "CASH"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "CONTROL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.px-2.5.pb-1.pt-1.5.text-[11px].font-semibold.upper "PRODUCTION"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.h-4.truncate.text-xs.leading-4.text-subtle "30 days"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.h-4.truncate.text-xs.leading-4.text-subtle "50 per day"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `div.h-4.truncate.text-xs.leading-4.text-subtle "included in net sales"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /reports | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /reports | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /reports | overlap | `div.relative.flex-1 "Thu, 26 Nov 41 82 ₹1,17,587."  x  div.sticky.bottom-0.z-10.grid.h-9.shrink-0.items-cente "Total 1,499 3,421 ₹43,92,952"` | 1000x36px | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-xs.text-subtle "(345 bills)"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "9 cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "5 returned"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-subtle "Walk-in"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-subtle "C2"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-subtle "C1"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Tamil Nadu (33) - local"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-xs.text-subtle "6 items"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "UPI"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span.text-xs.text-subtle.num "UPI1529055246"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /sales | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /sales | label-truncated | `div.truncate.px-2 "Sundari Subramanian"` | "Sundari Subramanian" cut with an ellipsis (51px short) | 1280, 1366 |
| /sales | label-truncated | `div.truncate.px-2 "Karthikeyan Iyer"` | "Karthikeyan Iyer" cut with an ellipsis (19px short) | 1280, 1366 |
| /sales | label-truncated | `div.truncate.px-2 "Jothi Narayanan"` | "Jothi Narayanan" cut with an ellipsis (20px short) | 1280, 1366 |
| /sales | label-truncated | `div.truncate.px-2 "Meena Kumar"` | "Meena Kumar" cut with an ellipsis (5px short) | 1280, 1366 |
| /sales | label-truncated | `div.truncate.px-2 "Balu Gounder"` | "Balu Gounder" cut with an ellipsis (3px short) | 1366 |
| /sales | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /sales | overflow | `div.mt-3.flex.items-end.justify-between "Bill total ₹5,286.00 Tax inv"` | content 367px spills out of a 357px box | 1280, 1366, 1536, 1920 |
| /sales | overlap | `span.text-xs.text-muted "Net sales"  x  span.text-xs.text-subtle "(345 bills)"` | 53x15px | 1280 |
| /sales | overlap | `span.ml-1.5.font-semibold.text-ink "₹10,96,301.00"  x  span.text-xs.text-subtle "(345 bills)"` | 95x15px | 1280 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.text-xs.text-subtle "(345 bills)"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "9 cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "5 returned"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.text-subtle "Walk-in"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.text-subtle "C2"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.text-subtle "C1"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Tamil Nadu (33) - local"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | label-truncated | `div.truncate.px-2 "Sundari Subramanian"` | "Sundari Subramanian" cut with an ellipsis (51px short) | 1280, 1366 |
| /sales [Bill preview] | label-truncated | `div.truncate.px-2 "Karthikeyan Iyer"` | "Karthikeyan Iyer" cut with an ellipsis (19px short) | 1280, 1366 |
| /sales [Bill preview] | label-truncated | `div.truncate.px-2 "Jothi Narayanan"` | "Jothi Narayanan" cut with an ellipsis (20px short) | 1280, 1366 |
| /sales [Bill preview] | label-truncated | `div.truncate.px-2 "Meena Kumar"` | "Meena Kumar" cut with an ellipsis (5px short) | 1280, 1366 |
| /sales [Bill preview] | label-truncated | `div.truncate.px-2 "Balu Gounder"` | "Balu Gounder" cut with an ellipsis (3px short) | 1366 |
| /sales [Bill preview] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | overflow | `div.mt-3.flex.items-end.justify-between "Bill total ₹5,286.00 Tax inv"` | content 367px spills out of a 357px box | 1280, 1366, 1536, 1920 |
| /sales [Bill preview] | overlap | `span.text-xs.text-muted "Net sales"  x  span.text-xs.text-subtle "(345 bills)"` | 53x15px | 1280 |
| /sales [Bill preview] | overlap | `span.ml-1.5.font-semibold.text-ink "₹10,96,301.00"  x  span.text-xs.text-subtle "(345 bills)"` | 95x15px | 1280 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-xs.text-subtle "(345 bills)"` | 3.63:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "9 cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "5 returned"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-subtle "Walk-in"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-subtle "C2"` | 3.24:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Paid"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-subtle "C1"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Cancelled"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Tamil Nadu (33) - local"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-xs.text-subtle "6 items"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "UPI"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span.text-xs.text-subtle.num "UPI1529055246"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | contrast | `span "35"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /sales [Details] | label-truncated | `div.truncate.px-2 "Sundari Subramanian"` | "Sundari Subramanian" cut with an ellipsis (51px short) | 1280, 1366 |
| /sales [Details] | label-truncated | `div.truncate.px-2 "Karthikeyan Iyer"` | "Karthikeyan Iyer" cut with an ellipsis (19px short) | 1280, 1366 |
| /sales [Details] | label-truncated | `div.truncate.px-2 "Jothi Narayanan"` | "Jothi Narayanan" cut with an ellipsis (20px short) | 1280, 1366 |
| /sales [Details] | label-truncated | `div.truncate.px-2 "Meena Kumar"` | "Meena Kumar" cut with an ellipsis (5px short) | 1280, 1366 |
| /sales [Details] | label-truncated | `div.truncate.px-2 "Balu Gounder"` | "Balu Gounder" cut with an ellipsis (3px short) | 1366 |
| /sales [Details] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /sales [Details] | overflow | `div.mt-3.flex.items-end.justify-between "Bill total ₹5,286.00 Tax inv"` | content 367px spills out of a 357px box | 1280, 1366, 1536, 1920 |
| /sales [Details] | overlap | `span.text-xs.text-muted "Net sales"  x  span.text-xs.text-subtle "(345 bills)"` | 53x15px | 1280 |
| /sales [Details] | overlap | `span.ml-1.5.font-semibold.text-ink "₹10,96,301.00"  x  span.text-xs.text-subtle "(345 bills)"` | 95x15px | 1280 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.text-xs.text-subtle "Valid. State code 33 is Tami"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span.text-xs.text-subtle "Printed under the address on"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.text-xs.text-subtle "Use a different drive than t"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.text-xs.text-subtle "Older ones are deleted autom"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.text-xs.text-subtle "Runs in the background"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span.text-xs.text-subtle "Kept on this PC only. Ask th"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `p.text-xs.text-subtle "Turn sync on and save to ena"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Backup] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.text-xs.text-subtle "39/48 characters"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span.text-xs.text-subtle "30/48 characters"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "GK-26-000123"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "58 mm"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Bill format] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.pointer-events-none.absolute.left-2.5.flex.h-full. "₹"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span.text-xs.text-subtle "A cashier recording a larger"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Expenses] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span.pointer-events-none.absolute.left-2.5.flex.h-full. "₹"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `p.mt-2.text-xs.text-subtle "Only the owner can change th"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Loyalty] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `p.mt-3.text-xs.text-subtle "Each operator gets a grid on"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.pointer-events-none.absolute.left-2.5.flex.h-full. "₹"` | 3.83:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.text-xs.text-subtle "GST included, on the kg of s"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.text-xs.text-subtle "Lower, as the shop keeps the"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span.text-xs.text-subtle "Printed on the aravai bill. "` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `p.mt-3.text-xs.text-subtle "The charge goes on the custo"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Mill] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Ready"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `button.h-7.rounded-[6px].px-3.text-sm.font-medium.transit "Windows driver"` | 6.92:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "Used with Rs. (see Rupee sig"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "Adds to the 2 mm safe margin"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "TE244 about 12 mm. Too high "` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "Steps of 0.5"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "Steps of 0.1, if sticker 3 i"` | 3.63:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span.text-xs.text-subtle "Scanners type in under 15 ms"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Printers] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Printers] | overflow | `div.mt-3.grid.grid-cols-4.items-end.gap-2 "Sticker 1 left edge (mm) Sti"` | content 445px spills out of a 436px box | 1280, 1366 |
| /settings [Printers] | overflow | `button.inline-flex.items-center.justify-center.rounded-co "Use these numbers"` | content 111px spills out of a 101px box | 1280, 1366 |
| /settings [Printers] | overlap | `b "Use these numbers"  x  b "Save changes"` | 82x15px | 1536 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Tax"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.text-xs.text-subtle "Valid. State code 33 is Tami"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span.text-xs.text-subtle "Printed under the address on"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Shop] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Shop"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Bill format"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Printers"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Backup"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Loyalty"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Expenses"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Mill"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.flex.items-center.gap-1.5 "Security"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.mt-0.5.block.text-xs.text-muted "Tax invoice with CGST and SG"` | 6.51:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `div.px-4.py-2.text-xs.text-subtle "Only enabled rates can be us"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span.text-xs.text-subtle "Always on"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /settings [Tax] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span "Active items"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span "Quantity x purchase cost"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span "At or below reorder level"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span "Nothing left to sell"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "OK"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /stock | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /stock | label-truncated | `span.block.truncate.text-muted "Wood-pressed oils"` | "Wood-pressed oils" cut with an ellipsis (4px short) | 1280, 1366 |
| /stock | label-truncated | `span.block.truncate.text-muted "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (33px short) | 1280, 1366, 1536 |
| /stock | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Sample"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Damage"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `span.font-semibold.text-success "+4 bottle"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Adjustments] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span "Active items"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span "Quantity x purchase cost"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span "At or below reorder level"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span "Nothing left to sell"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "OK"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Levels] | label-truncated | `span.block.truncate.text-muted "Wood-pressed oils"` | "Wood-pressed oils" cut with an ellipsis (4px short) | 1280, 1366 |
| /stock [Levels] | label-truncated | `span.block.truncate.text-muted "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (33px short) | 1280, 1366, 1536 |
| /stock [Levels] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /stock [Stock take] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.text-subtle "Nil"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Settled"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.num.whitespace-nowrap "₹2,43,613"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.mr-[0.08em] "₹"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Overdue"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "9"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "2"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.num.whitespace-nowrap "40,000.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.num.whitespace-nowrap "89,376.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.num.whitespace-nowrap "1,01,300.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span.num.whitespace-nowrap "1,44,800.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers | label-truncated | `div.truncate.font-medium.text-ink "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (24px short) | 1280 |
| /suppliers | label-truncated | `div.truncate.font-medium.text-ink "Pandian Jaggery Works"` | "Pandian Jaggery Works" cut with an ellipsis (34px short) | 1280 |
| /suppliers | label-truncated | `div.truncate.font-medium.text-ink "Vinayaga Packaging"` | "Vinayaga Packaging" cut with an ellipsis (12px short) | 1280 |
| /suppliers | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.text-subtle "Nil"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Settled"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.num.whitespace-nowrap "₹2,43,613"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.mr-[0.08em] "₹"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Overdue"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "9"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "2"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.text-subtle "-"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.num.whitespace-nowrap "40,000.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.num.whitespace-nowrap "89,376.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.num.whitespace-nowrap "1,01,300.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span.num.whitespace-nowrap "1,44,800.00"` | 3.30:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Ledger] | label-truncated | `div.truncate.font-medium.text-ink "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (24px short) | 1280 |
| /suppliers [Ledger] | label-truncated | `div.truncate.font-medium.text-ink "Pandian Jaggery Works"` | "Pandian Jaggery Works" cut with an ellipsis (34px short) | 1280 |
| /suppliers [Ledger] | label-truncated | `div.truncate.font-medium.text-ink "Vinayaga Packaging"` | "Vinayaga Packaging" cut with an ellipsis (12px short) | 1280 |
| /suppliers [Ledger] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.text-subtle "Nil"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Settled"` | 3.00:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.num.whitespace-nowrap "₹2,43,613"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.mr-[0.08em] "₹"` | 4.09:1, needs 4.5:1 (colour label/number, 13px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Overdue"` | 3.95:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "9"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "2"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | contrast | `span "₹0"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /suppliers [Open bills] | label-truncated | `div.truncate.font-medium.text-ink "Sri Murugan Oil Seeds"` | "Sri Murugan Oil Seeds" cut with an ellipsis (24px short) | 1280 |
| /suppliers [Open bills] | label-truncated | `div.truncate.font-medium.text-ink "Pandian Jaggery Works"` | "Pandian Jaggery Works" cut with an ellipsis (34px short) | 1280 |
| /suppliers [Open bills] | label-truncated | `div.truncate.font-medium.text-ink "Vinayaga Packaging"` | "Vinayaga Packaging" cut with an ellipsis (12px short) | 1280 |
| /suppliers [Open bills] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "5"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Roles and permissions"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.ml-1.5.text-xs.font-normal.text-subtle "(you)"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LR"` | 5.70:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Manager"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KM"` | 5.17:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DS"` | 4.60:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "RP"` | 3.19:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Users 5"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "5"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.text-[11px].text-subtle "Always full access"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.text-[11px].text-subtle "Same as owner"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.text-[11px].text-subtle "Floor lead"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.text-[11px].text-subtle "Entry only"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `div.text-[11px].text-subtle "Counter"` | 3.63:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.ml-2.text-xs.text-subtle "Highest discount a role can "` | 3.59:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.pointer-events-none.absolute.left-2.5.flex.h-full. "%"` | 3.83:1, needs 4.5:1 (grey text, 13px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.ml-2.text-xs.text-subtle "Even if the role is allowed,"` | 3.59:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span.text-xs.text-subtle "Never"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Roles and permission] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "OVERVIEW"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "CATALOGUE"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INVENTORY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MILL"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "SALES"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "MONEY"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "INSIGHTS"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `div.px-2.pb-1.text-[11px].font-semibold.uppercase.trac "ADMIN"` | 3.83:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.pl-2.text-xs.text-subtle "Collapse"` | 3.83:1, needs 7:1 (grey label/number, 12px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.rounded-full.bg-surface-3.px-1.5.text-[11px].text- "5"` | 6.92:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `button.relative.-mb-px.flex.h-9.items-center.gap-1.5.bord "Roles and permissions"` | 6.98:1, needs 7:1 (grey label/number, 13px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.ml-1.5.text-xs.font-normal.text-subtle "(you)"` | 3.83:1, needs 4.5:1 (grey text, 12px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "LR"` | 5.70:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.inline-flex.h-[20px].items-center.gap-1.rounded-fu "Manager"` | 4.24:1, needs 4.5:1 (colour text, 12px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "KM"` | 5.17:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "DS"` | 4.60:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span.inline-flex.shrink-0.items-center.justify-center.r "RP"` | 3.19:1, needs 7:1 (grey label/number, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | contrast | `span "24"` | 1.29:1, needs 4.5:1 (grey text, 11px) | 1280, 1366, 1536, 1920 |
| /users [Users] | overflow | `span.relative.inline-flex.shrink-0. "O"` | content 34px spills out of a 30px box | 1280, 1366, 1536, 1920 |

