//! The outbox: pending changes written by the triggers (migration 020), turned into upload batches and cleared after the
//! cloud confirms them. Batches read the CURRENT row, so a batch always carries the latest state, never a stale copy.

use super::{is_retry_due, retry_at_value, stamp_now, KEY_FAILURES, KEY_LAST_ERROR, KEY_LAST_OK, KEY_RETRY_AT, SYNCED_TABLES, USERS_SYNC_COLUMNS};
use crate::db::{get_setting, set_setting};
use crate::error::Result;
use chrono::{DateTime, Utc};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Rows per transaction when queueing everything, so the write lock is never held for long.
pub const ENQUEUE_CHUNK: i64 = 1000;

#[derive(Debug)]
pub struct Batch {
    pub id: String,
    pub body: Value,
    pub row_ids: Vec<i64>,
}

pub fn pending_count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))?)
}

/// Primary-key columns of a table, in key order (the same order the triggers use in row_key).
pub fn primary_key(conn: &Connection, table: &str) -> Result<Vec<String>> {
    let mut st = conn.prepare(&format!("PRAGMA table_info('{table}')"))?;
    let mut cols: Vec<(i64, String)> = st
        .query_map([], |r| Ok((r.get::<_, i64>(5)?, r.get::<_, String>(1)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|(pk, _)| *pk > 0)
        .collect();
    cols.sort();
    Ok(cols.into_iter().map(|(_, n)| n).collect())
}

/// SQL filter that keeps only the settings the sync may send (empty for other tables).
fn settings_filter(table: &str) -> String {
    if table == "settings" {
        let list = super::SYNCED_SETTINGS_KEYS.iter().map(|k| format!("'{k}'")).collect::<Vec<_>>().join(",");
        format!("key IN ({list})")
    } else {
        "1 = 1".to_string()
    }
}

/// Queues every row of every synced table (rows already pending are not queued twice). Each chunk is its own short transaction.
/// Returns how many outbox rows were added.
pub fn enqueue_all(conn: &mut Connection, now: DateTime<Utc>) -> Result<i64> {
    let at = stamp_now(now);
    let mut added = 0i64;
    for table in SYNCED_TABLES {
        let pk = primary_key(conn, table)?;
        let json = pk_json_alias(&pk);
        let filter = settings_filter(table);
        let mut lower: i64 = i64::MIN;
        loop {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let upper: Option<i64> = tx.query_row(
                &format!("SELECT MAX(rowid) FROM (SELECT rowid FROM \"{table}\" WHERE rowid > ?1 AND ({filter}) ORDER BY rowid LIMIT {ENQUEUE_CHUNK})"),
                [lower],
                |r| r.get(0),
            )?;
            let Some(upper) = upper else {
                tx.commit()?;
                break;
            };
            let n = tx.execute(
                &format!(
                    "INSERT INTO sync_outbox(tbl, row_key, op, at)
                     SELECT ?1, {json}, 'up', ?2 FROM \"{table}\" t
                     WHERE t.rowid > ?3 AND t.rowid <= ?4 AND ({filter_t})
                       AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.tbl = ?1 AND o.op = 'up' AND o.batch_id IS NULL AND o.row_key = {json})",
                    filter_t = settings_filter_alias(table),
                ),
                rusqlite::params![table, at, lower, upper],
            )?;
            added += n as i64;
            tx.commit()?;
            lower = upper;
        }
    }
    Ok(added)
}

/// `json_object('id', t."id", ...)` in the same key order the triggers use.
fn pk_json_alias(pk: &[String]) -> String {
    let parts: Vec<String> = pk.iter().map(|c| format!("'{c}', t.\"{c}\"")).collect();
    format!("json_object({})", parts.join(", "))
}

fn settings_filter_alias(table: &str) -> String {
    if table == "settings" {
        settings_filter("settings").replace("key IN", "t.key IN")
    } else {
        "1 = 1".to_string()
    }
}

/// Takes up to `limit` pending rows, marks them as one batch and returns the upload body built from their current rows.
/// The write transaction is tiny (only the marking); reading the rows holds no write lock.
/// Returns None when nothing is pending. A row changed after this call gets a new outbox row and is sent next time.
pub fn build_batch(conn: &mut Connection, limit: usize, batch_id: &str) -> Result<Option<Batch>> {
    let pending: Vec<(i64, String, String)> = {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let rows = {
            let mut st = tx.prepare("SELECT id, tbl, row_key FROM sync_outbox WHERE batch_id IS NULL ORDER BY id LIMIT ?1")?;
            let v = st.query_map([limit as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<std::result::Result<Vec<_>, _>>()?;
            v
        };
        {
            let mut mark = tx.prepare("UPDATE sync_outbox SET batch_id = ?1 WHERE id = ?2")?;
            for (id, _, _) in &rows {
                mark.execute(rusqlite::params![batch_id, id])?;
            }
        }
        tx.commit()?;
        rows
    };
    if pending.is_empty() {
        return Ok(None);
    }
    let row_ids: Vec<i64> = pending.iter().map(|p| p.0).collect();
    let mut tables: BTreeMap<String, (Vec<Value>, Vec<Value>)> = BTreeMap::new();
    let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
    let mut pk_cache: HashMap<String, Vec<String>> = HashMap::new();
    for (_, tbl, key) in &pending {
        if !seen.insert((tbl.clone(), key.clone())) {
            continue;
        }
        if !SYNCED_TABLES.contains(&tbl.as_str()) {
            continue;
        }
        let pk = match pk_cache.get(tbl) {
            Some(p) => p.clone(),
            None => {
                let p = primary_key(conn, tbl)?;
                pk_cache.insert(tbl.clone(), p.clone());
                p
            }
        };
        let map: Map<String, Value> = serde_json::from_str(key).unwrap_or_default();
        let pk_vals: Vec<Value> = pk.iter().map(|c| map.get(c).cloned().unwrap_or(Value::Null)).collect();
        if tbl == "settings" {
            let k = pk_vals.first().and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !super::settings_key_allowed(&k) {
                continue; // never sent, whatever is in the outbox
            }
        }
        let entry = tables.entry(tbl.clone()).or_default();
        match current_row(conn, tbl, &pk, &pk_vals)? {
            Some(row) => entry.0.push(row),
            None => entry.1.push(Value::Array(pk_vals)),
        }
    }
    let mut out = Map::new();
    for (tbl, (upsert, delete)) in tables {
        out.insert(tbl, json!({ "upsert": upsert, "delete": delete }));
    }
    Ok(Some(Batch { id: batch_id.to_string(), body: json!({ "batch_id": batch_id, "tables": Value::Object(out) }), row_ids }))
}

/// The current row as JSON, with excluded columns removed (users: whitelist only).
fn current_row(conn: &Connection, table: &str, pk: &[String], pk_vals: &[Value]) -> Result<Option<Value>> {
    if pk.is_empty() {
        return Ok(None);
    }
    let cols = if table == "users" { USERS_SYNC_COLUMNS.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(", ") } else { "*".to_string() };
    let where_ = pk.iter().enumerate().map(|(i, c)| format!("\"{c}\" = ?{}", i + 1)).collect::<Vec<_>>().join(" AND ");
    let sql = format!("SELECT {cols} FROM \"{table}\" WHERE {where_}");
    let mut st = conn.prepare_cached(&sql)?;
    let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
    let params: Vec<SqlValue> = pk_vals.iter().map(json_to_sql).collect();
    let row = st
        .query_row(params_from_iter(params.iter()), |r| {
            let mut m = Map::new();
            for (i, name) in names.iter().enumerate() {
                m.insert(name.clone(), sql_to_json(r.get_ref(i)?));
            }
            Ok(Value::Object(m))
        })
        .optional()?;
    // Settings: only the allowed key and its value leave the shop.
    Ok(row.map(|v| match table {
        "settings" => json!({ "key": v["key"], "value": v["value"] }),
        _ => v,
    }))
}

fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn sql_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
    }
}

/// Records the outcome of a batch. Success deletes exactly that batch's rows. Failure releases them for the next try
/// and waits 1, 2, 5, then 10 minutes before the next attempt. Rows changed while the batch was in flight are untouched.
pub fn apply_result(conn: &mut Connection, batch_id: &str, result: std::result::Result<(), String>, now: DateTime<Utc>) -> Result<()> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    match result {
        Ok(()) => {
            tx.execute("DELETE FROM sync_outbox WHERE batch_id = ?1", [batch_id])?;
            set_setting(&tx, KEY_LAST_OK, &stamp_now(now))?;
            set_setting(&tx, KEY_LAST_ERROR, "")?;
            set_setting(&tx, KEY_FAILURES, "0")?;
            set_setting(&tx, KEY_RETRY_AT, "")?;
        }
        Err(msg) => {
            tx.execute("UPDATE sync_outbox SET batch_id = NULL WHERE batch_id = ?1", [batch_id])?;
            let failures: i64 = get_setting(&tx, KEY_FAILURES)?.and_then(|s| s.parse().ok()).unwrap_or(0) + 1;
            set_setting(&tx, KEY_FAILURES, &failures.to_string())?;
            set_setting(&tx, KEY_RETRY_AT, &retry_at_value(now, failures))?;
            set_setting(&tx, KEY_LAST_ERROR, &msg)?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// True when a batch may be sent now (no failure wait pending).
pub fn due(conn: &Connection, now: DateTime<Utc>) -> Result<bool> {
    is_retry_due(conn, now)
}

/// Releases rows left in flight by an app that stopped mid-send. Only call while holding the sync lock.
pub fn release_in_flight(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE sync_outbox SET batch_id = NULL WHERE batch_id IS NOT NULL", [])?;
    Ok(())
}
