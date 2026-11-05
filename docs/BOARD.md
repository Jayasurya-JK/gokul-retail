# Gokul Oils IT Team - task board

Roles and process: see `docs/IT-TEAM.md`.

## Parallel rules
- Max 3 developers at once. Each works in its own git worktree (`isolation: worktree`), on one task card.
- Run in parallel only when tasks touch different folders. Foundation work (core schema, billing maths) is one at a time.
- Only the CTO (main session) merges, after QA PASS. One migration number is reserved per task before it starts, to avoid clashes.
- If the Claude plan limit is close, drop to 1 developer.

## Now
| Card | Spec / step | Who | Status |
|---|---|---|---|
| S0-3 | 00 shells and login (migration 002) | builder (core+commands) -> ui-builder (screens) -> verifier | building |

## Done
| S0-1+2 | 00 skeleton: scaffold + database (14 core tests, installers ~3.8 MB each) | builder | QA PASS 5 Nov 2026 (after 1 FAIL: BOM, schema collation/index) |

## Next (one at a time - foundation)
| S0-4 | 00 crash safety and errors | builder | waiting |
| S0-5 | 00 backup and restore | builder | waiting |
| S0-6 | 00 speed proof | builder | waiting |
| B-1 | 03 billing maths | builder | waiting |
| B-2 | 03 bill save, returns, hold, drafts (migration 004) | builder | waiting |
| B-3 | 03 day open/close, cash in/out, permissions | builder | waiting |

## Then (parallel lanes, max 3)
| Lane | Cards |
|---|---|
| Printing | B-4 print module and templates |
| Office UI | B-5 items, stock, purchases -> B-7 dashboard, reports, users, settings |
| POS UI | B-6 billing screen, payment, hold, returns, day close |
Then B-8 hardening (one at a time), spec 04, spec 01, spec 02.
