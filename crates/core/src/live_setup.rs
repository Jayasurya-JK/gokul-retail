//! One-time setup of the live database for data entry (round 6). Run through `examples/r6_live_setup.rs` with the apps closed.
//!
//! In ONE transaction: the real users (the demo users are deactivated, never deleted), the operators list, and every production and
//! processing record is cleared with its stock effect reversed exactly. Bills, purchases, items (except their stock), customers,
//! suppliers, other settings and points are not touched. PINs come only from the caller's arguments; nothing here stores a PIN
//! except as the normal argon2 hash.

use crate::db::{self, audit, fresh_id, iso, set_setting};
use crate::error::{invalid, ApiError, Result};
use crate::store::hash_pin;
use chrono::Local;
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::{json, Value};

pub struct Options {
    pub owner_pin: String,
    pub admin_pin: String,
    pub staff_pin: String,
    /// Do everything, report it, then roll back.
    pub dry_run: bool,
}

/// (name, role, which PIN)
const USERS: [(&str, &str); 4] = [("Gokul", "owner"), ("Jai", "admin"), ("Prevena", "staff"), ("Monisha", "staff")];
const DEMO_USERS: [&str; 5] = ["Suresh Kumar", "Lakshmi Rajan", "Karthik Murugan", "Divya Selvam", "Ramesh Pandian"];
const COLORS: [&str; 4] = ["#0E4330", "#2563EB", "#DB2777", "#7C3AED"];

/// Tables whose rows are cleared. Children first.
const CLEAR: [&str; 15] = [
    "mill_op_rows", "mill_punnaku_rows", "mill_cust_jobs", "mill_sheets", "pack_run_lines", "pack_runs", "godown_reading_voids", "godown_readings",
    "godown_movements", "godown_purchases", "godown_transfers", "pressing_batches", "godown_barrels", "stock_adjustments", "stock_movements",
];
/// The tables whose append-only triggers are dropped for the clean-up and recreated with their exact SQL.
const TRIGGER_TABLES: [&str; 14] = [
    "stock_movements", "stock_adjustments", "pressing_batches", "pack_runs", "pack_run_lines", "godown_movements", "godown_readings",
    "godown_purchases", "godown_transfers", "mill_sheets", "mill_op_rows", "mill_punnaku_rows", "mill_cust_jobs", "godown_reading_voids",
];
const SEQUENCES: [&str; 4] = ["PB", "PK", "GP", "GT"];
/// Stock movements that belong to production and processing.
const PRODUCTION_MOVES: &str = "(ref_type IN ('pressing','godown_transfer','pack_run','mill_job','mill_sheet')
    OR (kind='adjustment' AND ref_type='adjustment' AND CAST(ref_id AS INTEGER) IN (SELECT id FROM stock_adjustments WHERE note LIKE 'Mill sheet %')))";

#[derive(Debug, Default)]
pub struct Report {
    pub users: Vec<(String, String, bool)>,
    pub operators: Vec<String>,
    pub removed: Vec<(String, i64)>,
    /// (item name, stock before, stock after) in milli-units
    pub stock_changes: Vec<(String, i64, i64)>,
    pub triggers_restored: usize,
    pub integrity: String,
    pub dry_run: bool,
}

fn count(conn: &Connection, table: &str) -> Result<i64> {
    Ok(conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))?)
}

fn check_pin(label: &str, pin: &str) -> Result<()> {
    if pin.len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return invalid(format!("The {label} PIN must be exactly 4 digits."));
    }
    Ok(())
}

/// Is another process holding the database? A writer lock right now is refused at once; the apps keep the database open while they run,
/// so the caller (the example) also checks for the app processes.
pub fn assert_not_locked(conn: &Connection) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_millis(0))?;
    let r = conn.execute_batch("BEGIN IMMEDIATE; ROLLBACK;");
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    r.map_err(|_| ApiError::Invalid("The database is in use (locked). Close Gokul POS and Gokul Office, then run this again.".into()))
}

pub fn run(conn: &mut Connection, o: &Options) -> Result<Report> {
    check_pin("owner", &o.owner_pin)?;
    check_pin("admin", &o.admin_pin)?;
    check_pin("staff", &o.staff_pin)?;
    assert_not_locked(conn)?;
    let now = Local::now();
    let mut rep = Report { dry_run: o.dry_run, ..Default::default() };
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

    // ---- 1. users and the salesman list ----
    for (n, (name, role)) in USERS.iter().enumerate() {
        let pin = match *role {
            "owner" => &o.owner_pin,
            "admin" => &o.admin_pin,
            _ => &o.staff_pin,
        };
        let initials: String = name.chars().take(2).collect::<String>().to_uppercase();
        let existing: Option<String> = tx
            .query_row("SELECT id FROM users WHERE name = ?1 COLLATE NOCASE ORDER BY rowid LIMIT 1", [name], |r| r.get(0))
            .ok();
        match existing {
            Some(id) => {
                tx.execute(
                    "UPDATE users SET name=?1, role=?2, initials=?3, color=?4, pin_hash=?5, active=1, failed_pins=0, locked_until=NULL, pin_changed_at=?6 WHERE id=?7",
                    params![name, role, initials, COLORS[n], hash_pin(pin)?, iso(now), id],
                )?;
            }
            None => {
                let id = fresh_id(&tx, "users", "u", "USERID")?;
                tx.execute(
                    "INSERT INTO users(id,name,role,initials,color,pin_hash,active,created_at,pin_changed_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7,?7)",
                    params![id, name, role, initials, COLORS[n], hash_pin(pin)?, iso(now)],
                )?;
            }
        }
        tx.execute("INSERT INTO staff(name,active) VALUES(?1,1) ON CONFLICT(name) DO UPDATE SET active=1", [name])?;
        audit(&tx, now, "Setup", "create", "user", name, &format!("live setup: {name} as {role}"))?;
    }
    for demo in DEMO_USERS {
        let new_names: Vec<String> = USERS.iter().map(|u| u.0.to_lowercase()).collect();
        if new_names.contains(&demo.to_lowercase()) {
            continue;
        }
        tx.execute("UPDATE users SET active=0 WHERE name = ?1 COLLATE NOCASE", [demo])?;
        tx.execute("UPDATE staff SET active=0 WHERE name = ?1 COLLATE NOCASE", [demo])?;
    }

    // ---- 2. operators ----
    let mut bundle: Value = db::get_setting(&tx, "bundle.mill")?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(crate::mill::default_mill_bundle);
    bundle["operators"] = json!(["Ambethkar"]);
    set_setting(&tx, "bundle.mill", &bundle.to_string())?;

    // ---- 3. clear production and processing records ----
    let mut triggers: Vec<(String, String)> = vec![];
    {
        let marks = TRIGGER_TABLES.iter().map(|t| format!("'{t}'")).collect::<Vec<_>>().join(",");
        let mut st = tx.prepare(&format!("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN ({marks}) ORDER BY name"))?;
        for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            triggers.push(r?);
        }
    }
    for (name, _) in &triggers {
        tx.execute_batch(&format!("DROP TRIGGER \"{name}\""))?;
    }

    // stock: reverse exactly what the production movements did, per item
    let sums: Vec<(String, String, i64, i64)> = {
        let mut st = tx.prepare(&format!(
            "SELECT s.item_id, i.name, i.stock, s.total FROM (SELECT item_id, SUM(qty) AS total FROM stock_movements WHERE {PRODUCTION_MOVES} GROUP BY item_id) s
             JOIN items i ON i.id=s.item_id ORDER BY i.name"
        ))?;
        let v = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    for (item, name, before, sum) in &sums {
        tx.execute("UPDATE items SET stock = stock - ?1 WHERE id=?2", params![sum, item])?;
        rep.stock_changes.push((name.clone(), *before, before - sum));
    }
    // store barrels: packing took oil out of them and a transfer may have put oil in
    tx.execute(
        "UPDATE barrels SET level_ml = level_ml + COALESCE((SELECT SUM(used_ml) FROM pack_runs p WHERE p.barrel_id=barrels.id),0)
                                     - COALESCE((SELECT SUM(litres_ml) FROM godown_transfers t WHERE t.store_barrel_id=barrels.id),0)",
        [],
    )?;
    tx.execute("UPDATE barrels SET level_ml = 0 WHERE level_ml < 0", [])?;

    // counts, then delete the movements first (they reference adjustments by id), then the tables
    let moves: i64 = tx.query_row(&format!("SELECT COUNT(*) FROM stock_movements WHERE {PRODUCTION_MOVES}"), [], |r| r.get(0))?;
    tx.execute(&format!("DELETE FROM stock_movements WHERE {PRODUCTION_MOVES}"), [])?;
    rep.removed.push(("stock movements (production)".into(), moves));
    for t in CLEAR {
        if t == "stock_movements" {
            continue;
        }
        if t == "stock_adjustments" {
            let n: i64 = tx.query_row("SELECT COUNT(*) FROM stock_adjustments WHERE note LIKE 'Mill sheet %'", [], |r| r.get(0))?;
            tx.execute("DELETE FROM stock_adjustments WHERE note LIKE 'Mill sheet %'", [])?;
            rep.removed.push(("stock adjustments (mill sheet close)".into(), n));
            continue;
        }
        let n = count(&tx, t)?;
        tx.execute(&format!("DELETE FROM {t}"), [])?;
        rep.removed.push((t.to_string(), n));
    }
    for s in SEQUENCES {
        tx.execute("UPDATE sequences SET last_seq = 0 WHERE series = ?1", [s])?;
    }
    audit(&tx, now, "Setup", "clear", "production", "live setup", &format!("production and processing records cleared; {} items corrected", rep.stock_changes.len()))?;

    // recreate the append-only triggers with their exact original SQL
    for (_, sql) in &triggers {
        tx.execute_batch(sql)?;
    }
    rep.triggers_restored = triggers.len();

    // the report
    {
        let mut st = tx.prepare("SELECT name, role, active FROM users ORDER BY rowid")?;
        rep.users = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    }
    rep.operators = bundle["operators"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    rep.integrity = tx.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    let fk: i64 = tx.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0))?;
    if fk > 0 {
        return Err(ApiError::Invalid(format!("{fk} foreign key problems after the clean-up; nothing was changed.")));
    }
    if rep.integrity != "ok" {
        return Err(ApiError::Invalid(format!("Integrity check failed ({}); nothing was changed.", rep.integrity)));
    }
    if o.dry_run {
        tx.rollback()?;
    } else {
        tx.commit()?;
    }
    Ok(rep)
}
