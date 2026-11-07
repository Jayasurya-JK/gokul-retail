//! Points lots: FIFO use, cancel and return reverse the same lots, the expiry job, imported balances dated at go-live,
//! negative balances, and migration 10 on an existing database.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::types::*;
use gokul_core::{billops, dispatch_session, loyalty, lots, Db, Session};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

fn oil(qty: i64) -> Vec<BillLine> {
    vec![line("i1", "101", "Groundnut Oil 1 L", qty, 36_000, 5)] // Rs 360 each
}

fn pay(mode: &str, amount: i64) -> Payment {
    Payment { mode: mode.into(), amount, r#ref: None }
}

/// A lot that already exists (ledger row, cached balance and lot), in hundredths of a point.
fn give_lot(c: &Connection, cid: &str, pts: i64, expires: &str) {
    c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,'2026-11-08T00:00:00.000Z','earn',?2,'Bill X','t')", params![cid, pts]).unwrap();
    let lid = c.last_insert_rowid();
    c.execute("UPDATE customers SET loyalty_points=loyalty_points+?2 WHERE id=?1", params![cid, pts]).unwrap();
    c.execute("INSERT INTO points_lots(customer_id,source,earned_at,expires_at,original,remaining,ledger_id) VALUES(?1,'earn','2026-11-08T00:00:00.000Z',?2,?3,?3,?4)", params![cid, expires, pts, lid]).unwrap();
}

fn lot_rows(c: &Connection, cid: &str) -> Vec<(i64, i64, Option<String>)> {
    let mut st = c.prepare("SELECT id, remaining, expires_at FROM points_lots WHERE customer_id=?1 ORDER BY id").unwrap();
    st.query_map([cid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().collect::<Result<Vec<_>, _>>().unwrap()
}

/// The lots always add up to the balance (a negative balance has no lot).
fn lots_match_balance(c: &Connection, cid: &str) {
    let bal = loyalty::balance(c, cid).unwrap();
    let sum: i64 = c.query_row("SELECT COALESCE(SUM(remaining),0) FROM points_lots WHERE customer_id=?1", [cid], |r| r.get(0)).unwrap();
    assert_eq!(sum, bal.max(0), "lots of {cid} equal the balance");
}

fn session(db: &Db, user: &str, pin: &str, office: bool) -> Session {
    let s = if office { Session::office() } else { Session::pos() };
    assert!(!dispatch_session(db, &s, "verifyPin", vec![json!(user), json!(pin)]).unwrap().is_null());
    s
}

#[test]
fn bill_earnings_make_lots_that_expire_in_twelve_months() {
    let (_d, db) = mini_db();
    db.with(|c| {
        save_bill(c, &draft_with(oil(3000), 0, Some("c1"), "cash"))?; // Rs 1,080 = 10.80
        let lots = lot_rows(c, "c1");
        assert_eq!(lots.len(), 1);
        assert_eq!(lots[0].1, 1080);
        let (e, x): (String, String) = c.query_row("SELECT date(earned_at,'localtime'), date(expires_at,'localtime') FROM points_lots", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let (ey, xy) = (e[..4].parse::<i32>().unwrap(), x[..4].parse::<i32>().unwrap());
        assert_eq!((xy, &x[4..]), (ey + 1, &e[4..]), "expires exactly one year after it was earned");
        lots_match_balance(c, "c1");
        Ok(())
    })
    .unwrap();
}

#[test]
fn redemption_uses_the_oldest_lot_first_and_cancel_restores_exactly_those_lots() {
    let (_d, db) = mini_db();
    db.with(|c| {
        // the later-expiring lot is inserted first: the order of use follows the expiry date, not the id
        give_lot(c, "c1", 7_000, "2027-06-01T00:00:00.000Z");
        give_lot(c, "c1", 6_000, "2027-01-01T00:00:00.000Z");
        let mut d = draft_with(oil(1000), 0, Some("c1"), "cash"); // Rs 360: 100 points + Rs 260 cash
        d.payments = vec![pay("points", 10_000), pay("cash", 26_000)];
        let b = save_bill(c, &d)?;
        let l = lot_rows(c, "c1");
        assert_eq!((l[0].1, l[1].1), (7_000 - 4_000, 0), "the 60.00 lot (Jan 2027) is used up, then 40.00 of the June lot");
        assert_eq!(l.len(), 3, "the bill's own earning (2.60) is a third lot");
        assert_eq!(l[2].1, 260);
        lots_match_balance(c, "c1");
        // cancelling gives the same lots back with their own expiry, and removes what the bill earned
        billops::cancel_bill(c, &CancelRequest { bill_id: b.id.clone(), reason: "x".into(), manager_pin: "2222".into(), by: "Karthik".into() })?;
        let l = lot_rows(c, "c1");
        assert_eq!((l[0].1, l[1].1, l[2].1), (7_000, 6_000, 0));
        assert_eq!(l[0].2.as_deref(), Some("2027-06-01T00:00:00.000Z"));
        assert_eq!(l[1].2.as_deref(), Some("2027-01-01T00:00:00.000Z"));
        assert_eq!(loyalty::balance(c, "c1")?, 13_000);
        lots_match_balance(c, "c1");
        Ok(())
    })
    .unwrap();
}

#[test]
fn return_takes_back_from_the_bills_own_lot_then_the_oldest() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &draft_with(oil(3000), 0, Some("c1"), "cash"))?; // 10.80 earned in lot 1
        billops::create_return(
            c,
            &ReturnRequest { bill_id: b.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "x".into(), refund_mode: "cash".into(), by: "Karthik".into(), manager_pin: "2222".into() },
        )?;
        assert_eq!(lot_rows(c, "c1")[0].1, 720, "a third of the 10.80 came back out of the bill's lot");
        lots_match_balance(c, "c1");
        // part of the bill's lot was spent elsewhere: the rest of the take-back comes from the other lots
        give_lot(c, "c1", 5_000, "2027-03-01T00:00:00.000Z");
        c.execute("UPDATE points_lots SET remaining=100 WHERE id=1", [])?;
        // keep the ledger in step with the edited lot: spend 6.20 through a plain ledger row
        c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('c1','2026-11-09T00:00:00.000Z','adjust',-620,'x','t')", [])?;
        c.execute("UPDATE customers SET loyalty_points=loyalty_points-620 WHERE id='c1'", [])?;
        billops::create_return(
            c,
            &ReturnRequest { bill_id: b.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "x".into(), refund_mode: "cash".into(), by: "Karthik".into(), manager_pin: "2222".into() },
        )?;
        let l = lot_rows(c, "c1");
        assert_eq!((l[0].1, l[1].1), (0, 5_000 - 260), "1.00 left in the bill's lot goes first, the other 2.60 from the next lot");
        lots_match_balance(c, "c1");
        Ok(())
    })
    .unwrap();
}

#[test]
fn expiry_job_lapses_due_lots_once_and_is_audited_as_system() {
    let (_d, db) = mini_db();
    db.with(|c| {
        give_lot(c, "c1", 1_000, "2020-01-01T00:00:00.000Z"); // due
        give_lot(c, "c1", 2_500, "2099-01-01T00:00:00.000Z"); // not yet
        let (n, p) = lots::expire_due(c)?;
        assert_eq!((n, p), (1, 1_000));
        assert_eq!(loyalty::balance(c, "c1")?, 2_500);
        let (kind, pts, by): (String, i64, String) = c.query_row("SELECT kind,points,by_name FROM points_ledger ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        assert_eq!((kind.as_str(), pts, by.as_str()), ("expire", -1_000, "System"));
        let audits: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='points_expire' AND by_name='System'", [], |r| r.get(0))?;
        assert_eq!(audits, 1);
        lots_match_balance(c, "c1");
        // a second (and third) run finds nothing and writes nothing
        let rows = count(c, "points_ledger");
        assert_eq!(lots::expire_due(c)?, (0, 0));
        assert_eq!(lots::expire_due(c)?, (0, 0));
        assert_eq!(count(c, "points_ledger"), rows);
        // the read-only view lists what is next
        let soon = lots::expiring_soon(c, 30)?;
        assert_eq!(soon["customers"], 0);
        Ok(())
    })
    .unwrap();
    // opening the day runs it too
    db.with(|c| {
        give_lot(c, "c1", 700, "2020-02-02T00:00:00.000Z");
        Ok(())
    })
    .unwrap();
    let owner = session(&db, "u1", "1111", false);
    dispatch_session(&db, &owner, "openDay", vec![json!({ "userId": "u1", "counts": {} })]).unwrap();
    db.with(|c| {
        assert_eq!(loyalty::balance(c, "c1")?, 2_500, "the day opening lapsed the due 7.00");
        Ok(())
    })
    .unwrap();
}

#[test]
fn imported_balances_are_one_lot_at_go_live_and_follow_the_go_live_date() {
    let (_d, db) = mini_db();
    db.with(|c| {
        for (id, name, pts) in [("c2", "Imported A", 7_856), ("c3", "Imported B", 150)] {
            c.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES(?1,?2,?1,0,0,?3,'2026-01-01T00:00:00Z')", params![id, name, pts])?;
            c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,'2026-11-07T10:00:00.000Z','adjust',?2,'Opening points from POSBean','import')", params![id, pts])?;
        }
        lots::backfill(c)?; // what migration 10 does for the existing ledger
        for id in ["c2", "c3"] {
            assert_eq!(lot_rows(c, id).len(), 1, "one lot per imported customer");
            lots_match_balance(c, id);
        }
        let (e, x): (String, String) = c.query_row("SELECT date(earned_at,'localtime'), date(expires_at,'localtime') FROM points_lots WHERE customer_id='c2'", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!((e.as_str(), x.as_str()), ("2026-11-07", "2027-11-07"), "dated at the go-live setting, not at the ledger row");
        // a bill earning keeps its own date and is not an import lot
        save_bill(c, &draft_with(oil(1000), 0, Some("c2"), "cash"))?;
        Ok(())
    })
    .unwrap();
    // only the owner may move the date
    let manager = session(&db, "u2", "2222", true);
    assert!(dispatch_session(&db, &manager, "setLoyaltyGoLive", vec![json!("2026-11-01")]).is_err());
    let owner = session(&db, "u1", "1111", true);
    assert!(dispatch_session(&db, &owner, "setLoyaltyGoLive", vec![json!("2099-01-01")]).is_err(), "not in the future");
    assert!(dispatch_session(&db, &owner, "setLoyaltyGoLive", vec![json!("garbage")]).is_err());
    let r = dispatch_session(&db, &owner, "setLoyaltyGoLive", vec![json!("2026-11-01")]).unwrap();
    assert_eq!(r["lots"], 2);
    db.with(|c| {
        for id in ["c2", "c3"] {
            let (e, x): (String, String) = c.query_row("SELECT date(earned_at,'localtime'), date(expires_at,'localtime') FROM points_lots WHERE customer_id=?1 AND source='import'", [id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            assert_eq!((e.as_str(), x.as_str()), ("2026-11-01", "2027-11-01"));
        }
        let bill_lot: String = c.query_row("SELECT date(earned_at,'localtime') FROM points_lots WHERE source='earn' AND customer_id='c2'", [], |r| r.get(0))?;
        assert_ne!(bill_lot, "2026-11-01", "lots earned on bills are never re-dated");
        assert_eq!(loyalty::balance(c, "c3")?, 150, "balances do not change");
        let audits: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='points_go_live'", [], |r| r.get(0))?;
        assert_eq!(audits, 1);
        let setting: String = c.query_row("SELECT value FROM settings WHERE key='loyalty.goLiveDate'", [], |r| r.get(0))?;
        assert_eq!(setting, "2026-11-01");
        Ok(())
    })
    .unwrap();
    let w = dispatch_session(&db, &owner, "getCustomerWallet", vec![json!("c3")]).unwrap();
    assert_eq!(w["nextExpiry"], json!({ "points": 1.5, "on": "2027-11-01" }));
    assert_eq!(w["rules"]["goLiveDate"], "2026-11-01");
}

#[test]
fn a_negative_balance_has_no_lot_and_later_earnings_net_it_off_first() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES('c9','Owes points','9',0,0,-1495,'2026-01-01T00:00:00Z')", [])?;
        c.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('c9','2026-11-07T10:00:00.000Z','adjust',-1495,'Opening points from POSBean','import')", [])?;
        lots::backfill(c)?;
        assert!(lot_rows(c, "c9").is_empty(), "no lot for a negative balance");
        lots_match_balance(c, "c9");
        assert_eq!(lots::next_expiry(c, "c9")?, Value::Null);
        // Rs 1,080 earns 10.80: all of it goes against the 14.95 owed, no lot
        save_bill(c, &draft_with(oil(3000), 0, Some("c9"), "cash"))?;
        assert_eq!(loyalty::balance(c, "c9")?, -415);
        assert!(lot_rows(c, "c9").is_empty());
        // the next 10.80: 4.15 nets off the rest, 6.65 becomes a lot
        save_bill(c, &draft_with(oil(3000), 0, Some("c9"), "cash"))?;
        assert_eq!(loyalty::balance(c, "c9")?, 665);
        assert_eq!(lot_rows(c, "c9").iter().map(|l| l.1).collect::<Vec<_>>(), vec![665]);
        lots_match_balance(c, "c9");
        Ok(())
    })
    .unwrap();
}

fn migrate_from_v9(path: &std::path::Path) {
    let conn = Connection::open(path).unwrap();
    for sql in [
        include_str!("../migrations/001_init.sql"),
        include_str!("../migrations/002_office.sql"),
        include_str!("../migrations/003_security.sql"),
        include_str!("../migrations/004_money_mill.sql"),
        include_str!("../migrations/005_loyalty_credit.sql"),
        include_str!("../migrations/006_points_hundredths.sql"),
        include_str!("../migrations/007_shelf_life.sql"),
        include_str!("../migrations/008_pos_parallel.sql"),
        include_str!("../migrations/009_points_module.sql"),
    ] {
        conn.execute_batch(sql).unwrap();
    }
    conn.execute_batch("PRAGMA user_version = 9").unwrap();
    // the live shop's old setting: expiry off
    conn.execute("INSERT INTO settings(key,value) VALUES('loyalty.expiryMonths','0') ON CONFLICT(key) DO UPDATE SET value='0'", []).unwrap();
    for (id, pts) in [("C1", 7856), ("C2", 150), ("C3", -1495), ("C4", 4_000)] {
        conn.execute("INSERT INTO customers(id,name,phone,credit_limit,outstanding,loyalty_points,created_at) VALUES(?1,?1,?1,0,0,?2,'2026-01-01T00:00:00Z')", params![id, pts]).unwrap();
        conn.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES(?1,'2026-11-07T00:00:00.000Z','adjust',?2,'Opening points from POSBean','import')", params![id, pts]).unwrap();
    }
    // C4 then spent 10.00 on a later day (a redeem row, no bill)
    conn.execute("INSERT INTO points_ledger(customer_id,at,kind,points,note,by_name) VALUES('C4','2026-11-08T00:00:00.000Z','redeem',-1000,'x','t')", []).unwrap();
    conn.execute("UPDATE customers SET loyalty_points=3000 WHERE id='C4'", []).unwrap();
}

#[test]
fn migration_10_fills_lots_from_the_ledger_keeps_every_balance_and_turns_expiry_on() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    migrate_from_v9(&path);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, gokul_core::db::latest_version());
        let total: i64 = c.query_row("SELECT SUM(loyalty_points) FROM customers", [], |r| r.get(0))?;
        assert_eq!(total, 7856 + 150 - 1495 + 3000, "no balance changed");
        for id in ["C1", "C2", "C3", "C4"] {
            lots_match_balance(c, id);
        }
        assert_eq!(lot_rows(c, "C4").iter().map(|l| l.1).collect::<Vec<_>>(), vec![3000], "the old redeem came off the import lot");
        let e: String = c.query_row("SELECT value FROM settings WHERE key='loyalty.expiryMonths'", [], |r| r.get(0))?;
        assert_eq!(e, "12");
        let g: String = c.query_row("SELECT value FROM settings WHERE key='loyalty.goLiveDate'", [], |r| r.get(0))?;
        assert_eq!(g, "2026-11-07");
        assert_eq!(c.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))?, "ok");
        assert_eq!(count(c, "points_ledger"), 5, "the ledger is untouched (nothing expired: lots lapse on 7 Nov 2027)");
        Ok(())
    })
    .unwrap();
    // opening again changes nothing (migration and expiry job are repeatable)
    drop(db);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(count(c, "points_lots"), 3);
        Ok(())
    })
    .unwrap();
}

/// Run by hand against a COPY of the real database:
/// `GOKUL_DB_COPY=path cargo test -p gokul-core --test lots real_copy -- --ignored --nocapture`
#[test]
#[ignore]
fn real_copy_lots_equal_balances() {
    let path = std::env::var("GOKUL_DB_COPY").expect("set GOKUL_DB_COPY to a COPY of gokul.db");
    let db = Db::open(std::path::Path::new(&path)).unwrap();
    db.with(|c| {
        let total: i64 = c.query_row("SELECT SUM(loyalty_points) FROM customers", [], |r| r.get(0))?;
        let lots: i64 = c.query_row("SELECT COALESCE(SUM(remaining),0) FROM points_lots", [], |r| r.get(0))?;
        let n: i64 = c.query_row("SELECT COUNT(*) FROM points_lots", [], |r| r.get(0))?;
        println!("balances {total}, lots {lots} in {n} lots");
        let ledger: i64 = c.query_row("SELECT SUM(points) FROM points_ledger", [], |r| r.get(0))?;
        assert_eq!(total, ledger, "cached balances equal the ledger");
        // the imported rows (kind adjust, noted Opening) are exactly the 1,16,383.98 points of the POSBean report; bills since then add on top
        let imported: i64 = c.query_row("SELECT SUM(points) FROM points_ledger WHERE kind='adjust' AND note LIKE 'Opening%'", [], |r| r.get(0))?;
        assert_eq!(imported, 11_638_398);
        let import_lots: i64 = c.query_row("SELECT COUNT(*) FROM points_lots WHERE source='import'", [], |r| r.get(0))?;
        println!("import lots {import_lots}");
        let ids: Vec<String> = c.prepare("SELECT id FROM customers")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        for id in ids {
            lots_match_balance(c, &id);
        }
        assert_eq!(c.query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))?, "ok");
        Ok(())
    })
    .unwrap();
}
