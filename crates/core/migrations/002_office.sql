-- Schema v2: Office. Catalogue extras, brands, suppliers and purchases, production (pressing, barrels, packing),
-- stock adjustments, customer receipts, roles, backups. Money = paise, quantity = milli-units.

-- ---------- catalogue ----------
ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'item';          -- item | seed | material (seeds and packing material are not sold at the counter)
ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id);        -- packed item -> the loose item it is filled from
ALTER TABLE items ADD COLUMN scale_code TEXT NOT NULL DEFAULT '';        -- weighing-scale product code (loose items)
CREATE INDEX idx_items_kind ON items(kind);
CREATE INDEX idx_items_parent ON items(parent_id);

CREATE TABLE brands (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Reserved categories for raw material (ids start with "_", hidden from the category screens).
INSERT INTO categories(id,name,sort) VALUES ('_seed','Raw seeds',900), ('_material','Packing material',901);
INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at,kind) VALUES
  ('rm-gn','RM-GN','Groundnut Kernels (Verkadalai)','_seed','','kg',1,'1202',0,0,0,9800,0,200000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'seed'),
  ('rm-sesame','RM-SESAME','Sesame Seed (Ellu)','_seed','','kg',1,'1207',0,0,0,13800,0,150000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'seed'),
  ('rm-copra','RM-COPRA','Copra (Dried Coconut)','_seed','','kg',1,'1203',5,0,0,16800,0,150000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'seed'),
  ('rm-btl500','RM-BTL500','PET Bottle 500 ml with Cap','_material','','pc',0,'3923',18,0,0,750,0,500000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'material'),
  ('rm-btl1l','RM-BTL1L','PET Bottle 1 L with Cap','_material','','pc',0,'3923',18,0,0,1100,0,500000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'material'),
  ('rm-tin15','RM-TIN15','Tin Container 15 L','_material','','pc',0,'7310',18,0,0,16500,0,20000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'material'),
  ('rm-label','RM-LABEL','Bottle Label (Gokul)','_material','','pc',0,'4821',18,0,0,120,0,1000000,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'material');

CREATE TABLE stock_adjustments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id),
  reason  TEXT NOT NULL CHECK (reason IN ('damage','leak','spill','sample','correction')),
  qty     INTEGER NOT NULL,               -- signed milli-units
  value   INTEGER NOT NULL,               -- qty valued at cost, signed paise
  note    TEXT NOT NULL DEFAULT '',
  by_name TEXT NOT NULL
);
CREATE INDEX idx_adj_at ON stock_adjustments(at);

-- ---------- people ----------
ALTER TABLE customers ADD COLUMN type TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE customers ADD COLUMN business TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN pin_changed_at TEXT;

-- Money received from a credit customer. It reduces customers.outstanding; the oldest credit bills are the ones cleared.
CREATE TABLE customer_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt     TEXT NOT NULL UNIQUE,
  series      TEXT NOT NULL,
  fy          TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL CHECK (mode IN ('cash','upi')),
  ref         TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  by_name     TEXT NOT NULL,
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_custpay_customer ON customer_payments(customer_id, at);
CREATE INDEX idx_custpay_day ON customer_payments(day);

CREATE TABLE roles (
  id                 TEXT PRIMARY KEY CHECK (id IN ('owner','manager','cashier')),
  name               TEXT NOT NULL,
  description        TEXT NOT NULL,
  discount_limit_pct INTEGER NOT NULL,
  perms_json         TEXT NOT NULL,
  pin_for_json       TEXT NOT NULL,
  locked             INTEGER NOT NULL DEFAULT 0
);
INSERT INTO roles(id,name,description,discount_limit_pct,perms_json,pin_for_json,locked) VALUES
 ('owner','Owner','Full control of shop, money and settings.',100,
  '{"canCancelBill":true,"canReturn":true,"canEditPrices":true,"canSeeCost":true,"canSeeReports":true,"canManageItems":true,"canManageStock":true,"canCollectCredit":true,"canOpenDrawer":true,"canManageUsers":true,"canChangeSettings":true}',
  '[]',1),
 ('manager','Manager','Runs the floor. Approves exceptions with their own PIN.',15,
  '{"canCancelBill":true,"canReturn":true,"canEditPrices":true,"canSeeCost":true,"canSeeReports":true,"canManageItems":true,"canManageStock":true,"canCollectCredit":true,"canOpenDrawer":true,"canManageUsers":false,"canChangeSettings":false}',
  '["stock_adjust"]',0),
 ('cashier','Cashier','Bills at the counter only.',2,
  '{"canCancelBill":false,"canReturn":false,"canEditPrices":false,"canSeeCost":false,"canSeeReports":false,"canManageItems":false,"canManageStock":false,"canCollectCredit":true,"canOpenDrawer":false,"canManageUsers":false,"canChangeSettings":false}',
  '["discount_over_limit","cancel_bill","return","price_override","void_line","open_drawer","credit_over_limit"]',0);

-- ---------- suppliers and purchases ----------
CREATE TABLE suppliers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  gstin        TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  contact      TEXT NOT NULL DEFAULT '',
  credit_days  INTEGER NOT NULL DEFAULT 15,
  created_at   TEXT NOT NULL
);

CREATE TABLE purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  series        TEXT NOT NULL,
  fy            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  at            TEXT NOT NULL,
  day           TEXT NOT NULL,
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  invoice_no    TEXT NOT NULL DEFAULT '',
  invoice_date  TEXT NOT NULL,            -- yyyy-mm-dd
  due_date      TEXT NOT NULL,
  interstate    INTEGER NOT NULL DEFAULT 0,
  freight       INTEGER NOT NULL DEFAULT 0,
  other_charges INTEGER NOT NULL DEFAULT 0,
  taxable       INTEGER NOT NULL,
  cgst          INTEGER NOT NULL,
  sgst          INTEGER NOT NULL,
  igst          INTEGER NOT NULL,
  round_off     INTEGER NOT NULL,
  total         INTEGER NOT NULL,
  paid          INTEGER NOT NULL DEFAULT 0,     -- grows as supplier payments are applied, oldest purchase first
  paid_at_entry INTEGER NOT NULL DEFAULT 0,
  pay_mode      TEXT,
  cost_updated  INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  by_name       TEXT NOT NULL DEFAULT '',
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id, at);
CREATE INDEX idx_purchases_day ON purchases(day);

CREATE TABLE purchase_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  line_no     INTEGER NOT NULL,
  item_id     TEXT NOT NULL REFERENCES items(id),
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  rate        INTEGER NOT NULL,               -- per unit, excluding GST
  discount_bp INTEGER NOT NULL DEFAULT 0,     -- trade discount in basis points of a percent (2.5% = 250)
  gst_rate    INTEGER NOT NULL
);
CREATE INDEX idx_purchase_lines_purchase ON purchase_lines(purchase_id);
CREATE INDEX idx_purchase_lines_item ON purchase_lines(item_id);

CREATE TABLE supplier_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL CHECK (mode IN ('cash','upi','bank','cheque')),
  ref         TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  by_name     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_supplier_payments ON supplier_payments(supplier_id, at);

-- ---------- production ----------
CREATE TABLE barrels (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  seed        TEXT,                -- groundnut | sesame | copra while it holds oil
  oil_name    TEXT,
  capacity_ml INTEGER NOT NULL,
  level_ml    INTEGER NOT NULL DEFAULT 0 CHECK (level_ml >= 0),
  filled_on   TEXT
);
INSERT INTO barrels(id,label,capacity_ml) VALUES
 ('BR-01','Barrel 1',200000),('BR-02','Barrel 2',200000),('BR-03','Barrel 3',200000),('BR-04','Barrel 4',200000),
 ('BR-05','Barrel 5',200000),('BR-06','Barrel 6',200000),('BR-07','Barrel 7',200000),('BR-08','Barrel 8',200000);

CREATE TABLE pressing_batches (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           TEXT NOT NULL UNIQUE,
  series           TEXT NOT NULL,
  fy               TEXT NOT NULL,
  seq              INTEGER NOT NULL,
  at               TEXT NOT NULL,
  day              TEXT NOT NULL,
  seed             TEXT NOT NULL,
  seed_g           INTEGER NOT NULL,        -- milli-kg
  cleaning_loss_g  INTEGER NOT NULL DEFAULT 0,
  jaggery_g        INTEGER NOT NULL DEFAULT 0,
  oil_raw_ml       INTEGER NOT NULL,
  cake_g           INTEGER NOT NULL DEFAULT 0,
  chekku           TEXT NOT NULL DEFAULT '',
  operator         TEXT NOT NULL DEFAULT '',
  settle_ready_on  TEXT NOT NULL,
  norm_kg_per_l    TEXT NOT NULL,           -- the norm in force when pressed, kept for yield history
  norm_density     TEXT NOT NULL,
  clear_oil_ml     INTEGER,
  sediment_ml      INTEGER,
  barrel_id        TEXT REFERENCES barrels(id),
  moved_on         TEXT,
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_batches_day ON pressing_batches(day);

CREATE TABLE pack_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT NOT NULL UNIQUE,
  series      TEXT NOT NULL,
  fy          TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  barrel_id   TEXT NOT NULL REFERENCES barrels(id),
  oil_name    TEXT NOT NULL,
  expected_ml INTEGER NOT NULL,
  used_ml     INTEGER NOT NULL,
  wastage_ml  INTEGER NOT NULL,
  packer      TEXT NOT NULL DEFAULT '',
  packs       INTEGER NOT NULL,
  UNIQUE (series, fy, seq)
);
CREATE TABLE pack_run_lines (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id  INTEGER NOT NULL REFERENCES pack_runs(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  name    TEXT NOT NULL,
  label   TEXT NOT NULL,
  size_ml INTEGER NOT NULL,
  count   INTEGER NOT NULL CHECK (count > 0)
);
CREATE INDEX idx_pack_lines_run ON pack_run_lines(run_id);

-- Production norms are settings (editable), not constants.
INSERT INTO settings(key,value) VALUES
 ('norm.groundnut.kgPerL','2.5'),('norm.groundnut.density','0.91'),('norm.groundnut.settleDays','4'),
 ('norm.sesame.kgPerL','2.7'),('norm.sesame.density','0.92'),('norm.sesame.settleDays','5'),
 ('norm.copra.kgPerL','1.6'),('norm.copra.density','0.92'),('norm.copra.settleDays','3'),
 ('norm.packWastagePct','0.5');

-- ---------- backups ----------
CREATE TABLE backup_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  path    TEXT NOT NULL,
  size_b  INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  ok      INTEGER NOT NULL
);

-- ---------- reporting indexes ----------
CREATE INDEX idx_bills_day_status ON bills(day, status);
CREATE INDEX idx_bill_pay_mode ON bill_payments(mode, bill_id);
CREATE INDEX idx_stock_at ON stock_movements(at);
CREATE INDEX idx_cn_day ON credit_notes(day);

-- ---------- the books only grow ----------
CREATE TRIGGER no_delete_purchases        BEFORE DELETE ON purchases         BEGIN SELECT RAISE(ABORT, 'purchases cannot be deleted'); END;
CREATE TRIGGER no_delete_purchase_lines   BEFORE DELETE ON purchase_lines    BEGIN SELECT RAISE(ABORT, 'purchase lines cannot be deleted'); END;
CREATE TRIGGER no_update_purchase_lines   BEFORE UPDATE ON purchase_lines    BEGIN SELECT RAISE(ABORT, 'purchase lines cannot be changed'); END;
CREATE TRIGGER no_delete_supplier_pay     BEFORE DELETE ON supplier_payments BEGIN SELECT RAISE(ABORT, 'payments cannot be deleted'); END;
CREATE TRIGGER no_update_supplier_pay     BEFORE UPDATE ON supplier_payments BEGIN SELECT RAISE(ABORT, 'payments cannot be changed'); END;
CREATE TRIGGER no_delete_customer_pay     BEFORE DELETE ON customer_payments BEGIN SELECT RAISE(ABORT, 'receipts cannot be deleted'); END;
CREATE TRIGGER no_update_customer_pay     BEFORE UPDATE ON customer_payments BEGIN SELECT RAISE(ABORT, 'receipts cannot be changed'); END;
CREATE TRIGGER no_delete_adjustments      BEFORE DELETE ON stock_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments cannot be deleted'); END;
CREATE TRIGGER no_update_adjustments      BEFORE UPDATE ON stock_adjustments BEGIN SELECT RAISE(ABORT, 'adjustments cannot be changed'); END;
CREATE TRIGGER no_delete_batches          BEFORE DELETE ON pressing_batches  BEGIN SELECT RAISE(ABORT, 'pressing batches cannot be deleted'); END;
CREATE TRIGGER no_delete_pack_runs        BEFORE DELETE ON pack_runs         BEGIN SELECT RAISE(ABORT, 'packing runs cannot be deleted'); END;
CREATE TRIGGER no_delete_pack_lines       BEFORE DELETE ON pack_run_lines    BEGIN SELECT RAISE(ABORT, 'packing lines cannot be deleted'); END;
