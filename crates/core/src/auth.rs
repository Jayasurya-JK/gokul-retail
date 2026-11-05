//! Users, lockout and account administration (spec 00 step 3, sections B, C and E).
//!
//! The lockout state lives in the `users` table so both apps share it and a restart cannot
//! reset it. Hashing is never done here: callers hash outside any database lock and pass
//! the finished hash in, so write transactions stay short.

use crate::audit::{self, event, AppKind, Detail};
use crate::error::{Error, FieldError, Result};
use crate::settings::{self, clean_name};
use crate::Db;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Owner,
    Cashier,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Cashier => "cashier",
        }
    }

    pub fn parse(s: &str) -> Option<Role> {
        match s {
            "owner" => Some(Role::Owner),
            "cashier" => Some(Role::Cashier),
            _ => None,
        }
    }
}

/// Failed tries allowed before the first lock.
pub const LOCK_AFTER: u32 = 5;
/// A failure counter older than this counts as zero.
pub const FAIL_AGE_OUT_SECS: i64 = 24 * 60 * 60;
pub const USER_NAME_MAX: usize = 40;

/// Lock length after the n-th failed try in a row (OWNER decision, rule 14).
pub fn lockout_secs(attempts: u32, role: Role) -> i64 {
    match attempts {
        0..=4 => 0,
        5 => 30,
        6 => 120,
        7 => 600,
        _ => match role {
            Role::Cashier => 30 * 60,
            Role::Owner => 5 * 60,
        },
    }
}

/// What kind of secret check an attempt is for (goes into the audit detail only).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Via {
    Login,
    ChangePin,
    Recovery,
}

impl Via {
    fn as_str(self) -> &'static str {
        match self {
            Via::Login => "login",
            Via::ChangePin => "change_pin",
            Via::Recovery => "recovery",
        }
    }
}

/// The user row as needed to check a secret. Never sent to the UI.
#[derive(Clone)]
pub struct UserAuth {
    pub id: i64,
    pub name: String,
    pub role: Role,
    pub pin_hash: String,
    pub must_change_pin: bool,
}

pub enum Begin {
    /// Attempt reserved: check the secret now (outside any lock), then call a finish function.
    Proceed {
        user: UserAuth,
        attempt: u32,
        lock_secs: i64,
    },
    /// Unknown or switched-off user. Spend dummy hash time, then refuse.
    Unavailable,
}

/// Reserve one attempt before hashing (rule 13). One IMMEDIATE transaction: refuse if locked,
/// otherwise count the attempt and apply the ladder lock right away. A correct secret then
/// clears it. This way parallel guesses cannot beat the lock.
pub fn begin_attempt(db: &mut Db, user_id: i64, now: i64, app: AppKind, via: Via) -> Result<Begin> {
    let tx = db.transaction()?;
    let row = tx
        .query_row(
            "SELECT name, role, pin_hash, active, failed_attempts, locked_until,
                    last_failed_at, must_change_pin
             FROM users WHERE id = ?1",
            [user_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, i64>(7)?,
                ))
            },
        )
        .optional()?;
    let Some((name, role, pin_hash, active, failed, locked_until, last_failed_at, must_change)) =
        row
    else {
        return Ok(Begin::Unavailable);
    };
    let role = Role::parse(&role).ok_or_else(|| Error::Internal("unknown role".to_string()))?;
    if active != 1 {
        return Ok(Begin::Unavailable);
    }

    let mut n = u32::try_from(failed).unwrap_or(0);
    if last_failed_at > 0 && now >= last_failed_at && now - last_failed_at > FAIL_AGE_OUT_SECS {
        n = 0;
    }

    // Clock moved back: stay locked for the full ladder time counted from the last failure.
    if now < last_failed_at {
        let dur = lockout_secs(n, role);
        if dur > 0 {
            if !audit::exists_with_int(
                &tx,
                user_id,
                event::CLOCK_ANOMALY,
                "last_failed_at",
                last_failed_at,
            )? {
                audit::log(
                    &tx,
                    Some(user_id),
                    event::CLOCK_ANOMALY,
                    &Detail::new(app).int("last_failed_at", last_failed_at),
                )?;
            }
            tx.commit()?;
            let left = (last_failed_at + dur - now).min(FAIL_AGE_OUT_SECS);
            return Err(Error::Locked { seconds_left: left });
        }
    }

    if locked_until > now {
        if !audit::exists_with_int(
            &tx,
            user_id,
            event::LOGIN_BLOCKED_LOCKED,
            "locked_until",
            locked_until,
        )? {
            audit::log(
                &tx,
                Some(user_id),
                event::LOGIN_BLOCKED_LOCKED,
                &Detail::new(app)
                    .int("locked_until", locked_until)
                    .str("via", via.as_str()),
            )?;
        }
        tx.commit()?;
        return Err(Error::Locked {
            seconds_left: locked_until - now,
        });
    }

    n += 1;
    let lock_secs = lockout_secs(n, role);
    let new_locked_until = if lock_secs > 0 { now + lock_secs } else { 0 };
    tx.execute(
        "UPDATE users SET failed_attempts = ?1, locked_until = ?2, last_failed_at = ?3
         WHERE id = ?4",
        params![i64::from(n), new_locked_until, now, user_id],
    )?;
    tx.commit()?;
    Ok(Begin::Proceed {
        user: UserAuth {
            id: user_id,
            name,
            role,
            pin_hash,
            must_change_pin: must_change == 1,
        },
        attempt: n,
        lock_secs,
    })
}

/// Record a wrong secret (audit only; the counter was already advanced) and return the
/// error to show.
pub fn finish_failure(
    db: &mut Db,
    user: &UserAuth,
    attempt: u32,
    lock_secs: i64,
    app: AppKind,
    via: Via,
) -> Result<Error> {
    let tx = db.transaction()?;
    audit::log(
        &tx,
        Some(user.id),
        event::LOGIN_FAILED,
        &Detail::new(app)
            .int("attempt", i64::from(attempt))
            .str("via", via.as_str()),
    )?;
    if lock_secs > 0 {
        audit::log(
            &tx,
            Some(user.id),
            event::LOGIN_LOCKED,
            &Detail::new(app)
                .int("attempt", i64::from(attempt))
                .int("seconds", lock_secs)
                .str("via", via.as_str()),
        )?;
    }
    tx.commit()?;
    let left = LOCK_AFTER.saturating_sub(attempt);
    Ok(if lock_secs > 0 {
        Error::Locked {
            seconds_left: lock_secs,
        }
    } else if via == Via::Recovery {
        Error::WrongRecoveryCode {
            attempts_before_lock: left,
        }
    } else {
        Error::WrongPin {
            attempts_before_lock: left,
        }
    })
}

/// Clear the failure counters after a correct secret. `login` also stamps `last_login_at`.
pub fn reset_attempts(tx: &Transaction, user_id: i64, login: bool) -> Result<()> {
    tx.execute(
        "UPDATE users SET failed_attempts = 0, locked_until = 0, last_failed_at = 0,
            last_login_at = CASE WHEN ?2 = 1 THEN strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')
                                 ELSE last_login_at END
         WHERE id = ?1",
        params![user_id, i64::from(login)],
    )?;
    Ok(())
}

/// Finish a correct login: counters, optional rehash with current parameters, audit.
pub fn finish_login_success(
    db: &mut Db,
    user: &UserAuth,
    new_hash: Option<&str>,
    app: AppKind,
) -> Result<()> {
    let tx = db.transaction()?;
    reset_attempts(&tx, user.id, true)?;
    if let Some(h) = new_hash {
        tx.execute(
            "UPDATE users SET pin_hash = ?1 WHERE id = ?2 AND pin_hash = ?3",
            params![h, user.id, user.pin_hash],
        )?;
    }
    audit::log(&tx, Some(user.id), event::LOGIN_OK, &Detail::new(app))?;
    tx.commit()?;
    Ok(())
}

// ---- reading users ----

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoginUser {
    pub id: i64,
    pub name: String,
}

/// Active users, name only (login screen list).
pub fn list_login_users(conn: &Connection) -> Result<Vec<LoginUser>> {
    let mut st = conn.prepare("SELECT id, name FROM users WHERE active = 1 ORDER BY name")?;
    let rows = st.query_map([], |r| {
        Ok(LoginUser {
            id: r.get(0)?,
            name: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

/// For the owner's Users screen. No hash is ever included.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: i64,
    pub name: String,
    pub role: Role,
    pub active: bool,
    pub locked_seconds_left: i64,
    pub must_change_pin: bool,
    pub last_login_at: Option<String>,
}

const USER_ROW_SQL: &str =
    "SELECT id, name, role, active, locked_until, must_change_pin, last_login_at FROM users";

fn map_user_row(r: &rusqlite::Row, now: i64) -> rusqlite::Result<UserRow> {
    let role: String = r.get(2)?;
    let locked_until: i64 = r.get(4)?;
    Ok(UserRow {
        id: r.get(0)?,
        name: r.get(1)?,
        role: Role::parse(&role).unwrap_or(Role::Cashier),
        active: r.get::<_, i64>(3)? == 1,
        locked_seconds_left: (locked_until - now).max(0),
        must_change_pin: r.get::<_, i64>(5)? == 1,
        last_login_at: r.get(6)?,
    })
}

pub fn list_users(conn: &Connection, now: i64) -> Result<Vec<UserRow>> {
    let mut st = conn.prepare(&format!("{USER_ROW_SQL} ORDER BY active DESC, name"))?;
    let rows = st.query_map([], |r| map_user_row(r, now))?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn user_row(conn: &Connection, id: i64, now: i64) -> Result<UserRow> {
    conn.query_row(&format!("{USER_ROW_SQL} WHERE id = ?1"), [id], |r| {
        map_user_row(r, now)
    })
    .optional()?
    .ok_or(Error::NotFound("User"))
}

pub fn first_active_owner(conn: &Connection) -> Result<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT id FROM users WHERE role = 'owner' AND active = 1 ORDER BY id LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn any_users(conn: &Connection) -> Result<bool> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    Ok(n > 0)
}

// ---- writing users (callers pass finished hashes) ----

fn name_error(field: &str, label: &str) -> Error {
    Error::Validation(vec![FieldError::new(
        field,
        format!("Enter {label} (1 to {USER_NAME_MAX} characters)."),
    )])
}

/// Trim and check a person's name (any script, no control characters).
pub fn clean_user_name(raw: &str) -> Result<String> {
    clean_name(raw, USER_NAME_MAX).map_err(|_| name_error("name", "a name"))
}

/// First run. Creates the owner, marks the shop set up and stores the recovery hash,
/// all in one transaction. Fails with `AlreadySetup` if any user exists.
pub fn setup_owner(
    db: &mut Db,
    owner_name: &str,
    shop_name: &str,
    pin_hash: &str,
    recovery_hash: &str,
    app: AppKind,
) -> Result<UserAuth> {
    let tx = db.transaction()?;
    if any_users(&tx)? {
        return Err(Error::AlreadySetup);
    }
    tx.execute(
        "INSERT INTO users (name, role, pin_hash, last_login_at)
         VALUES (?1, 'owner', ?2, strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))",
        params![owner_name, pin_hash],
    )?;
    let id = tx.last_insert_rowid();
    settings::set_raw(&tx, settings::KEY_SETUP_COMPLETE, "1")?;
    settings::set_raw(&tx, settings::KEY_SHOP_NAME, shop_name)?;
    settings::set_raw(&tx, settings::KEY_OWNER_RECOVERY_HASH, recovery_hash)?;
    audit::log(&tx, Some(id), event::SETUP_OWNER, &Detail::new(app))?;
    audit::log(&tx, Some(id), event::LOGIN_OK, &Detail::new(app))?;
    tx.commit()?;
    Ok(UserAuth {
        id,
        name: owner_name.to_string(),
        role: Role::Owner,
        pin_hash: pin_hash.to_string(),
        must_change_pin: false,
    })
}

/// Add a cashier. The PIN is temporary: the cashier must change it after the first login.
pub fn create_cashier(
    db: &mut Db,
    actor_id: i64,
    name: &str,
    pin_hash: &str,
    now: i64,
    app: AppKind,
) -> Result<UserRow> {
    let tx = db.transaction()?;
    let taken: i64 = tx.query_row("SELECT COUNT(*) FROM users WHERE name = ?1", [name], |r| {
        r.get(0)
    })?;
    if taken > 0 {
        return Err(Error::Validation(vec![FieldError::new(
            "name",
            "A user with this name already exists.",
        )]));
    }
    tx.execute(
        "INSERT INTO users (name, role, pin_hash, must_change_pin) VALUES (?1, 'cashier', ?2, 1)",
        params![name, pin_hash],
    )?;
    let id = tx.last_insert_rowid();
    audit::log(
        &tx,
        Some(actor_id),
        event::USER_CREATED,
        &Detail::new(app)
            .int("target_user_id", id)
            .str("role", "cashier"),
    )?;
    let row = user_row(&tx, id, now)?;
    tx.commit()?;
    Ok(row)
}

/// Owner sets a cashier's PIN. Forces a change at next login and clears any lock.
pub fn reset_pin(
    db: &mut Db,
    actor_id: i64,
    target_id: i64,
    pin_hash: &str,
    now: i64,
    app: AppKind,
) -> Result<UserRow> {
    let tx = db.transaction()?;
    let row = user_row(&tx, target_id, now)?;
    if row.role != Role::Cashier {
        return Err(Error::Validation(vec![FieldError::new(
            "name",
            "Owner PINs are changed by the owner from Change PIN.",
        )]));
    }
    tx.execute(
        "UPDATE users SET pin_hash = ?1, must_change_pin = 1, failed_attempts = 0,
            locked_until = 0, last_failed_at = 0 WHERE id = ?2",
        params![pin_hash, target_id],
    )?;
    audit::log(
        &tx,
        Some(actor_id),
        event::PIN_RESET,
        &Detail::new(app).int("target_user_id", target_id),
    )?;
    let row = user_row(&tx, target_id, now)?;
    tx.commit()?;
    Ok(row)
}

pub fn unlock_user(
    db: &mut Db,
    actor_id: i64,
    target_id: i64,
    now: i64,
    app: AppKind,
) -> Result<UserRow> {
    let tx = db.transaction()?;
    user_row(&tx, target_id, now)?;
    tx.execute(
        "UPDATE users SET failed_attempts = 0, locked_until = 0, last_failed_at = 0 WHERE id = ?1",
        [target_id],
    )?;
    audit::log(
        &tx,
        Some(actor_id),
        event::USER_UNLOCKED,
        &Detail::new(app).int("target_user_id", target_id),
    )?;
    let row = user_row(&tx, target_id, now)?;
    tx.commit()?;
    Ok(row)
}

pub fn deactivate_user(
    db: &mut Db,
    actor_id: i64,
    target_id: i64,
    now: i64,
    app: AppKind,
) -> Result<UserRow> {
    let tx = db.transaction()?;
    let row = user_row(&tx, target_id, now)?;
    if target_id == actor_id {
        return Err(Error::Validation(vec![FieldError::new(
            "name",
            "You cannot switch off your own account.",
        )]));
    }
    if !row.active {
        return Ok(row);
    }
    if row.role == Role::Owner {
        let others: i64 = tx.query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND active = 1 AND id <> ?1",
            [target_id],
            |r| r.get(0),
        )?;
        if others == 0 {
            return Err(Error::Validation(vec![FieldError::new(
                "name",
                "You cannot switch off the last owner.",
            )]));
        }
    }
    tx.execute("UPDATE users SET active = 0 WHERE id = ?1", [target_id])?;
    audit::log(
        &tx,
        Some(actor_id),
        event::USER_DEACTIVATED,
        &Detail::new(app).int("target_user_id", target_id),
    )?;
    let row = user_row(&tx, target_id, now)?;
    tx.commit()?;
    Ok(row)
}

/// Change a user's role. Not offered in the UI yet (card B-3); the database trigger still
/// keeps at least one active owner.
pub fn set_user_role(
    db: &mut Db,
    actor_id: i64,
    target_id: i64,
    role: Role,
    now: i64,
    app: AppKind,
) -> Result<UserRow> {
    let tx = db.transaction()?;
    let before = user_row(&tx, target_id, now)?;
    if before.role != role {
        tx.execute(
            "UPDATE users SET role = ?1 WHERE id = ?2",
            params![role.as_str(), target_id],
        )
        .map_err(|e| {
            if e.to_string().contains("at least one active owner") {
                Error::Validation(vec![FieldError::new(
                    "name",
                    "There must be at least one active owner.",
                )])
            } else {
                Error::Sqlite(e)
            }
        })?;
        audit::log(
            &tx,
            Some(actor_id),
            event::USER_ROLE_CHANGED,
            &Detail::new(app)
                .int("target_user_id", target_id)
                .str("old", before.role.as_str())
                .str("new", role.as_str()),
        )?;
    }
    let row = user_row(&tx, target_id, now)?;
    tx.commit()?;
    Ok(row)
}

/// Own PIN change after the old PIN was verified. Only succeeds if the stored hash is still
/// the one that was checked.
pub fn set_own_pin(
    db: &mut Db,
    user_id: i64,
    old_hash: &str,
    new_hash: &str,
    app: AppKind,
) -> Result<()> {
    let tx = db.transaction()?;
    let changed = tx.execute(
        "UPDATE users SET pin_hash = ?1, must_change_pin = 0 WHERE id = ?2 AND pin_hash = ?3",
        params![new_hash, user_id, old_hash],
    )?;
    if changed != 1 {
        return Err(Error::NotLoggedIn);
    }
    reset_attempts(&tx, user_id, false)?;
    audit::log(&tx, Some(user_id), event::PIN_CHANGED, &Detail::new(app))?;
    tx.commit()?;
    Ok(())
}

/// Owner PIN recovery after the recovery code was verified: new PIN, new recovery code.
pub fn finish_recovery(
    db: &mut Db,
    owner_id: i64,
    new_pin_hash: &str,
    new_recovery_hash: &str,
    app: AppKind,
) -> Result<()> {
    let tx = db.transaction()?;
    tx.execute(
        "UPDATE users SET pin_hash = ?1, must_change_pin = 0 WHERE id = ?2",
        params![new_pin_hash, owner_id],
    )?;
    reset_attempts(&tx, owner_id, false)?;
    settings::set_raw(&tx, settings::KEY_OWNER_RECOVERY_HASH, new_recovery_hash)?;
    audit::log(
        &tx,
        Some(owner_id),
        event::OWNER_RECOVERY_USED,
        &Detail::new(app),
    )?;
    tx.commit()?;
    Ok(())
}
