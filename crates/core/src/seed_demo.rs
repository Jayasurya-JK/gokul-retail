//! DEMO DATA. Fills an empty database with the same demo shop the mock API shows (items, customers, users with
//! PINs 1111/2222/1234..., settings, and about 30 days of past bills) so the app looks the same before real data exists.
//!
//! To remove: delete this file, `crates/core/seed/demo.json`, `packages/data/scripts/gen-demo-seed.mjs`, the
//! `seed_demo` module line in lib.rs and the `seed_demo_if_empty` call in each app's main.rs.

use crate::bills::{write_bill, BILL_SERIES};
use crate::db::{self, iso, set_setting, Db};
use crate::error::Result;
use crate::store::hash_pin;
use crate::types::*;
use chrono::{DateTime, Duration, Local, TimeZone};
use rusqlite::{params, Connection, TransactionBehavior};
use serde::Deserialize;

const DEMO_JSON: &str = include_str!("../seed/demo.json");

#[derive(Deserialize)]
struct SeedLogin {
    d: i64,
    hm: String,
}
#[derive(Deserialize)]
struct SeedUser {
    id: String,
    name: String,
    role: String,
    initials: String,
    color: String,
    pin: String,
    #[serde(rename = "lastLogin")]
    last_login: SeedLogin,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedCustomer {
    id: String,
    name: String,
    phone: String,
    area: String,
    credit_limit: i64,
    outstanding: i64,
    loyalty_points: i64,
    last_visit_days: i64,
}
type SeedBill = (i64, i64, String, Option<String>, Vec<(usize, i64)>, Vec<(String, i64, Option<String>)>, i64);
#[derive(Deserialize)]
struct SeedData {
    settings: Settings,
    categories: Vec<Category>,
    users: Vec<SeedUser>,
    items: Vec<Item>,
    customers: Vec<SeedCustomer>,
    bills: Vec<SeedBill>,
}

/// Seeds only when the database has no users and no items. Returns true if it seeded.
pub fn seed_demo_if_empty(db: &Db) -> Result<bool> {
    db.with(|c| {
        let users: i64 = c.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
        let items: i64 = c.query_row("SELECT COUNT(*) FROM items WHERE kind='item'", [], |r| r.get(0))?;
        if users > 0 || items > 0 {
            return Ok(false);
        }
        seed_demo(c)?;
        Ok(true)
    })
}

/// Shop settings (the default shop details). Shared by the demo seed and the real-stock import.
fn write_settings(c: &Connection, s: &Settings) -> Result<()> {
    for (k, v) in [
        ("shopName", s.shop_name.as_str()),
        ("address", &s.address),
        ("gstin", &s.gstin),
        ("phone", &s.phone),
        ("counter", &s.counter),
        ("billPrefix", &s.bill_prefix),
        ("receiptFooter", &s.receipt_footer),
        ("printer", &s.printer),
        ("roundToRupee", if s.round_to_rupee { "1" } else { "0" }),
    ] {
        set_setting(c, k, v)?;
    }
    Ok(())
}

/// Login users with their PINs (1111 owner, 2222 manager, 1234 cashier and the other demo users).
fn write_users(c: &Connection, users: &[SeedUser], now: DateTime<Local>) -> Result<()> {
    for u in users {
        let at = (now - Duration::days(u.last_login.d)).date_naive();
        let hm: Vec<u32> = u.last_login.hm.split(':').filter_map(|x| x.parse().ok()).collect();
        let t = at.and_hms_opt(hm.first().copied().unwrap_or(9), hm.get(1).copied().unwrap_or(0), 0).unwrap();
        let last = Local.from_local_datetime(&t).earliest().unwrap_or(now);
        c.execute(
            "INSERT INTO users(id,name,role,initials,color,pin_hash,last_login,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![u.id, u.name, u.role, u.initials, u.color, hash_pin(&u.pin)?, iso(last), iso(now)],
        )?;
    }
    Ok(())
}

/// Only the shop settings and the login users (plus the migration defaults: roles, barrels, norms, expense
/// categories). No items, customers, bills, purchases or production. Used by the real-stock import (`gokul-import`).
pub fn seed_login_and_settings(conn: &mut Connection) -> Result<()> {
    let data: SeedData = serde_json::from_str(DEMO_JSON)?;
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    write_settings(&tx, &data.settings)?;
    write_users(&tx, &data.users, now)?;
    tx.commit()?;
    Ok(())
}

pub fn seed_demo(conn: &mut Connection) -> Result<()> {
    let data: SeedData = serde_json::from_str(DEMO_JSON)?;
    let now = Local::now();
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

    write_settings(&tx, &data.settings)?;
    for (i, c) in data.categories.iter().enumerate() {
        tx.execute("INSERT INTO categories(id,name,sort) VALUES(?1,?2,?3)", params![c.id, c.name, i as i64])?;
    }
    write_users(&tx, &data.users, now)?;
    for c in &data.customers {
        let last = now - Duration::days(c.last_visit_days);
        tx.execute(
            "INSERT INTO customers(id,name,phone,area,credit_limit,outstanding,loyalty_points,last_visit_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![c.id, c.name, c.phone, c.area, c.credit_limit, c.outstanding, c.loyalty_points * 100, iso(last), iso(now)],
        )?;
    }
    tx.execute("INSERT INTO sequences(series,fy,last_seq) VALUES('CUSTOMER','-',?1)", [data.customers.len() as i64])?;

    // Stock: opening movement = stock shown on screen + everything the demo bills will sell, so the ledger
    // ends exactly at the demo stock figure.
    let mut sold = vec![0i64; data.items.len()];
    for b in &data.bills {
        for (idx, qty) in &b.4 {
            sold[*idx] += qty;
        }
    }
    let opening_at = iso(now - Duration::days(31));
    for (i, it) in data.items.iter().enumerate() {
        tx.execute(
            "INSERT INTO items(id,code,name,name_ta,category_id,brand,unit,loose,pack_size,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,0,?15,?16,?17)",
            params![
                it.id, it.code, it.name, it.name_ta, it.category_id, it.brand, it.unit, it.loose, it.pack_size, it.hsn, it.gst_rate,
                it.mrp, it.price, it.cost, it.reorder_level, it.active, opening_at
            ],
        )?;
        tx.execute("INSERT INTO barcodes(barcode,item_id,is_primary) VALUES(?1,?2,1)", params![it.barcode, it.id])?;
        let opening = it.stock + sold[i];
        tx.execute(
            "INSERT INTO stock_movements(at,item_id,kind,qty,ref_type,note,by_name) VALUES(?1,?2,'opening',?3,'seed','Opening stock','system')",
            params![opening_at, it.id, opening],
        )?;
        tx.execute("UPDATE items SET stock=?1 WHERE id=?2", params![opening, it.id])?;
    }

    for (d, sec, cashier, cust, lines, pays, _grand) in &data.bills {
        let date = (now - Duration::days(*d)).date_naive();
        let naive = date.and_hms_opt(0, 0, 0).unwrap() + Duration::seconds(*sec);
        let at = Local.from_local_datetime(&naive).earliest().unwrap_or(now).min(now);
        let draft = BillDraft {
            customer_id: cust.clone(),
            customer_name: cust.as_ref().and_then(|id| data.customers.iter().find(|c| &c.id == id)).map(|c| c.name.clone()),
            lines: lines
                .iter()
                .map(|(idx, qty)| {
                    let it = &data.items[*idx];
                    crate::money::recalc_line(&BillLine {
                        item_id: it.id.clone(),
                        code: it.code.clone(),
                        name: it.name.clone(),
                        unit: it.unit.clone(),
                        qty: *qty,
                        rate: it.price,
                        discount: 0,
                        gst_rate: it.gst_rate,
                        amount: 0,
                    })
                })
                .collect(),
            bill_discount: 0,
            payments: pays.iter().map(|(m, a, r)| Payment { mode: m.clone(), amount: *a, r#ref: r.clone() }).collect(),
            cashier: Some(cashier.clone()),
            manager_pin: None,
        };
        write_bill(&tx, &draft, at, None)?;
    }
    // The demo shows customer balances as designed, not as recomputed from demo bills.
    for c in &data.customers {
        let last = now - Duration::days(c.last_visit_days);
        tx.execute("UPDATE customers SET outstanding=?1, last_visit_at=?2 WHERE id=?3", params![c.outstanding, iso(last), c.id])?;
    }
    set_setting(&tx, "demo_seeded", "1")?;
    db::audit(&tx, now, "system", "seed_demo", "database", "demo", &format!("{} bills", data.bills.len()))?;
    let _ = BILL_SERIES;
    tx.commit()?;
    seed_office(conn, &data, now)
}

/// Suppliers, purchases, barrels with oil, pressing batches, packing runs, stock adjustments and B2B customers, all created
/// through the real Office operations so the ledger, supplier balances and barrel levels are consistent.
fn seed_office(conn: &mut Connection, data: &SeedData, now: chrono::DateTime<Local>) -> Result<()> {
    use crate::catalog::{create_adjustment, AdjustmentInput};
    use crate::purchasing::*;
    use std::collections::HashMap;

    let at = |days: i64, hour: u32, min: u32| {
        let d = (now - Duration::days(days)).date_naive().and_hms_opt(hour, min, 0).unwrap();
        Local.from_local_datetime(&d).earliest().unwrap_or(now).min(now)
    };
    let mut rng = 4242u64;
    let mut rnd = move |lo: i64, hi: i64| {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        lo + ((rng >> 33) as i64 % (hi - lo + 1))
    };

    {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        // loose -> packed links and scale codes
        let loose: HashMap<String, String> =
            data.items.iter().filter(|i| i.loose).map(|i| (i.name.trim_end_matches(" (Loose)").to_string(), i.id.clone())).collect();
        for it in &data.items {
            if it.loose {
                tx.execute("UPDATE items SET scale_code=?1 WHERE id=?2", params![it.code, it.id])?;
            } else if let Some(ps) = &it.pack_size {
                let base = it.name.strip_suffix(ps.as_str()).unwrap_or(&it.name).trim();
                if let Some(pid) = loose.get(base) {
                    tx.execute("UPDATE items SET parent_id=?1 WHERE id=?2", params![pid, it.id])?;
                }
            }
        }
        // raw material in the godown
        for (id, qty) in [("rm-gn", 1_850_000i64), ("rm-sesame", 720_000), ("rm-copra", 1_100_000), ("rm-btl500", 2_400_000), ("rm-btl1l", 1_800_000), ("rm-tin15", 46_000), ("rm-label", 6_200_000)] {
            db::post_movement(&tx, &iso(at(31, 9, 0)), id, "opening", qty, "seed", "", "Opening stock", "system")?;
        }
        // suppliers
        for (id, name, phone, city, gstin, address, contact, days) in [
            ("s1", "Sri Murugan Oil Seeds", "94430 12871", "Erode", "33AADFS2901K1ZP", "14, Perundurai Road, Erode 638011", "Murugan", 15),
            ("s2", "Kongu Groundnut Traders", "98427 66012", "Tiruppur", "33AAGFK5521Q1Z3", "7, Kangeyam Road, Tiruppur 641604", "Kongu Palanisamy", 7),
            ("s3", "Annai Gingelly Merchants", "97890 45521", "Salem", "33AAEPA7712B1ZK", "22, Fairlands Main Road, Salem 636016", "Annamalai", 21),
            ("s4", "Thanjai Coconut Copra Mart", "90030 18842", "Pollachi", "33AAHFT3345C1ZA", "5, Market Yard, Pollachi 642001", "Thanjai Selvam", 30),
            ("s5", "Pandian Jaggery Works", "99940 27365", "Mettur", "33AAJPP9981R1Z8", "31, Jaggery Market Street, Mettur 636401", "Pandian", 10),
            ("s6", "Aachi Distributors Coimbatore", "98946 31107", "Coimbatore", "33AACCA1182M1ZL", "88, Oppanakara Street, Coimbatore 641001", "Ravi (Salesman)", 15),
            ("s7", "Lakshmi Pulses & Grains", "93640 90218", "Coimbatore", "33AAHPL4410D1ZQ", "12, Big Bazaar Street, Coimbatore 641001", "Lakshmi Narayanan", 15),
            ("s8", "Vinayaga Packaging", "99425 51480", "Coimbatore", "33AAKFV6672G1ZN", "3, SIDCO Industrial Estate, Kurichi, Coimbatore 641021", "Vinayagam", 30),
        ] {
            tx.execute(
                "INSERT INTO suppliers(id,name,phone,city,gstin,address,contact,credit_days,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![id, name, phone, city, gstin, address, contact, days, iso(now)],
            )?;
        }
        tx.execute("INSERT INTO sequences(series,fy,last_seq) VALUES('SUPPLIER','-',8)", [])?;
        // B2B customers (every seventh) with a business name and GSTIN
        let businesses = ["Sri Annapoorna Mess", "Kovai Sweets and Snacks", "Murugan Idli Kadai", "Vinayaga Tiffin Centre", "Lakshmi Catering Service", "Pandian Provision Stores", "Thendral Hotel", "Sakthi Mess"];
        for (i, c) in data.customers.iter().enumerate() {
            let b2b = i % 7 == 3;
            let email = if i % 4 == 0 { format!("{}{}@gmail.com", c.name.split(' ').next().unwrap_or("customer").to_lowercase(), 10 + i) } else { String::new() };
            let gstin = if b2b { format!("33AABCP{:04}K1Z{}", 1000 + i * 37, (b'A' + (i % 9) as u8) as char) } else { String::new() };
            tx.execute(
                "UPDATE customers SET type=?1, business=?2, gstin=?3, email=?4, address=?5 WHERE id=?6",
                params![if b2b { "b2b" } else { "retail" }, if b2b { businesses[(i >> 1) % businesses.len()] } else { "" }, gstin, email, format!("{}, {}, Coimbatore", 12 + i, c.area), c.id],
            )?;
        }
        tx.commit()?;
    }

    // purchases over the last ~90 days
    type Cand = (String, i64, i64, bool);
    let query = |conn: &Connection, sql: &str| -> Result<Vec<Cand>> {
        let mut st = conn.prepare(sql)?;
        let v = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0)))?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(v)
    };
    let raw = |id: &str, cost: i64, gst: i64| -> Cand { (id.to_string(), cost, gst, true) };
    let order = ["s2", "s3", "s1", "s4", "s5", "s6", "s7", "s8", "s2", "s3", "s4", "s1", "s6", "s2", "s7", "s5", "s3", "s8", "s4", "s2", "s1", "s6", "s3", "s4", "s7", "s2", "s5", "s3"];
    for (k, sid) in order.iter().enumerate() {
        let cands: Vec<Cand> = match *sid {
            "s1" => vec![raw("rm-sesame", 13800, 0), raw("rm-gn", 9800, 0)],
            "s2" => vec![raw("rm-gn", 9800, 0)],
            "s3" => vec![raw("rm-sesame", 13800, 0)],
            "s4" => vec![raw("rm-copra", 16800, 5)],
            "s5" => query(conn, "SELECT id,cost,gst_rate,loose FROM items WHERE name LIKE '%Jaggery%(Loose)' AND kind='item' ORDER BY rowid LIMIT 8")?,
            "s6" => query(conn, "SELECT id,cost,gst_rate,loose FROM items WHERE category_id='pack' AND kind='item' ORDER BY rowid LIMIT 8")?,
            "s7" => query(conn, "SELECT id,cost,gst_rate,loose FROM items WHERE category_id IN ('dal','rice') AND loose=1 AND kind='item' ORDER BY rowid LIMIT 8")?,
            _ => vec![raw("rm-btl500", 750, 18), raw("rm-btl1l", 1100, 18), raw("rm-tin15", 16500, 18), raw("rm-label", 120, 18)],
        };
        if cands.is_empty() {
            continue;
        }
        let when = at((k as f64 * 3.1 + 1.0) as i64, 11 + (k % 5) as u32, ((k * 7) % 60) as u32);
        let n = 1 + rnd(0, (cands.len() as i64 - 1).min(2)) as usize;
        let mut lines = vec![];
        for j in 0..n.min(cands.len()) {
            let (id, cost, gst, _) = &cands[(j + k) % cands.len()];
            let qty = if *sid == "s6" {
                rnd(12, 60)
            } else if id == "rm-label" || id.starts_with("rm-btl") {
                rnd(500, 2500)
            } else if id == "rm-tin15" {
                rnd(20, 80)
            } else {
                rnd(8, 40) * 5
            };
            let rate = ((*cost * (97 + rnd(0, 6)) / 100) / 50) * 50;
            lines.push(GrnDraftLine { item_id: id.clone(), qty: qty * 1000, rate, discount_pct: if rnd(0, 3) == 0 { 2.0 } else { 0.0 }, gst_rate: *gst });
        }
        let gross = compute_grn(&lines, 0, 0, false).total;
        let old = k >= 14;
        let roll = rnd(0, 99);
        let paid_now = if old || roll < 38 { gross } else if roll < 62 { gross / 2 / 100 * 100 } else { 0 };
        let draft = GrnDraft {
            supplier_id: sid.to_string(),
            invoice_no: format!("{}/{}", ["SM", "KG", "AG", "TC", "PJ", "AD", "LP", "VP"][sid[1..].parse::<usize>().unwrap_or(1) - 1], 2600 + k * 7),
            invoice_date: when.format("%Y-%m-%d").to_string(),
            lines,
            freight: if *sid == "s5" || *sid == "s6" { 0 } else { [0, 45000, 80000, 120000][rnd(0, 3) as usize] },
            other_charges: 0,
            paid_now,
            pay_mode: if rnd(0, 1) == 0 { "upi".into() } else { "bank".into() },
            update_cost: false,
            notes: None,
        };
        create_grn_at(conn, &draft, when)?;
    }
    for (sid, days, amount) in [("s3", 20, 6_200_000i64), ("s1", 12, 3_000_000), ("s4", 9, 2_500_000), ("s7", 6, 1_500_000), ("s2", 4, 4_000_000)] {
        let due: i64 = conn.query_row("SELECT COALESCE(SUM(total-paid),0) FROM purchases WHERE supplier_id=?1", [sid], |r| r.get(0))?;
        let amt = amount.min(due);
        if amt > 0 {
            record_supplier_payment(
                conn,
                &SupplierPaymentDraft { supplier_id: sid.into(), amount: amt, mode: "bank".into(), r#ref: Some(format!("UTR48{}", 21000 + days * 137)), date: Some(at(days, 16, 20).format("%Y-%m-%d").to_string()), note: Some("Part payment".into()) },
            )?;
        }
    }

    // pressing: (seed, load kg, days ago, barrel it went into, yield variance in percent)
    let plan: [(&str, i64, i64, Option<&str>, f64); 9] = [
        ("groundnut", 400, 20, Some("BR-01"), -3.5), ("sesame", 250, 18, Some("BR-04"), -7.5), ("copra", 300, 16, Some("BR-06"), -1.0),
        ("groundnut", 350, 14, Some("BR-02"), -4.5), ("groundnut", 300, 8, Some("BR-03"), 1.0), ("sesame", 200, 6, Some("BR-05"), -2.0),
        ("copra", 250, 4, Some("BR-07"), -3.0), ("groundnut", 420, 2, None, -2.5), ("sesame", 180, 1, None, -1.5),
    ];
    for (n, (seed, load, days, barrel, var)) in plan.iter().enumerate() {
        let norm = seed_norm(conn, seed);
        let seed_g = load * 1000;
        let cleaning = (seed_g as f64 * 0.017) as i64 / 500 * 500;
        let net = (seed_g - cleaning) as f64 / 1000.0;
        let oil_l = net / norm.kg_per_l * (1.0 + var / 100.0);
        let oil_ml = (oil_l * 1000.0) as i64 / 500 * 500;
        let jag_stock: i64 = conn.query_row("SELECT stock FROM items WHERE name='Palm Jaggery (Karupatti) (Loose)'", [], |r| r.get(0))?;
        let jag = if *seed == "sesame" { (seed_g / 10).min(jag_stock / 2) / 500 * 500 } else { 0 };
        let cake_g = ((net + jag as f64 / 1000.0 - oil_l * norm.density - net * 0.01) * 1000.0) as i64 / 500 * 500;
        let when = at(*days, 9, 30 + (n as u32 % 3) * 10);
        let b = create_pressing_batch_at(
            conn,
            &PressingDraft {
                seed: seed.to_string(), seed_kg: seed_g, cleaning_loss_kg: cleaning, jaggery_kg: jag, oil_raw_l: oil_ml, cake_kg: cake_g,
                chekku: format!("Chekku {}", 1 + n % 3), operator: ["Murugesan", "Selvam", "Kannan"][n % 3].into(),
                machine: if n % 4 == 3 && *seed != "copra" { "R".into() } else { "W".into() },
            },
            when,
        )?;
        if let Some(br) = barrel {
            let moved = when + Duration::days(norm.settle_days);
            let sediment = oil_ml * 3 / 100 / 500 * 500;
            move_batch_to_barrel_at(
                conn,
                &MoveToBarrel { batch_id: b["id"].as_str().unwrap_or("").into(), barrel_id: (*br).into(), clear_oil_l: oil_ml - sediment },
                moved.min(now),
            )?;
        }
    }
    // packing runs: (barrel, days ago, [(pack label, count)], wastage percent, packer)
    let runs: [(&str, i64, &[(&str, i64)], f64, &str); 4] = [
        ("BR-01", 7, &[("500 ml", 48), ("1 L", 50)], 0.3, "Revathi"),
        ("BR-04", 5, &[("200 ml", 60), ("500 ml", 40)], 0.4, "Revathi"),
        ("BR-06", 3, &[("500 ml", 36), ("1 L", 48)], 0.9, "Kala"),
        ("BR-02", 2, &[("1 L", 30), ("5 L", 4)], 0.2, "Kala"),
    ];
    for (barrel, days, packs, waste, packer) in runs {
        let targets = list_pack_targets(conn, barrel)?;
        let mut lines = vec![];
        let mut expected = 0i64;
        for (label, count) in packs {
            if let Some(t) = targets.iter().find(|t| t["label"] == *label) {
                lines.push(PackLineDraft { item_id: t["itemId"].as_str().unwrap_or("").into(), count: *count });
                expected += t["sizeMl"].as_i64().unwrap_or(0) * count;
            }
        }
        if lines.is_empty() {
            continue;
        }
        let used = ((expected as f64 * (1.0 + waste / 100.0)) as i64 + 5) / 10 * 10;
        create_pack_run_at(conn, &PackRunDraft { barrel_id: barrel.into(), lines, used_l: used, packer: packer.into() }, at(days, 14, 15))?;
    }
    // a few stock adjustments
    for (code, reason, qty, note) in [("102", "leak", -2000i64, "200 ml bottles leaking at the cap"), ("101", "spill", -1250, "Spilled while filling a customer can"), ("104", "damage", -3000, "Bottles broken in rack")] {
        let id: Option<String> = conn.query_row("SELECT id FROM items WHERE code=?1", [code], |r| r.get(0)).ok();
        if let Some(item_id) = id {
            create_adjustment(conn, &AdjustmentInput { item_id, reason: reason.into(), qty, note: note.into() })?;
        }
    }
    seed_expenses(conn, now)?;
    // The demo sheets are a nicety: a failure here must never stop the shop from starting.
    let _ = seed_mill_sheets(conn, now);
    Ok(())
}

/// Past expenses for the last few weeks (cash ones are written straight in: the demo days have no open drawer).
fn seed_expenses(conn: &mut Connection, now: chrono::DateTime<Local>) -> Result<()> {
    let plan: [(&str, &str, i64, &str, &str); 10] = [
        ("tea", "cash", 18_000, "Tea stall", "Tea and snacks for staff"),
        ("transport", "cash", 45_000, "Auto - Saravana", "Bringing seeds from market"),
        ("wages", "cash", 150_000, "Loadmen", "Unloading groundnut lorry"),
        ("electricity", "bank", 612_000, "TNEB", "Mill electricity bill"),
        ("rent", "bank", 1_800_000, "Mr. Palanisamy", "Godown rent"),
        ("repairs", "cash", 85_000, "Murugan Workshop", "Chekku bearing repair"),
        ("packing", "upi", 240_000, "Sri Packaging", "Labels and cartons"),
        ("advance", "cash", 200_000, "Selvam", "Salary advance"),
        ("tea", "cash", 14_000, "Tea stall", "Tea"),
        ("transport", "upi", 120_000, "Gokul Transport", "Delivery to Pollachi"),
    ];
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for (n, (cat, from, amt, to, note)) in plan.iter().enumerate() {
        let when = now - Duration::days(1 + (n as i64) * 2);
        let fy = db::fy_of(when);
        let seq = db::next_seq(&tx, crate::expenses::EXPENSE_SERIES, &fy)?;
        let name: String = tx.query_row("SELECT name FROM expense_categories WHERE id=?1", [cat], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO expenses(number,fy,seq,at,day,category_id,category_name,paid_from,amount,paid_to,note,by_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![db::doc_number("EX", &fy, seq), fy, seq, iso(when), db::day_of(when), cat, name, from, amt, to, note, if n % 3 == 0 { "Karthik" } else { "Lakshmi" }],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Three closed mill sheets (3, 2 and 1 days ago): operator aravai on W and R machines, customer job work (cake taken and
/// kept), punnaku purchased, and a counted closing stock with small differences.
fn seed_mill_sheets(conn: &mut Connection, now: chrono::DateTime<Local>) -> Result<()> {
    use crate::mill::{close_sheet, get_sheet, save_sheet, CloseInput, CustRow, OpRow, PunnakuRow, SheetInput};
    let cust: Vec<String> = {
        let mut st = conn.prepare("SELECT id FROM customers WHERE type='retail' ORDER BY id LIMIT 4")?;
        let v = st.query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        v
    };
    let op = |o: &str, seed: &str, m: &str, kg: i64, oil: i64, cake: i64, jag: i64| OpRow {
        operator: o.into(), seed: seed.into(), machine: m.into(), seed_kg: kg * 1000, oil_l: oil, cake_kg: cake * 1000, jaggery_kg: jag * 1000,
    };
    for (i, days) in [3i64, 2, 1].iter().enumerate() {
        let day = db::day_of(now - Duration::days(*days));
        let (ops, custs, puns) = match i {
            0 => (
                vec![op("Operator 1", "groundnut", "W", 120, 44_500, 70_000, 0), op("Operator 1", "sesame", "W", 60, 21_000, 38_000, 6), op("Operator 2", "groundnut", "R", 150, 60_000, 82_000, 0)],
                vec![(0usize, "groundnut", "W", 40i64, 15_000i64, 22i64, "taken")],
                vec![("kadalai_w", 120i64), ("ellu_r", 45)],
            ),
            1 => (
                vec![op("Operator 1", "groundnut", "W", 140, 51_500, 82_000, 0), op("Operator 2", "copra", "W", 90, 52_000, 33_000, 0), op("Operator 2", "sesame", "R", 70, 27_500, 40_000, 7)],
                vec![(1, "sesame", "W", 25, 9_000, 15, "kept"), (0, "groundnut", "R", 30, 11_500, 17, "taken")],
                vec![("kadalai_r", 80)],
            ),
            _ => (
                vec![op("Operator 1", "groundnut", "W", 130, 48_000, 76_000, 0), op("Operator 2", "groundnut", "R", 110, 44_000, 60_000, 0), op("Operator 1", "copra", "W", 80, 46_000, 29_000, 0)],
                vec![(2, "groundnut", "W", 50, 19_000, 28, "kept")],
                vec![("coco", 60), ("kadalai_w", 90)],
            ),
        };
        let mut input = SheetInput {
            day: day.clone(),
            supervisor: "Mohan".into(),
            note: String::new(),
            op_rows: ops,
            cust_rows: custs
                .into_iter()
                .filter_map(|(c, seed, m, kg, oil, cake, mode)| {
                    cust.get(c).map(|id| CustRow { customer_id: id.clone(), seed: seed.into(), machine: m.into(), seed_kg: kg * 1000, oil_l: oil, cake_kg: cake * 1000, cake_mode: mode.into() })
                })
                .collect(),
            punnaku_rows: puns.into_iter().map(|(k, kg)| PunnakuRow { punnaku: k.into(), qty_kg: kg * 1000, supplier_id: String::new(), note: String::new() }).collect(),
            physical: serde_json::Map::new(),
        };
        // Count what the sheet computes, with a small loss on one or two lines.
        let sheet = get_sheet(conn, &day)?;
        let _ = sheet;
        save_sheet(conn, &input)?;
        let draft = get_sheet(conn, &day)?;
        let mut physical = serde_json::Map::new();
        for (n, l) in draft["stock"].as_array().cloned().unwrap_or_default().iter().enumerate() {
            let computed = l["computed"].as_i64().unwrap_or(0).max(0);
            let delta = match (i, l["key"].as_str().unwrap_or("")) {
                (0, "kadalai_w") => -2_500,
                (1, "sesame") => -1_000,
                (2, "kadalai_r") => 1_500,
                _ => 0,
            };
            let _ = n;
            physical.insert(l["key"].as_str().unwrap_or("").into(), serde_json::json!((computed + delta).max(0)));
        }
        input.physical = physical;
        save_sheet(conn, &input)?;
        close_sheet(conn, &CloseInput { day, manager_pin: None })?;
    }
    Ok(())
}

