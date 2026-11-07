//! "Windows driver" mode: the same laid-out lines printed through the normal Windows printer driver (GDI) for printers
//! that do not understand ESC/POS (laser, inkjet, PDF). Monospace text, bold and double size, the logo as a bitmap.
//! QR codes and barcodes are drawn as dots/bars by this module so they also work without ESC/POS.

use crate::layout::{Item, Paper};
use crate::logo::Raster;

#[cfg(not(windows))]
pub fn print(_printer: &str, _output: Option<&std::path::Path>, _doc_name: &str, _items: &[Item], _paper: Paper, _logo: Option<&Raster>) -> Result<(), String> {
    Err("printing needs Windows".into())
}

/// Prints through the driver. `output` (a file path) makes drivers such as "Microsoft Print to PDF" write there without asking.
#[cfg(windows)]
pub fn print(printer: &str, output: Option<&std::path::Path>, doc_name: &str, items: &[Item], paper: Paper, logo: Option<&Raster>) -> Result<(), String> {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::Storage::Xps::{EndDoc, EndPage, StartDocW, StartPage, DOCINFOW};

    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    unsafe {
        let name = wide(printer);
        let dc = CreateDCW(std::ptr::null(), name.as_ptr(), std::ptr::null(), std::ptr::null());
        if dc.is_null() {
            return Err(format!("printer \"{printer}\" is not installed on this computer"));
        }
        let doc = wide(doc_name);
        let out = output.map(|p| wide(&p.to_string_lossy()));
        let di = DOCINFOW {
            cbSize: std::mem::size_of::<DOCINFOW>() as i32,
            lpszDocName: doc.as_ptr(),
            lpszOutput: out.as_ref().map_or(std::ptr::null(), |o| o.as_ptr()),
            lpszDatatype: std::ptr::null(),
            fwType: 0,
        };
        if StartDocW(dc, &di) <= 0 {
            DeleteDC(dc);
            return Err("the printer driver would not start the print job".into());
        }
        StartPage(dc);
        SetBkMode(dc, 1); // transparent

        let page_w = GetDeviceCaps(dc, 8 /* HORZRES */).max(100);
        let cols = paper.cols() as i32;
        let cw = (page_w / cols).max(4); // pixels per character cell
        let mk = |scale: i32, bold: bool| {
            let face = wide("Consolas");
            CreateFontW(-(cw * 2 * scale), cw * scale, 0, 0, if bold { 700 } else { 400 }, 0, 0, 0, 0, 0, 0, 4, 49, face.as_ptr())
        };
        let fonts = [mk(1, false), mk(1, true), mk(2, false), mk(2, true)];
        let mut y = 0i32;
        let lh = cw * 2 + cw / 2;
        let mut cur = 99usize;
        for it in items {
            match it {
                Item::Line { text, bold, big } => {
                    let idx = (*big as usize) * 2 + *bold as usize;
                    if idx != cur {
                        SelectObject(dc, fonts[idx]);
                        cur = idx;
                    }
                    let w: Vec<u16> = text.encode_utf16().collect();
                    if !w.is_empty() {
                        TextOutW(dc, 0, y, w.as_ptr(), w.len() as i32);
                    }
                    y += if *big { lh * 2 } else { lh };
                }
                Item::Logo => {
                    if let Some(r) = logo {
                        y += draw_raster(dc, r, (page_w - r.width as i32).max(0) / 2, y, 1) + cw;
                    }
                }
                Item::Qr(data) => {
                    if let Ok(code) = qrcode::QrCode::with_error_correction_level(data.as_bytes(), qrcode::EcLevel::M) {
                        let n = code.width();
                        let m = ((cw * 14) / n as i32).max(2);
                        let colors = code.to_colors();
                        let x0 = (page_w - m * n as i32) / 2;
                        let brush = GetStockObject(BLACK_BRUSH);
                        for (i, c) in colors.iter().enumerate() {
                            if *c == qrcode::Color::Dark {
                                let (cx, cy) = ((i % n) as i32, (i / n) as i32);
                                let rc = RECT { left: x0 + cx * m, top: y + cy * m, right: x0 + (cx + 1) * m, bottom: y + (cy + 1) * m };
                                FillRect(dc, &rc, brush);
                            }
                        }
                        y += m * n as i32 + cw;
                    }
                }
                Item::Barcode(data) => {
                    let bars = crate::gdi::code128_modules(data);
                    let m = ((page_w * 7 / 10) / bars.len().max(1) as i32).max(1);
                    let x0 = (page_w - m * bars.len() as i32) / 2;
                    let brush = GetStockObject(BLACK_BRUSH);
                    for (i, b) in bars.iter().enumerate() {
                        if *b {
                            let rc = RECT { left: x0 + i as i32 * m, top: y, right: x0 + (i as i32 + 1) * m, bottom: y + cw * 4 };
                            FillRect(dc, &rc, brush);
                        }
                    }
                    y += cw * 4 + cw;
                }
                Item::Drawer | Item::Cut => {}
            }
        }
        EndPage(dc);
        EndDoc(dc);
        for f in fonts {
            DeleteObject(f);
        }
        DeleteDC(dc);
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn draw_raster(dc: windows_sys::Win32::Graphics::Gdi::HDC, r: &Raster, x: i32, y: i32, scale: i32) -> i32 {
    use windows_sys::Win32::Graphics::Gdi::*;
    // 1 bit per pixel DIB, top-down, 1 = black via a two-colour palette
    #[repr(C)]
    struct Bmi {
        h: BITMAPINFOHEADER,
        pal: [RGBQUAD; 2],
    }
    let bmi = Bmi {
        h: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: r.width as i32,
            biHeight: -(r.height as i32),
            biPlanes: 1,
            biBitCount: 1,
            biCompression: 0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 2,
            biClrImportant: 2,
        },
        pal: [RGBQUAD { rgbBlue: 255, rgbGreen: 255, rgbRed: 255, rgbReserved: 0 }, RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }],
    };
    // DIB rows are padded to 4 bytes
    let rb = r.row_bytes();
    let stride = rb.div_ceil(4) * 4;
    let mut bits = vec![0u8; stride * r.height as usize];
    for row in 0..r.height as usize {
        bits[row * stride..row * stride + rb].copy_from_slice(&r.data[row * rb..(row + 1) * rb]);
    }
    StretchDIBits(
        dc, x, y, r.width as i32 * scale, r.height as i32 * scale, 0, 0, r.width as i32, r.height as i32,
        bits.as_ptr() as *const _, &bmi as *const Bmi as *const BITMAPINFO, 0 /* DIB_RGB_COLORS */, 0x00CC0020, /* SRCCOPY */
    );
    r.height as i32 * scale
}

/// Code 128 (set B) as a list of bar/space modules, for the driver mode (ESC/POS printers draw their own).
pub fn code128_modules(data: &str) -> Vec<bool> {
    const PATTERNS: [&str; 107] = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231",
        "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
        "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211",
        "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214",
        "211232", "2331112",
    ];
    let codes: Vec<usize> = data.bytes().filter(|c| (0x20..=0x7E).contains(c)).map(|c| (c - 32) as usize).collect();
    let mut all = vec![104usize]; // start B
    all.extend(&codes);
    let sum: usize = 104 + codes.iter().enumerate().map(|(i, c)| (i + 1) * c).sum::<usize>();
    all.push(sum % 103);
    all.push(106); // stop
    let mut out = vec![];
    for c in all {
        let mut bar = true;
        for d in PATTERNS[c].bytes() {
            for _ in 0..(d - b'0') {
                out.push(bar);
            }
            bar = !bar;
        }
    }
    out
}
