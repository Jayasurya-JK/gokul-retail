//! GST 2.0 tax model: rates are data (the owner's list), cess, and paise-exact inclusive splits.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::money::{compute_bill, compute_totals, recalc_line, split_taxes};
use gokul_core::types::*;
use gokul_core::{catalog, crm};
use serde_json::{json, Value};

fn de<T: serde::de::DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn item_json(rate: f64, cess: f64) -> catalog::ItemInput {
    de(json!({
        "name": "Test Item Special", "code": "501", "barcodes": ["8906000000501"], "categoryId": "oil", "brand": "Gokul", "unit": "btl",
        "loose": false, "packSize": "1 L", "parentId": "", "scaleCode": "", "hsn": "1508", "gstRate": rate, "cessRate": cess, "mrp": 40000, "price": 38000,
        "cost": 30000, "reorderLevel": 10000, "active": true
    }))
}

fn l(rate: i64, qty: i64, gst: f64, cess: f64) -> BillLine {
    let mut x = line("i1", "101", "Item", qty, rate, gst);
    x.cess_rate = cess;
    recalc_line(&x)
}

#[test]
fn inclusive_split_is_paise_exact_for_every_main_rate() {
    // Rs 105 at 5%: taxable 100, GST 5 (2.50 + 2.50)
    let t = compute_totals(&[l(10_500, 1000, 5.0, 0.0)], 0, false);
    assert_eq!((t.taxable, t.gst, t.grand), (10_000, 500, 10_500));
    assert_eq!((t.slabs[0].cgst, t.slabs[0].sgst), (250, 250));
    // 0%: nothing to split
    let t = compute_totals(&[l(10_000, 1000, 0.0, 0.0)], 0, false);
    assert_eq!((t.taxable, t.gst), (10_000, 0));
    // 18%: Rs 118 -> taxable 100, GST 18
    let t = compute_totals(&[l(11_800, 1000, 18.0, 0.0)], 0, false);
    assert_eq!((t.taxable, t.gst), (10_000, 1_800));
    // 40%: Rs 140 -> taxable 100, GST 40 (20 + 20)
    let t = compute_totals(&[l(14_000, 1000, 40.0, 0.0)], 0, false);
    assert_eq!((t.taxable, t.gst, t.grand), (10_000, 4_000, 14_000));
    assert_eq!((t.slabs[0].cgst, t.slabs[0].sgst), (2_000, 2_000));
    // an odd paisa goes to SGST, nothing is lost: 10001 at 5% -> taxable 9525, GST 476 = 238 + 238; 10003 gives an odd GST
    for gross in [10_001, 10_003, 9_999, 12_345] {
        for rate in [0.0, 0.25, 3.0, 5.0, 12.0, 18.0, 28.0, 40.0] {
            let t = compute_totals(&[l(gross, 1000, rate, 0.0)], 0, false);
            assert_eq!(t.taxable + t.gst, gross, "rate {rate} gross {gross}");
            let s = &t.slabs[0];
            assert_eq!(s.cgst + s.sgst, t.gst);
            assert!(s.sgst - s.cgst == 0 || s.sgst - s.cgst == 1, "odd paisa goes to SGST");
        }
    }
}

#[test]
fn special_rate_quarter_percent_is_exact() {
    // Rs 10,025 at 0.25% inclusive: taxable 10,000, GST 25
    let t = compute_totals(&[l(1_002_500, 1000, 0.25, 0.0)], 0, false);
    assert_eq!((t.taxable, t.gst), (1_000_000, 2_500));
    assert_eq!(t.slabs[0].rate, 0.25);
    assert_eq!((t.slabs[0].cgst, t.slabs[0].sgst), (1_250, 1_250));
}

#[test]
fn cess_is_extracted_from_the_inclusive_price_and_shown_in_the_slab() {
    // Rs 1,400 at 28% GST + 12% cess inclusive: taxable 1,000, GST 280, cess 120
    let t = compute_totals(&[l(140_000, 1000, 28.0, 12.0)], 0, false);
    assert_eq!(t.taxable, 100_000);
    assert_eq!(t.gst, 28_000);
    assert_eq!(t.cess, 12_000);
    assert_eq!(t.taxable + t.gst + t.cess, t.before_round);
    let s = &t.slabs[0];
    assert_eq!((s.cgst, s.sgst, s.igst, s.cess), (14_000, 14_000, 0, 12_000));
    // cess with a bill discount and an odd amount still adds back to the paisa
    let lines = [l(50_001, 1000, 28.0, 12.0), l(30_003, 1000, 5.0, 1.5), l(10_000, 1000, 0.0, 0.0)];
    let (t, taxes) = compute_bill(&lines, 777, false, false, None);
    assert_eq!(t.taxable + t.gst + t.cess, t.before_round);
    let sum: i64 = taxes.iter().map(|x| x.taxable + x.cgst + x.sgst + x.igst + x.cess).sum();
    assert_eq!(sum, t.before_round, "per-line taxes add up to the bill");
    assert_eq!(taxes.iter().map(|x| x.cgst).sum::<i64>(), t.slabs.iter().map(|s| s.cgst).sum::<i64>());
}

#[test]
fn lines_of_one_rate_add_up_to_exactly_the_slab() {
    // three odd-GST lines at 5%: the odd paisa split is done on the running total, so lines match the slab
    let inputs = [(5.0, 0.0, 10_501), (5.0, 0.0, 10_503), (5.0, 0.0, 10_507), (18.0, 0.0, 11_801)];
    let (taxes, slabs) = split_taxes(&inputs, false);
    let five = slabs.iter().find(|s| s.rate == 5.0).unwrap();
    assert_eq!(taxes[..3].iter().map(|x| x.cgst).sum::<i64>(), five.cgst);
    assert_eq!(taxes[..3].iter().map(|x| x.sgst).sum::<i64>(), five.sgst);
    for t in &taxes {
        assert!(t.sgst - t.cgst == 0 || t.sgst - t.cgst == 1 || t.sgst - t.cgst == -1);
    }
}

#[test]
fn rates_are_data_items_validate_against_the_owners_list() {
    let (_d, db) = mini_db();
    db.with(|c| {
        // defaults: 0, 0.25, 3, 5, 12, 18, 28, 40
        for rate in [0.0, 0.25, 3.0, 5.0, 12.0, 18.0, 28.0, 40.0] {
            let mut i = item_json(rate, 0.0);
            i.code = format!("5{}", (rate * 100.0) as i64);
            i.barcodes = vec![format!("89060000{:05}", (rate * 100.0) as i64 + 1)];
            let r = catalog::save_item(c, &i)?;
            assert_eq!(r["ok"], true, "rate {rate} should be allowed: {r}");
        }
        let bad = catalog::save_item(c, &item_json(7.0, 0.0))?;
        assert_eq!(bad["ok"], false);
        assert!(bad["issues"]["gstRate"].as_str().unwrap().contains("not in the GST rate list"), "{bad}");
        let bad = catalog::save_item(c, &item_json(5.0, 150.0))?;
        assert_eq!(bad["ok"], false);
        assert!(bad["issues"]["cessRate"].is_string(), "{bad}");

        // the owner edits the list: switch 12% off, add 7.5%
        let mut b = crm::get_settings_bundle(c)?;
        let rates = b["tax"]["rates"].as_array_mut().unwrap();
        assert!(rates.len() >= 8, "the default rate list is shown");
        for r in rates.iter_mut() {
            if r["rate"] == json!(12) {
                r["enabled"] = json!(false);
            }
        }
        rates.push(json!({ "rate": 7.5, "enabled": true, "label": "Test rate" }));
        crm::save_settings_bundle(c, &b)?;
        let mut i = item_json(12.0, 0.0);
        i.code = "601".into();
        i.barcodes = vec!["8906000000601".into()];
        assert_eq!(catalog::save_item(c, &i)?["ok"], false, "12% is switched off");
        i.gst_rate = 7.5;
        assert_eq!(catalog::save_item(c, &i)?["ok"], true, "7.5% was added");
        // a rate listed twice or out of range is refused, nothing saved
        let mut b = crm::get_settings_bundle(c)?;
        b["tax"]["rates"].as_array_mut().unwrap().push(json!({ "rate": 5, "enabled": true, "label": "dup" }));
        assert!(crm::save_settings_bundle(c, &b).is_err());
        let mut b = crm::get_settings_bundle(c)?;
        b["tax"]["rates"].as_array_mut().unwrap().push(json!({ "rate": 150, "enabled": true, "label": "silly" }));
        assert!(crm::save_settings_bundle(c, &b).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn the_old_hard_check_is_gone_from_the_database() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES('x40','940','Forty','oil','G','pc',0,'2402',40,100,100,50,0,0,1,'2026-01-01')",
            [],
        )?;
        c.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES('xq','941','Quarter','oil','G','pc',0,'7102',0.25,100,100,50,0,0,1,'2026-01-01')",
            [],
        )?;
        let q: f64 = c.query_row("SELECT gst_rate FROM items WHERE id='xq'", [], |r| r.get(0))?;
        assert_eq!(q, 0.25);
        // still a sanity check: no negative or over-100 rates
        assert!(c
            .execute(
                "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
                 VALUES('xbad','942','Bad','oil','G','pc',0,'2402',150,100,100,50,0,0,1,'2026-01-01')",
                [],
            )
            .is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_bill_with_40_percent_and_cess_saves_and_reads_back_exactly() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut line40 = line("i1", "101", "Groundnut Oil 1 L", 1000, 14_000, 40.0);
        line40.cess_rate = 0.0;
        let mut cess = line("i3", "103", "Dish Wash Bar", 1000, 140_000, 28.0);
        cess.cess_rate = 12.0;
        let draft = cash_draft(vec![line40, cess]);
        let bill = save_bill(c, &draft)?;
        assert_eq!(bill.totals.cess, 12_000);
        let slab40 = bill.totals.slabs.iter().find(|s| s.rate == 40.0).unwrap();
        assert_eq!((slab40.taxable, slab40.cgst, slab40.sgst), (10_000, 2_000, 2_000));
        let slab28 = bill.totals.slabs.iter().find(|s| s.rate == 28.0).unwrap();
        assert_eq!((slab28.taxable, slab28.cess), (100_000, 12_000));
        let back = gokul_core::bills::get_bill(c, &bill.id)?.unwrap();
        assert_eq!(back.totals, bill.totals, "what was saved is what is read back");
        assert_eq!(back.lines[1].cess_rate, 12.0);
        // a rate that is not in the list is refused and nothing is saved
        let before = count(c, "bills");
        let e = save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 10_000, 7.0)])).unwrap_err().to_string();
        assert!(e.contains("not in the GST rate list"), "{e}");
        assert_eq!(count(c, "bills"), before);
        Ok(())
    })
    .unwrap();
}
