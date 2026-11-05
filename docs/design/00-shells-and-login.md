# Design - App shells, first run and login (Step 3)

Status: DRAFT for card S0-3. Spec: `docs/specs/00-skeleton.md` Step 3. Uses `docs/design/00-design-system.md` for every colour, size, component and key rule. If this file and the design system disagree, the design system wins; tell the designer.

Placeholders marked **[SEC-TBD]** are now filled in by `docs/specs/00-step3-login-security.md` (APPROVED, incl. owner decisions) - that file wins on any conflict. Builder: put them in one constants file in `gokul-core` (not the UI) so the numbers change in one place.

Wireframes are drawn at about 80 characters for 1366 px. `[D]` means the letter D is underlined in the label.

## 0. Start-up order (both apps)

Every launch runs these checks in this order. The first one that fails shows its screen and stops.

| # | Check (done in `gokul-core`, UI only shows the result) | Office shows | POS shows |
|---|---|---|---|
| 1 | Window opens | "Starting Gokul Office..." (static, from `index.html`) | "Starting Gokul POS..." |
| 2 | DB file opens | 0.1 DB error | 0.1 DB error |
| 3 | DB is busy (other app migrating, busy timeout hit) | 0.2 DB busy | 0.2 DB busy |
| 4 | DB data version <= app data version | 0.3 DB newer than app | 0.3 DB newer than app |
| 5 | At least one active owner exists | 1 First run: create owner | 3 Shop not set up |
| 6 | Shop set up (see 6.4) | Login, then a banner on the Dashboard | 3 Shop not set up |
| 7 | - | 2 Login | 2 Login |

Loading text ("Starting...", "Loading users...") appears only if the step takes more than 300 ms, so fast starts show no flicker. No spinners. Start to login screen budget: under 3 s on the shop PC (same as the billing start budget).

### 0.1 DB error (BlockingScreen)

```
+------------------------------------------------------------------------------+
| (status bar: app name and clock only)                                        |
+------------------------------------------------------------------------------+
|                                                                              |
|   Gokul POS cannot open the shop data                                        |
|                                                                              |
|   Nothing has been deleted.                                                  |
|   What to do:                                                                |
|     1. Press Enter to try again.                                             |
|     2. If it still fails, restart the computer and open Gokul POS again.     |
|     3. Still failing? Call IT and read out the code below.                   |
|                                                                              |
|   For IT: DB-OPEN  <short error>  Log folder: %APPDATA%\GokulRetail\logs     |
+------------------------------------------------------------------------------+
| Enter Try again                                                              |
+------------------------------------------------------------------------------+
```
Keys: Enter = try again. Close with the window X or Alt+F4. No other keys.

### 0.2 DB busy

Same layout. Headline "The shop data is busy". Body: "Gokul Office or Gokul POS is updating the data. Wait one minute, then press Enter." Code `DB-BUSY`. Enter = try again.

### 0.3 DB newer than app

Same layout. Headline "This Gokul POS is older than the shop data". Body:
"The data was last opened by a newer version (data version 7). This app is version 1.0.0 (data version 5). Your data is safe and has not been changed. Install the newer Gokul POS from IT, then open it again."
Keys: none except window close. The app never tries to open or change the data in this state.

## 1. Office first run - create owner account

Shown only when the `users` table has no active owner (fresh install). After success the owner is signed in automatically.

```
+------------------------------------------------------------------------------+
| Gokul Office                                       Thu 05 Nov 2026  2:32 PM  |
+------------------------------------------------------------------------------+
|                                                                              |
|   Welcome to Gokul Office                                                    |
|   This computer has no users yet. Create the owner account first.           |
|   The owner can change shop settings and add staff.                          |
|                                                                              |
|      Owner name      [Selvi Gokul_______________]                            |
|      PIN (4-6 digits)[******]                                                |
|      Confirm PIN     [****  ]                                                |
|                      ! The two PINs do not match. Type them again.           |
|                                                                              |
|                      [ Create owner  (Enter) ]                               |
|                                                                              |
|   Keep this PIN secret. Write it down and keep it in a safe place.          |
|   If it is lost: [SEC-TBD owner PIN recovery steps].                         |
+------------------------------------------------------------------------------+
| Enter Next / Create   Tab Next field   F1 Help                               |
+------------------------------------------------------------------------------+
```

| Field | Rules (checked in core; UI shows the message) | Message |
|---|---|---|
| Owner name | Required, 2-30 chars after trimming. Any script (Tamil allowed). | "Enter the owner's name (2 to 30 letters)." |
| PIN | Digits only, 4-6. `PinField`. [SEC-TBD weak PINs to refuse, e.g. 0000, 1234, 111111] | "PIN must be 4 to 6 digits." / "This PIN is too easy to guess. Choose another." |
| Confirm PIN | Must equal PIN. | "The two PINs do not match. Type them again." (both PIN fields cleared, focus to PIN) |

- Initial focus: Owner name. Enter moves name -> PIN -> Confirm -> Create. Enter on Confirm = Create.
- Esc: nothing (there is nowhere to go back to). Legend does not show Esc.
- States: normal; "Creating..." (fields read-only, Enter ignored) while the PIN is hashed; error (Banner error: "Could not save the owner. Nothing was saved. Press Enter to try again.").
- On success: audit log `user_created` + `login`; then the **shop setup prompt** dialog:

```
   +--------------------------------------------------------------+
   | Owner account created                                        |
   |                                                              |
   | Next, enter your shop details (name, address, phone, GSTIN). |
   | Billing in Gokul POS stays blocked until this is done.       |
   |                                                              |
   |   [Enter] Open Settings now        [Esc] Later               |
   +--------------------------------------------------------------+
```
Enter -> Settings screen (6). Esc -> Dashboard with the "Shop not set up" banner (5.3).

## 2. Login (both apps, same component `LoginScreen`)

```
+------------------------------------------------------------------------------+
| GOKUL OILS                                         Thu 05 Nov 2026  2:32 PM  |
+------------------------------------------------------------------------------+
|                                                                              |
|   Gokul POS - Sign in                                                        |
|                                                                              |
|   Who are you?                          PIN for Ravi Kumar                   |
|   Filter: ra                            [****      ]                         |
|   +--------------------------------+                                         |
|   |> Ravi Kumar           Cashier  |    ! Wrong PIN. 2 tries left.           |
|   |  Rajesh               Cashier  |                                         |
|   +--------------------------------+                                         |
|   Name not in the list? Ask the owner.                                       |
|                                                                              |
+------------------------------------------------------------------------------+
| Up/Down Choose   Type Filter   Enter Next   Esc Back to list   F1 Help       |
+------------------------------------------------------------------------------+
```

Status bar on this screen: shop name (or app name if not set), clock. No user, no backup.

### 2.1 Fields

| Element | Content |
|---|---|
| User list (`SelectList`) | Active users only, sorted by name. Columns: name (Tamil allowed, line-height 1.5), role (`Owner` / `Cashier`). Max height 8 rows, then scrolls. |
| Filter line | "Filter: ra" above the list; hidden when empty. |
| PIN (`PinField`) | Label "PIN for <name>". Dots only. 4-6 digits. |
| Message line | Under the PIN. One message at a time. |
| Help line | "Name not in the list? Ask the owner." always shown under the list. |

### 2.2 Keys

| Where | Key | Action |
|---|---|---|
| List | Up/Down/Home/End/PgUp/PgDn | Move |
| List | Letters | Filter (start of any word, case-insensitive) |
| List | Backspace | Remove last filter letter |
| List | Esc | Clear filter (if any) |
| List | Enter | Choose user, focus PIN |
| List | Digits | Ignored in the list (a PIN typed too early must not filter); show hint "Choose your name first, then type your PIN." |
| PIN | Digits | Type |
| PIN | Enter | Check PIN (only if 4-6 digits, else message "PIN must be 4 to 6 digits.") |
| PIN | Esc | Clear PIN, back to the list (same user still selected) |
| Any | F1 | Help |

### 2.3 Initial focus

- One active user: that user is chosen, focus on PIN.
- POS: the user who last signed in **on this PC** is pre-chosen, focus on PIN (shift start is one PIN + Enter). Esc goes to the list for a different person. (Stored as a local setting per app, not a security feature.)
- Otherwise: list, first row.

### 2.4 States

| State | What shows | Focus / keys |
|---|---|---|
| Loading users (> 300 ms) | "Loading users..." in place of the list | - |
| Load error | Banner error "Could not read the user list. Press Enter to try again." | Enter retries |
| No active users (POS) | Not reachable: start-up check 5 shows screen 3 | - |
| Filter has no match | In the list: "No name starts with 'xyz'. Press Backspace." | List |
| Checking PIN | "Checking PIN..." in the message line; PIN read-only; extra Enter ignored. [SEC-TBD argon2 settings: must verify in under 1 s on the shop PC] | PIN |
| Wrong PIN | "! Wrong PIN. N tries left." (N from [SEC-TBD LOCKOUT_ATTEMPTS]). PIN cleared. Error beep. Audit log `login_failed`. | PIN |
| Locked out | Message box in place of the PIN: "Too many wrong PINs. Ravi Kumar cannot sign in until 2:47 PM. Ask the owner to unlock, or choose another name." PIN hidden. Lockout count and end time stored **in the DB per user** (a restart must not reset it). [SEC-TBD LOCKOUT_ATTEMPTS, LOCKOUT_MINUTES, owner unlock, behaviour if the PC clock is changed] | List (Esc/Up/Down to pick another user) |
| User switched off since the list loaded | "Ravi Kumar has been switched off by the owner. Choose another name." List reloads. | List |
| Scanner burst into PIN | "That looked like a barcode scan. Type your PIN." PIN cleared, not counted as a wrong try. | PIN |
| Num Lock off | "Num Lock is off - press Num Lock to type numbers." | PIN |
| Check failed (DB) | "Could not check the PIN. Nothing was changed. Press Enter to try again." Not counted as a wrong try. | PIN |
| Success | Audit log `login`. Go to POS shell (4) or Office shell (5). | Shell initial focus |

- Inactive users are **not shown** in the list (hence the help line). They cannot sign in to either app.
- The owner can sign in to POS and bill. Cashier sign-in to Office: allowed with the restricted menu in 5.2 (owner to confirm, see open questions).

## 3. POS - "Shop not set up" (BlockingScreen)

Shown before login when the shop is not set up (6.4) or no owner exists.

```
+------------------------------------------------------------------------------+
| Gokul POS                                          Thu 05 Nov 2026  2:32 PM  |
+------------------------------------------------------------------------------+
|                                                                              |
|   The shop is not set up yet                                                 |
|                                                                              |
|   Billing cannot start until the owner enters the shop details.             |
|   What to do:                                                                |
|     1. Ask the owner to open Gokul Office on this computer.                  |
|     2. The owner signs in and fills Settings (shop name, address, phone).    |
|     3. Come back here and press Enter.                                       |
|                                                                              |
|   For IT: SHOP-NOT-SET-UP                                                    |
+------------------------------------------------------------------------------+
| Enter Check again                                                            |
+------------------------------------------------------------------------------+
```
- Enter re-runs start-up checks 2-6. If still not set up: same screen, plus line "Still not set up (checked at 2:35 PM)." so staff know the key worked.
- No automatic re-check (no polling).

## 4. POS shell

### 4a. Layout

```
+------------------------------------------------------------------------------+
| GOKUL OILS        Ravi Kumar (Cashier)   Thu 05 Nov 2026  2:32 PM   Backup: Today 9:10 AM |
+------------------------------------------------------------------------------+
|                                                                              |
|                                                                              |
|                               Billing                                        |
|                                                                              |
|                 The billing screen comes in the next update.                 |
|                 You are signed in and the counter is ready.                  |
|                                                                              |
|                                                                              |
+------------------------------------------------------------------------------+
|F1 Help|  F2  |  F3  |  F4  |  F5  |  F6  |  F7  |  F8  |  F9  | F10 | F11 | F12 | Ctrl+L Lock |
+------------------------------------------------------------------------------+
```
- `AppFrame` with `StatusBar` (section 7) and `KeyLegend mode="slots"`: 12 fixed F-key slots (empty slots show only the key name in muted text) then Ctrl/Alt combos at the right. Spec 03 fills the slots without moving anything.
- Window: opens maximised; Alt+Tab to POSBean must work during the changeover (open question on true full screen).
- Placeholder content (`h1` "Billing", body text) is a focusable container (`tabIndex=-1`) and is the initial focus. Later this becomes the scan box.

### 4b. Keys

| Key | Action |
|---|---|
| F1 | Help overlay |
| Ctrl+L | Lock (4d) |
| Alt+F4 / window X | Dialog "Close Gokul POS?" [Enter] Close  [Esc] Stay. Enter = Close is safe in Step 3 because no bill can be open. Spec 03 must hold/autosave an open bill before closing. |
| Esc | Nothing at the top level (never logs out, never closes) |
| F2-F9, F11, F12 | Do nothing in Step 3 (reserved for billing). No beep. |

### 4c. States

Normal; backup warning or clock warning in the status bar (section 7); locked (4d). No error state beyond the shared error boundary (Step 4).

### 4d. Lock screen (both apps, `LockScreen`)

```
+------------------------------------------------------------------------------+
| GOKUL OILS                                         Thu 05 Nov 2026  2:40 PM  |
+------------------------------------------------------------------------------+
|                                                                              |
|                         Locked                                               |
|                         Ravi Kumar                                           |
|                         Locked at 2:32 PM                                    |
|                                                                              |
|                         PIN [****  ]                                         |
|                         ! Wrong PIN. 2 tries left.                           |
|                                                                              |
+------------------------------------------------------------------------------+
| Enter Unlock   Esc Switch user   F1 Help                                     |
+------------------------------------------------------------------------------+
```
- Opaque: nothing of the screen underneath is visible. Underlying screen state is kept as it was (an unsaved Settings form, later an open bill).
- Lock is allowed at any time, also with unsaved changes (nothing is lost).
- Enter = unlock with this user's PIN. Same wrong-PIN, lockout, scanner and Num Lock rules as login; failures count toward the same per-user lockout.
- Esc = switch user: signs this user out and shows Login. If the locked session has unsaved changes, first ask: "Ravi Kumar has unsaved changes in Settings. Switching user will throw them away." [Esc] Stay locked  [D] Discard and switch. (Spec 03: an open bill is held, never discarded.)
- Status bar shows shop name and clock only. Audit log `lock`, `unlock`, `logout`.
- Auto-lock after idle minutes: [SEC-TBD - setting; default off in POS so rush hour is not interrupted].

## 5. Office shell

### 5.1 Layout

```
+------------------------------------------------------------------------------+
| GOKUL OILS        Selvi (Owner)   Thu 05 Nov 2026  2:32 PM   Backup: Today 9:10 AM |
+-----------------+------------------------------------------------------------+
| [D]ashboard     |  Dashboard                                                 |
| [I]tems         |                                                            |
| [S]tock         |  Warning: The shop is not set up. Billing in Gokul POS     |
| [P]roduction    |  is blocked. Press Alt+T to open Settings.                 |
| Pac[k]ing       |                                                            |
| Pur[c]hases     |  Coming soon. This screen will be added in a later update. |
| [R]eports       |                                                            |
| [U]sers         |                                                            |
| Se[t]tings      |                                                            |
+-----------------+------------------------------------------------------------+
| Up/Down Move   Enter Open   Alt+letter Go to   Esc Back   F1 Help   Ctrl+L Lock |
+------------------------------------------------------------------------------+
```

### 5.2 Menu and access letters

| Menu item | Key | Owner | Cashier |
|---|---|---|---|
| Dashboard | Alt+D | Yes | Yes (content rules come with the dashboard spec) |
| Items | Alt+I | Yes | Yes |
| Stock | Alt+S | Yes | Yes |
| Production | Alt+P | Yes | Yes |
| Packing | Alt+K | Yes | Yes |
| Purchases | Alt+C | Yes | Yes |
| Reports | Alt+R | Yes | Yes |
| Users | Alt+U | Yes | **Hidden** |
| Settings | Alt+T | Yes | **Hidden** |

- Letters checked against Windows/WebView2: none of them clash with Alt+Space, Alt+Tab, Alt+F4, Alt+Esc. Alt+Left/Right are blocked (system 7.3). Ctrl+S (save) and Alt+S (Stock) are different keys - test that Ctrl+S on Settings never opens Stock.
- Letters are always underlined (not only while Alt is held) so staff learn them.
- **Cashier: Users and Settings are hidden** (not shown greyed). They are the last two items, so no other item moves. If a cashier presses Alt+U or Alt+T: nothing opens, error beep, Banner warn at the top of the content "Users and Settings are for the owner only." (clears on next key), audit log `access_denied` (Head of IT to confirm). Focus stays where it was.
- **Hiding is not security.** Every Users/Settings command in `gokul-core` checks the signed-in role and refuses a cashier, even if the UI is bypassed. Verifier must test the command directly.
- Which other items a cashier may open is decided per feature spec; items they cannot use follow the same "hidden + message" pattern.

### 5.3 Keys and focus

| Where | Key | Action |
|---|---|---|
| Anywhere | Alt+letter | Open that screen; focus goes to the screen's initial target. Same unsaved guard as Esc if leaving a changed form. |
| Menu | Up/Down/Home/End | Move highlight |
| Menu | Enter | Open highlighted screen, focus into content |
| Content | Esc | Back: inside a screen, one level up (later screens); at a screen's top level, focus goes to the menu on that item |
| Menu | Esc | Go to Dashboard (if already there, nothing) |
| Anywhere | F1 | Help |
| Anywhere | Ctrl+L | Lock (4d) |
| Anywhere | Alt+F4 / X | Unsaved guard if a form is changed; otherwise close without asking |

- Initial focus after login: the Dashboard content (owner: if the shop is not set up, the banner text includes "Press Alt+T").
- Esc never signs out. Signing out is Ctrl+L then Esc (switch user).

### 5.4 Coming soon screen (`ComingSoon`)

All of Dashboard, Items, Stock, Production, Packing, Purchases, Reports, Users show screen title + "Coming soon. This screen will be added in a later update." Content container is focused; Esc returns to the menu. Users stays Coming soon in Step 3 (adding staff comes later; open question).

### 5.5 Shop-not-set-up banner

Owner only, on the Dashboard, `Banner warn`: "Warning: The shop is not set up. Billing in Gokul POS is blocked. Press Alt+T to open Settings." Disappears after a valid save in Settings. Cashier sees: "The shop is not set up yet. Ask the owner." Status bar also shows "Shop not set up" (section 7).

## 6. Settings screen (Office, owner only)

### 6.1 Layout

```
+------------------------------------------------------------------------------+
| GOKUL OILS        Selvi (Owner)   Thu 05 Nov 2026  2:32 PM   Backup: Today 9:10 AM |
+-----------------+------------------------------------------------------------+
| [D]ashboard     |  Settings - Shop details                       * required  |
| ...             |  Error: 2 fields need fixing.                              |
| Se[t]tings      |                                                            |
|                 |  Shop name *        [Gokul Oils________________]  10/40    |
|                 |  Address line 1 *   [12, Main Road_____________]           |
|                 |  Address line 2     [Gandhi Nagar______________]           |
|                 |  Town and pincode   [Erode 638001______________]           |
|                 |  Phone *            [98765 43210_]                         |
|                 |  GSTIN              [33ABCDE1234F1Z_]  33 = Tamil Nadu     |
|                 |                     ! GSTIN must be 15 characters. You typed 14. |
|                 |  FSSAI number       [1234567890123_]                       |
|                 |                     ! FSSAI number must be 14 digits.      |
|                 |  Bill footer line 1 [Thank you, visit again____]           |
|                 |  Bill footer line 2 [__________________________]           |
|                 |                                                            |
|                 |  [ Save  (F10 / Ctrl+S) ]     Unsaved changes              |
+-----------------+------------------------------------------------------------+
| Enter Next field   F10 Save   Ctrl+S Save   Esc Back   F1 Help   Ctrl+L Lock |
+------------------------------------------------------------------------------+
```
Address is three single-line fields instead of a multi-line box, so Enter always means "next field" and each line maps to one printed bill line.

### 6.2 Fields

All checks run in `gokul-core` (`validate_shop_settings`, returns `{field, message}` list); the UI calls it on leaving a field and on save and only shows the result. Inputs are trimmed before checking. Character limits below are proposals until the printer and paper width are known (spec 03).

| Field | Key name | Required | Rules | Messages |
|---|---|---|---|---|
| Shop name | `shop.name` | Yes | 1-40 chars. Counter "10/40" shown. | "Enter the shop name." / "Shop name can be at most 40 characters." |
| Address line 1 | `shop.address1` | Yes | max 48 | "Enter the first address line." / "Address line can be at most 48 characters." |
| Address line 2 | `shop.address2` | No | max 48 | as above |
| Town and pincode | `shop.address3` | No | max 48 | as above |
| Phone | `shop.phone` | Yes | Remove spaces and `-`. If it starts with `+91`/`91` and has 12 digits, drop `91`. If 11 digits starting with `0`, drop the `0`. Then exactly 10 digits. Saved as 10 digits; shown as `98765 43210`. | "Phone must be 10 digits. You typed 9." / "Phone can have digits only." |
| GSTIN | `shop.gstin` | No (owner to confirm) | Auto upper-case, spaces removed. 15 chars, pattern `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`, plus the GSTIN check-character test (mod 36). Show state from the first 2 digits next to the field ("33 = Tamil Nadu") as a visual check, not a block. | "GSTIN must be 15 characters. You typed 14." / "GSTIN format is not right. It looks like 33ABCDE1234F1Z5. Check your GST certificate." / "One character in the GSTIN is wrong. Check each letter against your GST certificate." |
| FSSAI number | `shop.fssai` | No (owner to confirm; FSSAI requires the number on bills for food sellers - verify) | Digits only, exactly 14. | "FSSAI number must be 14 digits. You typed 13." |
| Bill footer line 1 | `bill.footer1` | No | max 48 | "Footer line can be at most 48 characters." |
| Bill footer line 2 | `bill.footer2` | No | max 48 | as above |

Tamil text in the footer or shop name is accepted and stored, but printing Tamil on a thermal printer needs image printing (spec 03 / printer decision). Show hint under the footer fields: "Tamil text will print only if the bill printer supports it (to be confirmed)."

### 6.3 Keys

| Key | Action |
|---|---|
| Enter | Next field; on the last field, moves to Save; on Save, saves |
| Tab / Shift+Tab | Next / previous |
| F10 or Ctrl+S | Save from any field |
| Esc | If no changes: back to the menu. If changed: unsaved dialog below |
| Alt+letter, Ctrl+L, Alt+F4 | Alt+letter and Alt+F4 use the unsaved dialog; Ctrl+L locks and keeps the changes |

Unsaved dialog:
```
   +--------------------------------------------------------------+
   | Save changes?                                                |
   | You changed the shop details and have not saved them.        |
   |                                                              |
   |  [Enter] Save and leave   [D] Discard changes   [Esc] Stay   |
   +--------------------------------------------------------------+
```
Enter = Save and leave (the data-safe default). If the save fails validation, the dialog closes, the screen stays, and focus goes to the first wrong field.

### 6.4 "Shop set up" rule (in `gokul-core`, `is_shop_set_up`)

Shop name, address line 1 and phone are saved and valid. (Owner/Head of IT may add GSTIN and FSSAI to this rule - open question.) Because Save refuses to clear a required field, a set-up shop cannot go back to "not set up".

### 6.5 States

| State | Display | Focus |
|---|---|---|
| Loading (> 300 ms) | "Loading settings..." | - |
| Load error | Banner error "Could not read the settings. Press Enter to try again." | Enter retries |
| Empty (first time) | All fields blank, required marks shown, no errors yet | Shop name |
| Clean | No "Unsaved changes" text | Shop name |
| Changed | "Unsaved changes" text next to Save (warn colour + word) | unchanged |
| Field error | 2px danger border + "! message" under the field, shown on leaving the field | unchanged |
| Save with errors | Banner error at top "Error: 2 fields need fixing." Nothing saved. | First wrong field |
| Saving | "Saving..." next to Save; fields read-only; extra F10 ignored | unchanged |
| Saved | Toast ok "Shop details saved." Unsaved text cleared. Stays on screen. Audit log `settings_changed` with old and new values. | unchanged |
| Save failed (DB) | Banner error "Could not save. Your changes are still on screen. Press F10 to try again." | unchanged |
| Cashier | Not reachable (5.2); command refuses in core | - |

Gokul POS reads shop details at sign-in. A change made in Office shows in POS at the next sign-in or restart (no polling).

## 7. Status bar (both apps, `StatusBar`)

Height 32px, `--gk-bar-bg`, caption size text, one line, not focusable.

```
| GOKUL OILS (shop name) | Ravi Kumar (Cashier) | Thu 05 Nov 2026  2:32 PM | Backup: Today 9:10 AM |
  left, bold, flexible     after a 24px gap       right group                right end
```

| Segment | Content | Width rule | Updates |
|---|---|---|---|
| Shop name | Saved shop name, 600 weight. If not set: app name ("Gokul POS"/"Gokul Office") and, in Office, `--gk-bar-warn` text "Shop not set up". | Takes the spare space; ellipsis when too long; full text in `title` tooltip. Tamil line-height kept. | On sign-in and after Settings save |
| User | "Name (Owner)" / "Name (Cashier)". Hidden on login, lock, first run and blocking screens. | Max 16rem, ellipsis | On sign-in |
| Date and time | `Thu 05 Nov 2026  2:32 PM` | Fixed | `useMinuteClock`: once a minute at the minute boundary. No seconds. |
| Last backup | `Backup: Today 9:10 AM`, `Backup: Yesterday 6:05 PM`, `Backup: 3 Nov 6:05 PM` | Fixed | On sign-in, on the core "backup finished" event (Step 5), and the "how old" text is re-worked on each minute tick (no DB call) |

Backup states (Step 5 fills the data; Step 3 shows "Backup: not set up yet" in normal text until then):
- Within 24 h: normal text.
- Older than 24 h: `--gk-bar-warn` "Backup: 2 days ago".
- Never: `--gk-bar-danger` "Backup: never".

Proposed (Head of IT to decide if it belongs in Step 3): if the PC date is earlier than the newest saved record, show `--gk-bar-danger` "Check PC date and time" in the date segment. A wrong PC date puts wrong dates on GST bills.

## 8. What to test

Each item is one Vitest test (UI) or `cargo test` (core rule) unless marked manual.

**Start-up and blocking**
1. Empty DB: Office shows first run; POS shows "Shop not set up".
2. DB with schema version above the app: both apps show 0.3 and the DB file is byte-for-byte unchanged afterwards (core test).
3. DB cannot open / busy: 0.1 / 0.2 shown; Enter retries.
4. POS "Check again" after the owner saves Settings in Office goes to login without restarting POS.
5. No white flash and "Starting..." text shown before React loads (manual, shop PC).

**First run**
6. Name/PIN/confirm validation messages exactly as in section 1; mismatched PINs clear both PIN fields.
7. Success signs in the owner, writes audit rows, shows the setup prompt; Enter opens Settings, Esc goes to Dashboard with banner.
8. First run never appears again once an owner exists.

**Login and lock**
9. Type-to-filter, Backspace, Esc clear, digits ignored in list, Enter moves to PIN.
10. Single active user and POS last-user pre-select put focus on PIN.
11. Wrong PIN message and count; lockout after [SEC-TBD] tries; lockout survives app restart (core test); locked user can still pick another name.
12. Inactive user not listed; user switched off after list load gets the message.
13. Scanner burst into PIN is not submitted and not counted.
14. Double Enter while "Checking PIN..." sends one check only.
15. PIN check time on the shop PC under 1 s (manual, record result).
16. Ctrl+L locks from every screen; lock screen hides content; unlock restores the same screen and the same focused field with unsaved values intact; Esc switch-user asks first if there are unsaved changes.

**Shells**
17. Whole flow (first run, settings, lock, unlock, every menu item, back) done with the keyboard only (manual + one end-to-end test).
18. Every Alt+letter opens the right screen; Esc from content returns to the same menu item; Esc on menu goes to Dashboard.
19. Cashier: Users and Settings not in the menu; Alt+U / Alt+T show the owner-only message and open nothing; core commands for settings refuse a cashier role (core test).
20. POS legend has 12 fixed F-key slots; F2-F9/F11/F12 do nothing; Esc at top level does nothing.
21. Blocked browser keys (system 7.3) do nothing on every screen, especially F5 and Ctrl+R.
22. Focus never lands on `body`: mouse click on blank area, Alt+Tab to another app and back, dialog close.

**Settings**
23. Each validation rule and message in 6.2, including phone normalising (`+91 98765-43210` -> `9876543210`), GSTIN lower-case auto upper-case, GSTIN checksum pass and fail with real-format samples (core tests).
24. F10 and Ctrl+S both save from any field; Ctrl+S never triggers Alt+S.
25. Esc / Alt+letter / Alt+F4 with changes show the dialog; Enter saves and leaves; D discards; Esc stays; save with errors keeps the screen and focuses the first wrong field.
26. Saved values reload exactly, Tamil text included; audit row has old and new values.
27. Shop-not-set-up banner and status bar warning disappear after a valid save.

**Status bar**
28. Clock re-renders once per minute only (test with fake timers: no renders between minute boundaries).
29. Backup text states: never / today / older than 24 h colours and words.
30. Long shop name and long Tamil user name truncate with ellipsis and no clipping (manual at 1366x698 and 1093x614).
