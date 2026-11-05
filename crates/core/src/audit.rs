//! Audit log writer. Rows are written in the same transaction as the change they describe.
//! Details never contain a PIN, hash or recovery code.

use crate::error::Result;
use rusqlite::{params, Connection};

/// Event names (spec 00 step 3 rule 23).
pub mod event {
    pub const SETUP_OWNER: &str = "setup_owner";
    pub const LOGIN_OK: &str = "login_ok";
    pub const LOGIN_FAILED: &str = "login_failed";
    pub const LOGIN_LOCKED: &str = "login_locked";
    pub const LOGIN_BLOCKED_LOCKED: &str = "login_blocked_locked";
    pub const LOGOUT: &str = "logout";
    pub const SESSION_LOCK: &str = "session_lock";
    pub const SESSION_IDLE_LOCK: &str = "session_idle_lock";
    pub const SESSION_IDLE_LOGOUT: &str = "session_idle_logout";
    pub const PIN_CHANGED: &str = "pin_changed";
    pub const PIN_RESET: &str = "pin_reset";
    pub const USER_UNLOCKED: &str = "user_unlocked";
    pub const USER_CREATED: &str = "user_created";
    pub const USER_DEACTIVATED: &str = "user_deactivated";
    pub const USER_ROLE_CHANGED: &str = "user_role_changed";
    pub const SETTINGS_CHANGED: &str = "settings_changed";
    pub const PERMISSION_DENIED: &str = "permission_denied";
    pub const CLOCK_ANOMALY: &str = "clock_anomaly";
    pub const OWNER_RECOVERY_USED: &str = "owner_recovery_used";
}

/// Which program wrote the row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppKind {
    Pos,
    Office,
}

impl AppKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AppKind::Pos => "pos",
            AppKind::Office => "office",
        }
    }
}

enum Val {
    Str(String),
    Int(i64),
}

/// Small JSON object builder (always starts with `"app"`). No extra crate needed.
pub struct Detail(Vec<(&'static str, Val)>);

impl Detail {
    pub fn new(app: AppKind) -> Detail {
        Detail(vec![("app", Val::Str(app.as_str().to_string()))])
    }

    pub fn str(mut self, key: &'static str, value: &str) -> Detail {
        self.0.push((key, Val::Str(value.to_string())));
        self
    }

    pub fn int(mut self, key: &'static str, value: i64) -> Detail {
        self.0.push((key, Val::Int(value)));
        self
    }

    pub fn to_json(&self) -> String {
        let mut out = String::from("{");
        for (i, (k, v)) in self.0.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            push_json_str(&mut out, k);
            out.push(':');
            match v {
                Val::Str(s) => push_json_str(&mut out, s),
                Val::Int(n) => out.push_str(&n.to_string()),
            }
        }
        out.push('}');
        out
    }
}

fn push_json_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Append one audit row. Pass the open transaction (or a connection for a single statement).
pub fn log(conn: &Connection, user_id: Option<i64>, action: &str, detail: &Detail) -> Result<()> {
    conn.execute(
        "INSERT INTO audit_log (user_id, action, detail_json) VALUES (?1, ?2, ?3)",
        params![user_id, action, detail.to_json()],
    )?;
    Ok(())
}

/// True if a row with this action, user and integer detail value already exists
/// (used to write "once per lock window" events only once).
pub fn exists_with_int(
    conn: &Connection,
    user_id: i64,
    action: &str,
    key: &str,
    value: i64,
) -> Result<bool> {
    let path = format!("$.{key}");
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM audit_log
         WHERE user_id = ?1 AND action = ?2 AND json_extract(detail_json, ?3) = ?4",
        params![user_id, action, path, value],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_is_escaped() {
        let d = Detail::new(AppKind::Office)
            .str("old", "a\"b\\c\nd\u{1}")
            .int("n", -5);
        assert_eq!(
            d.to_json(),
            r#"{"app":"office","old":"a\"b\\c\nd\u0001","n":-5}"#
        );
    }
}
