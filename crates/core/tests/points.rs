//! Customer Points module: units shown to screens, paged search, ledger balances, manual adjustments (refused: points change only through bills),
//! expiry, excluded categories, reports, and the ledger rebuild of migration 9.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::db::set_setting;
use gokul_core::{dispatch, dispatch_session, loyalty, Db, Session};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

fn call(db: &Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}

fn sign_in(db: &Db, user: &str, pin: &str, office: bool) -> Session {
    let s = if office { Session::office() } else { Session::pos() };
    assert!(!call(db, &s, "verifyPin", json!([user, pin])).unwrap().is_null());
    s
}

/// A customer with an opening-balance row (like the POSBean import) in hundredths of a point.
fn customer(c: &Connection, id: &str, name: &str, phone: &str, area: &str, hundredths: i64) {
    c.execute("INSERT INTO customers(id,name,phone,area,credit_limit,outstanding,loyalty_points,created_at) VALUES(?1,?2,?3,?4,0,0,0,'2026-01-01T00:00:00Z')", params![id, name, phone, area]).unwrap();
    if hundredths != 0 {
        c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,'2026-11-07T00:00:00.000Z','adjust',?2,'Opening points from POSBean','import')", params![id, hundredths]).unwrap();
        c.execute("UPDATE customers SET loyalty_points=?2 WHERE id=?1", params![id, hundredths]).unwrap();
    }
}

fn balance(c: &Connection, id: &str) -> i64 {
    let cached: i64 = c.query_row("SELECT loyalty_points FROM customers WHERE id=?1", [id], |r| r.get(0)).unwrap();
    assert_eq!(cached, loyalty::balance(c, id).unwrap(), "cached balance equals the ledger");
    cached
}

#[test]
fn api_shows_points_with_two_decimals_never_raw_hundredths() {
    let (_d, db) = mini_db();
    db.with(|c| {
        customer(c, "C02607", "PUSHPARAJ", "98765 43210", "Peelamedu", 7856);
        Ok(())
    })
    .unwrap();
    // the Office customer list and profile (this was showing 7856)
    let rows = dispatch(&db, "listCustomerRows", vec![]).unwrap();
    let p = rows.as_array().unwrap().iter().find(|r| r["id"] == "C02607").unwrap();
    assert_eq!(p["loyaltyPoints"], json!(78.56));
    let prof = dispatch(&db, "getCustomerProfile", vec![json!("C02607")]).unwrap();
    assert_eq!(prof["customer"]["loyaltyPoints"], json!(78.56));
    // the POS customer search and wallet, the history list, the new ledger and list
    let found = dispatch(&db, "searchCustomers", vec![json!("PUSHPA"), json!(5)]).unwrap();
    assert_eq!(found[0]["loyaltyPoints"], json!(78.56));
    assert_eq!(dispatch(&db, "getCustomerWallet", vec![json!("C02607")]).unwrap()["points"], json!(78.56));
    assert_eq!(dispatch(&db, "listPointsHistory", vec![json!("C02607")]).unwrap()[0]["points"], json!(78.56));
    assert_eq!(dispatch(&db, "listPointsHistory", vec![json!("C02607")]).unwrap()[0]["kind"], "import");
    let l = dispatch(&db, "getPointsLedger", vec![json!("C02607")]).unwrap();
    assert_eq!((l[0]["points"].clone(), l[0]["balanceAfter"].clone()), (json!(78.56), json!(78.56)));
    let list = dispatch(&db, "listPointsCustomers", vec![json!({ "q": "pushpa" })]).unwrap();
    assert_eq!(list["rows"][0]["points"], json!(78.56));
    assert_eq!(loyalty::fmt_points(7856), "78.56");
    assert_eq!(loyalty::fmt_points(5), "0.05");
    assert_eq!(loyalty::fmt_points(-250), "-2.50");
}

#[test]
fn list_searches_and_pages_over_every_customer() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let tx = c.unchecked_transaction()?;
        for i in 0..6000 {
            customer(&tx, &format!("C{:05}", i + 100), &format!("Customer {i}"), &format!("9{:04} {:05}", i % 10000, i), if i % 2 == 0 { "Gandhipuram" } else { "RS Puram" }, (i % 7) * 100 + 5);
        }
        customer(&tx, "C09999", "PUSHPARAJ", "98765 43210", "Peelamedu", 7856);
        tx.commit()?;
        Ok(())
    })
    .unwrap();
    let all = dispatch(&db, "listPointsCustomers", vec![json!({ "limit": 50 })]).unwrap();
    assert_eq!(all["total"], 6002, "mini_db's own customer + 6001");
    assert_eq!(all["matched"], 6002);
    assert_eq!(all["rows"].as_array().unwrap().len(), 50);
    // search by name, code, phone (with or without the space) and area all hit the whole table
    for (q, id) in [("pushparaj", "C09999"), ("C09999", "C09999"), ("9876543210", "C09999"), ("98765 43210", "C09999"), ("peelamedu", "C09999")] {
        let r = dispatch(&db, "listPointsCustomers", vec![json!({ "q": q })]).unwrap();
        assert_eq!(r["matched"], 1, "{q}");
        assert_eq!(r["rows"][0]["id"], id);
    }
    // a % in the search is a letter, not a wildcard
    assert_eq!(dispatch(&db, "listPointsCustomers", vec![json!({ "q": "%" })]).unwrap()["matched"], 0);
    // every word must match one of name, code, mobile, area: "customer 5999" is the customer named so and the one whose code ends 5999
    assert_eq!(dispatch(&db, "listPointsCustomers", vec![json!({ "q": "customer 5999" })]).unwrap()["matched"], 2);
    assert_eq!(dispatch(&db, "listPointsCustomers", vec![json!({ "q": "customer 5999 gandhi" })]).unwrap()["matched"], 0);
    // paging reaches the last customer and sorting works
    let last = dispatch(&db, "listPointsCustomers", vec![json!({ "sort": "code", "dir": "asc", "offset": 6000, "limit": 50 })]).unwrap();
    assert_eq!(last["rows"].as_array().unwrap().len(), 2);
    let top = dispatch(&db, "listPointsCustomers", vec![json!({ "sort": "points", "dir": "desc", "limit": 3 })]).unwrap();
    assert_eq!(top["rows"][0]["id"], "C09999");
    assert_eq!(top["rows"][0]["points"], json!(78.56));
    let zero = dispatch(&db, "listPointsCustomers", vec![json!({ "filter": "zero" })]).unwrap();
    assert_eq!(zero["matched"], 1, "only mini_db's c1 has no points");
    // speed budget: a search and a full sorted page over 6,000 customers
    let t = std::time::Instant::now();
    for _ in 0..5 {
        dispatch(&db, "listPointsCustomers", vec![json!({ "q": "gandhi", "sort": "lastEarned", "limit": 100 })]).unwrap();
    }
    assert!(t.elapsed().as_millis() < 2500, "5 searches took {:?}", t.elapsed());
}

#[test]
fn overview_ledger_balances_and_excluded_categories() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO categories(id,name,sort) VALUES('_service','Service charges',9999)", [])?;
        c.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at,service)
             VALUES('sv','900','Aravai Job Work','_service','','pc',0,'9988',5,10000,10000,0,0,0,1,'2026-01-01T00:00:00Z',1)",
            [],
        )?;
        customer(c, "c2", "Opening Person", "90000 00000", "", 12_345);
        // Rs 1,080 of oil (10.80) and, on the same bill, Rs 100 of service
        let mut lines = vec![line("i1", "101", "Groundnut Oil 1 L", 3000, 36_000, 5)];
        lines.push(line("sv", "900", "Aravai Job Work", 1000, 10_000, 5));
        let b = save_bill(c, &draft_with(lines.clone(), 0, Some("c1"), "cash"))?;
        let with_service = loyalty::balance(c, "c1")?;
        assert_eq!(with_service, b.totals.grand / 100, "no exclusion yet: everything earns");
        // exclude Service charges: the same bill now earns only on the oil share
        set_setting(c, "loyalty.excludeCategories", "_service")?;
        let before = loyalty::balance(c, "c1")?;
        let b2 = save_bill(c, &draft_with(lines, 0, Some("c1"), "cash"))?;
        let earned = loyalty::balance(c, "c1")? - before;
        assert!(earned < b2.totals.grand / 100, "service share earns nothing ({earned} vs {})", b2.totals.grand / 100);
        assert_eq!(earned, 1080, "only the Rs 1,080 of oil earns (10.80 points), the Rs 100 service does not");
        assert_eq!(with_service, 1180);
        Ok(())
    })
    .unwrap();
    let ov = dispatch(&db, "pointsOverview", vec![]).unwrap();
    assert_eq!(ov["customers"], 2);
    assert!(ov["earnedMonth"].as_f64().unwrap() > 0.0);
    assert_eq!(ov["customersWithPoints"], 2);
    let total_h = db.with(|c| Ok(balance(c, "c1") + balance(c, "c2"))).unwrap();
    assert_eq!(ov["outstanding"], json!(total_h as f64 / 100.0));
    assert_eq!(ov["liability"], json!(total_h)); // Rs 1 per point: hundredths of a point = paise
    // ledger: newest first, balance after each row, import shown as import
    let l = dispatch(&db, "getPointsLedger", vec![json!("c1")]).unwrap();
    assert_eq!(l.as_array().unwrap().len(), 2);
    assert_eq!(l[0]["kind"], "earn");
    assert_eq!(l[0]["balanceAfter"], json!((total_h - 12_345) as f64 / 100.0));
    assert!(l[0]["bill"].as_str().unwrap().starts_with("GK"));
    assert_eq!(dispatch(&db, "getPointsLedger", vec![json!("c2")]).unwrap()[0]["kind"], "import");
}

#[test]
fn points_change_only_through_bills_so_manual_adjust_is_refused_and_changes_nothing() {
    let (_d, db) = mini_db();
    db.with(|c| {
        customer(c, "c2", "Opening Person", "90000 00000", "", 5_000);
        customer(c, "c3", "Anbu", "90000 00001", "Gandhipuram", 1_000);
        Ok(())
    })
    .unwrap();
    let owner = sign_in(&db, "u1", "1111", true);
    let manager = sign_in(&db, "u2", "2222", true);
    let cashier = sign_in(&db, "u3", "1234", false);
    let one = json!([{ "customerId": "c2", "points": 5, "reason": "gift", "managerPin": "1111" }]);
    let bulk = json!([{ "q": "gandhipuram", "filter": "all", "points": 5, "reason": "Deepavali bonus", "expectedCount": 1, "managerPin": "1111" }]);
    // Owner and manager (with a valid PIN) get the refusal itself. A cashier is stopped earlier by the role check.
    for s in [&owner, &manager] {
        for (m, args) in [("adjustPoints", one.clone()), ("bulkAdjustPoints", bulk.clone())] {
            let e = call(&db, s, m, args).unwrap_err();
            assert!(e.contains("Points change only through bills"), "{m}: {e}");
        }
    }
    assert!(call(&db, &cashier, "adjustPoints", one.clone()).is_err());
    assert!(call(&db, &cashier, "bulkAdjustPoints", bulk.clone()).is_err());
    db.with(|c| {
        assert_eq!((balance(c, "c2"), balance(c, "c3")), (5_000, 1_000), "nothing changed");
        let rows: i64 = c.query_row("SELECT COUNT(*) FROM points_ledger WHERE kind='adjust'", [], |r| r.get(0))?;
        assert_eq!(rows, 2, "only the two opening rows exist");
        let audits: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action IN ('points_adjust','points_bulk_adjust')", [], |r| r.get(0))?;
        assert_eq!(audits, 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn expiry_takes_off_only_points_older_than_the_window_and_only_when_on() {
    let (_d, db) = {
        let (d, db) = mini_db();
        db.with(|c| {
            let old = "2025-01-01T00:00:00.000Z";
            c.execute("INSERT INTO customers(id,name,phone,created_at) VALUES('c2','Old points','90000 00001','2025-01-01T00:00:00Z'),('c3','Fresh points','90000 00002','2025-01-01T00:00:00Z')", [])?;
            // c2: 10.00 earned long ago, 3.00 earned today, 4.00 spent a month ago: 9.00 left, of which the old part is 6.00
            for (id, at, kind, p) in [("c2", old, "earn", 1000), ("c2", "2099-01-01T00:00:00.000Z", "earn", 300), ("c2", "2026-10-01T00:00:00.000Z", "redeem", -400), ("c3", "2099-01-01T00:00:00.000Z", "earn", 500)] {
                c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,?2,?3,?4,'t','t')", params![id, at, kind, p])?;
                c.execute("UPDATE customers SET loyalty_points=loyalty_points+?2 WHERE id=?1", params![id, p])?;
            }
            Ok(())
        })
        .unwrap();
        (d, db)
    };
    let owner = sign_in(&db, "u1", "1111", true);
    assert!(call(&db, &owner, "runPointsExpiry", json!([false])).unwrap_err().contains("switched off"));
    db.with(|c| set_setting(c, "loyalty.expiryMonths", "12")).unwrap();
    let preview = call(&db, &owner, "runPointsExpiry", json!([true])).unwrap();
    assert_eq!((preview["customers"].clone(), preview["points"].clone(), preview["done"].clone()), (json!(1), json!(6.0), json!(false)));
    assert_eq!(db.with(|c| Ok(balance(c, "c2"))).unwrap(), 900, "a preview changes nothing");
    let done = call(&db, &owner, "runPointsExpiry", json!([false])).unwrap();
    assert_eq!((done["customers"].clone(), done["points"].clone()), (json!(1), json!(6.0)));
    db.with(|c| {
        assert_eq!((balance(c, "c2"), balance(c, "c3")), (300, 500));
        Ok(())
    })
    .unwrap();
    let ov = call(&db, &owner, "pointsOverview", json!([])).unwrap();
    assert_eq!(ov["expiredMonth"], json!(6.0));
    assert_eq!(call(&db, &owner, "getPointsLedger", json!(["c2"])).unwrap()[0]["kind"], "expire");
    // a second run finds nothing more
    assert_eq!(call(&db, &owner, "runPointsExpiry", json!([false])).unwrap()["customers"], 0);
    // a cashier is refused
    assert!(call(&db, &sign_in(&db, "u3", "1234", false), "runPointsExpiry", json!([false])).is_err());
}

#[test]
fn report_groups_by_local_day_and_ranks_customers() {
    let (_d, db) = mini_db();
    db.with(|c| {
        customer(c, "c2", "Top Customer", "90000 00001", "", 9_000);
        save_bill(c, &draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)], 0, Some("c1"), "cash"))?;
        Ok(())
    })
    .unwrap();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let r = dispatch(&db, "pointsReport", vec![json!({ "from": today, "to": today })]).unwrap();
    assert_eq!(r["byDay"].as_array().unwrap().len(), 1);
    assert_eq!(r["byDay"][0]["date"], json!(today));
    assert_eq!(r["byDay"][0]["earned"], json!(3.6)); // Rs 360
    assert_eq!(r["top"][0]["id"], "c2");
    assert_eq!(r["liability"]["customers"], 2);
    assert_eq!(r["liability"]["value"], json!(9_000 + 360));
    // the settings screen round trip keeps the two new rules
    let owner = sign_in(&db, "u1", "1111", true);
    let mut bundle = call(&db, &owner, "getSettingsBundle", json!([])).unwrap();
    assert_eq!(bundle["loyalty"]["expiryMonths"], 0);
    bundle["loyalty"]["expiryMonths"] = json!(18);
    bundle["loyalty"]["excludeCategories"] = json!(["_service"]);
    let saved = call(&db, &owner, "saveSettingsBundle", json!([bundle])).unwrap();
    assert_eq!(saved["loyalty"]["expiryMonths"], 18);
    assert_eq!(saved["loyalty"]["excludeCategories"], json!(["_service"]));
    // the cashier cannot change settings (server side)
    let cashier = sign_in(&db, "u3", "1234", false);
    assert!(call(&db, &cashier, "saveSettingsBundle", json!([saved])).is_err());
}

#[test]
fn migration_9_rebuilds_the_ledger_without_losing_a_row() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    {
        let conn = Connection::open(&path).unwrap();
        for sql in [
            include_str!("../migrations/001_init.sql"),
            include_str!("../migrations/002_office.sql"),
            include_str!("../migrations/003_security.sql"),
            include_str!("../migrations/004_money_mill.sql"),
            include_str!("../migrations/005_loyalty_credit.sql"),
            include_str!("../migrations/006_points_hundredths.sql"),
            include_str!("../migrations/007_shelf_life.sql"),
            include_str!("../migrations/008_pos_parallel.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn.execute_batch("PRAGMA user_version = 8").unwrap();
        conn.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES('C02607','PUSHPARAJ','1',0,0,7856,'2026-01-01T00:00:00Z')", []).unwrap();
        conn.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES('C1','Other','2',0,0,150,'2026-01-01T00:00:00Z')", []).unwrap();
        conn.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('C02607','2026-11-07T00:00:00.000Z','adjust',7856,'Opening points from POSBean','import')", []).unwrap();
        conn.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('C1','2026-11-07T00:00:00.000Z','adjust',150,'Opening points from POSBean','import')", []).unwrap();
    }
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, 9);
        assert_eq!(count(c, "points_ledger"), 2);
        assert_eq!(loyalty::balance(c, "C02607")?, 7856);
        let (id, note): (i64, String) = c.query_row("SELECT id,note FROM points_ledger WHERE customer_id='C02607'", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!((id, note.as_str()), (1, "Opening points from POSBean"));
        // the new kind is allowed, the guards are back, and numbering continues after the old rows
        c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('C1','2026-11-08T00:00:00.000Z','expire',-10,'x','t')", [])?;
        assert_eq!(c.query_row::<i64, _, _>("SELECT MAX(id) FROM points_ledger", [], |r| r.get(0))?, 3);
        assert!(c.execute("UPDATE points_ledger SET points=1", []).is_err());
        assert!(c.execute("DELETE FROM points_ledger", []).is_err());
        assert!(c.execute("INSERT INTO points_ledger(customer_id,at,kind,points) VALUES('C1','x','bogus',1)", []).is_err());
        assert_eq!(c.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))?, "ok");
        Ok(())
    })
    .unwrap();
}

/// Run by hand against a COPY of the real database:
/// `GOKUL_DB_COPY=path cargo test -p gokul-core --test points real_copy -- --ignored --nocapture`
#[test]
#[ignore]
fn real_copy_has_every_customer_and_exact_points() {
    let path = std::env::var("GOKUL_DB_COPY").expect("set GOKUL_DB_COPY to a COPY of gokul.db");
    let db = Db::open(std::path::Path::new(&path)).unwrap();
    let t = std::time::Instant::now();
    let ov = dispatch(&db, "pointsOverview", vec![]).unwrap();
    let all = dispatch(&db, "listPointsCustomers", vec![json!({ "q": "PUSHPARAJ" })]).unwrap();
    let page = dispatch(&db, "listPointsCustomers", vec![json!({ "sort": "points", "limit": 100 })]).unwrap();
    println!("{ov}\nsearch: {all}\nfirst page matched {} in {:?}", page["matched"], t.elapsed());
    assert_eq!(page["total"], 5777);
    assert_eq!(all["rows"][0]["id"], "C02607");
    assert_eq!(all["rows"][0]["points"], json!(78.56));
    let rows = dispatch(&db, "listCustomerRows", vec![]).unwrap();
    assert_eq!(rows.as_array().unwrap().len(), 5777);
    let p = rows.as_array().unwrap().iter().find(|r| r["id"] == "C02607").unwrap();
    assert_eq!(p["loyaltyPoints"], json!(78.56));
    assert_eq!(ov["netTotal"], json!(116383.98), "equals the POSBean import total");
    assert_eq!(ov["outstanding"], json!(116398.93), "positive balances only: 14.95 of negative balances are not owed");
    assert_eq!(ov["negativeBalances"].as_i64().unwrap() > 0, true);
    db.with(|c| {
        assert_eq!(c.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))?, "ok");
        Ok(())
    })
    .unwrap();
}
