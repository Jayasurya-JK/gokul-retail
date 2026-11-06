//! Saving, loading and holding bills. A bill, its lines, payments, GST slabs, stock movements, customer
//! balance and audit entry are written in ONE transaction and committed before this function returns.

use crate::db::{self, audit, doc_number, fy_of, iso, next_seq, parse_id};
use crate::error::{invalid, ApiError, Result};
use crate::money::{compute_totals, recalc_line};
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
    let lines: Vec<BillLine> = draft.lines.iter().map(recalc_line).collect();

    let settings = db::load_settings(tx)?;
    let totals = compute_totals(&lines, draft.bill_discount, settings.round_to_rupee);

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
        let name: Option<String> = tx.query_row("SELECT name FROM customers WHERE id=?1", [cid], |r| r.get(0)).optional()?;
        match name {
            Some(n) => customer_name = customer_name.or(Some(n)),
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

    tx.prepare_cached(
        "INSERT INTO bills(number,series,fy,seq,at,day,shift_id,cashier,counter,customer_id,customer_name,status,
            item_count,qty_count,gross,discount,bill_discount,taxable,gst,before_round,round_off,grand)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
    )?
    .execute(params![
        number, BILL_SERIES, fy, seq, at, db::day_of(now), shift_id, cashier, settings.counter, draft.customer_id, customer_name,
        status, totals.item_count, totals.qty_count, totals.gross, totals.discount, bill_disc,
        totals.taxable, totals.gst, totals.before_round, totals.round_off, totals.grand
    ])?;
    let bill_id = tx.last_insert_rowid();
    hit(fault, Fault::AfterBillRow)?;

    {
        let mut ins = tx.prepare_cached(
            "INSERT INTO bill_lines(bill_id,line_no,item_id,code,name,unit,qty,rate,discount,gst_rate,amount)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        )?;
        for (i, l) in lines.iter().enumerate() {
            ins.execute(params![bill_id, i as i64, l.item_id, l.code, l.name, l.unit, l.qty, l.rate, l.discount, l.gst_rate, l.amount])
                .map_err(|e| match e {
                    rusqlite::Error::SqliteFailure(_, _) => ApiError::Invalid(format!("Item '{}' is not in the item list", l.name)),
                    other => other.into(),
                })?;
        }
        let mut slab = tx.prepare_cached("INSERT INTO bill_slabs(bill_id,rate,taxable,cgst,sgst) VALUES(?1,?2,?3,?4,?5)")?;
        for s in &totals.slabs {
            slab.execute(params![bill_id, s.rate, s.taxable, s.cgst, s.sgst])?;
        }
    }
    hit(fault, Fault::AfterLines)?;

    {
        let mut ins = tx.prepare_cached("INSERT INTO bill_payments(bill_id,mode,amount,ref) VALUES(?1,?2,?3,?4)")?;
        for p in &draft.payments {
            ins.execute(params![bill_id, p.mode, p.amount, p.r#ref]).map_err(|_| ApiError::Invalid(format!("Unknown payment mode '{}'", p.mode)))?;
            if p.mode == "credit_note" {
                if let Some(r) = &p.r#ref {
                    tx.execute("UPDATE credit_notes SET consumed=1 WHERE number=?1", [r])?;
                }
            }
        }
    }
    hit(fault, Fault::AfterPayments)?;

    {
        let mut mv = tx.prepare_cached(
            "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,ref_id,note,by_name) VALUES(?1,?2,'sale',?3,'bill',?4,?5,?6)",
        )?;
        let mut upd = tx.prepare_cached("UPDATE items SET stock = stock - ?1 WHERE id = ?2")?;
        for l in &lines {
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
    })
}

// ---------- loading ----------

const BILL_COLS: &str = "b.id,b.number,b.at,b.cashier,b.counter,b.customer_id,b.customer_name,b.status,
    b.item_count,b.qty_count,b.gross,b.discount,b.taxable,b.gst,b.before_round,b.round_off,b.grand";

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
            slabs: vec![],
            before_round: r.get(14)?,
            round_off: r.get(15)?,
            grand: r.get(16)?,
        },
    })
}

fn fill_children(conn: &Connection, bills: &mut [Bill]) -> Result<()> {
    let mut lines = conn.prepare_cached(
        "SELECT item_id,code,name,unit,qty,rate,discount,gst_rate,amount FROM bill_lines WHERE bill_id=?1 ORDER BY line_no",
    )?;
    let mut pays = conn.prepare_cached("SELECT mode,amount,ref FROM bill_payments WHERE bill_id=?1 ORDER BY id")?;
    let mut slabs = conn.prepare_cached("SELECT rate,taxable,cgst,sgst FROM bill_slabs WHERE bill_id=?1 ORDER BY rate")?;
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
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        b.payments = pays
            .query_map([id], |r| Ok(Payment { mode: r.get(0)?, amount: r.get(1)?, r#ref: r.get(2)? }))?
            .collect::<rusqlite::Result<_>>()?;
        b.totals.slabs = slabs
            .query_map([id], |r| Ok(GstSlab { rate: r.get(0)?, taxable: r.get(1)?, cgst: r.get(2)?, sgst: r.get(3)? }))?
            .collect::<rusqlite::Result<_>>()?;
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
        let pat = format!("%{}%", like_escape(q.trim()));
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
    let total = compute_totals(&lines, draft.bill_discount, round).grand;
    let name = draft.customer_name.clone().unwrap_or_else(|| "Walk-in".into());
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "INSERT INTO held_bills(at,customer_id,customer_name,bill_discount,lines_json,total) VALUES(?1,?2,?3,?4,?5,?6)",
        params![iso(now), draft.customer_id, name, draft.bill_discount, serde_json::to_string(&lines)?, total],
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
    })
}

pub fn list_held(conn: &Connection) -> Result<Vec<HeldBill>> {
    let mut st = conn.prepare_cached(
        "SELECT id,at,customer_id,customer_name,bill_discount,lines_json,total FROM held_bills WHERE recalled_at IS NULL ORDER BY id",
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
            "SELECT id,at,customer_id,customer_name,bill_discount,lines_json,total FROM held_bills WHERE id=?1 AND recalled_at IS NULL",
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
