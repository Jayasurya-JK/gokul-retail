-- Shelf life of an item, used for the default Exp date on its barcode sticker. Additive only: both columns are nullable, nothing is
-- changed for existing items (an item without a shelf life prints a blank Exp unless the date is typed in the print dialog).
ALTER TABLE items ADD COLUMN shelf_life INTEGER;
ALTER TABLE items ADD COLUMN shelf_life_unit TEXT;
