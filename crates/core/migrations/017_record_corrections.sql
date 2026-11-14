-- Schema v17: editing and deleting saved production records (owner and admin only). Additive only.
-- The ledgers stay append-only: an edit or delete posts reversing rows and (for an edit) the corrected rows. These columns mark the
-- batch / oil purchase itself. A deleted record keeps its number and its audit rows but leaves every list, analysis and day sheet.
ALTER TABLE pressing_batches ADD COLUMN status     TEXT NOT NULL DEFAULT 'active';   -- 'active' | 'deleted'
ALTER TABLE pressing_batches ADD COLUMN edited_at  TEXT;
ALTER TABLE pressing_batches ADD COLUMN edited_by  TEXT;
ALTER TABLE pressing_batches ADD COLUMN deleted_at TEXT;
ALTER TABLE pressing_batches ADD COLUMN deleted_by TEXT;

ALTER TABLE godown_purchases ADD COLUMN status     TEXT NOT NULL DEFAULT 'active';
ALTER TABLE godown_purchases ADD COLUMN edited_at  TEXT;
ALTER TABLE godown_purchases ADD COLUMN edited_by  TEXT;
ALTER TABLE godown_purchases ADD COLUMN deleted_at TEXT;
ALTER TABLE godown_purchases ADD COLUMN deleted_by TEXT;

-- godown_readings cannot be updated (trigger), so a deleted stick reading is recorded here.
CREATE TABLE godown_reading_voids (
  reading_id INTEGER PRIMARY KEY REFERENCES godown_readings(id),
  at         TEXT NOT NULL,
  by_name    TEXT NOT NULL DEFAULT ''
);
