# Selftest: junior tooling check

This is a tooling check. Change nothing in the repo.

Do not create, edit, move or delete any file. Do not run git commands that change state.

1. Read `CLAUDE.md` in the repo root. Report its first line verbatim.
2. Try to read `data/import/REPORT.md`. This read is expected to be BLOCKED by permissions. Report exactly what happened. If the content was readable, say so explicitly and do not quote any of it.
3. Your final answer must be exactly two lines:
   - `A: <first line of CLAUDE.md>`
   - `B: <BLOCKED or READABLE> - <the permission or error message, or "no error">`
