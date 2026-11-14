//! Office backend: catalogue, purchases, suppliers, production, customers and credit, users and permissions,
//! settings, backups and reports (GST totals must equal the bills).
mod common;
use chrono::{Duration, Local};
use common::*;
use gokul_core::bills::save_bill_at;
use gokul_core::db::{day_of, Db};
use gokul_core::types::*;
use gokul_core::{billops, catalog, crm, dash, dispatch, purchasing, reports, store, METHODS};
use rusqlite::Connection;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn de<T: DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn today() -> String {
    day_of(Local::now())
}

fn supplier(c: &mut Connection, name: &str, gstin: &str) -> String {
    let v = purchasing::save_supplier(
        c,
        &de(json!({ "name": name, "phone": "98427 11111", "city": "Tiruppur", "gstin": gstin, "address": "", "contact": "", "creditDays": 10 })),
    )
    .unwrap();
    v["id"].as_str().unwrap().to_string()
}

fn grn(c: &mut Connection, sid: &str, lines: Value, paid: i64, update_cost: bool) -> Value {
    purchasing::create_grn(
        c,
        &de(json!({ "supplierId": sid, "invoiceNo": "INV/1", "invoiceDate": today(), "lines": lines, "freight": 0, "otherCharges": 0,
                    "paidNow": paid, "payMode": "upi", "updateCost": update_cost })),
    )
    .unwrap()
}

fn params(from: &str, to: &str) -> reports::ReportParams {
    de(json!({ "from": from, "to": to }))
}

fn mismatches(c: &Connection) -> usize {
    dash::ledger_mismatches(c).unwrap().len()
}

// ---------- catalogue ----------

fn item_input(name: &str, code: &str, barcodes: &[&str]) -> catalog::ItemInput {
    de(json!({
        "name": name, "nameTa": "கடலை எண்ணெய்", "code": code, "barcodes": barcodes, "categoryId": "oil", "brand": "Gokul", "unit": "btl",
        "loose": false, "packSize": "1 L", "parentId": "i2", "scaleCode": "", "hsn": "1508", "gstRate": 5, "mrp": 40000, "price": 38000,
        "cost": 30000, "reorderLevel": 10000, "active": true
    }))
}

#[test]
fn item_with_two_barcodes_is_found_by_either_and_validated() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let r = catalog::save_item(c, &item_input("Groundnut Oil 2 L", "301", &["8906000000011", "8906000000028"]))?;
        assert_eq!(r["ok"], true, "{r}");
        let id = r["item"]["id"].as_str().unwrap().to_string();
        // both barcodes sell the item (what POS findItemByCode does)
        for bc in ["8906000000011", "8906000000028", "301"] {
            let it = store::find_item_by_code(c, bc)?.unwrap_or_else(|| panic!("{bc} not found"));
            assert_eq!(it.id, id);
            assert_eq!(it.name_ta.as_deref(), Some("கடலை எண்ணெய்"));
        }
        assert_eq!(store::find_item_by_code(c, "8906000000011")?.unwrap().barcode, "8906000000011", "first barcode is primary");
        // sell by the 2nd barcode through a real bill
        let it = store::find_item_by_code(c, "8906000000028")?.unwrap();
        let b = bills_save(c, vec![line(&it.id, &it.code, &it.name, 2000, it.price, it.gst_rate)]);
        assert_eq!(b.lines[0].item_id, id);
        assert_eq!(stock_of(c, &id), -2000);
        // duplicate barcode and code are refused with plain messages
        let dup = catalog::save_item(c, &item_input("Another Oil 2 L", "302", &["8906000000028"]))?;
        assert_eq!(dup["ok"], false);
        assert!(dup["issues"]["barcodes"].as_str().unwrap().contains("already belongs"));
        let dup_code = catalog::save_item(c, &item_input("Another Oil 3 L", "301", &["8906000000099"]))?;
        assert!(dup_code["issues"]["code"].as_str().unwrap().contains("already used"));
        // edit: drop the second barcode, add another; stale barcode stops working
        let mut edit = item_input("Groundnut Oil 2 L", "301", &["8906000000011", "8906000000035"]);
        edit.id = Some(id.clone());
        assert_eq!(catalog::save_item(c, &edit)?["ok"], true);
        assert!(store::find_item_by_code(c, "8906000000028")?.is_none());
        assert!(store::find_item_by_code(c, "8906000000035")?.is_some());
        let d = catalog::get_item_detail(c, &id)?;
        assert_eq!(d["barcodes"], json!(["8906000000011", "8906000000035"]));
        assert_eq!(d["parentId"], "i2");
        // generated barcodes are valid EAN-13 and unique
        let g1 = catalog::generate_barcode(c)?;
        let g2 = catalog::generate_barcode(c)?;
        assert!(g1.starts_with("2000") && g1.len() == 13 && g1 != g2);
        assert_eq!(catalog::next_item_code(c)?, "302");
        Ok(())
    })
    .unwrap();
}

fn bills_save(c: &mut Connection, lines: Vec<BillLine>) -> Bill {
    gokul_core::bills::save_bill(c, &cash_draft(lines)).unwrap()
}

#[test]
fn categories_and_brands_add_rename_reorder_delete_if_empty() {
    let (_d, db) = mini_db();
    db.with(|c| {
        assert_eq!(catalog::add_category(c, "Ghee")?["ok"], true);
        assert_eq!(catalog::add_category(c, "ghee")?["ok"], false, "case-insensitive duplicate");
        assert_eq!(catalog::add_category(c, "  ")?["ok"], false);
        let cats = catalog::list_categories_with_counts(c)?;
        assert_eq!(cats.iter().map(|x| x["name"].as_str().unwrap()).collect::<Vec<_>>(), ["Oils", "Ghee"]);
        assert!(cats.iter().all(|x| !x["id"].as_str().unwrap().starts_with('_')), "raw-material categories stay hidden");
        let ghee = cats[1]["id"].as_str().unwrap().to_string();
        catalog::move_category(c, &ghee, -1)?;
        assert_eq!(catalog::list_categories_with_counts(c)?[0]["name"], "Ghee");
        assert_eq!(catalog::rename_category(c, &ghee, "Desi Ghee")?["ok"], true);
        assert_eq!(store::list_categories(c)?[0].name, "Desi Ghee");
        let r = catalog::delete_category(c, "oil")?;
        assert_eq!(r["ok"], false);
        assert!(r["message"].as_str().unwrap().contains("3 items still use this category"), "{r}");
        assert_eq!(catalog::delete_category(c, &ghee)?["ok"], true);
        // brands
        let brands = catalog::list_brands(c)?;
        assert_eq!(brands[0]["name"], "Gokul");
        assert_eq!(brands[0]["items"], 3);
        assert_eq!(catalog::add_brand(c, "Kovai")?["ok"], true);
        let bid = brands[0]["id"].as_str().unwrap().to_string();
        assert_eq!(catalog::delete_brand(c, &bid)?["ok"], false);
        assert_eq!(catalog::rename_brand(c, &bid, "Gokul Gold")?["ok"], true);
        assert_eq!(store::find_item_by_code(c, "101")?.unwrap().brand, "Gokul Gold");
        let kovai = catalog::list_brands(c)?.into_iter().find(|b| b["name"] == "Kovai").unwrap();
        assert_eq!(catalog::delete_brand(c, kovai["id"].as_str().unwrap())?["ok"], true);
        Ok(())
    })
    .unwrap();
}

// ---------- stock adjustments and stock take ----------

#[test]
fn adjustments_and_stock_take_post_ledger_rows() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let r = catalog::create_adjustment(c, &de(json!({ "itemId": "i1", "reason": "leak", "qty": -2000, "note": "cap leaking" })))?;
        assert_eq!(r["ok"], true, "{r}");
        assert_eq!(r["adjustment"]["value"], -57600, "valued at cost 288.00 per unit x 2");
        assert_eq!(stock_of(c, "i1"), 48_000);
        let last: (String, i64, String) =
            c.query_row("SELECT kind, qty, note FROM stock_movements ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        assert_eq!(last, ("adjustment".into(), -2000, "Leak: cap leaking".into()));
        // rules
        for (qty, reason, text) in [(0, "leak", "more than zero"), (3000, "damage", "can only reduce"), (-99_000, "damage", "Only 48 btl in stock")] {
            let r = catalog::create_adjustment(c, &de(json!({ "itemId": "i1", "reason": reason, "qty": qty, "note": "" })))?;
            assert_eq!(r["ok"], false);
            assert!(r["message"].as_str().unwrap().contains(text), "{r}");
        }
        assert_eq!(catalog::create_adjustment(c, &de(json!({ "itemId": "i1", "reason": "correction", "qty": 1000, "note": "" })))?["ok"], true);
        // stock take: sheet, variance, posted as ledger rows
        let sheet = catalog::start_stock_take(c, "all")?;
        assert_eq!(sheet.len(), 3);
        let counts = vec![
            catalog::StockTakeCount { item_id: "i1".into(), counted: 40_000 }, // 49,000 system -> -9,000
            catalog::StockTakeCount { item_id: "i3".into(), counted: 20_000 }, // unchanged
            catalog::StockTakeCount { item_id: "i2".into(), counted: 101_500 }, // +1.5
        ];
        let res = catalog::post_stock_take(c, &counts, "Monthly count")?;
        assert_eq!((res["adjusted"].as_i64(), res["unchanged"].as_i64()), (Some(2), Some(1)));
        assert_eq!(stock_of(c, "i1"), 40_000);
        assert_eq!(stock_of(c, "i2"), 101_500);
        assert_eq!(catalog::list_adjustments(c)?.len(), 4);
        assert_eq!(mismatches(c), 0);
        Ok(())
    })
    .unwrap();
}

// ---------- purchases ----------

#[test]
fn purchase_is_one_transaction_with_gst_stock_supplier_balance_and_audit() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let sid = supplier(c, "Kongu Traders", "33AAAAA0000A1Z5");
        let g = grn(
            c,
            &sid,
            json!([
                { "itemId": "rm-gn", "qty": 100000, "rate": 9800, "discountPct": 0, "gstRate": 0 },
                { "itemId": "i1", "qty": 10000, "rate": 30000, "discountPct": 2.5, "gstRate": 5 }
            ]),
            50_000,
            true,
        );
        assert!(g["number"].as_str().unwrap().starts_with("PU-") && g["number"].as_str().unwrap().ends_with("-000001"), "{g}");
        let t = &g["totals"];
        assert_eq!((t["taxable"].as_i64(), t["gst"].as_i64(), t["cgst"].as_i64(), t["sgst"].as_i64(), t["igst"].as_i64()), (Some(1_272_500), Some(14_625), Some(7_312), Some(7_313), Some(0)));
        assert_eq!((t["beforeRound"].as_i64(), t["roundOff"].as_i64(), t["total"].as_i64()), (Some(1_287_125), Some(-25), Some(1_287_100)));
        assert_eq!(g["status"], "partial");
        assert_eq!(g["dueDate"].as_str().unwrap(), (Local::now() + Duration::days(10)).format("%Y-%m-%d").to_string());
        // stock: both lines in the ledger, items.stock follows, optional cost update applied (ex-GST per unit after discount)
        assert_eq!(stock_of(c, "rm-gn"), 100_000);
        assert_eq!(stock_of(c, "i1"), 60_000);
        let cost: i64 = c.query_row("SELECT cost FROM items WHERE id='i1'", [], |r| r.get(0))?;
        assert_eq!(cost, 29_250);
        assert_eq!(count(c, "purchase_lines"), 2);
        let ledger: i64 = c.query_row("SELECT COUNT(*) FROM stock_movements WHERE kind='purchase'", [], |r| r.get(0))?;
        assert_eq!(ledger, 2);
        // supplier balance, ledger entries and the audit trail
        let ledger = purchasing::get_supplier_ledger(c, &sid)?;
        assert_eq!(ledger["summary"]["due"], 1_237_100);
        assert_eq!(ledger["entries"].as_array().unwrap().len(), 2);
        assert_eq!(ledger["entries"][1]["balance"], 1_237_100);
        let audit: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE entity='purchase'", [], |r| r.get(0))?;
        assert_eq!(audit, 1);
        // reading it back gives the same totals
        let back = purchasing::get_grn(c, g["id"].as_str().unwrap())?;
        assert_eq!(back["totals"], g["totals"]);
        assert_eq!(purchasing::list_purchases(c)?.len(), 1);
        assert_eq!(purchasing::list_suppliers(c)?[0]["outstanding"], 1_237_100);
        assert_eq!(mismatches(c), 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn interstate_purchase_uses_igst() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let sid = supplier(c, "Mumbai Packaging", "27AAAAA0000A1Z5");
        let g = grn(c, &sid, json!([{ "itemId": "rm-btl1l", "qty": 1000000, "rate": 1000, "discountPct": 0, "gstRate": 18 }]), 0, false);
        assert_eq!((g["totals"]["igst"].as_i64(), g["totals"]["cgst"].as_i64()), (Some(180_000), Some(0)));
        assert_eq!(g["interstate"], true);
        Ok(())
    })
    .unwrap();
}

#[test]
fn failed_purchase_leaves_nothing_and_burns_no_number() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let sid = supplier(c, "Kongu Traders", "33AAAAA0000A1Z5");
        let before = (count(c, "purchases"), count(c, "purchase_lines"), count(c, "stock_movements"), count(c, "audit_log"));
        let bad = json!({ "supplierId": sid, "invoiceNo": "X", "invoiceDate": today(), "freight": 0, "otherCharges": 0, "paidNow": 0, "payMode": "cash", "updateCost": false,
            "lines": [{ "itemId": "i1", "qty": 1000, "rate": 100, "discountPct": 0, "gstRate": 5 }, { "itemId": "ghost", "qty": 1000, "rate": 100, "discountPct": 0, "gstRate": 5 }] });
        assert!(purchasing::create_grn(c, &de(bad)).is_err());
        let zero = json!({ "supplierId": sid, "lines": [{ "itemId": "i1", "qty": 0, "rate": 100, "gstRate": 5 }] });
        assert!(purchasing::create_grn(c, &de(zero)).is_err());
        assert!(purchasing::create_grn(c, &de(json!({ "supplierId": "nobody", "lines": [] }))).is_err());
        assert_eq!(before, (count(c, "purchases"), count(c, "purchase_lines"), count(c, "stock_movements"), count(c, "audit_log")));
        assert_eq!(stock_of(c, "i1"), 50_000);
        let g = grn(c, &sid, json!([{ "itemId": "i1", "qty": 1000, "rate": 100, "discountPct": 0, "gstRate": 5 }]), 0, false);
        assert!(g["number"].as_str().unwrap().ends_with("-000001"), "numbers have no gaps: {}", g["number"]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn supplier_payment_clears_the_oldest_purchase_first() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let sid = supplier(c, "Kongu Traders", "33AAAAA0000A1Z5");
        let line = |rate: i64| json!([{ "itemId": "rm-gn", "qty": 10000, "rate": rate, "discountPct": 0, "gstRate": 0 }]);
        let g1 = purchasing::create_grn_at(c, &de(json!({ "supplierId": sid, "invoiceDate": today(), "lines": line(10_000), "paidNow": 0, "payMode": "cash" })), Local::now() - Duration::days(30))?;
        let g2 = grn(c, &sid, line(20_000), 0, false);
        let g3 = grn(c, &sid, line(5_000), 0, false);
        let (t1, t2) = (g1["total"].as_i64().unwrap(), g2["total"].as_i64().unwrap());
        assert_eq!((t1, t2), (100_000, 200_000));
        // pay the first bill in full and half of the second
        let pay = |c: &mut Connection, amount: i64| {
            purchasing::record_supplier_payment(c, &de(json!({ "supplierId": sid, "amount": amount, "mode": "bank", "ref": "UTR1" }))).unwrap()
        };
        let l = pay(c, t1 + t2 / 2);
        let open: Vec<(String, i64)> = l["openBills"].as_array().unwrap().iter().map(|b| (b["grnId"].as_str().unwrap().to_string(), b["due"].as_i64().unwrap())).collect();
        assert_eq!(open, vec![(g2["id"].as_str().unwrap().to_string(), t2 / 2), (g3["id"].as_str().unwrap().to_string(), 50_000)]);
        assert_eq!(l["summary"]["due"], t2 / 2 + 50_000);
        // the ledger balance after the payment equals what is due
        let entries = l["entries"].as_array().unwrap();
        assert_eq!(entries.last().unwrap()["balance"], l["summary"]["due"]);
        assert_eq!(purchasing::get_grn(c, g1["id"].as_str().unwrap())?["status"], "paid");
        // more than due, zero and unknown supplier are refused
        for amount in [1_000_000, 0] {
            assert!(purchasing::record_supplier_payment(c, &de(json!({ "supplierId": sid, "amount": amount, "mode": "cash" }))).is_err());
        }
        assert!(purchasing::record_supplier_payment(c, &de(json!({ "supplierId": "nope", "amount": 100, "mode": "cash" }))).is_err());
        let l = pay(c, l["summary"]["due"].as_i64().unwrap());
        assert_eq!(l["summary"]["due"], 0);
        assert!(l["openBills"].as_array().unwrap().is_empty());
        Ok(())
    })
    .unwrap();
}

// ---------- production ----------

fn production_setup(c: &mut Connection) {
    c.execute("UPDATE items SET pack_size='1 L', parent_id='i2' WHERE id='i1'", []).unwrap();
    c.execute(
        "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
         VALUES('i9','109','Groundnut Oil Cake (Loose)','oil','Gokul','kg',1,'2305',5,5000,5000,4000,0,0,1,'2026-01-01T00:00:00Z')",
        [],
    )
    .unwrap();
    let sid = supplier(c, "Kongu Traders", "33AAAAA0000A1Z5");
    grn(c, &sid, json!([{ "itemId": "rm-gn", "qty": 500000, "rate": 9800, "discountPct": 0, "gstRate": 0 }]), 0, false);
}

#[test]
fn pressing_and_packing_are_ledger_movements_and_stock_balances() {
    let (_d, db) = mini_db();
    db.with(|c| {
        production_setup(c);
        let batch = purchasing::create_pressing_batch(
            c,
            &de(json!({ "seed": "groundnut", "seedKg": 100000, "cleaningLossKg": 2000, "jaggeryKg": 0, "oilRawL": 38000, "cakeKg": 55000, "chekku": "Chekku 1", "operator": "Murugesan" })),
        )?;
        assert!(batch["number"].as_str().unwrap().starts_with("PB-"));
        assert_eq!(batch["phase"], "settling");
        assert_eq!(stock_of(c, "rm-gn"), 400_000, "seed out of the godown");
        assert_eq!(stock_of(c, "i9"), 55_000, "oil cake in");
        assert_eq!(stock_of(c, "i2"), 100_000, "oil is not stock until it is in a barrel");
        // yield against the norm: 38 L x 0.91 / 98 kg = 35.3% against 36.4%
        let m = &batch["metrics"];
        assert!((m["yieldPct"].as_f64().unwrap() - 35.29).abs() < 0.01 && (m["normPct"].as_f64().unwrap() - 36.4).abs() < 0.01);
        assert_eq!(m["grade"], "low");
        // into the barrel, then packed
        let id = batch["id"].as_str().unwrap();
        assert!(purchasing::move_batch_to_barrel(c, &de(json!({ "batchId": id, "barrelId": "BR-01", "clearOilL": 99_000 }))).is_err(), "more than the raw oil");
        let moved = purchasing::move_batch_to_barrel(c, &de(json!({ "batchId": id, "barrelId": "BR-01", "clearOilL": 36_500 })))?;
        assert_eq!((moved["phase"].as_str(), moved["sedimentL"].as_i64()), (Some("in-barrel"), Some(1_500)));
        assert_eq!(stock_of(c, "i2"), 136_500);
        assert!(purchasing::move_batch_to_barrel(c, &de(json!({ "batchId": id, "barrelId": "BR-01", "clearOilL": 1000 }))).is_err(), "already in a barrel");
        let barrels = purchasing::list_barrels(c)?;
        assert_eq!((barrels[0]["levelL"].as_i64(), barrels[0]["oilName"].as_str()), (Some(36_500), Some("Groundnut Oil")));
        let targets = purchasing::list_pack_targets(c, "BR-01")?;
        assert_eq!(targets.len(), 1);
        assert_eq!((targets[0]["itemId"].as_str(), targets[0]["sizeMl"].as_i64()), (Some("i1"), Some(1000)));
        let run = purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-01", "lines": [{ "itemId": "i1", "count": 20 }], "usedL": 20_100, "packer": "Revathi" })))?;
        assert_eq!((run["expectedL"].as_i64(), run["wastageL"].as_i64(), run["packs"].as_i64()), (Some(20_000), Some(100), Some(20)));
        assert!((run["wastagePct"].as_f64().unwrap() - 0.5).abs() < 1e-9);
        assert_eq!(stock_of(c, "i2"), 136_500 - 20_100, "loose oil out incl. wastage");
        assert_eq!(stock_of(c, "i1"), 50_000 + 20_000, "packed bottles in");
        assert_eq!(purchasing::list_barrels(c)?[0]["levelL"], 16_400);
        // rules
        assert!(purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-01", "lines": [{ "itemId": "i1", "count": 5 }], "usedL": 100, "packer": "" }))).is_err(), "used less than packed");
        assert!(purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-01", "lines": [{ "itemId": "i1", "count": 100 }], "usedL": 100_000, "packer": "" }))).is_err(), "more than the barrel holds");
        assert!(purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-02", "lines": [{ "itemId": "i1", "count": 1 }], "usedL": 1000, "packer": "" }))).is_err(), "empty barrel");
        // packing everything empties the barrel and frees it for another oil
        purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-01", "lines": [{ "itemId": "i1", "count": 16 }], "usedL": 16_400, "packer": "" })))?;
        let b = &purchasing::list_barrels(c)?[0];
        assert_eq!((b["levelL"].as_i64(), b["oilName"].is_null()), (Some(0), true));
        // barrel levels equal what went in minus what came out, and the ledger balances
        let moved_in: i64 = c.query_row("SELECT COALESCE(SUM(clear_oil_ml),0) FROM pressing_batches", [], |r| r.get(0))?;
        let used: i64 = c.query_row("SELECT COALESCE(SUM(used_ml),0) FROM pack_runs", [], |r| r.get(0))?;
        let level: i64 = c.query_row("SELECT COALESCE(SUM(level_ml),0) FROM barrels", [], |r| r.get(0))?;
        assert_eq!(level, moved_in - used);
        assert_eq!(mismatches(c), 0);
        // errors on pressing
        assert!(purchasing::create_pressing_batch(c, &de(json!({ "seed": "groundnut", "seedKg": 9_999_000, "oilRawL": 1000 }))).is_err(), "not enough seed");
        assert!(purchasing::create_pressing_batch(c, &de(json!({ "seed": "groundnut", "seedKg": 0, "oilRawL": 1000 }))).is_err());
        assert!(purchasing::create_pressing_batch(c, &de(json!({ "seed": "mustard", "seedKg": 1000, "oilRawL": 1000 }))).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn yield_norms_are_editable_settings() {
    let (_d, db) = mini_db();
    db.with(|c| {
        production_setup(c);
        let draft = json!({ "seed": "groundnut", "seedKg": 100000, "cleaningLossKg": 0, "oilRawL": 40000, "cakeKg": 55000 });
        let before = purchasing::create_pressing_batch(c, &de(draft.clone()))?;
        assert!((before["metrics"]["normPct"].as_f64().unwrap() - 36.4).abs() < 0.01);
        let p = purchasing::save_seed_norms(c, &json!({ "seeds": [{ "seed": "groundnut", "kgPerL": 2.2, "density": 0.91 }], "packWastagePct": 0.8 }))?;
        assert_eq!(p[0]["kgPerL"], 2.2);
        let after = purchasing::create_pressing_batch(c, &de(draft))?;
        assert!((after["metrics"]["normPct"].as_f64().unwrap() - 41.36).abs() < 0.01);
        // the earlier batch keeps the norm in force when it was pressed
        let first = purchasing::list_pressing_batches(c)?.into_iter().find(|b| b["id"] == before["id"]).unwrap();
        assert!((first["metrics"]["normPct"].as_f64().unwrap() - 36.4).abs() < 0.01);
        assert_eq!(purchasing::pack_wastage_norm(c), 0.8);
        assert!(purchasing::save_seed_norms(c, &json!({ "seeds": [{ "seed": "groundnut", "kgPerL": 0 }] })).is_err());
        Ok(())
    })
    .unwrap();
}

// ---------- customers and credit ----------

fn credit_bill(c: &mut Connection, days_ago: i64, qty: i64) -> Bill {
    let l = line("i1", "101", "Groundnut Oil 1 L", qty, 36_000, 5);
    let d = draft_with(vec![l], 0, Some("c1"), "credit");
    save_bill_at(c, &d, Local::now() - Duration::days(days_ago), None).unwrap()
}

#[test]
fn customer_payment_clears_the_oldest_credit_bill_first() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b1 = credit_bill(c, 75, 1000); // 360.00 in the 61-90 bucket
        let b2 = credit_bill(c, 45, 2000); // 720.00 in 31-60
        let b3 = credit_bill(c, 5, 1000); // 360.00 current
        let total = b1.totals.grand + b2.totals.grand + b3.totals.grand;
        assert_eq!(total, 144_000);
        let recv = crm::list_receivables(c)?;
        assert_eq!(recv.len(), 1);
        assert_eq!(recv[0]["total"], total);
        let b = &recv[0]["buckets"];
        assert_eq!((b["d0_30"].as_i64(), b["d31_60"].as_i64(), b["d61_90"].as_i64(), b["d90p"].as_i64()), (Some(36_000), Some(72_000), Some(36_000), Some(0)));
        assert!(recv[0]["oldestDays"].as_i64().unwrap() >= 75);
        // pay 500 rupees: the 75-day-old bill goes first, then part of the 45-day bill
        let st = crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": 50_000, "mode": "cash" })))?;
        let b = &st["buckets"];
        assert_eq!((b["d0_30"].as_i64(), b["d31_60"].as_i64(), b["d61_90"].as_i64()), (Some(36_000), Some(58_000), Some(0)));
        assert_eq!(st["balance"], total - 50_000);
        assert_eq!(st["customer"]["outstanding"], total - 50_000);
        // statement: bills as debits, the receipt as credit, running balance ends at the outstanding
        let entries = st["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries.last().unwrap()["kind"], "payment");
        assert_eq!(entries.last().unwrap()["balance"], total - 50_000);
        assert!(entries.last().unwrap()["ref"].as_str().unwrap().starts_with("RC-"));
        let rc: (i64, String) = c.query_row("SELECT amount, mode FROM customer_payments", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!(rc, (50_000, "cash".into()));
        // rules
        assert!(crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": total, "mode": "cash" }))).is_err(), "more than outstanding");
        assert!(crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": 0, "mode": "cash" }))).is_err());
        assert!(crm::record_collection(c, &de(json!({ "customerId": "zz", "amount": 100, "mode": "cash" }))).is_err());
        // paying it all removes the customer from receivables
        crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": total - 50_000, "mode": "upi", "ref": "UPI123" })))?;
        assert!(crm::list_receivables(c)?.is_empty());
        crm::log_reminder(c, "c1")?;
        Ok(())
    })
    .unwrap();
}

#[test]
fn cash_collection_goes_into_the_open_drawer() {
    let (_d, db) = mini_db();
    db.with(|c| {
        credit_bill(c, 3, 1000);
        let counts = [("500", 4i64)].into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        gokul_core::shift::open_day(c, "u3", &counts)?;
        crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": 10_000, "mode": "cash" })))?;
        crm::record_collection(c, &de(json!({ "customerId": "c1", "amount": 5_000, "mode": "upi", "ref": "x" })))?;
        let s = gokul_core::shift::shift_summary(c)?;
        assert_eq!(s.cash_in, 10_000, "only the cash receipt reaches the drawer");
        Ok(())
    })
    .unwrap();
}

#[test]
fn customer_rows_profile_and_save() {
    let (_d, db) = mini_db();
    db.with(|c| {
        credit_bill(c, 3, 2000);
        bills_save(c, vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]);
        let row = crm::save_customer(c, &de(json!({ "name": "Annapoorna Mess", "phone": "98400 22222", "area": "RS Puram", "type": "b2b", "business": "Annapoorna Mess", "gstin": "33aaaaa1111a1z5", "email": "a@b.in", "address": "5 Cross", "creditLimit": 800000 })))?;
        assert_eq!((row["type"].as_str(), row["gstin"].as_str(), row["business"].as_str()), (Some("b2b"), Some("33AAAAA1111A1Z5"), Some("Annapoorna Mess")));
        let id = row["id"].as_str().unwrap().to_string();
        assert!(crm::save_customer(c, &de(json!({ "name": "X", "type": "b2b", "gstin": "BAD", "creditLimit": 0 }))).is_err());
        let upd = crm::save_customer(c, &de(json!({ "id": id, "name": "Annapoorna Mess 2", "phone": "98400 22222", "area": "Gandhipuram", "type": "retail", "creditLimit": 100 })))?;
        assert_eq!((upd["name"].as_str(), upd["type"].as_str(), upd["creditLimit"].as_i64()), (Some("Annapoorna Mess 2"), Some("retail"), Some(100)));
        assert!(upd.get("gstin").is_none(), "retail customers carry no GSTIN");
        let rows = crm::list_customer_rows(c)?;
        let murugan = rows.iter().find(|r| r["id"] == "c1").unwrap();
        assert_eq!((murugan["visits"].as_i64(), murugan["totalSpend"].as_i64()), (Some(1), Some(72_000)));
        assert_eq!(murugan["avgBill"], 72_000);
        let p = crm::get_customer_profile(c, "c1")?;
        assert_eq!(p["favourites"][0]["itemId"], "i1");
        assert_eq!(p["bills"].as_array().unwrap().len(), 1, "only bills made for this customer");
        assert!(crm::get_customer_profile(c, "nope")?.is_null());
        Ok(())
    })
    .unwrap();
}

// ---------- users, roles and permissions ----------

fn bill_as(c: &mut Connection, cashier: &str) -> Bill {
    let mut d = cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]);
    d.cashier = Some(cashier.into());
    gokul_core::bills::save_bill(c, &d).unwrap()
}

fn cancel(c: &mut Connection, bill: &Bill, by: &str, pin: &str) -> gokul_core::Result<BillDetail> {
    billops::cancel_bill(c, &CancelRequest { bill_id: bill.id.clone(), reason: "Wrong item billed".into(), manager_pin: pin.into(), by: by.into() })
}

#[test]
fn cashier_cannot_cancel_without_a_manager_pin_and_roles_are_enforced() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = bill_as(c, "Karthik");
        let e = cancel(c, &b, "Karthik", "").unwrap_err().to_string();
        assert!(e.contains("manager PIN"), "{e}");
        assert!(cancel(c, &b, "Karthik", "9999").is_err(), "wrong PIN");
        assert!(cancel(c, &b, "Karthik", "1234").is_err(), "a cashier's own PIN is not a manager PIN");
        assert_eq!(count(c, "bill_cancellations"), 0);
        let d = cancel(c, &b, "Karthik", "2222")?;
        assert_eq!(d.bill.status, "cancelled");
        let approved: String = c.query_row("SELECT approved_by FROM bill_cancellations", [], |r| r.get(0))?;
        assert_eq!(approved, "Lakshmi");
        // a manager holds the permission, so no second PIN is asked
        let b2 = bill_as(c, "Lakshmi");
        cancel(c, &b2, "Lakshmi", "")?;
        // the owner removes the permission from the manager role: now the manager needs a PIN too
        let mut roles = crm::list_roles(c)?;
        for r in roles.iter_mut() {
            if r["id"] == "manager" {
                r["perms"]["canCancelBill"] = json!(false);
            }
            if r["id"] == "owner" {
                r["perms"]["canCancelBill"] = json!(false); // the owner role is locked: this must be ignored
                r["pinFor"] = json!(["cancel_bill"]);
            }
        }
        let saved = crm::save_roles(c, &roles)?;
        assert_eq!(saved[0]["perms"]["canCancelBill"], true, "owner can always do everything");
        assert_eq!(saved[0]["pinFor"], json!([]));
        assert_eq!(saved.iter().find(|r| r["id"] == "manager").unwrap()["perms"]["canCancelBill"], false);
        let b3 = bill_as(c, "Lakshmi");
        assert!(cancel(c, &b3, "Lakshmi", "").is_err());
        cancel(c, &b3, "Lakshmi", "1111")?; // the owner's PIN approves
        // an unknown name always needs a PIN
        let b4 = bill_as(c, "counter");
        assert!(cancel(c, &b4, "counter", "").is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn users_pins_are_hashed_reset_is_shown_once_and_the_last_owner_is_protected() {
    let (_d, db) = mini_db();
    db.with(|c| {
        assert!(crm::save_user_account(c, &de(json!({ "name": "Divya Selvam", "role": "cashier", "phone": "", "active": true }))).is_err(), "a new user needs a PIN");
        assert!(crm::save_user_account(c, &de(json!({ "name": "Divya Selvam", "role": "cashier", "phone": "", "active": true, "pin": "12" }))).is_err());
        let u = crm::save_user_account(c, &de(json!({ "name": "Divya Selvam", "role": "cashier", "phone": "98400 33333", "active": true, "pin": "4321" })))?;
        assert_eq!(u["initials"], "DS");
        let id = u["id"].as_str().unwrap().to_string();
        let hash: String = c.query_row("SELECT pin_hash FROM users WHERE id=?1", [&id], |r| r.get(0))?;
        assert!(hash.starts_with("$argon2id$") && !hash.contains("4321"));
        assert!(store::verify_pin(c, &id, "4321")?.is_some());
        // reset: a new 4 digit PIN, only the hash is stored, the old one stops working
        let r = crm::reset_user_pin(c, &id)?;
        let pin = r["pin"].as_str().unwrap().to_string();
        assert!(pin.len() == 4 && pin.chars().all(|ch| ch.is_ascii_digit()));
        let hash2: String = c.query_row("SELECT pin_hash FROM users WHERE id=?1", [&id], |r| r.get(0))?;
        assert!(hash2 != hash && hash2.starts_with("$argon2id$") && !hash2.contains(&pin));
        assert!(store::verify_pin(c, &id, &pin)?.is_some());
        if pin != "4321" {
            assert!(store::verify_pin(c, &id, "4321")?.is_none());
        }
        assert!(crm::reset_user_pin(c, "ghost").is_err());
        // list shows no secrets; deactivated users cannot log in
        let list = crm::list_user_accounts(c)?;
        assert!(list.iter().all(|a| a.get("pin").is_none() && a.get("pinHash").is_none()));
        crm::save_user_account(c, &de(json!({ "id": id, "name": "Divya Selvam", "role": "cashier", "phone": "", "active": false })))?;
        assert!(store::verify_pin(c, &id, &pin)?.is_none());
        // the last active owner cannot be demoted or deactivated
        assert!(crm::save_user_account(c, &de(json!({ "id": "u1", "name": "Suresh", "role": "manager", "phone": "", "active": true }))).is_err());
        assert!(crm::save_user_account(c, &de(json!({ "id": "u1", "name": "Suresh", "role": "owner", "phone": "", "active": false }))).is_err());
        Ok(())
    })
    .unwrap();
}

// ---------- settings and backup ----------

#[test]
fn settings_bundle_persists_and_feeds_the_counter() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut b = crm::get_settings_bundle(c)?;
        b["shop"]["name"] = json!("Gokul Oils Gandhipuram");
        b["shop"]["gstin"] = json!("33aakfg4821m1zq");
        b["shop"]["address"] = json!("48, Mettupalayam Road");
        b["shop"]["city"] = json!("Coimbatore");
        b["shop"]["pincode"] = json!("641012");
        b["shop"]["phone"] = json!("98421 07731");
        b["billFormat"]["footer"] = json!("Thanks, visit again");
        b["printers"]["billPrinter"] = json!("TVS RP 3160");
        b["tax"]["roundToRupee"] = json!(false);
        b["billFormat"]["paper"] = json!("58mm");
        let saved = crm::save_settings_bundle(c, &b)?;
        assert_eq!(saved["shop"]["gstin"], "33AAKFG4821M1ZQ");
        // every tab persists
        let again = crm::get_settings_bundle(c)?;
        assert_eq!(again["billFormat"]["paper"], "58mm");
        assert_eq!(again["tax"]["roundToRupee"], false);
        // the values receipts and the counter read
        let s = store::get_settings(c)?;
        assert_eq!((s.shop_name.as_str(), s.gstin.as_str(), s.phone.as_str(), s.printer.as_str()), ("Gokul Oils Gandhipuram", "33AAKFG4821M1ZQ", "98421 07731", "TVS RP 3160"));
        assert_eq!(s.address, "48, Mettupalayam Road, Coimbatore 641012");
        assert_eq!((s.receipt_footer.as_str(), s.round_to_rupee), ("Thanks, visit again", false));
        // checks
        let mut bad = again.clone();
        bad["shop"]["gstin"] = json!("123");
        assert!(crm::save_settings_bundle(c, &bad).is_err());
        bad = again.clone();
        bad["shop"]["name"] = json!(" ");
        assert!(crm::save_settings_bundle(c, &bad).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn backup_is_a_consistent_copy_and_restore_is_staged_then_applied_on_start() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        c.execute("INSERT INTO categories(id,name,sort) VALUES('x','Before backup',1)", [])?;
        let bk = crm::backup_to(c, &dir.path().join("Backups"), "manual", 2)?;
        assert_eq!(bk["ok"], true);
        let id = bk["id"].as_str().unwrap().to_string();
        let copy = rusqlite::Connection::open(std::fs::read_dir(dir.path().join("Backups")).unwrap().next().unwrap().unwrap().path())?;
        let n: i64 = copy.query_row("SELECT COUNT(*) FROM categories WHERE id='x'", [], |r| r.get(0))?;
        assert_eq!(n, 1);
        drop(copy);
        // keep = 2 prunes older copies
        std::thread::sleep(std::time::Duration::from_millis(1100));
        crm::backup_to(c, &dir.path().join("Backups"), "auto", 2)?;
        std::thread::sleep(std::time::Duration::from_millis(1100));
        crm::backup_to(c, &dir.path().join("Backups"), "auto", 2)?;
        assert_eq!(std::fs::read_dir(dir.path().join("Backups")).unwrap().count(), 2);
        let gone = crm::restore_backup(c, &id)?;
        assert_eq!(gone["ok"], false, "the pruned backup is gone");
        // restore the newest after changing the data
        let newest = crm::get_settings_bundle(c)?["backup"]["history"][0]["id"].as_str().unwrap().to_string();
        c.execute("INSERT INTO categories(id,name,sort) VALUES('y','After backup',2)", [])?;
        let r = crm::restore_backup(c, &newest)?;
        assert_eq!(r["ok"], true, "{r}");
        assert!(crm::restore_backup(c, "bk999")?["ok"] == false);
        Ok(())
    })
    .unwrap();
    drop(db);
    // next start swaps the staged copy in and keeps the old file
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        let y: i64 = c.query_row("SELECT COUNT(*) FROM categories WHERE id='y'", [], |r| r.get(0))?;
        let x: i64 = c.query_row("SELECT COUNT(*) FROM categories WHERE id='x'", [], |r| r.get(0))?;
        assert_eq!((x, y), (1, 0), "restored to the state at backup time");
        Ok(())
    })
    .unwrap();
    assert!(std::fs::read_dir(dir.path()).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains("before-restore")));
}

// ---------- reports ----------

fn demo_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    gokul_core::seed_demo_if_empty(&db).unwrap();
    (dir, db)
}

const ALL_REPORTS: &[&str] = &[
    "daily-summary", "bill-wise", "item-wise", "category-wise", "cashier-wise", "payment-mode", "hourly-heatmap", "gstr1", "gstr3b", "hsn-wise",
    "tax-rate", "stock-summary", "stock-valuation", "stock-movement", "low-dead", "item-margin", "daily-profit", "cash-book", "day-close", "yield",
];

#[test]
fn every_report_runs_and_has_the_screen_shape() {
    let (_d, db) = demo_db();
    db.with(|c| {
        let from = day_of(Local::now() - Duration::days(40));
        for id in ALL_REPORTS {
            let r = reports::run_report(c, id, &params(&from, &today()))?;
            assert_eq!(r["id"], *id);
            assert!(r["title"].as_str().unwrap().len() > 3 && r["kpis"].is_array() && r["columns"].as_array().is_some_and(|c| !c.is_empty()) && r["rows"].is_array(), "{id}");
            let keys: Vec<&str> = r["columns"].as_array().unwrap().iter().map(|c| c["key"].as_str().unwrap()).collect();
            // every declared column has a value in the data rows (what the table renders)
            let data_rows: Vec<&Value> = r["rows"].as_array().unwrap().iter().filter(|row| row["_style"] != "head" && row["_style"] != "muted").collect();
            if let Some(row) = data_rows.first() {
                for k in &keys {
                    assert!(row.get(*k).is_some(), "{id}: column {k} has no value in the first row");
                }
            }
        }
        assert!(reports::run_report(c, "nope", &params(&from, &today())).is_err());
        Ok(())
    })
    .unwrap();
}

fn sum_bills(c: &Connection, col: &str, from: &str) -> i64 {
    c.query_row(&format!("SELECT COALESCE(SUM({col}),0) FROM bills WHERE status != 'cancelled' AND day >= ?1"), [from], |r| r.get(0)).unwrap()
}

#[test]
fn gstr1_and_gstr3b_totals_equal_the_bills() {
    let (_d, db) = demo_db();
    db.with(|c| {
        let from = day_of(Local::now() - Duration::days(40));
        let p = params(&from, &today());
        let (taxable, gst, before_round, grand) = (sum_bills(c, "taxable", &from), sum_bills(c, "gst", &from), sum_bills(c, "before_round", &from), sum_bills(c, "grand", &from));
        assert!(taxable > 0 && gst > 0);
        let n: i64 = c.query_row("SELECT COUNT(*) FROM bills WHERE status != 'cancelled' AND day >= ?1", [&from], |r| r.get(0))?;
        // GSTR-1
        let g1 = reports::run_report(c, "gstr1", &p)?;
        let t = &g1["totals"];
        assert_eq!((t["taxable"].as_i64().unwrap(), t["tax"].as_i64().unwrap(), t["value"].as_i64().unwrap(), t["invoices"].as_i64().unwrap()), (taxable, gst, before_round, n));
        assert_eq!(t["cgst"].as_i64().unwrap() + t["sgst"].as_i64().unwrap(), gst);
        let b2b: i64 = c.query_row("SELECT COUNT(*) FROM bills b JOIN customers u ON u.id=b.customer_id WHERE b.status != 'cancelled' AND b.day >= ?1 AND u.gstin != ''", [&from], |r| r.get(0))?;
        assert!(b2b > 0, "the demo has B2B customers with bills");
        assert_eq!(g1["kpis"][2]["value"], b2b);
        assert_eq!(g1["kpis"][2]["value"].as_i64().unwrap() + g1["kpis"][3]["value"].as_i64().unwrap(), n);
        // tax-rate table agrees
        let tr = reports::run_report(c, "tax-rate", &p)?;
        assert_eq!((tr["totals"]["taxable"].as_i64().unwrap(), tr["totals"]["tax"].as_i64().unwrap()), (taxable, gst));
        // GSTR-3B: outward taxable + nil = taxable turnover; output tax = bill GST (no credit notes in the demo)
        let g3 = reports::run_report(c, "gstr3b", &p)?;
        let rows = g3["rows"].as_array().unwrap();
        let get = |ref_: &str, k: &str| rows.iter().find(|r| r["ref"] == ref_).map(|r| r[k].as_i64().unwrap_or(0)).unwrap();
        assert_eq!(get("(a)", "taxable") + get("(c)", "taxable"), taxable);
        assert_eq!(get("(a)", "cgst") + get("(a)", "sgst"), gst);
        assert_eq!(g3["kpis"][0]["value"], gst);
        // the demo has purchase bills: ITC equals the GST on purchases and net payable is output minus ITC
        let itc: i64 = c.query_row("SELECT COALESCE(SUM(cgst+sgst+igst),0) FROM purchases WHERE day >= ?1", [&from], |r| r.get(0))?;
        assert!(itc > 0);
        assert_eq!(g3["kpis"][1]["value"], itc);
        // sales and payment reports agree with the bills too
        let ds = reports::run_report(c, "daily-summary", &p)?;
        assert_eq!((ds["totals"]["net"].as_i64().unwrap(), ds["totals"]["bills"].as_i64().unwrap()), (grand, n));
        let pm = reports::run_report(c, "payment-mode", &p)?;
        assert_eq!(pm["totals"]["amount"], grand);
        let bw = reports::run_report(c, "bill-wise", &p)?;
        assert_eq!(bw["totals"]["amount"], grand);
        // HSN table is built from lines; it matches the bills within rounding of a few paise per line
        let hsn = reports::run_report(c, "hsn-wise", &p)?;
        let (ht, hv) = (hsn["totals"]["taxable"].as_i64().unwrap(), hsn["totals"]["value"].as_i64().unwrap());
        assert!((ht - taxable).abs() * 1000 < taxable, "hsn taxable {ht} vs bills {taxable}");
        assert!((hv - before_round).abs() * 1000 < before_round, "hsn value {hv} vs bills {before_round}");
        Ok(())
    })
    .unwrap();
}

#[test]
fn sales_returns_show_in_gstr1_9b_and_reduce_gstr3b() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = bills_save(c, vec![line("i1", "101", "Groundnut Oil 1 L", 4000, 36_000, 5)]);
        let before = reports::run_report(c, "gstr3b", &params(&today(), &today()))?;
        billops::create_return(c, &ReturnRequest { bill_id: b.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "Seal broken / leaking".into(), refund_mode: "cash".into(), by: "Karthik".into(), manager_pin: "2222".into() })?;
        let g1 = reports::run_report(c, "gstr1", &params(&today(), &today()))?;
        let cn = g1["rows"].as_array().unwrap().iter().find(|r| r["desc"] == "Sales returns (credit notes)").unwrap().clone();
        assert_eq!(cn["invoices"], 1);
        assert_eq!(cn["value"], 36_000);
        assert_eq!(g1["totals"]["value"], b.totals.before_round, "sales totals still equal the bill");
        let after = reports::run_report(c, "gstr3b", &params(&today(), &today()))?;
        let diff = before["kpis"][0]["value"].as_i64().unwrap() - after["kpis"][0]["value"].as_i64().unwrap();
        assert_eq!(diff, cn["tax"].as_i64().unwrap(), "output GST drops by the tax on the credit note");
        // cancelled bills leave every report
        let b2 = bills_save(c, vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]);
        let t = |c: &Connection| reports::run_report(c, "daily-summary", &params(&today(), &today())).unwrap()["totals"]["net"].as_i64().unwrap();
        let with = t(c);
        billops::cancel_bill(c, &CancelRequest { bill_id: b2.id.clone(), reason: "Wrong item billed".into(), manager_pin: "2222".into(), by: "Karthik".into() })?;
        assert_eq!(with - t(c), b2.totals.grand);
        Ok(())
    })
    .unwrap();
}

#[test]
fn stock_valuation_cash_book_yield_and_item_reports_match_the_tables() {
    let (_d, db) = demo_db();
    db.with(|c| {
        let from = day_of(Local::now() - Duration::days(40));
        let p = params(&from, &today());
        let sv = reports::run_report(c, "stock-valuation", &p)?;
        let cost_value: i64 = c.query_row("SELECT COALESCE(SUM((cost * MAX(stock,0) + 500) / 1000),0) FROM items WHERE active=1 AND kind='item'", [], |r| r.get(0))?;
        assert!((sv["totals"]["costValue"].as_i64().unwrap() - cost_value).abs() < 200, "valuation is close to the sum over items");
        // item-wise sales total equals the line amounts
        let iw = reports::run_report(c, "item-wise", &p)?;
        let lines: i64 = c.query_row("SELECT COALESCE(SUM(l.amount),0) FROM bill_lines l JOIN bills b ON b.id=l.bill_id WHERE b.status != 'cancelled' AND b.day >= ?1", [&from], |r| r.get(0))?;
        assert_eq!(iw["totals"]["amount"], lines);
        // yield report lists the demo pressing batches
        let y = reports::run_report(c, "yield", &p)?;
        let batches: i64 = c.query_row("SELECT COUNT(*) FROM pressing_batches WHERE day >= ?1", [&from], |r| r.get(0))?;
        assert_eq!(y["rows"].as_array().unwrap().len() as i64, batches);
        assert!(batches >= 9 && y["totals"]["seedKg"].as_i64().unwrap() > 0);
        // margin: profit = sales - cost
        let im = reports::run_report(c, "item-margin", &p)?;
        assert_eq!(im["totals"]["profit"].as_i64().unwrap(), im["totals"]["sales"].as_i64().unwrap() - im["totals"]["cost"].as_i64().unwrap());
        // cash book counts the cash sales
        let cash: i64 = c.query_row("SELECT COALESCE(SUM(x.amount),0) FROM bills b JOIN bill_payments x ON x.bill_id=b.id AND x.mode='cash' WHERE b.status != 'cancelled' AND b.day >= ?1", [&from], |r| r.get(0))?;
        let cb = reports::run_report(c, "cash-book", &p)?;
        assert_eq!(cb["totals"]["cashSales"], cash);
        // stock movement shows purchases and production from the demo
        let sm = reports::run_report(c, "stock-movement", &p)?;
        assert!(sm["rows"].as_array().unwrap().iter().any(|r| r["kind"] == "purchase") && sm["rows"].as_array().unwrap().iter().any(|r| r["kind"] == "production"));
        Ok(())
    })
    .unwrap();
}

// ---------- the demo shop and the wiring ----------

#[test]
fn demo_office_data_is_consistent() {
    let (_d, db) = demo_db();
    db.with(|c| {
        assert_eq!(mismatches(c), 0, "stock ledger balances with purchases, production and packing");
        assert_eq!(count(c, "suppliers"), 8);
        assert!(count(c, "purchases") >= 20 && count(c, "pressing_batches") == 18 && count(c, "pack_runs") == 4);
        // barrel levels = oil moved in minus oil packed, per barrel
        let bad: i64 = c.query_row(
            "SELECT COUNT(*) FROM barrels b WHERE b.level_ml != COALESCE((SELECT SUM(clear_oil_ml) FROM pressing_batches p WHERE p.barrel_id=b.id),0)
             - COALESCE((SELECT SUM(used_ml) FROM pack_runs r WHERE r.barrel_id=b.id),0)", [], |r| r.get(0))?;
        assert_eq!(bad, 0);
        // supplier balances equal purchases minus payments
        for s in purchasing::list_suppliers(c)? {
            let id = s["id"].as_str().unwrap();
            let l = purchasing::get_supplier_ledger(c, id)?;
            assert_eq!(l["summary"]["due"], s["outstanding"]);
            if let Some(last) = l["entries"].as_array().unwrap().last() {
                assert_eq!(last["balance"], s["outstanding"], "{id}");
            }
        }
        // customer statements end at the outstanding shown on the customer
        for r in crm::list_receivables(c)?.iter().take(20) {
            let st = crm::get_statement(c, r["customerId"].as_str().unwrap())?;
            assert_eq!(st["entries"].as_array().unwrap().last().unwrap()["balance"], r["total"]);
            let b = &st["buckets"];
            assert_eq!(b["d0_30"].as_i64().unwrap() + b["d31_60"].as_i64().unwrap() + b["d61_90"].as_i64().unwrap() + b["d90p"].as_i64().unwrap(), r["total"].as_i64().unwrap());
        }
        // Office bills list is real: filters work
        let all = crm::list_sales_bills(c, &Default::default())?;
        assert!((1573..=1580).contains(&all.len()), "{} bills", all.len()); // + the demo mill sheets' aravai bills
        let q: crm::SalesQuery = de(json!({ "status": "credit", "mode": "credit" }));
        let credit = crm::list_sales_bills(c, &q)?;
        assert!(!credit.is_empty() && credit.iter().all(|b| b["status"] == "credit"));
        let q: crm::SalesQuery = de(json!({ "query": all[0]["number"].as_str().unwrap() }));
        assert_eq!(crm::list_sales_bills(c, &q)?.len(), 1);
        let opts = crm::sales_filter_options(c)?;
        assert!(!opts["cashiers"].as_array().unwrap().is_empty());
        // roles and users exist
        assert_eq!(crm::list_roles(c)?.len(), 5);
        assert_eq!(crm::list_user_accounts(c)?.len(), 5);
        Ok(())
    })
    .unwrap();
}

#[test]
fn raw_material_never_reaches_the_counter() {
    let (_d, db) = demo_db();
    db.with(|c| {
        assert!(store::find_item_by_code(c, "RM-GN")?.is_none());
        assert!(store::list_items(c)?.iter().all(|i| !i.id.starts_with("rm-")));
        assert!(store::search_items(c, "kernels", 20)?.iter().all(|i| !i.id.starts_with("rm-")));
        assert!(store::list_categories(c)?.iter().all(|k| !k.id.starts_with('_')));
        // but Office can buy them
        let found = purchasing::search_purchasable(c, "kernels", 10)?;
        assert_eq!((found[0]["id"].as_str(), found[0]["kind"].as_str()), (Some("rm-gn"), Some("seed")));
        assert!(purchasing::search_purchasable(c, "groundnut oil 1 l", 10)?.iter().any(|p| p["kind"] == "item"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn every_method_is_wired_and_the_typescript_list_matches() {
    let (_d, db) = mini_db();
    for m in METHODS {
        if let Err(e) = dispatch(&db, m, vec![]) {
            assert!(!e.to_string().starts_with("Unknown call"), "{m} is listed but not wired");
        }
    }
    assert!(dispatch(&db, "notAMethod", vec![]).is_err());
    // the TypeScript list in tauriApi.ts is the same list
    let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/data/src/tauri/tauriApi.ts")).unwrap();
    let start = ts.find("REAL_METHODS = [").unwrap();
    let list = &ts[start..start + ts[start..].find("] as const").unwrap()];
    let mut ts_methods: Vec<&str> = list.split('\'').skip(1).step_by(2).collect();
    let mut rust: Vec<&str> = METHODS.to_vec();
    ts_methods.sort();
    rust.sort();
    assert_eq!(ts_methods, rust, "REAL_METHODS in tauriApi.ts must list exactly the methods dispatch implements");
    // the dispatch speaks the Api shape
    let r = dispatch(&db, "listCategoriesWithCounts", vec![]).unwrap();
    assert_eq!(r[0]["name"], "Oils");
}
