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
