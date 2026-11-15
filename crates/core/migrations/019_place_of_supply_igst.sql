-- Schema v19: place of supply and IGST.
-- Additive only. Existing bills stay intra-state (the shop's own state); the runner fills the new per-line tax columns for
-- them from the saved lines (see gst::backfill_line_taxes) so HSN and GSTR-1 reports can be added up from lines.
--
-- customers.state_code: GST state code of the recipient ("33" = Tamil Nadu); '' = not recorded (treated as the shop's state).
ALTER TABLE customers ADD COLUMN state_code TEXT NOT NULL DEFAULT '';

-- The bill carries what was true when it was written: where the supply is made, intra or inter-state, and the recipient's
-- GSTIN and address as they were that day (the customer may change later; an issued invoice must not).
ALTER TABLE bills ADD COLUMN place_of_supply TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN supply_type TEXT NOT NULL DEFAULT 'intra';
ALTER TABLE bills ADD COLUMN cust_gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN cust_address TEXT NOT NULL DEFAULT '';

ALTER TABLE bill_slabs ADD COLUMN igst INTEGER NOT NULL DEFAULT 0;

-- Per line: the HSN as it was, and the tax split of the line (taxable value, CGST, SGST, IGST, cess), so
-- taxable + cgst + sgst + igst + cess = the line's final amount (after its share of the bill discount).
ALTER TABLE bill_lines ADD COLUMN hsn TEXT NOT NULL DEFAULT '';
ALTER TABLE bill_lines ADD COLUMN taxable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN cgst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN sgst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN igst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN cess INTEGER NOT NULL DEFAULT 0;

ALTER TABLE credit_notes ADD COLUMN place_of_supply TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_notes ADD COLUMN supply_type TEXT NOT NULL DEFAULT 'intra';

ALTER TABLE credit_note_lines ADD COLUMN hsn TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_note_lines ADD COLUMN taxable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN cgst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN sgst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN igst INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN cess INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_bills_pos ON bills(place_of_supply);

-- Saved bill lines stay untouchable, except that the new tax columns may be filled ONCE (from zero) by the backfill that runs after
-- this script. Every money, quantity and identity column is still guarded, and a tax column that has been written cannot change.
DROP TRIGGER no_update_bill_lines;
CREATE TRIGGER no_update_bill_lines BEFORE UPDATE ON bill_lines
WHEN OLD.bill_id IS NOT NEW.bill_id OR OLD.line_no IS NOT NEW.line_no OR OLD.item_id IS NOT NEW.item_id OR OLD.code IS NOT NEW.code
  OR OLD.name IS NOT NEW.name OR OLD.unit IS NOT NEW.unit OR OLD.qty IS NOT NEW.qty OR OLD.rate IS NOT NEW.rate
  OR OLD.discount IS NOT NEW.discount OR OLD.gst_rate IS NOT NEW.gst_rate OR OLD.amount IS NOT NEW.amount
  OR OLD.cost IS NOT NEW.cost OR OLD.cess_rate IS NOT NEW.cess_rate
  OR (OLD.hsn != '' AND NEW.hsn IS NOT OLD.hsn)
  OR ((OLD.taxable != 0 OR OLD.cgst != 0 OR OLD.sgst != 0 OR OLD.igst != 0 OR OLD.cess != 0)
      AND (NEW.taxable IS NOT OLD.taxable OR NEW.cgst IS NOT OLD.cgst OR NEW.sgst IS NOT OLD.sgst OR NEW.igst IS NOT OLD.igst OR NEW.cess IS NOT OLD.cess))
BEGIN SELECT RAISE(ABORT, 'bill lines cannot be changed'); END;
