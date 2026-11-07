-- Loyalty points now carry two decimals (1 point per Rs 100 => a Rs 460 bill earns 4.60 points, nothing is rounded down).
-- The ledger and the cached balance count HUNDREDTHS of a point from here on (4.60 points is stored as 460); the screens and the
-- API show points with two decimals. Existing whole points are multiplied by 100 so every balance stays exactly the same.
-- The ledger stays unchangeable for the app: the guard trigger is lifted only inside this one-time conversion and put back.
DROP TRIGGER IF EXISTS no_update_points_ledger;
UPDATE points_ledger SET points = points * 100;
UPDATE customers SET loyalty_points = loyalty_points * 100;
CREATE TRIGGER no_update_points_ledger BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT, 'points ledger cannot be changed'); END;
