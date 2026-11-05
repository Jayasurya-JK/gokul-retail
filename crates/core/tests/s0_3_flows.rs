//! Spec 00 step 3: end-to-end flows on a real database file, with two `AppContext`s on the
//! SAME file (one Office, one POS) like the two real apps. Public API only; a hand-moved
//! clock and a cheap hasher so nothing sleeps and every test runs in milliseconds.

use gokul_core::clock::Clock;
use gokul_core::pin::Argon2Hasher;
use gokul_core::settings::ShopSettings;
use gokul_core::{AppContext, AppError, AppKind, Db, Error, ErrorCode, Pin};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;

const OWNER_PIN: &str = "739158";
const OWNER_PIN_2: &str = "586204";
const CASHIER_PIN: &str = "4829";
const CASHIER_PIN_2: &str = "7351";
const WRONG: &str = "1357";

static N: AtomicU64 = AtomicU64::new(0);

struct Dir(PathBuf);
impl Dir {
    fn new() -> Dir {
        let n = N.fetch_add(1, Ordering::SeqCst);
        Dir(std::env::temp_dir().join(format!("gokul-s03-flows-{}-{}", std::process::id(), n)))
    }
    fn db(&self) -> PathBuf {
        self.0.join("data").join("gokul.db")
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct TestClock {
    unix: AtomicI64,
    mono: AtomicU64,
}
impl TestClock {
    fn new() -> Arc<TestClock> {
        Arc::new(TestClock {
            unix: AtomicI64::new(1_800_000_000),
            mono: AtomicU64::new(1_000),
        })
    }
    fn advance(&self, secs: u64) {
        self.unix.fetch_add(secs as i64, Ordering::SeqCst);
        self.mono.fetch_add(secs * 1000, Ordering::SeqCst);
    }
}
impl Clock for TestClock {
    fn unix_secs(&self) -> i64 {
        self.unix.load(Ordering::SeqCst)
    }
    fn mono_ms(&self) -> u64 {
        self.mono.load(Ordering::SeqCst)
    }
}

fn ctx(path: &Path, kind: AppKind, clock: &Arc<TestClock>) -> AppContext {
    let db = Db::open(path).expect("open db");
    AppContext::new(
        kind,
        Some(path.to_path_buf()),
        Some(db),
        Arc::new(Argon2Hasher::with_params(8, 1, 1)),
        clock.clone(),
    )
}

fn pin(s: &str) -> Pin {
    Pin::new(s.to_string())
}

fn app_err<T: std::fmt::Debug>(r: Result<T, Error>) -> AppError {
    match r {
        Ok(v) => panic!("expected an error, got Ok({v:?})"),
        Err(e) => AppError::from(&e),
    }
}

fn code<T: std::fmt::Debug>(r: Result<T, Error>) -> ErrorCode {
    app_err(r).code
}

fn shop() -> ShopSettings {
    ShopSettings {
        shop_name: "Gokul Oils".into(),
        address_line1: "12 Main Road".into(),
        phone: "98765 43210".into(),
        ..ShopSettings::default()
    }
}

struct World {
    dir: Dir,
    clock: Arc<TestClock>,
    office: AppContext,
    pos: AppContext,
}

impl World {
    fn new() -> World {
        let dir = Dir::new();
        let clock = TestClock::new();
        let office = ctx(&dir.db(), AppKind::Office, &clock);
        let pos = ctx(&dir.db(), AppKind::Pos, &clock);
        World {
            dir,
            clock,
            office,
            pos,
        }
    }

    /// Owner set up (signed in on Office), shop saved, cashier Ravi created. Ravi still has
    /// his first PIN (must change). Returns (ravi id, recovery code).
    fn with_cashier(&self) -> (i64, String) {
        let res = self
            .office
            .setup_owner("Gokul Oils", "Selvi", pin(OWNER_PIN))
            .expect("setup");
        self.office.save_shop_settings(&shop()).expect("shop");
        let ravi = self
            .office
            .create_user("Ravi", pin(CASHIER_PIN))
            .expect("ravi");
        (ravi.id, res.recovery_code().to_string())
    }

    /// Same, and Ravi has already chosen his own PIN (CASHIER_PIN_2).
    fn ready(&self) -> i64 {
        let (id, _) = self.with_cashier();
        self.pos.login(id, pin(CASHIER_PIN)).expect("first login");
        self.pos
            .change_pin(pin(CASHIER_PIN), pin(CASHIER_PIN_2))
            .expect("change");
        self.pos.logout().expect("logout");
        id
    }

    fn owner_id(&self) -> i64 {
        self.sql("SELECT id FROM users WHERE role = 'owner'")
    }

    fn sql<T: rusqlite::types::FromSql>(&self, sql: &str) -> T {
        let c = Connection::open(self.dir.db()).expect("open");
        c.query_row(sql, [], |r| r.get(0)).expect("query")
    }

    fn audit(&self, action: &str) -> i64 {
        self.sql(&format!(
            "SELECT COUNT(*) FROM audit_log WHERE action = '{action}'"
        ))
    }

    fn actions(&self) -> Vec<String> {
        let c = Connection::open(self.dir.db()).expect("open");
        let mut st = c
            .prepare("SELECT action FROM audit_log ORDER BY id")
            .expect("prep");
        let rows: Vec<String> = st
            .query_map([], |r| r.get::<_, String>(0))
            .expect("map")
            .map(|r| r.expect("row"))
            .collect();
        rows
    }

    /// No audit row may hold a PIN, a hash or a recovery code, and each names its app.
    fn assert_audit_clean(&self, secrets: &[&str]) {
        let c = Connection::open(self.dir.db()).expect("open");
        let mut st = c
            .prepare("SELECT detail_json FROM audit_log")
            .expect("prep");
        let rows: Vec<String> = st
            .query_map([], |r| r.get::<_, String>(0))
            .expect("map")
            .map(|r| r.expect("row"))
            .collect();
        for d in rows {
            assert!(!d.contains("$argon2"), "hash in audit: {d}");
            assert!(d.contains("\"app\""), "audit row without app: {d}");
            for s in secrets {
                assert!(!d.contains(s), "secret {s} in audit: {d}");
            }
        }
    }
}

// ---------------------------------------------------------------- 1

#[test]
fn flow1_fresh_install_pos_refuses_until_office_sets_up() {
    let w = World::new();
    let st = w.pos.startup_status();
    assert!(!st.setup_complete && !st.users_exist);
    assert!(w.pos.list_login_users().expect("list").is_empty());
    assert_eq!(
        code(w.pos.login(1, pin(OWNER_PIN))),
        ErrorCode::ShopNotSetUp
    );
    // POS can never create the owner.
    assert_eq!(
        code(w.pos.setup_owner("X", "Y", pin(OWNER_PIN))),
        ErrorCode::PermissionDenied
    );
    assert!(!w.pos.startup_status().users_exist);

    let res = w
        .office
        .setup_owner("Gokul Oils", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    assert_eq!(res.recovery_code.replace('-', "").len(), 16);
    assert_eq!(res.session.allowed_screens.len(), 9);
    let owner_id = res.session.user_id;

    // Owner exists but shop details are not saved: POS still refuses.
    assert_eq!(
        code(w.pos.login(owner_id, pin(OWNER_PIN))),
        ErrorCode::ShopNotSetUp
    );
    // Bad details: VALIDATION naming the field, and POS stays closed.
    let mut bad = shop();
    bad.phone = "12".into();
    let e = app_err(w.office.save_shop_settings(&bad));
    assert_eq!(e.code, ErrorCode::Validation);
    assert!(e.fields.expect("fields").iter().any(|f| f.field == "phone"));
    assert_eq!(
        code(w.pos.login(owner_id, pin(OWNER_PIN))),
        ErrorCode::ShopNotSetUp
    );

    w.office.save_shop_settings(&shop()).expect("save");
    assert!(w.pos.startup_status().setup_complete);
    let users = w.pos.list_login_users().expect("list");
    assert_eq!(users.len(), 1);
    let s = w.pos.login(users[0].id, pin(OWNER_PIN)).expect("pos login");
    assert!(s.allowed_screens.is_empty(), "POS has no Office screens");
    assert_eq!(
        w.pos.get_shop_settings().expect("settings").shop_name,
        "Gokul Oils"
    );
    assert_eq!(
        w.pos.get_status_bar().expect("bar").user_name.as_deref(),
        Some("Selvi")
    );
    // A second setup attempt is refused and changes nothing.
    assert_eq!(
        code(w.office.setup_owner("Other", "Mallory", pin(OWNER_PIN_2))),
        ErrorCode::AlreadySetup
    );
    assert_eq!(w.sql::<i64>("SELECT COUNT(*) FROM users"), 1);
    w.assert_audit_clean(&[OWNER_PIN, &res.recovery_code]);
}

// ---------------------------------------------------------------- 2

#[test]
fn flow2_new_cashier_must_change_pin_before_anything_works() {
    let w = World::new();
    let (ravi, _) = w.with_cashier();

    let s = w.pos.login(ravi, pin(CASHIER_PIN)).expect("login");
    assert!(s.must_change_pin);
    assert_eq!(
        code(w.pos.get_shop_settings()),
        ErrorCode::PinChangeRequired
    );
    // The allowed exceptions still work.
    w.pos.heartbeat().expect("heartbeat");
    assert!(w.pos.current_session().expect("cur").is_some());
    // Weak or unchanged PIN is refused with the field named, session stays pending.
    let e = app_err(w.pos.change_pin(pin(CASHIER_PIN), pin(CASHIER_PIN)));
    assert_eq!(e.code, ErrorCode::PinInvalid);
    // Core now names the field itself: a bad NEW PIN is "newPin" (a bad old PIN or login PIN is "pin").
    assert_eq!(e.fields.expect("fields")[0].field, "newPin");
    assert_eq!(
        code(w.pos.change_pin(pin(CASHIER_PIN), pin("1234"))),
        ErrorCode::PinInvalid
    );
    // Wrong old PIN is a WRONG_PIN.
    assert_eq!(
        code(w.pos.change_pin(pin(WRONG), pin(CASHIER_PIN_2))),
        ErrorCode::WrongPin
    );
    let s = w
        .pos
        .change_pin(pin(CASHIER_PIN), pin(CASHIER_PIN_2))
        .expect("change");
    assert!(!s.must_change_pin);
    w.pos.get_shop_settings().expect("now works");

    // Old PIN is dead, new one works, also after logging out and in.
    w.pos.logout().expect("logout");
    assert_eq!(
        code(w.pos.login(ravi, pin(CASHIER_PIN))),
        ErrorCode::WrongPin
    );
    w.pos.login(ravi, pin(CASHIER_PIN_2)).expect("new pin");
    // Office sees that he no longer has to change it.
    let row = w
        .office
        .list_users()
        .expect("users")
        .into_iter()
        .find(|u| u.id == ravi)
        .expect("ravi");
    assert!(!row.must_change_pin);
    assert!(row.last_login_at.is_some());
    assert_eq!(w.audit("pin_changed"), 1);
}

// ---------------------------------------------------------------- 3

#[test]
fn flow3_lockout_on_pos_is_visible_and_clearable_from_office() {
    let w = World::new();
    let ravi = w.ready();

    for i in 1..=4u32 {
        let e = app_err(w.pos.login(ravi, pin(WRONG)));
        assert_eq!(e.code, ErrorCode::WrongPin);
        assert_eq!(e.attempts_before_lock, Some(5 - i));
    }
    let e = app_err(w.pos.login(ravi, pin(WRONG)));
    assert_eq!((e.code, e.seconds_left), (ErrorCode::Locked, Some(30)));

    let locked = |w: &World| {
        w.office
            .list_users()
            .expect("users")
            .into_iter()
            .find(|u| u.id == ravi)
            .expect("ravi")
            .locked_seconds_left
    };
    assert_eq!(locked(&w), 30);
    // Right PIN does not help while locked, and the countdown runs on the shared clock.
    assert_eq!(
        code(w.pos.login(ravi, pin(CASHIER_PIN_2))),
        ErrorCode::Locked
    );
    w.clock.advance(10);
    assert_eq!(locked(&w), 20);

    // Ladder: 6th fail after the lock ends -> 2 minutes, 7th -> 10 minutes.
    w.clock.advance(20);
    assert_eq!(locked(&w), 0);
    let e = app_err(w.pos.login(ravi, pin(WRONG)));
    assert_eq!((e.code, e.seconds_left), (ErrorCode::Locked, Some(120)));
    w.clock.advance(120);
    let e = app_err(w.pos.login(ravi, pin(WRONG)));
    assert_eq!((e.code, e.seconds_left), (ErrorCode::Locked, Some(600)));
    assert_eq!(locked(&w), 600);

    // Owner unlocks from Office; POS lets him in at once.
    let row = w.office.unlock_user(ravi).expect("unlock");
    assert_eq!(row.locked_seconds_left, 0);
    w.pos.login(ravi, pin(CASHIER_PIN_2)).expect("in");
    assert_eq!(w.audit("user_unlocked"), 1);
    assert!(w.audit("login_locked") >= 3);
    w.assert_audit_clean(&[CASHIER_PIN, CASHIER_PIN_2, WRONG, OWNER_PIN]);
}

#[test]
fn flow3b_a_good_login_resets_the_wrong_count() {
    let w = World::new();
    let ravi = w.ready();
    for _ in 0..4 {
        assert_eq!(code(w.pos.login(ravi, pin(WRONG))), ErrorCode::WrongPin);
    }
    w.pos.login(ravi, pin(CASHIER_PIN_2)).expect("ok");
    w.pos.logout().expect("out");
    // Four more wrong tries are again below the lock threshold.
    for _ in 0..4 {
        assert_eq!(code(w.pos.login(ravi, pin(WRONG))), ErrorCode::WrongPin);
    }
}

// ---------------------------------------------------------------- 4

#[test]
fn flow4_cashier_on_office_gets_limited_menu_and_denials_are_audited() {
    let w = World::new();
    let ravi = w.ready();
    // Use a separate Office context for the cashier so the owner session stays intact.
    let cashier_office = ctx(&w.dir.db(), AppKind::Office, &w.clock);
    let s = cashier_office
        .login(ravi, pin(CASHIER_PIN_2))
        .expect("cashier on office");
    let names: Vec<String> = s
        .allowed_screens
        .iter()
        .map(|x| format!("{x:?}").to_lowercase())
        .collect();
    assert_eq!(names, vec!["dashboard", "items", "stock"]);

    for ok in ["dashboard", "items", "stock"] {
        cashier_office.open_screen(ok).expect(ok);
    }
    let before = w.audit("permission_denied");
    for (i, bad) in [
        "settings",
        "users",
        "reports",
        "purchases",
        "production",
        "packing",
    ]
    .iter()
    .enumerate()
    {
        assert_eq!(
            code(cashier_office.open_screen(bad)),
            ErrorCode::PermissionDenied,
            "{bad}"
        );
        assert_eq!(w.audit("permission_denied"), before + 1 + i as i64);
    }
    assert_eq!(
        code(cashier_office.open_screen("nonsense")),
        ErrorCode::NotFound
    );

    // Owner-only commands.
    let denied_before = w.audit("permission_denied");
    assert_eq!(
        code(cashier_office.list_users()),
        ErrorCode::PermissionDenied
    );
    assert_eq!(
        code(cashier_office.create_user("Eve", pin("6073"))),
        ErrorCode::PermissionDenied
    );
    assert_eq!(
        code(cashier_office.reset_pin(ravi, pin("6073"))),
        ErrorCode::PermissionDenied
    );
    assert_eq!(
        code(cashier_office.unlock_user(ravi)),
        ErrorCode::PermissionDenied
    );
    assert_eq!(
        code(cashier_office.deactivate_user(ravi)),
        ErrorCode::PermissionDenied
    );
    assert_eq!(
        code(cashier_office.save_shop_settings(&shop())),
        ErrorCode::PermissionDenied
    );
    assert_eq!(w.audit("permission_denied"), denied_before + 6);
    // Nothing changed by those attempts.
    assert_eq!(w.sql::<i64>("SELECT COUNT(*) FROM users"), 2);
    // Reading shop settings is allowed for any signed-in user.
    cashier_office.get_shop_settings().expect("read ok");
    w.assert_audit_clean(&[CASHIER_PIN_2]);
}

#[test]
fn flow4b_commands_need_a_login_and_deactivation_kills_the_session() {
    let w = World::new();
    let ravi = w.ready();
    w.office.logout().expect("office out");
    assert_eq!(code(w.office.list_users()), ErrorCode::NotLoggedIn);
    assert_eq!(code(w.pos.get_shop_settings()), ErrorCode::NotLoggedIn);

    w.pos.login(ravi, pin(CASHIER_PIN_2)).expect("in");
    w.pos.get_shop_settings().expect("ok");
    let owner = w.owner_id();
    w.office.login(owner, pin(OWNER_PIN)).expect("owner in");
    assert!(!w.office.deactivate_user(ravi).expect("off").active);
    // His open POS session dies on the next call, and he cannot sign in again.
    assert!(w.pos.get_shop_settings().is_err());
    assert_eq!(
        code(w.pos.login(ravi, pin(CASHIER_PIN_2))),
        ErrorCode::NotFound
    );
    assert!(w
        .pos
        .list_login_users()
        .expect("l")
        .iter()
        .all(|u| u.id != ravi));
}

// ---------------------------------------------------------------- 5

#[test]
fn flow5_owner_forgot_pin_recovers_with_code() {
    let w = World::new();
    let (_, code1) = w.with_cashier();
    w.office.logout().expect("out");
    let owner = w.owner_id();

    // Wrong code is refused and counted against the owner.
    assert_eq!(
        code(
            w.office
                .recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin(OWNER_PIN_2))
        ),
        ErrorCode::WrongPin
    );
    // Weak new PIN is refused before the code is spent.
    assert_eq!(
        code(w.office.recover_owner_pin(&code1, pin("123456"))),
        ErrorCode::PinInvalid
    );
    // POS has no recovery.
    assert_eq!(
        code(w.pos.recover_owner_pin(&code1, pin(OWNER_PIN_2))),
        ErrorCode::PermissionDenied
    );

    let new_code = w
        .office
        .recover_owner_pin(&code1, pin(OWNER_PIN_2))
        .expect("recover")
        .into_code();
    assert_ne!(new_code, code1);
    // New PIN works (on POS too), old PIN is dead.
    w.office.login(owner, pin(OWNER_PIN_2)).expect("new pin");
    w.pos.login(owner, pin(OWNER_PIN_2)).expect("pos new pin");
    assert_eq!(
        code(w.office.login(owner, pin(OWNER_PIN))),
        ErrorCode::WrongPin
    );
    // Old code is dead, the new one is live.
    assert_eq!(
        code(w.office.recover_owner_pin(&code1, pin("864209"))),
        ErrorCode::WrongPin
    );
    assert!(w.office.recover_owner_pin(&new_code, pin("864209")).is_ok());
    assert_eq!(w.audit("owner_recovery_used"), 2);
    w.assert_audit_clean(&[OWNER_PIN, OWNER_PIN_2, &code1, &new_code]);
}

// ---------------------------------------------------------------- 6

#[test]
fn flow6_lock_then_a_different_user_signs_in() {
    let w = World::new();
    let ravi = w.ready();
    let owner = w.owner_id();
    w.pos.login(ravi, pin(CASHIER_PIN_2)).expect("ravi");
    w.pos.lock_session().expect("lock");
    // Locked means signed out in Rust: guarded commands refuse.
    assert_eq!(code(w.pos.get_shop_settings()), ErrorCode::NotLoggedIn);
    assert!(w.pos.current_session().expect("cur").is_none());
    let s = w.pos.login(owner, pin(OWNER_PIN)).expect("owner");
    assert_eq!(s.name, "Selvi");

    let a = w.actions();
    let lock = a
        .iter()
        .position(|x| x == "session_lock")
        .expect("lock row");
    let ok_after = a.iter().rposition(|x| x == "login_ok").expect("login row");
    assert!(
        lock < ok_after,
        "session_lock must precede the next login_ok: {a:?}"
    );
    assert_eq!(w.audit("session_lock"), 1);
    // Locking with nobody signed in is refused, not silently audited.
    w.pos.lock_session().expect("lock owner");
    assert_eq!(code(w.pos.lock_session()), ErrorCode::NotLoggedIn);
    assert_eq!(w.audit("session_lock"), 2);
}

// ---------------------------------------------------------------- 7

#[test]
fn flow7_restart_keeps_users_settings_and_lockout() {
    let dir = Dir::new();
    let clock = TestClock::new();
    let ravi;
    {
        let office = ctx(&dir.db(), AppKind::Office, &clock);
        office
            .setup_owner("Gokul Oils", "Selvi", pin(OWNER_PIN))
            .expect("setup");
        let mut s = shop();
        s.gstin = "27AAPFU0939F1ZV".into();
        s.bill_footer = "Thank you".into();
        office.save_shop_settings(&s).expect("save");
        ravi = office.create_user("Ravi", pin(CASHIER_PIN)).expect("c").id;
        let pos = ctx(&dir.db(), AppKind::Pos, &clock);
        pos.login(ravi, pin(CASHIER_PIN)).expect("in");
        pos.change_pin(pin(CASHIER_PIN), pin(CASHIER_PIN_2))
            .expect("chg");
        pos.logout().expect("out");
        for _ in 0..5 {
            let _ = pos.login(ravi, pin(WRONG));
        }
    } // both contexts dropped here

    clock.advance(5); // "the PC was restarted a few seconds later"
    let office = ctx(&dir.db(), AppKind::Office, &clock);
    let pos = ctx(&dir.db(), AppKind::Pos, &clock);
    let st = pos.startup_status();
    assert!(st.setup_complete && st.users_exist);
    assert_eq!(st.shop_name.as_deref(), Some("Gokul Oils"));
    assert_eq!(pos.list_login_users().expect("l").len(), 2);
    assert!(
        pos.current_session().expect("cur").is_none(),
        "sessions are not persisted"
    );
    let e = app_err(pos.login(ravi, pin(CASHIER_PIN_2)));
    assert_eq!((e.code, e.seconds_left), (ErrorCode::Locked, Some(25)));

    let owner: i64 = Connection::open(dir.db())
        .expect("o")
        .query_row("SELECT id FROM users WHERE role = 'owner'", [], |r| {
            r.get(0)
        })
        .expect("id");
    office.login(owner, pin(OWNER_PIN)).expect("owner");
    let saved = office.get_shop_settings().expect("settings");
    assert_eq!(saved.gstin, "27AAPFU0939F1ZV");
    assert_eq!(saved.bill_footer, "Thank you");
    let row = office
        .list_users()
        .expect("u")
        .into_iter()
        .find(|u| u.id == ravi)
        .expect("ravi");
    assert_eq!(row.locked_seconds_left, 25);
    clock.advance(25);
    pos.login(ravi, pin(CASHIER_PIN_2)).expect("after lock");
}

// ---------------------------------------------------------------- 8

#[test]
fn flow8_racing_setup_owner_creates_exactly_one_owner() {
    for round in 0..5 {
        let dir = Dir::new();
        let clock = TestClock::new();
        // Open both before the race so migrations are not what is being tested here.
        let a = Arc::new(ctx(&dir.db(), AppKind::Office, &clock));
        let b = Arc::new(ctx(&dir.db(), AppKind::Office, &clock));
        let barrier = Arc::new(std::sync::Barrier::new(6));
        let mut handles = Vec::new();
        for i in 0..6usize {
            let c = if i % 2 == 0 { a.clone() } else { b.clone() };
            let bar = barrier.clone();
            handles.push(std::thread::spawn(move || {
                bar.wait();
                c.setup_owner(&format!("Shop {i}"), &format!("Owner {i}"), pin(OWNER_PIN))
                    .map(|_| ())
                    .map_err(|e| AppError::from(&e).code)
            }));
        }
        let results: Vec<_> = handles
            .into_iter()
            .map(|h| h.join().expect("join"))
            .collect();
        let wins = results.iter().filter(|r| r.is_ok()).count();
        assert_eq!(wins, 1, "round {round}: {results:?}");
        for r in results.iter().filter(|r| r.is_err()) {
            assert_eq!(r, &Err(ErrorCode::AlreadySetup), "round {round}");
        }
        let c = Connection::open(dir.db()).expect("open");
        let owners: i64 = c
            .query_row("SELECT COUNT(*) FROM users WHERE role='owner'", [], |r| {
                r.get(0)
            })
            .expect("count");
        let setups: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM audit_log WHERE action='setup_owner'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!((owners, setups), (1, 1), "round {round}");
    }
}

#[test]
fn flow8b_parallel_wrong_pins_from_both_apps_cannot_beat_the_lock() {
    let w = World::new();
    let ravi = w.ready();
    let pos = Arc::new(ctx(&w.dir.db(), AppKind::Pos, &w.clock));
    let pos2 = Arc::new(ctx(&w.dir.db(), AppKind::Pos, &w.clock));
    let barrier = Arc::new(std::sync::Barrier::new(8));
    let mut handles = Vec::new();
    for i in 0..8usize {
        let c = if i % 2 == 0 {
            pos.clone()
        } else {
            pos2.clone()
        };
        let bar = barrier.clone();
        handles.push(std::thread::spawn(move || {
            bar.wait();
            // Half of them carry the right PIN: nobody may get in once 5 fails are booked.
            let p = if i < 4 { WRONG } else { CASHIER_PIN_2 };
            c.login(ravi, pin(p))
                .map(|_| ())
                .map_err(|e| AppError::from(&e).code)
        }));
    }
    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("join"))
        .collect();
    let failures = results
        .iter()
        .filter(|r| matches!(r, Err(ErrorCode::WrongPin | ErrorCode::Locked)))
        .count();
    let ok = results.iter().filter(|r| r.is_ok()).count();
    assert_eq!(failures + ok, 8, "unexpected codes: {results:?}");
    // At most the first 4 reserved attempts can pass hashing unlocked. The wrong ones never log in.
    assert!(ok <= 4, "{results:?}");
}
