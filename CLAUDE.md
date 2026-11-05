# Gokul Retail - billing and stock software for Gokul Oils

Own retail POS for Gokul Oils (oil shop, 500+ bills/day). Replaces an old POSBean licence. Staff are used to POSBean, so the billing screen must feel familiar: keyboard-first, scan-and-go, no mouse needed.

**The one rule: it must never be slow, never lose a bill, never crash during billing.** Staff will compare it to POSBean on day one.

**Quality bar: build it like a commercial POS company would.** Modern, high-quality, efficient. No shortcuts, no "good enough for now". Product-grade code, tests, error handling and UX.

Not for sale now, but build it as if it will be sold later (clean modules, settings instead of hard-coded shop details).

Built and run by the **Gokul Oils IT Team** (`docs/IT-TEAM.md`). The main session is the Head of IT & Solution Architect and reports to the owner (Managing Director).

## Read first
- `docs/IT-TEAM.md` - team roles and delivery process; `docs/BOARD.md` - task board
- `docs/DESIGN-SYSTEM.md` - the single visual source of truth (palette, type, screens)
- `docs/ENGINEERING-RULES.md` - non-negotiable quality rules (money, stock, speed, crash safety)
- `docs/FEATURES.md` - feature menu; only build what the owner marked MUST
- `docs/MODEL-ROUTING.md` - which Claude model does which job
- `docs/specs/` - one spec per feature, written before any code

## Stack (decided 5 Nov 2026)
- **Tauri 2** desktop app -> one small NSIS installer `.exe`. Uses Windows' built-in WebView2. Fast and small by design.
- **Two apps**: `apps/pos` (Gokul POS - billing counter only) and `apps/office` (Gokul Office - dashboard, items, stock, production, reports, settings). Same DB.
- **Rust core** `crates/core` (`gokul-core`): all business rules, database, stock, GST, printing, backup. `rusqlite` with bundled SQLite, WAL mode. Tested with `cargo test`. No Tauri dependency.
- **UI**: React + TypeScript (strict) + Vite per app, shared components in `packages/ui`. UI only calls Tauri commands; no business rules in the UI. Tested with Vitest.
- Rust tools live in `%USERPROFILE%\.cargo\bin` - add it to PATH in each shell if `cargo` is not found.
- Thermal bills via ESC/POS, barcode stickers via TSPL/ZPL (printer models to confirm).
- Fully offline. Data in `%APPDATA%\GokulRetail\`.
- Fast and efficient is a virtue, not a ceiling. Build modern and high-quality.

## How work is done (no vibe coding)
Every feature goes through this loop. Skipping a step is not allowed.

1. **Discuss** (main session, Opus) - agree scope with the owner in plain English.
2. **Spec** (main session, Opus) - write `docs/specs/NN-feature.md`: user steps, data tables, rules, edge cases, acceptance tests, speed budget. Owner approves.
3. **Design** (ux-designer, Opus) - one visual mockup per new screen, following `docs/DESIGN-SYSTEM.md`. Owner approves. No approval, no build.
4. **Build** - `builder` (logic, database, printing) or `ui-builder` (screens). Small steps, tests written alongside. A screenshot of the built screen is attached before finishing.
5. **Verify** - `verifier` reviews the diff against the spec, rules and design, runs all tests, tries to break it. Verdict PASS or FAIL with reasons.
6. **Fix** until PASS. Then one git commit per feature (short imperative message).
7. **Owner check** - owner tries it on the screen before it counts as done.

The team is four agents + the main session: `ux-designer`, `builder`, `ui-builder`, `verifier`. No other agents. Domain questions (GST, retail, oil) come from the skills, not extra experts.

## Token discipline
- One feature per session. `/clear` between features, `/compact` when a session is long.
- The spec file is the memory. Agents read the spec, not the whole chat.
- Give subagents exact file paths and the spec path. No "explore everything".
- Do not re-run the full research. Decisions live in `docs/`.

## Commands (after the skeleton exists)
- `npm run tauri dev` - run the app
- `npm run check` - everything below in one go (must pass before any commit)
- `cargo test --manifest-path src-tauri/Cargo.toml` - Rust core tests, incl. speed budget tests
- `npm test` - UI tests; `npm run typecheck`, `npm run lint`
- `npm run tauri build` - makes the installer in `src-tauri/target/release/bundle/nsis/`

## Out of scope until the owner says so
Importing POSBean data, real item lists and customers. That comes last, after the skeleton and core screens work with test data.
Never reverse engineer, decompile or crack POSBean or GoFrugal. Learn from their public features, the owner's own exports, and watching staff use it.
