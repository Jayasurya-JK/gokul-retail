//! Saving, loading and holding bills. A bill, its lines, payments, GST slabs, stock movements, customer
//! balance and audit entry are written in ONE transaction and committed before this function returns.

use crate::db::{self, audit, doc_number, fy_of, iso, next_seq, parse_id};
use crate::error::{invalid, ApiError, Result};
use crate::money::{cash_discount, compute_totals_with_delivery, recalc_line};
use crate::types::*;
use chrono::{DateTime, Local};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

/// Paise as rupees text for messages, e.g. 12050 -> "120.50" (integers only).
pub fn rs(p: i64) -> String {
    format!("{}.{:02}", p / 100, (p % 100).abs())
}

pub const BILL_SERIES: &str = "BILL";

/// Test-only failure injection: abort the save at a chosen point to prove nothing partial survives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    AfterBillRow,
    AfterLines,
    AfterPayments,
    AfterStock,
}

fn hit(fault: Option<Fault>, at: Fault) -> Result<()> {
    if fault == Some(at) {
        return Err(ApiError::Internal("Simulated failure".into()));
    }
    Ok(())
}

pub fn save_bill(conn: &mut Connection, draft: &BillDraft) -> Result<Bill> {
    save_bill_at(conn, draft, Local::now(), None)
}

pub fn save_bill_at(conn: &mut Connection, draft: &BillDraft, now: DateTime<Local>, fault: Option<Fault>) -> Result<Bill> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let bill = write_bill(&tx, draft, now, fault)?;
    tx.commit()?; // synchronous=FULL: on disk when this returns
    Ok(bill)
}

/// Writes every row of one bill inside the caller's open transaction (the caller commits).
/// Also used by the demo seed and the speed tests to load many bills in one transaction.
pub fn write_bill(tx: &Connection, draft: &BillDraft, now: DateTime<Local>, fault: Option<Fault>) -> Result<Bill> {
    if draft.lines.is_empty() {
        return invalid("Add at least one item before saving the bill");
    }
    if draft.lines.iter().any(|l| l.qty <= 0 || l.rate < 0 || l.discount < 0) {
        return invalid("A line has a zero or negative quantity or price");
    }
    if draft.bill_discount < 0 || draft.payments.iter().any(|p| p.amount < 0) {
        return invalid("Amounts cannot be negative");
    }
    let mut lines: Vec<BillLine> = draft.lines.iter().map(recalc_line).collect();
    let ex = &draft.extras;
    if ex.delivery_charge < 0 || !(0..=10000).contains(&ex.cash_disc_bps) {
        return invalid("Delivery charge or cash discount is not valid");
    }

    let settings = db::load_settings(tx)?;
    check_line_rates(tx, &lines)?;
    let cash_disc = cash_discount(&lines, ex.cash_disc_bps);
    let totals = compute_totals_with_delivery(&lines, draft.bill_discount + cash_disc, settings.round_to_rupee, ex.delivery_charge, settings.delivery_gst_rate);

    let paid: i64 = draft.payments.iter().map(|p| p.amount).sum();
    if paid != totals.grand {
        return invalid(format!(
            "Payments (Rs {}) do not match the bill total (Rs {}). Nothing was saved.",
            rs(paid),
            rs(totals.grand)
        ));
    }
    let credit: i64 = draft.payments.iter().filter(|p| p.mode == "credit").map(|p| p.amount).sum();

    // Customer
    let mut customer_name = draft.customer_name.clone().filter(|n| !n.trim().is_empty());
    if let Some(cid) = &draft.customer_id {
        let name: Option<(String, i64)> = tx.query_row("SELECT name, active FROM customers WHERE id=?1", [cid], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
        match name {
            Some((_, 0)) => return invalid("This customer is inactive. Pick another customer or bill as walk-in."),
            Some((n, _)) => customer_name = customer_name.or(Some(n)),
            None => return invalid("This customer no longer exists"),
        }
    } else if credit > 0 {
        return invalid("Credit needs a customer");
    }
    let customer_name = customer_name.unwrap_or_else(|| "Walk-in".into());

    let fy = fy_of(now);
    let seq = next_seq(tx, BILL_SERIES, &fy)?;
    let number = doc_number(&settings.bill_prefix, &fy, seq);
    let at = iso(now);
    let shift_id: Option<i64> =
        tx.query_row("SELECT id FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    let cashier = draft.cashier.clone().unwrap_or_else(|| "Cashier".into());
    let bill_disc = totals.discount - lines.iter().map(|l| l.discount).sum::<i64>();
    let status = if credit > 0 { "credit" } else { "paid" };
    if lines.iter().any(|l| l.item_id == MANUAL_ITEM) {
        ensure_hidden_item(tx, now, MANUAL_ITEM, "MANUAL", "Manual item", "")?;
    }
    if ex.delivery_charge > 0 {
        ensure_delivery_item(tx, now)?;
        lines.push(BillLine {
            item_id: DELIVERY_ITEM.into(),
            code: "DLV".into(),
            name: "Delivery charge".into(),
            unit: "pc".into(),
            qty: 1000,
            rate: ex.delivery_charge,
            discount: 0,
            gst_rate: settings.delivery_gst_rate,
            cess_rate: 0.0,
            amount: ex.delivery_charge,
        });
    }

    tx.prepare_cached(
        "INSERT INTO bills(number,series,fy,seq,at,day,shift_id,cashier,counter,customer_id,customer_name,status,
            item_count,qty_count,gross,discount,bill_discount,taxable,gst,before_round,round_off,grand,
            staff,delivery_address,delivery_locality,delivery_charge,wholesale,cash_disc_bps,cash_disc,remarks)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30)",
    )?
    .execute(params![
        number, BILL_SERIES, fy, seq, at, db::day_of(now), shift_id, cashier, settings.counter, draft.customer_id, customer_name,
        status, totals.item_count, totals.qty_count, totals.gross, totals.discount, bill_disc,
        totals.taxable, totals.gst, totals.before_round, totals.round_off, totals.grand,
        ex.staff.trim(), ex.delivery_address.trim(), ex.delivery_locality.trim(), ex.delivery_charge, ex.wholesale as i64,
        ex.cash_disc_bps, cash_disc, ex.remarks.trim()
    ])?;
    let bill_id = tx.last_insert_rowid();
    hit(fault, Fault::AfterBillRow)?;

    {
        let mut ins = tx.prepare_cached(
            "INSERT INTO bill_lines(bill_id,line_no,item_id,code,name,unit,qty,rate,discount,gst_rate,amount,cost,cess_rate)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,(SELECT cost FROM items WHERE id=?3),?12)",
        )?;
        for (i, l) in lines.iter().enumerate() {
            ins.execute(params![bill_id, i as i64, l.item_id, l.code, l.name, l.unit, l.qty, l.rate, l.discount, l.gst_rate, l.amount, l.cess_rate])
                .map_err(|e| match e {
                    rusqlite::Error::SqliteFailure(_, _) => ApiError::Invalid(format!("Item '{}' is not in the item list", l.name)),
                    other => other.into(),
                })?;
        }
        let mut slab = tx.prepare_cached("INSERT INTO bill_slabs(bill_id,rate,taxable,cgst,sgst,cess) VALUES(?1,?2,?3,?4,?5,?6)")?;
        for s in &totals.slabs {
            slab.execute(params![bill_id, s.rate, s.taxable, s.cgst, s.sgst, s.cess])?;
        }
    }
    hit(fault, Fault::AfterLines)?;

    // Points are redeemed first (checks the balance, minimum and maximum share of the bill), inside this same transaction.
    crate::loyalty::redeem_for_bill(tx, draft.customer_id.as_deref(), &draft.payments, totals.grand, bill_id, &number, &cashier)?;
    let (_, exchange_paid) = crate::loyalty::split_credit_payments(tx, &draft.payments)?;
    {
        let mut ins = tx.prepare_cached("INSERT INTO bill_payments(bill_id,mode,amount,ref) VALUES(?1,?2,?3,?4)")?;
        for p in &draft.payments {
            // bill_payments only knows five modes and cannot be altered: points are stored as a credit_note payment with ref PTS
            let (mode, rf) = match p.mode.as_str() {
                "points" => ("credit_note", Some(crate::loyalty::POINTS_REF.to_string())),
                "sodexo" => ("credit_note", Some(crate::loyalty::SODEXO_REF.to_string())),
                m => (m, p.r#ref.clone()),
            };
            ins.execute(params![bill_id, mode, p.amount, rf]).map_err(|_| ApiError::Invalid(format!("Unknown payment mode '{}'", p.mode)))?;
            if mode == "credit_note" && p.mode != "points" && p.mode != "sodexo" {
                if let Some(r) = &p.r#ref {
                    crate::loyalty::spend_credit_note(tx, r, p.amount)?;
                }
            }
        }
    }
    crate::loyalty::earn_for_bill(tx, draft.customer_id.as_deref(), &draft.payments, totals.grand, bill_id, &number, &cashier)?;
    if let Some(rf) = ex.exchange_refund.as_ref().filter(|r| r.amount > 0) {
        give_back_exchange_balance(tx, now, bill_id, &number, &cashier, draft.manager_pin.as_deref(), rf, shift_id)?;
    }
    hit(fault, Fault::AfterPayments)?;

    {
        let mut mv = tx.prepare_cached(
            "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,ref_id,note,by_name) VALUES(?1,?2,'sale',?3,'bill',?4,?5,?6)",
        )?;
        let mut upd = tx.prepare_cached("UPDATE items SET stock = stock - ?1 WHERE id = ?2")?;
        for l in &lines {
            // Services (aravai job work) have no stock to move.
            let service: i64 = tx.query_row("SELECT service FROM items WHERE id=?1", [&l.item_id], |r| r.get(0)).unwrap_or(0);
            if service == 1 {
                continue;
            }
            mv.execute(params![at, l.item_id, -l.qty, bill_id.to_string(), number, cashier])?;
            upd.execute(params![l.qty, l.item_id])?;
        }
    }
    // Loose oil also comes out of the barrel(s) it is poured from, in the same transaction.
    for l in &lines {
        crate::barrels::draw_for_sale(tx, now, bill_id, &l.item_id, l.qty, &cashier)?;
    }
    hit(fault, Fault::AfterStock)?;

    if let Some(cid) = &draft.customer_id {
        tx.execute(
            "UPDATE customers SET outstanding = outstanding + ?1, last_visit_at = ?2 WHERE id = ?3",
            params![credit, at, cid],
        )?;
    }
    audit(tx, now, &cashier, "create", "bill", &number, &format!("total {} paise, {} lines", totals.grand, lines.len()))?;

    Ok(Bill {
        id: format!("b{bill_id}"),
        number,
        at,
        cashier,
        counter: settings.counter,
        customer_id: draft.customer_id.clone(),
        customer_name,
        lines,
        totals,
        payments: draft.payments.clone(),
        status: status.into(),
        extras: BillExtras {
            staff: ex.staff.trim().into(),
            delivery_address: ex.delivery_address.trim().into(),
            delivery_locality: ex.delivery_locality.trim().into(),
            delivery_charge: ex.delivery_charge,
            wholesale: ex.wholesale,
            exchange_credit: exchange_paid,
            cash_disc_bps: ex.cash_disc_bps,
            cash_disc,
            remarks: ex.remarks.trim().into(),
            exchange_refund: ex.exchange_refund.clone().filter(|r| r.amount > 0),
        },
    })
}

/// The new bill is smaller than the exchange credit: the rest of the credit goes back to the customer in cash or UPI.
/// Same transaction as the bill; needs a manager PIN like any refund; cash reduces the drawer (X / Z report).
fn give_back_exchange_balance(
    tx: &Connection, now: DateTime<Local>, bill_id: i64, number: &str, by: &str, pin: Option<&str>, rf: &ExchangeRefund, shift_id: Option<i64>,
) -> Result<()> {
    if rf.mode != "cash" && rf.mode != "upi" {
        return invalid("Choose cash or UPI for the refund");
    }
    let note: Option<(i64, i64, String)> = tx
        .query_row("SELECT grand, used, refund_mode FROM credit_notes WHERE number=?1", [&rf.credit_note], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let Some((grand, used, mode)) = note else { return invalid("Exchange credit note not found") };
    if mode != "exchange" {
        return invalid("This credit note is not an exchange credit");
    }
    // spend_credit_note already booked what this bill used; what is left is what goes back
    if rf.amount != grand - used {
        return invalid(format!("The refund must be exactly the credit left (Rs {}).", rs(grand - used)));
    }
    let pin = pin.map(str::trim).unwrap_or("");
    let needs = crate::crm::needs_manager_pin(tx, by, "return", "canReturn")?;
    let approver = if needs || !pin.is_empty() {
        if pin.is_empty() {
            return invalid("A manager PIN is needed to give back the exchange balance to the customer");
        }
        match crate::store::find_manager(tx, pin)? {
            Some(m) => m.name,
            None => return invalid("Manager PIN is not correct"),
        }
    } else {
        by.to_string()
    };
    tx.execute("UPDATE credit_notes SET used=grand, consumed=1 WHERE number=?1", [&rf.credit_note])?;
    tx.execute(
        "INSERT INTO exchange_refunds(at,shift_id,bill_id,credit_note,mode,amount,by_name,approved_by) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![iso(now), shift_id, bill_id, rf.credit_note, rf.mode, rf.amount, by, approver],
    )?;
    audit(tx, now, by, "exchange_refund", "bill", number, &format!("{} given back from {} ({}), approved by {}", rs(rf.amount), rf.credit_note, rf.mode, approver))?;
    Ok(())
}

/// Every line's GST and cess rate must be in the owner's rate list (the amounts are computed here, never taken from the screen).
fn check_line_rates(conn: &Connection, lines: &[BillLine]) -> Result<()> {
    let allowed = crate::gst::allowed_rates(conn);
    for l in lines {
        if !allowed.iter().any(|a| (*a - l.gst_rate).abs() < 1e-9) {
            crate::gst::check_rate(conn, l.gst_rate, &format!("'{}': GST", l.name))?;
        }
        crate::gst::check_cess(l.cess_rate, &format!("'{}'", l.name))?;
    }
    Ok(())
}

pub const DELIVERY_ITEM: &str = "_delivery";
/// A one-off line typed at the counter (Manual) is billed under this hidden item.
pub const MANUAL_ITEM: &str = "_manual";

/// Hidden service items (home-delivery charge, manual lines): no stock, never shown in item lists or search.
fn ensure_hidden_item(tx: &Connection, now: DateTime<Local>, id: &str, code: &str, name: &str, hsn: &str) -> Result<()> {
    tx.execute("INSERT OR IGNORE INTO categories(id,name,sort) VALUES('_service','Service charges',9999)", [])?;
    tx.execute(
        "INSERT OR IGNORE INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at,kind,service)
         VALUES(?1,?2,?3,'_service','','pc',0,?4,0,0,0,0,0,0,0,?5,'charge',1)",
        params![id, code, name, hsn, iso(now)],
    )?;
    Ok(())
}

fn ensure_delivery_item(tx: &Connection, now: DateTime<Local>) -> Result<()> {
    ensure_hidden_item(tx, now, DELIVERY_ITEM, "DELIVERY", "Delivery charge", "9965")
}

// ---------- loading ----------

const BILL_COLS: &str = "b.id,b.number,b.at,b.cashier,b.counter,b.customer_id,b.customer_name,b.status,
    b.item_count,b.qty_count,b.gross,b.discount,b.taxable,b.gst,b.before_round,b.round_off,b.grand,
    b.staff,b.delivery_address,b.delivery_locality,b.delivery_charge,b.wholesale,b.cash_disc_bps,b.cash_disc,b.remarks";

fn bill_from_row(r: &Row) -> rusqlite::Result<Bill> {
    Ok(Bill {
        id: format!("b{}", r.get::<_, i64>(0)?),
        number: r.get(1)?,
        at: r.get(2)?,
        cashier: r.get(3)?,
        counter: r.get(4)?,
        customer_id: r.get(5)?,
        customer_name: r.get(6)?,
        status: r.get(7)?,
        lines: vec![],
        payments: vec![],
        totals: BillTotals {
            item_count: r.get(8)?,
            qty_count: r.get(9)?,
            gross: r.get(10)?,
            discount: r.get(11)?,
            taxable: r.get(12)?,
            gst: r.get(13)?,
            cess: 0, // filled from the slabs by fill_children
            slabs: vec![],
            before_round: r.get(14)?,
            round_off: r.get(15)?,
            grand: r.get(16)?,
        },
        extras: BillExtras {
            staff: r.get(17)?,
            delivery_address: r.get(18)?,
            delivery_locality: r.get(19)?,
            delivery_charge: r.get(20)?,
            wholesale: r.get::<_, i64>(21)? != 0,
            exchange_credit: 0, // filled from the payments by fill_children
            cash_disc_bps: r.get(22)?,
            cash_disc: r.get(23)?,
            remarks: r.get(24)?,
            exchange_refund: None,
        },
    })
}

fn fill_children(conn: &Connection, bills: &mut [Bill]) -> Result<()> {
    let mut lines = conn.prepare_cached(
        "SELECT item_id,code,name,unit,qty,rate,discount,gst_rate,amount,cess_rate FROM bill_lines WHERE bill_id=?1 ORDER BY line_no",
    )?;
    let mut pays = conn.prepare_cached("SELECT mode,amount,ref FROM bill_payments WHERE bill_id=?1 ORDER BY id")?;
    let mut slabs = conn.prepare_cached("SELECT rate,taxable,cgst,sgst,cess FROM bill_slabs WHERE bill_id=?1 ORDER BY rate")?;
    let mut xr = conn.prepare_cached("SELECT credit_note,mode,amount FROM exchange_refunds WHERE bill_id=?1 LIMIT 1")?;
    for b in bills.iter_mut() {
        let id = parse_id("b", &b.id).unwrap_or(0);
        b.lines = lines
            .query_map([id], |r| {
                Ok(BillLine {
                    item_id: r.get(0)?,
                    code: r.get(1)?,
                    name: r.get(2)?,
                    unit: r.get(3)?,
                    qty: r.get(4)?,
                    rate: r.get(5)?,
                    discount: r.get(6)?,
                    gst_rate: r.get(7)?,
                    amount: r.get(8)?,
                    cess_rate: r.get(9)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        b.payments = pays
            .query_map([id], |r| {
                let mut p = Payment { mode: r.get(0)?, amount: r.get(1)?, r#ref: r.get(2)? };
                if p.mode == "credit_note" && p.r#ref.as_deref() == Some(crate::loyalty::SODEXO_REF) {
                    p.mode = "sodexo".into(); // stored as a credit_note row (see write_bill); screens see the real mode
                    p.r#ref = None;
                }
                Ok(p)
            })?
            .collect::<rusqlite::Result<_>>()?;
        b.extras.exchange_credit = crate::loyalty::split_credit_payments(conn, &b.payments)?.1;
        b.extras.exchange_refund = xr
            .query_row([id], |r| Ok(ExchangeRefund { credit_note: r.get(0)?, mode: r.get(1)?, amount: r.get(2)? }))
            .optional()?;
        b.totals.slabs = slabs
            .query_map([id], |r| Ok(GstSlab { rate: r.get(0)?, taxable: r.get(1)?, cgst: r.get(2)?, sgst: r.get(3)?, igst: 0, cess: r.get(4)? }))?
            .collect::<rusqlite::Result<_>>()?;
        b.totals.cess = b.totals.slabs.iter().map(|s| s.cess).sum();
    }
    Ok(())
}

/// Bills matching `where_sql` (alias `b`), newest first, children loaded.
pub fn query_bills(conn: &Connection, where_sql: &str, params: impl rusqlite::Params, limit: i64) -> Result<Vec<Bill>> {
    let sql = format!("SELECT {BILL_COLS} FROM bills b WHERE {where_sql} ORDER BY b.id DESC LIMIT {limit}");
    let mut st = conn.prepare_cached(&sql)?;
    let mut bills = st.query_map(params, bill_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    fill_children(conn, &mut bills)?;
    Ok(bills)
}

pub fn get_bill(conn: &Connection, id: &str) -> Result<Option<Bill>> {
    let Some(n) = parse_id("b", id) else { return Ok(None) };
    Ok(query_bills(conn, "b.id=?1", [n], 1)?.pop())
}

pub fn list_bills(conn: &Connection, f: &BillFilter) -> Result<Vec<Bill>> {
    let mut conds: Vec<&str> = vec!["1=1"];
    let mut args: Vec<rusqlite::types::Value> = vec![];
    if let Some(from) = &f.from {
        conds.push("b.at >= ?");
        args.push(from.clone().into());
    }
    if let Some(to) = &f.to {
        conds.push("b.at <= ?");
        args.push(to.clone().into());
    }
    if let Some(q) = f.query.as_ref().filter(|q| !q.trim().is_empty()) {
        conds.push("(b.number LIKE ? ESCAPE '\\' OR b.customer_name LIKE ? ESCAPE '\\')");
        // a printed number "26/00123" is searched as the internal number
        let wanted = db::load_settings(conn).ok().and_then(|st| db::internal_bill_number(&st.bill_prefix, q)).unwrap_or_else(|| q.trim().to_string());
        let pat = format!("%{}%", like_escape(&wanted));
        args.push(pat.clone().into());
        args.push(pat.into());
    }
    query_bills(conn, &conds.join(" AND "), rusqlite::params_from_iter(args), f.limit.unwrap_or(2000).clamp(1, 5000))
}

pub fn like_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

// ---------- hold / recall ----------

pub fn hold_bill(conn: &mut Connection, draft: &BillDraft) -> Result<HeldBill> {
    if draft.lines.is_empty() {
        return invalid("Nothing to hold");
    }
    let now = Local::now();
    let lines: Vec<BillLine> = draft.lines.iter().map(recalc_line).collect();
    let round = db::load_settings(conn)?.round_to_rupee;
    let ex = draft.extras.clone();
    let cash_disc = cash_discount(&lines, ex.cash_disc_bps.clamp(0, 10000));
    let dgst = db::load_settings(conn)?.delivery_gst_rate;
    let total = compute_totals_with_delivery(&lines, draft.bill_discount + cash_disc, round, ex.delivery_charge.max(0), dgst).grand;
    let name = draft.customer_name.clone().unwrap_or_else(|| "Walk-in".into());
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "INSERT INTO held_bills(at,customer_id,customer_name,bill_discount,lines_json,total,meta_json) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![iso(now), draft.customer_id, name, draft.bill_discount, serde_json::to_string(&lines)?, total, serde_json::to_string(&ex)?],
    )?;
    let id = tx.last_insert_rowid();
    audit(&tx, now, draft.cashier.as_deref().unwrap_or("Cashier"), "hold", "held_bill", &id.to_string(), "")?;
    tx.commit()?;
    Ok(HeldBill {
        id: format!("h{id}"),
        at: iso(now),
        customer_name: name,
        lines,
        bill_discount: draft.bill_discount,
        customer_id: draft.customer_id.clone(),
        total,
        extras: ex,
    })
}

fn held_from_row(r: &Row) -> rusqlite::Result<HeldBill> {
    let lines_json: String = r.get(5)?;
    Ok(HeldBill {
        id: format!("h{}", r.get::<_, i64>(0)?),
        at: r.get(1)?,
        customer_id: r.get(2)?,
        customer_name: r.get(3)?,
        bill_discount: r.get(4)?,
        lines: serde_json::from_str(&lines_json).unwrap_or_default(),
        total: r.get(6)?,
        extras: r.get::<_, Option<String>>(7)?.and_then(|j| serde_json::from_str(&j).ok()).unwrap_or_default(),
    })
}

pub fn list_held(conn: &Connection) -> Result<Vec<HeldBill>> {
    let mut st = conn.prepare_cached(
        "SELECT id,at,customer_id,customer_name,bill_discount,lines_json,total,meta_json FROM held_bills WHERE recalled_at IS NULL ORDER BY id",
    )?;
    let v = st.query_map([], held_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn recall_held(conn: &mut Connection, id: &str) -> Result<Option<HeldBill>> {
    let Some(n) = parse_id("h", id) else { return Ok(None) };
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let h = tx
        .query_row(
            "SELECT id,at,customer_id,customer_name,bill_discount,lines_json,total,meta_json FROM held_bills WHERE id=?1 AND recalled_at IS NULL",
            [n],
            held_from_row,
        )
        .optional()?;
    if h.is_some() {
        tx.execute("UPDATE held_bills SET recalled_at=?1 WHERE id=?2", params![iso(now), n])?;
    }
    tx.commit()?;
    Ok(h)
}

/// The number the next saved bill will get (display only; the real number is assigned at save).
pub fn peek_next_bill_number(conn: &Connection) -> Result<String> {
    let s = db::load_settings(conn)?;
    let fy = fy_of(Local::now());
    Ok(doc_number(&s.bill_prefix, &fy, db::peek_seq(conn, BILL_SERIES, &fy)?))
}
