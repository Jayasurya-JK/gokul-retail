//! Barcode bar patterns for label previews and for fitting a code on a label: Code 128 (subsets B and C) and EAN-13.
//! The label printer draws the real bars itself (TSPL `BARCODE`); this module only has to know how WIDE the printer's
//! code will be and what it looks like, so the on-screen preview matches the sticker.

const CODE128: [&str; 106] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231",
    "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
    "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211",
    "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214",
    "211232",
];
const STOP: &str = "2331112";
const START_B: usize = 104;
const START_C: usize = 105;
const CODE_B: usize = 100;
const CODE_C: usize = 99;

fn digit_run(b: &[u8], from: usize) -> usize {
    b[from..].iter().take_while(|c| c.is_ascii_digit()).count()
}

/// Code 128 symbol values (start, data, check) for printable ASCII text; `None` for anything else or an empty string.
/// Long digit runs are packed two digits per symbol (subset C), like the label printer's automatic subset switching.
pub fn code128_symbols(data: &str) -> Option<Vec<usize>> {
    let b = data.as_bytes();
    if b.is_empty() || !b.iter().all(|c| (0x20..=0x7E).contains(c)) {
        return None;
    }
    let n = b.len();
    let mut out: Vec<usize> = Vec::new();
    let mut in_c = false;
    let mut i = 0;
    while i < n {
        if in_c {
            let pairs = digit_run(b, i) / 2;
            for _ in 0..pairs {
                out.push(((b[i] - b'0') as usize) * 10 + (b[i + 1] - b'0') as usize);
                i += 2;
            }
            if i < n {
                out.push(CODE_B);
                in_c = false;
            }
            continue;
        }
        let run = digit_run(b, i);
        let tail = i + run == n;
        if run >= if i == 0 || tail { 4 } else { 6 } {
            if out.is_empty() && run % 2 == 0 {
                out.push(START_C);
            } else {
                if out.is_empty() {
                    out.push(START_B);
                }
                if run % 2 == 1 {
                    // the odd digit goes first in subset B, the rest in pairs
                    out.push((b[i] - b' ') as usize);
                    i += 1;
                }
                out.push(CODE_C);
            }
            in_c = true;
            continue;
        }
        if out.is_empty() {
            out.push(START_B);
        }
        out.push((b[i] - b' ') as usize);
        i += 1;
    }
    let sum: usize = out[0] + out.iter().enumerate().skip(1).map(|(k, v)| k * v).sum::<usize>();
    out.push(sum % 103);
    Some(out)
}

/// Run widths (bar, space, bar ... starting with a bar) of a complete Code 128 symbol including the stop pattern.
pub fn code128_runs(data: &str) -> Option<Vec<u8>> {
    let syms = code128_symbols(data)?;
    let mut runs = Vec::with_capacity(syms.len() * 6 + 7);
    for s in syms {
        runs.extend(CODE128[s].bytes().map(|c| c - b'0'));
    }
    runs.extend(STOP.bytes().map(|c| c - b'0'));
    Some(runs)
}

/// Total width in modules (one module = the narrow bar), without quiet zones.
pub fn code128_modules(data: &str) -> Option<u32> {
    code128_runs(data).map(|r| r.iter().map(|&x| x as u32).sum())
}

const EAN_L: [&str; 10] = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G: [&str; 10] = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_PARITY: [&str; 10] = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

pub fn ean13_check_digit(d12: &str) -> Option<u8> {
    let d: Vec<u32> = d12.bytes().map(|c| (c as char).to_digit(10)).collect::<Option<_>>()?;
    if d.len() != 12 {
        return None;
    }
    let s: u32 = d.iter().enumerate().map(|(i, v)| if i % 2 == 0 { *v } else { v * 3 }).sum();
    Some(((10 - s % 10) % 10) as u8)
}

/// 13 digits with a correct check digit: a real EAN-13 the printer can draw as such.
pub fn is_ean13(s: &str) -> bool {
    s.len() == 13 && s.bytes().all(|c| c.is_ascii_digit()) && ean13_check_digit(&s[..12]) == Some(s.as_bytes()[12] - b'0')
}

/// The 95 modules of an EAN-13 (true = bar). `None` unless `is_ean13`.
pub fn ean13_modules(s: &str) -> Option<Vec<bool>> {
    if !is_ean13(s) {
        return None;
    }
    let d: Vec<usize> = s.bytes().map(|c| (c - b'0') as usize).collect();
    let mut bits = String::from("101");
    for (k, parity) in EAN_PARITY[d[0]].chars().enumerate() {
        bits.push_str(if parity == 'L' { EAN_L[d[1 + k]] } else { EAN_G[d[1 + k]] });
    }
    bits.push_str("01010");
    for k in 0..6 {
        bits.extend(EAN_L[d[7 + k]].chars().map(|c| if c == '0' { '1' } else { '0' }));
    }
    bits.push_str("101");
    Some(bits.chars().map(|c| c == '1').collect())
}

/// Bars as `(x offset, width)` rectangles in dots for run widths scaled by `narrow` dots.
pub fn rects_from_runs(runs: &[u8], narrow: u32) -> Vec<(u32, u32)> {
    let mut x = 0;
    let mut out = Vec::new();
    for (i, &r) in runs.iter().enumerate() {
        let w = r as u32 * narrow;
        if i % 2 == 0 {
            out.push((x, w));
        }
        x += w;
    }
    out
}

/// Run widths of a module list that starts with a bar.
pub fn runs_from_modules(m: &[bool]) -> Vec<u8> {
    let mut runs: Vec<u8> = Vec::new();
    let mut prev = true;
    for &b in m {
        if b == prev && !runs.is_empty() {
            *runs.last_mut().unwrap() += 1;
        } else {
            runs.push(1);
            prev = b;
        }
    }
    runs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_code128_pattern_is_11_modules_and_unique() {
        let mut seen = std::collections::HashSet::new();
        for p in CODE128.iter() {
            assert_eq!(p.len(), 6);
            assert_eq!(p.bytes().map(|c| (c - b'0') as u32).sum::<u32>(), 11, "{p}");
            assert!(seen.insert(*p), "duplicate {p}");
        }
        assert_eq!(STOP.bytes().map(|c| (c - b'0') as u32).sum::<u32>(), 13);
    }

    #[test]
    fn code128_known_values() {
        // Wikipedia example: "PJJ123C" in subset B has check symbol 55 (104+48+2*42+3*42+4*17+5*18+6*19+7*35 = 879, 879 mod 103)
        let s = code128_symbols("PJJ123C").unwrap();
        assert_eq!(*s.last().unwrap(), 55);
        assert_eq!(s[0], START_B);
        // all digits, even: start C, pairs, check
        let s = code128_symbols("123456").unwrap();
        assert_eq!(s, vec![START_C, 12, 34, 56, (105 + 12 + 2 * 34 + 3 * 56) % 103]);
        // a shop code stays in subset B: start + 4 chars + check + stop
        assert_eq!(code128_symbols("G123").unwrap()[0], START_B);
        assert_eq!(code128_modules("G123").unwrap(), 11 * (1 + 4 + 1) + 13);
        assert!(code128_symbols("").is_none());
        assert!(code128_symbols("caf\u{e9}").is_none());
    }

    #[test]
    fn thirteen_digits_switch_subsets() {
        let s = code128_symbols("8904000000011").unwrap();
        assert_eq!(s[0], START_B); // odd run: first digit in B, then subset C
        assert_eq!(s[1], (b'8' - b' ') as usize);
        assert_eq!(s[2], CODE_C);
        assert_eq!(code128_modules("8904000000011").unwrap(), 11 * s.len() as u32 + 13);
    }

    #[test]
    fn ean13() {
        assert!(is_ean13("4006381333931"));
        assert!(!is_ean13("4006381333932"));
        let m = ean13_modules("4006381333931").unwrap();
        assert_eq!(m.len(), 95);
        assert_eq!(&m[..3], &[true, false, true]);
        let runs = runs_from_modules(&m);
        assert_eq!(runs.iter().map(|&x| x as usize).sum::<usize>(), 95);
    }
}
