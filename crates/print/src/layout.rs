//! Fits a `Doc` to a paper width. The result is a list of ready lines (already padded and aligned with spaces, ASCII only),
//! so ESC/POS, the Windows driver and the text preview all show exactly the same thing.

use crate::doc::{Align, Doc, Op, Style};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Paper {
    /// 80 mm roll: 48 columns in font A.
    Mm80,
    /// 58 mm roll: 32 columns in font A.
    Mm58,
}

impl Paper {
    pub fn cols(self) -> usize {
        match self {
            Paper::Mm80 => 48,
            Paper::Mm58 => 32,
        }
    }
    /// Printable width in dots (203 dpi).
    pub fn dots(self) -> u32 {
        match self {
            Paper::Mm80 => 576,
            Paper::Mm58 => 384,
        }
    }
    pub fn from_setting(s: &str) -> Paper {
        if s.trim().starts_with("58") {
            Paper::Mm58
        } else {
            Paper::Mm80
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Item {
    Line { text: String, bold: bool, big: bool },
    Logo,
    Qr(String),
    Barcode(String),
    /// A 1-bit picture of text (Tamil, rupee sign) as wide as the paper; `text` is what it says (previews, tests).
    Image { text: String, raster: crate::logo::Raster },
    Drawer,
    Cut,
}

/// Thermal printers have no Tamil (or rupee sign) in their code pages: anything outside printable ASCII becomes '?'.
pub fn ascii(s: &str) -> String {
    s.chars().map(|c| if (' '..='~').contains(&c) { c } else if c == '\t' { ' ' } else { '?' }).collect()
}

/// Word wrap to `width` columns; a word longer than the line is broken.
pub fn wrap(s: &str, width: usize) -> Vec<String> {
    // keep a leading indent (the "  2 x 360.00" lines) on every wrapped line
    let ind = s.chars().take_while(|c| *c == ' ').count().min(width.saturating_sub(8).min(6));
    if ind > 0 {
        let pre = " ".repeat(ind);
        return wrap(s.trim_start(), width - ind).into_iter().map(|l| format!("{pre}{l}")).collect();
    }
    let width = width.max(1);
    let s = ascii(s);
    let mut out: Vec<String> = vec![];
    let mut cur = String::new();
    for word in s.split_whitespace() {
        let mut word = word.to_string();
        loop {
            let used = cur.chars().count();
            let wl = word.chars().count();
            if used == 0 && wl <= width {
                cur = word;
                break;
            }
            if used > 0 && used + 1 + wl <= width {
                cur.push(' ');
                cur.push_str(&word);
                break;
            }
            if used > 0 {
                out.push(std::mem::take(&mut cur));
                continue;
            }
            // word longer than the whole line
            let head: String = word.chars().take(width).collect();
            let tail: String = word.chars().skip(width).collect();
            out.push(head);
            word = tail;
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

fn pad(s: &str, width: usize, a: Align) -> String {
    let n = s.chars().count();
    if n >= width {
        return s.chars().take(width).collect();
    }
    let gap = width - n;
    match a {
        Align::Left => format!("{s}{}", " ".repeat(gap)),
        Align::Right => format!("{}{s}", " ".repeat(gap)),
        Align::Center => format!("{}{s}{}", " ".repeat(gap / 2), " ".repeat(gap - gap / 2)),
    }
}

/// Lays the document out. Lines are left-aligned in the printer; centring and right alignment are done with spaces, so the
/// bytes do not depend on the printer's alignment commands.
pub fn layout(doc: &Doc, paper: Paper) -> Vec<Item> {
    let full = paper.cols();
    let mut out: Vec<Item> = vec![];
    let line = |text: String, st: Style| Item::Line { text: text.trim_end().to_string(), bold: st.bold, big: st.big };
    for op in &doc.ops {
        match op {
            Op::Text(s, st) => {
                let w = if st.big { full / 2 } else { full };
                for l in wrap(s, w) {
                    out.push(line(pad(&l, w, st.align), *st));
                }
            }
            Op::Pair(l, r, st) => {
                let w = if st.big { full / 2 } else { full };
                let r = ascii(r);
                let rl = r.chars().count();
                // the left text gets the width minus the value and one space; the value sits on the last line
                let lw = w.saturating_sub(rl + 1).max(8);
                let mut ls = wrap(l, lw);
                let last = ls.pop().unwrap_or_default();
                for x in ls {
                    out.push(line(x, *st));
                }
                let gap = w.saturating_sub(last.chars().count() + rl).max(1);
                out.push(line(format!("{last}{}{r}", " ".repeat(gap)), *st));
            }
            Op::Cols(cells, st) => {
                let w = if st.big { full / 2 } else { full };
                let fixed: usize = cells.iter().map(|c| c.1).sum();
                let fill = w.saturating_sub(fixed);
                let s: String = cells.iter().map(|(t, cw, a)| pad(&ascii(t), if *cw == 0 { fill } else { *cw }, *a)).collect();
                out.push(line(s, *st));
            }
            Op::Rule(c) => out.push(Item::Line { text: c.to_string().repeat(full), bold: false, big: false }),
            Op::Blank(n) => (0..*n).for_each(|_| out.push(Item::Line { text: String::new(), bold: false, big: false })),
            Op::Logo => out.push(Item::Logo),
            Op::Qr(d) => out.push(Item::Qr(d.clone())),
            Op::Barcode(d) => out.push(Item::Barcode(d.clone())),
            Op::Pic(text, fallback, st) => {
                let px = if st.big { 38 } else { 24 };
                match crate::tamil::render(text, paper.dots(), px, st.bold, st.align) {
                    Some(r) => out.push(Item::Image { text: text.clone(), raster: (*r).clone() }),
                    None => {
                        let w = if st.big { full / 2 } else { full };
                        for l in wrap(fallback, w) {
                            out.push(line(pad(&l, w, st.align), *st));
                        }
                    }
                }
            }
            Op::Drawer => out.push(Item::Drawer),
            Op::Cut => out.push(Item::Cut),
        }
    }
    out
}

/// Plain-text preview of the laid-out lines (what the paper shows, minus pictures).
pub fn to_text(items: &[Item]) -> String {
    let mut s = String::new();
    for it in items {
        match it {
            Item::Line { text, bold, big } => {
                s.push_str(text);
                if *big || *bold {
                    // markers are only in the preview text; the paper shows the real weight
                    let _ = (bold, big);
                }
                s.push('\n');
            }
            Item::Logo => s.push_str("[ logo ]\n"),
            Item::Qr(d) => s.push_str(&format!("[ QR: {d} ]\n")),
            Item::Barcode(d) => s.push_str(&format!("[ barcode: {d} ]\n")),
            Item::Image { text, raster } => s.push_str(&format!("[ picture {}x{}: {} ]\n", raster.width, raster.height, text.replace('\n', " / "))),
            Item::Drawer => s.push_str("[ cash drawer opens ]\n"),
            Item::Cut => s.push_str("[ - - - cut - - - ]\n"),
        }
    }
    s
}
