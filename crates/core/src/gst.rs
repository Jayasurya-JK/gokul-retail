//! GST rules that are data, not code: the owner's list of allowed rates (Settings), cess and rate sanity.
//! Rates are percentages (5, 0.25) with at most two decimals; all tax maths turns them into hundredths of a percent (money::rate_bp).

use crate::db::get_setting;
use crate::error::{invalid, Result};
use rusqlite::Connection;
use serde_json::{json, Value};

/// The rates offered until the owner changes the list. Since 22 Sep 2025 ("GST 2.0") the main slabs are 0, 5, 18 and 40;
/// 0.25 and 3 are special rates, 12 and 28 stay for older bills and items (confirm with CA).
pub const DEFAULT_RATES: [f64; 8] = [0.0, 0.25, 3.0, 5.0, 12.0, 18.0, 28.0, 40.0];

/// A sensible percentage: 0 to 100 with at most two decimals.
pub fn rate_ok(r: f64) -> bool {
    r.is_finite() && (0.0..=100.0).contains(&r) && ((r * 100.0).round() - r * 100.0).abs() < 1e-6
}

fn default_label(r: f64) -> &'static str {
    match r {
        x if x == 0.0 => "Exempt / nil rated",
        x if x == 0.25 => "Special rate (rough diamonds) (confirm with CA)",
        x if x == 3.0 => "Special rate (gold, silver) (confirm with CA)",
        x if x == 5.0 => "Edible oils, ghee, pulses, oil cake",
        x if x == 12.0 => "Older rate, kept for old bills (confirm with CA)",
        x if x == 18.0 => "Standard rate",
        x if x == 28.0 => "Older rate, kept for old bills (confirm with CA)",
        x if x == 40.0 => "Demerit and luxury goods (from 22 Sep 2025) (confirm with CA)",
        _ => "",
    }
}

/// The rate list as saved in Settings (bundle.tax.rates), with any default rate that is missing added back as enabled.
/// Each entry: { rate, enabled, label }.
pub fn tax_rates(conn: &Connection) -> Vec<Value> {
    let saved: Vec<Value> = get_setting(conn, "bundle.tax")
        .ok()
        .flatten()
        .and_then(|j| serde_json::from_str::<Value>(&j).ok())
        .and_then(|v| v["rates"].as_array().cloned())
        .unwrap_or_default();
    let mut out: Vec<Value> = vec![];
    for r in saved {
        if let Some(rate) = r["rate"].as_f64().filter(|x| rate_ok(*x)) {
            if out.iter().any(|o| o["rate"].as_f64() == Some(rate)) {
                continue;
            }
            let label = r["label"].as_str().filter(|l| !l.is_empty()).unwrap_or_else(|| default_label(rate)).to_string();
            out.push(json!({ "rate": rate_json(rate), "enabled": r["enabled"].as_bool().unwrap_or(true), "label": label }));
        }
    }
    for d in DEFAULT_RATES {
        if !out.iter().any(|o| o["rate"].as_f64() == Some(d)) {
            out.push(json!({ "rate": rate_json(d), "enabled": true, "label": default_label(d) }));
        }
    }
    out.sort_by(|a, b| a["rate"].as_f64().partial_cmp(&b["rate"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// The rates an item, bill line or purchase may carry: the enabled ones in the owner's list.
pub fn allowed_rates(conn: &Connection) -> Vec<f64> {
    tax_rates(conn).iter().filter(|r| r["enabled"].as_bool().unwrap_or(true)).filter_map(|r| r["rate"].as_f64()).collect()
}

fn show(r: f64) -> String {
    if r.fract() == 0.0 { format!("{}", r as i64) } else { format!("{r}") }
}

pub fn rates_text(rates: &[f64]) -> String {
    rates.iter().map(|r| format!("{}%", show(*r))).collect::<Vec<_>>().join(", ")
}

/// Refuses a rate that is not in the allowed list.
pub fn check_rate(conn: &Connection, rate: f64, what: &str) -> Result<()> {
    let allowed = allowed_rates(conn);
    if allowed.iter().any(|a| (*a - rate).abs() < 1e-9) {
        return Ok(());
    }
    invalid(format!("{what} {}% is not in the GST rate list. Allowed: {}. The owner can change the list in Settings, Tax.", show(rate), rates_text(&allowed)))
}

/// Cess percent: 0 to 100, two decimals at most.
pub fn check_cess(cess: f64, what: &str) -> Result<()> {
    if rate_ok(cess) {
        return Ok(());
    }
    invalid(format!("{what}: cess must be a percentage between 0 and 100, for example 12 or 0.5."))
}

/// Validates the rate list sent from Settings (bundle.tax.rates) and returns it cleaned. At least one rate stays enabled.
pub fn clean_rate_list(list: &Value) -> Result<Vec<Value>> {
    let Some(arr) = list.as_array() else { return Ok(vec![]) };
    let mut out: Vec<Value> = vec![];
    for r in arr {
        let Some(rate) = r["rate"].as_f64() else { return invalid("A GST rate in the list is not a number.") };
        if !rate_ok(rate) {
            return invalid(format!("GST rate {rate} is not valid. Use a percentage from 0 to 100 with at most two decimals."));
        }
        if out.iter().any(|o| o["rate"].as_f64() == Some(rate)) {
            return invalid(format!("GST rate {}% is listed twice.", show(rate)));
        }
        out.push(json!({ "rate": rate_json(rate), "enabled": r["enabled"].as_bool().unwrap_or(true), "label": r["label"].as_str().unwrap_or("").trim() }));
    }
    if !out.is_empty() && !out.iter().any(|o| o["enabled"].as_bool() == Some(true)) {
        return invalid("Keep at least one GST rate switched on.");
    }
    Ok(out)
}

/// A rate as a JSON number: whole rates as integers (5), others as decimals (0.25).
pub fn rate_json(r: f64) -> Value {
    if r.fract() == 0.0 { json!(r as i64) } else { json!(r) }
}

// ---------- states and GSTIN ----------

/// GST state and union-territory codes (the first two characters of a GSTIN). 25 and 28 are the old Daman and Diu / Andhra Pradesh
/// codes that older GSTINs still carry (confirm with CA).
pub const STATES: &[(&str, &str)] = &[
    ("01", "Jammu and Kashmir"), ("02", "Himachal Pradesh"), ("03", "Punjab"), ("04", "Chandigarh"), ("05", "Uttarakhand"),
    ("06", "Haryana"), ("07", "Delhi"), ("08", "Rajasthan"), ("09", "Uttar Pradesh"), ("10", "Bihar"), ("11", "Sikkim"),
    ("12", "Arunachal Pradesh"), ("13", "Nagaland"), ("14", "Manipur"), ("15", "Mizoram"), ("16", "Tripura"), ("17", "Meghalaya"),
    ("18", "Assam"), ("19", "West Bengal"), ("20", "Jharkhand"), ("21", "Odisha"), ("22", "Chhattisgarh"), ("23", "Madhya Pradesh"),
    ("24", "Gujarat"), ("25", "Daman and Diu (old code)"), ("26", "Dadra and Nagar Haveli and Daman and Diu"), ("27", "Maharashtra"),
    ("28", "Andhra Pradesh (old code)"), ("29", "Karnataka"), ("30", "Goa"), ("31", "Lakshadweep"), ("32", "Kerala"), ("33", "Tamil Nadu"),
    ("34", "Puducherry"), ("35", "Andaman and Nicobar Islands"), ("36", "Telangana"), ("37", "Andhra Pradesh"), ("38", "Ladakh"),
    ("97", "Other Territory"), ("99", "Centre Jurisdiction"),
];

pub fn state_name(code: &str) -> Option<&'static str> {
    STATES.iter().find(|(c, _)| *c == code).map(|(_, n)| *n)
}

/// "Tamil Nadu" (any case, "&" for "and") to "33".
pub fn state_code_for_name(name: &str) -> Option<&'static str> {
    let norm = |s: &str| s.trim().to_lowercase().replace('&', "and");
    let want = norm(name);
    if want.is_empty() {
        return None;
    }
    STATES.iter().find(|(_, n)| norm(n) == want).map(|(c, _)| *c)
}

pub fn states_json() -> Value {
    json!(STATES.iter().map(|(c, n)| json!({ "code": c, "name": n })).collect::<Vec<_>>())
}

const GSTIN_CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// The 15th character of a GSTIN, from the first 14 (the GSTN check-digit algorithm: base-36 values, weights 1 and 2 alternating,
/// each product split as quotient + remainder by 36, sum, then 36 minus the remainder of the sum by 36).
pub fn gstin_check_char(first14: &str) -> Option<char> {
    let mut sum: usize = 0;
    for (i, c) in first14.chars().enumerate() {
        let v = GSTIN_CHARS.iter().position(|x| *x as char == c)?;
        let p = v * if i % 2 == 0 { 1 } else { 2 };
        sum += p / 36 + p % 36;
    }
    Some(GSTIN_CHARS[(36 - sum % 36) % 36] as char)
}

/// What is wrong with this GSTIN, in words a shop owner can act on; None when it is valid.
/// Checks: 15 characters in the GSTN pattern, a real state code, the check character, and (optionally) that the state matches.
pub fn gstin_problem(g: &str, expect_state: Option<&str>) -> Option<String> {
    let g = g.trim().to_uppercase();
    let c: Vec<char> = g.chars().collect();
    if c.len() != 15 {
        return Some(format!("A GSTIN has 15 letters and digits; this has {}. Example: 27AAPFU0939F1ZV.", c.len()));
    }
    let pattern = c[..2].iter().all(|x| x.is_ascii_digit())
        && c[2..7].iter().all(|x| x.is_ascii_uppercase())
        && c[7..11].iter().all(|x| x.is_ascii_digit())
        && c[11].is_ascii_uppercase()
        && ((c[12].is_ascii_digit() && c[12] != '0') || c[12].is_ascii_uppercase())
        && c[13] == 'Z'
        && (c[14].is_ascii_digit() || c[14].is_ascii_uppercase());
    if !pattern {
        return Some("This is not in the GSTIN pattern: 2 digits (state), 5 letters, 4 digits, 1 letter, 1 letter or digit, the letter Z, then a check character. Example: 27AAPFU0939F1ZV.".into());
    }
    let state: String = c[..2].iter().collect();
    if state_name(&state).is_none() {
        return Some(format!("{state} is not a GST state code."));
    }
    let first14: String = c[..14].iter().collect();
    match gstin_check_char(&first14) {
        Some(ch) if ch == c[14] => {}
        Some(ch) => return Some(format!("The last character does not match the others (it should be {ch}). Check the number against the registration certificate.")),
        None => return Some("This is not in the GSTIN pattern.".into()),
    }
    if let Some(want) = expect_state.filter(|s| !s.is_empty()) {
        if want != state {
            return Some(format!(
                "The GSTIN starts with {state} ({}) but the state is {want} ({}).",
                state_name(&state).unwrap_or(""),
                state_name(want).unwrap_or("")
            ));
        }
    }
    None
}

pub fn is_valid_gstin(g: &str) -> bool {
    gstin_problem(g, None).is_none()
}

/// The shop's own state code: the Settings choice, else the GSTIN prefix, else the state name, else 33 (Tamil Nadu).
pub fn shop_state_code(conn: &Connection) -> String {
    if let Some(c) = get_setting(conn, "shopStateCode").ok().flatten().filter(|c| state_name(c).is_some()) {
        return c;
    }
    let g = get_setting(conn, "gstin").ok().flatten().unwrap_or_default();
    if g.len() >= 2 && state_name(&g[..2]).is_some() {
        return g[..2].to_string();
    }
    let shop_state = get_setting(conn, "bundle.shop")
        .ok()
        .flatten()
        .and_then(|j| serde_json::from_str::<Value>(&j).ok())
        .and_then(|v| v["state"].as_str().map(String::from))
        .unwrap_or_default();
    state_code_for_name(&shop_state).unwrap_or("33").to_string()
}

/// Where a supply is made and what kind it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Supply {
    /// GST state code of the place of supply
    pub place: String,
    pub inter: bool,
    /// Recipient GSTIN (empty for a consumer)
    pub gstin: String,
    pub address: String,
}

/// Place of supply for a bill. `override_state` (a state code the cashier chose) wins; otherwise the customer's state (their
/// GSTIN prefix when registered, else the state saved on the customer); a walk-in or a customer with no state is local.
pub fn supply_for(conn: &Connection, customer_id: Option<&str>, override_state: &str) -> Result<Supply> {
    use rusqlite::OptionalExtension;
    let shop = shop_state_code(conn);
    let (mut gstin, mut state, mut address) = (String::new(), String::new(), String::new());
    if let Some(id) = customer_id {
        if let Some((g, s, a)) = conn
            .query_row("SELECT gstin,state_code,address FROM customers WHERE id=?1", [id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .optional()?
        {
            gstin = g.trim().to_uppercase();
            state = s;
            address = a;
        }
    }
    if !gstin.is_empty() && !is_valid_gstin(&gstin) {
        gstin.clear(); // a placeholder such as "NONE" is not a GSTIN: this is a consumer bill
    }
    if state.is_empty() && !gstin.is_empty() {
        state = gstin[..2].to_string();
    }
    let ov = override_state.trim();
    if !ov.is_empty() {
        if state_name(ov).is_none() {
            return invalid("Choose a valid state for the place of supply.");
        }
        state = ov.to_string();
    }
    let place = if state.is_empty() { shop.clone() } else { state };
    Ok(Supply { inter: place != shop, place, gstin, address })
}

// ---------- migration 19 backfill ----------

/// Runs once, inside migration 19, on the rows written before IGST and per-line tax columns existed: every old bill and credit note
/// was intra-state in the shop's own state; each line gets its HSN and its tax split worked out again from the saved line amounts with
/// the same engine that wrote the bill (so the lines add up to the saved GST slabs, to the paisa).
pub fn backfill_line_taxes(conn: &Connection) -> Result<()> {
    use crate::money::{compute_bill, Delivery};
    use crate::types::BillLine;
    let shop = shop_state_code(conn);
    conn.execute("UPDATE bills SET place_of_supply=?1, supply_type='intra' WHERE place_of_supply=''", [&shop])?;
    conn.execute("UPDATE credit_notes SET place_of_supply=?1, supply_type='intra' WHERE place_of_supply=''", [&shop])?;
    conn.execute("UPDATE bill_lines SET hsn=COALESCE((SELECT i.hsn FROM items i WHERE i.id=bill_lines.item_id),'') WHERE hsn=''", [])?;
    conn.execute("UPDATE credit_note_lines SET hsn=COALESCE((SELECT i.hsn FROM items i WHERE i.id=credit_note_lines.item_id),'') WHERE hsn=''", [])?;
    // The GSTIN and address the customer has now are the best record of what the old invoices carried (only a real GSTIN counts).
    {
        let mut st = conn.prepare("SELECT id,gstin,address FROM customers WHERE gstin != '' OR address != ''")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        for (id, g, a) in rows {
            let g = g.trim().to_uppercase();
            let g = if is_valid_gstin(&g) { g } else { String::new() };
            conn.execute("UPDATE bills SET cust_gstin=?1, cust_address=?2 WHERE customer_id=?3", rusqlite::params![g, a.trim(), id])?;
        }
    }
    let load_lines = |sql: &str, id: i64| -> Result<Vec<(i64, BillLine)>> {
        let mut st = conn.prepare(sql)?;
        let v = st
            .query_map([id], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    BillLine {
                        item_id: r.get(1)?,
                        qty: r.get(2)?,
                        rate: r.get(3)?,
                        discount: r.get(4)?,
                        gst_rate: r.get(5)?,
                        cess_rate: r.get(6)?,
                        amount: r.get(7)?,
                        ..Default::default()
                    },
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(v)
    };
    // bills
    let bills: Vec<(i64, i64)> = {
        let mut st = conn.prepare("SELECT id,bill_discount FROM bills")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let mut upd = conn.prepare("UPDATE bill_lines SET taxable=?1,cgst=?2,sgst=?3,igst=?4,cess=?5 WHERE bill_id=?6 AND line_no=?7")?;
    for (id, bd) in bills {
        let all = load_lines("SELECT line_no,item_id,qty,rate,discount,gst_rate,cess_rate,amount FROM bill_lines WHERE bill_id=?1 ORDER BY line_no", id)?;
        if all.is_empty() {
            continue;
        }
        let (mut items, mut delivery): (Vec<(i64, BillLine)>, Option<(i64, BillLine)>) = (all, None);
        if items.last().map(|(_, l)| l.item_id == crate::bills::DELIVERY_ITEM).unwrap_or(false) {
            delivery = items.pop();
        }
        let lines: Vec<BillLine> = items.iter().map(|(_, l)| l.clone()).collect();
        let d = delivery.as_ref().map(|(_, l)| Delivery { amount: l.amount, gst_rate: l.gst_rate, cess_rate: 0.0 });
        let (_, taxes) = compute_bill(&lines, bd, false, false, d);
        let numbers: Vec<i64> = items.iter().map(|(n, _)| *n).chain(delivery.iter().map(|(n, _)| *n)).collect();
        for (n, t) in numbers.iter().zip(taxes.iter()) {
            upd.execute(rusqlite::params![t.taxable, t.cgst, t.sgst, t.igst, t.cess, id, n])?;
        }
    }
    // credit notes
    let notes: Vec<(i64, String)> = {
        let mut st = conn.prepare("SELECT id,totals_json FROM credit_notes")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let mut upd = conn.prepare("UPDATE credit_note_lines SET taxable=?1,cgst=?2,sgst=?3,igst=?4,cess=?5 WHERE cn_id=?6 AND line_no=?7")?;
    for (id, totals_json) in notes {
        let all = load_lines("SELECT line_no,item_id,qty,rate,discount,gst_rate,cess_rate,amount FROM credit_note_lines WHERE cn_id=?1 ORDER BY line_no", id)?;
        if all.is_empty() {
            continue;
        }
        let total_discount = serde_json::from_str::<Value>(&totals_json).ok().and_then(|v| v["discount"].as_i64()).unwrap_or(0);
        let line_discount: i64 = all.iter().map(|(_, l)| l.discount).sum();
        let lines: Vec<BillLine> = all.iter().map(|(_, l)| l.clone()).collect();
        let (_, taxes) = compute_bill(&lines, (total_discount - line_discount).max(0), false, false, None);
        for ((n, _), t) in all.iter().zip(taxes.iter()) {
            upd.execute(rusqlite::params![t.taxable, t.cgst, t.sgst, t.igst, t.cess, id, n])?;
        }
    }
    Ok(())
}

/// Set-off of input tax credit against output tax (GST law, section 49): IGST credit goes against IGST, then CGST, then SGST;
/// CGST credit against CGST, then IGST; SGST credit against SGST, then IGST. CGST credit never pays SGST and the reverse.
/// Arguments and result are (IGST, CGST, SGST) in paise; the result is the cash still payable. A negative output counts as nil.
/// Rules such as the 99% restriction in Rule 86B are not modelled (confirm with CA).
pub fn set_off(out: (i64, i64, i64), itc: (i64, i64, i64)) -> (i64, i64, i64) {
    let (mut oi, mut oc, mut os) = (out.0.max(0), out.1.max(0), out.2.max(0));
    let (mut ci, mut cc, mut cs) = (itc.0.max(0), itc.1.max(0), itc.2.max(0));
    let mut take = |credit: &mut i64, owed: &mut i64| {
        let t = (*credit).min(*owed);
        *credit -= t;
        *owed -= t;
    };
    take(&mut ci, &mut oi);
    take(&mut ci, &mut oc);
    take(&mut ci, &mut os);
    take(&mut cc, &mut oc);
    take(&mut cc, &mut oi);
    take(&mut cs, &mut os);
    take(&mut cs, &mut oi);
    (oi, oc, os)
}
