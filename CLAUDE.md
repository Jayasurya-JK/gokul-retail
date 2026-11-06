# Gokul Retail

Retail billing and stock software for Gokul Oils (oil shop, 500+ bills a day). It must be good enough to compete with market retail software (GoFrugal, POSBean, Marg class).

## Two apps, one database
- **Gokul POS**: the billing counter. Keyboard-first and scan-and-go, so staff never need the mouse. It must never be slow, never lose a bill and never crash.
- **Gokul Office**: back office for items, stock, purchases, reports and settings.

## Rules
- Keep it simple. No agent "team", boards or process paperwork.
- **This is desktop software, not a website.** It fills the window, works keyboard-first, uses no web-page patterns, and looks world-class and modern, never basic.
- Plan and stack: `docs/PLAN.md`. Design rules: `docs/design/BRIEF.md`.
- Skills: `gokul-desktop-ui` (any screen), `gokul-backend` (Rust/DB), `indian-retail-pos` (billing, GST), `wood-pressed-oil-business` (oil domain).
- Screens are designed by Sonnet first; the backend comes after the UI is approved.
- Shop details live in settings, never hard-coded.
- Fully offline.

Old work (before 6 Nov 2026) is in git tag `archive/old-it-company`. Use it only for reference.
