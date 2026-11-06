//! Barrel draw-down for loose oil sales.
//!
//! A loose item ("Groundnut Oil (Loose)", unit litre, quantity in milli-litres = ml) is poured from the barrels that
//! hold that oil. Selling it takes oil out of those barrels in the same transaction as the bill; a return or a cancel
//! puts back only what that bill took, into the barrel(s) it came from.
//!
//! Which barrel? FIFO: the barrel that was filled first (oldest `filled_on`) is emptied first, then the next one.
//! A shop works the same way - one barrel stands on the tap until it runs dry, and the oldest oil goes out first
//! because wood-pressed oil has a short shelf life. The barrel frees itself at zero (so it can take another oil).
//! If the barrels hold less than the bill sells (oil in the loose stock that was never put in a barrel), the bill is
//! still saved in full: a sale is never refused over barrel bookkeeping, and only what the barrels hold is drawn.
//!
//! Barrel level = oil moved in - oil packed - oil sold + oil returned (every ml is in `barrel_movements`).

use crate::db::iso;
use crate::error::Result;
use chrono::{DateTime, Local};
use rusqlite::{params, Connection, OptionalExtension};

const LOOSE_SUFFIX: &str = " (Loose)";

/// The oil a loose item is poured from ("Groundnut Oil (Loose)" -> "Groundnut Oil"), `None` for a packed item.
fn oil_of_loose_item(conn: &Connection, item_id: &str) -> Result<Option<String>> {
    let row: Option<(i64, String, String)> =
        conn.query_row("SELECT loose, name, kind FROM items WHERE id=?1", [item_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).optional()?;
    Ok(match row {
        Some((1, name, kind)) if kind == "item" => name.strip_suffix(LOOSE_SUFFIX).map(|s| s.to_string()),
        _ => None,
    })
}

/// Takes `qty_ml` out of the barrels of this oil, oldest first. Returns how many ml were drawn.
pub fn draw_for_sale(tx: &Connection, now: DateTime<Local>, bill_id: i64, item_id: &str, qty_ml: i64, by: &str) -> Result<i64> {
    if qty_ml <= 0 {
        return Ok(0);
    }
    let Some(oil) = oil_of_loose_item(tx, item_id)? else { return Ok(0) };
    let barrels: Vec<(String, i64, Option<String>)> = {
        let mut st = tx.prepare_cached(
            "SELECT id, level_ml, seed FROM barrels WHERE oil_name=?1 AND level_ml>0 ORDER BY COALESCE(filled_on,''), id",
        )?;
        let v = st.query_map([&oil], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let at = iso(now);
    let mut left = qty_ml;
    for (id, level, seed) in barrels {
        if left == 0 {
            break;
        }
        let take = level.min(left);
        tx.execute("UPDATE barrels SET level_ml = level_ml - ?1 WHERE id=?2", params![take, id])?;
        tx.execute("UPDATE barrels SET seed=NULL, oil_name=NULL, filled_on=NULL WHERE id=?1 AND level_ml=0", [&id])?;
        tx.execute(
            "INSERT INTO barrel_movements(at,barrel_id,kind,qty_ml,bill_id,item_id,oil_name,seed,by_name) VALUES(?1,?2,'sale',?3,?4,?5,?6,?7,?8)",
            params![at, id, -take, bill_id, item_id, oil, seed, by],
        )?;
        left -= take;
    }
    Ok(qty_ml - left)
}

/// Puts oil back for a return or a cancel (`kind` = "return" | "cancel"): at most what this bill drew, the barrel drawn
/// last first, each up to its capacity. Returns how many ml went back.
pub fn give_back(tx: &Connection, now: DateTime<Local>, bill_id: i64, item_id: &str, qty_ml: i64, kind: &str, by: &str) -> Result<i64> {
    if qty_ml <= 0 || oil_of_loose_item(tx, item_id)?.is_none() {
        return Ok(0);
    }
    // Net drawn by this bill, per barrel, newest draw first.
    let drawn: Vec<(String, i64, String, Option<String>)> = {
        let mut st = tx.prepare_cached(
            "SELECT barrel_id, -SUM(qty_ml), MAX(oil_name), MAX(seed) FROM barrel_movements WHERE bill_id=?1 AND item_id=?2
             GROUP BY barrel_id HAVING SUM(qty_ml) < 0 ORDER BY MAX(id) DESC",
        )?;
        let v = st.query_map(params![bill_id, item_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let at = iso(now);
    let mut left = qty_ml;
    for (barrel, net, oil, seed) in drawn {
        if left == 0 {
            break;
        }
        let Some((cur_oil, level, cap)): Option<(Option<String>, i64, i64)> = tx
            .query_row("SELECT oil_name, level_ml, capacity_ml FROM barrels WHERE id=?1", [&barrel], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()?
        else {
            continue;
        };
        if cur_oil.as_deref().map(|o| o != oil).unwrap_or(false) {
            continue; // the barrel has since been filled with another oil
        }
        let give = net.min(left).min(cap - level);
        if give <= 0 {
            continue;
        }
        tx.execute(
            "UPDATE barrels SET level_ml = level_ml + ?1, oil_name = COALESCE(oil_name, ?2), seed = COALESCE(seed, ?3),
                 filled_on = COALESCE(filled_on, ?4) WHERE id=?5",
            params![give, oil, seed, at, barrel],
        )?;
        tx.execute(
            "INSERT INTO barrel_movements(at,barrel_id,kind,qty_ml,bill_id,item_id,oil_name,seed,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![at, barrel, kind, give, bill_id, item_id, oil, seed, by],
        )?;
        left -= give;
    }
    Ok(qty_ml - left)
}
