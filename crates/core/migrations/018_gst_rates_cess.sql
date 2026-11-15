-- Schema v18: GST rates become data, and cess.
-- Additive only. The hard CHECK (gst_rate IN (0,5,12,18)) on items is loosened by the migration runner (see db::allow_any_gst_rate);
-- which rates are allowed is now the owner's list in Settings (see gst::allowed_rates), not a table constraint.
-- A rate may be fractional (0.25), so the rate columns hold REAL values; whole rates stay stored as whole numbers.
ALTER TABLE items ADD COLUMN cess_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE bill_lines ADD COLUMN cess_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN cess_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE bill_slabs ADD COLUMN cess INTEGER NOT NULL DEFAULT 0;
