//! GST tax invoices, bills of supply and credit notes: one set of facts (`TaxDoc`) drawn twice, on a thermal roll (58 or 80 mm) and on
//! an A4 sheet, so the two always carry the same Rule 46 particulars. Nothing here writes to the database.
//!
//! What a tax invoice carries (CGST Rule 46, confirm with CA): the supplier's name, address and GSTIN; the invoice number and date;
//! the recipient's name, address and GSTIN (a registered buyer, B2B) and the state of supply (name and code); for every line its HSN,
//! description, quantity, unit, total value, discount, taxable value, tax rate and tax amount (CGST and SGST, or IGST, and cess);
//! the totals, the amount in words, whether tax is payable on reverse charge, and a signature. A bill of supply carries the same
//! without tax. A credit note carries the number series, date, the original invoice's number and date, and the tax reversed.

use crate::printing::{money, print_number, Config};
use crate::types::*;
use gokul_print::{Align, Doc, Op, Style};
use std::collections::BTreeMap;

const BOLD: Style = Style::NORMAL.bold();
const TITLE: Style = Style::NORMAL.bold().center();
const BIG: Style = Style::NORMAL.bold().big().center();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocKind {
    TaxInvoice,
    BillOfSupply,
    CreditNote,
}

/// A consumer bill from this amount up carries the buyer's name, address and state too (confirm with CA: Rs 50,000).
pub const B2C_DETAILS_FROM: i64 = 5_000_000;

#[derive(Debug, Clone)]
pub struct TaxDoc {
    pub kind: DocKind,
    /// The number as printed ("26/00123", or a credit note's "CN-26-000001")
    pub number: String,
    pub at: String,
    /// Credit note: the invoice it is against (printed number and its date)
    pub against: Option<(String, String)>,
    pub reason: String,
    pub recipient_name: String,
    pub recipient_address: String,
    pub recipient_gstin: String,
    pub recipient_phone: String,
    /// GST state code of the place of supply
    pub place: String,
    pub inter: bool,
    pub lines: Vec<BillLine>,
    pub totals: BillTotals,
    pub payments: Vec<Payment>,
    pub change: i64,
    pub counter: String,
    /// "CASH", "UPI" ... for a credit note's refund
    pub refund_by: String,
    pub duplicate: bool,
    pub cancelled: bool,
}

impl TaxDoc {
    pub fn is_b2b(&self) -> bool {
        !self.recipient_gstin.is_empty()
    }
}

/// Bill of supply only when every line is exempt or nil rated (0%) and no cess is charged; a mixed cart is a tax invoice.
pub fn is_bill_of_supply(composition: bool, lines: &[BillLine], totals: &BillTotals) -> bool {
    composition || (totals.gst == 0 && totals.cess == 0 && lines.iter().all(|l| l.gst_rate == 0.0 && l.cess_rate == 0.0))
}

pub fn from_bill(c: &Config, b: &Bill, duplicate: bool, change: i64) -> TaxDoc {
    let kind = if is_bill_of_supply(c.composition, &b.lines, &b.totals) { DocKind::BillOfSupply } else { DocKind::TaxInvoice };
    let walk_in = b.customer_name == "Walk-in" || b.customer_name.is_empty();
    TaxDoc {
        kind,
        number: print_number(c, &b.number),
        at: b.at.clone(),
        against: None,
        reason: String::new(),
        recipient_name: if walk_in { String::new() } else { b.customer_name.clone() },
        recipient_address: b.extras.customer_address.clone(),
        recipient_gstin: b.extras.customer_gstin.clone(),
        recipient_phone: String::new(),
        place: b.extras.place_of_supply.clone(),
        inter: b.extras.supply_type == "inter",
        lines: b.lines.clone(),
        totals: b.totals.clone(),
        payments: b.payments.clone(),
        change,
        counter: if b.counter.is_empty() { b.cashier.clone() } else { b.counter.clone() },
        refund_by: String::new(),
        duplicate,
        cancelled: b.status == "cancelled",
    }
}

pub fn from_credit_note(c: &Config, n: &CreditNote, duplicate: bool) -> TaxDoc {
    let walk_in = n.customer_name == "Walk-in" || n.customer_name.is_empty();
    TaxDoc {
        kind: DocKind::CreditNote,
        number: n.number.clone(),
        at: n.at.clone(),
        against: Some((print_number(c, &n.bill_number), n.bill_at.clone())),
        reason: n.reason.clone(),
        recipient_name: if walk_in { String::new() } else { n.customer_name.clone() },
        recipient_address: n.customer_address.clone(),
        recipient_gstin: n.customer_gstin.clone(),
        recipient_phone: String::new(),
        place: n.place_of_supply.clone(),
        inter: n.supply_type == "inter",
        lines: n.lines.clone(),
        totals: n.totals.clone(),
        payments: vec![],
        change: 0,
        counter: String::new(),
        refund_by: match n.refund_mode.as_str() {
            "cash" => "CASH",
            "upi" => "UPI",
            "credit_note" => "CREDIT NOTE",
            "exchange" => "EXCHANGE CREDIT",
            _ => "OTHER",
        }
        .into(),
        duplicate,
        cancelled: false,
    }
}

// ---------------------------------------------------------------- words and small helpers

const ONES: [&str; 20] = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
];
const TENS: [&str; 10] = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

fn below_100(n: u64) -> String {
    if n < 20 {
        ONES[n as usize].to_string()
    } else {
        let (t, o) = (TENS[(n / 10) as usize], ONES[(n % 10) as usize]);
        if o.is_empty() { t.to_string() } else { format!("{t} {o}") }
    }
}

fn below_1000(n: u64) -> String {
    let (h, r) = (n / 100, n % 100);
    let mut parts: Vec<String> = vec![];
    if h > 0 {
        parts.push(format!("{} Hundred", ONES[h as usize]));
    }
    if r > 0 {
        parts.push(below_100(r));
    }
    parts.join(" ")
}

/// A whole number in the Indian system: crore, lakh, thousand.
pub fn words_indian(mut n: u64) -> String {
    if n == 0 {
        return "Zero".into();
    }
    let mut parts: Vec<String> = vec![];
    for (div, name) in [(10_000_000u64, "Crore"), (100_000, "Lakh"), (1000, "Thousand")] {
        let q = n / div;
        n %= div;
        if q > 0 {
            parts.push(format!("{} {name}", if q >= 100 && name == "Crore" { words_indian(q) } else { below_100(q) }));
        }
    }
    if n > 0 {
        parts.push(below_1000(n));
    }
    parts.join(" ")
}

/// 123456 paise -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only"
pub fn amount_in_words(paise: i64) -> String {
    let neg = paise < 0;
    let p = paise.unsigned_abs();
    let (r, ps) = (p / 100, p % 100);
    let mut s = format!("{}Rupees {}", if neg { "Minus " } else { "" }, words_indian(r));
    if ps > 0 {
        s.push_str(&format!(" and {} Paise", below_100(ps)));
    }
    s.push_str(" Only");
    s
}

fn when(at: &str) -> String {
    crate::db::parse_iso(at).map(|d| d.format("%d-%m-%Y").to_string()).unwrap_or_else(|| at.chars().take(10).collect())
}

fn time(at: &str) -> String {
    crate::db::parse_iso(at).map(|d| d.format("%I:%M %p").to_string()).unwrap_or_default()
}

fn qty(q: i64) -> String {
    if q % 1000 == 0 { (q / 1000).to_string() } else { format!("{:.3}", q as f64 / 1000.0).trim_end_matches('0').to_string() }
}

fn rate_txt(r: f64) -> String {
    crate::gst::rates_text(&[r]).trim_end_matches('%').to_string()
}

fn place_text(code: &str) -> String {
    match crate::gst::state_name(code) {
        Some(n) => format!("{n} ({code})"),
        None => code.to_string(),
    }
}

fn state_text(code: &str) -> String {
    place_text(code)
}

/// "Supply of goods" tax wording used under the totals: rate of each head for a slab, e.g. "CGST 2.5% + SGST 2.5%".
fn head_label(inter: bool, rate: f64) -> String {
    if inter {
        format!("IGST {}%", rate_txt(rate))
    } else {
        format!("CGST {0}% + SGST {0}%", rate_txt(rate / 2.0))
    }
}

/// HSN and rate wise tax summary, from the tax saved on each line.
#[derive(Debug, Clone, Default)]
pub struct HsnRow {
    pub hsn: String,
    pub rate: f64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    pub igst: i64,
    pub cess: i64,
}

pub fn hsn_summary(lines: &[BillLine]) -> Vec<HsnRow> {
    let mut m: BTreeMap<(String, i64), HsnRow> = BTreeMap::new();
    for l in lines {
        let Some(t) = &l.tax else { continue };
        let r = m.entry((l.hsn.clone(), crate::money::rate_bp(l.gst_rate))).or_insert_with(|| HsnRow { hsn: l.hsn.clone(), rate: l.gst_rate, ..Default::default() });
        r.taxable += t.taxable;
        r.cgst += t.cgst;
        r.sgst += t.sgst;
        r.igst += t.igst;
        r.cess += t.cess;
    }
    m.into_values().collect()
}

fn title_of(t: &TaxDoc) -> &'static str {
    match t.kind {
        DocKind::TaxInvoice => "TAX INVOICE",
        DocKind::BillOfSupply => "BILL OF SUPPLY",
        DocKind::CreditNote => "CREDIT NOTE",
    }
}

fn shop_header(d: &mut Doc, c: &Config, big_name: bool) {
    if c.print_logo {
        d.push(Op::Logo);
    }
    d.text(c.shop_name.to_uppercase(), if big_name { BIG } else { TITLE });
    if !c.address.is_empty() {
        d.text(c.address.clone(), Style::NORMAL.center());
    }
    if !c.gstin.is_empty() {
        d.text(format!("GSTIN: {}", c.gstin), TITLE);
    }
    let mut contact = vec![];
    if !c.phone.is_empty() {
        contact.push(format!("Mobile: {}", c.phone));
    }
    if !c.fssai.is_empty() {
        contact.push(format!("FSSAI: {}", c.fssai));
    }
    if !contact.is_empty() {
        d.text(contact.join("   "), Style::NORMAL.center());
    }
}

fn stamp(d: &mut Doc, text: &str) {
    d.text(format!("*** {text} ***"), TITLE);
}

fn recipient_lines(t: &TaxDoc) -> Vec<String> {
    let mut v = vec![];
    if !t.recipient_name.is_empty() {
        v.push(format!("Name: {}", t.recipient_name));
    } else if t.is_b2b() {
        v.push("Name: -".into());
    }
    if !t.recipient_address.is_empty() {
        v.push(format!("Address: {}", t.recipient_address));
    }
    if t.is_b2b() {
        v.push(format!("GSTIN: {}", t.recipient_gstin));
    }
    if !t.place.is_empty() {
        v.push(format!("State: {}", state_text(&t.place)));
    }
    v
}

fn payments_text(t: &TaxDoc) -> Vec<(String, i64)> {
    t.payments
        .iter()
        .filter(|p| p.amount > 0)
        .map(|p| {
            let label = match p.mode.as_str() {
                "cash" => "CASH",
                "upi" => "UPI",
                "card" => "CARD",
                "credit" => "CREDIT (PAY LATER)",
                "credit_note" => "CREDIT NOTE",
                "points" => "POINTS",
                "sodexo" => "SODEXO",
                _ => "OTHER",
            };
            (label.to_string(), p.amount)
        })
        .collect()
}

// ---------------------------------------------------------------- thermal (58 / 80 mm)

/// The tax invoice, bill of supply or credit note on a roll. `cols` is 48 or 32.
pub fn render_thermal(c: &Config, t: &TaxDoc, cols: usize) -> Doc {
    let mut d = Doc::new();
    shop_header(&mut d, c, true);
    d.rule();
    d.text(title_of(t), BIG);
    if t.duplicate {
        stamp(&mut d, "DUPLICATE COPY");
    }
    if t.cancelled {
        stamp(&mut d, "CANCELLED");
    }
    d.rule();
    let date = when(&t.at);
    let label = if t.kind == DocKind::CreditNote { "Credit Note No" } else { "Invoice No" };
    if cols >= 40 {
        d.pair(format!("{label} : {}", t.number), format!("Date : {date}"));
        d.pair(if t.counter.is_empty() { String::new() } else { format!("Counter : {}", t.counter) }, format!("Time : {}", time(&t.at)));
    } else {
        d.line(format!("{label} : {}", t.number));
        d.pair(format!("Date : {date}"), time(&t.at));
    }
    if let Some((no, at)) = &t.against {
        d.line(format!("Against Invoice No : {no}"));
        d.line(format!("Invoice Date : {}", when(at)));
        if !t.reason.is_empty() {
            d.line(format!("Reason : {}", t.reason));
        }
    }
    if t.kind != DocKind::BillOfSupply {
        d.line(format!("Place of supply : {}", place_text(&t.place)));
    }
    d.line("Reverse charge : No");
    d.rule();
    let rl = recipient_lines(t);
    if !rl.is_empty() {
        d.text(if t.kind == DocKind::CreditNote { "Credit note issued to" } else { "Bill to" }, BOLD);
        for l in rl {
            d.line(l);
        }
        d.rule();
    }
    // lines: name, HSN, then quantity x rate, then the taxable value and the tax
    d.pair_styled("Item", "Amount", BOLD);
    let sign = if t.kind == DocKind::CreditNote { "-" } else { "" };
    let tax_doc = t.kind != DocKind::BillOfSupply;
    for l in &t.lines {
        d.text(l.name.clone(), BOLD);
        let hs = if l.hsn.is_empty() { String::new() } else { format!("HSN {}  ", l.hsn) };
        d.pair(format!("  {hs}{} {} x {}", qty(l.qty), l.unit, money(l.rate)), format!("{sign}{}", money(l.amount)));
        if l.discount > 0 {
            d.pair("  Discount", format!("-{}", money(l.discount)));
        }
        if tax_doc {
            if let Some(x) = &l.tax {
                d.line(format!("  Taxable {}", money(x.taxable)));
                let mut heads: Vec<String> = vec![];
                if x.igst != 0 || t.inter {
                    heads.push(format!("IGST {}% {}", rate_txt(l.gst_rate), money(x.igst)));
                } else {
                    heads.push(format!("CGST {}% {}", rate_txt(l.gst_rate / 2.0), money(x.cgst)));
                    heads.push(format!("SGST {}% {}", rate_txt(l.gst_rate / 2.0), money(x.sgst)));
                }
                if x.cess != 0 {
                    heads.push(format!("Cess {}% {}", rate_txt(l.cess_rate), money(x.cess)));
                }
                d.line(format!("  {}", heads.join("  ")));
            }
        }
    }
    d.rule();
    let tt = &t.totals;
    d.pair(format!("Items {}", tt.item_count), format!("Qty {}", qty(tt.qty_count)));
    d.pair("Sub total", format!("{sign}{}", money(tt.gross)));
    if tt.discount > 0 {
        d.pair("Discount", format!("-{}", money(tt.discount)));
    }
    if tax_doc {
        d.pair("Taxable value", format!("{sign}{}", money(tt.taxable)));
        let (cg, sg, ig): (i64, i64, i64) = (tt.slabs.iter().map(|s| s.cgst).sum(), tt.slabs.iter().map(|s| s.sgst).sum(), tt.slabs.iter().map(|s| s.igst).sum());
        if ig != 0 || t.inter {
            d.pair("IGST", format!("{sign}{}", money(ig)));
        } else {
            d.pair("CGST", format!("{sign}{}", money(cg)));
            d.pair("SGST", format!("{sign}{}", money(sg)));
        }
        if tt.cess != 0 {
            d.pair("Cess", format!("{sign}{}", money(tt.cess)));
        }
    }
    if tt.round_off != 0 {
        d.pair("Round off", format!("{}{}", if tt.round_off > 0 { "+" } else { "-" }, money(tt.round_off.abs())));
    }
    d.push(Op::Rule('='));
    d.pair_styled(if t.kind == DocKind::CreditNote { "REFUND" } else { "TOTAL" }, format!("Rs {sign}{}", money(tt.grand)), Style::NORMAL.bold().big());
    d.push(Op::Rule('='));
    d.line(amount_in_words(tt.grand));
    d.rule();
    // HSN and rate wise tax summary
    if tax_doc && !tt.slabs.is_empty() {
        d.text("TAX SUMMARY (HSN / rate)", BOLD);
        for r in hsn_summary(&t.lines) {
            d.pair(format!("HSN {} @ {}%", if r.hsn.is_empty() { "-".to_string() } else { r.hsn.clone() }, rate_txt(r.rate)), format!("Taxable {}", money(r.taxable)));
            let mut heads: Vec<String> = vec![];
            if r.igst != 0 || t.inter {
                heads.push(format!("IGST {}", money(r.igst)));
            } else {
                heads.push(format!("CGST {}", money(r.cgst)));
                heads.push(format!("SGST {}", money(r.sgst)));
            }
            if r.cess != 0 {
                heads.push(format!("Cess {}", money(r.cess)));
            }
            d.line(format!("  {}", heads.join("  ")));
        }
        d.rule();
    }
    let pays = payments_text(t);
    if !pays.is_empty() {
        for (l, a) in pays {
            d.pair(l, money(a));
        }
        if t.change > 0 {
            d.pair("Amount Received", money(t.payments.iter().filter(|p| p.mode == "cash").map(|p| p.amount).sum::<i64>() + t.change));
            d.pair("Balance Amount", money(t.change));
        }
        d.rule();
    }
    if t.kind == DocKind::CreditNote && !t.refund_by.is_empty() {
        d.pair("Refund by", t.refund_by.clone());
        d.rule();
    }
    if c.composition && t.kind == DocKind::BillOfSupply {
        d.text("Composition taxable person, not eligible to collect tax on supplies.", Style::NORMAL.center());
    }
    d.push(Op::Blank(2));
    d.text(format!("For {}", c.shop_name.to_uppercase()), Style::NORMAL.bold().align_right());
    d.push(Op::Blank(1));
    d.text("Authorised signatory", Style::NORMAL.align_right());
    if !c.footer.is_empty() {
        d.text(c.footer.clone(), TITLE);
    }
    d.push(Op::Barcode(t.number.clone()));
    d.text(t.number.clone(), Style::NORMAL.center());
    d
}

// ---------------------------------------------------------------- A4

fn row(cells: Vec<(String, usize, Align)>, st: Style) -> Op {
    Op::Cols(cells, st)
}

fn left(s: impl Into<String>, w: usize) -> (String, usize, Align) {
    (s.into(), w, Align::Left)
}
fn right(s: impl Into<String>, w: usize) -> (String, usize, Align) {
    (s.into(), w, Align::Right)
}

/// The same document on an A4 sheet (96 columns). Landscape is not needed: figures fit on one line per item.
pub fn render_a4(c: &Config, t: &TaxDoc) -> Doc {
    let cols = 96usize;
    let mut d = Doc::new();
    shop_header(&mut d, c, true);
    d.push(Op::Rule('='));
    d.text(title_of(t), BIG);
    d.text(if t.duplicate { "(Duplicate copy)" } else { "(Original for recipient)" }, Style::NORMAL.center());
    if t.cancelled {
        stamp(&mut d, "CANCELLED");
    }
    d.push(Op::Rule('='));
    let label = if t.kind == DocKind::CreditNote { "Credit Note No" } else { "Invoice No" };
    d.pair(format!("{label} : {}", t.number), format!("Date : {}   {}", when(&t.at), time(&t.at)));
    if let Some((no, at)) = &t.against {
        d.pair(format!("Against Invoice No : {no}"), format!("Invoice Date : {}", when(at)));
        if !t.reason.is_empty() {
            d.line(format!("Reason for credit note : {}", t.reason));
        }
    }
    if t.kind != DocKind::BillOfSupply {
        d.pair(format!("Place of supply : {}", place_text(&t.place)), "Reverse charge : No");
    } else {
        d.line("Reverse charge : No");
    }
    d.rule();
    let rl = recipient_lines(t);
    if !rl.is_empty() {
        d.text(if t.kind == DocKind::CreditNote { "Credit note issued to (recipient)" } else { "Bill to (recipient)" }, BOLD);
        for l in rl {
            d.line(l);
        }
        d.rule();
    }
    let tax_doc = t.kind != DocKind::BillOfSupply;
    let sign = if t.kind == DocKind::CreditNote { "-" } else { "" };
    let has_cess = t.totals.cess != 0;
    // Column widths. Intra-state: Taxable | CGST rate+amount | SGST rate+amount. Inter-state: Taxable | IGST rate+amount.
    let (w_sl, w_hsn, w_qty, w_unit, w_rate, w_disc, w_taxable, w_pct, w_amt, w_total) = (3usize, 8usize, 8usize, 5usize, 10usize, 8usize, 11usize, 6usize, 9usize, 11usize);
    let head = |a: &str, b: &str, cc: &str, e: &str, f: &str, g: &str, h: &str| -> Vec<(String, usize, Align)> {
        let mut v = vec![left(a, w_sl), left(b, w_hsn), right(cc, w_qty), left(format!(" {e}"), w_unit), right(f, w_rate), right(g, w_disc), right(h, w_taxable)];
        if tax_doc {
            if t.inter {
                v.push(right("IGST%", w_pct));
                v.push(right("IGST", w_amt + 4));
            } else {
                v.extend([right("CGST%", w_pct), right("CGST", w_amt), right("SGST%", w_pct), right("SGST", w_amt)]);
            }
            if has_cess {
                v.push(right("Cess", w_amt));
            }
        }
        v.push((String::from("Total"), 0, Align::Right));
        v
    };
    let _ = w_total;
    d.push(row(head("Sl", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable"), BOLD));
    d.rule();
    for (i, l) in t.lines.iter().enumerate() {
        d.text(format!("{:>2}. {}", i + 1, l.name), BOLD);
        let tx = l.tax.clone().unwrap_or_default();
        let mut cells = vec![
            left("", w_sl),
            left(if l.hsn.is_empty() { "-".to_string() } else { l.hsn.clone() }, w_hsn),
            right(qty(l.qty), w_qty),
            left(format!(" {}", l.unit), w_unit),
            right(money(l.rate), w_rate),
            right(if l.discount > 0 { money(l.discount) } else { "-".into() }, w_disc),
            right(money(if tax_doc { tx.taxable } else { l.amount }), w_taxable),
        ];
        if tax_doc {
            if t.inter {
                cells.push(right(rate_txt(l.gst_rate), w_pct));
                cells.push(right(money(tx.igst), w_amt + 4));
            } else {
                cells.extend([right(rate_txt(l.gst_rate / 2.0), w_pct), right(money(tx.cgst), w_amt), right(rate_txt(l.gst_rate / 2.0), w_pct), right(money(tx.sgst), w_amt)]);
            }
            if has_cess {
                cells.push(right(money(tx.cess), w_amt));
            }
        }
        cells.push((format!("{sign}{}", money(l.amount)), 0, Align::Right));
        d.push(row(cells, Style::NORMAL));
    }
    d.rule();
    let tt = &t.totals;
    d.pair(format!("Items {}   Total quantity {}", tt.item_count, qty(tt.qty_count)), format!("Sub total  {sign}{}", money(tt.gross)));
    if tt.discount > 0 {
        d.pair("", format!("Discount  -{}", money(tt.discount)));
    }
    if tax_doc {
        d.pair("", format!("Taxable value  {sign}{}", money(tt.taxable)));
        let (cg, sg, ig): (i64, i64, i64) = (tt.slabs.iter().map(|s| s.cgst).sum(), tt.slabs.iter().map(|s| s.sgst).sum(), tt.slabs.iter().map(|s| s.igst).sum());
        if ig != 0 || t.inter {
            d.pair("", format!("IGST  {sign}{}", money(ig)));
        } else {
            d.pair("", format!("CGST  {sign}{}", money(cg)));
            d.pair("", format!("SGST  {sign}{}", money(sg)));
        }
        if tt.cess != 0 {
            d.pair("", format!("Cess  {sign}{}", money(tt.cess)));
        }
    }
    if tt.round_off != 0 {
        d.pair("", format!("Round off  {}{}", if tt.round_off > 0 { "+" } else { "-" }, money(tt.round_off.abs())));
    }
    d.push(Op::Rule('='));
    d.pair_styled(if t.kind == DocKind::CreditNote { "TOTAL REFUND" } else { "INVOICE TOTAL" }, format!("Rs {sign}{}", money(tt.grand)), BOLD);
    d.push(Op::Rule('='));
    d.line(format!("Amount in words: {}", amount_in_words(tt.grand)));
    d.rule();
    if tax_doc && !tt.slabs.is_empty() {
        d.text("Tax summary (HSN and rate wise)", BOLD);
        let mut h = vec![left("HSN", 10), right("Rate", 8), right("Taxable", 14)];
        if t.inter {
            h.push(right("IGST", 14));
        } else {
            h.extend([right("CGST", 14), right("SGST", 14)]);
        }
        if has_cess {
            h.push(right("Cess", 12));
        }
        h.push(("Total tax".into(), 0, Align::Right));
        d.push(row(h, BOLD));
        let rows = hsn_summary(&t.lines);
        let (mut a, mut b, mut cg, mut sg, mut ig, mut cs) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
        for r in &rows {
            let mut cells = vec![left(if r.hsn.is_empty() { "-".to_string() } else { r.hsn.clone() }, 10), right(format!("{}%", rate_txt(r.rate)), 8), right(money(r.taxable), 14)];
            if t.inter {
                cells.push(right(money(r.igst), 14));
            } else {
                cells.extend([right(money(r.cgst), 14), right(money(r.sgst), 14)]);
            }
            if has_cess {
                cells.push(right(money(r.cess), 12));
            }
            cells.push((money(r.cgst + r.sgst + r.igst), 0, Align::Right));
            d.push(row(cells, Style::NORMAL));
            a += r.taxable;
            b += r.cgst + r.sgst + r.igst;
            cg += r.cgst;
            sg += r.sgst;
            ig += r.igst;
            cs += r.cess;
        }
        d.rule();
        let mut cells = vec![left("Total", 10), right("", 8), right(money(a), 14)];
        if t.inter {
            cells.push(right(money(ig), 14));
        } else {
            cells.extend([right(money(cg), 14), right(money(sg), 14)]);
        }
        if has_cess {
            cells.push(right(money(cs), 12));
        }
        cells.push((money(b), 0, Align::Right));
        d.push(row(cells, BOLD));
        d.line(format!("Tax amount in words: {}", amount_in_words(b + cs)));
        d.rule();
    }
    let pays = payments_text(t);
    if !pays.is_empty() {
        d.text(format!("Payment: {}", pays.iter().map(|(l, a)| format!("{l} {}", money(*a))).collect::<Vec<_>>().join("   ")), Style::NORMAL);
    }
    if t.kind == DocKind::CreditNote && !t.refund_by.is_empty() {
        d.line(format!("Refund by: {}", t.refund_by));
    }
    d.line("Reverse charge: No");
    if t.kind == DocKind::BillOfSupply && c.composition {
        d.line("Composition taxable person, not eligible to collect tax on supplies.");
    }
    d.line("We declare that this document shows the actual price of the goods described and that all particulars are true and correct.");
    d.push(Op::Blank(2));
    d.pair("Recipient's signature", format!("For {}", c.shop_name.to_uppercase()));
    d.push(Op::Blank(2));
    d.pair("", "Authorised signatory");
    if !c.footer.is_empty() {
        d.text(c.footer.clone(), Style::NORMAL.center());
    }
    let _ = cols;
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amounts_in_words_use_the_indian_system() {
        assert_eq!(amount_in_words(0), "Rupees Zero Only");
        assert_eq!(amount_in_words(100), "Rupees One Only");
        assert_eq!(amount_in_words(5), "Rupees Zero and Five Paise Only");
        assert_eq!(amount_in_words(123_456), "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only");
        assert_eq!(amount_in_words(10_000_000), "Rupees One Lakh Only");
        assert_eq!(amount_in_words(100_000_000), "Rupees Ten Lakh Only");
        assert_eq!(amount_in_words(12_345_678_900), "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only");
        assert_eq!(amount_in_words(100_000_000_000), "Rupees One Hundred Crore Only");
        assert_eq!(amount_in_words(1_000_000_000_000), "Rupees One Thousand Crore Only");
        assert_eq!(amount_in_words(1_100), "Rupees Eleven Only");
        assert_eq!(amount_in_words(2_000_000), "Rupees Twenty Thousand Only");
        assert_eq!(amount_in_words(-5_000), "Minus Rupees Fifty Only");
    }
}
