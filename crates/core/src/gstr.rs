//! GST return facts: everything GSTR-1 and GSTR-3B need for one month, read straight from the saved bills, credit notes and
//! purchases, with no classification in it. The sections (B2B, B2CL, B2CS, nil, credit notes, HSN, documents) are built from these
//! facts by the shared TypeScript builder (`packages/data/src/gstr.ts`), the same code for the desktop app and the browser preview.
//!
//! Every figure here is a sum of what was saved when the bill was written (slabs and per-line tax), never a recomputation, so the
//! totals tie to the bills and to the Sales / GST reports to the paisa.

use crate::db::{self, get_setting};
use crate::error::Result;
use chrono::{Datelike, NaiveDate};
use rusqlite::Connection;
use serde_json::{json, Value};

/// "2026-11" -> (first day, last day, filing period "112026").
pub fn month_range(month: &str) -> Result<(String, String, String)> {
    let bad = || crate::error::ApiError::Invalid("Choose a month like 2026-11.".into());
    let (y, m) = month.trim().split_once('-').ok_or_else(bad)?;
    let (y, m): (i32, u32) = (y.parse().map_err(|_| bad())?, m.parse().map_err(|_| bad())?);
    let first = NaiveDate::from_ymd_opt(y, m, 1).ok_or_else(bad)?;
    let next = if m == 12 { NaiveDate::from_ymd_opt(y + 1, 1, 1) } else { NaiveDate::from_ymd_opt(y, m + 1, 1) }.ok_or_else(bad)?;
    let last = next - chrono::Duration::days(1);
    Ok((first.format("%Y-%m-%d").to_string(), last.format("%Y-%m-%d").to_string(), format!("{:02}{}", first.month(), first.year())))
}

fn slabs_of(conn: &Connection, sql: &str, id: i64) -> Result<Vec<Value>> {
    let mut st = conn.prepare_cached(sql)?;
    let rows = st
        .query_map([id], |r| {
            Ok(json!({ "rate": crate::gst::rate_json(r.get::<_, f64>(0)?), "taxable": r.get::<_, i64>(1)?, "cgst": r.get::<_, i64>(2)?, "sgst": r.get::<_, i64>(3)?,
                       "igst": r.get::<_, i64>(4)?, "cess": r.get::<_, i64>(5)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn hsn_facts(conn: &Connection, sql: &str, args: Vec<String>) -> Result<Vec<Value>> {
    let mut st = conn.prepare(sql)?;
    let rows = st
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            let hsn: String = r.get(1)?;
            let unit: String = r.get(2)?;
            Ok((r.get::<_, i64>(0)? != 0, hsn, unit, r.get::<_, f64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?, r.get::<_, i64>(7)?, r.get::<_, i64>(8)?, r.get::<_, i64>(9)?, r.get::<_, i64>(10)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows
        .into_iter()
        .map(|(b2b, hsn, unit, rate, qty, taxable, cgst, sgst, igst, cess, value)| {
            json!({ "b2b": b2b, "hsn": hsn, "desc": crate::hsn::desc_for(&hsn), "unit": unit, "uqc": crate::gst::uqc_of(&unit), "rate": crate::gst::rate_json(rate),
                    "qty": qty, "taxable": taxable, "cgst": cgst, "sgst": sgst, "igst": igst, "cess": cess, "value": value })
        })
        .collect())
}

/// The sales and returns of a period summed per (registered or not, HSN, unit, rate), from the tax saved on every line.
/// `sales` are the lines of bills that were not cancelled; `returns` are the lines of credit notes dated in the period.
pub fn hsn_rows(conn: &Connection, from: &str, to: &str, category: Option<&str>) -> Result<(Vec<Value>, Vec<Value>)> {
    let cat = category.filter(|c| !c.is_empty() && *c != "all");
    let (clause, mut args) = match cat {
        Some(c) => (" AND l.item_id IN (SELECT id FROM items WHERE category_id=?3)", vec![from.to_string(), to.to_string(), c.to_string()]),
        None => ("", vec![from.to_string(), to.to_string()]),
    };
    let sales = hsn_facts(
        conn,
        &format!(
            "SELECT CASE WHEN b.cust_gstin != '' THEN 1 ELSE 0 END, l.hsn, l.unit, l.gst_rate, SUM(l.qty), SUM(l.taxable), SUM(l.cgst), SUM(l.sgst), SUM(l.igst), SUM(l.cess), SUM(l.amount)
             FROM bills b JOIN bill_lines l ON l.bill_id=b.id WHERE b.day >= ?1 AND b.day <= ?2 AND b.status != 'cancelled'{clause}
             GROUP BY 1,2,3,4 ORDER BY 1 DESC,2,3,4"
        ),
        args.clone(),
    )?;
    args.truncate(args.len());
    let returns = hsn_facts(
        conn,
        &format!(
            "SELECT CASE WHEN b.cust_gstin != '' THEN 1 ELSE 0 END, l.hsn, l.unit, l.gst_rate, SUM(l.qty), SUM(l.taxable), SUM(l.cgst), SUM(l.sgst), SUM(l.igst), SUM(l.cess), SUM(l.amount)
             FROM credit_notes n JOIN credit_note_lines l ON l.cn_id=n.id JOIN bills b ON b.id=n.bill_id WHERE n.day >= ?1 AND n.day <= ?2{clause}
             GROUP BY 1,2,3,4 ORDER BY 1 DESC,2,3,4"
        ),
        args,
    )?;
    Ok((sales, returns))
}

/// All the facts for one month (`month` = "2026-11").
pub fn gstr_facts(conn: &Connection, month: &str) -> Result<Value> {
    let (from, to, fp) = month_range(month)?;
    let raw_numbers = crate::crm::get_settings_bundle(conn)?["billFormat"]["numberFormat"].as_str() == Some("raw");
    let s = db::load_settings(conn)?;
    let state = crate::gst::shop_state_code(conn);

    // bills (cancelled ones too: they count in the document summary, never in the supplies)
    let mut bills: Vec<Value> = vec![];
    {
        let mut st = conn.prepare(
            "SELECT b.id,b.number,b.fy,b.seq,b.at,b.day,b.status,b.grand,b.place_of_supply,b.supply_type,b.cust_gstin,b.customer_name FROM bills b
             WHERE b.day >= ?1 AND b.day <= ?2 ORDER BY b.id",
        )?;
        let rows = st
            .query_map([&from, &to], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?,
                    r.get::<_, i64>(7)?, r.get::<_, String>(8)?, r.get::<_, String>(9)?, r.get::<_, String>(10)?, r.get::<_, String>(11)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (id, number, fy, seq, at, day, status, grand, place, supply, gstin, name) in rows {
            let slabs = if status == "cancelled" { vec![] } else { slabs_of(conn, "SELECT rate,taxable,cgst,sgst,igst,cess FROM bill_slabs WHERE bill_id=?1 ORDER BY rate", id)? };
            bills.push(json!({
                "number": number, "shown": crate::printing::print_number_fmt(raw_numbers, &number), "fy": fy, "seq": seq, "at": at, "day": day, "status": status, "grand": grand,
                "place": place, "inter": supply == "inter", "gstin": gstin, "name": name, "slabs": slabs,
            }));
        }
    }
    // credit notes dated in the month, with the invoice they are against
    let mut notes: Vec<Value> = vec![];
    {
        let mut st = conn.prepare(
            "SELECT n.id,n.number,n.fy,n.seq,n.at,n.day,n.grand,n.place_of_supply,n.supply_type,b.cust_gstin,n.customer_name,b.number,b.at,b.grand,b.supply_type
             FROM credit_notes n JOIN bills b ON b.id=n.bill_id WHERE n.day >= ?1 AND n.day <= ?2 ORDER BY n.id",
        )?;
        let rows = st
            .query_map([&from, &to], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, i64>(6)?,
                    r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, String>(9)?, r.get::<_, String>(10)?, r.get::<_, String>(11)?, r.get::<_, String>(12)?, r.get::<_, i64>(13)?, r.get::<_, String>(14)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (id, number, fy, seq, at, day, grand, place, supply, gstin, name, bill_number, bill_at, bill_grand, bill_supply) in rows {
            let slabs = {
                // a credit note keeps its slabs in totals_json (the lines hold the same figures)
                let tj: String = conn.query_row("SELECT totals_json FROM credit_notes WHERE id=?1", [id], |r| r.get(0))?;
                let v: Value = serde_json::from_str(&tj).unwrap_or(Value::Null);
                v["slabs"].as_array().cloned().unwrap_or_default().into_iter().map(|s| {
                    json!({ "rate": s["rate"].clone(), "taxable": s["taxable"].as_i64().unwrap_or(0), "cgst": s["cgst"].as_i64().unwrap_or(0), "sgst": s["sgst"].as_i64().unwrap_or(0),
                            "igst": s["igst"].as_i64().unwrap_or(0), "cess": s["cess"].as_i64().unwrap_or(0) })
                }).collect::<Vec<_>>()
            };
            notes.push(json!({
                "number": number, "shown": number, "fy": fy, "seq": seq, "at": at, "day": day, "grand": grand, "place": place, "inter": supply == "inter", "gstin": gstin, "name": name,
                "billNumber": bill_number.clone(), "billShown": crate::printing::print_number_fmt(raw_numbers, &bill_number), "billAt": bill_at, "billGrand": bill_grand,
                "billInter": bill_supply == "inter", "slabs": slabs,
            }));
        }
    }
    let (sales, returns) = hsn_rows(conn, &from, &to, None)?;

    // purchases: input tax credit, and nil or exempt inward supplies (inter / intra) for 3B table 5
    let (count, taxable, cgst, sgst, igst): (i64, i64, i64, i64, i64) = conn.query_row(
        "SELECT COUNT(*),COALESCE(SUM(taxable),0),COALESCE(SUM(cgst),0),COALESCE(SUM(sgst),0),COALESCE(SUM(igst),0) FROM purchases WHERE day >= ?1 AND day <= ?2",
        [&from, &to],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )?;
    let nil = |inter: bool| -> Result<i64> {
        let mut st = conn.prepare(
            "SELECT l.qty,l.rate,l.discount_bp FROM purchase_lines l JOIN purchases p ON p.id=l.purchase_id
             WHERE p.day >= ?1 AND p.day <= ?2 AND l.gst_rate = 0 AND p.interstate = ?3",
        )?;
        let rows = st.query_map(rusqlite::params![&from, &to, inter as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows.into_iter().map(|(q, rt, bp)| { let g = db::round_div(rt * q, 1000); g - db::round_div(g * bp, 10_000) }).sum())
    };

    Ok(json!({
        "period": { "month": month.trim(), "from": from, "to": to, "fp": fp },
        "shop": { "name": s.shop_name, "gstin": s.gstin, "address": s.address, "stateCode": state, "stateName": crate::gst::state_name(&state).unwrap_or("") },
        "bills": bills,
        "notes": notes,
        "hsn": { "sales": sales, "returns": returns },
        "purchases": { "count": count, "taxable": taxable, "cgst": cgst, "sgst": sgst, "igst": igst, "nilIntra": nil(false)?, "nilInter": nil(true)? },
        "generatedFrom": get_setting(conn, "shopName")?.unwrap_or_default(),
    }))
}
