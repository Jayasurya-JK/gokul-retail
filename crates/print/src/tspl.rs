//! TSPL / TSPL2 label printing for the barcode sticker printer (TSC TE244 and the other TSC / TVS / Godex style printers).
//!
//! `layout_label` puts one label's fields at exact dot positions (203 dpi, 8 dots per millimetre). The SAME element list
//! drives the TSPL commands (`render_job`) and the on-screen preview in Gokul Office, so the screen shows what the
//! sticker will carry. All coordinates are in dots, from the top-left corner of one label.
//!
//! Only built-in printer fonts 1 to 5 are used (8x12, 12x20, 16x24, 24x32, 32x48 dots), so no font download is needed.

use crate::barcode::{code128_modules, code128_runs, ean13_modules, is_ean13, rects_from_runs, runs_from_modules};
use serde::Serialize;

/// Dots per millimetre at 203 dpi.
pub const DPM: f64 = 8.0;
/// The TE244 prints 104 mm across (832 dots at 203 dpi).
pub const MAX_WIDTH_MM: f64 = 104.0;
/// The safe margin inside every sticker: 2 mm (16 dots) on all four sides. Nothing is drawn outside it, so a 1 mm feed or
/// side error on the roll cannot clip the content (see the `every_column_stays_inside_the_safe_margin` test).
pub const SAFE_DOTS: u32 = 16;

pub fn dots(mm: f64) -> u32 {
    (mm * DPM).round().max(0.0) as u32
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Preset {
    pub id: &'static str,
    pub label: &'static str,
    pub width: f64,
    pub height: f64,
    pub gap: f64,
    pub columns: u32,
    pub col_gap: f64,
}

/// Ready sizes. The Gokul 3-up is the shop's ribbon sticker: 33 x 25 mm, three across with a 2 mm gap (103 mm of the 104 mm
/// print width of the TE244). Its id stays "32x25-3up" because saved settings use it; the size is 33 mm wide.
pub const PRESETS: [Preset; 5] = [
    Preset { id: "gokul-small", label: "Gokul small 38 x 25 mm (QR)", width: 38.0, height: 25.0, gap: 3.0, columns: 1, col_gap: 0.0 },
    Preset { id: "50x25", label: "50 x 25 mm, 1 across", width: 50.0, height: 25.0, gap: 3.0, columns: 1, col_gap: 0.0 },
    Preset { id: "38x25-2up", label: "38 x 25 mm, 2 across", width: 38.0, height: 25.0, gap: 3.0, columns: 2, col_gap: 3.0 },
    Preset { id: "32x25-3up", label: "Gokul 3-up (33x25)", width: 33.0, height: 25.0, gap: 3.0, columns: 3, col_gap: 2.0 },
    Preset { id: "100x50", label: "100 x 50 mm, 1 across", width: 100.0, height: 50.0, gap: 3.0, columns: 1, col_gap: 0.0 },
];

pub fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

/// Which sticker design a size uses. `Plain` is the generic layout; the two Gokul designs are the shop's own stickers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    Plain,
    /// The 38 x 25 mm sticker: GOKUL, name, QR of the code, code, price, Pkd and Exp.
    GokulSmall,
    /// The 33 x 25 mm ribbon sticker (Gokul 3-up): GOKUL and Pkd / Exp on top, name, then QR, rupee price and code in one block.
    GokulRibbon,
}

/// How the rupee sign is printed before the price (the printer's fonts have no rupee glyph).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rupee {
    /// A 1-bit picture of the rupee sign, then "Rs." and the amount.
    Both,
    /// Only the picture of the rupee sign, then the amount.
    Symbol,
    /// Text only, "Rs." and the amount.
    Text,
}

/// The sticker roll and printer tuning for one job.
#[derive(Debug, Clone, PartialEq)]
pub struct Spec {
    /// One label's width and height in mm.
    pub width: f64,
    pub height: f64,
    /// Gap between labels down the roll (mm).
    pub gap: f64,
    /// Labels across the roll and the gap between them (mm).
    pub columns: u32,
    pub col_gap: f64,
    /// 0 to 15, 8 is the printer's usual.
    pub darkness: u8,
    /// Inches per second, 2 to 6.
    pub speed: u8,
    /// Calibration shift in dots (positive = right / down).
    pub dx: i32,
    pub dy: i32,
    /// Turn the print 180 degrees (labels coming out upside down).
    pub flip: bool,
    /// Which sticker design to draw (the Gokul designs use the QR field and blank Pkd / Exp unless dates are given).
    pub style: Style,
    /// Ribbon (thermal transfer) printing: `SET RIBBON ON`. Off is direct thermal paper.
    pub ribbon: bool,
    /// How the rupee sign is printed on the Gokul 3-up sticker.
    pub rupee: Rupee,
    /// Extra left start in mm (0 to 5): the Gokul 3-up content starts this much further in from the left edge. 0 by default.
    pub start_mm: f64,
}

impl Spec {
    pub fn from_preset(p: &Preset) -> Spec {
        let style = match p.id {
            "gokul-small" => Style::GokulSmall,
            "32x25-3up" => Style::GokulRibbon,
            _ => Style::Plain,
        };
        Spec {
            width: p.width, height: p.height, gap: p.gap, columns: p.columns, col_gap: p.col_gap, darkness: 8, speed: 4, dx: 0, dy: 0, flip: false,
            style, ribbon: true, rupee: Rupee::Both, start_mm: 0.0,
        }
    }
    /// True for the shop's own stickers (Gokul small and Gokul 3-up).
    pub fn is_gokul(&self) -> bool {
        self.style != Style::Plain
    }
    pub fn cell_w(&self) -> u32 {
        dots(self.width)
    }
    pub fn cell_h(&self) -> u32 {
        dots(self.height)
    }
    pub fn col_x(&self, c: u32) -> u32 {
        c * (dots(self.width) + dots(self.col_gap))
    }
    pub fn total_width_mm(&self) -> f64 {
        self.width * self.columns.max(1) as f64 + self.col_gap * (self.columns.max(1) - 1) as f64
    }
    pub fn validate(&self) -> Result<(), String> {
        if !(10.0..=MAX_WIDTH_MM).contains(&self.width) || !(10.0..=300.0).contains(&self.height) {
            return Err("the label size is not sensible (width 10 to 104 mm, height 10 to 300 mm)".into());
        }
        if self.columns == 0 || self.columns > 6 {
            return Err("labels across must be 1 to 6".into());
        }
        if !(0.0..=30.0).contains(&self.gap) || !(0.0..=30.0).contains(&self.col_gap) {
            return Err("the gap between labels must be 0 to 30 mm".into());
        }
        if self.total_width_mm() > MAX_WIDTH_MM + 0.01 {
            return Err(format!("{} labels across need {:.0} mm but the printer prints at most {:.0} mm", self.columns, self.total_width_mm(), MAX_WIDTH_MM));
        }
        Ok(())
    }
}

/// Which fields appear on the sticker.
#[derive(Debug, Clone, PartialEq)]
pub struct Fields {
    pub shop: bool,
    pub name: bool,
    pub mrp: bool,
    pub price: bool,
    pub barcode: bool,
    pub dates: bool,
    pub batch: bool,
    pub net: bool,
    pub legal: bool,
    pub qr: bool,
}

impl Default for Fields {
    fn default() -> Self {
        Fields { shop: false, name: true, mrp: true, price: true, barcode: true, dates: true, batch: false, net: false, legal: false, qr: false }
    }
}

/// The values for one sticker (already formatted by the caller except money, which is paise).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Label {
    pub shop: String,
    pub name: String,
    pub mrp: i64,
    pub price: i64,
    /// "" for pieces, "/kg" or "/L" for loose items.
    pub per: String,
    pub barcode: String,
    pub code: String,
    pub pack_date: String,
    pub best_before: String,
    pub batch: String,
    pub net_qty: String,
    /// Legal Metrology line (maker, address, FSSAI, "inclusive of all taxes").
    pub legal: String,
    /// Text before the price on the Gokul sticker ("Rs." by default; the printer cannot print the rupee sign).
    pub price_prefix: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "k", rename_all = "camelCase")]
pub enum El {
    /// Printer font 1 to 5 with width / height multipliers.
    Text { x: u32, y: u32, font: u8, xm: u8, ym: u8, text: String },
    /// `kind` is "128" or "EAN13"; `rects` are the bars (x offset from `x`, width) for the preview.
    Barcode { x: u32, y: u32, h: u32, kind: String, data: String, narrow: u32, w: u32, rects: Vec<(u32, u32)> },
    /// `rows` are the modules ('1' dark) for the preview; the printer builds its own code from `data`.
    Qr { x: u32, y: u32, cell: u32, data: String, size: u32, rows: Vec<String> },
    /// A filled bar.
    Bar { x: u32, y: u32, w: u32, h: u32 },
    /// An outline of line width `t`.
    Frame { x: u32, y: u32, w: u32, h: u32, t: u32 },
    /// A 1-bit picture `w` dots wide; `rows` are the dots ('1' = ink) for the preview, the printer gets them as bytes.
    Bitmap { x: u32, y: u32, w: u32, rows: Vec<String> },
}

/// The rupee sign: an 8 x 10 design ('1' = ink) drawn at 2 x 2 dots per cell, so the strokes are 2 dots thick and clean (no
/// dithering). The result is 16 x 20 dots, the cap height of the 16 x 24 printer font the price uses. It is sent as a TSPL BITMAP
/// because the built-in fonts have no rupee glyph.
const RUPEE_DESIGN: [&str; 10] = [
    "11111110",
    "10000011",
    "10000011",
    "11111110",
    "10001100",
    "10000110",
    "11111111",
    "10000011",
    "11111111",
    "10000000",
];
const RUPEE_W: u32 = 16;
const RUPEE_H: u32 = 20;
/// One small space between the rupee picture and the text after it.
const RUPEE_GAP: u32 = 6;

fn rupee_rows() -> Vec<String> {
    RUPEE_DESIGN
        .iter()
        .flat_map(|r| {
            let wide: String = r.chars().flat_map(|c| [c, c]).collect();
            [wide.clone(), wide]
        })
        .collect()
}

fn rupee_el(x: u32, y: u32) -> El {
    El::Bitmap { x, y, w: RUPEE_W, rows: rupee_rows() }
}

pub fn font_size(font: u8) -> (u32, u32) {
    match font {
        1 => (8, 12),
        2 => (12, 20),
        3 => (16, 24),
        4 => (24, 32),
        _ => (32, 48),
    }
}

/// Printer text is plain ASCII: anything else becomes `?`; a double quote would end the TSPL string.
pub fn ascii(s: &str) -> String {
    s.chars().map(|c| if c == '"' { '\'' } else if (' '..='~').contains(&c) { c } else { '?' }).collect()
}

/// Fits `text` into `max_lines` lines of `width` characters, breaking at spaces; the last line ends in ".." when cut.
pub fn wrap(text: &str, width: usize, max_lines: usize) -> Vec<String> {
    if width == 0 || max_lines == 0 {
        return vec![];
    }
    let text = ascii(text);
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in text.split_whitespace() {
        let mut w = word.to_string();
        while w.chars().count() > width {
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            lines.push(w.chars().take(width).collect());
            w = w.chars().skip(width).collect();
        }
        if w.is_empty() {
            continue;
        }
        if cur.is_empty() {
            cur = w;
        } else if cur.chars().count() + 1 + w.chars().count() <= width {
            cur.push(' ');
            cur.push_str(&w);
        } else {
            lines.push(std::mem::take(&mut cur));
            cur = w;
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    if lines.len() > max_lines {
        lines.truncate(max_lines);
        let last = lines.last_mut().unwrap();
        let keep = width.saturating_sub(2);
        let mut cut: String = last.chars().take(keep).collect();
        while cut.ends_with(' ') {
            cut.pop();
        }
        cut.push_str("..");
        *last = cut;
    }
    lines
}

/// 59000 -> "590", 59050 -> "590.50".
pub fn rs(p: i64) -> String {
    if p % 100 == 0 {
        (p / 100).to_string()
    } else {
        format!("{}.{:02}", p / 100, (p % 100).abs())
    }
}

fn text_w(text: &str, font: u8, mul: u8) -> u32 {
    text.chars().count() as u32 * font_size(font).0 * mul as u32
}
fn text_h(font: u8, mul: u8) -> u32 {
    font_size(font).1 * mul as u32
}
fn line_h(font: u8, mul: u8) -> u32 {
    text_h(font, mul) + 3
}

struct Pick {
    kind: &'static str,
    data: String,
    narrow: u32,
    modules: u32,
    runs: Vec<u8>,
}

/// The barcode the label will carry: the item barcode, else the shop code. A real EAN-13 is drawn as EAN-13, everything
/// else as Code 128. The widest bars that fit are used (never below 1 dot).
fn pick_barcode(l: &Label, space: u32, max_narrow: u32) -> Option<Pick> {
    for data in [l.barcode.trim(), l.code.trim()] {
        if data.is_empty() {
            continue;
        }
        let (kind, modules, quiet, runs): (&'static str, u32, u32, Vec<u8>) = if is_ean13(data) {
            let m = ean13_modules(data)?;
            ("EAN13", 95, 18, runs_from_modules(&m))
        } else if let (Some(m), Some(r)) = (code128_modules(data), code128_runs(data)) {
            ("128", m, 20, r)
        } else {
            continue;
        };
        for n in (1..=max_narrow).rev() {
            if (modules + quiet) * n <= space {
                return Some(Pick { kind, data: data.to_string(), narrow: n, modules, runs });
            }
        }
    }
    None
}

#[derive(Clone, Copy)]
struct Plan {
    legal: bool,
    shop: bool,
    human: bool,
    bar_min: u32,
    name_lines: usize,
    line_b: bool,
    line_a: bool,
}

/// 3800 -> "38.00".
pub fn rs2(p: i64) -> String {
    format!("{}.{:02}", p / 100, (p % 100).abs())
}

/// The shop's small sticker (see the owner's photo): SHOP, ITEM NAME, then a QR of the item code on the left and on the right
/// the code, the price and blank "Pkd:" / "Exp:" lines (filled when dates are given).
fn layout_gokul(spec: &Spec, f: &Fields, l: &Label) -> Vec<El> {
    let (cw, ch) = (spec.cell_w(), spec.cell_h());
    let (padx, pady) = (12u32, 8u32);
    let avail_w = cw.saturating_sub(2 * padx);
    let mut els = Vec::new();
    let mut y = pady;
    if f.shop && !l.shop.trim().is_empty() {
        if let Some(t) = wrap(&l.shop.to_uppercase(), (avail_w / font_size(4).0) as usize, 1).into_iter().next() {
            els.push(El::Text { x: padx, y, font: 4, xm: 1, ym: 1, text: t });
            y += 36;
        }
    }
    if f.name {
        let name = l.name.replace(" (Loose)", "").to_uppercase();
        if let Some(t) = wrap(&name, (avail_w / font_size(2).0) as usize, 1).into_iter().next() {
            els.push(El::Text { x: padx, y, font: 2, xm: 1, ym: 1, text: t });
            y += 26;
        }
    }
    let src = [l.code.trim(), l.barcode.trim()].into_iter().find(|s| !s.is_empty()).unwrap_or("").to_string();
    let body_h = ch.saturating_sub(pady + y);
    let mut tx = padx;
    if let Ok(code) = qrcode::QrCode::with_error_correction_level(src.as_bytes(), qrcode::EcLevel::M) {
        let size = code.width() as u32;
        let cell = (body_h / size).min((avail_w * 55 / 100) / size).clamp(1, 6);
        let colors = code.to_colors();
        let rows = (0..size as usize)
            .map(|r| (0..size as usize).map(|c| if colors[r * size as usize + c] == qrcode::Color::Dark { '1' } else { '0' }).collect::<String>())
            .collect();
        els.push(El::Qr { x: padx, y, cell, data: src.clone(), size, rows });
        tx = padx + size * cell + 10;
    }
    let tw = cw.saturating_sub(tx + 6);
    let mut rows: Vec<(u8, String)> = vec![(3, src.clone())];
    if f.price {
        let pre = if l.price_prefix.is_empty() { "Rs." } else { l.price_prefix.as_str() };
        rows.push((3, format!("{}{}{}", pre, rs2(l.price), l.per)));
    }
    if f.dates {
        rows.push((2, format!("Pkd:{}", l.pack_date)));
        rows.push((2, format!("Exp:{}", l.best_before)));
    }
    // on a short label the last rows are dropped rather than run off the sticker
    while rows.len() > 1 && rows.iter().map(|(fo, _)| font_size(*fo).1).sum::<u32>() > body_h {
        rows.pop();
    }
    let used: u32 = rows.iter().map(|(fo, _)| font_size(*fo).1).sum();
    let gap = if rows.len() > 1 { ((body_h.saturating_sub(used)) / (rows.len() as u32 - 1)).min(8) } else { 0 };
    let mut ry = y;
    for (font, text) in rows {
        let cols = (tw / font_size(font).0) as usize;
        if let Some(t) = wrap(&text, cols, 1).into_iter().next() {
            els.push(El::Text { x: tx, y: ry, font, xm: 1, ym: 1, text: t });
        }
        ry += font_size(font).1 + gap;
    }
    els
}

/// The rows and modules of the QR code of `src` (error correction M): the module count and '1' for each dark module.
fn qr_matrix(src: &str) -> Option<(u32, Vec<String>)> {
    let code = qrcode::QrCode::with_error_correction_level(src.as_bytes(), qrcode::EcLevel::M).ok()?;
    let size = code.width();
    let colors = code.to_colors();
    let rows = (0..size)
        .map(|r| (0..size).map(|c| if colors[r * size + c] == qrcode::Color::Dark { '1' } else { '0' }).collect::<String>())
        .collect();
    Some((size as u32, rows))
}

/// The Gokul 3-up sticker (33 x 25 mm, ribbon printing). Everything is inside the 2 mm safe margin:
/// row 1: GOKUL in bold on the left, "Pkd:" and "Exp:" in the small font on the right (blank unless dates were given);
/// row 2: the item name in capitals, centred;
/// row 3: one block, centred in the space left: the QR of the item code (63 dots for the usual 13 digit code), and to its
/// right the rupee picture and the price, with the code number under them. Nothing is drawn below the block.
fn layout_ribbon(spec: &Spec, f: &Fields, l: &Label) -> Vec<El> {
    let cw = spec.cell_w();
    let top = SAFE_DOTS;
    let bottom = spec.cell_h().saturating_sub(SAFE_DOTS);
    let left = SAFE_DOTS + dots(spec.start_mm);
    let right = cw.saturating_sub(SAFE_DOTS);
    let avail_w = right.saturating_sub(left);
    let src = [l.barcode.trim(), l.code.trim()].into_iter().find(|s| !s.is_empty()).unwrap_or("").to_string();
    let mut els = Vec::new();

    // row 1, right: Pkd and Exp in the small font, right aligned to the margin
    let pkd: Vec<String> = if f.dates { vec![ascii(&format!("Pkd:{}", l.pack_date)), ascii(&format!("Exp:{}", l.best_before))] } else { vec![] };
    let dates_w = pkd.iter().map(|t| text_w(t, 1, 1)).max().unwrap_or(0);
    let dates_h = if pkd.is_empty() { 0 } else { 26 };
    for (i, t) in pkd.iter().enumerate() {
        let x = right.saturating_sub(text_w(t, 1, 1));
        els.push(El::Text { x, y: top + i as u32 * 14, font: 1, xm: 1, ym: 1, text: t.clone() });
    }

    // row 1, left: GOKUL in the biggest printer font that fits beside the dates, printed twice 2 dots apart so it looks bold
    let mut top_h = 0;
    if f.shop && !l.shop.trim().is_empty() {
        let room = avail_w.saturating_sub(dates_w + 10);
        let shop = ascii(&l.shop.to_uppercase());
        let (fo, cols) = [4u8, 3, 2]
            .into_iter()
            .map(|fo| (fo, (room / font_size(fo).0) as usize))
            .find(|(_, c)| shop.chars().count() <= *c)
            .unwrap_or((1, (room / font_size(1).0) as usize));
        if let Some(t) = wrap(&shop, cols, 1).into_iter().next() {
            els.push(El::Text { x: left, y: top, font: fo, xm: 1, ym: 1, text: t.clone() });
            els.push(El::Text { x: left + 2, y: top, font: fo, xm: 1, ym: 1, text: t });
            top_h = font_size(fo).1;
        }
    }
    let mut y = top + top_h.max(dates_h) + 4;

    // row 2: the item name in capitals, centred: the 12 x 20 font, cut with ".." when it is too long
    if f.name {
        let name = ascii(&l.name.replace(" (Loose)", "").to_uppercase());
        let cols = (avail_w / font_size(2).0) as usize;
        if let Some(t) = wrap(&name, cols, 1).into_iter().next() {
            let x = left + avail_w.saturating_sub(text_w(&t, 2, 1)) / 2;
            els.push(El::Text { x, y, font: 2, xm: 1, ym: 1, text: t });
            y += font_size(2).1 + 4;
        }
    }

    // row 3: the QR, then the price and the code, one block centred in the space above the bottom margin
    let slot_h = bottom.saturating_sub(y);
    let qr = if f.qr && !src.is_empty() { qr_matrix(&src) } else { None };
    let qr_cell = match &qr {
        Some((size, _)) => [3u32, 2, 1].into_iter().find(|c| size * c <= slot_h && size * c <= avail_w * 45 / 100).unwrap_or(1),
        None => 0,
    };
    let qr_w = qr.as_ref().map(|(size, _)| size * qr_cell).unwrap_or(0);
    let qr_gap = if qr_w > 0 { 10 } else { 0 };
    let col_max = avail_w.saturating_sub(qr_w + qr_gap);

    // the price: the rupee picture (if chosen), then "Rs.35.00", in the biggest font that fits beside the QR
    let prefix = if l.price_prefix.is_empty() { "Rs.".to_string() } else { l.price_prefix.clone() };
    let amount = format!("{}{}", rs2(l.price), l.per);
    let (price, glyph) = match spec.rupee {
        Rupee::Both => (format!("{prefix}{amount}"), true),
        Rupee::Symbol => (amount.clone(), true),
        Rupee::Text => (format!("{prefix}{amount}"), false),
    };
    let glyph_w = if glyph { RUPEE_W + RUPEE_GAP } else { 0 };
    let pf = [3u8, 2, 1].into_iter().find(|fo| glyph_w + text_w(&price, *fo, 1) <= col_max).unwrap_or(1);
    let price_txt = if f.price { wrap(&price, (col_max.saturating_sub(glyph_w) / font_size(pf).0) as usize, 1).into_iter().next() } else { None };
    let price_h = if price_txt.is_some() { font_size(pf).1 } else { 0 };
    let price_w = price_txt.as_ref().map(|t| glyph_w + text_w(t, pf, 1)).unwrap_or(0);

    // the code number under the price: the same value as the QR
    let code_txt = if f.barcode && !src.is_empty() { wrap(&src, (col_max / font_size(1).0) as usize, 1).into_iter().next() } else { None };
    let code_h = if code_txt.is_some() { font_size(1).1 } else { 0 };
    let code_w = code_txt.as_ref().map(|t| text_w(t, 1, 1)).unwrap_or(0);
    let gap_pc = if price_txt.is_some() && code_txt.is_some() { 4 } else { 0 };
    let col_w = price_w.max(code_w);
    let col_h = price_h + gap_pc + code_h;
    let gap = if qr_w > 0 && col_w > 0 { qr_gap } else { 0 };
    let block_w = qr_w + gap + col_w;
    let body_h = qr_w.max(col_h);
    let block_x = left + avail_w.saturating_sub(block_w) / 2;
    let body_y = y + slot_h.saturating_sub(body_h) / 2;
    if let Some((_, rows)) = qr {
        els.push(El::Qr { x: block_x, y: body_y, cell: qr_cell, data: src.clone(), size: rows.len() as u32, rows });
    }
    let cx = block_x + qr_w + gap;
    let mut ty = body_y + body_h.saturating_sub(col_h) / 2;
    if let Some(t) = &price_txt {
        if glyph {
            els.push(rupee_el(cx, ty + price_h.saturating_sub(RUPEE_H) / 2));
        }
        els.push(El::Text { x: cx + glyph_w, y: ty, font: pf, xm: 1, ym: 1, text: t.clone() });
        ty += price_h + gap_pc;
    }
    if let Some(t) = code_txt {
        els.push(El::Text { x: cx, y: ty, font: 1, xm: 1, ym: 1, text: t });
    }
    els
}

pub fn layout_label(spec: &Spec, f: &Fields, l: &Label) -> Vec<El> {
    if spec.style == Style::GokulSmall && f.qr {
        return layout_gokul(spec, f, l);
    }
    if spec.style == Style::GokulRibbon {
        return layout_ribbon(spec, f, l);
    }
    let cw = spec.cell_w();
    let ch = spec.cell_h();
    let big = ch >= 360;
    let (padx, pady) = if big { (20u32, 16u32) } else { (12, 8) };
    let mut avail_w = cw.saturating_sub(2 * padx);
    let avail_h = ch.saturating_sub(2 * pady);
    // name font, name size, small font, price font, price size, name lines
    let (nf, nm, sf, pf, pm, nlines): (u8, u8, u8, u8, u8, usize) = if big { (4, 1, 2, 5, 2, 3) } else { (2, 1, 1, 3, 1, 2) };
    let mut els: Vec<El> = Vec::new();

    // optional QR on the right: the printer's own QR of the barcode text
    let qr_src = [l.barcode.trim(), l.code.trim()].into_iter().find(|s| !s.is_empty()).unwrap_or("").to_string();
    let mut qr_el: Option<El> = None;
    if f.qr && !qr_src.is_empty() {
        if let Ok(code) = qrcode::QrCode::with_error_correction_level(qr_src.as_bytes(), qrcode::EcLevel::M) {
            let size = code.width() as u32;
            let cell = if big { 4 } else { 2 };
            let qw = size * cell;
            if avail_w >= qw + 8 + 120 {
                avail_w -= qw + 8;
                let colors = code.to_colors();
                let rows = (0..size as usize)
                    .map(|r| (0..size as usize).map(|c| if colors[r * size as usize + c] == qrcode::Color::Dark { '1' } else { '0' }).collect::<String>())
                    .collect();
                qr_el = Some(El::Qr { x: padx + avail_w + 8, y: pady, cell, data: qr_src.clone(), size, rows });
            }
        }
    }

    // content
    let name_text = l.name.replace(" (Loose)", "");
    let name_cols = (avail_w / (font_size(nf).0 * nm as u32)) as usize;
    let all_name = if f.name { wrap(&name_text, name_cols, nlines) } else { vec![] };
    let shop_text = if f.shop && !l.shop.trim().is_empty() { wrap(&l.shop.to_uppercase(), (avail_w / font_size(1).0) as usize, 1).first().cloned() } else { None };
    let space = if qr_el.is_some() { avail_w } else { (avail_w + 2 * padx).saturating_sub(8) };
    let bc = if f.barcode { pick_barcode(l, space, if big { 4 } else { 3 }) } else { None };

    let dates = if f.dates && !l.pack_date.is_empty() {
        Some(if l.best_before.is_empty() { format!("Pkd {}", l.pack_date) } else { format!("Pkd {}  BB {}", l.pack_date, l.best_before) })
    } else {
        None
    };
    let info_b = {
        let mut parts: Vec<String> = Vec::new();
        if f.net && !l.net_qty.trim().is_empty() {
            parts.push(format!("Net {}", l.net_qty.trim()));
        }
        if f.batch && !l.batch.trim().is_empty() {
            parts.push(format!("Batch {}", l.batch.trim()));
        }
        if parts.is_empty() {
            None
        } else {
            Some(parts.join("  "))
        }
    };
    let info_cols = (avail_w / font_size(sf).0) as usize;
    let dates = dates.and_then(|t| wrap(&t, info_cols, 1).into_iter().next());
    let info_b = info_b.and_then(|t| wrap(&t, info_cols, 1).into_iter().next());
    let legal_max = if big { 3 } else { 2 };
    let all_legal = if f.legal { wrap(&l.legal, (avail_w / font_size(1).0) as usize, legal_max) } else { vec![] };

    // price row: pieces of text, then whether they share a row
    let mrp_txt = format!("MRP Rs {}{}", rs(l.mrp), l.per);
    let price_txt = format!("Rs {}{}", rs(l.price), l.per);
    let mf: u8 = if big { 3 } else { 2 };
    enum PriceRow {
        None,
        One { text: String, font: u8, mul: u8 },
        Two { mrp: String, mrp_font: u8, price: String, font: u8, mul: u8 },
        Stack { mrp: String, mrp_font: u8, price: String, font: u8, mul: u8 },
    }
    let pick_single = |text: &str, avail: u32| -> (u8, u8) {
        for (fo, mu) in [(pf, pm), (pf, 1), (2u8, 1u8), (1, 1)] {
            if text_w(text, fo, mu) <= avail {
                return (fo, mu);
            }
        }
        (1, 1)
    };
    let price_row = match (f.mrp, f.price) {
        (true, true) if l.mrp != l.price => {
            let mut found = None;
            'outer: for (fo, mu) in [(pf, pm), (pf, 1), (2u8, 1u8)] {
                for mrp_font in [mf, 1u8] {
                    if text_w(&mrp_txt, mrp_font, 1) + 8 + text_w(&price_txt, fo, mu) <= avail_w {
                        found = Some((fo, mu, mrp_font));
                        break 'outer;
                    }
                }
            }
            match found {
                Some((fo, mu, mrp_font)) => PriceRow::Two { mrp: mrp_txt.clone(), mrp_font, price: price_txt.clone(), font: fo, mul: mu },
                None => {
                    let (fo, mu) = pick_single(&price_txt, avail_w);
                    let mrp_font = if text_w(&mrp_txt, mf, 1) <= avail_w { mf } else { 1 };
                    PriceRow::Stack { mrp: mrp_txt.clone(), mrp_font, price: price_txt.clone(), font: fo, mul: mu }
                }
            }
        }
        (true, true) | (true, false) => {
            let (fo, mu) = pick_single(&mrp_txt, avail_w);
            PriceRow::One { text: mrp_txt.clone(), font: fo, mul: mu }
        }
        (false, true) => {
            let (fo, mu) = pick_single(&price_txt, avail_w);
            PriceRow::One { text: price_txt.clone(), font: fo, mul: mu }
        }
        (false, false) => PriceRow::None,
    };
    let price_h = match &price_row {
        PriceRow::None => 0,
        PriceRow::One { font, mul, .. } => line_h(*font, *mul),
        PriceRow::Two { font, mul, mrp_font, .. } => line_h(*font, *mul).max(line_h(*mrp_font, 1)),
        PriceRow::Stack { font, mul, mrp_font, .. } => line_h(*font, *mul) + line_h(*mrp_font, 1),
    };

    // drop the least important things until everything fits
    let mut plan = Plan { legal: !all_legal.is_empty(), shop: shop_text.is_some(), human: true, bar_min: if big { 60 } else { 36 }, name_lines: all_name.len(), line_b: info_b.is_some(), line_a: dates.is_some() };
    let human_h = 12 + 3;
    let needed = |p: &Plan| -> u32 {
        let mut n = 0;
        if p.shop {
            n += 12 + 4;
        }
        n += p.name_lines as u32 * line_h(nf, nm);
        if bc.is_some() {
            n += p.bar_min + if p.human { human_h } else { 0 } + 4;
        }
        n += price_h;
        if p.line_a {
            n += line_h(sf, 1);
        }
        if p.line_b {
            n += line_h(sf, 1);
        }
        if p.legal {
            n += all_legal.len() as u32 * 14;
        }
        n
    };
    let steps: [fn(&mut Plan); 7] = [
        |p| p.legal = false,
        |p| p.shop = false,
        |p| p.human = false,
        |p| p.bar_min = p.bar_min * 3 / 4,
        |p| p.name_lines = p.name_lines.min(1),
        |p| p.line_b = false,
        |p| p.line_a = false,
    ];
    for s in steps {
        if needed(&plan) <= avail_h {
            break;
        }
        s(&mut plan);
    }
    let others = needed(&plan) - if bc.is_some() { plan.bar_min } else { 0 };
    let bar_cap = if big { 150 } else { 70 };
    let bar_h = if bc.is_some() { avail_h.saturating_sub(others).clamp(plan.bar_min.min(avail_h), bar_cap) } else { 0 };
    let used = others + bar_h;
    let slack = avail_h.saturating_sub(used);

    // place everything, top to bottom
    let mut y = pady;
    if let Some(e) = qr_el {
        els.push(e);
    }
    if plan.shop {
        if let Some(t) = &shop_text {
            let w = text_w(t, 1, 1);
            els.push(El::Text { x: padx + avail_w.saturating_sub(w) / 2, y, font: 1, xm: 1, ym: 1, text: t.clone() });
            y += 12 + 4;
        }
    }
    for line in all_name.iter().take(plan.name_lines) {
        els.push(El::Text { x: padx, y, font: nf, xm: nm, ym: nm, text: line.clone() });
        y += line_h(nf, nm);
    }
    if let Some(p) = &bc {
        let w = p.modules * p.narrow;
        let bx = padx + avail_w.saturating_sub(w) / 2;
        let rects = rects_from_runs(&p.runs, p.narrow);
        els.push(El::Barcode { x: bx, y, h: bar_h, kind: p.kind.to_string(), data: p.data.clone(), narrow: p.narrow, w, rects });
        y += bar_h;
        if plan.human {
            let t = ascii(&p.data);
            let t: String = if t.chars().count() as u32 * 8 > avail_w { t.chars().take((avail_w / 8) as usize).collect() } else { t };
            els.push(El::Text { x: padx + avail_w.saturating_sub(text_w(&t, 1, 1)) / 2, y: y + 2, font: 1, xm: 1, ym: 1, text: t });
            y += human_h;
        }
        y += 4;
    }
    y += slack;
    match &price_row {
        PriceRow::None => {}
        PriceRow::One { text, font, mul } => {
            els.push(El::Text { x: padx, y, font: *font, xm: *mul, ym: *mul, text: text.clone() });
            y += line_h(*font, *mul);
        }
        PriceRow::Two { mrp, mrp_font, price, font, mul } => {
            let rh = line_h(*font, *mul).max(line_h(*mrp_font, 1));
            els.push(El::Text { x: padx, y: y + rh - line_h(*mrp_font, 1), font: *mrp_font, xm: 1, ym: 1, text: mrp.clone() });
            let pw = text_w(price, *font, *mul);
            els.push(El::Text { x: padx + avail_w.saturating_sub(pw), y: y + rh - line_h(*font, *mul), font: *font, xm: *mul, ym: *mul, text: price.clone() });
            y += rh;
        }
        PriceRow::Stack { mrp, mrp_font, price, font, mul } => {
            els.push(El::Text { x: padx, y, font: *mrp_font, xm: 1, ym: 1, text: mrp.clone() });
            y += line_h(*mrp_font, 1);
            els.push(El::Text { x: padx, y, font: *font, xm: *mul, ym: *mul, text: price.clone() });
            y += line_h(*font, *mul);
        }
    }
    if plan.line_a {
        if let Some(t) = &dates {
            els.push(El::Text { x: padx, y, font: sf, xm: 1, ym: 1, text: t.clone() });
            y += line_h(sf, 1);
        }
    }
    if plan.line_b {
        if let Some(t) = &info_b {
            els.push(El::Text { x: padx, y, font: sf, xm: 1, ym: 1, text: t.clone() });
            y += line_h(sf, 1);
        }
    }
    if plan.legal {
        for line in &all_legal {
            els.push(El::Text { x: padx, y, font: 1, xm: 1, ym: 1, text: line.clone() });
            y += 14;
        }
    }
    els
}

/// A calibration label: frame at the label edge, a millimetre ruler, a cross at the centre and a scannable code.
pub fn test_label(spec: &Spec) -> Vec<El> {
    let cw = spec.cell_w();
    let ch = spec.cell_h();
    let mut els = vec![El::Frame { x: 0, y: 0, w: cw.saturating_sub(1).max(1), h: ch.saturating_sub(1).max(1), t: 2 }];
    // ruler along the top inside the frame: a tick every 5 mm, longer and numbered every 10 mm
    let mut mm = 0u32;
    while dots(mm as f64) + 4 < cw {
        let x = dots(mm as f64).max(4);
        let long = mm % 10 == 0;
        els.push(El::Bar { x, y: 4, w: 1, h: if long { 16 } else { 8 } });
        if long && mm > 0 && x + 20 < cw {
            els.push(El::Text { x: x + 2, y: 6, font: 1, xm: 1, ym: 1, text: mm.to_string() });
        }
        mm += 5;
    }
    let cx = cw / 2;
    let cy = ch / 2;
    els.push(El::Bar { x: cx.saturating_sub(15), y: cy, w: 30, h: 1 });
    els.push(El::Bar { x: cx, y: cy.saturating_sub(15), w: 1, h: 30 });
    els.push(El::Text { x: 10, y: 28, font: 2, xm: 1, ym: 1, text: "GOKUL LABEL TEST".into() });
    let size_line = format!("{}x{} mm, {} across", fmt_mm(spec.width), fmt_mm(spec.height), spec.columns.max(1));
    els.push(El::Text { x: 10, y: 52, font: 1, xm: 1, ym: 1, text: ascii(&size_line) });
    let data = "GOKUL123";
    if let (Some(m), Some(r)) = (code128_modules(data), code128_runs(data)) {
        let narrow = 1u32.max(2.min(cw.saturating_sub(20) / (m + 20)));
        let h = 40u32.min(ch.saturating_sub(100).max(16));
        let x = cw.saturating_sub(m * narrow) / 2;
        let y = ch.saturating_sub(h + 18);
        els.push(El::Barcode { x, y, h, kind: "128".into(), data: data.into(), narrow, w: m * narrow, rects: rects_from_runs(&r, narrow) });
    }
    els
}

fn fmt_mm(v: f64) -> String {
    if (v - v.round()).abs() < 0.001 {
        format!("{}", v.round() as i64)
    } else {
        format!("{:.1}", v)
    }
}

fn put(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(s.as_bytes());
}

fn emit_el(out: &mut Vec<u8>, e: &El, dx: i32, dy: i32) {
    let sx = |x: u32| ((x as i64 + dx as i64).max(0)) as u32;
    let sy = |y: u32| ((y as i64 + dy as i64).max(0)) as u32;
    match e {
        El::Text { x, y, font, xm, ym, text } => {
            put(out, &format!("TEXT {},{},\"{}\",0,{},{},\"{}\"\r\n", sx(*x), sy(*y), font, xm, ym, ascii(text)));
        }
        El::Barcode { x, y, h, kind, data, narrow, .. } => {
            let data = data.replace('"', "\\[\"]");
            put(out, &format!("BARCODE {},{},\"{}\",{},0,0,{},{},\"{}\"\r\n", sx(*x), sy(*y), kind, h, narrow, narrow, data));
        }
        El::Qr { x, y, cell, data, .. } => {
            put(out, &format!("QRCODE {},{},M,{},A,0,\"{}\"\r\n", sx(*x), sy(*y), cell, ascii(data)));
        }
        El::Bar { x, y, w, h } => put(out, &format!("BAR {},{},{},{}\r\n", sx(*x), sy(*y), w, h)),
        El::Frame { x, y, w, h, t } => put(out, &format!("BOX {},{},{},{},{}\r\n", sx(*x), sy(*y), sx(*x + *w), sy(*y + *h), t)),
        El::Bitmap { x, y, w, rows } => {
            // TSPL BITMAP: width in bytes, height in dots, mode 0, then the raw bytes (1 bit per dot, 0 = printed, MSB first)
            let bytes_per_row = w.div_ceil(8) as usize;
            put(out, &format!("BITMAP {},{},{},{},0,", sx(*x), sy(*y), bytes_per_row, rows.len()));
            for row in rows {
                let ink = row.as_bytes();
                for b in 0..bytes_per_row {
                    let mut byte = 0xFFu8;
                    for bit in 0..8 {
                        let px = b * 8 + bit;
                        if px < *w as usize && ink.get(px) == Some(&b'1') {
                            byte &= !(0x80 >> bit);
                        }
                    }
                    out.push(byte);
                }
            }
            put(out, "\r\n");
        }
    }
}

fn header(spec: &Spec) -> Vec<u8> {
    let mut s = String::new();
    s.push_str(&format!("SIZE {} mm,{} mm\r\n", fmt_mm(spec.total_width_mm()), fmt_mm(spec.height)));
    s.push_str(&format!("GAP {} mm,0 mm\r\n", fmt_mm(spec.gap)));
    s.push_str(&format!("DIRECTION {},0\r\n", if spec.flip { 0 } else { 1 }));
    s.push_str("REFERENCE 0,0\r\n");
    s.push_str(&format!("DENSITY {}\r\n", spec.darkness.min(15)));
    s.push_str(&format!("SPEED {}\r\n", spec.speed.clamp(1, 8)));
    s.push_str(if spec.ribbon { "SET RIBBON ON\r\n" } else { "SET RIBBON OFF\r\n" });
    s.push_str("CODEPAGE 437\r\n");
    s.into_bytes()
}

/// A row of labels (one per column, the last row may be short) as TSPL: CLS, the elements of every cell, PRINT.
fn emit_row(out: &mut Vec<u8>, spec: &Spec, f: &Fields, row: &[&Label], copies: usize) {
    put(out, "CLS\r\n");
    for (c, label) in row.iter().enumerate() {
        let shift = spec.col_x(c as u32) as i32 + spec.dx;
        for e in layout_label(spec, f, label) {
            emit_el(out, &e, shift, spec.dy);
        }
    }
    put(out, &format!("PRINT 1,{}\r\n", copies));
}

/// The whole job for `labels` (one entry per sticker, copies already expanded), `spec.columns` stickers per row.
/// Identical neighbouring rows are sent once with `PRINT 1,n`.
pub fn render_job(spec: &Spec, f: &Fields, labels: &[Label]) -> Vec<u8> {
    let cols = spec.columns.max(1) as usize;
    let rows: Vec<Vec<&Label>> = labels.chunks(cols).map(|c| c.iter().collect()).collect();
    let mut out = header(spec);
    let mut i = 0;
    while i < rows.len() {
        let mut n = 1;
        while i + n < rows.len() && rows[i + n] == rows[i] {
            n += 1;
        }
        emit_row(&mut out, spec, f, &rows[i], n);
        i += n;
    }
    out
}

/// One calibration label per column of one row.
pub fn render_test_job(spec: &Spec) -> Vec<u8> {
    let mut out = header(spec);
    put(&mut out, "CLS\r\n");
    for c in 0..spec.columns.max(1) {
        let shift = spec.col_x(c) as i32 + spec.dx;
        for e in test_label(spec) {
            emit_el(&mut out, &e, shift, spec.dy);
        }
    }
    put(&mut out, "PRINT 1,1\r\n");
    out
}

/// How many printed stickers `labels` will use (a short last row still wastes the empty cells).
pub fn rows_needed(columns: u32, labels: usize) -> usize {
    labels.div_ceil(columns.max(1) as usize)
}
