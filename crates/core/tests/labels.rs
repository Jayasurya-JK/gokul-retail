//! Barcode stickers end to end: items from the database become a TSPL job (captured with a FILE: target), the preview
//! shows the same elements, and the hardware defaults and compatibility mode behave.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::db::set_setting;
use gokul_core::{labels, printing};
use serde_json::{json, Value};

fn set_label_printer(db: &gokul_core::Db, target: &str) {
    db.with(|c| {
        set_setting(c, "shopName", "Gokul Oils")?;
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["printers"]["labelPrinter"] = json!(target);
        b["printers"].as_object_mut().unwrap().remove("detected");
        set_setting(c, "bundle.printers", &b["printers"].to_string())?;
        Ok(())
    })
    .unwrap();
}

fn entries() -> Value {
    json!([{ "itemId": "i1", "copies": 3 }, { "itemId": "i2", "copies": 1 }])
}

#[test]
fn a_real_job_for_the_picked_items_with_copies() {
    let (d, db) = mini_db();
    let out = d.path().join("labels.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let opts = json!({ "preset": "50x25", "packDate": "2026-11-07", "bestBeforeMonths": 6, "fields": { "batch": true, "net": true } });
    let r = labels::print_labels(&db, &entries(), &opts);
    assert_eq!(r["ok"], true, "{r}");
    assert!(r["message"].as_str().unwrap().contains("4 labels"), "{r}");
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    assert!(job.starts_with("SIZE 50 mm,25 mm\r\nGAP 3 mm,0 mm\r\n"), "{job}");
    // three identical stickers of the first item are one PRINT 1,3; the loose item is its own row
    assert!(job.contains("PRINT 1,3\r\n") && job.contains("PRINT 1,1\r\n"), "{job}");
    assert_eq!(job.matches("CLS\r\n").count(), 2);
    assert!(job.contains("\"Groundnut Oil 1 L\"") && job.contains("\"Groundnut Oil\""), "{job}");
    assert!(job.contains("\"8904000000011\"") && job.contains("\"8904000000028\""));
    assert!(job.contains("Pkd 07/11/26 BB 07/05/27"), "{job}");
    assert!(job.contains("Batch GK2611O"), "{job}");
    // loose oil is priced per litre
    assert!(job.contains("/L"), "{job}");
    // money is exact: Rs 360
    assert!(job.contains("Rs 360"), "{job}");
}

#[test]
fn the_preview_shows_the_same_text_as_the_printer_gets() {
    let (d, db) = mini_db();
    let out = d.path().join("labels2.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let opts = json!({ "preset": "38x25-2up", "packDate": "2026-11-07", "fields": { "shop": true, "batch": true, "net": true } });
    let pv = labels::label_preview(&db, &["i1".to_string()], &opts);
    assert_eq!(pv["ok"], true, "{pv}");
    assert_eq!(pv["spec"]["columns"], 2);
    assert_eq!(pv["spec"]["cellW"], 304);
    let els = pv["labels"][0]["elements"].as_array().unwrap();
    assert!(els.iter().any(|e| e["k"] == "barcode" && !e["rects"].as_array().unwrap().is_empty()));
    let r = labels::print_labels(&db, &json!([{ "itemId": "i1", "copies": 1 }]), &opts);
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    for e in els {
        if e["k"] == "text" {
            let line = format!("TEXT {},{},\"{}\",0,{},{},\"{}\"\r\n", e["x"], e["y"], e["font"], e["xm"], e["ym"], e["text"].as_str().unwrap());
            assert!(job.contains(&line), "preview element missing from the TSPL job: {line}");
        }
    }
}

#[test]
fn custom_size_calibration_and_bad_sizes() {
    let (d, db) = mini_db();
    let out = d.path().join("labels3.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let one = json!([{ "itemId": "i3", "copies": 1 }]);
    let opts = json!({ "preset": "custom", "width": 60, "height": 30, "gap": 2.5, "columns": 1, "darkness": 10, "speed": 3, "offsetX": 8, "offsetY": 4, "flip": true });
    assert_eq!(labels::print_labels(&db, &one, &opts)["ok"], true);
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    assert!(job.contains("SIZE 60 mm,30 mm\r\nGAP 2.5 mm,0 mm\r\nDIRECTION 0,0\r\n") && job.contains("DENSITY 10\r\nSPEED 3\r\n"), "{job}");
    assert!(job.contains("TEXT 20,12,"), "offset (8,4) moves the 12,8 start: {job}");
    // three 38 mm labels do not fit the roll
    let bad = json!({ "preset": "custom", "width": 38, "columns": 3, "colGap": 2 });
    let r = labels::print_labels(&db, &one, &bad);
    assert_eq!(r["ok"], false);
    assert!(r["message"].as_str().unwrap().contains("at most 108"), "{r}");
    // nothing picked / no printer / printer not installed
    assert_eq!(labels::print_labels(&db, &json!([]), &opts)["ok"], false);
    set_label_printer(&db, "No Such Label Printer");
    let r = labels::print_labels(&db, &one, &opts);
    assert_eq!(r["ok"], false);
    assert!(r["message"].as_str().unwrap().contains("not installed"), "{r}");
}

#[test]
fn test_label_is_a_real_job() {
    let (d, db) = mini_db();
    let out = d.path().join("test.tspl");
    let target = format!("FILE:{}", out.display());
    let r = printing::test_print(&db, "label", &target, &json!({ "preset": "50x25", "offsetX": 3 }));
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    assert!(job.contains("GOKUL LABEL TEST") && job.contains("BOX 3,0,") && job.contains("\"GOKUL123\""), "{job}");
}

#[test]
fn shop_printers_are_recognised_by_name() {
    let names: Vec<String> = ["Microsoft Print to PDF", "TVS RP3200 Plus", "TSC TE244", "OneNote"].iter().map(|s| s.to_string()).collect();
    assert_eq!(printing::pick_printer(&names, &["rp3200", "tvs"]).as_deref(), Some("TVS RP3200 Plus"));
    assert_eq!(printing::pick_printer(&names, &["te244", "tsc"]).as_deref(), Some("TSC TE244"));
    assert_eq!(printing::pick_printer(&names[..1], &["te244", "tsc"]), None);
    let other: Vec<String> = vec!["TVS-E RP 3200".into()];
    assert_eq!(printing::pick_printer(&other, &["rp3200", "tvs"]).as_deref(), Some("TVS-E RP 3200"));
    // and the spooler classifies them the way Settings groups them
    assert_eq!(gokul_print::spool::classify("TVS RP3200 Plus", "TVS RP3200 Plus").as_str(), "thermal");
    assert_eq!(gokul_print::spool::classify("TSC TE244", "TSC TE244").as_str(), "label");
}

#[test]
fn hardware_defaults_new_printer_keys_and_clamping() {
    let (_d, db) = mini_db();
    let b = db.with(|c| Ok(gokul_core::crm::get_settings_bundle(c)?)).unwrap();
    assert_eq!(b["hardware"], json!({ "scanGapMs": 30, "scanMinLen": 3, "scanBeep": true }));
    let p = &b["printers"];
    assert_eq!(p["compat"], false);
    assert_eq!(p["labelPreset"], "gokul-small");
    assert_eq!(p["labelDarkness"], 8);
    assert_eq!(p["labelSpeed"], 4);
    assert_eq!(p["mode"], "escpos");
    assert_eq!(p["cutter"], true);
    assert_eq!(p["openDrawerOnCash"], true);
    // the POS reads the scanner settings through its own open call
    let h = gokul_core::dispatch(&db, "getHardware", vec![]).unwrap();
    assert_eq!(h["scanGapMs"], 30);
    // saving clamps silly values
    let mut next = b.clone();
    next["hardware"] = json!({ "scanGapMs": 5, "scanMinLen": 99, "scanBeep": false });
    let saved = db.with(|c| Ok(gokul_core::crm::save_settings_bundle(c, &next)?)).unwrap();
    assert_eq!(saved["hardware"], json!({ "scanGapMs": 10, "scanMinLen": 12, "scanBeep": false }));
}

#[test]
fn compatibility_mode_drops_the_logo_picture_and_qr() {
    let (d, db) = mini_db();
    let out = d.path().join("compat.bin");
    db.with(|c| {
        set_setting(c, "printer", &format!("FILE:{}", out.display()))?;
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["printers"]["billPrinter"] = json!(format!("FILE:{}", out.display()));
        b["billFormat"]["showQr"] = json!(true);
        b["printers"].as_object_mut().unwrap().remove("detected");
        set_setting(c, "bundle.printers", &b["printers"].to_string())?;
        set_setting(c, "bundle.billFormat", &b["billFormat"].to_string())?;
        Ok(())
    })
    .unwrap();
    let bill = db.with(|c| Ok(save_bill(c, &cash_draft(vec![line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)]))?)).unwrap();
    // the logo needs a shop logo set; QR is on: with compatibility off both appear, with it on neither
    let r = printing::print_document(&db, "bill", &bill.id, &json!({}));
    assert_eq!(r["ok"], true, "{r}");
    let normal = std::fs::read(&out).unwrap();
    assert!(normal.windows(4).any(|w| w == [0x1D, 0x28, 0x6B, 0x04]), "QR commands present");
    db.with(|c| {
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["printers"]["compat"] = json!(true);
        b["printers"].as_object_mut().unwrap().remove("detected");
        set_setting(c, "bundle.printers", &b["printers"].to_string())?;
        Ok(())
    })
    .unwrap();
    let r = printing::print_document(&db, "bill", &bill.id, &json!({}));
    assert_eq!(r["ok"], true, "{r}");
    let safe = std::fs::read(&out).unwrap();
    assert!(!safe.windows(3).any(|w| w == [0x1D, 0x28, 0x6B]), "no QR in compatibility mode");
    assert!(!safe.windows(3).any(|w| w == [0x1D, 0x76, 0x30]), "no raster logo in compatibility mode");
    // plain text, the barcode and the cut still work
    assert!(safe.windows(3).any(|w| w == [0x1D, 0x56, 0x01]));
    assert!(safe.windows(2).any(|w| w == [0x1D, 0x6B]));
    assert_eq!(&safe[..2], &[0x1B, 0x40]);
}

/// The shop's small sticker as a sample job: `docs/design/shots/print-gokul-label.tspl`.
#[test]
fn gokul_small_sticker_sample_job() {
    let (d, db) = mini_db();
    let out = d.path().join("gokul.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    db.with(|c| {
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["shop"]["shortName"] = json!("GOKUL");
        set_setting(c, "bundle.shop", &b["shop"].to_string())?;
        Ok(())
    })
    .unwrap();
    let opts = json!({ "preset": "gokul-small", "fields": { "shop": true, "name": true, "mrp": false, "price": true, "barcode": false, "dates": true, "qr": true } });
    let r = labels::print_labels(&db, &json!([{ "itemId": "i3", "copies": 2 }]), &opts);
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    assert!(job.contains("SIZE 38 mm,25 mm") && job.contains("\"GOKUL\"") && job.contains("\"DISH WASH BAR\""), "{job}");
    assert!(job.contains("QRCODE 12,") && job.contains("\"103\""), "QR carries the exact item code: {job}");
    assert!(job.contains("\"Rs.38.00\"") && job.contains("\"Pkd:\"") && job.contains("\"Exp:\"") && job.contains("PRINT 1,2"), "{job}");
    let shots = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/design/shots");
    std::fs::write(shots.join("print-gokul-label.tspl"), job).unwrap();
}
