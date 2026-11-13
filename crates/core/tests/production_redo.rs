//! Production redo: migration 014 is additive (old manual mill-sheet drafts stay readable) and new batches stamp the seed price.
mod common;
use chrono::Local;
use gokul_core::db::{iso, post_movement, Db};
use gokul_core::{godown, mill, purchasing};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn de<T: DeserializeOwned>(v: Value) -> T {
    serde_json::from_value(v).expect("bad test json")
}

const OLD: [&str; 13] = [
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_office.sql"),
    include_str!("../migrations/003_security.sql"),
    include_str!("../migrations/004_money_mill.sql"),
    include_str!("../migrations/005_loyalty_credit.sql"),
    include_str!("../migrations/006_points_hundredths.sql"),
    include_str!("../migrations/007_shelf_life.sql"),
    include_str!("../migrations/008_pos_parallel.sql"),
    include_str!("../migrations/009_points_module.sql"),
    include_str!("../migrations/010_points_lots.sql"),
    include_str!("../migrations/011_customer_active.sql"),
    include_str!("../migrations/012_exchange_refund.sql"),
    include_str!("../migrations/013_godown.sql"),
];

/// A database exactly as the owner has it today: schema 13, two manual mill-sheet drafts and one pressing batch.
fn live_like_v13(path: &std::path::Path) {
    let conn = rusqlite::Connection::open(path).unwrap();
    for sql in OLD {
        conn.execute_batch(sql).unwrap();
    }
    conn.execute_batch("PRAGMA user_version = 13").unwrap();
    for day in ["2026-11-07", "2026-11-12"] {
        conn.execute(
            "INSERT INTO mill_sheets(day,status,supervisor,note,physical_json,created_at,updated_at) VALUES(?1,'draft','Ravi','test draft','{}','2026-11-12T10:00:00Z','2026-11-12T10:00:00Z')",
            [day],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO mill_op_rows(day,operator,seed,machine,seed_g,oil_ml,cake_g,jaggery_g) VALUES(?1,'Murugesan','groundnut','W',100000,38000,60000,0)",
            [day],
        )
        .unwrap();
    }
    conn.execute(
        "INSERT INTO pressing_batches(number,series,fy,seq,at,day,seed,seed_g,oil_raw_ml,cake_g,settle_ready_on,norm_kg_per_l,norm_density,machine)
         VALUES('PB-OLD','PB','2026-27',1,'2026-11-07T10:00:00Z','2026-11-07','groundnut',50000,20000,30000,'2026-11-11T10:00:00Z','2.5','0.91','W')",
        [],
    )
    .unwrap();
}

#[test]
fn migration_14_keeps_old_manual_drafts_readable_and_changes_nothing_else() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gokul.db");
    live_like_v13(&path);
    let db = Db::open(&path).unwrap();
    db.with(|c| {
        assert_eq!(c.query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))?, gokul_core::db::latest_version());
        assert!(gokul_core::db::latest_version() >= 14);
        for day in ["2026-11-07", "2026-11-12"] {
            let s = mill::get_sheet(c, day)?;
            assert_eq!(s["status"], "draft", "{day} is still a draft");
            assert_eq!(s["supervisor"], "Ravi");
            assert_eq!(s["opRows"].as_array().unwrap().len(), 1, "{day} keeps its operator row");
        }
        assert_eq!(mill::list_sheets(c, 40)?.len(), 2);
        let imported: i64 = c.query_row("SELECT COUNT(*) FROM mill_op_rows WHERE imported=0", [], |r| r.get(0))?;
        assert_eq!(imported, 2, "no row is marked as imported by the migration");
        // the old batch is untouched and has no cost stamp
        let b = purchasing::list_pressing_batches(c)?;
        assert_eq!(b.len(), 1);
        assert!(b[0]["seedCostPerKg"].is_null());
        assert_eq!(b[0]["source"], "entry");
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_new_batch_stamps_the_seed_price() {
    let (_d, db) = common::mini_db();
    db.with(|c| {
        post_movement(c, &iso(Local::now()), "rm-gn", "purchase", 500_000, "test", "1", "seed", "Test")?;
        c.execute("UPDATE items SET cost=9800 WHERE id='rm-gn'", [])?;
        godown::add_godown_barrels(c, &de(json!({ "oil": "groundnut", "count": 1 })))?;
        let b = purchasing::create_pressing_batch(
            c,
            &de(json!({ "seed": "groundnut", "seedKg": 100_000, "oilRawL": 40_000, "cakeKg": 55_000, "godownBarrelId": "GB-001", "operator": "Selvam" })),
        )?;
        assert_eq!(b["seedCostPerKg"], 9800);
        assert_eq!(b["jaggeryCost"], 0);
        Ok(())
    })
    .unwrap();
}
