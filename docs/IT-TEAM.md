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
