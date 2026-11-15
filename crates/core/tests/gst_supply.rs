//! Place of supply and IGST: intra-state (CGST + SGST) and inter-state (IGST), B2B and B2C, returns of each,
//! GSTIN checks, and the migration backfill. Every figure is paise-exact and ties back to the saved bill.
mod common;
use common::*;
use gokul_core::bills::{get_bill, save_bill};
use gokul_core::billops::{create_return, get_bill_detail};
use gokul_core::gst::{backfill_line_taxes, gstin_check_char, gstin_problem, is_valid_gstin};
use gokul_core::types::*;
use gokul_core::{crm, reports};
use rusqlite::Connection;
use serde_json::{json, Value};

fn de<T: serde::de::DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn customer(c: &mut Connection, name: &str, gstin: &str, state: &str) -> String {
    let b2b = !gstin.is_empty();
    let row = crm::save_customer(c, &de(json!({ "name": name, "phone": "98400 33333", "area": "X", "type": if b2b { "b2b" } else { "retail" },
        "business": if b2b { name } else { "" }, "gstin": gstin, "stateCode": state, "address": "7 Market Road, Town", "creditLimit": 0 }))).unwrap();
    row["id"].as_str().unwrap().to_string()
}

fn draft_for(cust: Option<&str>) -> BillDraft {
    // Rs 380 at 5%, Rs 118 at 18% and a Rs 50 line at 0%: three slabs, with a bill discount so lines must share it
    let mut d = draft_with(
        vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 38_000, 5), line("i3", "103", "Dish Wash Bar", 1000, 11_801, 18), line("i2", "102", "Groundnut Oil (Loose)", 500, 10_000, 0)],
        777,
        cust,
        "cash",
    );
    d.customer_name = None;
    d
}

fn slab_sums(b: &Bill) -> (i64, i64, i64, i64, i64) {
    let s = &b.totals.slabs;
    (s.iter().map(|x| x.taxable).sum(), s.iter().map(|x| x.cgst).sum(), s.iter().map(|x| x.sgst).sum(), s.iter().map(|x| x.igst).sum(), s.iter().map(|x| x.cess).sum())
}

/// Every line's split adds up to the line, and the lines add up to the slabs.
fn assert_lines_tie(b: &Bill) {
    let mut sum = (0, 0, 0, 0, 0);
    for l in &b.lines {
        let t = l.tax.as_ref().expect("saved lines carry their tax split");
        sum = (sum.0 + t.taxable, sum.1 + t.cgst, sum.2 + t.sgst, sum.3 + t.igst, sum.4 + t.cess);
    }
    assert_eq!(sum, slab_sums(b), "lines add up to the slabs");
    assert_eq!(sum.0 + sum.1 + sum.2 + sum.3 + sum.4, b.totals.before_round, "taxable + tax = what the customer pays before round-off");
}

#[test]
fn gstin_is_checked_for_pattern_state_and_check_character() {
    // the shop's real GSTIN and the GSTN sample are valid
    assert!(is_valid_gstin("33EAEPK8839P2ZX"));
    assert!(is_valid_gstin("27aapfu0939f1zv"), "lower case is accepted");
    assert_eq!(gstin_check_char("27AAPFU0939F1Z"), Some('V'));
    assert_eq!(gstin_check_char("33EAEPK8839P2Z"), Some('X'));
    // wrong check character
    let p = gstin_problem("33EAEPK8839P2ZY", None).unwrap();
    assert!(p.contains("should be X"), "{p}");
    // wrong length, wrong pattern, unknown state
    assert!(gstin_problem("33EAEPK8839P2Z", None).unwrap().contains("15"));
    assert!(gstin_problem("33EAEPK8839P2QX", None).unwrap().contains("pattern"), "14th character must be Z");
    assert!(gstin_problem("NONE", None).is_some());
    let bad_state = format!("50AAPFU0939F1Z{}", gstin_check_char("50AAPFU0939F1Z").unwrap());
    assert!(gstin_problem(&bad_state, None).unwrap().contains("not a GST state code"));
    // the state prefix must match the state
    assert!(gstin_problem("27AAPFU0939F1ZV", Some("33")).unwrap().contains("Maharashtra"));
    assert!(gstin_problem("27AAPFU0939F1ZV", Some("27")).is_none());
}

#[test]
fn customer_gstin_and_state_are_validated_on_save() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut bad = |v: Value| crm::save_customer(c, &de(v)).unwrap_err().to_string();
        let base = |g: &str, s: &str| json!({ "name": "Buyer", "phone": "98400 33333", "area": "X", "type": "b2b", "business": "Buyer Co", "gstin": g, "stateCode": s, "creditLimit": 0 });
        assert!(bad(base("27AAPFU0939F1ZW", "")).contains("should be V"));
        assert!(bad(base("27AAPFU0939F1ZV", "33")).contains("starts with 27"));
        assert!(bad(base("", "99X")).contains("valid state"));
        let ok = crm::save_customer(c, &de(base("27AAPFU0939F1ZV", "")))?;
        assert_eq!(ok["stateCode"], "27", "the state comes from the GSTIN");
        let consumer = crm::save_customer(c, &de(json!({ "name": "Walk Kerala", "phone": "98400 44444", "area": "X", "type": "retail", "stateCode": "32", "creditLimit": 0 })))?;
        assert_eq!(consumer["stateCode"], "32");
        Ok(())
    })
    .unwrap();
}

#[test]
fn walk_in_and_local_customers_are_intra_state_with_cgst_and_sgst() {
    let (_d, db) = mini_db();
    db.with(|c| {
        for cust in [None, Some("c1")] {
            let b = save_bill(c, &draft_for(cust))?;
            assert_eq!((b.extras.place_of_supply.as_str(), b.extras.supply_type.as_str()), ("33", "intra"), "no state recorded means the shop's own state");
            let (_, cgst, sgst, igst, _) = slab_sums(&b);
            assert_eq!(igst, 0);
            assert!(cgst > 0 && sgst > 0 && (sgst - cgst == 0 || sgst - cgst == 1), "half and half, the odd paisa to SGST");
            assert_lines_tie(&b);
            assert!(b.extras.customer_gstin.is_empty(), "a consumer bill carries no GSTIN");
            let back = get_bill(c, &b.id)?.unwrap();
            assert_eq!(back.totals, b.totals);
            assert_eq!(back.extras.supply_type, "intra");
        }
        Ok(())
    })
    .unwrap();
}

#[test]
fn inter_state_b2c_customer_gets_igst_at_the_full_rate_and_the_same_total() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let intra = save_bill(c, &draft_for(None))?;
        let inter = save_bill(c, &draft_for(Some(&kerala)))?;
        assert_eq!((inter.extras.place_of_supply.as_str(), inter.extras.supply_type.as_str()), ("32", "inter"));
        let (taxable, cgst, sgst, igst, _) = slab_sums(&inter);
        assert_eq!((cgst, sgst), (0, 0));
        let (taxable0, cgst0, sgst0, _, _) = slab_sums(&intra);
        assert_eq!((taxable, igst), (taxable0, cgst0 + sgst0), "IGST is exactly CGST + SGST of the same sale");
        assert_eq!(inter.totals.grand, intra.totals.grand, "prices include GST, so the total does not change");
        assert_eq!(inter.totals.gst, intra.totals.gst);
        assert!(inter.totals.slabs.iter().filter(|s| s.rate > 0.0).all(|s| s.igst > 0 && s.cgst == 0));
        assert_lines_tie(&inter);
        // the saved slabs read back with IGST
        let back = get_bill(c, &inter.id)?.unwrap();
        assert_eq!(back.totals, inter.totals);
        assert_eq!(back.extras.place_of_supply, "32");
        // the cashier can also pick a state on a walk-in bill (a courier order)
        let mut d = draft_for(None);
        d.extras.place_of_supply = "29".into();
        let courier = save_bill(c, &d)?;
        assert_eq!((courier.extras.place_of_supply.as_str(), courier.extras.supply_type.as_str()), ("29", "inter"));
        d.extras.place_of_supply = "33".into();
        assert_eq!(save_bill(c, &d)?.extras.supply_type, "intra", "choosing the shop's own state is local");
        d.extras.place_of_supply = "88".into();
        assert!(save_bill(c, &d).is_err(), "an unknown state is refused");
        Ok(())
    })
    .unwrap();
}

#[test]
fn b2b_bills_carry_the_recipients_gstin_and_address_as_they_were() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let local = customer(c, "Local Mess", "33AAKFG4821M1Z9", "");
        let far = customer(c, "Pune Traders", "27AAPFU0939F1ZV", "");
        let b1 = save_bill(c, &draft_for(Some(&local)))?;
        assert_eq!((b1.extras.customer_gstin.as_str(), b1.extras.supply_type.as_str(), b1.extras.place_of_supply.as_str()), ("33AAKFG4821M1Z9", "intra", "33"));
        let b2 = save_bill(c, &draft_for(Some(&far)))?;
        assert_eq!((b2.extras.customer_gstin.as_str(), b2.extras.supply_type.as_str(), b2.extras.place_of_supply.as_str()), ("27AAPFU0939F1ZV", "inter", "27"));
        assert!(slab_sums(&b2).3 > 0 && slab_sums(&b2).1 == 0);
        assert_eq!(b2.extras.customer_address, "7 Market Road, Town");
        // the customer changes later: the issued invoice does not
        c.execute("UPDATE customers SET gstin='', address='Somewhere else', state_code='' WHERE id=?1", [&far])?;
        let again = get_bill(c, &b2.id)?.unwrap();
        assert_eq!((again.extras.customer_gstin.as_str(), again.extras.customer_address.as_str(), again.extras.supply_type.as_str()), ("27AAPFU0939F1ZV", "7 Market Road, Town", "inter"));
        // a placeholder that is not a real GSTIN (such as "NONE") makes a consumer bill, not a B2B one
        let junk = customer(c, "Junk", "", "");
        c.execute("UPDATE customers SET gstin='NONE' WHERE id=?1", [&junk])?;
        let b3 = save_bill(c, &draft_for(Some(&junk)))?;
        assert!(b3.extras.customer_gstin.is_empty() && b3.extras.supply_type == "intra");
        Ok(())
    })
    .unwrap();
}

fn return_all(c: &mut Connection, bill: &Bill) -> CreditNote {
    let picks: Vec<ReturnPick> = (0..bill.lines.len() as i64).map(|i| ReturnPick { line_index: i, qty: bill.lines[i as usize].qty }).collect();
    create_return(
        c,
        &ReturnRequest { bill_id: bill.id.clone(), picks, reason: "Seal broken".into(), refund_mode: "cash".into(), by: "Lakshmi".into(), manager_pin: "2222".into() },
    )
    .unwrap()
}

#[test]
fn returns_reverse_the_same_tax_heads_as_the_bill_and_point_back_at_it() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let pune = customer(c, "Pune Traders", "27AAPFU0939F1ZV", "");
        let local_b2b = customer(c, "Local Mess", "33AAKFG4821M1Z9", "");
        for (who, inter, b2b) in [(None, false, false), (Some(kerala), true, false), (Some(pune), true, true), (Some(local_b2b), false, true)] {
            let bill = save_bill(c, &draft_for(who.as_deref()))?;
            let cn = return_all(c, &bill);
            // a full return of the whole bill reverses exactly what the bill charged
            assert_eq!(cn.totals.grand, bill.totals.grand);
            assert_eq!(slab_sums_cn(&cn), slab_sums(&bill), "inter {inter} b2b {b2b}: the credit note reverses every tax head of the bill");
            let (_, cgst, sgst, igst, _) = slab_sums_cn(&cn);
            if inter {
                assert!(igst > 0 && cgst == 0 && sgst == 0);
            } else {
                assert!(igst == 0 && cgst > 0);
            }
            // the note names the invoice it is against, its date, the place of supply and the recipient's GSTIN
            assert_eq!(cn.bill_number, bill.number);
            assert_eq!(cn.bill_at, bill.at);
            assert_eq!(cn.supply_type, if inter { "inter" } else { "intra" });
            assert_eq!(cn.place_of_supply, bill.extras.place_of_supply);
            assert_eq!(cn.customer_gstin, bill.extras.customer_gstin);
            assert!(!cn.number.is_empty() && cn.number.starts_with("CN-"), "own number series: {}", cn.number);
            // every credit note line carries its HSN and a tax split that adds up
            let mut sum = (0, 0, 0, 0, 0);
            for l in &cn.lines {
                assert!(!l.hsn.is_empty());
                let t = l.tax.as_ref().unwrap();
                sum = (sum.0 + t.taxable, sum.1 + t.cgst, sum.2 + t.sgst, sum.3 + t.igst, sum.4 + t.cess);
            }
            assert_eq!(sum, slab_sums_cn(&cn));
            let detail = get_bill_detail(c, &bill.id)?.unwrap();
            assert_eq!(detail.credit_notes.len(), 1);
            assert_eq!(detail.credit_notes[0].number, cn.number);
        }
        Ok(())
    })
    .unwrap();
}

fn slab_sums_cn(n: &CreditNote) -> (i64, i64, i64, i64, i64) {
    let s = &n.totals.slabs;
    (s.iter().map(|x| x.taxable).sum(), s.iter().map(|x| x.cgst).sum(), s.iter().map(|x| x.sgst).sum(), s.iter().map(|x| x.igst).sum(), s.iter().map(|x| x.cess).sum())
}

#[test]
fn a_part_return_of_an_inter_state_bill_is_igst_too() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let bill = save_bill(c, &draft_for(Some(&kerala)))?;
        let cn = create_return(
            c,
            &ReturnRequest {
                bill_id: bill.id.clone(),
                picks: vec![ReturnPick { line_index: 0, qty: 1000 }],
                reason: "Wrong pack".into(),
                refund_mode: "cash".into(),
                by: "Lakshmi".into(),
                manager_pin: "2222".into(),
            },
        )?;
        let (taxable, cgst, sgst, igst, _) = slab_sums_cn(&cn);
        assert_eq!((cgst, sgst), (0, 0));
        assert!(igst > 0 && taxable > 0);
        assert_eq!(taxable + igst, cn.totals.before_round);
        Ok(())
    })
    .unwrap();
}

#[test]
fn old_rows_get_their_line_taxes_from_the_backfill_exactly_as_the_engine_wrote_them() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut d = draft_for(None);
        d.extras.delivery_charge = 5_000;
        d.payments[0].amount += 5_000;
        let bill = save_bill(c, &d)?;
        let cn = return_all(c, &bill);
        // a written bill line cannot be changed, not even its tax split
        assert!(c.execute("UPDATE bill_lines SET igst=igst+1", []).is_err());
        assert!(c.execute("UPDATE bill_lines SET hsn='9999'", []).is_err());
        assert!(c.execute("UPDATE bill_lines SET qty=qty+1", []).is_err());
        // pretend these rows were written before migration 19 (the test lifts the guard to put the old state back)
        c.execute_batch("DROP TRIGGER no_update_bill_lines")?;
        c.execute("UPDATE bill_lines SET hsn='',taxable=0,cgst=0,sgst=0,igst=0,cess=0", [])?;
        c.execute("UPDATE credit_note_lines SET hsn='',taxable=0,cgst=0,sgst=0,igst=0,cess=0", [])?;
        c.execute("UPDATE bills SET place_of_supply='',supply_type='intra',cust_gstin='',cust_address=''", [])?;
        c.execute("UPDATE credit_notes SET place_of_supply=''", [])?;
        backfill_line_taxes(c)?;
        let back = get_bill(c, &bill.id)?.unwrap();
        assert_eq!(back.lines, bill.lines, "every line, its HSN and its tax split, identical to what the engine wrote");
        assert_eq!(back.extras.place_of_supply, "33");
        assert_lines_tie(&back);
        let detail = get_bill_detail(c, &bill.id)?.unwrap();
        assert_eq!(detail.credit_notes[0].lines, cn.lines);
        Ok(())
    })
    .unwrap();
}

#[test]
fn reports_show_igst_and_the_hsn_rows_tie_to_the_bills() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let pune = customer(c, "Pune Traders", "27AAPFU0939F1ZV", "");
        let a = save_bill(c, &draft_for(None))?;
        let b = save_bill(c, &draft_for(Some(&kerala)))?;
        let e = save_bill(c, &draft_for(Some(&pune)))?;
        let today = gokul_core::db::day_of(chrono::Local::now());
        let p: reports::ReportParams = de(json!({ "from": today, "to": today }));
        let all = [&a, &b, &e];
        let (mut taxable, mut cgst, mut sgst, mut igst) = (0, 0, 0, 0);
        for bill in all {
            let s = slab_sums(bill);
            taxable += s.0;
            cgst += s.1;
            sgst += s.2;
            igst += s.3;
        }
        assert!(igst > 0 && cgst > 0);
        let g1 = reports::run_report(c, "gstr1", &p)?;
        let t = &g1["totals"];
        assert_eq!((t["taxable"].as_i64(), t["cgst"].as_i64(), t["sgst"].as_i64(), t["igst"].as_i64()), (Some(taxable), Some(cgst), Some(sgst), Some(igst)));
        assert_eq!(g1["kpis"][2]["value"], 1, "only the bill to Pune carries a GSTIN");
        let tr = reports::run_report(c, "tax-rate", &p)?;
        assert_eq!(tr["totals"]["igst"].as_i64(), Some(igst));
        let hsn = reports::run_report(c, "hsn-wise", &p)?;
        let h = &hsn["totals"];
        assert_eq!((h["taxable"].as_i64(), h["cgst"].as_i64(), h["sgst"].as_i64(), h["igst"].as_i64()), (Some(taxable), Some(cgst), Some(sgst), Some(igst)), "HSN rows add up to the bills");
        let g3 = reports::run_report(c, "gstr3b", &p)?;
        assert_eq!(g3["rows"][1]["igst"].as_i64(), Some(igst));
        Ok(())
    })
    .unwrap();
}

/// The real upgrade path: a database at schema 18 with a bill, a bill with a discount and delivery, and a credit note is brought up
/// to 19 by the migration runner (the saved-line guard stays in force afterwards).
#[test]
fn a_version_18_database_upgrades_and_every_old_line_gets_its_tax_split() {
    use gokul_core::money::{compute_bill, recalc_line, Delivery};
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.db");
    let mut conn = gokul_core::db::open_connection(&path).unwrap();
    gokul_core::db::migrate_up_to(&mut conn, 18).unwrap();
    assert_eq!(conn.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0)).unwrap(), 18);
    conn.execute_batch(
        "INSERT INTO categories(id,name,sort) VALUES('oil','Oils',0);
         INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at) VALUES
           ('i1','101','Oil','oil','G','btl',0,'1508',5,40000,38000,30000,0,0,1,'2026-01-01'),
           ('i3','103','Soap','oil','G','pc',0,'3401',18,12000,11801,8000,0,0,1,'2026-01-01'),
           ('_delivery','DELIVERY','Delivery charge','oil','','pc',0,'9965',18,0,0,0,0,0,0,'2026-01-01');
         INSERT INTO customers(id,name,phone,credit_limit,outstanding,created_at,gstin,address) VALUES('c1','Mess','98400','0',0,'2026-01-01','27AAPFU0939F1ZV','5 Cross');",
    )
    .unwrap();
    // the old engine's numbers for: oil 380 x2 (5%), soap 118.01 (18%), bill discount 7.77, delivery 50 at 18%
    let lines: Vec<BillLine> = vec![line("i1", "101", "Oil", 2000, 38_000, 5), line("i3", "103", "Soap", 1000, 11_801, 18)].iter().map(recalc_line).collect();
    let (t, taxes) = compute_bill(&lines, 777, true, false, Some(Delivery { amount: 5_000, gst_rate: 18.0, cess_rate: 0.0 }));
    conn.execute(
        "INSERT INTO bills(number,series,fy,seq,at,day,cashier,counter,customer_id,customer_name,status,item_count,qty_count,gross,discount,bill_discount,taxable,gst,before_round,round_off,grand)
         VALUES('GK-26-000001','BILL','2026-27',1,'2026-11-01T05:00:00.000Z','2026-11-01','K','C1','c1','Mess','paid',2,3000,?1,?2,777,?3,?4,?5,?6,?7)",
        rusqlite::params![t.gross, t.discount, t.taxable, t.gst, t.before_round, t.round_off, t.grand],
    )
    .unwrap();
    for (i, l) in lines.iter().enumerate() {
        conn.execute(
            "INSERT INTO bill_lines(bill_id,line_no,item_id,code,name,unit,qty,rate,discount,gst_rate,amount) VALUES(1,?1,?2,?3,?4,'pc',?5,?6,?7,?8,?9)",
            rusqlite::params![i as i64, l.item_id, l.code, l.name, l.qty, l.rate, l.discount, l.gst_rate, l.amount],
        )
        .unwrap();
    }
    conn.execute("INSERT INTO bill_lines(bill_id,line_no,item_id,code,name,unit,qty,rate,discount,gst_rate,amount) VALUES(1,2,'_delivery','DLV','Delivery charge','pc',1000,5000,0,18,5000)", []).unwrap();
    for s in &t.slabs {
        conn.execute("INSERT INTO bill_slabs(bill_id,rate,taxable,cgst,sgst) VALUES(1,?1,?2,?3,?4)", rusqlite::params![s.rate, s.taxable, s.cgst, s.sgst]).unwrap();
    }
    // upgrade
    gokul_core::db::migrate(&mut conn).unwrap();
    assert_eq!(conn.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0)).unwrap(), gokul_core::db::latest_version());
    let bill = get_bill(&conn, "b1").unwrap().unwrap();
    assert_eq!(bill.extras.place_of_supply, "33");
    assert_eq!(bill.extras.supply_type, "intra");
    assert_eq!(bill.extras.customer_gstin, "27AAPFU0939F1ZV", "the customer's real GSTIN is the best record of an old invoice");
    assert_eq!(bill.lines.len(), 3);
    for (l, want) in bill.lines.iter().zip(taxes.iter()) {
        assert_eq!(l.tax.as_ref().unwrap(), want, "{}", l.name);
    }
    assert_eq!(bill.lines[0].hsn, "1508");
    assert_eq!(bill.lines[2].hsn, "9965");
    assert_lines_tie(&bill);
    // and the lines stay locked
    assert!(conn.execute("UPDATE bill_lines SET cgst=cgst+1", []).is_err());
    assert!(conn.execute("UPDATE bill_lines SET amount=amount+1", []).is_err());
}
