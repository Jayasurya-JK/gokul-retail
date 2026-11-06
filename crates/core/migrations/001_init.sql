-- Gokul Retail schema v1. Money = integer paise. Quantity = integer milli-units.
-- Times are UTC ISO-8601 text; `day` columns hold the LOCAL calendar day (yyyy-mm-dd) for fast day queries.

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings(key, value) VALUES
  ('shopName', 'My Shop'), ('address', ''), ('gstin', ''), ('phone', ''), ('counter', 'Counter 1'),
  ('billPrefix', 'GK'), ('receiptFooter', 'Thank you. Please visit again.'), ('printer', ''), ('roundToRupee', '1');

-- Gapless counters: one row per (series, financial year). Bumped inside the same transaction as the document.
CREATE TABLE sequences (
  series   TEXT NOT NULL,
  fy       TEXT NOT NULL,
  last_seq INTEGER NOT NULL,
  PRIMARY KEY (series, fy)
);

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','manager','cashier')),
  initials   TEXT NOT NULL,
  color      TEXT NOT NULL,
  pin_hash   TEXT NOT NULL,          -- argon2id PHC string, never the PIN
  phone      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_ta       TEXT,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  brand         TEXT NOT NULL DEFAULT '',
  unit          TEXT NOT NULL,
  loose         INTEGER NOT NULL DEFAULT 0,
  pack_size     TEXT,
  hsn           TEXT NOT NULL DEFAULT '',
  gst_rate      INTEGER NOT NULL CHECK (gst_rate IN (0,5,12,18)),
  mrp           INTEGER NOT NULL,
  price         INTEGER NOT NULL,
  cost          INTEGER NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,   -- cache of SUM(stock_movements.qty), checked by tests
  reorder_level INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_items_category ON items(category_id);

CREATE TABLE barcodes (
  barcode    TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id),
  is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_barcodes_item ON barcodes(item_id);

CREATE TABLE customers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  area           TEXT NOT NULL DEFAULT '',
  credit_limit   INTEGER NOT NULL DEFAULT 0,
  outstanding    INTEGER NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  last_visit_at  TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE shifts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL REFERENCES users(id),
  counter        TEXT NOT NULL,
  opened_at      TEXT NOT NULL,
  opening_cash   INTEGER NOT NULL,
  opening_counts TEXT NOT NULL,          -- JSON denominations
  closed_at      TEXT,
  closed_by      TEXT,
  approved_by    TEXT,
  z_number       TEXT,
  counted        INTEGER,
  expected       INTEGER,
  difference     INTEGER,
  closing_counts TEXT,
  z_json         TEXT                    -- frozen Z report
);
CREATE INDEX idx_shifts_open ON shifts(closed_at);

CREATE TABLE cash_movements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id  INTEGER NOT NULL REFERENCES shifts(id),
  at        TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('in','out')),
  reason    TEXT NOT NULL,
  amount    INTEGER NOT NULL CHECK (amount > 0),
  note      TEXT NOT NULL DEFAULT '',
  by_name   TEXT NOT NULL
);
CREATE INDEX idx_cash_shift ON cash_movements(shift_id);

CREATE TABLE bills (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  series        TEXT NOT NULL,
  fy            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  at            TEXT NOT NULL,
  day           TEXT NOT NULL,
  shift_id      INTEGER REFERENCES shifts(id),
  cashier       TEXT NOT NULL,
  counter       TEXT NOT NULL,
  customer_id   TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('paid','credit','cancelled','returned')),
  item_count    INTEGER NOT NULL,
  qty_count     INTEGER NOT NULL,
  gross         INTEGER NOT NULL,
  discount      INTEGER NOT NULL,       -- line discounts + bill discount
  bill_discount INTEGER NOT NULL DEFAULT 0,
  taxable       INTEGER NOT NULL,
  gst           INTEGER NOT NULL,
  before_round  INTEGER NOT NULL,
  round_off     INTEGER NOT NULL,
  grand         INTEGER NOT NULL,
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_bills_day ON bills(day);
CREATE INDEX idx_bills_at ON bills(at);
CREATE INDEX idx_bills_shift ON bills(shift_id);
CREATE INDEX idx_bills_customer ON bills(customer_id);
CREATE INDEX idx_bills_seq ON bills(seq);

CREATE TABLE bill_lines (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id  INTEGER NOT NULL REFERENCES bills(id),
  line_no  INTEGER NOT NULL,
  item_id  TEXT NOT NULL REFERENCES items(id),
  code     TEXT NOT NULL,
  name     TEXT NOT NULL,
  unit     TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty > 0),
  rate     INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  gst_rate INTEGER NOT NULL,
  amount   INTEGER NOT NULL
);
CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);
CREATE INDEX idx_bill_lines_item ON bill_lines(item_id);

CREATE TABLE bill_payments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  mode    TEXT NOT NULL CHECK (mode IN ('cash','upi','card','credit','credit_note')),
  amount  INTEGER NOT NULL,
  ref     TEXT
);
CREATE INDEX idx_bill_payments_bill ON bill_payments(bill_id);

CREATE TABLE bill_slabs (
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  rate    INTEGER NOT NULL,
  taxable INTEGER NOT NULL,
  cgst    INTEGER NOT NULL,
  sgst    INTEGER NOT NULL,
  PRIMARY KEY (bill_id, rate)
);

CREATE TABLE bill_cancellations (
  bill_id     INTEGER PRIMARY KEY REFERENCES bills(id),
  at          TEXT NOT NULL,
  reason      TEXT NOT NULL,
  by_name     TEXT NOT NULL,
  approved_by TEXT NOT NULL
);
CREATE INDEX idx_cancel_at ON bill_cancellations(at);

CREATE TABLE bill_reprints (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  at      TEXT NOT NULL,
  by_name TEXT NOT NULL
);
CREATE INDEX idx_reprints_bill ON bill_reprints(bill_id);

-- Returns / exchanges. A credit note references its bill; the bill is never edited except its status.
CREATE TABLE credit_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  series        TEXT NOT NULL,
  fy            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  at            TEXT NOT NULL,
  day           TEXT NOT NULL,
  shift_id      INTEGER REFERENCES shifts(id),
  bill_id       INTEGER NOT NULL REFERENCES bills(id),
  customer_id   TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  reason        TEXT NOT NULL,
  refund_mode   TEXT NOT NULL CHECK (refund_mode IN ('cash','upi','credit_note','exchange')),
  by_name       TEXT NOT NULL,
  grand         INTEGER NOT NULL,
  totals_json   TEXT NOT NULL,
  consumed      INTEGER NOT NULL DEFAULT 0,   -- exchange credit already used on a bill
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_cn_bill ON credit_notes(bill_id);
CREATE INDEX idx_cn_at ON credit_notes(at);

CREATE TABLE credit_note_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cn_id        INTEGER NOT NULL REFERENCES credit_notes(id),
  line_no      INTEGER NOT NULL,
  bill_line_no INTEGER NOT NULL,           -- index into the original bill's lines
  item_id      TEXT NOT NULL REFERENCES items(id),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  unit         TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  rate         INTEGER NOT NULL,
  discount     INTEGER NOT NULL DEFAULT 0,
  gst_rate     INTEGER NOT NULL,
  amount       INTEGER NOT NULL
);
CREATE INDEX idx_cnl_cn ON credit_note_lines(cn_id);

-- Draft bills parked at the counter. "Recalled" rows are kept, just hidden.
CREATE TABLE held_bills (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  customer_id   TEXT,
  customer_name TEXT NOT NULL,
  bill_discount INTEGER NOT NULL DEFAULT 0,
  lines_json    TEXT NOT NULL,
  total         INTEGER NOT NULL,
  recalled_at   TEXT
);

-- The stock ledger. qty is signed (sale -, return +, purchase +, ...). items.stock is its cached sum.
CREATE TABLE stock_movements (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL,
  item_id  TEXT NOT NULL REFERENCES items(id),
  kind     TEXT NOT NULL CHECK (kind IN ('opening','sale','return','cancel','purchase','adjustment','production','packing')),
  qty      INTEGER NOT NULL,
  ref_type TEXT,
  ref_id   TEXT,
  note     TEXT NOT NULL DEFAULT '',
  by_name  TEXT
);
CREATE INDEX idx_stock_item ON stock_movements(item_id, id);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  by_name   TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

-- Nothing is ever deleted or rewritten: the books only grow.
CREATE TRIGGER no_delete_bills           BEFORE DELETE ON bills             BEGIN SELECT RAISE(ABORT, 'bills cannot be deleted'); END;
CREATE TRIGGER no_delete_bill_lines      BEFORE DELETE ON bill_lines        BEGIN SELECT RAISE(ABORT, 'bill lines cannot be deleted'); END;
CREATE TRIGGER no_update_bill_lines      BEFORE UPDATE ON bill_lines        BEGIN SELECT RAISE(ABORT, 'bill lines cannot be changed'); END;
CREATE TRIGGER no_delete_bill_payments   BEFORE DELETE ON bill_payments     BEGIN SELECT RAISE(ABORT, 'payments cannot be deleted'); END;
CREATE TRIGGER no_update_bill_payments   BEFORE UPDATE ON bill_payments     BEGIN SELECT RAISE(ABORT, 'payments cannot be changed'); END;
CREATE TRIGGER no_delete_credit_notes    BEFORE DELETE ON credit_notes      BEGIN SELECT RAISE(ABORT, 'credit notes cannot be deleted'); END;
CREATE TRIGGER no_delete_cn_lines        BEFORE DELETE ON credit_note_lines BEGIN SELECT RAISE(ABORT, 'credit note lines cannot be deleted'); END;
CREATE TRIGGER no_delete_stock_movements BEFORE DELETE ON stock_movements   BEGIN SELECT RAISE(ABORT, 'stock ledger cannot be deleted'); END;
CREATE TRIGGER no_update_stock_movements BEFORE UPDATE ON stock_movements   BEGIN SELECT RAISE(ABORT, 'stock ledger cannot be changed'); END;
CREATE TRIGGER no_delete_audit           BEFORE DELETE ON audit_log         BEGIN SELECT RAISE(ABORT, 'audit log cannot be deleted'); END;
CREATE TRIGGER no_update_audit           BEFORE UPDATE ON audit_log         BEGIN SELECT RAISE(ABORT, 'audit log cannot be changed'); END;
