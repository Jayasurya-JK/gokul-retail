//! Customer Points module: overview, paged customer list, ledger with running balance, manual and bulk adjustment, optional
//! the read-only "expiring soon" view and the points reports. Expiry itself runs by itself (`lots.rs`). Everything is on top of `points_ledger` (see `loyalty.rs`): rows are only ever added,
//! `customers.loyalty_points` stays equal to the sum of a customer's rows, and amounts are in HUNDREDTHS of a point inside
//! the database and points with two decimals (`from_hundredths`) in every answer.

use crate::db::iso;
use crate::error::{invalid, Result};
use crate::loyalty::{self, from_hundredths};
use chrono::{Datelike, Local, NaiveDate, TimeZone};
use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde::Deserialize;
use serde_json::{json, Value};

/// The opening balance / POSBean import rows are `adjust` rows whose note starts with "Opening"; screens show them as "import".
/// The refusal every manual points change gets.
pub const POINTS_ONLY_THROUGH_BILLS: &str = "Points change only through bills. Customers earn on a sale, use points to pay, and get them back on a cancel or return.";

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
        "expiring" => conds.push(format!("EXISTS (SELECT 1 FROM points_lots x WHERE x.customer_id=c.id AND x.remaining>0 AND x.expires_at IS NOT NULL AND x.expires_at<='{}')", iso(Local::now() + chrono::Duration::days(30)))),
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
    let until = iso(Local::now() + chrono::Duration::days(30));
    let (exp_pts, exp_n): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(p),0), COUNT(*) FROM (SELECT SUM(remaining) AS p FROM points_lots WHERE remaining>0 AND expires_at IS NOT NULL AND expires_at<=?1 GROUP BY customer_id)",
        [&until],
        |x| Ok((x.get(0)?, x.get(1)?)),
    )?;
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
        "expiring30": { "points": from_hundredths(exp_pts), "customers": exp_n },
        "goLiveDate": loyalty::rules_json(conn)["goLiveDate"],
    }))
}

pub fn list_customers(conn: &Connection, q: &PointsQuery) -> Result<Value> {
    let (w, ps) = where_for(q);
    let matched: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM customers c WHERE {w}"), params_from_iter(ps.iter()), |x| x.get(0))?;
    let all: i64 = conn.query_row("SELECT COUNT(*) FROM customers", [], |x| x.get(0))?;
    let col = match q.sort.as_str() {
        // No-name customers (blank, digits only, "none"...) always sort after the named ones.
        "name" => "(CASE WHEN TRIM(c.name)='' OR LOWER(TRIM(c.name)) IN ('none','null','nil','na','n/a','no name','noname','unknown','customer') OR NOT (c.name GLOB '*[A-Za-z]*' OR c.name GLOB '*[^ -~]*') THEN 1 ELSE 0 END) ASC, c.name COLLATE NOCASE",
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
                (SELECT MAX(l.at) FROM points_ledger l WHERE l.customer_id=c.id AND l.kind='redeem') AS last_redeemed,
                (SELECT MIN(x.expires_at) FROM points_lots x WHERE x.customer_id=c.id AND x.remaining>0 AND x.expires_at IS NOT NULL) AS next_expiry
         FROM customers c WHERE {w} ORDER BY {col} {dir}, c.id LIMIT {limit} OFFSET {}",
        q.offset.max(0)
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st
        .query_map(params_from_iter(ps.iter()), |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "phone": r.get::<_, String>(2)?, "area": r.get::<_, String>(3)?,
                       "points": from_hundredths(r.get::<_, i64>(4)?), "lastEarned": r.get::<_, Option<String>>(5)?, "lastRedeemed": r.get::<_, Option<String>>(6)?,
                       "expiresOn": r.get::<_, Option<String>>(7)?.and_then(|e| crate::db::parse_iso(&e)).map(|d| d.format("%Y-%m-%d").to_string()) }))
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



#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustInput {
    pub customer_id: String,
    /// Points to add (positive) or remove (negative), two decimals.
    pub points: f64,
    pub reason: String,
}

/// Refused for every caller. Points change only through bills: earned on a sale, used to pay, given back on a cancel or
/// return. The function stays so an old caller gets this clear answer instead of a missing command.
pub fn adjust(_conn: &mut Connection, _i: &AdjustInput) -> Result<Value> {
    invalid(POINTS_ONLY_THROUGH_BILLS)
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

/// Refused for every caller, the same as `adjust`.
pub fn bulk_adjust(_conn: &mut Connection, _i: &BulkInput) -> Result<Value> {
    invalid(POINTS_ONLY_THROUGH_BILLS)
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
