//! Production redo: migration 014 is additive (old manual mill-sheet drafts stay readable) and new batches stamp the seed price.
mod common;
use chrono::Local;
use gokul_core::db::{iso, post_movement, Db};
use gokul_core::{godown, mill, purchasing};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn de<T: DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

const OLD: [&str; 13] = [
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_office.sql"),
    include_str!("../migrations/003_security.sql"),
    include_str!("../migrations/004_money_mill.sql"),
    include_str!("../migrations/005_loyalty_credit.sql"),
    include_str!("../migrations/006_points_hundredths.sql"),
    include_str!("../migrations/007_shelf_life.sql"),
    include_str!("../migrations/008_pos_parallel.sql"),
    include_str!("../migrations/009_points_module.sql"),
    include_str!("../migrations/010_points_lots.sql"),
    include_str!("../migrations/011_customer_active.sql"),
    include_str!("../migrations/012_exchange_refund.sql"),
    include_str!("../migrations/013_godown.sql"),
];

/// A database exactly as the owner has it today: schema 13, two manual mill-sheet drafts and one pressing batch.
fn live_like_v13(path: &std::path::Path) {
    let conn = rusqlite::Connection::open(path).unwrap();
    for sql in OLD {
        conn.execute_batch(sql).unwrap();
    }
    conn.execute_batch("PRAGMA user_version = 13").unwrap();
    for day in ["2026-11-07", "2026-11-12"] {
        conn.execute(
            "INSERT INTO mill_sheets(day,status,supervisor,note,physical_json,created_at,updated_at) VALUES(?1,'draft','Ravi','test draft','{}','2026-11-12T10:00:00Z','2026-11-12T10:00:00Z')",
            [day],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO mill_op_rows(day,operator,seed,machine,seed_g,oil_ml,cake_g,jaggery_g) VALUES(?1,'Murugesan','groundnut','W',100000,38000,60000,0)",
            [day],
        )
        .unwrap();
    }
    conn.execute(
        "INSERT INTO pressing_batches(number,series,fy,seq,at,day,seed,seed_g,oil_raw_ml,cake_g,settle_ready_on,norm_kg_per_l,norm_density,machine)
         VALUES('PB-OLD','PB','2026-27',900,'2026-11-07T10:00:00Z','2026-11-07','groundnut',50000,20000,30000,'2026-11-11T10:00:00Z','2.5','0.91','W')",
        [],
    )
    .unwrap();
}

#[test]
fn migration_14_keeps_old_manual_drafts_readable_and_changes_nothing_else() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    live_like_v13(&path);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, gokul_core::db::latest_version());
        assert!(gokul_core::db::latest_version() >= 14);
        for day in ["2026-11-07", "2026-11-12"] {
            let s = mill::get_sheet(c, day)?;
            assert_eq!(s["status"], "draft", "{day} is still a draft");
            assert_eq!(s["supervisor"], "Ravi");
            assert_eq!(s["opRows"].as_array().unwrap().len(), 1, "{day} keeps its operator row");
        }
        assert_eq!(mill::list_sheets(c, 40)?.len(), 2);
        let imported: i64 = c.query_row("SELECT COUNT(*) FROM mill_op_rows WHERE imported=0", [], |r| r.get(0))?;
        assert_eq!(imported, 2, "no row is marked as imported by the migration");
        // the old batch is untouched and has no cost stamp
        let b = purchasing::list_pressing_batches(c)?;
        assert_eq!(b.len(), 1);
        assert!(b[0]["seedCostPerKg"].is_null());
        assert_eq!(b[0]["source"], "entry");
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_new_batch_stamps_the_seed_price() {
    let (_d, db) = common::mini_db();
    db.with(|c| {
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 500_000, "test", "1", "seed", "Test")?;
        c.execute("UPDATE items SET cost=9800 WHERE id='rm-gn'", [])?;
        godown::add_godown_barrels(c, &de(json!({ "oil": "groundnut", "count": 1 })))?;
        let b = purchasing::create_pressing_batch(
            c,
            &de(json!({ "seed": "groundnut", "seedKg": 100_000, "oilRawL": 40_000, "cakeKg": 55_000, "godownBarrelId": "GB-001", "operator": "Selvam" })),
        )?;
        assert_eq!(b["seedCostPerKg"], 9800);
        assert_eq!(b["jaggeryCost"], 0);
        Ok(())
    })
    .unwrap();
}

fn press(c: &mut rusqlite::Connection, seed_kg: i64, oil_l: i64, cake: i64, op: &str, machine: &str) -> Value {
    purchasing::create_pressing_batch(
        c,
        &de(json!({ "seed": "groundnut", "seedKg": seed_kg, "oilRawL": oil_l, "cakeKg": cake, "godownBarrelId": "GB-001", "operator": op, "machine": machine })),
    )
    .unwrap()
}

#[test]
fn analysis_gives_yield_vs_norm_cost_and_flags_low_batches() {
    let (_d, db) = common::mini_db();
    db.with(|c| {
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 900_000, "test", "1", "seed", "Test")?;
        c.execute("UPDATE items SET cost=10000 WHERE id='rm-gn'", [])?; // Rs 100 per kg
        godown::add_godown_barrels(c, &de(json!({ "oil": "groundnut", "count": 1 })))?;
        // norm 2.5 kg per litre: 100 kg should give 40 L. One good batch, two low ones by Selvam on R.
        press(c, 100_000, 40_000, 55_000, "Murugesan", "W");
        press(c, 100_000, 34_000, 60_000, "Selvam", "R");
        press(c, 100_000, 32_000, 60_000, "Selvam", "R");
        let today = gokul_core::db::day_of(Local::now());
        let a = gokul_core::analysis::get_mill_analysis(c, &de(json!({ "from": today, "to": today })))?;
        let t = &a["totals"];
        assert_eq!(t["batches"], 3);
        assert!((t["oilL"].as_f64().unwrap() - 106.0).abs() < 1e-9);
        assert!((t["litresPer100Kg"].as_f64().unwrap() - 106.0 / 3.0).abs() < 1e-6);
        assert!((t["normPer100Kg"].as_f64().unwrap() - 40.0).abs() < 1e-6);
        assert_eq!(t["lowBatches"], 2);
        // cost: 300 kg at Rs 100 = Rs 30,000 over 106 L = Rs 283 per litre (28302 paise), known (stamped) so not an estimate
        assert_eq!(t["costPerL"], 28302);
        assert_eq!(t["costEstimated"], false);
        let seeds = a["seeds"].as_array().unwrap();
        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0]["children"].as_array().unwrap().len(), 2, "W and R machines");
        let low = a["lowBatches"].as_array().unwrap();
        assert_eq!(low.len(), 2);
        assert!(low[0]["variancePct"].as_f64().unwrap() < low[1]["variancePct"].as_f64().unwrap(), "worst first");
        assert!(low[0]["reason"].as_str().unwrap().contains("Selvam"));
        let cover = &a["seedCover"].as_array().unwrap()[0];
        assert_eq!(cover["stockKg"].as_f64().unwrap(), 600.0);
        assert_eq!(cover["daysOfCover"].as_f64().unwrap(), 2.0, "300 kg a pressing day, 600 kg in stock");
        assert_eq!(cover["low"], true);
        assert_eq!(a["godown"].as_array().unwrap().len(), 1);
        // a seed filter and a bad range
        let g = gokul_core::analysis::get_mill_analysis(c, &de(json!({ "from": today, "to": today, "seed": "sesame" })))?;
        assert_eq!(g["totals"]["batches"], 0);
        assert!(gokul_core::analysis::get_mill_analysis(c, &de(json!({ "from": "2026-12-02", "to": "2026-12-01" }))).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn the_pressing_grid_saves_all_rows_or_none_and_moves_old_draft_rows_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    live_like_v13(&path);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 300_000, "test", "1", "seed", "Test")?;
        c.execute("INSERT OR IGNORE INTO categories(id,name,sort) VALUES('oil','Oils',0)", [])?;
        godown::add_godown_barrels(c, &de(json!({ "oil": "groundnut", "count": 1, "capacityL": 150_000 })))?;
        let row = |kg: i64, oil: i64, op: &str| json!({ "seed": "groundnut", "seedKg": kg, "oilRawL": oil, "cakeKg": 60_000, "godownBarrelId": "GB-001", "operator": op, "machine": "W" });
        let stock = |c: &rusqlite::Connection| c.query_row::<i64, _, _>("SELECT stock FROM items WHERE id='rm-gn'", [], |r| r.get(0)).unwrap();
        let before = stock(c);
        // the second row has no operator: nothing is saved
        let bad = purchasing::create_pressing_batches(c, &de(json!({ "rows": [row(100_000, 40_000, "Selvam"), row(100_000, 40_000, "")] })));
        assert!(bad.is_err());
        assert_eq!(stock(c), before, "seed untouched");
        assert_eq!(purchasing::list_pressing_batches(c)?.len(), 1, "only the old batch exists");
        // the third row would overfill the 100 L barrel: nothing is saved either
        let over = purchasing::create_pressing_batches(c, &de(json!({ "rows": [row(100_000, 100_000, "A"), row(100_000, 60_000, "B")] })));
        assert!(over.is_err());
        let m = over.unwrap_err().to_string(); assert!(m.starts_with("Row 2"), "{m}");
        assert_eq!(stock(c), before);
        // two good rows
        let ok = purchasing::create_pressing_batches(c, &de(json!({ "rows": [row(100_000, 40_000, "Selvam"), row(100_000, 38_000, "Kannan")] })))?;
        assert_eq!(ok.as_array().unwrap().len(), 2);
        assert_eq!(stock(c), before - 200_000);
        // an old draft row moves into Production once, on its own day
        let ids: Vec<i64> = c.prepare("SELECT id FROM mill_op_rows WHERE day='2026-11-07'")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        let moved = purchasing::create_pressing_batches(c, &de(json!({ "rows": [row(100_000, 38_000, "Murugesan")], "day": "2026-11-07", "legacyRowIds": ids })))?;
        assert_eq!(moved[0]["source"], "legacy-sheet");
        assert!(moved[0]["date"].as_str().unwrap().starts_with("2026-11-07"));
        let again = purchasing::create_pressing_batches(c, &de(json!({ "rows": [row(100_000, 1_000, "Murugesan")], "legacyRowIds": ids })));
        assert!(again.unwrap_err().to_string().contains("already moved"));
        // the draft is still readable, its row now marked
        let s = mill::get_sheet(c, "2026-11-07")?;
        assert_eq!(s["status"], "draft");
        assert_eq!(s["opRows"].as_array().unwrap().len(), 1);
        assert_eq!(c.query_row::<i64, _, _>("SELECT imported FROM mill_op_rows WHERE id=?1", [ids[0]], |r| r.get(0))?, 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn the_day_sheet_counts_and_closes_without_posting_batches_or_touching_old_rows() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    live_like_v13(&path);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        let today = gokul_core::db::day_of(Local::now());
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 500_000, "test", "1", "seed", "Test")?;
        let day = mill::get_day(c, &today)?;
        assert_eq!(day["status"], "draft");
        let gn = day["stock"].as_array().unwrap().iter().find(|l| l["key"] == "groundnut").unwrap().clone();
        assert_eq!(gn["computed"], 500_000);
        // counted 495 kg: a 5 kg shortage; the old drafts' rows are left alone by saving
        let saved = mill::save_day(c, &de(json!({ "day": today, "supervisor": "Ravi", "note": "evening count", "physical": { "groundnut": 495_000 } })))?;
        assert_eq!(saved["supervisor"], "Ravi");
        let g2 = saved["stock"].as_array().unwrap().iter().find(|l| l["key"] == "groundnut").unwrap().clone();
        assert_eq!(g2["variance"], -5_000);
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM mill_op_rows", [], |r| r.get(0))?, 2, "old draft rows untouched");
        assert!(mill::save_day(c, &de(json!({ "day": today, "physical": { "oil_groundnut": 1000 } }))).is_err(), "oil is counted in the godown");
        // closing posts only the difference as an adjustment, no batches
        let batches = purchasing::list_pressing_batches(c)?.len();
        let closed = mill::close_day(c, &de(json!({ "day": today })))?;
        assert_eq!(closed["status"], "closed");
        assert_eq!(purchasing::list_pressing_batches(c)?.len(), batches);
        assert_eq!(c.query_row::<i64, _, _>("SELECT stock FROM items WHERE id='rm-gn'", [], |r| r.get(0))?, 495_000);
        assert!(mill::close_day(c, &de(json!({ "day": today }))).is_err(), "already closed");
        assert!(mill::save_day(c, &de(json!({ "day": today, "supervisor": "X" }))).is_err(), "closed is read-only");
        assert_eq!(mill::get_day(c, &today)?["status"], "closed");
        // a day that still has an old manual draft row cannot be closed until it is moved
        let blocked = mill::close_day(c, &de(json!({ "day": "2026-11-12" })));
        assert!(blocked.unwrap_err().to_string().contains("old manual sheet"));
        assert_eq!(mill::get_day(c, "2026-11-12")?["legacyOpenRows"], 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn job_work_bills_the_customer_keeps_cake_and_never_touches_shop_seed_or_oil() {
    let (_d, db) = common::mini_db();
    db.with(|c| {
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 100_000, "test", "1", "seed", "Test")?;
        let seed_before: i64 = c.query_row("SELECT stock FROM items WHERE id='rm-gn'", [], |r| r.get(0))?;
        let oil_before: i64 = c.query_row("SELECT stock FROM items WHERE id='i2'", [], |r| r.get(0))?;
        let cake_before = mill::list_job_work(c, 10)?.len();
        assert_eq!(cake_before, 0);
        // 40 kg of the customer's groundnut, the shop keeps 22 kg of cake: lower rate (Rs 5 per kg, GST included)
        let j = mill::record_job_work(c, &de(json!({ "customerId": "c1", "seed": "groundnut", "machine": "W", "seedKg": 40_000, "oilL": 15_000, "cakeKg": 22_000, "cakeMode": "kept" })))?;
        assert_eq!(j["rate"], 500);
        assert_eq!(j["charge"], 20_000, "40 kg x Rs 5");
        assert!(!j["billNumber"].as_str().unwrap().is_empty());
        assert_eq!(c.query_row::<i64, _, _>("SELECT outstanding FROM customers WHERE id='c1'", [], |r| r.get(0))?, 20_000, "credit bill on the customer");
        assert_eq!(c.query_row::<i64, _, _>("SELECT stock FROM items WHERE id='rm-gn'", [], |r| r.get(0))?, seed_before, "customer seed never touches shop stock");
        assert_eq!(c.query_row::<i64, _, _>("SELECT stock FROM items WHERE id='i2'", [], |r| r.get(0))?, oil_before, "customer oil never touches shop stock");
        let cake: i64 = c.query_row("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE ref_type='mill_job'", [], |r| r.get(0))?;
        assert_eq!(cake, 22_000, "kept cake goes into stock");
        // cake taken by the customer: higher rate, no stock
        let t = mill::record_job_work(c, &de(json!({ "customerId": "c1", "seed": "sesame", "seedKg": 10_000, "oilL": 3_500, "cakeKg": 6_000, "cakeMode": "taken" })))?;
        assert_eq!(t["rate"], 800);
        assert_eq!(c.query_row::<i64, _, _>("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE ref_type='mill_job'", [], |r| r.get(0))?, 22_000);
        assert_eq!(mill::list_job_work(c, 10)?.len(), 2);
        // bad input changes nothing
        assert!(mill::record_job_work(c, &de(json!({ "customerId": "nobody", "seed": "sesame", "seedKg": 1_000 }))).is_err());
        assert!(mill::record_job_work(c, &de(json!({ "customerId": "c1", "seed": "sesame", "seedKg": 1_000, "cakeMode": "kept" }))).is_err());
        assert_eq!(mill::list_job_work(c, 10)?.len(), 2);
        Ok(())
    })
    .unwrap();
}
