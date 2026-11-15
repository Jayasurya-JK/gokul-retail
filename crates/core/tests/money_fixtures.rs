//! Proves the Rust money engine gives identical results to packages/data/src/money.ts on a shared fixture file.
//! The same file is checked against the TypeScript code by `node packages/data/scripts/money-fixtures.mjs`.

use gokul_core::money::{compute_bill, compute_totals, quote_return, recalc_line};
use gokul_core::types::*;
use serde_json::{json, Value};

fn mk(l: &Value, i: usize) -> BillLine {
    BillLine {
        item_id: format!("i{i}"),
        code: i.to_string(),
        name: format!("Item {i}"),
        unit: "pc".into(),
        qty: l["qty"].as_i64().unwrap(),
        rate: l["rate"].as_i64().unwrap(),
        discount: l["discount"].as_i64().unwrap(),
        gst_rate: l["gstRate"].as_f64().unwrap(),
        cess_rate: l["cessRate"].as_f64().unwrap_or(0.0),
        amount: 0,
    }
}

#[test]
fn rust_matches_typescript_on_all_fixture_cases() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/money_cases.json")).unwrap();
    let doc: Value = serde_json::from_str(&text).unwrap();
    let cases = doc["cases"].as_array().unwrap();
    assert!(cases.len() >= 600, "fixture file looks truncated");
    let mut returns = 0;
    for c in cases {
        let name = c["name"].as_str().unwrap();
        let round = c["round"].as_bool().unwrap();
        let bd = c["billDiscount"].as_i64().unwrap();
        let lines: Vec<BillLine> = c["lines"].as_array().unwrap().iter().enumerate().map(|(i, l)| recalc_line(&mk(l, i))).collect();
        let inter = c["inter"].as_bool().unwrap_or(false);
        let totals = compute_bill(&lines, bd, round, inter, None).0;

        let got_lines: Vec<Value> = lines.iter().map(|l| json!({ "discount": l.discount, "amount": l.amount })).collect();
        assert_eq!(Value::Array(got_lines), c["expect"]["lines"], "line amounts differ: {name}");
        assert_eq!(serde_json::to_value(&totals).unwrap(), c["expect"]["totals"], "totals differ: {name}");

        if c["kind"] == "return" {
            returns += 1;
            let picks: Vec<ReturnPick> = c["picks"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| ReturnPick { line_index: p["lineIndex"].as_i64().unwrap(), qty: p["qty"].as_i64().unwrap() })
                .collect();
            let (rl, rt, _) = quote_return(&lines, totals.discount, &picks, round, inter);
            let got: Vec<Value> = rl.iter().map(|l| json!({ "qty": l.qty, "amount": l.amount, "discount": l.discount })).collect();
            assert_eq!(Value::Array(got), c["expect"]["ret"]["lines"], "return lines differ: {name}");
            assert_eq!(serde_json::to_value(&rt).unwrap(), c["expect"]["ret"]["totals"], "return totals differ: {name}");
        }
    }
    assert!(returns >= 100, "expected plenty of return cases, got {returns}");
    println!("{} fixture cases ({returns} with returns) identical to money.ts", cases.len());
}

#[test]
fn gst_is_inclusive_and_splits_evenly() {
    // Rs 105 at 5% inclusive: taxable 100, GST 5 (2.50 + 2.50)
    let l = recalc_line(&BillLine {
        item_id: "i".into(), code: "1".into(), name: "x".into(), unit: "pc".into(), qty: 1000, rate: 10_500, discount: 0, gst_rate: 5.0, cess_rate: 0.0, amount: 0,
    });
    let t = compute_totals(&[l], 0, true);
    assert_eq!((t.taxable, t.gst, t.grand), (10_000, 500, 10_500));
    assert_eq!((t.slabs[0].cgst, t.slabs[0].sgst), (250, 250));
}
