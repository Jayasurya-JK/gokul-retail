-- Schema v20: cloud sync outbox. Additive only (see docs/CLOUD-DB-AND-SYNC.md, sections 3 and 7).
-- Every synced table writes one row per change into sync_outbox: (tbl, row_key = JSON of the primary-key values, op 'up'|'del', at).
-- A pending 'up' for the same row is not written twice (coalesced). batch_id is set while a batch is being sent: a change made then
-- gets its own row, so it is never lost when the batch is confirmed. The triggers only INSERT into sync_outbox, so the append-only
-- guards on the ledgers are untouched.
-- Recording happens only while sync.enabled = '1'. A shop that never turns sync on does not grow an outbox; turning it on queues
-- every row once (the sync worker's Upload everything step), so nothing written before that point is lost.
-- Settings and users only write what the sync may send: the exact settings whitelist, and users without PIN and lock-out columns.
CREATE TABLE sync_outbox (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl      TEXT NOT NULL,
  row_key  TEXT NOT NULL,
  op       TEXT NOT NULL CHECK (op IN ('up','del')),
  at       TEXT NOT NULL,
  batch_id TEXT
);
CREATE INDEX sync_outbox_key   ON sync_outbox(tbl, row_key, op);
CREATE INDEX sync_outbox_batch ON sync_outbox(batch_id);

-- Mirrored tables: insert and update write 'up' (coalesced), delete writes 'del'.
CREATE TRIGGER sync_items_ai AFTER INSERT ON items
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'items', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'items' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_items_au AFTER UPDATE ON items
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'items', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'items' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_items_ad AFTER DELETE ON items
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('items', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_barcodes_ai AFTER INSERT ON barcodes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barcodes', json_object('barcode', NEW.barcode), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barcodes' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('barcode', NEW.barcode));
END;

CREATE TRIGGER sync_barcodes_au AFTER UPDATE ON barcodes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barcodes', json_object('barcode', NEW.barcode), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barcodes' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('barcode', NEW.barcode));
END;

CREATE TRIGGER sync_barcodes_ad AFTER DELETE ON barcodes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('barcodes', json_object('barcode', OLD.barcode), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_categories_ai AFTER INSERT ON categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'categories', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'categories' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_categories_au AFTER UPDATE ON categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'categories', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'categories' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_categories_ad AFTER DELETE ON categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('categories', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_brands_ai AFTER INSERT ON brands
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'brands', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'brands' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_brands_au AFTER UPDATE ON brands
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'brands', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'brands' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_brands_ad AFTER DELETE ON brands
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('brands', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_suppliers_ai AFTER INSERT ON suppliers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'suppliers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'suppliers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_suppliers_au AFTER UPDATE ON suppliers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'suppliers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'suppliers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_suppliers_ad AFTER DELETE ON suppliers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('suppliers', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_customers_ai AFTER INSERT ON customers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'customers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'customers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_customers_au AFTER UPDATE ON customers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'customers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'customers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_customers_ad AFTER DELETE ON customers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('customers', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_staff_ai AFTER INSERT ON staff
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'staff', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'staff' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_staff_au AFTER UPDATE ON staff
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'staff', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'staff' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_staff_ad AFTER DELETE ON staff
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('staff', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_users_ai AFTER INSERT ON users
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'users', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'users' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

-- users: only the profile columns; a PIN attempt (failed_pins, locked_until) writes nothing.
CREATE TRIGGER sync_users_au AFTER UPDATE OF id, name, role, initials, active, created_at ON users
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'users', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'users' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_users_ad AFTER DELETE ON users
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('users', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_roles_ai AFTER INSERT ON roles
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'roles', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'roles' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_roles_au AFTER UPDATE ON roles
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'roles', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'roles' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_roles_ad AFTER DELETE ON roles
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('roles', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_expense_categories_ai AFTER INSERT ON expense_categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'expense_categories', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'expense_categories' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_expense_categories_au AFTER UPDATE ON expense_categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'expense_categories', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'expense_categories' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_expense_categories_ad AFTER DELETE ON expense_categories
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('expense_categories', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bills_ai AFTER INSERT ON bills
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bills', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bills' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bills_au AFTER UPDATE ON bills
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bills', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bills' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bills_ad AFTER DELETE ON bills
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bills', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bill_lines_ai AFTER INSERT ON bill_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_lines_au AFTER UPDATE ON bill_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_lines_ad AFTER DELETE ON bill_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bill_lines', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bill_payments_ai AFTER INSERT ON bill_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_payments_au AFTER UPDATE ON bill_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_payments_ad AFTER DELETE ON bill_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bill_payments', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bill_slabs_ai AFTER INSERT ON bill_slabs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_slabs', json_object('bill_id', NEW.bill_id, 'rate', NEW.rate), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_slabs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('bill_id', NEW.bill_id, 'rate', NEW.rate));
END;

CREATE TRIGGER sync_bill_slabs_au AFTER UPDATE ON bill_slabs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_slabs', json_object('bill_id', NEW.bill_id, 'rate', NEW.rate), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_slabs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('bill_id', NEW.bill_id, 'rate', NEW.rate));
END;

CREATE TRIGGER sync_bill_slabs_ad AFTER DELETE ON bill_slabs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bill_slabs', json_object('bill_id', OLD.bill_id, 'rate', OLD.rate), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bill_cancellations_ai AFTER INSERT ON bill_cancellations
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_cancellations', json_object('bill_id', NEW.bill_id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_cancellations' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('bill_id', NEW.bill_id));
END;

CREATE TRIGGER sync_bill_cancellations_au AFTER UPDATE ON bill_cancellations
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_cancellations', json_object('bill_id', NEW.bill_id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_cancellations' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('bill_id', NEW.bill_id));
END;

CREATE TRIGGER sync_bill_cancellations_ad AFTER DELETE ON bill_cancellations
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bill_cancellations', json_object('bill_id', OLD.bill_id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_bill_reprints_ai AFTER INSERT ON bill_reprints
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_reprints', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_reprints' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_reprints_au AFTER UPDATE ON bill_reprints
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'bill_reprints', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'bill_reprints' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_bill_reprints_ad AFTER DELETE ON bill_reprints
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('bill_reprints', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_voided_lines_ai AFTER INSERT ON voided_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'voided_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'voided_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_voided_lines_au AFTER UPDATE ON voided_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'voided_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'voided_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_voided_lines_ad AFTER DELETE ON voided_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('voided_lines', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_credit_notes_ai AFTER INSERT ON credit_notes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'credit_notes', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'credit_notes' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_credit_notes_au AFTER UPDATE ON credit_notes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'credit_notes', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'credit_notes' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_credit_notes_ad AFTER DELETE ON credit_notes
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('credit_notes', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_credit_note_lines_ai AFTER INSERT ON credit_note_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'credit_note_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'credit_note_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_credit_note_lines_au AFTER UPDATE ON credit_note_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'credit_note_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'credit_note_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_credit_note_lines_ad AFTER DELETE ON credit_note_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('credit_note_lines', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_exchange_refunds_ai AFTER INSERT ON exchange_refunds
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'exchange_refunds', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'exchange_refunds' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_exchange_refunds_au AFTER UPDATE ON exchange_refunds
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'exchange_refunds', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'exchange_refunds' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_exchange_refunds_ad AFTER DELETE ON exchange_refunds
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('exchange_refunds', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_shifts_ai AFTER INSERT ON shifts
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'shifts', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'shifts' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_shifts_au AFTER UPDATE ON shifts
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'shifts', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'shifts' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_shifts_ad AFTER DELETE ON shifts
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('shifts', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_cash_movements_ai AFTER INSERT ON cash_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'cash_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'cash_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_cash_movements_au AFTER UPDATE ON cash_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'cash_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'cash_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_cash_movements_ad AFTER DELETE ON cash_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('cash_movements', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_expenses_ai AFTER INSERT ON expenses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'expenses', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'expenses' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_expenses_au AFTER UPDATE ON expenses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'expenses', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'expenses' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_expenses_ad AFTER DELETE ON expenses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('expenses', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_customer_payments_ai AFTER INSERT ON customer_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'customer_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'customer_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_customer_payments_au AFTER UPDATE ON customer_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'customer_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'customer_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_customer_payments_ad AFTER DELETE ON customer_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('customer_payments', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_supplier_payments_ai AFTER INSERT ON supplier_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'supplier_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'supplier_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_supplier_payments_au AFTER UPDATE ON supplier_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'supplier_payments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'supplier_payments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_supplier_payments_ad AFTER DELETE ON supplier_payments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('supplier_payments', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_purchases_ai AFTER INSERT ON purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'purchases', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'purchases' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_purchases_au AFTER UPDATE ON purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'purchases', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'purchases' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_purchases_ad AFTER DELETE ON purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('purchases', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_purchase_lines_ai AFTER INSERT ON purchase_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'purchase_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'purchase_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_purchase_lines_au AFTER UPDATE ON purchase_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'purchase_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'purchase_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_purchase_lines_ad AFTER DELETE ON purchase_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('purchase_lines', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_stock_movements_ai AFTER INSERT ON stock_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'stock_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'stock_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_stock_movements_au AFTER UPDATE ON stock_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'stock_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'stock_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_stock_movements_ad AFTER DELETE ON stock_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('stock_movements', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_stock_adjustments_ai AFTER INSERT ON stock_adjustments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'stock_adjustments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'stock_adjustments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_stock_adjustments_au AFTER UPDATE ON stock_adjustments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'stock_adjustments', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'stock_adjustments' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_stock_adjustments_ad AFTER DELETE ON stock_adjustments
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('stock_adjustments', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_points_ledger_ai AFTER INSERT ON points_ledger
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_ledger', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_ledger' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_ledger_au AFTER UPDATE ON points_ledger
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_ledger', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_ledger' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_ledger_ad AFTER DELETE ON points_ledger
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('points_ledger', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_points_lots_ai AFTER INSERT ON points_lots
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_lots', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_lots' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_lots_au AFTER UPDATE ON points_lots
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_lots', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_lots' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_lots_ad AFTER DELETE ON points_lots
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('points_lots', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_points_lot_uses_ai AFTER INSERT ON points_lot_uses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_lot_uses', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_lot_uses' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_lot_uses_au AFTER UPDATE ON points_lot_uses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'points_lot_uses', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'points_lot_uses' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_points_lot_uses_ad AFTER DELETE ON points_lot_uses
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('points_lot_uses', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_pressing_batches_ai AFTER INSERT ON pressing_batches
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pressing_batches', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pressing_batches' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pressing_batches_au AFTER UPDATE ON pressing_batches
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pressing_batches', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pressing_batches' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pressing_batches_ad AFTER DELETE ON pressing_batches
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('pressing_batches', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_barrels_ai AFTER INSERT ON barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barrels', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barrels' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_barrels_au AFTER UPDATE ON barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barrels', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barrels' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_barrels_ad AFTER DELETE ON barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('barrels', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_barrel_movements_ai AFTER INSERT ON barrel_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barrel_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barrel_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_barrel_movements_au AFTER UPDATE ON barrel_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'barrel_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'barrel_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_barrel_movements_ad AFTER DELETE ON barrel_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('barrel_movements', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_godown_barrels_ai AFTER INSERT ON godown_barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_barrels', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_barrels' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_barrels_au AFTER UPDATE ON godown_barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_barrels', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_barrels' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_barrels_ad AFTER DELETE ON godown_barrels
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('godown_barrels', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_godown_movements_ai AFTER INSERT ON godown_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_movements_au AFTER UPDATE ON godown_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_movements', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_movements' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_movements_ad AFTER DELETE ON godown_movements
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('godown_movements', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_godown_purchases_ai AFTER INSERT ON godown_purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_purchases', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_purchases' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_purchases_au AFTER UPDATE ON godown_purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_purchases', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_purchases' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_purchases_ad AFTER DELETE ON godown_purchases
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('godown_purchases', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_godown_transfers_ai AFTER INSERT ON godown_transfers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_transfers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_transfers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_transfers_au AFTER UPDATE ON godown_transfers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_transfers', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_transfers' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_transfers_ad AFTER DELETE ON godown_transfers
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('godown_transfers', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_godown_readings_ai AFTER INSERT ON godown_readings
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_readings', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_readings' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_readings_au AFTER UPDATE ON godown_readings
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'godown_readings', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'godown_readings' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_godown_readings_ad AFTER DELETE ON godown_readings
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('godown_readings', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_pack_runs_ai AFTER INSERT ON pack_runs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pack_runs', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pack_runs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pack_runs_au AFTER UPDATE ON pack_runs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pack_runs', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pack_runs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pack_runs_ad AFTER DELETE ON pack_runs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('pack_runs', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_pack_run_lines_ai AFTER INSERT ON pack_run_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pack_run_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pack_run_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pack_run_lines_au AFTER UPDATE ON pack_run_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'pack_run_lines', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'pack_run_lines' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_pack_run_lines_ad AFTER DELETE ON pack_run_lines
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('pack_run_lines', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_mill_sheets_ai AFTER INSERT ON mill_sheets
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_sheets', json_object('day', NEW.day), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_sheets' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('day', NEW.day));
END;

CREATE TRIGGER sync_mill_sheets_au AFTER UPDATE ON mill_sheets
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_sheets', json_object('day', NEW.day), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_sheets' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('day', NEW.day));
END;

CREATE TRIGGER sync_mill_sheets_ad AFTER DELETE ON mill_sheets
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('mill_sheets', json_object('day', OLD.day), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_mill_op_rows_ai AFTER INSERT ON mill_op_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_op_rows', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_op_rows' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_op_rows_au AFTER UPDATE ON mill_op_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_op_rows', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_op_rows' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_op_rows_ad AFTER DELETE ON mill_op_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('mill_op_rows', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_mill_punnaku_rows_ai AFTER INSERT ON mill_punnaku_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_punnaku_rows', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_punnaku_rows' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_punnaku_rows_au AFTER UPDATE ON mill_punnaku_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_punnaku_rows', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_punnaku_rows' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_punnaku_rows_ad AFTER DELETE ON mill_punnaku_rows
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('mill_punnaku_rows', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_mill_cust_jobs_ai AFTER INSERT ON mill_cust_jobs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_cust_jobs', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_cust_jobs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_cust_jobs_au AFTER UPDATE ON mill_cust_jobs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'mill_cust_jobs', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'mill_cust_jobs' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_mill_cust_jobs_ad AFTER DELETE ON mill_cust_jobs
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('mill_cust_jobs', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER sync_audit_log_ai AFTER INSERT ON audit_log
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'audit_log', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'audit_log' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_audit_log_au AFTER UPDATE ON audit_log
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'audit_log', json_object('id', NEW.id), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'audit_log' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('id', NEW.id));
END;

CREATE TRIGGER sync_audit_log_ad AFTER DELETE ON audit_log
  WHEN ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('audit_log', json_object('id', OLD.id), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- settings: only the exact whitelisted keys. Lock, heartbeat and sync bookkeeping never write here.
CREATE TRIGGER sync_settings_ai AFTER INSERT ON settings
  WHEN (NEW.key IN ('bundle.shop','bundle.tax','shopName','shopStateCode','address','phone','gstin','billPrefix','counter','roundToRupee')) AND ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'settings', json_object('key', NEW.key), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'settings' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('key', NEW.key));
END;

CREATE TRIGGER sync_settings_au AFTER UPDATE ON settings
  WHEN (NEW.key IN ('bundle.shop','bundle.tax','shopName','shopStateCode','address','phone','gstin','billPrefix','counter','roundToRupee')) AND ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at)
  SELECT 'settings', json_object('key', NEW.key), 'up', strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM sync_outbox WHERE tbl = 'settings' AND op = 'up' AND batch_id IS NULL AND row_key = json_object('key', NEW.key));
END;

CREATE TRIGGER sync_settings_ad AFTER DELETE ON settings
  WHEN (OLD.key IN ('bundle.shop','bundle.tax','shopName','shopStateCode','address','phone','gstin','billPrefix','counter','roundToRupee')) AND ((SELECT value FROM settings WHERE key = 'sync.enabled') = '1') BEGIN
  INSERT INTO sync_outbox(tbl, row_key, op, at) VALUES('settings', json_object('key', OLD.key), 'del', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
