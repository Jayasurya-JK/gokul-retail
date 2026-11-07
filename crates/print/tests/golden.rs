//! Golden bytes and layout rules for the ESC/POS builder.
use gokul_print::doc::{Doc, Op, Style};
use gokul_print::escpos::{self, decode_to_text, Options};
use gokul_print::layout::{layout, to_text, wrap, Item, Paper};

fn sample() -> Doc {
    let mut d = Doc::new();
    d.text("GOKUL OILS", Style::NORMAL.bold().big().center());
    d.text("Wood Pressed Groundnut Oil 1 Litre Pet Bottle Premium Quality", Style::NORMAL.bold());
    d.pair("  2 x 360.00 (5%)", "720.00");
    d.pair_styled("TOTAL", "Rs 720.00", Style::NORMAL.bold().big());
    d.push(Op::Cut);
    d
}

#[test]
fn golden_bytes_at_48_columns() {
    let items = layout(&sample(), Paper::Mm80);
    let bytes = escpos::render(&items, &Options { paper: Paper::Mm80, logo: None, feed_before_cut: 2 });
    let mut want: Vec<u8> = vec![0x1B, 0x40, 0x1B, 0x74, 0x00];
    // big + bold line, centred inside 24 columns: (24-10)/2 = 7 spaces
    want.extend([0x1B, 0x45, 1, 0x1D, 0x21, 0x11]);
    want.extend(b"       GOKUL OILS\n");
    want.extend([0x1D, 0x21, 0x00]);
    want.extend(b"Wood Pressed Groundnut Oil 1 Litre Pet Bottle\nPremium Quality\n");
    want.extend([0x1B, 0x45, 0]);
    want.extend(b"  2 x 360.00 (5%)                         720.00\n");
    // TOTAL in double size: 24 columns, value right-aligned
    want.extend([0x1B, 0x45, 1, 0x1D, 0x21, 0x11]);
    want.extend(b"TOTAL          Rs 720.00
");
    want.extend([0x1B, 0x45, 0x00, 0x1D, 0x21, 0x00]);
    want.extend([0x0A, 0x0A, 0x1D, 0x56, 0x01]);
    assert_eq!(String::from_utf8_lossy(&bytes), String::from_utf8_lossy(&want));
    assert_eq!(bytes, want);
}

#[test]
fn golden_text_at_32_columns() {
    let t = to_text(&layout(&sample(), Paper::Mm58));
    let want = "   GOKUL OILS\nWood Pressed Groundnut Oil 1\nLitre Pet Bottle Premium Quality\n  2 x 360.00 (5%)         720.00\nTOTAL  Rs 720.00\n[ - - - cut - - - ]\n";
    assert_eq!(t, want);
    for l in t.lines().filter(|l| !l.starts_with('[')) {
        assert!(l.chars().count() <= 32, "{l:?}");
    }
}

#[test]
fn long_names_wrap_and_tamil_degrades_to_question_marks() {
    let w = wrap("Supercalifragilisticexpialidocious-Groundnut-Oil", 20);
    assert!(w.iter().all(|l| l.chars().count() <= 20), "{w:?}");
    assert_eq!(w.concat(), "Supercalifragilisticexpialidocious-Groundnut-Oil");
    let tamil = wrap("கடலை எண்ணெய் 1 லிட்டர்", 16);
    assert!(tamil.iter().all(|l| l.is_ascii() && l.chars().count() <= 16), "{tamil:?}");
    // a long left text still keeps the amount on the last line, right-aligned
    let mut d = Doc::new();
    d.pair("A very long item description that needs to wrap over lines", "1,234.50");
    let items = layout(&d, Paper::Mm58);
    let Item::Line { text, .. } = items.last().unwrap() else { panic!() };
    assert_eq!(text.chars().count(), 32);
    assert!(text.ends_with("1,234.50"));
}

#[test]
fn qr_barcode_and_decode_round_trip() {
    let mut d = Doc::new();
    d.push(Op::Qr("upi://pay?pa=a@b".into()));
    d.push(Op::Barcode("GK-26-000001".into()));
    d.push(Op::Drawer);
    let bytes = escpos::render(&layout(&d, Paper::Mm80), &Options::new(Paper::Mm80));
    let t = decode_to_text(&bytes);
    assert!(t.contains("[qr upi://pay?pa=a@b]") && t.contains("[barcode GK-26-000001]") && t.contains("[drawer]"), "{t}");
}

#[test]
fn logo_is_one_bit_and_cached() {
    let a = gokul_print::logo::cached(None, 200).unwrap();
    let b = gokul_print::logo::cached(None, 200).unwrap();
    assert!(std::sync::Arc::ptr_eq(&a, &b), "second call comes from the cache");
    assert_eq!(a.width, 200);
    assert_eq!(a.data.len(), a.row_bytes() * a.height as usize);
    let black = (0..a.height).flat_map(|y| (0..a.width).map(move |x| (x, y))).filter(|&(x, y)| a.black(x, y)).count();
    assert!(black > 500 && black < (a.width * a.height) as usize / 2 + 8000, "black dots: {black}");
    let t = std::time::Instant::now();
    let _ = escpos::render(&[Item::Logo], &Options { paper: Paper::Mm80, logo: Some(&a), feed_before_cut: 0 });
    assert!(t.elapsed().as_millis() < 20);
}

#[test]
fn code128_table_is_complete() {
    let m = gokul_print::gdi::code128_modules("GK-1");
    // start + 4 chars + checksum = 6 symbols of 11 modules, stop = 13
    assert_eq!(m.len(), 6 * 11 + 13);
}

#[test]
fn spooler_lists_and_reports_missing_printers() {
    assert_eq!(gokul_print::printer_state("No Such Printer 9000"), gokul_print::PrinterState::NotFound);
    assert!(gokul_print::printer_state("FILE:x").is_ready());
    let _ = gokul_print::list_printers(); // must not crash even with no printers
}
