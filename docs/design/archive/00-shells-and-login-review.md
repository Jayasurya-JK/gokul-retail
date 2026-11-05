# Review - S0-3 shells and login (post-build)

Reviewer: UX/UI Designer. Date: 6 Nov 2026. Compared 1366x698 and 1920x1080 shots in `.playwright-mcp/shots/s0-3/` (file names below are in that folder) with `00-shells-and-login.md`, `00-design-system.md` and the owner decisions in `docs/specs/00-step3-login-security.md`. Red "PREVIEW MOCK" ribbon ignored.

**Verdict: FIX LIST.** Must 2, Should 13, Could 7 (22 items). The flow itself is sound: keyboard order, focus ring always visible, plain error words, cashier menu, owner-only message, close guards, 1920 scaling all match the design. Fix the two Must items before the owner check; do the Should items in the same pass if cheap. None of the Must items needs the backend.

Capture observations: 1 confirmed (item 9), 2 confirmed (1), 3 confirmed (2), 4 confirmed (3), 5 confirmed (4), 6 partly (5), 7 confirmed (6), 8 confirmed (7), 9 partly (8; sparse and left-aligned confirmed, stale banner not visible in 17/18/46/49 so only make sure it clears), 10 ignore, 11 ignore, 12 ignore.

"BE" = needs backend (gokul-core / command) change.

## Must

**1. Selected row in Users is unreadable.** 35, 31, 16. Columns 2 and 3 (role/status, last sign-in) are dark grey on the dark-blue selected row; "Locked (about 1 min)" on a selected row cannot be read. Fix: on the selected row every cell uses the selection text colour (white, full opacity). No muted colour on a selected row anywhere (apply to the shared `SelectList`, so login and later lists are safe). Check 4.5:1 or better on the selection blue. Test: select each row, read all three columns.

**2. F1 Help dialog is empty.** 28, 36, 48. Every legend advertises F1, and it shows only "Esc closes this list." Fix: the dialog lists the keys of the current screen as two columns (Key, What it does), built from the same list that draws the legend plus the keys the legend leaves out. Minimum content:
- POS shell: F1 Help; Ctrl+L Lock; Alt+F4 Close Gokul POS; "F2 to F12: used by billing, not active yet".
- Office shell: Alt+D/I/S/P/K/C/R/U/T Go to screen; Up/Down Move in menu; Enter Open; Esc Back; Ctrl+L Lock; F1 Help.
- Users: F2 Add cashier; F6 Reset PIN; F8 Unlock; F9 Switch off; Up/Down Choose.
- Settings: Enter Next field; F10 or Ctrl+S Save; Esc Back.
- Login / lock / change PIN / recovery: the keys in each legend.
Title "Keys on this screen", last line "Esc Close". Test: F1 on every screen lists at least the keys in that screen's legend.

## Should

**3. Lockout countdown is coarse and does not tick.** 23, 43, 31. Fix:
- Login and lock screen: "Too many wrong PINs. Ravi cannot sign in for 30 more seconds." Updates every second (a timer on this screen only, never in billing). Drop the clock time ("until 11:51 PM") when under 2 minutes; show it only for longer locks. At 0 the message disappears, PIN box returns and focus goes to it.
- Users list: "Locked (30 s left)" under 60 s, then "Locked (2 min left)" rounded up; refresh every second only while the Users screen is open and someone is locked.
- Count down from the seconds-left value the backend returns (not the PC clock). BE only if the result carries no seconds-left or locked-until value (confirm).

**4. Settings: Save is below the fold and errors push the form down.** 07b (also 07). At 1366x698 the Save button and the second footer area are off screen; the red banner moves every field by 50 px. Fix: a fixed action bar at the bottom of the content pane (always visible, outside the scroll area) holding `Save (F10 / Ctrl+S)`, "Unsaved changes" and, when needed, the red text "3 fields need fixing - first one is highlighted." Remove the top banner for validation (field messages stay under each field). Row pitch may drop from 52 px to 48 px. The form scrolls behind the bar; focus must scroll into view above the bar.

**5. Empty new PIN says "PIN can have digits only." and both new-PIN boxes clear.** 44d (and 24b, 44b, 44c). Clearing both new-PIN boxes after a failed change is as designed (keep Current PIN, which the build does), so reject that part. Fix the message and the order of checks:
- New PIN empty: "Type a new PIN (4 to 6 digits)." Confirm empty: "Type the new PIN again."
- Fewer than 4 digits: "PIN must be 4 to 6 digits."
- "Digits only" only if a non-digit was actually typed.
- After a failed change, focus goes to New PIN and the message stays visible until the next key (it already does).
- Owner (6 digits exactly) uses the same wording with "6 digits".

**6. "Forgot owner PIN F4" shows for a cashier.** 22, 23, 19. Fix:
- Show the F4 legend entry only when the highlighted or chosen user is the Owner. Move it to the end of the legend (after F1 Help) so the common keys keep the same place.
- If F4 is pressed with a cashier chosen: error beep and message under the PIN box "Only the owner uses a recovery code. Ask the owner to reset your PIN."
- Needs the role per user in the login list. Design 2.1 has a Role column ("Owner" / "Cashier"); the build shows names only (see item 15). BE only if the list result has no role (confirm).

**7. Wrong recovery code has no tries-left.** 21. Fix: "Wrong recovery code. 3 tries left." using the same lockout ladder and the same wording as PIN screens, and the locked text from item 3 when locked. Clear the code box, focus stays in it. BE: result must return tries left (if it does not today).

**8. Lock screen is sparse and left-aligned.** 17, 29, 46, 39, 50. Fix: centre a column (max width 26rem) horizontally, about 25% from the top. Order: shop name (caption, muted), "Locked" (h1 colour), user name (large), "Locked at 11:50 PM", PIN box, message line with a reserved height so nothing jumps. Clear any earlier message when the lock starts. Legend order: Enter Unlock, Esc Switch user, F1 Help. Same centred layout for the login-style single-column screens is not needed; only the lock screen.

**9. Owner shows "Never signed in" while signed in.** 09 to 16 (35 is correct after a real sign-in). BE: `setup_owner` must stamp last sign-in (and every successful login, as the real ones already do). UI wording is fine.

**10. Legend mixes menu keys into screens where they do not apply, and repeats keys.** 06, 07b (Settings: "Enter Next field" and "Enter Open" side by side; "Up/Down Move" does nothing in a form), 35 (Users: "Up/Down Choose" and "Up/Down Move"; "Enter Open"). Fix: legend = keys of the focused area, then `Alt+letter Go to`, `F1 Help`, `Ctrl+L Lock`, always in that order at the right. Menu keys (Up/Down Move, Enter Open) only when the focus is in the menu.
- Settings: Enter Next field, F10 Save, Ctrl+S Save, Esc Back, Alt+letter Go to, F1 Help, Ctrl+L Lock.
- Users: F2 Add cashier, F6 Reset PIN, F8 Unlock, F9 Switch off, Up/Down Choose, Esc Back, Alt+letter Go to, F1 Help, Ctrl+L Lock.
- F8 Unlock appears dimmed (not hidden, so keys do not move) unless the chosen user is locked; F9 dimmed on the only active owner (item 11); F6 dimmed on an inactive user.

**11. Switching off the only owner opens a dialog and then fails.** 15, 16. The confirm box asks, the user presses S, then a red "Error: At least one active owner is required." appears and pushes the list down. Fix: when the chosen user is the only active owner, F9 does nothing but show a warn banner at once: "Gokul is the only owner and cannot be switched off." (no "Error:" prefix; plain warning colour); no confirm dialog. Keep the backend check as the real guard.

**12. "Shop details saved." is far from the eye and disappears.** 08. Toast at the bottom right; owner is looking at the fields or the Save button. Fix: after a save, show green text "Saved at 11:50 PM" beside the Save button (in the new action bar, item 4), kept until the next edit. The toast may stay as extra. Also confirm the status bar "Shop not set up" disappears at once (it does in 08).

**13. Legends on first-run and recovery-code screens are incomplete.** 01, 03 show only "F1 Help". Fix: first run: Enter Next / Create owner, Tab Next field, F1 Help. Recovery code: Space Tick the box, Enter Continue, F1 Help. Also: if Enter is pressed before the box is ticked, show under the box "Tick the box after you have written the code down." (confirm this is what happens; the Continue button looks active in 03).

**14. Lockout message is far from where the user typed.** 23, 43. After the fifth wrong PIN the PIN box disappears and the message appears under the list, 250 px away from where the eyes were. Fix: put the lockout message in the PIN column where the PIN box was (same position, same width, error style); keep the list as it is.

**15. Login list: no role, wasted gap, chosen user hard to see when PIN has focus.** 19, 22, 41, 42a, 32.
- Add the role at the right of each row ("Owner" / "Cashier"), as in design 2.1 (needed for item 6).
- The empty gap between "Who are you?" and the list (about 45 px) is the reserved filter line; show the filter line only when typing and let the list start right under the heading, or use the gap for "Type to filter" as muted text.
- When focus is in the PIN box, the chosen row keeps a filled, lighter background (pale blue `#DCE6FF`, dark text, 4 px solid blue bar at the left) instead of only a thin outline, so the name above the PIN is clear (22, 42a: row text also shifts 2 px).

## Could

**16. Idle-logout message is green.** 34. Green means success. Use the neutral/info banner colour and say what to do: "You were signed out after 10 minutes without use. Choose your name and type your PIN." Also confirm with the Head of IT what happens to unsaved Settings values on idle logout (they are lost; a warning before logout would be kinder).

**17. Focus box hugs the text.** 25, 26, 45, 52 (title touches the blue box); 01 (text touches the focus ring of the first field). Fix: 8 px vertical, 12 px horizontal padding on the focusable content container; 12 px gap between the intro text and the first field on first run.

**18. Bill footer is one line.** 06. Design has two footer lines (`bill.footer1`, `bill.footer2`). If one line is the agreed spec, no change; otherwise add the second line. Confirm with the spec.

**19. Field error text is small.** 24b, 44b, 11. Errors are bold 14 px (the minimum) and sit near the 14 px hints. Make field error messages body size (16 px at 1366) so the one thing the user must read is the biggest thing under the field.

**20. Reset PIN dialog does not say what happens next.** 14. Add one line under the title: "Meena will choose a new PIN the next time she signs in." Same for Add cashier (10): "The cashier chooses a new PIN at first sign-in."

**21. POS "Close Gokul POS?" has Enter = Close.** 47. Fine in Step 3 (nothing open). Carry-forward for the billing spec: once a bill can be open, the default must be Stay and the bill must be held first. Log it in spec 03.

**22. Recovery code alphabet.** 03. The sample code has no 0/O or 1/I, which is right. Confirm the generator never produces them, so a code written on paper cannot be misread.

## What to retest after fixes (manual at 1366x698, then 1920x1080)
1. Users: arrow through every row; all three columns readable on the selected row (item 1).
2. F1 on POS shell, Office dashboard, Users, Settings, login, lock: each lists keys (item 2).
3. Lock a user out: countdown ticks each second, ends, focus returns to PIN (items 3, 14).
4. Settings with 3 errors: Save/F10 area and message visible without scrolling (item 4).
5. Change PIN with empty, 3-digit, weak and mismatching new PIN: each message matches item 5.
6. Choose a cashier at Office login: no F4 entry; F4 gives the owner-only message (item 6).
7. Wrong recovery code shows tries left; after the limit shows the locked text (item 7).
8. Switch off the only owner: banner, no dialog (item 11).
9. Whole flow once more with the keyboard only; focus never on `body`.
