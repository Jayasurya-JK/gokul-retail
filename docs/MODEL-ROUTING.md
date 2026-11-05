# Which model does which job (researched 5 Nov 2026)

| Model | Price per 1M tokens (in / out) | Coding score (SWE-bench Pro) | Web/UI score (WebDev Arena) |
|---|---|---|---|
| Opus 5.5 | $4 / $20 | 89.9% (top) | 1810 (top) |
| Sonnet 5.5 | $2 / $10 | 81.3% | 1770 (3rd, very close) |
| Fable 5.1 | $10 / $50 | 81.2% | not confirmed |
| Haiku 5.5 | $0.10 / $0.50 | well below Sonnet | not ranked |

Scores are from third-party leaderboards (BenchLM, BenchLeader, Nov 2026), not Anthropic. Treat them as a guide.

## Decision
- **Main session = Opus 5.5.** Talks with the owner, writes specs, plans. Best at reasoning and the cheapest Opus yet.
- **builder = Sonnet 5.5.** Writes logic, database and printing code. About 90% of Opus coding quality at half the price.
- **ui-builder = Sonnet 5.5.** Builds screens. Sonnet is only ~40 points behind Opus on WebDev Arena; Opus checks the result.
- **verifier = Opus 5.5.** Checks money, stock and crash safety, where a missed bug costs real money. Worth the cost.
- **helper = Haiku 5.5.** Search, logs, data conversion, docs. About 40x cheaper than Sonnet.
- **Fable 5.1: not used by default.** It costs 2.5x Opus and scores no better on these coding boards. Only for a problem Opus has failed on twice.

## Saving tokens
- Effort: helper `low`, builder/ui-builder `medium`, verifier `high`. Raise only if work comes back wrong.
- Do not set `CLAUDE_CODE_SUBAGENT_MODEL`; each agent file sets its own model.
- If the Claude plan runs low, the main session can switch to Sonnet (`/model sonnet`) for routine days; keep the verifier on Opus.
