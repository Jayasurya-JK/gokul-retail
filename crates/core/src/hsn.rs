//! The HSN helper: suggests an HSN code (and a GST rate to verify) for items from their names, applies owner-confirmed codes in bulk,
//! and previews a file of codes the owner collected (Excel or CSV, read by the screen) before anything is written.
//!
//! Nothing here applies a suggestion by itself. `suggest_hsn` and `preview_hsn_import` only read; `apply_hsn` writes exactly the rows
//! the owner confirmed. Every suggested GST rate is a hint to verify with the CA.
//!
//! The keyword dictionary is `packages/data/src/hsn/dictionary.json`, shared with the TypeScript mock (same matching rules, same
//! shared test cases in `packages/data/src/hsn/match_cases.json`).

use crate::db::{audit, iso};
use crate::error::{invalid, Result};
use chrono::Local;
use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const DICTIONARY: &str = include_str!("../../../packages/data/src/hsn/dictionary.json");

#[derive(Debug, Clone, Deserialize)]
struct Entry {
    id: String,
    hsn: String,
    desc: String,
    keywords: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
    #[serde(default)]
    rate: Option<f64>,
    /// Rate for pre-packed, labelled goods when it differs from the loose `rate` (rice, flours, pulses, jaggery, cereals)
    #[serde(default, rename = "ratePacked")]
    rate_packed: Option<f64>,
    #[serde(default, rename = "rateNote")]
    rate_note: String,
    base: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    alt: Vec<Alt>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct Alt {
    pub hsn: String,
    pub desc: String,
}

#[derive(Deserialize)]
struct Dict {
    entries: Vec<Entry>,
}

fn entries() -> &'static Vec<Entry> {
    static D: OnceLock<Vec<Entry>> = OnceLock::new();
    D.get_or_init(|| serde_json::from_str::<Dict>(DICTIONARY).expect("hsn dictionary").entries)
}

/// Lower case, every run of non-letters and non-digits becomes one space.
pub fn normalize(s: &str) -> String {
    let mut out = String::new();
    let mut gap = true;
    for ch in s.chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            gap = false;
        } else if !gap {
            out.push(' ');
            gap = true;
        }
    }
    out.trim().to_string()
}

fn tokens(s: &str) -> Vec<String> {
    normalize(s).split(' ').filter(|t| !t.is_empty()).map(String::from).collect()
}

/// Whole-word match: the keyword's words appear one after another in the name.
fn contains_run(name: &[String], kw: &[String]) -> bool {
    !kw.is_empty() && name.len() >= kw.len() && name.windows(kw.len()).any(|w| w == kw)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub hsn: String,
    pub desc: String,
    /// "high", "medium" or "low"
    pub confidence: String,
    /// Suggested GST rate to verify with the CA (None = no rate suggested)
    pub rate: Option<f64>,
    pub rate_note: String,
    /// The words of the name that matched
    pub matched: String,
    pub alternatives: Vec<Alt>,
}

fn down(c: &str) -> &'static str {
    match c {
        "high" => "medium",
        _ => "low",
    }
}

const PACK_UNITS: [&str; 14] = ["kg", "g", "gm", "gms", "gram", "grams", "l", "ltr", "litre", "litres", "ml", "pc", "pcs", "pkt"];

/// True when the name carries a pack size such as "1 kg", "500 g" or "5kg".
fn has_pack_size(nt: &[String]) -> bool {
    let digits = |t: &str| !t.is_empty() && t.chars().all(|c| c.is_ascii_digit());
    nt.iter().enumerate().any(|(i, t)| {
        let glued = PACK_UNITS.iter().any(|u| t.strip_suffix(u).map_or(false, digits));
        glued || (digits(t) && nt.get(i + 1).map_or(false, |n| PACK_UNITS.contains(&n.as_str())))
    })
}

/// What the item itself says about how it is sold (rice, flours, pulses, jaggery and cereals are taxed differently loose and pre-packed).
#[derive(Debug, Clone, Copy, Default)]
pub struct ItemHint {
    /// The item is sold loose (the loose flag, or "(Loose)" in the name)
    pub loose: bool,
    /// The item has a pack size or a brand (besides what the name itself shows)
    pub packed: bool,
}

/// The best HSN for an item name (the category is not used for matching, only the words of the name are).
pub fn suggest(name: &str) -> Option<Suggestion> {
    suggest_with(name, ItemHint::default())
}

/// Like `suggest`, with what the item record says. Loose (flag or "(Loose)" in the name) gets the loose rate; a pack size in the name
/// or on the item, or a brand, gets the pre-packed rate where the dictionary has one; otherwise the loose rate stays.
pub fn suggest_with(name: &str, hint: ItemHint) -> Option<Suggestion> {
    let nt = tokens(name);
    if nt.is_empty() {
        return None;
    }
    // (score, entry, matched keyword)
    let mut hits: Vec<(i64, &Entry, String)> = vec![];
    for e in entries() {
        if e.exclude.iter().any(|x| contains_run(&nt, &tokens(x))) {
            continue;
        }
        let best = e
            .keywords
            .iter()
            .filter_map(|k| {
                let kt = tokens(k);
                if contains_run(&nt, &kt) {
                    Some((kt.len() as i64 * 100 + normalize(k).len() as i64, normalize(k)))
                } else {
                    None
                }
            })
            .max();
        if let Some((score, kw)) = best {
            hits.push((score, e, kw));
        }
    }
    // a bottle, tin or can is only the pack: it never wins over the goods inside
    if hits.iter().any(|h| h.1.kind != "pack") {
        hits.retain(|h| h.1.kind != "pack");
    }
    // the generic one-word "oil" guess only when nothing better matched
    hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.id.cmp(&b.1.id)));
    let (score, e, kw) = hits.first().cloned()?;
    let mut conf = match e.base.as_str() {
        "low" => "low",
        "medium" => "medium",
        _ => {
            if kw.split(' ').count() >= 2 || kw.len() >= 4 { "high" } else { "medium" }
        }
    };
    let mut alternatives: Vec<Alt> = vec![];
    let mut ambiguous = false;
    for (s, other, _) in hits.iter().skip(1) {
        // the one-word "oil" fallback is only a last resort; it is never offered as an alternative
        if other.hsn != e.hsn && other.base != "low" {
            if !alternatives.iter().any(|a| a.hsn == other.hsn) {
                alternatives.push(Alt { hsn: other.hsn.clone(), desc: other.desc.clone() });
            }
            if (score - s) < 100 {
                ambiguous = true;
            }
        }
    }
    if ambiguous {
        conf = down(conf);
    }
    for a in &e.alt {
        if a.hsn != e.hsn && !alternatives.iter().any(|x| x.hsn == a.hsn) {
            alternatives.push(a.clone());
        }
    }
    let loose = hint.loose || nt.iter().any(|t| t == "loose");
    let packed = !loose && (hint.packed || has_pack_size(&nt));
    let rate = if packed { e.rate_packed.or(e.rate) } else { e.rate };
    Some(Suggestion { hsn: e.hsn.clone(), desc: e.desc.clone(), confidence: conf.into(), rate, rate_note: e.rate_note.clone(), matched: kw, alternatives })
}

/// A plain description for an HSN code: the dictionary's wording for the first entry with that code (or its first four digits).
pub fn desc_for(hsn: &str) -> String {
    let h = hsn.trim();
    entries().iter().find(|e| e.hsn == h).or_else(|| entries().iter().find(|e| h.len() > 4 && e.hsn == h[..4])).map(|e| e.desc.clone()).unwrap_or_default()
}

/// An HSN the invoice can carry: 4, 6 or 8 digits (4 up to Rs 5 crore turnover, 6 above, confirm with CA).
pub fn hsn_ok(h: &str) -> bool {
    let h = h.trim();
    h.chars().all(|c| c.is_ascii_digit()) && matches!(h.len(), 4 | 6 | 8)
}

// ---------------------------------------------------------------- suggestions for the items

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestOptions {
    /// Only items whose HSN is missing or not 4, 6 or 8 digits (default true)
    #[serde(default = "yes")]
    pub only_missing: bool,
    /// Include inactive items (default false)
    #[serde(default)]
    pub include_inactive: bool,
}

fn yes() -> bool {
    true
}

impl Default for SuggestOptions {
    fn default() -> Self {
        SuggestOptions { only_missing: true, include_inactive: false }
    }
}

pub fn suggest_hsn(conn: &Connection, o: &SuggestOptions) -> Result<Value> {
    let mut st = conn.prepare(
        "SELECT i.id,i.code,i.name,COALESCE(c.name,''),i.hsn,i.gst_rate,i.active,i.loose,(COALESCE(i.pack_size,'')!='' OR i.brand!='') FROM items i LEFT JOIN categories c ON c.id=i.category_id
         WHERE i.kind='item' AND substr(i.id,1,1) != '_' ORDER BY i.name COLLATE NOCASE",
    )?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, f64>(5)?, r.get::<_, i64>(6)? != 0, r.get::<_, i64>(7)? != 0, r.get::<_, i64>(8)? != 0)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut out: Vec<Value> = vec![];
    let (mut with, mut without, mut missing_total, mut agree, mut differ) = (0, 0, 0, 0, 0);
    for (id, code, name, category, hsn, rate, active, loose, packed) in rows {
        if !active && !o.include_inactive {
            continue;
        }
        let missing = !hsn_ok(&hsn);
        if missing {
            missing_total += 1;
        }
        if o.only_missing && !missing {
            continue;
        }
        let s = suggest_with(&name, ItemHint { loose, packed });
        match (&s, missing) {
            (Some(_), _) => with += 1,
            (None, _) => without += 1,
        }
        if let Some(sg) = &s {
            if !missing {
                if sg.hsn.starts_with(hsn.trim()) || hsn.trim().starts_with(&sg.hsn) { agree += 1 } else { differ += 1 }
            }
        }
        out.push(json!({ "itemId": id, "code": code, "name": name, "category": category, "hsn": hsn, "gstRate": crate::gst::rate_json(rate), "missing": missing, "suggestion": s }));
    }
    Ok(json!({ "rows": out, "stats": { "listed": out.len(), "withSuggestion": with, "withoutSuggestion": without, "missingTotal": missing_total, "agree": agree, "differ": differ } }))
}

// ---------------------------------------------------------------- applying confirmed codes

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HsnUpdate {
    pub item_id: String,
    pub hsn: String,
    /// Set the GST rate too (only when the owner ticked it); must be in the owner's rate list
    #[serde(default)]
    pub gst_rate: Option<f64>,
}

/// Writes the confirmed rows in one transaction. Every row is checked first: one bad row means nothing is written.
pub fn apply_hsn(conn: &mut Connection, updates: &[HsnUpdate]) -> Result<Value> {
    if updates.is_empty() {
        return invalid("Nothing is ticked. Tick the items to update.");
    }
    let allowed = crate::gst::allowed_rates(conn);
    for u in updates {
        if !hsn_ok(&u.hsn) {
            return invalid(format!("HSN '{}' is not valid: use 4, 6 or 8 digits, for example 1508. Nothing was changed.", u.hsn.trim()));
        }
        if let Some(r) = u.gst_rate {
            if !allowed.iter().any(|a| (*a - r).abs() < 1e-9) {
                crate::gst::check_rate(conn, r, "GST rate")?;
            }
        }
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let (mut n, mut rates) = (0, 0);
    for u in updates {
        let old: Option<(String, f64, String)> = tx
            .query_row("SELECT hsn,gst_rate,name FROM items WHERE id=?1", [&u.item_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .ok();
        let Some((old_hsn, old_rate, name)) = old else { return invalid("An item in the list no longer exists. Nothing was changed.") };
        tx.execute("UPDATE items SET hsn=?1 WHERE id=?2", params![u.hsn.trim(), u.item_id])?;
        let mut detail = format!("HSN {} -> {}", if old_hsn.is_empty() { "(none)" } else { &old_hsn }, u.hsn.trim());
        if let Some(r) = u.gst_rate {
            if (r - old_rate).abs() > 1e-9 {
                tx.execute("UPDATE items SET gst_rate=?1 WHERE id=?2", params![r, u.item_id])?;
                detail.push_str(&format!(", GST {old_rate}% -> {r}%"));
                rates += 1;
            }
        }
        audit(&tx, now, "Office", "hsn", "item", &u.item_id, &format!("{name}: {detail}"))?;
        n += 1;
    }
    tx.commit()?;
    Ok(json!({ "ok": true, "applied": n, "ratesChanged": rates, "at": iso(now) }))
}

// ---------------------------------------------------------------- import from Excel / CSV

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    /// Item code, barcode, id or name as the owner wrote it
    pub key: String,
    pub hsn: String,
    #[serde(default)]
    pub gst_rate: Option<f64>,
}

/// Matches the rows of a collected file to items and says what would change. Reads only: nothing is written until `apply_hsn`.
/// Row status: ok (will change), same (already has these values), unmatched, ambiguous (the name fits several items), invalid.
pub fn preview_hsn_import(conn: &Connection, rows: &[ImportRow]) -> Result<Value> {
    let mut st = conn.prepare(
        "SELECT i.id,i.code,i.name,i.hsn,i.gst_rate,COALESCE(b.barcode,'') FROM items i LEFT JOIN barcodes b ON b.item_id=i.id AND b.is_primary=1
         WHERE i.kind='item' AND substr(i.id,1,1) != '_'",
    )?;
    type It = (String, String, String, String, f64, String);
    let items: Vec<It> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut extra_codes: HashMap<String, String> = HashMap::new(); // other barcodes
    {
        let mut b = conn.prepare("SELECT barcode,item_id FROM barcodes")?;
        for r in b.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (code, id) = r?;
            extra_codes.insert(code, id);
        }
    }
    let by_id: HashMap<&str, &It> = items.iter().map(|i| (i.0.as_str(), i)).collect();
    let mut by_name: HashMap<String, Vec<&It>> = HashMap::new();
    for i in &items {
        by_name.entry(normalize(&i.2)).or_default().push(i);
    }
    let allowed = crate::gst::allowed_rates(conn);
    let mut out: Vec<Value> = vec![];
    let (mut ok, mut same, mut bad) = (0, 0, 0);
    for (idx, r) in rows.iter().enumerate() {
        let key = r.key.trim();
        let hsn = r.hsn.trim().replace(' ', "");
        let found: std::result::Result<&It, &str> = if key.is_empty() {
            Err("no item name or code")
        } else if let Some(i) = items.iter().find(|i| i.1 == key || i.5 == key || i.0 == key) {
            Ok(i)
        } else if let Some(i) = extra_codes.get(key).and_then(|id| by_id.get(id.as_str())) {
            Ok(*i)
        } else {
            match by_name.get(&normalize(key)) {
                Some(v) if v.len() == 1 => Ok(v[0]),
                Some(v) if v.len() > 1 => Err("ambiguous"),
                _ => Err("unmatched"),
            }
        };
        let (status, message, item) = match found {
            Err("ambiguous") => ("ambiguous", "More than one item has this name. Use the item code.".to_string(), None),
            Err("unmatched") => ("unmatched", "No item with this code or name.".to_string(), None),
            Err(m) => ("invalid", m.to_string(), None),
            Ok(i) => {
                if !hsn_ok(&hsn) {
                    ("invalid", format!("HSN '{}' is not 4, 6 or 8 digits.", r.hsn.trim()), Some(i))
                } else if r.gst_rate.map(|g| !allowed.iter().any(|a| (*a - g).abs() < 1e-9)).unwrap_or(false) {
                    ("invalid", format!("GST rate {}% is not in the GST rate list.", r.gst_rate.unwrap_or(0.0)), Some(i))
                } else if i.3.trim() == hsn && r.gst_rate.map(|g| (g - i.4).abs() < 1e-9).unwrap_or(true) {
                    ("same", "Already has these values.".to_string(), Some(i))
                } else {
                    ("ok", String::new(), Some(i))
                }
            }
        };
        match status {
            "ok" => ok += 1,
            "same" => same += 1,
            _ => bad += 1,
        }
        out.push(json!({
            "index": idx, "key": r.key, "status": status, "message": message,
            "itemId": item.map(|i| i.0.clone()), "code": item.map(|i| i.1.clone()), "name": item.map(|i| i.2.clone()),
            "currentHsn": item.map(|i| i.3.clone()), "currentRate": item.map(|i| crate::gst::rate_json(i.4)),
            "newHsn": hsn, "newRate": r.gst_rate.map(crate::gst::rate_json),
        }));
    }
    Ok(json!({ "rows": out, "stats": { "ok": ok, "same": same, "problems": bad, "total": rows.len() } }))
}
