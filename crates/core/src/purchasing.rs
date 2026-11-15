//! Purchases (GRN), suppliers and their ledger, and production: pressing batches, barrels and packing runs.
//! Each operation is ONE transaction: documents, input GST, stock ledger rows, supplier balance and audit together.

use crate::catalog::OFFICE;
use crate::db::{self, audit, doc_number, drawer_entry, fresh_id, fy_of, get_setting, iso, next_seq, parse_id, post_movement, round_div};
use crate::error::{invalid, ApiError, Result};
use crate::store::fuzzy_score;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const PURCHASE_SERIES: &str = "PU";
pub const PRESS_SERIES: &str = "PB";
pub const PACK_SERIES: &str = "PK";

// =====================================================================
// GRN maths (port of computeGrn in packages/data/src/areas/purchasing.ts)
// =====================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrnDraftLine {
    pub item_id: String,
    pub qty: i64,
    pub rate: i64,
    #[serde(default)]
    pub discount_pct: f64,
    #[serde(default, with = "crate::types::rate_serde")]
    pub gst_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrnLineCalc {
    pub item_id: String,
    pub qty: i64,
    pub rate: i64,
    pub discount_pct: f64,
    #[serde(with = "crate::types::rate_serde")]
    pub gst_rate: f64,
    pub gross: i64,
    pub discount: i64,
    pub taxable: i64,
    pub gst: i64,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrnTotals {
    pub lines: Vec<GrnLineCalc>,
    pub item_count: usize,
    pub gross: i64,
    pub discount: i64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    pub igst: i64,
    pub gst: i64,
    pub freight: i64,
    pub other_charges: i64,
    pub before_round: i64,
    pub round_off: i64,
    pub total: i64,
    pub slabs: Vec<Value>,
}

fn discount_bp(pct: f64) -> i64 {
    (pct * 100.0).round() as i64
}

pub fn compute_grn(lines: &[GrnDraftLine], freight: i64, other: i64, interstate: bool) -> GrnTotals {
    let calc: Vec<GrnLineCalc> = lines
        .iter()
        .map(|l| {
            let gross = round_div(l.rate * l.qty, 1000);
            let bp = discount_bp(l.discount_pct);
            let discount = round_div(gross * bp, 10_000);
            let taxable = gross - discount;
            let gst = round_div(taxable * crate::money::rate_bp(l.gst_rate), 10_000);
            GrnLineCalc {
                item_id: l.item_id.clone(),
                qty: l.qty,
                rate: l.rate,
                discount_pct: bp as f64 / 100.0,
                gst_rate: l.gst_rate,
                gross,
                discount,
                taxable,
                gst,
                amount: taxable + gst,
            }
        })
        .collect();
    let sum = |f: fn(&GrnLineCalc) -> i64| calc.iter().map(f).sum::<i64>();
    let gst = sum(|l| l.gst);
    let taxable = sum(|l| l.taxable);
    let mut slabs: std::collections::BTreeMap<i64, (i64, i64)> = Default::default();
    for l in &calc {
        let s = slabs.entry(crate::money::rate_bp(l.gst_rate)).or_default();
        s.0 += l.taxable;
        s.1 += l.gst;
    }
    let before_round = taxable + gst + freight + other;
    let total = round_div(before_round, 100) * 100;
    let half = gst.div_euclid(2);
    GrnTotals {
        item_count: calc.len(),
        gross: sum(|l| l.gross),
        discount: sum(|l| l.discount),
        taxable,
        cgst: if interstate { 0 } else { half },
        sgst: if interstate { 0 } else { gst - half },
        igst: if interstate { gst } else { 0 },
        gst,
        freight,
        other_charges: other,
        before_round,
        round_off: total - before_round,
        total,
        slabs: slabs.into_iter().map(|(rate, (t, g))| json!({ "rate": crate::gst::rate_json(rate as f64 / 100.0), "taxable": t, "gst": g })).collect(),
        lines: calc,
    }
}

// =====================================================================
// Purchasables and GRN
// =====================================================================

fn purchasable_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let kind: String = r.get(2)?;
    let loose: i64 = r.get(8)?;
    Ok(json!({
        "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "kind": kind, "unit": r.get::<_, String>(3)?,
        "hsn": r.get::<_, String>(4)?, "gstRate": r.get::<_, i64>(5)?, "cost": r.get::<_, i64>(6)?, "stock": r.get::<_, i64>(7)?,
        "decimal": loose != 0 || kind == "seed",
    }))
}

/// Shop items plus raw seeds and packing material, fuzzy-matched on name and HSN.
pub fn search_purchasable(conn: &Connection, query: &str, limit: usize) -> Result<Vec<Value>> {
    let mut st = conn.prepare_cached(
        "SELECT id,name,kind,unit,hsn,gst_rate,cost,stock,loose FROM items WHERE active=1 ORDER BY CASE kind WHEN 'item' THEN 2 ELSE 1 END, rowid",
    )?;
    let rows: Vec<(String, String, Value)> = st
        .query_map([], |r| {
            let v = purchasable_json(r)?;
            Ok((r.get::<_, String>(1)?, r.get::<_, String>(4)?, v))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if query.trim().is_empty() {
        return Ok(rows.into_iter().take(limit).map(|r| r.2).collect());
    }
    let mut scored: Vec<(i64, usize)> =
        rows.iter().enumerate().map(|(i, (n, h, _))| (fuzzy_score(query, n).max(fuzzy_score(query, h)), i)).filter(|(s, _)| *s > 0).collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    Ok(scored.into_iter().take(limit).map(|(_, i)| rows[i].2.clone()).collect())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrnDraft {
    pub supplier_id: String,
    #[serde(default)]
    pub invoice_no: String,
    #[serde(default)]
    pub invoice_date: String,
    pub lines: Vec<GrnDraftLine>,
    #[serde(default)]
    pub freight: i64,
    #[serde(default)]
    pub other_charges: i64,
    #[serde(default)]
    pub paid_now: i64,
    #[serde(default)]
    pub pay_mode: String,
    #[serde(default)]
    pub update_cost: bool,
    #[serde(default)]
    pub notes: Option<String>,
}

fn shop_state(conn: &Connection) -> Result<String> {
    let g = get_setting(conn, "gstin")?.unwrap_or_default();
    Ok(if g.len() >= 2 && g[..2].chars().all(|c| c.is_ascii_digit()) { g[..2].to_string() } else { "33".into() })
}

fn parse_day(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok()
}

fn pay_status(total: i64, paid: i64) -> &'static str {
    if paid >= total {
        "paid"
    } else if paid > 0 {
        "partial"
    } else {
        "due"
    }
}

const PAY_MODES: &[&str] = &["cash", "upi", "bank", "cheque"];

pub fn create_grn(conn: &mut Connection, d: &GrnDraft) -> Result<Value> {
    create_grn_at(conn, d, Local::now())
}

pub fn create_grn_at(conn: &mut Connection, d: &GrnDraft, now: chrono::DateTime<Local>) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let sup: Option<(String, String, i64)> = tx
        .query_row("SELECT name,gstin,credit_days FROM suppliers WHERE id=?1", [&d.supplier_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let Some((sup_name, sup_gstin, credit_days)) = sup else { return invalid("Choose a supplier first.") };
    if d.lines.is_empty() {
        return invalid("Add at least one item.");
    }
    if d.freight < 0 || d.other_charges < 0 || d.paid_now < 0 {
        return invalid("Amounts cannot be negative.");
    }
    let mut info: Vec<(String, String, String)> = vec![];
    for l in &d.lines {
        let it: Option<(String, String, String)> = tx
            .query_row("SELECT name,unit,kind FROM items WHERE id=?1", [&l.item_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()?;
        let Some(it) = it else { return invalid("One of the items no longer exists.") };
        if l.qty <= 0 {
            return invalid("Quantity must be more than zero.");
        }
        if l.rate < 0 || !(0.0..=100.0).contains(&l.discount_pct) {
            return invalid("Check the rate and discount on each line.");
        }
        crate::gst::check_rate(&tx, l.gst_rate, "GST rate")?;
        info.push(it);
    }
    let pay_mode = if PAY_MODES.contains(&d.pay_mode.as_str()) { d.pay_mode.clone() } else { "cash".into() };
    let interstate = !sup_gstin.trim().is_empty() && !sup_gstin.starts_with(&shop_state(&tx)?);
    let t = compute_grn(&d.lines, d.freight, d.other_charges, interstate);
    let paid_at_entry = d.paid_now.min(t.total);
    let fy = fy_of(now);
    let seq = next_seq(&tx, PURCHASE_SERIES, &fy)?;
    let number = doc_number("PU", &fy, seq);
    let inv_day = parse_day(&d.invoice_date).unwrap_or_else(|| now.date_naive());
    let due = inv_day + Duration::days(credit_days);
    tx.execute(
        "INSERT INTO purchases(number,series,fy,seq,at,day,supplier_id,supplier_name,invoice_no,invoice_date,due_date,interstate,freight,other_charges,
            taxable,cgst,sgst,igst,round_off,total,paid,paid_at_entry,pay_mode,cost_updated,notes,by_name)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)",
        params![
            number, PURCHASE_SERIES, fy, seq, iso(now), db::day_of(now), d.supplier_id, sup_name, d.invoice_no.trim(),
            inv_day.format("%Y-%m-%d").to_string(), due.format("%Y-%m-%d").to_string(), interstate, d.freight, d.other_charges,
            t.taxable, t.cgst, t.sgst, t.igst, t.round_off, t.total, paid_at_entry, paid_at_entry,
            if paid_at_entry > 0 { Some(pay_mode.clone()) } else { None }, d.update_cost, d.notes.clone().unwrap_or_default(), &db::actor_or(OFFICE)
        ],
    )?;
    let pid = tx.last_insert_rowid();
    for (i, (l, (name, unit, kind))) in d.lines.iter().zip(info.iter()).enumerate() {
        tx.execute(
            "INSERT INTO purchase_lines(purchase_id,line_no,item_id,name,unit,kind,qty,rate,discount_bp,gst_rate) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![pid, i as i64, l.item_id, name, unit, kind, l.qty, l.rate, discount_bp(l.discount_pct), l.gst_rate],
        )?;
        post_movement(&tx, &iso(now), &l.item_id, "purchase", l.qty, "purchase", &pid.to_string(), &format!("{number}, {sup_name}"), OFFICE)?;
        if d.update_cost {
            let c = &t.lines[i];
            tx.execute("UPDATE items SET cost=?1 WHERE id=?2", params![round_div(c.taxable * 1000, c.qty), l.item_id])?;
        }
    }
    if paid_at_entry > 0 && pay_mode == "cash" {
        drawer_entry(&tx, now, "out", "Supplier payment", paid_at_entry, &number, OFFICE)?;
    }
    audit(&tx, now, OFFICE, "create", "purchase", &number, &format!("{sup_name}, total {} paise, {} lines", t.total, d.lines.len()))?;
    let grn = load_grn(&tx, pid)?.ok_or_else(|| db::internal("Purchase vanished"))?;
    tx.commit()?;
    Ok(grn)
}

fn load_grn(conn: &Connection, id: i64) -> Result<Option<Value>> {
    let h = conn
        .query_row(
            "SELECT number,at,supplier_id,supplier_name,invoice_no,invoice_date,due_date,interstate,freight,other_charges,total,paid,paid_at_entry,pay_mode,cost_updated,notes
             FROM purchases WHERE id=?1",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, i64>(7)? != 0, r.get::<_, i64>(8)?, r.get::<_, i64>(9)?,
                    r.get::<_, i64>(10)?, r.get::<_, i64>(11)?, r.get::<_, i64>(12)?, r.get::<_, Option<String>>(13)?,
                    r.get::<_, i64>(14)? != 0, r.get::<_, String>(15)?,
                ))
            },
        )
        .optional()?;
    let Some((number, at, sid, sname, inv_no, inv_date, due, inter, freight, other, total, paid, paid_entry, mode, cost_upd, notes)) = h else {
        return Ok(None);
    };
    let mut st = conn.prepare_cached(
        "SELECT item_id,name,unit,kind,qty,rate,discount_bp,gst_rate FROM purchase_lines WHERE purchase_id=?1 ORDER BY line_no",
    )?;
    let raw: Vec<(String, String, String, String, i64, i64, i64, f64)> = st
        .query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let draft: Vec<GrnDraftLine> = raw
        .iter()
        .map(|l| GrnDraftLine { item_id: l.0.clone(), qty: l.4, rate: l.5, discount_pct: l.6 as f64 / 100.0, gst_rate: l.7 })
        .collect();
    let totals = compute_grn(&draft, freight, other, inter);
    let lines: Vec<Value> = raw
        .iter()
        .zip(totals.lines.iter())
        .map(|(l, c)| {
            let mut v = serde_json::to_value(c).unwrap_or(Value::Null);
            v["name"] = json!(l.1);
            v["unit"] = json!(l.2);
            v["kind"] = json!(l.3);
            v
        })
        .collect();
    Ok(Some(json!({
        "id": format!("g{id}"), "number": number, "date": at, "supplierId": sid, "supplierName": sname, "invoiceNo": inv_no,
        "invoiceDate": inv_date, "dueDate": due, "lines": lines, "totals": totals, "total": total, "paid": paid,
        "paidAtEntry": paid_entry, "payMode": mode, "status": pay_status(total, paid), "interstate": inter,
        "costUpdated": cost_upd, "notes": notes,
    })))
}

pub fn get_grn(conn: &Connection, id: &str) -> Result<Value> {
    let Some(n) = parse_id("g", id) else { return Ok(Value::Null) };
    Ok(load_grn(conn, n)?.unwrap_or(Value::Null))
}

pub fn list_grns(conn: &Connection) -> Result<Vec<Value>> {
    let ids: Vec<i64> = {
        let mut st = conn.prepare("SELECT id FROM purchases ORDER BY at DESC, id DESC LIMIT 1000")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let mut out = vec![];
    for id in ids {
        if let Some(g) = load_grn(conn, id)? {
            out.push(g);
        }
    }
    Ok(out)
}

/// CoreApi `listPurchases`: the light list (id, number, date, supplier, lines at purchase rate, total, paid).
pub fn list_purchases(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,number,at,supplier_id,supplier_name,total,paid FROM purchases ORDER BY at DESC, id DESC LIMIT 1000")?;
    let heads: Vec<(i64, String, String, String, String, i64, i64)> =
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut ls = conn.prepare("SELECT item_id,name,qty,rate FROM purchase_lines WHERE purchase_id=?1 ORDER BY line_no")?;
    let mut out = vec![];
    for (id, number, at, sid, sname, total, paid) in heads {
        let lines = ls
            .query_map([id], |r| Ok(json!({ "itemId": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "qty": r.get::<_, i64>(2)?, "cost": r.get::<_, i64>(3)? })))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        out.push(json!({ "id": format!("g{id}"), "number": number, "date": at, "supplierId": sid, "supplierName": sname, "lines": lines, "total": total, "paid": paid }));
    }
    Ok(out)
}

// =====================================================================
// Suppliers and ledger
// =====================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierDraft {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub gstin: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub contact: String,
    #[serde(default = "fifteen")]
    pub credit_days: i64,
}
fn fifteen() -> i64 {
    15
}

pub fn is_valid_gstin(g: &str) -> bool {
    let c: Vec<char> = g.trim().to_uppercase().chars().collect();
    c.len() == 15
        && c[..2].iter().all(|x| x.is_ascii_digit())
        && c[2..7].iter().all(|x| x.is_ascii_uppercase())
        && c[7..11].iter().all(|x| x.is_ascii_digit())
        && c[11].is_ascii_uppercase()
        && (c[12].is_ascii_digit() && c[12] != '0' || c[12].is_ascii_uppercase())
        && c[13] == 'Z'
        && (c[14].is_ascii_digit() || c[14].is_ascii_uppercase())
}

fn profile_json(conn: &Connection, id: &str) -> Result<Option<Value>> {
    let v = conn
        .query_row(
            "SELECT id,name,phone,city,gstin,address,contact,credit_days,
                    COALESCE((SELECT SUM(total-paid) FROM purchases p WHERE p.supplier_id=suppliers.id),0)
             FROM suppliers WHERE id=?1",
            [id],
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "phone": r.get::<_, String>(2)?, "city": r.get::<_, String>(3)?,
                    "gstin": r.get::<_, String>(4)?, "address": r.get::<_, String>(5)?, "contact": r.get::<_, String>(6)?,
                    "creditDays": r.get::<_, i64>(7)?, "outstanding": r.get::<_, i64>(8)?,
                }))
            },
        )
        .optional()?;
    Ok(v)
}

pub fn save_supplier(conn: &mut Connection, d: &SupplierDraft) -> Result<Value> {
    let name = d.name.trim();
    if name.is_empty() {
        return invalid("Enter the supplier name.");
    }
    if !d.gstin.trim().is_empty() && !is_valid_gstin(&d.gstin) {
        return invalid("GSTIN looks wrong. It has 15 letters and digits, e.g. 33AAKFG4821M1ZQ.");
    }
    if d.phone.chars().filter(|c| c.is_ascii_digit()).count() < 10 {
        return invalid("Enter a 10 digit phone number.");
    }
    if !(0..=365).contains(&d.credit_days) {
        return invalid("Credit days must be between 0 and 365.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let own = d.id.clone().unwrap_or_default();
    let dup: i64 = tx.query_row("SELECT COUNT(*) FROM suppliers WHERE lower(name)=lower(?1) AND id != ?2", params![name, own], |r| r.get(0))?;
    if dup > 0 {
        return invalid("A supplier with this name already exists.");
    }
    let now = Local::now();
    let gstin = d.gstin.trim().to_uppercase();
    let id = match &d.id {
        Some(id) => {
            let n = tx.execute(
                "UPDATE suppliers SET name=?1,phone=?2,city=?3,gstin=?4,address=?5,contact=?6,credit_days=?7 WHERE id=?8",
                params![name, d.phone.trim(), d.city.trim(), gstin, d.address.trim(), d.contact.trim(), d.credit_days, id],
            )?;
            if n == 0 {
                return invalid("Supplier not found.");
            }
            audit(&tx, now, OFFICE, "update", "supplier", id, name)?;
            id.clone()
        }
        None => {
            let id = fresh_id(&tx, "suppliers", "s", "SUPPLIER")?;
            tx.execute(
                "INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![id, name, d.phone.trim(), d.city.trim(), gstin, d.address.trim(), d.contact.trim(), d.credit_days, iso(now)],
            )?;
            audit(&tx, now, OFFICE, "create", "supplier", &id, name)?;
            id
        }
    };
    let p = profile_json(&tx, &id)?.ok_or_else(|| db::internal("Supplier vanished"))?;
    tx.commit()?;
    Ok(p)
}

/// CoreApi `listSuppliers`.
pub fn list_suppliers(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare(
        "SELECT id,name,phone,city,gstin,COALESCE((SELECT SUM(total-paid) FROM purchases p WHERE p.supplier_id=suppliers.id),0) FROM suppliers ORDER BY rowid",
    )?;
    let v = st
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "phone": r.get::<_, String>(2)?,
                "city": r.get::<_, String>(3)?, "gstin": r.get::<_, String>(4)?, "outstanding": r.get::<_, i64>(5)?,
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn age_days(day: &str, today: NaiveDate) -> i64 {
    parse_day(day).map(|d| (today - d).num_days().max(0)).unwrap_or(0)
}

fn summary_json(conn: &Connection, sid: &str) -> Result<Option<Value>> {
    let Some(profile) = profile_json(conn, sid)? else { return Ok(None) };
    let today = Local::now().date_naive();
    let today_s = today.format("%Y-%m-%d").to_string();
    let mut st = conn.prepare("SELECT invoice_date,due_date,total,paid,at,paid_at_entry FROM purchases WHERE supplier_id=?1")?;
    let rows: Vec<(String, String, i64, i64, String, i64)> =
        st.query_map([sid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let (mut b0, mut b31, mut b61, mut b90) = (0i64, 0i64, 0i64, 0i64);
    let (mut due_total, mut overdue, mut purchased, mut purchased30) = (0i64, 0i64, 0i64, 0i64);
    let cutoff = iso(Local::now() - Duration::days(30));
    let mut last_purchase: Option<String> = None;
    let mut last_pay: Option<String> = None;
    for (inv, due_date, total, paid, at, entry) in &rows {
        let due = total - paid;
        purchased += total;
        if *at >= cutoff {
            purchased30 += total;
        }
        if last_purchase.as_ref().is_none_or(|l| at > l) {
            last_purchase = Some(at.clone());
        }
        if *entry > 0 && last_pay.as_ref().is_none_or(|l| at > l) {
            last_pay = Some(at.clone());
        }
        if due <= 0 {
            continue;
        }
        due_total += due;
        match age_days(inv, today) {
            0..=30 => b0 += due,
            31..=60 => b31 += due,
            61..=90 => b61 += due,
            _ => b90 += due,
        }
        if *due_date < today_s {
            overdue += due;
        }
    }
    let pay_last: Option<String> = conn.query_row("SELECT MAX(at) FROM supplier_payments WHERE supplier_id=?1", [sid], |r| r.get(0))?;
    if let Some(p) = pay_last {
        if last_pay.as_ref().is_none_or(|l| &p > l) {
            last_pay = Some(p);
        }
    }
    Ok(Some(json!({
        "profile": profile, "due": due_total, "overdue": overdue, "totalPurchased": purchased, "purchased30": purchased30,
        "billCount": rows.len(), "lastPurchaseOn": last_purchase, "lastPaymentOn": last_pay,
        "ageing": { "current": b0, "d31": b31, "d61": b61, "d90": b90 },
    })))
}

pub fn list_supplier_summaries(conn: &Connection) -> Result<Vec<Value>> {
    let ids: Vec<String> = {
        let mut st = conn.prepare("SELECT id FROM suppliers ORDER BY rowid")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let mut out = vec![];
    for id in ids {
        if let Some(s) = summary_json(conn, &id)? {
            out.push(s);
        }
    }
    Ok(out)
}

pub fn get_supplier_ledger(conn: &Connection, sid: &str) -> Result<Value> {
    let Some(summary) = summary_json(conn, sid)? else { return Ok(Value::Null) };
    // (date, tiebreak, entry without balance)
    let mut raw: Vec<(String, i64, Value)> = vec![];
    let mut st = conn.prepare("SELECT id,number,at,invoice_no,total,paid_at_entry,pay_mode FROM purchases WHERE supplier_id=?1")?;
    let heads = st
        .query_map([sid], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, Option<String>>(6)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (id, number, at, inv, total, entry, mode) in heads {
        raw.push((at.clone(), id * 2, json!({ "id": format!("l-g{id}"), "date": at, "kind": "purchase", "ref": number, "note": format!("Invoice {inv}"), "debit": total, "credit": 0 })));
        if entry > 0 {
            raw.push((at.clone(), id * 2 + 1, json!({ "id": format!("lp-g{id}"), "date": at, "kind": "payment", "ref": number, "note": format!("Paid at purchase ({})", mode.unwrap_or_else(|| "cash".into())), "debit": 0, "credit": entry })));
        }
    }
    let mut ps = conn.prepare("SELECT id,at,amount,mode,ref,note FROM supplier_payments WHERE supplier_id=?1")?;
    let pays = ps
        .query_map([sid], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (id, at, amount, mode, rf, note) in pays {
        let r = if rf.is_empty() { mode.to_uppercase() } else { rf };
        let n = if note.is_empty() { format!("Payment by {mode}") } else { note };
        raw.push((at.clone(), 1_000_000_000 + id, json!({ "id": format!("l-sp{id}"), "date": at, "kind": "payment", "ref": r, "note": n, "debit": 0, "credit": amount })));
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
    let today = Local::now().date_naive();
    let today_s = today.format("%Y-%m-%d").to_string();
    let mut ob = conn.prepare("SELECT id,number,invoice_no,invoice_date,due_date,total,total-paid FROM purchases WHERE supplier_id=?1 AND total>paid ORDER BY at, id")?;
    let open = ob
        .query_map([sid], |r| {
            let inv_date: String = r.get(3)?;
            let due_date: String = r.get(4)?;
            Ok(json!({
                "grnId": format!("g{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "invoiceNo": r.get::<_, String>(2)?,
                "date": inv_date, "dueDate": due_date, "total": r.get::<_, i64>(5)?, "due": r.get::<_, i64>(6)?,
                "ageDays": age_days(&inv_date, today), "overdue": due_date < today_s,
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "summary": summary, "entries": entries, "openBills": open }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPaymentDraft {
    pub supplier_id: String,
    pub amount: i64,
    pub mode: String,
    #[serde(default)]
    pub r#ref: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

/// Pays the supplier's oldest unpaid purchases first.
pub fn record_supplier_payment(conn: &mut Connection, d: &SupplierPaymentDraft) -> Result<Value> {
    if d.amount <= 0 {
        return invalid("Enter an amount more than zero.");
    }
    if !PAY_MODES.contains(&d.mode.as_str()) {
        return invalid("Choose how it was paid.");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let name: Option<String> = tx.query_row("SELECT name FROM suppliers WHERE id=?1", [&d.supplier_id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return invalid("Supplier not found.") };
    let due: i64 = tx.query_row("SELECT COALESCE(SUM(total-paid),0) FROM purchases WHERE supplier_id=?1", [&d.supplier_id], |r| r.get(0))?;
    if d.amount > due {
        return invalid("This is more than the amount due.");
    }
    let mut left = d.amount;
    let open: Vec<(i64, i64)> = {
        let mut st = tx.prepare("SELECT id,total-paid FROM purchases WHERE supplier_id=?1 AND total>paid ORDER BY at, id")?;
        let v = st.query_map([&d.supplier_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    for (pid, owed) in open {
        if left <= 0 {
            break;
        }
        let take = left.min(owed);
        tx.execute("UPDATE purchases SET paid = paid + ?1 WHERE id=?2", params![take, pid])?;
        left -= take;
    }
    let when = d.date.as_deref().and_then(parse_day).map(|day| {
        let t = now.time();
        let naive = day.and_time(t);
        chrono::TimeZone::from_local_datetime(&Local, &naive).earliest().unwrap_or(now)
    });
    let when = when.unwrap_or(now);
    tx.execute(
        "INSERT INTO supplier_payments(supplier_id,at,day,amount,mode,ref,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![d.supplier_id, iso(when), db::day_of(when), d.amount, d.mode, d.r#ref.clone().unwrap_or_default(), d.note.clone().unwrap_or_default(), db::actor_or(OFFICE)],
    )?;
    if d.mode == "cash" {
        drawer_entry(&tx, now, "out", "Supplier payment", d.amount, &name, OFFICE)?;
    }
    audit(&tx, now, OFFICE, "supplier_payment", "supplier", &d.supplier_id, &format!("{} paise by {}", d.amount, d.mode))?;
    let ledger = get_supplier_ledger(&tx, &d.supplier_id)?;
    tx.commit()?;
    Ok(ledger)
}

// =====================================================================
// Production: seeds, pressing, barrels, packing
// =====================================================================

pub(crate) struct SeedBase {
    pub(crate) key: &'static str,
    pub(crate) label: &'static str,
    ta: &'static str,
    pub(crate) oil_name: &'static str,
    pub(crate) rm: &'static str,
    cake_name: &'static str,
    uses_jaggery: bool,
}
const SEEDS: &[SeedBase] = &[
    SeedBase { key: "groundnut", label: "Groundnut", ta: "வேர்க்கடலை", oil_name: "Groundnut Oil", rm: "rm-gn", cake_name: "Groundnut Oil Cake (Loose)", uses_jaggery: false },
    SeedBase { key: "sesame", label: "Sesame (Ellu)", ta: "எள்", oil_name: "Gingelly Oil", rm: "rm-sesame", cake_name: "Gingelly Oil Cake (Loose)", uses_jaggery: true },
    SeedBase { key: "copra", label: "Copra", ta: "கொப்பரை", oil_name: "Coconut Oil", rm: "rm-copra", cake_name: "Coconut Oil Cake (Loose)", uses_jaggery: false },
];
pub(crate) const JAGGERY_ITEM: &str = "Palm Jaggery (Karupatti) (Loose)";

pub(crate) fn seed_base(key: &str) -> Option<&'static SeedBase> {
    SEEDS.iter().find(|s| s.key == key)
}

fn setting_f64(conn: &Connection, key: &str, default: f64) -> f64 {
    get_setting(conn, key).ok().flatten().and_then(|v| v.trim().parse().ok()).unwrap_or(default)
}

pub struct Norm {
    pub kg_per_l: f64,
    pub density: f64,
    pub settle_days: i64,
}

pub fn seed_norm(conn: &Connection, seed: &str) -> Norm {
    let (k, d, s) = match seed {
        "sesame" => (2.7, 0.92, 5.0),
        "copra" => (1.6, 0.92, 3.0),
        _ => (2.5, 0.91, 4.0),
    };
    Norm {
        kg_per_l: setting_f64(conn, &format!("norm.{seed}.kgPerL"), k),
        density: setting_f64(conn, &format!("norm.{seed}.density"), d),
        settle_days: setting_f64(conn, &format!("norm.{seed}.settleDays"), s) as i64,
    }
}

pub fn pack_wastage_norm(conn: &Connection) -> f64 {
    setting_f64(conn, "norm.packWastagePct", 0.5)
}

/// Edit the production norms (settings, not constants). `norms`: [{seed, kgPerL, density, settleDays}], plus packWastagePct.
pub fn save_seed_norms(conn: &mut Connection, norms: &Value) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for n in norms.get("seeds").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let seed = n["seed"].as_str().unwrap_or("");
        if seed_base(seed).is_none() {
            return invalid("Unknown seed.");
        }
        for (field, key) in [("kgPerL", "kgPerL"), ("density", "density"), ("settleDays", "settleDays")] {
            if let Some(x) = n.get(field).and_then(|v| v.as_f64()) {
                if x <= 0.0 {
                    return invalid("Norms must be more than zero.");
                }
                db::set_setting(&tx, &format!("norm.{seed}.{key}"), &x.to_string())?;
            }
        }
    }
    if let Some(p) = norms.get("packWastagePct").and_then(|v| v.as_f64()) {
        if p < 0.0 {
            return invalid("Wastage norm cannot be negative.");
        }
        db::set_setting(&tx, "norm.packWastagePct", &p.to_string())?;
    }
    audit(&tx, Local::now(), OFFICE, "update", "norms", "production", "")?;
    tx.commit()?;
    Ok(json!(list_seed_profiles(conn)?))
}

pub fn list_seed_profiles(conn: &Connection) -> Result<Vec<Value>> {
    let mut out = vec![];
    for s in SEEDS {
        let n = seed_norm(conn, s.key);
        let (stock, cost): (i64, i64) = conn.query_row("SELECT stock,cost FROM items WHERE id=?1", [s.rm], |r| Ok((r.get(0)?, r.get(1)?)))?;
        out.push(json!({
            "seed": s.key, "label": s.label, "ta": s.ta, "oilName": s.oil_name, "kgPerL": n.kg_per_l, "density": n.density,
            "settleDays": n.settle_days, "stock": stock, "cost": cost, "usesJaggery": s.uses_jaggery,
            "packWastagePct": pack_wastage_norm(conn),
        }));
    }
    Ok(out)
}

pub fn pressing_metrics(seed_g: i64, cleaning_g: i64, jaggery_g: i64, oil_ml: i64, cake_g: i64, kg_per_l: f64, density: f64) -> Value {
    let net = ((seed_g - cleaning_g).max(0)) as f64 / 1000.0;
    let oil_l = oil_ml as f64 / 1000.0;
    let oil_kg = oil_l * density;
    let yield_pct = if net > 0.0 { oil_kg / net * 100.0 } else { 0.0 };
    let norm_pct = density / kg_per_l * 100.0;
    let variance = if norm_pct > 0.0 { (yield_pct - norm_pct) / norm_pct * 100.0 } else { 0.0 };
    let loss = net + jaggery_g as f64 / 1000.0 - oil_kg - cake_g as f64 / 1000.0;
    let grade = if net == 0.0 || variance >= -3.0 {
        "good"
    } else if variance >= -6.0 {
        "low"
    } else {
        "poor"
    };
    json!({
        "netSeedKg": net, "oilKg": oil_kg, "yieldPct": yield_pct, "normPct": norm_pct, "variancePct": variance,
        "expectedOilL": net / kg_per_l, "litresPer100Kg": if net > 0.0 { oil_l / net * 100.0 } else { 0.0 },
        "lossKg": loss, "lossPct": if net > 0.0 { loss / net * 100.0 } else { 0.0 }, "grade": grade,
        // The seed balance: seed in = oil (litres x kg per litre) + oil cake + cleaning waste + unexplained loss.
        "seedInKg": seed_g as f64 / 1000.0, "cleaningKg": cleaning_g as f64 / 1000.0, "cakeKg": cake_g as f64 / 1000.0,
        "cakePct": if net > 0.0 { cake_g as f64 / 1000.0 / net * 100.0 } else { 0.0 },
        "kgSeedPerL": if oil_l > 0.0 { net / oil_l } else { 0.0 },
    })
}

pub(crate) fn find_item_by_name(conn: &Connection, name: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT id FROM items WHERE name=?1 AND kind='item' ORDER BY rowid LIMIT 1", [name], |r| r.get(0)).optional()?)
}

fn oil_item_id(conn: &Connection, oil_name: &str) -> Result<String> {
    let n = format!("{oil_name} (Loose)");
    find_item_by_name(conn, &n)?.ok_or_else(|| ApiError::Invalid(format!("Create the loose item \"{n}\" first. Pressed oil is stocked there.")))
}

const BATCH_SELECT: &str = "SELECT b.id,b.number,b.at,b.seed,b.seed_g,b.cleaning_loss_g,b.jaggery_g,b.oil_raw_ml,b.cake_g,b.chekku,b.operator,
    b.settle_ready_on,b.norm_kg_per_l,b.norm_density,b.clear_oil_ml,b.sediment_ml,b.barrel_id,br.label,b.moved_on,b.machine,
    b.godown_barrel_id,gb.label,b.seed_cost_per_kg,b.jaggery_cost,b.source,b.edited_at,b.edited_by
    FROM pressing_batches b LEFT JOIN barrels br ON br.id=b.barrel_id LEFT JOIN godown_barrels gb ON gb.id=b.godown_barrel_id";

fn batch_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let seed: String = r.get(3)?;
    let (seed_g, clean, jag, oil, cake): (i64, i64, i64, i64, i64) = (r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?);
    let kg_per_l: f64 = r.get::<_, String>(12)?.parse().unwrap_or(2.5);
    let density: f64 = r.get::<_, String>(13)?.parse().unwrap_or(0.91);
    let ready: String = r.get(11)?;
    let barrel: Option<String> = r.get(16)?;
    let base = seed_base(&seed);
    let godown: Option<String> = r.get(20)?;
    let phase = if godown.is_some() {
        "in-godown"
    } else if barrel.is_some() {
        "in-barrel"
    } else if ready <= iso(Local::now()) {
        "ready"
    } else {
        "settling"
    };
    Ok(json!({
        "id": format!("pb{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "date": r.get::<_, String>(2)?, "seed": seed,
        "seedKg": seed_g, "cleaningLossKg": clean, "jaggeryKg": jag, "oilRawL": oil, "cakeKg": cake,
        "seedLabel": base.map(|b| b.label).unwrap_or(""), "oilName": base.map(|b| b.oil_name).unwrap_or(""),
        "chekku": r.get::<_, String>(9)?, "operator": r.get::<_, String>(10)?, "phase": phase, "settleReadyOn": ready,
        "clearOilL": r.get::<_, Option<i64>>(14)?, "sedimentL": r.get::<_, Option<i64>>(15)?, "barrelId": barrel,
        "barrelLabel": r.get::<_, Option<String>>(17)?, "movedOn": r.get::<_, Option<String>>(18)?, "machine": r.get::<_, String>(19)?,
        "godownBarrelId": godown, "godownBarrelLabel": r.get::<_, Option<String>>(21)?, "normKgPerL": kg_per_l, "oilKgPerL": density,
        "seedCostPerKg": r.get::<_, Option<i64>>(22)?, "jaggeryCost": r.get::<_, Option<i64>>(23)?, "source": r.get::<_, String>(24)?,
        "editedAt": r.get::<_, Option<String>>(25)?, "editedBy": r.get::<_, Option<String>>(26)?,
        "metrics": pressing_metrics(seed_g, clean, jag, oil, cake, kg_per_l, density),
    }))
}

pub fn list_pressing_batches(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{BATCH_SELECT} WHERE b.status='active' ORDER BY b.at DESC, b.id DESC LIMIT 1000"))?;
    let v = st.query_map([], batch_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn get_batch(conn: &Connection, id: i64) -> Result<Value> {
    Ok(conn.query_row(&format!("{BATCH_SELECT} WHERE b.id=?1"), [id], batch_json)?)
}

/// CoreApi `listProduction` (plain kg / litres, as the dashboard shows them).
pub fn list_production(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,at,seed,seed_g,oil_raw_ml,cake_g,barrel_id FROM pressing_batches WHERE status='active' ORDER BY at DESC, id DESC LIMIT 200")?;
    let v = st
        .query_map([], |r| {
            let seed: String = r.get(2)?;
            let b = seed_base(&seed);
            Ok(json!({
                "id": format!("b{}", r.get::<_, i64>(0)?), "date": r.get::<_, String>(1)?, "seed": b.map(|x| x.label).unwrap_or("").split(' ').next().unwrap_or(""),
                "seedKg": r.get::<_, i64>(3)? as f64 / 1000.0, "oil": b.map(|x| x.oil_name).unwrap_or(""),
                "oilL": r.get::<_, i64>(4)? as f64 / 1000.0, "cakeKg": r.get::<_, i64>(5)? as f64 / 1000.0,
                "status": if r.get::<_, Option<String>>(6)?.is_some() { "done" } else { "running" },
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressingDraft {
    pub seed: String,
    pub seed_kg: i64,
    #[serde(default)]
    pub cleaning_loss_kg: i64,
    #[serde(default)]
    pub jaggery_kg: i64,
    pub oil_raw_l: i64,
    #[serde(default)]
    pub cake_kg: i64,
    #[serde(default)]
    pub chekku: String,
    #[serde(default)]
    pub operator: String,
    /// W = wood-pressed (chekku), R = rotary. Older callers send nothing and get W.
    #[serde(default = "default_machine")]
    pub machine: String,
    /// The godown barrel the oil goes into (required by the Production screen; older callers send nothing and the oil is only recorded on the batch).
    #[serde(default)]
    pub godown_barrel_id: Option<String>,
    /// The date the batch was pressed (yyyy-mm-dd, default today, past dates allowed, no future) and an optional time (HH:MM).
    #[serde(default)]
    pub day: Option<String>,
    #[serde(default)]
    pub time: Option<String>,
}

fn default_machine() -> String {
    "W".into()
}

fn fmt_kg(milli: i64) -> String {
    format!("{}", milli / 1000)
}

/// Seed (and jaggery) out of the godown, cake into stock, all as ledger movements. The oil goes into a godown barrel (production stock); it reaches the store only by a transfer.
pub fn create_pressing_batch(conn: &mut Connection, d: &PressingDraft) -> Result<Value> {
    create_pressing_batch_at(conn, d, db::entry_time(d.day.as_deref(), d.time.as_deref())?)
}

pub fn create_pressing_batch_at(conn: &mut Connection, d: &PressingDraft, now: chrono::DateTime<Local>) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let out = create_pressing_in_tx(&tx, d, now)?;
    tx.commit()?;
    Ok(out)
}

/// What a pressing draft was checked against: the seed, machine and the items and godown barrel it touches.
struct Checked {
    base: &'static SeedBase,
    machine: String,
    jaggery_id: Option<String>,
    cake_id: Option<String>,
    godown: Option<String>,
}

/// Every rule a pressing batch must pass (seed in stock, jaggery, barrel that can take the oil). Used when pressing and when correcting.
fn check_draft(tx: &Connection, d: &PressingDraft) -> Result<Checked> {
    let Some(base) = seed_base(&d.seed) else { return invalid("Choose the seed.") };
    if d.seed_kg <= 0 {
        return invalid("Enter the seed weight.");
    }
    if d.oil_raw_l <= 0 {
        return invalid("Enter the oil that came out.");
    }
    if d.cleaning_loss_kg < 0 || d.jaggery_kg < 0 || d.cake_kg < 0 {
        return invalid("Weights cannot be negative.");
    }
    if d.cleaning_loss_kg >= d.seed_kg {
        return invalid("Cleaning loss cannot be more than the seed weight.");
    }
    let machine = d.machine.trim().to_uppercase();
    if machine != "W" && machine != "R" {
        return invalid("Machine must be W (wood-pressed) or R (rotary).");
    }
    let stock: i64 = tx.query_row("SELECT stock FROM items WHERE id=?1", [base.rm], |r| r.get(0))?;
    if d.seed_kg > stock {
        return invalid(format!("Only {} kg {} in the godown.", fmt_kg(stock), base.label));
    }
    let jaggery_id = if d.jaggery_kg > 0 {
        let Some(id) = find_item_by_name(tx, JAGGERY_ITEM)? else { return invalid("Palm jaggery is not in the item list.") };
        let js: i64 = tx.query_row("SELECT stock FROM items WHERE id=?1", [&id], |r| r.get(0))?;
        if d.jaggery_kg > js {
            return invalid("Not enough palm jaggery in stock.");
        }
        Some(id)
    } else {
        None
    };
    let cake_id = if d.cake_kg > 0 { Some(crate::mill::ensure_punnaku_item(tx, base.key, &machine)?) } else { None };
    let godown = match d.godown_barrel_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(id) => Some(crate::godown::check_fill(tx, id, &d.seed, d.oil_raw_l)?),
        None => None,
    };
    Ok(Checked { base, machine, jaggery_id, cake_id, godown })
}

/// The ledger rows of a batch: oil into the godown barrel, seed (and jaggery) out, cake in.
fn post_batch_effects(tx: &Connection, now: chrono::DateTime<Local>, bid: i64, number: &str, c: &Checked, d: &PressingDraft, suffix: &str) -> Result<()> {
    let at = iso(now);
    if let Some(g) = &c.godown {
        tx.execute("UPDATE pressing_batches SET godown_barrel_id=?1 WHERE id=?2", params![g, bid])?;
        crate::godown::fill(tx, now, g, "press", d.oil_raw_l, "pressing", &bid.to_string(), &format!("Oil from {number}{suffix}"))?;
    } else {
        tx.execute("UPDATE pressing_batches SET godown_barrel_id=NULL WHERE id=?1", params![bid])?;
    }
    post_movement(tx, &at, c.base.rm, "production", -d.seed_kg, "pressing", &bid.to_string(), &format!("Pressed in {number}{suffix}"), OFFICE)?;
    if let Some(j) = &c.jaggery_id {
        post_movement(tx, &at, j, "production", -d.jaggery_kg, "pressing", &bid.to_string(), &format!("Jaggery used in {number}{suffix}"), OFFICE)?;
    }
    if let Some(ck) = &c.cake_id {
        post_movement(tx, &at, ck, "production", d.cake_kg, "pressing", &bid.to_string(), &format!("Oil cake from {number}{suffix}"), OFFICE)?;
    }
    Ok(())
}

/// The pressing batch inside the caller's transaction (the caller commits): used by the Production screen and the mill daily sheet.
pub fn create_pressing_in_tx(tx: &Connection, d: &PressingDraft, now: chrono::DateTime<Local>) -> Result<Value> {
    let c = check_draft(tx, d)?;
    let base = c.base;
    let norm = seed_norm(tx, &d.seed);
    // The seed price and jaggery cost of the day, stamped so cost per litre uses the last purchase price.
    let seed_cost: i64 = tx.query_row("SELECT cost FROM items WHERE id=?1", [base.rm], |r| r.get(0))?;
    let jaggery_cost: i64 = match &c.jaggery_id {
        Some(j) => {
            let cost: i64 = tx.query_row("SELECT cost FROM items WHERE id=?1", [j], |r| r.get(0))?;
            (cost * d.jaggery_kg + 500) / 1000
        }
        None => 0,
    };
    let fy = fy_of(now);
    let seq = next_seq(tx, PRESS_SERIES, &fy)?;
    let number = doc_number("PB", &fy, seq);
    let ready = now + Duration::days(norm.settle_days);
    tx.execute(
        "INSERT INTO pressing_batches(number,series,fy,seq,at,day,seed,seed_g,cleaning_loss_g,jaggery_g,oil_raw_ml,cake_g,chekku,operator,settle_ready_on,norm_kg_per_l,norm_density,machine)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
        params![
            number, PRESS_SERIES, fy, seq, iso(now), db::day_of(now), d.seed, d.seed_kg, d.cleaning_loss_kg, d.jaggery_kg, d.oil_raw_l,
            d.cake_kg, d.chekku.trim(), d.operator.trim(), iso(ready), norm.kg_per_l.to_string(), norm.density.to_string(), c.machine
        ],
    )?;
    let bid = tx.last_insert_rowid();
    tx.execute("UPDATE pressing_batches SET seed_cost_per_kg=?1, jaggery_cost=?2 WHERE id=?3", params![seed_cost, jaggery_cost, bid])?;
    post_batch_effects(tx, now, bid, &number, &c, d, "")?;
    audit(tx, now, OFFICE, "create", "pressing_batch", &number, &format!("{} kg {} ({}), {} L oil", d.seed_kg / 1000, base.label, c.machine, d.oil_raw_l / 1000))?;
    get_batch(tx, bid)
}

// ---------- corrections (owner and admin only): reversal + re-post, never an update of a ledger ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressingEdit {
    pub id: String,
    #[serde(flatten)]
    pub draft: PressingDraft,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressingDelete {
    pub id: String,
}

struct SavedBatch {
    number: String,
    at: String,
    day: String,
    seed: String,
    machine: String,
    seed_g: i64,
    clean_g: i64,
    jag_g: i64,
    oil_ml: i64,
    cake_g: i64,
    godown: Option<String>,
    store_barrel: Option<String>,
    status: String,
    jaggery_cost: Option<i64>,
}

fn load_batch(tx: &Connection, id: &str) -> Result<(i64, SavedBatch)> {
    let Some(bid) = parse_id("pb", id) else { return invalid("Batch not found.") };
    let b = tx
        .query_row(
            "SELECT number,at,day,seed,machine,seed_g,cleaning_loss_g,jaggery_g,oil_raw_ml,cake_g,godown_barrel_id,barrel_id,status,jaggery_cost FROM pressing_batches WHERE id=?1",
            [bid],
            |r| {
                Ok(SavedBatch {
                    number: r.get(0)?, at: r.get(1)?, day: r.get(2)?, seed: r.get(3)?, machine: r.get(4)?, seed_g: r.get(5)?, clean_g: r.get(6)?,
                    jag_g: r.get(7)?, oil_ml: r.get(8)?, cake_g: r.get(9)?, godown: r.get(10)?, store_barrel: r.get(11)?, status: r.get(12)?, jaggery_cost: r.get(13)?,
                })
            },
        )
        .optional()?;
    let Some(b) = b else { return invalid("Batch not found.") };
    if b.status != "active" {
        return invalid("This batch was already deleted.");
    }
    Ok((bid, b))
}

/// Post the reversing rows of a batch, dated on its original moment, after checking that the oil can come back out cleanly.
fn reverse_batch(tx: &Connection, bid: i64, b: &SavedBatch) -> Result<()> {
    let what = format!("Batch {}", b.number);
    if b.store_barrel.is_some() {
        return invalid(format!("{what} was moved into a store barrel (the old way, before godown barrels), so it cannot be changed."));
    }
    let Some(base) = seed_base(&b.seed) else { return invalid("Unknown seed on this batch.") };
    if let Some(g) = &b.godown {
        crate::godown::check_reversible(tx, g, b.oil_ml, &what)?;
    }
    let cake_id = if b.cake_g > 0 { Some(crate::mill::ensure_punnaku_item(tx, base.key, &b.machine)?) } else { None };
    if let Some(ck) = &cake_id {
        let have: i64 = tx.query_row("SELECT stock FROM items WHERE id=?1", [ck], |r| r.get(0))?;
        if have < b.cake_g {
            return invalid(format!("{what} cannot be changed: its oil cake ({} kg) has already been sold or used, only {} kg is in stock.", fmt_kg(b.cake_g), fmt_kg(have)));
        }
    }
    let when = crate::db::parse_iso(&b.at).unwrap_or_else(Local::now);
    let at = &b.at;
    let ref_id = bid.to_string();
    let note = format!("Correction of {}", b.number);
    post_movement(tx, at, base.rm, "production", b.seed_g, "pressing", &ref_id, &note, OFFICE)?;
    if b.jag_g > 0 {
        if let Some(j) = find_item_by_name(tx, JAGGERY_ITEM)? {
            post_movement(tx, at, &j, "production", b.jag_g, "pressing", &ref_id, &note, OFFICE)?;
        }
    }
    if let Some(ck) = &cake_id {
        post_movement(tx, at, ck, "production", -b.cake_g, "pressing", &ref_id, &note, OFFICE)?;
    }
    if let Some(g) = &b.godown {
        crate::godown::reverse_fill(tx, when, g, "press", b.oil_ml, "pressing", &ref_id, &note)?;
    }
    Ok(())
}

fn describe_batch(b: &SavedBatch) -> String {
    format!(
        "{} on {} ({}): {} kg {} ({}), cleaning {} kg, jaggery {} kg, oil {} L, cake {} kg, barrel {}",
        b.number, b.at, b.day, b.seed_g / 1000, b.seed, b.machine, b.clean_g / 1000, b.jag_g / 1000, b.oil_ml / 1000, b.cake_g / 1000, b.godown.as_deref().unwrap_or("none")
    )
}

/// Delete a saved batch: the reversing stock and godown rows are posted; the batch is marked deleted and leaves every list.
/// Its number is never used again and everything stays in the audit log.
pub fn delete_pressing_batch(conn: &mut Connection, d: &PressingDelete) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (bid, b) = load_batch(&tx, &d.id)?;
    reverse_batch(&tx, bid, &b)?;
    tx.execute("UPDATE pressing_batches SET status='deleted', deleted_at=?1, deleted_by=?2 WHERE id=?3", params![iso(now), db::actor_or(OFFICE), bid])?;
    audit(&tx, now, OFFICE, "delete", "pressing_batch", &b.number, &format!("deleted: {}", describe_batch(&b)))?;
    tx.commit()?;
    Ok(json!({ "id": d.id, "number": b.number, "deleted": true }))
}

/// Edit a saved batch (date, operator, machine, seed, oil, cake, vellam, godown barrel): reverse the old postings on the original date,
/// then post the corrected ones on the new date, all in one transaction. A refusal leaves everything as it was.
pub fn edit_pressing_batch(conn: &mut Connection, e: &PressingEdit) -> Result<Value> {
    let now = Local::now();
    let d = &e.draft;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (bid, b) = load_batch(&tx, &e.id)?;
    if d.seed != b.seed {
        return invalid("The seed of a saved batch cannot be changed. Delete the batch and enter it again.");
    }
    let at = if d.day.as_deref().map(str::trim).unwrap_or("").is_empty() { crate::db::parse_iso(&b.at).unwrap_or(now) } else { db::entry_time(d.day.as_deref(), d.time.as_deref())? };
    if d.operator.trim().is_empty() {
        return invalid("Choose the operator.");
    }
    reverse_batch(&tx, bid, &b)?;
    let c = check_draft(&tx, d)?;
    let norm = seed_norm(&tx, &d.seed);
    let jaggery_cost: i64 = match (&c.jaggery_id, b.jaggery_cost) {
        (Some(_), Some(old)) if b.jag_g > 0 => (old * d.jaggery_kg + b.jag_g / 2) / b.jag_g,
        (Some(j), _) => {
            let cost: i64 = tx.query_row("SELECT cost FROM items WHERE id=?1", [j], |r| r.get(0))?;
            (cost * d.jaggery_kg + 500) / 1000
        }
        (None, _) => 0,
    };
    tx.execute(
        "UPDATE pressing_batches SET at=?1, day=?2, seed_g=?3, cleaning_loss_g=?4, jaggery_g=?5, oil_raw_ml=?6, cake_g=?7, chekku=?8, operator=?9,
         settle_ready_on=?10, machine=?11, jaggery_cost=?12, edited_at=?13, edited_by=?14 WHERE id=?15",
        params![
            iso(at), db::day_of(at), d.seed_kg, d.cleaning_loss_kg, d.jaggery_kg, d.oil_raw_l, d.cake_kg, d.chekku.trim(), d.operator.trim(),
            iso(at + Duration::days(norm.settle_days)), c.machine, jaggery_cost, iso(now), db::actor_or(OFFICE), bid
        ],
    )?;
    post_batch_effects(&tx, at, bid, &b.number, &c, d, " (corrected)")?;
    audit(
        &tx, now, OFFICE, "edit", "pressing_batch", &b.number,
        &format!(
            "was {}; now {}: {} kg, cleaning {} kg, jaggery {} kg, oil {} L, cake {} kg, barrel {}, operator {}",
            describe_batch(&b), iso(at), d.seed_kg / 1000, d.cleaning_loss_kg / 1000, d.jaggery_kg / 1000, d.oil_raw_l / 1000, d.cake_kg / 1000,
            c.godown.as_deref().unwrap_or("none"), d.operator.trim()
        ),
    )?;
    let out = get_batch(&tx, bid)?;
    tx.commit()?;
    Ok(out)
}

/// The pressing grid: every complete row becomes one batch, all in ONE transaction (all rows or none).
/// `legacy_row_ids` (same length as `rows`) pulls rows of an old manual mill-sheet draft into real batches and marks them imported.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressingBatchesInput {
    pub rows: Vec<PressingDraft>,
    /// The day the batches belong to (default today). A back-dated day is stamped 20:00.
    #[serde(default)]
    pub day: Option<String>,
    #[serde(default)]
    pub legacy_row_ids: Vec<i64>,
}

pub fn create_pressing_batches(conn: &mut Connection, i: &PressingBatchesInput) -> Result<Value> {
    if i.rows.is_empty() {
        return invalid("Enter at least one pressing row.");
    }
    if i.rows.len() > 60 {
        return invalid("Too many rows at once. Save in smaller groups.");
    }
    if !i.legacy_row_ids.is_empty() && i.legacy_row_ids.len() != i.rows.len() {
        return invalid("Every row must come from an old sheet row, or none.");
    }
    let now = match i.day.as_deref().filter(|d| !d.is_empty()) {
        Some(d) => {
            if d > db::day_of(Local::now()).as_str() {
                return invalid("The day cannot be in the future.");
            }
            crate::mill::posting_time(d)
        }
        None => Local::now(),
    };
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut out = Vec::new();
    for (n, d) in i.rows.iter().enumerate() {
        let row = n + 1;
        if d.operator.trim().is_empty() {
            return invalid(format!("Row {row}: choose the operator."));
        }
        if let Some(id) = i.legacy_row_ids.get(n) {
            let open: Option<(i64, String)> = tx
                .query_row(
                    "SELECT o.imported,s.status FROM mill_op_rows o JOIN mill_sheets s ON s.day=o.day WHERE o.id=?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            match open {
                None => return invalid(format!("Row {row}: the old sheet row was not found.")),
                Some((1, _)) => return invalid(format!("Row {row}: this old sheet row was already moved to Production.")),
                Some((_, st)) if st != "draft" => return invalid(format!("Row {row}: that sheet is closed; its batches already exist.")),
                _ => {}
            }
        }
        let mut b = create_pressing_in_tx(&tx, d, now).map_err(|e| match e {
            ApiError::Invalid(m) => ApiError::Invalid(format!("Row {row}: {m}")),
            other => other,
        })?;
        if let Some(id) = i.legacy_row_ids.get(n) {
            let bid = parse_id("pb", b["id"].as_str().unwrap_or("")).unwrap_or(0);
            tx.execute("UPDATE mill_op_rows SET imported=1, batch_id=?1 WHERE id=?2", params![bid, id])?;
            tx.execute("UPDATE pressing_batches SET source='legacy-sheet' WHERE id=?1", [bid])?;
            b = get_batch(&tx, bid)?;
        }
        out.push(b);
    }
    tx.commit()?;
    Ok(Value::Array(out))
}

fn barrel_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, String>(0)?, "label": r.get::<_, String>(1)?, "seed": r.get::<_, Option<String>>(2)?,
        "oilName": r.get::<_, Option<String>>(3)?, "capacityL": r.get::<_, i64>(4)?, "levelL": r.get::<_, i64>(5)?,
        "filledOn": r.get::<_, Option<String>>(6)?,
    }))
}

pub fn list_barrels(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,label,seed,oil_name,capacity_ml,level_ml,filled_on FROM barrels ORDER BY id")?;
    let v = st.query_map([], barrel_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveToBarrel {
    pub batch_id: String,
    pub barrel_id: String,
    pub clear_oil_l: i64,
}

fn fmt_l1(milli: i64) -> String {
    format!("{}.{}", milli / 1000, (milli % 1000) / 100)
}

pub fn move_batch_to_barrel(conn: &mut Connection, d: &MoveToBarrel) -> Result<Value> {
    move_batch_to_barrel_at(conn, d, Local::now())
}

pub fn move_batch_to_barrel_at(conn: &mut Connection, d: &MoveToBarrel, now: chrono::DateTime<Local>) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(bid) = parse_id("pb", &d.batch_id) else { return invalid("Batch or barrel not found.") };
    let batch: Option<(String, String, i64, Option<String>)> = tx
        .query_row("SELECT number,seed,oil_raw_ml,barrel_id FROM pressing_batches WHERE id=?1", [bid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .optional()?;
    let barrel: Option<(String, Option<String>, i64, i64)> = tx
        .query_row("SELECT label,seed,capacity_ml,level_ml FROM barrels WHERE id=?1", [&d.barrel_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .optional()?;
    let (Some((number, seed, raw, in_barrel)), Some((label, bseed, cap, level))) = (batch, barrel) else {
        return invalid("Batch or barrel not found.");
    };
    if in_barrel.is_some() {
        return invalid("This batch is already in a barrel.");
    }
    if d.clear_oil_l <= 0 || d.clear_oil_l > raw {
        return invalid("Clear oil must be more than zero and not more than the raw oil.");
    }
    let base = seed_base(&seed).ok_or_else(|| db::internal("Unknown seed"))?;
    if let Some(bs) = &bseed {
        if bs != &seed && level > 0 {
            let on = tx.query_row("SELECT oil_name FROM barrels WHERE id=?1", [&d.barrel_id], |r| r.get::<_, Option<String>>(0))?.unwrap_or_default();
            return invalid(format!("{label} holds {on}. Keep one oil per barrel."));
        }
    }
    if level + d.clear_oil_l > cap {
        return invalid(format!("{label} has room for only {} L.", fmt_l1(cap - level)));
    }
    let oil_id = oil_item_id(&tx, base.oil_name)?;
    tx.execute(
        "UPDATE barrels SET seed=?1, oil_name=?2, level_ml=level_ml+?3, filled_on=COALESCE(filled_on,?4) WHERE id=?5",
        params![seed, base.oil_name, d.clear_oil_l, iso(now), d.barrel_id],
    )?;
    tx.execute(
        "UPDATE pressing_batches SET barrel_id=?1, clear_oil_ml=?2, sediment_ml=?3, moved_on=?4 WHERE id=?5",
        params![d.barrel_id, d.clear_oil_l, raw - d.clear_oil_l, iso(now), bid],
    )?;
    post_movement(&tx, &iso(now), &oil_id, "production", d.clear_oil_l, "pressing", &bid.to_string(), &format!("{number} into {label}"), OFFICE)?;
    audit(&tx, now, OFFICE, "move_to_barrel", "pressing_batch", &number, &format!("{} ml into {}", d.clear_oil_l, d.barrel_id))?;
    let out = get_batch(&tx, bid)?;
    tx.commit()?;
    Ok(out)
}

fn parse_ml(label: &str) -> i64 {
    let t = label.trim().to_lowercase();
    let (num, mult) = if let Some(n) = t.strip_suffix("ml") {
        (n, 1.0)
    } else if let Some(n) = t.strip_suffix('l') {
        (n, 1000.0)
    } else {
        return 0;
    };
    num.trim().parse::<f64>().map(|v| (v * mult).round() as i64).unwrap_or(0)
}

fn targets_for(conn: &Connection, oil_name: &str) -> Result<Vec<Value>> {
    let Some(loose) = find_item_by_name(conn, &format!("{oil_name} (Loose)"))? else { return Ok(vec![]) };
    let mut st = conn.prepare("SELECT id,name,pack_size,unit,stock FROM items WHERE parent_id=?1 AND loose=0 AND active=1 AND kind='item'")?;
    let mut v: Vec<(i64, Value)> = st
        .query_map([&loose], |r| {
            let label: String = r.get::<_, Option<String>>(2)?.unwrap_or_default();
            let ml = parse_ml(&label);
            Ok((ml, json!({ "itemId": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "label": label, "sizeMl": ml, "unit": r.get::<_, String>(3)?, "stock": r.get::<_, i64>(4)? })))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    v.retain(|x| x.0 > 0);
    v.sort_by_key(|x| x.0);
    Ok(v.into_iter().map(|x| x.1).collect())
}

pub fn list_pack_targets(conn: &Connection, barrel_id: &str) -> Result<Vec<Value>> {
    let oil: Option<Option<String>> = conn.query_row("SELECT oil_name FROM barrels WHERE id=?1", [barrel_id], |r| r.get(0)).optional()?;
    match oil.flatten() {
        Some(o) => targets_for(conn, &o),
        None => Ok(vec![]),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackLineDraft {
    pub item_id: String,
    pub count: i64,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackRunDraft {
    pub barrel_id: String,
    pub lines: Vec<PackLineDraft>,
    pub used_l: i64,
    #[serde(default)]
    pub packer: String,
    #[serde(default)]
    pub day: Option<String>,
    #[serde(default)]
    pub time: Option<String>,
}

fn pack_run_json(conn: &Connection, id: i64) -> Result<Value> {
    let v = conn.query_row(
        "SELECT p.number,p.at,p.barrel_id,b.label,p.oil_name,p.expected_ml,p.used_ml,p.wastage_ml,p.packer,p.packs
         FROM pack_runs p JOIN barrels b ON b.id=p.barrel_id WHERE p.id=?1",
        [id],
        |r| {
            let expected: i64 = r.get(5)?;
            let wastage: i64 = r.get(7)?;
            Ok(json!({
                "id": format!("pk{id}"), "number": r.get::<_, String>(0)?, "date": r.get::<_, String>(1)?, "barrelId": r.get::<_, String>(2)?,
                "barrelLabel": r.get::<_, String>(3)?, "oilName": r.get::<_, String>(4)?, "expectedL": expected,
                "usedL": r.get::<_, i64>(6)?, "wastageL": wastage,
                "wastagePct": if expected > 0 { wastage as f64 / expected as f64 * 100.0 } else { 0.0 },
                "packer": r.get::<_, String>(8)?, "packs": r.get::<_, i64>(9)?,
            }))
        },
    )?;
    let mut st = conn.prepare("SELECT item_id,name,label,size_ml,count FROM pack_run_lines WHERE run_id=?1 ORDER BY id")?;
    let lines = st
        .query_map([id], |r| Ok(json!({ "itemId": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "label": r.get::<_, String>(2)?, "sizeMl": r.get::<_, i64>(3)?, "count": r.get::<_, i64>(4)? })))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut v = v;
    v["lines"] = json!(lines);
    Ok(v)
}

pub fn list_pack_runs(conn: &Connection) -> Result<Vec<Value>> {
    let ids: Vec<i64> = {
        let mut st = conn.prepare("SELECT id FROM pack_runs ORDER BY at DESC, id DESC LIMIT 500")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    ids.into_iter().map(|id| pack_run_json(conn, id)).collect()
}

/// Oil out of the barrel and the loose item, packed items in. Wastage = oil used minus oil in the packs.
pub fn create_pack_run(conn: &mut Connection, d: &PackRunDraft) -> Result<Value> {
    create_pack_run_at(conn, d, db::entry_time(d.day.as_deref(), d.time.as_deref())?)
}

pub fn create_pack_run_at(conn: &mut Connection, d: &PackRunDraft, now: chrono::DateTime<Local>) -> Result<Value> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let barrel: Option<(String, Option<String>, i64)> = tx
        .query_row("SELECT label,oil_name,level_ml FROM barrels WHERE id=?1", [&d.barrel_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let Some((label, Some(oil_name), level)) = barrel else { return invalid("Choose a barrel that has oil.") };
    let targets = targets_for(&tx, &oil_name)?;
    let mut lines: Vec<(String, String, String, i64, i64)> = vec![];
    for l in d.lines.iter().filter(|l| l.count > 0) {
        let Some(t) = targets.iter().find(|t| t["itemId"] == l.item_id.as_str()) else {
            return invalid("That pack size does not belong to this oil.");
        };
        lines.push((l.item_id.clone(), t["name"].as_str().unwrap_or("").into(), t["label"].as_str().unwrap_or("").into(), t["sizeMl"].as_i64().unwrap_or(0), l.count));
    }
    if lines.is_empty() {
        return invalid("Enter how many packs you filled.");
    }
    let expected: i64 = lines.iter().map(|l| l.3 * l.4).sum();
    let packs: i64 = lines.iter().map(|l| l.4).sum();
    if d.used_l < expected {
        return invalid("Oil used cannot be less than the oil in the packs.");
    }
    if d.used_l > level {
        return invalid(format!("{label} has only {} L.", fmt_l1(level)));
    }
    let wastage = d.used_l - expected;
    let loose_id = oil_item_id(&tx, &oil_name)?;
    let fy = fy_of(now);
    let seq = next_seq(&tx, PACK_SERIES, &fy)?;
    let number = doc_number("PK", &fy, seq);
    tx.execute(
        "INSERT INTO pack_runs(number,series,fy,seq,at,day,barrel_id,oil_name,expected_ml,used_ml,wastage_ml,packer,packs) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![number, PACK_SERIES, fy, seq, iso(now), db::day_of(now), d.barrel_id, oil_name, expected, d.used_l, wastage, d.packer.trim(), packs],
    )?;
    let rid = tx.last_insert_rowid();
    tx.execute("UPDATE barrels SET level_ml = level_ml - ?1 WHERE id=?2", params![d.used_l, d.barrel_id])?;
    tx.execute("UPDATE barrels SET seed=NULL, oil_name=NULL, filled_on=NULL WHERE id=?1 AND level_ml=0", [&d.barrel_id])?;
    let at = iso(now);
    post_movement(&tx, &at, &loose_id, "packing", -d.used_l, "pack_run", &rid.to_string(), &format!("{number} from {label}, wastage {} ml", wastage), OFFICE)?;
    for (item_id, name, plabel, ml, count) in &lines {
        tx.execute("INSERT INTO pack_run_lines(run_id,item_id,name,label,size_ml,count) VALUES(?1,?2,?3,?4,?5,?6)", params![rid, item_id, name, plabel, ml, count])?;
        post_movement(&tx, &at, item_id, "packing", count * 1000, "pack_run", &rid.to_string(), &format!("{number}: {count} x {plabel}"), OFFICE)?;
    }
    audit(&tx, now, OFFICE, "create", "pack_run", &number, &format!("{} packs, {} ml used, {} ml wastage", packs, d.used_l, wastage))?;
    let out = pack_run_json(&tx, rid)?;
    tx.commit()?;
    Ok(out)
}

/// The pressing batches of one day (Mill daily sheet).
pub(crate) fn batches_on(conn: &Connection, day: &str) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{BATCH_SELECT} WHERE b.status='active' AND b.day=?1 ORDER BY b.at, b.id"))?;
    let v = st.query_map([day], batch_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}
