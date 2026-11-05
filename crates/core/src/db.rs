use crate::error::{Error, Result};
use crate::migrations;
use rusqlite::{Connection, Transaction, TransactionBehavior};
use std::path::Path;
use std::time::Duration;

/// Handle to the shop database. All access goes through here.
pub struct Db {
    conn: Connection,
}

impl Db {
    /// Open (creating folders and file if needed), set PRAGMAs and migrate to the latest schema.
    pub fn open(path: &Path) -> Result<Db> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        Self::init(conn, true)
    }

    /// In-memory database (tests, tools). Not WAL.
    pub fn open_in_memory() -> Result<Db> {
        Self::init(Connection::open_in_memory()?, false)
    }

    fn init(mut conn: Connection, expect_wal: bool) -> Result<Db> {
        // Set first so a second app holding the file makes us wait, not fail.
        conn.busy_timeout(Duration::from_millis(5000))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))?;
        if expect_wal && !mode.eq_ignore_ascii_case("wal") {
            return Err(Error::Pragma("journal_mode"));
        }
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        migrations::migrate(&mut conn)?;
        Ok(Db { conn })
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    /// Start a write transaction (takes the write lock immediately).
    pub fn transaction(&mut self) -> Result<Transaction<'_>> {
        Ok(self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?)
    }

    pub fn schema_version(&self) -> Result<i64> {
        migrations::current_version(&self.conn)
    }

    /// Recompute `stock_balance` from the ledger. Returns the number of balance rows written.
    pub fn rebuild_balances(&mut self) -> Result<usize> {
        let tx = self.transaction()?;
        let n = crate::stock::rebuild_balances(&tx)?;
        tx.commit()?;
        Ok(n)
    }
}
