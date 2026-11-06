---
name: gokul-backend
description: Rules for the Gokul Retail backend - Rust core with SQLite behind Tauri commands, implementing the same Api interface as packages/data mockApi. Covers money in integer paise, GST rounding, bill save that can never be lost, stock movements, migrations, speed budgets and tests. Use this whenever writing or reviewing Rust, SQL, Tauri commands, printing, backup or anything that saves bills or changes stock, even if the task just says "connect the screen to the database".
---

# Gokul backend

Phase 2 of `docs/PLAN.md`. The approved screens must not change: the backend implements the `Api` interface in `packages/data` exactly, and the apps swap `mockApi` for `tauriApi`.

## Shape
- `crates/core` (`gokul-core`) holds all business rules and the DB. It has no Tauri dependency and is tested with `cargo test`.
- `apps/pos/src-tauri` and `apps/office/src-tauri` are thin Tauri 2 shells. Each command is one call into core and returns `Result<T, ApiError>` with a plain-English message.
- Use `rusqlite` with bundled SQLite: WAL mode, `foreign_keys=ON`, `synchronous=FULL` for bill tables. The DB lives at `%APPDATA%\GokulRetail\gokul.db`. Migrations are numbered SQL files run at startup inside a transaction.

## Never negotiable
- **Money is i64 paise.** Never f32/f64. Quantity is i64 in milli-units (grams/ml/pcs×1000). Round GST per line, half-up, to the paise. Round the bill total to the rupee with the round-off shown.
- **A bill is never lost.** Bill, lines, payments and stock movements are written in ONE transaction, committed before the print. A crash at any point leaves either the full bill or nothing. Bill numbers have no gaps per series and financial year.
- **Stock is a ledger.** Every change is a `stock_movement` row (sale, return, purchase, adjust, production, packing). Current stock is derived from or checked against the ledger.
- **Nothing is deleted.** Cancels and returns are new records that reference the original. An audit log records who did what and when.
- Unknown tax treatment goes in a setting marked (verify) for the CA. Don't guess rates.

## Speed budgets (tested)
- Barcode lookup under 5 ms, add line under 10 ms, save bill under 50 ms on a 100k-bill DB, app start under 2 s on a 4 GB Windows 10 PC.

## Tests
- Unit tests for GST and rounding (property tests for totals), bill save/cancel/return, and stock ledger balance.
- Crash test: kill mid-save, reopen, and the DB is consistent.
- Speed tests on a generated 100k-bill DB.
- `cargo test` and the UI tests must pass before every commit.

Domain rules: see the `indian-retail-pos` and `wood-pressed-oil-business` skills.
