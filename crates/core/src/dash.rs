//! Dashboard numbers and the stock ledger view.

use crate::db::{day_of, iso};
use crate::error::Result;
use crate::types::*;
use chrono::{Duration, Local};
use rusqlite::Connection;
use std::collections::HashMap;

pub fn dashboard(conn: &Connection) -> Result<DashboardStats> {
    let now = Local::now();
    let today = day_of(now);
    let first = day_of(now - Duration::days(29));
    let mut per_day: HashMap<String, (i64, i64)> = HashMap::new();
    {
        let mut st = conn.prepare_cached(
            "SELECT day, SUM(grand), COUNT(*) FROM bills WHERE day >= ?1 AND status != 'cancelled' GROUP BY day",
        )?;
        let rows = st.query_map([&first], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (d, s, c) = row?;
            per_day.insert(d, (s, c));
        }
    }
    let last30: Vec<DaySummary> = (0..30)
        .rev()
        .map(|back| {
            let d = day_of(now - Duration::days(back));
            let (sales, bills) = per_day.get(&d).copied().unwrap_or((0, 0));
            DaySummary { date: d, sales, bills }
        })
        .collect();
    let t = last30[29].clone();
    let y = last30[28].clone();
    let mut modes: HashMap<String, i64> = HashMap::new();
    {
        let mut st = conn.prepare_cached(
            "SELECT p.mode, SUM(p.amount) FROM bill_payments p JOIN bills b ON b.id=p.bill_id
             WHERE b.day=?1 AND b.status != 'cancelled' GROUP BY p.mode",
        )?;
        let rows = st.query_map([&today], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
        for row in rows {
            let (m, a) = row?;
            modes.insert(m, a);
        }
    }
    let m = |k: &str| modes.get(k).copied().unwrap_or(0);
    let avg = |s: i64, c: i64| if c > 0 { (s + c / 2) / c } else { 0 };
    Ok(DashboardStats {
        today_sales: t.sales,
        yesterday_sales: y.sales,
        today_bills: t.bills,
        yesterday_bills: y.bills,
        avg_bill: avg(t.sales, t.bills),
        yesterday_avg: avg(y.sales, y.bills),
        cash: m("cash"),
        upi: m("upi"),
        card: m("card"),
        credit: m("credit"),
        last30,
    })
}

pub fn top_items(conn: &Connection, days: i64, limit: i64) -> Result<Vec<TopItem>> {
    let cutoff = iso(Local::now() - Duration::days(days));
    let mut st = conn.prepare_cached(
        "SELECT l.item_id, MAX(l.name), SUM(l.qty), MAX(l.unit), SUM(l.amount)
         FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id
         WHERE b.at >= ?1 AND b.status != 'cancelled'
         GROUP BY l.item_id ORDER BY SUM(l.amount) DESC LIMIT ?2",
    )?;
    let v = st
        .query_map(rusqlite::params![cutoff, limit], |r| {
            Ok(TopItem { item_id: r.get(0)?, name: r.get(1)?, qty: r.get(2)?, unit: r.get(3)?, amount: r.get(4)? })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// Newest ledger rows first. Ledger kinds map onto the screen's kinds: opening -> adjustment, cancel -> return.
pub fn list_stock_movements(conn: &Connection, limit: i64) -> Result<Vec<StockMovement>> {
    let mut st = conn.prepare_cached(
        "SELECT m.id, m.at, m.item_id, i.name, m.kind, m.qty, m.note FROM stock_movements m
         JOIN items i ON i.id = m.item_id ORDER BY m.id DESC LIMIT ?1",
    )?;
    let v = st
        .query_map([limit.clamp(1, 5000)], |r| {
            let kind: String = r.get(4)?;
            Ok(StockMovement {
                id: format!("sm{}", r.get::<_, i64>(0)?),
                at: r.get(1)?,
                item_id: r.get(2)?,
                item_name: r.get(3)?,
                kind: match kind.as_str() {
                    "opening" | "packing" => "adjustment".into(),
                    "cancel" => "return".into(),
                    k => k.to_string(),
                },
                qty: r.get(5)?,
                note: r.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// Stock check used by tests and the "verify books" tool: items whose cached stock differs from the ledger.
pub fn ledger_mismatches(conn: &Connection) -> Result<Vec<(String, i64, i64)>> {
    let mut st = conn.prepare(
        "SELECT i.id, i.stock, COALESCE((SELECT SUM(qty) FROM stock_movements m WHERE m.item_id=i.id),0) AS led
         FROM items i WHERE i.stock != led",
    )?;
    let v = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}
