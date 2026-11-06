//! Database handle, migrations and small shared helpers (time, financial year, gapless sequences, audit).

use crate::error::{ApiError, Result};
use crate::types::Settings;
use chrono::{DateTime, Datelike, Local, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Numbered migrations, applied in order inside one transaction each. Never edit a shipped one: add the next.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_init.sql")),
    (2, include_str!("../migrations/002_office.sql")),
    (3, include_str!("../migrations/003_security.sql")),
];

pub struct Db {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Db {
    /// Open (creating if needed) the database at `path` and bring the schema up to date.
    pub fn open(path: &Path) -> Result<Db> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let _ = apply_pending_restore(path); // a staged restore waits if another app still has the database open
        let mut conn = open_connection(path)?;
        migrate(&mut conn)?;
        Ok(Db { conn: Mutex::new(conn), path: path.to_path_buf() })
    }

    /// `%APPDATA%\GokulRetail\gokul.db` (shared by Gokul POS and Gokul Office).
    pub fn open_default() -> Result<Db> {
        Db::open(&default_db_path())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Run `f` with the single connection. All commands are serialised here; each is a few milliseconds.
    pub fn with<R>(&self, f: impl FnOnce(&mut Connection) -> Result<R>) -> Result<R> {
        let mut guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut guard)
    }
}

pub fn default_db_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("XDG_DATA_HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("GokulRetail").join("gokul.db")
}

/// A connection with the safety pragmas every Gokul connection must have.
pub fn open_connection(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA foreign_keys = ON;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -20000;",
    )?;
    Ok(conn)
}

pub fn migrate(conn: &mut Connection) -> Result<()> {
    for (version, sql) in MIGRATIONS {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current: i64 = tx.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if current >= *version {
            continue;
        }
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {version}"))?;
        tx.commit()?;
    }
    Ok(())
}

// ---------- time ----------

pub fn iso(dt: DateTime<Local>) -> String {
    dt.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Local calendar day, yyyy-mm-dd.
pub fn day_of(dt: DateTime<Local>) -> String {
    dt.format("%Y-%m-%d").to_string()
}

/// Indian financial year (April to March): "2026-27".
pub fn fy_of(dt: DateTime<Local>) -> String {
    let y = if dt.month() >= 4 { dt.year() } else { dt.year() - 1 };
    format!("{}-{:02}", y, (y + 1) % 100)
}

/// Short form used inside document numbers: "26".
pub fn fy_short(fy: &str) -> &str {
    &fy[2..4]
}

pub fn parse_iso(s: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(s).ok().map(|d| d.with_timezone(&Local))
}

/// "Today, 08:45" / "Yesterday, 20:10" / "3 days ago" / "" when never.
pub fn when_label(iso_s: Option<&str>, now: DateTime<Local>) -> String {
    let Some(t) = iso_s.and_then(parse_iso) else { return "Never".into() };
    let days = (now.date_naive() - t.date_naive()).num_days();
    match days {
        0 => format!("Today, {}", t.format("%H:%M")),
        1 => format!("Yesterday, {}", t.format("%H:%M")),
        n if n > 1 => format!("{n} days ago"),
        _ => format!("Today, {}", t.format("%H:%M")),
    }
}

/// "Today" / "Yesterday" / "N days ago" for customers.
pub fn visit_label(iso_s: Option<&str>, now: DateTime<Local>) -> String {
    let Some(t) = iso_s.and_then(parse_iso) else { return "Never".into() };
    match (now.date_naive() - t.date_naive()).num_days() {
        d if d <= 0 => "Today".into(),
        1 => "Yesterday".into(),
        n => format!("{n} days ago"),
    }
}

// ---------- sequences ----------

/// Next number in a (series, financial year) counter. Call inside the transaction that writes the document:
/// a rollback undoes the bump, so numbers have no gaps.
pub fn next_seq(conn: &Connection, series: &str, fy: &str) -> Result<i64> {
    let n: i64 = conn.query_row(
        "INSERT INTO sequences(series, fy, last_seq) VALUES(?1, ?2, 1)
         ON CONFLICT(series, fy) DO UPDATE SET last_seq = last_seq + 1
         RETURNING last_seq",
        [series, fy],
        |r| r.get(0),
    )?;
    Ok(n)
}

pub fn peek_seq(conn: &Connection, series: &str, fy: &str) -> Result<i64> {
    let n: Option<i64> =
        conn.query_row("SELECT last_seq FROM sequences WHERE series=?1 AND fy=?2", [series, fy], |r| r.get(0)).optional()?;
    Ok(n.unwrap_or(0) + 1)
}

/// Document number such as GK-26-000123 (prefix, financial-year digits, six-digit sequence; at most 16 characters).
pub fn doc_number(prefix: &str, fy: &str, seq: i64) -> String {
    format!("{}-{}-{:06}", prefix, fy_short(fy), seq)
}

// ---------- settings ----------

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn load_settings(conn: &Connection) -> Result<Settings> {
    let g = |k: &str| -> Result<String> { Ok(get_setting(conn, k)?.unwrap_or_default()) };
    Ok(Settings {
        shop_name: g("shopName")?,
        address: g("address")?,
        gstin: g("gstin")?,
        phone: g("phone")?,
        counter: g("counter")?,
        bill_prefix: g("billPrefix")?,
        receipt_footer: g("receiptFooter")?,
        printer: g("printer")?,
        round_to_rupee: g("roundToRupee")? != "0",
    })
}

// ---------- audit ----------

thread_local! {
    static ACTOR: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// While alive, every audit row, ledger row and "by" column written on this thread carries this user's name,
/// whatever name the caller passed. Set by `dispatch_session` from the backend login session, never from JS.
pub struct ActorGuard(Option<String>);

impl ActorGuard {
    pub fn set(name: &str) -> ActorGuard {
        ActorGuard(ACTOR.with(|a| a.borrow_mut().replace(name.to_string())))
    }
}

impl Drop for ActorGuard {
    fn drop(&mut self) {
        ACTOR.with(|a| *a.borrow_mut() = self.0.take());
    }
}

/// The signed-in user for this call, or `default` when there is none (tests, system jobs).
pub fn actor_or(default: &str) -> String {
    ACTOR.with(|a| a.borrow().clone()).unwrap_or_else(|| default.to_string())
}

pub fn audit(conn: &Connection, now: DateTime<Local>, by: &str, action: &str, entity: &str, entity_id: &str, detail: &str) -> Result<()> {
    let by = actor_or(by);
    conn.prepare_cached("INSERT INTO audit_log(at,by_name,action,entity,entity_id,detail) VALUES(?1,?2,?3,?4,?5,?6)")?
        .execute(rusqlite::params![iso(now), by, action, entity, entity_id, detail])?;
    Ok(())
}

/// "b123" -> 123
pub fn parse_id(prefix: &str, s: &str) -> Option<i64> {
    s.strip_prefix(prefix).and_then(|n| n.parse().ok())
}

pub fn internal(msg: impl Into<String>) -> ApiError {
    ApiError::Internal(msg.into())
}

// ---------- small shared helpers ----------

/// Integer division rounded half-up (like JavaScript `Math.round(a / b)`), `b > 0`.
pub fn round_div(a: i64, b: i64) -> i64 {
    (2 * a + b).div_euclid(2 * b)
}

/// A new unused id like `s12`: bumps the series counter until the id is free (demo data may already use low numbers).
pub fn fresh_id(conn: &Connection, table: &str, prefix: &str, series: &str) -> Result<String> {
    loop {
        let n = next_seq(conn, series, "-")?;
        let id = format!("{prefix}{n}");
        let used: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE id=?1"), [&id], |r| r.get(0))?;
        if used == 0 {
            return Ok(id);
        }
    }
}

/// One stock-ledger row and the cached `items.stock`, together. Every change of stock goes through here.
pub fn post_movement(
    conn: &Connection,
    at: &str,
    item_id: &str,
    kind: &str,
    qty: i64,
    ref_type: &str,
    ref_id: &str,
    note: &str,
    by: &str,
) -> Result<()> {
    let by = actor_or(by);
    let by = by.as_str();
    conn.prepare_cached(
        "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,ref_id,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
    )?
    .execute(rusqlite::params![at, item_id, kind, qty, ref_type, ref_id, note, by])?;
    conn.prepare_cached("UPDATE items SET stock = stock + ?1 WHERE id = ?2")?.execute(rusqlite::params![qty, item_id])?;
    Ok(())
}

/// Cash going in or out of the drawer outside a sale (customer receipts, supplier cash). Only recorded while a day is open.
pub fn drawer_entry(conn: &Connection, now: DateTime<Local>, kind: &str, reason: &str, amount: i64, note: &str, by: &str) -> Result<()> {
    let by = actor_or(by);
    let by = by.as_str();
    let shift: Option<i64> =
        conn.query_row("SELECT id FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    if let Some(id) = shift {
        conn.execute(
            "INSERT INTO cash_movements(shift_id,at,kind,reason,amount,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![id, iso(now), kind, reason, amount, note, by],
        )?;
    }
    Ok(())
}

/// If a restore was staged (`gokul.db.restore` next to the database), swap it in before opening. The old file is kept.
fn apply_pending_restore(path: &Path) -> Result<()> {
    let staged = path.with_extension("db.restore");
    if !staged.exists() || !path.exists() {
        return Ok(());
    }
    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    // The main file first: Windows refuses the rename while another app has the database open, and then nothing moves.
    std::fs::rename(path, PathBuf::from(format!("{}.before-restore-{}", path.display(), stamp)))?;
    for ext in ["-wal", "-shm"] {
        let cur = PathBuf::from(format!("{}{}", path.display(), ext));
        if cur.exists() {
            std::fs::rename(&cur, PathBuf::from(format!("{}.before-restore-{}{}", path.display(), stamp, ext)))?;
        }
    }
    std::fs::rename(&staged, path)?;
    Ok(())
}
