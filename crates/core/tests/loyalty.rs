//! Loyalty points, store credit, the one credit rule, and the upgrade of an existing database in place.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::db::set_setting;
use gokul_core::printing;
use gokul_core::types::*;
use gokul_core::{billops, dispatch_session, loyalty, Db, Session};
use rusqlite::Connection;
use serde_json::{json, Value};

fn oil(qty: i64) -> Vec<BillLine> {
    vec![line("i1", "101", "Groundnut Oil 1 L", qty, 36_000, 5)] // Rs 360 each
}

fn pay(mode: &str, amount: i64, r: Option<&str>) -> Payment {
    Payment { mode: mode.into(), amount, r#ref: r.map(String::from) }
}

fn ledger_matches_customer(c: &Connection, cid: &str) {
    let cached: i64 = c.query_row("SELECT loyalty_points FROM customers WHERE id=?1", [cid], |r| r.get(0)).unwrap();
    assert_eq!(cached, loyalty::balance(c, cid).unwrap(), "customers.loyalty_points is always the sum of the ledger");
}

/// Gives whole points (the database counts hundredths of a point).
fn give_points(c: &Connection, cid: &str, pts: i64) {
    let pts = pts * 100;
    c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,'2026-01-01T00:00:00Z','adjust',?2,'test','t')", rusqlite::params![cid, pts]).unwrap();
    c.execute("UPDATE customers SET loyalty_points=?2 WHERE id=?1", rusqlite::params![cid, pts]).unwrap();
}

#[test]
fn earn_one_point_per_100_rupees_with_two_decimals_excluding_credit_note_part() {
    let (_d, db) = mini_db();
    db.with(|c| {
        // Balances below are in hundredths of a point: Rs 1,080 (3 x 360) in cash earns 10.80 points
        let b = save_bill(c, &draft_with(oil(3000), 0, Some("c1"), "cash"))?;
        assert_eq!(b.totals.grand, 108_000);
        assert_eq!(loyalty::balance(c, "c1")?, 1080);
        assert_eq!(loyalty::fmt_points(1080), "10.80");
        // Rs 360 gives 3.60 points (nothing is rounded down to 3)
        save_bill(c, &draft_with(oil(1000), 0, Some("c1"), "cash"))?;
        assert_eq!(loyalty::balance(c, "c1")?, 1440);
        // a bill with no customer earns nothing and breaks nothing
        save_bill(c, &cash_draft(oil(1000)))?;
        assert_eq!(loyalty::balance(c, "c1")?, 1440);
        // discount: earn on the net after discount (Rs 360 - Rs 60 = Rs 300 = 3.00 points)
        save_bill(c, &draft_with(oil(1000), 6_000, Some("c1"), "cash"))?;
        assert_eq!(loyalty::balance(c, "c1")?, 1740);
        ledger_matches_customer(c, "c1");
        // the part paid with a credit note earns nothing: Rs 720 bill, Rs 360 by credit note, 3.60 points only
        let first = save_bill(c, &draft_with(oil(1000), 0, Some("c1"), "cash"))?;
        let cn = billops::create_return(
            c,
            &ReturnRequest { bill_id: first.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "x".into(), refund_mode: "credit_note".into(), by: "Karthik".into(), manager_pin: "2222".into() },
        )?;
        let before = loyalty::balance(c, "c1")?;
        let mut d = draft_with(oil(2000), 0, Some("c1"), "cash");
        d.payments = vec![pay("credit_note", 36_000, Some(&cn.number)), pay("cash", 36_000, None)];
        save_bill(c, &d)?;
        // the return took back the 3.60 points of `first`, the new bill earns 3.60 on the cash half
        assert_eq!(loyalty::balance(c, "c1")?, before + 360);
        // Rs 460 earns exactly 4.60
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.lines[0].rate = 46_000;
        d.lines[0].amount = 46_000;
        d.payments = vec![pay("cash", 46_000, None)];
        let before = loyalty::balance(c, "c1")?;
        let b = save_bill(c, &d)?;
        assert_eq!(b.totals.grand, 46_000);
        assert_eq!(loyalty::balance(c, "c1")? - before, 460, "Rs 460 earns 4.60 points");
        ledger_matches_customer(c, "c1");
        Ok(())
    })
    .unwrap();
}

#[test]
fn redeem_rules_balance_minimum_and_share_of_the_bill() {
    let (_d, db) = mini_db();
    db.with(|c| {
        give_points(c, "c1", 150);
        // 1 point = Rs 1 (100 paise). Rs 360 bill; 100 points = Rs 100 off
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("points", 10_000, None), pay("cash", 26_000, None)];
        let b = save_bill(c, &d)?;
        assert_eq!(b.payments[0].mode, "points");
        // 150 - 100 redeemed + earn on Rs 260 cash (2.60 points)
        assert_eq!(loyalty::balance(c, "c1")?, (150 - 100) * 100 + 260);
        ledger_matches_customer(c, "c1");
        // below the minimum (100) is refused and nothing is saved
        let n = count(c, "bills");
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("points", 5_000, None), pay("cash", 31_000, None)];
        assert!(save_bill(c, &d).unwrap_err().to_string().contains("At least 100 points"));
        assert_eq!(count(c, "bills"), n);
        Ok(())
    })
    .unwrap();
    db.with(|c| {
        // more than the customer has
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("points", 20_000, None), pay("cash", 16_000, None)];
        assert!(save_bill(c, &d).unwrap_err().to_string().contains("does not have that many"));
        // share of the bill: max 50%
        set_setting(c, "loyalty.maxPct", "50")?;
        give_points(c, "c1", 500);
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("points", 20_000, None), pay("cash", 16_000, None)];
        assert!(save_bill(c, &d).unwrap_err().to_string().contains("at most 50%"));
        // no customer, no points
        let mut d = cash_draft(oil(1000));
        d.payments = vec![pay("points", 10_000, None), pay("cash", 26_000, None)];
        assert!(save_bill(c, &d).is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn cancel_and_return_reverse_points_and_nothing_is_ever_deleted() {
    let (_d, db) = mini_db();
    db.with(|c| {
        give_points(c, "c1", 200);
        let mut d = draft_with(oil(3000), 0, Some("c1"), "cash"); // Rs 1,080
        d.payments = vec![pay("points", 10_000, None), pay("cash", 98_000, None)];
        let b = save_bill(c, &d)?;
        // 200 - 100 + earn(Rs 980 = 9.80)
        assert_eq!(loyalty::balance(c, "c1")?, 10_980);
        // return one of three: take back a third of 9.80 = 3.26 points
        billops::create_return(
            c,
            &ReturnRequest { bill_id: b.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "x".into(), refund_mode: "cash".into(), by: "Karthik".into(), manager_pin: "2222".into() },
        )?;
        assert_eq!(loyalty::balance(c, "c1")?, 10_654);
        ledger_matches_customer(c, "c1");

        Ok(())
    })
    .unwrap();
}

#[test]
fn cancelling_gives_points_back() {
    let (_d, db) = mini_db();
    let b2 = db
        .with(|c| {
            give_points(c, "c1", 200);
            let mut d = draft_with(oil(2000), 0, Some("c1"), "cash"); // Rs 720
            d.payments = vec![pay("points", 10_000, None), pay("cash", 62_000, None)];
            Ok(save_bill(c, &d)?)
        })
        .unwrap();
    db.with(|c| { assert_eq!(loyalty::balance(c, "c1")?, (200 - 100) * 100 + 620); Ok(()) }).unwrap();
    let s = Session::pos();
    assert!(!call(&db, &s, "verifyPin", json!(["u3", "1234"])).unwrap().is_null());
    let r = call(&db, &s, "cancelBill", json!([{ "billId": b2.id, "reason": "wrong", "managerPin": "2222", "by": "x" }]));
    assert!(r.is_ok(), "{r:?}");
    db.with(|c| {
        assert_eq!(loyalty::balance(c, "c1")?, 20_000, "redeemed points back, earned points taken back");
        ledger_matches_customer(c, "c1");
        // the ledger only ever grows
        assert!(c.execute("DELETE FROM points_ledger", []).is_err());
        assert!(c.execute("UPDATE points_ledger SET points=999", []).is_err());
        let wallet = loyalty::wallet(c, "c1")?;
        assert_eq!(wallet["points"], json!(200.0));
        assert_eq!(wallet["pointsValue"], 20_000);
        Ok(())
    })
    .unwrap();
}

fn call(db: &Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}

#[test]
fn store_credit_can_be_spent_in_parts() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let first = save_bill(c, &draft_with(oil(2000), 0, Some("c1"), "cash"))?; // Rs 720
        let cn = billops::create_return(
            c,
            &ReturnRequest { bill_id: first.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 2000 }], reason: "x".into(), refund_mode: "credit_note".into(), by: "Karthik".into(), manager_pin: "2222".into() },
        )?;
        assert_eq!(loyalty::wallet(c, "c1")?["storeCredit"], 72_000);
        // spend Rs 360 of it
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("credit_note", 36_000, Some(&cn.number))];
        let b = save_bill(c, &d)?;
        let w = loyalty::wallet(c, "c1")?;
        assert_eq!(w["storeCredit"], 36_000, "half is left");
        assert_eq!(w["creditNotes"][0]["balance"], 36_000);

        // The printed bill shows the store credit used and the balance the customer still has on the wallet.
        let cfg = printing::load_config(c)?;
        let doc = printing::bill_doc(c, &cfg, &b.id, false, 0)?;
        let text = gokul_print::layout::to_text(&gokul_print::layout(&doc.doc, cfg.paper));
        assert!(text.contains("Store credit used") && text.contains("-360.00"), "{text}");
        assert!(text.contains("Store credit balance : 360.00"), "{text}");
        // cannot spend more than is left
        let mut d = draft_with(oil(2000), 0, Some("c1"), "cash");
        d.payments = vec![pay("credit_note", 72_000, Some(&cn.number))];
        assert!(save_bill(c, &d).unwrap_err().to_string().contains("has only"));
        // spend the rest
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash");
        d.payments = vec![pay("credit_note", 36_000, Some(&cn.number))];
        save_bill(c, &d)?;
        assert_eq!(loyalty::wallet(c, "c1")?["storeCredit"], 0);
        let _ = b;
        Ok(())
    })
    .unwrap();
}

#[test]
fn one_credit_rule_zero_means_not_allowed_minus_one_means_no_limit() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,created_at) VALUES('c0','jk','98400 00000',0,0,'2026-01-01T00:00:00Z')", [])?;
        Ok(())
    })
    .unwrap();
    let cashier = Session::pos();
    assert!(!call(&db, &cashier, "verifyPin", json!(["u3", "1234"])).unwrap().is_null());
    let draft = |cust: &str, pin: Option<&str>| {
        let mut d = draft_with(oil(1000), 0, Some(cust), "credit");
        d.manager_pin = pin.map(String::from);
        serde_json::to_value(d).unwrap()
    };
    // credit not allowed: needs a manager PIN, with or without a limit-based message
    let e = call(&db, &cashier, "saveBill", json!([draft("c0", None)])).unwrap_err();
    assert!(e.contains("A manager PIN is needed to sell on credit to a customer who has no credit account"), "{e}");
    assert!(call(&db, &cashier, "saveBill", json!([draft("c0", Some("9999"))])).is_err());
    // a manager's PIN allows this one bill, and it is audited as an override
    assert!(call(&db, &cashier, "saveBill", json!([draft("c0", Some("2222"))])).is_ok());
    db.with(|c| {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='override' AND detail LIKE '%no credit account%'", [], |r| r.get(0))?;
        assert_eq!(n, 1);
        Ok(())
    })
    .unwrap();
    // allowing credit for the customer needs a manager PIN too, and is audited
    assert!(call(&db, &cashier, "setCustomerCredit", json!(["c0", 500_000, "1234"])).is_err());
    assert!(call(&db, &cashier, "setCustomerCredit", json!(["c0", 500_000])).unwrap_err().contains("manager PIN"));
    assert!(call(&db, &cashier, "setCustomerCredit", json!(["c0", 500_000, "2222"])).is_ok());
    assert!(call(&db, &cashier, "saveBill", json!([draft("c0", None)])).is_ok(), "now allowed without a PIN");
    db.with(|c| {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='credit_limit'", [], |r| r.get(0))?;
        assert_eq!(n, 1);
        // explicit "no limit" is -1 and is never blocked by the limit
        c.execute("UPDATE customers SET credit_limit=-1 WHERE id='c0'", [])?;
        Ok(())
    })
    .unwrap();
    assert!(call(&db, &cashier, "saveBill", json!([draft("c0", None)])).is_ok());
    // a new customer made at the counter starts with credit not allowed
    let q = call(&db, &cashier, "quickAddCustomer", json!([{ "name": "New Person", "phone": "98400 55555" }])).unwrap();
    assert_eq!(q["creditLimit"], 0);
}

/// An existing shop database (schema v4, with data) upgrades in place: nothing is lost and old points become the opening balance.
#[test]
fn migration_to_v5_keeps_existing_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        for sql in [
            include_str!("../migrations/001_init.sql"),
            include_str!("../migrations/002_office.sql"),
            include_str!("../migrations/003_security.sql"),
            include_str!("../migrations/004_money_mill.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn.execute_batch("PRAGMA user_version = 4").unwrap();
        conn.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES('c9','Old customer','1',0,0,50,'2026-01-01T00:00:00Z')", []).unwrap();
    }
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, gokul_core::db::latest_version());
        assert_eq!(count(c, "customers"), 1);
        assert_eq!(loyalty::balance(c, "c9")?, 5000, "the 50 points the customer already had are the opening balance (in hundredths)");
        assert_eq!(c.query_row::<i64, _, _>("SELECT loyalty_points FROM customers WHERE id='c9'", [], |r| r.get(0))?, 5000);
        Ok(())
    })
    .unwrap();
}

/// Run by hand against a COPY of the real database: `GOKUL_DB_COPY=path cargo test -p gokul-core --test loyalty real_copy -- --ignored`.
#[test]
#[ignore]
fn real_copy_upgrades_in_place() {
    let path = std::env::var("GOKUL_DB_COPY").expect("set GOKUL_DB_COPY to a COPY of gokul.db");
    let before = {
        let c = rusqlite::Connection::open(&path).unwrap();
        ["items", "bills", "customers", "stock_movements"].map(|t| c.query_row::<i64, _, _>(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap())
    };
    let db = Db::open(std::path::Path::new(&path)).unwrap();
    db.with(|c| {
        let after = ["items", "bills", "customers", "stock_movements"].map(|t| count(c, t));
        assert_eq!(before, after, "no rows lost");
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, 7);
        assert_eq!(c.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))?, "ok");
        println!("upgraded copy: items/bills/customers/stock_movements before {before:?} after {after:?}");
        Ok(())
    })
    .unwrap();
}
