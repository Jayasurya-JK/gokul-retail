mod common;
use chrono::{Local, TimeZone};
use common::*;
use gokul_core::bills::{self, save_bill, save_bill_at, Fault};
use gokul_core::db::Db;
use gokul_core::types::*;
use gokul_core::{billops, dash, shift, store};
use rusqlite::Connection;
use serde_json::json;

fn bill_ids_rows(c: &Connection) -> [i64; 6] {
    ["bills", "bill_lines", "bill_payments", "stock_movements", "audit_log", "bill_slabs"].map(|t| count(c, t))
}

fn two_lines() -> Vec<BillLine> {
    vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5), line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]
}

// ---------- save bill ----------

#[test]
fn save_bill_writes_everything_in_one_go() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &cash_draft(two_lines()))?;
        assert!(b.number.starts_with("GK-") && b.number.ends_with("-000001"), "{}", b.number);
        assert_eq!(b.status, "paid");
        assert_eq!(b.totals.grand, 75_800); // 720.00 + 38.00
        assert_eq!(count(c, "bills"), 1);
        assert_eq!(count(c, "bill_lines"), 2);
        assert_eq!(count(c, "bill_payments"), 1);
        assert_eq!(count(c, "bill_slabs"), 2);
        assert_eq!(count(c, "stock_movements"), 3 + 2); // 3 opening + 2 sale
        assert_eq!(stock_of(c, "i1"), 50_000 - 2000);
        assert_eq!(stock_of(c, "i3"), 20_000 - 1000);
        // read back equals what was returned
        let back = bills::get_bill(c, &b.id)?.unwrap();
        assert_eq!(serde_json::to_value(&back)?, serde_json::to_value(&b)?);
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn payment_mismatch_is_rejected_and_nothing_is_saved() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut d = cash_draft(two_lines());
        d.payments[0].amount -= 100;
        let before = bill_ids_rows(c);
        assert!(save_bill(c, &d).is_err());
        assert_eq!(before, bill_ids_rows(c));
        let mut empty = cash_draft(two_lines());
        empty.lines.clear();
        assert!(save_bill(c, &empty).is_err());
        let mut credit = draft_with(two_lines(), 0, None, "credit");
        credit.customer_id = None;
        assert!(save_bill(c, &credit).is_err(), "credit needs a customer");
        // the failed saves did not burn a bill number
        assert!(save_bill(c, &cash_draft(two_lines()))?.number.ends_with("-000001"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn credit_bill_raises_customer_balance() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &draft_with(two_lines(), 0, Some("c1"), "credit"))?;
        assert_eq!(b.status, "credit");
        assert_eq!(b.customer_name, "Murugan");
        let o: i64 = c.query_row("SELECT outstanding FROM customers WHERE id='c1'", [], |r| r.get(0))?;
        assert_eq!(o, b.totals.grand);
        Ok(())
    })
    .unwrap();
}

#[test]
fn loose_quantity_in_milli_units() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &cash_draft(vec![line("i2", "102", "Groundnut Oil (Loose)", 1250, 36_000, 5)]))?;
        assert_eq!(b.lines[0].amount, 45_000); // 1.250 L x Rs 360
        assert_eq!(stock_of(c, "i2"), 100_000 - 1250);
        Ok(())
    })
    .unwrap();
}

// ---------- gapless numbering ----------

#[test]
fn bill_numbers_are_gapless_even_when_saves_fail() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut numbers = vec![];
        for i in 0..12 {
            if i % 3 == 1 {
                let fault = [Fault::AfterBillRow, Fault::AfterLines, Fault::AfterPayments, Fault::AfterStock][(i / 3) as usize % 4];
                assert!(save_bill_at(c, &cash_draft(two_lines()), Local::now(), Some(fault)).is_err());
            } else {
                numbers.push(save_bill(c, &cash_draft(two_lines()))?.number);
            }
        }
        let seqs: Vec<i64> = numbers.iter().map(|n| n.rsplit('-').next().unwrap().parse().unwrap()).collect();
        assert_eq!(seqs, (1..=seqs.len() as i64).collect::<Vec<_>>(), "numbers must be 1..N with no gaps: {numbers:?}");
        let gaps: i64 = c.query_row("SELECT MAX(seq) - COUNT(*) FROM bills", [], |r| r.get(0))?;
        assert_eq!(gaps, 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn numbering_restarts_each_financial_year() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let at = |y, m, d| Local.with_ymd_and_hms(y, m, d, 11, 0, 0).unwrap();
        let a = save_bill_at(c, &cash_draft(two_lines()), at(2027, 3, 31), None)?;
        let b = save_bill_at(c, &cash_draft(two_lines()), at(2027, 3, 31), None)?;
        let n = save_bill_at(c, &cash_draft(two_lines()), at(2027, 4, 1), None)?;
        let m = save_bill_at(c, &cash_draft(two_lines()), at(2027, 4, 2), None)?;
        assert_eq!((a.number.as_str(), b.number.as_str()), ("GK-26-000001", "GK-26-000002"));
        assert_eq!((n.number.as_str(), m.number.as_str()), ("GK-27-000001", "GK-27-000002"));
        Ok(())
    })
    .unwrap();
}

// ---------- crash safety ----------

#[test]
fn failure_at_every_step_leaves_nothing_partial() {
    let (_d, db) = mini_db();
    db.with(|c| {
        save_bill(c, &cash_draft(two_lines()))?; // one good bill first
        let before = bill_ids_rows(c);
        let stock = (stock_of(c, "i1"), stock_of(c, "i3"));
        for fault in [Fault::AfterBillRow, Fault::AfterLines, Fault::AfterPayments, Fault::AfterStock] {
            let r = save_bill_at(c, &draft_with(two_lines(), 0, Some("c1"), "credit"), Local::now(), Some(fault));
            assert!(r.is_err());
            assert_eq!(before, bill_ids_rows(c), "partial rows after {fault:?}");
            assert_eq!(stock, (stock_of(c, "i1"), stock_of(c, "i3")), "stock moved after {fault:?}");
            let o: i64 = c.query_row("SELECT outstanding FROM customers WHERE id='c1'", [], |r| r.get(0))?;
            assert_eq!(o, 0);
        }
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

/// Real process kill: a child process starts a bill transaction and aborts (no commit, no clean shutdown).
/// The parent reopens the file and finds it consistent with no trace of the bill. A second child commits first
/// and then dies: that bill must be there.
#[test]
fn killed_process_leaves_database_consistent() {
    if let Ok(path) = std::env::var("GOKUL_CRASH_CHILD") {
        let commit = std::env::var("GOKUL_CRASH_COMMIT").is_ok();
        let db = Db::open(std::path::Path::new(&path)).unwrap();
        db.with(|c| {
            if commit {
                save_bill(c, &cash_draft(two_lines()))?;
            } else {
                let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
                bills::write_bill(&tx, &cash_draft(two_lines()), Local::now(), None)?;
                std::mem::forget(tx); // never committed
            }
            Ok(())
        })
        .unwrap();
        std::process::abort();
    }

    let (dir, db) = mini_db();
    db.with(|c| save_bill(c, &cash_draft(two_lines())).map(|_| ())).unwrap();
    drop(db);
    let path = dir.path().join("gokul.db");
    let exe = std::env::current_exe().unwrap();
    let run = |commit: bool| {
        let mut cmd = std::process::Command::new(&exe);
        cmd.args(["killed_process_leaves_database_consistent", "--exact", "--nocapture", "--test-threads=1"]).env("GOKUL_CRASH_CHILD", &path);
        if commit {
            cmd.env("GOKUL_CRASH_COMMIT", "1");
        }
        assert!(!cmd.output().unwrap().status.success(), "child should have been killed");
    };

    run(false);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        assert_eq!(ok, "ok");
        assert_eq!(count(c, "bills"), 1, "uncommitted bill must not survive");
        assert_eq!(count(c, "bill_lines"), 2);
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
    drop(db);

    run(true);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(count(c, "bills"), 2, "committed bill must survive a kill");
        assert_eq!(count(c, "bill_lines"), 4);
        let nums: Vec<String> = c.prepare("SELECT number FROM bills ORDER BY id")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        assert!(nums[0].ends_with("000001") && nums[1].ends_with("000002"), "{nums:?}");
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

// ---------- never delete ----------

#[test]
fn books_cannot_be_deleted_or_rewritten() {
    let (_d, db) = mini_db();
    db.with(|c| {
        save_bill(c, &cash_draft(two_lines()))?;
        for sql in [
            "DELETE FROM bills",
            "DELETE FROM bill_lines",
            "DELETE FROM bill_payments",
            "DELETE FROM stock_movements",
            "DELETE FROM audit_log",
            "UPDATE stock_movements SET qty = 0",
            "UPDATE bill_lines SET qty = 1",
            "UPDATE audit_log SET action = 'x'",
        ] {
            assert!(c.execute(sql, []).is_err(), "{sql} should be refused");
        }
        Ok(())
    })
    .unwrap();
}

// ---------- cancel ----------

#[test]
fn cancel_restores_stock_and_keeps_the_bill() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &draft_with(two_lines(), 0, Some("c1"), "credit"))?;
        let req = |pin: &str| CancelRequest { bill_id: b.id.clone(), reason: "Wrong item billed".into(), manager_pin: pin.into(), by: "Karthik".into() };
        assert_eq!(billops::cancel_bill(c, &req("1234")).unwrap_err().to_string(), "Manager PIN is not correct"); // cashier PIN
        assert_eq!(billops::cancel_bill(c, &req("0000")).unwrap_err().to_string(), "Manager PIN is not correct");
        let d = billops::cancel_bill(c, &req("2222"))?;
        assert_eq!(d.bill.status, "cancelled");
        assert_eq!(d.cancel.as_ref().unwrap().approved_by, "Lakshmi");
        assert_eq!(count(c, "bills"), 1, "cancel never deletes");
        assert_eq!(count(c, "bill_lines"), 2);
        assert_eq!(stock_of(c, "i1"), 50_000);
        assert_eq!(stock_of(c, "i3"), 20_000);
        let kinds: Vec<String> = c.prepare("SELECT kind FROM stock_movements WHERE kind IN ('sale','cancel') ORDER BY id")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        assert_eq!(kinds, ["sale", "sale", "cancel", "cancel"]);
        let o: i64 = c.query_row("SELECT outstanding FROM customers WHERE id='c1'", [], |r| r.get(0))?;
        assert_eq!(o, 0, "credit given back");
        assert_eq!(billops::cancel_bill(c, &req("2222")).unwrap_err().to_string(), "This bill is already cancelled");
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

// ---------- returns ----------

#[test]
fn partial_and_full_returns() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &cash_draft(two_lines()))?; // i1 x2, i3 x1
        let ret = |picks: Vec<(i64, i64)>, mode: &str| ReturnRequest {
            bill_id: b.id.clone(),
            picks: picks.into_iter().map(|(i, q)| ReturnPick { line_index: i, qty: q }).collect(),
            reason: "Seal broken / leaking".into(),
            refund_mode: mode.into(),
            by: "Karthik".into(),
            manager_pin: "2222".into(),
        };
        let cn = billops::create_return(c, &ret(vec![(0, 1000)], "cash"))?;
        assert!(cn.number.starts_with("CN-") && cn.number.ends_with("-000001"));
        assert_eq!(cn.totals.grand, 36_000);
        assert_eq!(stock_of(c, "i1"), 50_000 - 2000 + 1000);
        let det = billops::get_bill_detail(c, &b.id)?.unwrap();
        assert_eq!(det.returned, [1000, 0]);
        assert_eq!(det.bill.status, "paid");

        assert!(billops::create_return(c, &ret(vec![(0, 1500)], "cash")).unwrap_err().to_string().contains("Cannot return more"));
        assert!(billops::create_return(c, &ret(vec![(0, 600), (0, 600)], "cash")).is_err(), "duplicate picks cannot exceed what was sold");
        assert!(billops::create_return(c, &ret(vec![], "cash")).is_err());

        let cn2 = billops::create_return(c, &ret(vec![(0, 1000), (1, 1000)], "exchange"))?;
        assert_eq!(cn2.number.rsplit('-').next().unwrap(), "000002");
        assert_eq!(billops::get_bill_detail(c, &b.id)?.unwrap().bill.status, "returned");
        assert_eq!(stock_of(c, "i1"), 50_000);
        assert_eq!(stock_of(c, "i3"), 20_000);
        assert_eq!(billops::get_pending_exchange(c)?.unwrap().number, cn2.number);
        billops::clear_pending_exchange(c)?;
        assert!(billops::get_pending_exchange(c)?.is_none());
        assert_eq!(count(c, "bills"), 1);
        assert_eq!(count(c, "credit_notes"), 2);

        // cancel is refused once anything was returned
        let err = billops::cancel_bill(c, &CancelRequest { bill_id: b.id.clone(), reason: "x".into(), manager_pin: "1111".into(), by: "a".into() }).unwrap_err();
        assert!(err.to_string().contains("already returned"));
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn credit_bill_cannot_be_refunded_in_cash() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &draft_with(two_lines(), 0, Some("c1"), "credit"))?;
        let mk = |mode: &str| ReturnRequest { bill_id: b.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 1000 }], reason: "r".into(), refund_mode: mode.into(), by: "k".into(), manager_pin: "2222".into() };
        assert!(billops::create_return(c, &mk("cash")).is_err());
        assert!(billops::create_return(c, &mk("upi")).is_err());
        billops::create_return(c, &mk("credit_note"))?;
        let o: i64 = c.query_row("SELECT outstanding FROM customers WHERE id='c1'", [], |r| r.get(0))?;
        assert_eq!(o, b.totals.grand - 36_000);
        Ok(())
    })
    .unwrap();
}

#[test]
fn exchange_credit_used_on_a_bill_is_marked_used() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let b = save_bill(c, &cash_draft(two_lines()))?;
        let cn = billops::create_return(c, &ReturnRequest { bill_id: b.id, picks: vec![ReturnPick { line_index: 1, qty: 1000 }], reason: "r".into(), refund_mode: "exchange".into(), by: "k".into(), manager_pin: "2222".into() })?;
        let mut d = cash_draft(vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]);
        d.payments = vec![Payment { mode: "credit_note".into(), amount: d.payments[0].amount, r#ref: Some(cn.number.clone()) }];
        save_bill(c, &d)?;
        assert!(billops::get_pending_exchange(c)?.is_none());
        Ok(())
    })
    .unwrap();
}

// ---------- stock ledger ----------

#[test]
fn stock_ledger_always_balances() {
    let (_d, db) = mini_db();
    db.with(|c| {
        for i in 0..20 {
            let b = save_bill(c, &cash_draft(vec![line("i1", "101", "x", 1000 + i * 100, 36_000, 5), line("i2", "102", "y", 250 + i, 36_000, 5)]))?;
            if i % 4 == 0 {
                billops::cancel_bill(c, &CancelRequest { bill_id: b.id, reason: "r".into(), manager_pin: "1111".into(), by: "o".into() })?;
            } else if i % 4 == 1 {
                billops::create_return(c, &ReturnRequest { bill_id: b.id, picks: vec![ReturnPick { line_index: 1, qty: 100 }], reason: "r".into(), refund_mode: "cash".into(), by: "o".into(), manager_pin: "2222".into() })?;
            }
        }
        assert!(dash::ledger_mismatches(c)?.is_empty());
        let (sum, stock): (i64, i64) = c.query_row("SELECT (SELECT SUM(qty) FROM stock_movements), (SELECT SUM(stock) FROM items)", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!(sum, stock);
        let m = dash::list_stock_movements(c, 5)?;
        assert_eq!(m.len(), 5);
        Ok(())
    })
    .unwrap();
}

// ---------- PINs and users ----------

#[test]
fn pins_are_hashed_and_checked() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let hashes: Vec<String> = c.prepare("SELECT pin_hash FROM users")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        for h in &hashes {
            assert!(h.starts_with("$argon2id$"), "{h}");
            for plain in ["1111", "2222", "1234"] {
                assert!(!h.contains(plain) || h.len() > 40);
            }
        }
        assert_ne!(hashes[0], hashes[1]);
        assert!(store::verify_pin(c, "u3", "1234")?.is_some());
        assert!(store::verify_pin(c, "u3", "1111")?.is_none());
        assert!(store::verify_pin(c, "nobody", "1234")?.is_none());
        let u = store::verify_pin(c, "u1", "1111")?.unwrap();
        assert_eq!(u.pin, "", "PIN never leaves the database");
        assert_eq!(store::find_manager(c, "2222")?.unwrap().name, "Lakshmi");
        assert!(store::find_manager(c, "1234")?.is_none(), "cashier PIN is not a manager PIN");
        assert!(count(c, "audit_log") >= 3, "logins and failures are audited");
        Ok(())
    })
    .unwrap();
}

// ---------- items ----------

#[test]
fn item_lookup_by_barcode_code_and_search() {
    let (_d, db) = mini_db();
    db.with(|c| {
        assert_eq!(store::find_item_by_code(c, "8904000000011")?.unwrap().id, "i1");
        assert_eq!(store::find_item_by_code(c, " 102 ")?.unwrap().id, "i2");
        assert!(store::find_item_by_code(c, "nope")?.is_none());
        assert!(store::find_item_by_code(c, "")?.is_none());
        let hits = store::search_items(c, "ground loose", 10)?;
        assert_eq!(hits[0].id, "i2");
        assert_eq!(store::search_items(c, "", 2)?.len(), 2);
        c.execute("UPDATE items SET active=0 WHERE id='i3'", [])?;
        assert!(store::find_item_by_code(c, "103")?.is_none(), "inactive items cannot be scanned");
        assert_eq!(store::list_items(c)?.len(), 3, "but Office still lists them");
        assert_eq!(store::low_stock(c, 10)?.len(), 0);
        Ok(())
    })
    .unwrap();
}

// ---------- held bills ----------

#[test]
fn hold_and_recall_keeps_the_row() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let h = bills::hold_bill(c, &BillDraft { payments: vec![], ..cash_draft(two_lines()) })?;
        assert_eq!(bills::list_held(c)?.len(), 1);
        let back = bills::recall_held(c, &h.id)?.unwrap();
        assert_eq!(back.lines.len(), 2);
        assert_eq!(bills::list_held(c)?.len(), 0);
        assert!(bills::recall_held(c, &h.id)?.is_none());
        assert_eq!(count(c, "held_bills"), 1, "recalled drafts are hidden, not deleted");
        Ok(())
    })
    .unwrap();
}

// ---------- shift ----------

#[test]
fn day_open_cash_x_report_and_z_close() {
    let (_d, db) = mini_db();
    db.with(|c| {
        assert!(!shift::day_status(c)?.open);
        assert!(shift::add_cash_entry(c, &CashEntryInput { kind: "out".into(), reason: "Tea".into(), amount: 100, note: "".into(), by: "k".into() }).is_err());
        let counts: DenomCounts = [("500".to_string(), 2), ("100".to_string(), 3), ("coins".to_string(), 50)].into();
        let s = shift::open_day(c, "u3", &counts)?;
        assert_eq!(s.opening_cash, 100_000 + 30_000 + 5_000);
        assert_eq!(shift::open_day(c, "u3", &counts)?.id, s.id, "never two open drawers");
        assert!(shift::day_status(c)?.open);

        shift::add_cash_entry(c, &CashEntryInput { kind: "out".into(), reason: "Tea and snacks".into(), amount: 6_000, note: "".into(), by: "Karthik".into() })?;
        shift::add_cash_entry(c, &CashEntryInput { kind: "in".into(), reason: "Change added".into(), amount: 20_000, note: "".into(), by: "Karthik".into() })?;
        assert_eq!(shift::list_cash_entries(c)?.len(), 2);

        let b1 = save_bill(c, &cash_draft(two_lines()))?; // 758.00 cash
        let b2 = save_bill(c, &draft_with(two_lines(), 0, Some("c1"), "credit"))?; // credit
        let b3 = save_bill(c, &cash_draft(vec![line("i3", "103", "Dish Wash Bar", 2000, 3_800, 18)]))?; // 76.00
        billops::cancel_bill(c, &CancelRequest { bill_id: b3.id.clone(), reason: "r".into(), manager_pin: "2222".into(), by: "k".into() })?;
        billops::create_return(c, &ReturnRequest { bill_id: b1.id.clone(), picks: vec![ReturnPick { line_index: 1, qty: 1000 }], reason: "r".into(), refund_mode: "cash".into(), by: "k".into(), manager_pin: "2222".into() })?;
        let _ = b2;

        let x = shift::shift_summary(c)?;
        assert_eq!(x.bill_count, 2);
        assert_eq!(x.sales, 2 * 75_800);
        assert_eq!(x.by_mode.cash, 75_800);
        assert_eq!(x.by_mode.credit, 75_800);
        assert_eq!(x.cancel_count, 1);
        assert_eq!(x.cancel_amount, 7_600);
        assert_eq!(x.returns_count, 1);
        assert_eq!(x.returns_amount, 3_800);
        assert_eq!((x.cash_in, x.cash_out), (20_000, 6_000));
        let slab_gst: i64 = x.slabs.iter().map(|s| s.cgst + s.sgst).sum();
        assert_eq!(slab_gst, x.cgst + x.sgst);
        // opening + cash sales + in - out - cash refund
        assert_eq!(x.expected_cash, 135_000 + 75_800 + 20_000 - 6_000 - 3_800);

        let z_counts: DenomCounts = [("500".to_string(), 40)].into();
        assert!(shift::close_day(c, "u3", &z_counts, "1234")?.is_none(), "cashier PIN cannot close the day");
        assert!(shift::day_status(c)?.open);
        let z = shift::close_day(c, "u3", &z_counts, "2222")?.unwrap();
        assert!(z.number.starts_with("Z-") && z.number.ends_with("-000001"));
        assert_eq!(z.counted, 2_000_000);
        assert_eq!(z.difference, z.counted - z.expected);
        assert_eq!(z.approved_by, "Lakshmi");
        let st = shift::day_status(c)?;
        assert!(!st.open && st.last_closed_at.is_some());
        assert_eq!(st.suggested_float, 135_000);
        assert!(shift::close_day(c, "u3", &z_counts, "2222").is_err(), "already closed");
        // bills made while closed still save (never block a sale) and carry no shift
        let late = save_bill(c, &cash_draft(two_lines()))?;
        assert!(late.number.ends_with("000004"));
        Ok(())
    })
    .unwrap();
}

// ---------- dispatch (the Tauri entry point) ----------

#[test]
fn dispatch_speaks_the_typescript_api() {
    let (_d, db) = mini_db();
    let v = gokul_core::dispatch(&db, "saveBill", vec![json!({
        "customerName": "Walk-in",
        "lines": [{"itemId":"i1","code":"101","name":"Groundnut Oil 1 L","unit":"btl","qty":1000,"rate":36000,"discount":0,"gstRate":5,"amount":36000}],
        "billDiscount": 0,
        "payments": [{"mode":"upi","amount":36000,"ref":"UPI123"}],
        "cashier": "Karthik"
    })]).unwrap();
    assert_eq!(v["totals"]["grand"], 36000);
    assert_eq!(v["status"], "paid");
    assert_eq!(v["payments"][0]["ref"], "UPI123");
    assert!(v["id"].as_str().unwrap().starts_with('b'));
    let item = gokul_core::dispatch(&db, "findItemByCode", vec![json!("8904000000011")]).unwrap();
    assert_eq!(item["stock"], 49000);
    assert_eq!(item["gstRate"], 5);
    assert!(gokul_core::dispatch(&db, "findItemByCode", vec![json!("0")]).unwrap().is_null());
    let err = gokul_core::dispatch(&db, "nope", vec![]).unwrap_err().to_string();
    assert!(err.contains("Unknown call"));
    assert!(gokul_core::dispatch(&db, "saveBill", vec![json!({"lines": "bad"})]).is_err());
    // every advertised method is wired (none answers "Unknown call")
    for m in gokul_core::METHODS {
        if let Err(e) = gokul_core::dispatch(&db, m, vec![]) {
            assert!(!e.to_string().contains("Unknown call"), "{m} is listed but not wired");
        }
    }
}

// ---------- demo seed ----------

#[test]
fn demo_seed_matches_the_mock_shop_and_is_fast() {
    let dir = tempfile::tempdir().unwrap();
    let t = std::time::Instant::now();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    assert!(gokul_core::seed_demo_if_empty(&db).unwrap());
    let took = t.elapsed();
    println!("open + migrate + seed_demo: {took:?}");
    assert!(took.as_millis() < 2000, "startup with seeding must stay under 2 s, was {took:?}");
    assert!(!gokul_core::seed_demo_if_empty(&db).unwrap(), "seeds once only");
    db.with(|c| {
        // 132 shop items as in the mock, plus the mill items the demo sheets create (punnaku R, malli, the aravai service).
        let shop_items = c.query_row("SELECT COUNT(*) FROM items WHERE kind='item'", [], |r| r.get::<_, i64>(0))?;
        assert!((132..=137).contains(&shop_items), "{shop_items} items");
        assert_eq!(count(c, "customers"), 60);
        assert_eq!(count(c, "users"), 5);
        // 1,573 counter bills as in the mock, plus the aravai charges of the demo mill sheets.
        let bills = count(c, "bills");
        assert!((1573..=1580).contains(&bills), "{bills} bills");
        assert_eq!(c.query_row("SELECT COUNT(*) FROM categories WHERE substr(id,1,1) != '_'", [], |r| r.get::<_, i64>(0))?, 9);
        assert!(dash::ledger_mismatches(c)?.is_empty(), "demo stock ledger balances");
        let items = store::list_items(c)?;
        assert_eq!(items[0].name, "Groundnut Oil (Loose)");
        assert_eq!(items[0].id, "i101");
        assert!(items[0].loose && items[0].name_ta.is_some());
        let s = store::get_settings(c)?;
        assert_eq!((s.shop_name.as_str(), s.bill_prefix.as_str(), s.round_to_rupee), ("Gokul Oils", "GK", true));
        let users = store::list_users(c)?;
        assert_eq!(users.len(), 5);
        assert!(users.iter().all(|u| u.pin.is_empty()));
        assert!(store::verify_pin(c, "u1", "1111")?.is_some());
        assert!(store::verify_pin(c, "u2", "2222")?.is_some());
        assert!(store::verify_pin(c, "u3", "1234")?.is_some());
        let d = dash::dashboard(c)?;
        assert_eq!(d.last30.len(), 30);
        assert!(d.today_bills > 0 && d.today_sales > 0, "today has demo bills");
        assert!(!dash::top_items(c, 30, 5)?.is_empty());
        assert!(!store::low_stock(c, 8)?.is_empty());
        let cust = store::list_customers(c)?;
        assert_eq!(cust.len(), 60);
        let b = bills::list_bills(c, &BillFilter { limit: Some(5), ..Default::default() })?;
        assert_eq!(b.len(), 5);
        // saving a new bill on top of the demo works and continues the numbering
        let it = store::find_item_by_code(c, &items[1].barcode)?.unwrap();
        let nb = save_bill(c, &cash_draft(vec![line(&it.id, &it.code, &it.name, 1000, it.price, it.gst_rate)]))?;
        assert!(nb.number.ends_with(&format!("-{:06}", bills + 1)), "{}", nb.number);
        Ok(())
    })
    .unwrap();
}
