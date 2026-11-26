//! Office CRM: sales bills for all counters, customers and statements, credit collections (oldest bill cleared first),
//! users, roles and the permission matrix, settings and backups.

use crate::bills::{like_escape, query_bills};
use crate::catalog::OFFICE;
use crate::db::{self, audit, doc_number, drawer_entry, fresh_id, fy_of, get_setting, iso, next_seq, parse_iso, round_div, set_setting, when_label};
use crate::error::{invalid, Result};
use crate::store::{check_pin, hash_pin};
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// =====================================================================
// Sales bills (all counters)
// =====================================================================

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    pub counter: Option<String>,
    pub cashier: Option<String>,
    pub mode: Option<String>,
    pub status: Option<String>,
    pub query: Option<String>,
}

fn is_set(o: &Option<String>) -> Option<&str> {
    o.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "all")
}

pub fn list_sales_bills(conn: &Connection, q: &SalesQuery) -> Result<Vec<Value>> {
    let mut conds: Vec<String> = vec!["1=1".into()];
    let mut args: Vec<rusqlite::types::Value> = vec![];
    if let Some(f) = is_set(&q.from) {
        conds.push("b.day >= ?".into());
        args.push(f.to_string().into());
    }
    if let Some(t) = is_set(&q.to) {
        conds.push("b.day <= ?".into());
        args.push(t.to_string().into());
    }
    if let Some(c) = is_set(&q.counter) {
        conds.push("b.counter = ?".into());
        args.push(c.to_string().into());
    }
    if let Some(c) = is_set(&q.cashier) {
        conds.push("b.cashier = ?".into());
        args.push(c.to_string().into());
    }
    if let Some(s) = is_set(&q.status) {
        conds.push("b.status = ?".into());
        args.push(s.to_string().into());
    }
    if let Some(m) = is_set(&q.mode) {
        conds.push("EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id=b.id AND p.mode=?)".into());
        args.push(m.to_string().into());
    }
    if let Some(t) = is_set(&q.query) {
        let pat = format!("%{}%", like_escape(t));
        conds.push(
            "(b.number LIKE ? ESCAPE '\\' OR b.customer_name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id=b.id AND p.ref LIKE ? ESCAPE '\\'))"
                .into(),
        );
        for _ in 0..3 {
            args.push(pat.clone().into());
        }
    }
    let bills = query_bills(conn, &conds.join(" AND "), rusqlite::params_from_iter(args), 3000)?;
    let mut out = vec![];
    for b in bills {
        let id = db::parse_id("b", &b.id).unwrap_or(0);
        let mut v = serde_json::to_value(&b)?;
        let extra: Option<(String, String)> = if b.status == "cancelled" {
            conn.query_row("SELECT reason, approved_by FROM bill_cancellations WHERE bill_id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?
        } else if b.status == "returned" {
            conn.query_row("SELECT reason, by_name FROM credit_notes WHERE bill_id=?1 ORDER BY id DESC LIMIT 1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?
        } else {
            None
        };
        if let Some((reason, by)) = extra {
            v["reason"] = json!(reason);
            v["approvedBy"] = json!(by);
        }
        out.push(v);
    }
    Ok(out)
}

pub fn sales_filter_options(conn: &Connection) -> Result<Value> {
    let col = |sql: &str| -> Result<Vec<String>> {
        let mut st = conn.prepare(sql)?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<String>>>()?;
        Ok(v)
    };
    Ok(json!({
        "counters": col("SELECT DISTINCT counter FROM bills ORDER BY counter")?,
        "cashiers": col("SELECT DISTINCT cashier FROM bills ORDER BY cashier")?,
    }))
}

// =====================================================================
// Customers
// =====================================================================

const CUST_COLS: &str = "c.id,c.name,c.phone,c.area,c.credit_limit,c.outstanding,c.loyalty_points,c.last_visit_at,c.type,c.business,c.gstin,c.email,c.address,c.created_at,c.notes,c.father_name,c.dob,c.anniversary,c.pan,c.locality,c.route,c.credit_days,c.opening_balance,c.active,c.state_code";

type Spend = (i64, i64, Option<String>);

fn customer_row(r: &rusqlite::Row, now: chrono::DateTime<Local>, spend: &HashMap<String, Spend>) -> rusqlite::Result<Value> {
    let id: String = r.get(0)?;
    let last: Option<String> = r.get(7)?;
    let (total, visits, last_bill) = spend.get(&id).cloned().unwrap_or((0, 0, None));
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("name".into(), json!(r.get::<_, String>(1)?));
    m.insert("phone".into(), json!(r.get::<_, String>(2)?));
    m.insert("area".into(), json!(r.get::<_, String>(3)?));
    m.insert("creditLimit".into(), json!(r.get::<_, i64>(4)?));
    m.insert("outstanding".into(), json!(r.get::<_, i64>(5)?));
    // the database holds hundredths of a point; the API always speaks points with two decimals (7856 -> 78.56)
    m.insert("loyaltyPoints".into(), json!(crate::loyalty::from_hundredths(r.get::<_, i64>(6)?)));
    m.insert("lastVisit".into(), json!(db::visit_label(last.as_deref(), now)));
    m.insert("type".into(), json!(r.get::<_, String>(8)?));
    for (k, i) in [("business", 9), ("gstin", 10), ("email", 11), ("address", 12)] {
        let s: String = r.get(i)?;
        if !s.is_empty() {
            m.insert(k.into(), json!(s));
        }
    }
    m.insert("since".into(), json!(r.get::<_, String>(13)?));
    let notes: String = r.get(14)?;
    if !notes.is_empty() {
        m.insert("notes".into(), json!(notes));
    }
    for (k, i) in [("fatherName", 15), ("dob", 16), ("anniversary", 17), ("pan", 18), ("locality", 19), ("route", 20)] {
        m.insert(k.into(), json!(r.get::<_, String>(i)?));
    }
    m.insert("creditDays".into(), json!(r.get::<_, i64>(21)?));
    m.insert("openingBalance".into(), json!(r.get::<_, i64>(22)?));
    m.insert("active".into(), json!(r.get::<_, i64>(23)? != 0));
    let sc: String = r.get(24)?;
    if !sc.is_empty() {
        m.insert("stateCode".into(), json!(sc));
    }
    m.insert("noName".into(), json!(is_no_name(&r.get::<_, String>(1)?)));
    m.insert("totalSpend".into(), json!(total));
    m.insert("visits".into(), json!(visits));
    m.insert("avgBill".into(), json!(if visits > 0 { round_div(total, visits) } else { 0 }));
    if let Some(l) = last_bill {
        m.insert("lastBillAt".into(), json!(l));
    }
    Ok(Value::Object(m))
}

fn spend_map(conn: &Connection, only: Option<&str>) -> Result<HashMap<String, Spend>> {
    let mut st = conn.prepare(
        "SELECT customer_id, SUM(CASE WHEN status='returned' THEN 0 ELSE grand END), COUNT(*), MAX(at) FROM bills
         WHERE customer_id IS NOT NULL AND status != 'cancelled' AND (?1 IS NULL OR customer_id=?1) GROUP BY customer_id",
    )?;
    let rows = st.query_map([only], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<String>>(3)?))))?;
    let mut m = HashMap::new();
    for r in rows {
        let (k, v) = r?;
        m.insert(k, v);
    }
    Ok(m)
}

pub fn list_customer_rows(conn: &Connection) -> Result<Vec<Value>> {
    let now = Local::now();
    let spend = spend_map(conn, None)?;
    let mut st = conn.prepare(&format!("SELECT {CUST_COLS} FROM customers c ORDER BY c.rowid"))?;
    let v = st.query_map([], |r| customer_row(r, now, &spend))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn one_customer(conn: &Connection, id: &str) -> Result<Option<Value>> {
    let now = Local::now();
    let spend = spend_map(conn, Some(id))?;
    Ok(conn.query_row(&format!("SELECT {CUST_COLS} FROM customers c WHERE c.id=?1"), [id], |r| customer_row(r, now, &spend)).optional()?)
}

pub fn get_customer_profile(conn: &Connection, id: &str) -> Result<Value> {
    let Some(customer) = one_customer(conn, id)? else { return Ok(Value::Null) };
    let mut st = conn.prepare(
        "SELECT l.item_id, MAX(l.name), MAX(l.unit), SUM(l.qty), SUM(l.amount) FROM bills b JOIN bill_lines l ON l.bill_id=b.id
         WHERE b.customer_id=?1 AND b.status NOT IN ('cancelled','returned') GROUP BY l.item_id ORDER BY SUM(l.amount) DESC LIMIT 5",
    )?;
    let favourites = st
        .query_map([id], |r| {
            Ok(json!({ "itemId": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "unit": r.get::<_, String>(2)?, "qty": r.get::<_, i64>(3)?, "amount": r.get::<_, i64>(4)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let bills = query_bills(conn, "b.customer_id=?1", [id], 40)?;
    Ok(json!({ "customer": customer, "favourites": favourites, "bills": bills }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub area: String,
    #[serde(default, rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub business: Option<String>,
    #[serde(default)]
    pub gstin: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub credit_limit: i64,
    /// Inactive customers are hidden from the POS pickers and cannot be put on a new bill. `None` keeps what is stored.
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
    // Customer Profile (POS) fields
    #[serde(default)]
    pub father_name: Option<String>,
    #[serde(default)]
    pub dob: Option<String>,
    #[serde(default)]
    pub anniversary: Option<String>,
    #[serde(default)]
    pub pan: Option<String>,
    #[serde(default)]
    pub locality: Option<String>,
    #[serde(default)]
    pub route: Option<String>,
    #[serde(default)]
    pub credit_days: Option<i64>,
    #[serde(default)]
    pub opening_balance: Option<i64>,
    /// GST state code of the customer ("33"). With a GSTIN it must match the GSTIN's first two digits (and is filled from it when empty).
    #[serde(default)]
    pub state_code: Option<String>,
}

/// The one credit rule: 0 = credit not allowed, positive = credit up to that amount (paise), -1 = no limit (explicit).
pub fn set_customer_credit(conn: &mut Connection, customer_id: &str, limit: i64, approver: &str) -> Result<Value> {
    if limit < -1 {
        return invalid("Credit limit cannot be negative.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let old: Option<i64> = tx.query_row("SELECT credit_limit FROM customers WHERE id=?1", [customer_id], |r| r.get(0)).optional()?;
    let Some(old) = old else { return invalid("Customer not found.") };
    tx.execute("UPDATE customers SET credit_limit=?1 WHERE id=?2", params![limit, customer_id])?;
    let by = if approver.is_empty() { String::new() } else { format!(" approved by {approver}") };
    audit(&tx, Local::now(), OFFICE, "credit_limit", "customer", customer_id, &format!("{old} -> {limit}{by}"))?;
    tx.commit()?;
    let row = one_customer(conn, customer_id)?.ok_or_else(|| db::internal("Customer vanished"))?;
    Ok(row)
}

pub fn save_customer(conn: &mut Connection, i: &CustomerInput) -> Result<Value> {
    let name = i.name.trim();
    if name.is_empty() {
        return invalid("Enter the customer name.");
    }
    if i.credit_limit < -1 {
        return invalid("Credit limit cannot be negative. Use 0 for no credit, or choose No limit.");
    }
    let b2b = i.kind == "b2b";
    let gstin = i.gstin.clone().unwrap_or_default().trim().to_uppercase();
    let sent_state = i.state_code.clone().unwrap_or_default().trim().to_string();
    if !sent_state.is_empty() && crate::gst::state_name(&sent_state).is_none() {
        return invalid("Choose a valid state for the customer.");
    }
    if !gstin.is_empty() {
        if let Some(p) = crate::gst::gstin_problem(&gstin, Some(&sent_state)) {
            return invalid(format!("GSTIN: {p}"));
        }
    }
    // A registered customer's state is the GSTIN's state; otherwise the state chosen (empty = not recorded, billed as local).
    let state_code = if b2b && !gstin.is_empty() { gstin[..2].to_string() } else { sent_state.clone() };
    let business = if b2b { i.business.clone().unwrap_or_default().trim().to_string() } else { String::new() };
    let email = i.email.clone().unwrap_or_default().trim().to_string();
    let address = i.address.clone().unwrap_or_default().trim().to_string();
    let notes = i.notes.clone().unwrap_or_default().trim().to_string();
    if i.credit_days.unwrap_or(0) < 0 || i.opening_balance.unwrap_or(0) < 0 {
        return invalid("Credit days and opening balance cannot be negative.");
    }
    let t = |o: &Option<String>| o.clone().unwrap_or_default().trim().to_string();
    let (father, dob, anniv, pan, locality, route) = (t(&i.father_name), t(&i.dob), t(&i.anniversary), t(&i.pan).to_uppercase(), t(&i.locality), t(&i.route));
    for (label, d) in [("Date of birth", &dob), ("Anniversary", &anniv)] {
        if !d.is_empty() && chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_err() {
            return invalid(format!("{label} must be a date like 1990-05-21."));
        }
    }
    if !pan.is_empty() && !(pan.len() == 10 && pan.chars().all(|c| c.is_ascii_alphanumeric())) {
        return invalid("PAN looks wrong. It has 10 letters and digits, e.g. ABCDE1234F.");
    }
    let keep = |sent: &Option<String>, v: &String| sent.as_ref().map(|_| v.clone());
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let id = match &i.id {
        Some(id) => {
            let n = tx.execute(
                "UPDATE customers SET name=?1,phone=?2,area=?3,credit_limit=?4,type=?5,business=?6,
                   gstin=COALESCE(?7,gstin),email=COALESCE(?8,email),address=COALESCE(?9,address),notes=COALESCE(?10,notes),
                   state_code=COALESCE(?12,state_code) WHERE id=?11",
                params![name, i.phone.trim(), i.area.trim(), i.credit_limit, if b2b { "b2b" } else { "retail" }, business,
                        if b2b { keep(&i.gstin, &gstin) } else { Some(String::new()) }, keep(&i.email, &email), keep(&i.address, &address), keep(&i.notes, &notes), id,
                        if b2b && !gstin.is_empty() { Some(state_code.clone()) } else { i.state_code.as_ref().map(|_| state_code.clone()) }],
            )?;
            if n == 0 {
                return invalid("Customer not found.");
            }
            // A field the screen did not send keeps what is stored (the Office sheet has no father name, notes, POSBean opening balance ...).
            tx.execute(
                "UPDATE customers SET father_name=COALESCE(?1,father_name),dob=COALESCE(?2,dob),anniversary=COALESCE(?3,anniversary),pan=COALESCE(?4,pan),
                   locality=COALESCE(?5,locality),route=COALESCE(?6,route),credit_days=COALESCE(?7,credit_days),opening_balance=COALESCE(?8,opening_balance) WHERE id=?9",
                params![keep(&i.father_name, &father), keep(&i.dob, &dob), keep(&i.anniversary, &anniv), keep(&i.pan, &pan), keep(&i.locality, &locality), keep(&i.route, &route),
                        i.credit_days, i.opening_balance, id],
            )?;
            if let Some(a) = i.active {
                tx.execute("UPDATE customers SET active=?1 WHERE id=?2", params![a as i64, id])?;
            }
            audit(&tx, now, OFFICE, "update", "customer", id, name)?;
            id.clone()
        }
        None => {
            let id = fresh_id(&tx, "customers", "c", "CUSTOMER")?;
            tx.execute(
                "INSERT INTO customers(id,name,phone,area,credit_limit,outstanding,loyalty_points,created_at,type,business,gstin,email,address,notes,state_code)
                 VALUES(?1,?2,?3,?4,?5,0,0,?6,?7,?8,?9,?10,?11,?12,?13)",
                params![id, name, i.phone.trim(), i.area.trim(), i.credit_limit, iso(now), if b2b { "b2b" } else { "retail" }, business, gstin, email, address, notes, state_code],
            )?;
            tx.execute(
                "UPDATE customers SET father_name=?1,dob=?2,anniversary=?3,pan=?4,locality=?5,route=?6,credit_days=?7,opening_balance=?8 WHERE id=?9",
                params![father, dob, anniv, pan, locality, route, i.credit_days.unwrap_or(0), i.opening_balance.unwrap_or(0), id],
            )?;
            audit(&tx, now, OFFICE, "create", "customer", &id, name)?;
            id
        }
    };
    let row = one_customer(&tx, &id)?.ok_or_else(|| db::internal("Customer vanished"))?;
    tx.commit()?;
    Ok(row)
}

/// Switch a customer on or off for the counter. History, balance and points stay; the POS stops offering the customer.
pub fn set_customer_active(conn: &mut Connection, id: &str, active: bool) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let name: String = tx
        .query_row("SELECT name FROM customers WHERE id=?1", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| crate::error::ApiError::Invalid("Customer not found.".into()))?;
    tx.execute("UPDATE customers SET active=?1 WHERE id=?2", params![active as i64, id])?;
    audit(&tx, Local::now(), OFFICE, if active { "activate" } else { "deactivate" }, "customer", id, &name)?;
    let row = one_customer(&tx, id)?.ok_or_else(|| db::internal("Customer vanished"))?;
    tx.commit()?;
    Ok(row)
}

// =====================================================================
// Credit and collections
// =====================================================================

/// Unpaid credit bills of a customer. Payments clear the OLDEST bill first, so what is still open is the newest credit
/// bills that add up to `outstanding`; any balance older than the first bill shows as "Opening balance".
fn open_invoices(conn: &Connection, cust: &str, outstanding: i64, created_at: &str) -> Result<Vec<(String, String, i64)>> {
    let mut left = outstanding;
    let mut out = vec![];
    if left <= 0 {
        return Ok(out);
    }
    let mut st = conn.prepare(
        "SELECT b.at, b.number, p.amount FROM bills b JOIN bill_payments p ON p.bill_id=b.id AND p.mode='credit'
         WHERE b.customer_id=?1 AND b.status != 'cancelled' ORDER BY b.id DESC",
    )?;
    let rows = st.query_map([cust], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?;
    for r in rows {
        let (at, number, amount) = r?;
        let take = amount.min(left);
        out.push((at, number, take));
        left -= take;
        if left <= 0 {
            break;
        }
    }
    if left > 0 {
        out.push((created_at.to_string(), "Opening balance".into(), left));
    }
    out.reverse(); // oldest first
    Ok(out)
}

fn days_old(at: &str, today: NaiveDate) -> i64 {
    parse_iso(at).map(|d| (today - d.date_naive()).num_days().max(0)).unwrap_or(0)
}

fn buckets_of(inv: &[(String, String, i64)], today: NaiveDate) -> (i64, i64, i64, i64) {
    let mut b = (0, 0, 0, 0);
    for (at, _, amt) in inv {
        match days_old(at, today) {
            0..=30 => b.0 += amt,
            31..=60 => b.1 += amt,
            61..=90 => b.2 += amt,
            _ => b.3 += amt,
        }
    }
    b
}

fn buckets_json(b: (i64, i64, i64, i64)) -> Value {
    json!({ "d0_30": b.0, "d31_60": b.1, "d61_90": b.2, "d90p": b.3 })
}

pub fn list_receivables(conn: &Connection) -> Result<Vec<Value>> {
    let today = Local::now().date_naive();
    let mut st = conn.prepare(
        "SELECT id,name,business,phone,area,credit_limit,outstanding,created_at FROM customers WHERE outstanding > 0 ORDER BY outstanding DESC",
    )?;
    let custs: Vec<(String, String, String, String, String, i64, i64, String)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut out = vec![];
    for (id, name, business, phone, area, limit, outstanding, created) in custs {
        let inv = open_invoices(conn, &id, outstanding, &created)?;
        let b = buckets_of(&inv, today);
        let last_pay: Option<(String, i64)> = conn
            .query_row("SELECT at, amount FROM customer_payments WHERE customer_id=?1 ORDER BY id DESC LIMIT 1", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?;
        let reminder: Option<String> = conn.query_row(
            "SELECT MAX(at) FROM audit_log WHERE entity='customer' AND entity_id=?1 AND action='reminder'",
            [&id],
            |r| r.get(0),
        )?;
        let mut v = json!({
            "customerId": id, "name": name, "phone": phone, "area": area, "creditLimit": limit, "total": outstanding,
            "buckets": buckets_json(b), "oldestDays": inv.iter().map(|i| days_old(&i.0, today)).max().unwrap_or(0),
        });
        if !business.is_empty() {
            v["business"] = json!(business);
        }
        if let Some((at, amt)) = last_pay {
            v["lastPaymentAt"] = json!(at);
            v["lastPaymentAmount"] = json!(amt);
        }
        if let Some(r) = reminder {
            v["lastReminderAt"] = json!(r);
        }
        out.push(v);
    }
    Ok(out)
}

pub fn get_statement(conn: &Connection, id: &str) -> Result<Value> {
    let Some(customer) = one_customer(conn, id)? else { return Ok(Value::Null) };
    let outstanding = customer["outstanding"].as_i64().unwrap_or(0);
    let created = customer["since"].as_str().unwrap_or("").to_string();
    let today = Local::now().date_naive();
    // (date, order, entry)
    let mut raw: Vec<(String, i64, Value)> = vec![];
    let mut st = conn.prepare(
        "SELECT b.id,b.at,b.number,p.amount FROM bills b JOIN bill_payments p ON p.bill_id=b.id AND p.mode='credit'
         WHERE b.customer_id=?1 AND b.status != 'cancelled'",
    )?;
    let bills = st
        .query_map([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (bid, at, number, amt) in bills {
        raw.push((at.clone(), bid * 4, json!({ "id": format!("b{bid}"), "date": at, "ref": number, "kind": "bill", "note": "Credit sale", "debit": amt, "credit": 0 })));
    }
    let mut ps = conn.prepare("SELECT id,at,receipt,amount,mode,ref,note FROM customer_payments WHERE customer_id=?1")?;
    let pays = ps
        .query_map([id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (pid, at, receipt, amt, mode, rf, note) in pays {
        let n = if !note.is_empty() { note } else if mode == "upi" { format!("UPI {rf}").trim().to_string() } else { "Cash received".into() };
        raw.push((at.clone(), 2_000_000_000 + pid, json!({ "id": format!("rc{pid}"), "date": at, "ref": receipt, "kind": "payment", "note": n, "debit": 0, "credit": amt })));
    }
    // Credit notes that cleared part of a credit bill.
    let mut cs = conn.prepare(
        "SELECT c.id,c.at,c.number,c.grand FROM credit_notes c WHERE c.customer_id=?1 AND c.refund_mode='credit_note'
         AND EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id=c.bill_id AND p.mode='credit')",
    )?;
    let cns = cs.query_map([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    for (cid, at, number, grand) in cns {
        raw.push((at.clone(), 1_000_000_000 + cid, json!({ "id": format!("cn{cid}"), "date": at, "ref": number, "kind": "payment", "note": "Credit note (return)", "debit": 0, "credit": grand })));
    }
    let net: i64 = raw.iter().map(|e| e.2["debit"].as_i64().unwrap_or(0) - e.2["credit"].as_i64().unwrap_or(0)).sum();
    let opening = outstanding - net;
    if opening != 0 {
        let (debit, credit, kind) = if opening > 0 { (opening, 0, "bill") } else { (0, -opening, "payment") };
        raw.push((created.clone(), -1, json!({ "id": "opening", "date": created, "ref": "Opening", "kind": kind, "note": "Opening balance", "debit": debit, "credit": credit })));
    }
    raw.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut bal = 0i64;
    let entries: Vec<Value> = raw
        .into_iter()
        .map(|(_, _, mut e)| {
            bal += e["debit"].as_i64().unwrap_or(0) - e["credit"].as_i64().unwrap_or(0);
            e["balance"] = json!(bal);
            e
        })
        .collect();
    let inv = open_invoices(conn, id, outstanding, &created)?;
    Ok(json!({ "customer": customer, "entries": entries, "balance": outstanding, "buckets": buckets_json(buckets_of(&inv, today)) }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInput {
    pub customer_id: String,
    pub amount: i64,
    pub mode: String,
    #[serde(default)]
    pub r#ref: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

pub const RECEIPT_SERIES: &str = "RC";

pub fn record_collection(conn: &mut Connection, i: &CollectionInput) -> Result<Value> {
    if i.amount <= 0 {
        return invalid("Enter an amount greater than zero");
    }
    if i.mode != "cash" && i.mode != "upi" {
        return invalid("Choose cash or UPI");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cust: Option<(String, i64)> =
        tx.query_row("SELECT name,outstanding FROM customers WHERE id=?1", [&i.customer_id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((name, outstanding)) = cust else { return invalid("Customer not found") };
    if i.amount > outstanding {
        return invalid("Amount is more than the outstanding balance");
    }
    let fy = fy_of(now);
    let seq = next_seq(&tx, RECEIPT_SERIES, &fy)?;
    let receipt = doc_number("RC", &fy, seq);
    tx.execute(
        "INSERT INTO customer_payments(receipt,series,fy,seq,customer_id,at,day,amount,mode,ref,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![receipt, RECEIPT_SERIES, fy, seq, i.customer_id, iso(now), db::day_of(now), i.amount, i.mode, i.r#ref.clone().unwrap_or_default(), i.note.clone().unwrap_or_default(), db::actor_or(OFFICE)],
    )?;
    tx.execute("UPDATE customers SET outstanding = outstanding - ?1 WHERE id=?2", params![i.amount, i.customer_id])?;
    if i.mode == "cash" {
        drawer_entry(&tx, now, "in", "Credit collection", i.amount, &format!("{name} ({receipt})"), OFFICE)?;
    }
    audit(&tx, now, OFFICE, "collection", "customer", &i.customer_id, &format!("{receipt}: {} paise by {}", i.amount, i.mode))?;
    let st = get_statement(&tx, &i.customer_id)?;
    tx.commit()?;
    Ok(st)
}

pub fn log_reminder(conn: &Connection, id: &str) -> Result<()> {
    audit(conn, Local::now(), OFFICE, "reminder", "customer", id, "")
}

// =====================================================================
// Users, roles and permissions
// =====================================================================

pub const PERMISSION_KEYS: &[&str] = &[
    "canCancelBill", "canReturn", "canEditPrices", "canSeeCost", "canSeeReports", "canManageItems", "canManageStock",
    "canCollectCredit", "canOpenDrawer", "canManageUsers", "canChangeSettings", "canEditRecords",
];

fn role_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let perms: String = r.get(4)?;
    let pin_for: String = r.get(5)?;
    Ok(json!({
        "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "description": r.get::<_, String>(2)?,
        "discountLimitPct": r.get::<_, i64>(3)?, "perms": serde_json::from_str::<Value>(&perms).unwrap_or(Value::Null),
        "pinFor": serde_json::from_str::<Value>(&pin_for).unwrap_or(json!([])), "locked": r.get::<_, i64>(6)? != 0,
    }))
}

pub fn list_roles(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,name,description,discount_limit_pct,perms_json,pin_for_json,locked FROM roles ORDER BY CASE id WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END")?;
    let v = st.query_map([], role_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn save_roles(conn: &mut Connection, roles: &[Value]) -> Result<Vec<Value>> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for r in roles {
        let id = r["id"].as_str().unwrap_or("");
        if !["owner", "admin", "manager", "staff", "cashier"].contains(&id) {
            return invalid("Unknown role.");
        }
        let limit = r["discountLimitPct"].as_i64().unwrap_or(0);
        if !(0..=100).contains(&limit) {
            return invalid("Discount limit must be between 0 and 100 percent.");
        }
        let (perms, pin_for, limit) = if id == "owner" || id == "admin" {
            // The owner can always do everything and never needs a manager PIN.
            (Value::Object(PERMISSION_KEYS.iter().map(|k| (k.to_string(), json!(true))).collect()), json!([]), 100)
        } else {
            let given = r["perms"].as_object().cloned().unwrap_or_default();
            (Value::Object(PERMISSION_KEYS.iter().map(|k| (k.to_string(), json!(given.get(*k).and_then(|v| v.as_bool()).unwrap_or(false)))).collect()), r["pinFor"].clone(), limit)
        };
        tx.execute(
            "UPDATE roles SET name=?1, description=?2, discount_limit_pct=?3, perms_json=?4, pin_for_json=?5 WHERE id=?6",
            params![r["name"].as_str().unwrap_or(id), r["description"].as_str().unwrap_or(""), limit, perms.to_string(), if pin_for.is_array() { pin_for.to_string() } else { "[]".into() }, id],
        )?;
    }
    audit(&tx, Local::now(), OFFICE, "update", "roles", "permission matrix", "")?;
    let out = list_roles(&tx)?;
    tx.commit()?;
    Ok(out)
}

/// Does this user have to get a manager PIN for `action`? Yes when the user's role lists the action under "needs manager PIN",
/// or does not hold the permission at all. Unknown users always need the PIN.
pub fn needs_manager_pin(conn: &Connection, by_name: &str, action: &str, perm: &str) -> Result<bool> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT r.perms_json, r.pin_for_json FROM users u JOIN roles r ON r.id=u.role WHERE u.name=?1 AND u.active=1 ORDER BY u.rowid LIMIT 1",
            [by_name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((perms, pin_for)) = row else { return Ok(true) };
    let perms: Value = serde_json::from_str(&perms).unwrap_or(Value::Null);
    let pin_for: Vec<String> = serde_json::from_str(&pin_for).unwrap_or_default();
    Ok(pin_for.iter().any(|a| a == action) || !perms[perm].as_bool().unwrap_or(false))
}

fn account_json(r: &rusqlite::Row, now: chrono::DateTime<Local>, bills30: i64) -> rusqlite::Result<Value> {
    let last: Option<String> = r.get(7)?;
    let changed: Option<String> = r.get(8)?;
    Ok(json!({
        "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "role": r.get::<_, String>(2)?, "initials": r.get::<_, String>(3)?,
        "color": r.get::<_, String>(4)?, "phone": r.get::<_, Option<String>>(5)?.unwrap_or_default(), "active": r.get::<_, i64>(6)? != 0,
        "lastLogin": when_label(last.as_deref(), now), "pinChangedAt": changed.unwrap_or_else(|| r.get::<_, String>(9).unwrap_or_default()),
        "bills30d": bills30,
    }))
}

const USER_COLS: &str = "id,name,role,initials,color,phone,active,last_login,pin_changed_at,created_at";

fn account(conn: &Connection, id: &str) -> Result<Option<Value>> {
    let now = Local::now();
    let first = db::day_of(now - Duration::days(30));
    let name: Option<String> = conn.query_row("SELECT name FROM users WHERE id=?1", [id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return Ok(None) };
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM bills WHERE day >= ?1 AND cashier=?2 AND status != 'cancelled'", params![first, name], |r| r.get(0))?;
    Ok(conn.query_row(&format!("SELECT {USER_COLS} FROM users WHERE id=?1"), [id], |r| account_json(r, now, n)).optional()?)
}

pub fn list_user_accounts(conn: &Connection) -> Result<Vec<Value>> {
    let ids: Vec<String> = {
        let mut st = conn.prepare("SELECT id FROM users ORDER BY rowid")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let mut out = vec![];
    for id in ids {
        if let Some(a) = account(conn, &id)? {
            out.push(a);
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default = "yes")]
    pub active: bool,
    #[serde(default)]
    pub pin: Option<String>,
}
fn yes() -> bool {
    true
}

/// The rules every PIN a person picks must pass: exactly 4 digits, not one digit repeated (1111), not a straight run (1234, 4321, 0123, 3210).
/// The answer is a plain-words message for the screen, or `None` when the PIN is fine.
pub fn pin_rule_problem(p: &str) -> Option<&'static str> {
    if p.len() != 4 || !p.chars().all(|c| c.is_ascii_digit()) {
        return Some("The PIN must be 4 digits, numbers only.");
    }
    let d: Vec<i32> = p.chars().map(|c| c as i32 - '0' as i32).collect();
    if d.iter().all(|x| *x == d[0]) {
        return Some("That PIN is too easy to guess (the same digit repeated). Choose another.");
    }
    if d.windows(2).all(|w| w[1] - w[0] == 1) || d.windows(2).all(|w| w[0] - w[1] == 1) {
        return Some("That PIN is too easy to guess (digits in a row, like 1234). Choose another.");
    }
    None
}

/// Another active user already signs in with this PIN (compared through the stored hashes; no PIN is ever kept).
fn pin_taken(conn: &Connection, pin: &str, except_user: &str) -> Result<bool> {
    let mut st = conn.prepare("SELECT pin_hash FROM users WHERE active=1 AND id != ?1")?;
    let hashes = st.query_map([except_user], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(hashes.iter().any(|h| check_pin(pin, h)))
}

/// Rules plus uniqueness, for a PIN chosen for `user_id` (empty for a user who does not exist yet).
fn check_new_pin(conn: &Connection, pin: &str, user_id: &str) -> Result<()> {
    if let Some(m) = pin_rule_problem(pin) {
        return invalid(m);
    }
    if pin_taken(conn, pin, user_id)? {
        return invalid("Another user already has this PIN. Choose a different one.");
    }
    Ok(())
}

const COLORS: &[&str] = &["#2563EB", "#DB2777", "#D97706", "#7C3AED", "#0E4330", "#DC2626"];

pub fn save_user_account(conn: &mut Connection, i: &UserInput) -> Result<Value> {
    let name = i.name.trim();
    if name.is_empty() {
        return invalid("Enter the user's name.");
    }
    if !["owner", "admin", "manager", "staff", "cashier"].contains(&i.role.as_str()) {
        return invalid("Choose a role.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let dup: i64 = tx.query_row("SELECT COUNT(*) FROM users WHERE lower(name)=lower(?1) AND id != ?2", params![name, i.id.clone().unwrap_or_default()], |r| r.get(0))?;
    if dup > 0 {
        return invalid("Another user already has this name.");
    }
    let id = match &i.id {
        Some(id) => {
            let cur: Option<(String, i64)> = tx.query_row("SELECT role, active FROM users WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
            let Some((old_role, was_active)) = cur else { return invalid("User not found.") };
            if old_role == "owner" && (i.role != "owner" || !i.active) && was_active != 0 {
                let others: i64 = tx.query_row("SELECT COUNT(*) FROM users WHERE role='owner' AND active=1 AND id != ?1", [id], |r| r.get(0))?;
                if others == 0 {
                    return invalid("There must be at least one active owner.");
                }
            }
            tx.execute("UPDATE users SET name=?1, role=?2, phone=?3, active=?4 WHERE id=?5", params![name, i.role, i.phone.trim(), i.active, id])?;
            if let Some(p) = i.pin.as_deref().filter(|p| !p.is_empty()) {
                check_new_pin(&tx, p, id)?;
                tx.execute("UPDATE users SET pin_hash=?1, pin_changed_at=?2 WHERE id=?3", params![hash_pin(p)?, iso(now), id])?;
                audit(&tx, now, OFFICE, "set_pin", "user", id, &format!("PIN set for {name} by {}", db::actor_or(OFFICE)))?;
            }
            audit(&tx, now, OFFICE, "update", "user", id, &format!("{name} ({})", i.role))?;
            id.clone()
        }
        None => {
            let Some(pin) = i.pin.as_deref().filter(|p| !p.is_empty()) else { return invalid("Choose a PIN (4 digits) for the new user.") };
            check_new_pin(&tx, pin, "")?;
            let id = fresh_id(&tx, "users", "u", "USER")?;
            let parts: Vec<&str> = name.split_whitespace().collect();
            let initials: String = parts.iter().take(2).filter_map(|p| p.chars().next()).collect::<String>().to_uppercase();
            let color = COLORS[(next_seq(&tx, "USERCOLOR", "-")? as usize) % COLORS.len()];
            tx.execute(
                "INSERT INTO users(id,name,role,initials,color,pin_hash,phone,active,created_at,pin_changed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![id, name, i.role, initials, color, hash_pin(pin)?, i.phone.trim(), i.active, iso(now)],
            )?;
            audit(&tx, now, OFFICE, "create", "user", &id, &format!("{name} ({})", i.role))?;
            audit(&tx, now, OFFICE, "set_pin", "user", &id, &format!("PIN set for {name} by {}", db::actor_or(OFFICE)))?;
            id
        }
    };
    let a = account(&tx, &id)?.ok_or_else(|| db::internal("User vanished"))?;
    tx.commit()?;
    Ok(a)
}

/// The owner (or anyone with the users permission) chooses a PIN for a user. Only the argon2 hash is stored; the PIN is never returned.
pub fn set_user_pin(conn: &mut Connection, user_id: &str, pin: &str) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let name: Option<String> = tx.query_row("SELECT name FROM users WHERE id=?1", [user_id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return invalid("User not found") };
    check_new_pin(&tx, pin, user_id)?;
    tx.execute("UPDATE users SET pin_hash=?1, pin_changed_at=?2, failed_pins=0, locked_until=NULL WHERE id=?3", params![hash_pin(pin)?, iso(now), user_id])?;
    audit(&tx, now, OFFICE, "set_pin", "user", user_id, &format!("PIN set for {name} by {}", db::actor_or(OFFICE)))?;
    tx.commit()?;
    Ok(Value::Null)
}

/// A signed-in user changes their own PIN: the old PIN must be right (wrong ones count towards the same lockout as at sign-in).
pub fn change_my_pin(conn: &mut Connection, user_id: &str, old_pin: &str, new_pin: &str) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let row: Option<(String, String)> = tx.query_row("SELECT pin_hash, name FROM users WHERE id=?1 AND active=1", [user_id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((hash, name)) = row else { return invalid("User not found") };
    if let Some(left) = crate::store::locked_secs(&tx, user_id)? {
        return invalid(crate::store::locked_message(left));
    }
    if !check_pin(old_pin, &hash) {
        let locked = crate::store::register_pin_failure(&tx, user_id, &name, "wrong old PIN when changing PIN")?;
        tx.commit()?;
        return invalid(match locked {
            Some(secs) => crate::store::locked_message(secs),
            None => "Your current PIN is not correct.".to_string(),
        });
    }
    if old_pin == new_pin {
        return invalid("The new PIN is the same as the current one. Choose a different PIN.");
    }
    check_new_pin(&tx, new_pin, user_id)?;
    tx.execute("UPDATE users SET pin_hash=?1, pin_changed_at=?2 WHERE id=?3", params![hash_pin(new_pin)?, iso(now), user_id])?;
    audit(&tx, now, &name, "change_pin", "user", user_id, &format!("PIN changed by {name}"))?;
    tx.commit()?;
    Ok(Value::Null)
}

// =====================================================================
// Settings bundle and backups
// =====================================================================

fn blob(conn: &Connection, key: &str) -> Result<Option<Value>> {
    Ok(get_setting(conn, key)?.and_then(|s| serde_json::from_str(&s).ok()))
}

pub(crate) fn default_backup_dir(conn: &Connection) -> PathBuf {
    let db = conn.path().map(PathBuf::from).unwrap_or_else(db::default_db_path);
    db.parent().map(|p| p.join("Backups")).unwrap_or_else(|| PathBuf::from("Backups"))
}

/// New printer keys get their default when an older saved bundle does not have them; the shop's own printers (TVS RP3200 Plus,
/// TSC TE244) are preselected as soon as Windows has them and nothing was chosen yet.
fn fill_printer_defaults(p: &mut Value) {
    let defaults = [
        ("compat", json!(false)), ("labelPreset", json!("32x25-3up")), ("labelWidth", json!(33)), ("labelHeight", json!(25)), ("labelGap", json!(3)), ("labelPricePrefix", json!("Rs.")),
        ("labelColumns", json!(3)), ("labelColGap", json!(2)), ("labelDarkness", json!(8)), ("labelSpeed", json!(4)), ("labelRibbon", json!(true)), ("labelRupee", json!("both")),
        ("labelOffsetX", json!(0)), ("labelOffsetY", json!(0)), ("labelFlip", json!(false)), ("labelStartMm", json!(0)),
        ("labelAlignX", json!(0)), ("labelAlignY", json!(0)), ("labelPitchAdjust", json!(0)), ("labelPullBack", json!(true)), ("labelPullBackMm", json!(12)),
    ];
    for (k, v) in defaults {
        if p[k].is_null() {
            p[k] = v;
        }
    }
    // nothing chosen, or the chosen one is not installed on this computer but the shop's TVS RP3200 Plus is: preselect it
    let bill = p["billPrinter"].as_str().unwrap_or("").trim().to_string();
    if bill.is_empty() || (!bill.starts_with("FILE:") && gokul_print::printer_state(&bill) == gokul_print::PrinterState::NotFound) {
        if let Some(name) = crate::printing::auto_bill_printer() {
            p["billPrinter"] = json!(name);
            p["mode"] = json!("escpos");
            p["cutter"] = json!(true);
            p["openDrawerOnCash"] = json!(true);
        }
    }
    if p["labelPrinter"].as_str().unwrap_or("").trim().is_empty() {
        if let Some(name) = crate::printing::auto_label_printer() {
            p["labelPrinter"] = json!(name);
        }
    }
}

/// Scanner and counter hardware settings that the POS reads (any signed-in user): how fast keystrokes must arrive to count as a scan.
pub fn get_hardware(conn: &Connection) -> Result<Value> {
    let h = blob(conn, "bundle.hardware")?.unwrap_or(Value::Null);
    Ok(json!({
        "scanGapMs": h["scanGapMs"].as_i64().unwrap_or(30).clamp(10, 100),
        "scanMinLen": h["scanMinLen"].as_i64().unwrap_or(3).clamp(2, 12),
        "scanBeep": h["scanBeep"].as_bool().unwrap_or(true),
    }))
}

pub fn get_settings_bundle(conn: &Connection) -> Result<Value> {
    let g = |k: &str| get_setting(conn, k).ok().flatten().unwrap_or_default();
    let round = g("roundToRupee") != "0";
    let shop = blob(conn, "bundle.shop")?.unwrap_or_else(|| {
        json!({ "name": g("shopName"), "legalName": "", "address": g("address"), "city": "", "state": "Tamil Nadu", "pincode": "",
                "phone": g("phone"), "email": "", "gstin": g("gstin"), "fssai": "" })
    });
    let mut tax = blob(conn, "bundle.tax")?.unwrap_or_else(|| {
        json!({ "scheme": "regular", "compositionRatePct": 1, "rates": [],
                "pricesInclusive": true, "roundToRupee": round, "showHsn": true, "interState": false, "deliveryGstRate": g("deliveryGstRate").parse::<f64>().map(crate::gst::rate_json).unwrap_or(json!(0)) })
    });
    // The owner's GST rate list (saved rates, plus any default rate not yet in it). Items, bills and purchases are checked against it.
    tax["rates"] = json!(crate::gst::tax_rates(conn));
    let bill_format = blob(conn, "bundle.billFormat")?.unwrap_or_else(|| {
        json!({ "header": "", "footer": g("receiptFooter"), "showSavings": true, "showHsn": true, "showGstSummary": true, "showQr": false,
                "language": "en", "copies": 1, "paper": "80mm" })
    });
    let mut printers = blob(conn, "bundle.printers")?.unwrap_or_else(|| {
        let p = g("printer");
        json!({ "billPrinter": p, "labelPrinter": "", "autoPrint": true, "openDrawerOnCash": true, "cutter": true, "mode": "escpos", "printLogo": true })
    });
    // The real printers installed on this computer (Windows spooler), never a made-up list.
    printers["detected"] = json!(crate::printing::detected_printers());
    if printers["mode"].is_null() {
        printers["mode"] = json!("escpos");
    }
    if printers["printLogo"].is_null() {
        printers["printLogo"] = json!(true);
    }
    fill_printer_defaults(&mut printers);
    let mut shop = shop;
    let state_code = crate::gst::shop_state_code(conn);
    shop["stateCode"] = json!(state_code);
    shop["state"] = json!(crate::gst::state_name(&state_code).unwrap_or(""));
    for (k, v) in [("shortName", ""), ("tagline", ""), ("whatsapp", "")] {
        if shop[k].is_null() {
            shop[k] = json!(v);
        }
    }
    let mut bill_format = bill_format;
    for (k, v) in [("footerTamil", json!("")), ("titleCash", json!("Cash Bill")), ("titleUpi", json!("UPI Bill")), ("titleCard", json!("Card Bill")),
                   ("titleCredit", json!("Credit Bill")), ("titleOther", json!("Bill")), ("tamilNames", json!(false)), ("numberFormat", json!("yy/nnnnn"))] {
        if bill_format[k].is_null() {
            bill_format[k] = v;
        }
    }
    let mut backup = blob(conn, "bundle.backup")?.unwrap_or_else(|| {
        json!({ "schedule": "daily", "time": "02:00", "location": "", "keep": 30, "copyToUsb": false })
    });
    if backup["location"].as_str().unwrap_or("").is_empty() {
        backup["location"] = json!(default_backup_dir(conn).display().to_string());
    }
    backup["history"] = json!(backup_history(conn)?);
    let num = |k: &str, d: i64| get_setting(conn, k).ok().flatten().and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(d);
    let security = json!({ "lockoutAttempts": num("security.lockoutAttempts", 5), "lockoutSeconds": num("security.lockoutSeconds", 60),
                           "voidLineNeedsPin": get_setting(conn, "security.voidLineNeedsPin").ok().flatten().as_deref() == Some("1") });
    let expenses = json!({ "limit": crate::expenses::expense_limit(conn) });
    let mill = blob(conn, "bundle.mill")?.unwrap_or_else(crate::mill::default_mill_bundle);
    let loyalty = crate::loyalty::rules_json(conn);
    let hardware = get_hardware(conn)?;
    Ok(json!({ "shop": shop, "tax": tax, "billFormat": bill_format, "printers": printers, "backup": backup,
               "security": security, "expenses": expenses, "mill": mill, "loyalty": loyalty, "hardware": hardware }))
}

pub fn save_settings_bundle(conn: &mut Connection, next: &Value) -> Result<Value> {
    let shop = &next["shop"];
    let name = shop["name"].as_str().unwrap_or("").trim();
    if name.is_empty() {
        return invalid("Enter the shop name.");
    }
    let gstin = shop["gstin"].as_str().unwrap_or("").trim().to_uppercase();
    // The shop's state: the one chosen, else the GSTIN's, else the state name, else Tamil Nadu. A GSTIN must agree with it.
    let chosen = shop["stateCode"].as_str().unwrap_or("").trim().to_string();
    let shop_state = if !chosen.is_empty() {
        chosen
    } else if gstin.len() >= 2 && crate::gst::state_name(&gstin[..2]).is_some() {
        gstin[..2].to_string()
    } else {
        crate::gst::state_code_for_name(shop["state"].as_str().unwrap_or("")).unwrap_or("33").to_string()
    };
    if crate::gst::state_name(&shop_state).is_none() {
        return invalid("Choose the shop's state.");
    }
    if !gstin.is_empty() {
        if let Some(p) = crate::gst::gstin_problem(&gstin, Some(&shop_state)) {
            return invalid(format!("The shop GSTIN: {p}"));
        }
    }
    let copies = next["billFormat"]["copies"].as_i64().unwrap_or(1);
    if !(1..=5).contains(&copies) {
        return invalid("Bill copies must be between 1 and 5.");
    }
    let keep = next["backup"]["keep"].as_i64().unwrap_or(30);
    if !(1..=365).contains(&keep) {
        return invalid("Keep between 1 and 365 backups.");
    }
    // Security, expenses and mill settings are optional in the call (an older screen may not send them).
    let sec = &next["security"];
    if !sec.is_null() {
        let a = sec["lockoutAttempts"].as_i64().unwrap_or(5);
        let secs = sec["lockoutSeconds"].as_i64().unwrap_or(60);
        if !(3..=20).contains(&a) {
            return invalid("Lock out after between 3 and 20 wrong PINs.");
        }
        if !(10..=3600).contains(&secs) {
            return invalid("Lock out for between 10 seconds and 1 hour.");
        }
    }
    let exp = &next["expenses"];
    if !exp.is_null() && exp["limit"].as_i64().unwrap_or(0) < 0 {
        return invalid("The expense limit cannot be negative.");
    }
    let mill = &next["mill"];
    if !mill.is_null() {
        for k in ["rateCakeTaken", "rateCakeKept"] {
            if mill[k].as_i64().unwrap_or(0) < 0 {
                return invalid("Aravai rates cannot be negative.");
            }
        }
        crate::gst::check_rate(conn, mill["serviceGstRate"].as_f64().unwrap_or(5.0), "The aravai GST rate")?;
        let ops = mill["operators"].as_array().map(|a| a.iter().filter(|o| o.as_str().map(|s| !s.trim().is_empty()).unwrap_or(false)).count()).unwrap_or(0);
        if ops == 0 {
            return invalid("Add at least one operator for the mill sheet.");
        }
    }
    // GST rate list: validated here, saved inside bundle.tax; the delivery rate must be one of the enabled rates (or 0).
    let rate_list = crate::gst::clean_rate_list(&next["tax"]["rates"])?;
    let dgst = next["tax"]["deliveryGstRate"].as_f64().unwrap_or(0.0);
    if dgst != 0.0 {
        let enabled: Vec<f64> = if rate_list.is_empty() { crate::gst::allowed_rates(conn) } else { rate_list.iter().filter(|r| r["enabled"].as_bool() == Some(true)).filter_map(|r| r["rate"].as_f64()).collect() };
        if !enabled.iter().any(|r| (*r - dgst).abs() < 1e-9) {
            return invalid(format!("The delivery GST rate {}% is not in the GST rate list.", dgst));
        }
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if !sec.is_null() {
        set_setting(&tx, "security.lockoutAttempts", &sec["lockoutAttempts"].as_i64().unwrap_or(5).to_string())?;
        set_setting(&tx, "security.lockoutSeconds", &sec["lockoutSeconds"].as_i64().unwrap_or(60).to_string())?;
        set_setting(&tx, "security.voidLineNeedsPin", if sec["voidLineNeedsPin"].as_bool().unwrap_or(false) { "1" } else { "0" })?;
    }
    if !exp.is_null() {
        set_setting(&tx, "expense.limit", &exp["limit"].as_i64().unwrap_or(0).to_string())?;
    }
    if !mill.is_null() {
        set_setting(&tx, "bundle.mill", &mill.to_string())?;
    }
    let mut shop_v = shop.clone();
    shop_v["gstin"] = json!(gstin);
    shop_v["stateCode"] = json!(shop_state);
    shop_v["state"] = json!(crate::gst::state_name(&shop_state).unwrap_or(""));
    set_setting(&tx, "shopStateCode", &shop_state)?;
    set_setting(&tx, "bundle.shop", &shop_v.to_string())?;
    let mut tax_v = next["tax"].clone();
    if !rate_list.is_empty() {
        tax_v["rates"] = json!(rate_list);
    } else if let Some(o) = tax_v.as_object_mut() {
        o.remove("rates"); // not sent: keep the defaults
    }
    set_setting(&tx, "bundle.tax", &tax_v.to_string())?;
    set_setting(&tx, "bundle.billFormat", &next["billFormat"].to_string())?;
    if next["loyalty"].is_object() {
        crate::loyalty::save_rules(&tx, &next["loyalty"])?;
    }
    let mut printers_v = next["printers"].clone();
    if let Some(o) = printers_v.as_object_mut() {
        o.remove("detected"); // read-only: always the live list from Windows
    }
    set_setting(&tx, "bundle.printers", &printers_v.to_string())?;
    if next["hardware"].is_object() {
        let h = &next["hardware"];
        let clean = json!({
            "scanGapMs": h["scanGapMs"].as_i64().unwrap_or(30).clamp(10, 100),
            "scanMinLen": h["scanMinLen"].as_i64().unwrap_or(3).clamp(2, 12),
            "scanBeep": h["scanBeep"].as_bool().unwrap_or(true),
        });
        set_setting(&tx, "bundle.hardware", &clean.to_string())?;
    }
    let mut backup = next["backup"].clone();
    if let Some(o) = backup.as_object_mut() {
        o.remove("history");
    }
    set_setting(&tx, "bundle.backup", &backup.to_string())?;
    // The values the counter and receipts read.
    let city_pin = [shop["city"].as_str().unwrap_or(""), shop["pincode"].as_str().unwrap_or("")].iter().filter(|s| !s.trim().is_empty()).map(|s| s.trim()).collect::<Vec<_>>().join(" ");
    let address = [shop["address"].as_str().unwrap_or("").trim(), city_pin.as_str()].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(", ");
    set_setting(&tx, "shopName", name)?;
    set_setting(&tx, "address", &address)?;
    set_setting(&tx, "gstin", &gstin)?;
    set_setting(&tx, "phone", shop["phone"].as_str().unwrap_or("").trim())?;
    set_setting(&tx, "receiptFooter", next["billFormat"]["footer"].as_str().unwrap_or(""))?;
    set_setting(&tx, "printer", next["printers"]["billPrinter"].as_str().unwrap_or(""))?;
    set_setting(&tx, "roundToRupee", if next["tax"]["roundToRupee"].as_bool().unwrap_or(true) { "1" } else { "0" })?;
    set_setting(&tx, "deliveryGstRate", &dgst.to_string())?;
    audit(&tx, Local::now(), OFFICE, "update", "settings", "bundle", "")?;
    tx.commit()?;
    get_settings_bundle(conn)
}


fn backup_history(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,at,size_b,kind,ok FROM backup_log ORDER BY id DESC LIMIT 60")?;
    let v = st
        .query_map([], |r| {
            Ok(json!({ "id": format!("bk{}", r.get::<_, i64>(0)?), "at": r.get::<_, String>(1)?, "sizeMb": r.get::<_, i64>(2)? as f64 / 1_048_576.0,
                       "kind": r.get::<_, String>(3)?, "ok": r.get::<_, i64>(4)? != 0 }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// A consistent copy of the live database (`VACUUM INTO`) in the backup folder; old copies beyond "keep" are removed.
pub fn backup_now(conn: &Connection) -> Result<Value> {
    let bundle = get_settings_bundle(conn)?;
    let dir = PathBuf::from(bundle["backup"]["location"].as_str().unwrap_or(""));
    backup_to(conn, &dir, "manual", bundle["backup"]["keep"].as_i64().unwrap_or(30))
}

/// A failed attempt is kept in the backup log (ok = 0) so Office can warn and the scheduler can back off.
fn log_backup_failure(conn: &Connection, dir: &Path, kind: &str, msg: &str) {
    let _ = conn.execute(
        "INSERT INTO backup_log(at,path,size_b,kind,ok,error) VALUES(?1,?2,0,?3,0,?4)",
        params![iso(Local::now()), dir.display().to_string(), kind, msg],
    );
}

pub fn backup_to(conn: &Connection, dir: &Path, kind: &str, keep: i64) -> Result<Value> {
    if let Err(e) = std::fs::create_dir_all(dir) {
        let msg = format!("Could not use the backup folder {}: {e}. Choose another folder in Settings.", dir.display());
        log_backup_failure(conn, dir, kind, &msg);
        return invalid(msg);
    }
    let now = Local::now();
    let stem = format!("gokul-{}", now.format("%Y%m%d-%H%M%S"));
    let mut file = dir.join(format!("{stem}.db"));
    let mut n = 2;
    while file.exists() {
        file = dir.join(format!("{stem}-{n}.db")); // two backups in the same second (a Z close and the schedule)
        n += 1;
    }
    let sql = format!("VACUUM INTO '{}'", file.display().to_string().replace('\'', "''"));
    if let Err(e) = conn.execute_batch(&sql) {
        let msg = format!("The backup could not be written to {}: {e}", dir.display());
        log_backup_failure(conn, dir, kind, &msg);
        return invalid(msg);
    }
    let size = std::fs::metadata(&file).map(|m| m.len() as i64).unwrap_or(0);
    conn.execute(
        "INSERT INTO backup_log(at,path,size_b,kind,ok) VALUES(?1,?2,?3,?4,1)",
        params![iso(now), file.display().to_string(), size, kind],
    )?;
    let id = conn.last_insert_rowid();
    // Prune: keep the newest `keep` files and log rows.
    let old: Vec<(i64, String)> = {
        let mut st = conn.prepare("SELECT id,path FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT -1 OFFSET ?1")?;
        let v = st.query_map([keep.max(1)], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    for (oid, path) in old {
        let _ = std::fs::remove_file(&path);
        conn.execute("DELETE FROM backup_log WHERE id=?1", [oid])?;
    }
    audit(conn, now, OFFICE, "backup", "database", &file.display().to_string(), "")?;
    Ok(json!({ "id": format!("bk{id}"), "at": iso(now), "sizeMb": size as f64 / 1_048_576.0, "kind": kind, "ok": true }))
}

/// Checks the backup file and stages it. The swap happens when the apps next start (see `db::apply_pending_restore`).
pub fn restore_backup(conn: &Connection, id: &str) -> Result<Value> {
    let fail = |m: &str| Ok(json!({ "ok": false, "message": m }));
    let Some(n) = db::parse_id("bk", id) else { return fail("That backup was not found.") };
    let row: Option<(String, i64)> = conn.query_row("SELECT path, ok FROM backup_log WHERE id=?1", [n], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((path, ok)) = row else { return fail("That backup was not found.") };
    if ok == 0 || !Path::new(&path).exists() {
        return fail("That backup file is missing or damaged and cannot be restored.");
    }
    let check = rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|c| c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)));
    if check.as_deref() != Ok("ok") {
        return fail("That backup file is damaged and cannot be restored.");
    }
    let live = conn.path().map(PathBuf::from).unwrap_or_else(db::default_db_path);
    let staged = live.with_extension("db.restore");
    if let Err(e) = std::fs::copy(&path, &staged) {
        return invalid(format!("Could not stage the restore: {e}"));
    }
    audit(conn, Local::now(), OFFICE, "restore_staged", "database", &path, "")?;
    Ok(json!({ "ok": true, "message": "Backup checked. Close Gokul POS and Gokul Office, then open one again to finish restoring." }))
}

/// A stored name that is not a name ("0", ".", "-", empty, "none"). Same rule as `NO_NAME_SQL` and the TypeScript `isNoName`.
pub fn is_no_name(name: &str) -> bool {
    let t = name.trim().to_lowercase();
    if t.is_empty() || ["none", "null", "nil", "na", "n/a", "no name", "noname", "unknown", "customer"].contains(&t.as_str()) {
        return true;
    }
    !t.chars().any(|c| !(c.is_ascii() && !c.is_ascii_alphabetic()) )
}
