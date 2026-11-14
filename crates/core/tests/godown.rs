//! Godown barrels: pressing into a barrel, the barrel ledger and stick readings, settling, transfer to the store,
//! outsourced oil, the seed-balance (loss) maths, the Mill daily report and the blind stock-take sheet.
mod common;
use chrono::Local;
use common::*;
use gokul_core::db::{day_of, iso, post_movement, Db};
use gokul_core::{catalog, godown, purchasing};
use rusqlite::Connection;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn de<T: DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

/// 500 kg groundnut seed, an oil cake item, and two godown barrels (one groundnut, one sesame).
fn setup(db: &Db) {
    db.with(|c| {
        let now = iso(Local::now());
        post_movement(c, &now, "rm-gn", "purchase", 500_000, "test", "1", "seed", "Test")?;
        c.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES('i9','109','Groundnut Oil Cake (Loose)','oil','Gokul','kg',1,'2305',5,5000,5000,4000,0,0,1,'2026-01-01T00:00:00Z')",
            [],
        )?;
        godown::add_godown_barrels(c, &de(json!({ "oil": "groundnut", "count": 2 })))?;
        godown::add_godown_barrels(c, &de(json!({ "oil": "sesame", "count": 1 })))?;
        Ok(())
    })
    .unwrap();
}

fn press(c: &mut Connection, barrel: &str, seed_kg: i64, clean: i64, oil_l: i64, cake: i64) -> Result<Value, gokul_core::ApiError> {
    purchasing::create_pressing_batch(
        c,
        &de(json!({ "seed": "groundnut", "seedKg": seed_kg, "cleaningLossKg": clean, "oilRawL": oil_l, "cakeKg": cake, "godownBarrelId": barrel, "operator": "Murugesan" })),
    )
}

fn barrel(c: &Connection, id: &str) -> Value {
    godown::list_godown_barrels(c).unwrap().into_iter().find(|b| b["id"] == id).expect("barrel")
}

fn ledger_sum(c: &Connection, id: &str) -> i64 {
    c.query_row("SELECT COALESCE(SUM(qty_ml),0) FROM godown_movements WHERE barrel_id=?1", [id], |r| r.get(0)).unwrap()
}

#[test]
fn loss_maths_counts_oil_cake_as_a_product_not_a_loss() {
    // seed 400 kg, cleaning waste 8 kg, oil 150 L at 0.91 kg/L = 136.5 kg, cake 240 kg
    let m = purchasing::pressing_metrics(400_000, 8_000, 0, 150_000, 240_000, 2.5, 0.91);
    let f = |k: &str| m[k].as_f64().unwrap();
    assert!((f("oilKg") - 136.5).abs() < 1e-9);
    assert!((f("cakeKg") - 240.0).abs() < 1e-9 && (f("cleaningKg") - 8.0).abs() < 1e-9 && (f("seedInKg") - 400.0).abs() < 1e-9);
    // loss = seed in - oil - cake - cleaning waste = 400 - 136.5 - 240 - 8 = 15.5 kg
    assert!((f("lossKg") - 15.5).abs() < 1e-9, "loss {}", f("lossKg"));
    assert!((f("lossPct") - 15.5 / 392.0 * 100.0).abs() < 1e-9);
    assert!((f("kgSeedPerL") - 392.0 / 150.0).abs() < 1e-9);
    // with no cake entered, the whole 240 kg would look like a loss: that is why cake is entered, never guessed
    let none = purchasing::pressing_metrics(400_000, 8_000, 0, 150_000, 0, 2.5, 0.91);
    assert!((none["lossKg"].as_f64().unwrap() - 255.5).abs() < 1e-9);
    // yield against the norm: oil weight / clean seed = 136.5 / 392 = 34.8% against 0.91/2.5 = 36.4%
    assert!((f("yieldPct") - 34.82).abs() < 0.01 && (f("normPct") - 36.4).abs() < 1e-9);
}

#[test]
fn pressing_fills_a_godown_barrel_and_never_store_stock() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        let loose_before = stock_of(c, "i2");
        let b = press(c, "GB-001", 100_000, 2_000, 38_000, 55_000)?;
        assert_eq!(b["phase"], "in-godown");
        assert_eq!(b["godownBarrelId"], "GB-001");
        // two batches into the same barrel (even from other seed lots): litres add up
        press(c, "GB-001", 100_000, 1_000, 40_000, 55_000)?;
        let g = barrel(c, "GB-001");
        assert_eq!((g["levelL"].as_i64(), g["status"].as_str()), (Some(78_000), Some("filling")));
        assert_eq!(ledger_sum(c, "GB-001"), 78_000, "level = ledger");
        // godown oil is not store stock
        assert_eq!(stock_of(c, "i2"), loose_before);
        assert_eq!(stock_of(c, "rm-gn"), 300_000);
        assert_eq!(stock_of(c, "i9"), 110_000, "oil cake is a product: it goes into stock");
        // rules: wrong oil barrel, unknown barrel, too much oil, nothing in settling barrels
        assert!(press(c, "GB-003", 10_000, 0, 4_000, 5_000).is_err(), "a sesame barrel for groundnut oil");
        assert!(press(c, "GB-099", 10_000, 0, 4_000, 5_000).is_err());
        assert!(press(c, "GB-001", 200_000, 0, 150_000, 10_000).is_err(), "only 122 L room");
        godown::set_godown_status(c, &de(json!({ "barrelId": "GB-001", "action": "settle" })))?;
        let err = press(c, "GB-001", 10_000, 0, 4_000, 5_000).unwrap_err().to_string();
        assert!(err.contains("settling"), "{err}");
        // the failed pressing took no seed
        assert_eq!(stock_of(c, "rm-gn"), 300_000);
        Ok(())
    })
    .unwrap();
}

#[test]
fn stick_reading_records_the_variance_and_keeps_the_ledger_true() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        press(c, "GB-001", 100_000, 0, 40_000, 50_000)?;
        press(c, "GB-001", 100_000, 0, 40_000, 50_000)?;
        // the stick shows 78.5 L, the entries say 80 L: 1.5 L short
        let after = godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 78_500, "note": "end of day" })))?;
        assert_eq!(after["levelL"], 78_500);
        assert_eq!(after["lastReading"]["varianceL"], -1_500);
        assert_eq!(after["lastReading"]["systemL"], 80_000);
        assert_eq!(ledger_sum(c, "GB-001"), 78_500, "the ledger follows the stick");
        let detail = godown::get_godown_barrel(c, "GB-001")?;
        assert_eq!(detail["readings"][0]["varianceL"], -1_500);
        assert_eq!(detail["ledger"][0]["kind"], "stick");
        // a matching reading adds no ledger row
        let n: i64 = c.query_row("SELECT COUNT(*) FROM godown_movements", [], |r| r.get(0))?;
        godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 78_500 })))?;
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM godown_movements", [], |r| r.get(0))?, n);
        // more than the barrel holds is refused
        assert!(godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 250_000 }))).is_err());
        assert!(godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": -1 }))).is_err());
        // the ledger cannot be edited
        assert!(c.execute("UPDATE godown_movements SET qty_ml=1", []).is_err());
        assert!(c.execute("DELETE FROM godown_movements", []).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn transfer_to_store_adds_litres_to_the_loose_item_and_takes_them_from_the_barrel() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        press(c, "GB-001", 100_000, 0, 40_000, 50_000)?;
        press(c, "GB-001", 100_000, 0, 40_000, 50_000)?;
        let loose = stock_of(c, "i2"); // 100 L in the store
        let t = |litres: i64| godown::TransferInput { barrel_id: "GB-001".into(), item_id: "i2".into(), litres_l: litres, store_barrel_id: None, note: String::new(), day: None, time: None };

        // not settled: refused, nothing moves
        let e = godown::transfer_to_store(c, &t(10_000)).unwrap_err().to_string();
        assert!(e.contains("settled") || e.contains("settle"), "{e}");
        assert_eq!(stock_of(c, "i2"), loose);

        godown::set_godown_status(c, &de(json!({ "barrelId": "GB-001", "action": "settle" })))?;
        assert_eq!(barrel(c, "GB-001")["status"], "settling");
        assert!(godown::transfer_to_store(c, &t(10_000)).is_err(), "still settling");
        godown::set_godown_status(c, &de(json!({ "barrelId": "GB-001", "action": "ready" })))?;

        // 30 L to the store
        let tr = godown::transfer_to_store(c, &t(30_000))?;
        assert!(tr["number"].as_str().unwrap().starts_with("GT-"));
        assert_eq!(stock_of(c, "i2"), loose + 30_000, "store loose-oil stock up by the litres");
        let g = barrel(c, "GB-001");
        assert_eq!((g["levelL"].as_i64(), g["status"].as_str()), (Some(50_000), Some("ready")));
        assert_eq!(ledger_sum(c, "GB-001"), 50_000);
        // both sides are in a ledger, audited
        let sm: i64 = c.query_row("SELECT COUNT(*) FROM stock_movements WHERE item_id='i2' AND ref_type='godown_transfer'", [], |r| r.get(0))?;
        let gm: i64 = c.query_row("SELECT COUNT(*) FROM godown_movements WHERE kind='transfer'", [], |r| r.get(0))?;
        let au: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='transfer_to_store'", [], |r| r.get(0))?;
        assert_eq!((sm, gm, au), (1, 1, 1));

        // rules: more than the barrel holds, a packed item, zero litres
        assert!(godown::transfer_to_store(c, &t(60_000)).is_err());
        assert!(godown::transfer_to_store(c, &godown::TransferInput { item_id: "i1".into(), ..t(1_000) }).is_err(), "a packed item is not a loose-oil item");
        assert!(godown::transfer_to_store(c, &t(0)).is_err());

        // the rest empties the barrel, which is free again
        godown::transfer_to_store(c, &t(50_000))?;
        let g = barrel(c, "GB-001");
        assert_eq!((g["levelL"].as_i64(), g["status"].as_str(), g["filledOn"].is_null()), (Some(0), Some("empty"), true));
        assert_eq!(stock_of(c, "i2"), loose + 80_000);
        // and the store item's cached stock equals its ledger
        let sum: i64 = c.query_row("SELECT SUM(qty) FROM stock_movements WHERE item_id='i2'", [], |r| r.get(0))?;
        assert_eq!(sum, stock_of(c, "i2"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_settling_barrel_turns_ready_by_itself_after_the_settling_days() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        press(c, "GB-001", 100_000, 0, 40_000, 50_000)?;
        godown::set_godown_status(c, &de(json!({ "barrelId": "GB-001", "action": "settle" })))?;
        // pretend the settling started 5 days ago (groundnut settles in 4 days)
        let past = iso(Local::now() - chrono::Duration::days(5));
        c.execute("UPDATE godown_barrels SET settle_started_on=?1 WHERE id='GB-001'", [past])?;
        assert_eq!(barrel(c, "GB-001")["status"], "ready");
        godown::transfer_to_store(c, &godown::TransferInput { barrel_id: "GB-001".into(), item_id: "i2".into(), litres_l: 10_000, store_barrel_id: None, note: String::new(), day: None, time: None })?;
        // settle needs oil in the barrel
        assert!(godown::set_godown_status(c, &de(json!({ "barrelId": "GB-002", "action": "settle" }))).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn outsourced_oil_goes_into_a_godown_barrel_with_supplier_and_cost() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        let loose = stock_of(c, "i2");
        let r = godown::record_outsourced_oil(
            c,
            &de(json!({ "barrelId": "GB-002", "supplierName": "Erode Oil Mills", "litresL": 100_000, "cost": 1_500_000, "note": "no seed this week" })),
        )?;
        assert!(r["number"].as_str().unwrap().starts_with("GP-"));
        assert_eq!((r["litresL"].as_i64(), r["ratePerL"].as_i64()), (Some(100_000), Some(15_000)));
        let g = barrel(c, "GB-002");
        assert_eq!((g["levelL"].as_i64(), g["status"].as_str()), (Some(100_000), Some("filling")));
        assert_eq!(stock_of(c, "i2"), loose, "outsourced oil is godown stock until transferred");
        // it can be mixed into a barrel that already holds pressed oil of the same kind, and shows in the daily report
        press(c, "GB-002", 10_000, 0, 4_000, 5_000)?;
        let day = day_of(Local::now());
        let rep = godown::mill_daily(c, &day)?;
        assert_eq!(rep["outsourced"][0]["supplierName"], "Erode Oil Mills");
        let b = rep["barrels"].as_array().unwrap().iter().find(|b| b["id"] == "GB-002").unwrap();
        assert_eq!((b["outsourcedL"].as_i64(), b["pressedL"].as_i64(), b["closingL"].as_i64()), (Some(100_000), Some(4_000), Some(104_000)));
        // rules
        assert!(godown::record_outsourced_oil(c, &de(json!({ "barrelId": "GB-002", "supplierName": "", "litresL": 1_000 }))).is_err(), "supplier needed");
        assert!(godown::record_outsourced_oil(c, &de(json!({ "barrelId": "GB-002", "supplierName": "X", "litresL": 0 }))).is_err());
        assert!(godown::record_outsourced_oil(c, &de(json!({ "barrelId": "GB-002", "supplierName": "X", "litresL": 150_000 }))).is_err(), "no room");
        Ok(())
    })
    .unwrap();
}

#[test]
fn mill_daily_report_is_filled_from_the_days_entries() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        press(c, "GB-001", 100_000, 2_000, 38_000, 55_000)?;
        press(c, "GB-001", 100_000, 2_000, 38_000, 55_000)?;
        godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 75_000 })))?;
        let day = day_of(Local::now());
        let r = godown::mill_daily(c, &day)?;
        let gn = &r["seeds"][0];
        assert_eq!((gn["opening"].as_i64(), gn["bought"].as_i64(), gn["toPress"].as_i64(), gn["closing"].as_i64()), (Some(0), Some(500_000), Some(200_000), Some(300_000)));
        assert_eq!(r["totals"]["batches"], 2);
        assert!((r["totals"]["oilL"].as_f64().unwrap() - 76.0).abs() < 1e-9);
        assert!((r["totals"]["cleaningKg"].as_f64().unwrap() - 4.0).abs() < 1e-9);
        let b = r["barrels"].as_array().unwrap().iter().find(|b| b["id"] == "GB-001").unwrap();
        assert_eq!((b["pressedL"].as_i64(), b["stickAdjustL"].as_i64(), b["closingL"].as_i64()), (Some(76_000), Some(-1_000), Some(75_000)));
        assert_eq!(b["reading"]["measuredL"], 75_000);
        // yesterday had nothing
        let y = godown::mill_daily(c, "2020-01-01")?;
        assert_eq!(y["totals"]["batches"], 0);
        assert!(y["barrels"].as_array().unwrap().is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn barrels_can_be_added_edited_and_never_double_named() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let list = godown::add_godown_barrels(c, &de(json!({ "oil": "copra", "count": 3, "capacityL": 200_000 })))?;
        let labels: Vec<String> = list.as_array().unwrap().iter().map(|b| b["label"].as_str().unwrap().to_string()).collect();
        assert_eq!(labels, ["Coconut 1", "Coconut 2", "Coconut 3"]);
        assert!(godown::add_godown_barrels(c, &de(json!({ "oil": "mustard", "count": 1 }))).is_err());
        assert!(godown::add_godown_barrels(c, &de(json!({ "oil": "copra", "count": 0 }))).is_err());
        assert!(godown::edit_godown_barrel(c, &de(json!({ "id": "GB-001", "label": "Coconut 2", "capacityL": 200_000 }))).is_err(), "duplicate name");
        let e = godown::edit_godown_barrel(c, &de(json!({ "id": "GB-001", "label": "Coconut A", "capacityL": 210_000 })))?;
        assert_eq!((e["label"].as_str(), e["capacityL"].as_i64()), (Some("Coconut A"), Some(210_000)));
        Ok(())
    })
    .unwrap();
}

#[test]
fn stock_take_sheet_carries_supplier_and_price_for_the_blind_count() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO suppliers(id,name,created_at) VALUES('s1','Kongu Traders',?1)", [iso(Local::now())])?;
        c.execute("UPDATE items SET supplier_id='s1' WHERE id='i1'", [])?;
        let lines = catalog::start_stock_take(c, "all")?;
        let i1 = lines.iter().find(|l| l["itemId"] == "i1").unwrap();
        assert_eq!((i1["supplier"].as_str(), i1["supplierId"].as_str(), i1["price"].as_i64()), (Some("Kongu Traders"), Some("s1"), Some(36_000)));
        let i3 = lines.iter().find(|l| l["itemId"] == "i3").unwrap();
        assert_eq!(i3["supplierId"], "", "an item without a supplier groups under 'No supplier'");
        // variance in quantity and rupees (cost 80% of price): count 47 against 50 = -3 pcs = -Rs 864 at cost
        let r = catalog::post_stock_take(c, &[de(json!({ "itemId": "i1", "counted": 47_000 }))], "blind count")?;
        assert_eq!((r["adjusted"].as_i64(), r["netValue"].as_i64()), (Some(1), Some(-3 * 28_800)));
        assert_eq!(stock_of(c, "i1"), 47_000);
        Ok(())
    })
    .unwrap();
}

/// Run by hand against a COPY of the live database: `GOKUL_DB_COPY=path cargo test -p gokul-core --test godown -- --ignored`.
#[test]
#[ignore]
fn migrates_a_copy_of_the_live_database() {
    let Ok(path) = std::env::var("GOKUL_DB_COPY") else { return };
    let before = rusqlite::Connection::open(&path).unwrap();
    let items: i64 = before.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0)).unwrap();
    let batches: i64 = before.query_row("SELECT COUNT(*) FROM pressing_batches", [], |r| r.get(0)).unwrap();
    drop(before);
    let db = Db::open(std::path::Path::new(&path)).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM items", [], |r| r.get(0))?, items);
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM pressing_batches", [], |r| r.get(0))?, batches);
        assert!(godown::list_godown_barrels(c)?.is_empty(), "nothing is seeded: the owner adds the godown barrels");
        let rep = godown::mill_daily(c, &day_of(Local::now()))?;
        println!("items {items}, batches {batches}, today's batches {}", rep["totals"]["batches"]);
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, gokul_core::db::latest_version());
        Ok(())
    })
    .unwrap();
}

// ---------- R6: every processing entry carries the date it really happened ----------

fn two_days_ago() -> String {
    day_of(Local::now() - chrono::Duration::days(2))
}

#[test]
fn a_back_dated_pressing_batch_uses_its_date_everywhere_and_a_future_date_is_refused() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        let d = two_days_ago();
        let b: Value = purchasing::create_pressing_batch(
            c,
            &de(json!({ "seed": "groundnut", "seedKg": 100_000, "cleaningLossKg": 2_000, "oilRawL": 38_000, "cakeKg": 55_000, "godownBarrelId": "GB-001", "operator": "Ambethkar", "day": d })),
        )?;
        let id: i64 = b["id"].as_str().unwrap().trim_start_matches("pb").parse().unwrap();
        let (day, at, ready): (String, String, String) =
            c.query_row("SELECT day,at,settle_ready_on FROM pressing_batches WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        assert_eq!(day, d);
        // 20:00 on that day, so the settle-ready date is the seed's settle days after that day (not after today)
        assert!(ready > at, "settle-ready is after the pressing day");
        let mdays: Vec<String> = {
            let mut st = c.prepare("SELECT at FROM stock_movements WHERE ref_type='pressing' AND ref_id=?1")?;
            let v = st.query_map([id.to_string()], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            v
        };
        assert_eq!(mdays.len(), 2, "seed out and cake in");
        assert!(mdays.iter().all(|m| *m == at), "every stock movement uses the batch date");
        let gday: String = c.query_row("SELECT day FROM godown_movements WHERE ref_type='pressing' AND ref_id=?1", [id.to_string()], |r| r.get(0))?;
        assert_eq!(gday, d);
        let future = day_of(Local::now() + chrono::Duration::days(1));
        let e = purchasing::create_pressing_batch(
            c,
            &de(json!({ "seed": "groundnut", "seedKg": 1_000, "oilRawL": 400, "godownBarrelId": "GB-001", "operator": "Ambethkar", "day": future })),
        )
        .unwrap_err()
        .to_string();
        assert!(e.contains("cannot be in the future"), "{e}");
        Ok(())
    })
    .unwrap();
}

#[test]
fn godown_actions_and_packing_take_a_date() {
    let (_d, db) = mini_db();
    setup(&db);
    db.with(|c| {
        let d = two_days_ago();
        godown::add_godown_barrels(c, &de(json!({ "oil": "copra", "count": 1, "day": d })))?;
        let created: String = c.query_row("SELECT created_at FROM godown_barrels WHERE oil='copra'", [], |r| r.get(0))?;
        assert!(created.starts_with(&d[..4]));
        press(c, "GB-001", 100_000, 0, 38_000, 55_000)?;
        godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 37_000, "day": d, "time": "09:30" })))?;
        let (rday, rat): (String, String) = c.query_row("SELECT day,at FROM godown_readings", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!(rday, d);
        assert!(rat.contains("T"), "{rat}");
        let o = godown::record_outsourced_oil(c, &de(json!({ "barrelId": "GB-001", "supplierName": "Mill", "litresL": 1_000, "cost": 10_000, "day": d })))?;
        assert_eq!(o["date"].as_str().unwrap()[..4], created[..4]);
        let day: String = c.query_row("SELECT day FROM godown_purchases", [], |r| r.get(0))?;
        assert_eq!(day, d);
        let f = day_of(Local::now() + chrono::Duration::days(1));
        assert!(godown::record_stick_reading(c, &de(json!({ "barrelId": "GB-001", "measuredL": 1_000, "day": f }))).is_err());
        assert!(godown::set_godown_status(c, &de(json!({ "barrelId": "GB-001", "action": "settle", "day": d }))).is_ok());
        let started: String = c.query_row("SELECT settle_started_on FROM godown_barrels WHERE id='GB-001'", [], |r| r.get(0))?;
        assert!(started.as_str() < iso(Local::now()).as_str());
        Ok(())
    })
    .unwrap();
}
