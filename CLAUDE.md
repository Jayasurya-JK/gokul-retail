# Gokul Retail - billing and stock software for Gokul Oils

Own retail POS for Gokul Oils (oil shop, 500+ bills/day). Replaces an old POSBean licence. Staff are used to POSBean, so the billing screen must feel familiar: keyboard-first, scan-and-go, no mouse needed.

**The one rule: it must never be slow, never lose a bill, never crash during billing.** Staff will compare it to POSBean on day one.

Not for sale now. Write it cleanly enough that it could become a product later.

## Read first
- `docs/ENGINEERING-RULES.md` - non-negotiable quality rules (money, stock, speed, crash safety)
- `docs/FEATURES.md` - feature menu; only build what the owner marked MUST
- `docs/MODEL-ROUTING.md` - which Claude model does which job
- `docs/specs/` - one spec per feature, written before any code

## Stack (proposed, confirm counter hardware first)
Electron + React + TypeScript (strict) + Vite. SQLite via `better-sqlite3` (WAL mode), plain SQL migrations. Vitest for unit tests, Playwright for end-to-end. Thermal bills via ESC/POS, barcode stickers via TSPL/ZPL. Works fully offline on a Windows counter PC.

## How work is done (no vibe coding)
Every feature goes through this loop. Skipping a step is not allowed.

1. **Discuss** (main session, Opus) - agree scope with the owner in plain English.
2. **Spec** (main session, Opus) - write `docs/specs/NN-feature.md`: user steps, data tables, rules, edge cases, acceptance tests, speed budget. Owner approves.
3. **Build** - `builder` (logic, database, printing) or `ui-builder` (screens). Small steps, tests written alongside.
4. **Verify** - `verifier` (Opus) reviews the diff against the spec and rules, runs all tests, tries to break it. Verdict PASS or FAIL with reasons.
5. **Fix** until PASS. Then one git commit per feature (short imperative message).
6. **Owner check** - owner tries it on the screen before it counts as done.

Use `helper` (Haiku) for searching the code, reading logs, converting data files, and writing docs. Do not send it money or stock logic.

## Token discipline
- One feature per session. `/clear` between features, `/compact` when a session is long.
- The spec file is the memory. Agents read the spec, not the whole chat.
- Give subagents exact file paths and the spec path. No "explore everything".
- Do not re-run the full research. Decisions live in `docs/`.

## Commands (after the skeleton exists)
- `npm run dev` - run the app
- `npm test` - unit tests (must pass before any commit)
- `npm run e2e` - end-to-end billing tests
- `npm run typecheck`, `npm run lint`

## Out of scope until the owner says so
Importing POSBean data, real item lists and customers. That comes last, after the skeleton and core screens work with test data.
Never reverse engineer, decompile or crack POSBean or GoFrugal. Learn from their public features, the owner's own exports, and watching staff use it.
