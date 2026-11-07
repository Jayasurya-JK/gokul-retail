//! Tamil text is drawn with a Windows font into a 1-bit picture (Windows only; skipped when no Tamil font is installed).
use gokul_print::doc::Align;
use gokul_print::tamil;

#[test]
fn tamil_tagline_renders_to_a_1_bit_picture_and_is_cached() {
    let text = "வாகை மரச்செக்கு எண்ணெய்";
    let Some(r) = tamil::render(text, 576, 24, true, Align::Center) else {
        eprintln!("no Tamil font or not Windows: skipped");
        return;
    };
    assert_eq!(r.width, 576);
    assert!(r.height >= 20 && r.height < 80, "one line: {}", r.height);
    let black: u32 = r.data.iter().map(|b| b.count_ones()).sum();
    assert!(black > 400, "something was drawn: {black}");
    // centred: both margins are empty and the text sits in the middle
    let (mut min_x, mut max_x) = (u32::MAX, 0);
    for y in 0..r.height {
        for x in 0..r.width {
            if r.black(x, y) {
                min_x = min_x.min(x);
                max_x = max_x.max(x);
            }
        }
    }
    assert!(min_x > 40 && max_x < 536, "{min_x}..{max_x}");
    assert!(((min_x + max_x) as i32 / 2 - 288).abs() < 12, "centred");
    let again = tamil::render(text, 576, 24, true, Align::Center).unwrap();
    assert!(std::sync::Arc::ptr_eq(&r, &again), "second call comes from the cache");
    // a long line wraps into more lines
    let long = tamil::render(&format!("{text} {text} {text}"), 576, 24, false, Align::Left).unwrap();
    assert!(long.height > r.height);
    // the rupee sign is in the font too
    assert!(tamil::render("NET AMOUNT \u{20b9} : 460.00", 576, 38, true, Align::Left).is_some());
}
