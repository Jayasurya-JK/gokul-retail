//! The HSN helper: the keyword dictionary suggests codes with a confidence, nothing is applied until confirmed, and a collected
//! Excel/CSV file is previewed row by row before anything is written.
mod common;
use common::*;
use gokul_core::hsn::{apply_hsn, preview_hsn_import, suggest, suggest_hsn, HsnUpdate, ImportRow, SuggestOptions};
use serde_json::{json, Value};

#[test]
fn suggestions_match_the_shared_cases_the_typescript_mock_also_passes() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/data/src/hsn/match_cases.json")).unwrap();
    let doc: Value = serde_json::from_str(&text).unwrap();
    let cases = doc["cases"].as_array().unwrap();
    assert!(cases.len() >= 70);
    for c in cases {
        let name = c["name"].as_str().unwrap();
        let got = suggest(name);
        match c["hsn"].as_str() {
            None => assert!(got.is_none(), "{name}: expected no suggestion, got {got:?}"),
            Some(h) => {
                let g = got.unwrap_or_else(|| panic!("{name}: no suggestion"));
                assert_eq!((g.hsn.as_str(), g.confidence.as_str(), g.matched.as_str()), (h, c["confidence"].as_str().unwrap(), c["matched"].as_str().unwrap()), "{name}");
                let alt: Vec<String> = g.alternatives.iter().map(|a| a.hsn.clone()).collect();
                let want: Vec<String> = c["alt"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
                assert_eq!(alt, want, "{name}: alternatives");
            }
        }
    }
}

#[test]
fn the_shops_core_goods_get_the_headings_the_owner_listed() {
    for (name, hsn) in [
        ("Groundnut Oil 1 L", "1508"), ("Gingelly Oil 1 L", "1515"), ("Sesame Oil", "1515"), ("Coconut Oil 500 ml", "1513"), ("Mustard Oil", "1514"), ("Castor Oil", "1515"),
        ("Groundnut Punnaku", "2305"), ("Coconut Punnaku", "2306"), ("Groundnut Kernel", "1202"), ("Sesame Seeds", "1207"), ("Copra", "1203"),
        ("Karupatti", "1701"), ("Vellam", "1701"), ("Sugar", "1701"), ("Ghee", "0405"), ("Honey", "0409"), ("Pepper", "0904"), ("Coriander Seed", "0909"), ("Turmeric", "0910"),
        ("Toor Dal", "0713"), ("Raw Rice", "1006"), ("Wheat Atta", "1101"), ("Rice Flour", "1102"), ("Rava", "1103"), ("Besan", "1106"), ("Salt", "2501"), ("Tea", "0902"), ("Coffee", "0901"),
        ("Peanut Chikki", "1704"), ("Chocolate", "1806"), ("Biscuits", "1905"), ("Mango Pickle", "2001"), ("Agarbatti", "3307"), ("Matches", "3605"), ("Plastic Bottle", "3923"), ("Empty Bottle", "7010"),
    ] {
        assert_eq!(suggest(name).unwrap_or_else(|| panic!("{name}")).hsn, hsn, "{name}");
    }
    // a bottle is only the pack: the oil inside decides the code
    assert_eq!(suggest("Groundnut Oil 1 Litre Pet Bottle").unwrap().hsn, "1508");
    // an oil that is also a cake or a seed is not mistaken for the oil
    assert_eq!(suggest("Sesame Seeds").unwrap().hsn, "1207");
    assert_eq!(suggest("Coconut Oil Cake").unwrap().hsn, "2306");
    // nothing clear: no guess
    assert!(suggest("Gift Hamper").is_none());
}

fn item_hsn(c: &rusqlite::Connection, id: &str) -> (String, f64) {
    c.query_row("SELECT hsn,gst_rate FROM items WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
}

#[test]
fn suggest_lists_only_missing_hsn_and_writes_nothing() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("UPDATE items SET hsn='' WHERE id='i1'", [])?;
        c.execute("UPDATE items SET hsn='NONE' WHERE id='i2'", [])?;
        let before: Vec<(String, f64)> = ["i1", "i2", "i3"].iter().map(|i| item_hsn(c, i)).collect();
        let v = suggest_hsn(c, &SuggestOptions { only_missing: true, include_inactive: false })?;
        let rows = v["rows"].as_array().unwrap();
        let ids: Vec<&str> = rows.iter().map(|r| r["itemId"].as_str().unwrap()).collect();
        assert_eq!(ids, vec!["i2", "i1"].into_iter().filter(|i| ids.contains(i)).collect::<Vec<_>>());
        assert!(ids.contains(&"i1") && ids.contains(&"i2") && !ids.contains(&"i3"), "i3 has a valid HSN (1508)");
        let i1 = rows.iter().find(|r| r["itemId"] == "i1").unwrap();
        assert_eq!(i1["suggestion"]["hsn"], "1508");
        assert_eq!(i1["suggestion"]["confidence"], "high");
        assert_eq!(i1["missing"], true);
        assert_eq!(v["stats"]["missingTotal"], 2);
        let after: Vec<(String, f64)> = ["i1", "i2", "i3"].iter().map(|i| item_hsn(c, i)).collect();
        assert_eq!(before, after, "suggesting changes nothing");
        // all items, not only the missing ones
        let all = suggest_hsn(c, &SuggestOptions { only_missing: false, include_inactive: false })?;
        assert_eq!(all["rows"].as_array().unwrap().len(), 3);
        Ok(())
    })
    .unwrap();
}

#[test]
fn apply_writes_only_confirmed_rows_in_one_step_and_validates_everything_first() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("UPDATE items SET hsn='' WHERE id IN ('i1','i2')", [])?;
        let up = |id: &str, hsn: &str, rate: Option<f64>| HsnUpdate { item_id: id.into(), hsn: hsn.into(), gst_rate: rate };
        // one bad row: nothing at all is written
        let e = apply_hsn(c, &[up("i1", "1508", None), up("i2", "15", None)]).unwrap_err().to_string();
        assert!(e.contains("not valid") && e.contains("Nothing was changed"), "{e}");
        assert_eq!(item_hsn(c, "i1").0, "");
        let e = apply_hsn(c, &[up("i1", "1508", Some(7.0))]).unwrap_err().to_string();
        assert!(e.contains("not in the GST rate list"), "{e}");
        assert!(apply_hsn(c, &[]).is_err());
        // good rows: HSN only, or HSN and the rate the owner also ticked
        let r = apply_hsn(c, &[up("i1", "1508", None), up("i2", "150810", Some(0.0))])?;
        assert_eq!((r["applied"].as_i64(), r["ratesChanged"].as_i64()), (Some(2), Some(1)));
        assert_eq!(item_hsn(c, "i1"), ("1508".to_string(), 5.0), "rate untouched when not ticked");
        assert_eq!(item_hsn(c, "i2"), ("150810".to_string(), 0.0));
        let audited: i64 = c.query_row("SELECT COUNT(*) FROM audit_log WHERE action='hsn'", [], |r| r.get(0))?;
        assert_eq!(audited, 2);
        Ok(())
    })
    .unwrap();
}

#[test]
fn import_preview_matches_by_code_barcode_or_name_and_flags_problems() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("UPDATE items SET hsn='' WHERE id='i1'", [])?;
        let row = |k: &str, h: &str, r: Option<f64>| ImportRow { key: k.into(), hsn: h.into(), gst_rate: r };
        let v = preview_hsn_import(
            c,
            &[
                row("101", "1508", Some(5.0)),                      // by code: will change
                row("8904000000028", "15081000", None),             // by barcode (i2 has 1508 now): will change to 8 digits
                row("dish wash bar", "1508", None),                 // by name, i3 already has 1508: same
                row("Nothing Like This", "1508", None),             // unmatched
                row("101", "15", None),                             // invalid HSN
                row("101", "1508", Some(9.0)),                      // rate not in the list
                row("", "1508", None),                              // no key
            ],
        )?;
        let st: Vec<&str> = v["rows"].as_array().unwrap().iter().map(|r| r["status"].as_str().unwrap()).collect();
        assert_eq!(st, vec!["ok", "ok", "same", "unmatched", "invalid", "invalid", "invalid"]);
        assert_eq!(v["rows"][0]["itemId"], "i1");
        assert_eq!(v["rows"][1]["itemId"], "i2");
        assert_eq!(v["stats"], json!({ "ok": 2, "same": 1, "problems": 4, "total": 7 }));
        // previewing wrote nothing
        assert_eq!(item_hsn(c, "i1").0, "");
        Ok(())
    })
    .unwrap();
}
