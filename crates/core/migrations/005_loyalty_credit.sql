-- Loyalty points ledger and partial use of store credit (credit notes).
-- Additive only: existing bills, customers and credit notes are untouched, so the shop's data survives the upgrade as it is.

-- How much of a credit note (refund as store credit) has been spent so far. Balance = grand - used.
ALTER TABLE credit_notes ADD COLUMN used INTEGER NOT NULL DEFAULT 0;
UPDATE credit_notes SET used = grand WHERE consumed = 1;

-- Points are never deleted or edited: an earn, a redeem and a reversal are each their own row.
CREATE TABLE points_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT    NOT NULL REFERENCES customers(id),
  at          TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('earn','redeem','reverse','adjust')),
  points      INTEGER NOT NULL,            -- positive adds to the balance, negative takes away
  bill_id     INTEGER REFERENCES bills(id),
  note        TEXT    NOT NULL DEFAULT '',
  by_name     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX idx_points_customer ON points_ledger(customer_id, id);
CREATE INDEX idx_points_bill ON points_ledger(bill_id);
CREATE TRIGGER no_delete_points_ledger BEFORE DELETE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger cannot be deleted'); END;
CREATE TRIGGER no_update_points_ledger BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger cannot be changed'); END;

-- Points that customers already hold (the old loyalty_points column) become the opening balance, so the ledger adds up from day one.
INSERT INTO points_ledger(customer_id, at, kind, points, note, by_name)
  SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'adjust', loyalty_points, 'Opening balance', 'system' FROM customers WHERE loyalty_points > 0;
