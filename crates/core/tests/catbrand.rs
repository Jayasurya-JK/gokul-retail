mod common;
use common::*;
use gokul_core::{catalog, dispatch_session, Session};
use serde_json::{json, Value};

fn call(db: &gokul_core::db::Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}

fn q(c: &rusqlite::Connection, v: Value) -> Value {
    catalog::list_items_page(c, &serde_json::from_value(v).unwrap()).unwrap()
}

#[test]
fn items_page_filters_by_category_brand_search_and_counts_everything() {
    let (_d, db) = mini_db();
    db.with(|c| {
        assert_eq!(catalog::add_category(c, "Soaps")?["ok"], true);
        assert_eq!(catalog::add_brand(c, "RAMCARE")?["ok"], true);
        let all = q(c, json!({}));
        assert_eq!(all["total"], 3);
        assert_eq!(all["items"].as_array().unwrap().len(), 3);
        // paging: total always counts every match
        let p = q(c, json!({ "limit": 2, "offset": 2 }));
        assert_eq!(p["total"], 3);
        assert_eq!(p["items"].as_array().unwrap().len(), 1);
        // search by name, code and barcode
        assert_eq!(q(c, json!({ "search": "dish" }))["total"], 1);
        assert_eq!(q(c, json!({ "search": "102" }))["total"], 1);
        assert_eq!(q(c, json!({ "search": "8904000000035" }))["items"][0]["id"], "i3");
        assert_eq!(q(c, json!({ "search": "%" }))["total"], 0, "wildcards are literal");
        // bulk set brand then category, filters AND together
        let brands = catalog::list_brands(c)?;
        let ram = brands.iter().find(|b| b["name"] == "RAMCARE").unwrap()["id"].as_str().unwrap().to_string();
        let soaps = catalog::list_categories_with_counts(c)?.into_iter().find(|x| x["name"] == "Soaps").unwrap()["id"].as_str().unwrap().to_string();
        catalog::set_items_brand(c, &["i3".into(), "i1".into()], &ram)?;
        assert_eq!(q(c, json!({ "brandId": ram }))["total"], 2);
        catalog::set_items_category(c, &["i3".into()], &soaps)?;
        let both = q(c, json!({ "brandId": ram, "categoryId": soaps }));
        assert_eq!(both["total"], 1);
        assert_eq!(both["items"][0]["name"], "Dish Wash Bar");
        assert_eq!(q(c, json!({ "categoryId": soaps, "search": "groundnut" }))["total"], 0);
        assert_eq!(q(c, json!({ "brandId": "br9999" }))["total"], 0, "unknown brand matches nothing");
        // counts follow the move
        assert_eq!(catalog::list_brands(c)?.iter().find(|b| b["name"] == "RAMCARE").unwrap()["items"], 2);
        assert_eq!(catalog::list_brands(c)?.iter().find(|b| b["name"] == "Gokul").unwrap()["items"], 1);
        // status filter and a bad brand
        catalog::set_items_active(c, &["i2".into()], false)?;
        assert_eq!(q(c, json!({ "status": "inactive" }))["total"], 1);
        assert_eq!(q(c, json!({ "status": "active" }))["total"], 2);
        assert!(catalog::set_items_brand(c, &["i1".into()], "br9999").is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn bulk_set_brand_is_owner_or_manager_only() {
    let (_d, db) = mini_db();
    let cashier = Session::pos();
    assert!(!call(&db, &cashier, "verifyPin", json!(["u3", "1234"])).unwrap().is_null());
    let r = call(&db, &cashier, "setItemsBrand", json!([["i1"], "br1"]));
    assert!(r.unwrap_err().to_lowercase().contains("permission"));
    let owner = Session::office();
    assert!(!call(&db, &owner, "verifyPin", json!(["u1", "1111"])).unwrap().is_null());
    call(&db, &owner, "listBrands", json!([])).unwrap();
    let brands = call(&db, &owner, "listBrands", json!([])).unwrap();
    let id = brands[0]["id"].as_str().unwrap().to_string();
    call(&db, &owner, "setItemsBrand", json!([["i1"], id])).unwrap();
    let page = call(&db, &owner, "listItemsPage", json!([{ "limit": 10 }])).unwrap();
    assert_eq!(page["total"], 3);
}
