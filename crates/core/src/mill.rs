//! The mill daily sheet: the owner's paper form ("SRI GOKUL ENTERPRISES") as one screen.
//!
//! A sheet is a draft until it is closed. While it is a draft the rows (operator aravai, customer aravai, punnaku purchased,
//! counted closing stock) are only saved; NOTHING touches stock. Closing posts everything in ONE transaction:
//! operator rows become pressing batches (seed out, punnaku in, machine W/R), a customer's job work never touches shop seed
//! or oil stock (only a cake the shop keeps goes into stock), the charge becomes a credit bill on the customer's account
//! (service item, GST from the settings), punnaku purchased goes into stock, and any difference between the computed closing
//! stock and the counted stock is posted as stock adjustments. A closed sheet is read-only (its frozen copy is returned).
//!
//! Quantities are milli-units (kg x 1000, litres x 1000), like the rest of the backend. The ledger decides opening stock, so it
//! always equals the previous day's counted closing once that sheet is closed.

use crate::bills::write_bill;
use crate::catalog::{apply_adjustment, OFFICE};
use crate::db::{self, audit, get_setting, iso};
use crate::error::{invalid, Result};
use crate::money::{compute_totals, recalc_line};
use crate::purchasing::{create_pressing_in_tx, find_item_by_name, PressingDraft, JAGGERY_ITEM};
use crate::types::{BillDraft, BillLine, Payment};
use chrono::{Duration, Local, NaiveDate, TimeZone};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Map, Value};

pub const SEEDS: [&str; 3] = ["groundnut", "sesame", "copra"];

struct Def {
    key: &'static str,
    group: &'static str,
    label: &'static str,
    ta: &'static str,
    unit: &'static str,
}

/// Every stock line of the paper form, in the order of the sheet.
const STOCK: &[Def] = &[
    Def { key: "groundnut", group: "seed", label: "Groundnut", ta: "வேர்க்கடலை", unit: "kg" },
    Def { key: "sesame", group: "seed", label: "Sesame (Ellu)", ta: "எள்", unit: "kg" },
    Def { key: "copra", group: "seed", label: "Coconut (Copra)", ta: "கொப்பரை", unit: "kg" },
    Def { key: "kadalai_w", group: "punnaku", label: "Punnaku Kadalai W", ta: "கடலை புண்ணாக்கு W", unit: "kg" },
    Def { key: "kadalai_r", group: "punnaku", label: "Punnaku Kadalai R", ta: "கடலை புண்ணாக்கு R", unit: "kg" },
    Def { key: "ellu_w", group: "punnaku", label: "Punnaku Ellu W", ta: "எள் புண்ணாக்கு W", unit: "kg" },
    Def { key: "ellu_r", group: "punnaku", label: "Punnaku Ellu R", ta: "எள் புண்ணாக்கு R", unit: "kg" },
    Def { key: "coco", group: "punnaku", label: "Punnaku Coco", ta: "தேங்காய் புண்ணாக்கு", unit: "kg" },
    Def { key: "vellam", group: "other", label: "Vellam", ta: "வெல்லம்", unit: "kg" },
    Def { key: "malli", group: "other", label: "Malli", ta: "மல்லி", unit: "kg" },
    Def { key: "oil_groundnut", group: "oil", label: "Groundnut oil", ta: "கடலை எண்ணெய்", unit: "L" },
    Def { key: "oil_sesame", group: "oil", label: "Sesame oil", ta: "நல்லெண்ணெய்", unit: "L" },
    Def { key: "oil_coconut", group: "oil", label: "Coconut oil", ta: "தேங்காய் எண்ணெய்", unit: "L" },
];

pub const PUNNAKU_KEYS: [&str; 5] = ["kadalai_w", "kadalai_r", "ellu_w", "ellu_r", "coco"];

/// Punnaku key of a seed and machine ("coco" has no W/R split).
pub fn punnaku_key(seed: &str, machine: &str) -> &'static str {
    match (seed, machine) {
        ("groundnut", "R") => "kadalai_r",
        ("groundnut", _) => "kadalai_w",
        ("sesame", "R") => "ellu_r",
        ("sesame", _) => "ellu_w",
        _ => "coco",
    }
}

fn oil_key(seed: &str) -> &'static str {
    match seed {
        "sesame" => "oil_sesame",
        "copra" => "oil_coconut",
        _ => "oil_groundnut",
    }
}

/// Item name of a punnaku key. W keeps the item name the shop already uses at the counter; R is its twin.
fn punnaku_item_name(key: &str) -> &'static str {
    match key {
        "kadalai_r" => "Groundnut Oil Cake R (Loose)",
        "ellu_w" => "Gingelly Oil Cake (Loose)",
        "ellu_r" => "Gingelly Oil Cake R (Loose)",
        "coco" => "Coconut Oil Cake (Loose)",
        _ => "Groundnut Oil Cake (Loose)",
    }
}

const MALLI_ITEM: &str = "Malli (Coriander)";
const SERVICE_ITEM: &str = "Aravai Job Work (per kg)";
const SERVICE_CODE: &str = "SVC-ARAVAI";

fn oil_item_name(key: &str) -> &'static str {
    match key {
        "oil_sesame" => "Gingelly Oil (Loose)",
        "oil_coconut" => "Coconut Oil (Loose)",
        _ => "Groundnut Oil (Loose)",
    }
}

// ---------- settings ----------

pub struct MillSettings {
    pub operators: Vec<String>,
    pub rate_taken: i64,
    pub rate_kept: i64,
    pub sac: String,
    pub gst_rate: f64,
}

pub fn mill_settings(conn: &Connection) -> MillSettings {
    let v: Value = get_setting(conn, "bundle.mill").ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
    let operators: Vec<String> = v["operators"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .filter(|a: &Vec<String>| !a.is_empty())
        .unwrap_or_else(|| vec!["Ambethkar".into()]);
    MillSettings {
        operators,
        rate_taken: v["rateCakeTaken"].as_i64().unwrap_or(800),
        rate_kept: v["rateCakeKept"].as_i64().unwrap_or(500),
        sac: v["serviceSac"].as_str().unwrap_or("998811").to_string(),
        gst_rate: v["serviceGstRate"].as_f64().unwrap_or(5.0),
    }
}

pub fn default_mill_bundle() -> Value {
    json!({ "operators": ["Ambethkar"], "rateCakeTaken": 800, "rateCakeKept": 500, "serviceSac": "998811", "serviceGstRate": 5 })
}

// ---------- items ----------

fn fallback_category(conn: &Connection) -> Result<String> {
    let c: Option<String> = conn
        .query_row(
            "SELECT category_id FROM items WHERE kind='item' AND name LIKE '%Oil Cake%' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(c) = c {
        return Ok(c);
    }
    let c: Option<String> = conn.query_row("SELECT id FROM categories WHERE id NOT LIKE '\\_%' ESCAPE '\\' ORDER BY sort,rowid LIMIT 1", [], |r| r.get(0)).optional()?;
    match c {
        Some(c) => Ok(c),
        None => invalid("Add a category first."),
    }
}

#[allow(clippy::too_many_arguments)]
fn ensure_item(conn: &Connection, name: &str, code: &str, unit: &str, loose: bool, hsn: &str, gst: f64, price: i64, cost: i64, service: bool) -> Result<String> {
    if let Some(id) = find_item_by_name(conn, name)? {
        return Ok(id);
    }
    let cat = fallback_category(conn)?;
    let id = db::fresh_id(conn, "items", "i", "ITEM")?;
    let code = {
        let mut c = code.to_string();
        let mut n = 1;
        while conn.query_row("SELECT COUNT(*) FROM items WHERE code=?1", [&c], |r| r.get::<_, i64>(0))? > 0 {
            n += 1;
            c = format!("{code}-{n}");
        }
        c
    };
    conn.execute(
        "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at,kind,service)
         VALUES(?1,?2,?3,?4,'Gokul',?5,?6,?7,?8,?9,?9,?10,0,0,1,?11,'item',?12)",
        params![id, code, name, cat, unit, loose as i64, hsn, gst, price, cost, iso(Local::now()), service as i64],
    )?;
    Ok(id)
}

/// The stock item behind a punnaku key (created the first time it is needed: Kadalai R, Ellu R, ...).
pub fn ensure_punnaku_item(conn: &Connection, seed: &str, machine: &str) -> Result<String> {
    let key = punnaku_key(seed, machine);
    let name = punnaku_item_name(key);
    let (price, cost): (i64, i64) = conn
        .query_row("SELECT price,cost FROM items WHERE name LIKE '%Oil Cake%' AND kind='item' ORDER BY rowid LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?
        .unwrap_or((4500, 3500));
    ensure_item(conn, name, &format!("PK-{}", key.to_uppercase().replace('_', "")), "kg", true, "2305", 5.0, price, cost, false)
}

fn ensure_all_items(conn: &Connection) -> Result<()> {
    for k in PUNNAKU_KEYS {
        let (seed, machine) = match k {
            "kadalai_w" => ("groundnut", "W"),
            "kadalai_r" => ("groundnut", "R"),
            "ellu_w" => ("sesame", "W"),
            "ellu_r" => ("sesame", "R"),
            _ => ("copra", "W"),
        };
        ensure_punnaku_item(conn, seed, machine)?;
    }
    ensure_item(conn, JAGGERY_ITEM, "VELLAM", "kg", true, "1701", 0.0, 9000, 7000, false)?;
    ensure_item(conn, MALLI_ITEM, "MALLI", "kg", true, "0909", 0.0, 20000, 16000, false)?;
    Ok(())
}

pub(crate) fn item_id_for(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(match key {
        "groundnut" => Some("rm-gn".to_string()),
        "sesame" => Some("rm-sesame".to_string()),
        "copra" => Some("rm-copra".to_string()),
        "vellam" => find_item_by_name(conn, JAGGERY_ITEM)?,
        "malli" => find_item_by_name(conn, MALLI_ITEM)?,
        k if k.starts_with("oil_") => find_item_by_name(conn, oil_item_name(k))?,
        k => find_item_by_name(conn, punnaku_item_name(k))?,
    })
}

// ---------- days ----------

pub(crate) fn day_start(day: &str) -> Result<String> {
    let d = NaiveDate::parse_from_str(day, "%Y-%m-%d").map_err(|_| crate::error::ApiError::Invalid("The date looks wrong.".into()))?;
    Ok(iso(Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().unwrap_or_else(Local::now)))
}

pub(crate) fn day_end(day: &str) -> Result<String> {
    let d = NaiveDate::parse_from_str(day, "%Y-%m-%d").map_err(|_| crate::error::ApiError::Invalid("The date looks wrong.".into()))? + Duration::days(1);
    Ok(iso(Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().unwrap_or_else(Local::now)))
}

/// When the sheet's own postings are stamped: now for today's sheet, 20:00 for a back-dated one.
pub(crate) fn posting_time(day: &str) -> chrono::DateTime<Local> {
    let now = Local::now();
    if db::day_of(now) == day {
        return now;
    }
    NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .ok()
        .and_then(|d| Local.from_local_datetime(&d.and_hms_opt(20, 0, 0).unwrap()).earliest())
        .unwrap_or(now)
}

// ---------- sheet rows ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpRow {
    pub operator: String,
    pub seed: String,
    #[serde(default)]
    pub machine: String,
    pub seed_kg: i64,
    #[serde(default)]
    pub oil_l: i64,
    #[serde(default)]
    pub cake_kg: i64,
    #[serde(default)]
    pub jaggery_kg: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustRow {
    pub customer_id: String,
    pub seed: String,
    #[serde(default)]
    pub machine: String,
    pub seed_kg: i64,
    #[serde(default)]
    pub oil_l: i64,
    #[serde(default)]
    pub cake_kg: i64,
    /// taken = the customer takes the cake (higher rate); kept = the shop keeps it (lower rate, cake goes into shop stock)
    #[serde(default)]
    pub cake_mode: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PunnakuRow {
    pub punnaku: String,
    pub qty_kg: i64,
    #[serde(default)]
    pub supplier_id: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetInput {
    pub day: String,
    #[serde(default)]
    pub supervisor: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub op_rows: Vec<OpRow>,
    #[serde(default)]
    pub cust_rows: Vec<CustRow>,
    #[serde(default)]
    pub punnaku_rows: Vec<PunnakuRow>,
    /// counted closing stock by key (milli-units); a missing key means "not counted"
    #[serde(default)]
    pub physical: Map<String, Value>,
}

fn machine_of(m: &str) -> String {
    if m.trim().eq_ignore_ascii_case("R") {
        "R".into()
    } else {
        "W".into()
    }
}

fn validate(conn: &Connection, i: &SheetInput) -> Result<()> {
    NaiveDate::parse_from_str(&i.day, "%Y-%m-%d").map_err(|_| crate::error::ApiError::Invalid("The date looks wrong.".into()))?;
    if i.day.as_str() > db::day_of(Local::now()).as_str() {
        return invalid("A mill sheet cannot be for a future day.");
    }
    let ops = mill_settings(conn).operators;
    for (n, r) in i.op_rows.iter().enumerate() {
        let n = n + 1;
        if !SEEDS.contains(&r.seed.as_str()) {
            return invalid(format!("Aravai (operator) row {n}: choose the seed."));
        }
        if r.operator.trim().is_empty() || !ops.iter().any(|o| o == r.operator.trim()) {
            return invalid(format!("Aravai (operator) row {n}: choose an operator from the list in Settings."));
        }
        if r.seed_kg <= 0 {
            return invalid(format!("Aravai (operator) row {n}: enter the seed weight."));
        }
        if r.oil_l < 0 || r.cake_kg < 0 || r.jaggery_kg < 0 {
            return invalid(format!("Aravai (operator) row {n}: weights cannot be negative."));
        }
    }
    for (n, r) in i.cust_rows.iter().enumerate() {
        let n = n + 1;
        if !SEEDS.contains(&r.seed.as_str()) {
            return invalid(format!("Aravai (customer) row {n}: choose the seed."));
        }
        let known: i64 = conn.query_row("SELECT COUNT(*) FROM customers WHERE id=?1", [&r.customer_id], |x| x.get(0))?;
        if known == 0 {
            return invalid(format!("Aravai (customer) row {n}: choose the customer."));
        }
        if r.seed_kg <= 0 {
            return invalid(format!("Aravai (customer) row {n}: enter the seed weight."));
        }
        if r.oil_l < 0 || r.cake_kg < 0 {
            return invalid(format!("Aravai (customer) row {n}: weights cannot be negative."));
        }
        if !["taken", "kept", ""].contains(&r.cake_mode.as_str()) {
            return invalid(format!("Aravai (customer) row {n}: the cake is either taken or kept."));
        }
        if r.cake_mode == "kept" && r.cake_kg <= 0 {
            return invalid(format!("Aravai (customer) row {n}: enter the cake the shop keeps."));
        }
    }
    for (n, r) in i.punnaku_rows.iter().enumerate() {
        if !PUNNAKU_KEYS.contains(&r.punnaku.as_str()) {
            return invalid(format!("Punnaku purchased row {}: choose the punnaku.", n + 1));
        }
        if r.qty_kg <= 0 {
            return invalid(format!("Punnaku purchased row {}: enter the weight.", n + 1));
        }
    }
    for (k, v) in &i.physical {
        if !STOCK.iter().any(|d| d.key == k) {
            return invalid(format!("Unknown stock line '{k}'."));
        }
        if let Some(x) = v.as_i64() {
            if x < 0 {
                return invalid("Counted stock cannot be negative.");
            }
        }
    }
    Ok(())
}

// ---------- save (draft) ----------

fn sheet_status(conn: &Connection, day: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT status FROM mill_sheets WHERE day=?1", [day], |r| r.get(0)).optional()?)
}

pub fn save_sheet(conn: &mut Connection, i: &SheetInput) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    validate(&tx, i)?;
    if sheet_status(&tx, &i.day)?.as_deref() == Some("closed") {
        return invalid("This sheet is closed. Closed sheets cannot be changed.");
    }
    let now = iso(Local::now());
    let physical = serde_json::to_string(&i.physical)?;
    tx.execute(
        "INSERT INTO mill_sheets(day,status,supervisor,note,physical_json,created_at,updated_at) VALUES(?1,'draft',?2,?3,?4,?5,?5)
         ON CONFLICT(day) DO UPDATE SET supervisor=excluded.supervisor, note=excluded.note, physical_json=excluded.physical_json, updated_at=excluded.updated_at",
        params![i.day, i.supervisor.trim(), i.note.trim(), physical, now],
    )?;
    for t in ["mill_op_rows", "mill_cust_jobs", "mill_punnaku_rows"] {
        tx.execute(&format!("DELETE FROM {t} WHERE day=?1"), [&i.day])?;
    }
    for r in &i.op_rows {
        tx.execute(
            "INSERT INTO mill_op_rows(day,operator,seed,machine,seed_g,oil_ml,cake_g,jaggery_g) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![i.day, r.operator.trim(), r.seed, machine_of(&r.machine), r.seed_kg, r.oil_l, r.cake_kg, r.jaggery_kg],
        )?;
    }
    for r in &i.cust_rows {
        let name: String = tx.query_row("SELECT name FROM customers WHERE id=?1", [&r.customer_id], |x| x.get(0))?;
        let mode = if r.cake_mode == "kept" { "kept" } else { "taken" };
        tx.execute(
            "INSERT INTO mill_cust_jobs(day,customer_id,customer_name,seed,machine,seed_g,oil_ml,cake_g,cake_mode) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![i.day, r.customer_id, name, r.seed, machine_of(&r.machine), r.seed_kg, r.oil_l, r.cake_kg, mode],
        )?;
    }
    for r in &i.punnaku_rows {
        tx.execute(
            "INSERT INTO mill_punnaku_rows(day,punnaku,qty_g,supplier_id,note) VALUES(?1,?2,?3,?4,?5)",
            params![i.day, r.punnaku, r.qty_kg, r.supplier_id, r.note.trim()],
        )?;
    }
    audit(&tx, Local::now(), OFFICE, "update", "mill_sheet", &i.day, &format!("{} operator rows, {} customer jobs, {} punnaku", i.op_rows.len(), i.cust_rows.len(), i.punnaku_rows.len()))?;
    tx.commit()?;
    get_sheet(conn, &i.day)
}

// ---------- computing the sheet ----------

#[derive(Default, Clone)]
struct Line {
    opening: i64,
    pressed: i64,
    purchased: i64,
    kept: i64,
    sold: i64,
    packed: i64,
    adjusted: i64,
    other: i64,
}

impl Line {
    fn computed(&self) -> i64 {
        self.opening + self.pressed + self.purchased + self.kept + self.sold + self.packed + self.adjusted + self.other
    }
}

fn ledger_before(conn: &Connection, item: &str, at: &str) -> Result<i64> {
    Ok(conn.query_row("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND at < ?2", params![item, at], |r| r.get(0))?)
}

/// What the previous closed sheet counted for an oil (or its computed closing), if there is one.
fn previous_oil_closing(conn: &Connection, day: &str, key: &str) -> Result<Option<i64>> {
    let snap: Option<String> = conn
        .query_row("SELECT snapshot_json FROM mill_sheets WHERE status='closed' AND day < ?1 ORDER BY day DESC LIMIT 1", [day], |r| r.get(0))
        .optional()?
        .flatten();
    let Some(s) = snap.and_then(|s| serde_json::from_str::<Value>(&s).ok()) else { return Ok(None) };
    Ok(s["stock"].as_array().and_then(|a| a.iter().find(|l| l["key"] == key)).map(|l| l["physical"].as_i64().unwrap_or_else(|| l["computed"].as_i64().unwrap_or(0))))
}

fn oil_opening(conn: &Connection, day: &str, key: &str) -> Result<i64> {
    if let Some(v) = previous_oil_closing(conn, day, key)? {
        return Ok(v);
    }
    let start = day_start(day)?;
    let loose = match item_id_for(conn, key)? {
        Some(id) => ledger_before(conn, &id, &start)?,
        None => 0,
    };
    let seed = match key {
        "oil_sesame" => "sesame",
        "oil_coconut" => "copra",
        _ => "groundnut",
    };
    // Oil pressed but still settling (not yet in a barrel) at the start of the day.
    let unmoved: i64 = conn.query_row(
        "SELECT COALESCE(SUM(oil_raw_ml),0) FROM pressing_batches WHERE status='active' AND seed=?1 AND day < ?2 AND (barrel_id IS NULL OR moved_on >= ?3)",
        params![seed, day, start],
        |r| r.get(0),
    )?;
    Ok(loose + unmoved)
}

/// Computes every stock line for a day. For a draft sheet the rows that are not posted yet are added as if posted.
fn compute_stock(conn: &Connection, day: &str, project: Option<&SheetInput>) -> Result<Vec<(usize, Line)>> {
    let (start, end) = (day_start(day)?, day_end(day)?);
    let mut out = vec![];
    for (idx, d) in STOCK.iter().enumerate() {
        let mut l = Line::default();
        let item = item_id_for(conn, d.key)?;
        if d.group == "oil" {
            l.opening = oil_opening(conn, day, d.key)?;
            l.pressed = conn.query_row(
                "SELECT COALESCE(SUM(oil_raw_ml),0) FROM pressing_batches WHERE status='active' AND day=?1 AND seed=?2",
                params![day, match d.key { "oil_sesame" => "sesame", "oil_coconut" => "copra", _ => "groundnut" }],
                |r| r.get(0),
            )?;
            if let Some(id) = &item {
                let mut st = conn.prepare_cached(
                    "SELECT kind, ref_type, COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND at >= ?2 AND at < ?3 GROUP BY kind, ref_type",
                )?;
                let rows = st.query_map(params![id, start, end], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, i64>(2)?)))?;
                for r in rows {
                    let (kind, rt, q) = r?;
                    match (kind.as_str(), rt.as_deref()) {
                        ("production", Some("pressing")) => {} // oil leaving the settling tank for a barrel: already counted when pressed
                        ("sale" | "return" | "cancel", _) => l.sold += q,
                        ("packing", _) => l.packed += q,
                        ("adjustment", _) => l.adjusted += q,
                        _ => l.other += q,
                    }
                }
            }
        } else if let Some(id) = &item {
            l.opening = ledger_before(conn, id, &start)?;
            let mut st = conn.prepare_cached(
                "SELECT kind, ref_type, COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND at >= ?2 AND at < ?3 GROUP BY kind, ref_type",
            )?;
            let rows = st.query_map(params![id, start, end], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, i64>(2)?)))?;
            for r in rows {
                let (kind, rt, q) = r?;
                match (kind.as_str(), rt.as_deref()) {
                    (_, Some("mill_job")) => l.kept += q,
                    ("production", Some("pressing")) => l.pressed += q,
                    ("purchase", _) => l.purchased += q,
                    ("sale" | "return" | "cancel", _) => l.sold += q,
                    ("packing", _) => l.packed += q,
                    ("adjustment", _) => l.adjusted += q,
                    _ => l.other += q,
                }
            }
        }
        out.push((idx, l));
    }
    if let Some(p) = project {
        let at = |key: &str| STOCK.iter().position(|d| d.key == key).unwrap();
        for r in &p.op_rows {
            let m = machine_of(&r.machine);
            out[at(&r.seed)].1.pressed -= r.seed_kg;
            out[at(punnaku_key(&r.seed, &m))].1.pressed += r.cake_kg;
            out[at("vellam")].1.pressed -= r.jaggery_kg;
            out[at(oil_key(&r.seed))].1.pressed += r.oil_l;
        }
        for r in &p.cust_rows {
            if r.cake_mode == "kept" {
                out[at(punnaku_key(&r.seed, &machine_of(&r.machine)))].1.kept += r.cake_kg;
            }
        }
        for r in &p.punnaku_rows {
            out[at(&r.punnaku)].1.purchased += r.qty_kg;
        }
    }
    Ok(out)
}

fn charge_for(kg_milli: i64, rate: i64) -> i64 {
    db::round_div(rate * kg_milli, 1000)
}

fn sheet_rows(conn: &Connection, day: &str, s: &MillSettings) -> Result<(Vec<Value>, Vec<Value>, Vec<Value>)> {
    let ops = {
        let mut st = conn.prepare(
            "SELECT o.id,o.operator,o.seed,o.machine,o.seed_g,o.oil_ml,o.cake_g,o.jaggery_g,COALESCE(b.number,''),o.imported FROM mill_op_rows o
             LEFT JOIN pressing_batches b ON b.id=o.batch_id WHERE o.day=?1 ORDER BY o.id",
        )?;
        let v = st
            .query_map([day], |r| {
                Ok(json!({ "id": format!("mo{}", r.get::<_, i64>(0)?), "operator": r.get::<_, String>(1)?, "seed": r.get::<_, String>(2)?, "machine": r.get::<_, String>(3)?,
                    "seedKg": r.get::<_, i64>(4)?, "oilL": r.get::<_, i64>(5)?, "cakeKg": r.get::<_, i64>(6)?, "jaggeryKg": r.get::<_, i64>(7)?, "batchNumber": r.get::<_, String>(8)?, "imported": r.get::<_, i64>(9)? == 1 }))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let custs = {
        let mut st = conn.prepare("SELECT id,customer_id,customer_name,seed,machine,seed_g,oil_ml,cake_g,cake_mode,rate,charge,bill_number FROM mill_cust_jobs WHERE day=?1 ORDER BY id")?;
        let v = st
            .query_map([day], |r| {
                let (seed_g, mode): (i64, String) = (r.get(5)?, r.get(8)?);
                let (mut rate, mut charge): (i64, i64) = (r.get(9)?, r.get(10)?);
                let bill: String = r.get(11)?;
                if bill.is_empty() {
                    // A draft shows the charge it will be billed at (today's settings).
                    rate = if mode == "kept" { s.rate_kept } else { s.rate_taken };
                    charge = charge_for(seed_g, rate);
                }
                Ok(json!({ "id": format!("mj{}", r.get::<_, i64>(0)?), "customerId": r.get::<_, String>(1)?, "customerName": r.get::<_, String>(2)?, "seed": r.get::<_, String>(3)?,
                    "machine": r.get::<_, String>(4)?, "seedKg": seed_g, "oilL": r.get::<_, i64>(6)?, "cakeKg": r.get::<_, i64>(7)?, "cakeMode": mode,
                    "rate": rate, "charge": charge, "billNumber": bill }))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let puns = {
        let mut st = conn.prepare(
            "SELECT p.id,p.punnaku,p.qty_g,p.supplier_id,COALESCE(s.name,''),p.note FROM mill_punnaku_rows p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.day=?1 ORDER BY p.id",
        )?;
        let v = st
            .query_map([day], |r| {
                Ok(json!({ "id": format!("mp{}", r.get::<_, i64>(0)?), "punnaku": r.get::<_, String>(1)?, "qtyKg": r.get::<_, i64>(2)?, "supplierId": r.get::<_, String>(3)?,
                    "supplierName": r.get::<_, String>(4)?, "note": r.get::<_, String>(5)? }))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    Ok((ops, custs, puns))
}

fn rows_as_input(day: &str, supervisor: &str, note: &str, ops: &[Value], custs: &[Value], puns: &[Value], physical: Map<String, Value>) -> SheetInput {
    SheetInput {
        day: day.to_string(),
        supervisor: supervisor.to_string(),
        note: note.to_string(),
        // a row already moved to Production is a real batch now: it must not be counted or posted a second time
        op_rows: ops.iter().filter(|v| v["imported"] != json!(true)).filter_map(|v| serde_json::from_value(v.clone()).ok()).collect(),
        cust_rows: custs.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect(),
        punnaku_rows: puns.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect(),
        physical,
    }
}

fn stock_json(lines: &[(usize, Line)], physical: &Map<String, Value>) -> Vec<Value> {
    lines
        .iter()
        .map(|(idx, l)| {
            let d = &STOCK[*idx];
            let computed = l.computed();
            let phys = physical.get(d.key).and_then(|v| v.as_i64());
            json!({
                "key": d.key, "group": d.group, "label": d.label, "ta": d.ta, "unit": d.unit,
                "opening": l.opening, "pressed": l.pressed, "purchased": l.purchased, "kept": l.kept, "sold": l.sold, "packed": l.packed,
                "adjusted": l.adjusted, "other": l.other, "computed": computed,
                "physical": phys, "variance": phys.map(|p| p - computed),
            })
        })
        .collect()
}

fn settings_json(s: &MillSettings) -> Value {
    json!({ "operators": s.operators, "rateCakeTaken": s.rate_taken, "rateCakeKept": s.rate_kept, "serviceSac": s.sac, "serviceGstRate": s.gst_rate })
}

/// The sheet of one day: a closed one comes back exactly as it was closed; anything else is computed live from the draft.
pub fn get_sheet(conn: &Connection, day: &str) -> Result<Value> {
    let s = mill_settings(conn);
    let row: Option<(String, String, String, String, Option<String>, Option<String>, String, String)> = conn
        .query_row(
            "SELECT status,supervisor,note,physical_json,snapshot_json,closed_at,closed_by,approved_by FROM mill_sheets WHERE day=?1",
            [day],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
        )
        .optional()?;
    if let Some((status, _, _, _, Some(snap), _, _, _)) = &row {
        if status == "closed" {
            if let Ok(v) = serde_json::from_str::<Value>(snap) {
                return Ok(v);
            }
        }
    }
    let (status, supervisor, note, physical, closed_at, closed_by, approved_by) = match row {
        Some((st, sup, note, phys, _, ca, cb, ab)) => (st, sup, note, serde_json::from_str::<Map<String, Value>>(&phys).unwrap_or_default(), ca, cb, ab),
        None => ("draft".into(), String::new(), String::new(), Map::new(), None, String::new(), String::new()),
    };
    let (ops, custs, puns) = sheet_rows(conn, day, &s)?;
    let input = rows_as_input(day, &supervisor, &note, &ops, &custs, &puns, physical.clone());
    let lines = compute_stock(conn, day, if status == "closed" { None } else { Some(&input) })?;
    Ok(sheet_value(day, &status, &supervisor, &note, &s, ops, custs, puns, stock_json(&lines, &physical), closed_at, &closed_by, &approved_by))
}

#[allow(clippy::too_many_arguments)]
fn sheet_value(
    day: &str,
    status: &str,
    supervisor: &str,
    note: &str,
    s: &MillSettings,
    ops: Vec<Value>,
    custs: Vec<Value>,
    puns: Vec<Value>,
    stock: Vec<Value>,
    closed_at: Option<String>,
    closed_by: &str,
    approved_by: &str,
) -> Value {
    let charge: i64 = custs.iter().map(|c| c["charge"].as_i64().unwrap_or(0)).sum();
    json!({
        "day": day, "status": status, "supervisor": supervisor, "note": note, "settings": settings_json(s),
        "opRows": ops, "custRows": custs, "punnakuRows": puns, "stock": stock, "aravaiCharge": charge,
        "closedAt": closed_at, "closedBy": closed_by, "approvedBy": approved_by,
    })
}

pub fn list_sheets(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT day,status,supervisor,closed_at,snapshot_json FROM mill_sheets ORDER BY day DESC LIMIT ?1")?;
    let v = st
        .query_map([limit.clamp(1, 400)], |r| {
            let snap: Option<String> = r.get(4)?;
            let snap: Value = snap.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
            let variances = snap["stock"].as_array().map(|a| a.iter().filter(|l| l["variance"].as_i64().unwrap_or(0) != 0).count()).unwrap_or(0);
            Ok(json!({ "day": r.get::<_, String>(0)?, "status": r.get::<_, String>(1)?, "supervisor": r.get::<_, String>(2)?, "closedAt": r.get::<_, Option<String>>(3)?,
                "aravaiCharge": snap["aravaiCharge"].as_i64().unwrap_or(0), "varianceCount": variances }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

// ---------- close ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseInput {
    pub day: String,
    #[serde(default)]
    pub manager_pin: Option<String>,
}

fn service_item(conn: &Connection, s: &MillSettings) -> Result<String> {
    let id = ensure_item(conn, SERVICE_ITEM, SERVICE_CODE, "kg", true, &s.sac, s.gst_rate, s.rate_taken, 0, true)?;
    // The SAC and GST rate always follow the settings.
    conn.execute("UPDATE items SET hsn=?1, gst_rate=?2, service=1 WHERE id=?3", params![s.sac, s.gst_rate, id])?;
    Ok(id)
}

pub fn close_sheet(conn: &mut Connection, c: &CloseInput) -> Result<Value> {
    let day = c.day.clone();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(status) = sheet_status(&tx, &day)? else { return invalid("Fill and save the sheet before closing it.") };
    if status == "closed" {
        return invalid("This sheet is already closed.");
    }
    let s = mill_settings(&tx);
    let (supervisor, note, physical_json): (String, String, String) =
        tx.query_row("SELECT supervisor,note,physical_json FROM mill_sheets WHERE day=?1", [&day], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    let physical: Map<String, Value> = serde_json::from_str(&physical_json).unwrap_or_default();
    let (ops, custs, puns) = sheet_rows(&tx, &day, &s)?;
    let input = rows_as_input(&day, &supervisor, &note, &ops, &custs, &puns, physical.clone());
    validate(&tx, &input)?;
    ensure_all_items(&tx)?;
    let at = posting_time(&day);
    let at_iso = iso(at);
    let who = db::actor_or(OFFICE);

    // 1. Operator aravai -> pressing batches.
    for (n, r) in input.op_rows.iter().enumerate() {
        if r.oil_l <= 0 {
            return invalid(format!("Aravai (operator) row {}: enter the oil that came out.", n + 1));
        }
        let batch = create_pressing_in_tx(
            &tx,
            &PressingDraft {
                seed: r.seed.clone(),
                seed_kg: r.seed_kg,
                cleaning_loss_kg: 0,
                jaggery_kg: r.jaggery_kg,
                oil_raw_l: r.oil_l,
                cake_kg: r.cake_kg,
                chekku: format!("{} {}", if machine_of(&r.machine) == "R" { "Rotary" } else { "Chekku" }, r.operator.trim()),
                operator: r.operator.trim().to_string(),
                machine: machine_of(&r.machine),
                godown_barrel_id: None,
                day: None,
                time: None,
            },
            at,
        )?;
        let number = batch["number"].as_str().unwrap_or("").to_string();
        let bid: i64 = tx.query_row("SELECT id FROM pressing_batches WHERE number=?1", [&number], |x| x.get(0))?;
        let row_id = ops[n]["id"].as_str().and_then(|s| s.strip_prefix("mo")).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
        tx.execute("UPDATE mill_op_rows SET batch_id=?1 WHERE id=?2", params![bid, row_id])?;
    }

    // 2. Customer aravai: never shop stock, except cake the shop keeps. The charge becomes one credit bill per customer.
    let service_id = if input.cust_rows.is_empty() { String::new() } else { service_item(&tx, &s)? };
    for r in &input.cust_rows {
        if r.cake_mode == "kept" {
            let key = punnaku_key(&r.seed, &machine_of(&r.machine));
            if let Some(item) = item_id_for(&tx, key)? {
                db::post_movement(&tx, &at_iso, &item, "production", r.cake_kg, "mill_job", &day, &format!("Cake kept from customer aravai, sheet {day}"), &who)?;
            }
        }
    }
    let mut by_customer: Vec<(String, Vec<(i64, i64, i64)>)> = vec![]; // customer -> (job row id, seed milli-kg, rate)
    for (n, r) in input.cust_rows.iter().enumerate() {
        let id = custs[n]["id"].as_str().and_then(|s| s.strip_prefix("mj")).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
        let rate = if r.cake_mode == "kept" { s.rate_kept } else { s.rate_taken };
        match by_customer.iter_mut().find(|(c, _)| *c == r.customer_id) {
            Some((_, v)) => v.push((id, r.seed_kg, rate)),
            None => by_customer.push((r.customer_id.clone(), vec![(id, r.seed_kg, rate)])),
        }
    }
    let round = db::load_settings(&tx)?.round_to_rupee;
    for (cust, jobs) in &by_customer {
        let lines: Vec<BillLine> = jobs
            .iter()
            .map(|(_, kg, rate)| {
                recalc_line(&BillLine { item_id: service_id.clone(), code: SERVICE_CODE.into(), name: SERVICE_ITEM.into(), unit: "kg".into(), qty: *kg, rate: *rate, discount: 0, gst_rate: s.gst_rate, cess_rate: 0.0, amount: 0 })
            })
            .collect();
        let total = compute_totals(&lines, 0, round).grand;
        if total <= 0 {
            for (id, kg, rate) in jobs {
                tx.execute("UPDATE mill_cust_jobs SET rate=?1, charge=0 WHERE id=?2", params![rate, id])?;
                let _ = kg;
            }
            continue;
        }
        let bill = write_bill(
            &tx,
            &BillDraft {
                customer_id: Some(cust.clone()),
                customer_name: None,
                lines,
                bill_discount: 0,
                payments: vec![Payment { mode: "credit".into(), amount: total, r#ref: Some(format!("Aravai {day}")) }],
                cashier: Some(who.clone()),
                manager_pin: None,
                extras: Default::default(),
            },
            at,
            None,
        )?;
        let bill_id: i64 = bill.id.trim_start_matches('b').parse().unwrap_or(0);
        for (id, kg, rate) in jobs {
            tx.execute(
                "UPDATE mill_cust_jobs SET rate=?1, charge=?2, bill_id=?3, bill_number=?4 WHERE id=?5",
                params![rate, charge_for(*kg, *rate), bill_id, bill.number, id],
            )?;
        }
    }

    // 3. Punnaku purchased.
    for r in &input.punnaku_rows {
        if let Some(item) = item_id_for(&tx, &r.punnaku)? {
            let from = if r.supplier_id.is_empty() {
                String::new()
            } else {
                tx.query_row("SELECT name FROM suppliers WHERE id=?1", [&r.supplier_id], |x| x.get::<_, String>(0)).optional()?.map(|n| format!(", {n}")).unwrap_or_default()
            };
            db::post_movement(&tx, &at_iso, &item, "purchase", r.qty_kg, "mill_sheet", &day, &format!("Punnaku purchased, sheet {day}{from}"), &who)?;
        }
    }

    // 4. Computed closing vs counted: the difference is posted as an adjustment row with a reason.
    let lines = compute_stock(&tx, &day, None)?;
    let mut posted = 0;
    for (idx, l) in &lines {
        let d = &STOCK[*idx];
        let Some(counted) = physical.get(d.key).and_then(|v| v.as_i64()) else { continue };
        let variance = counted - l.computed();
        if variance == 0 || d.group == "oil" {
            continue; // oil sits in barrels: a count difference there is a barrel stock take, it is only recorded on the sheet
        }
        let Some(item) = item_id_for(&tx, d.key)? else { continue };
        apply_adjustment(&tx, at, &item, "correction", variance, &format!("Mill sheet {day}: counted {} vs computed {}", counted / 1000, l.computed() / 1000), &who)?;
        posted += 1;
    }
    let (ops, custs, puns) = sheet_rows(&tx, &day, &s)?;
    let snapshot_stock = final_stock(&tx, &day, &physical)?;
    let now = iso(Local::now());
    let sheet = sheet_value(&day, "closed", &supervisor, &note, &s, ops, custs, puns, snapshot_stock, Some(now.clone()), &who, &db::approver_or_empty());
    tx.execute(
        "UPDATE mill_sheets SET status='closed', snapshot_json=?1, closed_at=?2, closed_by=?3, approved_by=?4, updated_at=?2 WHERE day=?5",
        params![sheet.to_string(), now, who, db::approver_or_empty(), day],
    )?;
    audit(&tx, Local::now(), &who, "close", "mill_sheet", &day, &format!("{} pressing batches, {} customer jobs, {} stock differences posted", input.op_rows.len(), input.cust_rows.len(), posted))?;
    tx.commit()?;
    Ok(sheet)
}

/// The closing columns as the supervisor saw them: computed BEFORE the variance adjustments were posted, so the printed
/// difference is the real one (the adjustment rows are listed in the "adjusted" column).
fn final_stock(conn: &Connection, day: &str, physical: &Map<String, Value>) -> Result<Vec<Value>> {
    let lines = compute_stock(conn, day, None)?;
    let mut out = vec![];
    for (idx, l) in lines {
        let d = &STOCK[idx];
        let counted = physical.get(d.key).and_then(|v| v.as_i64());
        // Ledger-based groups: take the sheet's own correction rows (ref "mill sheet") back out of the "adjusted" column.
        let mut l2 = l.clone();
        if d.group != "oil" {
            if let Some(item) = item_id_for(conn, d.key)? {
                let corr: i64 = conn.query_row(
                    "SELECT COALESCE(SUM(m.qty),0) FROM stock_movements m JOIN stock_adjustments a ON a.id = CAST(m.ref_id AS INTEGER)
                     WHERE m.item_id=?1 AND m.kind='adjustment' AND m.ref_type='adjustment' AND a.note LIKE ?2 AND m.at >= ?3 AND m.at < ?4",
                    params![item, format!("Mill sheet {day}:%"), day_start(day)?, day_end(day)?],
                    |r| r.get(0),
                )?;
                l2.adjusted -= corr;
            }
        }
        let computed = l2.computed();
        let variance = counted.map(|p| p - computed);
        out.push(json!({
            "key": d.key, "group": d.group, "label": d.label, "ta": d.ta, "unit": d.unit,
            "opening": l2.opening, "pressed": l2.pressed, "purchased": l2.purchased, "kept": l2.kept, "sold": l2.sold, "packed": l2.packed,
            "adjusted": l2.adjusted, "other": l2.other, "computed": computed, "physical": counted, "variance": variance,
        }));
    }
    Ok(out)
}

// =====================================================================
// The day sheet (production redo): supervisor, note and an optional evening count on top of the automatic daily report.
// It never touches the old manual-sheet rows (mill_op_rows, mill_cust_jobs, mill_punnaku_rows), which stay readable as an archive.
// =====================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayInput {
    pub day: String,
    #[serde(default)]
    pub supervisor: String,
    #[serde(default)]
    pub note: String,
    /// Counted stock {key: milli-units} for seeds, punnaku, vellam and malli (oil is counted in the godown with the stick)
    #[serde(default)]
    pub physical: Map<String, Value>,
}

fn legacy_open_rows(conn: &Connection, day: &str) -> Result<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM mill_op_rows WHERE day=?1 AND imported=0 AND batch_id IS NULL", [day], |r| r.get(0))?)
}

fn validate_counts(physical: &Map<String, Value>) -> Result<()> {
    for (k, v) in physical {
        let Some(d) = STOCK.iter().find(|d| d.key == k) else { return invalid(format!("Unknown stock line {k}.")) };
        if d.group == "oil" {
            return invalid("Oil is counted in the godown (stick reading), not on the day sheet.");
        }
        if v.as_i64().map(|n| n < 0).unwrap_or(true) {
            return invalid(format!("{}: the counted quantity must be zero or more.", d.label));
        }
    }
    Ok(())
}

/// The day's count sheet: expected stock for every line from the ledger, the counted stock, the difference. A closed day comes back frozen.
pub fn get_day(conn: &Connection, day: &str) -> Result<Value> {
    day_start(day)?;
    let s = mill_settings(conn);
    let row: Option<(String, String, String, String, Option<String>, Option<String>, String, String)> = conn
        .query_row(
            "SELECT status,supervisor,note,physical_json,snapshot_json,closed_at,closed_by,approved_by FROM mill_sheets WHERE day=?1",
            [day],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
        )
        .optional()?;
    if let Some((status, _, _, _, Some(snap), _, _, _)) = &row {
        if status == "closed" {
            if let Ok(mut v) = serde_json::from_str::<Value>(snap) {
                v["legacyOpenRows"] = json!(0);
                return Ok(v);
            }
        }
    }
    let (status, sup, note, physical, ca, cb, ab) = match row {
        Some((st, sup, note, phys, _, ca, cb, ab)) => (st, sup, note, serde_json::from_str::<Map<String, Value>>(&phys).unwrap_or_default(), ca, cb, ab),
        None => ("draft".into(), String::new(), String::new(), Map::new(), None, String::new(), String::new()),
    };
    let lines = compute_stock(conn, day, None)?;
    let mut v = sheet_value(day, &status, &sup, &note, &s, vec![], vec![], vec![], stock_json(&lines, &physical), ca, &cb, &ab);
    v["legacyOpenRows"] = json!(legacy_open_rows(conn, day)?);
    Ok(v)
}

/// Save the supervisor, note and counts of a day that is not closed. Leaves every other table alone.
pub fn save_day(conn: &mut Connection, i: &DayInput) -> Result<Value> {
    day_start(&i.day)?;
    validate_counts(&i.physical)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if sheet_status(&tx, &i.day)?.as_deref() == Some("closed") {
        return invalid("This day is closed. A closed day cannot be changed.");
    }
    let now = iso(Local::now());
    tx.execute(
        "INSERT INTO mill_sheets(day,status,supervisor,note,physical_json,created_at,updated_at) VALUES(?1,'draft',?2,?3,?4,?5,?5)
         ON CONFLICT(day) DO UPDATE SET supervisor=excluded.supervisor, note=excluded.note, physical_json=excluded.physical_json, updated_at=excluded.updated_at",
        params![i.day, i.supervisor.trim(), i.note.trim(), serde_json::to_string(&i.physical)?, now],
    )?;
    audit(&tx, Local::now(), &db::actor_or(OFFICE), "update", "mill_day", &i.day, &format!("{} counted lines", i.physical.len()))?;
    tx.commit()?;
    get_day(conn, &i.day)
}

/// Close the day: every counted line that differs from the ledger is posted as a stock adjustment with a reason, and the sheet is frozen.
/// Nothing else is posted: pressing and godown moves were already recorded as they happened.
pub fn close_day(conn: &mut Connection, c: &CloseInput) -> Result<Value> {
    let day = c.day.clone();
    day_start(&day)?;
    if day.as_str() > db::day_of(Local::now()).as_str() {
        return invalid("The date cannot be in the future.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if sheet_status(&tx, &day)?.as_deref() == Some("closed") {
        return invalid("This day is already closed.");
    }
    if legacy_open_rows(&tx, &day)? > 0 {
        return invalid("This day still has rows from an old manual sheet. Move them to Production (Mill day sheet, Old sheets) before closing the day.");
    }
    if sheet_status(&tx, &day)?.is_none() {
        let now = iso(Local::now());
        tx.execute("INSERT INTO mill_sheets(day,status,physical_json,created_at,updated_at) VALUES(?1,'draft','{}',?2,?2)", params![day, now])?;
    }
    let s = mill_settings(&tx);
    let (supervisor, note, physical_json): (String, String, String) =
        tx.query_row("SELECT supervisor,note,physical_json FROM mill_sheets WHERE day=?1", [&day], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    let physical: Map<String, Value> = serde_json::from_str(&physical_json).unwrap_or_default();
    let at = posting_time(&day);
    let who = db::actor_or(OFFICE);
    let lines = compute_stock(&tx, &day, None)?;
    let mut posted = 0;
    for (idx, l) in &lines {
        let d = &STOCK[*idx];
        let Some(counted) = physical.get(d.key).and_then(|v| v.as_i64()) else { continue };
        let variance = counted - l.computed();
        if variance == 0 || d.group == "oil" {
            continue;
        }
        let Some(item) = item_id_for(&tx, d.key)? else { continue };
        apply_adjustment(&tx, at, &item, "correction", variance, &format!("Mill sheet {day}: counted {} vs computed {}", counted / 1000, l.computed() / 1000), &who)?;
        posted += 1;
    }
    let stock = final_stock(&tx, &day, &physical)?;
    let now = iso(Local::now());
    let sheet = sheet_value(&day, "closed", &supervisor, &note, &s, vec![], vec![], vec![], stock, Some(now.clone()), &who, &db::approver_or_empty());
    tx.execute(
        "UPDATE mill_sheets SET status='closed', snapshot_json=?1, closed_at=?2, closed_by=?3, approved_by=?4, updated_at=?2 WHERE day=?5",
        params![sheet.to_string(), now, who, db::approver_or_empty(), day],
    )?;
    audit(&tx, Local::now(), &who, "close", "mill_day", &day, &format!("{posted} stock differences posted"))?;
    tx.commit()?;
    Ok(sheet)
}

// =====================================================================
// Job work (aravai for a customer): the customer brings their own seed. It is posted the moment it is entered: the customer's seed
// and oil never touch shop stock, a cake the shop keeps goes into stock, and the per-kg charge becomes a credit bill on the customer.
// =====================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobWorkInput {
    pub customer_id: String,
    pub seed: String,
    #[serde(default = "default_w")]
    pub machine: String,
    pub seed_kg: i64,
    #[serde(default)]
    pub oil_l: i64,
    #[serde(default)]
    pub cake_kg: i64,
    /// taken: the customer takes the cake (higher rate). kept: the shop keeps it (lower rate, cake goes into stock).
    #[serde(default = "default_taken")]
    pub cake_mode: String,
    #[serde(default)]
    pub day: Option<String>,
}

fn default_w() -> String {
    "W".into()
}
fn default_taken() -> String {
    "taken".into()
}

const JOB_SELECT: &str = "SELECT id,day,customer_id,customer_name,seed,machine,seed_g,oil_ml,cake_g,cake_mode,rate,charge,bill_number FROM mill_cust_jobs";

fn job_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": format!("mj{}", r.get::<_, i64>(0)?), "day": r.get::<_, String>(1)?, "customerId": r.get::<_, String>(2)?, "customerName": r.get::<_, String>(3)?,
        "seed": r.get::<_, String>(4)?, "machine": r.get::<_, String>(5)?, "seedKg": r.get::<_, i64>(6)?, "oilL": r.get::<_, i64>(7)?,
        "cakeKg": r.get::<_, i64>(8)?, "cakeMode": r.get::<_, String>(9)?, "rate": r.get::<_, i64>(10)?, "charge": r.get::<_, i64>(11)?, "billNumber": r.get::<_, String>(12)?,
    }))
}

pub fn record_job_work(conn: &mut Connection, i: &JobWorkInput) -> Result<Value> {
    if !SEEDS.contains(&i.seed.as_str()) {
        return invalid("Choose the seed.");
    }
    if i.seed_kg <= 0 {
        return invalid("Enter the seed weight.");
    }
    if i.oil_l < 0 || i.cake_kg < 0 {
        return invalid("Weights cannot be negative.");
    }
    let mode = if i.cake_mode == "kept" { "kept" } else { "taken" };
    if mode == "kept" && i.cake_kg <= 0 {
        return invalid("Enter the cake the shop keeps.");
    }
    let machine = machine_of(&i.machine);
    let today = db::day_of(Local::now());
    let day = i.day.clone().filter(|d| !d.is_empty()).unwrap_or_else(|| today.clone());
    day_start(&day)?;
    if day > today {
        return invalid("The day cannot be in the future.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(customer): Option<String> = tx.query_row("SELECT name FROM customers WHERE id=?1", [&i.customer_id], |r| r.get(0)).optional()? else {
        return invalid("Choose the customer.");
    };
    if sheet_status(&tx, &day)?.as_deref() == Some("closed") {
        return invalid("That day is closed. Choose another day.");
    }
    if sheet_status(&tx, &day)?.is_none() {
        let now = iso(Local::now());
        tx.execute("INSERT INTO mill_sheets(day,status,physical_json,created_at,updated_at) VALUES(?1,'draft','{}',?2,?2)", params![day, now])?;
    }
    let s = mill_settings(&tx);
    let at = posting_time(&day);
    let at_iso = iso(at);
    let who = db::actor_or(OFFICE);
    let rate = if mode == "kept" { s.rate_kept } else { s.rate_taken };
    tx.execute(
        "INSERT INTO mill_cust_jobs(day,customer_id,customer_name,seed,machine,seed_g,oil_ml,cake_g,cake_mode,rate,posted) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1)",
        params![day, i.customer_id, customer, i.seed, machine, i.seed_kg, i.oil_l, i.cake_kg, mode, rate],
    )?;
    let id = tx.last_insert_rowid();
    ensure_all_items(&tx)?;
    if mode == "kept" {
        if let Some(item) = item_id_for(&tx, punnaku_key(&i.seed, &machine))? {
            db::post_movement(&tx, &at_iso, &item, "production", i.cake_kg, "mill_job", &day, &format!("Cake kept from customer job work {day}"), &who)?;
        }
    }
    let service_id = service_item(&tx, &s)?;
    let line = recalc_line(&BillLine { item_id: service_id, code: SERVICE_CODE.into(), name: SERVICE_ITEM.into(), unit: "kg".into(), qty: i.seed_kg, rate, discount: 0, gst_rate: s.gst_rate, cess_rate: 0.0, amount: 0 });
    let lines = vec![line];
    let total = compute_totals(&lines, 0, db::load_settings(&tx)?.round_to_rupee).grand;
    if total > 0 {
        let bill = write_bill(
            &tx,
            &BillDraft {
                customer_id: Some(i.customer_id.clone()),
                customer_name: None,
                lines,
                bill_discount: 0,
                payments: vec![Payment { mode: "credit".into(), amount: total, r#ref: Some(format!("Job work {day}")) }],
                cashier: Some(who.clone()),
                manager_pin: None,
                extras: Default::default(),
            },
            at,
            None,
        )?;
        let bill_id: i64 = bill.id.trim_start_matches('b').parse().unwrap_or(0);
        tx.execute(
            "UPDATE mill_cust_jobs SET charge=?1, bill_id=?2, bill_number=?3 WHERE id=?4",
            params![charge_for(i.seed_kg, rate), bill_id, bill.number, id],
        )?;
    }
    audit(&tx, Local::now(), &who, "create", "mill_job", &id.to_string(), &format!("{} kg {} for {customer}", i.seed_kg / 1000, i.seed))?;
    let out = tx.query_row(&format!("{JOB_SELECT} WHERE id=?1"), [id], job_json)?;
    tx.commit()?;
    Ok(out)
}

/// Job work that has been posted (newest first), including the jobs of old closed sheets.
pub fn list_job_work(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{JOB_SELECT} WHERE posted=1 OR bill_number<>'' ORDER BY day DESC, id DESC LIMIT ?1"))?;
    let v = st.query_map([limit.clamp(1, 500)], job_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}
