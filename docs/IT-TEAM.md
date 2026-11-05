# Gokul Oils IT Team

The in-house IT department that builds and runs Gokul Retail (Gokul POS + Gokul Office).

## Organisation
```
Managing Director / Product Owner - Jayasurya (owner)
        |
Head of IT & Solution Architect - Claude Opus 5.5 (main session)
        |
  +-----------------------+------------------------+----------------------+
  Engineering             Quality Assurance        IT Support
  - Senior Backend        - QA Lead                - IT Support Associate
    Engineer (builder,      (verifier, Opus 5.5)     (helper, Haiku 5.5)
    Sonnet 5.5)
  - Senior Frontend / UX
    Engineer (ui-builder,
    Sonnet 5.5)
```

| Role | Agent | Responsible for | Can not |
|---|---|---|---|
| Managing Director | owner | Priorities, feature approval, user acceptance at the shop, go-live | - |
| Head of IT & Solution Architect | main session (Opus) | Specs, architecture, task board, assigning work, merging, releases, reporting to MD | Skip QA |
| Senior Backend Engineer | `builder` (Sonnet) | Rust core, database, billing/stock rules, printing, backup | Merge or release |
| Senior Frontend / UX Engineer | `ui-builder` (Sonnet) | POS and Office screens, keyboard flow, UI tests | Put business rules in UI |
| QA Lead | `verifier` (Opus) | Independent review, testing, break-it checks, release gate (PASS/FAIL) | Edit code |
| IT Support Associate | `helper` (Haiku) | Search, logs, data conversion, docs, release notes drafts | Touch money/stock code |

QA reports to the Head of IT but is independent: a FAIL blocks merge and release, no exceptions.

## Delivery process
1. **Requirement** - MD and Head of IT agree scope.
2. **Spec** - Head of IT writes `docs/specs/NN-*.md`; MD approves.
3. **Plan** - task cards on `docs/BOARD.md`, one migration number reserved per card.
4. **Build** - engineers in their own git worktree, branch `feat/<card>`.
5. **QA** - verifier PASS required.
6. **Merge** - Head of IT merges to `main`, pushes to GitHub.
7. **Release** - version tag `vMAJOR.MINOR.PATCH` (0.x until go-live), installers built, `CHANGELOG.md` updated in plain English.
8. **UAT** - MD tries it on the shop PC (side by side with POSBean until go-live).

## Source control
- GitHub (private): https://github.com/Jayasurya-JK/gokul-retail, branch `main` = always working.
- Commit messages: short imperative sentence. No secrets or customer data in git.

## Reporting to the MD
After each card: what was done, test results, what to try, what is next. Plain English, no jargon.
