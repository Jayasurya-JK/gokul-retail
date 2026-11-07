//! gokul-print: everything between "a document" and "paper".
//!
//! `doc` describes a receipt (header, rows, totals, QR, barcode ...), `layout` fits it to 48 columns (80 mm) or
//! 32 columns (58 mm), `escpos` turns the laid-out lines into RAW ESC/POS bytes, `gdi` prints the same lines through
//! the Windows printer driver for printers that do not speak ESC/POS, and `spool` lists printers and sends RAW jobs to
//! the Windows spooler. `logo` turns the shop logo into a 1-bit raster. `tspl` lays out and prints barcode stickers on a TSPL label printer
//! (TSC TE244), with `barcode` giving the bar patterns for the preview. No database and no Tauri in here.

pub mod barcode;
pub mod doc;
pub mod escpos;
pub mod gdi;
pub mod layout;
pub mod logo;
pub mod spool;
pub mod tamil;
pub mod tspl;

pub use doc::{Align, Doc, Op, Style};
pub use layout::{layout, Item, Paper};
pub use logo::Raster;
pub use spool::{classify, list_printers, printer_state, send_raw, PrinterInfo, PrinterKind, PrinterState};
