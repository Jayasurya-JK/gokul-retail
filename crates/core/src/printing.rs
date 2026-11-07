//! Printing: builds every printed document from the saved records and sends it to the bill printer.
//!
//! Rules (see docs/BACKEND.md, Printing):
//! - A bill is printed only AFTER it is committed. Nothing here writes to the database, so a print failure can never
//!   roll a bill back; the caller just gets `{ ok: false, message }` and the screen shows "Bill saved. Printing failed: ...".
//! - The database lock is held only while the document is built (microseconds). The spooler call happens after it is released.
//! - The paper looks like `ReceiptPreview` (packages/ui): shop header, GSTIN, number/date/time, cashier, customer (and GSTIN
//!   for B2B), lines, GST table, round off, total, payments, footer, barcode of the number. Reprints say DUPLICATE COPY.

use crate::bills;
use crate::billops;
use crate::crm;
use crate::db::{self, Db};
use crate::error::{invalid, Result};
use crate::types::*;
use gokul_print::{escpos, Align, Doc, Item, Op, Paper, PrinterKind, Style};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};

// ---------------------------------------------------------------- settings

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    Escpos,
    Driver,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub printer: String,
    pub mode: Mode,
    pub paper: Paper,
    pub copies: u8,
    pub auto_print: bool,
    pub drawer_on_cash: bool,
    pub cut: bool,
    pub print_logo: bool,
    pub show_qr: bool,
    pub upi_id: String,
    pub show_savings: bool,
    pub show_hsn: bool,
    pub show_gst_summary: bool,
    pub header: String,
    pub footer: String,
    pub shop_name: String,
    pub address: String,
    pub phone: String,
    pub gstin: String,
    pub fssai: String,
    pub logo_png: Option<Vec<u8>>,
    pub composition: bool,
}

pub fn load_config(conn: &Connection) -> Result<Config> {
    let s = db::load_settings(conn)?;
    let b = crm::get_settings_bundle(conn)?;
    let (p, f, shop, tax) = (&b["printers"], &b["billFormat"], &b["shop"], &b["tax"]);
    let text = |v: &Value| v.as_str().unwrap_or("").trim().to_string();
    let footer = if text(&f["footer"]).is_empty() { s.receipt_footer.clone() } else { text(&f["footer"]) };
    Ok(Config {
        printer: if text(&p["billPrinter"]).is_empty() { s.printer.clone() } else { text(&p["billPrinter"]) },
        mode: if p["mode"].as_str() == Some("driver") { Mode::Driver } else { Mode::Escpos },
        paper: Paper::from_setting(f["paper"].as_str().unwrap_or("80mm")),
        copies: f["copies"].as_i64().unwrap_or(1).clamp(1, 3) as u8,
        auto_print: p["autoPrint"].as_bool().unwrap_or(true),
        drawer_on_cash: p["openDrawerOnCash"].as_bool().unwrap_or(true),
        cut: p["cutter"].as_bool().unwrap_or(true),
        print_logo: p["printLogo"].as_bool().unwrap_or(true),
        show_qr: f["showQr"].as_bool().unwrap_or(false),
        upi_id: text(&f["upiId"]),
        show_savings: f["showSavings"].as_bool().unwrap_or(true),
        show_hsn: f["showHsn"].as_bool().unwrap_or(true) && tax["showHsn"].as_bool().unwrap_or(true),
        show_gst_summary: f["showGstSummary"].as_bool().unwrap_or(true),
        header: text(&f["header"]),
        footer,
        shop_name: s.shop_name,
        address: s.address,
        phone: s.phone,
        gstin: s.gstin,
        fssai: text(&shop["fssai"]),
        logo_png: shop["logo"].as_str().and_then(gokul_print::logo::png_from_data_url),
        composition: tax["scheme"].as_str() == Some("composition"),
    })
}

// ---------------------------------------------------------------- formatting

/// 123456 -> "1,234.56" (Indian digit grouping).
pub fn money(p: i64) -> String {
    let neg = p < 0;
    let p = p.abs();
    let int = (p / 100).to_string();
    let mut grouped = String::new();
    let n = int.len();
    for (i, ch) in int.chars().enumerate() {
        let left = n - i;
        if i > 0 && (left == 3 || (left > 3 && (left - 3) % 2 == 0)) {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    format!("{}{}.{:02}", if neg { "-" } else { "" }, grouped, p % 100)
}

fn qty(q: i64) -> String {
    if q % 1000 == 0 {
        (q / 1000).to_string()
    } else {
        format!("{:.3}", q as f64 / 1000.0).trim_end_matches('0').to_string()
    }
}

fn when(at: &str) -> (String, String) {
    match db::parse_iso(at) {
        Some(d) => (d.format("%d-%m-%Y").to_string(), d.format("%I:%M %p").to_string()),
        None => (at.chars().take(10).collect(), String::new()),
    }
}

fn mode_label(m: &str) -> &'static str {
    match m {
        "cash" => "CASH",
        "upi" => "UPI",
        "card" => "CARD",
        "credit" => "CREDIT (PAY LATER)",
        "credit_note" => "CREDIT NOTE",
        "bank" => "BANK",
        _ => "OTHER",
    }
}

const BOLD: Style = Style::NORMAL.bold();
const TITLE: Style = Style::NORMAL.bold().center();
const BIG: Style = Style::NORMAL.bold().big().center();

// ---------------------------------------------------------------- shared pieces

fn header(d: &mut Doc, c: &Config) {
    if c.print_logo {
        d.push(Op::Logo);
    }
    d.text(c.shop_name.to_uppercase(), BIG);
    if !c.header.is_empty() {
        d.text(c.header.clone(), Style::NORMAL.center());
    }
    if !c.address.is_empty() {
        d.text(c.address.clone(), Style::NORMAL.center());
    }
    if !c.phone.is_empty() {
        d.text(format!("Ph: {}", c.phone), Style::NORMAL.center());
    }
    if !c.gstin.is_empty() {
        d.text(format!("GSTIN: {}", c.gstin), TITLE);
    }
    if !c.fssai.is_empty() {
        d.text(format!("FSSAI: {}", c.fssai), Style::NORMAL.center());
    }
}

fn stamp(d: &mut Doc, text: &str) {
    d.text(format!("*** {text} ***"), TITLE);
}

fn finish(d: &mut Doc, c: &Config, cut: bool) {
    if cut && c.cut {
        d.push(Op::Cut);
    } else {
        d.push(Op::Blank(3));
    }
}

fn gst_table(d: &mut Doc, c: &Config, slabs: &[GstSlab]) {
    let cols = c.paper.cols();
    let w = (cols - 6) / 3;
    let first = cols - 3 * w;
    let row = |a: &str, b: &str, cc: &str, e: &str| {
        Op::Cols(vec![(a.into(), first, Align::Left), (b.into(), w, Align::Right), (cc.into(), w, Align::Right), (e.into(), w, Align::Right)], Style::NORMAL)
    };
    d.push(row("GST", "Taxable", "CGST", "SGST"));
    for s in slabs {
        d.push(row(&format!("{}%", s.rate), &money(s.taxable), &money(s.cgst), &money(s.sgst)));
    }
}

/// Lines, totals and GST table, shared by the bill and the credit note.
fn body(d: &mut Doc, c: &Config, conn: &Connection, lines: &[BillLine], t: &BillTotals, refund: bool) -> Result<i64> {
    let sign = if refund { "-" } else { "" };
    d.pair_styled("Item", "Amount", BOLD);
    let mut saved = 0i64;
    for l in lines {
        let (hsn, mrp): (String, i64) = conn
            .query_row("SELECT hsn, mrp FROM items WHERE id=?1", [&l.item_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?
            .unwrap_or_default();
        if mrp > l.rate && l.qty > 0 {
            saved += (mrp - l.rate) * l.qty / 1000;
        }
        d.text(l.name.clone(), BOLD);
        let gst = if l.gst_rate > 0 { format!(" ({}%)", l.gst_rate) } else { String::new() };
        let hs = if c.show_hsn && !hsn.is_empty() { format!(" HSN {hsn}") } else { String::new() };
        d.pair(format!("  {} {} x {}{gst}{hs}", qty(l.qty), l.unit, money(l.rate)), format!("{sign}{}", money(l.amount)));
        if l.discount > 0 {
            d.pair("  Discount", format!("-{}", money(l.discount)));
        }
    }
    d.rule();
    d.pair(format!("Items {}", t.item_count), format!("Qty {}", qty(t.qty_count)));
    d.pair("Sub total", format!("{sign}{}", money(t.gross)));
    if t.discount > 0 {
        d.pair("Discount", format!("-{}", money(t.discount)));
    }
    if t.round_off != 0 {
        d.pair("Round off", format!("{}{}", if t.round_off > 0 { "+" } else { "-" }, money(t.round_off.abs())));
    }
    d.push(Op::Rule('='));
    d.pair_styled(if refund { "REFUND" } else { "TOTAL" }, format!("Rs {sign}{}", money(t.grand)), Style::NORMAL.bold().big());
    d.push(Op::Rule('='));
    if !c.composition && c.show_gst_summary && !t.slabs.is_empty() {
        gst_table(d, c, &t.slabs);
        d.rule();
    }
    Ok(saved)
}

// ---------------------------------------------------------------- documents

pub struct Printable {
    pub doc: Doc,
    pub title: String,
    pub has_cash: bool,
}

fn upi_uri(c: &Config, amount: i64, note: &str) -> String {
    let enc = |s: &str| s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
    format!("upi://pay?pa={}&pn={}&am={}.{:02}&cu=INR&tn={}", enc(&c.upi_id), enc(&c.shop_name), amount / 100, amount % 100, enc(note))
}

pub fn bill_doc(conn: &Connection, c: &Config, bill_id: &str, duplicate: bool, change: i64) -> Result<Printable> {
    let Some(b) = bills::get_bill(conn, bill_id)? else { return invalid("This bill was not found.") };
    let cust: Option<(String, String, String, String, String)> = match &b.customer_id {
        Some(id) => conn
            .query_row("SELECT type,business,gstin,phone,address FROM customers WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
            .optional()?,
        None => None,
    };
    let b2b_gstin = cust.as_ref().map(|x| x.2.clone()).unwrap_or_default();
    let supply_only = c.composition || (b.totals.gst == 0 && b.lines.iter().all(|l| l.gst_rate == 0));
    let title = if supply_only { "BILL OF SUPPLY" } else if !b2b_gstin.is_empty() { "TAX INVOICE (B2B)" } else { "TAX INVOICE" };
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text(title, TITLE);
    if b.status == "cancelled" {
        stamp(&mut d, "CANCELLED");
    }
    if duplicate {
        stamp(&mut d, "DUPLICATE COPY");
    }
    d.rule();
    let (date, time) = when(&b.at);
    d.pair(format!("No: {}", b.number), date);
    d.pair(format!("Cashier: {}", b.cashier), time);
    if b.customer_name != "Walk-in" && !b.customer_name.is_empty() {
        let business = cust.as_ref().map(|x| x.1.clone()).filter(|s| !s.is_empty());
        d.line(format!("Customer: {}", business.as_deref().unwrap_or(&b.customer_name)));
        if let Some((_, _, gstin, phone, addr)) = &cust {
            if !gstin.is_empty() {
                d.line(format!("Customer GSTIN: {gstin}"));
            }
            if !addr.is_empty() {
                d.line(addr.clone());
            }
            if !phone.is_empty() {
                d.line(format!("Ph: {phone}"));
            }
        }
    }
    d.rule();
    let saved = body(&mut d, c, conn, &b.lines, &b.totals, false)?;
    if !b.payments.is_empty() {
        for p in &b.payments {
            let r = p.r#ref.as_deref().filter(|r| !r.is_empty()).map(|r| format!(" ({})", r.chars().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<String>())).unwrap_or_default();
            let label = if p.mode == "credit_note" && p.r#ref.as_deref() == Some(crate::loyalty::POINTS_REF) { "POINTS".to_string() } else { format!("{}{r}", mode_label(&p.mode)) };
            d.pair(label, money(p.amount));
        }
        if change > 0 {
            d.pair("Change given", money(change));
        }
        d.rule();
    }
    // loyalty: points this bill earned and the balance now
    if let Some(cid) = &b.customer_id {
        let (earned, redeemed): (i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN kind='earn' THEN points END),0), COALESCE(SUM(CASE WHEN kind='redeem' THEN -points END),0) FROM points_ledger WHERE bill_id=?1",
            [b.id.trim_start_matches('b').parse::<i64>().unwrap_or(0)],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if crate::loyalty::rules(conn).enabled && (earned > 0 || redeemed > 0) {
            d.pair(format!("Points earned {earned}"), format!("Balance {}", crate::loyalty::balance(conn, cid)?));
            if redeemed > 0 {
                d.line(format!("Points used {redeemed}"));
            }
            d.rule();
        }
    }
    if c.show_savings && saved > 0 {
        d.text(format!("You saved Rs {} on MRP", money(saved)), TITLE);
        d.rule();
    }
    if supply_only && c.composition {
        d.text("Composition taxable person, not eligible to collect tax on supplies.", Style::NORMAL.center());
    }
    if !c.footer.is_empty() {
        d.text(c.footer.clone(), Style::NORMAL.center());
    }
    if c.show_qr {
        if c.upi_id.is_empty() {
            d.push(Op::Qr(b.number.clone()));
        } else {
            d.text("Scan to pay by UPI", Style::NORMAL.center());
            d.push(Op::Qr(upi_uri(c, b.totals.grand, &b.number)));
        }
    }
    d.push(Op::Barcode(b.number.clone()));
    d.text(b.number.clone(), Style::NORMAL.center());
    if duplicate {
        stamp(&mut d, "DUPLICATE COPY");
    }
    let has_cash = b.payments.iter().any(|p| p.mode == "cash" && p.amount > 0);
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: format!("Bill {}", b.number), has_cash })
}

pub fn credit_note_doc(conn: &Connection, c: &Config, id: &str, duplicate: bool) -> Result<Printable> {
    let notes = billops::list_credit_notes(conn, 1000)?;
    let Some(n) = notes.into_iter().find(|n| n.id == id || n.number == id) else { return invalid("This credit note was not found.") };
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text("CREDIT NOTE", TITLE);
    if duplicate {
        stamp(&mut d, "DUPLICATE COPY");
    }
    d.rule();
    let (date, time) = when(&n.at);
    d.pair(format!("No: {}", n.number), date);
    d.pair(format!("By: {}", n.by), time);
    d.line(format!("Against bill {}", n.bill_number));
    if n.customer_name != "Walk-in" && !n.customer_name.is_empty() {
        d.line(format!("Customer: {}", n.customer_name));
    }
    if !n.reason.is_empty() {
        d.line(format!("Reason: {}", n.reason));
    }
    d.rule();
    body(&mut d, c, conn, &n.lines, &n.totals, true)?;
    d.pair(
        "Refund by",
        match n.refund_mode.as_str() {
            "cash" => "CASH",
            "upi" => "UPI",
            "credit_note" => "CREDIT NOTE",
            "exchange" => "EXCHANGE CREDIT",
            _ => "OTHER",
        },
    );
    d.rule();
    if !c.footer.is_empty() {
        d.text(c.footer.clone(), Style::NORMAL.center());
    }
    d.push(Op::Barcode(n.number.clone()));
    d.text(n.number.clone(), Style::NORMAL.center());
    let has_cash = n.refund_mode == "cash";
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: format!("Credit note {}", n.number), has_cash })
}

fn summary_lines(d: &mut Doc, c: &Config, s: &ShiftSummary) {
    let (od, ot) = when(&s.opened_at);
    d.pair("Counter", s.counter.clone());
    d.pair(format!("Opened by {}", s.opened_by), format!("{od} {ot}"));
    d.rule();
    d.pair("Bills", s.bill_count.to_string());
    d.pair("Items sold", s.item_count.to_string());
    d.pair_styled("SALES", money(s.sales), BOLD);
    d.pair("  Cash", money(s.by_mode.cash));
    d.pair("  UPI", money(s.by_mode.upi));
    d.pair("  Card", money(s.by_mode.card));
    d.pair("  Credit", money(s.by_mode.credit));
    d.pair("Discounts given", money(s.discounts));
    d.pair(format!("Returns ({})", s.returns_count), format!("-{}", money(s.returns_amount)));
    d.pair(format!("Cancelled bills ({})", s.cancel_count), format!("-{}", money(s.cancel_amount)));
    d.rule();
    if !s.slabs.is_empty() {
        gst_table(d, c, &s.slabs);
        d.rule();
    }
    // Expenses: by category, cash and other, so the drawer line below can be traced.
    d.text("EXPENSES", BOLD);
    if s.expense_lines.is_empty() {
        d.pair("  None today", money(0));
    }
    for e in &s.expense_lines {
        let other = if e.other > 0 { format!(" (+{} other)", money(e.other)) } else { String::new() };
        d.pair(format!("  {} x{}{other}", e.category, e.count), money(e.cash));
    }
    d.pair(format!("  Paid from drawer ({})", s.expenses_count), money(s.expenses_cash));
    d.pair(format!("  Paid by UPI/bank ({}), not in drawer", s.expenses_other_count), money(s.expenses_other));
    d.rule();
    // The drawer: every movement on its own line; the lines add up to the expected cash exactly.
    d.text("CASH DRAWER", BOLD);
    d.pair("  Opening cash", money(s.opening_cash));
    d.pair("+ Cash sales", money(s.by_mode.cash));
    d.pair("+ Cash added", money(s.cash_in - s.collections_cash));
    d.pair("+ Customer collections", money(s.collections_cash));
    d.pair("- Cash taken out", money(s.cash_out - s.supplier_cash));
    d.pair("- Supplier payments", money(s.supplier_cash));
    d.pair("- Cash refunds", money(s.cash_refunds));
    d.pair(format!("- Expenses (cash) ({})", s.expenses_count), money(s.expenses_cash));
    d.push(Op::Rule('='));
    d.pair_styled("= EXPECTED CASH", money(s.expected_cash), BOLD);
    d.push(Op::Rule('='));
}

pub fn x_report_doc(conn: &Connection, c: &Config) -> Result<Printable> {
    let s = crate::shift::shift_summary(conn)?;
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text("X REPORT (day so far)", TITLE);
    d.text("The day is still open", Style::NORMAL.center());
    d.rule();
    let (date, time) = when(&s.at);
    d.pair(format!("Printed {date}"), time);
    summary_lines(&mut d, c, &s);
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: "X report".into(), has_cash: false })
}

pub fn z_report_doc(c: &Config, z: &ZReport, duplicate: bool) -> Result<Printable> {
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text(format!("Z REPORT {}", z.number), TITLE);
    if duplicate {
        stamp(&mut d, "DUPLICATE COPY");
    }
    d.rule();
    let (date, time) = when(&z.closed_at);
    d.pair(format!("Closed {date}"), time);
    d.pair("Closed by", z.closed_by.clone());
    if !z.approved_by.is_empty() {
        d.pair("Approved by", z.approved_by.clone());
    }
    summary_lines(&mut d, c, &z.summary);
    d.pair("Cash counted", money(z.counted));
    d.pair("Cash expected", money(z.expected));
    d.pair_styled(if z.difference == 0 { "DIFFERENCE" } else if z.difference > 0 { "OVER" } else { "SHORT" }, money(z.difference.abs()), BOLD);
    d.rule();
    d.line("Cashier sign: ____________________");
    d.push(Op::Blank(1));
    d.line("Manager sign: ___________________");
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: format!("Z report {}", z.number), has_cash: false })
}

pub fn expense_doc(conn: &Connection, c: &Config, id: &str) -> Result<Printable> {
    type Row = (String, String, String, String, i64, String, String, String, String, String);
    let row: Option<Row> = conn
        .query_row(
            "SELECT number,at,category_name,paid_from,amount,paid_to,note,by_name,approved_by,status FROM expenses WHERE number=?1 OR CAST(id AS TEXT)=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?)),
        )
        .optional()?;
    let Some((number, at, cat, from, amount, to, note, by, appr, status)) = row else { return invalid("This expense was not found.") };
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text("EXPENSE VOUCHER", TITLE);
    if status == "void" {
        stamp(&mut d, "VOID");
    }
    d.rule();
    let (date, time) = when(&at);
    d.pair(format!("No: {number}"), date);
    d.pair(format!("Entered by: {by}"), time);
    d.pair("Category", cat);
    if !to.is_empty() {
        d.pair("Paid to", to);
    }
    d.pair("Paid from", mode_label(&from));
    if !note.is_empty() {
        d.line(format!("Note: {note}"));
    }
    if !appr.is_empty() {
        d.line(format!("Approved by: {appr}"));
    }
    d.push(Op::Rule('='));
    d.pair_styled("AMOUNT", format!("Rs {}", money(amount)), Style::NORMAL.bold().big());
    d.push(Op::Rule('='));
    d.push(Op::Blank(1));
    d.line("Receiver sign: __________________");
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: format!("Expense {number}"), has_cash: false })
}

pub fn receipt_doc(conn: &Connection, c: &Config, receipt: &str) -> Result<Printable> {
    type Row = (String, String, i64, String, String, String, String, String, i64);
    // "latest:<customerId>" prints the receipt that was just written for that customer
    let latest: Option<String> = match receipt.strip_prefix("latest:") {
        Some(cid) => conn.query_row("SELECT receipt FROM customer_payments WHERE customer_id=?1 ORDER BY id DESC LIMIT 1", [cid], |r| r.get(0)).optional()?,
        None => None,
    };
    let receipt = latest.as_deref().unwrap_or(receipt);
    let row: Option<Row> = conn
        .query_row(
            "SELECT p.receipt,p.at,p.amount,p.mode,p.ref,p.note,p.by_name,cu.name,cu.outstanding FROM customer_payments p JOIN customers cu ON cu.id=p.customer_id
             WHERE p.receipt=?1 OR CAST(p.id AS TEXT)=?1",
            [receipt],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
        )
        .optional()?;
    let Some((no, at, amount, mode, rf, note, by, name, outstanding)) = row else { return invalid("This receipt was not found.") };
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text("PAYMENT RECEIPT", TITLE);
    d.rule();
    let (date, time) = when(&at);
    d.pair(format!("No: {no}"), date);
    d.pair(format!("Received by: {by}"), time);
    d.line(format!("Received with thanks from {name}"));
    d.pair("Paid by", if rf.is_empty() { mode_label(&mode).to_string() } else { format!("{} ({rf})", mode_label(&mode)) });
    if !note.is_empty() {
        d.line(format!("Note: {note}"));
    }
    d.push(Op::Rule('='));
    d.pair_styled("RECEIVED", format!("Rs {}", money(amount)), Style::NORMAL.bold().big());
    d.push(Op::Rule('='));
    d.pair("Balance still due", money(outstanding));
    d.rule();
    if !c.footer.is_empty() {
        d.text(c.footer.clone(), Style::NORMAL.center());
    }
    let has_cash = mode == "cash";
    finish(&mut d, c, true);
    Ok(Printable { doc: d, title: format!("Receipt {no}"), has_cash })
}

/// A sample bill with the awkward cases (long names, discount, big amounts, QR, barcode) for the Settings "Print test bill".
pub fn test_doc(c: &Config) -> Printable {
    let mut d = Doc::new();
    header(&mut d, c);
    d.rule();
    d.text("TEST PRINT", TITLE);
    d.text(format!("{} paper, {} columns", if c.paper == Paper::Mm80 { "80 mm" } else { "58 mm" }, c.paper.cols()), Style::NORMAL.center());
    d.rule();
    d.pair_styled("Item", "Amount", BOLD);
    d.text("Wood Pressed Groundnut Oil 1 Litre Pet Bottle Premium", BOLD);
    d.pair("  2 x 340.00 (5%)", "680.00");
    d.text("Sesame Oil", BOLD);
    d.pair("  0.5 L x 520.00 (5%)", "260.00");
    d.pair("  Discount", "-10.00");
    d.rule();
    d.pair_styled("TOTAL", "Rs 930.00", Style::NORMAL.bold().big());
    d.rule();
    d.text("Printer is working. Tamil item names print in English on this printer.", Style::NORMAL.center());
    if c.show_qr {
        d.push(Op::Qr("GOKUL-TEST".into()));
    }
    d.push(Op::Barcode("TEST123456".into()));
    d.text("TEST123456", Style::NORMAL.center());
    finish(&mut d, c, true);
    Printable { doc: d, title: "Test print".into(), has_cash: false }
}

// ---------------------------------------------------------------- sending

pub fn render_bytes(p: &Printable, c: &Config, drawer: bool) -> Vec<u8> {
    let mut items = gokul_print::layout(&p.doc, c.paper);
    if drawer {
        items.insert(0, Item::Drawer);
    }
    let logo = if c.print_logo { gokul_print::logo::cached(c.logo_png.as_deref(), if c.paper == Paper::Mm80 { 200 } else { 160 }) } else { None };
    let opts = escpos::Options { paper: c.paper, logo: logo.as_deref(), feed_before_cut: 4 };
    let one = escpos::render(&items, &opts);
    let mut out = Vec::with_capacity(one.len() * c.copies as usize);
    for i in 0..c.copies.max(1) {
        // the drawer only needs to open once
        if i == 0 {
            out.extend_from_slice(&one);
        } else if drawer {
            let mut again = items.clone();
            again.remove(0);
            out.extend_from_slice(&escpos::render(&again, &opts));
        } else {
            out.extend_from_slice(&one);
        }
    }
    out
}

/// Sends a built document to the chosen printer in the chosen mode. `Err` text finishes "Printing failed: ...".
pub fn send(p: &Printable, c: &Config, drawer: bool) -> std::result::Result<(), String> {
    match c.mode {
        Mode::Escpos => gokul_print::send_raw(&c.printer, &p.title, &render_bytes(p, c, drawer)),
        Mode::Driver => {
            if c.printer.trim().is_empty() {
                return Err("no printer is chosen. Pick one in Gokul Office, Settings, Printers".into());
            }
            let items = gokul_print::layout(&p.doc, c.paper);
            let logo = if c.print_logo { gokul_print::logo::cached(c.logo_png.as_deref(), 200) } else { None };
            for _ in 0..c.copies.max(1) {
                let out = c.printer.strip_prefix("FILE:").map(std::path::Path::new);
                let target = if out.is_some() { "Microsoft Print to PDF" } else { c.printer.as_str() };
                gokul_print::gdi::print(target, out, &p.title, &items, c.paper, logo.as_deref())?;
            }
            Ok(())
        }
    }
}

fn result(ok: bool, message: impl Into<String>) -> Value {
    json!({ "ok": ok, "message": message.into() })
}

/// `printDocument(kind, id, opts)`: kind is bill, creditNote, xreport, zreport, expense, receipt or drawer.
/// opts: duplicate (reprint), auto (right after a sale: honours "print automatically" and the drawer setting),
/// change (paise given back), payload (the Z report that was just closed).
/// Never returns an error for a printing problem: the answer is `{ ok, message }` so a bill stays saved and the screen can say why.
pub fn print_document(db: &Db, kind: &str, id: &str, opts: &Value) -> Value {
    // 1) build the paper under the lock (fast), 2) send it with the lock released
    let built = db.with(|conn| {
        let c = load_config(conn)?;
        let duplicate = opts["duplicate"].as_bool().unwrap_or(false);
        let auto = opts["auto"].as_bool().unwrap_or(false);
        let p = match kind {
            "bill" => {
                if auto && !c.auto_print {
                    // no paper, but a cash sale still opens the drawer
                    let b = bills::get_bill(conn, id)?;
                    let cash = b.map(|b| b.payments.iter().any(|p| p.mode == "cash" && p.amount > 0)).unwrap_or(false);
                    let drawer = cash && c.drawer_on_cash;
                    return Ok((c, None, drawer));
                }
                bill_doc(conn, &c, id, duplicate, opts["change"].as_i64().unwrap_or(0))?
            }
            "creditNote" => credit_note_doc(conn, &c, id, duplicate)?,
            "xreport" => x_report_doc(conn, &c)?,
            "zreport" => {
                let z: ZReport = serde_json::from_value(opts["payload"].clone()).map_err(|_| crate::error::ApiError::Invalid("The Z report to print is missing.".into()))?;
                z_report_doc(&c, &z, duplicate)?
            }
            "expense" => expense_doc(conn, &c, id)?,
            "receipt" => receipt_doc(conn, &c, id)?,
            "drawer" => return Ok((c, None, true)),
            _ => return invalid(format!("Cannot print '{kind}'")),
        };
        let drawer = c.drawer_on_cash && p.has_cash && (kind == "bill" || kind == "creditNote") && !duplicate;
        Ok((c, Some(p), drawer))
    });
    let (c, doc, drawer) = match built {
        Ok(x) => x,
        Err(e) => return result(false, e.to_string()),
    };
    let Some(doc) = doc else {
        // drawer only
        if !drawer {
            return result(true, "Not printed (automatic printing is off).");
        }
        let r = if c.printer.is_empty() { Err("no printer is chosen".to_string()) } else { gokul_print::send_raw(&c.printer, "Drawer", &escpos::drawer_only()) };
        return match r {
            Ok(()) => result(true, "Cash drawer opened."),
            Err(e) => result(false, e),
        };
    };
    match send(&doc, &c, drawer) {
        Ok(()) => result(true, format!("{} sent to {}.", doc.title, if c.printer.is_empty() { "the printer" } else { &c.printer })),
        Err(e) => result(false, e),
    }
}

/// `testPrint`: a real test page on the chosen printer, with the paper and mode from the Settings screen.
pub fn test_print(db: &Db, kind: &str, printer: &str, opts: &Value) -> Value {
    if kind != "bill" {
        return result(false, "Barcode label printers use TSPL and are set up on the Barcode labels screen. Only the bill printer can be tested here.");
    }
    let c = db.with(|conn| load_config(conn));
    let mut c = match c {
        Ok(c) => c,
        Err(e) => return result(false, e.to_string()),
    };
    if !printer.trim().is_empty() {
        c.printer = printer.to_string();
    }
    if let Some(p) = opts["paper"].as_str() {
        c.paper = Paper::from_setting(p);
    }
    if opts["mode"].as_str() == Some("driver") {
        c.mode = Mode::Driver;
    } else if opts["mode"].as_str() == Some("escpos") {
        c.mode = Mode::Escpos;
    }
    if let Some(l) = opts["printLogo"].as_bool() {
        c.print_logo = l;
    }
    c.copies = 1;
    let p = test_doc(&c);
    match send(&p, &c, false) {
        Ok(()) => result(true, format!("Test bill sent to {}. If paper came out, the printer is set up correctly.", c.printer)),
        Err(e) => result(false, format!("Test print failed: {e}.")),
    }
}

/// The real state of the bill printer for the top bar and the login screen: configured and reachable.
pub fn printer_status(db: &Db) -> Value {
    let c = match db.with(|conn| load_config(conn)) {
        Ok(c) => c,
        Err(e) => return json!({ "configured": false, "ready": false, "state": "error", "name": "", "mode": "escpos", "message": e.to_string() }),
    };
    let mode = if c.mode == Mode::Driver { "driver" } else { "escpos" };
    if c.printer.trim().is_empty() {
        return json!({ "configured": false, "ready": false, "state": "none", "name": "", "mode": mode,
                       "message": "No printer chosen. Pick one in Gokul Office, Settings, Printers." });
    }
    let st = gokul_print::printer_state(&c.printer);
    let ready = st.is_ready();
    let message = if ready { format!("{} is ready", c.printer) } else { format!("{} is {}", c.printer, st.describe()) };
    json!({ "configured": true, "ready": ready, "state": st.as_str(), "name": c.printer, "mode": mode, "message": message })
}

/// Installed printers for Settings (replaces the fake list): name, kind, ready flag, state, port and driver.
pub fn detected_printers() -> Vec<Value> {
    gokul_print::list_printers()
        .into_iter()
        .map(|p| {
            json!({ "name": p.name, "kind": match p.kind { PrinterKind::Thermal => "thermal", PrinterKind::Label => "label", PrinterKind::Other => "other" },
                    "ready": p.state.is_ready(), "state": p.state.as_str(), "port": p.port, "driver": p.driver, "isDefault": p.is_default,
                    "note": if p.state.is_ready() { "" } else { p.state.describe() } })
        })
        .collect()
}
