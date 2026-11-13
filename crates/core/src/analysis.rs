//! Mill analysis: yield against the norm per seed / machine / operator, oil and cake value, cost per litre (last purchase price),
//! godown settling ageing, seed days of cover and low-yield batches. One call, all maths here; the screen only draws it.
//!
//! Plain kg and litres (f64) like `pressing_metrics`; money in whole paise.

use crate::error::{invalid, Result};
use crate::purchasing::{find_item_by_name, seed_base};
use chrono::{DateTime, Local, NaiveDate};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisQuery {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub seed: Option<String>,
    /// A batch is "low" when its oil is this many percent below the norm (default 5).
    #[serde(default)]
    pub threshold_pct: Option<f64>,
}

struct B {
    id: i64,
    number: String,
    day: String,
    seed: String,
    machine: String,
    operator: String,
    seed_kg: f64,
    net_kg: f64,
    oil_l: f64,
    cake_kg: f64,
    expected_l: f64,
    cost: i64,
    cost_estimated: bool,
    cake_value: i64,
    oil_value: i64,
}

#[derive(Default, Clone)]
struct Agg {
    batches: i64,
    seed_kg: f64,
    net_kg: f64,
    oil_l: f64,
    cake_kg: f64,
    expected_l: f64,
    low: i64,
    cost: i64,
    estimated: bool,
    cake_value: i64,
    oil_value: i64,
}

impl Agg {
    fn add(&mut self, b: &B, low: bool) {
        self.batches += 1;
        self.seed_kg += b.seed_kg;
        self.net_kg += b.net_kg;
        self.oil_l += b.oil_l;
        self.cake_kg += b.cake_kg;
        self.expected_l += b.expected_l;
        self.cost += b.cost;
        self.estimated |= b.cost_estimated;
        self.cake_value += b.cake_value;
        self.oil_value += b.oil_value;
        if low {
            self.low += 1;
        }
    }

    fn json(&self, key: &str, label: &str) -> Map<String, Value> {
        let per100 = if self.net_kg > 0.0 { self.oil_l / self.net_kg * 100.0 } else { 0.0 };
        let norm100 = if self.net_kg > 0.0 { self.expected_l / self.net_kg * 100.0 } else { 0.0 };
        let variance = if self.expected_l > 0.0 { (self.oil_l - self.expected_l) / self.expected_l * 100.0 } else { 0.0 };
        let known = self.cost > 0 && self.oil_l > 0.0;
        let mut m = Map::new();
        m.insert("key".into(), json!(key));
        m.insert("label".into(), json!(label));
        m.insert("batches".into(), json!(self.batches));
        m.insert("seedKg".into(), json!(self.seed_kg));
        m.insert("cleanSeedKg".into(), json!(self.net_kg));
        m.insert("oilL".into(), json!(self.oil_l));
        m.insert("cakeKg".into(), json!(self.cake_kg));
        m.insert("litresPer100Kg".into(), json!(per100));
        m.insert("normPer100Kg".into(), json!(norm100));
        m.insert("variancePct".into(), json!(variance));
        m.insert("lowBatches".into(), json!(self.low));
        m.insert("oilValue".into(), json!(self.oil_value));
        m.insert("cakeValue".into(), json!(self.cake_value));
        m.insert("costPerL".into(), if known { json!((self.cost as f64 / self.oil_l).round() as i64) } else { Value::Null });
        m.insert(
            "netCostPerL".into(),
            if known { json!(((self.cost - self.cake_value) as f64 / self.oil_l).round() as i64) } else { Value::Null },
        );
        m.insert("costEstimated".into(), json!(known && self.estimated));
        m
    }
}

fn day_ok(d: &str) -> Result<()> {
    NaiveDate::parse_from_str(d, "%Y-%m-%d").map(|_| ()).or_else(|_| invalid("The date looks wrong."))
}

fn price_of(conn: &Connection, id: Option<String>) -> i64 {
    id.and_then(|i| conn.query_row("SELECT price FROM items WHERE id=?1", [i], |r| r.get::<_, i64>(0)).ok()).unwrap_or(0)
}

fn machine_label(m: &str) -> &'static str {
    if m == "R" {
        "R (rotary)"
    } else {
        "W (wood chekku)"
    }
}

pub fn get_mill_analysis(conn: &Connection, q: &AnalysisQuery) -> Result<Value> {
    day_ok(&q.from)?;
    day_ok(&q.to)?;
    if q.from > q.to {
        return invalid("The start date is after the end date.");
    }
    let threshold = q.threshold_pct.unwrap_or(5.0).clamp(0.0, 50.0);
    let seed_filter = q.seed.clone().filter(|s| !s.is_empty() && s != "all");
    if let Some(s) = &seed_filter {
        if seed_base(s).is_none() {
            return invalid("Unknown seed.");
        }
    }

    // current prices (oil per litre, cake per kg, seed cost for batches pressed before the stamp existed)
    let mut oil_price: BTreeMap<String, i64> = BTreeMap::new();
    let mut seed_cost_now: BTreeMap<String, i64> = BTreeMap::new();
    let mut cake_price: BTreeMap<(String, String), i64> = BTreeMap::new();
    for seed in ["groundnut", "sesame", "copra"] {
        let base = seed_base(seed).expect("seed");
        oil_price.insert(seed.into(), price_of(conn, find_item_by_name(conn, &format!("{} (Loose)", base.oil_name))?));
        seed_cost_now.insert(seed.into(), conn.query_row("SELECT cost FROM items WHERE id=?1", [base.rm], |r| r.get(0)).unwrap_or(0));
        for m in ["W", "R"] {
            let id = crate::mill::item_id_for(conn, crate::mill::punnaku_key(seed, m))?;
            cake_price.insert((seed.into(), m.into()), price_of(conn, id));
        }
    }

    let mut st = conn.prepare(
        "SELECT id,number,day,seed,machine,operator,seed_g,cleaning_loss_g,oil_raw_ml,cake_g,norm_kg_per_l,seed_cost_per_kg,jaggery_cost
         FROM pressing_batches WHERE day>=?1 AND day<=?2 ORDER BY day, id",
    )?;
    let rows = st
        .query_map([&q.from, &q.to], |r| {
            Ok((
                r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?,
                r.get::<_, String>(5)?, r.get::<_, i64>(6)?, r.get::<_, i64>(7)?, r.get::<_, i64>(8)?, r.get::<_, i64>(9)?,
                r.get::<_, String>(10)?, r.get::<_, Option<i64>>(11)?, r.get::<_, Option<i64>>(12)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut batches: Vec<B> = Vec::new();
    for (id, number, day, seed, machine, operator, seed_g, clean_g, oil_ml, cake_g, norm, cost_stamp, jag_cost) in rows {
        if seed_filter.as_deref().map(|s| s != seed).unwrap_or(false) {
            continue;
        }
        let net = (seed_g - clean_g) as f64 / 1000.0;
        let kg_per_l: f64 = norm.parse().unwrap_or(2.5);
        let oil_l = oil_ml as f64 / 1000.0;
        let cake_kg = cake_g as f64 / 1000.0;
        let (per_kg, estimated) = match cost_stamp {
            Some(c) => (c, false),
            None => (*seed_cost_now.get(&seed).unwrap_or(&0), true),
        };
        let cost = (per_kg as f64 * seed_g as f64 / 1000.0).round() as i64 + jag_cost.unwrap_or(0);
        let cp = *cake_price.get(&(seed.clone(), machine.clone())).unwrap_or(&0);
        batches.push(B {
            id, number, day, machine, operator, seed_kg: seed_g as f64 / 1000.0, net_kg: net, oil_l, cake_kg,
            expected_l: if kg_per_l > 0.0 { net / kg_per_l } else { 0.0 },
            cost, cost_estimated: estimated && per_kg > 0,
            cake_value: (cake_kg * cp as f64).round() as i64,
            oil_value: (oil_l * *oil_price.get(&seed).unwrap_or(&0) as f64).round() as i64,
            seed,
        });
    }
    let is_low = |b: &B| b.expected_l > 0.0 && (b.oil_l - b.expected_l) / b.expected_l * 100.0 < -threshold;

    // totals
    let mut total = Agg::default();
    for b in &batches {
        total.add(b, is_low(b));
    }
    let mut totals = total.json("all", "All batches");
    totals.insert("outputValue".into(), json!(total.oil_value + total.cake_value));
    totals.insert(
        "oilPriceKnown".into(),
        json!(oil_price.values().any(|p| *p > 0)),
    );

    // seed > machine > operator tree
    let mut seeds_out = Vec::new();
    for seed in ["groundnut", "sesame", "copra"] {
        let list: Vec<&B> = batches.iter().filter(|b| b.seed == seed).collect();
        if list.is_empty() {
            continue;
        }
        let label = seed_base(seed).map(|b| b.label).unwrap_or(seed);
        let mut sa = Agg::default();
        for b in &list {
            sa.add(b, is_low(b));
        }
        let mut row = sa.json(seed, label);
        let mut machines = Vec::new();
        for m in ["W", "R"] {
            let ml: Vec<&&B> = list.iter().filter(|b| b.machine == m).collect();
            if ml.is_empty() {
                continue;
            }
            let mut ma = Agg::default();
            let mut ops: BTreeMap<String, Agg> = BTreeMap::new();
            for b in &ml {
                ma.add(b, is_low(b));
                ops.entry(if b.operator.is_empty() { "Not recorded".into() } else { b.operator.clone() }).or_default().add(b, is_low(b));
            }
            let mut mrow = ma.json(m, machine_label(m));
            mrow.insert("children".into(), Value::Array(ops.iter().map(|(o, a)| Value::Object(a.json(o, o))).collect()));
            machines.push(Value::Object(mrow));
        }
        row.insert("children".into(), Value::Array(machines));
        seeds_out.push(Value::Object(row));
    }

    // operator x seed grid (variance only)
    let mut grid: BTreeMap<String, BTreeMap<String, Agg>> = BTreeMap::new();
    for b in &batches {
        let op = if b.operator.is_empty() { "Not recorded".to_string() } else { b.operator.clone() };
        grid.entry(op).or_default().entry(b.seed.clone()).or_default().add(b, is_low(b));
    }
    let operator_grid: Vec<Value> = grid
        .iter()
        .map(|(op, per)| {
            let seeds: Map<String, Value> = per
                .iter()
                .map(|(s, a)| (s.clone(), json!({ "batches": a.batches, "variancePct": if a.expected_l > 0.0 { (a.oil_l - a.expected_l) / a.expected_l * 100.0 } else { 0.0 } })))
                .collect();
            json!({ "operator": op, "seeds": seeds })
        })
        .collect();

    // daily trend per seed
    let mut tr: BTreeMap<(String, String), Agg> = BTreeMap::new();
    for b in &batches {
        tr.entry((b.day.clone(), b.seed.clone())).or_default().add(b, false);
    }
    let trend: Vec<Value> = tr
        .iter()
        .map(|((d, s), a)| {
            json!({ "day": d, "seed": s,
                    "litresPer100Kg": if a.net_kg > 0.0 { a.oil_l / a.net_kg * 100.0 } else { 0.0 },
                    "normPer100Kg": if a.net_kg > 0.0 { a.expected_l / a.net_kg * 100.0 } else { 0.0 } })
        })
        .collect();

    // low batches, worst first, each with a pattern reason
    let low: Vec<&B> = batches.iter().filter(|b| is_low(b)).collect();
    let mut low_out: Vec<(f64, Value)> = low
        .iter()
        .map(|b| {
            let var = (b.oil_l - b.expected_l) / b.expected_l * 100.0;
            let by_op = low.iter().filter(|x| x.operator == b.operator).count();
            let by_m = low.iter().filter(|x| x.machine == b.machine && x.seed == b.seed).count();
            let reason = if !b.operator.is_empty() && by_op >= 2 {
                format!("{by_op} low batches by {} in this period", b.operator)
            } else if by_m >= 2 {
                format!("{by_m} low {} batches on machine {}", seed_base(&b.seed).map(|s| s.label).unwrap_or(""), b.machine)
            } else {
                String::new()
            };
            (var, json!({ "id": format!("pb{}", b.id), "number": b.number, "day": b.day, "seed": b.seed, "machine": b.machine,
                          "operator": b.operator, "variancePct": var, "oilL": b.oil_l, "expectedL": b.expected_l, "reason": reason }))
        })
        .collect();
    low_out.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    // godown and settling ageing
    let now: DateTime<Local> = Local::now();
    let mut godown_out = Vec::new();
    for g in crate::godown::list_godown_barrels(conn)? {
        if g["active"] == json!(false) {
            continue;
        }
        let parse = |k: &str| g[k].as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|d| d.with_timezone(&Local));
        let settle_days = g["settleDays"].as_i64().unwrap_or(0);
        let days_settling = parse("settleStartedOn").map(|t| (now - t).num_days().max(0));
        let waiting = match (g["status"].as_str(), parse("readyOn")) {
            (Some("ready"), Some(r)) => Some((now - r).num_days().max(0)),
            _ => None,
        };
        let filling_days = match (g["status"].as_str(), parse("filledOn")) {
            (Some("filling"), Some(f)) => Some((now - f).num_days().max(0)),
            _ => None,
        };
        let (var_l, var_pct) = match g["lastReading"].as_object() {
            Some(r) => {
                let v = r["varianceL"].as_i64().unwrap_or(0) as f64;
                let s = r["systemL"].as_i64().unwrap_or(0) as f64;
                (Some(v / 1000.0), if s > 0.0 { Some(v / s * 100.0) } else { None })
            }
            None => (None, None),
        };
        godown_out.push(json!({
            "id": g["id"], "label": g["label"], "oil": g["oil"], "oilName": g["oilName"], "status": g["status"],
            "levelL": g["levelL"].as_f64().unwrap_or_else(|| g["levelL"].as_i64().unwrap_or(0) as f64) / 1000.0,
            "capacityL": g["capacityL"].as_i64().unwrap_or(0) as f64 / 1000.0,
            "settleDays": settle_days, "daysSettling": days_settling, "readyWaitingDays": waiting, "fillingDays": filling_days,
            "stickVarianceL": var_l, "stickVariancePct": var_pct,
            "flag": if waiting.map(|w| w >= 3).unwrap_or(false) { "ready-waiting" }
                    else if var_pct.map(|p| p.abs() > 0.5).unwrap_or(false) { "stick-variance" } else { "" },
        }));
    }

    // seed stock and days of cover (average over the last 14 pressing days of that seed)
    let mut cover = Vec::new();
    for seed in ["groundnut", "sesame", "copra"] {
        if seed_filter.as_deref().map(|s| s != seed).unwrap_or(false) {
            continue;
        }
        let base = seed_base(seed).expect("seed");
        let stock_milli: i64 = conn.query_row("SELECT stock FROM items WHERE id=?1", [base.rm], |r| r.get(0)).unwrap_or(0);
        let mut s2 = conn.prepare("SELECT SUM(seed_g) FROM pressing_batches WHERE seed=?1 GROUP BY day ORDER BY day DESC LIMIT 14")?;
        let days = s2.query_map([seed], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let avg = if days.is_empty() { 0.0 } else { days.iter().sum::<i64>() as f64 / days.len() as f64 / 1000.0 };
        let stock_kg = stock_milli as f64 / 1000.0;
        let cover_days = if avg > 0.0 { Some(stock_kg / avg) } else { None };
        cover.push(json!({
            "seed": seed, "label": base.label, "stockKg": stock_kg, "avgKgPerPressingDay": avg, "pressingDays": days.len(),
            "daysOfCover": cover_days, "low": cover_days.map(|d| d < 5.0).unwrap_or(false),
        }));
    }

    Ok(json!({
        "from": q.from, "to": q.to, "seed": seed_filter, "thresholdPct": threshold,
        "totals": Value::Object(totals), "seeds": seeds_out, "operatorGrid": operator_grid, "trend": trend,
        "godown": godown_out, "seedCover": cover, "lowBatches": low_out.into_iter().map(|x| x.1).collect::<Vec<_>>(),
        "costBasis": "last purchase price",
    }))
}
