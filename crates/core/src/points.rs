//! Customer Points module: overview, paged customer list, ledger with running balance, manual and bulk adjustment, optional
//! expiry and the points reports. Everything is on top of `points_ledger` (see `loyalty.rs`): rows are only ever added,
//! `customers.loyalty_points` stays equal to the sum of a customer's rows, and amounts are in HUNDREDTHS of a point inside
//! the database and points with two decimals (`from_hundredths`) in every answer.

use crate::catalog::OFFICE;
use crate::db::{actor_or, audit, iso};
use crate::error::{invalid, Result};
use crate::loyalty::{self, fmt_points, from_hundredths};
use chrono::{Datelike, Local, Months, NaiveDate, TimeZone};
use rusqlite::{params_from_iter, types::Value as Sql, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Value};

/// The opening balance / POSBean import rows are `adjust` rows whose note starts with "Opening"; screens show them as "import".
const KIND_EXPR: &str = "CASE WHEN l.kind='adjust' AND l.note LIKE 'Opening%' THEN 'import' ELSE l.kind END";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PointsQuery {
    pub q: String,
    /// all | withPoints | zero
    pub filter: String,
    /// points | name | code | lastEarned | lastRedeemed
    pub sort: String,
    /// asc | desc
    pub dir: String,
    pub offset: i64,
    pub limit: i64,
}

fn local_midnight(d: NaiveDate) -> String {
    let dt = Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().unwrap_or_else(Local::now);
    iso(dt)
}

fn month_start() -> String {
    local_midnight(Local::now().date_naive().with_day(1).unwrap())
}

fn esc(t: &str) -> String {
    t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// WHERE clause (and its parameters) for a search over name, mobile, code and area: every word must match one of them.
fn where_for(q: &PointsQuery) -> (String, Vec<Sql>) {
    let mut conds: Vec<String> = Vec::new();
    let mut ps: Vec<Sql> = Vec::new();
    for tok in q.q.split_whitespace().take(6) {
        let like = format!("%{}%", esc(tok));
        conds.push(
            "(c.name LIKE ? ESCAPE '\\' OR c.id LIKE ? ESCAPE '\\' OR c.area LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR REPLACE(c.phone,' ','') LIKE ? ESCAPE '\\')".into(),
        );
        for _ in 0..5 {
            ps.push(Sql::Text(like.clone()));
        }
    }
    match q.filter.as_str() {
        "withPoints" => conds.push("c.loyalty_points > 0".into()),
        "zero" => conds.push("c.loyalty_points = 0".into()),
        _ => {}
    }
    let w = if conds.is_empty() { "1=1".to_string() } else { conds.join(" AND ") };
    (w, ps)
}

pub fn overview(conn: &Connection) -> Result<Value> {
    let r = loyalty::rules(conn);
    let (out_h, with): (i64, i64) = conn.query_row("SELECT COALESCE(SUM(loyalty_points),0), COUNT(*) FROM customers WHERE loyalty_points > 0", [], |x| Ok((x.get(0)?, x.get(1)?)))?;
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM customers", [], |x| x.get(0))?;
    // a few imported customers hold a negative balance: they are not a liability, but the net total is what the old software showed
    let (neg_h, neg_n): (i64, i64) = conn.query_row("SELECT COALESCE(SUM(loyalty_points),0), COUNT(*) FROM customers WHERE loyalty_points < 0", [], |x| Ok((x.get(0)?, x.get(1)?)))?;
    let since = month_start();
    let month = |kind: &str, neg: bool| -> Result<i64> {
        let extra = if kind == "adjust" { "AND note NOT LIKE 'Opening%'" } else { "" };
        let sum: i64 = conn.query_row(
            &format!("SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE kind=?1 AND at>=?2 {extra}"),
            rusqlite::params![kind, since],
            |x| x.get(0),
        )?;
        Ok(if neg { -sum } else { sum })
    };
    Ok(json!({
        "outstanding": from_hundredths(out_h),
        "netTotal": from_hundredths(out_h + neg_h),
        "negativeBalances": neg_n,
        "negativePoints": from_hundredths(neg_h),
        "liability": out_h * r.point_value / 100,
        "customersWithPoints": with,
        "customers": total,
        "earnedMonth": from_hundredths(month("earn", false)?),
        "redeemedMonth": from_hundredths(month("redeem", true)?),
        "expiredMonth": from_hundredths(month("expire", true)?),
        "adjustedMonth": from_hundredths(month("adjust", false)?),
        "pointValue": r.point_value,
        "expiryMonths": r.expiry_months,
        "enabled": r.enabled,
    }))
}

pub fn list_customers(conn: &Connection, q: &PointsQuery) -> Result<Value> {
    let (w, ps) = where_for(q);
    let matched: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM customers c WHERE {w}"), params_from_iter(ps.iter()), |x| x.get(0))?;
    let all: i64 = conn.query_row("SELECT COUNT(*) FROM customers", [], |x| x.get(0))?;
    let col = match q.sort.as_str() {
        "name" => "c.name COLLATE NOCASE",
        "code" => "c.id",
        "lastEarned" => "last_earned",
        "lastRedeemed" => "last_redeemed",
        _ => "c.loyalty_points",
    };
    let dir = if q.dir.eq_ignore_ascii_case("asc") { "ASC" } else { "DESC" };
    let limit = if q.limit <= 0 { 100 } else { q.limit.min(10_000) };
    let sql = format!(
        "SELECT c.id,c.name,c.phone,c.area,c.loyalty_points,
                (SELECT MAX(l.at) FROM points_ledger l WHERE l.customer_id=c.id AND l.kind='earn') AS last_earned,
                (SELECT MAX(l.at) FROM points_ledger l WHERE l.customer_id=c.id AND l.kind='redeem') AS last_redeemed
         FROM customers c WHERE {w} ORDER BY {col} {dir}, c.id LIMIT {limit} OFFSET {}",
        q.offset.max(0)
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st
        .query_map(params_from_iter(ps.iter()), |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "phone": r.get::<_, String>(2)?, "area": r.get::<_, String>(3)?,
                       "points": from_hundredths(r.get::<_, i64>(4)?), "lastEarned": r.get::<_, Option<String>>(5)?, "lastRedeemed": r.get::<_, Option<String>>(6)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "rows": rows, "matched": matched, "total": all }))
}

/// Every ledger row of one customer, newest first, with the balance after the row.
pub fn ledger(conn: &Connection, customer_id: &str, limit: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!(
        "WITH x AS (SELECT l.id, l.at, {KIND_EXPR} AS kind, l.points, l.note, l.by_name, b.number AS bill,
                           SUM(l.points) OVER (ORDER BY l.id) AS bal
                    FROM points_ledger l LEFT JOIN bills b ON b.id=l.bill_id WHERE l.customer_id=?1)
         SELECT id,at,kind,points,bal,bill,note,by_name FROM x ORDER BY id DESC LIMIT ?2"
    ))?;
    let rows = st
        .query_map(rusqlite::params![customer_id, limit.clamp(1, 5000)], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "at": r.get::<_, String>(1)?, "kind": r.get::<_, String>(2)?, "points": from_hundredths(r.get::<_, i64>(3)?),
                       "balanceAfter": from_hundredths(r.get::<_, i64>(4)?), "bill": r.get::<_, Option<String>>(5)?, "note": r.get::<_, String>(6)?, "by": r.get::<_, String>(7)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn hundredths_of(points: f64) -> Result<i64> {
    if !points.is_finite() {
        return invalid("Enter the points to add or remove.");
    }
    let h = (points * 100.0).round() as i64;
    if h == 0 {
        return invalid("Enter the points to add or remove.");
    }
    if h.abs() > 100_000_000 {
        return invalid("That is too many points in one go (most is 10,00,000).");
    }
    Ok(h)
}

fn clean_reason(reason: &str) -> Result<String> {
    let r = reason.trim();
    if r.chars().count() < 3 {
        return invalid("Write the reason for the change (at least 3 letters).");
    }
    Ok(r.chars().take(200).collect())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustInput {
    pub customer_id: String,
    /// Points to add (positive) or remove (negative), two decimals.
    pub points: f64,
    pub reason: String,
}

/// Manual add/remove for one customer. The caller (authz) has already checked the role and the manager PIN.
pub fn adjust(conn: &mut Connection, i: &AdjustInput) -> Result<Value> {
    let h = hundredths_of(i.points)?;
    let reason = clean_reason(&i.reason)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let name: Option<String> = tx.query_row("SELECT name FROM customers WHERE id=?1", [&i.customer_id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return invalid("Customer not found.") };
    let bal = loyalty::balance(&tx, &i.customer_id)?;
    if h < 0 && -h > bal {
        return invalid(format!("{name} has only {} points, so {} cannot be taken off.", fmt_points(bal), fmt_points(-h)));
    }
    let by = actor_or(OFFICE);
    loyalty::post(&tx, &i.customer_id, "adjust", h, None, &reason, &by)?;
    audit(&tx, Local::now(), &by, "points_adjust", "customer", &i.customer_id, &format!("{}{} points: {reason}", if h > 0 { "+" } else { "" }, fmt_points(h)))?;
    tx.commit()?;
    Ok(json!({ "customerId": i.customer_id, "balance": from_hundredths(bal + h) }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkInput {
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub filter: String,
    pub points: f64,
    pub reason: String,
    /// How many customers the screen showed in its confirmation; the change is refused if the filter now matches a different number.
    #[serde(default)]
    pub expected_count: Option<i64>,
}

/// The same add/remove for every customer a search and filter match, in one transaction. A removal takes at most what each
/// customer holds (nobody goes below zero); customers with nothing to take are skipped.
pub fn bulk_adjust(conn: &mut Connection, i: &BulkInput) -> Result<Value> {
    let h = hundredths_of(i.points)?;
    let reason = clean_reason(&i.reason)?;
    let q = PointsQuery { q: i.q.clone(), filter: i.filter.clone(), ..Default::default() };
    let (w, ps) = where_for(&q);
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let people: Vec<(String, i64)> = {
        let mut st = tx.prepare(&format!("SELECT c.id, c.loyalty_points FROM customers c WHERE {w} ORDER BY c.id"))?;
        let rows = st.query_map(params_from_iter(ps.iter()), |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    if let Some(n) = i.expected_count {
        if n != people.len() as i64 {
            return invalid(format!("The list changed: it now has {} customers, not {n}. Check it and try again.", people.len()));
        }
    }
    if people.is_empty() {
        return invalid("No customers match, so nothing was changed.");
    }
    let by = actor_or(OFFICE);
    let (mut changed, mut total) = (0i64, 0i64);
    for (id, bal) in &people {
        let amt = if h < 0 { -((-h).min((*bal).max(0))) } else { h };
        if amt == 0 {
            continue;
        }
        loyalty::post(&tx, id, "adjust", amt, None, &format!("{reason} (bulk)"), &by)?;
        changed += 1;
        total += amt;
    }
    audit(
        &tx,
        Local::now(),
        &by,
        "points_bulk_adjust",
        "customers",
        "points",
        &format!("{changed} customers, {} points in all ({}{} each asked): {reason}", fmt_points(total), if h > 0 { "+" } else { "" }, fmt_points(h)),
    )?;
    tx.commit()?;
    Ok(json!({ "customers": changed, "matched": people.len(), "points": from_hundredths(total) }))
}

/// Points that lapse under the expiry rule: what a customer holds beyond the points they were given in the last N months
/// (spending uses the oldest points first). `dry_run` only counts. Needs expiry switched on in Settings.
pub fn run_expiry(conn: &mut Connection, dry_run: bool) -> Result<Value> {
    let r = loyalty::rules(conn);
    if r.expiry_months <= 0 {
        return invalid("Points expiry is switched off. Turn it on in Settings, Loyalty.");
    }
    let cutoff = iso(Local::now().checked_sub_months(Months::new(r.expiry_months as u32)).unwrap_or_else(Local::now));
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let due: Vec<(String, i64)> = {
        let mut st = tx.prepare(
            "SELECT c.id, c.loyalty_points - COALESCE((SELECT SUM(l.points) FROM points_ledger l
                                                        WHERE l.customer_id=c.id AND l.points>0 AND l.kind<>'expire' AND l.at>=?1),0) AS old
             FROM customers c WHERE c.loyalty_points > 0 ORDER BY c.id",
        )?;
        let rows = st.query_map([&cutoff], |x| Ok((x.get::<_, String>(0)?, x.get::<_, i64>(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter().filter(|(_, old)| *old > 0).collect()
    };
    let total: i64 = due.iter().map(|(_, p)| *p).sum();
    if !dry_run && !due.is_empty() {
        let by = actor_or(OFFICE);
        for (id, p) in &due {
            loyalty::post(&tx, id, "expire", -p, None, &format!("Expired: not earned in the last {} months", r.expiry_months), &by)?;
        }
        audit(&tx, Local::now(), &by, "points_expire", "customers", "points", &format!("{} customers, {} points, older than {} months", due.len(), fmt_points(total), r.expiry_months))?;
    }
    tx.commit()?;
    Ok(json!({ "customers": due.len(), "points": from_hundredths(total), "months": r.expiry_months, "done": !dry_run }))
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportQuery {
    pub from: String,
    pub to: String,
}

pub fn report(conn: &Connection, q: &ReportQuery) -> Result<Value> {
    let today = Local::now().date_naive();
    let parse = |s: &str, d: NaiveDate| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or(d);
    let from = parse(&q.from, today.with_day(1).unwrap());
    let to = parse(&q.to, today);
    let (a, b) = (local_midnight(from), local_midnight(to.succ_opt().unwrap_or(to)));
    let mut st = conn.prepare(
        "SELECT date(at,'localtime') AS d,
                COALESCE(SUM(CASE WHEN kind='earn' THEN points END),0),
                COALESCE(SUM(CASE WHEN kind='redeem' THEN -points END),0),
                COALESCE(SUM(CASE WHEN kind='expire' THEN -points END),0),
                COALESCE(SUM(CASE WHEN kind='adjust' AND note NOT LIKE 'Opening%' THEN points END),0)
         FROM points_ledger WHERE at>=?1 AND at<?2 GROUP BY d ORDER BY d",
    )?;
    let by_day = st
        .query_map([&a, &b], |r| {
            Ok(json!({ "date": r.get::<_, String>(0)?, "earned": from_hundredths(r.get(1)?), "redeemed": from_hundredths(r.get(2)?),
                       "expired": from_hundredths(r.get(3)?), "adjusted": from_hundredths(r.get(4)?) }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut st = conn.prepare(
        "SELECT c.id,c.name,c.phone,c.loyalty_points,
                COALESCE((SELECT SUM(points) FROM points_ledger l WHERE l.customer_id=c.id AND l.kind='earn' AND l.at>=?1 AND l.at<?2),0),
                COALESCE((SELECT -SUM(points) FROM points_ledger l WHERE l.customer_id=c.id AND l.kind='redeem' AND l.at>=?1 AND l.at<?2),0)
         FROM customers c WHERE c.loyalty_points > 0 ORDER BY c.loyalty_points DESC, c.id LIMIT 25",
    )?;
    let top = st
        .query_map([&a, &b], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "phone": r.get::<_, String>(2)?, "points": from_hundredths(r.get(3)?),
                       "earned": from_hundredths(r.get(4)?), "redeemed": from_hundredths(r.get(5)?) }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let ov = overview(conn)?;
    Ok(json!({ "from": from.to_string(), "to": to.to_string(), "byDay": by_day, "top": top,
               "liability": { "outstanding": ov["outstanding"], "value": ov["liability"], "customers": ov["customersWithPoints"], "pointValue": ov["pointValue"] } }))
}
