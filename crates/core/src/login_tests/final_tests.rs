//! Tests for the last S0-3 backend batch (contract amendments 2 and low-severity findings).

use super::*;

#[test]
fn login_users_carry_the_role() {
    let w = world();
    let users = w.office.list_login_users().expect("list");
    let roles: Vec<_> = users.iter().map(|u| (u.name.as_str(), u.role)).collect();
    assert_eq!(roles, [("Ravi", Role::Cashier), ("Selvi", Role::Owner)]);
    let v = serde_json::to_value(&users).expect("json");
    assert_eq!(v[1]["role"], "owner");
    assert_eq!(v[0]["role"], "cashier");
    assert!(v[0].get("pinHash").is_none() && v[0].get("pin_hash").is_none());
}

#[test]
fn setup_owner_stamps_last_login() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let office = ctx_on(
        &dir.db_path(),
        AppKind::Office,
        &clock,
        CountingHasher::cheap(),
    );
    office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let rows = office.list_users().expect("users");
    assert_eq!(rows.len(), 1);
    assert!(
        rows[0].last_login_at.is_some(),
        "owner is signed in already"
    );
}

#[test]
fn wrong_recovery_code_reports_tries_then_lock_in_the_ui_shape() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let office = ctx_on(
        &dir.db_path(),
        AppKind::Office,
        &clock,
        CountingHasher::cheap(),
    );
    office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    for left in [4, 3, 2, 1] {
        let e = office
            .recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846"))
            .expect_err("wrong");
        let v = serde_json::to_value(AppError::from(&e)).expect("json");
        assert_eq!(v["code"], "WRONG_PIN");
        assert_eq!(v["attemptsBeforeLock"], left);
    }
    let e = office
        .recover_owner_pin("AAAA-BBBB-CCCC-DDDD", pin("902846"))
        .expect_err("locked");
    let v = serde_json::to_value(AppError::from(&e)).expect("json");
    assert_eq!(v["code"], "LOCKED");
    assert_eq!(v["secondsLeft"], 30);
}

#[test]
fn unavailable_login_rows_are_written_at_most_once_a_minute() {
    let w = world();
    let count = |w: &World| {
        w.count("SELECT COUNT(*) FROM audit_log WHERE action = 'login_failed' AND user_id IS NULL")
    };
    for id in [9001, 9002, 9003] {
        assert!(w.office.login(id, pin(BAD_PIN)).is_err());
    }
    assert_eq!(count(&w), 1);
    w.clock.advance(61);
    assert!(w.office.login(9004, pin(BAD_PIN)).is_err());
    assert_eq!(count(&w), 2);
    // Another app has its own allowance.
    let pos = w.ctx(AppKind::Pos);
    assert!(pos.login(9005, pin(BAD_PIN)).is_err());
    assert_eq!(count(&w), 3);
}

#[test]
fn recovery_input_over_64_bytes_is_a_counted_wrong_try_without_hashing() {
    let dir = TempDir::new();
    let clock = FakeClock::new();
    let h = CountingHasher::cheap();
    let office = ctx_on(&dir.db_path(), AppKind::Office, &clock, h.clone());
    office
        .setup_owner("Shop", "Selvi", pin(OWNER_PIN))
        .expect("setup");
    let before = h.count();
    let huge = format!("{}{}", "ABCD-".repeat(20), "é".repeat(10));
    assert!(huge.len() > 64);
    match office.recover_owner_pin(&huge, pin("902846")) {
        Err(Error::WrongRecoveryCode {
            attempts_before_lock,
        }) => assert_eq!(attempts_before_lock, 4),
        other => panic!("{other:?}"),
    }
    assert_eq!(h.count(), before);
}

#[test]
fn fssai_with_letters_says_digits_only_through_save() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    let mut s = shop();
    s.fssai_no = "ABCDEFGHIJKLMN".into();
    match w.office.save_shop_settings(&s) {
        Err(Error::Validation(f)) => {
            assert_eq!(f[0].field, "fssaiNo");
            assert_eq!(f[0].message, "FSSAI number can have digits only.");
        }
        other => panic!("{other:?}"),
    }
    s.fssai_no = "1234567890123".into();
    match w.office.save_shop_settings(&s) {
        Err(Error::Validation(f)) => {
            assert_eq!(
                f[0].message,
                "FSSAI number must be 14 digits. You typed 13."
            );
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn tamil_joiner_sequences_are_accepted_in_names_and_lines() {
    let w = world();
    w.office.login(w.owner_id, pin(OWNER_PIN)).expect("owner");
    let row = w
        .office
        .create_user("க\u{0BCD}\u{200D}ஷ", pin("7249"))
        .expect("tamil joiner name");
    assert_eq!(row.name, "க\u{0BCD}\u{200D}ஷ");
    assert!(w.office.create_user("\u{200D}க", pin("7249")).is_err());
    assert!(w.office.create_user("க\u{200D} ஷ", pin("7249")).is_err());
}
