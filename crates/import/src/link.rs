//! `link-suppliers`: fills `items.supplier_id` from the `supplier` column of the POSBean stock export, matching the
//! supplier by name (trimmed, case-insensitive) and the item by barcode, then code, then name. Re-runnable: an item that
//! already has a supplier is left alone. Nothing else is touched. `--dry-run` runs it all and rolls back.

use crate::parse_csv;
use gokul_core::db::audit;
use rusqlite::{params, Connection, TransactionBehavior};
use std::collections::{BTreeMap, HashMap};

pub fn link_suppliers(c: &mut Connection, csv_text: &str, dry_run: bool) -> Result<(Vec<String>, String), String> {
    let e = |x: rusqlite::Error| x.to_string();
    let rows = parse_csv(csv_text)?;
    let (head, body) = rows.split_first().ok_or("the CSV is empty")?;
    let col = |n: &str| head.iter().position(|h| h.trim().trim_start_matches('\u{feff}') == n).ok_or(format!("the CSV has no '{n}' column"));
    let (i_name, i_sup, i_bar, i_code) = (col("cleaned_name")?, col("supplier")?, col("barcode")?, col("item_code")?);
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e)?;

    let mut suppliers: HashMap<String, String> = HashMap::new();
    {
        let mut st = tx.prepare("SELECT id,name FROM suppliers ORDER BY created_at, id").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
            let (id, name) = r.map_err(e)?;
            suppliers.entry(name.trim().to_lowercase()).or_insert(id);
        }
    }
    let by = |sql: &str| -> Result<HashMap<String, Vec<String>>, String> {
        let mut m: HashMap<String, Vec<String>> = HashMap::new();
        let mut st = tx.prepare(sql).map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)? {
            let (k, id) = r.map_err(e)?;
            m.entry(k).or_default().push(id);
        }
        Ok(m)
    };
    let by_barcode = by("SELECT b.barcode, b.item_id FROM barcodes b JOIN items i ON i.id=b.item_id WHERE i.kind='item'")?;
    let by_code = by("SELECT code, id FROM items WHERE kind='item'")?;
    let by_name = by("SELECT lower(trim(name)), id FROM items WHERE kind='item'")?;
    let mut current: HashMap<String, Option<String>> = HashMap::new();
    {
        let mut st = tx.prepare("SELECT id, supplier_id FROM items").map_err(e)?;
        for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))).map_err(e)? {
            let (id, s) = r.map_err(e)?;
            current.insert(id, s);
        }
    }

    let (mut linked, mut already, mut no_supplier, mut no_item) = (0usize, 0usize, 0usize, 0usize);
    let mut unmatched: BTreeMap<String, usize> = BTreeMap::new();
    let mut notes = vec![];
    for (n, r) in body.iter().enumerate() {
        let g = |i: usize| r.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
        let sup = g(i_sup);
        if sup.is_empty() || sup == "0" || sup.eq_ignore_ascii_case("none") {
            no_supplier += 1;
            continue;
        }
        let Some(sid) = suppliers.get(&sup.to_lowercase()) else {
            *unmatched.entry(sup).or_default() += 1;
            continue;
        };
        let pick = |m: &HashMap<String, Vec<String>>, k: &str| -> Option<String> { m.get(k).filter(|v| v.len() == 1).map(|v| v[0].clone()) };
        let (bar, code, name) = (g(i_bar), g(i_code), g(i_name).to_lowercase());
        let item = (!bar.is_empty()).then(|| pick(&by_barcode, &bar)).flatten().or_else(|| (!code.is_empty()).then(|| pick(&by_code, &code)).flatten()).or_else(|| pick(&by_name, &name));
        let Some(item) = item else {
            no_item += 1;
            notes.push(format!("CSV line {}: no single item found for '{}'", n + 2, g(i_name)));
            continue;
        };
        if current.get(&item).cloned().flatten().is_some() {
            already += 1;
            continue;
        }
        tx.execute("UPDATE items SET supplier_id=?1 WHERE id=?2 AND supplier_id IS NULL", params![sid, item]).map_err(e)?;
        current.insert(item, Some(sid.clone()));
        linked += 1;
    }
    for (s, k) in &unmatched {
        notes.push(format!("supplier '{s}' is not in the suppliers list ({k} items left unlinked)"));
    }
    if !dry_run {
        audit(&tx, chrono::Local::now(), crate::IMPORT_BY, "link", "items", "suppliers", &format!("{linked} items linked to their supplier")).map_err(|x| x.to_string())?;
    }
    let summary = format!(
        "Items linked to a supplier: {linked}. Already linked: {already}. No supplier in the file: {no_supplier}. Supplier name not found: {} names. Item not found: {no_item}.{}",
        unmatched.len(),
        if dry_run { " DRY RUN: nothing was written." } else { "" }
    );
    if dry_run {
        tx.rollback().map_err(e)?;
    } else {
        tx.commit().map_err(e)?;
    }
    Ok((notes, summary))
}
