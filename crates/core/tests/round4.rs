//! Round 4: staff per bill, home delivery, wholesale, cash discount, Sodexo, customer fields, POS reports and cost privacy.
mod common;
use common::*;
use gokul_core::db::Db;
use gokul_core::money::{cash_discount, compute_totals, compute_totals_with_delivery, recalc_line};
use gokul_core::types::*;
use gokul_core::{bills, dispatch_session, Session};
use serde_json::{json, Value};

fn call(db: &Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}
fn sign_in(db: &Db, s: &Session, user: &str, pin: &str) {
    assert!(!call(db, s, "verifyPin", json!([user, pin])).unwrap().is_null());
}
fn cashier(db: &Db) -> Session {
    let s = Session::pos();
    sign_in(db, &s, "u3", "1234");
    s
}
fn owner(db: &Db) -> Session {
    let s = Session::office();
    sign_in(db, &s, "u1", "1111");
    s
}

fn two_lines() -> Vec<BillLine> {
    vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5), line("i3", "103", "Dish Wash Bar", 3000, 3_800, 18)]
}

/// A draft whose payment equals what the server will compute for these extras.
fn draft_extras(lines: Vec<BillLine>, ex: BillExtras, gst_on_delivery: i64, mode: &str) -> BillDraft {
    let ls: Vec<BillLine> = lines.iter().map(recalc_line).collect();
    let cash = cash_discount(&ls, ex.cash_disc_bps);
    let grand = compute_totals_with_delivery(&ls, cash, true, ex.delivery_charge, gst_on_delivery).grand;
    BillDraft {
        customer_id: None,
        customer_name: None,
        lines,
        bill_discount: 0,
        payments: vec![Payment { mode: mode.into(), amount: grand, r#ref: None }],
        cashier: Some("Karthik".into()),
        manager_pin: None,
        extras: ex,
    }
}

#[test]
fn cash_discount_is_a_separate_gst_correct_bill_discount() {
    let (_d, db) = mini_db();
    let ex = BillExtras { cash_disc_bps: 500, staff: "Ravi".into(), ..Default::default() };
    let draft = draft_extras(two_lines(), ex, 0, "cash");
    let bill = db.with(|c| bills::save_bill(c, &draft)).unwrap();
    let ls: Vec<BillLine> = two_lines().iter().map(recalc_line).collect();
    let net: i64 = ls.iter().map(|l| l.amount).sum();
    assert_eq!(bill.extras.cash_disc, (net * 5 + 50) / 100, "5% of the item net");
    assert_eq!(bill.extras.cash_disc_bps, 500);
    assert_eq!(bill.totals.discount, bill.extras.cash_disc, "no item discount, so the whole discount is the cash discount");
    // GST is on the discounted value: slabs add up to the bill before round-off
    let slab_sum: i64 = bill.totals.slabs.iter().map(|s| s.taxable + s.cgst + s.sgst).sum();
    assert_eq!(slab_sum, bill.totals.before_round);
    let same = compute_totals(&ls, bill.extras.cash_disc, true);
    assert_eq!(same.grand, bill.totals.grand);
    // reload shows the same thing
    let again = db.with(|c| bills::get_bill(c, &bill.id)).unwrap().unwrap();
    assert_eq!(again.extras.cash_disc, bill.extras.cash_disc);
    assert_eq!(again.extras.staff, "Ravi");
    // wrong payment is still refused
    let mut bad = draft_extras(two_lines(), BillExtras { cash_disc_bps: 500, ..Default::default() }, 0, "cash");
    bad.payments[0].amount += 100;
    assert!(db.with(|c| bills::save_bill(c, &bad)).is_err());
    let mut over = draft_extras(two_lines(), BillExtras::default(), 0, "cash");
    over.extras.cash_disc_bps = 20000;
    assert!(db.with(|c| bills::save_bill(c, &over)).is_err());
}

#[test]
fn home_delivery_adds_a_service_line_with_the_setting_gst() {
    let (_d, db) = mini_db();
    for gst in [0, 18] {
        db.with(|c| gokul_core::db::set_setting(c, "deliveryGstRate", &gst.to_string())).unwrap();
        let ex = BillExtras { delivery_charge: 5_000, delivery_address: "12 Mill Road".into(), delivery_locality: "Karur".into(), ..Default::default() };
        let draft = draft_extras(two_lines(), ex, gst, "cash");
        let before = db.with(|c| Ok(stock_of(c, "i1"))).unwrap();
        let bill = db.with(|c| bills::save_bill(c, &draft)).unwrap();
        let del = bill.lines.iter().find(|l| l.name == "Delivery charge").expect("delivery line");
        assert_eq!((del.amount, del.gst_rate), (5_000, gst));
        assert_eq!(bill.totals.item_count, 2, "delivery is not counted as an item");
        let slab_sum: i64 = bill.totals.slabs.iter().map(|s| s.taxable + s.cgst + s.sgst).sum();
        assert_eq!(slab_sum, bill.totals.before_round);
        assert_eq!(bill.extras.delivery_address, "12 Mill Road");
        // no stock moves for the delivery service, and the hidden item never shows in lists
        assert_eq!(db.with(|c| Ok(stock_of(c, "i1"))).unwrap(), before - 2000);
        let items = db.with(|c| gokul_core::store::list_items(c)).unwrap();
        assert!(items.iter().all(|i| i.id != "_delivery"));
        // GST on the delivery is part of the 18% slab only when the setting says so
        let t = compute_totals_with_delivery(&two_lines().iter().map(recalc_line).collect::<Vec<_>>(), 0, true, 5_000, gst);
        assert_eq!(t.grand, bill.totals.grand);
    }
}

#[test]
fn wholesale_price_needs_no_pin_but_any_other_price_does() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("UPDATE items SET wholesale_price=32000 WHERE id='i1'", [])?;
        Ok(())
    })
    .unwrap();
    let s = cashier(&db);
    let items = call(&db, &s, "listItems", json!([])).unwrap();
    assert_eq!(items[0]["wholesalePrice"], 32000);
    let mut l = line("i1", "101", "Groundnut Oil 1 L", 1000, 32_000, 5);
    l.amount = 0;
    let mut d = draft_extras(vec![l.clone()], BillExtras { wholesale: true, ..Default::default() }, 0, "cash");
    d.cashier = None;
    call(&db, &s, "saveBill", json!([d])).expect("wholesale price is allowed");
    // same price on a retail bill is a price change
    let mut d2 = draft_extras(vec![l.clone()], BillExtras::default(), 0, "cash");
    d2.cashier = None;
    let e = call(&db, &s, "saveBill", json!([d2])).unwrap_err();
    assert!(e.contains("manager PIN"), "{e}");
    // some other price on a wholesale bill is also a price change
    let mut l3 = l;
    l3.rate = 31_000;
    let d3 = draft_extras(vec![l3], BillExtras { wholesale: true, ..Default::default() }, 0, "cash");
    assert!(call(&db, &s, "saveBill", json!([d3])).unwrap_err().contains("manager PIN"));
}

#[test]
fn cash_discount_counts_towards_the_discount_limit() {
    let (_d, db) = mini_db();
    let s = cashier(&db);
    let d = draft_extras(two_lines(), BillExtras { cash_disc_bps: 4000, ..Default::default() }, 0, "cash");
    let e = call(&db, &s, "saveBill", json!([d])).unwrap_err();
    assert!(e.contains("manager PIN") && e.contains("discount"), "{e}");
}

#[test]
fn sodexo_is_a_payment_mode_and_survives_reload() {
    let (_d, db) = mini_db();
    let mut d = draft_extras(two_lines(), BillExtras::default(), 0, "cash");
    let total = d.payments[0].amount;
    d.payments = vec![
        Payment { mode: "cash".into(), amount: total - 10_000, r#ref: None },
        Payment { mode: "sodexo".into(), amount: 10_000, r#ref: None },
    ];
    let bill = db.with(|c| bills::save_bill(c, &d)).unwrap();
    let again = db.with(|c| bills::get_bill(c, &bill.id)).unwrap().unwrap();
    assert!(again.payments.iter().any(|p| p.mode == "sodexo" && p.amount == 10_000));
    let s = owner(&db);
    let r = call(&db, &s, "paymodeReport", json!([{}])).unwrap();
    assert_eq!(r["totals"]["sodexo"], 10_000);
    assert_eq!(r["totals"]["cash"], total - 10_000);
    assert_eq!(r["totals"]["total"], total);
    // cancelling a Sodexo bill must work (it is not store credit)
    let cancelled = call(&db, &s, "cancelBill", json!([{ "billId": bill.id, "reason": "test", "by": "x", "managerPin": "1111" }]));
    assert!(cancelled.is_ok(), "{cancelled:?}");
}

#[test]
fn held_bill_keeps_staff_delivery_and_wholesale() {
    let (_d, db) = mini_db();
    let ex = BillExtras { staff: "Ravi".into(), wholesale: true, delivery_charge: 3_000, delivery_locality: "Karur".into(), cash_disc_bps: 250, ..Default::default() };
    let mut d = draft_extras(two_lines(), ex.clone(), 0, "cash");
    d.payments.clear();
    let h = db.with(|c| bills::hold_bill(c, &d)).unwrap();
    let list = db.with(|c| bills::list_held(c)).unwrap();
    assert_eq!(list[0].extras, ex);
    assert_eq!(h.extras, ex);
    let back = db.with(|c| bills::recall_held(c, &h.id)).unwrap().unwrap();
    assert_eq!(back.extras.staff, "Ravi");
}

#[test]
fn sales_and_paymode_reports_and_cost_privacy() {
    let (_d, db) = mini_db();
    for staff in ["Ravi", "Ravi", "Mala"] {
        let d = draft_extras(two_lines(), BillExtras { staff: staff.into(), ..Default::default() }, 0, "cash");
        db.with(|c| bills::save_bill(c, &d)).unwrap();
    }
    let o = owner(&db);
    let r = call(&db, &o, "salesReport", json!([{}])).unwrap();
    assert_eq!(r["rows"].as_array().unwrap().len(), 3);
    assert!(r["totals"]["profit"].as_i64().unwrap() > 0, "owner sees profit");
    assert!(r["rows"][0]["lines"][0].get("cost").is_some());
    let only = call(&db, &o, "salesReport", json!([{ "staff": "Mala" }])).unwrap();
    assert_eq!(only["rows"].as_array().unwrap().len(), 1);
    let staff = call(&db, &o, "staffReport", json!([{}])).unwrap();
    assert_eq!(staff["rows"][0]["staff"], "Ravi");
    assert_eq!(staff["rows"][0]["bills"], 2);

    // a cashier gets the same report with every cost and profit key removed, server side
    let c = cashier(&db);
    let r = call(&db, &c, "salesReport", json!([{ "from": "2000-01-01", "to": "2000-01-02" }])).unwrap();
    assert_eq!(r["rows"].as_array().unwrap().len(), 3, "a cashier is held to today whatever dates are sent");
    let text = r.to_string();
    for k in ["\"profit\"", "\"cost\"", "profitTotal", "costTotal"] {
        assert!(!text.contains(k), "cashier response leaked {k}");
    }
    assert!(r["rows"][0]["total"].as_i64().unwrap() > 0);
    let stock = call(&db, &c, "stockReport", json!([{}])).unwrap().to_string();
    assert!(!stock.contains("\"cost\"") && !stock.contains("profit") && !stock.contains("costTotal"), "{stock}");
    assert!(stock.contains("salesTotal"));
    let items = call(&db, &c, "listItems", json!([])).unwrap().to_string();
    assert!(!items.contains("\"cost\""));
    let owner_stock = call(&db, &o, "stockReport", json!([{ "query": "dish" }])).unwrap();
    assert_eq!(owner_stock["rows"].as_array().unwrap().len(), 1);
    assert!(owner_stock["rows"][0]["cost"].as_i64().unwrap() > 0);
    assert!(owner_stock["totals"]["costTotal"].as_i64().unwrap() > 0);
}

#[test]
fn staff_list_and_customer_profile_fields() {
    let (_d, db) = mini_db();
    let s = owner(&db);
    let staff = call(&db, &s, "addStaff", json!(["  Selvi "])).unwrap();
    assert!(staff.as_array().unwrap().iter().any(|x| x["name"] == "Selvi"));
    assert!(call(&db, &s, "addStaff", json!(["  "])).is_err());
    let c = call(
        &db,
        &s,
        "saveCustomer",
        json!([{ "name": "Anbu", "phone": "99999 00000", "area": "Karur", "type": "retail", "creditLimit": 100000,
                 "fatherName": "Raman", "dob": "1990-05-21", "anniversary": "2015-02-14", "gstin": "33AAKFG4821M1ZQ", "pan": "abcde1234f",
                 "locality": "Thanthonimalai", "route": "R2", "creditDays": 15, "openingBalance": 25000 }]),
    )
    .unwrap();
    assert_eq!((c["fatherName"].as_str(), c["pan"].as_str(), c["route"].as_str()), (Some("Raman"), Some("ABCDE1234F"), Some("R2")));
    assert_eq!((c["creditDays"].as_i64(), c["openingBalance"].as_i64()), (Some(15), Some(25000)));
    assert_eq!(c["gstin"], "33AAKFG4821M1ZQ");
    let bad = call(&db, &s, "saveCustomer", json!([{ "name": "Bad", "type": "retail", "dob": "21/05/1990" }]));
    assert!(bad.is_err());
    let rows = call(&db, &s, "listCustomerRows", json!([])).unwrap();
    assert!(rows.as_array().unwrap().iter().any(|r| r["name"] == "Anbu" && r["locality"] == "Thanthonimalai"));
}

/// The upgrade must keep a shop's existing data: build a version-7 database by hand, then open it with the new code.
#[test]
fn migration_008_keeps_existing_data() {
    use rusqlite::Connection;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    {
        let mut conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let old: [&str; 7] = [
            include_str!("../migrations/001_init.sql"),
            include_str!("../migrations/002_office.sql"),
            include_str!("../migrations/003_security.sql"),
            include_str!("../migrations/004_money_mill.sql"),
            include_str!("../migrations/005_loyalty_credit.sql"),
            include_str!("../migrations/006_points_hundredths.sql"),
            include_str!("../migrations/007_shelf_life.sql"),
        ];
        for (i, sql) in old.iter().enumerate() {
            let tx = conn.transaction().unwrap();
            tx.execute_batch(sql).unwrap();
            tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1)).unwrap();
            tx.commit().unwrap();
        }
        conn.execute("INSERT INTO categories(id,name,sort) VALUES('oil','Oils',0)", []).unwrap();
        conn.execute(
            "INSERT INTO users(id,name,role,initials,color,pin_hash,created_at) VALUES('u1','Suresh','owner','S','#000','x','2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES('i1','101','G7 Sesame Oil 1L','oil','Gokul','btl',0,'1515',5,60000,60000,40000,10000,0,1,'2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO customers(id,name,phone,created_at) VALUES('c1','Murugan','98400 11111','2026-01-01')", []).unwrap();
    }
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        assert_eq!(v, gokul_core::db::latest_version());
        let name: String = c.query_row("SELECT name FROM items WHERE id='i1'", [], |r| r.get(0))?;
        assert_eq!(name, "G7 Sesame Oil 1L");
        let (wp, locality): (Option<i64>, String) = c.query_row(
            "SELECT i.wholesale_price, c.locality FROM items i, customers c WHERE i.id='i1' AND c.id='c1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        assert_eq!((wp, locality.as_str()), (None, ""));
        let staff: i64 = c.query_row("SELECT COUNT(*) FROM staff WHERE name='Suresh'", [], |r| r.get(0))?;
        assert_eq!(staff, 1, "existing users become staff choices");
        Ok(())
    })
    .unwrap();
    // reopening is harmless
    drop(db);
    Db::open(&path).unwrap();
}

#[test]
fn manual_line_always_needs_a_pin_for_a_cashier_and_is_billed_without_stock() {
    let (_d, db) = mini_db();
    let s = cashier(&db);
    let mut l = line("_manual", "MAN", "Plastic can 5 L", 1000, 12_000, 18);
    l.unit = "pc".into();
    let mut d = draft_extras(vec![l.clone()], BillExtras::default(), 0, "cash");
    d.cashier = None;
    let e = call(&db, &s, "saveBill", json!([d])).unwrap_err();
    assert!(e.contains("manager PIN"), "{e}");
    // with a manager's PIN it saves; the hidden item never shows up in lists or stock
    let mut d = draft_extras(vec![l], BillExtras::default(), 0, "cash");
    d.cashier = None;
    d.manager_pin = Some("2222".into());
    let bill: Value = call(&db, &s, "saveBill", json!([d])).unwrap();
    assert_eq!(bill["lines"][0]["name"], "Plastic can 5 L");
    let items = call(&db, &s, "listItems", json!([])).unwrap();
    assert!(items.as_array().unwrap().iter().all(|i| i["id"] != "_manual" && i["id"] != "_delivery"));
    let stock = call(&db, &owner(&db), "stockReport", json!([{}])).unwrap().to_string();
    assert!(!stock.contains("Manual item"));
}
