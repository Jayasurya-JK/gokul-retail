//! Automatic backup. The stored schedule (Settings > Backup) is run by a background thread that has its own database
//! connection, so billing is never held up: `VACUUM INTO` reads a consistent snapshot while the counter keeps writing (WAL).
//!
//! When it runs: shortly after the app starts if a scheduled time has passed without a backup (overdue), at each scheduled
//! time while the app is running, and after every day close (Z). Only the newest N copies are kept ("keep" setting).
//! A failed attempt (folder missing, disk full) is logged and retried 30 minutes later; Office shows a warning when the
//! last good backup is older than 24 hours. Schedule "off" means manual backups only.

use crate::db::{self, get_setting, open_connection, parse_iso};
use crate::error::Result;
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveTime, TimeZone};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::thread::{self, JoinHandle};

/// A last good backup older than this is a warning in Office.
pub const STALE_HOURS: i64 = 24;
const RETRY_AFTER_FAILURE_MIN: i64 = 30;

struct Plan {
    schedule: String,
    time: NaiveTime,
    dir: PathBuf,
    keep: i64,
}

fn plan(conn: &Connection) -> Result<Plan> {
    let b: Value = get_setting(conn, "bundle.backup")?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
    let time = b["time"].as_str().and_then(|t| NaiveTime::parse_from_str(t, "%H:%M").ok()).unwrap_or_else(|| NaiveTime::from_hms_opt(2, 0, 0).unwrap());
    let dir = match b["location"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => crate::crm::default_backup_dir(conn),
    };
    Ok(Plan {
        schedule: b["schedule"].as_str().unwrap_or("daily").to_string(),
        time,
        dir,
        keep: b["keep"].as_i64().filter(|k| *k >= 1).unwrap_or(30),
    })
}

fn at(day: NaiveDate, t: NaiveTime) -> DateTime<Local> {
    Local.from_local_datetime(&day.and_time(t)).earliest().unwrap_or_else(Local::now)
}

/// The latest scheduled moment that is not in the future (`None` when the schedule is off).
pub fn last_slot(schedule: &str, time: NaiveTime, now: DateTime<Local>) -> Option<DateTime<Local>> {
    let today = now.date_naive();
    let yesterday = today - Duration::days(1);
    let mut slots: Vec<DateTime<Local>> = match schedule {
        "daily" => vec![at(yesterday, time), at(today, time)],
        "twice" => {
            let t2 = time + Duration::hours(12);
            vec![at(yesterday, time), at(yesterday, t2), at(today, time), at(today, t2)]
        }
        "hourly" => {
            let top = NaiveTime::from_hms_opt(chrono::Timelike::hour(&now), 0, 0)?;
            vec![at(today, top)]
        }
        _ => return None,
    };
    slots.retain(|s| *s <= now);
    slots.into_iter().max()
}

fn last_ok_at(conn: &Connection) -> Result<Option<DateTime<Local>>> {
    let s: Option<String> = conn.query_row("SELECT at FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    Ok(s.as_deref().and_then(parse_iso))
}

/// Is a scheduled backup overdue right now?
pub fn due(conn: &Connection, now: DateTime<Local>) -> Result<bool> {
    let p = plan(conn)?;
    let Some(slot) = last_slot(&p.schedule, p.time, now) else { return Ok(false) };
    // A failed attempt waits before the next try.
    let failed: Option<String> = conn
        .query_row("SELECT at FROM backup_log WHERE ok=0 ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .optional()?;
    if let Some(f) = failed.as_deref().and_then(parse_iso) {
        if now - f < Duration::minutes(RETRY_AFTER_FAILURE_MIN) && f >= slot {
            return Ok(false);
        }
    }
    Ok(match last_ok_at(conn)? {
        Some(last) => last < slot,
        None => true,
    })
}

/// One backup with the stored location and "keep", logged and pruned. `kind`: auto | day-close | manual.
pub fn run(conn: &Connection, kind: &str) -> Result<Value> {
    let p = plan(conn)?;
    crate::crm::backup_to(conn, &p.dir, kind, p.keep)
}

/// A backup on its own connection (used by the background jobs).
pub fn run_on_own_connection(db_path: &Path, kind: &str) -> Result<Value> {
    let conn = open_connection(db_path)?;
    let _who = db::ActorGuard::set("System (auto backup)");
    run(&conn, kind)
}

/// What Office shows in its status bar.
pub fn status(conn: &Connection) -> Result<Value> {
    let now = Local::now();
    let last: Option<(i64, String)> = conn.query_row("SELECT id, at FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let (last_id, last_at) = last.map(|(i, a)| (i, Some(a))).unwrap_or((0, None));
    let err: Option<String> = conn
        .query_row("SELECT error FROM backup_log WHERE ok=0 AND id>?1 ORDER BY id DESC LIMIT 1", [last_id], |r| r.get(0))
        .optional()?;
    let age_hours = last_at.as_deref().and_then(parse_iso).map(|t| (now - t).num_minutes() as f64 / 60.0);
    let p = plan(conn)?;
    Ok(json!({
        "lastAt": last_at,
        "ageHours": age_hours,
        "stale": age_hours.map(|h| h > STALE_HOURS as f64).unwrap_or(true),
        "lastError": err,
        "schedule": p.schedule,
        "time": p.time.format("%H:%M").to_string(),
        "location": p.dir.display().to_string(),
        "keep": p.keep,
    }))
}

fn check_and_run(db_path: &Path) -> Result<()> {
    let conn = open_connection(db_path)?;
    if due(&conn, Local::now())? {
        let _who = db::ActorGuard::set("System (auto backup)");
        let _ = run(&conn, "auto"); // a failure is logged inside; the next try is 30 minutes later
    }
    Ok(())
}

/// Starts the scheduler thread: first check a few seconds after start (catches an overdue backup), then every 30 seconds.
/// It never touches the billing connection.
pub fn spawn_scheduler(db_path: PathBuf) -> JoinHandle<()> {
    thread::Builder::new()
        .name("gokul-backup".into())
        .spawn(move || {
            thread::sleep(std::time::Duration::from_secs(8));
            loop {
                let _ = check_and_run(&db_path);
                thread::sleep(std::time::Duration::from_secs(30));
            }
        })
        .expect("backup thread")
}

/// After a day close (Z): back up in the background, when the schedule is not off.
pub fn spawn_after_day_close(db_path: PathBuf) -> JoinHandle<()> {
    thread::Builder::new()
        .name("gokul-backup-z".into())
        .spawn(move || {
            let Ok(conn) = open_connection(&db_path) else { return };
            let off = plan(&conn).map(|p| p.schedule == "off").unwrap_or(false);
            if !off {
                let _who = db::ActorGuard::set("System (auto backup)");
                let _ = run(&conn, "day-close");
            }
        })
        .expect("backup thread")
}
