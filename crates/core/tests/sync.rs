//! Cloud sync, shop side: outbox triggers, batch contents, retry, lock, enqueue coverage and one cycle.
//! No network: the transport is a recording fake.

use chrono::{Duration as ChronoDuration, Utc};
use gokul_core::db::{migrate, migrate_up_to};
use gokul_core::sync::outbox::{self, apply_result, build_batch, enqueue_all, pending_count};
use gokul_core::sync::worker::{run_cycle, RecordingTransport};
use gokul_core::sync::{self, backoff_secs, SyncConfigInput, SYNCED_TABLES};
use gokul_core::Db;
use rusqlite::Connection;
use serde_json::Value;

fn mem() -> Connection {
    let mut c = Connection::open_in_memory().unwrap();
    migrate(&mut c).unwrap();
    c
}

/// A demo shop with cloud sync switched on (triggers record only while it is on).
fn temp_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    gokul_core::seed_demo_if_empty(&db).unwrap();
    db.with(|c| {
        set(c, "sync.enabled", "1");
        Ok(())
    })
    .unwrap();
    (dir, db)
}

/// Demo shop with sync off: nothing is recorded.
fn temp_db_sync_off() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("gokul.db")).unwrap();
    gokul_core::seed_demo_if_empty(&db).unwrap();
    (dir, db)
}

fn clear_outbox(c: &Connection) {
    c.execute("DELETE FROM sync_outbox", []).unwrap();
}

fn outbox_rows(c: &Connection) -> Vec<(String, String, String)> {
    let mut st = c.prepare("SELECT tbl, row_key, op FROM sync_outbox ORDER BY id").unwrap();
    st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().map(|x| x.unwrap()).collect()
}

fn set(c: &Connection, key: &str, value: &str) {
    c.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value]).unwrap();
}

/// Copies one existing row with a new primary key (and unique text columns), inside a temp table.
fn clone_item(c: &Connection, new_id: &str, new_code: &str) {
    c.execute_batch(&format!(
        "DROP TABLE IF EXISTS temp.cl; CREATE TEMP TABLE cl AS SELECT * FROM items ORDER BY id LIMIT 1;
         UPDATE temp.cl SET id = '{new_id}', code = '{new_code}';
         INSERT INTO items SELECT * FROM temp.cl;"
    ))
    .unwrap();
}

fn clone_bill(c: &Connection, new_id: i64) {
    c.execute_batch(&format!(
        "DROP TABLE IF EXISTS temp.cb; CREATE TEMP TABLE cb AS SELECT * FROM bills ORDER BY id LIMIT 1;
         UPDATE temp.cb SET id = {new_id}, number = 'TST-99-{new_id:06}', seq = {new_id};
         INSERT INTO bills SELECT * FROM temp.cb;"
    ))
    .unwrap();
}

#[test]
fn triggers_queue_item_insert_update_and_delete() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        clone_item(c, "sync-test-item", "SYNC-T-1");
        assert_eq!(outbox_rows(c), vec![("items".into(), r#"{"id":"sync-test-item"}"#.into(), "up".into())]);
        clear_outbox(c);
        c.execute("UPDATE items SET name = 'Renamed for sync test' WHERE id = 'sync-test-item'", []).unwrap();
        assert_eq!(outbox_rows(c).len(), 1);
        clear_outbox(c);
        c.execute("DELETE FROM items WHERE id = 'sync-test-item'", []).unwrap();
        assert_eq!(outbox_rows(c), vec![("items".into(), r#"{"id":"sync-test-item"}"#.into(), "del".into())]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn triggers_queue_bill_insert_and_update_and_coalesce() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        clone_bill(c, 900_001);
        assert_eq!(outbox_rows(c), vec![("bills".into(), r#"{"id":900001}"#.into(), "up".into())]);
        // Three more changes to the same pending bill: still one pending row.
        for remark in ["a", "b", "c"] {
            c.execute("UPDATE bills SET remarks = ?1 WHERE id = 900001", [remark]).unwrap();
        }
        assert_eq!(outbox_rows(c).len(), 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn bills_cannot_be_deleted_so_no_delete_row_is_written() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        assert!(c.execute("DELETE FROM bills", []).is_err(), "append-only guard still works");
        assert_eq!(pending_count(c).unwrap(), 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn secrets_and_non_whitelisted_settings_never_reach_the_outbox() {
    let c = mem();
    set(&c, "sync.enabled", "1");
    set(&c, "sync.secret", "s3cret");
    set(&c, "sync.last_ok_at", "2026-11-18T10:00:00Z");
    set(&c, "security.voidLineNeedsPin", "1");
    set(&c, "loyalty.enabled", "1");
    set(&c, "bundle.backup", "{}");
    set(&c, "held_x", "1");
    assert_eq!(pending_count(&c).unwrap(), 0);
    set(&c, "shopName", "Gokul Oils");
    set(&c, "bundle.shop", "{}");
    assert_eq!(pending_count(&c).unwrap(), 2);
}

#[test]
fn users_pin_attempts_write_nothing_but_profile_changes_do() {
    let (_d, db) = temp_db();
    db.with(|c| {
        let uid: String = c.query_row("SELECT id FROM users LIMIT 1", [], |r| r.get(0)).unwrap();
        clear_outbox(c);
        c.execute("UPDATE users SET failed_pins = failed_pins + 1, locked_until = '2026-11-18T11:00:00Z' WHERE id = ?1", [&uid]).unwrap();
        assert_eq!(pending_count(c).unwrap(), 0, "a wrong PIN is not a sync change");
        c.execute("UPDATE users SET name = name WHERE id = ?1", [&uid]).unwrap();
        assert_eq!(pending_count(c).unwrap(), 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn batch_strips_pin_hash_lock_columns_and_non_whitelisted_settings() {
    let (_d, db) = temp_db();
    db.with(|c| {
        set(c, "sync.secret", "must-not-leave");
        set(c, "sync.lock", "x|2026-11-18T10:00:00Z");
        set(c, "security.voidLineNeedsPin", "1");
        set(c, "shopName", "Gokul Oils Test");
        clear_outbox(c);
        // Queue every synced row, then read the batches the way the worker does.
        let mut conn = Connection::open(db.path()).unwrap();
        enqueue_all(&mut conn, Utc::now()).unwrap();
        let mut bodies = Vec::new();
        while let Some(b) = build_batch(&mut conn, 500, &format!("b{}", bodies.len())).unwrap() {
            apply_result(&mut conn, &b.id, Ok(()), Utc::now()).unwrap();
            bodies.push(b.body);
        }
        assert!(!bodies.is_empty());
        let all = serde_json::to_string(&bodies).unwrap();
        for forbidden in ["pin_hash", "failed_pins", "locked_until", "must-not-leave", "sync.secret", "sync.lock", "security.", "held_bills", "backup_log", "sequences"] {
            assert!(!all.contains(forbidden), "{forbidden} was sent");
        }
        assert!(all.contains("shopName"), "the shop name setting is sent");
        // users rows carry exactly the whitelist.
        for b in &bodies {
            if let Some(users) = b["tables"].get("users") {
                for row in users["upsert"].as_array().unwrap() {
                    let mut keys: Vec<&str> = row.as_object().unwrap().keys().map(|s| s.as_str()).collect();
                    keys.sort();
                    assert_eq!(keys, vec!["active", "created_at", "id", "initials", "name", "role"]);
                }
            }
        }
        Ok(())
    })
    .unwrap();
}

#[test]
fn apply_result_deletes_only_the_sent_rows() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        clone_item(c, "sync-test-b", "SYNC-T-B");
        clone_item(c, "sync-test-c", "SYNC-T-C");
        let mut conn = Connection::open(db.path()).unwrap();
        let batch = build_batch(&mut conn, 500, "batch-1").unwrap().unwrap();
        assert_eq!(batch.row_ids.len(), 2);
        // A change to a row that is in flight gets its own outbox row (it is not coalesced into the sent one).
        conn.execute("UPDATE items SET name = 'changed while sending' WHERE id = 'sync-test-b'", []).unwrap();
        assert_eq!(pending_count(&conn).unwrap(), 3);
        apply_result(&mut conn, "batch-1", Ok(()), Utc::now()).unwrap();
        assert_eq!(outbox_rows(&conn), vec![("items".into(), r#"{"id":"sync-test-b"}"#.into(), "up".into())]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn failed_batch_stays_pending_with_backoff() {
    let mut c = mem();
    set(&c, "sync.enabled", "1");
    c.execute("INSERT INTO categories(id,name,sort) VALUES('zz','Test',1)", []).unwrap();
    let now = Utc::now();
    assert!(build_batch(&mut c, 500, "f1").unwrap().is_some());
    apply_result(&mut c, "f1", Err("The cloud answered with error 500.".into()), now).unwrap();
    assert_eq!(pending_count(&c).unwrap(), 1, "the failed rows are kept");
    let st = sync::status(&c).unwrap();
    assert_eq!(st.last_error.as_deref(), Some("The cloud answered with error 500."));
    // Not due for one minute, then due.
    assert!(!outbox::due(&c, now + ChronoDuration::seconds(30)).unwrap());
    assert!(outbox::due(&c, now + ChronoDuration::seconds(61)).unwrap());
    // Second failure waits two minutes.
    assert!(build_batch(&mut c, 500, "f2").unwrap().is_some());
    apply_result(&mut c, "f2", Err("again".into()), now).unwrap();
    assert!(!outbox::due(&c, now + ChronoDuration::seconds(61)).unwrap());
    assert!(outbox::due(&c, now + ChronoDuration::seconds(121)).unwrap());
}

#[test]
fn backoff_is_one_two_five_then_ten_minutes() {
    assert_eq!(backoff_secs(1), 60);
    assert_eq!(backoff_secs(2), 120);
    assert_eq!(backoff_secs(3), 300);
    assert_eq!(backoff_secs(4), 600);
    assert_eq!(backoff_secs(50), 600);
}

#[test]
fn lock_is_held_by_one_app_until_it_goes_stale() {
    let mut c = mem();
    let t0 = Utc::now();
    assert!(sync::try_lock(&mut c, "pos", t0).unwrap());
    assert!(!sync::try_lock(&mut c, "office", t0 + ChronoDuration::seconds(30)).unwrap(), "fresh lock blocks the other app");
    assert!(sync::heartbeat(&mut c, "pos", t0 + ChronoDuration::seconds(60)).unwrap());
    assert!(!sync::try_lock(&mut c, "office", t0 + ChronoDuration::seconds(150)).unwrap(), "heartbeat at 60 s is still fresh at 150 s");
    assert!(sync::try_lock(&mut c, "office", t0 + ChronoDuration::seconds(60 + 121)).unwrap(), "stale after 2 minutes");
    assert!(!sync::heartbeat(&mut c, "pos", t0 + ChronoDuration::seconds(200)).unwrap(), "the old holder lost it");
}

#[test]
fn enqueue_all_covers_every_synced_table_and_nothing_else() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        set(c, "sync.secret", "hidden");
        set(c, "security.voidLineNeedsPin", "1");
        let mut conn = Connection::open(db.path()).unwrap();
        enqueue_all(&mut conn, Utc::now()).unwrap();
        let rows = outbox_rows(&conn);
        for t in SYNCED_TABLES.iter().filter(|t| **t != "settings") {
            let in_table: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM \"{t}\""), [], |r| r.get(0)).unwrap();
            let queued = rows.iter().filter(|r| r.0 == *t).count() as i64;
            assert_eq!(queued, in_table, "table {t}");
        }
        assert!(rows.iter().all(|r| !["held_bills", "backup_log", "sequences", "sync_outbox"].contains(&r.0.as_str())));
        for r in rows.iter().filter(|r| r.0 == "settings") {
            let key: Value = serde_json::from_str(&r.1).unwrap();
            assert!(sync::settings_key_allowed(key["key"].as_str().unwrap()), "{} must not be queued", r.1);
        }
        assert!(rows.iter().any(|r| r.1.contains("shopName")), "allowed settings are queued");
        // Running it again queues nothing new (rows already pending).
        let before = pending_count(&conn).unwrap();
        assert_eq!(enqueue_all(&mut conn, Utc::now()).unwrap(), 0);
        assert_eq!(pending_count(&conn).unwrap(), before);
        Ok(())
    })
    .unwrap();
}

#[test]
fn upgrading_an_old_database_adds_the_outbox_and_triggers() {
    let mut c = Connection::open_in_memory().unwrap();
    migrate_up_to(&mut c, 19).unwrap();
    migrate(&mut c).unwrap();
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(v, 20);
    let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_%'", [], |r| r.get(0)).unwrap();
    assert!(n >= 3 * SYNCED_TABLES.len() as i64 - 4, "a trigger set per synced table, got {n}");
}

#[test]
fn set_config_validates_and_never_returns_the_secret() {
    let c = mem();
    set(&c, "sync.enabled", "0");
    let bad_url = SyncConfigInput { enabled: true, url: "http://x".into(), secret: Some("s".into()) };
    assert!(sync::set_config(&c, bad_url).is_err());
    let no_secret = SyncConfigInput { enabled: true, url: "https://x.example/functions/v1/sync".into(), secret: None };
    assert!(sync::set_config(&c, no_secret).is_err());
    let ok = SyncConfigInput { enabled: true, url: "https://x.example/functions/v1/sync".into(), secret: Some("top-secret".into()) };
    let st = sync::set_config(&c, ok).unwrap();
    assert!(st.enabled && st.has_secret);
    let json: Value = serde_json::to_value(&st).unwrap();
    assert!(!json.to_string().contains("top-secret"));
    assert_eq!(json["hasSecret"], true);
}

#[test]
fn a_cycle_sends_the_batches_and_clears_the_outbox() {
    let (_d, db) = temp_db();
    db.with(|c| {
        clear_outbox(c);
        clone_item(c, "sync-cycle-1", "SYNC-C-1");
        set(c, "sync.enabled", "1");
        set(c, "sync.url", "https://x.example/functions/v1/sync");
        set(c, "sync.secret", "top-secret");
        let mut conn = Connection::open(db.path()).unwrap();
        let t = RecordingTransport::ok();
        let report = run_cycle(&mut conn, &t, "pos", Utc::now(), true, 20).unwrap();
        assert_eq!(report.batches, 1);
        assert!(report.rows >= 1);
        assert_eq!(pending_count(&conn).unwrap(), 0);
        let sent = t.sent.lock().unwrap();
        assert!(sent[0]["tables"]["items"]["upsert"].as_array().unwrap().iter().any(|r| r["id"] == "sync-cycle-1"));
        assert!(sent[0].to_string().find("top-secret").is_none());
        assert!(sync::status(&conn).unwrap().last_ok_at.is_some());
        Ok(())
    })
    .unwrap();
}

#[test]
fn nothing_is_recorded_or_sent_while_sync_is_off() {
    let (_d, db) = temp_db_sync_off();
    db.with(|c| {
        clear_outbox(c);
        clone_item(c, "sync-off-1", "SYNC-O-1");
        assert_eq!(pending_count(c).unwrap(), 0, "triggers record nothing while sync is off");
        set(c, "sync.enabled", "1");
        clone_item(c, "sync-off-2", "SYNC-O-2");
        set(c, "sync.enabled", "0");
        let mut conn = Connection::open(db.path()).unwrap();
        let t = RecordingTransport::ok();
        let report = run_cycle(&mut conn, &t, "pos", Utc::now(), true, 20).unwrap();
        assert!(report.idle);
        assert!(t.sent.lock().unwrap().is_empty());
        assert!(pending_count(&conn).unwrap() > 0, "nothing is sent or deleted");
        assert!(run_cycle(&mut conn, &t, "pos", Utc::now(), true, 20).unwrap().idle);
        Ok(())
    })
    .unwrap();
}
