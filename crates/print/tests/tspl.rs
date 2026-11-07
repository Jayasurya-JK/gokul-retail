//! Golden TSPL output and layout rules for the barcode sticker printer.
use gokul_print::barcode::{code128_modules, ean13_modules};
use gokul_print::tspl::*;

fn lab() -> Label {
    Label {
        shop: "Gokul Oils".into(),
        name: "G7 Wood Pressed Sesame Oil 1L".into(),
        mrp: 65000,
        price: 59000,
        per: "".into(),
        barcode: "8904000000011".into(),
        code: "G7".into(),
        pack_date: "07/11/26".into(),
        best_before: "07/05/27".into(),
        batch: "GK2611O".into(),
        net_qty: "1 L".into(),
        legal: "Incl. of all taxes. Mfd & Pkd by Gokul Oils, Salem. FSSAI 12345678901234".into(),
        price_prefix: String::new(),
    }
}
fn all_fields() -> Fields {
    Fields { shop: true, batch: true, net: true, legal: true, ..Default::default() }
}
fn job(spec: &Spec, f: &Fields, labels: &[Label]) -> String {
    String::from_utf8_lossy(&render_job(spec, f, labels)).into_owned()
}

#[test]
fn golden_50x25_one_up_four_copies_is_one_print_command() {
    let spec = Spec::from_preset(preset("50x25").unwrap());
    let got = job(&spec, &all_fields(), &[lab(), lab(), lab(), lab()]);
    let want = "SIZE 50 mm,25 mm\r\nGAP 3 mm,0 mm\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\nDENSITY 8\r\nSPEED 4\r\nSET RIBBON ON\r\nSET TEAR ON\r\nSET REPRINT OFF\r\nBACKFEED 96\r\nCODEPAGE 437\r\nCLS\r\n\
TEXT 160,8,\"1\",0,1,1,\"GOKUL OILS\"\r\n\
TEXT 12,24,\"2\",0,1,1,\"G7 Wood Pressed Sesame Oil 1L\"\r\n\
BARCODE 77,47,\"128\",41,0,0,2,2,\"8904000000011\"\r\n\
TEXT 148,90,\"1\",0,1,1,\"8904000000011\"\r\n\
TEXT 12,111,\"2\",0,1,1,\"MRP Rs 650\"\r\n\
TEXT 292,107,\"3\",0,1,1,\"Rs 590\"\r\n\
TEXT 12,134,\"1\",0,1,1,\"Pkd 07/11/26 BB 07/05/27\"\r\n\
TEXT 12,149,\"1\",0,1,1,\"Net 1 L Batch GK2611O\"\r\n\
TEXT 12,164,\"1\",0,1,1,\"Incl. of all taxes. Mfd & Pkd by Gokul Oils,\"\r\n\
TEXT 12,178,\"1\",0,1,1,\"Salem. FSSAI 12345678901234\"\r\n\
PRINT 1,4\r\n";
    assert_eq!(got, want);
}

#[test]
fn golden_2up_prints_two_stickers_per_row_across_a_79_mm_page() {
    let spec = Spec::from_preset(preset("38x25-2up").unwrap());
    let mut b = lab();
    b.name = "Jaggery 1 kg".into();
    let got = job(&spec, &Fields::default(), &[lab(), b.clone(), lab()]);
    assert!(got.starts_with("SIZE 79 mm,25 mm\r\nGAP 3 mm,0 mm\r\n"));
    // 3 stickers = a full row (A, B) and a short row (A): two CLS, two PRINT
    assert_eq!(got.matches("CLS\r\n").count(), 2);
    assert_eq!(got.matches("PRINT 1,1\r\n").count(), 2);
    // the right-hand sticker starts one label width + gap further right: (38 + 3) mm = 328 dots, plus the 12 dot margin
    assert!(got.contains("TEXT 340,"), "{got}");
    assert!(got.contains("TEXT 12,"));
    assert!(got.contains("\"Jaggery 1 kg\""));
    // the short last row has only the left sticker
    let last_row = got.rsplit("CLS\r\n").next().unwrap();
    assert!(!last_row.contains("TEXT 340,"));
}

#[test]
fn identical_rows_collapse_and_different_rows_do_not() {
    let spec = Spec::from_preset(preset("38x25-2up").unwrap());
    let mut other = lab();
    other.name = "Other".into();
    let mut v = vec![lab(); 10]; // 5 identical rows
    v.extend(vec![other.clone(); 2]);
    let got = job(&spec, &Fields::default(), &v);
    assert_eq!(got.matches("CLS\r\n").count(), 2);
    assert!(got.contains("PRINT 1,5\r\n"));
    assert!(got.contains("PRINT 1,1\r\n"));
}

#[test]
fn calibration_offsets_and_flip() {
    let mut spec = Spec::from_preset(preset("50x25").unwrap());
    spec.dx = 5;
    spec.dy = -4;
    spec.flip = true;
    spec.darkness = 12;
    spec.speed = 3;
    let got = job(&spec, &Fields { name: true, mrp: false, price: false, barcode: false, dates: false, ..Default::default() }, &[lab()]);
    assert!(got.contains("DIRECTION 0,0\r\n") && got.contains("DENSITY 12\r\n") && got.contains("SPEED 3\r\n"));
    assert!(got.contains("TEXT 17,4,\"2\",0,1,1,\"G7 Wood Pressed Sesame Oil 1L\"\r\n"), "{got}");
    // a shift can never push an element off the left or top edge
    spec.dx = -500;
    spec.dy = -500;
    assert!(job(&spec, &Fields::default(), &[lab()]).contains("TEXT 0,0,"));
}

#[test]
fn real_ean13_is_drawn_as_ean13_and_shop_codes_as_code128() {
    let spec = Spec::from_preset(preset("50x25").unwrap());
    let mut a = lab();
    a.barcode = "4006381333931".into();
    let got = job(&spec, &Fields::default(), &[a]);
    assert!(got.contains("\"EAN13\",") && got.contains("\"4006381333931\"\r\n"), "{got}");
    // item without a barcode: the shop code goes out as Code 128
    let mut b = lab();
    b.barcode = String::new();
    b.code = "G123".into();
    let got = job(&spec, &Fields::default(), &[b]);
    assert!(got.contains("\"128\",") && got.contains("\"G123\"\r\n"), "{got}");
    // a 13 digit internal number with a bad check digit is not EAN13
    let mut c = lab();
    c.barcode = "8904000000012".into();
    assert!(job(&spec, &Fields::default(), &[c]).contains("\"128\","));
}

#[test]
fn long_names_wrap_then_truncate_and_text_is_ascii() {
    assert_eq!(wrap("Wood Pressed Groundnut Oil", 14, 2), vec!["Wood Pressed", "Groundnut Oil"]);
    assert_eq!(wrap("Wood Pressed Groundnut Oil Premium Pet Bottle", 14, 2), vec!["Wood Pressed".to_string(), "Groundnut Oi..".to_string()]);
    assert_eq!(wrap("Supercalifragilistic", 8, 3), vec!["Supercal", "ifragili", "stic"]);
    assert_eq!(ascii("Ghee \"A\" \u{b9}\u{b95}"), "Ghee 'A' ??");
    assert_eq!(rs(59000), "590");
    assert_eq!(rs(59050), "590.50");
}

#[test]
fn loose_items_show_the_unit_and_equal_prices_show_one_amount() {
    let spec = Spec::from_preset(preset("50x25").unwrap());
    let mut l = lab();
    l.per = "/kg".into();
    let got = job(&spec, &Fields::default(), &[l.clone()]);
    assert!(got.contains("\"MRP Rs 650/kg\"") || (got.contains("\"MRP Rs 650/kg\"") || got.contains("\"Rs 590/kg\"")), "{got}");
    assert!(got.contains("/kg"));
    l.mrp = l.price;
    let got = job(&spec, &Fields::default(), &[l]);
    assert_eq!(got.matches("Rs 590").count(), 1, "{got}");
}

#[test]
fn nothing_ever_leaves_the_label_even_with_every_field_on() {
    let mut f = all_fields();
    f.qr = true;
    let mut long = lab();
    long.name = "Cold Pressed Organic Virgin Coconut Oil With Extra Long Marketing Name 5 Litre Jar".into();
    long.mrp = 12_345_050;
    long.price = 11_999_900;
    let mut specs: Vec<Spec> = PRESETS.iter().map(Spec::from_preset).collect();
    f.qr = true;
    specs.push(Spec { width: 40.0, height: 20.0, gap: 2.0, columns: 2, col_gap: 2.0, ..Spec::from_preset(&PRESETS[0]) });
    for spec in specs {
        for l in [lab(), long.clone()] {
            for e in layout_label(&spec, &f, &l) {
                let (cw, ch) = (spec.cell_w(), spec.cell_h());
                match &e {
                    El::Text { x, y, font, xm, ym, text } => {
                        let (fw, fh) = font_size(*font);
                        assert!(*x + text.chars().count() as u32 * fw * *xm as u32 <= cw, "text too wide {text:?} on {}x{}", spec.width, spec.height);
                        assert!(*y + fh * *ym as u32 <= ch, "text too low {text:?} on {}x{}", spec.width, spec.height);
                    }
                    El::Barcode { x, y, h, w, .. } => assert!(*x + *w <= cw && *y + *h <= ch, "barcode outside on {}x{}", spec.width, spec.height),
                    El::Qr { x, y, cell, size, .. } => assert!(*x + cell * size <= cw && *y + cell * size <= ch),
                    _ => {}
                }
            }
        }
    }
}

#[test]
fn fields_can_be_switched_off() {
    let spec = Spec::from_preset(preset("50x25").unwrap());
    let f = Fields { name: false, mrp: false, price: false, barcode: false, dates: false, ..Default::default() };
    let got = job(&spec, &f, &[lab()]);
    assert!(!got.contains("TEXT") && !got.contains("BARCODE"), "{got}");
    assert!(got.ends_with("CLS\r\nPRINT 1,1\r\n"));
}

#[test]
fn preview_barcode_width_matches_the_printed_code() {
    let spec = Spec::from_preset(preset("50x25").unwrap());
    let els = layout_label(&spec, &Fields::default(), &lab());
    let Some(El::Barcode { w, narrow, rects, data, .. }) = els.iter().find(|e| matches!(e, El::Barcode { .. })).cloned() else { panic!("no barcode") };
    assert_eq!(data, "8904000000011");
    assert_eq!(w, code128_modules("8904000000011").unwrap() * narrow);
    let last = rects.last().unwrap();
    assert_eq!(last.0 + last.1, w, "bars end exactly at the code width");
    assert_eq!(ean13_modules("4006381333931").unwrap().len(), 95);
}

#[test]
fn qr_goes_on_the_right_and_the_text_makes_room() {
    let spec = Spec::from_preset(preset("100x50").unwrap());
    let f = Fields { qr: true, ..Default::default() };
    let els = layout_label(&spec, &f, &lab());
    let qr = els.iter().find_map(|e| if let El::Qr { x, rows, size, .. } = e { Some((*x, rows.len() as u32, *size)) } else { None }).expect("qr");
    assert_eq!(qr.1, qr.2);
    assert!(qr.0 > 400);
    let got = job(&spec, &f, &[lab()]);
    assert!(got.contains("QRCODE ") && got.contains(",M,4,A,0,\"8904000000011\""), "{got}");
    // too narrow for a QR: skipped, label still prints
    let small = Spec { width: 20.0, style: Style::Plain, ..Spec::from_preset(preset("32x25-3up").unwrap()) };
    assert!(!job(&small, &f, &[lab()]).contains("QRCODE"));
}

#[test]
fn test_label_has_frame_ruler_and_a_code() {
    let spec = Spec::from_preset(preset("38x25-2up").unwrap());
    let got = String::from_utf8(render_test_job(&spec)).unwrap();
    assert!(got.contains("SIZE 79 mm,25 mm") && got.contains("BOX 0,0,") && got.contains("GOKUL LABEL TEST") && got.contains("\"GOKUL123\""));
    assert!(got.contains("38x25 mm, 2 across"));
    assert_eq!(got.matches("GOKUL LABEL TEST").count(), 2);
    assert_eq!(got.matches("PRINT 1,1").count(), 1);
}

#[test]
fn sizes_are_checked() {
    let ok = Spec::from_preset(preset("32x25-3up").unwrap());
    assert!(ok.validate().is_ok());
    for p in PRESETS.iter() {
        assert!(Spec::from_preset(p).validate().is_ok(), "{}", p.id);
    }
    // three 38 mm labels do not fit a 4 inch printer
    let too_wide = Spec { width: 38.0, columns: 3, col_gap: 2.0, ..ok.clone() };
    assert!(too_wide.validate().unwrap_err().contains("at most 104"));
    assert!(Spec { width: 5.0, ..ok.clone() }.validate().is_err());
    assert!(Spec { columns: 0, ..ok }.validate().is_err());
    assert_eq!(rows_needed(3, 7), 3);
}

#[test]
fn gokul_small_sticker_matches_the_owners_label() {
    let spec = Spec::from_preset(preset("gokul-small").unwrap());
    assert!(spec.style == Style::GokulSmall && spec.cell_w() == 304 && spec.cell_h() == 200);
    let mut l = lab();
    l.shop = "Gokul".into();
    l.name = "Paasi Paruppu Maa".into();
    l.code = "M3".into();
    l.price = 3800;
    l.pack_date = String::new();
    l.best_before = String::new();
    let f = Fields { shop: true, name: true, price: true, mrp: false, barcode: false, dates: true, qr: true, ..Default::default() };
    let got = job(&spec, &f, &[l.clone()]);
    assert!(got.contains("TEXT 12,8,\"4\",0,1,1,\"GOKUL\""), "{got}");
    assert!(got.contains("\"PAASI PARUPPU MAA\""), "{got}");
    assert!(got.contains("QRCODE 12,") && got.contains(",M,5,A,0,\"M3\""), "{got}");
    assert!(got.contains("\"M3\"") && got.contains("\"Rs.38.00\"") && got.contains("\"Pkd:\"") && got.contains("\"Exp:\""), "{got}");
    // dates given: filled in
    l.pack_date = "07/11/26".into();
    l.best_before = "07/05/27".into();
    let got = job(&spec, &f, &[l]);
    assert!(got.contains("\"Pkd:07/11/26\"") && got.contains("\"Exp:07/05/27\""), "{got}");
}

fn ribbon_spec() -> Spec {
    Spec::from_preset(preset("32x25-3up").unwrap())
}

#[test]
fn gokul_3up_is_three_across_on_a_103_mm_ribbon_roll() {
    let spec = ribbon_spec();
    assert!(spec.style == Style::GokulRibbon && spec.ribbon && spec.rupee == Rupee::Both);
    assert_eq!((spec.columns, spec.width, spec.height, spec.col_gap, spec.gap), (3, 33.0, 25.0, 2.0, 3.0));
    // 33 mm = 264 dots, the 2 mm gap = 16 dots: the columns start 280 and 560 dots apart
    assert_eq!((spec.cell_w(), spec.cell_h(), spec.col_x(1), spec.col_x(2)), (264, 200, 280, 560));
    assert!((spec.total_width_mm() - 103.0).abs() < 0.01 && spec.validate().is_ok());
    let mut b = lab();
    b.name = "TEA THOOL 100g".into();
    b.barcode = "8900005666018".into();
    b.code = "T100".into();
    b.shop = "GOKUL".into();
    b.price = 3500;
    b.price_prefix = "Rs.".into();
    let f = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    // three copies of one item fill one row: one CLS, one PRINT 1,1 with three stickers side by side
    let got = job(&spec, &f, &[b.clone(), b.clone(), b.clone()]);
    assert!(got.starts_with("SIZE 103 mm,25 mm\r\nGAP 3 mm,0 mm\r\n"), "{got}");
    assert!(got.contains("SET RIBBON ON\r\nSET TEAR ON\r\nSET REPRINT OFF\r\nBACKFEED 96\r\nCODEPAGE 437\r\n"), "{got}");
    assert_eq!(got.matches("CLS\r\n").count(), 1);
    assert!(got.ends_with("PRINT 1,1\r\n"), "{got}");
    // GOKUL starts 16 dots in from each sticker's left edge: sticker 2 at 280 + 16 and sticker 3 at 560 + 16
    assert!(got.contains("TEXT 16,29,\"4\",0,1,1,\"GOKUL\"") && got.contains("TEXT 296,29,\"4\"") && got.contains("TEXT 576,29,\"4\""), "{got}");
    // the words of the sticker, the item code in the QR and under the price, and the rupee picture
    assert!(got.contains("\"GOKUL\"") && got.contains("\"TEA THOOL 100G\"") && got.contains("\"Rs.35.00\""), "{got}");
    assert!(got.contains("\"Pkd:07/11/26\"") && got.contains("\"Exp:07/05/27\""), "{got}");
    assert!(got.contains(",M,3,A,0,\"8900005666018\""), "{got}");
    assert!(got.contains("\"8900005666018\"\r\n"), "{got}");
    assert!(got.contains("BITMAP ") && got.contains(",2,20,0,"), "rupee is a 2 byte wide, 20 dot high bitmap: {got}");
}

/// The box an element covers in dots, from its sticker's top-left corner: (left, top, right, bottom).
fn extent(e: &El) -> (u32, u32, u32, u32) {
    match e {
        El::Text { x, y, font, xm, ym, text } => {
            let (fw, fh) = font_size(*font);
            (*x, *y, *x + text.chars().count() as u32 * fw * *xm as u32, *y + fh * *ym as u32)
        }
        El::Qr { x, y, cell, size, .. } => (*x, *y, *x + cell * size, *y + cell * size),
        El::Bitmap { x, y, w, rows } => (*x, *y, *x + *w, *y + rows.len() as u32),
        El::Barcode { x, y, w, h, .. } | El::Bar { x, y, w, h } | El::Frame { x, y, w, h, .. } => (*x, *y, *x + *w, *y + *h),
    }
}

/// Every element of every column lies inside [col_x + 16, col_x + 264 - 16] x [16, 200 - 16]: the 2 mm safe margin of its own
/// 33 x 25 mm sticker, for every rupee, start, field and name / price / code combination, so a 1 mm feed error cannot clip.
#[test]
fn every_column_stays_inside_the_safe_margin() {
    let spec = ribbon_spec();
    let mut long = lab();
    long.name = "Cold Pressed Organic Virgin Coconut Oil With Extra Long Marketing Name 5 Litre Jar".into();
    long.barcode = "GK-VERY-LONG-SHOP-CODE-123456789".into();
    long.price = 11_999_900;
    long.per = "/kg".into();
    long.pack_date = "07/11/26".into();
    let mut none = lab();
    none.barcode = String::new();
    none.code = String::new();
    none.name = String::new();
    none.price = 0;
    let all = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    let variants = [
        all.clone(),
        Fields { qr: false, ..all.clone() },
        Fields { barcode: false, ..all.clone() },
        Fields { price: false, ..all.clone() },
        Fields { dates: false, shop: false, ..all.clone() },
        Fields { name: false, ..all.clone() },
    ];
    let mut checked = 0;
    for start in [0.0, 1.0] {
        for rupee in [Rupee::Both, Rupee::Symbol, Rupee::Text] {
            let s = Spec { rupee, start_mm: start, ..spec.clone() };
            let lo = SAFE_DOTS + dots(start);
            for f in &variants {
                for l in [lab(), long.clone(), none.clone()] {
                    let els = layout_label(&s, f, &l);
                    for col in 0..spec.columns {
                        let ox = spec.col_x(col);
                        for e in &els {
                            let (x0, y0, x1, y1) = extent(e);
                            let (ax0, ax1) = (ox + x0, ox + x1);
                            assert!(ax0 >= ox + lo && ax1 <= ox + 264 - SAFE_DOTS, "column {col} x {ax0}..{ax1} outside the margin: {e:?}");
                            assert!(y0 >= SAFE_DOTS && y1 <= 200 - SAFE_DOTS, "column {col} y {y0}..{y1} outside the margin: {e:?}");
                            checked += 1;
                        }
                    }
                }
            }
        }
    }
    assert!(checked > 1000, "{checked}");
}

/// The Gokul 3-up prints the content of one row in every column, and nothing below the QR block: the bottom of every element
/// is above the bottom margin with room for a 1 mm feed error.
#[test]
fn gokul_3up_block_is_centred_and_ends_above_the_bottom_margin() {
    let spec = ribbon_spec();
    let mut l = lab();
    l.name = "TEA THOOL 100g".into();
    l.barcode = "8906005666918".into();
    l.price = 3500;
    let f = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    let els = layout_label(&spec, &f, &l);
    let qr = els.iter().find_map(|e| if let El::Qr { x, y, cell, size, .. } = e { Some((*x, *y, *cell, *size)) } else { None }).expect("qr");
    assert_eq!((qr.2, qr.3), (3, 21), "21 modules at 3 dots for the 13 digit code: 63 dots");
    // the QR is 63 dots: its block is centred in the 232 dot safe width (16 to 248)
    let block_right = els.iter().map(|e| extent(e).2).max().unwrap();
    let block_left = els.iter().map(|e| extent(e).0).min().unwrap();
    assert!(block_left >= 16 && block_right <= 248, "{block_left} {block_right}");
    let bottom = els.iter().map(|e| extent(e).3).max().unwrap();
    assert!(bottom <= 184 - 8, "bottom at {bottom}, the feed margin is 8 dots");
}

/// The Pkd and Exp labels are printed blank: no date appears on a sticker unless one was typed in.
#[test]
fn gokul_3up_pkd_and_exp_are_blank_labels_when_no_date_is_given() {
    let spec = ribbon_spec();
    let mut l = lab();
    l.pack_date = String::new();
    l.best_before = String::new();
    let f = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    let got = job(&spec, &f, &[l]);
    assert!(got.contains("\"Pkd:\"") && got.contains("\"Exp:\""), "{got}");
    assert!(!got.contains("Pkd:0") && !got.contains("Exp:0"), "{got}");
}

#[test]
fn gokul_3up_rupee_and_ribbon_settings() {
    let mut spec = ribbon_spec();
    let mut l = lab();
    l.name = "TEA THOOL 100g".into();
    l.barcode = "8900005666018".into();
    l.price = 3500;
    let f = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    // symbol only: no "Rs." text, the picture then the amount
    spec.rupee = Rupee::Symbol;
    let got = job(&spec, &f, &[l.clone()]);
    assert!(got.contains("BITMAP ") && got.contains("\"35.00\"") && !got.contains("Rs."), "{got}");
    // text only: no picture
    spec.rupee = Rupee::Text;
    let got = job(&spec, &f, &[l.clone()]);
    assert!(!got.contains("BITMAP ") && got.contains("\"Rs.35.00\""), "{got}");
    // direct thermal: ribbon off
    spec.rupee = Rupee::Both;
    spec.ribbon = false;
    let got = job(&spec, &f, &[l]);
    assert!(got.contains("SET RIBBON OFF\r\n") && !got.contains("SET RIBBON ON"), "{got}");
}

#[test]
fn gokul_3up_bitmap_bytes_match_the_rupee_picture() {
    let mut spec = ribbon_spec();
    spec.rupee = Rupee::Symbol;
    let mut l = lab();
    l.price = 100;
    l.barcode = String::new();
    l.code = String::new();
    let f = Fields { shop: false, name: false, price: true, barcode: false, dates: false, qr: false, ..Default::default() };
    let bytes = render_job(&spec, &f, &[l]);
    // "BITMAP x,y,bytes_per_row,height,mode," is followed by the raw bytes: skip its five commas
    let at = bytes.windows(7).position(|w| w == b"BITMAP ").expect("bitmap");
    let mut i = at;
    let mut commas = 0;
    while commas < 5 {
        if bytes[i] == b',' {
            commas += 1;
        }
        i += 1;
    }
    let head = String::from_utf8_lossy(&bytes[at..i]).to_string();
    assert!(head.ends_with(",2,20,0,"), "{head}");
    let data = &bytes[i..i + 40];
    // row 0 is ".#########.." : dots 1 to 9 are ink. TSPL 0 = printed, 1 = blank, so byte 0 = 0x80 and byte 1 = 0x3F
    assert_eq!(&data[..2], &[0x80, 0x01]);
    // every row of the picture is two bytes (12 dots plus padding), and the shape is the same at both ends of the rupee
    assert_eq!(data.len(), 20 * 2);
    // the preview gets the same dots: '1' is ink
    let els = layout_label(&spec, &f, &lab_price(100));
    let Some(El::Bitmap { w, rows, .. }) = els.iter().find(|e| matches!(e, El::Bitmap { .. })).cloned() else { panic!("no rupee") };
    assert_eq!(w, 16);
    assert_eq!(rows.len(), 20);
    assert!(rows.iter().all(|r| r.len() == 16));
    assert_eq!(&rows[0], "0111111111111110");
}

fn lab_price(p: i64) -> Label {
    let mut l = lab();
    l.price = p;
    l.barcode = String::new();
    l.code = String::new();
    l
}

#[test]
fn gokul_3up_every_element_stays_inside_the_sticker() {
    let spec = ribbon_spec();
    let mut long = lab();
    long.name = "Cold Pressed Organic Virgin Coconut Oil With Extra Long Marketing Name 5 Litre Jar".into();
    long.barcode = "GK-VERY-LONG-SHOP-CODE-123456789".into();
    long.price = 11_999_900;
    long.per = "/kg".into();
    long.pack_date = "07/11/26".into();
    let mut f = Fields { shop: true, name: true, price: true, barcode: true, dates: true, qr: true, ..Default::default() };
    for rupee in [Rupee::Both, Rupee::Symbol, Rupee::Text] {
        for ribbon in [true, false] {
            for fields in [f.clone(), Fields { qr: false, ..f.clone() }] {
                let spec = Spec { rupee, ribbon, ..spec.clone() };
                for l in [lab(), long.clone()] {
                    for e in layout_label(&spec, &fields, &l) {
                        let (cw, ch) = (spec.cell_w(), spec.cell_h());
                        match &e {
                            El::Text { x, y, font, xm, ym, text } => {
                                let (fw, fh) = font_size(*font);
                                assert!(*x + text.chars().count() as u32 * fw * *xm as u32 <= cw, "{text:?} too wide");
                                assert!(*y + fh * *ym as u32 <= ch, "{text:?} too low");
                            }
                            El::Qr { x, y, cell, size, .. } => assert!(*x + cell * size <= cw && *y + cell * size <= ch),
                            El::Bitmap { x, y, w, rows } => assert!(*x + *w <= cw && *y + rows.len() as u32 <= ch, "rupee outside"),
                            El::Barcode { x, y, h, w, .. } => assert!(*x + *w <= cw && *y + *h <= ch),
                            _ => {}
                        }
                    }
                }
            }
        }
    }
    f.qr = false;
    assert!(layout_label(&spec, &f, &lab()).iter().all(|e| !matches!(e, El::Qr { .. })));
}

// ---------- round 5: alignment, pull-back, calibration row, dates, safe box ----------

fn tea() -> Label {
    let mut b = lab();
    b.shop = "GOKUL".into();
    b.name = "Tea Thool 100g".into();
    b.barcode = "8906005666918".into();
    b.code = String::new();
    b.price = 3500;
    b.mrp = 3500;
    b.price_prefix = "Rs.".into();
    b.pack_date = "07/11/26".into();
    b.best_before = String::new();
    b
}
fn ribbon_fields() -> Fields {
    Fields { shop: true, name: true, mrp: false, price: true, barcode: true, dates: true, qr: true, ..Default::default() }
}

#[test]
fn golden_tea_3up_v4_job() {
    let spec = ribbon_spec();
    let t = tea();
    let got = job(&spec, &ribbon_fields(), &[t.clone(), t.clone(), t]);
    let head = "SIZE 103 mm,25 mm\r\nGAP 3 mm,0 mm\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\nDENSITY 8\r\nSPEED 4\r\nSET RIBBON ON\r\nSET TEAR ON\r\nSET REPRINT OFF\r\nBACKFEED 96\r\nCODEPAGE 437\r\nCLS\r\n";
    assert!(got.starts_with(head), "{got}");
    // sticker 1: dates right aligned (Pkd with the date, Exp blank), GOKUL bold on the left, name centred
    assert!(got.contains("TEXT 152,32,\"1\",0,1,1,\"Pkd:07/11/26\"\r\nTEXT 216,46,\"1\",0,1,1,\"Exp:\"\r\n"), "{got}");
    assert!(got.contains("TEXT 16,29,\"4\",0,1,1,\"GOKUL\"\r\nTEXT 18,29,\"4\",0,1,1,\"GOKUL\"\r\n"), "{got}");
    assert!(got.contains("TEXT 48,74,\"2\",0,1,1,\"TEA THOOL 100G\"\r\n"), "{got}");
    assert!(got.contains("QRCODE 20,107,M,3,A,0,\"8906005666918\"\r\n"), "{got}");
    assert!(got.contains("\"Rs.35.00\"") && got.contains("BITMAP 93,120,2,20,0,"), "{got}");
    assert_eq!(got.matches("PRINT 1,1\r\n").count(), 1);
}

#[test]
fn dates_never_meet_gokul_and_never_leave_the_safe_box() {
    let spec = ribbon_spec();
    for (pkd, exp) in [("", ""), ("07/11/26", ""), ("07/11/26", "07/05/27"), ("31/12/26", "31/12/27")] {
        let mut l = tea();
        l.pack_date = pkd.into();
        l.best_before = exp.into();
        let els = layout_label(&spec, &ribbon_fields(), &l);
        let mut shop_right = 0;
        let mut dates_left = u32::MAX;
        for e in &els {
            let (x0, y0, x1, y1) = extent(e);
            assert!(x0 >= SAFE_DOTS && y0 >= SAFE_DOTS && x1 <= spec.cell_w() - SAFE_DOTS && y1 <= spec.cell_h() - SAFE_DOTS, "{e:?} leaves the safe box");
            if let El::Text { text, font, .. } = e {
                if text == "GOKUL" {
                    shop_right = shop_right.max(x1);
                }
                if text.starts_with("Pkd:") || text.starts_with("Exp:") {
                    assert_eq!(*font, 1);
                    dates_left = dates_left.min(x0);
                }
            }
        }
        assert!(shop_right + 8 <= dates_left, "GOKUL ends at {shop_right}, dates start at {dates_left}");
    }
}

#[test]
fn content_is_spread_evenly_down_the_safe_box() {
    let spec = ribbon_spec();
    let els = layout_label(&spec, &ribbon_fields(), &tea());
    let (mut top, mut bottom) = (u32::MAX, 0);
    for e in &els {
        let (_, y0, _, y1) = extent(e);
        top = top.min(y0);
        bottom = bottom.max(y1);
    }
    let above = top - SAFE_DOTS;
    let below = spec.cell_h() - SAFE_DOTS - bottom;
    assert!(above.abs_diff(below) <= 2, "above {above}, below {below}");
}

#[test]
fn alignment_moves_every_element_and_pitch_moves_later_columns() {
    let mut spec = ribbon_spec();
    let t = tea();
    let plain = job(&spec, &ribbon_fields(), &[t.clone(), t.clone(), t.clone()]);
    spec.align_x_mm = 1.5;
    spec.align_y_mm = -1.0;
    spec.pitch_adjust_mm = 0.5;
    let moved = job(&spec, &ribbon_fields(), &[t.clone(), t.clone(), t]);
    // +1.5 mm = +12 dots right, -1 mm = -8 dots up; column 2 also +0.5 mm = 4 dots, column 3 8 dots
    assert!(moved.contains("TEXT 28,21,\"4\",0,1,1,\"GOKUL\""), "{moved}");
    assert!(moved.contains("TEXT 312,21,\"4\""), "{moved}");
    assert!(moved.contains("TEXT 596,21,\"4\""), "{moved}");
    assert!(plain.contains("TEXT 16,29,\"4\"") && !plain.contains("TEXT 28,21"));
    assert_eq!((spec.shift_x(0), spec.shift_x(1), spec.shift_x(2), spec.shift_y()), (12, 296, 580, -8));
    assert_eq!(mm_dots(0.5), 4);
    assert_eq!(round_align_mm(1.3), 1.5);
    assert_eq!(round_align_mm(9.0), 4.0);
    assert!((pitch_from_readings(0.0, 1.0, 3) - 0.5).abs() < 1e-9);
    assert_eq!(pitch_from_readings(1.0, 1.0, 3), 0.0);
}

#[test]
fn pull_back_setting_controls_the_job_start() {
    let mut spec = ribbon_spec();
    spec.pull_back_mm = 13.0;
    let on = job(&spec, &ribbon_fields(), &[tea()]);
    assert!(on.contains("SET TEAR ON\r\nSET REPRINT OFF\r\nBACKFEED 104\r\nCODEPAGE 437\r\n"), "{on}");
    // the pull-back is before the first CLS, so before anything is drawn
    assert!(on.find("BACKFEED").unwrap() < on.find("CLS").unwrap());
    spec.pull_back = false;
    let off = job(&spec, &ribbon_fields(), &[tea()]);
    assert!(!off.contains("BACKFEED") && !off.contains("SET TEAR") && !off.contains("REPRINT"), "{off}");
}

fn forbidden_free(job: &str) {
    for bad in ["GAPDETECT", "AUTODETECT", "SELFTEST", "FORMFEED", "HOME"] {
        assert!(!job.contains(bad), "{bad} must never be sent: {job}");
    }
    assert_eq!(job.matches("PRINT 1,1\r\n").count(), 1, "exactly one PRINT 1,1");
    assert_eq!(job.matches("
PRINT ").count(), 1);
}

#[test]
fn calibration_row_is_one_print_with_pull_back_and_rulers() {
    let spec = ribbon_spec();
    let measure = String::from_utf8_lossy(&render_calibration_job(&spec, false)).into_owned();
    forbidden_free(&measure);
    // the measuring row backs up 4 mm (32 dots) more than a normal job: 96 + 32
    assert!(measure.starts_with("SIZE 103 mm,25 mm\r\n") && measure.contains("SET TEAR ON\r\nSET REPRINT OFF\r\nBACKFEED 128\r\nCODEPAGE 437\r\nCLS\r\n"), "{measure}");
    // the intended top edge of each sticker is a bar 2 dots thick at y = 32 across the cell
    assert!(measure.contains("BAR 0,32,264,2\r\n") && measure.contains("BAR 280,32,264,2\r\n") && measure.contains("BAR 560,32,264,2\r\n"), "{measure}");
    for c in 0..3 {
        let (_, _, els) = calibration_cell(&spec, c, false);
        let digits: Vec<String> = els.iter().filter_map(|e| if let El::Text { text, font: 1, .. } = e { Some(text.clone()) } else { None }).filter(|t| t.len() == 1).collect();
        for d in ["0", "1", "2", "3", "4"] {
            assert!(digits.iter().any(|x| x == d), "ruler digit {d} missing on column {c}");
        }
    }
    let verify = String::from_utf8_lossy(&render_calibration_job(&spec, true)).into_owned();
    forbidden_free(&verify);
    assert!(verify.contains("BACKFEED 96\r\n") && verify.contains("BOX 0,0,263,199,2\r\n") && verify.contains("BOX 16,16,247,183,1\r\n"), "{verify}");
    // a saved correction moves the verify row, not the measuring row
    let mut moved = spec.clone();
    moved.align_x_mm = 2.0;
    assert_eq!(render_calibration_job(&moved, false), render_calibration_job(&spec, false));
    assert_ne!(render_calibration_job(&moved, true), render_calibration_job(&spec, true));
}

#[test]
fn every_ribbon_job_is_free_of_forbidden_commands() {
    let spec = ribbon_spec();
    let t = tea();
    forbidden_free(&job(&spec, &ribbon_fields(), &[t.clone(), t.clone(), t]));
}

#[test]
fn rupee_picture_is_a_clean_rupee_shape() {
    let mut spec = ribbon_spec();
    spec.rupee = Rupee::Symbol;
    let f = Fields { price: true, ..Default::default() };
    let els = layout_label(&spec, &f, &lab_price(100));
    let Some(El::Bitmap { rows, .. }) = els.iter().find(|e| matches!(e, El::Bitmap { .. })).cloned() else { panic!("no rupee") };
    // two bars across the top (rows 0-1 and 5-6 inked from dot 1 to 14), then a leg that reaches the bottom row on the right
    for r in [0usize, 1, 5, 6] {
        assert_eq!(&rows[r], "0111111111111110", "row {r}");
    }
    assert!(rows[19][10..].contains('1'));
    assert!(rows[19][..3].chars().all(|c| c == '0'), "the leg leaves the left side clear at the bottom");
}
