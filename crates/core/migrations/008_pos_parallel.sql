-- Round 4: POSBean-familiar POS. Additive only: new nullable or defaulted columns and one new table.
-- Existing bills, items and customers keep working unchanged.

-- Wholesale price (optional) per item: used when a bill is switched to wholesale mode.
ALTER TABLE items ADD COLUMN wholesale_price INTEGER;

-- Per-bill extras: staff/salesman, home delivery, wholesale mode, cash discount (separate from item discounts), remarks.
ALTER TABLE bills ADD COLUMN staff TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN delivery_locality TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN delivery_charge INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN wholesale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN cash_disc_bps INTEGER NOT NULL DEFAULT 0;   -- cash discount percent x 100
ALTER TABLE bills ADD COLUMN cash_disc INTEGER NOT NULL DEFAULT 0;       -- paise (already inside bills.bill_discount)
ALTER TABLE bills ADD COLUMN remarks TEXT NOT NULL DEFAULT '';

-- Cost at the time of sale, so profit stays right when the cost changes later. Old lines use the item's current cost.
ALTER TABLE bill_lines ADD COLUMN cost INTEGER;

-- A held bill keeps all of the above as JSON.
ALTER TABLE held_bills ADD COLUMN meta_json TEXT;

-- Salesmen / staff that can be attached to a bill (separate from sign-in users).
CREATE TABLE staff (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO staff(name) SELECT name FROM users WHERE active = 1;

-- Customer profile fields.
ALTER TABLE customers ADD COLUMN father_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN dob TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN anniversary TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN pan TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN locality TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN route TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN credit_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN opening_balance INTEGER NOT NULL DEFAULT 0;
