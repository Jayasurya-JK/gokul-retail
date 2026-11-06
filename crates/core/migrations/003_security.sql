-- Schema v3: login lockout, barrel draw-down ledger for loose sales, backup error text.
ALTER TABLE users ADD COLUMN failed_pins  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;

-- Every millilitre that leaves (sale) or comes back to (return, cancel) a barrel through a bill.
-- Net drawn per bill and barrel = -SUM(qty_ml); returns and cancels can only give back what that bill took.
CREATE TABLE barrel_movements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  barrel_id TEXT NOT NULL REFERENCES barrels(id),
  kind      TEXT NOT NULL CHECK (kind IN ('sale','return','cancel')),
  qty_ml    INTEGER NOT NULL,            -- negative = oil out of the barrel
  bill_id   INTEGER NOT NULL REFERENCES bills(id),
  item_id   TEXT NOT NULL REFERENCES items(id),
  oil_name  TEXT NOT NULL,
  seed      TEXT,
  by_name   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_barrel_mv_bill ON barrel_movements(bill_id, item_id);
CREATE INDEX idx_barrel_mv_barrel ON barrel_movements(barrel_id, at);
CREATE TRIGGER no_delete_barrel_mv BEFORE DELETE ON barrel_movements BEGIN SELECT RAISE(ABORT, 'barrel ledger cannot be deleted'); END;
CREATE TRIGGER no_update_barrel_mv BEFORE UPDATE ON barrel_movements BEGIN SELECT RAISE(ABORT, 'barrel ledger cannot be changed'); END;

ALTER TABLE backup_log ADD COLUMN error TEXT NOT NULL DEFAULT '';

INSERT INTO settings(key,value) VALUES ('security.lockoutAttempts','5'),('security.lockoutSeconds','60');
