//! Returns and exchanges as GST credit notes: every note names the invoice it is against, keeps the invoice's place of supply and
//! recipient, reverses the same tax heads, and can never be deleted or reused.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::billops::{create_return, get_pending_exchange, list_credit_notes};
use gokul_core::{crm, db};
use gokul_core::types::*;
use rusqlite::Connection;
use serde_json::{json, Value};

fn de<T: serde::de::DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn customer(c: &mut Connection, name: &str, gstin: &str, state: &str) -> String {
    let b2b = !gstin.is_empty();
    let row = crm::save_customer(c, &de(json!({ "name": name, "phone": "98400 33333", "area": "X", "type": if b2b { "b2b" } else { "retail" },
        "business": if b2b { name } else { "" }, "gstin": gstin, "stateCode": state, "address": "7 Market Road", "creditLimit": 0 }))).unwrap();
    row["id"].as_str().unwrap().to_string()
}

fn draft(cust: &str) -> BillDraft {
    let mut d = draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 3000, 38_000, 5), line("i3", "103", "Dish Wash Bar", 2000, 11_801, 18)], 555, Some(cust), "cash");
    d.customer_name = None;
    d
}

fn ret(c: &mut Connection, bill: &Bill, picks: Vec<(i64, i64)>, mode: &str) -> CreditNote {
    create_return(
        c,
        &ReturnRequest {
            bill_id: bill.id.clone(),
            picks: picks.into_iter().map(|(i, q)| ReturnPick { line_index: i, qty: q }).collect(),
            reason: "Seal broken".into(),
            refund_mode: mode.into(),
            by: "Lakshmi".into(),
            manager_pin: "2222".into(),
        },
    )
    .unwrap()
}

fn heads(n: &CreditNote) -> (i64, i64, i64) {
    (n.totals.slabs.iter().map(|s| s.cgst).sum(), n.totals.slabs.iter().map(|s| s.sgst).sum(), n.totals.slabs.iter().map(|s| s.igst).sum())
}

#[test]
fn several_part_returns_each_name_the_same_invoice_with_consecutive_numbers() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let pune = customer(c, "Pune Traders", "27AAPFU0939F1ZV", "");
        let bill = save_bill(c, &draft(&pune))?;
        let a = ret(c, &bill, vec![(0, 1000)], "cash");
        let b = ret(c, &bill, vec![(0, 1000), (1, 2000)], "cash");
        for n in [&a, &b] {
            assert_eq!((n.bill_number.as_str(), n.bill_at.as_str()), (bill.number.as_str(), bill.at.as_str()), "the original invoice and its date");
            assert_eq!((n.place_of_supply.as_str(), n.supply_type.as_str(), n.customer_gstin.as_str()), ("27", "inter", "27AAPFU0939F1ZV"));
            let (cg, sg, ig) = heads(n);
            assert_eq!((cg, sg), (0, 0));
            assert!(ig > 0);
            // each note's lines tie to its own slabs
            let sum: i64 = n.lines.iter().map(|l| { let t = l.tax.as_ref().unwrap(); t.taxable + t.cgst + t.sgst + t.igst + t.cess }).sum();
            assert_eq!(sum, n.totals.before_round);
        }
        // own series: consecutive, unique, not the bill series
        let (na, nb) = (&a.number, &b.number);
        assert_eq!((na.as_str(), nb.as_str()), ("CN-26-000001", "CN-26-000002"));
        assert!(na.len() <= 16 && nb.len() <= 16);
        let all = list_credit_notes(c, 10)?;
        assert_eq!(all.len(), 2);
        // a return above what was sold is refused and burns no number
        assert!(create_return(c, &ReturnRequest { bill_id: bill.id.clone(), picks: vec![ReturnPick { line_index: 0, qty: 5000 }], reason: "x".into(), refund_mode: "cash".into(), by: "L".into(), manager_pin: "2222".into() }).is_err());
        let next = ret(c, &bill, vec![(1, 0)].into_iter().filter(|p| p.1 > 0).chain([(0, 1000)]).collect(), "cash");
        assert_eq!(next.number, "CN-26-000003", "a refused return leaves no gap in the numbers");
        Ok(())
    })
    .unwrap();
}

#[test]
fn an_exchange_note_keeps_the_place_of_supply_and_the_new_bill_charges_its_own_tax() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let bill = save_bill(c, &draft(&kerala))?;
        let cn = ret(c, &bill, vec![(0, 1000)], "exchange");
        assert_eq!((cn.place_of_supply.as_str(), cn.supply_type.as_str()), ("32", "inter"));
        assert!(heads(&cn).2 > 0, "IGST reversed on the exchange credit note");
        assert_eq!(get_pending_exchange(c)?.unwrap().number, cn.number);
        // the new bill is its own invoice with its own place of supply (here a local walk-in), and uses the credit as a payment
        let mut nb = cash_draft(vec![line("i3", "103", "Dish Wash Bar", 10_000, 11_801, 18)]);
        let total = gokul_core::money::compute_totals(&nb.lines.iter().map(gokul_core::money::recalc_line).collect::<Vec<_>>(), 0, true).grand;
        let credit = cn.balance;
        nb.payments = vec![Payment { mode: "credit_note".into(), amount: credit, r#ref: Some(cn.number.clone()) }, Payment { mode: "cash".into(), amount: total - credit, r#ref: None }];
        let b2 = save_bill(c, &nb)?;
        assert_eq!(b2.extras.supply_type, "intra");
        assert!(b2.totals.slabs.iter().all(|s| s.igst == 0 && s.cgst > 0));
        Ok(())
    })
    .unwrap();
}

#[test]
fn credit_notes_cannot_be_deleted_and_the_invoice_is_kept() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let local = customer(c, "Local Mess", "33AAKFG4821M1Z9", "");
        let bill = save_bill(c, &draft(&local))?;
        let cn = ret(c, &bill, vec![(0, 1000)], "cash");
        assert!(c.execute("DELETE FROM credit_notes WHERE number=?1", [&cn.number]).is_err());
        assert!(c.execute("DELETE FROM credit_note_lines", []).is_err());
        assert!(c.execute("DELETE FROM bills", []).is_err());
        let n: i64 = c.query_row("SELECT COUNT(*) FROM credit_notes WHERE bill_id=?1", [db::parse_id("b", &bill.id).unwrap()], |r| r.get(0))?;
        assert_eq!(n, 1);
        let (pos, st): (String, String) = c.query_row("SELECT place_of_supply,supply_type FROM credit_notes WHERE number=?1", [&cn.number], |r| Ok((r.get(0)?, r.get(1)?)))?;
        assert_eq!((pos.as_str(), st.as_str()), ("33", "intra"));
        Ok(())
    })
    .unwrap();
}
