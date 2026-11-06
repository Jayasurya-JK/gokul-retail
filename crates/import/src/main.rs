//! gokul-import: loads the owner's REAL stock into a NEW Gokul database, exactly as given in
//! `data/import/clean/items_stock.csv` (925 rows, quantities as at 17-Oct-2026).
//!
//! Run from the repo root with Gokul POS and Gokul Office closed:
//!   cargo run -p gokul-import --release -- [--csv <file>] [--db <file>]
//! Defaults: the CSV above and the normal database, `%APPDATA%\GokulRetail\gokul.db`.
//!
//! What it does, in one run:
//! 1. Opens the database (every migration runs). Refuses if the database already has imported items.
//! 2. Seeds only the shop settings and the five login users (`seed_demo::seed_login_and_settings`).
//!    Roles, barrels, production norms and expense categories come from the migrations.
//! 3. Creates categories and brands through the core (`catalog::add_category`, `catalog::add_brand`).
//! 4. Creates suppliers and items in ONE transaction. Items are written with the same columns the core uses,
//!    not through `catalog::save_item`, because that validator rejects this data (blank barcodes, shop codes
//!    such as G5, no supplier phone). Every stock change goes through `db::post_movement`, the core's
//!    ledger writer, so one 'opening' movement per item is written exactly as the core writes it.
//! 5. Checks the totals inside the same transaction. A failed check rolls everything back.

use chrono::{Local, TimeZone};
use gokul_core::catalog::{add_brand, add_category};
use gokul_core::db::{self, audit, fresh_id, iso, post_movement, Db};
use gokul_core::seed_demo::seed_login_and_settings;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

const IMPORT_BY: &str = "import";
const STOCK_AS_AT: (i32, u32, u32) = (2026, 10, 17);
const EXPECTED_ROWS: i64 = 925;
const EXPECTED_QTY_MILLI: i64 = 10_217_539; // 10,217.539, shown as 10,217.54
const EXPECTED_VALUE_PAISE: i64 = 279_629_080; // Rs 27,96,290.80
const EXPECTED_NEGATIVE: i64 = 44;
const EXPECTED_ZERO: i64 = 270;
const REQUIRED_COLUMNS: &[&str] = &[
    "source_row", "source_name", "cleaned_name", "suggested_category", "brand", "unit", "loose_or_packed", "pack_size",
    "quantity_on_hand", "cost_price", "stock_value_cost", "mrp", "selling_price", "hsn", "gst_percent", "barcode",
    "item_code", "supplier", "notes",
];

fn main() {
    if let Err(e) = run() {
        eprintln!("gokul-import: STOPPED, nothing was written. {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut csv_path: Option<PathBuf> = None;
    let mut db_path: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--csv" => csv_path = Some(args.next().ok_or("--csv needs a file path")?.into()),
            "--db" => db_path = Some(args.next().ok_or("--db needs a file path")?.into()),
            other => return Err(format!("unknown option '{other}'. Usage: gokul-import [--csv <file>] [--db <file>]")),
        }
    }
    let csv_path = csv_path.unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("data").join("import").join("clean").join("items_stock.csv"));
    let db_path = db_path.unwrap_or_else(db::default_db_path);

    let text = std::fs::read_to_string(&csv_path).map_err(|e| format!("cannot read {}: {e}", csv_path.display()))?;
    let recs = read_csv(&text)?;
    println!("CSV: {} ({} data rows)", csv_path.display(), recs.len());
    println!("Database: {}", db_path.display());

    let db = Db::open(&db_path).map_err(|e| e.to_string())?;
    let report = db.with(|c| Ok(import(c, &recs))).map_err(|e| e.to_string())?;
    let report = report?;

    println!();
    println!("Special handling ({} notes):", report.notes.len());
    for n in &report.notes {
        println!("  - {n}");
    }
    println!();
    println!("{}", report.summary);
    println!("Import committed.");
    Ok(())
}

// ---------- reading the CSV ----------

struct Rec {
    line: usize,
    source_row: String,
    source_name: String,
    name: String,
    category: String,
    brand: String,
    unit: &'static str,
    loose: bool,
    pack_size: Option<String>,
    qty: i64,   // thousandths (milli-units)
    cost: i64,  // paise
    mrp: i64,   // paise
    price: i64, // paise
    value_given: i64, // paise, the file's own stock_value_cost (checked, not stored)
    hsn: String,
    gst: i64,
    barcode: String,
    code: String,
    supplier: String,
    notes: String,
}

/// Minimal RFC-4180 reader: quoted fields, doubled quotes, commas and line breaks inside quotes.
fn parse_csv(text: &str) -> Result<Vec<Vec<String>>, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => row.push(std::mem::take(&mut field)),
                '\r' => {}
                '\n' => {
                    row.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut row));
                }
                _ => field.push(c),
            }
        }
    }
    if in_quotes {
        return Err("the CSV has an unclosed quote".into());
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    Ok(rows)
}

/// "1234.5" -> 12345 with 1 decimal place (decimals = 1). Exact integer arithmetic, no floats.
fn fixed(text: &str, decimals: usize) -> Result<i64, String> {
    let t = text.trim();
    let (neg, body) = match t.strip_prefix('-') {
        Some(b) => (true, b),
        None => (false, t),
    };
    let (whole, frac) = body.split_once('.').unwrap_or((body, ""));
    let digits = |s: &str| s.chars().all(|c| c.is_ascii_digit());
    if (whole.is_empty() && frac.is_empty()) || !digits(whole) || !digits(frac) {
        return Err(format!("'{text}' is not a number"));
    }
    if frac.len() > decimals {
        return Err(format!("'{text}' has more than {decimals} decimal places"));
    }
    let w: i64 = if whole.is_empty() { 0 } else { whole.parse().map_err(|_| format!("'{text}' is too big"))? };
    let f: i64 = if frac.is_empty() { 0 } else { format!("{:0<width$}", frac, width = decimals).parse().map_err(|_| format!("'{text}' is not a number"))? };
    let value = w * 10_i64.pow(decimals as u32) + f;
    Ok(if neg { -value } else { value })
}

fn unit_code(u: &str) -> Result<&'static str, String> {
    Ok(match u {
        "pcs" => "pc",
        "pkt" => "pkt",
        "btl" => "btl",
        "kg" => "kg",
        "L" | "l" => "l",
        other => return Err(format!("unit '{other}' is not one the POS knows")),
    })
}

fn read_csv(text: &str) -> Result<Vec<Rec>, String> {
    let rows = parse_csv(text)?;
    let (header, body) = rows.split_first().ok_or("the CSV is empty")?;
    let idx: HashMap<&str, usize> = header.iter().enumerate().map(|(i, h)| (h.trim(), i)).collect();
    for col in REQUIRED_COLUMNS {
        if !idx.contains_key(col) {
            return Err(format!("the CSV has no '{col}' column"));
        }
    }
    let mut out = Vec::new();
    for (k, row) in body.iter().enumerate() {
        if row.iter().all(|f| f.trim().is_empty()) {
            continue;
        }
        let line = k + 2; // line 1 is the header
        let g = |n: &str| -> String { row.get(idx[n]).map(|s| s.trim().to_string()).unwrap_or_default() };
        let at = |e: String| format!("CSV line {line}: {e}");
        let loose = match g("loose_or_packed").as_str() {
            "loose" => true,
            "packed" => false,
            other => return Err(at(format!("loose_or_packed is '{other}'"))),
        };
        let unit = unit_code(&g("unit")).map_err(at)?;
        let pack = g("pack_size");
        let gst_text = g("gst_percent");
        let gst = if gst_text.is_empty() { 0 } else { gst_text.parse::<i64>().map_err(|_| at(format!("gst '{gst_text}'")))? };
        if ![0, 5, 12, 18].contains(&gst) {
            return Err(at(format!("GST {gst} is not 0, 5, 12 or 18")));
        }
        let name = g("cleaned_name").split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err(at("the name is blank".into()));
        }
        out.push(Rec {
            line,
            source_row: g("source_row"),
            source_name: g("source_name"),
            name,
            category: g("suggested_category"),
            brand: g("brand"),
            unit,
            loose,
            pack_size: if loose || pack.is_empty() { None } else { Some(pack) },
            qty: fixed(&g("quantity_on_hand"), 3).map_err(at)?,
            cost: fixed(&g("cost_price"), 2).map_err(at)?,
            mrp: fixed(&g("mrp"), 2).map_err(at)?,
            price: fixed(&g("selling_price"), 2).map_err(at)?,
            value_given: fixed(&g("stock_value_cost"), 2).map_err(at)?,
            hsn: g("hsn"),
            gst,
            barcode: g("barcode"),
            code: g("item_code"),
            supplier: g("supplier"),
            notes: g("notes"),
        });
    }
    if out.is_empty() {
        return Err("the CSV has no data rows".into());
    }
    Ok(out)
}

// ---------- the import ----------

struct Report {
    notes: Vec<String>,
    summary: String,
}

fn import(c: &mut Connection, recs: &[Rec]) -> Result<Report, String> {
    let existing: i64 = c.query_row("SELECT COUNT(*) FROM items WHERE kind='item'", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!(
            "the database already has {existing} items, so the stock was imported before. Nothing was changed. \
             To load again, close the apps and move gokul.db (with -wal and -shm) out of the folder first."
        ));
    }
    let mut notes: Vec<String> = Vec::new();

    // Settings and login users (only when there are no users yet, so a second attempt cannot clash on user ids).
    let users: i64 = c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if users == 0 {
        seed_login_and_settings(c).map_err(|e| e.to_string())?;
        println!("Shop settings and 5 login users written.");
    } else {
        println!("Users already present: settings and users left as they are.");
    }

    // Categories and brands through the core, before the item transaction (the core runs its own transactions).
    let mut cat_ids: HashMap<String, String> = HashMap::new();
    for r in recs {
        if !cat_ids.contains_key(&r.category) {
            let id = ensure_category(c, &r.category)?;
            cat_ids.insert(r.category.clone(), id);
        }
    }
    println!("Categories: {} ready.", cat_ids.len());
    let mut brand_names: HashSet<String> = HashSet::new(); // case-insensitive, as the brands table is
    let mut brand_spellings: HashSet<String> = HashSet::new();
    for r in recs {
        if r.brand.is_empty() {
            continue;
        }
        brand_spellings.insert(r.brand.clone());
        if brand_names.insert(r.brand.to_lowercase()) {
            let v = add_brand(c, &r.brand).map_err(|e| e.to_string())?;
            if v["ok"] != true {
                return Err(format!("brand '{}': {}", r.brand, v["message"]));
            }
        }
    }
    println!(
        "Brands: {} ready ({} spellings in the file; items keep their own spelling).",
        brand_names.len(),
        brand_spellings.len()
    );

    let now = Local::now();
    let stock_at = Local
        .with_ymd_and_hms(STOCK_AS_AT.0, STOCK_AS_AT.1, STOCK_AS_AT.2, 0, 0, 0)
        .single()
        .ok_or("the stock date is not a valid local time")?;
    let stock_at_s = iso(stock_at);

    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;

    // Suppliers: one per name (case-insensitive). Created directly: save_supplier wants a 10-digit phone.
    let mut supplier_seen: HashMap<String, String> = HashMap::new();
    for r in recs {
        if r.supplier.is_empty() {
            continue;
        }
        let key = r.supplier.to_lowercase();
        if let Some(first) = supplier_seen.get(&key).cloned() {
            if first != r.supplier {
                notes.push(format!("line {}: supplier '{}' counted as '{}'", r.line, r.supplier, first));
            }
            continue;
        }
        let id = fresh_id(&tx, "suppliers", "s", "SUPPLIER").map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES(?1,?2,'','','','','',15,?3)",
            params![id, r.supplier, iso(now)],
        )
        .map_err(|e| e.to_string())?;
        audit(&tx, now, IMPORT_BY, "create", "supplier", &id, &r.supplier).map_err(|e| e.to_string())?;
        supplier_seen.insert(key, r.supplier.clone());
    }
    let suppliers_made = supplier_seen.len();

    // Codes that the file itself uses. Generated codes must avoid them.
    let csv_codes: HashSet<String> = recs.iter().filter(|r| !r.code.is_empty()).map(|r| r.code.clone()).collect();
    let mut used_codes: HashSet<String> = HashSet::new();
    let mut next_generated: u64 = 101;
    let mut barcode_owner: HashMap<String, String> = HashMap::new();
    let (mut generated, mut dup_codes, mut barcodes, mut barcode_clash, mut value_mismatch) = (0usize, 0usize, 0usize, 0usize, 0usize);
    let (mut no_pack, mut no_brand, mut zero_cost) = (0usize, 0usize, 0usize);
    let mut name_rows: HashMap<String, Vec<usize>> = HashMap::new();

    for r in recs {
        // Item code: as given; blank -> a generated 1 to 6 digit counter code; a repeat gets a suffix.
        let code = if r.code.is_empty() {
            let cand = loop {
                let cand = next_generated.to_string();
                next_generated += 1;
                if !csv_codes.contains(&cand) && !used_codes.contains(&cand) {
                    break cand;
                }
            };
            generated += 1;
            cand
        } else if used_codes.contains(&r.code) {
            let mut n = 2;
            let cand = loop {
                let cand = format!("{}-{}", r.code, n);
                if !used_codes.contains(&cand) && !csv_codes.contains(&cand) {
                    break cand;
                }
                n += 1;
            };
            dup_codes += 1;
            notes.push(format!("line {}: code {} was already used, so '{}' is {}", r.line, r.code, r.name, cand));
            cand
        } else {
            r.code.clone()
        };
        used_codes.insert(code.clone());

        let item_id = fresh_id(&tx, "items", "i", "ITEM").map_err(|e| e.to_string())?;
        let category_id = cat_ids.get(&r.category).ok_or("category missing")?;
        tx.execute(
            "INSERT INTO items(id,code,name,category_id,brand,unit,loose,pack_size,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,0,0,1,?14)",
            params![item_id, code, r.name, category_id, r.brand, r.unit, r.loose, r.pack_size, r.hsn, r.gst, r.mrp, r.price, r.cost, iso(now)],
        )
        .map_err(|e| format!("line {}: could not write item '{}': {e}", r.line, r.name))?;

        if !r.barcode.is_empty() {
            match barcode_owner.get(&r.barcode) {
                Some(owner) => {
                    barcode_clash += 1;
                    notes.push(format!("line {}: barcode {} already belongs to item {}, so '{}' has no barcode", r.line, r.barcode, owner, r.name));
                }
                None => {
                    tx.execute("INSERT INTO barcodes(barcode,item_id,is_primary) VALUES(?1,?2,1)", params![r.barcode, item_id]).map_err(|e| e.to_string())?;
                    barcode_owner.insert(r.barcode.clone(), code.clone());
                    barcodes += 1;
                }
            }
        }

        post_movement(&tx, &stock_at_s, &item_id, "opening", r.qty, "import", "", "Opening stock as at 17-Oct-2026 (real stock import)", IMPORT_BY)
            .map_err(|e| e.to_string())?;

        let detail = format!("source row {} | source name '{}'{}", r.source_row, r.source_name, if r.notes.is_empty() { String::new() } else { format!(" | note: {}", r.notes) });
        audit(&tx, now, IMPORT_BY, "import", "item", &item_id, &detail).map_err(|e| e.to_string())?;

        // The file's own stock value must agree with qty x cost (half a paisa is the tolerance).
        let exact_mp = r.qty as i128 * r.cost as i128; // milli-paise
        let recomputed = signed_round_div(exact_mp, 1000);
        if recomputed != r.value_given as i128 {
            value_mismatch += 1;
            notes.push(format!("line {}: stock value in the file {} differs from qty x cost {} for '{}'", r.line, inr(r.value_given), inr(recomputed as i64), r.name));
        }
        if r.cost == 0 {
            zero_cost += 1;
            notes.push(format!("line {}: cost is zero for '{}' (its stock value is zero)", r.line, r.name));
        }
        if r.qty < 0 {
            notes.push(format!("line {}: NEGATIVE stock {} {} for '{}' (imported as is)", r.line, fmt_milli(r.qty), r.unit, r.name));
        }
        if !r.loose && r.pack_size.is_none() {
            no_pack += 1;
        }
        if r.brand.is_empty() {
            no_brand += 1;
        }
        name_rows.entry(r.name.to_lowercase()).or_default().push(r.line);
    }
    for (name, lines) in &name_rows {
        if lines.len() > 1 {
            notes.push(format!("name '{}' appears on lines {:?}; kept as separate items", name, lines));
        }
    }
    let items_made = recs.len();

    // ---------- checks, inside the transaction ----------
    let mut problems: Vec<String> = Vec::new();
    let q1 = |sql: &str| -> Result<i64, String> { tx.query_row(sql, [], |r| r.get(0)).map_err(|e| e.to_string()) };
    let n_items = q1("SELECT COUNT(*) FROM items WHERE kind='item'")?;
    let sum_stock = q1("SELECT COALESCE(SUM(stock),0) FROM items WHERE kind='item'")?;
    let sum_milli_paise = q1("SELECT COALESCE(SUM(stock*cost),0) FROM items WHERE kind='item'")?;
    let ledger_rows = q1("SELECT COUNT(*) FROM stock_movements m JOIN items i ON i.id=m.item_id WHERE i.kind='item'")?;
    let ledger_sum = q1("SELECT COALESCE(SUM(m.qty),0) FROM stock_movements m JOIN items i ON i.id=m.item_id WHERE i.kind='item'")?;
    let per_item_mismatch = q1(
        "SELECT COUNT(*) FROM items i WHERE i.kind='item' AND i.stock <> (SELECT COALESCE(SUM(m.qty),0) FROM stock_movements m WHERE m.item_id=i.id)",
    )?;
    let negative = q1("SELECT COUNT(*) FROM items WHERE kind='item' AND stock<0")?;
    let zero = q1("SELECT COUNT(*) FROM items WHERE kind='item' AND stock=0")?;
    let positive = q1("SELECT COUNT(*) FROM items WHERE kind='item' AND stock>0")?;
    let barcode_rows = q1("SELECT COUNT(*) FROM barcodes b JOIN items i ON i.id=b.item_id WHERE i.kind='item'")?;
    let csv_qty: i64 = recs.iter().map(|r| r.qty).sum();
    let csv_value_mp: i128 = recs.iter().map(|r| r.qty as i128 * r.cost as i128).sum();
    let csv_value_paise = signed_round_div(csv_value_mp, 1000);
    let db_value_paise = signed_round_div(sum_milli_paise as i128, 1000);
    let file_value: i64 = recs.iter().map(|r| r.value_given).sum();

    if n_items != EXPECTED_ROWS || items_made as i64 != EXPECTED_ROWS {
        problems.push(format!("item count is {n_items}, expected {EXPECTED_ROWS}"));
    }
    if sum_stock != csv_qty || csv_qty != EXPECTED_QTY_MILLI {
        problems.push(format!("quantity: database {}, file {}, expected {}", fmt_milli(sum_stock), fmt_milli(csv_qty), fmt_milli(EXPECTED_QTY_MILLI)));
    }
    if db_value_paise != EXPECTED_VALUE_PAISE as i128 || csv_value_paise != EXPECTED_VALUE_PAISE as i128 {
        problems.push(format!("value at cost: database {}, file {}, expected {}", inr(db_value_paise as i64), inr(csv_value_paise as i64), inr(EXPECTED_VALUE_PAISE)));
    }
    if file_value as i128 != csv_value_paise && value_mismatch == 0 {
        problems.push(format!("file stock_value column adds to {}, qty x cost gives {}", inr(file_value), inr(csv_value_paise as i64)));
    }
    if ledger_rows != EXPECTED_ROWS || ledger_sum != sum_stock {
        problems.push(format!("stock ledger: {ledger_rows} opening rows summing to {}, items show {}", fmt_milli(ledger_sum), fmt_milli(sum_stock)));
    }
    if per_item_mismatch != 0 {
        problems.push(format!("{per_item_mismatch} items whose stock differs from their ledger"));
    }
    if negative != EXPECTED_NEGATIVE || zero != EXPECTED_ZERO {
        problems.push(format!("stock signs: {negative} negative (expected {EXPECTED_NEGATIVE}), {zero} zero (expected {EXPECTED_ZERO}), {positive} positive"));
    }
    if barcode_rows != barcodes as i64 {
        problems.push(format!("barcodes written {barcode_rows}, expected {barcodes}"));
    }
    if !problems.is_empty() {
        return Err(format!("CHECKS FAILED, rolled back: {}", problems.join("; ")));
    }
    tx.commit().map_err(|e| e.to_string())?;

    let summary = format!(
        "Checks (all passed):\n\
         \x20 Items (kind = item):        {n_items}  (file rows {EXPECTED_ROWS})\n\
         \x20 Quantity on hand:           {}  (file says 10,217.54)\n\
         \x20 Value at cost:              Rs {}  (file says Rs 27,96,290.80)\n\
         \x20 Stock ledger:               {ledger_rows} opening movements, total {}, equals items' stock\n\
         \x20 Items positive / zero / negative: {positive} / {zero} / {negative}\n\
         \x20 Barcodes attached:          {barcode_rows}\n\
         \x20 Categories / brands / suppliers: {} / {} / {suppliers_made}\n\
         \x20 Codes generated for blanks: {generated}, repeated codes suffixed: {dup_codes}, barcode clashes: {barcode_clash}\n\
         \x20 Packed items with no pack size: {no_pack}, items with no brand: {no_brand}, zero-cost items: {zero_cost}\n\
         \x20 Rows with a stock value that differs from qty x cost: {value_mismatch}",
        fmt_milli(sum_stock),
        inr(db_value_paise as i64),
        fmt_milli(ledger_sum),
        cat_ids.len(),
        brand_names.len(),
    );
    Ok(Report { notes, summary })
}

/// The core's category rule, with one exception: a name that clashes only with a reserved (hidden) category
/// such as "Packing material" is inserted the same way `add_category` inserts a normal one.
fn ensure_category(c: &mut Connection, name: &str) -> Result<String, String> {
    let find = |c: &Connection| -> Result<Option<String>, String> {
        c.query_row("SELECT id FROM categories WHERE lower(name)=lower(?1) AND substr(id,1,1) != '_'", [name], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())
    };
    if let Some(id) = find(c)? {
        return Ok(id);
    }
    let r = add_category(c, name).map_err(|e| e.to_string())?;
    if r["ok"] != true {
        let message = r["message"].as_str().unwrap_or_default().to_string();
        if !message.contains("already exists") {
            return Err(format!("category '{name}': {message}"));
        }
        let id = fresh_id(c, "categories", "cat", "CATEGORY").map_err(|e| e.to_string())?;
        let sort: i64 = c
            .query_row("SELECT COALESCE(MAX(sort),0)+1 FROM categories WHERE substr(id,1,1) != '_'", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        c.execute("INSERT INTO categories(id,name,sort) VALUES(?1,?2,?3)", params![id, name, sort]).map_err(|e| e.to_string())?;
        audit(c, Local::now(), IMPORT_BY, "create", "category", &id, name).map_err(|e| e.to_string())?;
        return Ok(id);
    }
    find(c)?.ok_or_else(|| format!("category '{name}' was not found after it was created"))
}

// ---------- formatting and rounding ----------

/// Divide with the half away from zero rounding, for negative values too.
fn signed_round_div(a: i128, b: i128) -> i128 {
    if a >= 0 {
        (a + b / 2) / b
    } else {
        -((-a + b / 2) / b)
    }
}

/// Paise to "27,96,290.80" (Indian grouping), with a minus sign when negative.
fn inr(paise: i64) -> String {
    let sign = if paise < 0 { "-" } else { "" };
    let p = paise.unsigned_abs();
    let digits = (p / 100).to_string();
    format!("{sign}{}.{:02}", indian_group(&digits), p % 100)
}

fn indian_group(s: &str) -> String {
    let n = s.len();
    if n <= 3 {
        return s.to_string();
    }
    let (head, tail) = s.split_at(n - 3);
    let mut parts: Vec<String> = Vec::new();
    let mut h = head;
    while h.len() > 2 {
        let (a, b) = h.split_at(h.len() - 2);
        parts.push(b.to_string());
        h = a;
    }
    if !h.is_empty() {
        parts.push(h.to_string());
    }
    parts.reverse();
    parts.push(tail.to_string());
    parts.join(",")
}

/// Thousandths to "10217.539".
fn fmt_milli(q: i64) -> String {
    let sign = if q < 0 { "-" } else { "" };
    let a = q.unsigned_abs();
    format!("{sign}{}.{:03}", indian_group(&(a / 1000).to_string()), a % 1000)
}
