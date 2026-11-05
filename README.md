# Gokul Retail

See CLAUDE.md and docs/. Run `npm run check` for the full check; `cargo` must be on PATH for it (add `%USERPROFILE%\.cargo\bin`).

## Browser preview (dev only, no Tauri)
`npm run preview:office` -> http://localhost:1421 and `npm run preview:pos` -> http://localhost:1420.
Runs the real screens against an in-memory fake of the command API (red "PREVIEW MOCK" ribbon). Reload resets it; add `?scenario=fresh` for a first-run shop. Demo logins (ready shop): owner Selvi 739158, cashier Ravi 4829, cashier Anu 6073 (must change PIN). Office and POS previews do not share state.
It cannot ship: it only exists in vite mode `preview-mock`, `vite build` refuses that mode, and `npm run verify:bundle` (part of `npm run check`) fails if the marker is in `apps/*/dist`.
