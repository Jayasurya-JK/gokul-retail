//! Master data reads: settings, users and PINs, items, barcodes, categories, customers.

use crate::db::{self, audit, iso, visit_label, when_label};
use crate::error::{invalid, ApiError, Result};
use crate::types::*;
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;

// ---------- PINs ----------

fn hasher() -> Result<Argon2<'static>> {
    let params = Params::new(4096, 2, 1, None).map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn hash_pin(pin: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    hasher()?
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| ApiError::Internal(format!("Could not secure the PIN: {e}")))
}

pub fn check_pin(pin: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default().verify_password(pin.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

// ---------- settings / users ----------

pub fn get_settings(conn: &Connection) -> Result<Settings> {
    db::load_settings(conn)
}

fn user_from_row(r: &Row, now: chrono::DateTime<Local>) -> rusqlite::Result<User> {
    let last: Option<String> = r.get(5)?;
    Ok(User {
        id: r.get(0)?,
        name: r.get(1)?,
        role: r.get(2)?,
        initials: r.get(3)?,
        pin: String::new(),
        color: r.get(4)?,
        last_login: when_label(last.as_deref(), now),
        locked_for_secs: None,
    })
}

pub fn list_users(conn: &Connection) -> Result<Vec<User>> {
    let now = Local::now();
    let mut st = conn.prepare("SELECT id,name,role,initials,color,last_login FROM users WHERE active=1 ORDER BY rowid")?;
    let mut rows = st.query_map([], |r| user_from_row(r, now))?.collect::<rusqlite::Result<Vec<_>>>()?;
    for u in rows.iter_mut() {
        u.locked_for_secs = locked_secs(conn, &u.id)?;
    }
    Ok(rows)
}

// ---------- lockout ----------

fn setting_i64(conn: &Connection, key: &str, default: i64) -> i64 {
    db::get_setting(conn, key).ok().flatten().and_then(|v| v.trim().parse().ok()).filter(|v| *v > 0).unwrap_or(default)
}

/// Seconds left on this user's lockout, or `None`.
pub fn locked_secs(conn: &Connection, user_id: &str) -> Result<Option<i64>> {
    let until: Option<String> = conn.query_row("SELECT locked_until FROM users WHERE id=?1", [user_id], |r| r.get(0)).optional()?.flatten();
    let Some(t) = until.as_deref().and_then(db::parse_iso) else { return Ok(None) };
    let ms = (t - Local::now()).num_milliseconds();
    Ok(if ms > 0 { Some((ms + 999) / 1000) } else { None })
}

pub fn locked_message(secs: i64) -> String {
    format!("Too many wrong PINs. This user is locked for {secs} s.")
}

/// A wrong PIN was typed for (or by) this user. After the allowed number of misses the user is locked for the
/// configured time (settings `security.lockoutAttempts`, default 5, and `security.lockoutSeconds`, default 60)
/// and it is audited. Returns the seconds locked when this miss caused the lock.
pub fn register_pin_failure(conn: &Connection, user_id: &str, name: &str, what: &str) -> Result<Option<i64>> {
    let now = Local::now();
    let max = setting_i64(conn, "security.lockoutAttempts", 5);
    let secs = setting_i64(conn, "security.lockoutSeconds", 60);
    let failed: i64 = conn.query_row("UPDATE users SET failed_pins = failed_pins + 1 WHERE id=?1 RETURNING failed_pins", [user_id], |r| r.get(0))?;
    audit(conn, now, name, "login_failed", "user", user_id, what)?;
    if failed >= max {
        let until = iso(now + chrono::Duration::seconds(secs));
        conn.execute("UPDATE users SET failed_pins=0, locked_until=?1 WHERE id=?2", params![until, user_id])?;
        audit(conn, now, name, "lockout", "user", user_id, &format!("{max} wrong PINs ({what}); locked for {secs} s"))?;
        return Ok(Some(secs));
    }
    Ok(None)
}

/// `Ok(None)` for a wrong PIN. Wrong attempts are written to the audit log. After 5 wrong PINs the user is locked for
/// 60 s (see `register_pin_failure`) and every attempt, right or wrong, is refused with the seconds left.
pub fn verify_pin(conn: &Connection, user_id: &str, pin: &str) -> Result<Option<User>> {
    let now = Local::now();
    let row: Option<(String, String)> = conn
        .query_row("SELECT pin_hash, name FROM users WHERE id=?1 AND active=1", [user_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    let Some((hash, name)) = row else { return Ok(None) };
    if let Some(left) = locked_secs(conn, user_id)? {
        return Err(ApiError::Invalid(locked_message(left)));
    }
    if !check_pin(pin, &hash) {
        if let Some(secs) = register_pin_failure(conn, user_id, &name, "wrong PIN at sign-in")? {
            return Err(ApiError::Invalid(locked_message(secs)));
        }
        return Ok(None);
    }
    conn.execute("UPDATE users SET last_login=?1, failed_pins=0, locked_until=NULL WHERE id=?2", params![iso(now), user_id])?;
    audit(conn, now, &name, "login", "user", user_id, "")?;
    let u = conn.query_row("SELECT id,name,role,initials,color,last_login FROM users WHERE id=?1", [user_id], |r| user_from_row(r, now))?;
    Ok(Some(u))
}

/// The owner or manager whose PIN this is, if any.
pub fn find_manager(conn: &Connection, pin: &str) -> Result<Option<User>> {
    let now = Local::now();
    let mut st = conn.prepare("SELECT id,name,role,initials,color,last_login,pin_hash FROM users WHERE active=1 AND role IN ('owner','manager')")?;
    let mut rows = st.query([])?;
    while let Some(r) = rows.next()? {
        let hash: String = r.get(6)?;
        if check_pin(pin, &hash) {
            return Ok(Some(user_from_row(r, now)?));
        }
    }
    Ok(None)
}

/// An owner or manager whose PIN this is AND whose role holds `perm` (the owner holds everything).
/// `min_discount_pct`: the approver's own discount limit must reach it. `Ok(None)` for a wrong PIN.
pub fn find_approver(conn: &Connection, pin: &str, perm: Option<&str>, min_discount_pct: i64) -> Result<Option<User>> {
    let now = Local::now();
    let mut st = conn.prepare(
        "SELECT u.id,u.name,u.role,u.initials,u.color,u.last_login,u.pin_hash,r.perms_json,r.discount_limit_pct
         FROM users u JOIN roles r ON r.id=u.role WHERE u.active=1 AND u.role IN ('owner','manager')",
    )?;
    let mut rows = st.query([])?;
    while let Some(r) = rows.next()? {
        let hash: String = r.get(6)?;
        if !check_pin(pin, &hash) {
            continue;
        }
        let perms: serde_json::Value = serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or(serde_json::Value::Null);
        let limit: i64 = r.get(8)?;
        let role: String = r.get(2)?;
        let holds = role == "owner" || perm.map(|p| perms[p].as_bool().unwrap_or(false)).unwrap_or(true);
        if holds && (role == "owner" || limit >= min_discount_pct) {
            return Ok(Some(user_from_row(r, now)?));
        }
    }
    Ok(None)
}

pub fn user_name(conn: &Connection, user_id: &str) -> Result<String> {
    Ok(conn.query_row("SELECT name FROM users WHERE id=?1", [user_id], |r| r.get(0)).optional()?.unwrap_or_else(|| "Cashier".into()))
}

// ---------- categories / items ----------

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>> {
    let mut st = conn.prepare("SELECT id,name FROM categories WHERE substr(id,1,1) != '_' ORDER BY sort, rowid")?;
    let v = st.query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)? }))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub(crate) const ITEM_SELECT: &str = "SELECT i.id,i.code,COALESCE(b.barcode,''),i.name,i.name_ta,i.category_id,c.name,i.brand,i.unit,i.loose,i.pack_size,
    i.hsn,i.gst_rate,i.mrp,i.price,i.cost,i.stock,i.reorder_level,i.active
    FROM items i JOIN categories c ON c.id=i.category_id LEFT JOIN barcodes b ON b.item_id=i.id AND b.is_primary=1";

pub(crate) fn item_from_row(r: &Row) -> rusqlite::Result<Item> {
    Ok(Item {
        id: r.get(0)?,
        code: r.get(1)?,
        barcode: r.get(2)?,
        name: r.get(3)?,
        name_ta: r.get(4)?,
        category_id: r.get(5)?,
        category: r.get(6)?,
        brand: r.get(7)?,
        unit: r.get(8)?,
        loose: r.get::<_, i64>(9)? != 0,
        pack_size: r.get(10)?,
        hsn: r.get(11)?,
        gst_rate: r.get(12)?,
        mrp: r.get(13)?,
        price: r.get(14)?,
        cost: r.get(15)?,
        stock: r.get(16)?,
        reorder_level: r.get(17)?,
        active: r.get::<_, i64>(18)? != 0,
    })
}

pub fn list_items(conn: &Connection) -> Result<Vec<Item>> {
    let mut st = conn.prepare_cached(&format!("{ITEM_SELECT} WHERE i.kind='item' ORDER BY i.rowid"))?;
    let v = st.query_map([], item_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// Scan or type a code. Barcode first (primary key lookup), then the short counter code.
pub fn find_item_by_code(conn: &Connection, code: &str) -> Result<Option<Item>> {
    let k = code.trim();
    if k.is_empty() {
        return Ok(None);
    }
    let by_barcode = conn
        .prepare_cached(&format!("{ITEM_SELECT} WHERE i.id = (SELECT item_id FROM barcodes WHERE barcode=?1) AND i.active=1 AND i.kind='item'"))?
        .query_row([k], item_from_row)
        .optional()?;
    if by_barcode.is_some() {
        return Ok(by_barcode);
    }
    Ok(conn.prepare_cached(&format!("{ITEM_SELECT} WHERE i.code=?1 AND i.active=1 AND i.kind='item'"))?.query_row([k], item_from_row).optional()?)
}

pub fn search_items(conn: &Connection, query: &str, limit: usize) -> Result<Vec<Item>> {
    // Score on a light projection, then load only the winners.
    let mut st = conn.prepare_cached(
        "SELECT i.id, i.name, COALESCE(i.name_ta,''), i.code, COALESCE(b.barcode,'')
         FROM items i LEFT JOIN barcodes b ON b.item_id=i.id AND b.is_primary=1 WHERE i.active=1 AND i.kind='item' ORDER BY i.rowid",
    )?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, [r.get::<_, String>(1)?, r.get(2)?, r.get(3)?, r.get(4)?])))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let ids = fuzzy_pick(&rows, query, limit);
    load_items_in_order(conn, &ids)
}

fn load_items_in_order(conn: &Connection, ids: &[String]) -> Result<Vec<Item>> {
    let mut out = Vec::with_capacity(ids.len());
    let mut st = conn.prepare_cached(&format!("{ITEM_SELECT} WHERE i.id=?1"))?;
    for id in ids {
        if let Some(it) = st.query_row([id], item_from_row).optional()? {
            out.push(it);
        }
    }
    Ok(out)
}

pub fn low_stock(conn: &Connection, limit: i64) -> Result<Vec<Item>> {
    let mut st = conn.prepare_cached(&format!(
        "{ITEM_SELECT} WHERE i.active=1 AND i.kind='item' AND i.service=0 AND i.stock <= i.reorder_level
         ORDER BY CAST(i.stock AS REAL) / MAX(i.reorder_level, 1), i.rowid LIMIT ?1"
    ))?;
    let v = st.query_map([limit], item_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

// ---------- customers ----------

fn customer_from_row(r: &Row, now: chrono::DateTime<Local>) -> rusqlite::Result<Customer> {
    let last: Option<String> = r.get(7)?;
    Ok(Customer {
        id: r.get(0)?,
        name: r.get(1)?,
        phone: r.get(2)?,
        area: r.get(3)?,
        credit_limit: r.get(4)?,
        outstanding: r.get(5)?,
        loyalty_points: r.get(6)?,
        last_visit: visit_label(last.as_deref(), now),
    })
}

const CUSTOMER_SELECT: &str = "SELECT id,name,phone,area,credit_limit,outstanding,loyalty_points,last_visit_at FROM customers";

pub fn list_customers(conn: &Connection) -> Result<Vec<Customer>> {
    let now = Local::now();
    let mut st = conn.prepare_cached(&format!("{CUSTOMER_SELECT} ORDER BY rowid"))?;
    let v = st.query_map([], |r| customer_from_row(r, now))?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn search_customers(conn: &Connection, query: &str, limit: usize) -> Result<Vec<Customer>> {
    let now = Local::now();
    let all = list_customers(conn)?;
    let rows: Vec<(String, [String; 4])> = all
        .iter()
        .map(|c| (c.id.clone(), [c.name.clone(), c.phone.replacen(' ', "", 1), String::new(), String::new()]))
        .collect();
    let ids = fuzzy_pick(&rows, query, limit);
    let by_id: HashMap<&str, &Customer> = all.iter().map(|c| (c.id.as_str(), c)).collect();
    let _ = now;
    Ok(ids.iter().filter_map(|id| by_id.get(id.as_str()).map(|c| (*c).clone())).collect())
}

pub fn quick_add_customer(conn: &mut Connection, name: &str, phone: &str) -> Result<Customer> {
    let name = name.trim();
    if name.is_empty() {
        return invalid("Enter the customer name");
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let id = db::fresh_id(&tx, "customers", "c", "CUSTOMER")?;
    tx.execute(
        "INSERT INTO customers(id,name,phone,area,credit_limit,outstanding,loyalty_points,last_visit_at,created_at)
         VALUES(?1,?2,?3,'Coimbatore',0,0,0,?4,?4)",
        params![id, name, phone.trim(), iso(now)],
    )?;
    audit(&tx, now, "counter", "create", "customer", &id, name)?;
    tx.commit()?;
    let c = conn.query_row(&format!("{CUSTOMER_SELECT} WHERE id=?1"), [&id], |r| customer_from_row(r, now))?;
    Ok(c)
}

// ---------- fuzzy (port of packages/data/src/fuzzy.ts) ----------

pub fn fuzzy_score(query: &str, text: &str) -> i64 {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return 1;
    }
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let ts: String = t.iter().collect();
    if ts == q {
        return 1000;
    }
    if ts.starts_with(&q) {
        return 800;
    }
    let mut total = 0i64;
    for tok in q.split_whitespace() {
        let tc: Vec<char> = tok.chars().collect();
        if let Some(idx) = find_sub(&t, &tc, 0) {
            let base = if idx == 0 || t[idx - 1] == ' ' { 200 } else { 120 };
            total += base - (idx as i64).min(50);
            continue;
        }
        let mut ti = 0usize;
        let mut hits = 0i64;
        for ch in &tc {
            match t[ti.min(t.len())..].iter().position(|c| c == ch) {
                Some(p) => {
                    ti += p + 1;
                    hits += 1;
                }
                None => return 0,
            }
        }
        total += hits * 4;
    }
    total
}

fn find_sub(hay: &[char], needle: &[char], from: usize) -> Option<usize> {
    if needle.is_empty() {
        return Some(from);
    }
    if hay.len() < needle.len() {
        return None;
    }
    (from..=hay.len() - needle.len()).find(|&i| &hay[i..i + needle.len()] == needle)
}

/// Best `limit` ids by fuzzy score over the given fields (empty query: the first `limit` in order).
fn fuzzy_pick(rows: &[(String, [String; 4])], query: &str, limit: usize) -> Vec<String> {
    if query.trim().is_empty() {
        return rows.iter().take(limit).map(|r| r.0.clone()).collect();
    }
    let mut scored: Vec<(i64, usize)> = rows
        .iter()
        .enumerate()
        .map(|(i, (_, fields))| (fields.iter().map(|f| fuzzy_score(query, f)).max().unwrap_or(0), i))
        .filter(|(s, _)| *s > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1))); // stable like JS sort
    scored.into_iter().take(limit).map(|(_, i)| rows[i].0.clone()).collect()
}
