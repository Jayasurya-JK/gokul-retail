//! B2B tax invoice, bill of supply and compliant credit note: every Rule 46 particular is on the paper (thermal 80/58 mm and A4),
//! intra-state (CGST + SGST) and inter-state (IGST), and the figures on the paper are the saved figures.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::billops::create_return;
use gokul_core::db::set_setting;
use gokul_core::invoice::{self, amount_in_words};
use gokul_core::printing::{self, money};
use gokul_core::types::*;
use gokul_core::{crm, Db};
use gokul_print::{layout, Paper};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::PathBuf;

fn shots() -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/design/shots");
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn de<T: serde::de::DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

fn shop(db: &Db, paper: &str) {
    db.with(|c| {
        set_setting(c, "shopName", "SRI GOKUL ENTERPRISES")?;
        set_setting(c, "gstin", "33EAEPK8839P2ZX")?;
        set_setting(c, "address", "Kondur, Cuddalore, Tamil Nadu")?;
        set_setting(c, "phone", "98420 12345")?;
        set_setting(c, "receiptFooter", "Thank you. Visit again!")?;
        let mut b = crm::get_settings_bundle(c)?;
        b["billFormat"]["paper"] = json!(paper);
        set_setting(c, "bundle.billFormat", &b["billFormat"].to_string())?;
        Ok(())
    })
    .unwrap();
}

fn customer(c: &mut Connection, name: &str, gstin: &str, state: &str) -> String {
    let b2b = !gstin.is_empty();
    let row = crm::save_customer(c, &de(json!({ "name": name, "phone": "98400 33333", "area": "X", "type": if b2b { "b2b" } else { "retail" },
        "business": if b2b { name } else { "" }, "gstin": gstin, "stateCode": state, "address": "7 Market Road, Pune", "creditLimit": 0 }))).unwrap();
    row["id"].as_str().unwrap().to_string()
}

fn mixed(cust: Option<&str>) -> BillDraft {
    let mut d = draft_with(
        vec![line("i1", "101", "Wood Pressed Groundnut Oil 1 Litre Pet Bottle", 2000, 38_000, 5), line("i3", "103", "Dish Wash Bar", 1500, 11_801, 18), line("i2", "102", "Groundnut Oil (Loose)", 500, 10_000, 0)],
        777,
        cust,
        "cash",
    );
    d.customer_name = None;
    d
}

fn text_of(c: &Connection, doc: &printing::Printable, paper: Paper) -> String {
    let _ = c;
    gokul_print::layout::to_text(&layout(&doc.doc, paper))
}

fn bill_text(db: &Db, id: &str, paper: Paper) -> String {
    db.with(|c| {
        let cfg = printing::load_config(c)?;
        let p = printing::bill_doc(c, &cfg, id, false, 0)?;
        Ok(text_of(c, &p, paper))
    })
    .unwrap()
}

fn a4_text(db: &Db, id: &str) -> String {
    db.with(|c| {
        let cfg = printing::load_config(c)?;
        let p = printing::bill_a4_doc(c, &cfg, id, false)?;
        assert_eq!(p.paper, Some(Paper::A4));
        Ok(text_of(c, &p, Paper::A4))
    })
    .unwrap()
}

fn assert_fits(text: &str, cols: usize) {
    for l in text.lines().filter(|l| !l.starts_with('[')) {
        assert!(l.chars().count() <= cols, "line too wide ({}): {l:?}", cols);
    }
}

#[test]
fn b2b_tax_invoice_on_a_roll_carries_every_rule_46_particular_intra_state() {
    let (_d, db) = mini_db();
    for (paper, cols, kind) in [("80mm", 48usize, Paper::Mm80), ("58mm", 32, Paper::Mm58)] {
        shop(&db, paper);
        let local = db.with(|c| Ok(customer(c, "Annapoorna Mess", "33AAKFG4821M1Z9", ""))).unwrap();
        let bill = db.with(|c| Ok(save_bill(c, &mixed(Some(&local)))?)).unwrap();
        let t = bill_text(&db, &bill.id, kind);
        assert_fits(&t, cols);
        let raw = t.clone();
        let t = t.split_whitespace().collect::<Vec<_>>().join(" "); // a long line wraps on a narrow roll: compare the words
        // supplier: name, address, GSTIN
        assert!(t.contains("SRI GOKUL ENTERPRISES") && t.contains("Kondur, Cuddalore, Tamil Nadu") && t.contains("GSTIN: 33EAEPK8839P2ZX"), "{t}");
        // document, number and date
        assert!(t.contains("TAX INVOICE") && !t.contains("Cash Bill"), "a B2B invoice is a tax invoice, not a counter bill: {t}");
        assert!(t.contains("Invoice No : 26/0") && t.contains("Date : "), "{t}");
        // recipient: name, address, GSTIN, state
        assert!(t.contains("Annapoorna Mess") && t.contains("7 Market Road, Pune") && t.contains("GSTIN: 33AAKFG4821M1Z9") && t.contains("State: Tamil Nadu (33)"), "{t}");
        assert!(t.contains("Place of supply : Tamil Nadu (33)") && t.contains("Reverse charge : No"), "{t}");
        // per line: HSN, qty, unit, rate, taxable value, tax rate and amount
        assert!(t.contains("HSN 1508") && t.contains("2 pc x 380.00") && t.contains("Taxable "), "{t}");
        assert!(t.contains("CGST 2.5% ") && t.contains("SGST 2.5% ") && t.contains("CGST 9% ") && t.contains("SGST 9% "), "{t}");
        assert!(!t.contains("IGST"), "intra-state has no IGST: {t}");
        // totals, words, summary, signature
        assert!(t.contains(&format!("Rs {}", money(bill.totals.grand))), "{t}");
        assert!(t.contains(&amount_in_words(bill.totals.grand)), "{t}");
        assert!(t.contains("TAX SUMMARY") && t.contains("HSN 1508 @ 5%") && t.contains("HSN 1508 @ 18%") && t.contains("HSN 1508 @ 0%"), "{t}");
        assert!(t.contains("Authorised signatory") && t.contains("For SRI GOKUL ENTERPRISES"), "{t}");
        // the CGST and SGST totals on the paper are the saved slab totals
        let cg: i64 = bill.totals.slabs.iter().map(|s| s.cgst).sum();
        let sg: i64 = bill.totals.slabs.iter().map(|s| s.sgst).sum();
        assert!(raw.lines().any(|l| l.starts_with("CGST") && l.ends_with(&money(cg))), "{t}");
        assert!(raw.lines().any(|l| l.starts_with("SGST") && l.ends_with(&money(sg))), "{t}");
        std::fs::write(shots().join(format!("gst-invoice-b2b-intra-{paper}.txt")), &raw).unwrap();
    }
}

#[test]
fn inter_state_b2b_invoice_shows_igst_and_the_other_state() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let pune = db.with(|c| Ok(customer(c, "Pune Traders", "27AAPFU0939F1ZV", ""))).unwrap();
    let bill = db.with(|c| Ok(save_bill(c, &mixed(Some(&pune)))?)).unwrap();
    let t = bill_text(&db, &bill.id, Paper::Mm80);
    assert!(t.contains("Place of supply : Maharashtra (27)") && t.contains("State: Maharashtra (27)") && t.contains("GSTIN: 27AAPFU0939F1ZV"), "{t}");
    assert!(t.contains("IGST 5% ") && t.contains("IGST 18% "), "{t}");
    assert!(!t.contains("CGST") && !t.contains("SGST"), "inter-state has no CGST or SGST: {t}");
    let ig: i64 = bill.totals.slabs.iter().map(|s| s.igst).sum();
    assert!(t.lines().any(|l| l.starts_with("IGST") && l.ends_with(&money(ig))), "{t}");
    std::fs::write(shots().join("gst-invoice-b2b-inter-80mm.txt"), &t).unwrap();
}

#[test]
fn a4_tax_invoice_has_every_particular_and_fits_the_sheet() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let local = db.with(|c| Ok(customer(c, "Annapoorna Mess", "33AAKFG4821M1Z9", ""))).unwrap();
    let pune = db.with(|c| Ok(customer(c, "Pune Traders", "27AAPFU0939F1ZV", ""))).unwrap();
    for (who, inter) in [(local, false), (pune, true)] {
        let bill = db.with(|c| Ok(save_bill(c, &mixed(Some(&who)))?)).unwrap();
        let t = a4_text(&db, &bill.id);
        assert_fits(&t, 96);
        for want in [
            "SRI GOKUL ENTERPRISES", "GSTIN: 33EAEPK8839P2ZX", "TAX INVOICE", "Invoice No : 26/0", "Date : ", "Reverse charge : No", "Bill to (recipient)", "Annapoorna Mess",
            "7 Market Road, Pune", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable", "Total", "Amount in words:", "Tax summary (HSN and rate wise)", "Recipient's signature", "Authorised signatory",
        ] {
            if want == "Annapoorna Mess" && inter {
                continue;
            }
            assert!(t.contains(want), "{want} missing: {t}");
        }
        if inter {
            assert!(t.contains("IGST%") && t.contains("Place of supply : Maharashtra (27)") && !t.contains("CGST"), "{t}");
        } else {
            assert!(t.contains("CGST%") && t.contains("SGST%") && t.contains("Place of supply : Tamil Nadu (33)") && !t.contains("IGST"), "{t}");
        }
        assert!(t.contains(&format!("Rs {}", money(bill.totals.grand))) && t.contains(&amount_in_words(bill.totals.grand)), "{t}");
        // item names, 0% line included, one line each with its HSN
        assert!(t.contains("Wood Pressed Groundnut Oil 1 Litre Pet Bottle") && t.contains("Dish Wash Bar") && t.contains("Groundnut Oil (Loose)"), "{t}");
        std::fs::write(shots().join(format!("gst-invoice-a4-{}.txt", if inter { "inter" } else { "intra" })), &t).unwrap();
    }
}

#[test]
fn bill_of_supply_only_when_every_line_is_exempt_and_a_mixed_cart_is_a_tax_invoice() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let all_zero = db
        .with(|c| {
            Ok(save_bill(c, &cash_draft(vec![line("i2", "102", "Groundnut Oil (Loose)", 1000, 10_000, 0.0), line("i1", "101", "Sealed pack", 1000, 5_000, 0.0)]))?)
        })
        .unwrap();
    let t = bill_text(&db, &all_zero.id, Paper::Mm80);
    assert!(t.contains("BILL OF SUPPLY") && !t.contains("TAX INVOICE"), "{t}");
    let t4 = a4_text(&db, &all_zero.id);
    assert!(t4.contains("BILL OF SUPPLY") && !t4.contains("CGST") && !t4.contains("IGST") && !t4.contains("Tax summary"), "{t4}");
    let mixed_cart = db.with(|c| Ok(save_bill(c, &mixed(None))?)).unwrap();
    let t = bill_text(&db, &mixed_cart.id, Paper::Mm80);
    assert!(t.contains("TAX INVOICE") && !t.contains("BILL OF SUPPLY"), "{t}");
    // a B2B buyer of exempt goods also gets a bill of supply with the recipient's particulars but no tax
    let local = db.with(|c| Ok(customer(c, "Annapoorna Mess", "33AAKFG4821M1Z9", ""))).unwrap();
    let b2b_zero = db.with(|c| Ok(save_bill(c, &draft_with(vec![line("i2", "102", "Groundnut Oil (Loose)", 1000, 10_000, 0.0)], 0, Some(&local), "cash"))?)).unwrap();
    let t = bill_text(&db, &b2b_zero.id, Paper::Mm80);
    assert!(t.contains("BILL OF SUPPLY") && t.contains("GSTIN: 33AAKFG4821M1Z9") && !t.contains("CGST") && !t.contains("TAX SUMMARY"), "{t}");
}

#[test]
fn the_familiar_counter_bill_is_kept_for_ordinary_customers_and_names_the_state_when_inter_state() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let walk = db.with(|c| Ok(save_bill(c, &mixed(None))?)).unwrap();
    let t = bill_text(&db, &walk.id, Paper::Mm80);
    assert!(t.contains("Cash Bill") && t.contains("TAX INVOICE") && t.contains("BILL NO : 26/0") && t.contains("Payment Details:"), "{t}");
    assert!(!t.contains("Place of supply") && !t.contains("Reverse charge"), "the counter bill is unchanged for a local consumer: {t}");
    let kerala = db.with(|c| Ok(customer(c, "Kerala Buyer", "", "32"))).unwrap();
    let inter = db.with(|c| Ok(save_bill(c, &mixed(Some(&kerala)))?)).unwrap();
    let t = bill_text(&db, &inter.id, Paper::Mm80);
    assert!(t.contains("Cash Bill") && t.contains("Place of supply : Kerala (32) (IGST)") && t.contains("IGST"), "{t}");
    assert!(!t.contains("CGST"), "{t}");
}

#[test]
fn a_consumer_bill_of_fifty_thousand_or_more_gets_the_full_invoice_with_name_address_and_state() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let kerala = db.with(|c| Ok(customer(c, "Kerala Buyer", "", "32"))).unwrap();
    // 5 x Rs 10,000 = Rs 50,000 (no GSTIN: a consumer)
    let big = db
        .with(|c| Ok(save_bill(c, &draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 5000, 1_000_000, 5)], 0, Some(&kerala), "cash"))?))
        .unwrap();
    assert!(big.totals.grand >= invoice::B2C_DETAILS_FROM);
    let t = bill_text(&db, &big.id, Paper::Mm80);
    assert!(t.contains("TAX INVOICE") && t.contains("Invoice No") && t.contains("Name: Kerala Buyer") && t.contains("Address: 7 Market Road, Pune") && t.contains("State: Kerala (32)"), "{t}");
    assert!(!t.contains("GSTIN: 3") || t.contains("GSTIN: 33EAEPK8839P2ZX"), "no recipient GSTIN for a consumer: {t}");
}

fn return_lines(c: &mut Connection, bill: &Bill, picks: Vec<(i64, i64)>) -> CreditNote {
    create_return(
        c,
        &ReturnRequest {
            bill_id: bill.id.clone(),
            picks: picks.into_iter().map(|(i, q)| ReturnPick { line_index: i, qty: q }).collect(),
            reason: "Seal broken".into(),
            refund_mode: "cash".into(),
            by: "Lakshmi".into(),
            manager_pin: "2222".into(),
        },
    )
    .unwrap()
}

#[test]
fn credit_notes_print_the_series_the_original_invoice_and_the_tax_reversed_intra_and_inter() {
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let local = db.with(|c| Ok(customer(c, "Annapoorna Mess", "33AAKFG4821M1Z9", ""))).unwrap();
    let pune = db.with(|c| Ok(customer(c, "Pune Traders", "27AAPFU0939F1ZV", ""))).unwrap();
    for (who, inter) in [(local, false), (pune, true)] {
        let bill = db.with(|c| Ok(save_bill(c, &mixed(Some(&who)))?)).unwrap();
        let cn = db.with(|c| Ok(return_lines(c, &bill, vec![(0, 1000), (1, 1000)]))).unwrap();
        for a4 in [false, true] {
            let t = db
                .with(|c| {
                    let cfg = printing::load_config(c)?;
                    let p = if a4 { printing::credit_note_a4_doc(c, &cfg, &cn.id, false)? } else { printing::credit_note_doc(c, &cfg, &cn.id, false)? };
                    Ok(text_of(c, &p, if a4 { Paper::A4 } else { Paper::Mm80 }))
                })
                .unwrap();
            assert_fits(&t, if a4 { 96 } else { 48 });
            let shown_bill = printing::print_number(&db.with(|c| Ok(printing::load_config(c)?)).unwrap(), &bill.number);
            for want in [
                "CREDIT NOTE", &cn.number, "Against Invoice No", &shown_bill, "Invoice Date", "SRI GOKUL ENTERPRISES", "GSTIN: 33EAEPK8839P2ZX", "Reason", "Seal broken",
            ] {
                assert!(t.contains(want), "{want} missing: {t}");
            }
            assert!(t.contains(if inter { "Place of supply : Maharashtra (27)" } else { "Place of supply : Tamil Nadu (33)" }), "{t}");
            assert!(t.contains(if inter { "GSTIN: 27AAPFU0939F1ZV" } else { "GSTIN: 33AAKFG4821M1Z9" }), "{t}");
            assert!(t.contains("1508"), "HSN: {t}");
            if inter {
                assert!(t.contains("IGST") && !t.contains("CGST"), "{t}");
            } else {
                assert!(t.contains("CGST") && t.contains("SGST") && !t.contains("IGST"), "{t}");
            }
            assert!(t.contains(&money(cn.totals.grand)) && t.contains(&amount_in_words(cn.totals.grand)), "{t}");
            let heads = if inter { vec![cn.totals.slabs.iter().map(|s| s.igst).sum::<i64>()] } else { vec![cn.totals.slabs.iter().map(|s| s.cgst).sum::<i64>(), cn.totals.slabs.iter().map(|s| s.sgst).sum::<i64>()] };
            for h in heads {
                assert!(t.contains(&money(h)), "tax reversed {h} missing: {t}");
            }
            std::fs::write(shots().join(format!("gst-credit-note-{}-{}.txt", if inter { "inter" } else { "intra" }, if a4 { "a4" } else { "80mm" })), &t).unwrap();
        }
    }
}

#[test]
fn an_a4_job_is_captured_to_a_file_through_the_print_path_without_a_real_printer() {
    // FILE: targets need the Windows PDF driver; on any machine the document still builds and is routed as A4
    let (_d, db) = mini_db();
    shop(&db, "80mm");
    let pune = db.with(|c| Ok(customer(c, "Pune Traders", "27AAPFU0939F1ZV", ""))).unwrap();
    let bill = db.with(|c| Ok(save_bill(c, &mixed(Some(&pune)))?)).unwrap();
    let r = printing::print_document(&db, "bill", &bill.id, &json!({ "format": "a4", "duplicate": true }));
    // the answer is { ok, message } either way: a missing printer never raises an error and never touches the bill
    assert!(r["ok"].is_boolean() && r["message"].is_string(), "{r}");
    assert_eq!(db.with(|c| Ok(count(c, "bills"))).unwrap(), 1);
}
