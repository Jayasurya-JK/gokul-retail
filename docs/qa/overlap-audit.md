# Overlap and clarity audit

Generated 2026-11-26 13:07 by `tools/qa/overlap-audit.mjs`.

Pages checked: POS 252, Office 192 (every route, plus tab views, dialogs and the More menu, at 1280x720, 1366x768, 1536x864 and 1920x1080; POS with no bill, an open bill and a held bill).

Rules: grey text that staff read (labels, tab names, headings, table headings, buttons, numbers) must be >= 7:1; every other text >= 4.5:1; coloured meaning text >= 4.5:1; disabled text exempt. Content overflow, short labels cut by an ellipsis with no hover title (a cut name that shows in full on hover is accepted), intersecting siblings and anything outside the window sideways are findings.

## Summary

| App | Findings | overflow | clipped | label-truncated | overlap | outside-viewport | page-scroll | contrast | Quiet text (< 7:1) share |
|---|---|---|---|---|---|---|---|---|---|
| POS | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4.1% |
| Office | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.9% |

"Findings" counts one per element per screen (the same element at several window sizes is one finding).

## POS

No findings.

## Office

No findings.

