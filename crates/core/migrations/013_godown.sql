-- Schema v13: godown barrels (production stock, NOT store stock), their ledger, stick readings, outsourced oil purchases and
-- transfers to the store. Oil in a godown barrel only becomes store stock when it is transferred (settled oil, by litres).
-- Quantities are milli-units (millilitres), money is paise. Additive only: nothing existing is changed.

CREATE TABLE godown_barrels (
  id                TEXT PRIMARY KEY,                      -- GB-001
  label             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  oil               TEXT NOT NULL CHECK (oil IN ('groundnut','sesame','copra')),
  capacity_ml       INTEGER NOT NULL DEFAULT 200000 CHECK (capacity_ml > 0),
  level_ml          INTEGER NOT NULL DEFAULT 0 CHECK (level_ml >= 0),   -- cache of SUM(godown_movements.qty_ml)
  status            TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty','filling','settling','ready')),
  filled_on         TEXT,
  settle_started_on TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

-- Every millilitre in or out of a godown barrel. level = SUM(qty_ml). Never edited or deleted.
CREATE TABLE godown_movements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  day       TEXT NOT NULL,
  barrel_id TEXT NOT NULL REFERENCES godown_barrels(id),
  kind      TEXT NOT NULL CHECK (kind IN ('press','outsourced','stick','transfer')),
  qty_ml    INTEGER NOT NULL,                              -- + in, - out; a stick reading posts the difference
  ref_type  TEXT,
  ref_id    TEXT,
  note      TEXT NOT NULL DEFAULT '',
  by_name   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_godown_mv_barrel ON godown_movements(barrel_id, at);
CREATE INDEX idx_godown_mv_day ON godown_movements(day);
CREATE TRIGGER no_delete_godown_mv BEFORE DELETE ON godown_movements BEGIN SELECT RAISE(ABORT, 'godown ledger cannot be deleted'); END;
CREATE TRIGGER no_update_godown_mv BEFORE UPDATE ON godown_movements BEGIN SELECT RAISE(ABORT, 'godown ledger cannot be changed'); END;

-- The measuring-stick reading at the end of the day, next to what the entries say the barrel holds.
CREATE TABLE godown_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  barrel_id   TEXT NOT NULL REFERENCES godown_barrels(id),
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  measured_ml INTEGER NOT NULL,
  system_ml   INTEGER NOT NULL,
  variance_ml INTEGER NOT NULL,                            -- measured - system
  note        TEXT NOT NULL DEFAULT '',
  by_name     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_godown_reading ON godown_readings(barrel_id, at);
CREATE TRIGGER no_delete_godown_readings BEFORE DELETE ON godown_readings BEGIN SELECT RAISE(ABORT, 'readings cannot be deleted'); END;
CREATE TRIGGER no_update_godown_readings BEFORE UPDATE ON godown_readings BEGIN SELECT RAISE(ABORT, 'readings cannot be changed'); END;

-- Oil bought from an outside manufacturer when seed was not available. Goes into a godown barrel like pressed oil.
CREATE TABLE godown_purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  series        TEXT NOT NULL,
  fy            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  at            TEXT NOT NULL,
  day           TEXT NOT NULL,
  barrel_id     TEXT NOT NULL REFERENCES godown_barrels(id),
  oil           TEXT NOT NULL,
  supplier_id   TEXT,
  supplier_name TEXT NOT NULL,
  litres_ml     INTEGER NOT NULL CHECK (litres_ml > 0),
  cost          INTEGER NOT NULL DEFAULT 0,                -- paise, total
  note          TEXT NOT NULL DEFAULT '',
  by_name       TEXT NOT NULL DEFAULT '',
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_godown_purchases_day ON godown_purchases(day);
CREATE TRIGGER no_delete_godown_purchases BEFORE DELETE ON godown_purchases BEGIN SELECT RAISE(ABORT, 'purchases cannot be deleted'); END;

-- Settled oil moved from a godown barrel to the store loose-oil item (adds to its stock).
CREATE TABLE godown_transfers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL UNIQUE,
  series          TEXT NOT NULL,
  fy              TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  at              TEXT NOT NULL,
  day             TEXT NOT NULL,
  barrel_id       TEXT NOT NULL REFERENCES godown_barrels(id),
  oil             TEXT NOT NULL,
  item_id         TEXT NOT NULL REFERENCES items(id),
  item_name       TEXT NOT NULL,
  litres_ml       INTEGER NOT NULL CHECK (litres_ml > 0),
  store_barrel_id TEXT REFERENCES barrels(id),
  note            TEXT NOT NULL DEFAULT '',
  by_name         TEXT NOT NULL DEFAULT '',
  UNIQUE (series, fy, seq)
);
CREATE INDEX idx_godown_transfers_day ON godown_transfers(day);
CREATE TRIGGER no_delete_godown_transfers BEFORE DELETE ON godown_transfers BEGIN SELECT RAISE(ABORT, 'transfers cannot be deleted'); END;

ALTER TABLE pressing_batches ADD COLUMN godown_barrel_id TEXT REFERENCES godown_barrels(id);
CREATE INDEX idx_batches_godown ON pressing_batches(godown_barrel_id);
