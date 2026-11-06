//! Bill history, reprint, cancel and returns. Nothing is deleted: a cancel or a return is a new record
//! that points at the original bill, and stock goes back through the ledger.

use crate::bills::{get_bill, like_escape, query_bills};
use crate::db::{self, audit, doc_number, fy_of, iso, next_seq, parse_id};
use crate::error::{invalid, Result};
use crate::money::quote_return;
use crate::store;
use crate::types::*;
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

pub const CN_SERIES: &str = "CN";

pub fn list_bills_on(conn: &Connection, s: &BillSearch) -> Result<Vec<Bill>> {
    let mut conds: Vec<String> = vec![];
    let mut args: Vec<rusqlite::types::Value> = vec![];
    if !s.all_days.unwrap_or(false) {
        conds.push("b.day = ?".into());
        args.push(s.date.clone().into());
    }
    if let Some(q) = s.query.as_ref().map(|q| q.trim()).filter(|q| !q.is_empty()) {
        let pat = format!("%{}%", like_escape(q));
        let mut any = vec!["b.number LIKE ? ESCAPE '\\'".to_string(), "b.customer_name LIKE ? ESCAPE '\\'".to_string()];
        args.push(pat.clone().into());
        args.push(pat.into());
        // Amount search: "480" or "480.50"
        let numeric = !q.is_empty() && q.chars().all(|c| c.is_ascii_digit() || c == '.') && q.matches('.').count() <= 1;
        if numeric {
            let (w, f) = q.split_once('.').unwrap_or((q, ""));
            if f.len() <= 2 && !w.is_empty() && w.len() < 12 {
                let paise = w.parse::<i64>().unwrap_or(0) * 100 + format!("{f:0<2}").parse::<i64>().unwrap_or(0);
                any.push("b.grand = ?".into());
                args.push(paise.into());
                if q.len() >= 3 {
                    any.push("(b.grand % 100 = 0 AND CAST(b.grand / 100 AS TEXT) LIKE ?)".into());
                    args.push(format!("{q}%").into());
                }
            }
        }
        conds.push(format!("({})", any.join(" OR ")));
    }
    let where_sql = if conds.is_empty() { "1=1".to_string() } else { conds.join(" AND ") };
    query_bills(conn, &where_sql, rusqlite::params_from_iter(args), 400)
}

fn cn_from_row(r: &Row) -> rusqlite::Result<(i64, CreditNote)> {
    let id: i64 = r.get(0)?;
    let totals_json: String = r.get(10)?;
    Ok((
        id,
        CreditNote {
            id: format!("cn{id}"),
            number: r.get(1)?,
            at: r.get(2)?,
            bill_id: format!("b{}", r.get::<_, i64>(3)?),
            bill_number: r.get(4)?,
            customer_id: r.get(5)?,
            customer_name: r.get(6)?,
            reason: r.get(7)?,
            refund_mode: r.get(8)?,
            by: r.get(9)?,
            totals: serde_json::from_str(&totals_json).unwrap_or_default(),
            lines: vec![],
        },
    ))
}

const CN_COLS: &str = "c.id,c.number,c.at,c.bill_id,b.number,c.customer_id,c.customer_name,c.reason,c.refund_mode,c.by_name,c.totals_json";

fn load_credit_notes(conn: &Connection, where_sql: &str, params: impl rusqlite::Params, limit: i64) -> Result<Vec<CreditNote>> {
    let mut st = conn.prepare_cached(&format!(
        "SELECT {CN_COLS} FROM credit_notes c JOIN bills b ON b.id=c.bill_id WHERE {where_sql} ORDER BY c.id DESC LIMIT {limit}"
    ))?;
    let rows = st.query_map(params, cn_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut lines = conn.prepare_cached(
        "SELECT item_id,code,name,unit,qty,rate,discount,gst_rate,amount FROM credit_note_lines WHERE cn_id=?1 ORDER BY line_no",
    )?;
    let mut out = vec![];
    for (id, mut cn) in rows {
        cn.lines = lines
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
        out.push(cn);
    }
    Ok(out)
}

fn detail_of(conn: &Connection, bill: Bill) -> Result<BillDetail> {
    let id = parse_id("b", &bill.id).unwrap_or(0);
    let mut returned = vec![0i64; bill.lines.len()];
    {
        let mut st = conn.prepare_cached(
            "SELECT l.bill_line_no, SUM(l.qty) FROM credit_note_lines l JOIN credit_notes c ON c.id=l.cn_id WHERE c.bill_id=?1 GROUP BY l.bill_line_no",
        )?;
        let rows = st.query_map([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        for row in rows {
            let (i, q) = row?;
            if let Some(slot) = returned.get_mut(i as usize) {
                *slot = q;
            }
        }
    }
    let mut notes = load_credit_notes(conn, "c.bill_id=?1", [id], 100)?;
    notes.reverse(); // oldest first, like the mock
    let cancel = conn
        .query_row("SELECT reason,by_name,approved_by,at FROM bill_cancellations WHERE bill_id=?1", [id], |r| {
            Ok(CancelInfo { reason: r.get(0)?, by: r.get(1)?, approved_by: r.get(2)?, at: r.get(3)? })
        })
        .optional()?;
    let reprints: i64 = conn.query_row("SELECT COUNT(*) FROM bill_reprints WHERE bill_id=?1", [id], |r| r.get(0))?;
    Ok(BillDetail { bill, returned, credit_notes: notes, cancel, reprints })
}

pub fn get_bill_detail(conn: &Connection, id: &str) -> Result<Option<BillDetail>> {
    match get_bill(conn, id)? {
        Some(b) => Ok(Some(detail_of(conn, b)?)),
        None => Ok(None),
    }
}

pub fn find_bill_for_return(conn: &Connection, code: &str) -> Result<Option<BillDetail>> {
    let c = code.trim();
    if c.is_empty() {
        return Ok(None);
    }
    // Indexed exact match; numbers are stored upper-case, so a lower-case scan still finds them.
    for candidate in [c.to_string(), c.to_uppercase()] {
        if let Some(b) = query_bills(conn, "b.number = ?", [candidate], 1)?.pop() {
            return Ok(Some(detail_of(conn, b)?));
        }
    }
    if c.len() >= 3 && c.chars().all(|ch| ch.is_ascii_digit()) {
        let n: i64 = c.trim_start_matches('0').parse().unwrap_or(0);
        if n > 0 {
            if let Some(b) = query_bills(conn, "b.seq = ?", [n], 1)?.pop() {
                return Ok(Some(detail_of(conn, b)?));
            }
        }
        let pat = format!("%{}", like_escape(c.trim_start_matches('0')));
        if let Some(b) = query_bills(conn, "b.number LIKE ? ESCAPE '\\'", [pat], 1)?.pop() {
            return Ok(Some(detail_of(conn, b)?));
        }
    }
    Ok(None)
}

pub fn record_reprint(conn: &Connection, bill_id: &str, by: &str) -> Result<i64> {
    let Some(n) = parse_id("b", bill_id) else { return invalid("Bill not found") };
    let now = Local::now();
    conn.execute("INSERT INTO bill_reprints(bill_id,at,by_name) VALUES(?1,?2,?3)", params![n, iso(now), by])?;
    audit(conn, now, by, "reprint", "bill", bill_id, "")?;
    Ok(conn.query_row("SELECT COUNT(*) FROM bill_reprints WHERE bill_id=?1", [n], |r| r.get(0))?)
}

fn returned_qty_total(conn: &Connection, bill_id: i64) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(l.qty),0) FROM credit_note_lines l JOIN credit_notes c ON c.id=l.cn_id WHERE c.bill_id=?1",
        [bill_id],
        |r| r.get(0),
    )?)
}

pub fn cancel_bill(conn: &mut Connection, req: &CancelRequest) -> Result<BillDetail> {
    let Some(bid) = parse_id("b", &req.bill_id) else { return invalid("Bill not found") };
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(bill) = get_bill(&tx, &req.bill_id)? else { return invalid("Bill not found") };
    if bill.status == "cancelled" {
        return invalid("This bill is already cancelled");
    }
    if returned_qty_total(&tx, bid)? > 0 {
        return invalid("Items were already returned on this bill. Cancel is not allowed.");
    }
    if req.reason.trim().is_empty() {
        return invalid("Choose a reason");
    }
    // Permissions come from the roles table: a role that holds "cancel a bill" without needing a manager PIN may cancel on its own;
    // everyone else (a cashier by default) needs a manager's PIN.
    let needs_pin = crate::crm::needs_manager_pin(&tx, &req.by, "cancel_bill", "canCancelBill")?;
    let approver = if needs_pin || !req.manager_pin.trim().is_empty() {
        if req.manager_pin.trim().is_empty() {
            return invalid("A manager PIN is needed to cancel a bill");
        }
        match store::find_manager(&tx, &req.manager_pin)? {
            Some(m) => m.name,
            None => return invalid("Manager PIN is not correct"),
        }
    } else {
        req.by.clone()
    };

    tx.execute("UPDATE bills SET status='cancelled' WHERE id=?1", [bid])?;
    tx.execute(
        "INSERT INTO bill_cancellations(bill_id,at,reason,by_name,approved_by) VALUES(?1,?2,?3,?4,?5)",
        params![bid, iso(now), req.reason, req.by, approver],
    )?;
    {
        let mut mv = tx.prepare_cached(
            "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,ref_id,note,by_name) VALUES(?1,?2,'cancel',?3,'bill',?4,?5,?6)",
        )?;
        let mut upd = tx.prepare_cached("UPDATE items SET stock = stock + ?1 WHERE id = ?2")?;
        for l in &bill.lines {
            mv.execute(params![iso(now), l.item_id, l.qty, bid.to_string(), format!("Cancelled {}", bill.number), req.by])?;
            upd.execute(params![l.qty, l.item_id])?;
        }
    }
    for l in &bill.lines {
        crate::barrels::give_back(&tx, now, bid, &l.item_id, l.qty, "cancel", &req.by)?;
    }
    let credit: i64 = bill.payments.iter().filter(|p| p.mode == "credit").map(|p| p.amount).sum();
    if credit > 0 {
        if let Some(cid) = &bill.customer_id {
            tx.execute("UPDATE customers SET outstanding = MAX(0, outstanding - ?1) WHERE id=?2", params![credit, cid])?;
        }
    }
    // Exchange credit that paid for this bill becomes usable again.
    for p in bill.payments.iter().filter(|p| p.mode == "credit_note") {
        if let Some(r) = &p.r#ref {
            tx.execute("UPDATE credit_notes SET consumed=0 WHERE number=?1", [r])?;
        }
    }
    audit(&tx, now, &req.by, "cancel", "bill", &bill.number, &format!("{} (approved by {})", req.reason, approver))?;
    let updated = get_bill(&tx, &req.bill_id)?.ok_or_else(|| db::internal("Bill vanished"))?;
    let detail = detail_of(&tx, updated)?;
    tx.commit()?;
    Ok(detail)
}

pub fn create_return(conn: &mut Connection, req: &ReturnRequest) -> Result<CreditNote> {
    let Some(bid) = parse_id("b", &req.bill_id) else { return invalid("Bill not found") };
    if !["cash", "upi", "credit_note", "exchange"].contains(&req.refund_mode.as_str()) {
        return invalid("Choose how to refund");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let Some(bill) = get_bill(&tx, &req.bill_id)? else { return invalid("Bill not found") };
    if bill.status == "cancelled" {
        return invalid("This bill was cancelled");
    }
    if req.reason.trim().is_empty() {
        return invalid("Choose a reason");
    }
    // Refunds follow the roles table like cancels: a cashier (or any role without "returns") needs a manager's PIN.
    let needs_pin = crate::crm::needs_manager_pin(&tx, &req.by, "return", "canReturn")?;
    let approver = if needs_pin || !req.manager_pin.trim().is_empty() {
        if req.manager_pin.trim().is_empty() {
            return invalid("A manager PIN is needed to give a refund");
        }
        match store::find_manager(&tx, &req.manager_pin)? {
            Some(m) => m.name,
            None => return invalid("Manager PIN is not correct"),
        }
    } else {
        req.by.clone()
    };
    let has_credit = bill.payments.iter().any(|p| p.mode == "credit");
    if has_credit && (req.refund_mode == "cash" || req.refund_mode == "upi") {
        return invalid("This bill was on credit. Refund as a credit note.");
    }
    let valid: Vec<&ReturnPick> = req.picks.iter().filter(|p| p.qty > 0).collect();
    if valid.is_empty() {
        return invalid("Tick at least one item to return");
    }
    let detail = detail_of(&tx, bill.clone())?;
    let mut done = detail.returned.clone();
    let mut check = done.clone();
    for p in &valid {
        let Some(l) = usize::try_from(p.line_index).ok().and_then(|i| bill.lines.get(i)) else { return invalid("Line not found") };
        check[p.line_index as usize] += p.qty;
        if check[p.line_index as usize] > l.qty {
            return invalid(format!("Cannot return more than sold for {}", l.name));
        }
    }
    let settings = db::load_settings(&tx)?;
    let picks: Vec<ReturnPick> = valid.iter().map(|p| (*p).clone()).collect();
    let (lines, totals) = quote_return(&bill.lines, bill.totals.discount, &picks, settings.round_to_rupee);
    for p in &picks {
        done[p.line_index as usize] += p.qty;
    }

    let fy = fy_of(now);
    let seq = next_seq(&tx, CN_SERIES, &fy)?;
    let number = doc_number("CN", &fy, seq);
    let shift_id: Option<i64> =
        tx.query_row("SELECT id FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    tx.execute(
        "INSERT INTO credit_notes(number,series,fy,seq,at,day,shift_id,bill_id,customer_id,customer_name,reason,refund_mode,by_name,grand,totals_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![
            number, CN_SERIES, fy, seq, iso(now), db::day_of(now), shift_id, bid, bill.customer_id, bill.customer_name,
            req.reason, req.refund_mode, req.by, totals.grand, serde_json::to_string(&totals)?
        ],
    )?;
    let cn_id = tx.last_insert_rowid();
    {
        let mut ins = tx.prepare_cached(
            "INSERT INTO credit_note_lines(cn_id,line_no,bill_line_no,item_id,code,name,unit,qty,rate,discount,gst_rate,amount)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        )?;
        let mut mv = tx.prepare_cached(
            "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,ref_id,note,by_name) VALUES(?1,?2,'return',?3,'credit_note',?4,?5,?6)",
        )?;
        let mut upd = tx.prepare_cached("UPDATE items SET stock = stock + ?1 WHERE id = ?2")?;
        // quote_return keeps pick order and skips nothing we already validated, so lines[i] belongs to picks[i].
        for (i, (l, p)) in lines.iter().zip(picks.iter()).enumerate() {
            ins.execute(params![cn_id, i as i64, p.line_index, l.item_id, l.code, l.name, l.unit, l.qty, l.rate, l.discount, l.gst_rate, l.amount])?;
            mv.execute(params![iso(now), l.item_id, l.qty, cn_id.to_string(), format!("{number} against {}", bill.number), req.by])?;
            upd.execute(params![l.qty, l.item_id])?;
            crate::barrels::give_back(&tx, now, bid, &l.item_id, l.qty, "return", &req.by)?;
        }
    }
    if bill.lines.iter().enumerate().all(|(i, l)| done[i] >= l.qty) {
        tx.execute("UPDATE bills SET status='returned' WHERE id=?1", [bid])?;
    }
    if has_credit && req.refund_mode == "credit_note" {
        if let Some(cid) = &bill.customer_id {
            tx.execute("UPDATE customers SET outstanding = MAX(0, outstanding - ?1) WHERE id=?2", params![totals.grand, cid])?;
        }
    }
    audit(&tx, now, &req.by, "return", "credit_note", &number, &format!("{} against {} ({}) (approved by {})", req.refund_mode, bill.number, req.reason, approver))?;
    let mut notes = load_credit_notes(&tx, "c.id=?1", [cn_id], 1)?;
    tx.commit()?;
    notes.pop().ok_or_else(|| db::internal("Credit note vanished"))
}

pub fn list_credit_notes(conn: &Connection, limit: i64) -> Result<Vec<CreditNote>> {
    load_credit_notes(conn, "1=1", [], limit.clamp(1, 1000))
}

/// Exchange credit waiting to be used on the next bill.
pub fn get_pending_exchange(conn: &Connection) -> Result<Option<CreditNote>> {
    Ok(load_credit_notes(conn, "c.refund_mode='exchange' AND c.consumed=0", [], 1)?.pop())
}

pub fn clear_pending_exchange(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE credit_notes SET consumed=1 WHERE refund_mode='exchange' AND consumed=0", [])?;
    Ok(())
}
