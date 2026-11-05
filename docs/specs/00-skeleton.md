# Spec 00 - Skeleton (foundation, test data only)

Status: APPROVED by owner direction 5 Nov 2026 ("build skeleton first, data from POSBean last").

## Goal
A small, fast, crash-safe Windows app that opens to a menu, stores data safely, backs itself up, and proves the speed budgets with fake data. No real billing yet. Every later feature (production, packing, billing) plugs into this.

## Shop reality
- Shop PC: Windows 10, ~4 GB RAM, slow. The old POSBean keeps running on the same PC during changeover (1-2 weeks side by side).
- So: our app must stay under 150 MB RAM, near 0% idle CPU, never touch POSBean's folders, database or services, and must not hold the printer/COM ports when it is not printing.

## Two apps, one core (owner decision 5 Nov 2026 - "like a real POS")
- **Gokul POS** (`apps/pos`) - billing counter only. Opens straight to login -> billing. Nothing else on screen.
- **Gokul Office** (`apps/office`) - back office: dashboard, items, stock, production, packing, purchases, reports, users, settings, backup.
- Both use the shared Rust crate `crates/core` (`gokul-core`: db, migrations, all business rules; no Tauri dependency) and the shared React package `packages/ui` (theme, components, keyboard helpers).
- Both open the same SQLite DB `%APPDATA%\GokulRetail\data\gokul.db` (WAL handles both processes). Later: LAN server mode for more counters - keep all DB access behind `gokul-core` so this is possible.
- Repo layout: root `Cargo.toml` (workspace: `crates/core`, `apps/pos/src-tauri`, `apps/office/src-tauri`), root `package.json` (npm workspaces: `apps/pos`, `apps/office`, `packages/ui`).

## Build steps (each step = builder run + verifier PASS + commit)

### Step 1 - Project scaffold
- Workspace above. Two Tauri 2 + React + TypeScript (strict) + Vite apps. Names "Gokul POS" (`in.gokuloils.pos`) and "Gokul Office" (`in.gokuloils.office`).
- In each app: `src-tauri/src/commands/` (thin Tauri commands calling `gokul-core`).
- Plugins allowed: single-instance (second launch focuses the open window), log (file logging). No others.
- NSIS installer per app, per-user install (no admin needed), WebView2 `embedBootstrapper` mode. Release profile: `lto = true`, `opt-level = "s"`, `codegen-units = 1`, `strip = true`, `panic = "abort"` is NOT allowed (we need the panic hook).
- Root `npm run check` runs: cargo fmt --check, clippy -D warnings, cargo test (workspace), tsc, eslint, vitest.
- Accept: both apps build to setup .exe under 15 MB each; each opens to its empty shell.

### Step 2 - Database layer
- File `%APPDATA%\GokulRetail\data\gokul.db`. PRAGMAs: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- Migration runner: numbered SQL files embedded in the binary, applied in order inside a transaction, version stored in `schema_version`. Refuse to start if the DB is newer than the app (clear message).
- Migration 001 tables:
  - `settings` (key, value)
  - `users` (id, name, role owner|cashier, pin_hash, active)
  - `audit_log` (id, user_id, action, detail_json, created_at)
  - `items` (id, code unique, barcode unique nullable, name, name_ta, kind seed|bulk_oil|packed|loose|packing_material|byproduct|other, base_unit ml|g|pcs, density_mg_per_ml nullable, hsn, gst_rate_bp, sale_price_paise, active, created_at, updated_at)
  - `stock_ledger` (id, item_id, qty_base integer signed, reason, ref_type, ref_id, user_id, note, created_at). Insert-only: no UPDATE/DELETE allowed (enforce with triggers).
  - `stock_balance` (item_id, qty_base) cache, maintained in the same transaction as each ledger insert.
- Core fn `post_stock(tx, movements[])` - the only way to change stock.
- Core fn `rebuild_balances()` + test that the cache always equals the ledger sum.
- Accept: tests for migrations from empty, re-open existing DB, ledger immutability, balance rebuild.

### Step 3 - App shells and login
- Login by user + 4-6 digit PIN (argon2 hash) in both apps. First run (Office): create owner account screen. POS refuses to start billing until Office has set up the shop.
- POS shell: full-screen billing placeholder, status bar, F-key legend at the bottom.
- Office shell: left menu with Dashboard, Items, Stock, Production, Packing, Purchases, Reports, Users, Settings. Unbuilt screens show "Coming soon". Every menu item reachable by keyboard (Alt+letter / F-keys); Esc goes back.
- Status bar: shop name, user, date/time, last backup time.
- Settings screen: shop name, address, GSTIN, FSSAI no, phone, bill footer.
- Accept: whole shell usable without a mouse; cashier cannot open Settings.

### Step 4 - Crash safety and errors
- Rust panic hook and all command errors -> log file `%APPDATA%\GokulRetail\logs\` (rotate, keep 14 days) + plain-language message in UI. React error boundary: never a white screen; offers "Reload screen".
- Draft autosave helper: a screen can save its in-progress state to a `drafts` table; on restart the app offers to restore it. (Used by billing later.)
- Accept: test that kills the process mid-transaction leaves the DB consistent; forced UI error shows the friendly screen.

### Step 5 - Backup and restore
- SQLite online backup to `%APPDATA%\GokulRetail\backups\gokul-YYYYMMDD-HHMM.db` on app start if last backup >24 h, and on normal close. Keep newest 30. Optional second folder (USB/D:) in Settings.
- Restore from Settings (owner only): pick backup, app makes a safety backup of the current DB first, then restores and restarts.
- Accept: backup while the app is in use; restore round-trip test; corrupt backup file rejected with a message.

### Step 6 - Speed proof with fake data
- Dev-only command / test fixture: 20,000 items, 1 year of ledger rows (~500 movements/day).
- Tests in `cargo test` assert: item search by code/barcode/name prefix < 50 ms; post_stock of a 20-line movement < 30 ms; stock report over all items < 2 s.
- Manual check recorded in this spec: app RAM at idle and after 10 minutes of use, with POSBean also open, on a low-end setting.

## Order after the skeleton (owner, 5 Nov 2026)
1. Spec 03 - complete normal billing (POS) + items/stock basics (Office), GoFrugal-grade.
2. Then Gokul-specific one by one: 01 production, 02 loose and packing, then the WAIT list.

## Out of scope
Billing, production, packing logic, printing, POSBean import.

## Open items (do not block the skeleton)
- Printer and scanner models (needed for spec 03 billing/printing).
