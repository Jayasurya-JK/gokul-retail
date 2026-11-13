//! Reports and lists that live inside Gokul POS: Sales Report, Paymode Report, Staff report, Stock, staff list.
//!
//! Cost and profit are computed here but the dispatcher removes them from every answer given to a cashier
//! (`authz::strip_cost`), so they never leave the backend for a user who may not see them.

use crate::db::{audit, day_of};
use crate::error::{invalid, Result};
use crate::money::round_div;
use chrono::Local;
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportQuery {
    /// yyyy-mm-dd, inclusive; both default to today
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub staff: Option<String>,
    /// bill number, customer or item text (reports) / item text (stock)
    #[serde(default)]
    pub query: Option<String>,
}

fn range(q: &ReportQuery) -> (String, String) {
    let today = day_of(Local::now());
    let from = q.from.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| today.clone());
    let to = q.to.clone().filter(|s| !s.is_empty()).unwrap_or(from.clone());
    (from, to)
}

// ---------- staff ----------

pub fn list_staff(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare("SELECT id,name FROM staff WHERE active=1 ORDER BY name COLLATE NOCASE")?;
    let v = st
        .query_map([], |r| Ok(json!({ "id": r.get::<_, i64>(0)?.to_string(), "name": r.get::<_, String>(1)? })))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn add_staff(conn: &Connection, name: &str) -> Result<Vec<Value>> {
    let name = name.trim();
    if name.is_empty() {
        return invalid("Enter the staff name");
    }
    if name.len() > 60 {
        return invalid("That name is too long");
    }
    conn.execute("INSERT INTO staff(name,active) VALUES(?1,1) ON CONFLICT(name) DO UPDATE SET active=1", [name])?;
    audit(conn, Local::now(), "POS", "create", "staff", name, "")?;
    list_staff(conn)
}

// ---------- sales report ----------

/// One row per bill with its lines. `profit` (bill) is taxable value minus the cost of the goods; `profit` (line) is the
/// line's ex-GST value after its own discount minus its cost. Cost is the item cost at the time of sale (old lines: current cost).
pub fn sales_report(conn: &Connection, q: &ReportQuery) -> Result<Value> {
    let (from, to) = range(q);
    let mut conds = String::from("b.day >= ?1 AND b.day <= ?2 AND b.status != 'cancelled'");
    let mut args: Vec<rusqlite::types::Value> = vec![from.clone().into(), to.clone().into()];
    if let Some(s) = q.staff.as_ref().filter(|s| !s.is_empty()) {
        conds.push_str(&format!(" AND b.staff = ?{}", args.len() + 1));
        args.push(s.clone().into());
    }
    if let Some(t) = q.query.as_ref().filter(|t| !t.trim().is_empty()) {
        let pat = format!("%{}%", crate::bills::like_escape(t.trim()));
        let n = args.len() + 1;
        conds.push_str(&format!(" AND (b.number LIKE ?{n} ESCAPE '\\' OR b.customer_name LIKE ?{n} ESCAPE '\\')"));
        args.push(pat.into());
    }
    let mut st = conn.prepare(&format!(
        "SELECT b.id,b.number,b.at,b.customer_name,b.staff,b.cashier,b.status,b.qty_count,b.grand,b.taxable,b.gst,b.discount,b.cash_disc,
                b.delivery_charge,b.remarks,b.item_count,b.wholesale,
                (SELECT COALESCE(SUM((COALESCE(l.cost,i.cost) * l.qty + 500) / 1000),0) FROM bill_lines l JOIN items i ON i.id=l.item_id WHERE l.bill_id=b.id)
         FROM bills b WHERE {conds} ORDER BY b.id DESC LIMIT 5000"
    ))?;
    let mut lines_st = conn.prepare(
        "SELECT l.name,l.code,l.unit,l.qty,l.rate,l.discount,l.amount,l.gst_rate,(COALESCE(l.cost,i.cost) * l.qty + 500) / 1000
         FROM bill_lines l JOIN items i ON i.id=l.item_id WHERE l.bill_id=?1 ORDER BY l.line_no",
    )?;
    let mut rows: Vec<Value> = vec![];
    let (mut t_qty, mut t_total, mut t_net, mut t_profit, mut t_gst, mut t_disc) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    let mut rs = st.query(rusqlite::params_from_iter(args))?;
    while let Some(r) = rs.next()? {
        let id: i64 = r.get(0)?;
        let (qty, grand, taxable, gst, disc): (i64, i64, i64, i64, i64) = (r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?);
        let cost_total: i64 = r.get(17)?;
        // No salesman was picked (F7) on the bill: the person at the counter who made it is the staff shown.
        let staff: String = r.get(4)?;
        let cashier: String = r.get(5)?;
        let staff = if staff.trim().is_empty() { cashier.clone() } else { staff };
        let profit = taxable - cost_total;
        let lines = lines_st
            .query_map([id], |l| {
                let (amount, gst_rate, cost): (i64, i64, i64) = (l.get(6)?, l.get(7)?, l.get(8)?);
                let ex_gst = round_div(amount as i128 * 100, 100 + gst_rate as i128) as i64;
                Ok(json!({
                    "name": l.get::<_, String>(0)?, "code": l.get::<_, String>(1)?, "unit": l.get::<_, String>(2)?,
                    "qty": l.get::<_, i64>(3)?, "rate": l.get::<_, i64>(4)?, "discount": l.get::<_, i64>(5)?, "amount": amount,
                    "gstRate": gst_rate, "cost": cost, "profit": ex_gst - cost,
                }))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        t_qty += qty;
        t_total += grand;
        t_net += taxable;
        t_gst += gst;
        t_disc += disc;
        t_profit += profit;
        rows.push(json!({
            "id": format!("b{id}"), "number": r.get::<_, String>(1)?, "at": r.get::<_, String>(2)?, "customerName": r.get::<_, String>(3)?,
            "staff": staff, "cashier": cashier, "status": r.get::<_, String>(6)?,
            "qty": qty, "total": grand, "net": taxable, "gst": gst, "discount": disc, "cashDisc": r.get::<_, i64>(12)?,
            "deliveryCharge": r.get::<_, i64>(13)?, "remarks": r.get::<_, String>(14)?, "items": r.get::<_, i64>(15)?,
            "wholesale": r.get::<_, i64>(16)? != 0, "profit": profit, "lines": lines,
        }));
    }
    Ok(json!({
        "from": from, "to": to, "rows": rows,
        "totals": { "bills": rows.len(), "qty": t_qty, "total": t_total, "net": t_net, "gst": t_gst, "discount": t_disc, "profit": t_profit },
    }))
}

// ---------- paymode report ----------

pub fn paymode_report(conn: &Connection, q: &ReportQuery) -> Result<Value> {
    let (from, to) = range(q);
    let mut st = conn.prepare(
        "SELECT b.id,b.number,b.at,b.customer_name,b.staff,b.cashier,b.grand,
           COALESCE(SUM(CASE WHEN p.mode='cash' THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='upi' THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='card' THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='credit' THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='credit_note' AND COALESCE(p.ref,'') NOT IN ('PTS','SODEXO') THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='credit_note' AND p.ref='PTS' THEN p.amount END),0),
           COALESCE(SUM(CASE WHEN p.mode='credit_note' AND p.ref='SODEXO' THEN p.amount END),0)
         FROM bills b LEFT JOIN bill_payments p ON p.bill_id=b.id
         WHERE b.day >= ?1 AND b.day <= ?2 AND b.status != 'cancelled' AND (?3 IS NULL OR b.staff = ?3)
         GROUP BY b.id ORDER BY b.id DESC LIMIT 5000",
    )?;
    let staff = q.staff.clone().filter(|s| !s.is_empty());
    let mut rows = vec![];
    let mut tot = [0i64; 8];
    let mut rs = st.query(params![from, to, staff])?;
    while let Some(r) = rs.next()? {
        let amounts: Vec<i64> = (6..14).map(|i| r.get::<_, i64>(i)).collect::<rusqlite::Result<_>>()?;
        for (t, a) in tot.iter_mut().zip(&amounts) {
            *t += a;
        }
        let staff: String = r.get(4)?;
        let cashier: String = r.get(5)?;
        let staff = if staff.trim().is_empty() { cashier } else { staff };
        rows.push(json!({
            "id": format!("b{}", r.get::<_, i64>(0)?), "number": r.get::<_, String>(1)?, "at": r.get::<_, String>(2)?,
            "customerName": r.get::<_, String>(3)?, "staff": staff,
            "total": amounts[0], "cash": amounts[1], "upi": amounts[2], "card": amounts[3], "credit": amounts[4],
            "wallet": amounts[5], "points": amounts[6], "sodexo": amounts[7],
        }));
    }
    Ok(json!({
        "from": from, "to": to, "rows": rows,
        "totals": { "bills": rows.len(), "total": tot[0], "cash": tot[1], "upi": tot[2], "card": tot[3], "credit": tot[4], "wallet": tot[5], "points": tot[6], "sodexo": tot[7] },
    }))
}

// ---------- staff report ----------

pub fn staff_report(conn: &Connection, q: &ReportQuery) -> Result<Value> {
    let (from, to) = range(q);
    let mut st = conn.prepare(
        "SELECT CASE WHEN staff='' THEN '(no staff)' ELSE staff END, COUNT(*), SUM(qty_count), SUM(grand), SUM(taxable) FROM bills
         WHERE day >= ?1 AND day <= ?2 AND status != 'cancelled' GROUP BY staff ORDER BY SUM(grand) DESC",
    )?;
    let rows = st
        .query_map(params![from, to], |r| {
            Ok(json!({ "staff": r.get::<_, String>(0)?, "bills": r.get::<_, i64>(1)?, "qty": r.get::<_, i64>(2)?, "total": r.get::<_, i64>(3)?, "net": r.get::<_, i64>(4)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "from": from, "to": to, "rows": rows }))
}

// ---------- stock ----------

/// Stock list for the POS "Stock" tab. Cost, profit and the totals built from them are owner/manager only.
pub fn stock_report(conn: &Connection, q: &ReportQuery) -> Result<Value> {
    let text = q.query.clone().unwrap_or_default().trim().to_lowercase();
    let mut st = conn.prepare(
        "SELECT i.id,COALESCE(b.barcode,''),i.code,i.name,c.name,i.brand,i.mrp,i.cost,i.price,i.stock,i.unit,i.gst_rate,
                i.reorder_level,
                COALESCE((SELECT s.name FROM suppliers s WHERE s.id=i.supplier_id),(SELECT p.supplier_name FROM purchase_lines pl JOIN purchases p ON p.id=pl.purchase_id WHERE pl.item_id=i.id ORDER BY p.id DESC LIMIT 1),'')
         FROM items i JOIN categories c ON c.id=i.category_id LEFT JOIN barcodes b ON b.item_id=i.id AND b.is_primary=1
         WHERE i.kind='item' AND i.service=0 AND i.active=1 ORDER BY i.name COLLATE NOCASE",
    )?;
    let mut rows = vec![];
    let (mut t_cost, mut t_sales, mut t_profit) = (0i64, 0i64, 0i64);
    let mut rs = st.query([])?;
    while let Some(r) = rs.next()? {
        let (barcode, code, name, cat, brand, supplier): (String, String, String, String, String, String) =
            (r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(13)?);
        if !text.is_empty() {
            let hay = format!("{barcode} {code} {name} {cat} {brand} {supplier}").to_lowercase();
            if !text.split_whitespace().all(|w| hay.contains(w)) {
                continue;
            }
        }
        let (mrp, cost, price, stock, gst): (i64, i64, i64, i64, i64) = (r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?, r.get(11)?);
        // cost is ex-GST, the price is GST inclusive: compare like with like
        let price_ex = round_div(price as i128 * 100, 100 + gst as i128) as i64;
        let profit = price_ex - cost;
        let pct = if cost > 0 { (profit as f64 / cost as f64 * 1000.0).round() / 10.0 } else { 0.0 };
        let (cost_total, sales_total) = (round_div(cost as i128 * stock as i128, 1000) as i64, round_div(price as i128 * stock as i128, 1000) as i64);
        let profit_total = round_div(profit as i128 * stock as i128, 1000) as i64;
        t_cost += cost_total;
        t_sales += sales_total;
        t_profit += profit_total;
        rows.push(json!({
            "id": r.get::<_, String>(0)?, "barcode": barcode, "code": code, "name": name, "category": cat, "brand": brand,
            "mrp": mrp, "cost": cost, "profitPct": pct, "profit": profit, "price": price, "qty": stock, "unit": r.get::<_, String>(10)?,
            "costTotal": cost_total, "profitTotal": profit_total, "salesTotal": sales_total, "supplier": supplier, "reorderLevel": r.get::<_, i64>(12)?,
        }));
    }
    Ok(json!({ "rows": rows, "totals": { "items": rows.len(), "costTotal": t_cost, "profitTotal": t_profit, "salesTotal": t_sales } }))
}
