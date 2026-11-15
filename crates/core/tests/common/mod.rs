#![allow(dead_code)]
use gokul_core::db::{iso, Db};
use gokul_core::store::hash_pin;
use gokul_core::types::*;
use rusqlite::{params, Connection};
use tempfile::TempDir;

/// Empty database with a handful of hand-made rows (no demo data). PINs: owner 1111, manager 2222, cashier 1234.
pub fn mini_db() -> (TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    db.with(|c| {
        let now = iso(chrono::Local::now());
        c.execute("INSERT INTO categories(id,name,sort) VALUES('oil','Oils',0)", [])?;
        for (id, name, role, pin) in [("u1", "Suresh", "owner", "1111"), ("u2", "Lakshmi", "manager", "2222"), ("u3", "Karthik", "cashier", "1234")] {
            c.execute(
                "INSERT INTO users(id,name,role,initials,color,pin_hash,created_at) VALUES(?1,?2,?3,'XX','#000',?4,?5)",
                params![id, name, role, hash_pin(pin).unwrap(), now],
            )?;
        }
        // (id, code, barcode, name, unit, loose, gst, price, stock milli)
        for (id, code, bc, name, unit, loose, gst, price, stock) in [
            ("i1", "101", "8904000000011", "Groundnut Oil 1 L", "btl", 0, 5, 36_000, 50_000),
            ("i2", "102", "8904000000028", "Groundnut Oil (Loose)", "l", 1, 5, 36_000, 100_000),
            ("i3", "103", "8904000000035", "Dish Wash Bar", "pc", 0, 18, 3_800, 20_000),
        ] {
            c.execute(
                "INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at)
                 VALUES(?1,?2,?3,'oil','Gokul',?4,?5,'1508',?6,?7,?7,?8,?9,10000,1,?10)",
                params![id, code, name, unit, loose, gst, price, price * 8 / 10, stock, now],
            )?;
            c.execute("INSERT INTO barcodes(barcode,item_id,is_primary) VALUES(?1,?2,1)", params![bc, id])?;
            c.execute(
                "INSERT INTO stock_movements(at,item_id,kind,qty,note) VALUES(?1,?2,'opening',?3,'Opening')",
                params![now, id, stock],
            )?;
        }
        c.execute(
            "INSERT INTO customers(id,name,phone,credit_limit,outstanding,created_at) VALUES('c1','Murugan','98400 11111',500000,0,?1)",
            [now],
        )?;
        Ok(())
    })
    .unwrap();
    (dir, db)
}

pub fn line(item: &str, code: &str, name: &str, qty: i64, rate: i64, gst: impl Into<f64>) -> BillLine {
    BillLine { item_id: item.into(), code: code.into(), name: name.into(), unit: "pc".into(), qty, rate, discount: 0, gst_rate: gst.into(), cess_rate: 0.0, amount: 0, hsn: String::new(), tax: None }
}

/// A draft paid fully in cash. The grand total is computed with the same engine the server uses.
pub fn cash_draft(lines: Vec<BillLine>) -> BillDraft {
    draft_with(lines, 0, None, "cash")
}

pub fn draft_with(lines: Vec<BillLine>, bill_discount: i64, customer: Option<&str>, mode: &str) -> BillDraft {
    let ls: Vec<BillLine> = lines.iter().map(gokul_core::money::recalc_line).collect();
    let grand = gokul_core::money::compute_totals(&ls, bill_discount, true).grand;
    BillDraft {
        customer_id: customer.map(String::from),
        customer_name: None,
        lines,
        bill_discount,
        payments: vec![Payment { mode: mode.into(), amount: grand, r#ref: None }],
        cashier: Some("Karthik".into()),
        manager_pin: None,
                extras: Default::default(),
    }
}

pub fn count(c: &Connection, table: &str) -> i64 {
    c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
}

pub fn stock_of(c: &Connection, item: &str) -> i64 {
    c.query_row("SELECT stock FROM items WHERE id=?1", [item], |r| r.get(0)).unwrap()
}
