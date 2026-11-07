//! Text a thermal printer cannot print itself (Tamil, the rupee sign) is drawn with a Windows font (Nirmala UI, else Latha) into
//! a 1-bit picture and sent as a raster image (`GS v 0`), the way POS Bean does. Rendered pictures are cached, so printing a
//! bill never draws the same line twice. On a computer without Windows or without a Tamil font nothing is drawn (`None`) and the
//! caller falls back to plain text.

use crate::doc::Align;
use crate::logo::Raster;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Fonts tried in order for Tamil text.
pub const TAMIL_FONTS: [&str; 3] = ["Nirmala UI", "Latha", "Vijaya"];

type Key = (String, u32, u32, bool, u8, String);

fn cache() -> &'static Mutex<HashMap<Key, Option<Arc<Raster>>>> {
    static C: OnceLock<Mutex<HashMap<Key, Option<Arc<Raster>>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True when the text has anything a thermal code page cannot print.
pub fn needs_picture(s: &str) -> bool {
    s.chars().any(|c| !(' '..='~').contains(&c))
}

/// Draws `text` (wrapped to `width` dots) with `px` pixel text, black on white, as a 1-bit raster exactly `width` wide.
pub fn render(text: &str, width: u32, px: u32, bold: bool, align: Align) -> Option<Arc<Raster>> {
    render_with(text, width, px, bold, align, &TAMIL_FONTS)
}

/// Same with an explicit list of font faces (the first one Windows really has is used).
pub fn render_with(text: &str, width: u32, px: u32, bold: bool, align: Align, faces: &[&str]) -> Option<Arc<Raster>> {
    let key: Key = (text.to_string(), width, px, bold, align as u8, faces.join("|"));
    if let Some(hit) = cache().lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
        return hit.clone();
    }
    let made = draw(text, width, px, bold, align, faces).map(Arc::new);
    cache().lock().unwrap_or_else(|e| e.into_inner()).insert(key, made.clone());
    made
}

#[cfg(not(windows))]
fn draw(_text: &str, _width: u32, _px: u32, _bold: bool, _align: Align, _faces: &[&str]) -> Option<Raster> {
    None
}

#[cfg(windows)]
fn draw(text: &str, width: u32, px: u32, bold: bool, align: Align, faces: &[&str]) -> Option<Raster> {
    use windows_sys::Win32::Foundation::SIZE;
    use windows_sys::Win32::Graphics::Gdi::*;
    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    if text.trim().is_empty() || width < 16 {
        return None;
    }
    unsafe {
        let dc = CreateCompatibleDC(std::ptr::null_mut());
        if dc.is_null() {
            return None;
        }
        let mut font = std::ptr::null_mut();
        for face in faces {
            let name = wide(face);
            let f = CreateFontW(-(px as i32), 0, 0, 0, if bold { 700 } else { 400 }, 0, 0, 0, 1 /* DEFAULT_CHARSET */, 0, 0, 4 /* ANTIALIASED */, 0, name.as_ptr());
            if f.is_null() {
                continue;
            }
            let old = SelectObject(dc, f);
            let mut got = [0u16; 64];
            let n = GetTextFaceW(dc, 64, got.as_mut_ptr()).max(0) as usize;
            let got = String::from_utf16_lossy(&got[..n.saturating_sub(1).min(63)]);
            if got.eq_ignore_ascii_case(face) {
                font = f;
                break;
            }
            SelectObject(dc, old);
            DeleteObject(f);
        }
        if font.is_null() {
            DeleteDC(dc);
            return None;
        }
        let mut tm: TEXTMETRICW = std::mem::zeroed();
        GetTextMetricsW(dc, &mut tm);
        let line_h = (tm.tmHeight + 3).max(8) as u32;
        let measure = |s: &str| -> u32 {
            let w: Vec<u16> = s.encode_utf16().collect();
            let mut sz = SIZE { cx: 0, cy: 0 };
            GetTextExtentPoint32W(dc, w.as_ptr(), w.len() as i32, &mut sz);
            sz.cx.max(0) as u32
        };
        // greedy word wrap on measured widths
        let mut lines: Vec<String> = Vec::new();
        // monospace previews keep every space as it is; Tamil text wraps on words
        let preserve = faces.first() == Some(&"Consolas");
        for para in text.split('\n') {
            if preserve {
                lines.push(para.to_string());
                continue;
            }
            let mut cur = String::new();
            for word in para.split_whitespace() {
                let cand = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
                if cur.is_empty() || measure(&cand) <= width {
                    cur = cand;
                } else {
                    lines.push(std::mem::take(&mut cur));
                    cur = word.to_string();
                }
            }
            lines.push(cur);
        }
        let height = line_h * lines.len() as u32 + 2;
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }],
        };
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let bmp = CreateDIBSection(dc, &bmi, 0, &mut bits, std::ptr::null_mut(), 0);
        if bmp.is_null() || bits.is_null() {
            DeleteObject(font);
            DeleteDC(dc);
            return None;
        }
        let old_bmp = SelectObject(dc, bmp);
        let buf = std::slice::from_raw_parts_mut(bits as *mut u8, (width * height * 4) as usize);
        buf.fill(0xFF);
        SetBkMode(dc, 1);
        SetTextColor(dc, 0);
        for (i, l) in lines.iter().enumerate() {
            let w: Vec<u16> = l.encode_utf16().collect();
            if w.is_empty() {
                continue;
            }
            let lw = measure(l);
            let x = match align {
                Align::Left => 0,
                Align::Center => width.saturating_sub(lw) / 2,
                Align::Right => width.saturating_sub(lw),
            };
            TextOutW(dc, x as i32, (i as u32 * line_h + 1) as i32, w.as_ptr(), w.len() as i32);
        }
        GdiFlush();
        // threshold the anti-aliased grey to 1 bit (1 = black)
        let rb = width.div_ceil(8) as usize;
        let mut data = vec![0u8; rb * height as usize];
        for y in 0..height as usize {
            for x in 0..width as usize {
                let g = buf[(y * width as usize + x) * 4 + 1];
                if g < 150 {
                    data[y * rb + x / 8] |= 0x80 >> (x % 8);
                }
            }
        }
        SelectObject(dc, old_bmp);
        DeleteObject(bmp);
        DeleteObject(font);
        DeleteDC(dc);
        Some(Raster { width, height, data })
    }
}

/// A whole bill as a PNG (for the sample pictures next to the text samples): text lines in a monospace font, pictures
/// (logo, Tamil lines) as they print. QR and barcode show as labelled boxes. Windows only; `None` elsewhere.
pub fn preview_png(items: &[crate::layout::Item], paper: crate::layout::Paper, logo: Option<&Raster>) -> Option<Vec<u8>> {
    use crate::layout::Item;
    let width = paper.dots();
    let px = 22u32;
    let mut rows: Vec<Arc<Raster>> = Vec::new();
    for it in items {
        match it {
            Item::Line { text, bold, .. } => {
                let t = if text.is_empty() { " ".to_string() } else { text.clone() };
                rows.push(render_with(&t, width, px, *bold, Align::Left, &["Consolas"])?);
            }
            Item::Image { raster, .. } => rows.push(Arc::new(raster.clone())),
            Item::Logo => {
                if let Some(l) = logo {
                    // centred on the paper
                    let mut r = Raster { width, height: l.height, data: vec![0; width.div_ceil(8) as usize * l.height as usize] };
                    let off = (width - l.width) / 2;
                    for y in 0..l.height {
                        for x in 0..l.width {
                            if l.black(x, y) {
                                let nx = x + off;
                                let rb = r.row_bytes();
                                r.data[y as usize * rb + (nx / 8) as usize] |= 0x80 >> (nx % 8);
                            }
                        }
                    }
                    rows.push(Arc::new(r));
                }
            }
            Item::Qr(d) => rows.push(render_with(&format!("[ QR code: {d} ]"), width, px, false, Align::Center, &["Consolas"])?),
            Item::Barcode(d) => rows.push(render_with(&format!("[ barcode: {d} ]"), width, px, false, Align::Center, &["Consolas"])?),
            Item::Cut => rows.push(render_with("- - - - - - - cut - - - - - - -", width, px, false, Align::Center, &["Consolas"])?),
            Item::Drawer => {}
        }
    }
    let height: u32 = rows.iter().map(|r| r.height).sum::<u32>() + 40;
    let mut img = vec![0xFFu8; (width * height) as usize];
    let mut y0 = 20u32;
    for r in &rows {
        for y in 0..r.height {
            for x in 0..width.min(r.width) {
                if r.black(x, y) {
                    img[((y0 + y) * width + x) as usize] = 0;
                }
            }
        }
        y0 += r.height;
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(png::ColorType::Grayscale);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().ok()?;
        w.write_image_data(&img).ok()?;
    }
    Some(out)
}
