-- Money handed back to the customer when a new bill is SMALLER than the exchange credit it used.
-- Additive: one new table. Cash refunds reduce the drawer in the X / Z report; UPI refunds do not.
CREATE TABLE exchange_refunds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  shift_id    INTEGER REFERENCES shifts(id),
  bill_id     INTEGER NOT NULL REFERENCES bills(id),
  credit_note TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('cash','upi')),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  by_name     TEXT NOT NULL,
  approved_by TEXT NOT NULL
);
CREATE INDEX idx_exrefund_shift ON exchange_refunds(shift_id);
CREATE INDEX idx_exrefund_bill ON exchange_refunds(bill_id);
CREATE TRIGGER no_delete_exchange_refunds BEFORE DELETE ON exchange_refunds BEGIN SELECT RAISE(ABORT, 'refunds cannot be deleted'); END;
