//! The Windows print spooler: list installed printers, read their state and send RAW jobs (ESC/POS bytes).
//! A target that starts with `FILE:` writes the job to that file instead (tests, and "capture the job" support calls).

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrinterKind {
    Thermal,
    Label,
    Other,
}

impl PrinterKind {
    pub fn as_str(self) -> &'static str {
        match self {
            PrinterKind::Thermal => "thermal",
            PrinterKind::Label => "label",
            PrinterKind::Other => "other",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrinterState {
    Ready,
    Offline,
    PaperOut,
    PaperJam,
    DoorOpen,
    Error,
    NotFound,
}

impl PrinterState {
    pub fn is_ready(&self) -> bool {
        *self == PrinterState::Ready
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            PrinterState::Ready => "ready",
            PrinterState::Offline => "offline",
            PrinterState::PaperOut => "paper_out",
            PrinterState::PaperJam => "paper_jam",
            PrinterState::DoorOpen => "door_open",
            PrinterState::Error => "error",
            PrinterState::NotFound => "not_found",
        }
    }
    /// Plain words for a toast or the settings screen.
    pub fn describe(&self) -> &'static str {
        match self {
            PrinterState::Ready => "ready",
            PrinterState::Offline => "offline. Check that it is switched on and the cable is plugged in",
            PrinterState::PaperOut => "out of paper",
            PrinterState::PaperJam => "jammed. Open the cover and clear the paper",
            PrinterState::DoorOpen => "open. Close the paper cover",
            PrinterState::Error => "reporting an error. Switch it off and on",
            PrinterState::NotFound => "not installed on this computer",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PrinterInfo {
    pub name: String,
    pub driver: String,
    pub port: String,
    pub kind: PrinterKind,
    pub state: PrinterState,
    pub is_default: bool,
}

/// Guess from the name and driver: receipt (thermal) printers, label printers, everything else (office printers, PDF, fax).
pub fn classify(name: &str, driver: &str) -> PrinterKind {
    let s = format!("{name} {driver}").to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| s.contains(w));
    if has(&["tsc ", "tsc-", "te244", "te 244", "te-244", "tspl", "zebra", "godex", "label", "argox", "sato", "tth ", "ttp-", "ttp "]) {
        PrinterKind::Label
    } else if has(&[
        "tvs", "rp3200", "rp 3200", "rp-3200", "rp3160", "rp 3160", "rp-3160", "tm-t", "tm t", "epson tm", "posiflex", "retsol", "thermal", "receipt", "pos-", "pos ", "pos80", "pos58",
        "xprinter", "x-printer", "bixolon", "star tsp", "tsp1", "citizen ct", "ct-s", "sewoo", "rongta", "everycom", "gprinter", "gp-", "zjiang", "zj-",
        "esc/pos", "escpos", "80mm", "58mm", "80 mm", "58 mm", "jp80", "3nstar", "partner", "tally", "wep", "ep-", "bill printer", "billing",
    ]) {
        PrinterKind::Thermal
    } else {
        PrinterKind::Other
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use windows_sys::Win32::Graphics::Printing::*;

    pub fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    pub unsafe fn from_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut n = 0;
        while *p.add(n) != 0 {
            n += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, n))
    }

    pub fn state_from(status: u32, attributes: u32) -> PrinterState {
        if status & PRINTER_STATUS_PAPER_OUT != 0 {
            PrinterState::PaperOut
        } else if status & PRINTER_STATUS_PAPER_JAM != 0 {
            PrinterState::PaperJam
        } else if status & PRINTER_STATUS_DOOR_OPEN != 0 {
            PrinterState::DoorOpen
        } else if status & (PRINTER_STATUS_OFFLINE | PRINTER_STATUS_NOT_AVAILABLE | PRINTER_STATUS_SERVER_OFFLINE) != 0 || attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE != 0 {
            PrinterState::Offline
        } else if status & (PRINTER_STATUS_ERROR | PRINTER_STATUS_USER_INTERVENTION | PRINTER_STATUS_PAPER_PROBLEM | PRINTER_STATUS_OUT_OF_MEMORY) != 0 {
            PrinterState::Error
        } else {
            PrinterState::Ready
        }
    }

    pub fn default_printer() -> String {
        unsafe {
            let mut n = 0u32;
            GetDefaultPrinterW(std::ptr::null_mut(), &mut n);
            if n == 0 {
                return String::new();
            }
            let mut buf = vec![0u16; n as usize];
            if GetDefaultPrinterW(buf.as_mut_ptr(), &mut n) == 0 {
                return String::new();
            }
            from_wide(buf.as_ptr())
        }
    }

    pub fn list() -> Vec<PrinterInfo> {
        let default = default_printer();
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let (mut need, mut count) = (0u32, 0u32);
            EnumPrintersW(flags, std::ptr::null(), 2, std::ptr::null_mut(), 0, &mut need, &mut count);
            if need == 0 {
                return vec![];
            }
            // u64 backing so the PRINTER_INFO_2W structs are aligned
            let mut buf = vec![0u64; (need as usize).div_ceil(8) + 1];
            if EnumPrintersW(flags, std::ptr::null(), 2, buf.as_mut_ptr() as *mut u8, need, &mut need, &mut count) == 0 {
                return vec![];
            }
            let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_2W, count as usize);
            infos
                .iter()
                .map(|i| {
                    let name = from_wide(i.pPrinterName);
                    let driver = from_wide(i.pDriverName);
                    PrinterInfo {
                        kind: classify(&name, &driver),
                        state: state_from(i.Status, i.Attributes),
                        is_default: name == default,
                        port: from_wide(i.pPortName),
                        name,
                        driver,
                    }
                })
                .collect()
        }
    }

    pub fn state(name: &str) -> PrinterState {
        unsafe {
            let mut h = PRINTER_HANDLE::default();
            let n = wide(name);
            if OpenPrinterW(n.as_ptr(), &mut h, std::ptr::null()) == 0 {
                return PrinterState::NotFound;
            }
            let mut need = 0u32;
            GetPrinterW(h, 2, std::ptr::null_mut(), 0, &mut need);
            let mut st = PrinterState::Error;
            if need > 0 {
                let mut buf = vec![0u64; (need as usize).div_ceil(8) + 1];
                if GetPrinterW(h, 2, buf.as_mut_ptr() as *mut u8, need, &mut need) != 0 {
                    let i = &*(buf.as_ptr() as *const PRINTER_INFO_2W);
                    st = state_from(i.Status, i.Attributes);
                }
            }
            ClosePrinter(h);
            st
        }
    }

    pub fn send(name: &str, doc_name: &str, bytes: &[u8]) -> Result<(), String> {
        unsafe {
            let mut h = PRINTER_HANDLE::default();
            let n = wide(name);
            if OpenPrinterW(n.as_ptr(), &mut h, std::ptr::null()) == 0 {
                return Err(format!("printer \"{name}\" is not installed on this computer"));
            }
            let mut doc = wide(doc_name);
            let mut raw = wide("RAW");
            let info = DOC_INFO_1W { pDocName: doc.as_mut_ptr(), pOutputFile: std::ptr::null_mut(), pDatatype: raw.as_mut_ptr() };
            let res = (|| {
                if StartDocPrinterW(h, 1, &info) == 0 {
                    return Err("the printer would not accept the job".to_string());
                }
                let mut r = Ok(());
                if StartPagePrinter(h) == 0 {
                    r = Err("the printer would not start a page".to_string());
                } else {
                    let mut done = 0usize;
                    while done < bytes.len() {
                        let mut wrote = 0u32;
                        let chunk = &bytes[done..];
                        if WritePrinter(h, chunk.as_ptr() as *const c_void, chunk.len() as u32, &mut wrote) == 0 || wrote == 0 {
                            r = Err("the printer stopped answering (offline or cable out)".to_string());
                            break;
                        }
                        done += wrote as usize;
                    }
                    EndPagePrinter(h);
                }
                EndDocPrinter(h);
                r
            })();
            ClosePrinter(h);
            res
        }
    }
}

pub fn list_printers() -> Vec<PrinterInfo> {
    #[cfg(windows)]
    {
        win::list()
    }
    #[cfg(not(windows))]
    {
        vec![]
    }
}

/// Is this printer installed and reachable right now? (`FILE:` targets are always ready.)
pub fn printer_state(name: &str) -> PrinterState {
    if name.starts_with("FILE:") {
        return PrinterState::Ready;
    }
    #[cfg(windows)]
    {
        win::state(name)
    }
    #[cfg(not(windows))]
    {
        let _ = name;
        PrinterState::NotFound
    }
}

/// Sends RAW bytes to the printer through the spooler (or into a file for a `FILE:path` target).
/// The error text finishes the sentence "Printing failed: ...".
pub fn send_raw(target: &str, doc_name: &str, bytes: &[u8]) -> Result<(), String> {
    if let Some(path) = target.strip_prefix("FILE:") {
        return std::fs::write(Path::new(path), bytes).map_err(|e| format!("could not write {path}: {e}"));
    }
    if target.trim().is_empty() {
        return Err("no printer is chosen. Pick one in Gokul Office, Settings, Printers".into());
    }
    #[cfg(windows)]
    {
        // Report a paper-out/offline printer by its state first: the spooler happily queues a job for a dead printer.
        let st = win::state(target);
        if st == PrinterState::NotFound {
            return Err(format!("printer \"{target}\" is not installed on this computer"));
        }
        if !st.is_ready() {
            return Err(format!("the printer is {}", st.describe()));
        }
        win::send(target, doc_name, bytes)
    }
    #[cfg(not(windows))]
    {
        let _ = (doc_name, bytes);
        Err("printing needs Windows".into())
    }
}
