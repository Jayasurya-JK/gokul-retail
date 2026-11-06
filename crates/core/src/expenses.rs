//! Expenses (petty cash and every other shop cost) and the voided-lines log.
//! An expense is never deleted: a void keeps the row with a reason. Cash-drawer expenses are subtracted from the
//! shift's expected cash (see `shift::summarise`); profit reports subtract every active expense.

use crate::db::{self, audit, doc_number, fy_of, get_setting, iso, next_seq, parse_id};
use crate::error::{invalid, Result};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Value};

pub const EXPENSE_SERIES: &str = "EXP";
const DEFAULT_LIMIT: i64 = 100_000; // Rs 1,000: above this a manager PIN is needed

pub fn expense_limit(conn: &Connection) -> i64 {
    get_setting(conn, "expense.limit").ok().flatten().and_then(|v| v.trim().parse().ok()).filter(|v: &i64| *v >= 0).unwrap_or(DEFAULT_LIMIT)
}

const COLS: &str = "id,number,at,day,category_id,category_name,paid_from,amount,paid_to,note,by_name,approved_by,status,void_reason,voided_at,voided_by,edit_count,shift_id";

fn row_json(r: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": format!("ex{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "at": r.get::<_, String>(2)?, "day": r.get::<_, String>(3)?,
        "categoryId": r.get::<_, String>(4)?, "category": r.get::<_, String>(5)?, "paidFrom": r.get::<_, String>(6)?,
        "amount": r.get::<_, i64>(7)?, "paidTo": r.get::<_, String>(8)?, "note": r.get::<_, String>(9)?, "by": r.get::<_, String>(10)?,
        "approvedBy": r.get::<_, String>(11)?, "status": r.get::<_, String>(12)?, "voidReason": r.get::<_, String>(13)?,
        "voidedAt": r.get::<_, Option<String>>(14)?, "voidedBy": r.get::<_, String>(15)?, "editCount": r.get::<_, i64>(16)?,
    }))
}

fn get(conn: &Connection, id: i64) -> Result<Value> {
    Ok(conn.query_row(&format!("SELECT {COLS} FROM expenses WHERE id=?1"), [id], row_json)?)
}

// ---------- categories ----------

pub fn list_categories(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,name,active FROM expense_categories ORDER BY sort,rowid")?;
    let v = st
        .query_map([], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "active": r.get::<_, i64>(2)? != 0 })))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// The categories editor sends the whole list in order: `[{id?, name, active}]`. New rows get an id; rows left out are
/// switched off (never deleted, old expenses keep their category name).
pub fn save_categories(conn: &mut Connection, cats: &[Value]) -> Result<Vec<Value>> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut seen: Vec<String> = vec![];
    for (i, c) in cats.iter().enumerate() {
        let name = c["name"].as_str().unwrap_or("").trim().to_string();
        if name.is_empty() {
            return invalid("A category needs a name.");
        }
        let active = c["active"].as_bool().unwrap_or(true) as i64;
        let id = match c["id"].as_str().filter(|s| !s.is_empty()) {
            Some(id) => id.to_string(),
            None => db::fresh_id(&tx, "expense_categories", "xc", "EXPCAT")?,
        };
        let dup: i64 = tx.query_row("SELECT COUNT(*) FROM expense_categories WHERE name=?1 AND id != ?2", params![name, id], |r| r.get(0))?;
        if dup > 0 {
            return invalid(format!("There is already a category named \"{name}\"."));
        }
        tx.execute(
            "INSERT INTO expense_categories(id,name,sort,active) VALUES(?1,?2,?3,?4)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort=excluded.sort, active=excluded.active",
            params![id, name, i as i64, active],
        )?;
        seen.push(id);
    }
    let all: Vec<String> = {
        let mut st = tx.prepare("SELECT id FROM expense_categories")?;
        let v = st.query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    for id in all.into_iter().filter(|id| !seen.contains(id)) {
        tx.execute("UPDATE expense_categories SET active=0 WHERE id=?1", [id])?;
    }
    audit(&tx, Local::now(), "Office", "update", "expense_categories", "", &format!("{} categories", cats.len()))?;
    tx.commit()?;
    list_categories(conn)
}

// ---------- add / edit / void ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInput {
    pub category_id: String,
    pub paid_from: String,
    pub amount: i64,
    #[serde(default)]
    pub paid_to: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub by: String,
    #[serde(default)]
    pub manager_pin: Option<String>,
    /// yyyy-mm-dd, Office only (a forgotten expense); the counter always records today.
    #[serde(default)]
    pub day: Option<String>,
}

fn open_shift_id(conn: &Connection) -> Result<Option<i64>> {
    Ok(conn.query_row("SELECT id FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).optional()?)
}

fn category_name(conn: &Connection, id: &str) -> Result<String> {
    let r: Option<(String, i64)> = conn.query_row("SELECT name,active FROM expense_categories WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    match r {
        Some((n, 1)) => Ok(n),
        Some(_) => invalid("That category is switched off. Choose another."),
        None => invalid("Choose a category."),
    }
}

pub fn add_expense(conn: &mut Connection, i: &ExpenseInput) -> Result<Value> {
    if !["cash", "upi", "bank"].contains(&i.paid_from.as_str()) {
        return invalid("Choose where the money was paid from.");
    }
    if i.amount <= 0 {
        return invalid("Enter an amount greater than zero.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cat = category_name(&tx, &i.category_id)?;
    let shift = open_shift_id(&tx)?;
    let day = match i.day.as_deref().filter(|d| !d.is_empty()) {
        Some(d) if chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok() => d.to_string(),
        Some(_) => return invalid("The date looks wrong."),
        None => db::day_of(now),
    };
    // An expense on another day is never tied to today's drawer.
    let shift = if day == db::day_of(now) { shift } else { None };
    if i.paid_from == "cash" && shift.is_none() {
        return invalid("Open the day before recording an expense paid from the cash drawer.");
    }
    let fy = fy_of(now);
    let seq = next_seq(&tx, EXPENSE_SERIES, &fy)?;
    let number = doc_number("EX", &fy, seq);
    let by = db::actor_or(&i.by);
    let approved = db::approver_or_empty();
    tx.execute(
        "INSERT INTO expenses(number,fy,seq,at,day,category_id,category_name,paid_from,amount,paid_to,note,by_name,approved_by,shift_id)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![number, fy, seq, iso(now), day, i.category_id, cat, i.paid_from, i.amount, i.paid_to.trim(), i.note.trim(), by, approved, shift],
    )?;
    let id = tx.last_insert_rowid();
    let appr = if approved.is_empty() { String::new() } else { format!(", approved by {approved}") };
    audit(&tx, now, &by, "expense", "expense", &number, &format!("{} paise {} from {}{}", i.amount, cat, i.paid_from, appr))?;
    let out = get(&tx, id)?;
    tx.commit()?;
    Ok(out)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseEdit {
    pub id: String,
    pub reason: String,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub amount: Option<i64>,
    #[serde(default)]
    pub paid_to: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub manager_pin: Option<String>,
}

/// A cash expense counted in a closed drawer cannot change amount: its Z report is final.
fn cash_locked(conn: &Connection, id: i64) -> Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM expenses e JOIN shifts s ON s.id=e.shift_id WHERE e.id=?1 AND e.paid_from='cash' AND s.closed_at IS NOT NULL",
        [id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

pub fn edit_expense(conn: &mut Connection, e: &ExpenseEdit) -> Result<Value> {
    let Some(id) = parse_id("ex", &e.id) else { return invalid("Expense not found.") };
    if e.reason.trim().is_empty() {
        return invalid("Give a reason for the change.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cur = tx.query_row(&format!("SELECT {COLS} FROM expenses WHERE id=?1"), [id], row_json).optional()?;
    let Some(cur) = cur else { return invalid("Expense not found.") };
    if cur["status"] == "void" {
        return invalid("A voided expense cannot be changed.");
    }
    if let Some(a) = e.amount {
        if a <= 0 {
            return invalid("Enter an amount greater than zero.");
        }
        if a != cur["amount"].as_i64().unwrap_or(0) && cash_locked(&tx, id)? {
            return invalid("This cash expense belongs to a closed day, so its amount cannot change. Void it and add a new one dated today instead.");
        }
    }
    let (cat_id, cat_name) = match &e.category_id {
        Some(c) if c != cur["categoryId"].as_str().unwrap_or("") => (c.clone(), category_name(&tx, c)?),
        _ => (cur["categoryId"].as_str().unwrap_or("").to_string(), cur["category"].as_str().unwrap_or("").to_string()),
    };
    let amount = e.amount.unwrap_or(cur["amount"].as_i64().unwrap_or(0));
    let paid_to = e.paid_to.clone().unwrap_or_else(|| cur["paidTo"].as_str().unwrap_or("").to_string());
    let note = e.note.clone().unwrap_or_else(|| cur["note"].as_str().unwrap_or("").to_string());
    tx.execute(
        "UPDATE expenses SET category_id=?1,category_name=?2,amount=?3,paid_to=?4,note=?5,edit_count=edit_count+1 WHERE id=?6",
        params![cat_id, cat_name, amount, paid_to.trim(), note.trim(), id],
    )?;
    let who = db::actor_or("Office");
    audit(
        &tx,
        now,
        &who,
        "expense_edit",
        "expense",
        cur["number"].as_str().unwrap_or(""),
        &format!(
            "was {} paise {} to \"{}\"; now {} paise {} to \"{}\". Reason: {}",
            cur["amount"],
            cur["category"].as_str().unwrap_or(""),
            cur["paidTo"].as_str().unwrap_or(""),
            amount,
            cat_name,
            paid_to.trim(),
            e.reason.trim()
        ),
    )?;
    let out = get(&tx, id)?;
    tx.commit()?;
    Ok(out)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseVoid {
    pub id: String,
    pub reason: String,
    #[serde(default)]
    pub manager_pin: Option<String>,
}

pub fn void_expense(conn: &mut Connection, v: &ExpenseVoid) -> Result<Value> {
    let Some(id) = parse_id("ex", &v.id) else { return invalid("Expense not found.") };
    if v.reason.trim().is_empty() {
        return invalid("Give a reason for voiding this expense.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cur = tx.query_row(&format!("SELECT {COLS} FROM expenses WHERE id=?1"), [id], row_json).optional()?;
    let Some(cur) = cur else { return invalid("Expense not found.") };
    if cur["status"] == "void" {
        return invalid("This expense is already void.");
    }
    if cash_locked(&tx, id)? {
        return invalid("This cash expense belongs to a closed day, so it cannot be voided. Add a correcting entry dated today.");
    }
    let who = db::actor_or("Office");
    tx.execute("UPDATE expenses SET status='void', void_reason=?1, voided_at=?2, voided_by=?3 WHERE id=?4", params![v.reason.trim(), iso(now), who, id])?;
    audit(&tx, now, &who, "expense_void", "expense", cur["number"].as_str().unwrap_or(""), &format!("{} paise: {}", cur["amount"], v.reason.trim()))?;
    let out = get(&tx, id)?;
    tx.commit()?;
    Ok(out)
}

// ---------- lists ----------

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseQuery {
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub paid_from: Option<String>,
    #[serde(default)]
    pub by: Option<String>,
    /// active (default) | void | all
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

pub fn list_expenses(conn: &Connection, q: &ExpenseQuery) -> Result<Value> {
    let mut conds: Vec<String> = vec!["1=1".into()];
    let mut args: Vec<rusqlite::types::Value> = vec![];
    if let Some(f) = q.from.as_ref().filter(|s| !s.is_empty()) {
        conds.push("day >= ?".into());
        args.push(f.clone().into());
    }
    if let Some(t) = q.to.as_ref().filter(|s| !s.is_empty()) {
        conds.push("day <= ?".into());
        args.push(t.clone().into());
    }
    if let Some(c) = q.category_id.as_ref().filter(|s| !s.is_empty() && *s != "all") {
        conds.push("category_id = ?".into());
        args.push(c.clone().into());
    }
    if let Some(m) = q.paid_from.as_ref().filter(|s| !s.is_empty() && *s != "all") {
        conds.push("paid_from = ?".into());
        args.push(m.clone().into());
    }
    if let Some(b) = q.by.as_ref().filter(|s| !s.is_empty() && *s != "all") {
        conds.push("by_name = ?".into());
        args.push(b.clone().into());
    }
    match q.status.as_deref() {
        Some("void") => conds.push("status='void'".into()),
        Some("all") => {}
        _ => conds.push("status='active'".into()),
    }
    if let Some(t) = q.query.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        conds.push("(paid_to LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR number LIKE ? ESCAPE '\\')".into());
        let pat = format!("%{}%", crate::bills::like_escape(t));
        for _ in 0..3 {
            args.push(pat.clone().into());
        }
    }
    let where_sql = conds.join(" AND ");
    let mut st = conn.prepare(&format!("SELECT {COLS} FROM expenses WHERE {where_sql} ORDER BY id DESC LIMIT 3000"))?;
    let rows = st.query_map(rusqlite::params_from_iter(args.iter()), row_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut by_cat: Vec<(String, String, i64, i64)> = vec![];
    let (mut cash, mut upi, mut bank, mut total, mut voided) = (0i64, 0i64, 0i64, 0i64, 0i64);
    for r in &rows {
        if r["status"] == "void" {
            voided += 1;
            continue;
        }
        let a = r["amount"].as_i64().unwrap_or(0);
        total += a;
        match r["paidFrom"].as_str().unwrap_or("") {
            "cash" => cash += a,
            "upi" => upi += a,
            _ => bank += a,
        }
        let cid = r["categoryId"].as_str().unwrap_or("").to_string();
        match by_cat.iter_mut().find(|c| c.0 == cid) {
            Some(c) => {
                c.2 += a;
                c.3 += 1;
            }
            None => by_cat.push((cid, r["category"].as_str().unwrap_or("").to_string(), a, 1)),
        }
    }
    by_cat.sort_by(|a, b| b.2.cmp(&a.2));
    Ok(json!({
        "rows": rows, "total": total, "count": rows.len() as i64 - voided, "voidedCount": voided,
        "byMode": { "cash": cash, "upi": upi, "bank": bank },
        "byCategory": by_cat.iter().map(|c| json!({ "categoryId": c.0, "category": c.1, "amount": c.2, "count": c.3 })).collect::<Vec<_>>(),
    }))
}

/// Sum and count of active expenses of one shift paid from the drawer (used by X and Z).
pub fn cash_expenses_of_shift(conn: &Connection, shift_id: i64) -> Result<(i64, i64)> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(amount),0), COUNT(*) FROM expenses WHERE shift_id=?1 AND paid_from='cash' AND status='active'",
        [shift_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?)
}

// ---------- voided lines ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoidedLineInput {
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub code: String,
    pub name: String,
    pub qty: i64,
    #[serde(default)]
    pub rate: i64,
    #[serde(default)]
    pub amount: Option<i64>,
    #[serde(default)]
    pub counter: String,
    #[serde(default)]
    pub manager_pin: Option<String>,
}

/// A scanned line was removed from the open bill. One small insert: the signed-in user and the time, no reason asked.
pub fn log_voided_line(conn: &Connection, v: &VoidedLineInput) -> Result<()> {
    let now = Local::now();
    let amount = v.amount.unwrap_or_else(|| db::round_div(v.rate * v.qty, 1000));
    let who = db::actor_or("Cashier");
    conn.prepare_cached(
        "INSERT INTO voided_lines(at,day,by_name,counter,item_id,code,name,qty,rate,amount,approved_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
    )?
    .execute(params![iso(now), db::day_of(now), who, v.counter, v.item_id, v.code, v.name, v.qty, v.rate, amount, db::approver_or_empty()])?;
    Ok(())
}

pub fn void_line_needs_pin(conn: &Connection) -> bool {
    get_setting(conn, "security.voidLineNeedsPin").ok().flatten().map(|v| v == "1").unwrap_or(false)
}
