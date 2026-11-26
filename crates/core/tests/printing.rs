//! Printing: the bill that reaches the printer equals the saved bill, a printing problem never touches the bill,
//! and sample jobs are captured to files (FILE: target) so the paper can be eyeballed without a printer.
mod common;
use common::*;
use gokul_core::bills::save_bill;
use gokul_core::db::set_setting;
use gokul_core::printing;
use gokul_print::escpos::decode_to_text;
use serde_json::json;
use std::path::PathBuf;

fn shots() -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/design/shots");
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn setup(db: &gokul_core::Db, target: &str, paper: &str) {
    db.with(|c| {
        set_setting(c, "printer", target)?;
        set_setting(c, "shopName", "Gokul Oils")?;
        set_setting(c, "gstin", "33AAKFG4821M1Z9")?;
        set_setting(c, "address", "12 Mill Road, Coimbatore 641001")?;
        set_setting(c, "phone", "98420 12345")?;
        set_setting(c, "receiptFooter", "Thank you. Visit again!")?;
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["printers"]["billPrinter"] = json!(target);
        b["billFormat"]["paper"] = json!(paper);
        b["billFormat"]["showQr"] = json!(true);
        b["billFormat"]["upiId"] = json!("gokuloils@upi");
        set_setting(c, "bundle.printers", &b["printers"].to_string())?;
        set_setting(c, "bundle.billFormat", &b["billFormat"].to_string())?;
        Ok(())
    })
    .unwrap();
}

fn long_lines() -> Vec<gokul_core::types::BillLine> {
    vec![
        line("i1", "101", "Wood Pressed Groundnut Oil 1 Litre Pet Bottle Premium Quality", 2000, 36_000, 5),
        line("i3", "103", "Dish Wash Bar", 1500, 3_800, 18),
    ]
}

#[test]
fn printed_bill_matches_saved_bill_at_80_and_58_mm() {
    let (d, db) = mini_db();
    for (paper, cols) in [("80mm", 48usize), ("58mm", 32)] {
        let out = d.path().join(format!("job-{paper}.bin"));
        setup(&db, &format!("FILE:{}", out.display()), paper);
        let bill = db.with(|c| Ok(save_bill(c, &cash_draft(long_lines()))?)).unwrap();
        let r = printing::print_document(&db, "bill", &bill.id, &json!({ "auto": true, "change": 2000 }));
        assert_eq!(r["ok"], true, "{r}");
        let bytes = std::fs::read(&out).unwrap();
        assert_eq!(&bytes[..2], &[0x1B, 0x40], "starts with ESC @");
        assert!(bytes.windows(5).any(|w| w == [0x1B, 0x70, 0x00, 0x32, 0xFA]), "cash sale kicks the drawer");
        assert!(bytes.windows(3).any(|w| w == [0x1D, 0x56, 0x01]), "partial cut");
        assert!(bytes.windows(3).any(|w| w == [0x1D, 0x76, 0x30]), "logo raster");
        let text = decode_to_text(&bytes);
        // totals equal the saved bill: the TOTAL line, the NET AMOUNT picture and the GST table
        let grand = printing::money(bill.totals.grand);
        let doc = db.with(|c| { let cfg = printing::load_config(c)?; Ok(printing::bill_doc(c, &cfg, &bill.id, false, 2000)?) }).unwrap();
        let paper_kind = if cols == 48 { gokul_print::Paper::Mm80 } else { gokul_print::Paper::Mm58 };
        let laid = gokul_print::layout::to_text(&gokul_print::layout(&doc.doc, paper_kind));
        assert!(laid.contains(&format!("NET AMOUNT \u{20b9} : {grand}")) || laid.contains(&format!("NET AMOUNT Rs : {grand}")), "{laid}");
        assert!(text.contains("[image 576x") || text.contains("[image 384x") || !laid.contains("[ picture"), "the NET AMOUNT line is sent as a picture: {text}");
        for line in text.lines().filter(|l| !l.starts_with('[')) {
            assert!(line.chars().count() <= cols, "line too wide for {paper}: {line:?}");
        }
        // the figures row is right-aligned to the last column
        let amt = printing::money(bill.lines[0].amount);
        let l = text.lines().find(|l| l.trim_end().ends_with(&amt) && l.starts_with(' ') && !l.contains("TOTAL")).unwrap();
        assert_eq!(l.chars().count(), cols, "{l:?}");
        // the long name wrapped instead of being cut
        assert!(text.contains("Premium") && text.contains("Quality"), "{text}");
        assert!((text.contains("PRODUCT") || text.contains("ITEM")) && text.contains("MRP") && text.contains("RATE") && text.contains("QTY") && text.contains("AMT"), "{text}");
        assert!(text.contains("GSTIN: 33AAKFG4821M1Z9.") && text.contains("TAX INVOICE") && text.contains("Cash Bill"), "{text}");
        assert!(text.contains("BILL NO : 26/0"), "printed bill number is YY/NNNNN: {text}");
        assert!((text.contains("Tax %") || text.contains("Tax%")) && text.contains("Taxable") && text.contains("SGST") && text.contains("CGST") && text.contains("Total Amt"), "{text}");
        assert!(text.contains("Payment Details:") && text.contains("Amount Received") && text.contains("Balance Amount") && text.contains("20.00"), "{text}");
        assert!(text.contains("ITEMS : 2") && text.contains("TOTAL QTY :"), "{text}");
        assert!(text.contains("[qr upi://pay?pa=gokuloils%40upi"), "{text}");
        assert!(text.contains("[barcode 26/0"), "the barcode carries the printed number: {text}");
        assert!(!text.contains("DUPLICATE"));
        std::fs::write(shots().join(format!("print-bill-{paper}.txt")), &text).unwrap();
        std::fs::write(shots().join(format!("print-bill-{paper}.bin")), &bytes).unwrap();

        // a reprint says DUPLICATE COPY and never opens the drawer
        let r = printing::print_document(&db, "bill", &bill.id, &json!({ "duplicate": true }));
        assert_eq!(r["ok"], true);
        let dup = std::fs::read(&out).unwrap();
        let dt = decode_to_text(&dup); assert!(dt.contains("DUPLICATE COPY"), "{dt}");
        assert!(!dup.windows(5).any(|w| w == [0x1B, 0x70, 0x00, 0x32, 0xFA]));
    }
}

#[test]
fn a_printing_failure_never_rolls_back_the_bill() {
    let (_d, db) = mini_db();
    setup(&db, "No Such Printer 9000", "80mm");
    let bill = db.with(|c| Ok(save_bill(c, &cash_draft(long_lines()))?)).unwrap();
    let r = printing::print_document(&db, "bill", &bill.id, &json!({ "auto": true }));
    assert_eq!(r["ok"], false);
    assert!(r["message"].as_str().unwrap().contains("not installed"), "{r}");
    // no printer at all
    setup(&db, "", "80mm");
    let r = printing::print_document(&db, "bill", &bill.id, &json!({ "auto": true }));
    assert_eq!(r["ok"], false);
    assert!(r["message"].as_str().unwrap().contains("no printer"), "{r}");
    db.with(|c| {
        assert_eq!(count(c, "bills"), 1);
        assert_eq!(count(c, "bill_lines"), 2);
        assert!(gokul_core::bills::get_bill(c, &bill.id)?.is_some());
        Ok(())
    })
    .unwrap();
    let st = printing::printer_status(&db);
    assert_eq!(st["configured"], false);
    assert_eq!(st["ready"], false);
}

#[test]
fn auto_print_off_prints_nothing_but_a_cash_sale_still_opens_the_drawer() {
    let (d, db) = mini_db();
    let out = d.path().join("job.bin");
    setup(&db, &format!("FILE:{}", out.display()), "80mm");
    db.with(|c| {
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["printers"]["autoPrint"] = json!(false);
        set_setting(c, "bundle.printers", &b["printers"].to_string())?;
        Ok(())
    })
    .unwrap();
    let bill = db.with(|c| Ok(save_bill(c, &cash_draft(long_lines()))?)).unwrap();
    let r = printing::print_document(&db, "bill", &bill.id, &json!({ "auto": true }));
    assert_eq!(r["ok"], true);
    assert_eq!(std::fs::read(&out).unwrap(), vec![0x1B, 0x40, 0x1B, 0x70, 0x00, 0x32, 0xFA]);
}

#[test]
fn other_documents_print() {
    let (d, db) = mini_db();
    let out = d.path().join("job.bin");
    setup(&db, &format!("FILE:{}", out.display()), "80mm");
    let r = printing::print_document(&db, "xreport", "", &json!({}));
    assert_eq!(r["ok"], true, "{r}");
    let t = decode_to_text(&std::fs::read(&out).unwrap());
    assert!(t.contains("X REPORT") && t.contains("EXPECTED CASH"));
    std::fs::write(shots().join("print-x-report-80mm.txt"), &t).unwrap();
    let t = printing::test_print(&db, "bill", &format!("FILE:{}", out.display()), &json!({ "paper": "58mm" }));
    assert_eq!(t["ok"], true, "{t}");
    let t = decode_to_text(&std::fs::read(&out).unwrap());
    assert!(t.contains("TEST PRINT") && t.contains("32 columns"));
    std::fs::write(shots().join("print-test-58mm.txt"), &t).unwrap();
    let bad = printing::print_document(&db, "expense", "NOPE", &json!({}));
    assert_eq!(bad["ok"], false);
}

/// Every drawer movement is its own line and the lines add up to the expected cash, on screen data and on the printed X report.
#[test]
fn drawer_breakdown_lines_sum_to_expected_cash() {
    use gokul_core::dispatch;
    let (d, db) = mini_db();
    let out = d.path().join("x.bin");
    setup(&db, &format!("FILE:{}", out.display()), "80mm");
    dispatch(&db, "openDay", vec![json!({ "userId": "u3", "counts": { "500": 200 } })]).unwrap(); // Rs 1,00,000
    db.with(|c| Ok(save_bill(c, &cash_draft(long_lines()))?)).unwrap();
    dispatch(&db, "addExpense", vec![json!({ "categoryId": "tea", "paidFrom": "cash", "amount": 10_000, "paidTo": "Tea", "note": "tea", "by": "t" })]).unwrap();
    dispatch(&db, "addExpense", vec![json!({ "categoryId": "tea", "paidFrom": "upi", "amount": 5_000, "paidTo": "Tea", "note": "upi", "by": "t" })]).unwrap();
    dispatch(&db, "addCashEntry", vec![json!({ "kind": "in", "reason": "Float top-up", "amount": 20_000, "by": "t" })]).unwrap();
    dispatch(&db, "addCashEntry", vec![json!({ "kind": "out", "reason": "Owner draw", "amount": 7_000, "by": "t" })]).unwrap();
    let s = dispatch(&db, "shiftSummary", vec![]).unwrap();
    let n = |k: &str| s[k].as_i64().unwrap_or(0);
    assert_eq!(n("expensesCash"), 10_000);
    assert_eq!(n("expensesOther"), 5_000, "UPI expense is listed but never touches the drawer");
    let sum = n("openingCash") + s["byMode"]["cash"].as_i64().unwrap() + (n("cashIn") - n("collectionsCash")) + n("collectionsCash")
        - (n("cashOut") - n("supplierCash")) - n("supplierCash") - n("cashRefunds") - n("expensesCash");
    assert_eq!(sum, n("expectedCash"));
    // the printed lines: each "+"/"-" amount, signed, plus the opening line, equals the printed expected cash
    assert_eq!(printing::print_document(&db, "xreport", "", &json!({}))["ok"], true);
    let t = decode_to_text(&std::fs::read(&out).unwrap());
    let amt = |l: &str| -> i64 { let v = l.split_whitespace().last().unwrap().replace(',', ""); let (a, b) = v.split_once('.').unwrap(); a.parse::<i64>().unwrap() * 100 + b.parse::<i64>().unwrap() };
    let drawer: Vec<&str> = t.lines().skip_while(|l| !l.starts_with("CASH DRAWER")).skip(1).collect();
    let mut total = 0i64;
    for l in &drawer {
        let tl = l.trim_start();
        if tl.starts_with("Opening cash") || tl.starts_with('+') { total += amt(l); } else if tl.starts_with('-') { total -= amt(l); }
    }
    let expected_line = drawer.iter().find(|l| l.contains("= EXPECTED CASH")).unwrap();
    assert_eq!(total, amt(expected_line), "{t}");
    assert_eq!(amt(expected_line), n("expectedCash"));
    assert!(t.contains("- Expenses (cash) (1)") && t.contains("EXPENSES") && t.contains("Paid by UPI/bank (1), not in drawer"), "{t}");
    std::fs::write(shots().join("print-x-report-80mm.txt"), &t).unwrap();
}

/// The owner's real bill (SRI GOKUL ENTERPRISES) as sample outputs: text and PNG with the Tamil lines as raster.
#[test]
fn gokul_sample_bills_cash_and_upi() {
    let (_d, db) = mini_db();
    let out = _d.path().join("sample.bin");
    db.with(|c| {
        set_setting(c, "printer", &format!("FILE:{}", out.display()))?;
        let mut b = gokul_core::crm::get_settings_bundle(c)?;
        b["shop"]["name"] = json!("SRI GOKUL ENTERPRISES");
        b["shop"]["shortName"] = json!("GOKUL");
        b["shop"]["tagline"] = json!("வாகை மரச்செக்கு எண்ணெய்");
        b["shop"]["address"] = json!("No: 30, Nellikuppam Main Road, Kondur, Cuddalore - 607006.");
        b["shop"]["city"] = json!("");
        b["shop"]["pincode"] = json!("");
        b["shop"]["gstin"] = json!("33EAEPK8839P2ZX");
        b["shop"]["phone"] = json!("9445099191");
        b["shop"]["whatsapp"] = json!("9445099191");
        b["billFormat"]["footer"] = json!("Save Your Health, With Our Natural Product !");
        b["billFormat"]["footerTamil"] = json!("இயற்கை உணவோடு வாழுங்கள்");
        b["billFormat"]["showQr"] = json!(false);
        b["printers"]["billPrinter"] = json!(format!("FILE:{}", out.display()));
        b["printers"].as_object_mut().unwrap().remove("detected");
        gokul_core::crm::save_settings_bundle(c, &b)?;
        c.execute("UPDATE customers SET address='12, Gandhi Street, Kondur' WHERE id='c1'", [])?;
        Ok(())
    })
    .unwrap();
    let lines = || vec![line("i1", "101", "Wood Pressed Groundnut Oil 1 Litre", 2000, 36_000, 5), line("i3", "103", "Dish Wash Bar", 1000, 3_800, 18)];
    let cash = db.with(|c| Ok(save_bill(c, &draft_with(lines(), 0, Some("c1"), "cash"))?)).unwrap();
    let upi = db.with(|c| Ok(save_bill(c, &draft_with(lines(), 0, None, "upi"))?)).unwrap();
    for (name, bill, change, paper) in [("cash", &cash, 2300, gokul_print::Paper::Mm80), ("upi", &upi, 0, gokul_print::Paper::Mm80), ("cash-58mm", &cash, 2300, gokul_print::Paper::Mm58)] {
        let (doc, cfg) = db.with(|c| { let mut cfg = printing::load_config(c)?; cfg.paper = paper; Ok((printing::bill_doc(c, &cfg, &bill.id, false, change)?, cfg)) }).unwrap();
        let items = gokul_print::layout(&doc.doc, paper);
        let text = gokul_print::layout::to_text(&items);
        if name == "cash" {
            assert!(text.contains("Cash Bill") && text.contains("Customer Name : Murugan") && text.contains("Cust ID : c1") && text.contains("Contact No : 98400 11111") && text.contains("Points : 4.60") || text.contains("Points : "), "{text}");
            assert!(text.contains("வாகை மரச்செக்கு எண்ணெய்") || !text.contains("[ picture"), "{text}");
        } else if name == "upi" {
            assert!(text.contains("UPI Bill") && !text.contains("Customer Name"), "{text}");
        }
        assert!(text.contains("WhatsApp : 9445099191") && text.contains("Natural Product !"), "{text}");
        std::fs::write(shots().join(format!("print-gokul-{name}.txt")), &text).unwrap();
        let logo = gokul_print::logo::cached(cfg.logo_png.as_deref(), if paper == gokul_print::Paper::Mm80 { 200 } else { 160 });
        if let Some(png) = gokul_print::tamil::preview_png(&items, paper, logo.as_deref()) {
            std::fs::write(shots().join(format!("print-gokul-{name}.png")), png).unwrap();
        }
        let bytes = printing::render_bytes(&doc, &cfg, false);
        std::fs::write(shots().join(format!("print-gokul-{name}.bin")), bytes).unwrap();
    }
}
