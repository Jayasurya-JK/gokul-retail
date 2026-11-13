# T01: Make the WIP code compile (TypeScript)

**Branch:** wip/r6 (already checked out). **Do not commit.** Work only in this repo.

## Context
Gokul Retail is a Tauri desktop POS. The Rust core is in `crates/core`, the shared TS Api is in `packages/data`, and the apps are in `apps/pos` and `apps/office`. An earlier developer was stopped half-way through "round 6". Their unfinished work is in commit `c6a45a8`; run `git show --stat c6a45a8` to see it. The newer commit `05fc485` only adds `tools/junior/`.
- The Rust core already compiles: `cargo check -p gokul-core` passes.
- TypeScript does **not**: `npm run typecheck` reports about 41 errors in
  - `packages/data/src/areas/production.ts`
  - `packages/data/src/areas/purchasing.ts`
  - `packages/data/src/areas/store.ts`
  - `apps/office/src/components/purchasing/common.tsx`

## Goal
Make `npm run typecheck` pass with **zero errors**, by finishing the wiring the previous developer started. **Do not delete features** to silence errors.
1. Read `crates/core/src/godown.rs`, `crates/core/migrations/013_godown.sql`, and the godown/production methods in `crates/core/src/dispatch.rs`, to learn the real backend shapes.
2. Make the TS types and Api methods in `packages/data/src/areas/production.ts` and `purchasing.ts` match those Rust shapes **exactly**: field names in camelCase as the Rust serde output gives them, and amounts as integers (paise, milli-units).
3. Make `MockStore` in `store.ts` and the mock implementations consistent, so the browser preview works with sample data.
4. Make sure every new Api method is listed in `packages/data/src/tauri/tauriApi.ts` and in Rust `METHODS`.
5. Fix `apps/office/src/components/purchasing/common.tsx`.

## Rules
- Follow `CLAUDE.md` and `.claude/skills/gokul-backend/SKILL.md`.
- Money is integer paise; never floats.
- Don't change the database schema or migrations in this task.
- **Never** open `data/import/**`, any `*.db` file, or anything under AppData.

## Done when (run these and paste the final lines in your answer)
- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `cargo test -p gokul-core` → all pass. If only `demo_seed_matches_the_mock_shop_and_is_fast` fails, rerun it alone; it's a known timing flake.

## Report
List the files you changed and what you changed in each, any Rust/TS shape mismatches you found, and anything you were unsure about.
