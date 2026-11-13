//! Godown barrels: production stock of oil, kept apart from store stock.
//!
//! How the shop really works (from the owner's notes):
//! - Pressed oil goes into a 200 L GODOWN barrel. Several batches, even from different seed lots, share one barrel.
//! - At the end of the day the litres in each barrel are measured with a stick; the stick is the truth, the difference
//!   to what the entries say is recorded as a variance.
//! - When the barrel is nearly full it is left to SETTLE. After settling, oil is TRANSFERRED to the store: that adds
//!   litres to the store loose-oil item's stock and takes the same litres out of the godown barrel.
//! - Oil bought from an outside manufacturer (when seed is short) is a purchase into a godown barrel and then settles
//!   and transfers like pressed oil.
//!
//! Godown oil is never store stock and never reaches the POS: only a transfer moves it across, and that is audited.
//! Barrel level = SUM(godown_movements.qty_ml), kept in `godown_barrels.level_ml`.
//! Status: empty -> filling -> settling -> ready (ready is also reached on its own after the seed's settling days).

use crate::catalog::OFFICE;
use crate::db::{self, audit, doc_number, fy_of, iso, next_seq, parse_iso, post_movement};
use crate::error::{invalid, Result};
use crate::mill;
use crate::purchasing::{self, seed_base, seed_norm};
use chrono::{DateTime, Duration, Local};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Value};

pub const OILS: [&str; 3] = ["groundnut", "sesame", "copra"];
pub const PURCHASE_SERIES: &str = "GP";
pub const TRANSFER_SERIES: &str = "GT";

fn oil_short(oil: &str) -> &'static str {
    match oil {
        "sesame" => "Sesame",
        "copra" => "Coconut",
        _ => "Groundnut",
    }
}

fn fmt_l(ml: i64) -> String {
    let s = format!("{:.1}", ml as f64 / 1000.0);
    s.strip_suffix(".0").map(|x| x.to_string()).unwrap_or(s)
}

struct Row {
    id: String,
    label: String,
    oil: String,
    capacity: i64,
    level: i64,
    status: String,
    filled_on: Option<String>,
    settle_started: Option<String>,
    active: bool,
}

const ROW_SELECT: &str = "SELECT id,label,oil,capacity_ml,level_ml,status,filled_on,settle_started_on,active FROM godown_barrels";

fn row_of(r: &rusqlite::Row) -> rusqlite::Result<Row> {
    Ok(Row {
        id: r.get(0)?,
        label: r.get(1)?,
        oil: r.get(2)?,
        capacity: r.get(3)?,
        level: r.get(4)?,
        status: r.get(5)?,
        filled_on: r.get(6)?,
        settle_started: r.get(7)?,
        active: r.get::<_, i64>(8)? != 0,
    })
}

fn load(conn: &Connection, id: &str) -> Result<Option<Row>> {
    Ok(conn.query_row(&format!("{ROW_SELECT} WHERE id=?1"), [id], row_of).optional()?)
}

/// When a settling barrel is ready: the day it started plus the seed's settling days (a setting).
fn ready_on(conn: &Connection, r: &Row) -> Option<DateTime<Local>> {
    let started = r.settle_started.as_deref().and_then(parse_iso)?;
    Some(started + Duration::days(seed_norm(conn, &r.oil).settle_days))
}

/// The status shown to people: empty at zero litres; a settling barrel turns ready by itself after its settling days.
fn effective(conn: &Connection, r: &Row, now: DateTime<Local>) -> &'static str {
    if r.level == 0 {
        return "empty";
    }
    match r.status.as_str() {
        "settling" => match ready_on(conn, r) {
            Some(t) if t <= now => "ready",
            _ => "settling",
        },
        "ready" => "ready",
        _ => "filling",
    }
}

fn barrel_json(conn: &Connection, r: &Row, now: DateTime<Local>) -> Result<Value> {
    let last: Option<(String, i64, i64, i64)> = conn
        .query_row(
            "SELECT at,measured_ml,system_ml,variance_ml FROM godown_readings WHERE barrel_id=?1 ORDER BY id DESC LIMIT 1",
            [&r.id],
            |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?, x.get(3)?)),
        )
        .optional()?;
    Ok(json!({
        "id": r.id, "label": r.label, "oil": r.oil, "oilName": seed_base(&r.oil).map(|b| b.oil_name).unwrap_or(""),
        "capacityL": r.capacity, "levelL": r.level, "status": effective(conn, r, now), "storedStatus": r.status,
        "filledOn": r.filled_on, "settleStartedOn": r.settle_started, "readyOn": ready_on(conn, r).map(iso), "active": r.active,
        "settleDays": seed_norm(conn, &r.oil).settle_days,
        "lastReading": last.map(|(at, m, s, v)| json!({ "at": at, "measuredL": m, "systemL": s, "varianceL": v })),
    }))
}

pub fn list_godown_barrels(conn: &Connection) -> Result<Vec<Value>> {
    let now = Local::now();
    let mut st = conn.prepare(&format!("{ROW_SELECT} ORDER BY active DESC, oil, id"))?;
    let rows = st.query_map([], row_of)?.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.iter().map(|r| barrel_json(conn, r, now)).collect()
}

// ---------- the ledger ----------

/// One ledger row and the cached level, together. Every change of a godown barrel's litres goes through here.
fn post(tx: &Connection, now: DateTime<Local>, barrel: &str, kind: &str, qty_ml: i64, ref_type: &str, ref_id: &str, note: &str) -> Result<()> {
    tx.execute(
        "INSERT INTO godown_movements(at,day,barrel_id,kind,qty_ml,ref_type,ref_id,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![iso(now), db::day_of(now), barrel, kind, qty_ml, ref_type, ref_id, note, db::actor_or(OFFICE)],
    )?;
    tx.execute("UPDATE godown_barrels SET level_ml = level_ml + ?1 WHERE id=?2", params![qty_ml, barrel])?;
    Ok(())
}

/// Can this barrel take `ml` of this oil right now? Returns the barrel id. Pressed oil goes only into a barrel of the same oil
/// that is empty or still filling (a settling barrel must not be disturbed with fresh oil).
pub(crate) fn check_fill(tx: &Connection, id: &str, oil: &str, ml: i64) -> Result<String> {
    let Some(b) = load(tx, id)? else { return invalid("Choose a godown barrel.") };
    if !b.active {
        return invalid(format!("{} is not in use.", b.label));
    }
    if b.oil != oil {
        return invalid(format!("{} holds {} oil. Choose a {} barrel.", b.label, oil_short(&b.oil).to_lowercase(), oil_short(oil).to_lowercase()));
    }
    let st = effective(tx, &b, Local::now());
    if st == "settling" || st == "ready" {
        return invalid(format!("{} is {} and cannot take fresh oil. Pick a barrel that is filling or empty.", b.label, st));
    }
    if b.level + ml > b.capacity {
        return invalid(format!("{} has room for only {} L.", b.label, fmt_l(b.capacity - b.level)));
    }
    Ok(b.id)
}

/// Oil into a barrel (pressing or an outsourced purchase). The barrel becomes "filling".
pub(crate) fn fill(tx: &Connection, now: DateTime<Local>, id: &str, kind: &str, ml: i64, ref_type: &str, ref_id: &str, note: &str) -> Result<()> {
    post(tx, now, id, kind, ml, ref_type, ref_id, note)?;
    tx.execute(
        "UPDATE godown_barrels SET status='filling', filled_on=COALESCE(filled_on,?1), settle_started_on=NULL WHERE id=?2",
        params![iso(now), id],
    )?;
    Ok(())
}

fn become_empty(tx: &Connection, id: &str) -> Result<()> {
    tx.execute("UPDATE godown_barrels SET status='empty', filled_on=NULL, settle_started_on=NULL WHERE id=?1 AND level_ml=0", [id])?;
    Ok(())
}

// ---------- barrels: add, edit, status ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddBarrels {
    pub oil: String,
    pub count: i64,
    /// Capacity of each, millilitres (default 200 L).
    #[serde(default)]
    pub capacity_l: Option<i64>,
}

pub fn add_godown_barrels(conn: &mut Connection, d: &AddBarrels) -> Result<Value> {
    if !OILS.contains(&d.oil.as_str()) {
        return invalid("Choose the oil: groundnut, sesame or coconut.");
    }
    if !(1..=30).contains(&d.count) {
        return invalid("Add between 1 and 30 barrels at a time.");
    }
    let cap = d.capacity_l.unwrap_or(200_000);
    if cap <= 0 {
        return invalid("The barrel size must be more than zero.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for _ in 0..d.count {
        let n: i64 = tx.query_row("SELECT COALESCE(MAX(CAST(SUBSTR(id,4) AS INTEGER)),0)+1 FROM godown_barrels", [], |r| r.get(0))?;
        let mut k = tx.query_row("SELECT COUNT(*)+1 FROM godown_barrels WHERE oil=?1", [&d.oil], |r| r.get::<_, i64>(0))?;
        let label = loop {
            let l = format!("{} {}", oil_short(&d.oil), k);
            let used: i64 = tx.query_row("SELECT COUNT(*) FROM godown_barrels WHERE label=?1", [&l], |r| r.get(0))?;
            if used == 0 {
                break l;
            }
            k += 1;
        };
        tx.execute(
            "INSERT INTO godown_barrels(id,label,oil,capacity_ml,created_at) VALUES(?1,?2,?3,?4,?5)",
            params![format!("GB-{n:03}"), label, d.oil, cap, iso(now)],
        )?;
    }
    audit(&tx, now, OFFICE, "create", "godown_barrel", &d.oil, &format!("{} x {} L", d.count, fmt_l(cap)))?;
    tx.commit()?;
    Ok(json!(list_godown_barrels(conn)?))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditBarrel {
    pub id: String,
    pub label: String,
    pub capacity_l: i64,
    #[serde(default = "yes")]
    pub active: bool,
}
fn yes() -> bool {
    true
}

pub fn edit_godown_barrel(conn: &mut Connection, d: &EditBarrel) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(b) = load(&tx, &d.id)? else { return invalid("Barrel not found.") };
    let label = d.label.trim();
    if label.is_empty() {
        return invalid("Give the barrel a name.");
    }
    if d.capacity_l < b.level || d.capacity_l <= 0 {
        return invalid(format!("The barrel holds {} L now, so its size cannot be less than that.", fmt_l(b.level)));
    }
    if !d.active && b.level > 0 {
        return invalid("Empty the barrel before taking it out of use.");
    }
    let dup: i64 = tx.query_row("SELECT COUNT(*) FROM godown_barrels WHERE label=?1 AND id<>?2", params![label, d.id], |r| r.get(0))?;
    if dup > 0 {
        return invalid("Another barrel already has that name.");
    }
    tx.execute(
        "UPDATE godown_barrels SET label=?1, capacity_ml=?2, active=?3 WHERE id=?4",
        params![label, d.capacity_l, d.active as i64, d.id],
    )?;
    audit(&tx, Local::now(), OFFICE, "update", "godown_barrel", &d.id, &format!("{label}, {} L, active {}", fmt_l(d.capacity_l), d.active))?;
    tx.commit()?;
    let row = load(conn, &d.id)?.ok_or_else(|| db::internal("barrel vanished"))?;
    barrel_json(conn, &row, Local::now())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInput {
    pub barrel_id: String,
    /// "settle" (stop filling, start settling) | "ready" (settled early) | "reopen" (back to filling).
    pub action: String,
}

pub fn set_godown_status(conn: &mut Connection, d: &StatusInput) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(b) = load(&tx, &d.barrel_id)? else { return invalid("Barrel not found.") };
    let st = effective(&tx, &b, now);
    match d.action.as_str() {
        "settle" => {
            if st != "filling" {
                return invalid(format!("{} is {}. Only a barrel that is being filled can be left to settle.", b.label, st));
            }
            tx.execute("UPDATE godown_barrels SET status='settling', settle_started_on=?1 WHERE id=?2", params![iso(now), b.id])?;
        }
        "ready" => {
            if st != "settling" {
                return invalid(format!("{} is {}. Only a settling barrel can be marked ready.", b.label, st));
            }
            tx.execute("UPDATE godown_barrels SET status='ready' WHERE id=?1", [&b.id])?;
        }
        "reopen" => {
            if st != "settling" && st != "ready" {
                return invalid(format!("{} is {}.", b.label, st));
            }
            tx.execute("UPDATE godown_barrels SET status='filling', settle_started_on=NULL WHERE id=?1", [&b.id])?;
        }
        _ => return invalid("Unknown action."),
    }
    audit(&tx, now, OFFICE, &format!("godown_{}", d.action), "godown_barrel", &b.id, &format!("{} at {} L", b.label, fmt_l(b.level)))?;
    tx.commit()?;
    let row = load(conn, &d.barrel_id)?.ok_or_else(|| db::internal("barrel vanished"))?;
    barrel_json(conn, &row, now)
}

// ---------- end-of-day stick reading ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickInput {
    pub barrel_id: String,
    /// What the stick shows, millilitres.
    pub measured_l: i64,
    #[serde(default)]
    pub note: String,
}

/// The stick is the truth: the barrel's level becomes the measured litres and the difference to the entries is kept as a
/// variance (reading row + a ledger row), so a short or surplus barrel is visible, not hidden.
pub fn record_stick_reading(conn: &mut Connection, d: &StickInput) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(b) = load(&tx, &d.barrel_id)? else { return invalid("Barrel not found.") };
    if d.measured_l < 0 {
        return invalid("The reading cannot be negative.");
    }
    if d.measured_l > b.capacity {
        return invalid(format!("{} holds {} L at most. Check the reading.", b.label, fmt_l(b.capacity)));
    }
    let variance = d.measured_l - b.level;
    tx.execute(
        "INSERT INTO godown_readings(barrel_id,at,day,measured_ml,system_ml,variance_ml,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![b.id, iso(now), db::day_of(now), d.measured_l, b.level, variance, d.note.trim(), db::actor_or(OFFICE)],
    )?;
    if variance != 0 {
        post(&tx, now, &b.id, "stick", variance, "reading", &b.id, &format!("Stick {} L, entries {} L", fmt_l(d.measured_l), fmt_l(b.level)))?;
    }
    if d.measured_l == 0 {
        become_empty(&tx, &b.id)?;
    } else if b.level == 0 {
        tx.execute("UPDATE godown_barrels SET status='filling', filled_on=COALESCE(filled_on,?1) WHERE id=?2", params![iso(now), b.id])?;
    }
    audit(&tx, now, OFFICE, "stick_reading", "godown_barrel", &b.id, &format!("{}: stick {} L, entries {} L, variance {} L", b.label, fmt_l(d.measured_l), fmt_l(b.level), fmt_l(variance)))?;
    tx.commit()?;
    let row = load(conn, &d.barrel_id)?.ok_or_else(|| db::internal("barrel vanished"))?;
    barrel_json(conn, &row, now)
}

// ---------- outsourced oil ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutsourcedInput {
    pub barrel_id: String,
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub supplier_name: String,
    pub litres_l: i64,
    /// Total cost, paise.
    #[serde(default)]
    pub cost: i64,
    #[serde(default)]
    pub note: String,
}

fn outsourced_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let ml: i64 = r.get(6)?;
    let cost: i64 = r.get(7)?;
    let oil: String = r.get(3)?;
    Ok(json!({
        "id": format!("gp{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "date": r.get::<_, String>(2)?, "oil": oil,
        "oilName": seed_base(&oil).map(|b| b.oil_name).unwrap_or(""), "barrelId": r.get::<_, String>(4)?, "supplierName": r.get::<_, String>(5)?,
        "litresL": ml, "cost": cost, "ratePerL": if ml > 0 { db::round_div(cost * 1000, ml) } else { 0 },
        "note": r.get::<_, String>(8)?, "barrelLabel": r.get::<_, String>(9)?, "supplierId": r.get::<_, Option<String>>(10)?, "by": r.get::<_, String>(11)?,
    }))
}

const OUTSOURCED_SELECT: &str = "SELECT p.id,p.number,p.at,p.oil,p.barrel_id,p.supplier_name,p.litres_ml,p.cost,p.note,b.label,p.supplier_id,p.by_name
    FROM godown_purchases p JOIN godown_barrels b ON b.id=p.barrel_id";

pub fn record_outsourced_oil(conn: &mut Connection, d: &OutsourcedInput) -> Result<Value> {
    if d.litres_l <= 0 {
        return invalid("Enter the litres bought.");
    }
    if d.cost < 0 {
        return invalid("The cost cannot be negative.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(b) = load(&tx, &d.barrel_id)? else { return invalid("Choose a godown barrel.") };
    check_fill(&tx, &b.id, &b.oil, d.litres_l)?;
    let (sid, sname): (Option<String>, String) = match d.supplier_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => {
            let n: Option<String> = tx.query_row("SELECT name FROM suppliers WHERE id=?1", [id], |r| r.get(0)).optional()?;
            let Some(n) = n else { return invalid("That supplier does not exist.") };
            (Some(id.to_string()), n)
        }
        None => {
            let n = d.supplier_name.trim();
            if n.is_empty() {
                return invalid("Enter the manufacturer or supplier you bought the oil from.");
            }
            (None, n.to_string())
        }
    };
    let fy = fy_of(now);
    let seq = next_seq(&tx, PURCHASE_SERIES, &fy)?;
    let number = doc_number("GP", &fy, seq);
    tx.execute(
        "INSERT INTO godown_purchases(number,series,fy,seq,at,day,barrel_id,oil,supplier_id,supplier_name,litres_ml,cost,note,by_name)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![number, PURCHASE_SERIES, fy, seq, iso(now), db::day_of(now), b.id, b.oil, sid, sname, d.litres_l, d.cost, d.note.trim(), db::actor_or(OFFICE)],
    )?;
    let id = tx.last_insert_rowid();
    fill(&tx, now, &b.id, "outsourced", d.litres_l, "godown_purchase", &id.to_string(), &format!("Outsourced oil {number} from {sname}"))?;
    audit(&tx, now, OFFICE, "create", "godown_purchase", &number, &format!("{} L {} oil from {sname} into {}", fmt_l(d.litres_l), b.oil, b.label))?;
    let out = tx.query_row(&format!("{OUTSOURCED_SELECT} WHERE p.id=?1"), [id], outsourced_json)?;
    tx.commit()?;
    Ok(out)
}

pub fn list_outsourced_oil(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{OUTSOURCED_SELECT} ORDER BY p.at DESC, p.id DESC LIMIT ?1"))?;
    let v = st.query_map([limit.clamp(1, 2000)], outsourced_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

// ---------- transfer to the store ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
    pub barrel_id: String,
    /// The store loose-oil item that receives the litres.
    pub item_id: String,
    pub litres_l: i64,
    /// Optional: the store barrel at the counter that the oil is poured into (its level goes up too).
    #[serde(default)]
    pub store_barrel_id: Option<String>,
    #[serde(default)]
    pub note: String,
}

fn transfer_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let oil: String = r.get(3)?;
    Ok(json!({
        "id": format!("gt{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "date": r.get::<_, String>(2)?, "oil": oil,
        "oilName": seed_base(&oil).map(|b| b.oil_name).unwrap_or(""), "barrelId": r.get::<_, String>(4)?, "barrelLabel": r.get::<_, String>(5)?,
        "itemId": r.get::<_, String>(6)?, "itemName": r.get::<_, String>(7)?, "litresL": r.get::<_, i64>(8)?,
        "storeBarrelId": r.get::<_, Option<String>>(9)?, "note": r.get::<_, String>(10)?, "by": r.get::<_, String>(11)?,
    }))
}

const TRANSFER_SELECT: &str = "SELECT t.id,t.number,t.at,t.oil,t.barrel_id,b.label,t.item_id,t.item_name,t.litres_ml,t.store_barrel_id,t.note,t.by_name
    FROM godown_transfers t JOIN godown_barrels b ON b.id=t.barrel_id";

/// Settled oil from a godown barrel to the store: the litres leave the godown barrel and are added to the store item's stock,
/// each with a ledger row, in one transaction. Only a settled ("ready") barrel can be transferred from.
pub fn transfer_to_store(conn: &mut Connection, d: &TransferInput) -> Result<Value> {
    let now = Local::now();
    if d.litres_l <= 0 {
        return invalid("Enter the litres to move to the store.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(b) = load(&tx, &d.barrel_id)? else { return invalid("Choose a godown barrel.") };
    let st = effective(&tx, &b, now);
    if st != "ready" {
        return invalid(format!("{} is {}. Oil can go to the store only after it has settled (mark the barrel ready first).", b.label, st));
    }
    if d.litres_l > b.level {
        return invalid(format!("{} holds only {} L.", b.label, fmt_l(b.level)));
    }
    let item: Option<(String, i64, String)> = tx
        .query_row("SELECT name,loose,kind FROM items WHERE id=?1 AND active=1", [&d.item_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let Some((item_name, loose, kind)) = item else { return invalid("Choose the store loose-oil item that receives the oil.") };
    if loose != 1 || kind != "item" {
        return invalid("The oil can only go to a loose-oil item (sold by the litre at the counter).");
    }
    let store_barrel = d.store_barrel_id.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(sb) = store_barrel {
        let row: Option<(i64, i64, Option<String>)> = tx
            .query_row("SELECT capacity_ml,level_ml,oil_name FROM barrels WHERE id=?1", [sb], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()?;
        let Some((cap, level, cur)) = row else { return invalid("Store barrel not found.") };
        let wanted = item_name.strip_suffix(" (Loose)").unwrap_or(&item_name).to_string();
        if level > 0 && cur.as_deref().map(|c| c != wanted).unwrap_or(false) {
            return invalid(format!("That store barrel holds {}. Keep one oil per barrel.", cur.unwrap_or_default()));
        }
        if level + d.litres_l > cap {
            return invalid(format!("That store barrel has room for only {} L.", fmt_l(cap - level)));
        }
        tx.execute(
            "UPDATE barrels SET level_ml = level_ml + ?1, oil_name = COALESCE(oil_name, ?2), seed = COALESCE(seed, ?3), filled_on = COALESCE(filled_on, ?4) WHERE id=?5",
            params![d.litres_l, wanted, b.oil, iso(now), sb],
        )?;
    }
    let fy = fy_of(now);
    let seq = next_seq(&tx, TRANSFER_SERIES, &fy)?;
    let number = doc_number("GT", &fy, seq);
    tx.execute(
        "INSERT INTO godown_transfers(number,series,fy,seq,at,day,barrel_id,oil,item_id,item_name,litres_ml,store_barrel_id,note,by_name)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![number, TRANSFER_SERIES, fy, seq, iso(now), db::day_of(now), b.id, b.oil, d.item_id, item_name, d.litres_l, store_barrel, d.note.trim(), db::actor_or(OFFICE)],
    )?;
    let id = tx.last_insert_rowid();
    post(&tx, now, &b.id, "transfer", -d.litres_l, "godown_transfer", &id.to_string(), &format!("{number} to store: {item_name}"))?;
    // Keep a partly emptied barrel "ready" for good (it will not drift back); an emptied one is free again.
    tx.execute("UPDATE godown_barrels SET status='ready' WHERE id=?1 AND level_ml>0", [&b.id])?;
    become_empty(&tx, &b.id)?;
    post_movement(&tx, &iso(now), &d.item_id, "production", d.litres_l, "godown_transfer", &id.to_string(), &format!("{number} from {}", b.label), OFFICE)?;
    audit(&tx, now, OFFICE, "transfer_to_store", "godown_transfer", &number, &format!("{} L from {} to {item_name}", fmt_l(d.litres_l), b.label))?;
    let out = tx.query_row(&format!("{TRANSFER_SELECT} WHERE t.id=?1"), [id], transfer_json)?;
    tx.commit()?;
    Ok(out)
}

pub fn list_godown_transfers(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{TRANSFER_SELECT} ORDER BY t.at DESC, t.id DESC LIMIT ?1"))?;
    let v = st.query_map([limit.clamp(1, 2000)], transfer_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

// ---------- one barrel's story ----------

/// The ledger of one godown barrel with its readings and the batches that filled it (newest first).
pub fn get_godown_barrel(conn: &Connection, id: &str) -> Result<Value> {
    let now = Local::now();
    let Some(b) = load(conn, id)? else { return invalid("Barrel not found.") };
    let mut st = conn.prepare("SELECT at,kind,qty_ml,note,by_name,ref_type,ref_id FROM godown_movements WHERE barrel_id=?1 ORDER BY id DESC LIMIT 300")?;
    let ledger = st
        .query_map([id], |r| {
            Ok(json!({ "at": r.get::<_, String>(0)?, "kind": r.get::<_, String>(1)?, "qtyL": r.get::<_, i64>(2)?, "note": r.get::<_, String>(3)?, "by": r.get::<_, String>(4)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut st = conn.prepare("SELECT at,measured_ml,system_ml,variance_ml,note,by_name FROM godown_readings WHERE barrel_id=?1 ORDER BY id DESC LIMIT 60")?;
    let readings = st
        .query_map([id], |r| {
            Ok(json!({ "at": r.get::<_, String>(0)?, "measuredL": r.get::<_, i64>(1)?, "systemL": r.get::<_, i64>(2)?, "varianceL": r.get::<_, i64>(3)?, "note": r.get::<_, String>(4)?, "by": r.get::<_, String>(5)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "barrel": barrel_json(conn, &b, now)?, "ledger": ledger, "readings": readings }))
}

// =====================================================================
// Mill daily sheet: a report, filled from the day's entries (nothing is typed twice)
// =====================================================================

const CAKE_KEYS: [(&str, &str); 5] = [
    ("kadalai_w", "Groundnut cake W"),
    ("kadalai_r", "Groundnut cake R"),
    ("ellu_w", "Sesame cake W"),
    ("ellu_r", "Sesame cake R"),
    ("coco", "Coconut cake"),
];

fn ledger_before(conn: &Connection, item: &str, at: &str) -> Result<i64> {
    Ok(conn.query_row("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND at < ?2", params![item, at], |r| r.get(0))?)
}

fn item_sum(conn: &Connection, item: &str, start: &str, end: &str, kinds: &str) -> Result<i64> {
    Ok(conn.query_row(
        &format!("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND at >= ?2 AND at < ?3 AND ({kinds})"),
        params![item, start, end],
        |r| r.get(0),
    )?)
}

pub fn mill_daily(conn: &Connection, day: &str) -> Result<Value> {
    let (start, end) = (mill::day_start(day)?, mill::day_end(day)?);
    let now = Local::now();

    // seeds (kg): opening, bought, taken to the press, closing
    let mut seeds = vec![];
    for s in OILS {
        let base = seed_base(s).ok_or_else(|| db::internal("seed"))?;
        let opening = ledger_before(conn, base.rm, &start)?;
        let closing = ledger_before(conn, base.rm, &end)?;
        let bought = item_sum(conn, base.rm, &start, &end, "kind='purchase'")?;
        let to_press = -item_sum(conn, base.rm, &start, &end, "kind='production' AND ref_type='pressing'")?;
        seeds.push(json!({
            "seed": s, "label": base.label, "opening": opening, "bought": bought, "toPress": to_press,
            "other": closing - opening - bought + to_press, "closing": closing,
        }));
    }

    // godown barrels: every barrel in use or touched that day
    let mut barrels = vec![];
    {
        let mut st = conn.prepare(&format!("{ROW_SELECT} WHERE active=1 OR level_ml>0 OR id IN (SELECT barrel_id FROM godown_movements WHERE day=?1) ORDER BY oil, id"))?;
        let rows = st.query_map([day], row_of)?.collect::<rusqlite::Result<Vec<_>>>()?;
        for r in rows {
            let id = r.id.as_str();
            let before = |at: &str| -> Result<i64> {
                Ok(conn.query_row("SELECT COALESCE(SUM(qty_ml),0) FROM godown_movements WHERE barrel_id=?1 AND at < ?2", params![id, at], |x| x.get(0))?)
            };
            let window = |kind: &str| -> Result<i64> {
                Ok(conn.query_row(
                    "SELECT COALESCE(SUM(qty_ml),0) FROM godown_movements WHERE barrel_id=?1 AND at >= ?2 AND at < ?3 AND kind=?4",
                    params![id, start, end, kind],
                    |x| x.get(0),
                )?)
            };
            let opening = before(&start)?;
            let (press, outsourced, stick, transfer) = (window("press")?, window("outsourced")?, window("stick")?, window("transfer")?);
            let closing = before(&end)?;
            let reading: Option<(String, i64, i64)> = conn
                .query_row(
                    "SELECT at,measured_ml,variance_ml FROM godown_readings WHERE barrel_id=?1 AND day=?2 ORDER BY id DESC LIMIT 1",
                    params![r.id, day],
                    |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?)),
                )
                .optional()?;
            if opening == 0 && closing == 0 && press == 0 && outsourced == 0 && transfer == 0 && reading.is_none() {
                continue;
            }
            barrels.push(json!({
                "id": r.id, "label": r.label, "oil": r.oil, "status": effective(conn, &r, now), "capacityL": r.capacity,
                "openingL": opening, "pressedL": press, "outsourcedL": outsourced, "transferredL": -transfer, "stickAdjustL": stick, "closingL": closing,
                "reading": reading.map(|(at, m, v)| json!({ "at": at, "measuredL": m, "varianceL": v })),
            }));
        }
    }

    // oil per kind, summed from the barrels (the whole godown, never store stock)
    let mut oils = vec![];
    for o in OILS {
        let of = |k: &str| -> i64 { barrels.iter().filter(|b| b["oil"] == o).map(|b| b[k].as_i64().unwrap_or(0)).sum() };
        oils.push(json!({
            "oil": o, "label": seed_base(o).map(|b| b.oil_name).unwrap_or(""), "openingL": of("openingL"), "pressedL": of("pressedL"),
            "outsourcedL": of("outsourcedL"), "transferredL": of("transferredL"), "stickAdjustL": of("stickAdjustL"), "closingL": of("closingL"),
        }));
    }

    // oil cake: stock of each cake item, what the day made and what the counter sold
    let mut cake = vec![];
    for (key, label) in CAKE_KEYS {
        let Some(item) = mill::item_id_for(conn, key)? else { continue };
        let opening = ledger_before(conn, &item, &start)?;
        let closing = ledger_before(conn, &item, &end)?;
        let made = item_sum(conn, &item, &start, &end, "kind='production' AND ref_type='pressing'")?;
        let sold = item_sum(conn, &item, &start, &end, "kind IN ('sale','return','cancel')")?;
        if opening == 0 && closing == 0 && made == 0 && sold == 0 {
            continue;
        }
        cake.push(json!({ "key": key, "label": label, "opening": opening, "made": made, "sold": -sold, "other": closing - opening - made - sold, "closing": closing }));
    }

    let batches = purchasing::batches_on(conn, day)?;
    let mut t = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64); // seed in, cleaning, oil L, oil kg, cake, loss
    for b in &batches {
        let m = &b["metrics"];
        t.0 += m["seedInKg"].as_f64().unwrap_or(0.0);
        t.1 += m["cleaningKg"].as_f64().unwrap_or(0.0);
        t.2 += b["oilRawL"].as_i64().unwrap_or(0) as f64 / 1000.0;
        t.3 += m["oilKg"].as_f64().unwrap_or(0.0);
        t.4 += m["cakeKg"].as_f64().unwrap_or(0.0);
        t.5 += m["lossKg"].as_f64().unwrap_or(0.0);
    }
    let net = t.0 - t.1;
    let totals = json!({
        "batches": batches.len(), "seedInKg": t.0, "cleaningKg": t.1, "oilL": t.2, "oilKg": t.3, "cakeKg": t.4, "lossKg": t.5,
        "lossPct": if net > 0.0 { t.5 / net * 100.0 } else { 0.0 }, "kgSeedPerL": if t.2 > 0.0 { net / t.2 } else { 0.0 },
    });

    let mut st = conn.prepare(&format!("{TRANSFER_SELECT} WHERE t.day=?1 ORDER BY t.id"))?;
    let transfers = st.query_map([day], transfer_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut st = conn.prepare(&format!("{OUTSOURCED_SELECT} WHERE p.day=?1 ORDER BY p.id"))?;
    let outsourced = st.query_map([day], outsourced_json)?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(json!({
        "day": day, "seeds": seeds, "oils": oils, "barrels": barrels, "cake": cake, "batches": batches,
        "transfers": transfers, "outsourced": outsourced, "totals": totals,
    }))
}
