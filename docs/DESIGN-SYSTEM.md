# Gokul Retail — design system (single source of truth)

Modern, clean, professional retail software. Light theme. Segoe UI with Nirmala UI (Tamil) fallback. This file is the only source of visual truth — no ad-hoc colors, fonts or spacing anywhere else.

## Palette (CSS custom properties on `:root`)

| Token | Value | Use |
|---|---|---|
| `--gk-bg` | `#eef1f4` | App background |
| `--gk-surface` | `#ffffff` | Cards, inputs, tables |
| `--gk-panel` | `#f6f8fa` | Subtle fills, read-only fields |
| `--gk-text` | `#1f2933` | Primary text |
| `--gk-muted` | `#4a5560` | Secondary text, hints |
| `--gk-border` | `#b8c2cc` | Strong borders |
| `--gk-divider` | `#e3e8ed` | Row lines |
| `--gk-navy` | `#1e3a5f` | Top bars, brand panel |
| `--gk-navy-dark` | `#102a43` | Dark surfaces, net-amount panel |
| `--gk-primary` | `#0b5cad` | Buttons, links, selection, focus |
| `--gk-primary-soft` | `#e8f1fb` | Hover/focus tint |
| `--gk-danger` | `#d92d20` | Errors, the bill total |
| `--gk-ok` | `#1e7b34` | Success |
| `--gk-warn` | `#b45309` | Warnings |
| `--gk-amber` | `#ffd54a` | Accent on navy (net amount, brand) |
| `--gk-primary-strong` | `#0a4f98` | Primary hover / pressed |
| `--gk-navy-muted` | `#b9c9db` | Muted text on navy / net-amount panel |
| `--gk-keycap-bg` | `#ffffff` | F-key caps |
| `--gk-keycap-border` | `#c3ccd5` | F-key cap border |
| `--gk-focus-ring` | `0 0 0 3px #e8f1fb` | Focus ring (3px soft ring of primary-soft) |
| `--gk-shadow-card` | `0 18px 44px rgba(15,23,42,.14)` | Card / dialog shadow |
| `--gk-cta-height` | `56px` | Height of the single primary action (Pay) |

## Typography

- Family: `Segoe UI`, `Nirmala UI`, sans-serif (no web font — system fonts render crisp).
- Weights: 400 (body), 600 (labels/emphasis), 700 (the bill total only).
- Scale: 12px caption · 13px dense grid · 15px body · 17px input · 20px h2 · 24px h1 · 40px bill total.
- Numbers: `font-variant-numeric: tabular-nums`, right-aligned, Indian grouping `₹1,23,456.00`.
- Tamil: any element that can show a Tamil name uses `line-height: 1.55` minimum and never a fixed height with `overflow: hidden`.

## Spacing and shape

- 4px grid (`4 / 8 / 12 / 16 / 24 / 32`).
- Card radius 8px; inputs/buttons 5–6px; square corners in dense grids.
- Subtle shadow on cards and dialogs only: `0 18px 44px rgba(15,23,42,.14)`. No shadow on every element.
- No animation in billing. Elsewhere, a 150ms fade on dialogs at most.

## Components

- **Button**: primary (navy/blue fill, white text), secondary (white, 1px border), danger (red). Height 40px, label shows its key (`Save  (F10)`). The single primary action (Pay) is taller: `--gk-cta-height` 56px, 20px/700 label, full width of the right panel, always directly below the TotalPanel.
- **DataGrid** (POS): square corners; 1px `--gk-divider` row lines only — no vertical rules, no header fill. Header row: 12px uppercase `--gk-muted`, 32px tall. Body rows: min 34px (use 38px where a Tamil name is shown), 13px tabular numerals right-aligned, item name 15px/600 with Tamil 13px `--gk-muted` underneath at `line-height: 1.55`. Totals row: 1px `--gk-border` top border, label left, right-aligned sums.
- **TotalPanel**: `--gk-navy-dark` card, 10px radius, white 14px label, 40px/700 `--gk-amber` amount (the bill total — the focal number), one line of muted stats underneath.
- **Input**: 1px border, focus = blue border + 3px soft ring. Error = 2px red border + `! message` below.
- **SelectList** (login user picker): rows with name + role; selected row solid blue with white text; type-to-filter.
- **Dialog**: centered card, 2px radius, dimmed backdrop, focus trapped, Enter = default, Esc = cancel.
- **StatusBar**: navy top bar — shop name left, user · date · backup right.
- **KeyLegend**: bottom bar of key-cap + label, always matches the live keymap. Key cap: 11px/600 label on `--gk-keycap-bg`, 1px `--gk-keycap-border`, 2px radius, 3px side padding. Primary key (F10 Pay) uses `--gk-primary` fill with white label.

## Screens

- **Login**: split screen. Left 42% navy gradient brand panel (amber oil-drop logo + "Gokul Oils" + tagline "Wood-pressed oils · Point of Sale"). Right: centered white card — title, "Choose your name, then type your PIN.", user list, PIN field below the list.
- **POS billing**: navy top bar; header row (Bill No, Date, Bill Type, Price List, Customer, Salesman, Points); scan entry row (barcode/name, qty, uom, mrp, rate, disc, gst, amount, Add); dense grid (S.No, Code, Item, Tamil, Qty, UOM, MRP, Rate, Disc, Taxable, GST%, GST Amt, Net) with a totals row; right panel (summary, navy net-amount panel with the amber ₹ total, received/balance); F-key legend; status bar (printer, scanner, backup).
- **Office**: left sidebar (menu) + content; masters are property-panel + grid; reports have a filter bar + grid + simple chart.

## Rules that make it look professional

- One focal number per screen: the bill total in POS, today's sales in the Office dashboard.
- Clear hierarchy: the most important number is the biggest and boldest.
- Every screen has empty, loading, error and success states.
- Focus always visible; errors in plain words with the fix ("PIN must be 4 to 6 digits."), never an error code for staff.
