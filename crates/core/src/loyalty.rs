//! Loyalty points and store credit.
//!
//! - Earn: 1 point per `rupeesPerPoint` (default Rs 100) of the bill value that was paid with money: the net total after discount,
//!   minus the part paid with credit notes or points. Two decimals (Rs 460 earns 4.60 points); only a fraction of a hundredth is dropped.
//! - Units: the ledger and `customers.loyalty_points` hold HUNDREDTHS of a point (4.60 points = 460). The API shows points as a number
//!   with two decimals (`from_hundredths`). Redeeming stays in whole points.
//! - Redeem: a payment method "points" worth `pointValue` paise each (default Rs 1), at least `minRedeem` points, at most `maxPct`
//!   percent of the bill. Stored as a payment row of mode credit_note with ref `PTS` (bill_payments only knows five modes and is
//!   immutable), and as a negative row in `points_ledger`.
//! - Reverse: a cancel gives back what the bill redeemed and takes back what it earned; a return takes back earned points in
//!   proportion to the value returned. Nothing is deleted: every change is its own ledger row, and `customers.loyalty_points`
//!   is always the sum of the ledger.
//! - Store credit: credit notes refunded as "credit note" can be spent in parts; the balance is `grand - used`.

use crate::db::{audit, get_setting, iso, set_setting};
use crate::error::{invalid, Result};
use crate::types::Payment;
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub const POINTS_REF: &str = "PTS";
/// Sodexo meal coupons are stored like points: a credit_note payment row with this ref (bill_payments cannot gain a mode).
pub const SODEXO_REF: &str = "SODEXO";

/// Hundredths of a point (what the database holds) as points with two decimals (what screens and bills show).
pub fn from_hundredths(h: i64) -> f64 {
    h as f64 / 100.0
}

/// "4.60", "-0.25".
pub fn fmt_points(h: i64) -> String {
    format!("{}{}.{:02}", if h < 0 { "-" } else { "" }, h.abs() / 100, h.abs() % 100)
}

#[derive(Debug, Clone)]
pub struct Rules {
    pub enabled: bool,
    /// Rupees of bill value for one point.
    pub rupees_per_point: i64,
    /// What one point is worth when redeemed, in paise.
    pub point_value: i64,
    pub min_redeem: i64,
    pub max_pct: i64,
    /// Points lapse this many months after they were earned (each earning keeps its own date); 0 = points never expire.
    pub expiry_months: i64,
    /// Category ids whose lines earn no points (e.g. Service charges).
    pub exclude: Vec<String>,
    /// Print "N pts expire dd/mm/yy" on the bill when points lapse within 30 days.
    pub print_expiry: bool,
}

pub fn rules(conn: &Connection) -> Rules {
    // one query for all five keys: this runs on every bill that has a customer
    let mut m = std::collections::HashMap::new();
    if let Ok(mut st) = conn.prepare_cached("SELECT key, value FROM settings WHERE key LIKE 'loyalty.%'") {
        if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            for (k, v) in rows.flatten() {
                m.insert(k, v);
            }
        }
    }
    let n = |k: &str, d: i64| m.get(k).and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(d);
    Rules {
        enabled: n("loyalty.enabled", 1) != 0,
        rupees_per_point: n("loyalty.rupeesPerPoint", 100).max(1),
        point_value: n("loyalty.pointValue", 100).max(1),
        min_redeem: n("loyalty.minRedeem", 100).max(1),
        max_pct: n("loyalty.maxPct", 100).clamp(1, 100),
        expiry_months: n("loyalty.expiryMonths", 12).clamp(0, 120),
        print_expiry: n("loyalty.printExpiry", 1) != 0,
        exclude: m.get("loyalty.excludeCategories").map(|v| v.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()).unwrap_or_default(),
    }
}

pub fn rules_json(conn: &Connection) -> Value {
    let r = rules(conn);
    json!({ "enabled": r.enabled, "rupeesPerPoint": r.rupees_per_point, "pointValue": r.point_value, "minRedeem": r.min_redeem, "maxPct": r.max_pct,
            "expiryMonths": r.expiry_months, "excludeCategories": r.exclude,
            "printExpiry": r.print_expiry, "goLiveDate": crate::lots::go_live_date(conn).to_string() })
}

pub fn save_rules(conn: &Connection, v: &Value) -> Result<()> {
    let n = |k: &str, d: i64, lo: i64, hi: i64| v[k].as_i64().unwrap_or(d).clamp(lo, hi);
    set_setting(conn, "loyalty.enabled", if v["enabled"].as_bool().unwrap_or(true) { "1" } else { "0" })?;
    set_setting(conn, "loyalty.rupeesPerPoint", &n("rupeesPerPoint", 100, 1, 100_000).to_string())?;
    set_setting(conn, "loyalty.pointValue", &n("pointValue", 100, 1, 100_000).to_string())?;
    set_setting(conn, "loyalty.minRedeem", &n("minRedeem", 100, 1, 1_000_000).to_string())?;
    set_setting(conn, "loyalty.maxPct", &n("maxPct", 100, 1, 100).to_string())?;
    // Expiry and excluded categories are optional in the call (an older screen may not send them): keep what is stored then.
    if v["expiryMonths"].is_number() {
        set_setting(conn, "loyalty.expiryMonths", &n("expiryMonths", 0, 0, 120).to_string())?;
    }
    if let Some(b) = v["printExpiry"].as_bool() {
        set_setting(conn, "loyalty.printExpiry", if b { "1" } else { "0" })?;
    }
    if let Some(a) = v["excludeCategories"].as_array() {
        let ids: Vec<&str> = a.iter().filter_map(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty() && !x.contains(',')).collect();
        set_setting(conn, "loyalty.excludeCategories", &ids.join(","))?;
    }
    Ok(())
}

/// The customer's balance in HUNDREDTHS of a point (see `from_hundredths`).
pub fn balance(conn: &Connection, customer_id: &str) -> Result<i64> {
    Ok(conn.query_row("SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE customer_id=?1", [customer_id], |r| r.get(0))?)
}

pub(crate) fn post(conn: &Connection, customer_id: &str, kind: &str, points: i64, bill_id: Option<i64>, note: &str, by: &str) -> Result<()> {
    if points == 0 {
        return Ok(());
    }
    let at = iso(Local::now());
    conn.execute(
        "INSERT INTO points_ledger(customer_id,at,kind,points,bill_id,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![customer_id, at, kind, points, bill_id, note, by],
    )?;
    let ledger_id = conn.last_insert_rowid();
    // the cached balance on the customer always equals the ledger
    conn.execute("UPDATE customers SET loyalty_points=loyalty_points+?2 WHERE id=?1", params![customer_id, points])?;
    // lots: an earning starts a lot, points used come from the oldest lot, a cancel or return reverses the same lots
    crate::lots::on_post(conn, customer_id, kind, points, bill_id, ledger_id, &at, note, false)?;
    Ok(())
}

/// Points a "points" payment of `amount` paise uses; an error when it is not a whole number of points.
pub fn points_for(rules: &Rules, amount: i64) -> Result<i64> {
    if amount % rules.point_value != 0 {
        return invalid("Points are used in whole points.");
    }
    Ok(amount / rules.point_value)
}

/// Checks and books the redemption inside the bill's transaction. Called before the payment rows are written.
pub fn redeem_for_bill(tx: &Connection, customer_id: Option<&str>, payments: &[Payment], grand: i64, bill_id: i64, number: &str, by: &str) -> Result<i64> {
    let used: i64 = payments.iter().filter(|p| p.mode == "points").map(|p| p.amount).sum();
    if used == 0 {
        return Ok(0);
    }
    let r = rules(tx);
    let Some(cid) = customer_id else { return invalid("Points need a customer") };
    if !r.enabled {
        return invalid("Loyalty points are switched off.");
    }
    let pts = points_for(&r, used)?;
    if pts < r.min_redeem {
        return invalid(format!("At least {} points are needed to redeem.", r.min_redeem));
    }
    if used * 100 > grand * r.max_pct {
        return invalid(format!("Points can pay at most {}% of a bill.", r.max_pct));
    }
    if pts * 100 > balance(tx, cid)? {
        return invalid("The customer does not have that many points.");
    }
    post(tx, cid, "redeem", -pts * 100, Some(bill_id), &format!("Paid on {number}"), by)?;
    audit(tx, Local::now(), by, "redeem", "points", number, &format!("{pts} points = {used} paise"))?;
    Ok(pts)
}

/// Books the points a finished bill earns (after payments are known). Returns the points earned in hundredths.
pub fn earn_for_bill(tx: &Connection, customer_id: Option<&str>, payments: &[Payment], grand: i64, bill_id: i64, number: &str, by: &str) -> Result<i64> {
    let Some(cid) = customer_id else { return Ok(0) };
    let non_money: i64 = payments.iter().filter(|p| p.mode == "credit_note" || p.mode == "points").map(|p| p.amount).sum();
    let mut base = (grand - non_money).max(0);
    let r = rules(tx);
    if !r.enabled {
        return Ok(0);
    }
    if !r.exclude.is_empty() {
        // lines of an excluded category (e.g. Service charges) earn nothing: take their share of the bill off the base
        let (excluded, all) = excluded_share(tx, bill_id, &r.exclude)?;
        if excluded > 0 && all > 0 {
            base -= (base as i128 * excluded as i128 / all as i128) as i64;
        }
    }
    // paise / rupees-per-point = hundredths of a point (46000 paise at Rs 100 per point = 460 = 4.60 points)
    let pts = base / r.rupees_per_point;
    post(tx, cid, "earn", pts, Some(bill_id), &format!("Bill {number}"), by)?;
    Ok(pts)
}

/// (amount of the bill's lines in the excluded categories, amount of all lines).
fn excluded_share(tx: &Connection, bill_id: i64, exclude: &[String]) -> Result<(i64, i64)> {
    let mut st = tx.prepare_cached("SELECT i.category_id, l.amount FROM bill_lines l JOIN items i ON i.id=l.item_id WHERE l.bill_id=?1")?;
    let rows = st.query_map([bill_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    let (mut ex, mut all) = (0i64, 0i64);
    for r in rows {
        let (cat, amt) = r?;
        all += amt;
        if exclude.iter().any(|e| *e == cat) {
            ex += amt;
        }
    }
    Ok((ex, all))
}

/// A cancelled bill: take back what it earned and give back what it redeemed.
pub fn reverse_cancel(tx: &Connection, bill_id: i64, number: &str, by: &str) -> Result<()> {
    let Some(cid): Option<String> = tx.query_row("SELECT customer_id FROM bills WHERE id=?1", [bill_id], |r| r.get(0)).optional()?.flatten() else { return Ok(()) };
    let (earned, redeemed, taken_back): (i64, i64, i64) = tx.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind='earn' THEN points END),0), COALESCE(SUM(CASE WHEN kind='redeem' THEN points END),0),
                COALESCE(SUM(CASE WHEN kind='reverse' AND points<0 THEN -points END),0)
         FROM points_ledger WHERE bill_id=?1",
        [bill_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    // what the bill earned minus what returns already took back is what is still to take back; what it redeemed is given back
    post(tx, &cid, "reverse", -(earned - taken_back).max(0), Some(bill_id), &format!("Bill {number} cancelled: earned points taken back"), by)?;
    post(tx, &cid, "reverse", -redeemed, Some(bill_id), &format!("Bill {number} cancelled: redeemed points given back"), by)?;
    Ok(())
}

/// A return: take back earned points in proportion to the value returned (never more than the bill earned).
pub fn reverse_return(tx: &Connection, bill_id: i64, number: &str, returned_grand: i64, bill_grand: i64, by: &str) -> Result<()> {
    if bill_grand <= 0 {
        return Ok(());
    }
    let Some(cid): Option<String> = tx.query_row("SELECT customer_id FROM bills WHERE id=?1", [bill_id], |r| r.get(0)).optional()?.flatten() else { return Ok(()) };
    let (earned, reversed): (i64, i64) = tx.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind='earn' THEN points END),0), COALESCE(SUM(CASE WHEN kind='reverse' AND points<0 THEN -points END),0) FROM points_ledger WHERE bill_id=?1",
        [bill_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let due = (earned * returned_grand / bill_grand).min(earned - reversed).max(0);
    post(tx, &cid, "reverse", -due, Some(bill_id), &format!("Return against {number}"), by)?;
    Ok(())
}

// ---------- store credit (credit notes spent in parts) ----------

/// Credit notes the customer can still spend: refunded as "credit note", not a credit-bill adjustment, with a balance left.
pub fn open_credit_notes(conn: &Connection, customer_id: &str) -> Result<Vec<Value>> {
    let mut st = conn.prepare(
        "SELECT c.number, c.at, c.grand - c.used FROM credit_notes c
         WHERE c.customer_id=?1 AND c.refund_mode='credit_note' AND c.grand - c.used > 0
           AND NOT EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id=c.bill_id AND p.mode='credit')
         ORDER BY c.id",
    )?;
    let rows = st.query_map([customer_id], |r| Ok(json!({ "number": r.get::<_, String>(0)?, "at": r.get::<_, String>(1)?, "balance": r.get::<_, i64>(2)? })))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Spends `amount` of a credit note inside the bill's transaction (exchange credit passes its whole value).
pub fn spend_credit_note(tx: &Connection, number: &str, amount: i64) -> Result<()> {
    let row: Option<(i64, i64)> = tx.query_row("SELECT grand, used FROM credit_notes WHERE number=?1", [number], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((grand, used)) = row else { return Ok(()) };
    if used + amount > grand {
        return invalid(format!("Credit note {number} has only {} left.", crate::printing::money(grand - used)));
    }
    tx.execute("UPDATE credit_notes SET used=used+?1, consumed=CASE WHEN used+?1>=grand THEN 1 ELSE 0 END WHERE number=?2", params![amount, number])?;
    Ok(())
}

pub fn unspend_credit_note(tx: &Connection, number: &str, amount: i64) -> Result<()> {
    tx.execute("UPDATE credit_notes SET used=MAX(0, used-?1), consumed=0 WHERE number=?2", params![amount, number])?;
    Ok(())
}

/// Everything the counter needs about a customer's wallet in one call.
pub fn wallet(conn: &Connection, customer_id: &str) -> Result<Value> {
    let notes = open_credit_notes(conn, customer_id)?;
    let store_credit: i64 = notes.iter().map(|n| n["balance"].as_i64().unwrap_or(0)).sum();
    let r = rules(conn);
    let pts = balance(conn, customer_id)?;
    Ok(json!({ "points": from_hundredths(pts), "pointsValue": pts * r.point_value / 100, "storeCredit": store_credit, "creditNotes": notes, "rules": rules_json(conn),
               "nextExpiry": crate::lots::next_expiry(conn, customer_id)? }))
}

pub fn history(conn: &Connection, customer_id: &str, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare(
        "SELECT l.at,CASE WHEN l.kind='adjust' AND l.note LIKE 'Opening%' THEN 'import' ELSE l.kind END,l.points,l.note,l.by_name,b.number FROM points_ledger l LEFT JOIN bills b ON b.id=l.bill_id WHERE l.customer_id=?1 ORDER BY l.id DESC LIMIT ?2",
    )?;
    let rows = st.query_map(params![customer_id, limit.clamp(1, 500)], |r| {
        Ok(json!({ "at": r.get::<_, String>(0)?, "kind": r.get::<_, String>(1)?, "points": from_hundredths(r.get::<_, i64>(2)?), "note": r.get::<_, String>(3)?,
                   "by": r.get::<_, String>(4)?, "bill": r.get::<_, Option<String>>(5)? }))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
