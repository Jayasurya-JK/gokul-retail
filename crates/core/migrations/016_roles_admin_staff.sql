-- Schema v16: roles Admin and Staff, and the new permission `canEditRecords` ("Edit or delete saved records").
-- Additive only. The users.role CHECK is loosened by the migration runner (a SQLite CHECK cannot be altered by SQL), see db::migrate.
--
-- owner and admin: may edit or delete saved production records. manager, cashier and staff: may not.
UPDATE roles SET perms_json = json_set(perms_json, '$.canEditRecords', json('true'))  WHERE id = 'owner';
UPDATE roles SET perms_json = json_set(perms_json, '$.canEditRecords', json('false')) WHERE id IN ('manager', 'cashier');

INSERT INTO roles(id,name,description,discount_limit_pct,perms_json,pin_for_json,locked) VALUES
 ('admin','Admin','Full access, same as owner',100,
  '{"canCancelBill":true,"canReturn":true,"canEditPrices":true,"canSeeCost":true,"canSeeReports":true,"canManageItems":true,"canManageStock":true,"canCollectCredit":true,"canOpenDrawer":true,"canManageUsers":true,"canChangeSettings":true,"canEditRecords":true}',
  '[]',1),
 ('staff','Staff','Entry only. Cannot edit or delete saved records.',2,
  '{"canCancelBill":false,"canReturn":false,"canEditPrices":false,"canSeeCost":false,"canSeeReports":false,"canManageItems":false,"canManageStock":true,"canCollectCredit":true,"canOpenDrawer":false,"canManageUsers":false,"canChangeSettings":false,"canEditRecords":false}',
  '["discount_over_limit","cancel_bill","return","price_override","void_line","open_drawer","credit_over_limit","stock_adjust"]',0);
