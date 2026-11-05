# Spec 00 Step 3 - Login, PIN, session and permission rules

Status: APPROVED 5 Nov 2026 (owner decisions below). From security-engineer review 5 Nov 2026.

## Owner decisions (5 Nov 2026)
- Owner PIN exactly 6 digits; cashier 4-6. Lockout ladder as in rule 14. Recovery code Option A (rule 17).
- **POS never auto-locks.** Lock only by Ctrl+L. `idle_lock_secs_pos` default 0 = off (allowed 0 or 60-3600). Office logs out after 10 min idle (default 600).
- **Cashiers may log in to Office with a limited menu**: Dashboard, Items, Stock only. Production, Packing, Purchases, Reports, Users, Settings are hidden for cashiers and refused in Rust. Per-screen permissions come in card B-3.
- POS opens as a **maximised window** (not true full screen) while POSBean runs alongside.

## Head of IT defaults (owner may change later)
- Minimal **Users** screen is in this card (owner only): list users, add cashier, reset PIN, unlock, deactivate. Needed so a cashier can exist and be tested. Role change and more come in B-3.
- Audit event name for blocked menu shortcuts is `permission_denied` (design doc's `access_denied` = same event).
- Save key: both F10 and Ctrl+S until POSBean habits are observed. Time shown 12-hour (2:32 PM).
- GSTIN and FSSAI optional in Step 3 but validated when entered; "shop set up" = shop name, address line 1, phone valid. CA to confirm whether they become required (spec 03).
- PC date/time sanity warning: deferred to B-3 (day open).
Parent: `docs/specs/00-skeleton.md` Step 3. Screens: `docs/design/00-shells-and-login.md`.

## Fixes to existing code (this card)
- F1 `audit_log` has no UPDATE/DELETE triggers -> migration 002.
- F2 `users` has no lockout columns, can be deleted, last owner can be removed -> migration 002.
- F3 one `Mutex<Db>` per process: login must not hold it during hashing (rule 5).
- F4 capabilities grant `core:default`; narrow it (rules 25-26).

## A. Hashing
1. Crate: RustCrypto `argon2` (+ `password-hash` PHC types, OsRng) and `zeroize`. Reason for new deps: PIN hashing is required by spec 00.
2. Argon2id v0x13, m=19456 KiB, t=3, p=1, 32-byte output. Constants only in `pin::PARAMS`. Calibrate on low-end: verify must take 150-200 ms (release); raise t (max 4) or drop m to 12288 if over 250 ms at t=2.
3. Salt 16 random bytes per hash. Store the full PHC string in `users.pin_hash`. No separate salt/params column.
4. Verify via `PasswordVerifier` (constant time). Never `==` on hashes. If stored params != `PARAMS`, rehash on successful login in the same transaction.
5. `login` is async; hashing runs in `spawn_blocking`. Take the DB mutex only briefly before and after hashing. Never `.unwrap()` a mutex (handle poisoning). Write transactions last milliseconds.
6. `[profile.dev.package.argon2] opt-level = 3` (and test profile). Unit tests may inject cheap params through a `PinHasher`. One `#[ignore]` benchmark test prints the real timing.
7. `Pin` newtype: Debug prints `***`, zeroized on drop. PIN, hash or recovery code never logged, never in `detail_json`, never returned. No struct sent to the UI has `pin_hash`.
8. Honest limit: a 4-6 digit PIN can be brute-forced offline from a copied `gokul.db`. The protection is the online lockout plus Windows folder permissions. Threat model = staff at the counter, not a file thief.

## B. PIN policy
9. ASCII digits only, `^[0-9]{4,6}$`, checked in Rust. Cashier 4-6 digits. **Owner exactly 6 digits (OWNER).**
10. Reject: all-same digits, ascending/descending runs (1234, 654321), repeated halves (1212, 123123), deny list 2580, 1004, 2000, 2024, 2025, 2026, 1122, 0123; and the current PIN on change. One pure fn `validate_pin(pin, role) -> Result<(), PinError>`, plain-language messages. PINs need not be unique across users.
11. Owner resets a cashier PIN (`reset_pin`) -> `must_change_pin = 1`, forced change after next login. Self change `change_pin(old, new)` re-verifies the old PIN and counts failures.

## C. Lockout (state in DB, shared by both apps)
12. `users.failed_attempts`, `locked_until` (unix s UTC, 0 = unlocked), `last_failed_at`. Time from an injectable `Clock` trait.
13. Reserve the attempt before hashing: in one IMMEDIATE transaction, if `locked_until > now` return `Locked{seconds_left}` (no hashing); else increment `failed_attempts`, commit, then verify. Success resets counters and sets `last_login_at`; failure applies the ladder.
14. Ladder (**OWNER**): 1-4 fails none; 5 -> 30 s; 6 -> 2 min; 7 -> 10 min; 8+ -> 30 min cashier / 5 min owner. Per user, never global. Counter older than 24 h counts as 0.
15. Clock moved back (`now < last_failed_at`): lock for the full ladder duration from `last_failed_at`; audit `clock_anomaly` once.
16. `unlock_user(id)` owner-only. Cashier sees "Locked - ask the owner" with countdown.
17. Forgotten owner PIN (**OWNER**): Option A (recommended) one-time 16-char recovery code at first run, shown once, only its argon2 hash stored in `settings.owner_recovery_hash`, usable on Office login only, under the same lockout, audited. Option B: no recovery; IT team fixes the DB.
18. UI only learns "Wrong PIN" or "Locked for N s". Unknown/inactive user gets a dummy-hash verify (equal timing). `list_login_users` returns active users as `{id, name}` only.

## D. Session and permissions
19. Session lives in Rust: `AppState.session: Mutex<Option<Session{user_id, role, name, started, last_activity: Instant}>>`, per process. UI never passes `user_id` or `role`.
20. Guards `require_login` / `require_owner` re-read `role` and `active` from `users` each call and check idle expiry (`SessionExpired`). Every command except `app_info`, `list_login_users`, `login`, `setup_owner` calls a guard; a test enforces this with an exempt list. Denied -> `permission_denied` audit row. Owner-only: settings write, create/reset/unlock/deactivate user, restore.
21. Idle lock enforced in Rust (monotonic). Guarded commands and a key-press heartbeat refresh `last_activity`. **POS: lock after 5 min (OWNER)** - PIN to resume, cart kept (memory + drafts), manual lock key, in-flight save/print always completes. **Office: log out after 10 min (OWNER)**. Stored in `settings.idle_lock_secs_pos` / `idle_lock_secs_office`, owner-editable, 60-3600 s.
22. `setup_owner(shop_name, owner_name, pin)` exists only in the Office binary. In one IMMEDIATE transaction: if any user exists -> `AlreadySetup`; else insert owner, set `setup_complete='1'` and `shop_name`, audit, commit. Name trimmed, 1-40 chars, no control chars. UI asks to confirm the PIN. POS with zero users shows "Shop not set up - open Gokul Office".

## E. Audit events
23. Same transaction as the change; `detail_json` always has `app: pos|office`; never a PIN/hash/code. Events: `setup_owner`, `login_ok`, `login_failed` (attempt no), `login_locked`, `login_blocked_locked` (max once per lock window), `logout`, `session_idle_lock`, `session_idle_logout`, `pin_changed`, `pin_reset`, `user_unlocked`, `user_created`, `user_deactivated`, `user_role_changed`, `settings_changed` (key, old, new), `permission_denied`, `clock_anomaly`, `owner_recovery_used` (if Option A).

## F. Migration 002 (reserved for S0-3)
24. File `crates/core/migrations/002_login.sql`:
```sql
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
ALTER TABLE users ADD COLUMN locked_until    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_failed_at  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login_at   TEXT;
ALTER TABLE users ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 0 CHECK (must_change_pin IN (0, 1));

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not allowed'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not allowed'); END;
CREATE TRIGGER users_no_delete BEFORE DELETE ON users
BEGIN SELECT RAISE(ABORT, 'users cannot be deleted: deactivate instead'); END;
CREATE TRIGGER users_first_is_owner BEFORE INSERT ON users
WHEN (SELECT COUNT(*) FROM users) = 0 AND NEW.role <> 'owner'
BEGIN SELECT RAISE(ABORT, 'the first user must be an owner'); END;
CREATE TRIGGER users_keep_one_owner BEFORE UPDATE OF role, active ON users
WHEN OLD.role = 'owner' AND OLD.active = 1
 AND (NEW.role <> 'owner' OR NEW.active = 0)
 AND (SELECT COUNT(*) FROM users WHERE role = 'owner' AND active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'at least one active owner is required'); END;
```
Caveat: triggers stop app bugs and casual edits, not someone with file access. Restore (step 5) must write a `restore` audit row afterwards.
Settings keys: `setup_complete`, `shop_name`, shop detail keys, `idle_lock_secs_pos`, `idle_lock_secs_office`, `owner_recovery_hash`. Writes go through a validated allow-list, owner-only.

## G. Tauri capabilities and CSP
25. Declare app commands in `build.rs` (`AppManifest::commands`), explicit `allow-*` per command. POS capability excludes `setup_owner`, settings write, user admin, restore.
26. `windows: ["main"]`, no remote URLs. Replace `core:default` with what the shell actually uses. No fs/shell/http/dialog/opener/process/updater plugins.
27. Release CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`. Separate `devCsp`. `freezePrototype: true`, `withGlobalTauri: false`, fonts bundled, devtools off in release, no navigation away from the app.

## H. Acceptance tests
28. Rust: `validate_pin` table per role; hash round-trip, PHC `$argon2id$`, salts differ, rehash on old params; exact lockout ladder with fake clock, reset on success/unlock, 24 h age-out, clock-back stays locked, persists across reopen, shared across two `Db` handles, N parallel threads cannot beat the lock; `setup_owner` once only, two racing threads -> one owner, trigger rejects non-owner first user; all migration-002 triggers; 002 on empty and populated 001 DB, reopen no-op; every audit event written once, no `detail_json` contains PIN/hash/`$argon2`; cashier calling each owner command -> `PermissionDenied` + audit; deactivated/demoted user's session fails next call; `NotLoggedIn`; `SessionExpired`; no serialized user has `pin_hash`; `Pin` Debug redacted; guard-coverage test.
29. Speed: release verify 100-250 ms on low-end (record number here); login to first screen < 400 ms; locked/failed responses without hashing < 20 ms.
30. UI (Vitest): login fully keyboard-driven, masked PIN, lock countdown; POS shows "set up in Office" with no users; cashier sees no Settings/Users and a direct route shows nothing; idle-lock overlay keeps the cart; every menu item reachable by Alt+letter or F-key.

## Measured
- argon2 verify (m=19456, t=3, p=1, release): 41.6 ms on the high-spec dev laptop; full login 41.8 ms. Shop PC: (to record - run `cargo test --release -p gokul-core real_argon2_timing -- --ignored --nocapture`; if under 150 ms raise t, max 4).

## Command API contract (Head of IT, 5 Nov 2026 - builder and ui-builder both build to this)
Rust structs use `#[serde(rename_all = "camelCase")]`; JS passes camelCase args (Tauri maps to snake_case). Changing this contract needs Head of IT approval.

```ts
type Role = 'owner' | 'cashier';
type Screen = 'dashboard'|'items'|'stock'|'production'|'packing'|'purchases'|'reports'|'users'|'settings';
interface SessionInfo { userId: number; name: string; role: Role; mustChangePin: boolean; allowedScreens: Screen[] } // POS: allowedScreens = []
interface LoginUser { id: number; name: string }
interface StartupStatus { db: 'ok'|'newer_than_app'|'busy'|'error'; setupComplete: boolean; usersExist: boolean; shopName: string | null; dbMessage: string | null }
interface StatusBarInfo { shopName: string; userName: string | null; lastBackupAt: string | null } // ISO local time or null = "never"
interface ShopSettings { shopName: string; addressLine1: string; addressLine2: string; addressLine3: string; gstin: string; fssaiNo: string; phone: string; billFooter: string }
interface UserRow { id: number; name: string; role: Role; active: boolean; lockedSecondsLeft: number; mustChangePin: boolean; lastLoginAt: string | null }
interface FieldError { field: keyof ShopSettings | 'name' | 'pin' | 'newPin'; message: string }
type ErrorCode = 'NOT_LOGGED_IN'|'SESSION_EXPIRED'|'PERMISSION_DENIED'|'WRONG_PIN'|'LOCKED'|'PIN_INVALID'|'ALREADY_SETUP'|'SHOP_NOT_SET_UP'|'VALIDATION'|'NOT_FOUND'|'PIN_CHANGE_REQUIRED'|'DB_BUSY'|'DB_NEWER'|'INTERNAL';
interface AppError { code: ErrorCode; message: string /* plain English, safe to show */; secondsLeft?: number /* LOCKED */; attemptsBeforeLock?: number /* WRONG_PIN */; fields?: FieldError[] /* VALIDATION, PIN_INVALID */ }
```

| Command | App | Args | Returns | Guard |
|---|---|---|---|---|
| `app_info` | both | - | existing | none |
| `startup_status` | both | - | `StartupStatus` | none |
| `list_login_users` | both | - | `LoginUser[]` | none |
| `login` | both | `{ userId, pin }` | `SessionInfo` | none (lockout) |
| `current_session` | both | - | `SessionInfo \| null` | none |
| `logout` | both | - | `void` | login |
| `lock_session` | both | - | `void` (Ctrl+L; clears Rust session, UI keeps its in-memory state; resume = `login`) | login |
| `heartbeat` | both | - | `void` (refresh idle timer, call at most every 30 s while keys are pressed) | login |
| `change_pin` | both | `{ oldPin, newPin }` | `SessionInfo` | login |
| `get_status_bar` | both | - | `StatusBarInfo` | none (userName null if logged out) |
| `get_shop_settings` | both | - | `ShopSettings` | login |
| `setup_owner` | office | `{ shopName, ownerName, pin }` | `{ recoveryCode: string; session: SessionInfo }` | none (only when zero users) |
| `recover_owner_pin` | office | `{ recoveryCode, newPin }` | `{ recoveryCode: string }` (new code, old one invalid) | none (lockout) |
| `save_shop_settings` | office | `{ settings: ShopSettings }` | `ShopSettings` | owner |
| `open_screen` | office | `{ screen }` | `void` (checks role; PERMISSION_DENIED + audit for cashier on users/settings/etc.) | login |
| `list_users` | office | - | `UserRow[]` | owner |
| `create_user` | office | `{ name, pin }` | `UserRow` (cashier, mustChangePin = true) | owner |
| `reset_pin` | office | `{ userId, newPin }` | `UserRow` | owner |
| `unlock_user` | office | `{ userId }` | `UserRow` | owner |
| `deactivate_user` | office | `{ userId }` | `UserRow` | owner |

UI wraps every call in one typed module per app (`src/api.ts`, shared types in `packages/ui/src/api-types.ts`) and never calls `invoke` elsewhere. Tests mock that module.

### Contract amendments (Head of IT, after backend build 5 Nov 2026)
1. `PIN_CHANGE_REQUIRED` added. While the session's user has `mustChangePin`, every guarded command except `change_pin`, `logout`, `lock_session`, `heartbeat`, `current_session` returns it. UI shows the change-PIN screen.
2. Login results: a switched-off or unknown user -> `NOT_FOUND`. The 5th wrong PIN returns `LOCKED` (30 s), not `WRONG_PIN`. POS `login` returns `SHOP_NOT_SET_UP` until Office set-up is complete. A wrong recovery code -> `WRONG_PIN` (recovery-code message).
3. `PIN_INVALID.fields[0].field` is `pin` (setup_owner, create_user) or `newPin` (change_pin, reset_pin, recover_owner_pin).
4. Settings field errors come only from `save_shop_settings` (`VALIDATION` + fields). There is no validate-on-blur command; the UI may give cheap format hints only.
5. `billFooter` max 48 chars (to confirm when paper width is known). Owner name 1-40 chars.
6. Idle timeouts are stored and validated in core but are not editable in the UI in S0-3 (Office 600 s, POS 0 = off). Editing comes in B-3.
7. Extra audit event `session_lock` (Ctrl+L). `set_user_role` exists in core, not exposed until B-3.
8. Webview capabilities: only the app's own `allow-*` command permissions + `core:event:allow-listen/unlisten`, `core:window:allow-close/destroy`. UI needing more must ask Head of IT.
9. Settings keys in the DB use underscores (`shop_name`, `shop_address1`..., `shop_phone`, `shop_gstin`, `shop_fssai`, `bill_footer`).
