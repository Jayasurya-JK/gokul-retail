//! The signed-in session and the guards every command goes through
//! (spec 00 step 3, section D). The session lives in Rust; the UI never says who it is.

use crate::audit::{self, event, AppKind, Detail};
use crate::auth::Role;
use crate::clock::Clock;
use crate::error::{Error, Result};
use crate::settings;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Screen {
    Dashboard,
    Items,
    Stock,
    Production,
    Packing,
    Purchases,
    Reports,
    Users,
    Settings,
}

impl Screen {
    pub const ALL: [Screen; 9] = [
        Screen::Dashboard,
        Screen::Items,
        Screen::Stock,
        Screen::Production,
        Screen::Packing,
        Screen::Purchases,
        Screen::Reports,
        Screen::Users,
        Screen::Settings,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Screen::Dashboard => "dashboard",
            Screen::Items => "items",
            Screen::Stock => "stock",
            Screen::Production => "production",
            Screen::Packing => "packing",
            Screen::Purchases => "purchases",
            Screen::Reports => "reports",
            Screen::Users => "users",
            Screen::Settings => "settings",
        }
    }

    pub fn parse(s: &str) -> Option<Screen> {
        Screen::ALL.into_iter().find(|x| x.as_str() == s)
    }

    /// Cashiers may use Dashboard, Items and Stock only (owner decision 5 Nov 2026).
    pub fn cashier_allowed(self) -> bool {
        matches!(self, Screen::Dashboard | Screen::Items | Screen::Stock)
    }
}

/// Screens a role may open in Office. POS has no screens.
pub fn allowed_screens(app: AppKind, role: Role) -> Vec<Screen> {
    if app == AppKind::Pos {
        return Vec::new();
    }
    Screen::ALL
        .into_iter()
        .filter(|s| role == Role::Owner || s.cashier_allowed())
        .collect()
}

#[derive(Debug, Clone)]
pub struct Session {
    pub user_id: i64,
    pub role: Role,
    pub name: String,
    pub must_change_pin: bool,
    pub last_activity_ms: u64,
    /// Wall-clock time of the last activity. Catches sleep and hibernate, which the
    /// monotonic timer may not count.
    pub last_activity_unix: i64,
}

/// What the UI is told about the signed-in user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub user_id: i64,
    pub name: String,
    pub role: Role,
    pub must_change_pin: bool,
    pub allowed_screens: Vec<Screen>,
}

impl Session {
    pub fn info(&self, app: AppKind) -> SessionInfo {
        SessionInfo {
            user_id: self.user_id,
            name: self.name.clone(),
            role: self.role,
            must_change_pin: self.must_change_pin,
            allowed_screens: allowed_screens(app, self.role),
        }
    }
}

/// Who is calling, as re-read from the database for this call.
#[derive(Debug, Clone)]
pub struct Identity {
    pub user_id: i64,
    pub role: Role,
}

struct LiveUser {
    role: Role,
    name: String,
    must_change_pin: bool,
}

fn read_user(conn: &Connection, id: i64) -> Result<Option<LiveUser>> {
    let row = conn
        .query_row(
            "SELECT role, name, must_change_pin FROM users WHERE id = ?1 AND active = 1",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()?;
    Ok(row.and_then(|(role, name, must)| {
        Role::parse(&role).map(|role| LiveUser {
            role,
            name,
            must_change_pin: must == 1,
        })
    }))
}

/// How the idle check came out.
enum Idle {
    Active,
    /// Idle for longer than the limit by the monotonic timer.
    Expired,
    /// The wall clock says idle for too long but the monotonic timer does not: the PC
    /// slept, or the date was moved forward. `jump_secs` is the wall-clock gap.
    ExpiredByWallClock {
        jump_secs: i64,
    },
}

fn idle_state(conn: &Connection, s: &Session, clock: &dyn Clock, app: AppKind) -> Result<Idle> {
    let limit = settings::idle_timeout_secs(conn, app)?;
    if limit <= 0 {
        return Ok(Idle::Active);
    }
    if clock.mono_ms().saturating_sub(s.last_activity_ms) > (limit as u64) * 1000 {
        return Ok(Idle::Expired);
    }
    let wall_gap = clock.unix_secs().saturating_sub(s.last_activity_unix);
    if wall_gap > limit {
        return Ok(Idle::ExpiredByWallClock {
            jump_secs: wall_gap,
        });
    }
    Ok(Idle::Active)
}

/// Any signed-in user. Re-reads role and active flag, applies idle expiry, refreshes the
/// idle timer.
pub fn require_login(
    conn: &Connection,
    slot: &mut Option<Session>,
    clock: &dyn Clock,
    app: AppKind,
    allow_pending_pin_change: bool,
) -> Result<Identity> {
    let Some(s) = slot.as_mut() else {
        return Err(Error::NotLoggedIn);
    };
    let Some(live) = read_user(conn, s.user_id)? else {
        *slot = None;
        return Err(Error::NotLoggedIn);
    };
    let idle = idle_state(conn, s, clock, app)?;
    if !matches!(idle, Idle::Active) {
        if let Idle::ExpiredByWallClock { jump_secs } = idle {
            audit::log(
                conn,
                Some(s.user_id),
                event::CLOCK_ANOMALY,
                &Detail::new(app)
                    .str("kind", "forward_jump")
                    .int("jump_secs", jump_secs),
            )?;
        }
        let action = match app {
            AppKind::Pos => event::SESSION_IDLE_LOCK,
            AppKind::Office => event::SESSION_IDLE_LOGOUT,
        };
        audit::log(conn, Some(s.user_id), action, &Detail::new(app))?;
        *slot = None;
        return Err(Error::SessionExpired);
    }
    s.role = live.role;
    s.name = live.name;
    s.must_change_pin = live.must_change_pin;
    s.last_activity_ms = clock.mono_ms();
    s.last_activity_unix = clock.unix_secs();
    if s.must_change_pin && !allow_pending_pin_change {
        return Err(Error::PinChangeRequired);
    }
    Ok(Identity {
        user_id: s.user_id,
        role: s.role,
    })
}

/// Write the `permission_denied` audit row and return the error to give.
fn deny(conn: &Connection, who: &Identity, command: &str, detail: Detail) -> Error {
    let d = detail.str("command", command);
    match audit::log(conn, Some(who.user_id), event::PERMISSION_DENIED, &d) {
        Ok(()) => Error::PermissionDenied,
        Err(e) => e,
    }
}

/// Owner only. A cashier is refused and the attempt is written to the audit log.
pub fn require_owner(
    conn: &Connection,
    slot: &mut Option<Session>,
    clock: &dyn Clock,
    app: AppKind,
    command: &str,
) -> Result<Identity> {
    let who = require_login(conn, slot, clock, app, false)?;
    if who.role != Role::Owner {
        return Err(deny(conn, &who, command, Detail::new(app)));
    }
    Ok(who)
}

/// A user opening an Office screen. Cashiers: Dashboard, Items, Stock only.
pub fn require_office_screen(
    conn: &Connection,
    slot: &mut Option<Session>,
    clock: &dyn Clock,
    app: AppKind,
    command: &str,
    screen: Screen,
) -> Result<Identity> {
    let who = require_login(conn, slot, clock, app, false)?;
    if who.role != Role::Owner && !screen.cashier_allowed() {
        return Err(deny(
            conn,
            &who,
            command,
            Detail::new(app).str("screen", screen.as_str()),
        ));
    }
    Ok(who)
}

/// The current session for display, without refreshing the idle timer or changing anything.
/// Returns None if nobody is signed in, the user was switched off, or the session is idle.
pub fn peek(
    conn: &Connection,
    slot: &Option<Session>,
    clock: &dyn Clock,
    app: AppKind,
) -> Result<Option<SessionInfo>> {
    let Some(s) = slot.as_ref() else {
        return Ok(None);
    };
    let Some(live) = read_user(conn, s.user_id)? else {
        return Ok(None);
    };
    if !matches!(idle_state(conn, s, clock, app)?, Idle::Active) {
        return Ok(None);
    }
    let fresh = Session {
        role: live.role,
        name: live.name,
        must_change_pin: live.must_change_pin,
        ..s.clone()
    };
    Ok(Some(fresh.info(app)))
}
