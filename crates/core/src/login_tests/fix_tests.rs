//! Tests for the security and QA fix batch after the first review of S0-3.

use super::*;

const YEAR: i64 = 365 * 24 * 3600;

#[test]
fn clock_moved_back_a_year_unlocks_after_the_normal_lock_time() {
    let w = world();
    let c = w.cashier_id;
    for _ in 0..5 {
        bad_login(&w.office, c);
    }
    let t0 = w.clock.unix();
    w.clock.set_unix(t0 - YEAR);
    let e = w.office.login(c, pin(CASHIER_PIN)).expect_err("locked");
    assert_eq!(locked_secs(e), 30, "a normal lock, not a year");
    w.clock.set_unix(t0 - YEAR + 29);
    assert!(w.office.login(c, pin(CASHIER_PIN)).is_err());
    w.clock.set_unix(t0 - YEAR + 31);
    w.office
        .login(c, pin(CASHIER_PIN))
        .expect("unlocked after the lock time");
    assert_eq!(w.audit_count(event::CLOCK_ANOMALY), 1);
}

#[test]
fn owner_recovery_also_recovers_from_a_clock_moved_back() {
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
    for _ in 0..5 {
        let _ = office.recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846"));
    }
    let t0 = clock.unix();
    clock.set_unix(t0 - YEAR);
    let e = office
        .recover_owner_pin(&res.recovery_code, pin("902846"))
        .expect_err("locked");
    assert_eq!(locked_secs(e), 30);
    clock.set_unix(t0 - YEAR + 31);
    office
        .recover_owner_pin(&res.recovery_code, pin("902846"))
        .expect("works after the lock time");
}

#[test]
fn two_people_using_the_same_recovery_code_at_once_only_one_wins() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let a = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    let b = ctx_on(&dir.db_path(), AppKind::Office, &clock, h);
    let res = a
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let id = res.session.user_id;
    let code = res.recovery_code.clone();
    let results = std::thread::scope(|s| {
        let ha = s.spawn(|| a.recover_owner_pin(&code, pin("902846")).map(|_| ()));
        let hb = s.spawn(|| b.recover_owner_pin(&code, pin("864209")).map(|_| ()));
        vec![ha.join().expect("a"), hb.join().expect("b")]
    });
    let ok = results.iter().filter(|r| r.is_ok()).count();
    let wrong = results
        .iter()
        .filter(|r| matches!(r, Err(Error::WrongRecoveryCode { .. })))
        .count();
    assert_eq!((ok, wrong), (1, 1), "{results:?}");
    let (winner, loser) = if results[0].is_ok() {
        ("902846", "864209")
    } else {
        ("864209", "902846")
    };
    a.login(id, pin(winner)).expect("winner's PIN works");
    assert!(a.login(id, pin(loser)).is_err(), "loser's PIN was not set");
}

#[test]
fn oversized_recovery_codes_are_wrong_tries_without_hashing() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let before = h.count();
    match office.recover_owner_pin(&"A".repeat(40), pin("902846")) {
        Err(Error::WrongRecoveryCode {
            attempts_before_lock,
        }) => assert_eq!(attempts_before_lock, 4, "still counted"),
        other => panic!("{other:?}"),
    }
    assert_eq!(h.count(), before, "no hashing for an impossible code");
}

#[test]
fn recovery_results_hide_the_code_in_debug_output() {
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
    let shown = format!("{res:?}");
    assert!(!shown.contains(&res.recovery_code));
    assert!(shown.contains("***"));
    let fresh = office
        .recover_owner_pin(&res.recovery_code, pin("902846"))
        .expect("recover");
    assert!(!format!("{fresh:?}").contains(&fresh.recovery_code));
}

#[test]
fn invisible_and_control_characters_are_refused_in_names_and_lines() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    for bad in [
        "Ma\u{200B}ni",
        "Mani\u{202E}",
        "\u{FEFF}Mani",
        "Ma\u{2066}ni",
        "Ma\u{200F}ni",
        "Ma\u{7}ni",
    ] {
        assert!(
            matches!(
                w.office.create_user(bad, pin("7249")),
                Err(Error::Validation(_))
            ),
            "{bad:?}"
        );
        let mut s = shop();
        s.address_line1 = bad.to_string();
        assert!(w.office.save_shop_settings(&s).is_err(), "{bad:?}");
    }
    assert!(w.office.create_user("செல்வி", pin("7249")).is_ok());
}

#[test]
fn owner_commands_are_refused_inside_the_pos_app_itself() {
    let w = world();
    let pos = w.ctx(AppKind::Pos);
    pos.login(w.owner_id, pin(OWNER_PIN)).expect("owner on POS");
    assert!(matches!(pos.list_users(), Err(Error::PermissionDenied)));
    assert!(matches!(
        pos.save_shop_settings(&shop()),
        Err(Error::PermissionDenied)
    ));
    assert!(matches!(
        pos.create_user("Mani", pin("7249")),
        Err(Error::PermissionDenied)
    ));
    assert!(matches!(
        pos.open_screen("items"),
        Err(Error::PermissionDenied)
    ));
}

#[test]
fn switched_off_during_the_pin_check_is_refused() {
    let w = world();
    let (c, now) = (w.cashier_id, w.clock.unix());
    let r = w.office.with_db(|db| {
        let begin = auth::begin_attempt(db, c, now, AppKind::Office, auth::Via::Login)?;
        let auth::Begin::Proceed { user, .. } = begin else {
            panic!("expected Proceed");
        };
        db.conn()
            .execute("UPDATE users SET active = 0 WHERE id = ?1", [c])?;
        auth::finish_login_success(db, &user, None, AppKind::Office)
    });
    assert!(matches!(r, Err(Error::NotFound(_))), "{r:?}");
    assert_eq!(w.audit_count(event::LOGIN_OK), 1, "only the setup login");
}

#[test]
fn unknown_user_login_is_logged_without_id_or_name() {
    let w = world();
    let before = w.audit_count(event::LOGIN_FAILED);
    assert!(matches!(
        w.office.login(424242, pin(BAD_PIN)),
        Err(Error::UserUnavailable)
    ));
    assert_eq!(w.audit_count(event::LOGIN_FAILED), before + 1);
    let (uid, detail): (Option<i64>, String) = Connection::open(w.path())
        .expect("open")
        .query_row(
            "SELECT user_id, detail_json FROM audit_log WHERE action = 'login_failed'
             ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("row");
    assert_eq!(uid, None);
    assert_eq!(
        detail,
        format!(
            r#"{{"app":"office","reason":"unavailable","at":{}}}"#,
            w.clock.unix()
        )
    );
}

#[test]
fn office_signs_out_when_the_wall_clock_jumps_but_the_timer_did_not() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    // The PC slept for an hour: the wall clock moved, the monotonic timer did not count it.
    w.clock.set_unix(w.clock.unix() + 3600);
    assert!(w.office.current_session().expect("cur").is_none());
    assert!(matches!(w.office.heartbeat(), Err(Error::SessionExpired)));
    assert_eq!(w.audit_count(event::SESSION_IDLE_LOGOUT), 1);
    assert_eq!(w.audit_count(event::CLOCK_ANOMALY), 1);
}

#[test]
fn small_wall_clock_changes_do_not_sign_anyone_out() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    w.clock.set_unix(w.clock.unix() + 100);
    w.office.heartbeat().expect("still in");
    assert_eq!(w.audit_count(event::CLOCK_ANOMALY), 0);
}

#[test]
fn pin_field_errors_name_the_right_field() {
    let w = world();
    w.office
        .login(w.cashier_id, pin(CASHIER_PIN))
        .expect("login");
    let old_bad = w
        .office
        .change_pin(pin("12"), pin("9051"))
        .expect_err("old");
    let v = serde_json::to_value(AppError::from(&old_bad)).expect("json");
    assert_eq!(v["code"], "PIN_INVALID");
    assert_eq!(v["fields"][0]["field"], "pin");
    let new_bad = w
        .office
        .change_pin(pin(CASHIER_PIN), pin("1234"))
        .expect_err("new");
    let v = serde_json::to_value(AppError::from(&new_bad)).expect("json");
    assert_eq!(v["fields"][0]["field"], "newPin");
    let e = w.office.login(w.cashier_id, pin("12")).expect_err("format");
    let v = serde_json::to_value(AppError::from(&e)).expect("json");
    assert_eq!(v["fields"][0]["field"], "pin");
}

#[test]
fn lock_session_clears_the_session_even_if_the_audit_write_fails() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("login");
    w.office
        .with_db(|db| {
            db.conn().execute_batch(
                "CREATE TEMP TRIGGER no_lock_audit BEFORE INSERT ON audit_log
                 WHEN NEW.action = 'session_lock'
                 BEGIN SELECT RAISE(ABORT, 'audit down'); END;",
            )?;
            Ok(())
        })
        .expect("trigger");
    w.office.lock_session().expect("lock still succeeds");
    assert!(matches!(w.office.heartbeat(), Err(Error::NotLoggedIn)));
    assert_eq!(w.audit_count(event::SESSION_LOCK), 0);
}
