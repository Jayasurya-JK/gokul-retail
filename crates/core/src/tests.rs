//! Spec 00 step 2 acceptance tests: migrations, reopen, ledger immutability, balances.

use crate::stock::{balance, ledger_sum};
use crate::testutil::{Lcg, TempDir};
use crate::{migrations, post_stock, Db, Error, Movement, Reason};
use rusqlite::Connection;

fn add_item(db: &Db, code: &str) -> i64 {
    db.conn()
        .execute(
            "INSERT INTO items (code, name, kind, base_unit) VALUES (?1, ?2, 'packed', 'ml')",
            [code, code],
        )
        .expect("insert item");
    db.conn().last_insert_rowid()
}

fn ledger_count(db: &Db) -> i64 {
    db.conn()
        .query_row("SELECT COUNT(*) FROM stock_ledger", [], |r| r.get(0))
        .expect("count")
}

fn post(db: &mut Db, movements: &[Movement]) -> crate::Result<()> {
    let tx = db.transaction()?;
    post_stock(&tx, movements)?;
    tx.commit()?;
    Ok(())
}

#[test]
fn migrates_from_empty() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    assert_eq!(
        db.schema_version().expect("version"),
        migrations::latest_version()
    );
    for table in [
        "settings",
        "users",
        "audit_log",
        "items",
        "stock_ledger",
        "stock_balance",
        "drafts",
        "schema_version",
    ] {
        let n: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
                |r| r.get(0),
            )
            .expect("query");
        assert_eq!(n, 1, "table {table} missing");
    }
}

#[test]
fn sets_required_pragmas() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    let c = db.conn();
    let mode: String = c
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .expect("jm");
    let sync: i64 = c
        .query_row("PRAGMA synchronous", [], |r| r.get(0))
        .expect("sync");
    let fk: i64 = c
        .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
        .expect("fk");
    let busy: i64 = c
        .query_row("PRAGMA busy_timeout", [], |r| r.get(0))
        .expect("busy");
    assert_eq!(mode, "wal");
    assert_eq!(sync, 1, "NORMAL");
    assert_eq!(fk, 1);
    assert_eq!(busy, 5000);
}

#[test]
fn reopens_existing_db_keeping_data() {
    let dir = TempDir::new();
    let item;
    {
        let mut db = Db::open(&dir.db_path()).expect("open");
        item = add_item(&db, "OIL-1L");
        post(&mut db, &[Movement::new(item, 1000, Reason::Purchase)]).expect("post");
    }
    let db = Db::open(&dir.db_path()).expect("reopen");
    assert_eq!(
        db.schema_version().expect("v"),
        migrations::latest_version()
    );
    assert_eq!(balance(db.conn(), item).expect("bal"), 1000);
    let applied: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM schema_version", [], |r| r.get(0))
        .expect("count");
    assert_eq!(
        applied,
        migrations::MIGRATIONS.len() as i64,
        "no migration re-applied"
    );
}

#[test]
fn ledger_update_and_delete_are_rejected() {
    let dir = TempDir::new();
    let mut db = Db::open(&dir.db_path()).expect("open");
    let item = add_item(&db, "A");
    post(&mut db, &[Movement::new(item, 500, Reason::Purchase)]).expect("post");

    let upd = db
        .conn()
        .execute("UPDATE stock_ledger SET qty_base = 1", []);
    assert!(upd.is_err());
    assert!(upd.unwrap_err().to_string().contains("insert-only"));

    let del = db.conn().execute("DELETE FROM stock_ledger", []);
    assert!(del.is_err());
    assert!(del.unwrap_err().to_string().contains("insert-only"));

    assert_eq!(ledger_count(&db), 1);
    assert_eq!(ledger_sum(db.conn(), item).expect("sum"), 500);
}

#[test]
fn balance_equals_ledger_sum_after_random_movements() {
    let dir = TempDir::new();
    let mut db = Db::open(&dir.db_path()).expect("open");
    let items: Vec<i64> = (0..6).map(|i| add_item(&db, &format!("I{i}"))).collect();
    let reasons = [
        Reason::Sale,
        Reason::Purchase,
        Reason::Return,
        Reason::Repack,
        Reason::Wastage,
        Reason::Adjustment,
    ];
    let mut rng = Lcg(42);
    for _ in 0..300 {
        let n = (rng.next() % 5 + 1) as usize;
        let batch: Vec<Movement> = (0..n)
            .map(|_| {
                let item = items[(rng.next() % items.len() as u64) as usize];
                let mut qty = (rng.next() % 5000) as i64 - 2500;
                if qty == 0 {
                    qty = 1;
                }
                let reason = reasons[(rng.next() % reasons.len() as u64) as usize];
                Movement::new(item, qty, reason)
            })
            .collect();
        post(&mut db, &batch).expect("post");
    }
    for &item in &items {
        assert_eq!(
            balance(db.conn(), item).expect("bal"),
            ledger_sum(db.conn(), item).expect("sum"),
            "cache differs from ledger for item {item}"
        );
    }

    // Corrupt the cache, then rebuild must restore it exactly.
    let before: Vec<i64> = items
        .iter()
        .map(|&i| balance(db.conn(), i).expect("b"))
        .collect();
    db.conn()
        .execute("UPDATE stock_balance SET qty_base = qty_base + 7", [])
        .expect("corrupt");
    db.conn()
        .execute("DELETE FROM stock_balance WHERE item_id = ?1", [items[0]])
        .expect("delete");
    db.rebuild_balances().expect("rebuild");
    let after: Vec<i64> = items
        .iter()
        .map(|&i| balance(db.conn(), i).expect("b"))
        .collect();
    assert_eq!(before, after);
}

#[test]
fn refuses_database_newer_than_app() {
    let dir = TempDir::new();
    {
        let _db = Db::open(&dir.db_path()).expect("open");
    }
    {
        let conn = Connection::open(dir.db_path()).expect("raw open");
        conn.execute("INSERT INTO schema_version (version) VALUES (999)", [])
            .expect("bump");
    }
    let err = Db::open(&dir.db_path()).err().expect("must refuse");
    match err {
        Error::DatabaseNewerThanApp { db, app } => {
            assert_eq!(db, 999);
            assert_eq!(app, migrations::latest_version());
        }
        other => panic!("wrong error: {other}"),
    }
    assert!(Error::DatabaseNewerThanApp { db: 999, app: 1 }
        .user_message()
        .contains("newer version"));
    // Data untouched: still version 999, nothing re-migrated.
    let conn = Connection::open(dir.db_path()).expect("raw open");
    assert_eq!(migrations::current_version(&conn).expect("v"), 999);
}

#[test]
fn post_stock_is_atomic_one_bad_movement_writes_nothing() {
    let dir = TempDir::new();
    let mut db = Db::open(&dir.db_path()).expect("open");
    let a = add_item(&db, "A");
    let b = add_item(&db, "B");
    post(&mut db, &[Movement::new(a, 100, Reason::Purchase)]).expect("seed");

    // Unknown item in the third slot: the first two must not survive.
    let tx = db.transaction().expect("tx");
    let result = post_stock(
        &tx,
        &[
            Movement::new(a, 50, Reason::Purchase),
            Movement::new(b, -20, Reason::Sale),
            Movement::new(9999, 5, Reason::Purchase),
        ],
    );
    assert!(matches!(result, Err(Error::UnknownItem(9999))));
    // Even if the caller wrongly commits after the error, nothing from the batch is there.
    tx.commit().expect("commit");
    assert_eq!(ledger_count(&db), 1);
    assert_eq!(balance(db.conn(), a).expect("a"), 100);
    assert_eq!(balance(db.conn(), b).expect("b"), 0);

    // Zero quantity is rejected the same way.
    let tx = db.transaction().expect("tx");
    let result = post_stock(
        &tx,
        &[
            Movement::new(a, 10, Reason::Purchase),
            Movement::new(b, 0, Reason::Adjustment),
        ],
    );
    assert!(matches!(result, Err(Error::InvalidMovement(_))));
    tx.commit().expect("commit");
    assert_eq!(ledger_count(&db), 1);
    assert_eq!(balance(db.conn(), a).expect("a"), 100);
}

#[test]
fn post_stock_rejects_overflow_and_keeps_data() {
    let dir = TempDir::new();
    let mut db = Db::open(&dir.db_path()).expect("open");
    let a = add_item(&db, "A");
    post(&mut db, &[Movement::new(a, i64::MAX - 1, Reason::Purchase)]).expect("seed");
    let err = post(&mut db, &[Movement::new(a, 5, Reason::Purchase)]).err();
    assert!(matches!(err, Some(Error::QuantityOverflow(_))));
    assert_eq!(balance(db.conn(), a).expect("a"), i64::MAX - 1);
    assert_eq!(ledger_count(&db), 1);
}

#[test]
fn ledger_rows_keep_reference_user_and_note() {
    let dir = TempDir::new();
    let mut db = Db::open(&dir.db_path()).expect("open");
    let a = add_item(&db, "A");
    db.conn()
        .execute(
            "INSERT INTO users (name, role, pin_hash) VALUES ('Owner', 'owner', 'x')",
            [],
        )
        .expect("user");
    let uid = db.conn().last_insert_rowid();
    post(
        &mut db,
        &[Movement::new(a, -250, Reason::Sale)
            .with_ref("bill", 77)
            .with_user(uid)
            .with_note("test")],
    )
    .expect("post");
    let (reason, rt, rid, u, note): (String, String, i64, i64, String) = db
        .conn()
        .query_row(
            "SELECT reason, ref_type, ref_id, user_id, note FROM stock_ledger",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .expect("row");
    assert_eq!(
        (reason.as_str(), rt.as_str(), rid, u, note.as_str()),
        ("sale", "bill", 77, uid, "test")
    );
}

#[test]
fn unique_item_code_and_foreign_keys_enforced() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    add_item(&db, "DUP");
    let dup = db.conn().execute(
        "INSERT INTO items (code, name, kind, base_unit) VALUES ('DUP', 'x', 'packed', 'ml')",
        [],
    );
    assert!(dup.is_err());
    let bad_fk = db.conn().execute(
        "INSERT INTO stock_ledger (item_id, qty_base, reason) VALUES (424242, 1, 'sale')",
        [],
    );
    assert!(bad_fk.is_err());
}

#[test]
fn item_code_is_unique_ignoring_case() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    add_item(&db, "OIL-1L");
    let dup = db.conn().execute(
        "INSERT INTO items (code, name, kind, base_unit) VALUES ('oil-1l', 'x', 'packed', 'ml')",
        [],
    );
    assert!(dup.is_err());
}

#[test]
fn empty_barcode_is_rejected_but_null_is_allowed() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    let empty = db.conn().execute(
        "INSERT INTO items (code, barcode, name, kind, base_unit) VALUES ('E1', '', 'x', 'packed', 'ml')",
        [],
    );
    assert!(empty.is_err());
    for code in ["N1", "N2"] {
        db.conn()
            .execute(
                "INSERT INTO items (code, barcode, name, kind, base_unit) VALUES (?1, NULL, 'x', 'packed', 'ml')",
                [code],
            )
            .expect("two NULL barcodes are fine");
    }
}

fn plan(db: &Db, sql: &str) -> String {
    let mut stmt = db
        .conn()
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .expect("prepare");
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(3))
        .expect("plan")
        .map(|r| r.expect("row"))
        .collect();
    rows.join(" | ")
}

#[test]
fn name_prefix_search_and_ledger_by_item_date_use_indexes() {
    let dir = TempDir::new();
    let db = Db::open(&dir.db_path()).expect("open");
    let p = plan(&db, "SELECT id FROM items WHERE name LIKE 'gold%'");
    assert!(p.contains("idx_items_name"), "plan was: {p}");
    let p = plan(
        &db,
        "SELECT qty_base FROM stock_ledger WHERE item_id = 1 AND created_at >= '2026-01-01' AND created_at < '2027-01-01'",
    );
    assert!(p.contains("idx_stock_ledger_item"), "plan was: {p}");
    assert!(p.contains("created_at"), "plan was: {p}");
}
