//! GST return facts for a month: what GSTR-1 and GSTR-3B are built from. Every figure must tie to the saved bills, credit notes and
//! purchases to the paisa, including returns and IGST. (The sections themselves are built by packages/data/src/gstr.ts and checked by
//! `node packages/data/scripts/gstr-checks.mjs`.)
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::billops::create_return;
use gokul_core::gstr::{gstr_facts, month_range};
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
        "business": if b2b { name } else { "" }, "gstin": gstin, "stateCode": state, "address": "7 Market Road", "creditLimit": 0 }))).unwrap();
    row["id"].as_str().unwrap().to_string()
}

fn mixed(cust: Option<&str>, price_5: i64) -> BillDraft {
    let mut d = draft_with(
        vec![line("i1", "101", "Groundnut Oil 1 L", 1000, price_5, 5), line("i3", "103", "Dish Wash Bar", 2000, 11_801, 18), line("i2", "102", "Groundnut Oil (Loose)", 500, 10_000, 0)],
        333,
        cust,
        "cash",
    );
    d.customer_name = None;
    d
}

fn ret(c: &mut Connection, b: &Bill, picks: Vec<(i64, i64)>) -> CreditNote {
    create_return(
        c,
        &ReturnRequest {
            bill_id: b.id.clone(),
            picks: picks.into_iter().map(|(i, q)| ReturnPick { line_index: i, qty: q }).collect(),
            reason: "Seal broken".into(),
            refund_mode: "cash".into(),
            by: "Lakshmi".into(),
            manager_pin: "2222".into(),
        },
    )
    .unwrap()
}

fn sum(v: &[Value], k: &str) -> i64 {
    v.iter().map(|x| x[k].as_i64().unwrap_or(0)).sum()
}

fn slab_sum(bills: &[Value], k: &str) -> i64 {
    bills.iter().flat_map(|b| b["slabs"].as_array().unwrap().iter()).map(|s| s[k].as_i64().unwrap_or(0)).sum()
}

#[test]
fn month_ranges() {
    assert_eq!(month_range("2026-11").unwrap(), ("2026-11-01".into(), "2026-11-30".into(), "112026".into()));
    assert_eq!(month_range("2026-02").unwrap().1, "2026-02-28");
    assert_eq!(month_range("2028-02").unwrap().1, "2028-02-29");
    assert_eq!(month_range("2026-12").unwrap().1, "2026-12-31");
    assert!(month_range("2026-13").is_err() && month_range("nope").is_err());
}

#[test]
fn facts_tie_to_the_bills_credit_notes_and_purchases_including_igst_and_returns() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let kerala = customer(c, "Kerala Buyer", "", "32");
        let pune = customer(c, "Pune Traders", "27AAPFU0939F1ZV", "");
        let local = customer(c, "Annapoorna Mess", "33AAKFG4821M1Z9", "");
        let a = save_bill(c, &mixed(None, 38_000))?; // intra B2C
        let b = save_bill(c, &mixed(Some(&kerala), 38_000))?; // inter B2C, small
        let big = save_bill(c, &mixed(Some(&kerala), 12_500_000))?; // inter B2C above Rs 1 lakh
        let p = save_bill(c, &mixed(Some(&pune), 38_000))?; // inter B2B
        let l = save_bill(c, &mixed(Some(&local), 38_000))?; // intra B2B
        let cancelled = save_bill(c, &mixed(None, 38_000))?;
        gokul_core::billops::cancel_bill(c, &CancelRequest { bill_id: cancelled.id.clone(), reason: "Wrong".into(), manager_pin: "2222".into(), by: "Lakshmi".into() })?;
        // returns of each kind
        let n1 = ret(c, &a, vec![(0, 1000)]);
        let n2 = ret(c, &big, vec![(0, 1000), (1, 500)]);
        let n3 = ret(c, &p, vec![(1, 1000)]);
        let n4 = ret(c, &l, vec![(0, 1000), (1, 2000)]);

        let month = gokul_core::db::day_of(chrono::Local::now())[..7].to_string();
        let f = gstr_facts(c, &month)?;
        // For checking the TypeScript builder on real facts: GOKUL_GSTR_FACTS_OUT=<file> cargo test ... then `node scripts/gstr-checks.mjs <file>`
        if let Ok(path) = std::env::var("GOKUL_GSTR_FACTS_OUT") {
            std::fs::write(path, serde_json::to_string(&f).unwrap()).unwrap();
        }
        let bills = f["bills"].as_array().unwrap();
        let notes = f["notes"].as_array().unwrap();
        assert_eq!((bills.len(), notes.len()), (6, 4));

        // bills: every slab figure is what the bill saved
        let live: Vec<Value> = bills.iter().filter(|x| x["status"] != "cancelled").cloned().collect();
        assert_eq!(live.len(), 5, "a cancelled bill has no supplies");
        assert!(bills.iter().find(|x| x["status"] == "cancelled").unwrap()["slabs"].as_array().unwrap().is_empty());
        let db_taxable: i64 = c.query_row("SELECT SUM(taxable) FROM bills WHERE status != 'cancelled'", [], |r| r.get(0))?;
        let db_gst: i64 = c.query_row("SELECT SUM(gst) FROM bills WHERE status != 'cancelled'", [], |r| r.get(0))?;
        assert_eq!(slab_sum(&live, "taxable"), db_taxable);
        assert_eq!(slab_sum(&live, "cgst") + slab_sum(&live, "sgst") + slab_sum(&live, "igst"), db_gst);
        assert!(slab_sum(&live, "igst") > 0 && slab_sum(&live, "cgst") > 0);
        let grand: i64 = c.query_row("SELECT SUM(grand) FROM bills WHERE status != 'cancelled'", [], |r| r.get(0))?;
        assert_eq!(sum(&live, "grand"), grand);
        // who is registered, where, and the printed number
        let pune_row = bills.iter().find(|x| x["gstin"] == "27AAPFU0939F1ZV").unwrap();
        assert_eq!((pune_row["place"].as_str(), pune_row["inter"].as_bool()), (Some("27"), Some(true)));
        assert_eq!(pune_row["shown"].as_str().unwrap(), format!("26/{:05}", pune_row["seq"].as_i64().unwrap()));
        assert!(bills.iter().find(|x| x["name"] == "Annapoorna Mess").unwrap()["inter"] == false);
        let big_row = bills.iter().find(|x| x["grand"].as_i64().unwrap() > 10_000_000).unwrap();
        assert_eq!((big_row["gstin"].as_str(), big_row["place"].as_str()), (Some(""), Some("32")));

        // credit notes: the slabs are what each note reversed, and each names its invoice
        let cn_gst: i64 = [&n1, &n2, &n3, &n4].iter().map(|n| n.totals.gst).sum();
        assert_eq!(slab_sum(notes, "cgst") + slab_sum(notes, "sgst") + slab_sum(notes, "igst"), cn_gst);
        let big_note = notes.iter().find(|x| x["number"] == n2.number.as_str()).unwrap();
        assert_eq!((big_note["billShown"].as_str().unwrap(), big_note["billInter"].as_bool()), (format!("26/{:05}", big.number.rsplit('-').next().unwrap().parse::<i64>().unwrap()).as_str(), Some(true)));
        assert!(big_note["billGrand"].as_i64().unwrap() > 10_000_000);
        let pune_note = notes.iter().find(|x| x["number"] == n3.number.as_str()).unwrap();
        assert_eq!(pune_note["gstin"], "27AAPFU0939F1ZV");

        // HSN rows: sales and returns add up to the same totals
        let hs = f["hsn"]["sales"].as_array().unwrap();
        let hr = f["hsn"]["returns"].as_array().unwrap();
        assert_eq!(sum(hs, "taxable"), db_taxable);
        assert_eq!(sum(hs, "cgst") + sum(hs, "sgst") + sum(hs, "igst"), db_gst);
        assert_eq!(sum(hr, "taxable"), notes.iter().flat_map(|n| n["slabs"].as_array().unwrap().iter()).map(|s| s["taxable"].as_i64().unwrap()).sum::<i64>());
        assert_eq!(sum(hr, "igst") + sum(hr, "cgst") + sum(hr, "sgst"), cn_gst);
        let b2b_taxable: i64 = hs.iter().filter(|x| x["b2b"] == true).map(|x| x["taxable"].as_i64().unwrap()).sum();
        let b2b_bills: Vec<Value> = live.iter().filter(|x| x["gstin"] != "").cloned().collect();
        assert_eq!(b2b_taxable, slab_sum(&b2b_bills, "taxable"), "the B2B HSN rows are the registered buyers' bills");
        assert!(hs.iter().all(|x| x["hsn"] == "1508"));
        assert!(hs.iter().all(|x| !x["uqc"].as_str().unwrap().is_empty()));

        // the on-screen GSTR-1 and HSN reports agree with the facts
        let params: reports::ReportParams = de(json!({ "from": f["period"]["from"], "to": f["period"]["to"] }));
        let g1 = reports::run_report(c, "gstr1", &params)?;
        assert_eq!(g1["totals"]["taxable"].as_i64().unwrap(), slab_sum(&live, "taxable"));
        assert_eq!(g1["totals"]["igst"].as_i64().unwrap(), slab_sum(&live, "igst"));
        let hr_report = reports::run_report(c, "hsn-wise", &params)?;
        // the HSN report is net of credit notes
        let net_taxable = db_taxable - sum(hr, "taxable");
        assert_eq!(hr_report["totals"]["taxable"].as_i64().unwrap(), net_taxable);
        assert_eq!(hr_report["totals"]["igst"].as_i64().unwrap(), sum(hs, "igst") - sum(hr, "igst"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn purchases_facts_carry_input_credit_and_nil_rated_inward_supplies() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES('s1','Local Seeds','1','X','33AAKFG4821M1Z9','','',0,'2026-01-01')", [])?;
        c.execute("INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES('s2','Far Seeds','1','X','27AAPFU0939F1ZV','','',0,'2026-01-01')", [])?;
        let grn = |c: &mut Connection, sid: &str, rate: f64| {
            gokul_core::purchasing::create_grn(c, &de(json!({ "supplierId": sid, "invoiceNo": "INV1", "lines": [{ "itemId": "i1", "qty": 10000, "rate": 30_000, "gstRate": rate }, { "itemId": "i2", "qty": 5000, "rate": 20_000, "gstRate": 0 }], "paidNow": 0, "payMode": "cash" }))).unwrap();
        };
        grn(c, "s1", 5.0);
        grn(c, "s2", 18.0);
        let month = gokul_core::db::day_of(chrono::Local::now())[..7].to_string();
        let f = gstr_facts(c, &month)?;
        let p = &f["purchases"];
        let (t, cg, sg, ig): (i64, i64, i64, i64) = c.query_row("SELECT SUM(taxable),SUM(cgst),SUM(sgst),SUM(igst) FROM purchases", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        assert_eq!((p["taxable"].as_i64(), p["cgst"].as_i64(), p["sgst"].as_i64(), p["igst"].as_i64()), (Some(t), Some(cg), Some(sg), Some(ig)));
        assert!(ig > 0 && cg > 0, "one local purchase (CGST + SGST) and one from another state (IGST)");
        // the 0% lines: Rs 1,000 of i2 in each purchase, one local and one inter-state
        assert_eq!((p["nilIntra"].as_i64(), p["nilInter"].as_i64()), (Some(100_000), Some(100_000)));
        Ok(())
    })
    .unwrap();
}
