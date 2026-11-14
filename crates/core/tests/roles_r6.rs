mod common;
use gokul_core::authz::Session;
use gokul_core::dispatch_session;
use gokul_core::store::hash_pin;
use rusqlite::params;
use serde_json::json;

fn add_user(db: &gokul_core::Db, id: &str, name: &str, role: &str, pin: &str) {
    db.with(|c| {
        c.execute(
            "INSERT INTO users(id,name,role,initials,color,pin_hash,created_at) VALUES(?1,?2,?3,'XX','#000',?4,'2026-11-01T00:00:00.000Z')",
            params![id, name, role, hash_pin(pin).unwrap()],
        )?;
        Ok(())
    })
    .unwrap();
}

#[test]
fn admin_and_staff_roles_exist_with_the_right_permissions() {
    let (_d, db) = common::mini_db();
    add_user(&db, "u8", "Jai", "admin", "8888");
    add_user(&db, "u9", "Prevena", "staff", "9999");
    let roles = gokul_core::dispatch(&db, "listRoles", vec![]).unwrap();
    let find = |id: &str| roles.as_array().unwrap().iter().find(|r| r["id"] == id).cloned().unwrap();
    let (admin, staff, owner, mgr) = (find("admin"), find("staff"), find("owner"), find("manager"));
    assert_eq!(admin["name"], "Admin");
    assert!(admin["perms"].as_object().unwrap().values().all(|v| v == true));
    assert_eq!(admin["discountLimitPct"], 100);
    assert_eq!(owner["perms"]["canEditRecords"], true);
    assert_eq!(mgr["perms"]["canEditRecords"], false);
    assert_eq!(staff["perms"]["canEditRecords"], false);
    assert_eq!(staff["perms"]["canManageStock"], true);
    assert_eq!(staff["perms"]["canCancelBill"], false);
}

#[test]
fn staff_can_enter_but_not_change_saved_records() {
    let (_d, db) = common::mini_db();
    add_user(&db, "u9", "Prevena", "staff", "9999");
    add_user(&db, "u8", "Jai", "admin", "8888");
    let s = Session::office();
    assert!(dispatch_session(&db, &s, "verifyPin", vec![json!("u9"), json!("9999")]).unwrap().is_object());
    let e = dispatch_session(&db, &s, "editPressingBatch", vec![json!({ "id": "pb1" })]).unwrap_err().to_string();
    assert!(e.contains("Only the owner or admin can change saved records."), "{e}");
    let e = dispatch_session(&db, &s, "deletePressingBatch", vec![json!({ "id": "pb1" })]).unwrap_err().to_string();
    assert!(e.contains("Only the owner or admin can change saved records."), "{e}");
    // the admin passes the permission check (then fails on the missing batch)
    assert!(dispatch_session(&db, &s, "verifyPin", vec![json!("u8"), json!("8888")]).unwrap().is_object());
    let e = dispatch_session(&db, &s, "deletePressingBatch", vec![json!({ "id": "pb1" })]).unwrap_err().to_string();
    assert!(!e.contains("Only the owner"), "{e}");
}

#[test]
fn schema_change_keeps_the_database_sound_and_users_accept_new_roles() {
    let (_d, db) = common::mini_db();
    add_user(&db, "u8", "Jai", "admin", "8888");
    let r: String = db.with(|c| Ok(c.query_row("PRAGMA integrity_check", [], |r| r.get(0))?)).unwrap();
    assert_eq!(r, "ok");
    assert!(db.with(|c| Ok(c.execute("INSERT INTO users(id,name,role,initials,color,pin_hash,created_at) VALUES('x','X','boss','X','#0','h','t')", []).is_err())).unwrap());
}
