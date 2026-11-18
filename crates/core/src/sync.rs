//! Cloud sync, shop side (docs/CLOUD-DB-AND-SYNC.md, sections 3 and 7). One-way: shop -> cloud, never back.
//! Billing never waits for the internet: the outbox is filled by triggers (migration 020), the worker in `sync::worker`
//! sends it in the background on its own connection, and nothing here runs inside a bill save.

pub mod outbox;
pub mod worker;

use crate::db::{audit, get_setting, set_setting};
use crate::error::{invalid, Result};
use chrono::{DateTime, Duration, Local, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// Tables that are mirrored to the cloud (section 3). Never add held_bills, backup_log, sequences or sync_outbox here.
pub const SYNCED_TABLES: &[&str] = &[
    // master
    "items", "barcodes", "categories", "brands", "suppliers", "customers", "staff", "users", "roles", "expense_categories",
    // sales
    "bills", "bill_lines", "bill_payments", "bill_slabs", "bill_cancellations", "bill_reprints", "voided_lines",
    "credit_notes", "credit_note_lines", "exchange_refunds",
    // money
    "shifts", "cash_movements", "expenses", "customer_payments", "supplier_payments",
    // stock
    "purchases", "purchase_lines", "stock_movements", "stock_adjustments",
    // loyalty
    "points_ledger", "points_lots", "points_lot_uses",
    // mill
    "pressing_batches", "barrels", "barrel_movements", "godown_barrels", "godown_movements", "godown_purchases",
    "godown_transfers", "godown_readings", "pack_runs", "pack_run_lines", "mill_sheets", "mill_op_rows", "mill_punnaku_rows",
    "mill_cust_jobs",
    // audit
    "audit_log",
    // settings (only the keys in SYNCED_SETTINGS_KEYS)
    "settings",
];

/// The only settings keys that may leave the shop (coordinator's exact list). Everything else, including every `sync.*`,
/// `security.*`, `loyalty.*`, `bundle.backup` and `bundle.printers`, is never sent.
pub const SYNCED_SETTINGS_KEYS: &[&str] = &[
    "bundle.shop", "bundle.tax", "shopName", "shopStateCode", "address", "phone", "gstin", "billPrefix", "counter", "roundToRupee",
];

/// Columns of `users` that may be sent. The PIN hash and the lock-out counters never leave the shop.
pub const USERS_SYNC_COLUMNS: &[&str] = &["id", "name", "role", "initials", "active", "created_at"];

pub const KEY_ENABLED: &str = "sync.enabled";
pub const KEY_URL: &str = "sync.url";
pub const KEY_SECRET: &str = "sync.secret";
pub const KEY_LAST_OK: &str = "sync.last_ok_at";
pub const KEY_LAST_ERROR: &str = "sync.last_error";
pub const KEY_LOCK: &str = "sync.lock";
pub const KEY_RETRY_AT: &str = "sync.retry_at";
pub const KEY_FAILURES: &str = "sync.failures";
pub const KEY_RUN_NOW: &str = "sync.run_now";
pub const KEY_UPLOAD_ALL: &str = "sync.upload_all";

/// A lock whose heartbeat is older than this belongs to a dead app and may be taken over.
pub const LOCK_STALE_SECS: i64 = 120;

pub fn settings_key_allowed(key: &str) -> bool {
    SYNCED_SETTINGS_KEYS.contains(&key)
}

/// What the Settings card shows. The secret itself is never returned, only whether one is saved.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub enabled: bool,
    pub url: String,
    pub has_secret: bool,
    pub last_ok_at: Option<String>,
    pub last_error: Option<String>,
    pub pending: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfigInput {
    pub enabled: bool,
    pub url: String,
    /// Write-only. None or empty keeps the saved secret.
    #[serde(default)]
    pub secret: Option<String>,
}

fn text(conn: &Connection, key: &str) -> Result<String> {
    Ok(get_setting(conn, key)?.unwrap_or_default())
}

pub fn is_enabled(conn: &Connection) -> Result<bool> {
    Ok(text(conn, KEY_ENABLED)? == "1")
}

pub fn status(conn: &Connection) -> Result<SyncStatus> {
    let last_ok = text(conn, KEY_LAST_OK)?;
    let last_error = text(conn, KEY_LAST_ERROR)?;
    Ok(SyncStatus {
        enabled: is_enabled(conn)?,
        url: text(conn, KEY_URL)?,
        has_secret: !text(conn, KEY_SECRET)?.is_empty(),
        last_ok_at: (!last_ok.is_empty()).then_some(last_ok),
        last_error: (!last_error.is_empty()).then_some(last_error),
        pending: outbox::pending_count(conn)?,
    })
}

/// Saves the connection. Owner or admin only (checked in authz). Turning sync on needs an https address and a secret.
pub fn set_config(conn: &Connection, input: SyncConfigInput) -> Result<SyncStatus> {
    let url = input.url.trim().to_string();
    let new_secret = input.secret.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    if input.enabled {
        if !url.starts_with("https://") {
            return invalid("The cloud address must start with https://. Copy it from the Supabase function page.");
        }
        if new_secret.is_none() && text(conn, KEY_SECRET)?.is_empty() {
            return invalid("Enter the sync secret first. It is only shown once, when it is typed.");
        }
    }
    if !url.is_empty() && !url.starts_with("https://") {
        return invalid("The cloud address must start with https://.");
    }
    let was_on = is_enabled(conn)?;
    set_setting(conn, KEY_URL, &url)?;
    set_setting(conn, KEY_ENABLED, if input.enabled { "1" } else { "0" })?;
    if input.enabled && !was_on {
        // Changes are recorded only while sync is on, so turning it on queues everything once (the worker does it).
        set_setting(conn, KEY_UPLOAD_ALL, "1")?;
    }
    if let Some(s) = new_secret {
        set_setting(conn, KEY_SECRET, &s)?;
    }
    set_setting(conn, KEY_FAILURES, "0")?;
    set_setting(conn, KEY_RETRY_AT, "")?;
    audit(
        conn,
        Local::now(),
        "system",
        "syncConfig",
        "settings",
        "sync",
        &format!("cloud sync {}, address {}, secret {}", if input.enabled { "on" } else { "off" }, url, if new_secret_saved(conn)? { "saved" } else { "not saved" }),
    )?;
    status(conn)
}

fn new_secret_saved(conn: &Connection) -> Result<bool> {
    Ok(!text(conn, KEY_SECRET)?.is_empty())
}

/// "Sync now": the worker runs a cycle within a few seconds, ignoring any retry wait. Returns the status at once.
pub fn request_now(conn: &Connection) -> Result<SyncStatus> {
    if !is_enabled(conn)? {
        return invalid("Turn cloud sync on first.");
    }
    set_setting(conn, KEY_RUN_NOW, "1")?;
    status(conn)
}

/// "Upload everything": every row of every synced table is queued (chunked by the worker), then sent.
pub fn request_upload_all(conn: &Connection) -> Result<SyncStatus> {
    if !is_enabled(conn)? {
        return invalid("Turn cloud sync on first.");
    }
    set_setting(conn, KEY_UPLOAD_ALL, "1")?;
    set_setting(conn, KEY_RUN_NOW, "1")?;
    status(conn)
}

// ---------- lock: only one app (POS or Office) sends at a time ----------

fn stamp(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub(crate) fn stamp_now(now: DateTime<Utc>) -> String {
    stamp(now)
}

/// Takes the lock when it is free, ours, or stale (no heartbeat for 2 minutes). Returns false while another live app holds it.
pub fn try_lock(conn: &mut Connection, holder: &str, now: DateTime<Utc>) -> Result<bool> {
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let cur = text(&tx, KEY_LOCK)?;
    let free = match cur.split_once('|') {
        None => true,
        Some((who, beat)) => {
            who == holder || beat_age(beat, now).map(|age| age >= LOCK_STALE_SECS).unwrap_or(true)
        }
    };
    if free {
        set_setting(&tx, KEY_LOCK, &format!("{holder}|{}", stamp(now)))?;
    }
    tx.commit()?;
    Ok(free)
}

/// Refreshes our heartbeat. False when we no longer hold the lock (someone took it over): stop sending.
pub fn heartbeat(conn: &mut Connection, holder: &str, now: DateTime<Utc>) -> Result<bool> {
    try_lock(conn, holder, now)
}

pub fn unlock(conn: &Connection, holder: &str) -> Result<()> {
    let cur = text(conn, KEY_LOCK)?;
    if cur.split_once('|').map(|(who, _)| who == holder).unwrap_or(false) {
        set_setting(conn, KEY_LOCK, "")?;
    }
    Ok(())
}

fn beat_age(beat: &str, now: DateTime<Utc>) -> Option<i64> {
    let t = DateTime::parse_from_rfc3339(beat).ok()?.with_timezone(&Utc);
    Some((now - t).num_seconds())
}

/// Seconds to wait after the n-th failure in a row: 1, 2, 5, then 10 minutes.
pub fn backoff_secs(failures: i64) -> i64 {
    match failures {
        i64::MIN..=1 => 60,
        2 => 120,
        3 => 300,
        _ => 600,
    }
}

pub(crate) fn retry_at_value(now: DateTime<Utc>, failures: i64) -> String {
    stamp(now + Duration::seconds(backoff_secs(failures)))
}

pub(crate) fn is_retry_due(conn: &Connection, now: DateTime<Utc>) -> Result<bool> {
    let at = text(conn, KEY_RETRY_AT)?;
    if at.is_empty() {
        return Ok(true);
    }
    Ok(DateTime::parse_from_rfc3339(&at).map(|t| t.with_timezone(&Utc) <= now).unwrap_or(true))
}
