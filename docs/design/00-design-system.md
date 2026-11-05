# Design system - Gokul POS and Gokul Office

Status: DRAFT for card S0-3 (spec `docs/specs/00-skeleton.md`, Step 3). This is the single shared design system file; every later screen design reuses it. Change it here, never per screen.

Built in `packages/ui` (`theme.css` + components). Replaces the Step 1 placeholder tokens in `packages/ui/src/theme.css`.

## 1. Ground rules

1. **Keyboard first, mouse optional.** Every action has a key. Mouse clicks do the same thing as the key, never more.
2. **Focus is always visible and never lost** (section 6).
3. **No animation anywhere.** No CSS `transition`, `animation`, spinners, fades, slide-ins, skeleton shimmer or smooth scroll. Idle CPU must be ~0%. Theme sets `* { transition: none; animation: none; scroll-behavior: auto; }`. A lint/test check greps the CSS for `transition`/`animation`/`@keyframes` and fails if found.
4. **No polling.** The clock re-renders once a minute on a `setTimeout` aligned to the next minute boundary. Other status values update on events or on screen entry.
5. **High contrast for a bright shop and a cheap TN monitor.** Body text >= 7:1, small or muted text >= 7:1, borders of inputs >= 3:1. No pale grey text, no information by colour only (always a word or a `!` too).
6. **Errors in plain words with the fix.** "PIN must be 4 to 6 digits." not "Invalid input". No error codes for staff; the code goes in small text for IT only.
7. **Crisp text.** No `opacity` on text, no CSS `transform: scale`, no text on gradients or images, no font weight below 400 (Segoe UI Light is unreadable on cheap panels).
8. **No white flash on start.** `index.html` sets `background:#ffffff` and a static "Starting Gokul POS..." text before React loads; the Tauri window background is set to the same colour.

## 2. Screen sizes

| Target | CSS size | Root font |
|---|---|---|
| Shop counter 1366x768 at 100% | 1366x768 (about 1366x698 usable when maximised with taskbar and title bar) | 16px |
| 1920x1080 at 100% | 1920x1080 | 18px (`@media (min-width:1600px) { html { font-size:18px } }`) |
| 1920x1080 at 125% | 1536x864 | 16px |
| Worst case: 1366x768 laptop at 125% | 1093x614 | 16px |

- All sizes below are in `rem` (1rem = root font). Pixel values are given for the 16px root.
- **Design to 1366x698.** Nothing important may need scrolling at that size.
- Must still work at 1024x600 CSS px: the shell never scrolls sideways; only the content area may scroll vertically.

## 3. Colour tokens

Light theme only (a dark theme is harder to read in a sunlit shop and on TN panels). Contrast ratios are approximate against the background named.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--gk-bg` | `#ffffff` | Content background | - |
| `--gk-panel` | `#f0eee9` | Office left menu, key legend bar | - |
| `--gk-text` | `#111111` | All normal text | 18:1 on white |
| `--gk-text-muted` | `#4d4d4d` | Hints, secondary labels | 8.4:1 on white |
| `--gk-border` | `#767676` | Input, button, table outer borders | 4.5:1 |
| `--gk-divider` | `#bdbdbd` | Table row lines, section lines (decorative only) | - |
| `--gk-primary` | `#8a3b00` | Primary button fill, screen titles | 7.7:1 with white |
| `--gk-primary-text` | `#ffffff` | Text on primary | - |
| `--gk-focus` | `#0a4fd1` | Focus ring | 6.9:1 on white |
| `--gk-select-bg` | `#003a9b` | Selected row / current menu item | 7.8:1 with white |
| `--gk-select-text` | `#ffffff` | Text on selection | - |
| `--gk-danger` | `#b00020` | Error text, error border, danger button | 7.3:1 on white |
| `--gk-danger-bg` | `#fde8e8` | Error banner background | - |
| `--gk-warn-text` | `#6b4700` | Warning text | 7.8:1 on warn bg |
| `--gk-warn-bg` | `#fff4cc` | Warning banner background | - |
| `--gk-ok` | `#0b6623` | Success text | 7.0:1 on white |
| `--gk-ok-bg` | `#e6f4ea` | Success toast background | - |
| `--gk-disabled-text` | `#5f5f5f` | Disabled controls (with `--gk-disabled-bg`) | 5.5:1 |
| `--gk-disabled-bg` | `#ececec` | Disabled control fill | - |
| `--gk-bar-bg` | `#1f1f1f` | Status bar | - |
| `--gk-bar-text` | `#ffffff` | Status bar text | 16:1 |
| `--gk-bar-warn` | `#ffd24d` | Status bar warning text | 11:1 on bar |
| `--gk-bar-danger` | `#ff8a8a` | Status bar error text | 7.2:1 on bar |
| `--gk-backdrop` | `rgba(0,0,0,0.55)` | Behind dialogs (static) | - |

No shadows. Separation is by 1px borders and panel colour.

## 4. Type

**Font stack:** `--gk-font: "Segoe UI", "Nirmala UI", "Latha", sans-serif;`
- Segoe UI has no Tamil glyphs; Windows falls back per character to **Nirmala UI** (ships with Windows 8.1 / 10 / 11) and then **Latha** (older Windows Tamil font). No web font is bundled (installer size, and system fonts render with ClearType).
- Numbers: `font-variant-numeric: tabular-nums;` on every number, so columns and totals do not jump.
- Weights: 400 (regular) and 600 (semibold) only.
- **Tamil rule:** any element that can show a Tamil name uses `line-height: 1.5` minimum and never a fixed height with `overflow:hidden` (Tamil vowel signs above and below get clipped). Single-line truncation uses `text-overflow: ellipsis` with enough height.
- Test string for every screen that shows names: `கடலை எண்ணெய் 1 லி` (groundnut oil 1 L) and `நல்லெண்ணெய்` (gingelly oil).

| Token | Size (16px root) | Weight | Use |
|---|---|---|---|
| `--gk-fs-caption` | 0.875rem / 14px | 400 | Status bar, key legend labels, hints. **Smallest allowed size.** |
| `--gk-fs-body` | 1rem / 16px | 400 | Body text, menu items, table cells |
| `--gk-fs-input` | 1.125rem / 18px | 400 | Text in inputs, PIN dots, list rows on login |
| `--gk-fs-h2` | 1.25rem / 20px | 600 | Section titles, dialog titles |
| `--gk-fs-h1` | 1.5rem / 24px | 600 | Screen title |
| `--gk-fs-display` | 2rem / 32px | 600 | Blocking screen headline, lock screen name |
| `--gk-fs-total` | 4rem / 64px | 600 | Reserved: bill total in POS (spec 03). Biggest thing on the billing screen. |

Line height: 1.4 default, 1.5 for anything that may contain Tamil.

## 5. Spacing and sizes

4px grid: `--gk-s1 4px`, `--gk-s2 8px`, `--gk-s3 12px`, `--gk-s4 16px`, `--gk-s5 24px`, `--gk-s6 32px`, `--gk-s7 48px`.

| Token | Value | Use |
|---|---|---|
| `--gk-control-h` | 2.5rem (40px) | Input and button height |
| `--gk-row-h` | 2.25rem (36px) min | Table and list rows (grows for Tamil) |
| `--gk-statusbar-h` | 2rem (32px) | Status bar |
| `--gk-legend-h` | 2.25rem (36px) | Key legend bar |
| `--gk-menu-w` | 13rem (208px) | Office left menu |
| `--gk-radius` | 4px | Inputs, buttons, dialogs |
| `--gk-border-w` | 1px | Normal borders (2px for error borders) |

Formatting (for later screens, stated once here): money `₹1,23,456.00` (Indian grouping, from integer paise, formatting only in UI helper `formatPaise`); date `05 Nov 2026`; time `2:32 PM` (12-hour - owner to confirm, see open questions); date-time in status bar `Thu 05 Nov 2026  2:32 PM`.

## 6. Focus rules (both apps)

1. **Focus ring:** `outline: 3px solid var(--gk-focus); outline-offset: 2px;` on `:focus-visible` **and** on `:focus` for inputs (always show it; we have no mouse-only users to hide it from). Never `outline: none` without a replacement.
2. **Selected list row / current menu item:** full row fill `--gk-select-bg` with white text, plus a 4px left bar in `--gk-focus` when the list itself has focus. A selected row in a list that does *not* have focus keeps a 2px `--gk-select-bg` border instead of the fill, so it is clear where typing goes.
3. **Every screen declares one initial focus target.** On entering the screen, focus goes there with no extra key press.
4. **Focus is never on `<body>`.** A shared `useFocusGuard` listens for `focusout`; if the new active element is `body` or `null` (mouse click on blank area, element removed), it puts focus back on the last focused element, or the screen's initial target if that is gone.
5. **Dialogs trap focus** (Tab cycles inside). On close, focus returns to the element that opened the dialog.
6. **Window refocus:** when the window regains focus (Alt+Tab back from POSBean during changeover), focus returns to the last focused element. Test this explicitly.
7. **Disabled controls are skipped** by Tab and arrows. Never move focus onto a disabled control.
8. **Read-only "Checking..." states** keep focus where it was (the input becomes `readOnly`, not `disabled`, so focus is not lost).

## 7. Keyboard conventions (both apps)

### 7.1 Meaning of keys - same everywhere

| Key | Meaning |
|---|---|
| Enter | Accept: next field in a form; on the last field or a button, do it; in a list, choose the row |
| Esc | Back one step: close dialog (= Cancel), leave field-level popups, leave screen (Office: back to menu). **Esc never quits the app and never throws away unsaved work without asking.** |
| Tab / Shift+Tab | Next / previous control |
| Up / Down | Move in lists, menus, tables. Not used to move between form fields. |
| Home / End, PgUp / PgDn | First / last row, page up / down in lists |
| Type letters in a list | Filter (type-to-filter) |
| Backspace in a list | Remove last filter letter |
| F1 | Help: shows all keys for the current screen (overlay, Esc closes) |
| Ctrl+S and F10 | Save (forms). Both work. (verify which one POSBean staff use; keep both) |
| Ctrl+L | Lock screen (both apps) |
| Alt+letter | Office: open menu item (letter underlined). Inside forms (later): jump to a field/section. |

### 7.2 F-key reservation

- **POS:** F2-F9, F11, F12 are **reserved for billing (spec 03)** and must not be given any other meaning in the shell. Spec 03 assigns them to match POSBean habits (verify with staff).
- **Office:** per-screen F-keys are defined in each feature spec. Proposed convention for all Office lists: F2 New, F3 Find, Enter Open, F10 Save, F1 Help. Same key, same meaning, every screen.

### 7.3 Browser keys that must be blocked (WebView2)

The shell installs one capture-phase `keydown` handler that calls `preventDefault()` for these, in release and dev (except F12/devtools in dev):
`F5`, `Ctrl+R`, `Ctrl+Shift+R` (reload - would kill an open bill), `F3`, `Ctrl+F`, `Ctrl+G` (find bar), `Ctrl+P` (print page), `Ctrl+J`, `Ctrl+U`, `Ctrl+H`, `Ctrl+Shift+I`, `F12` (release), `F7` (caret browsing prompt), `Alt+Left`, `Alt+Right`, `BrowserBack`/`BrowserForward` keys, `Ctrl+Plus`, `Ctrl+Minus`, `Ctrl+0`, `Ctrl+mouse wheel` (zoom). Right-click context menu is disabled in release. Builder: also check whether Tauri 2 can turn off WebView2 browser accelerator keys at the webview level (`AreBrowserAcceleratorKeysEnabled`) - (verify), and keep the JS handler regardless.

### 7.4 Other keyboard rules

- **One keymap per screen** (`useKeymap(scope, bindings)`), stacked: dialog on top of screen on top of app-global. The same binding list drives the key handler, the key legend and the F1 help. They can never disagree.
- **IME:** ignore `keydown` while `event.isComposing` (Tamil typing tools).
- **Num Lock:** numeric fields (PIN) check `event.getModifierState("NumLock")`; if a numpad key arrives with Num Lock off, show "Num Lock is off - press Num Lock to type numbers."
- **Scanner bursts:** a barcode scanner types fast and ends with Enter. Any field that is not a scan box treats more than 6 characters arriving less than 30 ms apart as a scan (thresholds tunable by Head of IT). PIN fields: clear the field, do not submit, do not count as a wrong PIN, show "That looked like a barcode scan. Type your PIN."
- **Alt+F4 / window close:** goes through the same unsaved-changes guard as Esc. POS asks "Close Gokul POS?" (Enter = Close, Esc = Stay).
- **Error beep:** `beep()` helper in `packages/ui` (short WebAudio tone, no audio file). Used on wrong PIN and on blocked shortcuts. A setting to switch it off comes later.
- **No `<input type="number">`** (arrow keys and mouse wheel change the value). Use text inputs with `inputMode="numeric"` and filter non-digits.

## 8. Components (put in `packages/ui`)

Every component: keyboard-complete, no animation, uses the tokens above, has Vitest tests for its keys.

| Component | What it is | Key rules |
|---|---|---|
| `AppFrame` | Page layout: `StatusBar` top, content middle (flex, scroll only here), `KeyLegend` bottom. Optional `SideMenu` left. | Fills the window; never scrolls as a whole. |
| `StatusBar` | Top bar, see `00-shells-and-login.md` section 7. | Not focusable. |
| `KeyLegend` | Bottom bar of key hints from the current keymap. `mode="slots"` (POS: fixed F1-F12 positions, then Ctrl/Alt combos at the right) or `mode="list"` (Office: only active keys, in order). | Each hint is a key-cap (`F1` in a white box, 1px `--gk-text` border, 600 weight) + label. Clickable with the mouse, not in Tab order. |
| `Button` | Variants `primary`, `secondary` (white, border), `danger`. Label shows its key: `Save  (F10)`. | Enter/Space activate. 40px high. Disabled = `--gk-disabled-*`, skipped by Tab. |
| `TextField` | Label above or left, input, hint, error line below. Props: `maxLength`, `transform` (`upper`, `digits`), `required`. | Error shows as 2px `--gk-danger` border + `! message` text below, linked by `aria-describedby`. Error appears on leaving the field or on save, never while typing. |
| `PinField` | Masked numeric input, 4-6 digits, shows dots, digits only, Num Lock warning, scanner-burst guard. | Enter submits. Does not auto-submit at 4 digits (PINs can be 6). |
| `SelectList` | Vertical list with type-to-filter and a visible filter line ("Filter: ra"). | Up/Down/Home/End/PgUp/PgDn, Enter chooses, letters filter (match start of any word, case-insensitive, Tamil works), Backspace removes a letter, Esc clears filter (second Esc = back). Empty filter result shows "No match for 'xyz'. Backspace to change." |
| `SideMenu` | Office left menu with underlined access letters. | Up/Down moves, Enter opens, Alt+letter opens from anywhere. Current screen highlighted. |
| `FormGrid` | Two-column label/field layout for Office forms; Enter moves to next field. | Last field Enter -> moves to the primary button. |
| `Banner` | Inline message strip in content: `info`, `warn`, `error`, `ok`. Starts with a word ("Warning:", "Error:") not just colour. | Not focusable unless it has an action key, which is shown in the text. |
| `Dialog` | Modal, centred, max 32rem wide, 2px `--gk-text` border, static backdrop. Title, message, buttons with keys `[Enter] Save  [D] Discard  [Esc] Stay`. | Focus trapped; Enter = default button (always the data-safe choice); Esc = cancel; letter keys for other buttons. |
| `Toast` | One short message, bottom-right above the legend, `role="status"`. Hides after 4 s (one `setTimeout`) or on next key press. New toast replaces the old one. | Never takes focus. **Never used for errors that need action** - those are inline or a dialog. |
| `BlockingScreen` | Full-content message for states where nothing else can be done (DB newer, DB error, shop not set up). Headline (display size), what happened, numbered "What to do", key actions, small IT detail line (code, log folder). | Focus on the screen container; only the listed keys work. |
| `ComingSoon` | Placeholder content: screen title + "Coming soon. This screen will be added in a later update." | Esc = back. |
| `LockScreen` | Opaque overlay (hides everything underneath), PIN entry for the locked user. | See shells doc 4d. |
| `HelpOverlay` | F1 list of the current keymap. | Esc or F1 closes. |
| `DataTable` | (Spec 03 onwards.) Header row sticky, row lines `--gk-divider`, no zebra stripes (they wash out on cheap panels), numbers right-aligned tabular, selected row as in 6.2. | Up/Down/PgUp/PgDn/Home/End, Enter opens. |
| Hooks | `useKeymap`, `useFocusGuard`, `useInitialFocus`, `useUnsavedGuard`, `useMinuteClock`, `beep`. | |

## 9. Text and labels

- English labels for Step 3. All user-facing strings in one file per app (`strings.ts`) so a Tamil UI can be added later without touching components.
- Sentence case ("Shop name", not "SHOP NAME"). Exception: the shop name in the status bar is shown as saved.
- Key names written exactly as on the keyboard: `Enter`, `Esc`, `F10`, `Ctrl+S`, `Alt+T`.

## 10. What to test (system level)

- CSS has no `transition`, `animation`, `@keyframes`, `opacity` on text, `outline: none` without replacement.
- Idle CPU after 5 minutes on the shell screen: ~0% in Task Manager (WebView2 processes included), on the low-end setting.
- Tamil test strings render with no clipping in list rows, status bar and inputs on the **shop PC** (confirm Nirmala UI is present there).
- Layout at 1366x698, 1920x1080, 1536x864, 1093x614: no horizontal scroll of the shell, nothing cut off.
- Every blocked browser key in 7.3 does nothing (especially F5 and Ctrl+R).
- Focus never ends up on `body`: click blank areas, Alt+Tab away and back, close a dialog, remove a focused element.
- Contrast check of every token pair in section 3 with a contrast tool.
