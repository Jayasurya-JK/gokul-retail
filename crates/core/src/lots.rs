//! Points lots: every earning is a lot with its own expiry date (1 year later by default); points used are taken from the
//! oldest-expiring lot first (FIFO); a cancel or return reverses exactly the lots the bill touched.
//!
//! Invariant: for a customer with a positive balance the lots add up to the balance; a negative balance (a few POSBean
//! customers) has no lot, and the next earnings net it off first. The ledger (`points_ledger`) stays the source of truth for
//! the balance; lots only say WHEN points lapse. Amounts are hundredths of a point, like the ledger.
//!
//! Imported opening balances ("adjust" rows noted "Opening...") become ONE lot per customer dated at the go-live date
//! (setting `loyalty.goLiveDate`), the owner's "start fresh at go-live" decision.

use crate::db::{audit, get_setting, iso, parse_iso, set_setting};
use crate::error::{invalid, Result};
use crate::loyalty::{fmt_points, from_hundredths};
use chrono::{Duration, Local, Months, NaiveDate, TimeZone};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};

pub const DEFAULT_GO_LIVE: &str = "2026-11-07";
const SYSTEM: &str = "System";

fn expiry_months(conn: &Connection) -> i64 {
    get_setting(conn, "loyalty.expiryMonths").ok().flatten().and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(12).clamp(0, 120)
}

pub fn go_live_date(conn: &Connection) -> NaiveDate {
    get_setting(conn, "loyalty.goLiveDate")
        .ok()
        .flatten()
        .and_then(|v| NaiveDate::parse_from_str(v.trim(), "%Y-%m-%d").ok())
        .unwrap_or_else(|| NaiveDate::parse_from_str(DEFAULT_GO_LIVE, "%Y-%m-%d").unwrap())
}

fn local_midnight(d: NaiveDate) -> chrono::DateTime<Local> {
    Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().unwrap_or_else(Local::now)
}

/// `months` after the moment `at`; None when expiry is off (months = 0).
fn expiry_for(at: &str, months: i64) -> Option<String> {
    if months <= 0 {
        return None;
    }
    parse_iso(at)?.checked_add_months(Months::new(months as u32)).map(iso)
}

fn import_dates(conn: &Connection, months: i64) -> (String, Option<String>) {
    let d = go_live_date(conn);
    let earned = iso(local_midnight(d));
    let expires = if months > 0 { d.checked_add_months(Months::new(months as u32)).map(|e| iso(local_midnight(e))) } else { None };
    (earned, expires)
}

fn balance_before(conn: &Connection, cid: &str, ledger_id: i64) -> Result<i64> {
    Ok(conn.query_row("SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE customer_id=?1 AND id<?2", params![cid, ledger_id], |r| r.get(0))?)
}

/// Takes `amount` from the customer's lots, oldest expiry first. `record_bill` notes which lots a bill's redemption used.
/// Returns what could not be taken (no lot left: the balance goes negative or was never in a lot).
fn consume(conn: &Connection, cid: &str, mut amount: i64, record_bill: Option<i64>) -> Result<i64> {
    if amount <= 0 {
        return Ok(0);
    }
    let lots: Vec<(i64, i64)> = {
        let mut st = conn.prepare_cached("SELECT id, remaining FROM points_lots WHERE customer_id=?1 AND remaining>0 ORDER BY COALESCE(expires_at,'9999') ASC, id ASC")?;
        let rows = st.query_map([cid], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    for (id, rem) in lots {
        if amount == 0 {
            break;
        }
        let take = rem.min(amount);
        conn.execute("UPDATE points_lots SET remaining=remaining-?2 WHERE id=?1", params![id, take])?;
        if let Some(b) = record_bill {
            conn.execute("INSERT INTO points_lot_uses(lot_id,bill_id,amount) VALUES(?1,?2,?3)", params![id, b, take])?;
        }
        amount -= take;
    }
    Ok(amount)
}

#[allow(clippy::too_many_arguments)]
fn new_lot(conn: &Connection, cid: &str, source: &str, bill_id: Option<i64>, earned_at: &str, expires_at: Option<&str>, amount: i64, ledger_id: i64) -> Result<()> {
    if amount <= 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO points_lots(customer_id,source,bill_id,earned_at,expires_at,original,remaining,ledger_id) VALUES(?1,?2,?3,?4,?5,?6,?6,?7)",
        params![cid, source, bill_id, earned_at, expires_at, amount, ledger_id],
    )?;
    Ok(())
}

/// A new lot, but a negative balance (debt) is netted off first: only what is left over becomes points.
#[allow(clippy::too_many_arguments)]
fn new_lot_netted(conn: &Connection, cid: &str, source: &str, bill_id: Option<i64>, at: &str, expires: Option<&str>, amount: i64, ledger_id: i64) -> Result<()> {
    let debt = (-balance_before(conn, cid, ledger_id)?).max(0).min(amount);
    new_lot(conn, cid, source, bill_id, at, expires, amount - debt, ledger_id)
}

/// Called for every ledger row right after it is written (`replay` = the one-time fill from the old ledger, where an
/// `expire` row has to take its points from the lots too; live, the expiry job zeroes the lots itself).
#[allow(clippy::too_many_arguments)]
pub(crate) fn on_post(conn: &Connection, cid: &str, kind: &str, points: i64, bill_id: Option<i64>, ledger_id: i64, at: &str, note: &str, replay: bool) -> Result<()> {
    let months = expiry_months(conn);
    let is_import = kind == "adjust" && note.starts_with("Opening");
    if points > 0 {
        let mut amount = points;
        if kind == "reverse" {
            // a cancel gives back the lots the bill used, with their original expiry
            if let Some(b) = bill_id {
                let uses: Vec<(i64, i64, i64)> = {
                    let mut st = conn.prepare_cached(
                        "SELECT u.id,u.lot_id,u.amount FROM points_lot_uses u JOIN points_lots l ON l.id=u.lot_id WHERE u.bill_id=?1 AND u.restored=0 AND l.customer_id=?2 ORDER BY u.id",
                    )?;
                    let rows = st.query_map(params![b, cid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
                    rows
                };
                for (uid, lot, amt) in uses {
                    if amount <= 0 {
                        break;
                    }
                    let back = amt.min(amount);
                    conn.execute("UPDATE points_lots SET remaining=remaining+?2 WHERE id=?1", params![lot, back])?;
                    conn.execute("UPDATE points_lot_uses SET restored=1 WHERE id=?1", [uid])?;
                    amount -= back;
                }
            }
            new_lot_netted(conn, cid, "adjust", bill_id, at, expiry_for(at, months).as_deref(), amount, ledger_id)?;
        } else if is_import {
            let (earned, expires) = import_dates(conn, months);
            let existing: Option<i64> = conn.query_row("SELECT id FROM points_lots WHERE customer_id=?1 AND source='import' ORDER BY id LIMIT 1", [cid], |r| r.get(0)).optional()?;
            let debt = (-balance_before(conn, cid, ledger_id)?).max(0).min(amount);
            amount -= debt;
            match existing {
                Some(id) if amount > 0 => {
                    conn.execute("UPDATE points_lots SET original=original+?2, remaining=remaining+?2 WHERE id=?1", params![id, amount])?;
                }
                _ => new_lot(conn, cid, "import", None, &earned, expires.as_deref(), amount, ledger_id)?,
            }
        } else {
            let src = if kind == "earn" { "earn" } else { "adjust" };
            new_lot_netted(conn, cid, src, bill_id, at, expiry_for(at, months).as_deref(), amount, ledger_id)?;
        }
    } else if points < 0 {
        let amount = -points;
        match kind {
            "redeem" => {
                consume(conn, cid, amount, bill_id)?;
            }
            "reverse" => {
                // taking back what a bill earned: from that bill's own lot first, then the oldest
                let mut left = amount;
                if let Some(b) = bill_id {
                    let lot: Option<(i64, i64)> = conn
                        .query_row("SELECT id,remaining FROM points_lots WHERE bill_id=?1 AND customer_id=?2 AND source='earn' ORDER BY id LIMIT 1", params![b, cid], |r| Ok((r.get(0)?, r.get(1)?)))
                        .optional()?;
                    if let Some((id, rem)) = lot {
                        let take = rem.min(left);
                        conn.execute("UPDATE points_lots SET remaining=remaining-?2 WHERE id=?1", params![id, take])?;
                        left -= take;
                    }
                }
                consume(conn, cid, left, None)?;
            }
            "expire" if !replay => {}
            _ => {
                consume(conn, cid, amount, None)?;
            }
        }
    }
    Ok(())
}

/// One-time fill of the lots from the existing ledger (migration 10): the rows are replayed in order, exactly like live posting.
pub fn backfill(conn: &Connection) -> Result<()> {
    type Row = (i64, String, String, String, i64, Option<i64>, String);
    let rows: Vec<Row> = {
        let mut st = conn.prepare("SELECT id,customer_id,at,kind,points,bill_id,note FROM points_ledger ORDER BY id")?;
        let r = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        r
    };
    for (id, cid, at, kind, points, bill, note) in rows {
        on_post(conn, &cid, &kind, points, bill, id, &at, &note, true)?;
    }
    Ok(())
}

/// The expiry job: every lot past its expiry date lapses. One `expire` ledger row per customer (by System), balances updated,
/// one audit row per run. Safe to run any number of times: lapsed lots have nothing left, so a second run finds nothing.
/// Returns (customers, hundredths of a point).
pub fn expire_due(conn: &mut Connection) -> Result<(i64, i64)> {
    let now_s = iso(Local::now());
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let due: Vec<(String, i64, String, String)> = {
        let mut st = tx.prepare(
            "SELECT customer_id, SUM(remaining), MIN(earned_at), MAX(earned_at) FROM points_lots
             WHERE remaining>0 AND expires_at IS NOT NULL AND expires_at<=?1 GROUP BY customer_id ORDER BY customer_id",
        )?;
        let r = st.query_map([&now_s], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        r
    };
    if due.is_empty() {
        return Ok((0, 0));
    }
    let (mut customers, mut total) = (0i64, 0i64);
    let day = |s: &str| parse_iso(s).map(|d| d.format("%d/%m/%Y").to_string()).unwrap_or_default();
    for (cid, sum, first, last) in &due {
        tx.execute("UPDATE points_lots SET remaining=0 WHERE customer_id=?1 AND remaining>0 AND expires_at IS NOT NULL AND expires_at<=?2", params![cid, now_s])?;
        // never take the balance below zero (a drift between lots and ledger must not create debt)
        let bal: i64 = tx.query_row("SELECT loyalty_points FROM customers WHERE id=?1", [cid], |r| r.get(0))?;
        let amt = (*sum).min(bal.max(0));
        if amt <= 0 {
            continue;
        }
        let note = if day(first) == day(last) { format!("Expired: earned on {}", day(first)) } else { format!("Expired: earned {} to {}", day(first), day(last)) };
        tx.execute("INSERT INTO points_ledger(customer_id,at,kind,points,bill_id,note,by_name) VALUES(?1,?2,'expire',?3,NULL,?4,?5)", params![cid, now_s, -amt, note, SYSTEM])?;
        tx.execute("UPDATE customers SET loyalty_points=loyalty_points-?2 WHERE id=?1", params![cid, amt])?;
        customers += 1;
        total += amt;
    }
    // written directly (not through audit()) so the trail says System even when a signed-in user's Day open triggered the run
    tx.execute(
        "INSERT INTO audit_log(at,by_name,action,entity,entity_id,detail) VALUES(?1,?2,'points_expire','points','lots',?3)",
        params![now_s, SYSTEM, format!("{customers} customers, {} points expired", fmt_points(total))],
    )?;
    tx.commit()?;
    Ok((customers, total))
}

/// Run the expiry job, never failing the caller (app start, Day open): a problem here must not stop the shop opening.
pub fn expire_quietly(conn: &mut Connection) {
    if let Err(e) = expire_due(conn) {
        eprintln!("points expiry skipped: {e}");
    }
}

/// Local calendar day of an expiry instant, yyyy-mm-dd.
fn local_day(iso_s: &str) -> String {
    parse_iso(iso_s).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

/// The customer's next expiring lot: {"points": 12.5, "on": "2027-11-07"} or Null. `points` counts every lot lapsing that day.
pub fn next_expiry(conn: &Connection, cid: &str) -> Result<Value> {
    let mut st = conn.prepare_cached("SELECT expires_at, remaining FROM points_lots WHERE customer_id=?1 AND remaining>0 AND expires_at IS NOT NULL ORDER BY expires_at")?;
    let rows = st.query_map([cid], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let Some((first, _)) = rows.first() else { return Ok(Value::Null) };
    let day = local_day(first);
    let pts: i64 = rows.iter().filter(|(e, _)| local_day(e) == day).map(|(_, p)| *p).sum();
    Ok(json!({ "points": from_hundredths(pts), "on": day }))
}

/// Points of one customer that lapse within `days` days: (hundredths, earliest local day).
pub fn expiring_within(conn: &Connection, cid: &str, days: i64) -> Result<Option<(i64, String)>> {
    let until = iso(Local::now() + Duration::days(days));
    let (sum, first): (i64, Option<String>) = conn.query_row(
        "SELECT COALESCE(SUM(remaining),0), MIN(expires_at) FROM points_lots WHERE customer_id=?1 AND remaining>0 AND expires_at IS NOT NULL AND expires_at<=?2",
        params![cid, until],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(first.filter(|_| sum > 0).map(|f| (sum, local_day(&f))))
}

/// Read-only "Expiring soon": customers with points lapsing in the next `days` days, soonest first.
pub fn expiring_soon(conn: &Connection, days: i64) -> Result<Value> {
    let days = days.clamp(1, 366);
    let until = iso(Local::now() + Duration::days(days));
    let mut st = conn.prepare(
        "SELECT c.id,c.name,c.phone,SUM(l.remaining),MIN(l.expires_at) FROM points_lots l JOIN customers c ON c.id=l.customer_id
         WHERE l.remaining>0 AND l.expires_at IS NOT NULL AND l.expires_at<=?1 GROUP BY c.id ORDER BY MIN(l.expires_at), c.id LIMIT 2000",
    )?;
    let raw = st
        .query_map([&until], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let total: i64 = raw.iter().map(|r| r.3).sum();
    let rows: Vec<Value> = raw.iter().map(|(id, name, phone, p, e)| json!({ "id": id, "name": name, "phone": phone, "points": from_hundredths(*p), "expiresOn": local_day(e) })).collect();
    Ok(json!({ "days": days, "customers": rows.len(), "points": from_hundredths(total), "rows": rows }))
}

/// Changes the go-live date and re-dates ONLY the imported lots (earned at the new date, expiry = new date + expiry months).
/// Lots earned on bills are never touched. Owner only (checked in authz); audited.
pub fn set_go_live_date(conn: &mut Connection, date: &str, by: &str) -> Result<Value> {
    let Ok(d) = NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d") else { return invalid("Enter the go-live date as day, month and year.") };
    if d > Local::now().date_naive() {
        return invalid("The go-live date cannot be in the future.");
    }
    if d < NaiveDate::from_ymd_opt(2020, 1, 1).unwrap() {
        return invalid("That go-live date is too old.");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let old = go_live_date(&tx);
    set_setting(&tx, "loyalty.goLiveDate", &d.to_string())?;
    let months = expiry_months(&tx);
    let (earned, expires) = import_dates(&tx, months);
    let n = tx.execute("UPDATE points_lots SET earned_at=?1, expires_at=?2 WHERE source='import'", params![earned, expires])?;
    audit(&tx, Local::now(), by, "points_go_live", "settings", "loyalty.goLiveDate", &format!("{old} -> {d}; {n} imported lots re-dated"))?;
    tx.commit()?;
    Ok(json!({ "goLiveDate": d.to_string(), "lots": n }))
}
