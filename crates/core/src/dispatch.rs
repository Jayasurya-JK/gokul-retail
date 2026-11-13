//! One entry point for every screen call: `dispatch(db, "saveBill", [draft])`.
//! Method names and argument order are exactly the TypeScript `Api` interface (packages/data), so the
//! Tauri shells stay a few lines long and every method can be tested without Tauri.

use crate::error::{invalid, ApiError, Result};
use crate::types::*;
use crate::authz::{self, Session};
use crate::{bills, billops, catalog, crm, dash, expenses, mill, posreports, purchasing, reports, shift, store, Db};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

fn arg<T: DeserializeOwned>(args: &[Value], i: usize, name: &str) -> Result<T> {
    let v = args.get(i).cloned().unwrap_or(Value::Null);
    serde_json::from_value(v).map_err(|e| ApiError::Invalid(format!("Bad request: argument '{name}': {e}")))
}

fn ok<T: Serialize>(v: T) -> Result<Value> {
    Ok(serde_json::to_value(v)?)
}

/// The call the apps use: identity and permissions come from the backend session, not from the screen.
///
/// - `getSettings` and `listUsers` work signed out (the login screen needs them); `verifyPin` signs in (and out first);
///   `logout` signs out (lock and sign-out both call it).
/// - Everything else needs a signed-in, active, unlocked user, is checked against the stored role matrix
///   (see `authz`), and runs with that user's name on every audit row, ledger row and "by" column.
/// - Day close (Z) starts a background backup when it succeeds.
pub fn dispatch_session(db: &Db, session: &Session, method: &str, mut args: Vec<Value>) -> Result<Value> {
    match method {
        "getSettings" | "listUsers" | "printerStatus" => return dispatch(db, method, args),
        "logout" => {
            session.clear();
            return Ok(Value::Null);
        }
        "verifyPin" => {
            session.clear();
            let user: Option<User> = serde_json::from_value(dispatch(db, "verifyPin", args)?)?;
            return match user {
                Some(u) if !session.allows(&u.role) => invalid("Cashier accounts cannot sign in to Gokul Office. Use Gokul POS at the counter."),
                Some(u) => {
                    session.set(&u.id);
                    ok(Some(u))
                }
                None => Ok(Value::Null),
            };
        }
        _ => {}
    }
    let Some(uid) = session.current() else { return invalid("Please sign in first.") };
    let actor = db.with(|c| {
        if let Some(secs) = authz::is_locked(c, &uid)? {
            return Err(ApiError::Invalid(store::locked_message(secs)));
        }
        authz::load_actor(c, &uid)
    });
    let actor = match actor {
        Ok(Some(a)) => a,
        Ok(None) => {
            session.clear();
            return invalid("This user is no longer active. Sign in again.");
        }
        Err(e) => {
            session.clear();
            return Err(e);
        }
    };
    let approval = match db.with(|c| authz::authorize(c, &actor, method, &mut args)) {
        Ok(a) => a,
        Err(e) => {
            // Too many wrong approval PINs locks the signed-in user out: back to the login screen.
            if db.with(|c| authz::is_locked(c, &actor.id)).ok().flatten().is_some() {
                session.clear();
            }
            return Err(e);
        }
    };
    let _who = crate::db::ActorGuard::set(&actor.name);
    let _appr = crate::db::ApproverGuard::set(approval.as_ref().map(|o| o.approver.as_str()));
    let mut out = dispatch(db, method, args)?;
    if !actor.can_see_cost() {
        authz::strip_cost(&mut out);
    }
    if let Some(o) = &approval {
        db.with(|c| authz::record_override(c, &actor, method, o))?;
    }
    if (method == "verifyManagerPin" || method == "closeDay") && out.is_null() {
        let locked = db.with(|c| authz::count_wrong_manager_pin(c, &actor, method))?;
        if let Some(secs) = locked {
            session.clear();
            return Err(ApiError::Invalid(store::locked_message(secs)));
        }
    }
    if method == "closeDay" && !out.is_null() {
        let _ = crate::backup::spawn_after_day_close(db.path().to_path_buf());
    }
    Ok(out)
}

/// Direct call with no session and no permission checks: for tests and internal jobs only. The apps never use this.
pub fn dispatch(db: &Db, method: &str, args: Vec<Value>) -> Result<Value> {
    let a = &args[..];
    // Printing talks to the spooler, so it must NOT run inside the database lock below: it takes the lock only to build the
    // paper. A printing problem is an answer ({ ok, message }), never an error: the bill it belongs to is already saved.
    match method {
        "printDocument" => {
            let opts = a.get(2).cloned().unwrap_or(Value::Null);
            return ok(crate::printing::print_document(db, &arg::<String>(a, 0, "kind")?, &arg::<String>(a, 1, "id")?, &opts));
        }
        "printerStatus" => return ok(crate::printing::printer_status(db)),
        "printLabels" => {
            let opts = a.get(1).cloned().unwrap_or(Value::Null);
            return ok(crate::labels::print_labels(db, a.first().unwrap_or(&Value::Null), &opts));
        }
        "labelPreview" => {
            let opts = a.get(1).cloned().unwrap_or(Value::Null);
            return ok(crate::labels::label_preview(db, &arg::<Vec<String>>(a, 0, "itemIds")?, &opts));
        }
        "testPrint" => {
            let opts = a.get(2).cloned().unwrap_or(Value::Null);
            return ok(crate::printing::test_print(db, &arg::<String>(a, 0, "kind")?, &arg::<String>(a, 1, "printer")?, &opts));
        }
        _ => {}
    }
    db.with(|c| match method {
        // ----- CoreApi -----
        "getSettings" => ok(store::get_settings(c)?),
        "listUsers" => ok(store::list_users(c)?),
        "verifyPin" => ok(store::verify_pin(c, &arg::<String>(a, 0, "userId")?, &arg::<String>(a, 1, "pin")?)?),
        "currentShift" => ok(shift::current_shift(c, &arg::<String>(a, 0, "userId")?)?),
        "listItems" => ok(store::list_items(c)?),
        "listCategories" => ok(store::list_categories(c)?),
        "findItemByCode" => ok(store::find_item_by_code(c, &arg::<String>(a, 0, "code")?)?),
        "searchItems" => {
            let limit = arg::<Option<usize>>(a, 1, "limit")?.unwrap_or(50);
            ok(store::search_items(c, &arg::<String>(a, 0, "query")?, limit)?)
        }
        "listCustomers" => ok(store::list_customers(c)?),
        "searchCustomers" => {
            let limit = arg::<Option<usize>>(a, 1, "limit")?.unwrap_or(30);
            let offset = arg::<Option<usize>>(a, 2, "offset")?.unwrap_or(0);
            ok(store::search_customers(c, &arg::<String>(a, 0, "query")?, limit, offset)?)
        }
        "getCustomer" => ok(store::get_customer(c, &arg::<String>(a, 0, "id")?)?),
        "countCustomers" => ok(store::count_customers(c)?),
        "listBills" => ok(bills::list_bills(c, &arg::<Option<BillFilter>>(a, 0, "filter")?.unwrap_or_default())?),
        "getBill" => ok(bills::get_bill(c, &arg::<String>(a, 0, "id")?)?),
        "saveBill" => ok(bills::save_bill(c, &arg::<BillDraft>(a, 0, "draft")?)?),
        "holdBill" => ok(bills::hold_bill(c, &arg::<BillDraft>(a, 0, "draft")?)?),
        "listHeld" => ok(bills::list_held(c)?),
        "recallHeld" => ok(bills::recall_held(c, &arg::<String>(a, 0, "id")?)?),
        "dashboard" => ok(dash::dashboard(c)?),
        "topItems" => ok(dash::top_items(c, arg(a, 0, "days")?, arg(a, 1, "limit")?)?),
        "lowStock" => ok(store::low_stock(c, arg(a, 0, "limit")?)?),
        "listStockMovements" => ok(dash::list_stock_movements(c, arg(a, 0, "limit")?)?),

        // ----- ShiftApi -----
        "getDayStatus" => ok(shift::day_status(c)?),
        "openDay" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct In { user_id: String, counts: DenomCounts }
            let i: In = arg(a, 0, "input")?;
            ok(shift::open_day(c, &i.user_id, &i.counts)?)
        }
        "listCashEntries" => ok(shift::list_cash_entries(c)?),
        "addCashEntry" => ok(shift::add_cash_entry(c, &arg::<CashEntryInput>(a, 0, "input")?)?),
        "shiftSummary" => ok(shift::shift_summary(c)?),
        "verifyManagerPin" => ok(shift::verify_manager_pin(c, &arg::<String>(a, 0, "pin")?)?),
        "closeDay" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct In { user_id: String, counts: DenomCounts, manager_pin: String }
            let i: In = arg(a, 0, "input")?;
            ok(shift::close_day(c, &i.user_id, &i.counts, &i.manager_pin)?)
        }
        "peekNextBillNumber" => ok(bills::peek_next_bill_number(c)?),
        "quickAddCustomer" => {
            #[derive(serde::Deserialize)]
            struct In { name: String, #[serde(default)] phone: String }
            let i: In = arg(a, 0, "input")?;
            ok(store::quick_add_customer(c, &i.name, &i.phone)?)
        }

        // ----- BillOpsApi -----
        "listBillsOn" => ok(billops::list_bills_on(c, &arg::<BillSearch>(a, 0, "search")?)?),
        "getBillDetail" => ok(billops::get_bill_detail(c, &arg::<String>(a, 0, "id")?)?),
        "findBillForReturn" => ok(billops::find_bill_for_return(c, &arg::<String>(a, 0, "code")?)?),
        "cancelBill" => ok(billops::cancel_bill(c, &arg::<CancelRequest>(a, 0, "request")?)?),
        "recordReprint" => ok(billops::record_reprint(c, &arg::<String>(a, 0, "billId")?, &arg::<String>(a, 1, "by")?)?),
        "createReturn" => ok(billops::create_return(c, &arg::<ReturnRequest>(a, 0, "request")?)?),
        "listCreditNotes" => ok(billops::list_credit_notes(c, arg::<Option<i64>>(a, 0, "limit")?.unwrap_or(50))?),
        "getPendingExchange" => ok(billops::get_pending_exchange(c)?),
        "clearPendingExchange" => {
            billops::clear_pending_exchange(c)?;
            Ok(Value::Null)
        }

        // ----- CoreApi (Office lists) -----
        "listSuppliers" => ok(purchasing::list_suppliers(c)?),
        "listPurchases" => ok(purchasing::list_purchases(c)?),
        "listProduction" => ok(purchasing::list_production(c)?),

        // ----- CatalogApi -----
        "getItemDetail" => ok(catalog::get_item_detail(c, &arg::<String>(a, 0, "id")?)?),
        "validateItem" => ok(catalog::validate_item(c, &arg::<catalog::ItemInput>(a, 0, "input")?)?),
        "saveItem" => ok(catalog::save_item(c, &arg::<catalog::ItemInput>(a, 0, "input")?)?),
        "generateBarcode" => ok(catalog::generate_barcode(c)?),
        "nextItemCode" => ok(catalog::next_item_code(c)?),
        "listLooseItems" => ok(catalog::list_loose_items(c)?),
        "setItemsActive" => {
            catalog::set_items_active(c, &arg::<Vec<String>>(a, 0, "ids")?, arg(a, 1, "active")?)?;
            Ok(Value::Null)
        }
        "setItemsCategory" => {
            catalog::set_items_category(c, &arg::<Vec<String>>(a, 0, "ids")?, &arg::<String>(a, 1, "categoryId")?)?;
            Ok(Value::Null)
        }
        "setItemsGst" => {
            catalog::set_items_gst(c, &arg::<Vec<String>>(a, 0, "ids")?, arg(a, 1, "rate")?)?;
            Ok(Value::Null)
        }
        "listItemsPage" => ok(catalog::list_items_page(c, &arg::<catalog::ItemPageQuery>(a, 0, "query")?)?),
        "setItemsBrand" => {
            catalog::set_items_brand(c, &arg::<Vec<String>>(a, 0, "ids")?, &arg::<String>(a, 1, "brandId")?)?;
            Ok(Value::Null)
        }
        "itemMovements" => ok(catalog::item_movements(c, &arg::<String>(a, 0, "itemId")?, arg(a, 1, "limit")?)?),
        "listCategoriesWithCounts" => ok(catalog::list_categories_with_counts(c)?),
        "addCategory" => ok(catalog::add_category(c, &arg::<String>(a, 0, "name")?)?),
        "renameCategory" => ok(catalog::rename_category(c, &arg::<String>(a, 0, "id")?, &arg::<String>(a, 1, "name")?)?),
        "deleteCategory" => ok(catalog::delete_category(c, &arg::<String>(a, 0, "id")?)?),
        "moveCategory" => {
            catalog::move_category(c, &arg::<String>(a, 0, "id")?, arg(a, 1, "delta")?)?;
            Ok(Value::Null)
        }
        "listBrands" => ok(catalog::list_brands(c)?),
        "addBrand" => ok(catalog::add_brand(c, &arg::<String>(a, 0, "name")?)?),
        "renameBrand" => ok(catalog::rename_brand(c, &arg::<String>(a, 0, "id")?, &arg::<String>(a, 1, "name")?)?),
        "deleteBrand" => ok(catalog::delete_brand(c, &arg::<String>(a, 0, "id")?)?),
        "moveBrand" => {
            catalog::move_brand(c, &arg::<String>(a, 0, "id")?, arg(a, 1, "delta")?)?;
            Ok(Value::Null)
        }
        "createAdjustment" => ok(catalog::create_adjustment(c, &arg::<catalog::AdjustmentInput>(a, 0, "input")?)?),
        "listAdjustments" => ok(catalog::list_adjustments(c)?),
        "startStockTake" => ok(catalog::start_stock_take(c, &arg::<String>(a, 0, "categoryId")?)?),
        "postStockTake" => ok(catalog::post_stock_take(c, &arg::<Vec<catalog::StockTakeCount>>(a, 0, "counts")?, &arg::<String>(a, 1, "note")?)?),

        // ----- PurchasingApi -----
        "searchPurchasable" => {
            let limit = arg::<Option<usize>>(a, 1, "limit")?.unwrap_or(40);
            ok(purchasing::search_purchasable(c, &arg::<String>(a, 0, "query")?, limit)?)
        }
        "listGrns" => ok(purchasing::list_grns(c)?),
        "getGrn" => ok(purchasing::get_grn(c, &arg::<String>(a, 0, "id")?)?),
        "createGrn" => ok(purchasing::create_grn(c, &arg::<purchasing::GrnDraft>(a, 0, "draft")?)?),
        "listSupplierSummaries" => ok(purchasing::list_supplier_summaries(c)?),
        "getSupplierLedger" => ok(purchasing::get_supplier_ledger(c, &arg::<String>(a, 0, "supplierId")?)?),
        "saveSupplier" => ok(purchasing::save_supplier(c, &arg::<purchasing::SupplierDraft>(a, 0, "draft")?)?),
        "recordSupplierPayment" => ok(purchasing::record_supplier_payment(c, &arg::<purchasing::SupplierPaymentDraft>(a, 0, "draft")?)?),
        "listSeedProfiles" => ok(purchasing::list_seed_profiles(c)?),
        "saveSeedNorms" => ok(purchasing::save_seed_norms(c, &arg::<Value>(a, 0, "norms")?)?),
        "listPressingBatches" => ok(purchasing::list_pressing_batches(c)?),
        "createPressingBatch" => ok(purchasing::create_pressing_batch(c, &arg::<purchasing::PressingDraft>(a, 0, "draft")?)?),
        "moveBatchToBarrel" => ok(purchasing::move_batch_to_barrel(c, &arg::<purchasing::MoveToBarrel>(a, 0, "draft")?)?),
        "listBarrels" => ok(purchasing::list_barrels(c)?),
        "listPackTargets" => ok(purchasing::list_pack_targets(c, &arg::<String>(a, 0, "barrelId")?)?),
        "listPackRuns" => ok(purchasing::list_pack_runs(c)?),
        "createPackRun" => ok(purchasing::create_pack_run(c, &arg::<purchasing::PackRunDraft>(a, 0, "draft")?)?),

        // ----- ProductionApi (godown barrels, transfers, mill daily report) -----
        "listGodownBarrels" => ok(crate::godown::list_godown_barrels(c)?),
        "getGodownBarrel" => ok(crate::godown::get_godown_barrel(c, &arg::<String>(a, 0, "id")?)?),
        "addGodownBarrels" => ok(crate::godown::add_godown_barrels(c, &arg::<crate::godown::AddBarrels>(a, 0, "input")?)?),
        "editGodownBarrel" => ok(crate::godown::edit_godown_barrel(c, &arg::<crate::godown::EditBarrel>(a, 0, "input")?)?),
        "setGodownStatus" => ok(crate::godown::set_godown_status(c, &arg::<crate::godown::StatusInput>(a, 0, "input")?)?),
        "recordStickReading" => ok(crate::godown::record_stick_reading(c, &arg::<crate::godown::StickInput>(a, 0, "input")?)?),
        "recordOutsourcedOil" => ok(crate::godown::record_outsourced_oil(c, &arg::<crate::godown::OutsourcedInput>(a, 0, "input")?)?),
        "listOutsourcedOil" => ok(crate::godown::list_outsourced_oil(c, arg::<Option<i64>>(a, 0, "limit")?.unwrap_or(200))?),
        "transferToStore" => ok(crate::godown::transfer_to_store(c, &arg::<crate::godown::TransferInput>(a, 0, "input")?)?),
        "listGodownTransfers" => ok(crate::godown::list_godown_transfers(c, arg::<Option<i64>>(a, 0, "limit")?.unwrap_or(200))?),
        "getMillDaily" => ok(crate::godown::mill_daily(c, &arg::<String>(a, 0, "day")?)?),

        // ----- CrmApi -----
        "listSalesBills" => ok(crm::list_sales_bills(c, &arg::<Option<crm::SalesQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "salesFilterOptions" => ok(crm::sales_filter_options(c)?),
        "listCustomerRows" => ok(crm::list_customer_rows(c)?),
        "getCustomerProfile" => ok(crm::get_customer_profile(c, &arg::<String>(a, 0, "id")?)?),
        "getCustomerWallet" => ok(crate::loyalty::wallet(c, &arg::<String>(a, 0, "customerId")?)?),
        "listPointsHistory" => ok(crate::loyalty::history(c, &arg::<String>(a, 0, "customerId")?, arg::<Option<i64>>(a, 1, "limit")?.unwrap_or(100))?),
        "pointsOverview" => ok(crate::points::overview(c)?),
        "listPointsCustomers" => ok(crate::points::list_customers(c, &arg::<Option<crate::points::PointsQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "getPointsLedger" => ok(crate::points::ledger(c, &arg::<String>(a, 0, "customerId")?, arg::<Option<i64>>(a, 1, "limit")?.unwrap_or(500))?),
        "adjustPoints" => ok(crate::points::adjust(c, &arg::<crate::points::AdjustInput>(a, 0, "input")?)?),
        "bulkAdjustPoints" => ok(crate::points::bulk_adjust(c, &arg::<crate::points::BulkInput>(a, 0, "input")?)?),
        "pointsExpiring" => ok(crate::lots::expiring_soon(c, arg::<Option<i64>>(a, 0, "days")?.unwrap_or(30))?),
        "setLoyaltyGoLive" => ok(crate::lots::set_go_live_date(c, &arg::<String>(a, 0, "date")?, &crate::db::actor_or("Office"))?),
        "pointsReport" => ok(crate::points::report(c, &arg::<Option<crate::points::ReportQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "setCustomerCredit" => ok(crm::set_customer_credit(c, &arg::<String>(a, 0, "customerId")?, arg::<i64>(a, 1, "limit")?, "")?),
        "saveCustomer" => ok(crm::save_customer(c, &arg::<crm::CustomerInput>(a, 0, "input")?)?),
        "setCustomerActive" => ok(crm::set_customer_active(c, &arg::<String>(a, 0, "customerId")?, arg::<bool>(a, 1, "active")?)?),
        "listReceivables" => ok(crm::list_receivables(c)?),
        "getStatement" => ok(crm::get_statement(c, &arg::<String>(a, 0, "customerId")?)?),
        "recordCollection" => ok(crm::record_collection(c, &arg::<crm::CollectionInput>(a, 0, "input")?)?),
        "logReminder" => {
            crm::log_reminder(c, &arg::<String>(a, 0, "customerId")?)?;
            Ok(Value::Null)
        }
        "listRoles" => ok(crm::list_roles(c)?),
        "saveRoles" => ok(crm::save_roles(c, &arg::<Vec<Value>>(a, 0, "roles")?)?),
        "listUserAccounts" => ok(crm::list_user_accounts(c)?),
        "saveUserAccount" => ok(crm::save_user_account(c, &arg::<crm::UserInput>(a, 0, "input")?)?),
        "resetUserPin" => ok(crm::reset_user_pin(c, &arg::<String>(a, 0, "userId")?)?),
        "getSettingsBundle" => ok(crm::get_settings_bundle(c)?),
        "saveSettingsBundle" => ok(crm::save_settings_bundle(c, &arg::<Value>(a, 0, "next")?)?),
        "backupNow" => ok(crm::backup_now(c)?),
        "backupStatus" => ok(crate::backup::status(c)?),
        "logout" => Ok(Value::Null), // the session lives outside the database; see dispatch_session
        "restoreBackup" => ok(crm::restore_backup(c, &arg::<String>(a, 0, "id")?)?),

        // ----- ExpensesApi -----
        "listExpenseCategories" => ok(expenses::list_categories(c)?),
        "saveExpenseCategories" => ok(expenses::save_categories(c, &arg::<Vec<Value>>(a, 0, "categories")?)?),
        "listExpenses" => ok(expenses::list_expenses(c, &arg::<Option<expenses::ExpenseQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "addExpense" => ok(expenses::add_expense(c, &arg::<expenses::ExpenseInput>(a, 0, "input")?)?),
        "editExpense" => ok(expenses::edit_expense(c, &arg::<expenses::ExpenseEdit>(a, 0, "input")?)?),
        "voidExpense" => ok(expenses::void_expense(c, &arg::<expenses::ExpenseVoid>(a, 0, "input")?)?),
        "logVoidedLine" => {
            expenses::log_voided_line(c, &arg::<expenses::VoidedLineInput>(a, 0, "line")?)?;
            Ok(Value::Null)
        }

        // ----- MillApi -----
        "getMillSheet" => ok(mill::get_sheet(c, &arg::<String>(a, 0, "day")?)?),
        "saveMillSheet" => ok(mill::save_sheet(c, &arg::<mill::SheetInput>(a, 0, "input")?)?),
        "closeMillSheet" => ok(mill::close_sheet(c, &arg::<mill::CloseInput>(a, 0, "input")?)?),
        "listMillSheets" => ok(mill::list_sheets(c, arg::<Option<i64>>(a, 0, "limit")?.unwrap_or(60))?),

        // ----- Scanner settings (the POS reads them) -----
        "getHardware" => ok(crm::get_hardware(c)?),

        // ----- UI preferences (per counter) -----
        "getUiPref" => {
            let key = format!("ui.{}.{}", crate::db::load_settings(c)?.counter, arg::<String>(a, 0, "key")?);
            ok(crate::db::get_setting(c, &key)?)
        }
        "setUiPref" => {
            let key = format!("ui.{}.{}", crate::db::load_settings(c)?.counter, arg::<String>(a, 0, "key")?);
            crate::db::set_setting(c, &key, &arg::<String>(a, 1, "value")?)?;
            Ok(Value::Null)
        }

        // ----- POS reports and staff -----
        "listStaff" => ok(posreports::list_staff(c)?),
        "addStaff" => ok(posreports::add_staff(c, &arg::<String>(a, 0, "name")?)?),
        "salesReport" => ok(posreports::sales_report(c, &arg::<Option<posreports::ReportQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "paymodeReport" => ok(posreports::paymode_report(c, &arg::<Option<posreports::ReportQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "staffReport" => ok(posreports::staff_report(c, &arg::<Option<posreports::ReportQuery>>(a, 0, "query")?.unwrap_or_default())?),
        "stockReport" => ok(posreports::stock_report(c, &arg::<Option<posreports::ReportQuery>>(a, 0, "query")?.unwrap_or_default())?),

        // ----- ReportsApi -----
        "runReport" => ok(reports::run_report(c, &arg::<String>(a, 0, "id")?, &arg::<reports::ReportParams>(a, 1, "params")?)?),

        other => invalid(format!("Unknown call '{other}'")),
    })
}

/// Methods the Rust backend implements (the TypeScript selector uses this list; kept in sync by a test).
pub const METHODS: &[&str] = &[
    "getSettings", "listUsers", "verifyPin", "currentShift", "listItems", "listCategories", "findItemByCode", "searchItems",
    "listCustomers", "searchCustomers", "getCustomer", "countCustomers", "setCustomerActive", "listBills", "getBill", "saveBill", "holdBill", "listHeld", "recallHeld", "dashboard",
    "topItems", "lowStock", "listStockMovements", "getDayStatus", "openDay", "listCashEntries", "addCashEntry", "shiftSummary",
    "verifyManagerPin", "closeDay", "peekNextBillNumber", "quickAddCustomer", "listBillsOn", "getBillDetail", "findBillForReturn",
    "cancelBill", "recordReprint", "createReturn", "listCreditNotes", "getPendingExchange", "clearPendingExchange",
    "listSuppliers", "listPurchases", "listProduction",
    "getItemDetail", "validateItem", "saveItem", "generateBarcode", "nextItemCode", "listLooseItems", "setItemsActive", "setItemsCategory",
    "setItemsGst", "setItemsBrand", "listItemsPage", "itemMovements", "listCategoriesWithCounts", "addCategory", "renameCategory", "deleteCategory", "moveCategory",
    "listBrands", "addBrand", "renameBrand", "deleteBrand", "moveBrand", "createAdjustment", "listAdjustments", "startStockTake", "postStockTake",
    "searchPurchasable", "listGrns", "getGrn", "createGrn", "listSupplierSummaries", "getSupplierLedger", "saveSupplier", "recordSupplierPayment",
    "listSeedProfiles", "saveSeedNorms", "listPressingBatches", "createPressingBatch", "moveBatchToBarrel", "listBarrels", "listPackTargets",
    "listPackRuns", "createPackRun",
    "listSalesBills", "salesFilterOptions", "listCustomerRows", "getCustomerProfile", "saveCustomer", "setCustomerCredit", "getCustomerWallet", "listPointsHistory", "pointsOverview", "listPointsCustomers", "getPointsLedger", "pointsExpiring", "setLoyaltyGoLive", "pointsReport", "listReceivables", "getStatement",
    "recordCollection", "logReminder", "listRoles", "saveRoles", "listUserAccounts", "saveUserAccount", "resetUserPin", "getSettingsBundle",
    "saveSettingsBundle", "testPrint", "printDocument", "printerStatus", "backupNow", "restoreBackup", "runReport", "backupStatus", "logout",
    "listExpenseCategories", "saveExpenseCategories", "listExpenses", "addExpense", "editExpense", "voidExpense", "logVoidedLine",
    "getMillSheet", "saveMillSheet", "closeMillSheet", "listMillSheets", "getUiPref", "setUiPref", "printLabels", "labelPreview", "getHardware",
    "listStaff", "addStaff", "salesReport", "paymodeReport", "staffReport", "stockReport",
    "listGodownBarrels", "getGodownBarrel", "addGodownBarrels", "editGodownBarrel", "setGodownStatus", "recordStickReading", "recordOutsourcedOil",
    "listOutsourcedOil", "transferToStore", "listGodownTransfers", "getMillDaily",
];
