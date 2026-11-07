//! Customer pickers: search over ALL customers in SQL (name, mobile, code, area), recent by default, paging, and the
//! inactive flag (hidden from the counter, refused on new bills, still listed in Office).
mod common;
use common::*;
use gokul_core::{dispatch, Db};
use rusqlite::params;
use serde_json::json;

fn seed_many(db: &Db) {
    db.with(|c| {
        let tx = c.unchecked_transaction()?;
        for i in 0..6000 {
            tx.execute(
                "INSERT INTO customers(id,name,phone,area,created_at,last_visit_at) VALUES(?1,?2,?3,?4,'2026-01-01T00:00:00Z',?5)",
                params![format!("C{:05}", i + 100), format!("Customer {i}"), format!("9{:04} {:05}", i % 10000, i), if i % 2 == 0 { "Gandhipuram" } else { "RS Puram" },
                        if i < 40 { Some(format!("2026-11-{:02}T10:00:00Z", 1 + (i % 6))) } else { None }],
            )?;
        }
        tx.commit()?;
        Ok(())
    })
    .unwrap();
}

#[test]
fn search_finds_any_customer_by_name_mobile_code_and_area_and_pages() {
    let (_d, db) = mini_db();
    seed_many(&db);
    assert_eq!(dispatch(&db, "countCustomers", vec![]).unwrap(), json!(6001));
    // customers far beyond the first 30 are found
    let r = dispatch(&db, "searchCustomers", vec![json!("customer 5999"), json!(10)]).unwrap();
    assert_eq!(r[0]["name"], "Customer 5999");
    let r = dispatch(&db, "searchCustomers", vec![json!("95999"), json!(10)]).unwrap();
    assert!(r.as_array().unwrap().iter().any(|c| c["name"] == "Customer 5999"), "mobile with the space ignored");
    let r = dispatch(&db, "searchCustomers", vec![json!("c06099"), json!(10)]).unwrap();
    assert_eq!(r[0]["id"], "C06099");
    let r = dispatch(&db, "searchCustomers", vec![json!("rs puram 5999"), json!(10)]).unwrap();
    assert!(r.as_array().unwrap().iter().any(|c| c["name"] == "Customer 5999"), "every word must match, area included");
    let r = dispatch(&db, "searchCustomers", vec![json!("gandhipuram 5999"), json!(10)]).unwrap();
    assert!(r.as_array().unwrap().iter().all(|c| c["area"] == "Gandhipuram"));
    // LIKE characters are plain text
    assert!(dispatch(&db, "searchCustomers", vec![json!("%"), json!(10)]).unwrap().as_array().unwrap().is_empty());
    // empty query = recent customers first, then paging walks on without repeats
    let p1 = dispatch(&db, "searchCustomers", vec![json!(""), json!(30), json!(0)]).unwrap();
    let p2 = dispatch(&db, "searchCustomers", vec![json!(""), json!(30), json!(30)]).unwrap();
    assert_eq!(p1.as_array().unwrap().len(), 30);
    assert_ne!(p1[0]["id"], p2[0]["id"]);
    assert!(p1[0]["lastVisit"] != json!("") );
    let q1 = dispatch(&db, "searchCustomers", vec![json!("customer"), json!(50), json!(0)]).unwrap();
    let q2 = dispatch(&db, "searchCustomers", vec![json!("customer"), json!(50), json!(50)]).unwrap();
    assert!(q1.as_array().unwrap().iter().all(|a| q2.as_array().unwrap().iter().all(|b| a["id"] != b["id"])));
}

#[test]
fn inactive_customer_is_hidden_refused_on_bills_but_kept_in_office() {
    let (_d, db) = mini_db();
    let before = dispatch(&db, "searchCustomers", vec![json!("murugan"), json!(5)]).unwrap();
    assert_eq!(before.as_array().unwrap().len(), 1);
    let row = dispatch(&db, "setCustomerActive", vec![json!("c1"), json!(false)]).unwrap();
    assert_eq!(row["active"], json!(false));
    assert!(dispatch(&db, "searchCustomers", vec![json!("murugan"), json!(5)]).unwrap().as_array().unwrap().is_empty());
    assert!(dispatch(&db, "searchCustomers", vec![json!(""), json!(5)]).unwrap().as_array().unwrap().is_empty());
    assert!(dispatch(&db, "listCustomers", vec![]).unwrap().as_array().unwrap().is_empty());
    assert_eq!(dispatch(&db, "countCustomers", vec![]).unwrap(), json!(0));
    // still readable by id (a held bill can show who it was for) and listed in Office, flagged inactive
    assert_eq!(dispatch(&db, "getCustomer", vec![json!("c1")]).unwrap()["name"], "Murugan");
    let rows = dispatch(&db, "listCustomerRows", vec![]).unwrap();
    assert_eq!(rows[0]["active"], json!(false));
    // a new bill for that customer is refused, a walk-in bill is fine
    let e = db.with(|c| gokul_core::bills::save_bill(c, &draft_with(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)], 0, Some("c1"), "cash")).map(|_| ())).unwrap_err();
    assert!(e.to_string().contains("inactive"), "{e}");
    // switching back on
    dispatch(&db, "setCustomerActive", vec![json!("c1"), json!(true)]).unwrap();
    assert_eq!(dispatch(&db, "searchCustomers", vec![json!("murugan"), json!(5)]).unwrap().as_array().unwrap().len(), 1);
}

/// Run by hand on a COPY of the owner's database: `GOKUL_COPY_DB=<copy> cargo test -p gokul-core --test customers -- --ignored --nocapture`.
#[test]
#[ignore]
fn migration_on_a_copy_of_the_real_database() {
    let Ok(p) = std::env::var("GOKUL_COPY_DB") else { return };
    let db = Db::open(std::path::Path::new(&p)).unwrap();
    let total: i64 = db.with(|c| Ok(c.query_row("SELECT COUNT(*) FROM customers", [], |r| r.get(0))?)).unwrap();
    let active = dispatch(&db, "countCustomers", vec![]).unwrap();
    let jk = dispatch(&db, "searchCustomers", vec![json!("jk"), json!(10)]).unwrap();
    let recent = dispatch(&db, "searchCustomers", vec![json!(""), json!(3)]).unwrap();
    println!("customers {total}, active {active}, search jk -> {jk}, recent -> {recent}");
    assert_eq!(active, json!(total - 1));
    assert!(jk.as_array().unwrap().iter().all(|c| c["id"] != "c1"));
}

#[test]
fn office_edit_keeps_fields_it_did_not_send() {
    let (_d, db) = mini_db();
    dispatch(&db, "saveCustomer", vec![json!({ "id": "c1", "name": "Murugan", "phone": "98400 11111", "area": "Kondur", "type": "retail", "creditLimit": 0,
        "notes": "Pays on Fridays", "fatherName": "Selvam", "locality": "Main Road", "creditDays": 15, "openingBalance": 25000 })]).unwrap();
    // the Office sheet sends none of those
    let row = dispatch(&db, "saveCustomer", vec![json!({ "id": "c1", "name": "Murugan S", "phone": "98400 11111", "area": "Kondur", "type": "retail", "creditLimit": 0 })]).unwrap();
    assert_eq!(row["name"], "Murugan S");
    assert_eq!(row["notes"], "Pays on Fridays");
    assert_eq!(row["fatherName"], "Selvam");
    assert_eq!(row["locality"], "Main Road");
    assert_eq!(row["creditDays"], json!(15));
    assert_eq!(row["openingBalance"], json!(25000));
    assert_eq!(row["active"], json!(true), "active is untouched when not sent");
}

#[test]
fn item_supplier_link_shows_in_items_and_stock_report() {
    let (_d, db) = mini_db();
    db.with(|c| {
        c.execute("INSERT INTO suppliers(id,name,created_at) VALUES('s1','Nellai Maligai','2026-01-01T00:00:00Z')", [])?;
        c.execute("UPDATE items SET supplier_id='s1' WHERE id='i1'", [])?;
        Ok(())
    })
    .unwrap();
    let items = dispatch(&db, "listItems", vec![]).unwrap();
    let i1 = items.as_array().unwrap().iter().find(|i| i["id"] == "i1").unwrap();
    assert_eq!(i1["supplier"], "Nellai Maligai");
    let rep = dispatch(&db, "stockReport", vec![json!({})]).unwrap();
    let row = rep["rows"].as_array().unwrap().iter().find(|r| r["id"] == "i1").unwrap();
    assert_eq!(row["supplier"], "Nellai Maligai");
    assert!(row["reorderLevel"].is_number());
    // not linked = no supplier shown
    let i3 = items.as_array().unwrap().iter().find(|i| i["id"] == "i3").unwrap();
    assert!(i3.get("supplier").is_none());
}
