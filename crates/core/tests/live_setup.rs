//! The one-time live setup (examples/r6_live_setup.rs runs `live_setup::run`). Dummy PINs only.
use gokul_core::db::Db;
use gokul_core::live_setup::{run, Options};
use rusqlite::Connection;
use std::collections::BTreeMap;

fn opts(dry_run: bool) -> Options {
    Options { owner_pin: "1357".into(), admin_pin: "2468".into(), staff_pin: "9753".into(), dry_run }
}

fn n(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn production_moves_sql() -> &'static str {
    "ref_type IN ('pressing','godown_transfer','pack_run','mill_job','mill_sheet')
     OR (kind='adjustment' AND ref_type='adjustment' AND CAST(ref_id AS INTEGER) IN (SELECT id FROM stock_adjustments WHERE note LIKE 'Mill sheet %'))"
}

fn stock_by_item(c: &Connection) -> BTreeMap<String, i64> {
    let mut st = c.prepare("SELECT id, stock FROM items").unwrap();
    st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).unwrap().map(|r| r.unwrap()).collect()
}

fn triggers(c: &Connection) -> BTreeMap<String, String> {
    let mut st = c.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").unwrap();
    st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).unwrap().map(|r| r.unwrap()).collect()
}

fn demo_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    assert!(gokul_core::seed_demo_if_empty(&db).unwrap());
    (dir, db)
}

#[test]
fn setup_creates_the_real_users_clears_production_and_keeps_the_rest() {
    let (_d, db) = demo_db();
    db.with(|c| {
        // before
        assert!(n(c, "SELECT COUNT(*) FROM pressing_batches") > 0 && n(c, "SELECT COUNT(*) FROM pack_runs") > 0 && n(c, "SELECT COUNT(*) FROM mill_sheets") > 0);
        let before_stock = stock_by_item(c);
        let mut expected = before_stock.clone();
        {
            let mut st = c.prepare(&format!("SELECT item_id, SUM(qty) FROM stock_movements WHERE {} GROUP BY item_id", production_moves_sql())).unwrap();
            for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).unwrap() {
                let (item, sum) = r.unwrap();
                *expected.get_mut(&item).unwrap() -= sum;
            }
        }
        let (bills, purchases, customers, suppliers, items, points) = (
            n(c, "SELECT COUNT(*) FROM bills"), n(c, "SELECT COUNT(*) FROM purchases"), n(c, "SELECT COUNT(*) FROM customers"),
            n(c, "SELECT COUNT(*) FROM suppliers"), n(c, "SELECT COUNT(*) FROM items"), n(c, "SELECT COUNT(*) FROM points_ledger"),
        );
        let settings_before: i64 = n(c, "SELECT COUNT(*) FROM settings WHERE key <> 'bundle.mill'");
        let trig_before = triggers(c);
        assert!(trig_before.len() > 20);

        let rep = run(c, &opts(false)).unwrap();

        // users
        let user = |name: &str| -> (String, i64) { c.query_row("SELECT role, active FROM users WHERE name=?1", [name], |r| Ok((r.get(0)?, r.get(1)?))).unwrap() };
        assert_eq!(user("Gokul"), ("owner".into(), 1));
        assert_eq!(user("Jai"), ("admin".into(), 1));
        assert_eq!(user("Prevena"), ("staff".into(), 1));
        assert_eq!(user("Monisha"), ("staff".into(), 1));
        for demo in ["Suresh Kumar", "Lakshmi Rajan", "Karthik Murugan", "Divya Selvam", "Ramesh Pandian"] {
            assert_eq!(user(demo).1, 0, "{demo} is deactivated, not deleted");
        }
        let hash = |name: &str| -> String { c.query_row("SELECT pin_hash FROM users WHERE name=?1", [name], |r| r.get(0)).unwrap() };
        assert!(gokul_core::store::check_pin("1357", &hash("Gokul")));
        assert!(gokul_core::store::check_pin("2468", &hash("Jai")));
        assert!(gokul_core::store::check_pin("9753", &hash("Prevena")) && gokul_core::store::check_pin("9753", &hash("Monisha")));
        assert!(!hash("Gokul").contains("1357"));
        // salesmen
        assert_eq!(n(c, "SELECT COUNT(*) FROM staff WHERE active=1 AND name IN ('Gokul','Jai','Prevena','Monisha')"), 4);
        assert_eq!(n(c, "SELECT COUNT(*) FROM staff WHERE active=1 AND name IN ('Suresh Kumar','Lakshmi Rajan','Karthik Murugan','Divya Selvam','Ramesh Pandian')"), 0);
        // operators
        let ops = gokul_core::mill::mill_settings(c).operators;
        assert_eq!(ops, vec!["Ambethkar".to_string()]);
        assert_eq!(rep.operators, ops);

        // everything production is gone
        for t in [
            "pressing_batches", "godown_barrels", "godown_movements", "godown_readings", "godown_purchases", "godown_transfers", "pack_runs", "pack_run_lines",
            "mill_sheets", "mill_op_rows", "mill_punnaku_rows", "mill_cust_jobs",
        ] {
            assert_eq!(n(c, &format!("SELECT COUNT(*) FROM {t}")), 0, "{t}");
        }
        assert_eq!(n(c, &format!("SELECT COUNT(*) FROM stock_movements WHERE {}", production_moves_sql())), 0);
        assert_eq!(n(c, "SELECT COALESCE(SUM(last_seq),0) FROM sequences WHERE series IN ('PB','PK','GP','GT')"), 0);
        // stock reversed exactly, and the ledger still adds up to the cached stock for every item
        assert_eq!(stock_by_item(c), expected);
        let mismatches = n(c, "SELECT COUNT(*) FROM items i WHERE i.stock <> COALESCE((SELECT SUM(qty) FROM stock_movements m WHERE m.item_id=i.id),0)");
        assert_eq!(mismatches, 0, "items.stock equals the ledger");
        assert!(!rep.stock_changes.is_empty());
        // untouched
        assert_eq!((n(c, "SELECT COUNT(*) FROM bills"), n(c, "SELECT COUNT(*) FROM purchases"), n(c, "SELECT COUNT(*) FROM customers"), n(c, "SELECT COUNT(*) FROM suppliers"), n(c, "SELECT COUNT(*) FROM items"), n(c, "SELECT COUNT(*) FROM points_ledger")), (bills, purchases, customers, suppliers, items, points));
        assert_eq!(n(c, "SELECT COUNT(*) FROM settings WHERE key <> 'bundle.mill'"), settings_before);
        // the append-only triggers are back, byte for byte
        assert_eq!(triggers(c), trig_before);
        assert!(c.execute("DELETE FROM stock_movements", []).is_err());
        assert!(c.execute("DELETE FROM pressing_batches", []).is_err() || n(c, "SELECT COUNT(*) FROM pressing_batches") == 0);
        assert_eq!(rep.integrity, "ok");
        assert_eq!(rep.triggers_restored > 0, true);
        Ok(())
    })
    .unwrap();
}

#[test]
fn dry_run_changes_nothing_and_a_second_run_updates_instead_of_duplicating() {
    let (_d, db) = demo_db();
    db.with(|c| {
        let users = n(c, "SELECT COUNT(*) FROM users");
        let batches = n(c, "SELECT COUNT(*) FROM pressing_batches");
        let stock = stock_by_item(c);
        let rep = run(c, &opts(true)).unwrap();
        assert!(rep.dry_run && rep.removed.iter().any(|(t, k)| t == "pressing_batches" && *k == batches));
        assert_eq!((n(c, "SELECT COUNT(*) FROM users"), n(c, "SELECT COUNT(*) FROM pressing_batches")), (users, batches));
        assert_eq!(stock_by_item(c), stock);
        run(c, &opts(false)).unwrap();
        let after = n(c, "SELECT COUNT(*) FROM users");
        assert_eq!(after, users + 4);
        run(c, &opts(false)).unwrap();
        assert_eq!(n(c, "SELECT COUNT(*) FROM users"), after, "existing names are updated, not duplicated");
        Ok(())
    })
    .unwrap();
}

#[test]
fn it_refuses_bad_pins_and_a_locked_database() {
    let (d, db) = demo_db();
    db.with(|c| {
        assert!(run(c, &Options { owner_pin: "12".into(), ..opts(false) }).is_err());
        // another connection holds the database
        let other = Connection::open(d.path().join("gokul.db")).unwrap();
        other.execute_batch("BEGIN IMMEDIATE").unwrap();
        let e = run(c, &opts(false)).unwrap_err().to_string();
        assert!(e.contains("locked") || e.contains("in use"), "{e}");
        other.execute_batch("ROLLBACK").unwrap();
        assert!(run(c, &opts(true)).is_ok());
        Ok(())
    })
    .unwrap();
}
