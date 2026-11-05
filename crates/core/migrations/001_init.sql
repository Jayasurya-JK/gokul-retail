-- Migration 001: foundation tables. Never edit this file after release; add 002+.

CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE users (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL COLLATE NOCASE UNIQUE,
    role      TEXT NOT NULL CHECK (role IN ('owner', 'cashier')),
    pin_hash  TEXT NOT NULL,
    active    INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

CREATE TABLE items (
    id                INTEGER PRIMARY KEY,
    code              TEXT NOT NULL COLLATE NOCASE UNIQUE,
    barcode           TEXT UNIQUE CHECK (barcode IS NULL OR length(barcode) > 0),
    name              TEXT NOT NULL COLLATE NOCASE,
    name_ta           TEXT,
    kind              TEXT NOT NULL CHECK (kind IN
                        ('seed', 'bulk_oil', 'packed', 'loose', 'packing_material', 'byproduct', 'other')),
    base_unit         TEXT NOT NULL CHECK (base_unit IN ('ml', 'g', 'pcs')),
    density_mg_per_ml INTEGER CHECK (density_mg_per_ml IS NULL OR density_mg_per_ml > 0),
    hsn               TEXT,
    gst_rate_bp       INTEGER NOT NULL DEFAULT 0 CHECK (gst_rate_bp >= 0 AND gst_rate_bp <= 10000),
    sale_price_paise  INTEGER NOT NULL DEFAULT 0 CHECK (sale_price_paise >= 0),
    active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_items_name ON items(name);

-- Insert-only stock ledger. Quantities are signed integers in the item base unit.
-- reason is validated in gokul-core (Reason enum) so new reasons need no table rebuild.
CREATE TABLE stock_ledger (
    id         INTEGER PRIMARY KEY,
    item_id    INTEGER NOT NULL REFERENCES items(id),
    qty_base   INTEGER NOT NULL CHECK (qty_base <> 0),
    reason     TEXT NOT NULL CHECK (length(reason) > 0),
    ref_type   TEXT,
    ref_id     INTEGER,
    user_id    INTEGER REFERENCES users(id),
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_stock_ledger_item ON stock_ledger(item_id, created_at);
CREATE INDEX idx_stock_ledger_ref ON stock_ledger(ref_type, ref_id);
CREATE INDEX idx_stock_ledger_created ON stock_ledger(created_at);

CREATE TRIGGER stock_ledger_no_update
BEFORE UPDATE ON stock_ledger
BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is insert-only: UPDATE is not allowed');
END;

CREATE TRIGGER stock_ledger_no_delete
BEFORE DELETE ON stock_ledger
BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is insert-only: DELETE is not allowed');
END;

-- Cache of SUM(stock_ledger.qty_base) per item. Only post_stock / rebuild_balances write it.
CREATE TABLE stock_balance (
    item_id  INTEGER PRIMARY KEY REFERENCES items(id),
    qty_base INTEGER NOT NULL
);

-- In-progress screen state (autosave), used from step 4 onwards.
CREATE TABLE drafts (
    id           INTEGER PRIMARY KEY,
    screen       TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    payload_json TEXT NOT NULL,
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (screen, user_id)
);
