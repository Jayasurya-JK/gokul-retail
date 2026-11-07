//! The shop logo as a 1-bit raster for thermal paper: PNG -> white background -> grey -> contrast -> Floyd-Steinberg dither.
//! Prepared once per (image, width) and cached, so printing a bill never decodes a picture.

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, Mutex, OnceLock};

/// The Gokul Oils round logo shipped with the apps (the same file the screens use).
pub const DEFAULT_LOGO_PNG: &[u8] = include_bytes!("../../../packages/ui/src/assets/logo.png");

/// 1 bit per dot, rows padded to whole bytes, most significant bit first, 1 = black.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Raster {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl Raster {
    pub fn row_bytes(&self) -> usize {
        self.width.div_ceil(8) as usize
    }
    pub fn black(&self, x: u32, y: u32) -> bool {
        self.data[y as usize * self.row_bytes() + (x / 8) as usize] & (0x80 >> (x % 8)) != 0
    }
}

fn decode(png_bytes: &[u8]) -> Result<(u32, u32, Vec<f32>), String> {
    let mut dec = png::Decoder::new(Cursor::new(png_bytes));
    dec.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = dec.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0; reader.output_buffer_size().ok_or("image too large")?];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let (w, h) = (info.width, info.height);
    let n = match info.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err("indexed PNG was not expanded".into()),
    };
    // luminance on white, 0.0 black .. 1.0 white
    let mut grey = Vec::with_capacity((w * h) as usize);
    for px in buf.chunks(n).take((w * h) as usize) {
        let (l, a) = match n {
            1 => (px[0] as f32, 255.0),
            2 => (px[0] as f32, px[1] as f32),
            3 => (0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32, 255.0),
            _ => (0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32, px[3] as f32),
        };
        let a = a / 255.0;
        grey.push((l / 255.0) * a + (1.0 - a));
    }
    Ok((w, h, grey))
}

/// Box-filter resize to `tw` wide (aspect kept).
fn resize(w: u32, h: u32, src: &[f32], tw: u32) -> (u32, u32, Vec<f32>) {
    let th = ((h as f64 * tw as f64 / w as f64).round() as u32).max(1);
    let mut out = vec![1.0f32; (tw * th) as usize];
    for ty in 0..th {
        let (y0, y1) = ((ty as f64 * h as f64 / th as f64) as u32, (((ty + 1) as f64 * h as f64 / th as f64).ceil() as u32).min(h).max(1));
        for tx in 0..tw {
            let (x0, x1) = ((tx as f64 * w as f64 / tw as f64) as u32, (((tx + 1) as f64 * w as f64 / tw as f64).ceil() as u32).min(w).max(1));
            let (mut sum, mut cnt) = (0.0f32, 0.0f32);
            for y in y0..y1.max(y0 + 1).min(h) {
                for x in x0..x1.max(x0 + 1).min(w) {
                    sum += src[(y * w + x) as usize];
                    cnt += 1.0;
                }
            }
            out[(ty * tw + tx) as usize] = if cnt > 0.0 { sum / cnt } else { 1.0 };
        }
    }
    (tw, th, out)
}

/// PNG bytes to a dithered raster `width` dots wide.
pub fn prepare(png_bytes: &[u8], width: u32) -> Result<Raster, String> {
    let (w, h, grey) = decode(png_bytes)?;
    let (tw, th, mut g) = resize(w, h, &grey, width.max(8));
    // lift the mid-tones a little: thermal heads print dark and swallow detail
    for v in g.iter_mut() {
        *v = v.clamp(0.0, 1.0).powf(0.8);
    }
    let rb = tw.div_ceil(8) as usize;
    let mut data = vec![0u8; rb * th as usize];
    for y in 0..th as usize {
        for x in 0..tw as usize {
            let i = y * tw as usize + x;
            let old = g[i];
            let new = if old < 0.5 { 0.0 } else { 1.0 };
            let err = old - new;
            if new == 0.0 {
                data[y * rb + x / 8] |= 0x80 >> (x % 8);
            }
            let mut spread = |dx: isize, dy: usize, f: f32| {
                let nx = x as isize + dx;
                if nx >= 0 && (nx as usize) < tw as usize && y + dy < th as usize {
                    g[(y + dy) * tw as usize + nx as usize] += err * f;
                }
            };
            spread(1, 0, 7.0 / 16.0);
            spread(-1, 1, 3.0 / 16.0);
            spread(0, 1, 5.0 / 16.0);
            spread(1, 1, 1.0 / 16.0);
        }
    }
    Ok(Raster { width: tw, height: th, data })
}

fn cache() -> &'static Mutex<HashMap<(u64, u32), Arc<Raster>>> {
    static C: OnceLock<Mutex<HashMap<(u64, u32), Arc<Raster>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn fnv(b: &[u8]) -> u64 {
    b.iter().fold(0xcbf29ce484222325u64, |h, &x| (h ^ x as u64).wrapping_mul(0x100000001b3))
}

/// Cached raster. `custom` is the shop's own PNG (decoded from the Settings data URL) and falls back to the bundled logo if it cannot be read.
pub fn cached(custom: Option<&[u8]>, width: u32) -> Option<Arc<Raster>> {
    let try_one = |bytes: &[u8]| -> Option<Arc<Raster>> {
        let key = (fnv(bytes), width);
        if let Some(r) = cache().lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
            return Some(r.clone());
        }
        let r = Arc::new(prepare(bytes, width).ok()?);
        cache().lock().unwrap_or_else(|e| e.into_inner()).insert(key, r.clone());
        Some(r)
    };
    custom.and_then(try_one).or_else(|| try_one(DEFAULT_LOGO_PNG))
}

/// Decodes `data:image/png;base64,...` (the shape Settings stores the logo in). Only PNG is supported; anything else is ignored.
pub fn png_from_data_url(url: &str) -> Option<Vec<u8>> {
    let rest = url.strip_prefix("data:image/png;base64,")?;
    base64_decode(rest)
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\r' | b'\n' | b' ' => continue,
            _ => return None,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// ASCII-art view of a raster (for eyeballing in tests and docs).
pub fn ascii_art(r: &Raster) -> String {
    let mut s = String::new();
    for y in (0..r.height).step_by(2) {
        for x in 0..r.width {
            let t = r.black(x, y) as u8 + if y + 1 < r.height { r.black(x, y + 1) as u8 } else { 0 };
            s.push(match t {
                2 => '#',
                1 => '+',
                _ => ' ',
            });
        }
        s.push('\n');
    }
    s
}
