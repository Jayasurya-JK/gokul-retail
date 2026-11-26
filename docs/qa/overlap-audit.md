# Overlap and clarity audit

Generated 2026-11-26 12:33 by `tools/qa/overlap-audit.mjs`.

Pages checked: POS 240, Office 192 (every route, plus tab views, dialogs and the More menu, at 1280x720, 1366x768, 1536x864 and 1920x1080; POS with no bill, an open bill and a held bill).

Rules: grey text that staff read (labels, tab names, headings, table headings, buttons, numbers) must be >= 7:1; every other text >= 4.5:1; coloured meaning text >= 4.5:1; disabled text exempt. Content overflow, short labels cut by an ellipsis with no hover title (a cut name that shows in full on hover is accepted), intersecting siblings and anything outside the window sideways are findings.

## Summary

| App | Findings | overflow | clipped | label-truncated | overlap | outside-viewport | page-scroll | contrast | Quiet text (< 7:1) share |
|---|---|---|---|---|---|---|---|---|---|
| POS | **2 (fixed after the run, re-run clean)** | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 4.1% |
| Office | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3.0% |

"Findings" counts one per element per screen (the same element at several window sizes is one finding).

## POS

No findings (the two /sales action-row overflows at 1366 found in the full run were fixed afterwards: the row now wraps; a 1366 re-run of POS is clean).

## Office

No findings.


## Before and after

Before (old code, same script; POS also covered /home which another branch is rebuilding): POS 652 findings at the time of the first run, Office 1788 (mostly contrast: grey text under 7:1, white text on light avatar colours; plus clipped and ellipsis-cut labels, toolbar and table overflows). After: POS 0, Office 0.
Not audited: /home (being rebuilt in wip/home-v3). Its deep tiles still use white/80 text and the old tile sizes.
Screenshots: docs/qa/shots/before and docs/qa/shots/after.
