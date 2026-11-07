-- Customers can be made inactive: they drop out of the POS pickers and cannot be put on a new bill, but stay in Office
-- (filter "Inactive") with all their history. Additive: every existing customer stays active (default 1).
ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_customers_active_visit ON customers(active, last_visit_at);
-- The owner's test customer ("jk", code c1, marked as test data in its notes) is switched off. Matches only that row.
UPDATE customers SET active = 0 WHERE id = 'c1' AND notes LIKE 'TEST CUSTOMER%';

-- Default supplier of an item (filled by `gokul-import link-suppliers`, editable in the item editor).
ALTER TABLE items ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);
CREATE INDEX idx_items_supplier ON items(supplier_id);
