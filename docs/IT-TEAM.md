# Gokul Oils IT Team — lean operating model

The in-house team that builds Gokul Retail (POS + Office) for Gokul Oils. Small, sharp, and answerable to the Managing Director (owner).

**The one rule: a card is done only when the owner can click it on the screen.** Tests, docs and reports are supporting evidence, never the goal.

## Team (4 agents + the main session)

| Role | File | Model | Does |
|---|---|---|---|
| Head of IT (lead) | main session | Opus | Talks to the owner, writes the spec, merges, runs `npm run check`, reports cost. Merges only after QA PASS. |
| Designer | `ux-designer` | Opus | Owns `docs/DESIGN-SYSTEM.md`. One visual mockup per new screen BEFORE build. Reviews built screens against the mockup. |
| Builder | `builder` | Sonnet | Rust core: money, stock, GST, crash safety, database. Tests for every rule. |
| UI builder | `ui-builder` | Sonnet | React screens exactly to the approved mockup + design tokens. Screenshot before finishing. |
| Verifier | `verifier` | Opus (money) / Sonnet | Reads diff vs spec + design, runs every test, tries to break it. PASS or FAIL. |

No other roles. Domain knowledge (GST, retail, oil) comes from the researched skills `indian-retail-pos` and `wood-pressed-oil-business`, read by the builder — not from extra "expert" meetings.

## The loop (one feature = one card)

1. **Spec** (lead) — one page: user steps, data rules, edge cases, acceptance, token budget. Owner approves.
2. **Design** (designer) — a real-looking HTML mockup of every new screen. Owner approves. **No approval, no build.**
3. **Build** (builder + ui-builder, parallel only when their folders don't overlap) — to the spec and the mockup, tests written alongside.
4. **Verify** (verifier) — diff vs spec + design, run `npm run check`, screenshot check. PASS or FAIL.
5. **Fix** until PASS, then one commit per feature.
6. **Owner check** on screen. Done.

## Rules that save money (tokens = salary)

1. **One screen per card.** Order: billing → items → stock → purchases → reports → production → printing.
2. **Budget per card** written on the board before start: small < 100k, medium < 250k, money/stock < 500k tokens. Actual cost reported to the owner at the end.
3. **Screenshot or FAIL.** builder and ui-builder attach a screenshot of the finished screen and confirm it matches the mockup. No screenshot = FAIL.
4. **Tests only where it matters:** money, stock, GST and crash rules, plus one end-to-end flow. Not 48 tests per form.
5. **`npm run check` is the gate** (free). The lead runs it; the lead never does hands-on testing or screenshots.
6. **Opus only** for design, specs, and the first QA of money/stock/GST/crash. Sonnet for building and every re-check.
7. **One design source of truth:** `docs/DESIGN-SYSTEM.md`. No ad-hoc colors, no second style guide.

## Done means (per role)

- **Head of IT:** spec approved, merged after PASS, board current, plain-English cost report.
- **Designer:** mockup approved, then the built screen matches it (screenshot) or a Must-fix list.
- **Builder / UI builder:** builds to spec + mockup, `npm run check` green, screenshot attached, no TODOs, never self-approves.
- **Verifier:** PASS or FAIL with reasons and file:line. FAIL blocks merge.

## Stops and restarts

Record each dispatched task on the board before it starts (role, branch, state, next step). On "continue", resume where it stopped — never redo finished work, never re-explain.

## Source control

GitHub private. `main` always working. Short imperative commit messages. No secrets or customer data in git.
