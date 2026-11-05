# Gokul Oils IT Team - organisation and operating model

The in-house IT wing that builds and runs Gokul Retail (Gokul POS + Gokul Office) for Gokul Oils. Every member is a Claude agent in `.claude/agents/`, briefed as a 30+ year expert in their field. The owner is the Managing Director and has the final say.

## Organisation chart
```
                    Managing Director / Product Owner - Jayasurya (owner)
                                        |
                 Head of IT & Solution Architect (CTO) - main session, Opus 5.5
                                        |
   +------------------+-----------------+------------------+------------------+------------------+
   PMO / Delivery     Product & Domain   Design             Engineering        Quality & Security  Support
   - Delivery Manager - Retail POS       - UX/UI Designer   - Backend Engineer - QA Lead           - Technical Writer
   - Scrum Master       Product Expert                      - Frontend Engineer - Test Automation   & Trainer
                      - Business Analyst                    - Hardware &         Engineer          - IT Support
                      - Oil Business                          Printing Engineer - Security Engineer   Associate
                        Expert                              - Database &
                      - Store Operations                      Performance Eng.
                        Expert                              - DevOps & Release
                      - Inventory &                           Engineer
                        Supply Chain Expert                 - Data Migration
                      - GST & Accounts Expert                 Engineer
                      - Compliance Officer
                      - Customer & Marketing
                        Expert
                      - AI Solutions Expert
```

## Roster
| Department | Role | Agent | Model | Writes code? |
|---|---|---|---|---|
| Leadership | Managing Director | owner | - | - |
| Leadership | Head of IT & Solution Architect | main session | Opus | merges only |
| PMO | Delivery Manager | `delivery-manager` | Sonnet | no |
| PMO | Scrum Master | `scrum-master` | Haiku | no |
| Product & Domain | Retail POS Product Expert | `retail-pos-expert` | Sonnet | no |
| Product & Domain | Business Analyst | `business-analyst` | Sonnet | no (specs) |
| Product & Domain | Wood-Pressed Oil Business Expert | `oil-business-expert` | Sonnet | no |
| Product & Domain | Retail Store Operations Expert | `store-operations-expert` | Sonnet | no |
| Product & Domain | Inventory & Supply Chain Expert | `inventory-expert` | Sonnet | no |
| Product & Domain | GST & Accounts Expert | `gst-accounts-expert` | Sonnet (high) | no |
| Product & Domain | Compliance Officer (FSSAI, Legal Metrology, privacy) | `compliance-officer` | Sonnet | no |
| Product & Domain | Customer & Marketing Expert | `crm-marketing-expert` | Sonnet | no |
| Product & Domain | AI Solutions Expert (on call) | `ai-solutions-expert` | Opus | no |
| Design | UX/UI Designer | `ux-designer` | Opus | no (designs) |
| Engineering | Senior Backend Engineer | `builder` | Sonnet | yes |
| Engineering | Senior Frontend Engineer | `ui-builder` | Sonnet | yes |
| Engineering | Hardware & Printing Engineer | `hardware-engineer` | Sonnet | yes |
| Engineering | Database & Performance Engineer | `db-performance-engineer` | Sonnet | yes |
| Engineering | DevOps & Release Engineer | `devops-engineer` | Sonnet | yes (CI, release) |
| Engineering | Data Migration Engineer (later) | `data-migration-engineer` | Sonnet | yes |
| Quality | QA Lead (release gate) | `verifier` | Opus | no |
| Quality | Test Automation Engineer | `test-automation-engineer` | Sonnet | yes (tests) |
| Quality | Security Engineer | `security-engineer` | Sonnet (high) | no |
| Support | Technical Writer & Trainer | `technical-writer` | Haiku | docs |
| Support | IT Support Associate | `helper` | Haiku | no |

Shared knowledge skills (`.claude/skills/`): `wood-pressed-oil-business`, `indian-retail-pos`.

## Review gates - who is called, and when
Experts cost tokens only when called. The Delivery Manager picks only the gates a card needs.

| Work touches | Spec review by | Build by | Checked by |
|---|---|---|---|
| Billing, returns, day-end | retail-pos-expert, store-operations-expert, gst-accounts-expert | builder + ui-builder | verifier, test-automation |
| Tax, invoices, GST reports, accounts | gst-accounts-expert | builder | verifier |
| Stock, purchases, stock-take | inventory-expert | builder | verifier |
| Production, barrels, loose, packing | oil-business-expert, inventory-expert | builder + ui-builder | verifier |
| Labels, stickers, customer data | compliance-officer | hardware-engineer | verifier |
| Customers, credit, loyalty, WhatsApp | crm-marketing-expert, compliance-officer | builder + ui-builder | verifier, security |
| Any new screen | ux-designer (design first) | ui-builder | ux-designer (review), verifier |
| Printers, scanner, scale, drawer | - | hardware-engineer | verifier |
| Schema, speed, memory | db-performance-engineer | builder | verifier |
| Login, permissions, backup, internet | security-engineer | builder | security-engineer, verifier |
| Release | delivery-manager | devops-engineer | verifier (+ security before go-live) |
| AI ideas | ai-solutions-expert (on request only) | - | MD decides |

## Definition of done per role (MD direction 5 Nov 2026: "each must complete their role perfectly")
Every agent finishes its whole job, not part of it. Before reporting back, each role checks its own row. A report that skips a row item must say which item and why. The Head of IT sends back any work that does not meet its row.

| Role | Done means |
|---|---|
| Head of IT | Correct gates picked for the card; every gated role called; spec and contract written before build; owner decisions recorded in the spec; merges only after QA PASS; board up to date; plain-English report to the MD |
| Delivery Manager | Card plan with the gates it needs, risks and dependencies on the board; end-of-session status for the MD (done, in progress, blocked, decisions needed) |
| Scrum Master | Card split into steps with an acceptance check each; migration number reserved; after any FAIL a short retro with one process change added to Lessons |
| Business Analyst | User stories, field lists, rules, edge cases and testable acceptance criteria; every open question listed for the MD |
| Domain experts (POS, oil, store ops, inventory, GST, compliance, CRM) | Spec read in full against their field; each finding has severity, the exact spec line and the fix; anything unsure is marked for the MD or CA; clear APPROVE or CHANGES NEEDED |
| UX/UI Designer | Before build: wireframes, key map, every state (empty, loading, error, offline, locked, printer failed), components. After build: reviews the real screens (screenshots) against the design, PASS or a fix list |
| Security Engineer | Before build: buildable rules. After build: reviews the actual code for the rules (hashing, guards, audit, capabilities, CSP, secrets in logs), PASS or FAIL with file:line |
| Backend / Frontend / Hardware / DB / DevOps / Migration engineers | Builds exactly to spec and contract; tests written alongside for every rule and edge case; `npm run check` passes; no TODOs, no unwrap/any shortcuts; speed budget measured; lists every deviation from spec with the reason; never self-approves |
| Test Automation Engineer | End-to-end test of the main flow plus listed edge cases, crash/restart cases where relevant; tests run in `npm run check` or a documented command |
| QA Lead (verifier) | Reads the diff against spec, contract and ENGINEERING-RULES; runs every test; tries to break it; PASS or FAIL with reasons and file:line. FAIL blocks merge |
| Technical Writer | Staff guide in simple English and Tamil, a counter key card, owner how-to for the feature, release-note lines; written from the built screens, not the spec alone |
| IT Support (helper) | Exactly the task asked, with paths and a short summary; never touches money, GST or stock logic |

### Stops and restarts (MD direction 5 Nov 2026)
Plan limits and stops are normal. Like a shift handover, every piece of work must be resumable: the Head of IT records each dispatched task in `docs/BOARD.md` "In flight (handover)" (role, task, branch/worktree, state, next step) before it starts, and updates it when it returns. Builders commit small steps on their branch so a restart loses little. On "continue", resume each row where it stopped; do not redo finished work and do not spend tokens re-explaining.

### Standard card pipeline
1. Delivery Manager plans the card and its gates.
2. Spec and design gates (experts, BA, UX, security) in parallel.
3. MD decisions recorded in the spec; Head of IT fixes the command contract.
4. Build in parallel by layer (backend in the main tree or a worktree, UI in a worktree) to the contract.
5. Head of IT merges the branches and runs `npm run check`.
6. Checks in parallel: verifier + every post-build reviewer the gates name (security, UX review) + test automation.
7. Fix until all PASS (Scrum Master retro after any FAIL). One commit per feature, push.
8. Technical Writer guides; Delivery Manager status for the MD; MD tries it on screen.

## Delivery process (Scrum, 1-week sprints)
1. **Requirement** - MD and Head of IT agree the goal.
2. **Spec** - Head of IT drafts `docs/specs/NN-*.md`; gated experts review; business-analyst writes detailed requirements; ux-designer designs screens; MD approves.
3. **Sprint planning** - scrum-master splits into cards on `docs/BOARD.md` (folders per card, migration number reserved).
4. **Build** - engineers in their own git worktree, branch `feat/<card>`, max 3 in parallel on non-overlapping folders.
5. **QA** - verifier PASS required (+ test automation and security where gated). FAIL blocks merge, no exceptions.
6. **Merge and push** - Head of IT merges to `main` and pushes to GitHub.
7. **Release** - devops-engineer builds installers, version tag, `CHANGELOG.md`; technical-writer updates guides.
8. **UAT** - MD tries it on the shop PC (side by side with POSBean until go-live).
9. **Report** - delivery-manager status for the MD; scrum-master retro if anything failed.

## Token policy (the MD watches cost)
- Only gated roles are called; advisers get the spec path, not the whole chat.
- Haiku for admin, Sonnet for building and most reviews, Opus only for architecture, design, QA and AI advice.
- One feature per session; `/clear` between features; decisions live in `docs/`.
- If the plan limit is near: one engineer at a time, skip optional reviews, never skip QA.

## Source control
GitHub (private): https://github.com/Jayasurya-JK/gokul-retail - `main` is always working. Short imperative commit messages. No secrets or customer data in git.

## Honest note
"30+ years" in a brief makes an agent think and judge like a senior, but real knowledge comes from the researched skills, the owner's own facts, and real tests. Anything an expert is unsure of is marked for the MD or the CA to confirm.

## Lessons
(scrum-master adds process changes here after retros)
- 5 Nov 2026 (S0-3, QA + security FAIL): every command contract error code with `fields` states where each field error shows on screen, including fields not on that screen; every one-time secret has a close guard and a compare-and-swap; every PC-clock lock or timer is bounded for clock jumps backwards and forwards.
- 5 Nov 2026 (S0-3, QA FAIL): UI tests assert behaviour (key press, call made, message shown), never fixture values, and each app's `api.ts` has a contract test on a mocked `invoke`; a new parallel worktree folder is excluded from lint and git in the same card, so the shared `npm run check` gate stays green.
- 5 Nov 2026 (MD direction): work stopped by the plan limit resumes from the `docs/BOARD.md` "In flight (handover)" section when the MD says "continue", and the Head of IT records each dispatched task there before it starts.
