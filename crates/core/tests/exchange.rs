//! Exchange where the new bill is smaller than the credit: the difference goes back to the customer.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::types::*;
use gokul_core::{billops, dash, shift};
use std::collections::BTreeMap;

fn pay(mode: &str, amount: i64, r: Option<&str>) -> Payment {
    Payment { mode: mode.into(), amount, r#ref: r.map(String::from) }
}

fn exchange_of(c: &mut rusqlite::Connection, bill_id: &str, line_index: i64) -> CreditNote {
    billops::create_return(
        c,
        &ReturnRequest { bill_id: bill_id.into(), picks: vec![ReturnPick { line_index, qty: 1000 }], reason: "r".into(), refund_mode: "exchange".into(), by: "Karthik".into(), manager_pin: "2222".into() },
    )
    .unwrap()
}

fn small_bill(cn: &CreditNote, mode: &str, pin: Option<&str>, amount: i64) -> BillDraft {
    let mut d = cash_draft(vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]);
    d.payments = vec![pay("credit_note", 3_800, Some(&cn.number))];
    d.extras.exchange_refund = Some(ExchangeRefund { mode: mode.into(), amount, credit_note: cn.number.clone() });
    d.manager_pin = pin.map(String::from);
    d
}

#[test]
fn smaller_exchange_bill_refunds_the_difference_in_cash_and_the_drawer_follows() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut counts: DenomCounts = BTreeMap::new();
        counts.insert("500".into(), 4); // Rs 2,000 float
        shift::open_day(c, "u3", &counts)?;
        let orig = save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5), line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]))?;
        let cn = exchange_of(c, &orig.id, 0); // one oil back: Rs 360
        assert_eq!(cn.totals.grand, 36_000);
        assert_eq!(cn.balance, 36_000);
        assert_eq!(cn.totals.slabs.len(), 1);
        assert_eq!(cn.totals.slabs[0].rate, 5.0, "the credit note reverses the 5% GST of the returned oil");

        // no PIN for a cashier: refused, nothing saved
        let before = count(c, "bills");
        let e = save_bill(c, &small_bill(&cn, "cash", None, 32_200)).unwrap_err().to_string();
        assert!(e.contains("manager PIN is needed"), "{e}");
        assert_eq!(count(c, "bills"), before);
        assert_eq!(count(c, "exchange_refunds"), 0);
        // wrong amount: refused
        assert!(save_bill(c, &small_bill(&cn, "cash", Some("2222"), 10_000)).is_err());
        assert_eq!(billops::get_pending_exchange(c)?.unwrap().number, cn.number);

        let nb = save_bill(c, &small_bill(&cn, "cash", Some("2222"), 32_200))?;
        assert_eq!(nb.totals.grand, 3_800);
        assert_eq!(nb.totals.slabs.len(), 1);
        assert_eq!(nb.totals.slabs[0].rate, 18.0, "the new bill charges GST only on the new line");
        assert_eq!(nb.totals.gst, 580);
        assert_eq!(nb.extras.exchange_refund.as_ref().unwrap().amount, 32_200);
        assert_eq!(count(c, "exchange_refunds"), 1);
        assert!(billops::get_pending_exchange(c)?.is_none(), "credit fully used (bill + refund)");
        let back = gokul_core::bills::get_bill(c, &nb.id)?.unwrap();
        assert_eq!(back.extras.exchange_refund, nb.extras.exchange_refund);
        let audit: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='exchange_refund' AND detail LIKE '%Lakshmi%'", [], |r| r.get(0))?;
        assert_eq!(audit, 1, "approver is named in the audit log");

        // drawer: float 2000 + original cash 758 - refund 322
        let x = shift::shift_summary(c)?;
        assert_eq!(x.cash_refunds, 32_200);
        assert_eq!(x.expected_cash, 200_000 + 75_800 - 32_200);
        assert!(dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn upi_refund_does_not_touch_the_drawer() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let mut counts: DenomCounts = BTreeMap::new();
        counts.insert("500".into(), 2);
        shift::open_day(c, "u3", &counts)?;
        let orig = save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5), line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]))?;
        let cn = exchange_of(c, &orig.id, 0);
        save_bill(c, &small_bill(&cn, "upi", Some("1111"), 32_200))?;
        let x = shift::shift_summary(c)?;
        assert_eq!(x.cash_refunds, 0);
        assert_eq!(x.expected_cash, 100_000 + 39_800);
        Ok(())
    })
    .unwrap();
}

#[test]
fn remove_exchange_keeps_the_credit_as_store_credit_for_the_customer() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let orig = save_bill(c, &draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5)], 0, Some("c1"), "cash"))?;
        let cn = exchange_of(c, &orig.id, 0);
        assert!(billops::get_pending_exchange(c)?.is_some());
        billops::clear_pending_exchange(c)?;
        assert!(billops::get_pending_exchange(c)?.is_none());
        // the note is not lost: it is store credit of the customer, unused, and can be spent in parts later
        let open = gokul_core::loyalty::open_credit_notes(c, "c1")?;
        assert_eq!(open.len(), 1);
        assert_eq!(open[0]["number"], cn.number.as_str());
        assert_eq!(open[0]["balance"], 36_000);
        let mut d = cash_draft(vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]);
        d.customer_id = Some("c1".into());
        d.payments = vec![pay("credit_note", 2_000, Some(&cn.number)), pay("cash", 1_800, None)];
        save_bill(c, &d)?;
        assert_eq!(gokul_core::loyalty::open_credit_notes(c, "c1")?[0]["balance"], 34_000, "partial redeem leaves the rest");
        Ok(())
    })
    .unwrap();
}
