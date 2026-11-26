//! Day open, cash in/out, X report and Z close.

use crate::db::{self, audit, doc_number, fy_of, iso, next_seq};
use crate::error::{invalid, Result};
use crate::store;
use crate::types::*;
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

pub const Z_SERIES: &str = "Z";

/// Notes counted by piece, value in paise. Coins are typed as one rupee amount under key "coins".
const DENOMS: [(&str, i64); 7] =
    [("2000", 200_000), ("500", 50_000), ("200", 20_000), ("100", 10_000), ("50", 5_000), ("20", 2_000), ("10", 1_000)];

pub fn counted_total(counts: &DenomCounts) -> i64 {
    let mut t = counts.get("coins").copied().unwrap_or(0) * 100;
    for (k, v) in DENOMS {
        t += counts.get(k).copied().unwrap_or(0) * v;
    }
    t
}

fn shift_from_row(r: &Row) -> rusqlite::Result<Shift> {
    Ok(Shift {
        id: format!("sh-{}", r.get::<_, i64>(0)?),
        user_id: r.get(1)?,
        counter: r.get(2)?,
        opened_at: r.get(3)?,
        opening_cash: r.get(4)?,
    })
}

const SHIFT_COLS: &str = "id,user_id,counter,opened_at,opening_cash";

pub fn open_shift(conn: &Connection) -> Result<Option<Shift>> {
    Ok(conn
        .query_row(&format!("SELECT {SHIFT_COLS} FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1"), [], shift_from_row)
        .optional()?)
}

pub fn current_shift(conn: &Connection, user_id: &str) -> Result<Shift> {
    if let Some(s) = open_shift(conn)? {
        return Ok(s);
    }
    let settings = db::load_settings(conn)?;
    Ok(Shift { id: "sh-none".into(), user_id: user_id.into(), counter: settings.counter, opened_at: iso(Local::now()), opening_cash: 0 })
}

pub fn day_status(conn: &Connection) -> Result<DayStatus> {
    let shift = open_shift(conn)?;
    let last: Option<(String, i64)> = conn
        .query_row("SELECT closed_at, opening_cash FROM shifts WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()?;
    Ok(DayStatus {
        open: shift.is_some(),
        shift,
        suggested_float: last.as_ref().map(|l| l.1).filter(|v| *v > 0).unwrap_or(200_000),
        last_closed_at: last.map(|l| l.0),
    })
}

pub fn open_day(conn: &mut Connection, user_id: &str, counts: &DenomCounts) -> Result<Shift> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if let Some(s) = open_shift(&tx)? {
        return Ok(s); // already open: never start a second drawer
    }
    let user = store::user_name(&tx, user_id)?;
    let settings = db::load_settings(&tx)?;
    let opening = counted_total(counts);
    tx.execute(
        "INSERT INTO shifts(user_id,counter,opened_at,opening_cash,opening_counts) VALUES(?1,?2,?3,?4,?5)",
        params![user_id, settings.counter, iso(now), opening, serde_json::to_string(counts)?],
    )?;
    let id = tx.last_insert_rowid();
    audit(&tx, now, &user, "open_day", "shift", &id.to_string(), &format!("opening cash {opening} paise"))?;
    tx.commit()?;
    crate::lots::expire_quietly(conn); // points past their expiry date lapse when the day opens
    Ok(Shift { id: format!("sh-{id}"), user_id: user_id.into(), counter: settings.counter, opened_at: iso(now), opening_cash: opening })
}

// ---------- cash in / out ----------

fn cash_from_row(r: &Row) -> rusqlite::Result<CashEntry> {
    Ok(CashEntry {
        id: format!("ce{}", r.get::<_, i64>(0)?),
        at: r.get(1)?,
        kind: r.get(2)?,
        reason: r.get(3)?,
        amount: r.get(4)?,
        note: r.get(5)?,
        by: r.get(6)?,
    })
}

/// Entries of the open shift (or the latest one if the day is closed), newest first.
pub fn list_cash_entries(conn: &Connection) -> Result<Vec<CashEntry>> {
    let mut st = conn.prepare_cached(
        "SELECT id,at,kind,reason,amount,note,by_name FROM cash_movements
         WHERE shift_id = (SELECT id FROM shifts ORDER BY (closed_at IS NULL) DESC, id DESC LIMIT 1) ORDER BY id DESC",
    )?;
    let v = st.query_map([], cash_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn add_cash_entry(conn: &mut Connection, input: &CashEntryInput) -> Result<CashEntry> {
    if input.kind != "in" && input.kind != "out" {
        return invalid("Cash entry must be money in or money out");
    }
    if input.amount <= 0 {
        return invalid("Enter an amount greater than zero");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(shift) = open_shift(&tx)? else { return invalid("Open the day before recording cash in or out") };
    let shift_id: i64 = shift.id.trim_start_matches("sh-").parse().unwrap_or(0);
    tx.execute(
        "INSERT INTO cash_movements(shift_id,at,kind,reason,amount,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![shift_id, iso(now), input.kind, input.reason, input.amount, input.note, input.by],
    )?;
    let id = tx.last_insert_rowid();
    audit(&tx, now, &input.by, &format!("cash_{}", input.kind), "cash_movement", &id.to_string(), &format!("{} paise: {}", input.amount, input.reason))?;
    tx.commit()?;
    Ok(CashEntry {
        id: format!("ce{id}"),
        at: iso(now),
        kind: input.kind.clone(),
        reason: input.reason.clone(),
        amount: input.amount,
        note: input.note.clone(),
        by: input.by.clone(),
    })
}

// ---------- X report / Z close ----------

struct ShiftRow {
    id: i64,
    counter: String,
    opened_at: String,
    opened_by: String,
    opening_cash: i64,
    closed_at: Option<String>,
}

fn load_shift_row(conn: &Connection, id: i64) -> Result<ShiftRow> {
    Ok(conn.query_row(
        "SELECT s.id,s.counter,s.opened_at,COALESCE(u.name,'Cashier'),s.opening_cash,s.closed_at FROM shifts s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?1",
        [id],
        |r| Ok(ShiftRow { id: r.get(0)?, counter: r.get(1)?, opened_at: r.get(2)?, opened_by: r.get(3)?, opening_cash: r.get(4)?, closed_at: r.get(5)? }),
    )?)
}

fn summarise(conn: &Connection, s: &ShiftRow, end_iso: &str) -> Result<ShiftSummary> {
    let (bill_count, item_count, sales, discounts): (i64, i64, i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(item_count),0), COALESCE(SUM(grand),0), COALESCE(SUM(discount),0)
         FROM bills WHERE shift_id=?1 AND status != 'cancelled'",
        [s.id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    let mut by_mode = ModeTotals::default();
    {
        let mut st = conn.prepare_cached(
            "SELECT p.mode, SUM(p.amount) FROM bill_payments p JOIN bills b ON b.id=p.bill_id
             WHERE b.shift_id=?1 AND b.status != 'cancelled' GROUP BY p.mode",
        )?;
        let rows = st.query_map([s.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
        for row in rows {
            let (mode, amt) = row?;
            match mode.as_str() {
                "cash" => by_mode.cash = amt,
                "upi" => by_mode.upi = amt,
                "card" => by_mode.card = amt,
                "credit" => by_mode.credit = amt,
                _ => {}
            }
        }
    }
    let slabs: Vec<GstSlab> = {
        let mut st = conn.prepare_cached(
            "SELECT sl.rate, SUM(sl.taxable), SUM(sl.cgst), SUM(sl.sgst), SUM(sl.cess), SUM(sl.igst) FROM bill_slabs sl JOIN bills b ON b.id=sl.bill_id
             WHERE b.shift_id=?1 AND b.status != 'cancelled' GROUP BY sl.rate ORDER BY sl.rate",
        )?;
        let v = st
            .query_map([s.id], |r| Ok(GstSlab { rate: r.get(0)?, taxable: r.get(1)?, cgst: r.get(2)?, sgst: r.get(3)?, igst: r.get(5)?, cess: r.get(4)? }))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let (returns_count, returns_amount, cash_refunds): (i64, i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(grand),0), COALESCE(SUM(CASE WHEN refund_mode='cash' THEN grand ELSE 0 END),0)
         FROM credit_notes WHERE shift_id=?1",
        [s.id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let (cancel_count, cancel_amount): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(b.grand),0) FROM bill_cancellations c JOIN bills b ON b.id=c.bill_id
         WHERE c.at >= ?1 AND c.at <= ?2",
        [&s.opened_at, end_iso],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    // Cash handed back because a new bill was smaller than the exchange credit it used (UPI refunds never touch the drawer).
    let exchange_cash_refunds: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM exchange_refunds WHERE shift_id=?1 AND mode='cash'",
        [s.id],
        |r| r.get(0),
    )?;
    // Cash paid back for bills sold in an earlier shift and cancelled during this one.
    let cash_cancel_refunds: i64 = conn.query_row(
        "SELECT COALESCE(SUM(p.amount),0) FROM bill_cancellations c JOIN bills b ON b.id=c.bill_id
         JOIN bill_payments p ON p.bill_id=b.id AND p.mode='cash'
         WHERE c.at >= ?1 AND c.at <= ?2 AND COALESCE(b.shift_id,0) != ?3",
        params![s.opened_at, end_iso, s.id],
        |r| r.get(0),
    )?;
    let (cash_in, cash_out): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind='in' THEN amount ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='out' THEN amount ELSE 0 END),0)
         FROM cash_movements WHERE shift_id=?1",
        [s.id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let (collections_cash, supplier_cash): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind='in' AND reason='Credit collection' THEN amount ELSE 0 END),0),
                COALESCE(SUM(CASE WHEN kind='out' AND reason='Supplier payment' THEN amount ELSE 0 END),0)
         FROM cash_movements WHERE shift_id=?1",
        [s.id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    // Supplier payments of this shift: cash ones are the drawer movements (the note holds the supplier or bill), the others come from the payment book.
    let mut supplier_payments: Vec<SupplierPayLine> = vec![];
    if s.id > 0 {
        let mut st = conn.prepare_cached("SELECT note, amount FROM cash_movements WHERE shift_id=?1 AND kind='out' AND reason='Supplier payment' ORDER BY id")?;
        for r in st.query_map([s.id], |r| Ok(SupplierPayLine { supplier: r.get(0)?, amount: r.get(1)?, mode: "cash".into() }))? {
            supplier_payments.push(r?);
        }
        let mut st = conn.prepare_cached(
            "SELECT COALESCE(s.name, p.supplier_id), p.amount, p.mode FROM supplier_payments p LEFT JOIN suppliers s ON s.id=p.supplier_id
             WHERE p.mode!='cash' AND p.at >= ?1 AND p.at <= ?2 ORDER BY p.id",
        )?;
        for r in st.query_map([&s.opened_at, end_iso], |r| Ok(SupplierPayLine { supplier: r.get(0)?, amount: r.get(1)?, mode: r.get(2)? }))? {
            supplier_payments.push(r?);
        }
    }
    let mut expense_lines: Vec<ExpenseLine> = vec![];
    let (mut expenses_other, mut expenses_other_count) = (0i64, 0i64);
    if s.id > 0 {
        let mut st = conn.prepare_cached(
            "SELECT category_name, COUNT(*), COALESCE(SUM(CASE WHEN paid_from='cash' THEN amount ELSE 0 END),0),
                    COALESCE(SUM(CASE WHEN paid_from!='cash' THEN amount ELSE 0 END),0),
                    COALESCE(SUM(CASE WHEN paid_from!='cash' THEN 1 ELSE 0 END),0)
             FROM expenses WHERE shift_id=?1 AND status='active' GROUP BY category_name ORDER BY category_name",
        )?;
        let rows = st.query_map([s.id], |r| Ok((ExpenseLine { category: r.get(0)?, count: r.get(1)?, cash: r.get(2)?, other: r.get(3)? }, r.get::<_, i64>(4)?)))?;
        for row in rows {
            let (l, other_n) = row?;
            expenses_other += l.other;
            expenses_other_count += other_n;
            expense_lines.push(l);
        }
    }
    let (expenses_cash, expenses_count) = if s.id > 0 { crate::expenses::cash_expenses_of_shift(conn, s.id)? } else { (0, 0) };
    Ok(ShiftSummary {
        at: iso(Local::now()),
        counter: s.counter.clone(),
        opened_at: s.opened_at.clone(),
        opened_by: s.opened_by.clone(),
        opening_cash: s.opening_cash,
        bill_count,
        item_count,
        sales,
        returns_count,
        returns_amount,
        cancel_count,
        cancel_amount,
        cash_in,
        cash_out,
        discounts,
        taxable: slabs.iter().map(|x| x.taxable).sum(),
        cgst: slabs.iter().map(|x| x.cgst).sum(),
        sgst: slabs.iter().map(|x| x.sgst).sum(),
        igst: slabs.iter().map(|x| x.igst).sum(),
        cess: slabs.iter().map(|x| x.cess).sum(),
        slabs,
        expenses_cash,
        expenses_count,
        collections_cash,
        supplier_cash,
        cash_refunds: cash_refunds + cash_cancel_refunds + exchange_cash_refunds,
        expenses_other,
        expenses_other_count,
        expense_lines,
        supplier_payments,
        expected_cash: s.opening_cash + by_mode.cash + cash_in - cash_out - cash_refunds - cash_cancel_refunds - exchange_cash_refunds - expenses_cash,
        by_mode,
    })
}

/// X report: live summary of the open shift. When the day is closed, the latest closed shift is summarised.
pub fn shift_summary(conn: &Connection) -> Result<ShiftSummary> {
    let id: Option<i64> =
        conn.query_row("SELECT id FROM shifts ORDER BY (closed_at IS NULL) DESC, id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    let settings = db::load_settings(conn)?;
    let Some(id) = id else {
        let now = iso(Local::now());
        let row = ShiftRow { id: 0, counter: settings.counter, opened_at: now.clone(), opened_by: "Cashier".into(), opening_cash: 0, closed_at: None };
        return summarise(conn, &row, &now);
    };
    let row = load_shift_row(conn, id)?;
    let end = row.closed_at.clone().unwrap_or_else(|| iso(Local::now()));
    summarise(conn, &row, &end)
}

pub fn verify_manager_pin(conn: &Connection, pin: &str) -> Result<Option<User>> {
    store::find_manager(conn, pin)
}

/// Z close. `Ok(None)` when the manager PIN is wrong. Atomic: the report, the shift close and the audit
/// entry are written together.
pub fn close_day(conn: &mut Connection, user_id: &str, counts: &DenomCounts, manager_pin: &str) -> Result<Option<ZReport>> {
    let Some(approver) = store::find_manager(conn, manager_pin)? else { return Ok(None) };
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(open) = open_shift(&tx)? else { return invalid("The day is already closed") };
    let shift_id: i64 = open.id.trim_start_matches("sh-").parse().unwrap_or(0);
    let row = load_shift_row(&tx, shift_id)?;
    let summary = summarise(&tx, &row, &iso(now))?;
    let counted = counted_total(counts);
    let closed_by = store::user_name(&tx, user_id)?;
    let fy = fy_of(now);
    let seq = next_seq(&tx, Z_SERIES, &fy)?;
    let number = doc_number("Z", &fy, seq);
    let report = ZReport {
        number: number.clone(),
        closed_at: iso(now),
        closed_by: closed_by.clone(),
        approved_by: approver.name.clone(),
        counted,
        expected: summary.expected_cash,
        difference: counted - summary.expected_cash,
        counts: counts.clone(),
        summary,
    };
    tx.execute(
        "UPDATE shifts SET closed_at=?1, closed_by=?2, approved_by=?3, z_number=?4, counted=?5, expected=?6, difference=?7,
            closing_counts=?8, z_json=?9 WHERE id=?10",
        params![
            report.closed_at, closed_by, approver.name, number, counted, report.expected, report.difference,
            serde_json::to_string(counts)?, serde_json::to_string(&report)?, shift_id
        ],
    )?;
    audit(&tx, now, &closed_by, "close_day", "shift", &shift_id.to_string(), &format!("{number} difference {} paise, approved by {}", report.difference, approver.name))?;
    tx.commit()?;
    Ok(Some(report))
}
