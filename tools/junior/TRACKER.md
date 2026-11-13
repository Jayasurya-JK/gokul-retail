# Junior tracker

Run a task: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\junior\run.ps1 -Task tools\junior\tasks\<name>.md [-Model pro|flash] [-MaxTurns 120]`

Status values: queued, running, review, fixing, done, rejected.
Fix by: Haiku or Sonnet. Commit: the commit hash once the lead commits the work (the junior never commits).

| Task | File | Branch | Model | Run log | Status | Reviewer notes | Fix by (Haiku/Sonnet) | Commit |
|------|------|--------|-------|---------|--------|----------------|-----------------------|--------|
| selftest | tools/junior/tasks/selftest.md | wip/r6 | flash | tools/junior/logs/selftest-20261113-173637.jsonl (not tracked) | done | Tooling check: data/import/REPORT.md read was DENIED; CLAUDE.md read OK; 3 turns. | - | - |
