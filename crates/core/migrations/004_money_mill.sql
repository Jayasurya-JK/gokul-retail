-- Schema v4: expenses, voided scanned lines, the mill daily sheet, machine type on pressing batches,
-- customer notes and service items. Money = paise, quantity = milli-units.

ALTER TABLE customers ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN service INTEGER NOT NULL DEFAULT 0;          -- 1 = a service (no stock), e.g. aravai job work
ALTER TABLE pressing_batches ADD COLUMN machine TEXT NOT NULL DEFAULT 'W'; -- W = wood-pressed (chekku), R = rotary

-- ---------- expenses ----------
CREATE TABLE expense_categories (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO expense_categories(id,name,sort) VALUES
 ('tea','Tea / snacks',1), ('transport','Transport',2), ('advance','Salary advance',3), ('wages','Wages',4),
 ('electricity','Electricity',5), ('rent','Rent',6), ('repairs','Repairs',7), ('packing','Packing material',8),
 ('supplier_cash','Supplier cash',9), ('other','Other',10);

CREATE TABLE expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  fy            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  at            TEXT NOT NULL,
  day           TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  category_name TEXT NOT NULL,
  paid_from     TEXT NOT NULL CHECK (paid_from IN ('cash','upi','bank')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  paid_to       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  by_name       TEXT NOT NULL,
  approved_by   TEXT NOT NULL DEFAULT '',
  shift_id      INTEGER REFERENCES shifts(id),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason   TEXT NOT NULL DEFAULT '',
  voided_at     TEXT,
  voided_by     TEXT NOT NULL DEFAULT '',
  edit_count    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (fy, seq)
);
CREATE INDEX idx_expenses_day ON expenses(day, status);
CREATE INDEX idx_expenses_shift ON expenses(shift_id);
CREATE TRIGGER no_delete_expenses BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT, 'expenses cannot be deleted, void them'); END;

-- ---------- scanned then removed lines ----------
CREATE TABLE voided_lines (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  day       TEXT NOT NULL,
  by_name   TEXT NOT NULL,
  counter   TEXT NOT NULL DEFAULT '',
  item_id   TEXT NOT NULL DEFAULT '',
  code      TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL,
  qty       INTEGER NOT NULL,
  rate      INTEGER NOT NULL,
  amount    INTEGER NOT NULL,
  approved_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_voided_day ON voided_lines(day);
CREATE TRIGGER no_delete_voided_lines BEFORE DELETE ON voided_lines BEGIN SELECT RAISE(ABORT, 'voided lines cannot be deleted'); END;
CREATE TRIGGER no_update_voided_lines BEFORE UPDATE ON voided_lines BEGIN SELECT RAISE(ABORT, 'voided lines cannot be changed'); END;

-- ---------- mill daily sheet ----------
CREATE TABLE mill_sheets (
  day           TEXT PRIMARY KEY,                  -- yyyy-mm-dd, one sheet per day
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','closed')),
  supervisor    TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  physical_json TEXT NOT NULL DEFAULT '{}',        -- counted closing stock {key: milli-units}
  snapshot_json TEXT,                              -- the finished sheet, frozen at close
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  closed_at     TEXT,
  closed_by     TEXT NOT NULL DEFAULT '',
  approved_by   TEXT NOT NULL DEFAULT ''
);
CREATE TABLE mill_op_rows (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  day       TEXT NOT NULL REFERENCES mill_sheets(day),
  operator  TEXT NOT NULL,
  seed      TEXT NOT NULL,                         -- groundnut | sesame | copra
  machine   TEXT NOT NULL DEFAULT 'W',
  seed_g    INTEGER NOT NULL,
  oil_ml    INTEGER NOT NULL DEFAULT 0,
  cake_g    INTEGER NOT NULL DEFAULT 0,
  jaggery_g INTEGER NOT NULL DEFAULT 0,
  batch_id  INTEGER REFERENCES pressing_batches(id)
);
CREATE INDEX idx_mill_op_day ON mill_op_rows(day);
CREATE TABLE mill_cust_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           TEXT NOT NULL REFERENCES mill_sheets(day),
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  seed          TEXT NOT NULL,
  machine       TEXT NOT NULL DEFAULT 'W',
  seed_g        INTEGER NOT NULL,                  -- customer's seed, never in shop stock
  oil_ml        INTEGER NOT NULL DEFAULT 0,        -- oil returned to the customer, never in shop stock
  cake_g        INTEGER NOT NULL DEFAULT 0,
  cake_mode     TEXT NOT NULL DEFAULT 'taken' CHECK (cake_mode IN ('taken','kept')),
  rate          INTEGER NOT NULL DEFAULT 0,        -- paise per kg, set at close from the settings
  charge        INTEGER NOT NULL DEFAULT 0,
  bill_id       INTEGER REFERENCES bills(id),
  bill_number   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_mill_job_day ON mill_cust_jobs(day);
CREATE TABLE mill_punnaku_rows (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           TEXT NOT NULL REFERENCES mill_sheets(day),
  punnaku       TEXT NOT NULL,                     -- kadalai_w | kadalai_r | ellu_w | ellu_r | coco
  qty_g         INTEGER NOT NULL,
  supplier_id   TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_mill_pun_day ON mill_punnaku_rows(day);
CREATE TRIGGER no_delete_mill_closed BEFORE DELETE ON mill_sheets BEGIN SELECT RAISE(ABORT, 'mill sheets cannot be deleted'); END;
