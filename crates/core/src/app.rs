//! `AppContext`: the one object each Tauri app manages. It owns the database handle, the
//! session, the hasher and the clock, and offers one method per UI command. The Tauri command
//! functions only call these methods.
//!
//! Locking rules: the database mutex is held only for short reads and writes, never while a
//! PIN is hashed. Lock order is always database first, then session.

use crate::audit::{self, event, AppKind, Detail};
use crate::auth::{self, Begin, Role, UserAuth, UserRow, Via};
use crate::clock::{Clock, SystemClock};
use crate::error::{Error, Result};
use crate::info::AppInfo;
use crate::pin::{check_pin_format, validate_pin, Argon2Hasher, Pin, PinError, PinHasher};
use crate::recovery;
use crate::session::{self, Identity, Screen, Session, SessionInfo};
use crate::settings::{self, ShopSettings};
use crate::{paths, Db};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

/// Lock a mutex, carrying on after a panic elsewhere (the data is still consistent: SQLite
/// rolls back an unfinished transaction when it is dropped).
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DbState {
    Ok,
    NewerThanApp,
    Busy,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub db: DbState,
    pub setup_complete: bool,
    pub users_exist: bool,
    pub shop_name: Option<String>,
    pub db_message: Option<String>,
}

impl StartupStatus {
    fn problem(db: DbState, message: String) -> StartupStatus {
        StartupStatus {
            db,
            setup_complete: false,
            users_exist: false,
            shop_name: None,
            db_message: Some(message),
        }
    }

    fn from_error(e: &Error) -> StartupStatus {
        let message: String = e.to_string().chars().take(300).collect();
        if matches!(e, Error::DatabaseNewerThanApp { .. }) {
            StartupStatus::problem(DbState::NewerThanApp, e.user_message())
        } else if e.is_busy() {
            StartupStatus::problem(DbState::Busy, e.user_message())
        } else {
            StartupStatus::problem(DbState::Error, message)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusBarInfo {
    pub shop_name: String,
    pub user_name: Option<String>,
    /// Filled in by the backup step; None means "never".
    pub last_backup_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupResult {
    pub recovery_code: String,
    pub session: SessionInfo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    pub recovery_code: String,
}

pub struct AppContext {
    kind: AppKind,
    db_path: Option<PathBuf>,
    db: Mutex<Option<Db>>,
    session: Mutex<Option<Session>>,
    hasher: Arc<dyn PinHasher>,
    clock: Arc<dyn Clock>,
}

fn db_closed() -> Error {
    Error::Internal("the data file is not open".to_string())
}

impl AppContext {
    pub fn new(
        kind: AppKind,
        db_path: Option<PathBuf>,
        db: Option<Db>,
        hasher: Arc<dyn PinHasher>,
        clock: Arc<dyn Clock>,
    ) -> AppContext {
        AppContext {
            kind,
            db_path,
            db: Mutex::new(db),
            session: Mutex::new(None),
            hasher,
            clock,
        }
    }

    /// The real thing: default data path, production Argon2 cost, system clock. If the data
    /// file cannot be opened the app still starts; `startup_status` reports the problem.
    pub fn production(kind: AppKind) -> AppContext {
        let path = paths::default_db_path().ok();
        let db = path.as_ref().and_then(|p| Db::open(p).ok());
        AppContext::new(
            kind,
            path,
            db,
            Arc::new(Argon2Hasher::new()),
            Arc::new(SystemClock),
        )
    }

    pub fn kind(&self) -> AppKind {
        self.kind
    }

    // ---- helpers ----

    fn now(&self) -> i64 {
        self.clock.unix_secs()
    }

    /// Short database access with no guard (used only by commands that are exempt on purpose).
    pub(crate) fn with_db<T>(&self, f: impl FnOnce(&mut Db) -> Result<T>) -> Result<T> {
        let mut g = lock(&self.db);
        f(g.as_mut().ok_or_else(db_closed)?)
    }

    fn login_guard<T>(
        &self,
        allow_pending_pin_change: bool,
        f: impl FnOnce(&mut Db, &Identity) -> Result<T>,
    ) -> Result<T> {
        let mut g = lock(&self.db);
        let db = g.as_mut().ok_or_else(db_closed)?;
        let who = {
            let mut s = lock(&self.session);
            session::require_login(
                db.conn(),
                &mut s,
                &*self.clock,
                self.kind,
                allow_pending_pin_change,
            )?
        };
        f(db, &who)
    }

    /// Any signed-in user whose PIN is not waiting to be changed.
    fn as_user<T>(&self, f: impl FnOnce(&mut Db, &Identity) -> Result<T>) -> Result<T> {
        self.login_guard(false, f)
    }

    /// Signed-in user, even while a PIN change is required (change_pin, logout, lock,
    /// heartbeat only).
    fn as_user_pending<T>(&self, f: impl FnOnce(&mut Db, &Identity) -> Result<T>) -> Result<T> {
        self.login_guard(true, f)
    }

    fn as_owner<T>(
        &self,
        command: &str,
        f: impl FnOnce(&mut Db, &Identity) -> Result<T>,
    ) -> Result<T> {
        let mut g = lock(&self.db);
        let db = g.as_mut().ok_or_else(db_closed)?;
        let who = {
            let mut s = lock(&self.session);
            session::require_owner(db.conn(), &mut s, &*self.clock, self.kind, command)?
        };
        f(db, &who)
    }

    fn as_screen<T>(
        &self,
        command: &str,
        screen: Screen,
        f: impl FnOnce(&mut Db, &Identity) -> Result<T>,
    ) -> Result<T> {
        let mut g = lock(&self.db);
        let db = g.as_mut().ok_or_else(db_closed)?;
        let who = {
            let mut s = lock(&self.session);
            session::require_office_screen(
                db.conn(),
                &mut s,
                &*self.clock,
                self.kind,
                command,
                screen,
            )?
        };
        f(db, &who)
    }

    fn start_session(&self, user: &UserAuth) -> SessionInfo {
        let s = Session {
            user_id: user.id,
            role: user.role,
            name: user.name.clone(),
            must_change_pin: user.must_change_pin,
            last_activity_ms: self.clock.mono_ms(),
        };
        let info = s.info(self.kind);
        *lock(&self.session) = Some(s);
        info
    }

    fn require_office(&self) -> Result<()> {
        if self.kind == AppKind::Office {
            Ok(())
        } else {
            Err(Error::PermissionDenied)
        }
    }

    // <commands> (every pub fn in this block is a UI command; see the guard-coverage test)

    pub fn app_info(&self, name: &str, version: &str) -> Result<AppInfo> {
        self.with_db(|db| AppInfo::load(db, name, version))
    }

    /// Start-up checks 2-6 of the shell design. Re-tries opening the data file each call.
    pub fn startup_status(&self) -> StartupStatus {
        let mut g = lock(&self.db);
        if g.is_none() {
            let Some(path) = self.db_path.as_ref() else {
                return StartupStatus::from_error(&Error::NoDataDir);
            };
            match Db::open(path) {
                Ok(db) => *g = Some(db),
                Err(e) => return StartupStatus::from_error(&e),
            }
        }
        let Some(db) = g.as_ref() else {
            return StartupStatus::from_error(&db_closed());
        };
        let read = || -> Result<StartupStatus> {
            let owners: i64 = db.conn().query_row(
                "SELECT COUNT(*) FROM users WHERE role = 'owner' AND active = 1",
                [],
                |r| r.get(0),
            )?;
            let name = settings::get_raw(db.conn(), settings::KEY_SHOP_NAME)?
                .filter(|s| !s.trim().is_empty());
            Ok(StartupStatus {
                db: DbState::Ok,
                setup_complete: settings::is_shop_set_up(db.conn())?,
                users_exist: owners > 0,
                shop_name: name,
                db_message: None,
            })
        };
        read().unwrap_or_else(|e| StartupStatus::from_error(&e))
    }

    pub fn list_login_users(&self) -> Result<Vec<auth::LoginUser>> {
        self.with_db(|db| auth::list_login_users(db.conn()))
    }

    /// Check a PIN. The slow hashing runs with no lock held.
    pub fn login(&self, user_id: i64, pin: Pin) -> Result<SessionInfo> {
        check_pin_format(pin.as_str()).map_err(Error::InvalidPin)?;
        if self.kind == AppKind::Pos && !self.with_db(|db| settings::is_shop_set_up(db.conn()))? {
            return Err(Error::ShopNotSetUp);
        }
        let now = self.now();
        let begin =
            self.with_db(|db| auth::begin_attempt(db, user_id, now, self.kind, Via::Login))?;
        let (user, attempt, lock_secs) = match begin {
            Begin::Unavailable => {
                self.hasher.dummy_verify(pin.as_str());
                return Err(Error::UserUnavailable);
            }
            Begin::Proceed {
                user,
                attempt,
                lock_secs,
            } => (user, attempt, lock_secs),
        };
        if !self.hasher.verify(pin.as_str(), &user.pin_hash) {
            let err = self.with_db(|db| {
                auth::finish_failure(db, &user, attempt, lock_secs, self.kind, Via::Login)
            })?;
            return Err(err);
        }
        let new_hash = if self.hasher.needs_rehash(&user.pin_hash) {
            Some(self.hasher.hash(pin.as_str())?)
        } else {
            None
        };
        self.with_db(|db| auth::finish_login_success(db, &user, new_hash.as_deref(), self.kind))?;
        Ok(self.start_session(&user))
    }

    /// Who is signed in, for display. Does not refresh the idle timer.
    pub fn current_session(&self) -> Result<Option<SessionInfo>> {
        self.with_db(|db| {
            let s = lock(&self.session);
            session::peek(db.conn(), &s, &*self.clock, self.kind)
        })
    }

    pub fn get_status_bar(&self) -> Result<StatusBarInfo> {
        self.with_db(|db| {
            let shop_name =
                settings::get_raw(db.conn(), settings::KEY_SHOP_NAME)?.unwrap_or_default();
            let user_name = {
                let s = lock(&self.session);
                session::peek(db.conn(), &s, &*self.clock, self.kind)?.map(|i| i.name)
            };
            Ok(StatusBarInfo {
                shop_name,
                user_name,
                last_backup_at: None,
            })
        })
    }

    /// First run (Office only): create the owner, mark the shop set up, return the one-time
    /// recovery code and sign the owner in.
    pub fn setup_owner(&self, shop_name: &str, owner_name: &str, pin: Pin) -> Result<SetupResult> {
        self.require_office()?;
        let shop_name = settings::clean_name(shop_name, settings::SHOP_NAME_MAX).map_err(|_| {
            Error::Validation(vec![crate::error::FieldError::new(
                "shopName",
                "Enter the shop name (1 to 40 characters).",
            )])
        })?;
        let owner_name = auth::clean_user_name(owner_name)?;
        validate_pin(pin.as_str(), Role::Owner).map_err(Error::InvalidPin)?;
        if self.with_db(|db| auth::any_users(db.conn()))? {
            return Err(Error::AlreadySetup);
        }
        let pin_hash = self.hasher.hash(pin.as_str())?;
        let code = recovery::generate()?;
        let recovery_hash = self.hasher.hash(&recovery::normalize(&code))?;
        let user = self.with_db(|db| {
            auth::setup_owner(
                db,
                &owner_name,
                &shop_name,
                &pin_hash,
                &recovery_hash,
                self.kind,
            )
        })?;
        Ok(SetupResult {
            recovery_code: code,
            session: self.start_session(&user),
        })
    }

    /// Forgotten owner PIN (Office only): recovery code plus a new 6-digit PIN. The code is
    /// used up; a new one is returned. Wrong codes count against the owner's lockout.
    pub fn recover_owner_pin(&self, code: &str, new_pin: Pin) -> Result<RecoveryResult> {
        self.require_office()?;
        validate_pin(new_pin.as_str(), Role::Owner).map_err(Error::InvalidPin)?;
        let normalized = recovery::normalize(code);
        let now = self.now();
        let (owner_id, stored) = self.with_db(|db| {
            let id = auth::first_active_owner(db.conn())?.ok_or(Error::NotFound("Owner"))?;
            let hash = settings::get_raw(db.conn(), settings::KEY_OWNER_RECOVERY_HASH)?;
            Ok((id, hash))
        })?;
        let Some(stored) = stored else {
            self.hasher.dummy_verify(&normalized);
            return Err(Error::NotFound("Recovery code"));
        };
        let begin =
            self.with_db(|db| auth::begin_attempt(db, owner_id, now, self.kind, Via::Recovery))?;
        let (user, attempt, lock_secs) = match begin {
            Begin::Unavailable => {
                self.hasher.dummy_verify(&normalized);
                return Err(Error::UserUnavailable);
            }
            Begin::Proceed {
                user,
                attempt,
                lock_secs,
            } => (user, attempt, lock_secs),
        };
        if !self.hasher.verify(&normalized, &stored) {
            let err = self.with_db(|db| {
                auth::finish_failure(db, &user, attempt, lock_secs, self.kind, Via::Recovery)
            })?;
            return Err(err);
        }
        let pin_hash = self.hasher.hash(new_pin.as_str())?;
        let new_code = recovery::generate()?;
        let new_code_hash = self.hasher.hash(&recovery::normalize(&new_code))?;
        self.with_db(|db| {
            auth::finish_recovery(db, owner_id, &pin_hash, &new_code_hash, self.kind)
        })?;
        Ok(RecoveryResult {
            recovery_code: new_code,
        })
    }

    pub fn logout(&self) -> Result<()> {
        self.as_user_pending(|db, who| {
            audit::log(
                db.conn(),
                Some(who.user_id),
                event::LOGOUT,
                &Detail::new(self.kind),
            )
        })?;
        *lock(&self.session) = None;
        Ok(())
    }

    /// Ctrl+L. Ends the Rust session; resuming means signing in again.
    pub fn lock_session(&self) -> Result<()> {
        self.as_user_pending(|db, who| {
            audit::log(
                db.conn(),
                Some(who.user_id),
                event::SESSION_LOCK,
                &Detail::new(self.kind),
            )
        })?;
        *lock(&self.session) = None;
        Ok(())
    }

    /// Key-press heartbeat: refreshes the idle timer (the guard does that).
    pub fn heartbeat(&self) -> Result<()> {
        self.as_user_pending(|_, _| Ok(()))
    }

    /// Change own PIN. The old PIN is checked again and wrong tries count towards the lockout.
    pub fn change_pin(&self, old_pin: Pin, new_pin: Pin) -> Result<SessionInfo> {
        let who = self.as_user_pending(|_, who| Ok(who.clone()))?;
        check_pin_format(old_pin.as_str()).map_err(Error::InvalidPin)?;
        validate_pin(new_pin.as_str(), who.role).map_err(Error::InvalidPin)?;
        if old_pin.as_str() == new_pin.as_str() {
            return Err(Error::InvalidPin(PinError::SameAsCurrent));
        }
        let now = self.now();
        let begin = self
            .with_db(|db| auth::begin_attempt(db, who.user_id, now, self.kind, Via::ChangePin))?;
        let (user, attempt, lock_secs) = match begin {
            Begin::Unavailable => {
                self.hasher.dummy_verify(old_pin.as_str());
                *lock(&self.session) = None;
                return Err(Error::NotLoggedIn);
            }
            Begin::Proceed {
                user,
                attempt,
                lock_secs,
            } => (user, attempt, lock_secs),
        };
        if !self.hasher.verify(old_pin.as_str(), &user.pin_hash) {
            let err = self.with_db(|db| {
                auth::finish_failure(db, &user, attempt, lock_secs, self.kind, Via::ChangePin)
            })?;
            return Err(err);
        }
        let new_hash = self.hasher.hash(new_pin.as_str())?;
        self.with_db(|db| auth::set_own_pin(db, user.id, &user.pin_hash, &new_hash, self.kind))?;
        let mut s = lock(&self.session);
        match s.as_mut() {
            Some(sess) if sess.user_id == user.id => {
                sess.must_change_pin = false;
                Ok(sess.info(self.kind))
            }
            _ => Err(Error::NotLoggedIn),
        }
    }

    pub fn get_shop_settings(&self) -> Result<ShopSettings> {
        self.as_user(|db, _| settings::load_shop_settings(db.conn()))
    }

    pub fn save_shop_settings(&self, input: &ShopSettings) -> Result<ShopSettings> {
        self.as_owner("save_shop_settings", |db, who| {
            let tx = db.transaction()?;
            let saved = settings::save_shop_settings(&tx, who.user_id, self.kind, input)?;
            tx.commit()?;
            Ok(saved)
        })
    }

    /// Office navigation check: cashiers are refused (and audited) for owner-only screens.
    pub fn open_screen(&self, screen: &str) -> Result<()> {
        let screen = Screen::parse(screen).ok_or(Error::NotFound("Screen"))?;
        self.as_screen("open_screen", screen, |_, _| Ok(()))
    }

    pub fn list_users(&self) -> Result<Vec<UserRow>> {
        let now = self.now();
        self.as_owner("list_users", |db, _| auth::list_users(db.conn(), now))
    }

    pub fn create_user(&self, name: &str, pin: Pin) -> Result<UserRow> {
        self.as_owner("create_user", |_, _| Ok(()))?;
        let name = auth::clean_user_name(name)?;
        validate_pin(pin.as_str(), Role::Cashier).map_err(Error::InvalidPin)?;
        let hash = self.hasher.hash(pin.as_str())?;
        let now = self.now();
        self.as_owner("create_user", |db, who| {
            auth::create_cashier(db, who.user_id, &name, &hash, now, self.kind)
        })
    }

    pub fn reset_pin(&self, user_id: i64, new_pin: Pin) -> Result<UserRow> {
        let now = self.now();
        let target = self.as_owner("reset_pin", |db, _| auth::user_row(db.conn(), user_id, now))?;
        validate_pin(new_pin.as_str(), target.role).map_err(Error::InvalidPin)?;
        let hash = self.hasher.hash(new_pin.as_str())?;
        self.as_owner("reset_pin", |db, who| {
            auth::reset_pin(db, who.user_id, user_id, &hash, now, self.kind)
        })
    }

    pub fn unlock_user(&self, user_id: i64) -> Result<UserRow> {
        let now = self.now();
        self.as_owner("unlock_user", |db, who| {
            auth::unlock_user(db, who.user_id, user_id, now, self.kind)
        })
    }

    pub fn deactivate_user(&self, user_id: i64) -> Result<UserRow> {
        let now = self.now();
        self.as_owner("deactivate_user", |db, who| {
            auth::deactivate_user(db, who.user_id, user_id, now, self.kind)
        })
    }

    // </commands>
}

/// Commands that deliberately have no guard (they are how you get signed in, or show
/// public information). The guard-coverage test fails if a command is not here and not guarded.
pub const UNGUARDED_COMMANDS: &[&str] = &[
    "app_info",
    "startup_status",
    "list_login_users",
    "login",
    "current_session",
    "get_status_bar",
    "setup_owner",
    "recover_owner_pin",
];

#[cfg(test)]
mod guard_coverage {
    use super::*;

    #[test]
    fn every_command_calls_a_guard_or_is_on_the_exempt_list() {
        let src = include_str!("app.rs");
        let start = src.find("// <commands>").expect("start marker");
        let end = src.find("// </commands>").expect("end marker");
        let block = &src[start..end];
        let mut checked = 0;
        for chunk in block.split("\n    pub fn ").skip(1) {
            let name = chunk.split('(').next().expect("name");
            let guarded = chunk.contains("self.as_user(")
                || chunk.contains("self.as_user_pending(")
                || chunk.contains("self.as_owner(")
                || chunk.contains("self.as_screen(");
            let exempt = UNGUARDED_COMMANDS.contains(&name);
            assert!(
                guarded != exempt,
                "command `{name}` must either call a guard or be on UNGUARDED_COMMANDS (not both)"
            );
            checked += 1;
        }
        assert_eq!(
            checked, 20,
            "command count changed: update this test and the API contract"
        );
        for name in UNGUARDED_COMMANDS {
            assert!(
                block.contains(&format!("pub fn {name}(")),
                "exempt command {name} does not exist"
            );
        }
    }
}
