# T11: Mock parity for exchange refunds (browser preview only)

**Branch:** wip/r6. **Do not commit.** Spec: `tools/junior/reports/R6-gap.md`, item **A1** and "Suggested task order" step 9.

## Build
The real Rust backend already subtracts cash exchange refunds from expected drawer cash. The browser-preview mock does not. Make the mock match:
1. In `packages/data/src/areas/shift.ts`, make `summarise` include `cashRefunds`, counting exchange refunds paid in cash plus cash refunds on returns. Subtract them from `expectedCash`, exactly as the Rust `shift.rs` does. Read the Rust code first and copy its formula.
2. Show the new line where the X/Z summaries are built in the mock, if the type requires it.
3. Add or extend a mock unit test if a test pattern exists in `packages/data/scripts` or tests.

## Done when (paste the final lines)
- `npm run typecheck` → 0 errors
- `npm run lint` → clean
- `npm test` → passes

## Rules
Never open `data/import/**`, `*.db`, or AppData.

## Report
List the files changed, and the formula used.
