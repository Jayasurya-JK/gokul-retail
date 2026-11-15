//! Office catalogue: item editor (Tamil name, many barcodes, loose/packed link), categories, brands,
//! stock adjustments and stock take. Every stock change is a ledger row (`db::post_movement`).

use crate::db::{self, audit, fresh_id, iso, post_movement, round_div};
use crate::error::{ApiError, Result};
use crate::store::{item_from_row, ITEM_SELECT};
use crate::types::{Item, StockMovement};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub const UNITS: &[&str] = &["kg", "g", "l", "ml", "pc", "tin", "btl", "pkt"];
pub const OFFICE: &str = "Office";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub name_ta: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub barcodes: Vec<String>,
    #[serde(default)]
    pub category_id: String,
    #[serde(default)]
    pub brand: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub loose: bool,
    #[serde(default)]
    pub pack_size: String,
    /// Shelf life for the default Exp date on stickers: a number of `shelf_life_unit`, None or 0 = not set.
    #[serde(default)]
    pub shelf_life: Option<i64>,
    /// "days" or "months"
    #[serde(default)]
    pub shelf_life_unit: Option<String>,
    #[serde(default)]
    pub parent_id: String,
    #[serde(default)]
    pub scale_code: String,
    #[serde(default)]
    pub hsn: String,
    #[serde(default, with = "crate::types::rate_serde")]
    pub gst_rate: f64,
    /// Optional cess percent on top of GST (0 = none).
    #[serde(default, with = "crate::types::rate_serde")]
    pub cess_rate: f64,
    #[serde(default)]
    pub mrp: i64,
    #[serde(default)]
    pub price: i64,
    #[serde(default)]
    pub cost: i64,
    /// Optional wholesale price (GST inclusive); None or 0 = the item has no wholesale price.
    #[serde(default)]
    pub wholesale_price: Option<i64>,
    /// Default supplier id. None keeps what is stored, an empty string clears it.
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub reorder_level: i64,
    #[serde(default = "yes")]
    pub active: bool,
}
fn yes() -> bool {
    true
}

type Issues = BTreeMap<String, String>;

fn all_digits(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())
}

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Same checks as `validateItemInput` in packages/data (messages included).
pub fn validate_item(conn: &Connection, i: &ItemInput) -> Result<Issues> {
    let mut e = Issues::new();
    let name = i.name.trim();
    if name.is_empty() {
        e.insert("name".into(), "Enter the item name.".into());
    } else if name.chars().count() < 3 {
        e.insert("name".into(), "Item name is too short. Use at least 3 letters.".into());
    }
    let code = i.code.trim();
    let own = i.id.clone().unwrap_or_default();
    if !(all_digits(code) && code.len() <= 6) {
        e.insert("code".into(), "Counter code must be 1 to 6 digits, for example 142.".into());
    } else {
        let used: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE code=?1 AND id != ?2", params![code, own], |r| r.get(0))?;
        if used > 0 {
            e.insert("code".into(), format!("Code {code} is already used by another item."));
        }
    }
    let cat_ok: i64 = conn.query_row("SELECT COUNT(*) FROM categories WHERE id=?1", [&i.category_id], |r| r.get(0))?;
    if i.category_id.is_empty() || cat_ok == 0 {
        e.insert("categoryId".into(), "Choose a category.".into());
    }
    if !UNITS.contains(&i.unit.as_str()) {
        e.insert("unit".into(), "Choose the unit of measure.".into());
    }
    if i.barcodes.is_empty() {
        e.insert("barcodes".into(), "Add at least one barcode. Use Generate for items without one.".into());
    } else {
        let bad = i.barcodes.iter().find(|b| !(all_digits(b) && (6..=14).contains(&b.len())));
        let same = i.barcodes.iter().enumerate().find(|(k, b)| i.barcodes.iter().position(|x| x == *b) != Some(*k)).map(|(_, b)| b);
        let mut dup: Option<&String> = None;
        for b in &i.barcodes {
            let n: i64 =
                conn.query_row("SELECT COUNT(*) FROM barcodes WHERE barcode=?1 AND item_id != ?2", params![b, own], |r| r.get(0))?;
            if n > 0 {
                dup = Some(b);
                break;
            }
        }
        if let Some(b) = bad {
            e.insert("barcodes".into(), format!("Barcode {b} should be 6 to 14 digits."));
        } else if let Some(b) = same {
            e.insert("barcodes".into(), format!("Barcode {b} is listed twice."));
        } else if let Some(b) = dup {
            e.insert("barcodes".into(), format!("Barcode {b} already belongs to another item."));
        }
    }
    if !i.loose && i.pack_size.trim().is_empty() {
        e.insert("packSize".into(), "Enter the pack size, for example 1 L or 500 g.".into());
    }
    if i.loose && !i.scale_code.is_empty() && !(all_digits(&i.scale_code) && i.scale_code.len() <= 5) {
        e.insert("scaleCode".into(), "Scale code is 1 to 5 digits.".into());
    }
    if !i.loose && !i.parent_id.is_empty() {
        let ok: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE id=?1 AND loose=1", [&i.parent_id], |r| r.get(0))?;
        if ok == 0 {
            e.insert("parentId".into(), "Choose a loose item to fill this pack from.".into());
        }
    }
    let hsn = i.hsn.trim();
    if !(all_digits(hsn) && [4, 6, 8].contains(&hsn.len())) {
        e.insert("hsn".into(), "HSN is 4, 6 or 8 digits, for example 1508.".into());
    }
    if let Err(m) = crate::gst::check_rate(conn, i.gst_rate, "GST rate") {
        e.insert("gstRate".into(), m.to_string());
    }
    if let Err(m) = crate::gst::check_cess(i.cess_rate, "Cess") {
        e.insert("cessRate".into(), m.to_string());
    }
    if i.price <= 0 {
        e.insert("price".into(), "Selling price must be more than zero.".into());
    }
    if i.mrp <= 0 {
        e.insert("mrp".into(), "Enter the MRP printed on the pack.".into());
    } else if i.price > i.mrp {
        e.insert("price".into(), "Selling price cannot be higher than the MRP.".into());
    }
    if i.cost < 0 {
        e.insert("cost".into(), "Purchase cost cannot be negative.".into());
    } else if i.price > 0 && i.cost > i.price {
        e.insert("cost".into(), "Purchase cost is higher than the selling price. Check this before saving.".into());
    }
    if i.reorder_level < 0 {
        e.insert("reorderLevel".into(), "Reorder level cannot be negative.".into());
    }
    Ok(e)
}

pub fn get_item(conn: &Connection, id: &str) -> Result<Option<Item>> {
    Ok(conn.prepare_cached(&format!("{ITEM_SELECT} WHERE i.id=?1"))?.query_row([id], item_from_row).optional()?)
}

pub fn get_item_detail(conn: &Connection, id: &str) -> Result<Value> {
    let Some(item) = get_item(conn, id)? else { return Ok(Value::Null) };
    let mut st = conn.prepare("SELECT barcode FROM barcodes WHERE item_id=?1 ORDER BY is_primary DESC, rowid")?;
    let barcodes = st.query_map([id], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let (parent, scale): (Option<String>, String) =
        conn.query_row("SELECT parent_id, scale_code FROM items WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(json!({ "item": item, "barcodes": barcodes, "parentId": parent.unwrap_or_default(), "scaleCode": scale }))
}

fn sync_brands(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO brands(name,sort) SELECT brand, MIN(rowid) FROM items WHERE kind='item' AND brand != '' GROUP BY brand ORDER BY MIN(rowid)",
        [],
    )?;
    Ok(())
}

fn set_supplier(tx: &rusqlite::Transaction, id: &str, sent: &Option<String>) -> Result<()> {
    if let Some(s) = sent {
        let s = s.trim();
        if !s.is_empty() && tx.query_row("SELECT COUNT(*) FROM suppliers WHERE id=?1", [s], |r| r.get::<_, i64>(0))? == 0 {
            return crate::error::invalid("That supplier does not exist.");
        }
        tx.execute("UPDATE items SET supplier_id=?1 WHERE id=?2", params![Some(s).filter(|x| !x.is_empty()), id])?;
    }
    Ok(())
}

pub fn save_item(conn: &mut Connection, input: &ItemInput) -> Result<Value> {
    let issues = validate_item(conn, input)?;
    let blocking = issues.keys().any(|k| !(k == "cost" && input.cost > input.price));
    if blocking {
        return Ok(json!({ "ok": false, "issues": issues }));
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let name = norm(&input.name);
    let brand = if input.brand.trim().is_empty() { "Loose".to_string() } else { norm(&input.brand) };
    let name_ta = Some(input.name_ta.trim().to_string()).filter(|s| !s.is_empty());
    let pack = if input.loose { None } else { Some(input.pack_size.trim().to_string()) };
    let (life, life_unit) = match (input.shelf_life.filter(|n| *n > 0), input.shelf_life_unit.as_deref()) {
        (Some(n), Some("days")) => (Some(n.min(3650)), Some("days")),
        (Some(n), _) => (Some(n.min(120)), Some("months")),
        _ => (None, None),
    };
    let parent = if !input.loose && !input.parent_id.is_empty() { Some(input.parent_id.clone()) } else { None };
    let scale = if input.loose { input.scale_code.clone() } else { String::new() };
    let id = match &input.id {
        Some(id) if tx.query_row("SELECT COUNT(*) FROM items WHERE id=?1", [id], |r| r.get::<_, i64>(0))? > 0 => {
            tx.execute(
                "UPDATE items SET code=?1,name=?2,name_ta=?3,category_id=?4,brand=?5,unit=?6,loose=?7,pack_size=?8,parent_id=?9,scale_code=?10,
                 hsn=?11,gst_rate=?12,mrp=?13,price=?14,cost=?15,reorder_level=?16,active=?17,shelf_life=?19,shelf_life_unit=?20,cess_rate=?21 WHERE id=?18",
                params![
                    input.code.trim(), name, name_ta, input.category_id, brand, input.unit, input.loose, pack, parent, scale,
                    input.hsn.trim(), input.gst_rate, input.mrp, input.price, input.cost, input.reorder_level, input.active, id, life, life_unit, input.cess_rate
                ],
            )?;
            tx.execute("UPDATE items SET wholesale_price=?1 WHERE id=?2", params![input.wholesale_price.filter(|w| *w > 0), id])?;
            set_supplier(&tx, id, &input.supplier_id)?;
            audit(&tx, now, OFFICE, "update", "item", id, &name)?;
            id.clone()
        }
        _ => {
            let id = fresh_id(&tx, "items", "i", "ITEM")?;
            tx.execute(
                "INSERT INTO items(id,code,name,name_ta,category_id,brand,unit,loose,pack_size,parent_id,scale_code,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at,shelf_life,shelf_life_unit,cess_rate)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,0,?17,?18,?19,?20,?21,?22)",
                params![
                    id, input.code.trim(), name, name_ta, input.category_id, brand, input.unit, input.loose, pack, parent, scale,
                    input.hsn.trim(), input.gst_rate, input.mrp, input.price, input.cost, input.reorder_level, input.active, iso(now), life, life_unit, input.cess_rate
                ],
            )?;
            tx.execute("UPDATE items SET wholesale_price=?1 WHERE id=?2", params![input.wholesale_price.filter(|w| *w > 0), id])?;
            set_supplier(&tx, &id, &input.supplier_id)?;
            audit(&tx, now, OFFICE, "create", "item", &id, &name)?;
            id
        }
    };
    tx.execute("DELETE FROM barcodes WHERE item_id=?1", [&id])?;
    for (k, b) in input.barcodes.iter().enumerate() {
        tx.execute("INSERT INTO barcodes(barcode,item_id,is_primary) VALUES(?1,?2,?3)", params![b, id, if k == 0 { 1 } else { 0 }])?;
    }
    sync_brands(&tx)?;
    let item = get_item(&tx, &id)?.ok_or_else(|| db::internal("Item vanished"))?;
    tx.commit()?;
    Ok(json!({ "ok": true, "item": item }))
}

fn ean13_check(body12: &str) -> char {
    let sum: u32 = body12.chars().enumerate().map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 0 { 1 } else { 3 }).sum();
    char::from_digit((10 - sum % 10) % 10, 10).unwrap_or('0')
}

/// Next free internal EAN-13 (prefix 2000, check digit included).
pub fn generate_barcode(conn: &mut Connection) -> Result<String> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    loop {
        let n = db::next_seq(&tx, "BARCODE", "-")?;
        let body = format!("2000{:08}", n);
        let code = format!("{body}{}", ean13_check(&body));
        let used: i64 = tx.query_row("SELECT COUNT(*) FROM barcodes WHERE barcode=?1", [&code], |r| r.get(0))?;
        if used == 0 {
            tx.commit()?;
            return Ok(code);
        }
    }
}

pub fn next_item_code(conn: &Connection) -> Result<String> {
    let max: i64 = conn.query_row(
        "SELECT COALESCE(MAX(CAST(code AS INTEGER)),0) FROM items WHERE kind='item' AND code GLOB '[0-9]*' AND length(code) <= 6",
        [],
        |r| r.get(0),
    )?;
    Ok((max.max(100) + 1).to_string())
}

pub fn list_loose_items(conn: &Connection) -> Result<Vec<Item>> {
    let mut st = conn.prepare(&format!("{ITEM_SELECT} WHERE i.kind='item' AND i.loose=1 ORDER BY i.rowid"))?;
    let v = st.query_map([], item_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn bulk(conn: &mut Connection, ids: &[String], what: &str, sql: &str, value: rusqlite::types::Value) -> Result<()> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for id in ids {
        tx.execute(sql, params![value, id])?;
    }
    audit(&tx, now, OFFICE, "bulk_update", "item", &format!("{} items", ids.len()), what)?;
    tx.commit()?;
    Ok(())
}

pub fn set_items_active(conn: &mut Connection, ids: &[String], active: bool) -> Result<()> {
    bulk(conn, ids, if active { "activate" } else { "deactivate" }, "UPDATE items SET active=?1 WHERE id=?2", (active as i64).into())
}

pub fn set_items_category(conn: &mut Connection, ids: &[String], category_id: &str) -> Result<()> {
    let ok: i64 = conn.query_row("SELECT COUNT(*) FROM categories WHERE id=?1", [category_id], |r| r.get(0))?;
    if ok == 0 {
        return Err(ApiError::Invalid("Choose a category.".into()));
    }
    bulk(conn, ids, &format!("category {category_id}"), "UPDATE items SET category_id=?1 WHERE id=?2", category_id.to_string().into())
}

pub fn set_items_gst(conn: &mut Connection, ids: &[String], rate: f64) -> Result<()> {
    crate::gst::check_rate(conn, rate, "GST rate")?;
    bulk(conn, ids, &format!("gst {rate}"), "UPDATE items SET gst_rate=?1 WHERE id=?2", rate.into())
}

pub fn kind_label(kind: &str) -> &str {
    match kind {
        "opening" | "packing" => "adjustment",
        "cancel" => "return",
        k => k,
    }
}

pub fn item_movements(conn: &Connection, item_id: &str, limit: i64) -> Result<Vec<StockMovement>> {
    let mut st = conn.prepare_cached(
        "SELECT m.id, m.at, m.item_id, i.name, m.kind, m.qty, m.note FROM stock_movements m JOIN items i ON i.id=m.item_id
         WHERE m.item_id=?1 ORDER BY m.id DESC LIMIT ?2",
    )?;
    let v = st
        .query_map(params![item_id, limit.clamp(1, 5000)], |r| {
            let kind: String = r.get(4)?;
            Ok(StockMovement {
                id: format!("sm{}", r.get::<_, i64>(0)?),
                at: r.get(1)?,
                item_id: r.get(2)?,
                item_name: r.get(3)?,
                kind: kind_label(&kind).to_string(),
                qty: r.get(5)?,
                note: r.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

// ---------- categories and brands ----------

fn name_result(r: std::result::Result<(), String>) -> Value {
    match r {
        Ok(()) => json!({ "ok": true }),
        Err(m) => json!({ "ok": false, "message": m }),
    }
}

pub fn list_categories_with_counts(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare(
        "SELECT c.id, c.name, (SELECT COUNT(*) FROM items i WHERE i.category_id=c.id AND i.kind='item')
         FROM categories c WHERE substr(c.id,1,1) != '_' ORDER BY c.sort, c.rowid",
    )?;
    let v = st
        .query_map([], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "items": r.get::<_, i64>(2)? })))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn add_category(conn: &mut Connection, name: &str) -> Result<Value> {
    let n = norm(name);
    if n.is_empty() {
        return Ok(name_result(Err("Enter a category name.".into())));
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let clash: i64 = tx.query_row("SELECT COUNT(*) FROM categories WHERE lower(name)=lower(?1)", [&n], |r| r.get(0))?;
    if clash > 0 {
        return Ok(name_result(Err(format!("\"{n}\" already exists."))));
    }
    let id = fresh_id(&tx, "categories", "cat", "CATEGORY")?;
    let sort: i64 = tx.query_row("SELECT COALESCE(MAX(sort),0)+1 FROM categories WHERE substr(id,1,1) != '_'", [], |r| r.get(0))?;
    tx.execute("INSERT INTO categories(id,name,sort) VALUES(?1,?2,?3)", params![id, n, sort])?;
    audit(&tx, Local::now(), OFFICE, "create", "category", &id, &n)?;
    tx.commit()?;
    Ok(name_result(Ok(())))
}

pub fn rename_category(conn: &mut Connection, id: &str, name: &str) -> Result<Value> {
    let n = norm(name);
    let exists: i64 = conn.query_row("SELECT COUNT(*) FROM categories WHERE id=?1 AND substr(id,1,1) != '_'", [id], |r| r.get(0))?;
    if exists == 0 {
        return Ok(name_result(Err("Category not found.".into())));
    }
    if n.is_empty() {
        return Ok(name_result(Err("Enter a category name.".into())));
    }
    let clash: i64 = conn.query_row("SELECT COUNT(*) FROM categories WHERE lower(name)=lower(?1) AND id != ?2", params![n, id], |r| r.get(0))?;
    if clash > 0 {
        return Ok(name_result(Err(format!("\"{n}\" already exists."))));
    }
    conn.execute("UPDATE categories SET name=?1 WHERE id=?2", params![n, id])?;
    audit(conn, Local::now(), OFFICE, "rename", "category", id, &n)?;
    Ok(name_result(Ok(())))
}

pub fn delete_category(conn: &mut Connection, id: &str) -> Result<Value> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE category_id=?1", [id], |r| r.get(0))?;
    if count > 0 {
        return Ok(name_result(Err(format!("{count} items still use this category. Move them to another category first."))));
    }
    if id.starts_with('_') {
        return Ok(name_result(Err("This category is built in and cannot be deleted.".into())));
    }
    conn.execute("DELETE FROM categories WHERE id=?1", [id])?;
    audit(conn, Local::now(), OFFICE, "delete", "category", id, "")?;
    Ok(name_result(Ok(())))
}

pub fn move_category(conn: &mut Connection, id: &str, delta: i64) -> Result<()> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut ids: Vec<String> = {
        let mut st = tx.prepare("SELECT id FROM categories WHERE substr(id,1,1) != '_' ORDER BY sort, rowid")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    reorder(&mut ids, id, delta);
    for (k, cid) in ids.iter().enumerate() {
        tx.execute("UPDATE categories SET sort=?1 WHERE id=?2", params![k as i64, cid])?;
    }
    tx.commit()?;
    Ok(())
}

fn reorder(ids: &mut Vec<String>, id: &str, delta: i64) {
    if let Some(i) = ids.iter().position(|x| x == id) {
        let to = i as i64 + delta;
        if to >= 0 && (to as usize) < ids.len() {
            let x = ids.remove(i);
            ids.insert(to as usize, x);
        }
    }
}

fn brand_id(id: &str) -> Option<i64> {
    db::parse_id("br", id)
}

pub fn list_brands(conn: &Connection) -> Result<Vec<Value>> {
    sync_brands(conn)?;
    let mut st = conn.prepare(
        "SELECT b.id, b.name, (SELECT COUNT(*) FROM items i WHERE i.brand=b.name AND i.kind='item') FROM brands b ORDER BY b.sort, b.id",
    )?;
    let v = st
        .query_map([], |r| Ok(json!({ "id": format!("br{}", r.get::<_, i64>(0)?), "name": r.get::<_, String>(1)?, "items": r.get::<_, i64>(2)? })))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn add_brand(conn: &mut Connection, name: &str) -> Result<Value> {
    let n = norm(name);
    if n.is_empty() {
        return Ok(name_result(Err("Enter a brand name.".into())));
    }
    sync_brands(conn)?;
    let clash: i64 = conn.query_row("SELECT COUNT(*) FROM brands WHERE name=?1", [&n], |r| r.get(0))?;
    if clash > 0 {
        return Ok(name_result(Err(format!("\"{n}\" already exists."))));
    }
    conn.execute("INSERT INTO brands(name,sort) VALUES(?1,(SELECT COALESCE(MAX(sort),0)+1 FROM brands))", [&n])?;
    audit(conn, Local::now(), OFFICE, "create", "brand", &n, "")?;
    Ok(name_result(Ok(())))
}

pub fn rename_brand(conn: &mut Connection, id: &str, name: &str) -> Result<Value> {
    let n = norm(name);
    sync_brands(conn)?;
    let Some(bid) = brand_id(id) else { return Ok(name_result(Err("Brand not found.".into()))) };
    let old: Option<String> = conn.query_row("SELECT name FROM brands WHERE id=?1", [bid], |r| r.get(0)).optional()?;
    let Some(old) = old else { return Ok(name_result(Err("Brand not found.".into()))) };
    if n.is_empty() {
        return Ok(name_result(Err("Enter a brand name.".into())));
    }
    let clash: i64 = conn.query_row("SELECT COUNT(*) FROM brands WHERE name=?1 AND id != ?2", params![n, bid], |r| r.get(0))?;
    if clash > 0 {
        return Ok(name_result(Err(format!("\"{n}\" already exists."))));
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute("UPDATE items SET brand=?1 WHERE brand=?2", params![n, old])?;
    tx.execute("UPDATE brands SET name=?1 WHERE id=?2", params![n, bid])?;
    audit(&tx, Local::now(), OFFICE, "rename", "brand", &old, &n)?;
    tx.commit()?;
    Ok(name_result(Ok(())))
}

pub fn delete_brand(conn: &mut Connection, id: &str) -> Result<Value> {
    sync_brands(conn)?;
    let Some(bid) = brand_id(id) else { return Ok(name_result(Ok(()))) };
    let name: Option<String> = conn.query_row("SELECT name FROM brands WHERE id=?1", [bid], |r| r.get(0)).optional()?;
    let Some(name) = name else { return Ok(name_result(Ok(()))) };
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM items WHERE brand=?1", [&name], |r| r.get(0))?;
    if count > 0 {
        return Ok(name_result(Err(format!("{count} items still use this brand. Change their brand first."))));
    }
    conn.execute("DELETE FROM brands WHERE id=?1", [bid])?;
    audit(conn, Local::now(), OFFICE, "delete", "brand", &name, "")?;
    Ok(name_result(Ok(())))
}

pub fn move_brand(conn: &mut Connection, id: &str, delta: i64) -> Result<()> {
    sync_brands(conn)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut ids: Vec<String> = {
        let mut st = tx.prepare("SELECT id FROM brands ORDER BY sort, id")?;
        let v = st.query_map([], |r| Ok(format!("br{}", r.get::<_, i64>(0)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    reorder(&mut ids, id, delta);
    for (k, b) in ids.iter().enumerate() {
        if let Some(n) = brand_id(b) {
            tx.execute("UPDATE brands SET sort=?1 WHERE id=?2", params![k as i64, n])?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ---------- stock adjustments and stock take ----------

pub const ADJUST_REASONS: &[(&str, &str)] =
    &[("damage", "Damage"), ("leak", "Leak"), ("spill", "Spill"), ("sample", "Sample"), ("correction", "Correction")];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustmentInput {
    pub item_id: String,
    pub reason: String,
    pub qty: i64,
    #[serde(default)]
    pub note: String,
}

fn adjustment_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": format!("a{}", r.get::<_, i64>(0)?), "at": r.get::<_, String>(1)?, "itemId": r.get::<_, String>(2)?,
        "itemName": r.get::<_, String>(3)?, "unit": r.get::<_, String>(4)?, "loose": r.get::<_, i64>(5)? != 0,
        "reason": r.get::<_, String>(6)?, "qty": r.get::<_, i64>(7)?, "value": r.get::<_, i64>(8)?,
        "note": r.get::<_, String>(9)?, "by": r.get::<_, String>(10)?,
    }))
}

const ADJ_SELECT: &str = "SELECT a.id,a.at,a.item_id,i.name,i.unit,i.loose,a.reason,a.qty,a.value,a.note,a.by_name
    FROM stock_adjustments a JOIN items i ON i.id=a.item_id";

/// Writes the adjustment row and its ledger row inside the caller's transaction.
pub(crate) fn apply_adjustment(tx: &Connection, now: chrono::DateTime<Local>, item_id: &str, reason: &str, qty: i64, note: &str, by: &str) -> Result<i64> {
    let by = db::actor_or(by);
    let by = by.as_str();
    let cost: i64 = tx.query_row("SELECT cost FROM items WHERE id=?1", [item_id], |r| r.get(0))?;
    let value = round_div(cost * qty, 1000);
    tx.execute(
        "INSERT INTO stock_adjustments(at,item_id,reason,qty,value,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![iso(now), item_id, reason, qty, value, note, by],
    )?;
    let id = tx.last_insert_rowid();
    let label = ADJUST_REASONS.iter().find(|(k, _)| *k == reason).map(|(_, l)| *l).unwrap_or(reason);
    let text = if note.is_empty() { label.to_string() } else { format!("{label}: {note}") };
    post_movement(tx, &iso(now), item_id, "adjustment", qty, "adjustment", &id.to_string(), &text, by)?;
    audit(tx, now, by, "stock_adjust", "item", item_id, &format!("{reason} {qty}"))?;
    Ok(id)
}

pub fn create_adjustment(conn: &mut Connection, input: &AdjustmentInput) -> Result<Value> {
    let fail = |m: String| Ok(json!({ "ok": false, "message": m }));
    let Some(it) = get_item(conn, &input.item_id)? else { return fail("Choose an item first.".into()) };
    if !ADJUST_REASONS.iter().any(|(k, _)| *k == input.reason) {
        return fail("Choose a reason.".into());
    }
    if input.qty == 0 {
        return fail("Enter a quantity more than zero.".into());
    }
    if input.reason != "correction" && input.qty > 0 {
        let r = &input.reason;
        return fail(format!("{}{} can only reduce stock.", r[..1].to_uppercase(), &r[1..]));
    }
    if it.stock + input.qty < 0 {
        let shown = if it.loose { format!("{}.{:03}", it.stock / 1000, it.stock % 1000) } else { (it.stock / 1000).to_string() };
        return fail(format!("Only {shown} {} in stock. You cannot remove more than that.", it.unit));
    }
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let id = apply_adjustment(&tx, now, &input.item_id, &input.reason, input.qty, input.note.trim(), OFFICE)?;
    let adj = tx.query_row(&format!("{ADJ_SELECT} WHERE a.id=?1"), [id], adjustment_json)?;
    tx.commit()?;
    Ok(json!({ "ok": true, "adjustment": adj }))
}

pub fn list_adjustments(conn: &Connection) -> Result<Vec<Value>> {
    let mut st = conn.prepare(&format!("{ADJ_SELECT} ORDER BY a.id DESC LIMIT 2000"))?;
    let v = st.query_map([], adjustment_json)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

pub fn start_stock_take(conn: &Connection, category_id: &str) -> Result<Vec<Value>> {
    let mut st = conn.prepare(
        "SELECT i.id,i.code,i.name,i.unit,i.loose,c.name,i.stock,i.cost,i.price,COALESCE(i.supplier_id,''),COALESCE(s.name,'') FROM items i JOIN categories c ON c.id=i.category_id
         LEFT JOIN suppliers s ON s.id=i.supplier_id
         WHERE i.kind='item' AND i.service=0 AND i.active=1 AND (?1='all' OR i.category_id=?1) ORDER BY i.rowid",
    )?;
    let v = st
        .query_map([category_id], |r| {
            Ok(json!({
                "itemId": r.get::<_, String>(0)?, "code": r.get::<_, String>(1)?, "name": r.get::<_, String>(2)?,
                "unit": r.get::<_, String>(3)?, "loose": r.get::<_, i64>(4)? != 0, "category": r.get::<_, String>(5)?,
                "system": r.get::<_, i64>(6)?, "cost": r.get::<_, i64>(7)?,
                "price": r.get::<_, i64>(8)?, "supplierId": r.get::<_, String>(9)?, "supplier": r.get::<_, String>(10)?,
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockTakeCount {
    pub item_id: String,
    pub counted: i64,
}

/// Every variance becomes one adjustment (reason "correction") and one ledger row, all in one transaction.
pub fn post_stock_take(conn: &mut Connection, counts: &[StockTakeCount], note: &str) -> Result<Value> {
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let text = if note.trim().is_empty() { "Stock take".to_string() } else { note.trim().to_string() };
    let (mut adjusted, mut unchanged, mut net) = (0i64, 0i64, 0i64);
    for c in counts {
        if c.counted < 0 {
            return Err(ApiError::Invalid("A counted quantity cannot be negative.".into()));
        }
        let Some((stock, cost)): Option<(i64, i64)> =
            tx.query_row("SELECT stock,cost FROM items WHERE id=?1", [&c.item_id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?
        else {
            continue;
        };
        let diff = c.counted - stock;
        if diff == 0 {
            unchanged += 1;
            continue;
        }
        apply_adjustment(&tx, now, &c.item_id, "correction", diff, &text, OFFICE)?;
        adjusted += 1;
        net += round_div(cost * diff, 1000);
    }
    audit(&tx, now, OFFICE, "stock_take", "stock", &now.format("%Y%m%d%H%M%S").to_string(), &format!("{adjusted} adjusted, {unchanged} unchanged"))?;
    tx.commit()?;
    Ok(json!({ "adjusted": adjusted, "unchanged": unchanged, "netValue": net }))
}

// ---------- items by category / brand (Categories and brands screen) ----------

/// Filter for the master-detail item list. All parts optional; they combine with AND.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPageQuery {
    #[serde(default)]
    pub category_id: Option<String>,
    /// Brand id as listed by `list_brands` ("br12").
    #[serde(default)]
    pub brand_id: Option<String>,
    /// Name, Tamil name, code or any barcode.
    #[serde(default)]
    pub search: String,
    /// "active", "inactive" or "all" (default).
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub offset: i64,
    /// Default 500, at most 5000 per call. `total` always counts every match, so nothing is silently dropped.
    #[serde(default)]
    pub limit: i64,
}

pub fn list_items_page(conn: &Connection, q: &ItemPageQuery) -> Result<Value> {
    sync_brands(conn)?;
    let mut wh = String::from("i.kind='item'");
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(c) = q.category_id.as_deref().filter(|c| !c.is_empty()) {
        args.push(c.to_string().into());
        wh += &format!(" AND i.category_id=?{}", args.len());
    }
    if let Some(b) = q.brand_id.as_deref().filter(|b| !b.is_empty()) {
        let name: Option<String> = match brand_id(b) {
            Some(bid) => conn.query_row("SELECT name FROM brands WHERE id=?1", [bid], |r| r.get(0)).optional()?,
            None => None,
        };
        // An unknown brand matches nothing rather than everything.
        args.push(name.unwrap_or_else(|| "\u{0}".into()).into());
        wh += &format!(" AND i.brand=?{}", args.len());
    }
    match q.status.as_str() {
        "active" => wh += " AND i.active=1",
        "inactive" => wh += " AND i.active=0",
        _ => {}
    }
    let term = norm(&q.search).to_lowercase();
    if !term.is_empty() {
        let like = format!("%{}%", term.replace('!', "!!").replace('%', "!%").replace('_', "!_"));
        args.push(like.into());
        let n = args.len();
        wh += &format!(
            " AND (lower(i.name) LIKE ?{n} ESCAPE '!' OR lower(COALESCE(i.name_ta,'')) LIKE ?{n} ESCAPE '!' OR i.code LIKE ?{n} ESCAPE '!'
              OR EXISTS (SELECT 1 FROM barcodes bb WHERE bb.item_id=i.id AND bb.barcode LIKE ?{n} ESCAPE '!'))"
        );
    }
    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM items i WHERE {wh}"),
        rusqlite::params_from_iter(args.iter()),
        |r| r.get(0),
    )?;
    let limit = if q.limit <= 0 { 500 } else { q.limit.min(5000) };
    let mut st = conn.prepare(&format!("{ITEM_SELECT} WHERE {wh} ORDER BY i.rowid LIMIT {limit} OFFSET {}", q.offset.max(0)))?;
    let items = st.query_map(rusqlite::params_from_iter(args.iter()), item_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(json!({ "total": total, "items": items }))
}

pub fn set_items_brand(conn: &mut Connection, ids: &[String], brand_id_str: &str) -> Result<()> {
    sync_brands(conn)?;
    let name: Option<String> = match brand_id(brand_id_str) {
        Some(bid) => conn.query_row("SELECT name FROM brands WHERE id=?1", [bid], |r| r.get(0)).optional()?,
        None => None,
    };
    let Some(name) = name else { return Err(ApiError::Invalid("Choose a brand.".into())) };
    bulk(conn, ids, &format!("brand {name}"), "UPDATE items SET brand=?1 WHERE id=?2", name.clone().into())
}
