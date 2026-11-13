-- Schema v14: production redo. Additive only: nothing existing is changed, dropped or rewritten.
-- The seed price (and jaggery cost) is stamped on each new batch so cost per litre uses the last purchase price of that day.
-- Old batches keep NULL here and the analysis marks their cost as an estimate.
ALTER TABLE pressing_batches ADD COLUMN seed_cost_per_kg INTEGER;               -- paise per kg, stamped when pressed
ALTER TABLE pressing_batches ADD COLUMN jaggery_cost INTEGER;                   -- paise, total, stamped when pressed
ALTER TABLE pressing_batches ADD COLUMN source TEXT NOT NULL DEFAULT 'entry';   -- 'entry' | 'legacy-sheet'
ALTER TABLE mill_op_rows ADD COLUMN imported INTEGER NOT NULL DEFAULT 0;        -- a draft row pulled into the pressing grid
CREATE INDEX idx_batches_operator ON pressing_batches(operator, day);
