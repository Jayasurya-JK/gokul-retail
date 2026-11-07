-- Customer Points module: the ledger gains one more kind, 'expire' (points that lapsed under the optional expiry rule).
-- SQLite cannot widen a CHECK in place, so the ledger is rebuilt with every row kept exactly as it was (same ids, same order).
-- Nothing in the app can change or delete ledger rows; the guard triggers are lifted only inside this one-time rebuild and put back.
DROP TRIGGER IF EXISTS no_delete_points_ledger;
DROP TRIGGER IF EXISTS no_update_points_ledger;
DROP INDEX IF EXISTS idx_points_customer;
DROP INDEX IF EXISTS idx_points_bill;
ALTER TABLE points_ledger RENAME TO points_ledger_old;
CREATE TABLE points_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT    NOT NULL REFERENCES customers(id),
  at          TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('earn','redeem','reverse','adjust','expire')),
  points      INTEGER NOT NULL,            -- hundredths of a point; positive adds to the balance, negative takes away
  bill_id     INTEGER REFERENCES bills(id),
  note        TEXT    NOT NULL DEFAULT '',
  by_name     TEXT    NOT NULL DEFAULT ''
);
INSERT INTO points_ledger(id,customer_id,at,kind,points,bill_id,note,by_name)
  SELECT id,customer_id,at,kind,points,bill_id,note,by_name FROM points_ledger_old ORDER BY id;
DROP TABLE points_ledger_old;
CREATE INDEX idx_points_customer ON points_ledger(customer_id, id);
CREATE INDEX idx_points_bill ON points_ledger(bill_id);
CREATE INDEX idx_points_kind_at ON points_ledger(kind, at);
CREATE TRIGGER no_delete_points_ledger BEFORE DELETE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger cannot be deleted'); END;
CREATE TRIGGER no_update_points_ledger BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger cannot be changed'); END;
