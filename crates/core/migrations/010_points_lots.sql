-- Points expire one year after they were earned. Each earning is a LOT with its own expiry date; points used are taken from the
-- oldest lot first. Additive only: the ledger and every customer balance stay exactly as they are. The lots themselves are filled
-- from the existing ledger by the Rust step that runs right after this script (crate::lots::backfill).
CREATE TABLE points_lots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT    NOT NULL REFERENCES customers(id),
  source      TEXT    NOT NULL CHECK (source IN ('earn','import','adjust')),
  bill_id     INTEGER REFERENCES bills(id),
  earned_at   TEXT    NOT NULL,
  expires_at  TEXT,                         -- NULL = never expires (expiry was switched off when it was earned)
  original    INTEGER NOT NULL,             -- hundredths of a point
  remaining   INTEGER NOT NULL CHECK (remaining >= 0),
  ledger_id   INTEGER
);
CREATE INDEX idx_lots_customer ON points_lots(customer_id, remaining);
CREATE INDEX idx_lots_expiry ON points_lots(expires_at) WHERE remaining > 0;
CREATE INDEX idx_lots_bill ON points_lots(bill_id);
-- Which lots a bill's redemption used, so a cancel or return gives back exactly those lots (with their original expiry).
CREATE TABLE points_lot_uses (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id   INTEGER NOT NULL REFERENCES points_lots(id),
  bill_id  INTEGER NOT NULL,
  amount   INTEGER NOT NULL,
  restored INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_lot_uses_bill ON points_lot_uses(bill_id);
-- Expiry is ON at 12 months (it was off = 0 or missing); an owner who chose another number keeps it.
INSERT INTO settings(key,value) VALUES('loyalty.expiryMonths','12')
  ON CONFLICT(key) DO UPDATE SET value='12' WHERE trim(value) IN ('','0');
-- The date every imported POSBean balance counts as earned (start fresh at go-live): the import day.
INSERT OR IGNORE INTO settings(key,value) VALUES('loyalty.goLiveDate','2026-11-07');
