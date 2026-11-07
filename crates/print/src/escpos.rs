//! ESC/POS byte builder. Works on any Epson-compatible thermal printer (TVS RP3160, Epson TM-T82, Posiflex, Retsol, ...).
//! Only the most widely supported commands are used: init, code page 0, bold, double size, raster image, native QR and
//! Code 128, partial cut (function A) and the drawer pulse.

use crate::layout::{Item, Paper};
use crate::logo::Raster;

pub const INIT: [u8; 2] = [0x1B, 0x40];
/// ESC t 0: code page PC437 (plain ASCII is the same in every page).
pub const CODE_PAGE: [u8; 3] = [0x1B, 0x74, 0x00];
/// ESC p 0 50 250: pulse pin 2 for 100 ms on, 500 ms off.
pub const DRAWER_PULSE: [u8; 5] = [0x1B, 0x70, 0x00, 0x32, 0xFA];
/// GS V 1: partial cut (function A), after a few blank lines so the text clears the blade.
pub const PARTIAL_CUT: [u8; 3] = [0x1D, 0x56, 0x01];

const ALIGN_LEFT: [u8; 3] = [0x1B, 0x61, 0x00];
const ALIGN_CENTER: [u8; 3] = [0x1B, 0x61, 0x01];

/// Everything one print job needs besides the lines.
#[derive(Debug, Clone, Copy)]
pub struct Options<'a> {
    pub paper: Paper,
    pub logo: Option<&'a Raster>,
    /// Feed blank lines before the cut.
    pub feed_before_cut: u8,
}

impl<'a> Options<'a> {
    pub fn new(paper: Paper) -> Options<'a> {
        Options { paper, logo: None, feed_before_cut: 4 }
    }
}

/// Just the drawer pulse, as its own tiny job (cash sale with auto-print off).
pub fn drawer_only() -> Vec<u8> {
    let mut b = INIT.to_vec();
    b.extend_from_slice(&DRAWER_PULSE);
    b
}

pub fn render(items: &[Item], o: &Options) -> Vec<u8> {
    let mut b: Vec<u8> = Vec::with_capacity(2048);
    b.extend_from_slice(&INIT);
    b.extend_from_slice(&CODE_PAGE);
    let (mut bold, mut big) = (false, false);
    for it in items {
        if !matches!(it, Item::Line { .. }) {
            // pictures, feeds and cuts always start from normal weight and size
            if bold {
                b.extend_from_slice(&[0x1B, 0x45, 0x00]);
                bold = false;
            }
            if big {
                b.extend_from_slice(&[0x1D, 0x21, 0x00]);
                big = false;
            }
        }
        match it {
            Item::Line { text, bold: want_bold, big: want_big } => {
                if *want_bold != bold {
                    b.extend_from_slice(&[0x1B, 0x45, *want_bold as u8]);
                    bold = *want_bold;
                }
                if *want_big != big {
                    b.extend_from_slice(&[0x1D, 0x21, if *want_big { 0x11 } else { 0x00 }]);
                    big = *want_big;
                }
                b.extend(text.bytes().map(|c| if (0x20..=0x7E).contains(&c) { c } else { b'?' }));
                b.push(0x0A);
            }
            Item::Logo => {
                if let Some(r) = o.logo {
                    b.extend_from_slice(&ALIGN_CENTER);
                    raster(&mut b, r);
                    b.extend_from_slice(&ALIGN_LEFT);
                }
            }
            Item::Qr(data) => {
                // the printer builds the code itself: model 2, module size, error correction M, store, print
                let size = if o.paper == Paper::Mm80 { 6 } else { 5 };
                let d = data.as_bytes();
                let n = d.len() + 3;
                b.extend_from_slice(&ALIGN_CENTER);
                b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
                b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size]);
                b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]);
                b.extend_from_slice(&[0x1D, 0x28, 0x6B, (n & 0xFF) as u8, (n >> 8) as u8, 0x31, 0x50, 0x30]);
                b.extend_from_slice(d);
                b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
                b.push(0x0A);
                b.extend_from_slice(&ALIGN_LEFT);
            }
            Item::Barcode(data) => {
                let payload: Vec<u8> = std::iter::once(b'{').chain(std::iter::once(b'B')).chain(data.bytes().filter(|c| (0x20..=0x7E).contains(c))).collect();
                b.extend_from_slice(&ALIGN_CENTER);
                b.extend_from_slice(&[0x1D, 0x68, 50]); // height 50 dots
                b.extend_from_slice(&[0x1D, 0x77, 2]); // module width 2
                b.extend_from_slice(&[0x1D, 0x48, 0]); // no built-in text (the number is printed as a line)
                b.extend_from_slice(&[0x1D, 0x6B, 73, payload.len() as u8]);
                b.extend_from_slice(&payload);
                b.push(0x0A);
                b.extend_from_slice(&ALIGN_LEFT);
            }
            Item::Drawer => b.extend_from_slice(&DRAWER_PULSE),
            Item::Cut => {
                b.extend(std::iter::repeat(0x0A).take(o.feed_before_cut as usize));
                b.extend_from_slice(&PARTIAL_CUT);
            }
        }
    }
    // leave the printer in a clean state
    if bold {
        b.extend_from_slice(&[0x1B, 0x45, 0x00]);
    }
    if big {
        b.extend_from_slice(&[0x1D, 0x21, 0x00]);
    }
    b
}

/// GS v 0 raster image, sent in bands so small printer buffers cope.
fn raster(b: &mut Vec<u8>, r: &Raster) {
    let rb = r.row_bytes();
    let mut y = 0usize;
    while y < r.height as usize {
        let rows = (r.height as usize - y).min(128);
        b.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00, (rb & 0xFF) as u8, (rb >> 8) as u8, (rows & 0xFF) as u8, (rows >> 8) as u8]);
        b.extend_from_slice(&r.data[y * rb..(y + rows) * rb]);
        y += rows;
    }
}

/// A small ESC/POS reader for tests and previews: turns a job back into text lines plus markers, so a test (or a person)
/// can check what the paper would show without a printer.
pub fn decode_to_text(bytes: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0;
    let at = |i: usize| bytes.get(i).copied().unwrap_or(0);
    while i < bytes.len() {
        match bytes[i] {
            0x1B => match at(i + 1) {
                0x40 => i += 2,
                0x74 | 0x61 | 0x45 | 0x21 | 0x4D | 0x32 => i += if at(i + 1) == 0x32 { 2 } else { 3 },
                0x70 => {
                    out.push_str("[drawer]\n");
                    i += 5;
                }
                _ => i += 2,
            },
            0x1D => match at(i + 1) {
                0x21 | 0x68 | 0x77 | 0x48 => i += 3,
                0x56 => {
                    out.push_str("[cut]\n");
                    i += 3;
                }
                0x76 => {
                    let rb = at(i + 4) as usize + 256 * at(i + 5) as usize;
                    let h = at(i + 6) as usize + 256 * at(i + 7) as usize;
                    out.push_str(&format!("[image {}x{}]\n", rb * 8, h));
                    i += 8 + rb * h;
                }
                0x6B => {
                    let n = at(i + 3) as usize;
                    out.push_str(&format!("[barcode {}]\n", String::from_utf8_lossy(&bytes[(i + 4 + 2).min(bytes.len())..(i + 4 + n).min(bytes.len())])));
                    i += 4 + n;
                }
                0x28 => {
                    let n = at(i + 3) as usize + 256 * at(i + 4) as usize;
                    if at(i + 6) == 0x50 {
                        out.push_str(&format!("[qr {}]\n", String::from_utf8_lossy(&bytes[(i + 8).min(bytes.len())..(i + 5 + n).min(bytes.len())])));
                    }
                    i += 5 + n;
                }
                _ => i += 2,
            },
            0x0A => {
                out.push('\n');
                i += 1;
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}
