//! The `customers` and `suppliers` loaders. Same rules as the items import: one transaction, every check inside it,
//! any failed check rolls everything back. `--dry-run` runs it all and then rolls back.

use crate::{fixed, inr, parse_csv, IMPORT_BY};
use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone};
use gokul_core::db::{audit, iso};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use std::collections::{HashMap, HashSet};

const EXPECTED_CUSTOMERS: i64 = 5827; // 5776 posbean + 51 placeholders
const EXPECTED_CUSTOMERS_NO_OUTSTANDING: i64 = 5776; // posbean only
const EXPECTED_PHONES: i64 = 5591;
const EXPECTED_OUTSTANDING_ROWS: i64 = 57;
const EXPECTED_OUTSTANDING_PAISE: i64 = 1_013_160_700; // Rs 1,01,31,607.00
const EXPECTED_OUTSTANDING_CUSTOMERS: i64 = 56;
const EXPECTED_POINTS_HUNDREDTHS: i64 = 0;
const OPENING_POINTS_DATE: (i32, u32, u32) = (2026, 11, 7);

const CUSTOMER_COLUMNS: &[&str] = &[
    "source", "code", "name", "father_name", "phone", "area", "type", "gstin", "pan", "email", "dob", "anniversary", "credit_limit",
    "credit_days", "opening_balance", "points", "created_at", "notes", "status",
];
const OUTSTANDING_COLUMNS: &[&str] =
    &["pdf_row", "invoice_date", "pdf_customer_name", "invoice_no", "total", "remaining", "customer_code", "link_status", "pdf_date"];
const SUPPLIER_COLUMNS: &[&str] = &["load", "code", "name", "contact", "phone", "gstin", "city", "address", "credit_days", "opening_balance"];

pub struct Report {
    pub notes: Vec<String>,
    pub summary: String,
}

type Row = (usize, HashMap<String, String>);

/// Rows as maps from column name to trimmed text, after checking the required columns exist.
fn read_table(text: &str, required: &[&str]) -> Result<Vec<Row>, String> {
    let rows = parse_csv(text)?;
    let (header, body) = rows.split_first().ok_or("the CSV is empty")?;
    let names: Vec<String> = header.iter().map(|h| h.trim().to_string()).collect();
    for col in required {
        if !names.iter().any(|n| n == col) {
            return Err(format!("the CSV has no '{col}' column"));
        }
    }
    let mut out = Vec::new();
    for (k, row) in body.iter().enumerate() {
        if row.iter().all(|f| f.trim().is_empty()) {
            continue;
        }
        let mut m = HashMap::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), row.get(i).map(|s| s.trim().to_string()).unwrap_or_default());
        }
        out.push((k + 2, m));
    }
    if out.is_empty() {
        return Err("the CSV has no data rows".into());
    }
    Ok(out)
}

fn local_time(dt: NaiveDateTime) -> Result<DateTime<Local>, String> {
    Local.from_local_datetime(&dt).earliest().ok_or_else(|| format!("{dt} is not a valid local time"))
}

fn local_midnight(d: NaiveDate) -> Result<DateTime<Local>, String> {
    local_time(d.and_hms_opt(0, 0, 0).ok_or("bad date")?)
}

fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| format!("'{s}' is not a date (YYYY-MM-DD)"))
}

/// Blank or a real YYYY-MM-DD.
fn blank_or_date(s: &str) -> Result<String, String> {
    if !s.is_empty() {
        parse_date(s)?;
    }
    Ok(s.to_string())
}

fn parse_created(s: &str) -> Result<NaiveDateTime, String> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").map_err(|_| format!("'{s}' is not a date and time (YYYY-MM-DDTHH:MM:SS)"))
}

fn whole(s: &str, what: &str, default: i64) -> Result<i64, String> {
    if s.is_empty() {
        return Ok(default);
    }
    s.parse::<i64>().ok().filter(|v| *v >= 0).ok_or_else(|| format!("{what} '{s}' is not a whole number"))
}

fn ten_digits(s: &str) -> bool {
    s.len() == 10 && s.chars().all(|c| c.is_ascii_digit())
}

/// Suppliers may have a landline as the file gives it: STD code, optional hyphen, number (11 digits in all).
fn mobile_or_landline(s: &str) -> bool {
    let digits = s.chars().filter(|c| c.is_ascii_digit()).count();
    s.chars().all(|c| c.is_ascii_digit() || c == '-') && (digits == 10 || (digits == 11 && s.starts_with('0')))
}

fn fmt_hundredths(h: i64) -> String {
    let sign = if h < 0 { "-" } else { "" };
    let a = h.unsigned_abs();
    format!("{sign}{}.{:02}", a / 100, a % 100)
}

fn q1(tx: &Connection, sql: &str) -> Result<i64, String> {
    tx.query_row(sql, [], |r| r.get(0)).map_err(e2s)
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Commit, or roll back for a dry run. Returns the closing line.
fn finish(tx: rusqlite::Transaction<'_>, dry_run: bool) -> Result<&'static str, String> {
    if dry_run {
        tx.rollback().map_err(e2s)?;
        Ok("dry run: nothing was written")
    } else {
        tx.commit().map_err(e2s)?;
        Ok("Import committed.")
    }
}

// ---------- customers ----------

struct Cust {
    line: usize,
    code: String,
    placeholder: bool,
    name: String,
    father_name: String,
    phone: String,
    area: String,
    ctype: String,
    gstin: String,
    pan: String,
    email: String,
    dob: String,
    anniversary: String,
    credit_limit: i64,
    credit_days: i64,
    points: i64, // hundredths
    created_at: String,
    notes: String,
    status: String,
}

struct Owing {
    line: usize,
    pdf_row: String,
    invoice_date: String,
    name: String,
    invoice_no: String,
    remaining: i64,
    code: String,
    link: String,
    pdf_date: NaiveDate,
}

fn read_customers(text: &str) -> Result<Vec<Cust>, String> {
    let mut out = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (line, m) in read_table(text, CUSTOMER_COLUMNS)? {
        let at = |e: String| format!("customers CSV line {line}: {e}");
        let g = |n: &str| m[n].clone();
        let code = g("code");
        if code.is_empty() {
            return Err(at("the code is blank".into()));
        }
        if !seen.insert(code.clone()) {
            return Err(at(format!("code {code} appears twice in the file")));
        }
        let placeholder = match g("source").as_str() {
            "posbean" => false,
            "pdf-placeholder" => true,
            other => return Err(at(format!("source is '{other}'"))),
        };
        let name = g("name").split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err(at("the name is blank".into()));
        }
        let phone = g("phone");
        if !phone.is_empty() && !ten_digits(&phone) {
            return Err(at(format!("phone '{phone}' is not 10 digits")));
        }
        let ctype = g("type").to_lowercase();
        let opening_balance = fixed(&g("opening_balance"), 2).map_err(at)?;
        if opening_balance != 0 {
            return Err(at(format!("opening_balance is {}; it must be 0 (outstanding comes from outstanding.csv)", g("opening_balance"))));
        }
        let points_text = g("points");
        let points = if points_text.is_empty() { 0 } else { fixed(&points_text, 2).map_err(at)? };
        let created = parse_created(&g("created_at")).map_err(at)?;
        out.push(Cust {
            line,
            code,
            placeholder,
            name,
            father_name: g("father_name"),
            phone,
            area: g("area"),
            ctype: if ctype.is_empty() { "retail".into() } else { ctype },
            gstin: g("gstin"),
            pan: g("pan"),
            email: g("email"),
            dob: blank_or_date(&g("dob")).map_err(at)?,
            anniversary: blank_or_date(&g("anniversary")).map_err(at)?,
            credit_limit: whole(&g("credit_limit"), "credit_limit", 0).map_err(at)?,
            credit_days: whole(&g("credit_days"), "credit_days", 0).map_err(at)?,
            points,
            created_at: iso(local_time(created).map_err(at)?),
            notes: g("notes"),
            status: g("status"),
        });
    }
    Ok(out)
}

fn read_outstanding(text: &str) -> Result<Vec<Owing>, String> {
    let mut out = Vec::new();
    for (line, m) in read_table(text, OUTSTANDING_COLUMNS)? {
        let at = |e: String| format!("outstanding CSV line {line}: {e}");
        let g = |n: &str| m[n].clone();
        let total = fixed(&g("total"), 2).map_err(at)?;
        let remaining = fixed(&g("remaining"), 2).map_err(at)?;
        if remaining < 0 || remaining > total {
            return Err(at(format!("remaining {} is not between 0 and the total {}", g("remaining"), g("total"))));
        }
        parse_date(&g("invoice_date")).map_err(at)?;
        out.push(Owing {
            line,
            pdf_row: g("pdf_row"),
            invoice_date: g("invoice_date"),
            name: g("pdf_customer_name"),
            invoice_no: g("invoice_no"),
            remaining,
            code: g("customer_code"),
            link: g("link_status"),
            pdf_date: parse_date(&g("pdf_date")).map_err(at)?,
        });
    }
    Ok(out)
}

/// `no_outstanding`: load only the POSBean customers. The 51 placeholders and the outstanding PDF are skipped, so the
/// file's receivables are not loaded (the owner's decision: the PDF is another business).
pub fn customers(c: &mut Connection, csv_text: &str, out_text: &str, csv_name: &str, out_name: &str, dry_run: bool, no_outstanding: bool) -> Result<Report, String> {
    let mut custs = read_customers(csv_text)?;
    let owing = if no_outstanding {
        custs.retain(|x| !x.placeholder);
        Vec::new()
    } else {
        read_outstanding(out_text)?
    };
    let (expect_customers, expect_rows, expect_paise, expect_owing_customers) = if no_outstanding {
        (EXPECTED_CUSTOMERS_NO_OUTSTANDING, 0, 0, 0)
    } else {
        (EXPECTED_CUSTOMERS, EXPECTED_OUTSTANDING_ROWS, EXPECTED_OUTSTANDING_PAISE, EXPECTED_OUTSTANDING_CUSTOMERS)
    };
    let out_name = if no_outstanding { "outstanding not loaded (--no-outstanding)" } else { out_name };
    let codes: HashSet<&str> = custs.iter().map(|x| x.code.as_str()).collect();
    for o in &owing {
        if !codes.contains(o.code.as_str()) {
            return Err(format!("outstanding CSV line {}: customer_code '{}' is not in the customers file", o.line, o.code));
        }
    }

    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let before = q1(&tx, "SELECT COUNT(*) FROM customers")?;
    let done = q1(&tx, "SELECT COUNT(*) FROM audit_log WHERE action='import' AND entity='customers'")?;
    if done > 0 {
        return Err("the customers were imported before (the audit log has the import marker). Nothing was changed.".into());
    }
    for x in &custs {
        let used: i64 = tx.query_row("SELECT COUNT(*) FROM customers WHERE id=?1", [&x.code], |r| r.get(0)).map_err(e2s)?;
        if used > 0 {
            return Err(format!("customers CSV line {}: code {} already exists in the database. Nothing was changed.", x.line, x.code));
        }
    }

    let now = Local::now();
    let (py, pm, pd) = OPENING_POINTS_DATE;
    let points_at = iso(local_midnight(NaiveDate::from_ymd_opt(py, pm, pd).ok_or("bad points date")?)?);
    let mut notes: Vec<String> = Vec::new();
    let mut statuses: HashMap<String, usize> = HashMap::new();

    for x in &custs {
        tx.execute(
            "INSERT INTO customers(id,name,phone,area,credit_limit,outstanding,loyalty_points,last_visit_at,created_at,type,business,gstin,email,address,notes,
                                   father_name,dob,anniversary,pan,locality,route,credit_days,opening_balance)
             VALUES(?1,?2,?3,?4,?5,0,?6,NULL,?7,?8,'',?9,?10,'',?11,?12,?13,?14,?15,'','',?16,0)",
            params![
                x.code, x.name, x.phone, x.area, x.credit_limit, x.points, x.created_at, x.ctype, x.gstin, x.email, x.notes, x.father_name, x.dob,
                x.anniversary, x.pan, x.credit_days
            ],
        )
        .map_err(|e| format!("customers CSV line {}: could not write {} '{}': {e}", x.line, x.code, x.name))?;
        if x.points != 0 {
            tx.execute(
                "INSERT INTO points_ledger(customer_id,at,kind,points,bill_id,note,by_name) VALUES(?1,?2,'adjust',?3,NULL,'Opening points from POSBean',?4)",
                params![x.code, points_at, x.points, IMPORT_BY],
            )
            .map_err(e2s)?;
            if x.points < 0 {
                notes.push(format!("NEGATIVE opening points {} for {} '{}'", fmt_hundredths(x.points), x.code, x.name));
            }
        }
        *statuses.entry(x.status.clone()).or_default() += 1;
    }
    for x in custs.iter().filter(|x| x.placeholder) {
        notes.push(format!("PLACEHOLDER {} '{}': owner must check (merge with the real customer or rename)", x.code, x.name));
    }

    // Opening receivables: the balance sits on the customer, one audit row per PDF line. No bills are created.
    let mut balance: HashMap<&str, i64> = HashMap::new();
    for o in &owing {
        *balance.entry(o.code.as_str()).or_default() += o.remaining;
        let detail = format!(
            "invoice {} dated {}, PDF row {}, remaining {}, PDF name '{}', link: {}",
            o.invoice_no,
            o.invoice_date,
            o.pdf_row,
            inr(o.remaining).replace(',', ""),
            o.name,
            o.link
        );
        audit(&tx, local_midnight(o.pdf_date)?, IMPORT_BY, "opening receivable", "customer", &o.code, &detail).map_err(|e| e.to_string())?;
    }
    for (code, paise) in &balance {
        tx.execute("UPDATE customers SET outstanding=?2 WHERE id=?1", params![code, paise]).map_err(e2s)?;
    }

    let phones = custs.iter().filter(|x| !x.phone.is_empty()).count() as i64;
    let placeholders = custs.iter().filter(|x| x.placeholder).count();
    let file_outstanding: i64 = owing.iter().map(|o| o.remaining).sum();
    let file_points: i64 = custs.iter().map(|x| x.points).sum();

    // ---------- checks, inside the transaction ----------
    let mut problems: Vec<String> = Vec::new();
    let after = q1(&tx, "SELECT COUNT(*) FROM customers")?;
    // Only the customers of this file (the database may hold others).
    tx.execute_batch("CREATE TEMP TABLE import_ids(id TEXT PRIMARY KEY)").map_err(e2s)?;
    for x in &custs {
        tx.execute("INSERT INTO import_ids(id) VALUES(?1)", [&x.code]).map_err(e2s)?;
    }
    let n_ins = q1(&tx, "SELECT COUNT(*) FROM customers WHERE id IN (SELECT id FROM import_ids)")?;
    let n_phone = q1(&tx, "SELECT COUNT(*) FROM customers WHERE id IN (SELECT id FROM import_ids) AND phone<>''")?;
    let sum_out = q1(&tx, "SELECT COALESCE(SUM(outstanding),0) FROM customers WHERE id IN (SELECT id FROM import_ids)")?;
    let n_owing = q1(&tx, "SELECT COUNT(*) FROM customers WHERE id IN (SELECT id FROM import_ids) AND outstanding>0")?;
    let sum_pts = q1(&tx, "SELECT COALESCE(SUM(loyalty_points),0) FROM customers WHERE id IN (SELECT id FROM import_ids)")?;
    let ledger_pts = q1(&tx, "SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE customer_id IN (SELECT id FROM import_ids)")?;
    let pts_mismatch = q1(
        &tx,
        "SELECT COUNT(*) FROM customers c WHERE c.id IN (SELECT id FROM import_ids)
           AND c.loyalty_points <> (SELECT COALESCE(SUM(p.points),0) FROM points_ledger p WHERE p.customer_id=c.id)",
    )?;
    let audit_rows = q1(&tx, "SELECT COUNT(*) FROM audit_log WHERE action='opening receivable' AND entity='customer'")?;
    tx.execute_batch("DROP TABLE import_ids").map_err(e2s)?;

    if custs.len() as i64 != expect_customers || n_ins != expect_customers || after - before != expect_customers {
        problems.push(format!("customers: file {}, inserted {n_ins}, table grew by {}, expected {expect_customers}", custs.len(), after - before));
    }
    if phones != EXPECTED_PHONES || n_phone != EXPECTED_PHONES {
        problems.push(format!("phones: file {phones}, database {n_phone}, expected {EXPECTED_PHONES}"));
    }
    if owing.len() as i64 != expect_rows || audit_rows != expect_rows {
        problems.push(format!("outstanding rows: file {}, audit rows {audit_rows}, expected {expect_rows}", owing.len()));
    }
    if file_outstanding != expect_paise || sum_out != expect_paise {
        problems.push(format!("outstanding: file {}, database {}, expected {}", inr(file_outstanding), inr(sum_out), inr(expect_paise)));
    }
    if n_owing != expect_owing_customers || balance.len() as i64 != expect_owing_customers {
        problems.push(format!("customers with a balance: database {n_owing}, file {}, expected {expect_owing_customers}", balance.len()));
    }
    if file_points != EXPECTED_POINTS_HUNDREDTHS || ledger_pts != EXPECTED_POINTS_HUNDREDTHS || sum_pts != EXPECTED_POINTS_HUNDREDTHS {
        problems.push(format!("points (hundredths): file {file_points}, ledger {ledger_pts}, customers {sum_pts}, expected {EXPECTED_POINTS_HUNDREDTHS}"));
    }
    if pts_mismatch != 0 {
        problems.push(format!("{pts_mismatch} customers whose loyalty_points differ from their ledger"));
    }
    if !problems.is_empty() {
        return Err(format!("CHECKS FAILED, rolled back: {}", problems.join("; ")));
    }

    let mut status_list: Vec<String> = statuses.iter().map(|(k, v)| format!("{}: {v}", if k.is_empty() { "(blank)" } else { k })).collect();
    status_list.sort();
    let detail = format!(
        "{csv_name} and {out_name}: {} customers ({} POSBean, {placeholders} placeholders), {phones} phones, {} outstanding rows for {} customers, total {}, points {}; status {}",
        custs.len(),
        custs.len() - placeholders,
        owing.len(),
        balance.len(),
        inr(file_outstanding),
        fmt_hundredths(file_points),
        status_list.join(", ")
    );
    audit(&tx, now, IMPORT_BY, "import", "customers", "customers", &detail).map_err(|e| e.to_string())?;

    let closing = finish(tx, dry_run)?;
    let summary = format!(
        "Checks (all passed):\n\
         \x20 Customers inserted:          {n_ins}  ({} POSBean + {placeholders} placeholders; table {before} -> {after})\n\
         \x20 Customers with a phone:      {n_phone}\n\
         \x20 Outstanding rows:            {}\n\
         \x20 Customers with a balance:    {n_owing}\n\
         \x20 Total outstanding:           Rs {}\n\
         \x20 Points total (hundredths):   {ledger_pts}  (ledger equals customers' loyalty_points)\n\
         {closing}",
        custs.len() - placeholders,
        owing.len(),
        inr(sum_out),
    );
    Ok(Report { notes, summary })
}

// ---------- suppliers ----------

struct Supp {
    line: usize,
    load: bool,
    code: String,
    name: String,
    contact: String,
    phone: String,
    gstin: String,
    city: String,
    address: String,
    credit_days: i64,
    opening: i64,
}

fn read_suppliers(text: &str) -> Result<Vec<Supp>, String> {
    let mut out = Vec::new();
    for (line, m) in read_table(text, SUPPLIER_COLUMNS)? {
        let at = |e: String| format!("suppliers CSV line {line}: {e}");
        let g = |n: &str| m[n].clone();
        let load = match g("load").as_str() {
            "yes" => true,
            "no" => false,
            other => return Err(at(format!("load is '{other}', expected yes or no"))),
        };
        let name = g("name").split_whitespace().collect::<Vec<_>>().join(" ");
        let code = g("code");
        if load && (name.is_empty() || code.is_empty()) {
            return Err(at("the code or name is blank".into()));
        }
        let phone = g("phone");
        if load && !phone.is_empty() && !mobile_or_landline(&phone) {
            return Err(at(format!("phone '{phone}' is not a 10 digit mobile or an 11 digit landline")));
        }
        out.push(Supp {
            line,
            load,
            code,
            name,
            contact: g("contact"),
            phone,
            gstin: g("gstin"),
            city: g("city"),
            address: g("address"),
            credit_days: whole(&g("credit_days"), "credit_days", 15).map_err(at)?,
            opening: fixed(&g("opening_balance"), 2).map_err(at)?,
        });
    }
    Ok(out)
}

/// An existing supplier as it was before this run.
struct Existing {
    id: String,
    phone: String,
    gstin: String,
    contact: String,
    city: String,
    address: String,
}

pub fn suppliers(c: &mut Connection, csv_text: &str, csv_name: &str, dry_run: bool) -> Result<Report, String> {
    let rows = read_suppliers(csv_text)?;
    if let Some(s) = rows.iter().find(|s| s.load && s.opening != 0) {
        return Err(format!(
            "suppliers CSV line {}: '{}' has an opening balance of {}. The suppliers table has no opening-balance column and payables are \
             the sum of purchases (total - paid), so the import refuses. Nothing was changed.",
            s.line,
            s.name,
            inr(s.opening)
        ));
    }
    let loaded: Vec<&Supp> = rows.iter().filter(|s| s.load).collect();
    let skipped: Vec<&Supp> = rows.iter().filter(|s| !s.load).collect();

    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let done = q1(&tx, "SELECT COUNT(*) FROM audit_log WHERE action='import' AND entity='suppliers'")?;
    if done > 0 {
        return Err("the suppliers were imported before (the audit log has the import marker). Nothing was changed.".into());
    }
    let before = q1(&tx, "SELECT COUNT(*) FROM suppliers")?;
    // Snapshot of the names before this run, keyed by trimmed lower-case name (the oldest supplier wins a tie).
    let mut existing: HashMap<String, Existing> = HashMap::new();
    {
        let mut st = tx.prepare("SELECT name,id,phone,gstin,contact,city,address FROM suppliers ORDER BY created_at, id").map_err(e2s)?;
        let it = st
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    Existing { id: r.get(1)?, phone: r.get(2)?, gstin: r.get(3)?, contact: r.get(4)?, city: r.get(5)?, address: r.get(6)? },
                ))
            })
            .map_err(e2s)?;
        for row in it {
            let (name, e) = row.map_err(e2s)?;
            existing.entry(name.trim().to_lowercase()).or_insert(e);
        }
    }

    let now = Local::now();
    let (mut created, mut matched, mut filled_phone, mut filled_gstin, mut filled_other) = (0i64, 0i64, 0usize, 0usize, 0usize);
    let mut notes: Vec<String> = Vec::new();
    for s in &skipped {
        notes.push(format!("SKIPPED (load=no) line {}: {} '{}'", s.line, s.code, s.name));
    }
    for s in &loaded {
        if let Some(e) = existing.get(&s.name.to_lowercase()) {
            matched += 1;
            let mut fields: Vec<&str> = Vec::new();
            for (col, cur, new) in [
                ("phone", &e.phone, &s.phone),
                ("gstin", &e.gstin, &s.gstin),
                ("contact", &e.contact, &s.contact),
                ("city", &e.city, &s.city),
                ("address", &e.address, &s.address),
            ] {
                if cur.trim().is_empty() && !new.is_empty() {
                    tx.execute(&format!("UPDATE suppliers SET {col}=?2 WHERE id=?1"), params![e.id, new]).map_err(e2s)?;
                    fields.push(col);
                    match col {
                        "phone" => filled_phone += 1,
                        "gstin" => filled_gstin += 1,
                        _ => filled_other += 1,
                    }
                }
            }
            let filled = if fields.is_empty() { "nothing".to_string() } else { fields.join(", ") };
            let detail = format!("import from POSBean code {} (CSV line {}): filled {filled}", s.code, s.line);
            audit(&tx, now, IMPORT_BY, "update", "supplier", &e.id, &detail).map_err(|x| x.to_string())?;
            notes.push(format!("MATCHED line {}: {} '{}' is existing supplier {}; filled {filled}", s.line, s.code, s.name, e.id));
        } else {
            let used: i64 = tx.query_row("SELECT COUNT(*) FROM suppliers WHERE id=?1", [&s.code], |r| r.get(0)).map_err(e2s)?;
            if used > 0 {
                return Err(format!("suppliers CSV line {}: id {} already exists in the suppliers table. Nothing was changed.", s.line, s.code));
            }
            tx.execute(
                "INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![s.code, s.name, s.phone, s.city, s.gstin, s.address, s.contact, s.credit_days, iso(now)],
            )
            .map_err(|x| format!("suppliers CSV line {}: could not write {} '{}': {x}", s.line, s.code, s.name))?;
            audit(&tx, now, IMPORT_BY, "create", "supplier", &s.code, &s.name).map_err(|x| x.to_string())?;
            created += 1;
        }
    }

    // ---------- checks, inside the transaction ----------
    let mut problems: Vec<String> = Vec::new();
    let after = q1(&tx, "SELECT COUNT(*) FROM suppliers")?;
    let blank = q1(&tx, "SELECT COUNT(*) FROM suppliers WHERE trim(name)=''")?;
    let opening_sum: i64 = rows.iter().map(|s| s.opening).sum();
    if created + matched != loaded.len() as i64 {
        problems.push(format!("created {created} + matched {matched} is not the {} rows with load=yes", loaded.len()));
    }
    if after - before != created {
        problems.push(format!("suppliers grew by {}, expected {created}", after - before));
    }
    if blank != 0 {
        problems.push(format!("{blank} suppliers with a blank name"));
    }
    if opening_sum != 0 {
        problems.push(format!("opening balances in the file add to {}, expected 0.00", inr(opening_sum)));
    }
    if !problems.is_empty() {
        return Err(format!("CHECKS FAILED, rolled back: {}", problems.join("; ")));
    }
    let detail = format!("{csv_name}: {} rows, {} skipped, {created} created, {matched} matched", rows.len(), skipped.len());
    audit(&tx, now, IMPORT_BY, "import", "suppliers", "suppliers", &detail).map_err(|x| x.to_string())?;

    let closing = finish(tx, dry_run)?;
    let summary = format!(
        "Checks (all passed):\n\
         \x20 Rows in file:                {}\n\
         \x20 Skipped (load=no):           {}\n\
         \x20 Created:                     {created}\n\
         \x20 Matched and filled:          {matched}  (fields filled: {filled_phone} phone, {filled_gstin} gstin, {filled_other} contact/city/address)\n\
         \x20 Suppliers before / after:    {before} / {after}\n\
         {closing}",
        rows.len(),
        skipped.len(),
    );
    Ok(Report { notes, summary })
}

// ---------- points and credit (the POSBean exports of 07-Nov-2026) ----------

/// The points report: every POSBean customer (suppliers are left out of the clean file).
const POINTS_FILE_CUSTOMERS: i64 = 5776;
const POINTS_FILE_HUNDREDTHS: i64 = 11_638_398; // Rs 116,383.98 in points
const POINTS_COLUMNS: &[&str] = &["customer_code", "customer_name", "points_hundredths"];
const CREDIT_COLUMNS: &[&str] = &["customer_code", "customer_name", "amount_to_load", "bills", "oldest_credit_bill_date", "report_names"];
const REPORT_DATE: (i32, u32, u32) = (2026, 11, 7);
const POINTS_NOTE: &str = "Opening points from POSBean points report 07-Nov-2026";

struct PointsRow {
    line: usize,
    code: String,
    name: String,
    hundredths: i64,
}

fn read_points(text: &str) -> Result<Vec<PointsRow>, String> {
    let mut out = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (line, m) in read_table(text, POINTS_COLUMNS)? {
        let at = |e: String| format!("points CSV line {line}: {e}");
        let code = m["customer_code"].clone();
        if code.is_empty() {
            return Err(at("customer_code is blank".into()));
        }
        if !seen.insert(code.clone()) {
            return Err(at(format!("code {code} appears twice in the file")));
        }
        let hundredths = m["points_hundredths"]
            .parse::<i64>()
            .map_err(|_| at(format!("points_hundredths '{}' is not a whole number", m["points_hundredths"])))?;
        out.push(PointsRow { line, code, name: m["customer_name"].clone(), hundredths });
    }
    Ok(out)
}

/// Opening points, one 'adjust' ledger row per customer, dated the report date (same pattern as `customers`).
pub fn points(c: &mut Connection, csv_text: &str, csv_name: &str, dry_run: bool) -> Result<Report, String> {
    let rows = read_points(csv_text)?;
    let file_customers = rows.len() as i64;
    let file_total: i64 = rows.iter().map(|r| r.hundredths).sum();
    if file_customers != POINTS_FILE_CUSTOMERS || file_total != POINTS_FILE_HUNDREDTHS {
        return Err(format!(
            "points CSV has {file_customers} customers totalling {}, expected {POINTS_FILE_CUSTOMERS} totalling {}. Nothing was changed.",
            fmt_hundredths(file_total),
            fmt_hundredths(POINTS_FILE_HUNDREDTHS)
        ));
    }
    let (ry, rm, rd) = REPORT_DATE;
    let when = iso(local_midnight(NaiveDate::from_ymd_opt(ry, rm, rd).ok_or("bad report date")?)?);
    let now = Local::now();
    let loaded: Vec<&PointsRow> = rows.iter().filter(|r| r.hundredths != 0).collect();
    let mut notes: Vec<String> = Vec::new();

    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let done = q1(&tx, "SELECT COUNT(*) FROM audit_log WHERE action='import' AND entity='points'")?;
    if done > 0 {
        return Err("the points were imported before (the audit log has the import marker). Nothing was changed.".into());
    }
    for r in &rows {
        let current: Option<i64> =
            tx.query_row("SELECT loyalty_points FROM customers WHERE id=?1", [&r.code], |x| x.get(0)).optional().map_err(e2s)?;
        match current {
            None => return Err(format!("points CSV line {}: customer {} '{}' is not in the database. Nothing was changed.", r.line, r.code, r.name)),
            Some(v) if v != 0 => {
                return Err(format!("points CSV line {}: customer {} already has {} points. Nothing was changed.", r.line, r.code, fmt_hundredths(v)))
            }
            _ => {}
        }
    }
    for r in &loaded {
        tx.execute(
            "INSERT INTO points_ledger(customer_id,at,kind,points,bill_id,note,by_name) VALUES(?1,?2,'adjust',?3,NULL,?4,?5)",
            params![r.code, when, r.hundredths, POINTS_NOTE, IMPORT_BY],
        )
        .map_err(e2s)?;
        tx.execute("UPDATE customers SET loyalty_points=loyalty_points+?2 WHERE id=?1", params![r.code, r.hundredths]).map_err(e2s)?;
        if r.hundredths < 0 {
            notes.push(format!("NEGATIVE opening points {} for {} '{}' (as POSBean has it; owner to confirm)", fmt_hundredths(r.hundredths), r.code, r.name));
        }
    }

    // ---------- checks, inside the transaction ----------
    let mut problems: Vec<String> = Vec::new();
    tx.execute_batch("CREATE TEMP TABLE import_ids(id TEXT PRIMARY KEY)").map_err(e2s)?;
    for r in &rows {
        tx.execute("INSERT INTO import_ids(id) VALUES(?1)", [&r.code]).map_err(e2s)?;
    }
    let n_rows: i64 = tx
        .query_row("SELECT COUNT(*) FROM points_ledger WHERE kind='adjust' AND note=?1", [POINTS_NOTE], |x| x.get(0))
        .map_err(e2s)?;
    let ledger_sum: i64 = tx
        .query_row("SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE kind='adjust' AND note=?1", [POINTS_NOTE], |x| x.get(0))
        .map_err(e2s)?;
    let cust_sum = q1(&tx, "SELECT COALESCE(SUM(loyalty_points),0) FROM customers WHERE id IN (SELECT id FROM import_ids)")?;
    let mismatch = q1(
        &tx,
        "SELECT COUNT(*) FROM customers c WHERE c.id IN (SELECT id FROM import_ids)
           AND c.loyalty_points <> (SELECT COALESCE(SUM(p.points),0) FROM points_ledger p WHERE p.customer_id=c.id)",
    )?;
    tx.execute_batch("DROP TABLE import_ids").map_err(e2s)?;
    if n_rows != loaded.len() as i64 {
        problems.push(format!("opening ledger rows {n_rows}, expected {}", loaded.len()));
    }
    if ledger_sum != file_total || cust_sum != file_total {
        problems.push(format!(
            "points: file {}, ledger {}, customers {}",
            fmt_hundredths(file_total),
            fmt_hundredths(ledger_sum),
            fmt_hundredths(cust_sum)
        ));
    }
    if mismatch != 0 {
        problems.push(format!("{mismatch} customers whose loyalty_points differ from their ledger"));
    }
    if !problems.is_empty() {
        return Err(format!("CHECKS FAILED, rolled back: {}", problems.join("; ")));
    }
    let detail = format!(
        "{csv_name}: {} customers, {} with points loaded, total {} points; {} negative",
        rows.len(),
        loaded.len(),
        fmt_hundredths(file_total),
        rows.iter().filter(|r| r.hundredths < 0).count()
    );
    audit(&tx, now, IMPORT_BY, "import", "points", "points", &detail).map_err(|e| e.to_string())?;
    let closing = finish(tx, dry_run)?;
    let summary = format!(
        "Checks (all passed):\n\
         \x20 Customers in file:           {}\n\
         \x20 Opening ledger rows:         {}  (zero-point customers get no row)\n\
         \x20 Points total:                {}  (ledger equals customers' loyalty_points)\n\
         {closing}",
        rows.len(),
        loaded.len(),
        fmt_hundredths(ledger_sum),
    );
    Ok(Report { notes, summary })
}

struct CreditRow {
    line: usize,
    code: String,
    paise: i64,
    bills: String,
    oldest: String,
    report_names: String,
}

fn read_credit(text: &str) -> Result<Vec<CreditRow>, String> {
    let mut out = Vec::new();
    for (line, m) in read_table(text, CREDIT_COLUMNS)? {
        let at = |e: String| format!("credit CSV line {line}: {e}");
        let paise = fixed(&m["amount_to_load"], 2).map_err(at)?;
        let code = m["customer_code"].clone();
        if paise != 0 && code.is_empty() {
            return Err(at(format!(
                "'{}' (Rs {}) has no customer_code. Fill in the POSBean code, or set amount_to_load to 0.00. Nothing was changed.",
                m["report_names"],
                inr(paise)
            )));
        }
        if paise != 0 {
            parse_date(&m["oldest_credit_bill_date"]).map_err(at)?;
        }
        out.push(CreditRow {
            line,
            code,
            paise,
            bills: m["bills"].clone(),
            oldest: m["oldest_credit_bill_date"].clone(),
            report_names: m["report_names"].clone(),
        });
    }
    Ok(out)
}

/// Opening receivables from the paymode report's credit sales (net of credit returns). Sets customers.outstanding
/// and writes one 'opening receivable' audit row per CSV line, dated the report date. No bills are created.
pub fn credit(c: &mut Connection, csv_text: &str, csv_name: &str, dry_run: bool) -> Result<Report, String> {
    let rows = read_credit(csv_text)?;
    let file_total: i64 = rows.iter().map(|r| r.paise).sum();
    let mut per: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for r in rows.iter().filter(|r| r.paise != 0) {
        *per.entry(r.code.clone()).or_default() += r.paise;
    }
    let (ry, rm, rd) = REPORT_DATE;
    let report_day = NaiveDate::from_ymd_opt(ry, rm, rd).ok_or("bad report date")?;
    let when = iso(local_midnight(report_day)?);
    let now = Local::now();

    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let done = q1(&tx, "SELECT COUNT(*) FROM audit_log WHERE action='import' AND entity='credit'")?;
    if done > 0 {
        return Err("the credit balances were imported before (the audit log has the import marker). Nothing was changed.".into());
    }
    for (code, &paise) in &per {
        let found: Option<(String, i64)> = tx
            .query_row("SELECT name,outstanding FROM customers WHERE id=?1", [code], |x| Ok((x.get(0)?, x.get(1)?)))
            .optional()
            .map_err(e2s)?;
        let Some((name, owing)) = found else {
            return Err(format!("customer code {code} is not in the database. Nothing was changed."));
        };
        if owing != 0 {
            return Err(format!("customer {code} '{name}' already owes {}. Nothing was changed.", inr(owing)));
        }
        if paise < 0 {
            return Err(format!("customer {code} would owe a negative amount {}. Nothing was changed.", inr(paise)));
        }
    }
    for r in rows.iter().filter(|r| r.paise != 0) {
        let detail = format!(
            "credit sales to 07-Nov-2026 net of returns, CSV line {}: {} bill(s), oldest {}, POSBean name '{}', amount Rs {}; \
             collections are not in the report, so this is the most that can be owed",
            r.line,
            r.bills,
            r.oldest,
            r.report_names,
            inr(r.paise).replace(',', "")
        );
        audit(&tx, local_midnight(report_day)?, IMPORT_BY, "opening receivable", "customer", &r.code, &detail).map_err(|e| e.to_string())?;
    }
    for (code, &paise) in &per {
        tx.execute("UPDATE customers SET outstanding=?2 WHERE id=?1", params![code, paise]).map_err(e2s)?;
    }

    // ---------- checks, inside the transaction ----------
    let mut problems: Vec<String> = Vec::new();
    let loaded_rows = rows.iter().filter(|r| r.paise != 0).count() as i64;
    let audit_rows: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM audit_log WHERE action='opening receivable' AND entity='customer' AND at=?1",
            [&when],
            |x| x.get(0),
        )
        .map_err(e2s)?;
    tx.execute_batch("CREATE TEMP TABLE import_ids(id TEXT PRIMARY KEY)").map_err(e2s)?;
    for code in per.keys() {
        tx.execute("INSERT INTO import_ids(id) VALUES(?1)", [code]).map_err(e2s)?;
    }
    let db_total = q1(&tx, "SELECT COALESCE(SUM(outstanding),0) FROM customers WHERE id IN (SELECT id FROM import_ids)")?;
    let n_owing = q1(&tx, "SELECT COUNT(*) FROM customers WHERE id IN (SELECT id FROM import_ids) AND outstanding>0")?;
    tx.execute_batch("DROP TABLE import_ids").map_err(e2s)?;
    if audit_rows != loaded_rows {
        problems.push(format!("opening receivable audit rows {audit_rows}, expected {loaded_rows}"));
    }
    if db_total != file_total {
        problems.push(format!("receivables: file {}, database {}", inr(file_total), inr(db_total)));
    }
    if n_owing != per.len() as i64 {
        problems.push(format!("customers with a balance {n_owing}, expected {}", per.len()));
    }
    if !problems.is_empty() {
        return Err(format!("CHECKS FAILED, rolled back: {}", problems.join("; ")));
    }
    let detail = format!("{csv_name}: {loaded_rows} lines for {} customers, total Rs {}", per.len(), inr(file_total).replace(',', ""));
    audit(&tx, now, IMPORT_BY, "import", "credit", "credit", &detail).map_err(|e| e.to_string())?;
    let closing = finish(tx, dry_run)?;
    let summary = format!(
        "Checks (all passed):\n\
         \x20 CSV lines with an amount:    {loaded_rows}\n\
         \x20 Customers with a balance:    {}\n\
         \x20 Total receivable loaded:     Rs {}  (CSV total Rs {})\n\
         \x20 Audit rows dated {}:      {audit_rows}\n\
         {closing}",
        per.len(),
        inr(db_total),
        inr(file_total),
        report_day.format("%d-%b-%Y"),
    );
    Ok(Report { notes: Vec::new(), summary })
}
