# Visual style v3 - classic Windows retail software (MD direction 6 Nov 2026)

The MD wants the look staff know from Indian desktop retail software (POSBean class): a professional Windows business application. Match the STYLE and density, never copy any vendor's logo, name, icons or exact screens. Our brand is "Gokul Retail" / Gokul Oils.

## Overall
- Looks like a real Windows desktop program (DevExpress / WinForms grade), not a website. Screen 1366x768.
- Font: "Segoe UI" 12px for grids/labels, 13px for inputs, Tamil fallback "Nirmala UI". Tabular numbers, right-aligned, 2 decimals (qty 3 decimals).
- Colours: window chrome white/#F3F3F3; borders #C5CDD8; grid header #E9EEF5 with #33475B bold 11-12px text; grid rows white with 1px #E1E6ED lines (both directions); selected row solid #1E88E5 white text; group/section headers in property grids light blue #DCE8F7 bold; links/blue labels #1565C0; big totals red #D32F2F bold; OK green #2E7D32 (tick icons); warning red circles for bad status.
- Square corners. No shadows, no cards, no gradients, no emoji. Small 16px coloured icons (inline SVG, simple) on toolbar items.
- **No bottom F-key legend strip.** Shortcut keys appear inside toolbar labels, e.g. "Pay Mode F3", "Refresh F5" (POS habit).
- Title bar of each window: small app icon + window title in blue left, min/max/close glyphs right.

## Gokul POS (billing counter) layout
- Window title "Point of Sale - Gokul POS". Text toolbar row: File | Save | Pay Mode F3 | Delete Item | Refresh F5 | Customer F4 | Recent Bill | Bill Hold | Recall | Return | Counter | Tools.
- Under it, left: compact fields Date [dd-mm-yyyy v], Bill No [...], Customer [name v]. Right: the bill total huge red (36-40px) e.g. "2,415.00".
- Full-width dense grid (rows 20-22px): S.No | Barcode | Product (English) | Tamil name | MRP | Rate | Disc % | Disc | Sales Price | Qty | Total | Stock. "Click here to add a new row" placeholder row under the header. Selected row blue. Empty grid area below rows stays white with lines.
- Bottom area (about 90px), two parts: left a tab strip (Customer | Recent Bill | Hold Bill | Return) showing a small property grid (Code, Name, Mobile, Last visit | Points, Wallet, Balance); right a totals property grid in two columns: No of Qty, No of Items, Gross Amount, Item Disc, Taxable, CGST, SGST, Round Off, NET AMOUNT (bold).
- Payment, hold, return, day close, lock and sign-in are small modal dialogs over this POS window (Windows dialog style: blue title, property-grid fields, OK/Cancel buttons bottom right).

## Gokul Office (back office) layout
- Window title "Gokul Office - <user>". Office-style RIBBON: application button, tabs Home | Items | Stock | Production | Packing | Purchase | Sales | Reports | Users | Settings; under the selected tab, large 32px icon buttons with labels in groups (group caption below, e.g. "Masters", "Reports"), with small dropdown arrows where relevant.
- Below the ribbon: document tabs (MDI) for open screens, e.g. "Item Master x".
- Master screens (Items, Suppliers, Users): left docked panel "Item Properties" as a property grid (label | value, sections Description / Settings / Price, ticks for Active); right a wide data grid with toolbar (New, Edit, Delete, Refresh, View, Tools) and a "Drag a column header here to group by that column" bar. Edit = a modal property-grid dialog with two columns (Description left, Price right).
- List screens (Purchases, Stock): toolbar + filter bar + grid; left detail panel optional.
- Reports and Dashboard: filter bar (Location, View Type, From Date, To Date, Search), grid on the left (Date | Total Sales | Profit | Status icon), chart on the right (simple bar chart drawn with divs: blue sales, magenta/pink profit, axis labels, legend box).
- Settings: property grid with section headers (Shop, Billing, Printing, Backup), Save on the ribbon.
- Status bar at the very bottom (thin): Shop | User | Date | Backup | Version.

## Sample data
Gokul Oils, Tamil Nadu wood-pressed oil shop: Groundnut Oil 1 L / 500 ml / loose, Gingelly (sesame) Oil, Coconut Oil, Castor Oil, Groundnut Oil Cake, Palm Jaggery; Tamil names (கடலை எண்ணெய், நல்லெண்ணெய், தேங்காய் எண்ணெய், விளக்கெண்ணெய், கடலை பிண்ணாக்கு, பனங்கருப்பட்டி). GST 5% on oils, CGST = SGST. Owner Gokul, cashiers Ravi Kumar, Anu. Suppliers like "Sri Murugan Oilseeds". All figures are samples.
