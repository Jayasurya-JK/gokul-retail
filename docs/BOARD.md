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
| S0-3 | 00 shells and login (migration 002) | built: backend ba91a37 + screens fec6aff merged on feat/S0-3. Checks running: verifier, security-engineer, test-automation (e2e + preview); then ux-designer screenshot review | fixing (QA + security FAIL, narrow) |

### S0-3 plan (remaining pipeline, to contract `docs/specs/00-step3-login-security.md`)
| # | Step | Role | Runs |
|---|---|---|---|
| 1 | Merge feat/S0-3-ui into main, run `npm run check` | Head of IT | alone, after both builds report |
| 2a | Verify diff vs spec, contract, ENGINEERING-RULES; PASS/FAIL | verifier | parallel |
| 2b | Post-build code review (hashing, guards, audit, capabilities, CSP, no secrets in logs) | security-engineer | parallel |
| 2c | Screen review with screenshots vs design (all states) | ux-designer | parallel |
| 2d | E2E: login, first-run owner, lockout, cashier blocked from Settings/Users, Ctrl+L keeps state | test-automation-engineer | parallel |
| 3 | Fix all FAIL items; retro if any FAIL | builder / ui-builder; scrum-master | after 2a-2d |
| 4 | One commit, push | Head of IT | after all PASS |
| 5 | Staff guide (login, PIN change, lockout, Ctrl+L, owner recovery code) English + Tamil, key card | technical-writer | after 4 |
| 6 | Status report to MD | delivery-manager | after 5 (can start with 5) |
| 7 | On-screen check, side by side with POSBean | MD | last |

### S0-3 Risks
| Risk | Owner | Mitigation |
|---|---|---|
| Contract drift between parallel builders | Head of IT | Check command names/types against the spec at merge; verifier checks both sides |
| Argon2 too slow on shop PC (target 150-200 ms) | builder | Run the ignored benchmark on a low-end setting; tune per spec rule 2 |
| Tamil font missing/ugly on shop PC | ux-designer | Check Tamil text on the shop PC; bundle a font if needed (size cost to confirm) |
| WebView2 browser keys (F5, Ctrl+R, F12, Ctrl+P) disturb billing | ui-builder; security-engineer | Block or handle in the app; e2e test |
| POSBean side by side: focus theft, window fights (maximised, not full screen) | ux-designer; MD | Test with both open on the shop PC |
| Owner recovery code lost or shown once only | technical-writer | Guide says write it down and keep it safe; MD confirms who holds it |
| Token/plan limit during parallel checks | Head of IT | Drop to fewer parallel reviewers, never skip verifier |

### Decisions needed from MD (not blocking S0-3)
- POSBean save key and F-keys (spec defaults: F10 and Ctrl+S both work).
- CA to confirm: GST regular vs composition, and whether GSTIN/FSSAI must print on bills (optional for now).
- Printer paper width (58 or 80 mm) and Tamil printing on bills.

## In flight (handover) - Head of IT updates this at every dispatch and every return
If work stops (plan limit, crash, new session), the MD says "continue": the Head of IT reads this table and resumes each row where it stopped - same session: resume the same agent (SendMessage); new session: start the same role on the same branch/worktree with "continue from the branch state and the task below". Never restart finished work.

| Role | Task | Branch / worktree | State | Next step |
|---|---|---|---|---|
| builder (Sonnet) | S0-3 final batch BE: queued (a)-(e), (g); UX 7, 9, 22 check; LoginUser.role | feat/S0-3-final-be / .claude/worktrees/agent-a76827da5223d169a | running | commit, report -> merge |
| ui-builder (Sonnet) | S0-3 final batch UI: UX Must 1, 2; UX 3, 6, 7, 15 (role column); queued (e) hint, (f) test | feat/S0-3-final-ui / .claude/worktrees/agent-a4ab20679d7a6b59c | running | commit, report -> merge |
| Head of IT | merge both branches, `npm run check` (no agent re-review; QA + security already PASS) | feat/S0-3 | waiting | merge to main, push. Staff guide deferred until billing works. |
| Deferred to B-6/B-7 | UX review items 4, 5, 8, 10-14, 15 (rest), 16-22 (see docs/design/00-shells-and-login-review.md); item 21 into spec 03 | - | parked | - |
| Carry to billing card B-2 | idle lock (if owner enables POS idle) must keep the draft bill; IT setup checklist: Windows time sync on, staff Windows account non-admin | - | noted | Head of IT |

## Done
| S0-1+2 | 00 skeleton: scaffold + database (14 core tests, installers ~3.8 MB each) | builder | QA PASS 5 Nov 2026 (after 1 FAIL: BOM, schema collation/index) |

## Lean plan (MD, 6 Nov 2026) - budgets: small < 300k, medium < 800k tokens per card
| Card | Team | Budget |
|---|---|---|
| S0-4+5+6 combined: crash safety, backup/restore, speed proof | 1 builder (Sonnet) + 1 review (Sonnet) | medium |
| B-1+B-2: billing maths + bill save/returns/hold | 1 builder (Sonnet) + QA once (Opus, money) + GST expert spec review (Sonnet) | medium |
| B-6 + login look: visual mock first -> MD yes -> build | ux-designer mock (Sonnet) + 1 ui-builder (Sonnet) + 1 review | small + medium |

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
