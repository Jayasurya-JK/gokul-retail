//! Spec 00 step 3 acceptance tests (rule 28 and 29): PIN, lockout, session, permissions,
//! audit, migration 002, setup, recovery.

use crate::audit::{event, AppKind};
use crate::auth::{self, Role};
use crate::pin::{Argon2Hasher, Pin, PinError, PinHasher};
use crate::session::Screen;
use crate::settings::{self, ShopSettings};
use crate::testutil::{ctx_on, CountingHasher, FakeClock, TempDir};
use crate::{migrations, AppContext, AppError, Db, Error};
use rusqlite::Connection;
use std::sync::Arc;
use std::time::Instant;

const OWNER_PIN: &str = "739158";
const CASHIER_PIN: &str = "4829";
const BAD_PIN: &str = "1357";

fn pin(s: &str) -> Pin {
    Pin::new(s.to_string())
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
    dir: TempDir,
    clock: Arc<FakeClock>,
    hasher: Arc<CountingHasher>,
    office: AppContext,
    owner_id: i64,
    cashier_id: i64,
}

impl World {
    fn path(&self) -> std::path::PathBuf {
        self.dir.db_path()
    }

    fn ctx(&self, kind: AppKind) -> AppContext {
        ctx_on(&self.path(), kind, &self.clock, self.hasher.clone())
    }

    fn count(&self, sql: &str) -> i64 {
        let conn = Connection::open(self.path()).expect("open");
        conn.query_row(sql, [], |r| r.get(0)).expect("count")
    }

    fn audit_count(&self, action: &str) -> i64 {
        self.count(&format!(
            "SELECT COUNT(*) FROM audit_log WHERE action = '{action}'"
        ))
    }
}

/// Office set up with an owner, shop details and one cashier (Ravi). Nobody signed in.
fn world() -> World {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let hasher = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, hasher.clone());
    let res = office
        .setup_owner("Gokul Oils", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    office.save_shop_settings(&shop()).expect("shop");
    let cashier = office
        .create_user("Ravi", pin(CASHIER_PIN))
        .expect("cashier");
    let cashier_id = cashier.id;
    // A new cashier must change the PIN; most tests want a cashier who already has.
    office
        .with_db(|db| {
            db.conn().execute(
                "UPDATE users SET must_change_pin = 0 WHERE id = ?1",
                [cashier_id],
            )?;
            Ok(())
        })
        .expect("clear flag");
    office.logout().expect("logout");
    World {
        dir,
        clock,
        hasher,
        office,
        owner_id: res.session.user_id,
        cashier_id: cashier.id,
    }
}

fn wrong_left(e: Error) -> u32 {
    match e {
        Error::WrongPin {
            attempts_before_lock,
        } => attempts_before_lock,
        other => panic!("expected WrongPin, got {other:?}"),
    }
}

fn locked_secs(e: Error) -> i64 {
    match e {
        Error::Locked { seconds_left } => seconds_left,
        other => panic!("expected Locked, got {other:?}"),
    }
}

fn bad_login(ctx: &AppContext, id: i64) -> Error {
    ctx.login(id, pin(BAD_PIN)).expect_err("must fail")
}

// ---- lockout ladder ----

#[test]
fn lockout_ladder_cashier() {
    let w = world();
    let c = w.cashier_id;
    for left in [4, 3, 2, 1] {
        assert_eq!(wrong_left(bad_login(&w.office, c)), left);
    }
    assert_eq!(locked_secs(bad_login(&w.office, c)), 30);

    // Locked: even the right PIN is refused, and nothing is hashed.
    let before = w.hasher.count();
    w.clock.advance(10);
    let e = w.office.login(c, pin(CASHIER_PIN)).expect_err("locked");
    assert_eq!(locked_secs(e), 20);
    assert_eq!(w.hasher.count(), before, "locked attempts must not hash");

    w.clock.advance(20);
    assert_eq!(locked_secs(bad_login(&w.office, c)), 120);
    w.clock.advance(120);
    assert_eq!(locked_secs(bad_login(&w.office, c)), 600);
    w.clock.advance(600);
    assert_eq!(locked_secs(bad_login(&w.office, c)), 1800);
    w.clock.advance(1799);
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    w.clock.advance(1);
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_ok());
}

#[test]
fn lockout_ladder_owner_tops_out_at_five_minutes() {
    let w = world();
    let o = w.owner_id;
    let mut last = 0;
    for _ in 0..8 {
        w.clock.advance(3000);
        last = match bad_login(&w.office, o) {
            Error::Locked { seconds_left } => seconds_left,
            _ => 0,
        };
    }
    assert_eq!(last, 300);
}

#[test]
fn success_resets_the_counter() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..3 {
        bad_login(&w.office, c);
    }
    w.office.login(c, pin(CASHIER_PIN)).expect("login");
    assert_eq!(wrong_left(bad_login(&w.office, c)), 4);
}

#[test]
fn unlock_user_clears_a_lock() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    let rows = w.office.list_users().expect("users");
    assert!(rows.iter().any(|u| u.id == c && u.locked_seconds_left > 0));
    let row = w.office.unlock_user(c).expect("unlock");
    assert_eq!(row.locked_seconds_left, 0);
    assert_eq!(w.audit_count(event::USER_UNLOCKED), 1);
    let pos = w.ctx(AppKind::Pos);
    pos.login(c, pin(CASHIER_PIN)).expect("cashier now in");
}

#[test]
fn old_failures_age_out_after_24_hours() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..4 {
        bad_login(&w.office, c);
    }
    w.clock.advance(24 * 3600 + 1);
    assert_eq!(wrong_left(bad_login(&w.office, c)), 4);
}

#[test]
fn clock_moved_back_stays_locked_and_is_audited_once() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    let t0 = w.clock.unix();
    w.clock.set_unix(t0 - 3600);
    for _ in 0..3 {
        let e = w.office.login(c, pin(CASHIER_PIN)).expect_err("locked");
        assert_eq!(locked_secs(e), 30, "re-anchored to a normal lock");
    }
    assert_eq!(w.audit_count(event::CLOCK_ANOMALY), 1);
    w.clock.set_unix(t0 + 31);
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_ok());
}

#[test]
fn blocked_attempts_are_audited_once_per_lock_window() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    for _ in 0..4 {
        assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    }
    assert_eq!(w.audit_count(event::LOGIN_BLOCKED_LOCKED), 1);
    assert_eq!(w.audit_count(event::LOGIN_LOCKED), 1);
    assert_eq!(w.audit_count(event::LOGIN_FAILED), 5);
}

#[test]
fn lock_survives_restart_and_is_shared_between_apps() {
    let w = world();
    let c = w.cashier_id;
    let pos = w.ctx(AppKind::Pos);
    for _ in 0..3 {
        bad_login(&w.office, c);
    }
    bad_login(&pos, c);
    assert_eq!(locked_secs(bad_login(&w.office, c)), 30);
    // Fresh handles on the same file (a restart of both apps).
    let pos2 = w.ctx(AppKind::Pos);
    let e = pos2.login(c, pin(CASHIER_PIN)).expect_err("still locked");
    assert!(locked_secs(e) > 0);
}

#[test]
fn parallel_guessing_cannot_beat_the_lock() {
    let w = world();
    let c = w.cashier_id;
    let ctxs: Vec<AppContext> = (0..4).map(|_| w.ctx(AppKind::Pos)).collect();
    let before = w.hasher.count();
    std::thread::scope(|s| {
        for ctx in &ctxs {
            for _ in 0..4 {
                s.spawn(move || {
                    for _ in 0..3 {
                        let e = ctx.login(c, pin(BAD_PIN)).expect_err("never succeeds");
                        assert!(matches!(e, Error::WrongPin { .. } | Error::Locked { .. }));
                    }
                });
            }
        }
    });
    let hashed = w.hasher.count() - before;
    assert!(
        hashed <= 5,
        "only 5 guesses may reach the hasher, got {hashed}"
    );
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err(), "still locked");
}

// ---- login behaviour ----

#[test]
fn login_basics_and_unknown_users() {
    let w = world();
    let info = w
        .office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login");
    assert_eq!(info.name, "Ravi");
    assert_eq!(info.role, Role::Cashier);
    assert_eq!(
        info.allowed_screens,
        vec![Screen::Dashboard, Screen::Items, Screen::Stock]
    );
    let owner = w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    assert_eq!(owner.allowed_screens.len(), 9);
    assert!(!owner.must_change_pin);

    let before = w.hasher.count();
    let e = w.office.login(9999, pin(CASHIER_PIN)).expect_err("unknown");
    assert!(matches!(e, Error::UserUnavailable));
    assert_eq!(w.hasher.count(), before + 1, "dummy hash spent");

    let e = w.office.login(w.cashier_id, pin("12")).expect_err("format");
    assert!(matches!(e, Error::InvalidPin(PinError::BadLength)));
    let e = w
        .office
        .login(w.cashier_id, pin("abcd"))
        .expect_err("format");
    assert!(matches!(e, Error::InvalidPin(PinError::NotDigits)));
    assert_eq!(
        w.hasher.count(),
        before + 1,
        "bad format never reaches the hasher"
    );
}

#[test]
fn deactivated_user_cannot_log_in_and_loses_the_session() {
    let w = world();
    let pos = w.ctx(AppKind::Pos);
    pos.login(w.cashier_id, pin(CASHIER_PIN)).expect("login");
    assert!(pos.get_shop_settings().is_ok());
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    let row = w.office.deactivate_user(w.cashier_id).expect("deactivate");
    assert!(!row.active);
    assert!(matches!(pos.get_shop_settings(), Err(Error::NotLoggedIn)));
    assert!(matches!(
        pos.login(w.cashier_id, pin(CASHIER_PIN)),
        Err(Error::UserUnavailable)
    ));
    let names: Vec<_> = pos
        .list_login_users()
        .expect("list")
        .into_iter()
        .map(|u| u.name)
        .collect();
    assert_eq!(names, vec!["Selvi".to_string()]);
}

#[test]
fn demoted_user_fails_owner_checks_on_the_next_call() {
    let w = world();
    let second = w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    assert_eq!(second.role, Role::Owner);
    // Promote the cashier to owner, sign them in on POS, then demote again.
    let now = w.clock.unix();
    let (owner_id, cashier_id) = (w.owner_id, w.cashier_id);
    w.office
        .with_db(|db| {
            auth::set_user_role(db, owner_id, cashier_id, Role::Owner, now, AppKind::Office)
        })
        .expect("promote");
    let pos = w.ctx(AppKind::Pos);
    pos.login(cashier_id, pin(CASHIER_PIN)).expect("login");
    let office2 = w.ctx(AppKind::Office);
    office2.login(cashier_id, pin(CASHIER_PIN)).expect("login");
    assert!(office2.list_users().is_ok());
    w.office
        .with_db(|db| {
            auth::set_user_role(
                db,
                owner_id,
                cashier_id,
                Role::Cashier,
                now,
                AppKind::Office,
            )
        })
        .expect("demote");
    assert!(matches!(office2.list_users(), Err(Error::PermissionDenied)));
    assert_eq!(w.audit_count(event::USER_ROLE_CHANGED), 2);
}

#[test]
fn pos_refuses_login_until_the_shop_is_set_up() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    let pos = ctx_on(&dir.db_path(), AppKind::Pos, &clock, h);
    let st = pos.startup_status();
    assert!(!st.users_exist && !st.setup_complete);
    let res = office
        .setup_owner("Gokul Oils", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let st = pos.startup_status();
    assert!(st.users_exist && !st.setup_complete);
    assert_eq!(st.shop_name.as_deref(), Some("Gokul Oils"));
    assert!(matches!(
        pos.login(res.session.user_id, pin(OWNER_PIN)),
        Err(Error::ShopNotSetUp)
    ));
    office.save_shop_settings(&shop()).expect("shop");
    assert!(pos.startup_status().setup_complete);
    let info = pos
        .login(res.session.user_id, pin(OWNER_PIN))
        .expect("login");
    assert!(info.allowed_screens.is_empty(), "POS has no Office screens");
}

#[test]
fn old_hashes_are_upgraded_on_login() {
    let w = world();
    let strong = CountingHasher::with_params(16, 2);
    let ctx = ctx_on(&w.path(), AppKind::Pos, &w.clock, strong.clone());
    let old = w.count("SELECT COUNT(*) FROM users WHERE pin_hash LIKE '%m=8,t=1,p=1%'");
    assert_eq!(old, 2);
    ctx.login(w.cashier_id, pin(CASHIER_PIN)).expect("login");
    let after = w.count("SELECT COUNT(*) FROM users WHERE pin_hash LIKE '%m=16,t=2,p=1%'");
    assert_eq!(after, 1);
    // The upgraded hash still works with the old-cost hasher too (parameters are in the hash).
    w.office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login again");
}

// ---- session ----

#[test]
fn guards_need_a_login() {
    let w = world();
    assert!(matches!(
        w.office.get_shop_settings(),
        Err(Error::NotLoggedIn)
    ));
    assert!(matches!(w.office.list_users(), Err(Error::NotLoggedIn)));
    assert!(matches!(w.office.heartbeat(), Err(Error::NotLoggedIn)));
    assert!(matches!(w.office.logout(), Err(Error::NotLoggedIn)));
    assert!(matches!(
        w.office.open_screen("items"),
        Err(Error::NotLoggedIn)
    ));
    assert!(w.office.current_session().expect("cur").is_none());
}

#[test]
fn office_signs_out_after_idle_and_heartbeat_keeps_alive() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    w.clock.advance(599);
    w.office.heartbeat().expect("alive");
    w.clock.advance(599);
    w.office.heartbeat().expect("still alive");
    w.clock.advance(601);
    assert!(w.office.current_session().expect("cur").is_none());
    assert!(matches!(w.office.heartbeat(), Err(Error::SessionExpired)));
    assert!(matches!(w.office.heartbeat(), Err(Error::NotLoggedIn)));
    assert_eq!(w.audit_count(event::SESSION_IDLE_LOGOUT), 1);
}

#[test]
fn pos_never_locks_by_default_and_obeys_the_setting() {
    let w = world();
    let pos = w.ctx(AppKind::Pos);
    pos.login(w.cashier_id, pin(CASHIER_PIN)).expect("login");
    w.clock.advance(10 * 3600);
    pos.heartbeat()
        .expect("POS stays signed in with the default");
    w.office
        .with_db(|db| settings::set_raw(db.conn(), settings::KEY_IDLE_POS, "60"))
        .expect("set");
    w.clock.advance(61);
    assert!(matches!(pos.heartbeat(), Err(Error::SessionExpired)));
    assert_eq!(w.audit_count(event::SESSION_IDLE_LOCK), 1);
}

#[test]
fn lock_session_ends_the_rust_session_and_logout_is_audited() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    w.office.lock_session().expect("lock");
    assert!(matches!(w.office.heartbeat(), Err(Error::NotLoggedIn)));
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    w.office.logout().expect("logout");
    assert_eq!(w.audit_count(event::SESSION_LOCK), 1);
    // world() already logged out once while setting up.
    assert_eq!(w.audit_count(event::LOGOUT), 2);
}

// ---- permissions ----

#[test]
fn cashier_is_refused_every_owner_command_and_it_is_audited() {
    let w = world();
    w.office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login");
    let (o, c) = (w.owner_id, w.cashier_id);
    let denied: Vec<Error> = vec![
        w.office.list_users().expect_err("list"),
        w.office
            .create_user("Mani", pin("7249"))
            .expect_err("create"),
        w.office.reset_pin(c, pin("7249")).expect_err("reset"),
        w.office.unlock_user(o).expect_err("unlock"),
        w.office.deactivate_user(o).expect_err("deactivate"),
        w.office.save_shop_settings(&shop()).expect_err("settings"),
        w.office.open_screen("users").expect_err("users"),
        w.office
            .open_screen("settings")
            .expect_err("settings screen"),
        w.office.open_screen("production").expect_err("production"),
        w.office.open_screen("packing").expect_err("packing"),
        w.office.open_screen("purchases").expect_err("purchases"),
        w.office.open_screen("reports").expect_err("reports"),
    ];
    for e in &denied {
        assert!(matches!(e, Error::PermissionDenied), "{e:?}");
    }
    assert_eq!(w.audit_count(event::PERMISSION_DENIED), denied.len() as i64);
    for ok in ["dashboard", "items", "stock"] {
        w.office.open_screen(ok).expect(ok);
    }
    assert!(matches!(
        w.office.open_screen("nonsense"),
        Err(Error::NotFound(_))
    ));
    assert!(
        w.office.get_shop_settings().is_ok(),
        "read is for everyone signed in"
    );
    // Nothing changed.
    assert_eq!(w.count("SELECT COUNT(*) FROM users"), 2);
}

#[test]
fn owner_can_do_the_admin_work() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    let mani = w
        .office
        .create_user("  Mani  ", pin("7249"))
        .expect("create");
    assert_eq!(mani.name, "Mani");
    assert!(mani.must_change_pin);
    assert_eq!(mani.role, Role::Cashier);
    assert!(matches!(
        w.office.create_user("mani", pin("7249")),
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        w.office.create_user("   ", pin("7249")),
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        w.office.create_user("Anu", pin("1234")),
        Err(Error::InvalidPin(PinError::TooEasy))
    ));
    let reset = w.office.reset_pin(mani.id, pin("9051")).expect("reset");
    assert!(reset.must_change_pin);
    assert!(matches!(
        w.office.reset_pin(w.owner_id, pin("902846")),
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        w.office.deactivate_user(w.owner_id),
        Err(Error::Validation(_))
    ));
    let rows = w.office.list_users().expect("list");
    assert_eq!(rows.len(), 3);
    let pos = w.ctx(AppKind::Pos);
    pos.login(mani.id, pin("9051")).expect("new PIN works");
    assert!(matches!(
        w.office.unlock_user(4242),
        Err(Error::NotFound(_))
    ));
}

#[test]
fn nothing_sent_to_the_ui_carries_a_hash() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    let shown = format!(
        "{:?} {:?} {:?}",
        w.office.list_users().expect("u"),
        w.office.list_login_users().expect("l"),
        w.office.current_session().expect("s"),
    );
    assert!(!shown.contains("argon2"));
    assert!(!shown.to_lowercase().contains("pin_hash"));
}

// ---- change pin ----

#[test]
fn change_pin_rules() {
    let w = world();
    set_must_change(&w, true);
    let info = w
        .office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login");
    assert!(info.must_change_pin, "created with a temporary PIN");
    let e = w
        .office
        .change_pin(pin(CASHIER_PIN), pin(CASHIER_PIN))
        .expect_err("same");
    assert!(matches!(e, Error::InvalidNewPin(PinError::SameAsCurrent)));
    let e = w
        .office
        .change_pin(pin(CASHIER_PIN), pin("1234"))
        .expect_err("weak");
    assert!(matches!(e, Error::InvalidNewPin(PinError::TooEasy)));
    // A wrong old PIN counts towards the lockout.
    assert_eq!(
        wrong_left(
            w.office
                .change_pin(pin(BAD_PIN), pin("9051"))
                .expect_err("old")
        ),
        4
    );
    let info = w
        .office
        .change_pin(pin(CASHIER_PIN), pin("9051"))
        .expect("change");
    assert!(!info.must_change_pin);
    assert_eq!(w.audit_count(event::PIN_CHANGED), 1);
    let pos = w.ctx(AppKind::Pos);
    assert!(pos.login(w.cashier_id, pin(CASHIER_PIN)).is_err());
    pos.login(w.cashier_id, pin("9051")).expect("new PIN");
}

#[test]
fn owner_pin_must_stay_six_digits() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    let e = w
        .office
        .change_pin(pin(OWNER_PIN), pin("9051"))
        .expect_err("short");
    assert!(matches!(e, Error::InvalidNewPin(PinError::OwnerLength)));
    w.office
        .change_pin(pin(OWNER_PIN), pin("902846"))
        .expect("ok");
}

// ---- setup ----

#[test]
fn setup_owner_rules() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    let pos = ctx_on(&dir.db_path(), AppKind::Pos, &clock, h);
    assert!(matches!(
        pos.setup_owner("Shop", "Selvi", pin(OWNER_PIN)),
        Err(Error::PermissionDenied)
    ));
    assert!(matches!(
        office.setup_owner("Shop", "Selvi", pin("123456")),
        Err(Error::InvalidPin(PinError::TooEasy))
    ));
    assert!(matches!(
        office.setup_owner("Shop", "Selvi", pin("7391")),
        Err(Error::InvalidPin(PinError::OwnerLength))
    ));
    assert!(matches!(
        office.setup_owner("", "Selvi", pin(OWNER_PIN)),
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        office.setup_owner("Shop", &"x".repeat(41), pin(OWNER_PIN)),
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        office.setup_owner("Shop", "Sel\u{7}vi", pin(OWNER_PIN)),
        Err(Error::Validation(_))
    ));
    let st = office.startup_status();
    assert!(!st.users_exist, "failed attempts create nothing");
    let res = office
        .setup_owner("Shop", "செல்வி", pin(OWNER_PIN))
        .expect("setup");
    assert_eq!(res.recovery_code.len(), 19);
    assert_eq!(res.session.role, Role::Owner);
    assert!(office.get_shop_settings().is_ok(), "owner is signed in");
    assert!(matches!(
        office.setup_owner("Other", "Other", pin(OWNER_PIN)),
        Err(Error::AlreadySetup)
    ));
    let st = office.startup_status();
    assert!(st.users_exist && !st.setup_complete);
    assert_eq!(st.shop_name.as_deref(), Some("Shop"));
}

#[test]
fn two_racing_setups_make_exactly_one_owner() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let a = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    let b = ctx_on(&dir.db_path(), AppKind::Office, &clock, h);
    let results = std::thread::scope(|s| {
        let ha = s.spawn(|| a.setup_owner("Shop A", "Alpha", pin(OWNER_PIN)).map(|_| ()));
        let hb = s.spawn(|| b.setup_owner("Shop B", "Beta", pin(OWNER_PIN)).map(|_| ()));
        vec![ha.join().expect("a"), hb.join().expect("b")]
    });
    let ok = results.iter().filter(|r| r.is_ok()).count();
    let already = results
        .iter()
        .filter(|r| matches!(r, Err(Error::AlreadySetup)))
        .count();
    assert_eq!((ok, already), (1, 1));
    let conn = Connection::open(dir.db_path()).expect("open");
    let users: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .expect("count");
    assert_eq!(users, 1);
}

// ---- recovery ----

#[test]
fn owner_recovery_with_code() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    let pos = ctx_on(&dir.db_path(), AppKind::Pos, &clock, h);
    let res = office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let id = res.session.user_id;
    office.logout().expect("logout");

    assert!(matches!(
        pos.recover_owner_pin(&res.recovery_code, pin("902846")),
        Err(Error::PermissionDenied)
    ));
    assert!(matches!(
        office.recover_owner_pin(&res.recovery_code, pin("1234")),
        Err(Error::InvalidNewPin(_))
    ));
    match office.recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846")) {
        Err(Error::WrongRecoveryCode {
            attempts_before_lock,
        }) => assert_eq!(attempts_before_lock, 4),
        other => panic!("{other:?}"),
    }
    // Typed in lower case with spaces, as a person would copy it.
    let typed = res.recovery_code.to_lowercase().replace('-', " ");
    let fresh = office
        .recover_owner_pin(&typed, pin("902846"))
        .expect("recover");
    assert_ne!(fresh.recovery_code, res.recovery_code);
    office.login(id, pin("902846")).expect("new PIN works");
    assert!(office.login(id, pin(OWNER_PIN)).is_err(), "old PIN is gone");
    // The used code is dead, the new one works.
    assert!(office
        .recover_owner_pin(&res.recovery_code, pin("864209"))
        .is_err());
    office
        .recover_owner_pin(&fresh.recovery_code, pin("864209"))
        .expect("new code");
}

#[test]
fn wrong_recovery_codes_lock_the_owner() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let office = ctx_on(
        &dir.db_path(),
        AppKind::Office,
        &clock,
        CountingHasher::cheap(),
    );
    let res = office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    for _ in 0..4 {
        assert!(matches!(
            office.recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846")),
            Err(Error::WrongRecoveryCode { .. })
        ));
    }
    assert!(matches!(
        office.recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846")),
        Err(Error::Locked { seconds_left: 30 })
    ));
    assert!(matches!(
        office.recover_owner_pin(&res.recovery_code, pin("902846")),
        Err(Error::Locked { .. })
    ));
    // The same lockout blocks a normal login for that owner.
    assert!(matches!(
        office.login(res.session.user_id, pin(OWNER_PIN)),
        Err(Error::Locked { .. })
    ));
}

// ---- settings ----

#[test]
fn settings_save_is_owner_only_validated_and_audited_with_old_and_new() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    let before = w.audit_count(event::SETTINGS_CHANGED);
    // Saving identical values writes nothing.
    w.office.save_shop_settings(&shop()).expect("same");
    assert_eq!(w.audit_count(event::SETTINGS_CHANGED), before);

    let mut s = shop();
    s.phone = "+91 90000-11111".into();
    s.gstin = "27aapfu0939f1zv".into();
    s.bill_footer = "Thank you, வணக்கம்".into();
    let saved = w.office.save_shop_settings(&s).expect("save");
    assert_eq!(saved.phone, "9000011111");
    assert_eq!(saved.gstin, "27AAPFU0939F1ZV");
    assert_eq!(w.audit_count(event::SETTINGS_CHANGED), before + 3);
    let detail: String = Connection::open(w.path())
        .expect("open")
        .query_row(
            "SELECT detail_json FROM audit_log WHERE action = 'settings_changed'
             AND detail_json LIKE '%shop_phone%' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .expect("row");
    assert_eq!(
        detail,
        r#"{"app":"office","key":"shop_phone","old":"9876543210","new":"9000011111"}"#
    );
    assert_eq!(w.office.get_shop_settings().expect("get"), saved);

    // A bad form changes nothing and lists every wrong field.
    let mut bad = saved.clone();
    bad.shop_name = String::new();
    bad.phone = "12".into();
    bad.gstin = "27AAPFU0939F1ZX".into();
    match w.office.save_shop_settings(&bad) {
        Err(Error::Validation(f)) => {
            let names: Vec<_> = f.iter().map(|e| e.field.as_str()).collect();
            assert_eq!(names, ["shopName", "phone", "gstin"]);
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(w.office.get_shop_settings().expect("get"), saved);
}

// ---- audit ----

#[test]
fn every_audit_event_is_written_and_never_holds_a_secret() {
    let w = world();
    let (o, c) = (w.owner_id, w.cashier_id);
    let mut secrets: Vec<String> = [OWNER_PIN, CASHIER_PIN, BAD_PIN, "9051", "902846", "7249"]
        .iter()
        .map(|s| format!("\"{s}\""))
        .collect();

    // lockout events, clock anomaly
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    let t0 = w.clock.unix();
    w.clock.set_unix(t0 - 100);
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    w.clock.set_unix(t0 + 40);

    // admin events
    w.office.login(o, pin(OWNER_PIN)).expect("owner");
    let tmp = w.office.create_user("Temp", pin("7249")).expect("tmp");
    w.office.reset_pin(tmp.id, pin("9051")).expect("reset");
    w.office.unlock_user(c).expect("unlock");
    w.office.deactivate_user(tmp.id).expect("deactivate");
    let now = w.clock.unix();
    w.office
        .with_db(|db| auth::set_user_role(db, o, c, Role::Owner, now, AppKind::Office))
        .expect("role");
    w.office
        .change_pin(pin(OWNER_PIN), pin("902846"))
        .expect("change");
    w.office.lock_session().expect("lock");

    // permission denied
    let cashier_office = w.ctx(AppKind::Office);
    w.office
        .with_db(|db| auth::set_user_role(db, o, c, Role::Cashier, now, AppKind::Office))
        .expect("demote");
    cashier_office.login(c, pin(CASHIER_PIN)).expect("cashier");
    assert!(cashier_office.open_screen("users").is_err());

    // idle events
    w.clock.advance(601);
    assert!(cashier_office.heartbeat().is_err());
    w.office
        .with_db(|db| settings::set_raw(db.conn(), settings::KEY_IDLE_POS, "60"))
        .expect("idle");
    let pos = w.ctx(AppKind::Pos);
    pos.login(c, pin(CASHIER_PIN)).expect("pos");
    w.clock.advance(61);
    assert!(pos.heartbeat().is_err());

    // recovery
    let dir = TempDir::new();
    let rec = ctx_on(
        &dir.db_path(),
        AppKind::Office,
        &w.clock,
        CountingHasher::cheap(),
    );
    let res = rec
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let fresh = rec
        .recover_owner_pin(&res.recovery_code, pin("902846"))
        .expect("recover");
    for code in [&res.recovery_code, &fresh.recovery_code] {
        secrets.push(format!("\"{code}\""));
        secrets.push(format!("\"{}\"", crate::recovery::normalize(code)));
    }

    let all = [
        event::SETUP_OWNER,
        event::LOGIN_OK,
        event::LOGIN_FAILED,
        event::LOGIN_LOCKED,
        event::LOGIN_BLOCKED_LOCKED,
        event::LOGOUT,
        event::SESSION_IDLE_LOCK,
        event::SESSION_IDLE_LOGOUT,
        event::PIN_CHANGED,
        event::PIN_RESET,
        event::USER_UNLOCKED,
        event::USER_CREATED,
        event::USER_DEACTIVATED,
        event::USER_ROLE_CHANGED,
        event::SETTINGS_CHANGED,
        event::PERMISSION_DENIED,
        event::CLOCK_ANOMALY,
        event::OWNER_RECOVERY_USED,
        event::SESSION_LOCK,
    ];
    for name in all {
        assert!(
            w.audit_count(name) + count_in(&dir, name) >= 1,
            "no audit row for {name}"
        );
    }
    assert_eq!(w.audit_count(event::CLOCK_ANOMALY), 1);
    assert_eq!(w.audit_count(event::LOGIN_BLOCKED_LOCKED), 1);
    assert_eq!(w.audit_count(event::LOGIN_LOCKED), 1);
    assert_eq!(w.audit_count(event::SETUP_OWNER), 1);

    for path in [w.path(), dir.db_path()] {
        let conn = Connection::open(path).expect("open");
        let mut st = conn
            .prepare("SELECT action, detail_json FROM audit_log")
            .expect("prep");
        let rows = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .expect("rows");
        for row in rows {
            let (action, detail) = row.expect("row");
            assert!(
                detail.contains("\"app\":\""),
                "{action} has no app: {detail}"
            );
            assert!(!detail.contains("argon2"), "{action}: {detail}");
            for s in &secrets {
                assert!(
                    !detail.contains(s.as_str()),
                    "{action} leaks a secret: {detail}"
                );
            }
        }
    }
}

fn count_in(dir: &TempDir, action: &str) -> i64 {
    Connection::open(dir.db_path())
        .expect("open")
        .query_row(
            "SELECT COUNT(*) FROM audit_log WHERE action = ?1",
            [action],
            |r| r.get(0),
        )
        .expect("count")
}

// ---- migration 002 and triggers ----

fn db_at_v1() -> Connection {
    let conn = Connection::open_in_memory().expect("mem");
    conn.pragma_update(None, "foreign_keys", "ON").expect("fk");
    conn.execute_batch(migrations::MIGRATIONS[0].1)
        .expect("001");
    conn.execute_batch(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
         INSERT INTO schema_version (version) VALUES (1);",
    )
    .expect("version");
    conn
}

#[test]
fn migration_002_upgrades_a_populated_001_database() {
    let mut conn = db_at_v1();
    conn.execute(
        "INSERT INTO users (name, role, pin_hash) VALUES ('Selvi', 'owner', 'h1')",
        [],
    )
    .expect("user");
    conn.execute(
        "INSERT INTO audit_log (user_id, action) VALUES (1, 'old_row')",
        [],
    )
    .expect("audit");
    assert_eq!(migrations::migrate(&mut conn).expect("migrate"), 2);
    let (failed, locked, last, must, login): (i64, i64, i64, i64, Option<String>) = conn
        .query_row(
            "SELECT failed_attempts, locked_until, last_failed_at, must_change_pin, last_login_at
             FROM users WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .expect("row");
    assert_eq!((failed, locked, last, must, login), (0, 0, 0, 0, None));
    let kept: i64 = conn
        .query_row("SELECT COUNT(*) FROM audit_log", [], |r| r.get(0))
        .expect("count");
    assert_eq!(kept, 1);
    assert_eq!(migrations::migrate(&mut conn).expect("again"), 2);
}

#[test]
fn migration_002_on_empty_and_reopen_is_a_noop() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    assert_eq!(db.schema_version().expect("v"), 2);
    drop(db);
    let db = Db::open(&dir.db_path()).expect("reopen");
    let rows: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
        .expect("count");
    assert_eq!(rows, 2);
}

fn err_text(r: rusqlite::Result<usize>) -> String {
    r.expect_err("must be refused").to_string()
}

#[test]
fn audit_log_is_append_only() {
    let db = Db::open_in_memory().expect("db");
    let c = db.conn();
    c.execute("INSERT INTO audit_log (action) VALUES ('x')", [])
        .expect("insert");
    assert!(err_text(c.execute("UPDATE audit_log SET action = 'y'", [])).contains("append-only"));
    assert!(err_text(c.execute("DELETE FROM audit_log", [])).contains("append-only"));
}

#[test]
fn user_protection_triggers() {
    let db = Db::open_in_memory().expect("db");
    let c = db.conn();
    assert!(err_text(c.execute(
        "INSERT INTO users (name, role, pin_hash) VALUES ('Ravi', 'cashier', 'h')",
        []
    ))
    .contains("first user must be an owner"));
    c.execute(
        "INSERT INTO users (name, role, pin_hash) VALUES ('Selvi', 'owner', 'h')",
        [],
    )
    .expect("owner");
    c.execute(
        "INSERT INTO users (name, role, pin_hash) VALUES ('Ravi', 'cashier', 'h')",
        [],
    )
    .expect("cashier");
    assert!(
        err_text(c.execute("DELETE FROM users WHERE name = 'Ravi'", [])).contains("deactivate")
    );
    assert!(
        err_text(c.execute("UPDATE users SET active = 0 WHERE name = 'Selvi'", []))
            .contains("at least one active owner")
    );
    assert!(
        err_text(c.execute("UPDATE users SET role = 'cashier' WHERE name = 'Selvi'", []))
            .contains("at least one active owner")
    );
    // With a second owner, the first can be demoted.
    c.execute("UPDATE users SET role = 'owner' WHERE name = 'Ravi'", [])
        .expect("promote");
    c.execute("UPDATE users SET role = 'cashier' WHERE name = 'Selvi'", [])
        .expect("demote");
    assert!(
        err_text(c.execute("UPDATE users SET active = 0 WHERE name = 'Ravi'", []))
            .contains("at least one active owner")
    );
}

// ---- API shape ----

#[test]
fn errors_map_to_the_closed_code_set_and_camel_case_json() {
    let cases: Vec<(Error, &str)> = vec![
        (Error::NotLoggedIn, "NOT_LOGGED_IN"),
        (Error::SessionExpired, "SESSION_EXPIRED"),
        (Error::PermissionDenied, "PERMISSION_DENIED"),
        (Error::PinChangeRequired, "PIN_CHANGE_REQUIRED"),
        (
            Error::WrongPin {
                attempts_before_lock: 3,
            },
            "WRONG_PIN",
        ),
        (
            Error::WrongRecoveryCode {
                attempts_before_lock: 3,
            },
            "WRONG_PIN",
        ),
        (Error::Locked { seconds_left: 30 }, "LOCKED"),
        (Error::InvalidPin(PinError::TooEasy), "PIN_INVALID"),
        (Error::AlreadySetup, "ALREADY_SETUP"),
        (Error::ShopNotSetUp, "SHOP_NOT_SET_UP"),
        (Error::Validation(vec![]), "VALIDATION"),
        (Error::NotFound("User"), "NOT_FOUND"),
        (Error::UserUnavailable, "NOT_FOUND"),
        (Error::DatabaseNewerThanApp { db: 9, app: 2 }, "DB_NEWER"),
        (Error::Internal("x".into()), "INTERNAL"),
        (Error::NoDataDir, "INTERNAL"),
    ];
    for (e, code) in cases {
        let v = serde_json::to_value(AppError::from(&e)).expect("json");
        assert_eq!(v["code"], code, "{e:?}");
        assert!(v["message"].as_str().is_some_and(|m| !m.is_empty()));
    }
    let v = serde_json::to_value(AppError::from(Error::Locked { seconds_left: 42 })).expect("j");
    assert_eq!(v["secondsLeft"], 42);
    let v = serde_json::to_value(AppError::from(Error::WrongPin {
        attempts_before_lock: 2,
    }))
    .expect("j");
    assert_eq!(v["attemptsBeforeLock"], 2);
    assert!(v.get("secondsLeft").is_none());
    let v =
        serde_json::to_value(AppError::from(Error::InvalidNewPin(PinError::TooEasy))).expect("j");
    assert_eq!(v["fields"][0]["field"], "newPin");
}

#[test]
fn session_and_user_json_shapes_match_the_contract() {
    let w = world();
    let info = w
        .office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login");
    let v = serde_json::to_value(&info).expect("json");
    assert_eq!(v["userId"], w.cashier_id);
    assert_eq!(v["role"], "cashier");
    assert_eq!(v["mustChangePin"], false);
    assert_eq!(v["allowedScreens"][2], "stock");
    let st = serde_json::to_value(w.office.startup_status()).expect("json");
    assert_eq!(st["db"], "ok");
    assert_eq!(st["setupComplete"], true);
    assert_eq!(st["usersExist"], true);
    assert_eq!(st["shopName"], "Gokul Oils");
    assert!(st["dbMessage"].is_null());
    let bar = serde_json::to_value(w.office.get_status_bar().expect("bar")).expect("json");
    assert_eq!(bar["userName"], "Ravi");
    assert!(bar["lastBackupAt"].is_null());
}

// ---- start-up states ----

#[test]
fn newer_database_is_reported_and_left_untouched() {
    let dir = TempDir::new();
    {
        let db = Db::open(&dir.db_path()).expect("open");
        db.conn()
            .execute("INSERT INTO schema_version (version) VALUES (99)", [])
            .expect("future");
    }
    let before = std::fs::read(dir.db_path()).expect("read");
    let ctx = AppContext::new(
        AppKind::Pos,
        Some(dir.db_path()),
        None,
        CountingHasher::cheap(),
        FakeClock::new(),
    );
    let st = ctx.startup_status();
    assert_eq!(st.db, crate::app::DbState::NewerThanApp);
    assert!(st.db_message.is_some_and(|m| m.contains("newer version")));
    // Retry works the same way and still changes nothing.
    ctx.startup_status();
    drop(ctx);
    let after = std::fs::read(dir.db_path()).expect("read");
    assert_eq!(before.len(), after.len());
    assert_eq!(before, after, "the data file must not be changed");
}

#[test]
fn unopenable_database_is_an_error_state_and_recovers_on_retry() {
    let ctx = AppContext::new(
        AppKind::Pos,
        None,
        None,
        CountingHasher::cheap(),
        FakeClock::new(),
    );
    assert_eq!(ctx.startup_status().db, crate::app::DbState::Error);
    assert!(matches!(ctx.list_login_users(), Err(Error::Internal(_))));

    let dir = TempDir::new();
    let ctx = AppContext::new(
        AppKind::Pos,
        Some(dir.db_path()),
        None,
        CountingHasher::cheap(),
        FakeClock::new(),
    );
    assert_eq!(ctx.startup_status().db, crate::app::DbState::Ok);
    assert!(ctx.list_login_users().expect("list").is_empty());
}

// ---- speed ----

#[test]
fn locked_and_unavailable_answers_are_fast() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    let start = Instant::now();
    for _ in 0..10 {
        assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    }
    let each = start.elapsed() / 10;
    assert!(each.as_millis() < 20, "locked answer took {each:?}");
}

/// Real cost check. Run on the shop PC (or low-end settings) in release:
/// `cargo test --release -p gokul-core real_argon2_timing -- --ignored --nocapture`
#[test]
#[ignore]
fn real_argon2_timing() {
    let h = Argon2Hasher::new();
    let phc = h.hash("739158").expect("hash");
    let runs = 10;
    let start = Instant::now();
    for _ in 0..runs {
        assert!(h.verify("739158", &phc));
    }
    let verify = start.elapsed() / runs;
    println!("argon2id verify (m=19456 KiB, t=3, p=1): {verify:?} average of {runs}");

    let dir = TempDir::new();
    let clock = FakeClock::new();
    let hasher: Arc<dyn PinHasher> = Arc::new(Argon2Hasher::new());
    let ctx = ctx_on(&dir.db_path(), AppKind::Office, &clock, hasher);
    let res = ctx
        .setup_owner("Shop", "Selvi", pin("739158"))
        .expect("setup");
    ctx.logout().expect("logout");
    let start = Instant::now();
    ctx.login(res.session.user_id, pin("739158"))
        .expect("login");
    println!(
        "full login (verify + database writes): {:?}",
        start.elapsed()
    );
}

fn set_must_change(w: &World, on: bool) {
    let id = w.cashier_id;
    w.office
        .with_db(|db| {
            db.conn().execute(
                "UPDATE users SET must_change_pin = ?2 WHERE id = ?1",
                rusqlite::params![id, i64::from(on)],
            )?;
            Ok(())
        })
        .expect("flag");
}

#[test]
fn pending_pin_change_blocks_everything_except_change_logout_lock_heartbeat() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    let row = w
        .office
        .reset_pin(w.cashier_id, pin("9051"))
        .expect("reset");
    assert!(row.must_change_pin);
    w.office.logout().expect("logout");

    let pos = w.ctx(AppKind::Pos);
    let info = pos.login(w.cashier_id, pin("9051")).expect("login works");
    assert!(info.must_change_pin);
    let blocked = pos.get_shop_settings().expect_err("blocked");
    assert!(matches!(blocked, Error::PinChangeRequired));
    assert_eq!(
        blocked.user_message(),
        "Please set a new PIN before continuing."
    );
    let v = serde_json::to_value(AppError::from(&blocked)).expect("json");
    assert_eq!(v["code"], "PIN_CHANGE_REQUIRED");

    let office = w.ctx(AppKind::Office);
    office.login(w.cashier_id, pin("9051")).expect("login");
    assert!(matches!(
        office.open_screen("items"),
        Err(Error::PinChangeRequired)
    ));
    assert!(matches!(office.list_users(), Err(Error::PinChangeRequired)));

    // The allowed set still works.
    pos.heartbeat().expect("heartbeat");
    let cur = pos.current_session().expect("cur").expect("some");
    assert!(cur.must_change_pin);
    assert!(pos.get_status_bar().is_ok());
    // A weak new PIN keeps the flag.
    assert!(pos.change_pin(pin("9051"), pin("1234")).is_err());
    assert!(matches!(
        pos.get_shop_settings(),
        Err(Error::PinChangeRequired)
    ));

    let info = pos.change_pin(pin("9051"), pin("7249")).expect("change");
    assert!(!info.must_change_pin);
    assert!(pos.get_shop_settings().is_ok());

    // lock_session and logout also work while the change is pending.
    set_must_change(&w, true);
    office.lock_session().expect("lock while pending");
    office
        .login(w.cashier_id, pin("9051"))
        .expect_err("old PIN gone");
    office.login(w.cashier_id, pin("7249")).expect("login");
    office.heartbeat().expect("heartbeat while pending");
    office.logout().expect("logout while pending");
}

#[test]
fn database_held_by_another_writer_is_reported_as_busy() {
    let w = world();
    let pos = w.ctx(AppKind::Pos);
    pos.with_db(|db| {
        db.conn()
            .busy_timeout(std::time::Duration::from_millis(50))?;
        Ok(())
    })
    .expect("timeout");
    let holder = Connection::open(w.path()).expect("holder");
    holder
        .execute_batch("BEGIN IMMEDIATE")
        .expect("hold the write lock");
    let e = pos
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect_err("cannot write");
    assert!(e.is_busy(), "{e:?}");
    let v = serde_json::to_value(AppError::from(&e)).expect("json");
    assert_eq!(v["code"], "DB_BUSY");
    holder.execute_batch("ROLLBACK").expect("release");
    // Nothing was lost: the lock is gone and the login now works.
    pos.login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login after release");
}

mod fix_tests;
