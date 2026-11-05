//! Numbered SQL migrations embedded in the binary.
//! Never edit an existing migration; add a new numbered file and list it here.

use crate::error::{Error, Result};
use rusqlite::{Connection, TransactionBehavior};

/// (version, SQL). Versions must be 1, 2, 3 ... with no gaps.
pub const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("../migrations/001_init.sql"))];

/// Highest schema version this build understands.
pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0)
}

fn ensure_version_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
             version    INTEGER PRIMARY KEY,
             applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         );",
    )?;
    Ok(())
}

/// Current schema version stored in the database (0 if none applied).
pub fn current_version(conn: &Connection) -> Result<i64> {
    ensure_version_table(conn)?;
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |r| r.get(0),
    )?)
}

/// Apply all pending migrations, each inside its own transaction.
/// Refuses (without touching the data) if the database is newer than this app.
pub fn migrate(conn: &mut Connection) -> Result<i64> {
    let latest = latest_version();
    let found = current_version(conn)?;
    if found > latest {
        return Err(Error::DatabaseNewerThanApp {
            db: found,
            app: latest,
        });
    }

    for (version, sql) in MIGRATIONS {
        // IMMEDIATE so two apps starting together cannot both apply a migration.
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let done: i64 = tx.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |r| r.get(0),
        )?;
        if done >= *version {
            continue;
        }
        tx.execute_batch(sql).map_err(|source| Error::Migration {
            version: *version,
            source,
        })?;
        tx.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            [version],
        )
        .map_err(|source| Error::Migration {
            version: *version,
            source,
        })?;
        tx.commit()?;
    }
    current_version(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_versions_are_contiguous_from_one() {
        for (i, (v, sql)) in MIGRATIONS.iter().enumerate() {
            assert_eq!(*v, i as i64 + 1);
            assert!(!sql.trim().is_empty());
        }
    }
}
