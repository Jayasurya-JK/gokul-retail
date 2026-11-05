//! Stock ledger. `post_stock` is the ONLY function that changes stock.

use crate::error::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension, Transaction};

/// Why stock moved. Stored as text in `stock_ledger.reason`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Sale,
    Purchase,
    Return,
    Repack,
    Wastage,
    Adjustment,
}

impl Reason {
    pub fn as_str(self) -> &'static str {
        match self {
            Reason::Sale => "sale",
            Reason::Purchase => "purchase",
            Reason::Return => "return",
            Reason::Repack => "repack",
            Reason::Wastage => "wastage",
            Reason::Adjustment => "adjustment",
        }
    }
}

/// One stock movement: signed quantity in the item's base unit (ml, g or pcs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Movement {
    pub item_id: i64,
    pub qty_base: i64,
    pub reason: Reason,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub user_id: Option<i64>,
    pub note: Option<String>,
}

impl Movement {
    pub fn new(item_id: i64, qty_base: i64, reason: Reason) -> Movement {
        Movement {
            item_id,
            qty_base,
            reason,
            ref_type: None,
            ref_id: None,
            user_id: None,
            note: None,
        }
    }

    pub fn with_ref(mut self, ref_type: &str, ref_id: i64) -> Movement {
        self.ref_type = Some(ref_type.to_string());
        self.ref_id = Some(ref_id);
        self
    }

    pub fn with_user(mut self, user_id: i64) -> Movement {
        self.user_id = Some(user_id);
        self
    }

    pub fn with_note(mut self, note: &str) -> Movement {
        self.note = Some(note.to_string());
        self
    }
}

/// Append all movements to the ledger and update `stock_balance`, inside the caller's
/// transaction. All-or-nothing: if any movement is invalid, none of the batch is written,
/// even if the caller ignores the error and commits (a savepoint wraps the batch).
///
/// Negative balances are not blocked here; the billing rule (setting + log) belongs to the
/// caller that knows the context.
pub fn post_stock(tx: &Transaction<'_>, movements: &[Movement]) -> Result<()> {
    tx.execute_batch("SAVEPOINT post_stock")?;
    match post_all(tx, movements) {
        Ok(()) => {
            tx.execute_batch("RELEASE post_stock")?;
            Ok(())
        }
        Err(e) => {
            // Roll back this batch only, then drop the savepoint. A secondary failure is
            // ignored on purpose: the original error is the useful one.
            let _ = tx.execute_batch("ROLLBACK TO post_stock; RELEASE post_stock");
            Err(e)
        }
    }
}

fn post_all(tx: &Transaction<'_>, movements: &[Movement]) -> Result<()> {
    for m in movements {
        if m.qty_base == 0 {
            return Err(Error::InvalidMovement(format!(
                "quantity for item {} is zero",
                m.item_id
            )));
        }
        let current: Option<i64> = tx
            .query_row(
                "SELECT qty_base FROM stock_balance WHERE item_id = ?1",
                [m.item_id],
                |r| r.get(0),
            )
            .optional()?;
        if current.is_none() {
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM items WHERE id = ?1)",
                [m.item_id],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(Error::UnknownItem(m.item_id));
            }
        }
        // Checked in Rust: SQLite silently turns integer overflow into a float.
        let new_balance = current
            .unwrap_or(0)
            .checked_add(m.qty_base)
            .ok_or(Error::QuantityOverflow(m.item_id))?;

        tx.execute(
            "INSERT INTO stock_ledger (item_id, qty_base, reason, ref_type, ref_id, user_id, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                m.item_id,
                m.qty_base,
                m.reason.as_str(),
                m.ref_type,
                m.ref_id,
                m.user_id,
                m.note
            ],
        )?;
        tx.execute(
            "INSERT INTO stock_balance (item_id, qty_base) VALUES (?1, ?2)
             ON CONFLICT(item_id) DO UPDATE SET qty_base = excluded.qty_base",
            params![m.item_id, new_balance],
        )?;
    }
    Ok(())
}

/// Rebuild the whole `stock_balance` cache from the ledger. Returns rows written.
pub fn rebuild_balances(tx: &Transaction<'_>) -> Result<usize> {
    tx.execute("DELETE FROM stock_balance", [])?;
    let n = tx.execute(
        "INSERT INTO stock_balance (item_id, qty_base)
         SELECT item_id, SUM(qty_base) FROM stock_ledger GROUP BY item_id",
        [],
    )?;
    Ok(n)
}

/// Cached balance for an item (0 if it has never moved).
pub fn balance(conn: &Connection, item_id: i64) -> Result<i64> {
    let v: Option<i64> = conn
        .query_row(
            "SELECT qty_base FROM stock_balance WHERE item_id = ?1",
            [item_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(v.unwrap_or(0))
}

/// Balance computed straight from the ledger (the source of truth).
pub fn ledger_sum(conn: &Connection, item_id: i64) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(qty_base), 0) FROM stock_ledger WHERE item_id = ?1",
        [item_id],
        |r| r.get(0),
    )?)
}
