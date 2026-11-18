//! The background sender. Started by both apps (POS and Office); it does nothing unless `sync.enabled` is '1'.
//! It has its own connection with a short busy timeout, so a bill save is never waiting behind it for long: if a save
//! holds the write lock, the worker yields and tries again on its next tick.

use super::outbox::{self, build_batch, apply_result};
use super::{heartbeat, is_enabled, is_retry_due, try_lock, unlock, KEY_RUN_NOW, KEY_SECRET, KEY_UPLOAD_ALL, KEY_URL};
use crate::db::{get_setting, open_connection, set_setting};
use crate::error::Result;
use chrono::Utc;
use rand_core::{OsRng, RngCore};
use rusqlite::Connection;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// Rows per upload batch (section 7).
pub const BATCH_ROWS: usize = 500;
/// Batches sent in one cycle before the worker lets go of the lock and yields.
pub const MAX_BATCHES_PER_CYCLE: usize = 20;
/// A normal cycle runs this often while sync is on.
pub const CYCLE_EVERY: Duration = Duration::from_secs(60);

/// Sends one batch. Ok when the cloud answered 200; Err carries a plain-English reason.
pub trait Transport: Send {
    fn send(&self, url: &str, secret: &str, body: &Value) -> std::result::Result<(), String>;
}

/// The real sender: HTTPS POST with the `x-sync-secret` header (ureq, rustls).
pub struct HttpTransport {
    agent: ureq::Agent,
}

impl HttpTransport {
    pub fn new() -> Self {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(30)))
            .http_status_as_error(false)
            .build();
        HttpTransport { agent: ureq::Agent::new_with_config(config) }
    }
}

impl Default for HttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl Transport for HttpTransport {
    fn send(&self, url: &str, secret: &str, body: &Value) -> std::result::Result<(), String> {
        let resp = self
            .agent
            .post(url)
            .header("x-sync-secret", secret)
            .send_json(body)
            .map_err(|_| "Could not reach the cloud. Nothing was lost; it will try again.".to_string())?;
        match resp.status().as_u16() {
            200 => Ok(()),
            401 | 403 => Err("The cloud refused the sync secret. Check it in Settings.".to_string()),
            code => Err(format!("The cloud answered with error {code}. It will try again.")),
        }
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct CycleReport {
    pub batches: usize,
    pub rows: usize,
    pub error: Option<String>,
    /// True when another app holds the lock (or sync is off, or a retry wait is running).
    pub idle: bool,
}

/// One sync cycle: lock, send up to `max_batches` batches, unlock. Every step is a short transaction.
pub fn run_cycle(conn: &mut Connection, transport: &dyn Transport, holder: &str, now: chrono::DateTime<Utc>, manual: bool, max_batches: usize) -> Result<CycleReport> {
    let mut report = CycleReport::default();
    if !is_enabled(conn)? {
        report.idle = true;
        return Ok(report);
    }
    if !manual && !is_retry_due(conn, now)? {
        report.idle = true;
        return Ok(report);
    }
    let url = get_setting(conn, KEY_URL)?.unwrap_or_default();
    let secret = get_setting(conn, KEY_SECRET)?.unwrap_or_default();
    if !url.starts_with("https://") || secret.is_empty() {
        report.idle = true;
        return Ok(report);
    }
    if !try_lock(conn, holder, now)? {
        report.idle = true;
        return Ok(report);
    }
    let result = send_batches(conn, transport, holder, now, &url, &secret, max_batches, &mut report);
    let _ = unlock(conn, holder);
    result.map(|()| report)
}

#[allow(clippy::too_many_arguments)]
fn send_batches(
    conn: &mut Connection,
    transport: &dyn Transport,
    holder: &str,
    now: chrono::DateTime<Utc>,
    url: &str,
    secret: &str,
    max_batches: usize,
    report: &mut CycleReport,
) -> Result<()> {
    // A batch in flight when an app stopped was never confirmed: its rows go back to pending first (we hold the lock).
    outbox::release_in_flight(conn)?;
    for _ in 0..max_batches {
        if !heartbeat(conn, holder, now)? {
            break; // lost the lock to another app
        }
        let batch_id = new_batch_id();
        let Some(batch) = build_batch(conn, BATCH_ROWS, &batch_id)? else { break };
        let rows = batch.row_ids.len();
        match transport.send(url, secret, &batch.body) {
            Ok(()) => {
                apply_result(conn, &batch.id, Ok(()), now)?;
                report.batches += 1;
                report.rows += rows;
            }
            Err(msg) => {
                apply_result(conn, &batch.id, Err(msg.clone()), now)?;
                report.error = Some(msg);
                break;
            }
        }
    }
    Ok(())
}

fn new_batch_id() -> String {
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn flag(conn: &Connection, key: &str) -> bool {
    get_setting(conn, key).ok().flatten().as_deref() == Some("1")
}

/// Starts the background sender for this app. Safe to call from both apps: the lock keeps one sender at a time.
pub fn spawn_worker(db_path: PathBuf) -> JoinHandle<()> {
    thread::Builder::new()
        .name("gokul-sync".into())
        .spawn(move || worker_main(&db_path, Box::new(HttpTransport::new())))
        .expect("sync thread")
}

fn worker_main(path: &Path, transport: Box<dyn Transport>) {
    let Ok(mut conn) = open_connection(path) else { return };
    let _ = conn.busy_timeout(Duration::from_millis(200)); // yield to a bill save instead of queueing behind it
    let holder = new_batch_id();
    let mut last_cycle: Option<Instant> = None;
    loop {
        thread::sleep(Duration::from_secs(2));
        if !matches!(is_enabled(&conn), Ok(true)) {
            continue; // sync off: nothing happens
        }
        let manual = flag(&conn, KEY_RUN_NOW);
        let due = manual || last_cycle.map_or(true, |t| t.elapsed() >= CYCLE_EVERY);
        if !due {
            continue;
        }
        if flag(&conn, KEY_UPLOAD_ALL) {
            if outbox::enqueue_all(&mut conn, Utc::now()).is_ok() {
                let _ = set_setting(&conn, KEY_UPLOAD_ALL, "0");
            } else {
                continue; // busy: try again on the next tick
            }
        }
        if manual {
            let _ = set_setting(&conn, KEY_RUN_NOW, "0");
        }
        let _ = run_cycle(&mut conn, transport.as_ref(), &holder, Utc::now(), manual, MAX_BATCHES_PER_CYCLE);
        last_cycle = Some(Instant::now());
    }
}

/// Shared by tests: a transport that records what it was sent and answers with a fixed result.
pub struct RecordingTransport {
    pub sent: Mutex<Vec<Value>>,
    pub answer: Mutex<std::result::Result<(), String>>,
}

impl RecordingTransport {
    pub fn ok() -> Self {
        RecordingTransport { sent: Mutex::new(Vec::new()), answer: Mutex::new(Ok(())) }
    }
    pub fn failing(msg: &str) -> Self {
        RecordingTransport { sent: Mutex::new(Vec::new()), answer: Mutex::new(Err(msg.to_string())) }
    }
}

impl Transport for RecordingTransport {
    fn send(&self, _url: &str, _secret: &str, body: &Value) -> std::result::Result<(), String> {
        self.sent.lock().unwrap().push(body.clone());
        self.answer.lock().unwrap().clone()
    }
}
