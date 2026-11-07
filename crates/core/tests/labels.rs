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
    assert!(r["message"].as_str().unwrap().contains("at most 104"), "{r}");
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
    assert_eq!(p["labelPreset"], "32x25-3up");
    assert_eq!(p["labelColumns"], 3);
    assert_eq!((p["labelWidth"].clone(), p["labelStartMm"].clone()), (json!(33), json!(0)));
    assert_eq!(p["labelRibbon"], true);
    assert_eq!(p["labelRupee"], "both");
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

/// The Gokul 3-up ribbon sticker as a job: three copies of one item fill one row, the code is the one the POS finds, and the
/// ribbon and rupee settings reach the printer (a setting passed in the call wins over the saved one).
#[test]
fn gokul_3up_ribbon_job_for_the_picked_item() {
    let (d, db) = mini_db();
    let out = d.path().join("ribbon.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let opts = json!({ "preset": "32x25-3up", "fields": { "shop": true, "name": true, "price": true, "barcode": true, "dates": true, "qr": true } });
    let r = labels::print_labels(&db, &json!([{ "itemId": "i3", "copies": 3 }]), &opts);
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8_lossy(&std::fs::read(&out).unwrap()).into_owned();
    assert!(job.starts_with("SIZE 103 mm,25 mm\r\nGAP 3 mm,0 mm\r\n"), "{job}");
    assert_eq!(job.matches("CLS\r\n").count(), 1, "one row of three: {job}");
    assert!(job.ends_with("PRINT 1,1\r\n"), "{job}");
    assert!(job.contains("SET RIBBON ON\r\n") && job.contains("\"DISH WASH BAR\"") && job.contains("\"Rs.38.00\""), "{job}");
    // the item barcode is the QR and the line under the price (the same value the POS finds by scan)
    assert!(job.contains(",M,3,A,0,\"8904000000035\"") && job.contains("\"8904000000035\"\r\n"), "{job}");
    // the rupee picture is on by default; a call can turn the ribbon off
    assert!(job.contains("BITMAP "), "{job}");
    let r = labels::print_labels(&db, &json!([{ "itemId": "i3", "copies": 1 }]), &json!({ "preset": "32x25-3up", "ribbon": false, "rupee": "text" }));
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8_lossy(&std::fs::read(&out).unwrap()).into_owned();
    assert!(job.contains("SET RIBBON OFF\r\n") && !job.contains("BITMAP ") && job.contains("\"Rs.38.00\""), "{job}");
}

/// Pkd and Exp on the Gokul 3-up: blank (written by hand) when no pack date is typed, even if months are given; a typed pack
/// date fills both, and the expiry is counted from it.
#[test]
fn gokul_3up_dates_are_blank_unless_a_pack_date_is_typed() {
    let (d, db) = mini_db();
    let out = d.path().join("dates.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let one = json!([{ "itemId": "i3", "copies": 1 }]);
    let r = labels::print_labels(&db, &one, &json!({ "preset": "32x25-3up", "bestBeforeMonths": 6 }));
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8_lossy(&std::fs::read(&out).unwrap()).into_owned();
    assert!(job.contains("\"Pkd:\"") && job.contains("\"Exp:\""), "{job}");
    assert!(!job.contains("Pkd:0") && !job.contains("Exp:0"), "no invented date: {job}");
    let r = labels::print_labels(&db, &one, &json!({ "preset": "32x25-3up", "packDate": "2026-11-07", "bestBeforeMonths": 6 }));
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8_lossy(&std::fs::read(&out).unwrap()).into_owned();
    assert!(job.contains("\"Pkd:07/11/26\"") && job.contains("\"Exp:07/05/27\""), "{job}");
}

// ---------- round 5: Pkd / Exp from the dialog and the item's shelf life, alignment and calibration jobs ----------

fn ribbon_opts(extra: Value) -> Value {
    let mut o = json!({ "preset": "32x25-3up", "fields": { "shop": true, "name": true, "price": true, "barcode": true, "dates": true, "qr": true } });
    for (k, v) in extra.as_object().unwrap() {
        o[k] = v.clone();
    }
    o
}

fn job_for(db: &gokul_core::Db, d: &tempfile::TempDir, file: &str, opts: &Value) -> String {
    let out = d.path().join(file);
    set_label_printer(db, &format!("FILE:{}", out.display()));
    let r = labels::print_labels(db, &json!([{ "itemId": "i1", "copies": 3 }]), opts);
    assert_eq!(r["ok"], true, "{r}");
    String::from_utf8_lossy(&std::fs::read(&out).unwrap()).into_owned()
}

#[test]
fn pkd_defaults_come_from_the_dialog_and_exp_from_shelf_life_only() {
    let (d, db) = mini_db();
    // no shelf life on the item: Exp stays blank, Pkd is exactly what the dialog sent
    let j = job_for(&db, &d, "a.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07" })));
    assert!(j.contains("\"Pkd:07/11/26\"") && j.contains("\"Exp:\""), "{j}");
    // the dialog sent no Pkd (cleared): nothing is invented, both blank
    let j = job_for(&db, &d, "b.tspl", &ribbon_opts(json!({})));
    assert!(j.contains("\"Pkd:\"") && j.contains("\"Exp:\"") && !j.contains("/26"), "{j}");
    // shelf life of 6 months on the item: Exp = Pkd + 6 months; 45 days works too
    db.with(|c| Ok(c.execute("UPDATE items SET shelf_life=6, shelf_life_unit='months' WHERE id='i1'", [])?)).unwrap();
    let j = job_for(&db, &d, "c.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07" })));
    assert!(j.contains("\"Exp:07/05/27\""), "{j}");
    db.with(|c| Ok(c.execute("UPDATE items SET shelf_life=45, shelf_life_unit='days' WHERE id='i1'", [])?)).unwrap();
    let j = job_for(&db, &d, "d.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07" })));
    assert!(j.contains("\"Exp:22/12/26\""), "{j}");
    // a typed Exp beats the shelf life
    let j = job_for(&db, &d, "e.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07", "expDate": "2027-01-31" })));
    assert!(j.contains("\"Exp:31/01/27\""), "{j}");
}

#[test]
fn saving_an_item_keeps_its_shelf_life_and_the_migration_is_additive() {
    let (_d, db) = mini_db();
    db.with(|c| {
        let it = gokul_core::catalog::get_item(c, "i1")?.unwrap();
        assert_eq!((it.shelf_life, it.shelf_life_unit.clone()), (None, None));
        let mut input: Value = serde_json::to_value(&it).unwrap();
        input["barcodes"] = json!([it.barcode]);
        input["packSize"] = json!("1 L");
        input["shelfLife"] = json!(6);
        input["shelfLifeUnit"] = json!("months");
        let r = gokul_core::catalog::save_item(c, &serde_json::from_value(input).unwrap())?;
        assert_eq!(r["ok"], true, "{r}");
        assert_eq!((r["item"]["shelfLife"].as_i64(), r["item"]["shelfLifeUnit"].as_str()), (Some(6), Some("months")));
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, 7);
        Ok(())
    })
    .unwrap();
}

#[test]
fn alignment_settings_move_the_job_and_show_in_the_preview() {
    let (d, db) = mini_db();
    let base = job_for(&db, &d, "f.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07" })));
    let moved = job_for(&db, &d, "g.tspl", &ribbon_opts(json!({ "packDate": "2026-11-07", "alignX": 1.5, "alignY": -1.0, "pitchAdjust": 0.5, "pullBackMm": 13 })));
    assert!(base.contains("BACKFEED 96\r\n") && moved.contains("BACKFEED 104\r\n"), "{base}");
    assert!(base.contains("TEXT 16,30,\"2\"") && moved.contains("TEXT 28,22,\"2\""), "{moved}");
    let pv = labels::label_preview(&db, &["i1".to_string()], &ribbon_opts(json!({ "alignX": 1.5, "alignY": -1.0, "pitchAdjust": 0.5 })));
    assert_eq!((pv["spec"]["alignXMm"].as_f64(), pv["spec"]["alignYMm"].as_f64(), pv["spec"]["shiftXDots"].as_i64(), pv["spec"]["shiftYDots"].as_i64()), (Some(1.5), Some(-1.0), Some(12), Some(-8)));
    // half millimetre steps and the +-4 mm limit are enforced
    let odd = labels::spec_from(&json!({}), &json!({ "preset": "32x25-3up", "alignX": 1.3, "alignY": 9.0 })).unwrap();
    assert_eq!((odd.align_x_mm, odd.align_y_mm), (1.5, 4.0));
    // pull back can be switched off
    let off = job_for(&db, &d, "h.tspl", &ribbon_opts(json!({ "pullBack": false })));
    assert!(!off.contains("BACKFEED") && !off.contains("SET TEAR"), "{off}");
}

#[test]
fn the_alignment_row_goes_to_the_printer_as_one_print() {
    let (d, db) = mini_db();
    let out = d.path().join("cal.tspl");
    set_label_printer(&db, &format!("FILE:{}", out.display()));
    let r = printing::test_print(&db, "labelAlign", "", &ribbon_opts(json!({ "verify": false })));
    assert_eq!(r["ok"], true, "{r}");
    let job = String::from_utf8(std::fs::read(&out).unwrap()).unwrap();
    assert_eq!(job.matches("\nPRINT ").count(), 1);
    assert!(job.contains("PRINT 1,1\r\n") && job.contains("BACKFEED 128\r\n"), "{job}");
    for bad in ["GAPDETECT", "AUTODETECT", "SELFTEST", "FORMFEED"] {
        assert!(!job.contains(bad));
    }
}
