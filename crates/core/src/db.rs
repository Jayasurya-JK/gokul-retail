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
    (4, include_str!("../migrations/004_money_mill.sql")),
    (5, include_str!("../migrations/005_loyalty_credit.sql")),
    (6, include_str!("../migrations/006_points_hundredths.sql")),
    (7, include_str!("../migrations/007_shelf_life.sql")),
    (8, include_str!("../migrations/008_pos_parallel.sql")),
    (9, include_str!("../migrations/009_points_module.sql")),
    (10, include_str!("../migrations/010_points_lots.sql")),
    (11, include_str!("../migrations/011_customer_active.sql")),
    (12, include_str!("../migrations/012_exchange_refund.sql")),
    (13, include_str!("../migrations/013_godown.sql")),
    (14, include_str!("../migrations/014_production_redo.sql")),
    (15, include_str!("../migrations/015_job_work.sql")),
    (16, include_str!("../migrations/016_roles_admin_staff.sql")),
    (17, include_str!("../migrations/017_record_corrections.sql")),
];

/// The schema version this build brings every database up to.
pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.0).unwrap_or(0)
}

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
        crate::lots::expire_quietly(&mut conn); // points past their expiry date lapse on every app start
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
        if *version == 16 {
            allow_admin_and_staff_roles(&tx)?; // before the SQL below inserts the new roles
        }
        tx.execute_batch(sql)?;
        if *version == 10 {
            crate::lots::backfill(&tx)?; // lots from the existing ledger, in the same transaction
        }
        tx.execute_batch(&format!("PRAGMA user_version = {version}"))?;
        tx.commit()?;
    }
    Ok(())
}

/// `users.role` was created with CHECK (role IN ('owner','manager','cashier')). SQLite cannot alter a CHECK, and rebuilding `users`
/// would need foreign keys off (not possible inside this transaction), so the CHECK text is loosened in the schema itself, the
/// documented way for a change that touches no stored row (https://www.sqlite.org/lang_altertable.html, "Making Other Kinds Of
/// Table Schema Changes"). The schema cookie is bumped so the connection reloads the schema.
fn allow_admin_and_staff_roles(tx: &rusqlite::Transaction) -> Result<()> {
    let old = "CHECK (role IN ('owner','manager','cashier'))";
    let new = "CHECK (role IN ('owner','manager','cashier','admin','staff'))";
    let cookie: i64 = tx.query_row("PRAGMA schema_version", [], |r| r.get(0))?;
    tx.execute_batch("PRAGMA writable_schema = ON")?;
    let n = tx.execute("UPDATE sqlite_master SET sql = replace(sql, ?1, ?2) WHERE type='table' AND name='users'", rusqlite::params![old, new])?;
    let n2 = tx.execute(
        "UPDATE sqlite_master SET sql = replace(sql, ?1, ?2) WHERE type='table' AND name='roles'",
        rusqlite::params!["CHECK (id IN ('owner','manager','cashier'))", "CHECK (id IN ('owner','manager','cashier','admin','staff'))"],
    )?;
    tx.execute_batch(&format!("PRAGMA schema_version = {}; PRAGMA writable_schema = OFF", cookie + 1))?;
    if n != 1 || n2 != 1 {
        return Err(internal("could not allow the admin and staff roles on the users table"));
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

/// The moment an entry belongs to. `day` (yyyy-mm-dd) and `time` (HH:MM) are optional: nothing means now; a past day without a time is
/// stamped 20:00 (like the mill sheet); today with a time uses that time. A future day or time is refused.
pub fn entry_time(day: Option<&str>, time: Option<&str>) -> Result<DateTime<Local>> {
    use chrono::{NaiveDate, NaiveTime, TimeZone};
    let now = Local::now();
    let day = day.map(str::trim).filter(|d| !d.is_empty());
    let time = time.map(str::trim).filter(|t| !t.is_empty());
    if day.is_none() && time.is_none() {
        return Ok(now);
    }
    let today = now.date_naive();
    let d = match day {
        Some(s) => NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| ApiError::Invalid("The date looks wrong.".into()))?,
        None => today,
    };
    if d > today {
        return Err(ApiError::Invalid("The date cannot be in the future.".into()));
    }
    let t = match time {
        Some(s) => NaiveTime::parse_from_str(s, "%H:%M").map_err(|_| ApiError::Invalid("The time looks wrong.".into()))?,
        None if d == today => return Ok(now),
        None => NaiveTime::from_hms_opt(20, 0, 0).unwrap(),
    };
    let at = Local.from_local_datetime(&d.and_time(t)).earliest().unwrap_or(now);
    if at > now {
        return Err(ApiError::Invalid("The time cannot be in the future.".into()));
    }
    Ok(at)
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

/// A printed bill number "26/00123" back to the internal "GK-26-000123" (so a scanned or typed printed number finds the bill).
pub fn internal_bill_number(prefix: &str, shown: &str) -> Option<String> {
    let (yy, seq) = shown.trim().split_once('/')?;
    if yy.len() != 2 || !yy.chars().all(|c| c.is_ascii_digit()) || seq.is_empty() || !seq.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{}-{}-{:06}", prefix, yy, seq.parse::<i64>().ok()?))
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
        delivery_gst_rate: g("deliveryGstRate")?.parse().ok().filter(|r| [0, 5, 12, 18].contains(r)).unwrap_or(0),
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

thread_local! {
    static APPROVER: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// While alive, `approver_or_empty()` names the manager whose PIN approved this call (set by `dispatch_session`).
pub struct ApproverGuard(Option<String>);

impl ApproverGuard {
    pub fn set(name: Option<&str>) -> ApproverGuard {
        ApproverGuard(APPROVER.with(|a| std::mem::replace(&mut *a.borrow_mut(), name.map(|n| n.to_string()))))
    }
}

impl Drop for ApproverGuard {
    fn drop(&mut self) {
        APPROVER.with(|a| *a.borrow_mut() = self.0.take());
    }
}

pub fn approver_or_empty() -> String {
    APPROVER.with(|a| a.borrow().clone()).unwrap_or_default()
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
