//! Step 3: server-side identity and permissions, PIN lockout, barrel draw-down for loose oil, automatic backup.
mod common;
use chrono::{Local, TimeZone};
use common::*;
use gokul_core::backup;
use gokul_core::db::{iso, Db};
use gokul_core::types::*;
use gokul_core::{dispatch, dispatch_session, Session};
use rusqlite::Connection;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn de<T: DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn call(db: &Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}

fn sign_in(db: &Db, s: &Session, user: &str, pin: &str) {
    let u = call(db, s, "verifyPin", json!([user, pin])).unwrap();
    assert!(!u.is_null(), "sign in {user}");
}

fn draft_json(d: &BillDraft) -> Value {
    serde_json::to_value(d).unwrap()
}

fn audit_by(c: &Connection, action: &str) -> Vec<String> {
    let mut st = c.prepare("SELECT by_name FROM audit_log WHERE action=?1 ORDER BY id").unwrap();
    let v = st.query_map([action], |r| r.get(0)).unwrap().collect::<Result<Vec<String>, _>>().unwrap();
    v
}

fn err_has(r: Result<Value, String>, needle: &str) {
    match r {
        Ok(v) => panic!("expected an error containing '{needle}', got {v}"),
        Err(e) => assert!(e.to_lowercase().contains(&needle.to_lowercase()), "error was: {e}"),
    }
}

fn two_cash_bills(db: &Db) -> (String, String) {
    db.with(|c| {
        let a = gokul_core::bills::save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5)]))?;
        let b = gokul_core::bills::save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]))?;
        Ok((a.id, b.id))
    })
    .unwrap()
}

// ---------- identity and permissions ----------

#[test]
fn nothing_works_signed_out_and_login_screen_calls_stay_open() {
    let (_d, db) = mini_db();
    let s = Session::pos();
    assert!(call(&db, &s, "listUsers", json!([])).is_ok());
    assert!(call(&db, &s, "getSettings", json!([])).is_ok());
    err_has(call(&db, &s, "listItems", json!([])), "sign in");
    err_has(call(&db, &s, "saveItem", json!([{ "name": "x" }])), "sign in");
    sign_in(&db, &s, "u3", "1234");
    assert!(call(&db, &s, "listItems", json!([])).is_ok());
    call(&db, &s, "logout", json!([])).unwrap();
    err_has(call(&db, &s, "listItems", json!([])), "sign in");
    // a failed sign-in leaves nobody signed in
    assert!(call(&db, &s, "verifyPin", json!(["u3", "0000"])).unwrap().is_null());
    err_has(call(&db, &s, "listItems", json!([])), "sign in");
}

#[test]
fn office_refuses_cashier_accounts() {
    let (_d, db) = mini_db();
    let s = Session::office();
    err_has(call(&db, &s, "verifyPin", json!(["u3", "1234"])), "cashier");
    err_has(call(&db, &s, "listItems", json!([])), "sign in");
    sign_in(&db, &s, "u2", "2222");
}

#[test]
fn cashier_cannot_bypass_the_role_matrix_with_direct_calls() {
    let (_d, db) = mini_db();
    let (b1, b2) = two_cash_bills(&db);
    let s = Session::pos();
    sign_in(&db, &s, "u3", "1234"); // Karthik, cashier

    // cancel: no PIN, wrong PIN, a cashier's own PIN
    let cancel = |pin: &str, id: &str| json!([{ "billId": id, "reason": "Wrong item billed", "managerPin": pin, "by": "Suresh" }]);
    err_has(call(&db, &s, "cancelBill", cancel("", &b1)), "manager PIN is needed");
    err_has(call(&db, &s, "cancelBill", cancel("9999", &b1)), "not correct");
    err_has(call(&db, &s, "cancelBill", cancel("1234", &b1)), "not correct");
    db.with(|c| {
        let st: String = c.query_row("SELECT status FROM bills WHERE id=1", [], |r| r.get(0))?;
        assert_eq!(st, "paid", "nothing changed");
        Ok(())
    })
    .unwrap();
    // with a manager PIN it works, and the audit trail has the real names whatever 'by' the screen sent
    call(&db, &s, "cancelBill", cancel("2222", &b1)).unwrap();
    db.with(|c| {
        assert_eq!(audit_by(c, "cancel"), ["Karthik"]);
        assert_eq!(audit_by(c, "override"), ["Karthik"]);
        let d: String = c.query_row("SELECT detail FROM audit_log WHERE action='override'", [], |r| r.get(0))?;
        assert!(d.contains("Lakshmi") && d.contains("cancel a bill"), "{d}");
        let who: String = c.query_row("SELECT by_name FROM bill_cancellations", [], |r| r.get(0))?;
        assert_eq!(who, "Karthik");
        Ok(())
    })
    .unwrap();

    // returns need the PIN too
    let ret = |pin: &str| json!([{ "billId": b2, "picks": [{ "lineIndex": 0, "qty": 1000 }], "reason": "Quality complaint", "refundMode": "cash", "by": "x", "managerPin": pin }]);
    err_has(call(&db, &s, "createReturn", ret("")), "manager PIN is needed");
    err_has(call(&db, &s, "createReturn", ret("0000")), "not correct");
    call(&db, &s, "createReturn", ret("1111")).unwrap(); // the owner's PIN approves as well
    db.with(|c| {
        assert_eq!(audit_by(c, "return"), ["Karthik"]);
        Ok(())
    })
    .unwrap();

    // Office-side actions are refused outright for a cashier
    err_has(call(&db, &s, "saveItem", json!([{ "name": "Free oil", "categoryId": "oil", "unit": "pc", "price": 100 }])), "permission");
    err_has(call(&db, &s, "saveUserAccount", json!([{ "name": "Sneaky", "role": "owner", "pin": "1357" }])), "permission");
    err_has(call(&db, &s, "saveRoles", json!([[]])), "permission");
    err_has(call(&db, &s, "saveSettingsBundle", json!([{}])), "permission");
    err_has(call(&db, &s, "resetUserPin", json!(["u1"])), "permission");
    err_has(call(&db, &s, "runReport", json!(["daily-summary", {}])), "permission");
    err_has(call(&db, &s, "createGrn", json!([{}])), "permission");
    err_has(call(&db, &s, "backupNow", json!([])), "permission");
    err_has(call(&db, &s, "listUserAccounts", json!([])), "permission");
    // stock adjustment: a PIN is the only way, and the approver must hold the permission
    let adj = |pin: &str| json!([{ "itemId": "i1", "reason": "damage", "qty": -1000, "note": "", "managerPin": pin }]);
    err_has(call(&db, &s, "createAdjustment", adj("")), "manager PIN is needed");
    assert_eq!(call(&db, &s, "createAdjustment", adj("2222")).unwrap()["ok"], true);
    // cash out of the drawer needs a PIN for a cashier; cash in does not
    let cash = |kind: &str, pin: &str| json!([{ "kind": kind, "reason": "Tea", "amount": 5000, "note": "", "by": "x", "managerPin": pin }]);
    db.with(|c| {
        gokul_core::shift::open_day(c, "u3", &Default::default())?;
        Ok(())
    })
    .unwrap();
    err_has(call(&db, &s, "addCashEntry", cash("out", "")), "manager PIN is needed");
    assert!(call(&db, &s, "addCashEntry", cash("out", "2222")).is_ok());
    assert!(call(&db, &s, "addCashEntry", cash("in", "")).is_ok());
    // Z needs a manager PIN; a cashier PIN answers null (and is counted)
    let z = |pin: &str| json!([{ "userId": "u1", "counts": {}, "managerPin": pin }]);
    assert!(call(&db, &s, "closeDay", z("1234")).unwrap().is_null());
}

#[test]
fn discount_over_the_limit_changed_prices_and_credit_over_limit_need_a_manager_pin() {
    let (_d, db) = mini_db();
    let s = Session::pos();
    sign_in(&db, &s, "u3", "1234"); // cashier: 2 percent discount limit
    let mut d = cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]);
    let with_discount = |d: &BillDraft, disc: i64, pin: Option<&str>| {
        let mut d = d.clone();
        d.lines[0].discount = disc;
        let ls: Vec<BillLine> = d.lines.iter().map(gokul_core::money::recalc_line).collect();
        d.payments = vec![Payment { mode: "cash".into(), amount: gokul_core::money::compute_totals(&ls, 0, true).grand, r#ref: None }];
        d.manager_pin = pin.map(String::from);
        d
    };
    // 2 percent of 360.00 is 7.20: within the limit passes, above needs the PIN
    assert!(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 700, None))])).is_ok());
    err_has(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 1_800, None))])), "manager PIN is needed");
    err_has(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 1_800, Some("0000")))])), "not correct");
    // a manager's limit is 15 percent: 20 percent is too much for the manager's PIN, the owner's works
    err_has(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 7_200, Some("2222")))])), "not correct");
    assert!(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 7_200, Some("1111")))])).is_ok());
    assert!(call(&db, &s, "saveBill", json!([draft_json(&with_discount(&d, 1_800, Some("2222")))])).is_ok());
    db.with(|c| {
        assert_eq!(count(c, "bills"), 3);
        assert_eq!(audit_by(c, "override").len(), 2);
        Ok(())
    })
    .unwrap();

    // a price that differs from the item master is a price override
    d.lines[0].rate = 30_000;
    let ls: Vec<BillLine> = d.lines.iter().map(gokul_core::money::recalc_line).collect();
    d.payments = vec![Payment { mode: "cash".into(), amount: gokul_core::money::compute_totals(&ls, 0, true).grand, r#ref: None }];
    err_has(call(&db, &s, "saveBill", json!([draft_json(&d)])), "change a price");
    d.manager_pin = Some("2222".into());
    assert!(call(&db, &s, "saveBill", json!([draft_json(&d)])).is_ok());

    // credit above the customer's limit
    db.with(|c| {
        c.execute("UPDATE customers SET credit_limit=10000, outstanding=9000 WHERE id='c1'", [])?;
        Ok(())
    })
    .unwrap();
    let cr = draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)], 0, Some("c1"), "credit");
    err_has(call(&db, &s, "saveBill", json!([draft_json(&cr)])), "credit above");
    let mut cr2 = cr.clone();
    cr2.manager_pin = Some("2222".into());
    assert!(call(&db, &s, "saveBill", json!([draft_json(&cr2)])).is_ok());

    // the owner never needs a PIN (limit 100 percent, may change prices)
    let o = Session::pos();
    sign_in(&db, &o, "u1", "1111");
    let mut od = with_discount(&d, 20_000, None);
    od.lines[0].rate = 25_000;
    let ls: Vec<BillLine> = od.lines.iter().map(gokul_core::money::recalc_line).collect();
    od.payments = vec![Payment { mode: "cash".into(), amount: gokul_core::money::compute_totals(&ls, 0, true).grand, r#ref: None }];
    od.manager_pin = None;
    assert!(call(&db, &o, "saveBill", json!([draft_json(&od)])).is_ok());
}

#[test]
fn audit_rows_and_ledgers_carry_the_signed_in_user_never_a_name_from_the_screen() {
    let (_d, db) = mini_db();
    let s = Session::office();
    sign_in(&db, &s, "u1", "1111"); // Suresh, owner
    call(&db, &s, "createAdjustment", json!([{ "itemId": "i1", "reason": "damage", "qty": -2000, "note": "dented" }])).unwrap();
    call(&db, &s, "addCategory", json!(["Ghee"])).unwrap();
    call(&db, &s, "saveSupplier", json!([{ "name": "Tiruppur Seeds", "phone": "98427 11111", "city": "", "gstin": "", "address": "", "contact": "", "creditDays": 10 }])).unwrap();
    // POS-style calls with spoofed names
    let p = Session::pos();
    sign_in(&db, &p, "u3", "1234");
    let mut d = cash_draft(vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]);
    d.cashier = Some("Suresh".into()); // spoof
    let bill = call(&db, &p, "saveBill", json!([draft_json(&d)])).unwrap();
    assert_eq!(bill["cashier"], "Karthik");
    call(&db, &p, "recordReprint", json!([bill["id"], "Suresh"])).unwrap();
    call(&db, &p, "holdBill", json!([{ "lines": draft_json(&d)["lines"], "billDiscount": 0, "payments": [], "cashier": "Suresh" }])).unwrap();
    db.with(|c| {
        let bad: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE by_name IN ('Office','Cashier','counter')", [], |r| r.get(0))?;
        assert_eq!(bad, 0, "no audit row may use a generic or spoofed name");
        assert_eq!(audit_by(c, "stock_adjust"), ["Suresh"]);
        let creators = audit_by(c, "create");
        assert_eq!(creators, ["Suresh", "Suresh", "Karthik"], "category, supplier, bill");
        assert_eq!(audit_by(c, "reprint"), ["Karthik"]);
        assert_eq!(audit_by(c, "hold"), ["Karthik"]);
        let mv: String = c.query_row("SELECT by_name FROM stock_movements WHERE kind='adjustment'", [], |r| r.get(0))?;
        assert_eq!(mv, "Suresh");
        let adj: String = c.query_row("SELECT by_name FROM stock_adjustments", [], |r| r.get(0))?;
        assert_eq!(adj, "Suresh");
        let rp: String = c.query_row("SELECT by_name FROM bill_reprints", [], |r| r.get(0))?;
        assert_eq!(rp, "Karthik");
        let sale: String = c.query_row("SELECT cashier FROM bills", [], |r| r.get(0))?;
        assert_eq!(sale, "Karthik");
        Ok(())
    })
    .unwrap();
}

// ---------- lockout ----------

#[test]
fn five_wrong_pins_lock_the_user_for_a_minute_and_it_is_audited() {
    let (_d, db) = mini_db();
    let s = Session::pos();
    for _ in 0..4 {
        assert!(call(&db, &s, "verifyPin", json!(["u3", "0000"])).unwrap().is_null());
    }
    let fifth = call(&db, &s, "verifyPin", json!(["u3", "0000"]));
    err_has(fifth, "locked for 60 s");
    // even the right PIN is refused while locked, with the seconds left
    let e = call(&db, &s, "verifyPin", json!(["u3", "1234"])).unwrap_err();
    assert!(e.contains("locked for") && e.contains(" s"), "{e}");
    let users = call(&db, &s, "listUsers", json!([])).unwrap();
    let karthik = users.as_array().unwrap().iter().find(|u| u["id"] == "u3").unwrap();
    let left = karthik["lockedForSecs"].as_i64().unwrap();
    assert!((1..=60).contains(&left), "{left}");
    assert!(users.as_array().unwrap().iter().find(|u| u["id"] == "u1").unwrap().get("lockedForSecs").is_none());
    // other users are not affected
    sign_in(&db, &s, "u1", "1111");
    db.with(|c| {
        assert_eq!(audit_by(c, "lockout"), ["Karthik"]);
        assert_eq!(audit_by(c, "login_failed").len(), 5);
        Ok(())
    })
    .unwrap();
}

#[test]
fn lockout_time_is_a_setting_and_a_right_pin_resets_the_count() {
    let (_d, db) = mini_db();
    db.with(|c| {
        gokul_core::db::set_setting(c, "security.lockoutSeconds", "1")?;
        Ok(())
    })
    .unwrap();
    let s = Session::pos();
    for _ in 0..3 {
        call(&db, &s, "verifyPin", json!(["u3", "0000"])).unwrap();
    }
    sign_in(&db, &s, "u3", "1234"); // right PIN: the count starts again
    for _ in 0..4 {
        call(&db, &s, "verifyPin", json!(["u3", "0000"])).unwrap();
    }
    err_has(call(&db, &s, "verifyPin", json!(["u3", "0000"])), "locked for 1 s");
    std::thread::sleep(std::time::Duration::from_millis(1300));
    sign_in(&db, &s, "u3", "1234"); // the lock ran out
}

#[test]
fn guessing_manager_pins_through_override_paths_locks_the_cashier_out() {
    let (_d, db) = mini_db();
    let (b1, _b2) = two_cash_bills(&db);
    let s = Session::pos();
    sign_in(&db, &s, "u3", "1234");
    let try_pin = |pin: &str| call(&db, &s, "cancelBill", json!([{ "billId": b1, "reason": "x", "managerPin": pin, "by": "k" }]));
    for p in ["0001", "0002", "0003", "0004"] {
        err_has(try_pin(p), "not correct");
    }
    err_has(try_pin("0005"), "locked for"); // the fifth miss locks Karthik
    err_has(try_pin("2222"), "sign in"); // and signs him out: even the right PIN is no use now
    err_has(call(&db, &s, "verifyPin", json!(["u3", "1234"])), "locked for");
    db.with(|c| {
        assert_eq!(audit_by(c, "lockout"), ["Karthik"]);
        Ok(())
    })
    .unwrap();
}

// ---------- barrel draw-down ----------

fn fill_barrel(c: &Connection, id: &str, level: i64, filled_on: &str) {
    c.execute(
        "UPDATE barrels SET seed='groundnut', oil_name='Groundnut Oil', level_ml=?1, filled_on=?2 WHERE id=?3",
        rusqlite::params![level, filled_on, id],
    )
    .unwrap();
}

fn barrel(c: &Connection, id: &str) -> (i64, Option<String>) {
    c.query_row("SELECT level_ml, oil_name FROM barrels WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
}

fn loose_draft(qty_ml: i64) -> BillDraft {
    let mut l = line("i2", "102", "Groundnut Oil (Loose)", qty_ml, 36_000, 5);
    l.unit = "l".into();
    cash_draft(vec![l])
}

#[test]
fn loose_sales_draw_barrels_oldest_first_and_returns_and_cancels_put_it_back() {
    let (_d, db) = mini_db();
    db.with(|c| {
        // BR-02 was filled first (oldest), BR-01 later, BR-03 holds another oil and must never be touched
        fill_barrel(c, "BR-02", 3_000, &iso(Local.with_ymd_and_hms(2026, 10, 1, 9, 0, 0).unwrap()));
        fill_barrel(c, "BR-01", 10_000, &iso(Local.with_ymd_and_hms(2026, 10, 20, 9, 0, 0).unwrap()));
        c.execute("UPDATE barrels SET seed='sesame', oil_name='Sesame Oil', level_ml=50000, filled_on='2026-10-05' WHERE id='BR-03'", [])?;
        let oil_in: i64 = c.query_row("SELECT SUM(level_ml) FROM barrels", [], |r| r.get(0))?;
        assert_eq!(oil_in, 63_000);

        // 2 L is taken from the oldest barrel only
        let b1 = gokul_core::bills::save_bill(c, &loose_draft(2_000))?;
        assert_eq!((barrel(c, "BR-02").0, barrel(c, "BR-01").0, barrel(c, "BR-03").0), (1_000, 10_000, 50_000));
        assert_eq!(stock_of(c, "i2"), 100_000 - 2_000);
        // 4 L more: the last litre of BR-02 (it frees itself), then 3 L from BR-01
        let b2 = gokul_core::bills::save_bill(c, &loose_draft(4_000))?;
        assert_eq!(barrel(c, "BR-02"), (0, None), "an empty barrel frees itself");
        assert_eq!(barrel(c, "BR-01").0, 7_000);

        // a return of 1.5 L from the second bill goes back to the barrel that was drawn last (BR-01), then BR-02
        let ret = |c: &mut Connection, bill: &str, qty: i64| {
            gokul_core::billops::create_return(
                c,
                &serde_json::from_value(json!({ "billId": bill, "picks": [{ "lineIndex": 0, "qty": qty }], "reason": "Customer changed mind",
                                               "refundMode": "cash", "by": "Karthik", "managerPin": "2222" }))
                .unwrap(),
            )
        };
        ret(c, &b2.id, 1_500)?;
        assert_eq!((barrel(c, "BR-01").0, barrel(c, "BR-02").0), (8_500, 0));
        ret(c, &b2.id, 2_500)?; // the rest of the second bill: 1.5 L more to BR-01 (all it took), 1 L back to BR-02
        assert_eq!(barrel(c, "BR-01").0, 10_000);
        assert_eq!(barrel(c, "BR-02"), (1_000, Some("Groundnut Oil".into())), "a freed barrel takes its oil back");

        // cancelling the first bill puts its 2 L back where it came from
        gokul_core::billops::cancel_bill(
            c,
            &serde_json::from_value(json!({ "billId": b1.id, "reason": "Duplicate bill", "managerPin": "2222", "by": "Karthik" })).unwrap(),
        )?;
        assert_eq!(barrel(c, "BR-02").0, 3_000);
        assert_eq!(barrel(c, "BR-03").0, 50_000, "another oil is never touched");
        // nothing can be given back twice
        assert!(gokul_core::billops::cancel_bill(c, &serde_json::from_value(json!({ "billId": b1.id, "reason": "x", "managerPin": "2222", "by": "k" })).unwrap()).is_err());
        let ledger: i64 = c.query_row("SELECT COALESCE(SUM(qty_ml),0) FROM barrel_movements", [], |r| r.get(0))?;
        assert_eq!(ledger, 0, "sold 6 L, returned 4 L and 2 L");
        Ok(())
    })
    .unwrap();
}

#[test]
fn barrel_totals_equal_oil_in_minus_packed_minus_sold_plus_returned() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("UPDATE items SET pack_size='1 L', parent_id='i2' WHERE id='i1'", [])?;
        c.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES('i9','109','Groundnut Oil Cake (Loose)','oil','Gokul','kg',1,'2305',5,5000,5000,4000,0,0,1,'2026-01-01T00:00:00Z')",
            [],
        )?;
        let sid = gokul_core::purchasing::save_supplier(c, &de(json!({ "name": "Kongu", "phone": "98427 11111", "city": "", "gstin": "", "address": "", "contact": "", "creditDays": 5 })))?;
        gokul_core::purchasing::create_grn(
            c,
            &de(json!({ "supplierId": sid["id"], "invoiceNo": "1", "invoiceDate": gokul_core::db::day_of(Local::now()),
                        "lines": [{ "itemId": "rm-gn", "qty": 500000, "rate": 9800, "discountPct": 0, "gstRate": 0 }],
                        "freight": 0, "otherCharges": 0, "paidNow": 0, "payMode": "upi", "updateCost": false })),
        )?;
        // two pressed batches go into two barrels (BR-01 first, so it is the oldest)
        let mut put = |barrel: &str, clear: i64| -> gokul_core::Result<()> {
            let batch = gokul_core::purchasing::create_pressing_batch(
                c,
                &de(json!({ "seed": "groundnut", "seedKg": 100000, "cleaningLossKg": 0, "jaggeryKg": 0, "oilRawL": 38000, "cakeKg": 55000, "chekku": "1", "operator": "M" })),
            )?;
            gokul_core::purchasing::move_batch_to_barrel_at(
                c,
                &de(json!({ "batchId": batch["id"], "barrelId": barrel, "clearOilL": clear })),
                Local::now() + chrono::Duration::seconds(if barrel == "BR-01" { 0 } else { 5 }),
            )?;
            Ok(())
        };
        put("BR-01", 36_500)?;
        put("BR-02", 30_000)?;
        let total = |c: &Connection| c.query_row("SELECT SUM(level_ml) FROM barrels", [], |r| r.get::<_, i64>(0)).unwrap();
        let oil_in = 36_500 + 30_000;
        assert_eq!(total(c), oil_in);

        // pack 20 L out of BR-01 (20 x 1 L, 20.1 L used)
        gokul_core::purchasing::create_pack_run(c, &de(json!({ "barrelId": "BR-01", "lines": [{ "itemId": "i1", "count": 20 }], "usedL": 20_100, "packer": "R" })))?;
        let packed = 20_100;
        assert_eq!(total(c), oil_in - packed);

        // loose sales: 20 L empties the rest of BR-01 (16.4 L) and takes 3.6 L from BR-02
        let a = gokul_core::bills::save_bill(c, &loose_draft(10_000))?;
        let b = gokul_core::bills::save_bill(c, &loose_draft(10_000))?;
        let sold = 20_000;
        assert_eq!(barrel(c, "BR-01"), (0, None));
        assert_eq!(barrel(c, "BR-02").0, 30_000 - 3_600);
        assert_eq!(total(c), oil_in - packed - sold);

        // returns: 2.5 L of the second bill
        let ret = |c: &mut Connection, bill: &str, qty: i64| {
            gokul_core::billops::create_return(
                c,
                &de(json!({ "billId": bill, "picks": [{ "lineIndex": 0, "qty": qty }], "reason": "Other", "refundMode": "cash", "by": "k", "managerPin": "2222" })),
            )
        };
        ret(c, &b.id, 2_500)?;
        let returned = 2_500;
        assert_eq!(total(c), oil_in - packed - sold + returned);
        // a cancel of the first bill puts back its 10 L as well
        gokul_core::billops::cancel_bill(c, &de(json!({ "billId": a.id, "reason": "Duplicate bill", "managerPin": "2222", "by": "k" })))?;
        let returned = returned + 10_000;
        let sold = sold; // (the cancelled sale still counts as sold, then returned)
        assert_eq!(total(c), oil_in - packed - sold + returned);
        // the pressing, packing and sales ledgers agree with every barrel
        let bad: i64 = c.query_row(
            "SELECT COUNT(*) FROM barrels b WHERE b.level_ml != COALESCE((SELECT SUM(clear_oil_ml) FROM pressing_batches p WHERE p.barrel_id=b.id),0)
             - COALESCE((SELECT SUM(used_ml) FROM pack_runs r WHERE r.barrel_id=b.id),0) + COALESCE((SELECT SUM(qty_ml) FROM barrel_movements m WHERE m.barrel_id=b.id),0)",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(bad, 0);
        // the loose oil item (100 L opening stock that was never in a barrel) moves by exactly what the barrels moved
        assert_eq!(stock_of(c, "i2"), 100_000 + total(c));
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_loose_sale_is_never_refused_when_the_barrels_hold_less() {
    let (_d, db) = mini_db();
    db.with(|c| {
        fill_barrel(c, "BR-01", 1_000, "2026-10-01");
        let b = gokul_core::bills::save_bill(c, &loose_draft(3_000))?;
        assert_eq!(b.status, "paid");
        assert_eq!(barrel(c, "BR-01"), (0, None));
        let drawn: i64 = c.query_row("SELECT -SUM(qty_ml) FROM barrel_movements", [], |r| r.get(0))?;
        assert_eq!(drawn, 1_000, "only what the barrel held is drawn");
        Ok(())
    })
    .unwrap();
}

#[test]
fn barrel_ledger_cannot_be_edited() {
    let (_d, db) = mini_db();
    db.with(|c| {
        fill_barrel(c, "BR-01", 5_000, "2026-10-01");
        gokul_core::bills::save_bill(c, &loose_draft(1_000))?;
        assert!(c.execute("DELETE FROM barrel_movements", []).is_err());
        assert!(c.execute("UPDATE barrel_movements SET qty_ml=0", []).is_err());
        Ok(())
    })
    .unwrap();
}

// ---------- backup ----------

#[test]
fn scheduled_backup_is_due_when_overdue_and_not_when_off_or_fresh() {
    let (dir, db) = mini_db();
    let _ = &dir;
    let now = Local.with_ymd_and_hms(2026, 11, 6, 10, 0, 0).unwrap();
    db.with(|c| {
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "daily", "time": "02:00", "location": "", "keep": 3 }).to_string())?;
        assert!(backup::due(c, now)?, "never backed up: due");
        c.execute("INSERT INTO backup_log(at,path,size_b,kind,ok) VALUES(?1,'x',1,'auto',1)", [iso(Local.with_ymd_and_hms(2026, 11, 6, 2, 1, 0).unwrap())])?;
        assert!(!backup::due(c, now)?, "today's 02:00 backup is done");
        assert!(backup::due(c, Local.with_ymd_and_hms(2026, 11, 7, 2, 30, 0).unwrap())?, "tomorrow's slot passed");
        assert!(!backup::due(c, Local.with_ymd_and_hms(2026, 11, 7, 1, 30, 0).unwrap())?, "not yet 02:00");
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "hourly", "time": "02:00", "location": "", "keep": 3 }).to_string())?;
        assert!(backup::due(c, now)?, "hourly: the 10:00 slot has no backup yet");
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "twice", "time": "02:00", "location": "", "keep": 3 }).to_string())?;
        assert!(!backup::due(c, now)?, "twice a day: the 02:00 slot is covered, 14:00 is not here yet");
        assert!(backup::due(c, Local.with_ymd_and_hms(2026, 11, 6, 14, 5, 0).unwrap())?, "twice a day: 14:00 passed");
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "off", "time": "02:00", "location": "", "keep": 3 }).to_string())?;
        assert!(!backup::due(c, Local.with_ymd_and_hms(2030, 1, 1, 12, 0, 0).unwrap())?, "off means manual only");
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_failed_backup_is_logged_and_retried_later_and_status_warns() {
    let (dir, db) = mini_db();
    let blocker = dir.path().join("not-a-folder");
    std::fs::write(&blocker, "x").unwrap();
    db.with(|c| {
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "daily", "time": "02:00", "location": blocker.display().to_string(), "keep": 3 }).to_string())?;
        let st = backup::status(c)?;
        assert_eq!((st["stale"].clone(), st["lastAt"].clone()), (json!(true), Value::Null), "never backed up is a warning");
        assert!(backup::run(c, "auto").is_err());
        let st = backup::status(c)?;
        assert!(st["lastError"].as_str().unwrap().contains("backup folder"), "{st}");
        assert!(!backup::due(c, Local::now())?, "backs off for 30 minutes after a failure");
        // a good backup 30 hours ago is stale, a fresh one is not
        c.execute("INSERT INTO backup_log(at,path,size_b,kind,ok) VALUES(?1,'x',1,'auto',1)", [iso(Local::now() - chrono::Duration::hours(30))])?;
        assert_eq!(backup::status(c)?["stale"], true);
        c.execute("INSERT INTO backup_log(at,path,size_b,kind,ok) VALUES(?1,'x',1,'auto',1)", [iso(Local::now() - chrono::Duration::hours(2))])?;
        assert_eq!(backup::status(c)?["stale"], false);
        Ok(())
    })
    .unwrap();
}

#[test]
fn backup_on_its_own_connection_keeps_n_copies_and_restores_end_to_end() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    let db = Db::open(&path).unwrap();
    let dest = dir.path().join("Safe");
    db.with(|c| {
        c.execute("INSERT INTO categories(id,name,sort) VALUES('oil','Oils',0)", [])?;
        gokul_core::db::set_setting(c, "bundle.backup", &json!({ "schedule": "daily", "time": "02:00", "location": dest.display().to_string(), "keep": 2 }).to_string())?;
        Ok(())
    })
    .unwrap();
    // three runs from a background connection while the main one stays usable; only 2 are kept
    for i in 0..3 {
        let p = path.clone();
        let h = std::thread::spawn(move || backup::run_on_own_connection(&p, "auto").map_err(|e| e.to_string()));
        db.with(|c| {
            c.execute("INSERT INTO categories(id,name,sort) VALUES(?1,?2,9)", [format!("c{i}"), format!("Added while backing up {i}")])?;
            Ok(())
        })
        .unwrap();
        h.join().unwrap().unwrap();
    }
    let files: Vec<_> = std::fs::read_dir(&dest).unwrap().map(|e| e.unwrap().path()).collect();
    assert_eq!(files.len(), 2);
    db.with(|c| {
        assert_eq!(audit_by(c, "backup"), ["System (auto backup)"; 3]);
        Ok(())
    })
    .unwrap();

    // restore: stage the newest copy, change the data afterwards, restart: the data is as it was at backup time
    let (id, cats_in_copy) = db
        .with(|c| {
            let (id, p): (i64, String) = c.query_row("SELECT id, path FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
            let copy = Connection::open(&p)?;
            Ok((format!("bk{id}"), copy.query_row::<i64, _, _>("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?))
        })
        .unwrap();
    db.with(|c| {
        c.execute("INSERT INTO categories(id,name,sort) VALUES('late','After the backup',99)", [])?;
        let r = gokul_core::crm::restore_backup(c, &id)?;
        assert_eq!(r["ok"], true, "{r}");
        Ok(())
    })
    .unwrap();
    drop(db);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
        assert_eq!(n, cats_in_copy);
        let late: i64 = c.query_row("SELECT COUNT(*) FROM categories WHERE id='late'", [], |r| r.get(0))?;
        assert_eq!(late, 0, "the change after the backup is gone");
        Ok(())
    })
    .unwrap();
    let kept = std::fs::read_dir(dir.path()).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains("before-restore")).count();
    assert!(kept >= 1, "the replaced database is kept");
}

#[test]
fn day_close_starts_a_background_backup() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        c.execute("INSERT INTO categories(id,name,sort) VALUES('oil','Oils',0)", [])?;
        let now = iso(Local::now());
        for (id, name, role, pin) in [("u2", "Lakshmi", "manager", "2222")] {
            c.execute(
                "INSERT INTO users(id,name,role,initials,color,pin_hash,created_at) VALUES(?1,?2,?3,'XX','#000',?4,?5)",
                rusqlite::params![id, name, role, gokul_core::store::hash_pin(pin).unwrap(), now],
            )?;
        }
        Ok(())
    })
    .unwrap();
    let s = Session::pos();
    sign_in(&db, &s, "u2", "2222");
    call(&db, &s, "openDay", json!([{ "userId": "x", "counts": { "500": 4 } }])).unwrap();
    let backups = path.parent().unwrap().join("Backups");
    assert!(!backups.exists());
    let z = call(&db, &s, "closeDay", json!([{ "userId": "x", "counts": { "500": 4 }, "managerPin": "2222" }])).unwrap();
    assert!(z["number"].as_str().unwrap().starts_with("Z-"));
    let mut found = false;
    for _ in 0..100 {
        if backups.exists() && std::fs::read_dir(&backups).unwrap().count() == 1 {
            found = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert!(found, "a backup file appears after the Z close");
    // the Z was closed by the signed-in user, not by the id the screen sent
    db.with(|c| {
        let by: String = c.query_row("SELECT closed_by FROM shifts WHERE z_number IS NOT NULL", [], |r| r.get(0))?;
        assert_eq!(by, "Lakshmi");
        let kind: String = c.query_row("SELECT kind FROM backup_log ORDER BY id DESC LIMIT 1", [], |r| r.get(0))?;
        assert_eq!(kind, "day-close");
        Ok(())
    })
    .unwrap();
    let _ = dispatch; // (the trusted entry point is only for tests of single modules)
}
