//! Office reports as SQL over the real tables. Every report returns the generic shape the report screen renders
//! (KPIs, optional chart, columns, rows, totals). Money is paise, quantity is milli-units.

use crate::db::{day_of, iso, parse_iso, round_div};
use crate::error::{invalid, Result};
use chrono::{Duration, Local, NaiveDate, TimeZone};
use rusqlite::types::Value as Sql;
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportParams {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub cashier: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
}

// ---------- tiny builders ----------

fn kpi(label: &str, kind: &str, value: impl Into<Value>, hint: Option<String>, tone: Option<&str>) -> Value {
    let mut v = json!({ "label": label, "kind": kind, "value": value.into() });
    if let Some(h) = hint {
        v["hint"] = json!(h);
    }
    if let Some(t) = tone {
        v["tone"] = json!(t);
    }
    v
}
fn col(key: &str, label: &str, kind: &str, w: Option<&str>) -> Value {
    let mut v = json!({ "key": key, "label": label, "kind": kind });
    if let Some(w) = w {
        v["w"] = json!(w);
    }
    v
}
fn colu(key: &str, label: &str, kind: &str, w: Option<&str>, unit_key: &str) -> Value {
    let mut v = col(key, label, kind, w);
    v["unitKey"] = json!(unit_key);
    v
}
fn pct(a: i64, b: i64) -> f64 {
    if b != 0 {
        a as f64 / b as f64 * 100.0
    } else {
        0.0
    }
}
fn pctf(a: f64, b: f64) -> f64 {
    if b != 0.0 {
        a / b * 100.0
    } else {
        0.0
    }
}
fn sum_i(rows: &[Value], k: &str) -> i64 {
    rows.iter().map(|r| r[k].as_i64().unwrap_or(0)).sum()
}
fn sum_f(rows: &[Value], k: &str) -> f64 {
    rows.iter().map(|r| r[k].as_f64().unwrap_or(0.0)).sum()
}
fn rupees(p: i64) -> String {
    let neg = p < 0;
    let r = p.abs() / 100;
    let s = r.to_string();
    // Indian digit grouping
    let (head, tail) = if s.len() > 3 { (&s[..s.len() - 3], &s[s.len() - 3..]) } else { ("", s.as_str()) };
    let mut g = String::new();
    let hb = head.as_bytes();
    for (i, ch) in hb.iter().enumerate() {
        if i > 0 && (hb.len() - i) % 2 == 0 {
            g.push(',');
        }
        g.push(*ch as char);
    }
    let out = if head.is_empty() { tail.to_string() } else { format!("{g},{tail}") };
    if neg { format!("-{out}") } else { out }
}

const UNIT_LABEL: &[(&str, &str)] = &[("kg", "kg"), ("g", "g"), ("l", "L"), ("ml", "ml"), ("pc", "pc"), ("tin", "tin"), ("btl", "btl"), ("pkt", "pkt")];
const UQC: &[(&str, &str)] = &[("kg", "KGS"), ("g", "GMS"), ("l", "LTR"), ("ml", "MLT"), ("pc", "PCS"), ("tin", "CAN"), ("btl", "BTL"), ("pkt", "PAC")];
fn lookup<'a>(t: &'a [(&str, &'a str)], k: &'a str) -> &'a str {
    t.iter().find(|(a, _)| *a == k).map(|(_, b)| *b).unwrap_or(k)
}
fn mode_label(m: &str) -> &str {
    match m {
        "cash" => "Cash",
        "upi" => "UPI",
        "card" => "Card",
        "credit" => "Credit",
        "credit_note" => "Credit note",
        o => o,
    }
}

fn days_between(from: &str, to: &str) -> Vec<String> {
    let (Ok(mut d), Ok(end)) = (NaiveDate::parse_from_str(from, "%Y-%m-%d"), NaiveDate::parse_from_str(to, "%Y-%m-%d")) else { return vec![] };
    let mut out = vec![];
    while d <= end && out.len() < 400 {
        out.push(d.format("%Y-%m-%d").to_string());
        d += Duration::days(1);
    }
    out
}

/// UTC ISO instants for the start of local day `from` and the start of the day after `to`.
fn range_iso(p: &ReportParams) -> (String, String) {
    let to_local = |s: &str, plus: i64| {
        let d = NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive()) + Duration::days(plus);
        let n = d.and_hms_opt(0, 0, 0).unwrap();
        iso(Local.from_local_datetime(&n).earliest().unwrap_or_else(Local::now))
    };
    (to_local(&p.from, 0), to_local(&p.to, 1))
}

/// WHERE for bills aliased `b` (cancelled bills never count): day range, cashier, payment mode, and (when `lines`) item category.
fn bills_where(p: &ReportParams, lines: bool) -> (String, Vec<Sql>) {
    let mut s = String::from("b.day >= ? AND b.day <= ? AND b.status != 'cancelled'");
    let mut a: Vec<Sql> = vec![p.from.clone().into(), p.to.clone().into()];
    if let Some(c) = p.cashier.as_ref().filter(|c| !c.is_empty()) {
        s += " AND b.cashier = ?";
        a.push(c.clone().into());
    }
    if let Some(m) = p.mode.as_ref().filter(|m| !m.is_empty()) {
        s += " AND EXISTS (SELECT 1 FROM bill_payments x WHERE x.bill_id=b.id AND x.mode=?)";
        a.push(m.clone().into());
    }
    if lines {
        if let Some(c) = p.category_id.as_ref().filter(|c| !c.is_empty() && *c != "all") {
            s += " AND i.category_id = ?";
            a.push(c.clone().into());
        }
    }
    (s, a)
}

/// Taxable part of a GST-inclusive line amount, rounded half-up (same as taxableOf in the TypeScript mock).
const L_TAXABLE: &str = "((20000*l.amount + (10000+CAST(ROUND(l.gst_rate*100) AS INTEGER))) / (2*(10000+CAST(ROUND(l.gst_rate*100) AS INTEGER))))";
/// Cost of the sold quantity, ex-GST.
const L_COST: &str = "(((((20000*i.cost + (10000+CAST(ROUND(l.gst_rate*100) AS INTEGER))) / (2*(10000+CAST(ROUND(l.gst_rate*100) AS INTEGER)))) * l.qty) + 500) / 1000)";

fn run(conn: &Connection, sql: &str, args: Vec<Sql>) -> Result<Vec<Vec<Sql>>> {
    let mut st = conn.prepare_cached(sql)?;
    let n = st.column_count();
    let rows = st
        .query_map(params_from_iter(args), |r| (0..n).map(|i| r.get::<_, Sql>(i)).collect::<rusqlite::Result<Vec<_>>>())?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
fn si(v: &Sql) -> i64 {
    match v {
        Sql::Integer(i) => *i,
        Sql::Real(f) => *f as i64,
        Sql::Text(t) => t.parse().unwrap_or(0),
        _ => 0,
    }
}
fn sf(v: &Sql) -> f64 {
    match v {
        Sql::Integer(i) => *i as f64,
        Sql::Real(f) => *f,
        Sql::Text(t) => t.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}
fn rate_txt(r: f64) -> String {
    crate::gst::rates_text(&[r])
}
fn ss(v: &Sql) -> String {
    match v {
        Sql::Text(t) => t.clone(),
        Sql::Integer(i) => i.to_string(),
        Sql::Real(f) => f.to_string(),
        _ => String::new(),
    }
}

#[path = "reports_money.rs"]
mod money_reports;

pub fn run_report(conn: &Connection, id: &str, p: &ReportParams) -> Result<Value> {
    match id {
        "daily-summary" => daily_summary(conn, p),
        "bill-wise" => bill_wise(conn, p),
        "item-wise" => item_wise(conn, p),
        "category-wise" => category_wise(conn, p),
        "cashier-wise" => cashier_wise(conn, p),
        "payment-mode" => payment_mode(conn, p),
        "hourly-heatmap" => hourly(conn, p),
        "gstr1" => gstr1(conn, p),
        "gstr3b" => gstr3b(conn, p),
        "hsn-wise" => hsn_wise(conn, p),
        "tax-rate" => tax_rate(conn, p),
        "stock-summary" => stock_summary(conn, p),
        "stock-valuation" => stock_valuation(conn, p),
        "stock-movement" => stock_movement(conn, p),
        "low-dead" => low_dead(conn, p),
        "item-margin" => item_margin(conn, p),
        "daily-profit" => daily_profit(conn, p),
        "cash-book" => cash_book(conn, p),
        "day-close" => day_close(conn, p),
        "yield" => yield_report(conn, p),
        "expenses" => money_reports::expenses_report(conn, p),
        "voided-lines" => money_reports::voided_lines_report(conn, p),
        other => invalid(format!("Unknown report '{other}'")),
    }
}

// ---------- sales ----------

fn daily_summary(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let data = run(
        conn,
        &format!("SELECT b.day,COUNT(*),SUM(b.item_count),SUM(b.gross),SUM(b.discount),SUM(b.taxable),SUM(b.gst),SUM(b.round_off),SUM(b.grand) FROM bills b WHERE {w} GROUP BY b.day"),
        a,
    )?;
    let by: HashMap<String, Vec<Sql>> = data.into_iter().map(|r| (ss(&r[0]), r)).collect();
    let days = days_between(&p.from, &p.to);
    let rows: Vec<Value> = days
        .iter()
        .map(|d| {
            let r = by.get(d);
            let g = |i: usize| r.map(|r| si(&r[i])).unwrap_or(0);
            let (bills, net) = (g(1), g(8));
            json!({ "date": d, "bills": bills, "lines": g(2), "gross": g(3), "discount": g(4), "taxable": g(5), "gst": g(6), "roundOff": g(7), "net": net, "avg": if bills > 0 { round_div(net, bills) } else { 0 } })
        })
        .collect();
    let t = |k: &str| sum_i(&rows, k);
    let (net, bills) = (t("net"), t("bills"));
    Ok(json!({
        "id": "daily-summary", "title": "Daily sales summary", "note": format!("{} days, all counters", days.len()),
        "kpis": [
            kpi("Net sales", "money", net, Some(format!("{} days", days.len())), Some("primary")),
            kpi("Bills", "int", bills, Some(format!("{} per day", bills / days.len().max(1) as i64)), None),
            kpi("Average bill", "money", if bills > 0 { round_div(net, bills) } else { 0 }, None, None),
            kpi("GST collected", "money", t("gst"), Some("included in net sales".into()), None),
            kpi("Discount given", "money", t("discount"), None, Some("warning")),
        ],
        "chart": { "kind": "area", "title": "Net sales per day", "money": true, "points": rows.iter().map(|r| json!({ "label": r["date"], "value": r["net"] })).collect::<Vec<_>>() },
        "columns": [col("date","Date","date",Some("1.1fr")), col("bills","Bills","int",Some("0.6fr")), col("lines","Lines","int",Some("0.6fr")), col("gross","Gross","money",None),
            col("discount","Discount","money",None), col("taxable","Taxable","money",None), col("gst","GST","money",None), col("roundOff","Round off","money",Some("1fr")),
            col("net","Net sales","money",Some("1.1fr")), col("avg","Avg bill","money",Some("0.9fr"))],
        "rows": rows.iter().rev().cloned().collect::<Vec<_>>(),
        "totals": { "date": "Total", "bills": bills, "lines": t("lines"), "gross": t("gross"), "discount": t("discount"), "taxable": t("taxable"), "gst": t("gst"), "roundOff": t("roundOff"), "net": net, "avg": if bills > 0 { round_div(net, bills) } else { 0 } },
    }))
}

fn bill_wise(conn: &Connection, p: &ReportParams) -> Result<Value> {
    const CAP: i64 = 5000;
    let (w, a) = bills_where(p, false);
    let agg = run(
        conn,
        &format!("SELECT COUNT(*),COALESCE(SUM(b.grand),0),COALESCE(SUM(b.gst),0),COALESCE(SUM(b.discount),0),COALESCE(SUM(b.item_count),0),COALESCE(MAX(b.grand),0),COALESCE(SUM(b.status='credit'),0) FROM bills b WHERE {w}"),
        a.clone(),
    )?;
    let g = &agg[0];
    let (count, net, gst, discount, lines_total, largest, credit) = (si(&g[0]), si(&g[1]), si(&g[2]), si(&g[3]), si(&g[4]), si(&g[5]), si(&g[6]));
    // `+b.day` keeps SQLite on the primary key (newest first, stops after CAP rows) instead of sorting every bill in the range.
    let w_pk = w.replace("b.day >= ? AND b.day <= ?", "+b.day >= ? AND +b.day <= ?");
    let data = run(
        conn,
        &format!(
            "SELECT b.id,b.number,b.day,b.at,b.cashier,b.customer_name,b.item_count,
               (SELECT COUNT(*) FROM bill_payments x WHERE x.bill_id=b.id),(SELECT x.mode FROM bill_payments x WHERE x.bill_id=b.id ORDER BY x.id LIMIT 1),
               b.gst,b.discount,b.grand,b.status FROM bills b WHERE {w_pk} ORDER BY b.id DESC LIMIT {CAP}"
        ),
        a,
    )?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let time = parse_iso(&ss(&r[3])).map(|d| d.format("%H:%M").to_string()).unwrap_or_default();
            json!({ "id": format!("b{}", si(&r[0])), "number": ss(&r[1]), "date": ss(&r[2]), "time": time, "cashier": ss(&r[4]), "customer": ss(&r[5]), "lines": si(&r[6]),
                    "mode": if si(&r[7]) > 1 { "Split".to_string() } else { mode_label(&ss(&r[8])).to_string() }, "gst": si(&r[9]), "discount": si(&r[10]), "amount": si(&r[11]) })
        })
        .collect();
    let note = if count > CAP { format!("{count} bills; the newest {CAP} are listed, totals cover all {count}") } else { format!("{count} bills, newest first") };
    Ok(json!({
        "id": "bill-wise", "title": "Bill-wise sales", "note": note,
        "kpis": [kpi("Bills", "int", count, None, Some("primary")), kpi("Net sales", "money", net, None, None),
                 kpi("Average bill", "money", if count > 0 { round_div(net, count) } else { 0 }, None, None),
                 kpi("Largest bill", "money", largest, None, None), kpi("Credit bills", "int", credit, None, Some("warning"))],
        "columns": [col("number","Bill no","text",Some("1.2fr")), col("date","Date","date",Some("1fr")), col("time","Time","text",Some("0.6fr")), col("cashier","Cashier","text",Some("1.1fr")),
            col("customer","Customer","text",Some("1.4fr")), col("lines","Lines","int",Some("0.6fr")), col("mode","Paid by","text",Some("0.7fr")), col("discount","Discount","money",Some("0.8fr")),
            col("gst","GST","money",Some("0.8fr")), col("amount","Amount","money",Some("1fr"))],
        "rows": rows,
        "totals": { "number": "Total", "lines": lines_total, "discount": discount, "gst": gst, "amount": net },
    }))
}

fn item_wise(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, true);
    let data = run(
        conn,
        &format!(
            "SELECT l.item_id,MAX(l.name),MAX(l.unit),COALESCE(c.name,'-'),SUM(l.qty),SUM(l.amount),COUNT(DISTINCT l.bill_id)
             FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id LEFT JOIN items i ON i.id=l.item_id LEFT JOIN categories c ON c.id=i.category_id
             WHERE {w} GROUP BY l.item_id ORDER BY SUM(l.amount) DESC"
        ),
        a,
    )?;
    let total: i64 = data.iter().map(|r| si(&r[5])).sum();
    let rows: Vec<Value> = data
        .iter()
        .enumerate()
        .map(|(k, r)| {
            let (qty, amount) = (si(&r[4]), si(&r[5]));
            json!({ "rank": k + 1, "name": ss(&r[1]), "category": ss(&r[3]), "qty": qty, "unit": lookup(UNIT_LABEL, &ss(&r[2])), "bills": si(&r[6]),
                    "avgRate": if qty > 0 { round_div(amount * 1000, qty) } else { 0 }, "amount": amount, "share": pct(amount, total) })
        })
        .collect();
    let top5: i64 = rows.iter().take(5).map(|r| r["amount"].as_i64().unwrap_or(0)).sum();
    let top = rows.first();
    Ok(json!({
        "id": "item-wise", "title": "Item-wise sales", "note": "Sorted by sales value",
        "kpis": [kpi("Sales value", "money", total, None, Some("primary")), kpi("Items sold", "int", rows.len(), Some("distinct items".into()), None),
                 kpi("Top item", "text", top.map(|r| r["name"].clone()).unwrap_or(json!("-")), top.map(|r| format!("{:.1}% of sales", r["share"].as_f64().unwrap_or(0.0))), None),
                 kpi("Top 5 share", "pct", pct(top5, total), Some("of total sales".into()), None)],
        "chart": { "kind": "bars", "title": "Top 8 items by sales", "money": true, "points": rows.iter().take(8).map(|r| json!({ "label": r["name"], "value": r["amount"] })).collect::<Vec<_>>() },
        "columns": [col("rank","#","int",Some("0.3fr")), col("name","Item","text",Some("2.2fr")), col("category","Category","text",Some("1.4fr")), colu("qty","Qty sold","qty",Some("1fr"),"unit"),
            col("bills","Bills","int",Some("0.6fr")), col("avgRate","Avg rate","money",Some("0.9fr")), col("amount","Sales","money",Some("1.1fr")), col("share","Share","pct",Some("0.7fr"))],
        "rows": rows,
        "totals": { "name": "Total", "bills": sum_i(&rows, "bills"), "amount": total, "share": if total > 0 { 100 } else { 0 } },
    }))
}

fn category_wise(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, true);
    let data = run(
        conn,
        &format!(
            "SELECT COALESCE(c.name,'Other'),COUNT(DISTINCT l.item_id),COUNT(DISTINCT l.bill_id),SUM({L_TAXABLE}),SUM(l.amount)
             FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id LEFT JOIN items i ON i.id=l.item_id LEFT JOIN categories c ON c.id=i.category_id
             WHERE {w} GROUP BY i.category_id ORDER BY SUM(l.amount) DESC"
        ),
        a,
    )?;
    let total: i64 = data.iter().map(|r| si(&r[4])).sum();
    let rows: Vec<Value> = data
        .iter()
        .map(|r| json!({ "name": ss(&r[0]), "items": si(&r[1]), "bills": si(&r[2]), "taxable": si(&r[3]), "tax": si(&r[4]) - si(&r[3]), "amount": si(&r[4]), "share": pct(si(&r[4]), total) }))
        .collect();
    Ok(json!({
        "id": "category-wise", "title": "Category-wise sales",
        "kpis": [kpi("Sales value", "money", total, None, Some("primary")), kpi("Categories sold", "int", rows.len(), None, None),
                 kpi("Top category", "text", rows.first().map(|r| r["name"].clone()).unwrap_or(json!("-")), rows.first().map(|r| format!("{:.1}% of sales", r["share"].as_f64().unwrap_or(0.0))), None),
                 kpi("GST in sales", "money", sum_i(&rows, "tax"), None, None)],
        "chart": { "kind": "bars", "title": "Sales by category", "money": true, "points": rows.iter().map(|r| json!({ "label": r["name"], "value": r["amount"] })).collect::<Vec<_>>() },
        "columns": [col("name","Category","text",Some("2fr")), col("items","Items","int",Some("0.7fr")), col("bills","Bills","int",Some("0.7fr")), col("taxable","Taxable","money",None),
            col("tax","GST","money",None), col("amount","Sales","money",None), col("share","Share","pct",Some("0.7fr"))],
        "rows": rows,
        "totals": { "name": "Total", "taxable": sum_i(&rows, "taxable"), "tax": sum_i(&rows, "tax"), "amount": total, "share": if total > 0 { 100 } else { 0 } },
    }))
}

fn cashier_wise(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let base = run(conn, &format!("SELECT b.cashier,COUNT(*),SUM(b.discount),SUM(b.grand) FROM bills b WHERE {w} GROUP BY b.cashier"), a.clone())?;
    let modes = run(conn, &format!("SELECT b.cashier,x.mode,SUM(x.amount) FROM bills b JOIN bill_payments x ON x.bill_id=b.id WHERE {w} GROUP BY b.cashier,x.mode"), a)?;
    let mut mm: HashMap<(String, String), i64> = HashMap::new();
    for r in &modes {
        mm.insert((ss(&r[0]), ss(&r[1])), si(&r[2]));
    }
    let mut rows: Vec<Value> = base
        .iter()
        .map(|r| {
            let name = ss(&r[0]);
            let m = |k: &str| mm.get(&(name.clone(), k.to_string())).copied().unwrap_or(0);
            let (bills, total) = (si(&r[1]), si(&r[3]));
            json!({ "name": name, "bills": bills, "avg": if bills > 0 { round_div(total, bills) } else { 0 }, "discount": si(&r[2]), "cash": m("cash"), "upi": m("upi"), "card": m("card"), "credit": m("credit"), "total": total })
        })
        .collect();
    rows.sort_by(|a, b| b["total"].as_i64().cmp(&a["total"].as_i64()));
    let t = |k: &str| sum_i(&rows, k);
    Ok(json!({
        "id": "cashier-wise", "title": "Cashier-wise sales",
        "kpis": [kpi("Net sales", "money", t("total"), None, Some("primary")), kpi("Cashiers", "int", rows.len(), None, None),
                 kpi("Top cashier", "text", rows.first().map(|r| r["name"].clone()).unwrap_or(json!("-")), rows.first().map(|r| format!("{} bills", r["bills"])), None),
                 kpi("Discounts given", "money", t("discount"), None, Some("warning"))],
        "chart": { "kind": "bars", "title": "Sales by cashier", "money": true, "points": rows.iter().map(|r| json!({ "label": r["name"], "value": r["total"] })).collect::<Vec<_>>() },
        "columns": [col("name","Cashier","text",Some("1.6fr")), col("bills","Bills","int",Some("0.6fr")), col("avg","Avg bill","money",Some("0.9fr")), col("discount","Discount","money",Some("0.9fr")),
            col("cash","Cash","money",None), col("upi","UPI","money",None), col("card","Card","money",Some("0.9fr")), col("credit","Credit","money",Some("0.9fr")), col("total","Total","money",Some("1.1fr"))],
        "rows": rows,
        "totals": { "name": "Total", "bills": t("bills"), "discount": t("discount"), "cash": t("cash"), "upi": t("upi"), "card": t("card"), "credit": t("credit"), "total": t("total") },
    }))
}

fn payment_mode(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let data = run(conn, &format!("SELECT x.mode,COUNT(DISTINCT x.bill_id),COUNT(*),SUM(x.amount) FROM bills b JOIN bill_payments x ON x.bill_id=b.id WHERE {w} GROUP BY x.mode"), a.clone())?;
    let bills: i64 = run(conn, &format!("SELECT COUNT(*) FROM bills b WHERE {w}"), a)?.first().map(|r| si(&r[0])).unwrap_or(0);
    let get = |m: &str| data.iter().find(|r| ss(&r[0]) == m);
    let total: i64 = data.iter().map(|r| si(&r[3])).sum();
    let mut modes = vec!["cash", "upi", "card", "credit"];
    if get("credit_note").is_some() {
        modes.push("credit_note");
    }
    let rows: Vec<Value> = modes
        .iter()
        .map(|m| {
            let r = get(m);
            let (n, amount) = (r.map(|r| si(&r[2])).unwrap_or(0), r.map(|r| si(&r[3])).unwrap_or(0));
            json!({ "name": mode_label(m), "bills": r.map(|r| si(&r[1])).unwrap_or(0), "avg": if n > 0 { round_div(amount, n) } else { 0 }, "amount": amount, "share": pct(amount, total) })
        })
        .collect();
    let amt = |i: usize| rows[i]["amount"].as_i64().unwrap_or(0);
    let digital = amt(1) + amt(2);
    Ok(json!({
        "id": "payment-mode", "title": "Payment-mode summary",
        "kpis": [kpi("Collected", "money", total - amt(3), Some("cash + UPI + card".into()), Some("primary")),
                 kpi("Cash", "money", amt(0), Some(format!("{:.1}% of sales", pct(amt(0), total))), Some("success")),
                 kpi("Digital (UPI + card)", "money", digital, Some(format!("{:.1}% of sales", pct(digital, total))), Some("info")),
                 kpi("On credit", "money", amt(3), Some("to be collected".into()), Some("warning"))],
        "chart": { "kind": "split", "title": "How customers paid", "parts": rows.iter().map(|r| json!({ "label": r["name"], "value": r["amount"] })).collect::<Vec<_>>() },
        "columns": [col("name","Payment mode","text",Some("2fr")), col("bills","Bills","int",Some("0.8fr")), col("avg","Avg payment","money",None), col("amount","Amount","money",None), col("share","Share","pct",Some("0.8fr"))],
        "rows": rows,
        "totals": { "name": "Total", "bills": bills, "amount": total, "share": if total > 0 { 100 } else { 0 } },
    }))
}

fn hourly(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let data = run(
        conn,
        &format!("SELECT CAST(strftime('%w', b.at, 'localtime') AS INTEGER),CAST(strftime('%H', b.at, 'localtime') AS INTEGER),COUNT(*),SUM(b.grand) FROM bills b WHERE {w} GROUP BY 1,2"),
        a,
    )?;
    let hours: Vec<i64> = (8..22).collect();
    let dow_order = [1usize, 2, 3, 4, 5, 6, 0];
    let dow_name = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let mut cells = vec![vec![0i64; hours.len()]; 7];
    let (mut hb, mut hs) = (vec![0i64; hours.len()], vec![0i64; hours.len()]);
    for r in &data {
        let hi = (si(&r[1]) - 8).clamp(0, hours.len() as i64 - 1) as usize;
        let di = dow_order.iter().position(|d| *d as i64 == si(&r[0])).unwrap_or(0);
        cells[di][hi] += si(&r[3]);
        hb[hi] += si(&r[2]);
        hs[hi] += si(&r[3]);
    }
    let total: i64 = hs.iter().sum();
    let bills: i64 = hb.iter().sum();
    let hl = |h: i64| format!("{:02}:00", h);
    let rows: Vec<Value> = hours
        .iter()
        .enumerate()
        .map(|(i, h)| json!({ "hour": format!("{} - {}", hl(*h), hl(*h + 1)), "bills": hb[i], "avg": if hb[i] > 0 { round_div(hs[i], hb[i]) } else { 0 }, "amount": hs[i], "share": pct(hs[i], total) }))
        .collect();
    let peak = (0..hours.len()).max_by_key(|i| hs[*i]).unwrap_or(0);
    let quiet = (0..hours.len()).min_by_key(|i| hs[*i]).unwrap_or(0);
    let dtot: Vec<i64> = cells.iter().map(|r| r.iter().sum()).collect();
    let busiest = (0..7).max_by_key(|i| dtot[*i]).unwrap_or(0);
    Ok(json!({
        "id": "hourly-heatmap", "title": "Hourly sales heatmap", "note": "Sales value by weekday and hour",
        "kpis": [kpi("Peak hour", "text", if total > 0 { hl(hours[peak]) } else { "-".into() }, if total > 0 { Some(format!("{} bills, {:.1}% of sales", hb[peak], pct(hs[peak], total))) } else { None }, Some("primary")),
                 kpi("Busiest weekday", "text", if total > 0 { dow_name[dow_order[busiest]].to_string() } else { "-".into() }, if total > 0 { Some(format!("{:.1}% of sales", pct(dtot[busiest], total))) } else { None }, None),
                 kpi("Bills per hour", "dec1", bills as f64 / hours.len() as f64, Some("average, 08:00 to 22:00".into()), None),
                 kpi("Quietest hour", "text", if total > 0 { hl(hours[quiet]) } else { "-".into() }, Some("good time for stock work".into()), None)],
        "chart": { "kind": "heat", "title": "Sales value, weekday by hour", "cols": hours.iter().map(|h| format!("{:02}", h)).collect::<Vec<_>>(), "rows": dow_order.iter().map(|d| dow_name[*d]).collect::<Vec<_>>(), "cells": cells },
        "columns": [col("hour","Hour","text",Some("1.6fr")), col("bills","Bills","int",Some("0.7fr")), col("avg","Avg bill","money",None), col("amount","Sales","money",None), col("share","Share","pct",Some("0.7fr"))],
        "rows": rows,
        "totals": { "hour": "Total", "bills": bills, "amount": total, "share": if total > 0 { 100 } else { 0 } },
    }))
}

// ---------- GST ----------

/// Credit notes issued in the period, added up from their tax slabs.
#[derive(Debug, Default, Clone, Copy)]
struct CnSums {
    count: i64,
    taxable: i64,
    cgst: i64,
    sgst: i64,
    igst: i64,
    cess: i64,
}

fn cn_sums(conn: &Connection, p: &ReportParams) -> Result<CnSums> {
    let mut st = conn.prepare_cached("SELECT totals_json FROM credit_notes WHERE day >= ?1 AND day <= ?2")?;
    let rows = st.query_map([&p.from, &p.to], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut t = CnSums::default();
    for j in rows {
        t.count += 1;
        let v: Value = serde_json::from_str(&j).unwrap_or(Value::Null);
        for sl in v["slabs"].as_array().cloned().unwrap_or_default() {
            t.taxable += sl["taxable"].as_i64().unwrap_or(0);
            t.cgst += sl["cgst"].as_i64().unwrap_or(0);
            t.sgst += sl["sgst"].as_i64().unwrap_or(0);
            t.igst += sl["igst"].as_i64().unwrap_or(0);
            t.cess += sl["cess"].as_i64().unwrap_or(0);
        }
    }
    Ok(t)
}

fn gstr1(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    // "Registered" = the bill carries a valid GSTIN (the one the customer had when the bill was written)
    let slabs = run(
        conn,
        &format!(
            "SELECT CASE WHEN b.cust_gstin != '' THEN 1 ELSE 0 END,s.rate,COUNT(DISTINCT s.bill_id),SUM(s.taxable),SUM(s.cgst),SUM(s.sgst),SUM(s.igst),SUM(s.cess)
             FROM bills b JOIN bill_slabs s ON s.bill_id=b.id WHERE {w} GROUP BY 1,2 ORDER BY 1,2"
        ),
        a.clone(),
    )?;
    let counts = run(conn, &format!("SELECT CASE WHEN b.cust_gstin != '' THEN 1 ELSE 0 END,COUNT(*) FROM bills b WHERE {w} GROUP BY 1"), a)?;
    let n_of = |flag: i64| counts.iter().find(|r| si(&r[0]) == flag).map(|r| si(&r[1])).unwrap_or(0);
    let (n_b2b, n_b2c) = (n_of(1), n_of(0));
    let mut rows: Vec<Value> = vec![];
    let (mut ti, mut tt, mut tc, mut ts, mut tg, mut tx) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    let mut b2b_taxable = 0;
    let mut b2c_taxable = 0;
    for (flag, ref_, title, n) in [(1, "4A", "B2B - registered customers", n_b2b), (0, "7", "B2C - unregistered customers", n_b2c)] {
        if flag == 0 {
            rows.push(json!({ "_style": "head", "ref": "5", "desc": "B2C Large - inter-state above Rs 2.5 lakh (see the GSTR-1 export)" }));
            rows.push(json!({ "ref": "", "desc": "Listed invoice by invoice in the GSTR-1 export", "_style": "muted" }));
        }
        rows.push(json!({ "_style": "head", "ref": ref_, "desc": title }));
        let mine: Vec<&Vec<Sql>> = slabs.iter().filter(|r| si(&r[0]) == flag).collect();
        if mine.is_empty() {
            rows.push(json!({ "ref": "", "desc": "No supplies in this period", "_style": "muted" }));
        }
        for r in mine {
            let (rate, inv, taxable, cgst, sgst, igst, cess) = (sf(&r[1]), si(&r[2]), si(&r[3]), si(&r[4]), si(&r[5]), si(&r[6]), si(&r[7]));
            rows.push(json!({ "ref": "", "desc": if rate == 0.0 { "Nil rated / exempt (0%)".to_string() } else { format!("Taxable supplies @ {}", rate_txt(rate)) }, "invoices": inv,
                              "taxable": taxable, "cgst": cgst, "sgst": sgst, "igst": igst, "cess": cess, "tax": cgst + sgst + igst, "value": taxable + cgst + sgst + igst + cess }));
            tt += taxable;
            tc += cgst;
            ts += sgst;
            tg += igst;
            tx += cess;
            if flag == 1 { b2b_taxable += taxable } else { b2c_taxable += taxable }
        }
        ti += n;
    }
    let cn = cn_sums(conn, p)?;
    rows.push(json!({ "_style": "head", "ref": "9B", "desc": "Credit / debit notes" }));
    rows.push(if cn.count > 0 {
        json!({ "ref": "", "desc": "Sales returns (credit notes)", "invoices": cn.count, "taxable": cn.taxable, "cgst": cn.cgst, "sgst": cn.sgst, "igst": cn.igst, "cess": cn.cess,
                "tax": cn.cgst + cn.sgst + cn.igst, "value": cn.taxable + cn.cgst + cn.sgst + cn.igst + cn.cess })
    } else {
        json!({ "ref": "", "desc": "No credit notes in this period", "invoices": 0, "taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "cess": 0, "tax": 0, "value": 0, "_style": "muted" })
    });
    Ok(json!({
        "id": "gstr1", "title": "GSTR-1 summary", "note": "Outward supplies: CGST + SGST within the shop's state, IGST to other states. Totals are sales; credit notes are shown in 9B.",
        "kpis": [kpi("Taxable value", "money", tt, None, Some("primary")), kpi("Total GST", "money", tc + ts + tg, Some("CGST + SGST + IGST".into()), None),
                 kpi("B2B invoices", "int", n_b2b, Some(if n_b2b > 0 { "with GSTIN".into() } else { "none in period".into() }), None),
                 kpi("B2C invoices", "int", n_b2c, Some("unregistered customers".into()), None)],
        "chart": { "kind": "split", "title": "Taxable value: B2B vs B2C", "parts": [{ "label": "B2B", "value": b2b_taxable }, { "label": "B2C", "value": b2c_taxable }] },
        "columns": [col("ref","Ref","text",Some("0.5fr")), col("desc","Description","text",Some("3fr")), col("invoices","Invoices","int",Some("0.9fr")), col("taxable","Taxable value","money",Some("1.5fr")),
            col("cgst","CGST","money",None), col("sgst","SGST","money",None), col("igst","IGST","money",Some("0.8fr")), col("cess","Cess","money",Some("0.7fr")), col("tax","Total tax","money",None), col("value","Total value","money",Some("1.5fr"))],
        "rows": rows,
        "totals": { "desc": "Total outward supplies", "invoices": ti, "taxable": tt, "cgst": tc, "sgst": ts, "igst": tg, "cess": tx, "tax": tc + ts + tg, "value": tt + tc + ts + tg + tx },
    }))
}

fn gstr3b(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let slabs = run(conn, &format!("SELECT s.rate,SUM(s.taxable),SUM(s.cgst),SUM(s.sgst),SUM(s.igst),SUM(s.cess) FROM bills b JOIN bill_slabs s ON s.bill_id=b.id WHERE {w} GROUP BY s.rate"), a)?;
    let (mut taxable, mut cgst, mut sgst, mut igst, mut nil) = (0, 0, 0, 0, 0);
    for r in &slabs {
        if sf(&r[0]) > 0.0 {
            taxable += si(&r[1]);
            cgst += si(&r[2]);
            sgst += si(&r[3]);
            igst += si(&r[4]);
        } else {
            nil += si(&r[1]);
        }
    }
    let cn = cn_sums(conn, p)?;
    let itc = run(conn, "SELECT COALESCE(SUM(taxable),0),COALESCE(SUM(cgst),0),COALESCE(SUM(sgst),0),COALESCE(SUM(igst),0) FROM purchases WHERE day >= ?1 AND day <= ?2", vec![p.from.clone().into(), p.to.clone().into()])?;
    let (itc_t, itc_c, itc_s, itc_i) = (si(&itc[0][0]), si(&itc[0][1]), si(&itc[0][2]), si(&itc[0][3]));
    let (out_i, out_c, out_s) = (igst - cn.igst, cgst - cn.cgst, sgst - cn.sgst);
    let net = crate::gst::set_off((out_i, out_c, out_s), (itc_i, itc_c, itc_s));
    let itc_total = itc_c + itc_s + itc_i;
    let rows = vec![
        json!({ "_style": "head", "ref": "3.1", "desc": "Outward supplies and reverse-charge inward" }),
        json!({ "ref": "(a)", "desc": "Outward taxable supplies (other than zero/nil/exempt)", "taxable": taxable, "igst": igst, "cgst": cgst, "sgst": sgst }),
        json!({ "ref": "(b)", "desc": "Outward taxable supplies (zero rated)", "taxable": 0, "igst": 0, "cgst": 0, "sgst": 0, "_style": "muted" }),
        json!({ "ref": "(c)", "desc": "Other outward supplies (nil rated, exempted)", "taxable": nil, "igst": 0, "cgst": 0, "sgst": 0 }),
        json!({ "ref": "(d)", "desc": "Inward supplies (liable to reverse charge)", "taxable": 0, "igst": 0, "cgst": 0, "sgst": 0, "_style": "muted" }),
        json!({ "ref": "(e)", "desc": "Non-GST outward supplies", "taxable": 0, "igst": 0, "cgst": 0, "sgst": 0, "_style": "muted" }),
        json!({ "ref": "", "desc": format!("Less: credit notes for sales returns ({})", cn.count), "taxable": -cn.taxable, "igst": -cn.igst, "cgst": -cn.cgst, "sgst": -cn.sgst, "_style": if cn.count > 0 { Value::Null } else { json!("muted") } }),
        json!({ "_style": "head", "ref": "4", "desc": "Eligible input tax credit" }),
        json!({ "ref": "(A)(5)", "desc": "All other ITC (from purchase bills in this period)", "taxable": itc_t, "igst": itc_i, "cgst": itc_c, "sgst": itc_s }),
        json!({ "_style": "head", "ref": "6.1", "desc": "Payment of tax" }),
        json!({ "_style": "strong", "ref": "", "desc": "Net tax payable in cash (output tax minus ITC)", "igst": net.0, "cgst": net.1, "sgst": net.2 }),
    ];
    let out = out_i + out_c + out_s;
    let payable = net.0 + net.1 + net.2;
    Ok(json!({
        "id": "gstr3b", "title": "GSTR-3B summary", "note": "ITC is taken from purchase bills dated in this period; sales returns reduce the output tax. IGST credit is set off against IGST, then CGST, then SGST (confirm with CA)",
        "kpis": [kpi("Output GST", "money", out, Some("on sales, after returns".into()), Some("primary")), kpi("Input tax credit", "money", itc_total, Some("on purchases".into()), Some("success")),
                 kpi("Net GST payable", "money", payable, None, Some("warning")), kpi("Taxable turnover", "money", taxable + nil - cn.taxable, None, None)],
        "chart": { "kind": "bars", "title": "Output tax vs input credit vs payable", "money": true,
                   "points": [{ "label": "Output GST", "value": out }, { "label": "Input credit", "value": itc_total }, { "label": "Net payable", "value": payable }] },
        "columns": [col("ref","Ref","text",Some("0.6fr")), col("desc","Nature of supply","text",Some("4fr")), col("taxable","Taxable value","money",Some("1.2fr")), col("igst","IGST","money",Some("0.8fr")),
            col("cgst","CGST","money",None), col("sgst","SGST / UTGST","money",None)],
        "rows": rows,
    }))
}

fn hsn_wise(conn: &Connection, p: &ReportParams) -> Result<Value> {
    // GSTR-1 table 12 as the GST portal now takes it: one summary for supplies to registered buyers (B2B) and one for the rest (B2C),
    // each net of the credit notes of the period. Added up from the tax saved on every bill and credit note line, so the rows tie to
    // the bills to the paisa. (confirm the layout and the net-of-credit-notes treatment with the CA)
    let (sales, returns) = crate::gstr::hsn_rows(conn, &p.from, &p.to, p.category_id.as_deref())?;
    type Key = (bool, String, String, i64);
    let key = |v: &Value| -> Key { (v["b2b"].as_bool().unwrap_or(false), v["hsn"].as_str().unwrap_or("").to_string(), v["unit"].as_str().unwrap_or("").to_string(), crate::money::rate_bp(v["rate"].as_f64().unwrap_or(0.0))) };
    let mut net: BTreeMap<Key, Value> = BTreeMap::new();
    for (list, sign) in [(&sales, 1i64), (&returns, -1)] {
        for v in list.iter() {
            let e = net.entry(key(v)).or_insert_with(|| {
                json!({ "b2b": v["b2b"], "hsn": v["hsn"], "desc": v["desc"], "unit": v["unit"], "uqc": v["uqc"], "rate": v["rate"], "qty": 0, "taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "cess": 0, "value": 0 })
            });
            for k in ["qty", "taxable", "cgst", "sgst", "igst", "cess", "value"] {
                e[k] = json!(e[k].as_i64().unwrap_or(0) + sign * v[k].as_i64().unwrap_or(0));
            }
        }
    }
    let mut rows: Vec<Value> = vec![];
    let mut all: Vec<Value> = vec![];
    for (b2b, title) in [(true, "12 - HSN summary of supplies to registered buyers (B2B)"), (false, "12 - HSN summary of supplies to consumers and unregistered buyers (B2C)")] {
        rows.push(json!({ "_style": "head", "hsn": title }));
        let mine: Vec<&Value> = net.values().filter(|v| v["b2b"].as_bool() == Some(b2b) && ["taxable", "value", "qty"].iter().any(|k| v[*k].as_i64().unwrap_or(0) != 0)).collect();
        if mine.is_empty() {
            rows.push(json!({ "hsn": "None in this period", "_style": "muted" }));
        }
        for v in mine {
            let hsn = v["hsn"].as_str().unwrap_or("");
            let (tax, desc) = (v["cgst"].as_i64().unwrap_or(0) + v["sgst"].as_i64().unwrap_or(0) + v["igst"].as_i64().unwrap_or(0), v["desc"].as_str().unwrap_or(""));
            let mut r = v.clone();
            r["hsn"] = json!(if hsn.is_empty() { "0000".to_string() } else { hsn.to_string() });
            r["desc"] = json!(if desc.is_empty() { "Goods".to_string() } else { desc.to_string() });
            r["tax"] = json!(tax);
            rows.push(r.clone());
            all.push(r);
        }
    }
    let t = |k: &str| sum_i(&all, k);
    let mut by_taxable = all.clone();
    by_taxable.sort_by(|a, b| b["taxable"].as_i64().cmp(&a["taxable"].as_i64()));
    let distinct: std::collections::BTreeSet<String> = all.iter().map(|r| r["hsn"].as_str().unwrap_or("").to_string()).collect();
    let cn_taxable: i64 = returns.iter().map(|v| v["taxable"].as_i64().unwrap_or(0)).sum();
    Ok(json!({
        "id": "hsn-wise", "title": "HSN-wise summary", "note": "GSTR-1 table 12, split into B2B and B2C, net of credit notes (confirm the layout with the CA). Quantities are per unit of measure (UQC). Items with no HSN show as 0000.",
        "kpis": [kpi("Taxable value", "money", t("taxable"), Some(if cn_taxable > 0 { "after returns".into() } else { "no returns".into() }), Some("primary")), kpi("Total GST", "money", t("tax"), None, None),
                 kpi("HSN codes", "int", distinct.len(), Some("in this period".into()), None), kpi("Invoice value", "money", t("value"), None, None)],
        "chart": { "kind": "bars", "title": "Taxable value by HSN", "money": true,
                   "points": by_taxable.iter().take(8).map(|r| json!({ "label": format!("{} @ {}% ({})", r["hsn"].as_str().unwrap_or(""), r["rate"], r["uqc"].as_str().unwrap_or("")), "value": r["taxable"] })).collect::<Vec<_>>() },
        "columns": [col("hsn","HSN","text",Some("0.9fr")), col("desc","Description","text",Some("2fr")), col("uqc","UQC","text",Some("0.6fr")), col("qty","Total qty","qty",Some("1fr")),
            col("rate","Rate","pct",Some("0.6fr")), col("taxable","Taxable value","money",Some("1.2fr")), col("igst","IGST","money",Some("0.8fr")), col("cgst","CGST","money",Some("0.9fr")), col("sgst","SGST","money",Some("0.9fr")),
            col("cess","Cess","money",Some("0.7fr")), col("value","Total value","money",Some("1.2fr"))],
        "rows": rows,
        "totals": { "hsn": "Total", "taxable": t("taxable"), "igst": t("igst"), "cgst": t("cgst"), "sgst": t("sgst"), "cess": t("cess"), "value": t("value") },
    }))
}

fn tax_rate(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, false);
    let data = run(conn, &format!("SELECT s.rate,COUNT(DISTINCT s.bill_id),SUM(s.taxable),SUM(s.cgst),SUM(s.sgst),SUM(s.igst),SUM(s.cess) FROM bills b JOIN bill_slabs s ON s.bill_id=b.id WHERE {w} GROUP BY s.rate ORDER BY s.rate"), a)?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let (taxable, cgst, sgst, igst, cess) = (si(&r[2]), si(&r[3]), si(&r[4]), si(&r[5]), si(&r[6]));
            json!({ "rate": crate::gst::rate_json(sf(&r[0])), "bills": si(&r[1]), "taxable": taxable, "cgst": cgst, "sgst": sgst, "igst": igst, "cess": cess,
                    "tax": cgst + sgst + igst, "value": taxable + cgst + sgst + igst + cess })
        })
        .collect();
    let t = |k: &str| sum_i(&rows, k);
    Ok(json!({
        "id": "tax-rate", "title": "Tax-rate-wise summary",
        "kpis": [kpi("Taxable value", "money", t("taxable"), None, Some("primary")), kpi("CGST + SGST", "money", t("cgst") + t("sgst"), None, None), kpi("IGST", "money", t("igst"), None, None), kpi("Slabs used", "int", rows.len(), None, None)],
        "chart": { "kind": "split", "title": "GST collected by slab", "parts": rows.iter().map(|r| json!({ "label": format!("{}%", r["rate"]), "value": r["tax"] })).collect::<Vec<_>>() },
        "columns": [col("rate","GST rate","pct",Some("1fr")), col("bills","Bills","int",Some("0.7fr")), col("taxable","Taxable value","money",None), col("cgst","CGST","money",None), col("sgst","SGST","money",None), col("igst","IGST","money",None),
            col("cess","Cess","money",Some("0.7fr")), col("tax","Total tax","money",None), col("value","Total value","money",None)],
        "rows": rows,
        "totals": { "rate": "Total", "taxable": t("taxable"), "cgst": t("cgst"), "sgst": t("sgst"), "igst": t("igst"), "cess": t("cess"), "tax": t("tax"), "value": t("value") },
    }))
}

// ---------- stock ----------

fn stock_items(conn: &Connection, p: &ReportParams) -> Result<Vec<(String, String, String, String, i64, i64, i64, i64)>> {
    // (id, name, category, unit, stock, reorder, cost, price)
    let cat = p.category_id.clone().filter(|c| !c.is_empty() && c != "all");
    let mut st = conn.prepare_cached(
        "SELECT i.id,i.name,c.name,i.unit,i.stock,i.reorder_level,i.cost,i.price FROM items i JOIN categories c ON c.id=i.category_id
         WHERE i.active=1 AND i.kind='item' AND i.service=0 AND (?1 IS NULL OR i.category_id=?1) ORDER BY i.rowid",
    )?;
    let v = st.query_map([cat], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn stock_summary(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let from = day_of(Local::now() - Duration::days(30));
    let sold: HashMap<String, i64> = run(
        conn,
        "SELECT l.item_id,SUM(l.qty) FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id WHERE b.day >= ?1 AND b.status != 'cancelled' GROUP BY l.item_id",
        vec![from.into()],
    )?
    .into_iter()
    .map(|r| (ss(&r[0]), si(&r[1])))
    .collect();
    let mut rows: Vec<Value> = stock_items(conn, p)?
        .into_iter()
        .map(|(id, name, cat, unit, stock, reorder, _, _)| {
            let per_day = sold.get(&id).copied().unwrap_or(0) as f64 / 30.0;
            let status = if stock as f64 <= reorder as f64 * 0.3 { "Critical" } else if stock <= reorder { "Low" } else { "OK" };
            let cover = if per_day > 0.0 { (stock as f64 / per_day).min(999.0) } else { 999.0 };
            json!({ "name": name, "category": cat, "stock": stock, "unit": lookup(UNIT_LABEL, &unit), "reorder": reorder, "cover": cover, "status": status })
        })
        .collect();
    rows.sort_by(|a, b| a["cover"].as_f64().partial_cmp(&b["cover"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    let low = rows.iter().filter(|r| r["status"] != "OK").count();
    Ok(json!({
        "id": "stock-summary", "title": "Stock summary", "note": "Cover = days the current stock lasts at the last 30 days average sale",
        "kpis": [kpi("Items in stock", "int", rows.len(), None, Some("primary")), kpi("Below reorder level", "int", low, Some("needs a purchase".into()), Some("warning")),
                 kpi("Critical", "int", rows.iter().filter(|r| r["status"] == "Critical").count(), Some("under 30% of reorder level".into()), Some("danger")),
                 kpi("Out of stock", "int", rows.iter().filter(|r| r["stock"].as_i64().unwrap_or(0) <= 0).count(), None, None)],
        "columns": [col("name","Item","text",Some("2.4fr")), col("category","Category","text",Some("1.5fr")), colu("stock","In stock","qty",Some("1fr"),"unit"), colu("reorder","Reorder at","qty",Some("1fr"),"unit"),
            col("cover","Cover (days)","dec1",Some("0.8fr")), col("status","Status","badge",Some("0.8fr"))],
        "rows": rows,
    }))
}

fn stock_valuation(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let mut rows: Vec<Value> = stock_items(conn, p)?
        .into_iter()
        .map(|(_, name, cat, unit, stock, _, cost, price)| {
            let s = stock.max(0);
            let (cv, sv) = (round_div(cost * s, 1000), round_div(price * s, 1000));
            json!({ "name": name, "category": cat, "stock": s, "unit": lookup(UNIT_LABEL, &unit), "cost": cost, "costValue": cv, "saleValue": sv, "margin": sv - cv })
        })
        .collect();
    rows.sort_by(|a, b| b["costValue"].as_i64().cmp(&a["costValue"].as_i64()));
    let t = |k: &str| sum_i(&rows, k);
    let mut by_cat: BTreeMap<String, i64> = BTreeMap::new();
    for r in &rows {
        *by_cat.entry(r["category"].as_str().unwrap_or("").to_string()).or_default() += r["costValue"].as_i64().unwrap_or(0);
    }
    let mut cats: Vec<(String, i64)> = by_cat.into_iter().collect();
    cats.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(json!({
        "id": "stock-valuation", "title": "Stock valuation", "note": "Valued at cost price and at selling price (GST inclusive)",
        "kpis": [kpi("Stock value at cost", "money", t("costValue"), None, Some("primary")), kpi("Value at selling price", "money", t("saleValue"), None, None),
                 kpi("Potential margin", "money", t("margin"), Some(format!("{:.1}% of selling value", pct(t("margin"), t("saleValue")))), Some("success")),
                 kpi("Items", "int", rows.len(), Some("with stock on hand".into()), None)],
        "chart": { "kind": "bars", "title": "Stock value at cost, by category", "money": true, "points": cats.iter().map(|(l, v)| json!({ "label": l, "value": v })).collect::<Vec<_>>() },
        "columns": [col("name","Item","text",Some("2.4fr")), col("category","Category","text",Some("1.5fr")), colu("stock","In stock","qty",Some("1fr"),"unit"), col("cost","Cost rate","money",Some("0.9fr")),
            col("costValue","Value at cost","money",Some("1.1fr")), col("saleValue","Value at price","money",Some("1.1fr")), col("margin","Margin","money",Some("1fr"))],
        "rows": rows,
        "totals": { "name": "Total", "costValue": t("costValue"), "saleValue": t("saleValue"), "margin": t("margin") },
    }))
}

fn stock_movement(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (from, to) = range_iso(p);
    let cat = p.category_id.clone().filter(|c| !c.is_empty() && c != "all");
    let data = run(
        conn,
        "SELECT m.at,i.name,i.unit,m.kind,m.qty,m.note,COALESCE(m.by_name,'') FROM stock_movements m JOIN items i ON i.id=m.item_id
         WHERE +m.at >= ?1 AND +m.at < ?2 AND (?3 IS NULL OR i.category_id=?3) ORDER BY m.id DESC LIMIT 3000",
        vec![from.into(), to.into(), cat.map(Sql::from).unwrap_or(Sql::Null)],
    )?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let at = parse_iso(&ss(&r[0])).map(|d| d.format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default();
            json!({ "date": at, "name": ss(&r[1]), "kind": ss(&r[3]), "qty": si(&r[4]), "unit": lookup(UNIT_LABEL, &ss(&r[2])), "note": ss(&r[5]), "by": ss(&r[6]) })
        })
        .collect();
    let kind_sum = |k: &str| -> i64 { data.iter().filter(|r| ss(&r[3]) == k).map(|r| si(&r[4])).sum() };
    Ok(json!({
        "id": "stock-movement", "title": "Stock movement", "note": format!("Every stock ledger entry from {} to {} (latest 3,000)", p.from, p.to),
        "kpis": [kpi("Entries", "int", rows.len(), None, Some("primary")), kpi("Purchases in", "int", data.iter().filter(|r| ss(&r[3]) == "purchase").count(), None, Some("success")),
                 kpi("Sales entries", "int", data.iter().filter(|r| ss(&r[3]) == "sale").count(), None, None),
                 kpi("Adjustments", "int", data.iter().filter(|r| ss(&r[3]) == "adjustment").count(), Some(format!("net {} units", kind_sum("adjustment") / 1000)), Some("warning"))],
        "columns": [col("date","When","text",Some("1.2fr")), col("name","Item","text",Some("2.2fr")), col("kind","Type","badge",Some("0.9fr")), colu("qty","Quantity","qty",Some("1fr"),"unit"), col("note","Note","text",Some("2.2fr")), col("by","By","text",Some("0.9fr"))],
        "rows": rows,
    }))
}

fn low_dead(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(&ReportParams { category_id: None, cashier: None, mode: None, ..p.clone() }, false);
    let sold: std::collections::HashSet<String> = run(
        conn,
        &format!("SELECT DISTINCT l.item_id FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id WHERE {w}"),
        a,
    )?
    .into_iter()
    .map(|r| ss(&r[0]))
    .collect();
    let mut last_sale = conn.prepare_cached("SELECT at FROM stock_movements WHERE item_id=?1 AND kind='sale' ORDER BY id DESC LIMIT 1")?;
    let mut rows: Vec<Value> = vec![];
    for (id, name, cat, unit, stock, reorder, cost, _) in stock_items(conn, p)? {
        let sold_in_range = sold.contains(&id);
        let low = stock <= reorder;
        let dead = stock > 0 && !sold_in_range;
        if !low && !dead {
            continue;
        }
        let last_sold = last_sale
            .query_row([&id], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|at| parse_iso(&at))
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "Never sold".into());
        let status = match (low, dead) {
            (true, true) => "Low and dead",
            (true, false) => "Low",
            _ => "Dead",
        };
        rows.push(json!({ "name": name, "category": cat, "stock": stock, "unit": lookup(UNIT_LABEL, &unit), "reorder": reorder, "lastSold": last_sold, "value": round_div(cost * stock.max(0), 1000), "status": status }));
    }
    let dead_value: i64 = rows.iter().filter(|r| r["status"] != "Low").map(|r| r["value"].as_i64().unwrap_or(0)).sum();
    Ok(json!({
        "id": "low-dead", "title": "Low and dead stock", "note": format!("Dead = stock on hand but nothing sold from {} to {}", p.from, p.to),
        "kpis": [kpi("Low stock", "int", rows.iter().filter(|r| r["status"] != "Dead").count(), Some("at or below reorder level".into()), Some("warning")),
                 kpi("Dead stock", "int", rows.iter().filter(|r| r["status"] != "Low").count(), Some("not selling".into()), Some("danger")),
                 kpi("Money locked in dead stock", "money", dead_value, Some("at cost".into()), None)],
        "columns": [col("name","Item","text",Some("2.4fr")), col("category","Category","text",Some("1.5fr")), colu("stock","In stock","qty",Some("1fr"),"unit"), colu("reorder","Reorder at","qty",Some("1fr"),"unit"),
            col("lastSold","Last sold","text",Some("1.2fr")), col("value","Value at cost","money",Some("1fr")), col("status","Status","badge",Some("0.9fr"))],
        "rows": rows,
    }))
}

// ---------- profit ----------

fn item_margin(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, true);
    let data = run(
        conn,
        &format!(
            "SELECT l.item_id,MAX(l.name),MAX(l.unit),SUM(l.qty),SUM({L_TAXABLE}),SUM({L_COST})
             FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id JOIN items i ON i.id=l.item_id WHERE {w} GROUP BY l.item_id"
        ),
        a,
    )?;
    let mut rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let (sales, cost) = (si(&r[4]), si(&r[5]));
            json!({ "name": ss(&r[1]), "qty": si(&r[3]), "unit": lookup(UNIT_LABEL, &ss(&r[2])), "sales": sales, "cost": cost, "profit": sales - cost, "margin": pct(sales - cost, sales) })
        })
        .collect();
    rows.sort_by(|a, b| b["profit"].as_i64().cmp(&a["profit"].as_i64()));
    let t = |k: &str| sum_i(&rows, k);
    Ok(json!({
        "id": "item-margin", "title": "Item-wise margin", "note": "Sales are ex-GST (taxable value); cost is the item cost price ex-GST",
        "kpis": [kpi("Gross profit", "money", t("profit"), None, Some("success")), kpi("Margin", "pct", pct(t("profit"), t("sales")), Some("of taxable sales".into()), None),
                 kpi("Best item", "text", rows.first().map(|r| r["name"].clone()).unwrap_or(json!("-")), rows.first().map(|_| "highest profit".to_string()), None),
                 kpi("Cost of goods sold", "money", t("cost"), None, None)],
        "chart": { "kind": "bars", "title": "Top 8 items by profit", "money": true, "points": rows.iter().take(8).map(|r| json!({ "label": r["name"], "value": r["profit"] })).collect::<Vec<_>>() },
        "columns": [col("name","Item","text",Some("2.4fr")), colu("qty","Qty sold","qty",Some("1fr"),"unit"), col("sales","Sales (ex-GST)","money",Some("1.1fr")), col("cost","Cost","money",Some("1fr")),
            col("profit","Profit","money",Some("1fr")), col("margin","Margin","pct",Some("0.7fr"))],
        "rows": rows,
        "totals": { "name": "Total", "sales": t("sales"), "cost": t("cost"), "profit": t("profit"), "margin": pct(t("profit"), t("sales")) },
    }))
}

fn daily_profit(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let (w, a) = bills_where(p, true);
    let data = run(
        conn,
        &format!(
            "SELECT b.day,COUNT(DISTINCT b.id),SUM({L_TAXABLE}),SUM({L_COST}) FROM bills b CROSS JOIN bill_lines l ON l.bill_id=b.id JOIN items i ON i.id=l.item_id WHERE {w} GROUP BY b.day"
        ),
        a,
    )?;
    let by: HashMap<String, Vec<Sql>> = data.into_iter().map(|r| (ss(&r[0]), r)).collect();
    let exp: HashMap<String, i64> = run(
        conn,
        "SELECT day,SUM(amount) FROM expenses WHERE status='active' AND day >= ?1 AND day <= ?2 GROUP BY day",
        vec![p.from.clone().into(), p.to.clone().into()],
    )?
    .into_iter()
    .map(|r| (ss(&r[0]), si(&r[1])))
    .collect();
    let days = days_between(&p.from, &p.to);
    let rows: Vec<Value> = days
        .iter()
        .map(|d| {
            let r = by.get(d);
            let (sales, cost) = (r.map(|r| si(&r[2])).unwrap_or(0), r.map(|r| si(&r[3])).unwrap_or(0));
            let expenses = exp.get(d).copied().unwrap_or(0);
            json!({ "date": d, "bills": r.map(|r| si(&r[1])).unwrap_or(0), "sales": sales, "cost": cost, "gross": sales - cost, "expenses": expenses,
                    "profit": sales - cost - expenses, "margin": pct(sales - cost - expenses, sales) })
        })
        .collect();
    let t = |k: &str| sum_i(&rows, k);
    let best = rows.iter().max_by_key(|r| r["profit"].as_i64().unwrap_or(0));
    Ok(json!({
        "id": "daily-profit", "title": "Daily profit", "note": "Taxable sales minus cost of goods sold minus expenses",
        "kpis": [kpi("Net profit", "money", t("profit"), Some(format!("after expenses of {} rupees", rupees(t("expenses")))), Some("success")), kpi("Margin", "pct", pct(t("profit"), t("sales")), None, None),
                 kpi("Best day", "text", best.map(|r| r["date"].clone()).unwrap_or(json!("-")), best.map(|r| format!("profit {} rupees", rupees(r["profit"].as_i64().unwrap_or(0)))), None),
                 kpi("Average per day", "money", round_div(t("profit"), days.len().max(1) as i64), None, None)],
        "chart": { "kind": "area", "title": "Gross profit per day", "money": true, "points": rows.iter().map(|r| json!({ "label": r["date"], "value": r["profit"] })).collect::<Vec<_>>() },
        "columns": [col("date","Date","date",Some("1.2fr")), col("bills","Bills","int",Some("0.6fr")), col("sales","Sales (ex-GST)","money",None), col("cost","Cost","money",None), col("gross","Gross profit","money",None), col("expenses","Expenses","money",None), col("profit","Net profit","money",None), col("margin","Margin","pct",Some("0.7fr"))],
        "rows": rows.iter().rev().cloned().collect::<Vec<_>>(),
        "totals": { "date": "Total", "bills": t("bills"), "sales": t("sales"), "cost": t("cost"), "gross": t("gross"), "expenses": t("expenses"), "profit": t("profit"), "margin": pct(t("profit"), t("sales")) },
    }))
}

// ---------- cash ----------

fn cash_book(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let rng = vec![Sql::from(p.from.clone()), Sql::from(p.to.clone())];
    let mut days: BTreeMap<String, [i64; 11]> = BTreeMap::new();
    // 0 opening, 1 cashSales, 2 cashIn, 3 refunds, 4 supplierCash, 5 expenses, 6 deposit, 7 counted, 8 difference, 9 has shift, 10 unused
    for r in run(conn, "SELECT b.day,SUM(x.amount) FROM bills b JOIN bill_payments x ON x.bill_id=b.id AND x.mode='cash' WHERE b.day >= ?1 AND b.day <= ?2 AND b.status != 'cancelled' GROUP BY b.day", rng.clone())? {
        days.entry(ss(&r[0])).or_default()[1] = si(&r[1]);
    }
    for r in run(conn, "SELECT day,SUM(grand) FROM credit_notes WHERE refund_mode='cash' AND day >= ?1 AND day <= ?2 GROUP BY day", rng.clone())? {
        days.entry(ss(&r[0])).or_default()[3] = si(&r[1]);
    }
    for r in run(
        conn,
        "SELECT strftime('%Y-%m-%d', m.at, 'localtime') d, m.kind, m.reason, SUM(m.amount) FROM cash_movements m
         WHERE strftime('%Y-%m-%d', m.at, 'localtime') >= ?1 AND strftime('%Y-%m-%d', m.at, 'localtime') <= ?2 GROUP BY d, m.kind, m.reason",
        rng.clone(),
    )? {
        let e = days.entry(ss(&r[0])).or_default();
        let (kind, reason, amt) = (ss(&r[1]), ss(&r[2]).to_lowercase(), si(&r[3]));
        if kind == "in" {
            e[2] += amt;
        } else if reason.starts_with("supplier") {
            e[4] += amt;
        } else if reason.contains("deposit") {
            e[6] += amt;
        } else {
            e[5] += amt;
        }
    }
    for r in run(conn, "SELECT day,SUM(amount) FROM expenses WHERE paid_from='cash' AND status='active' AND day >= ?1 AND day <= ?2 GROUP BY day", rng.clone())? {
        days.entry(ss(&r[0])).or_default()[5] += si(&r[1]);
    }
    for r in run(
        conn,
        "SELECT strftime('%Y-%m-%d', opened_at, 'localtime') d, id, opening_cash, COALESCE(counted,0), COALESCE(difference,0), closed_at FROM shifts
         WHERE d >= ?1 AND d <= ?2 ORDER BY id",
        rng,
    )? {
        let e = days.entry(ss(&r[0])).or_default();
        if e[9] == 0 {
            e[0] = si(&r[2]);
            e[9] = 1;
        }
        if !matches!(r[5], Sql::Null) {
            e[7] = si(&r[3]);
            e[8] += si(&r[4]);
        }
    }
    let rows: Vec<Value> = days
        .iter()
        .map(|(d, e)| {
            let expected = e[0] + e[1] + e[2] - e[3] - e[4] - e[5] - e[6];
            json!({ "date": d, "opening": e[0], "cashSales": e[1], "cashIn": e[2], "refunds": e[3], "supplierCash": e[4], "expenses": e[5], "deposit": e[6], "closing": expected, "diff": e[8], "counted": e[7] })
        })
        .collect();
    let t = |k: &str| sum_i(&rows, k);
    Ok(json!({
        "id": "cash-book", "title": "Day-wise cash book", "note": "Opening + cash sales + receipts - refunds - suppliers - expenses - deposit = expected closing",
        "kpis": [kpi("Cash sales", "money", t("cashSales"), None, Some("success")), kpi("Cash out", "money", t("supplierCash") + t("expenses") + t("refunds"), Some("suppliers, expenses, refunds".into()), Some("warning")),
                 kpi("Banked", "money", t("deposit"), None, Some("info")), kpi("Short / excess", "money", t("diff"), Some("counted minus expected at day close".into()), Some("primary"))],
        "chart": { "kind": "bars", "title": "Cash sales per day", "money": true, "points": rows.iter().map(|r| json!({ "label": r["date"], "value": r["cashSales"] })).collect::<Vec<_>>() },
        "columns": [col("date","Date","date",Some("1.1fr")), col("opening","Opening","money",None), col("cashSales","Cash sales","money",None), col("cashIn","Cash in (receipts)","money",Some("1fr")),
            col("refunds","Refunds","money",Some("0.9fr")), col("supplierCash","Suppliers","money",Some("0.9fr")), col("expenses","Expenses","money",Some("0.9fr")), col("deposit","Bank deposit","money",None),
            col("closing","Expected","money",None), col("diff","Short / excess","money",Some("0.9fr")), col("counted","Counted","money",None)],
        "rows": rows.iter().rev().cloned().collect::<Vec<_>>(),
        "totals": { "date": "Total", "cashSales": t("cashSales"), "cashIn": t("cashIn"), "refunds": t("refunds"), "supplierCash": t("supplierCash"), "expenses": t("expenses"), "deposit": t("deposit"), "diff": t("diff") },
    }))
}

fn day_close(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let data = run(
        conn,
        "SELECT z_number,opened_at,closed_at,closed_by,approved_by,COALESCE(expected,0),COALESCE(counted,0),COALESCE(difference,0),counter FROM shifts
         WHERE closed_at IS NOT NULL AND strftime('%Y-%m-%d', closed_at, 'localtime') >= ?1 AND strftime('%Y-%m-%d', closed_at, 'localtime') <= ?2 ORDER BY id DESC",
        vec![p.from.clone().into(), p.to.clone().into()],
    )?;
    let fmt = |s: &str| parse_iso(s).map(|d| d.format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default();
    let rows: Vec<Value> = data
        .iter()
        .map(|r| json!({ "z": ss(&r[0]), "opened": fmt(&ss(&r[1])), "closed": fmt(&ss(&r[2])), "by": ss(&r[3]), "approved": ss(&r[4]), "counter": ss(&r[8]), "expected": si(&r[5]), "counted": si(&r[6]), "diff": si(&r[7]) }))
        .collect();
    let t = |k: &str| sum_i(&rows, k);
    Ok(json!({
        "id": "day-close", "title": "Day close history", "note": "Every Z report (shift close) in the period",
        "kpis": [kpi("Days closed", "int", rows.len(), None, Some("primary")), kpi("Expected cash", "money", t("expected"), None, None),
                 kpi("Counted cash", "money", t("counted"), None, None), kpi("Short / excess", "money", t("diff"), None, if t("diff") < 0 { Some("danger") } else { Some("success") })],
        "columns": [col("z","Z report","text",Some("1fr")), col("counter","Counter","text",Some("0.9fr")), col("opened","Opened","text",Some("1.2fr")), col("closed","Closed","text",Some("1.2fr")), col("by","Closed by","text",Some("1.1fr")),
            col("approved","Approved by","text",Some("1.1fr")), col("expected","Expected","money",None), col("counted","Counted","money",None), col("diff","Short / excess","money",None)],
        "rows": rows,
        "totals": { "z": "Total", "expected": t("expected"), "counted": t("counted"), "diff": t("diff") },
    }))
}

// ---------- production ----------

fn yield_report(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let data = run(
        conn,
        "SELECT day,number,seed,seed_g,cleaning_loss_g,jaggery_g,oil_raw_ml,cake_g,norm_kg_per_l,norm_density,barrel_id FROM pressing_batches WHERE status='active' AND day >= ?1 AND day <= ?2 ORDER BY id DESC",
        vec![p.from.clone().into(), p.to.clone().into()],
    )?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let (seed_g, clean, jag, oil, cake) = (si(&r[3]), si(&r[4]), si(&r[5]), si(&r[6]), si(&r[7]));
            let m = crate::purchasing::pressing_metrics(seed_g, clean, jag, oil, cake, ss(&r[8]).parse().unwrap_or(2.5), ss(&r[9]).parse().unwrap_or(0.91));
            let seed = ss(&r[2]);
            json!({ "date": ss(&r[0]), "batch": ss(&r[1]), "seed": seed, "seedKg": seed_g, "oilL": oil,
                    "yield": m["litresPer100Kg"], "variance": m["variancePct"], "cakeKg": cake, "cakePct": pctf(cake as f64, seed_g as f64),
                    "wastage": (m["lossKg"].as_f64().unwrap_or(0.0).max(0.0) * 1000.0).round() as i64, "status": if matches!(r[10], Sql::Null) { "Settling" } else { "In barrel" } })
        })
        .collect();
    let seed = sum_i(&rows, "seedKg");
    let oil = sum_i(&rows, "oilL");
    let cake = sum_i(&rows, "cakeKg");
    Ok(json!({
        "id": "yield", "title": "Production yield", "note": "Oil per 100 kg of seed; vs norm uses the norm in force when the batch was pressed",
        "kpis": [kpi("Seed pressed", "text", format!("{} kg", seed / 1000), None, Some("primary")), kpi("Oil produced", "text", format!("{} L", oil / 1000), None, None),
                 kpi("Average oil yield", "dec1", pctf(oil as f64, seed as f64), Some("litres per 100 kg seed".into()), Some("success")),
                 kpi("Oil cake", "text", format!("{} kg", cake / 1000), Some(format!("{:.1}% of seed", pctf(cake as f64, seed as f64))), None)],
        "chart": { "kind": "bars", "title": "Oil yield per batch (L per 100 kg seed)", "money": false,
                   "points": rows.iter().rev().map(|r| json!({ "label": format!("{} {}", r["batch"].as_str().unwrap_or(""), r["seed"].as_str().unwrap_or("")), "value": (r["yield"].as_f64().unwrap_or(0.0) * 10.0).round() / 10.0 })).collect::<Vec<_>>() },
        "columns": [col("date","Date","date",Some("1fr")), col("batch","Batch","text",Some("0.9fr")), col("seed","Seed","text",Some("1fr")), col("seedKg","Seed (kg)","qty",Some("1fr")), col("oilL","Oil (L)","qty",Some("1fr")),
            col("yield","Yield /100 kg","dec1",Some("1fr")), col("variance","vs norm %","dec1",Some("0.8fr")), col("cakeKg","Cake (kg)","qty",Some("1fr")), col("cakePct","Cake %","pct",Some("0.7fr")),
            col("wastage","Wastage (kg)","qty",Some("1fr")), col("status","Status","badge",Some("0.8fr"))],
        "rows": rows,
        "totals": { "date": "Total", "seedKg": seed, "oilL": oil, "yield": pctf(oil as f64, seed as f64), "cakeKg": cake, "cakePct": pctf(cake as f64, seed as f64), "wastage": sum_f(&rows, "wastage").round() as i64 },
    }))
}
