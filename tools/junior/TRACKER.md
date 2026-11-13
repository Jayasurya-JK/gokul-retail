# Junior tracker

Run a task: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\junior\run.ps1 -Task tools\junior\tasks\<name>.md [-Model pro|flash] [-MaxTurns 120]`

Status values: queued, running, review, fixing, done, rejected.
Fix by: Haiku or Sonnet. Commit: the commit hash once the lead commits the work (the junior never commits).

| Task | File | Branch | Model | Run log | Status | Reviewer notes | Fix by (Haiku/Sonnet) | Commit |
|------|------|--------|-------|---------|--------|----------------|-----------------------|--------|
| selftest | tools/junior/tasks/selftest.md | wip/r6 | flash | tools/junior/logs/selftest-20261113-173637.jsonl (not tracked) | done | Tooling check: data/import/REPORT.md read was DENIED; CLAUDE.md read OK; 3 turns. | - | - |
| T01 fix typecheck | tasks/T01-fix-typecheck.md | wip/r6 | flash | logs/T01-fix-typecheck-20261113-174643 | done | 1st run failed (runner context bloat, fixed). 2nd run: 3 files/10 lines, typecheck 0, lint clean, tests ok (known flake). Reviewed by lead. | - | (this commit) |
| T02 gap audit | tasks/T02-r6-gap-audit.md | wip/r6 | flash | logs/T02-* | done | Report reports/R6-gap.md: billing A1-A10 done, production B1-B9 UI missing. | - | |
| T03 godown tab | tasks/T03-godown-tab.md | wip/r6 | flash | logs/T03-* | done | 2 files, typecheck 0, lint clean; visual check pending in final pass. | - | |
| T04 godown actions | tasks/T04-godown-actions.md | wip/r6 | flash | logs/T04-* | done | 2 files, checks clean. Invoice no/date stored in note (backlog: real columns). | - | |
| T05 pressing + transfer | tasks/T05-pressing-transfer.md | wip/r6 | flash | logs/T05-* | done | 4 files, checks clean, old MoveToBarrel UI retired (backend kept). Godown barrel required on pressing - confirm with owner. | - | |
| T06 mill daily (read-only) | tasks/T06-mill-daily.md | wip/r6 | flash | logs/T06-* | gate-passed | typecheck 0; full review at end of batch. | - | |
| T07-insights | tasks/T07-insights.md | wip/r6 | flash | logs/T07-insights-* | gate-passed | typecheck+lint 0; full review at end. | - | |
| T08-blind-stocktake | tasks/T08-blind-stocktake.md | wip/r6 | flash | logs/T08-blind-stocktake-* | gate-passed | typecheck+lint 0; full review at end. | - | |
| T09-items-supplier | tasks/T09-items-supplier.md | wip/r6 | flash | logs/T09-items-supplier-* | gate-passed | typecheck+lint 0; full review at end. | - | |
