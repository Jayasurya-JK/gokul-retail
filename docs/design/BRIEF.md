# Design brief: Gokul Retail

The bar: it should look and feel like a 2026 product from a top software company (Linear, Stripe Dashboard, Shopify POS, Square), not like a 2010 Windows billing tool. Staff should also find it faster than POSBean on day one.

**This is desktop software, not a website.** It runs in a Tauri window and must feel like a native pro app. Full rules are in `.claude/skills/gokul-desktop-ui/SKILL.md` ("It is software, not a website").

## Users and context
- Counter staff bill 500+ a day, mostly with keyboard and barcode scanner. They are not tech experts, and English is their second language (Tamil first).
- The shop PC is a 1366x768 or 1920x1080 monitor, often low-end. Everything must fit without scrolling at 1366x768.
- The owner/manager uses Office for items, stock, purchases and reports.

## Principles
1. **Speed is the design.** Every POS action has a key. Focus is always somewhere useful. No action needs the mouse. Never more than 1 popup deep.
2. **Numbers first.** Totals and amounts are big, tabular and right-aligned. The grand total is the largest thing on the billing screen.
3. **Calm, dense, clear.** Neutral surfaces, one brand colour, colour used only for meaning (success, warning, danger, info). Dense like a pro tool, but with clear grouping and whitespace.
4. **Always show state.** Who's logged in, the shift, printer status, offline/saved status, held bills count.
5. **Forgiving.** Confirm destructive actions, allow undo where possible, show plain-English errors ("Item not found: 8901234" rather than "Error 404").

## Visual system (tokens live in `packages/ui/src/tokens.css`)
- Brand: deep emerald/teal (oil + fresh), e.g. `#0F766E` primary, with a warm amber accent `#D97706` used sparingly (e.g. the oil drop in the logo).
- Neutrals: slate scale. App background `#F6F7F9`, surfaces white, borders `#E4E7EC`.
- Semantic: success green, warning amber, danger red, info blue.
- Dark theme: supported through tokens (`[data-theme=dark]`).
- Type: Inter, with `font-feature-settings: "tnum"` on all numbers. Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 / 32 / 48 (grand total).
- Radius 8 for controls and 12 for cards/dialogs. Subtle shadows only on overlays.
- Spacing on a 4px grid.
- Icons: lucide, 16/18/20px.
- Motion: 120 to 180 ms ease-out on overlays only. Nothing slows down billing.

## Components (packages/ui)
Button (primary, secondary, ghost, danger; with key hint chip), IconButton, Input, NumberInput, Select, Combobox/search, Checkbox, Switch, Badge, Kbd (key chip), Card, Stat tile, Tabs, Dialog, Drawer (side sheet), Toast, Tooltip, DataTable (virtualised, sortable, keyboard row nav), EmptyState, PageHeader, Toolbar, FilterBar, DateRangePicker, Money (formats ₹ with Indian grouping: 1,23,456.00), StatusDot.

## Layouts
- **POS**: full-screen. Top bar (shop, counter, cashier, shift time, printer/sync status, held count). Main area is the bill grid. Right panel shows customer, totals and payment summary. Bottom F-key bar always visible.
- **Office**: left sidebar nav (collapsible, grouped), top bar (search with Ctrl+K command palette, user menu), and content with a PageHeader plus actions.

## Data
All screens read from `packages/data` (the mock Api) with realistic Gokul Oils data: groundnut, gingelly (sesame), coconut, mustard and castor oils, loose per kg/litre and packed 200 ml/500 ml/1 L/5 L/15 L tins, oil cake (punnakku), jaggery, ghee, and some grocery items. Prices are in ₹ with 5% GST on edible oils. Use Indian names and phone numbers in the 9xxxx format.

## Not allowed
Default-browser-looking controls, Bootstrap look, random colours, emoji as icons, lorem ipsum, horizontal scroll on POS, anything that needs the mouse in POS.
