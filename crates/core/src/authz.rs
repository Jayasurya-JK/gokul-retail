//! Who is calling and what they may do. The signed-in user lives in the backend (`Session`), never in JavaScript:
//! every call through `dispatch_session` is checked against the stored role matrix here, and the audit trail, ledger
//! rows and "by" columns carry the session user's name whatever the screen sent.
//!
//! Overrides: where a role may ask for approval (a cashier cancelling a bill, a discount above the limit, ...) the call
//! carries a `managerPin`; Rust verifies it against the argon2 hashes of the owners and managers whose role is allowed
//! to approve that action. Wrong approval PINs count towards the same lockout as wrong sign-in PINs.

use crate::db::audit;
use crate::error::{invalid, ApiError, Result};
use crate::money::{compute_totals, line_gross, recalc_line};
use crate::store;
use crate::types::*;
use chrono::Local;
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
use std::sync::Mutex;

/// The signed-in user of this app process (Gokul POS and Gokul Office each have their own).
pub struct Session {
    user: Mutex<Option<String>>,
    /// Gokul Office refuses cashier accounts.
    allow_cashier: bool,
}

impl Session {
    pub fn pos() -> Session {
        Session { user: Mutex::new(None), allow_cashier: true }
    }
    pub fn office() -> Session {
        Session { user: Mutex::new(None), allow_cashier: false }
    }
    pub fn current(&self) -> Option<String> {
        self.user.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
    pub fn set(&self, user_id: &str) {
        *self.user.lock().unwrap_or_else(|e| e.into_inner()) = Some(user_id.to_string());
    }
    pub fn clear(&self) {
        *self.user.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    pub fn allows(&self, role: &str) -> bool {
        self.allow_cashier || role != "cashier"
    }
}

/// The signed-in user with the role matrix as stored right now (a change in Office applies on the next call).
#[derive(Debug, Clone)]
pub struct Actor {
    pub id: String,
    pub name: String,
    pub role: String,
    perms: Value,
    pin_for: Vec<String>,
    pub discount_limit_pct: i64,
}

impl Actor {
    pub fn has(&self, perm: &str) -> bool {
        self.perms[perm].as_bool().unwrap_or(false)
    }
    pub fn pin_listed(&self, action: &str) -> bool {
        self.pin_for.iter().any(|a| a == action)
    }
}

pub fn load_actor(conn: &Connection, user_id: &str) -> Result<Option<Actor>> {
    let row = conn
        .query_row(
            "SELECT u.id,u.name,u.role,r.perms_json,r.pin_for_json,r.discount_limit_pct FROM users u JOIN roles r ON r.id=u.role
             WHERE u.id=?1 AND u.active=1",
            [user_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, i64>(5)?)),
        )
        .optional()?;
    Ok(row.map(|(id, name, role, perms, pin_for, limit)| Actor {
        id,
        name,
        role,
        perms: serde_json::from_str(&perms).unwrap_or(Value::Null),
        pin_for: serde_json::from_str(&pin_for).unwrap_or_default(),
        discount_limit_pct: limit,
    }))
}

/// A manager approval that was used for a call; written to the audit log after the call succeeds.
pub struct Override {
    pub approver: String,
    pub what: String,
}

enum Rule {
    /// Any signed-in user.
    Open,
    /// The role must hold this permission; there is no PIN way round it.
    Perm(&'static str),
    /// The role holds the permission and the action is not on its "needs manager PIN" list, or the call carries a manager PIN.
    PermPin { perm: &'static str, action: &'static str, pin_arg: usize, pin_key: Option<&'static str> },
    /// Discount above the limit, changed prices and credit above the customer limit.
    Bill,
    /// An expense over the limit (setting) needs a manager PIN unless the role may open the drawer on its own.
    ExpenseAdd,
    /// Removing a scanned line: no PIN, unless the setting asks for one and the role lists it.
    VoidLine,
}

fn rule_for(method: &str, args: &[Value]) -> Rule {
    use Rule::*;
    match method {
        "saveItem" | "setItemsActive" | "setItemsCategory" | "setItemsGst" | "addCategory" | "renameCategory" | "deleteCategory" | "moveCategory"
        | "addBrand" | "renameBrand" | "deleteBrand" | "moveBrand" => Perm("canManageItems"),
        "createGrn" | "saveSupplier" | "recordSupplierPayment" | "saveSeedNorms" | "createPressingBatch" | "moveBatchToBarrel" | "createPackRun" => {
            Perm("canManageStock")
        }
        "createAdjustment" => PermPin { perm: "canManageStock", action: "stock_adjust", pin_arg: 0, pin_key: Some("managerPin") },
        "postStockTake" => PermPin { perm: "canManageStock", action: "stock_adjust", pin_arg: 2, pin_key: None },
        "recordCollection" | "logReminder" => Perm("canCollectCredit"),
        "saveRoles" | "listUserAccounts" | "saveUserAccount" | "resetUserPin" => Perm("canManageUsers"),
        "saveSettingsBundle" | "backupNow" | "restoreBackup" => Perm("canChangeSettings"),
        "runReport" => Perm("canSeeReports"),
        "cancelBill" => PermPin { perm: "canCancelBill", action: "cancel_bill", pin_arg: 0, pin_key: Some("managerPin") },
        "createReturn" => PermPin { perm: "canReturn", action: "return", pin_arg: 0, pin_key: Some("managerPin") },
        "addCashEntry" if args.first().map(|a| a["kind"] == "out").unwrap_or(false) => {
            PermPin { perm: "canOpenDrawer", action: "open_drawer", pin_arg: 0, pin_key: Some("managerPin") }
        }
        "saveBill" => Bill,
        "addExpense" => ExpenseAdd,
        "editExpense" => PermPin { perm: "canOpenDrawer", action: "edit_expense", pin_arg: 0, pin_key: Some("managerPin") },
        "voidExpense" => PermPin { perm: "canOpenDrawer", action: "void_expense", pin_arg: 0, pin_key: Some("managerPin") },
        "logVoidedLine" => VoidLine,
        "saveExpenseCategories" | "getMillSheet" | "saveMillSheet" | "listMillSheets" => Perm("canManageStock"),
        "closeMillSheet" => PermPin { perm: "canManageStock", action: "stock_adjust", pin_arg: 0, pin_key: Some("managerPin") },
        _ => Open,
    }
}

fn describe(method: &str) -> &'static str {
    match method {
        "saveItem" | "setItemsActive" | "setItemsCategory" | "setItemsGst" => "change items",
        "addCategory" | "renameCategory" | "deleteCategory" | "moveCategory" => "change categories",
        "addBrand" | "renameBrand" | "deleteBrand" | "moveBrand" => "change brands",
        "createGrn" | "saveSupplier" | "recordSupplierPayment" => "record purchases and supplier payments",
        "saveSeedNorms" | "createPressingBatch" | "moveBatchToBarrel" | "createPackRun" => "record production",
        "createAdjustment" | "postStockTake" => "adjust stock",
        "recordCollection" | "logReminder" => "collect credit",
        "saveRoles" | "listUserAccounts" | "saveUserAccount" | "resetUserPin" => "manage users",
        "saveSettingsBundle" | "backupNow" | "restoreBackup" => "change settings or backups",
        "runReport" => "see reports",
        "cancelBill" => "cancel a bill",
        "createReturn" => "give a refund",
        "addCashEntry" => "take cash out of the drawer",
        "addExpense" => "record an expense over the limit",
        "editExpense" => "change an expense",
        "voidExpense" => "void an expense",
        "logVoidedLine" => "remove a scanned line",
        "saveExpenseCategories" => "change expense categories",
        "getMillSheet" | "saveMillSheet" | "listMillSheets" => "use the mill sheet",
        "closeMillSheet" => "close the mill sheet (it adjusts stock)",
        _ => "do this",
    }
}

fn set_field(args: &mut [Value], i: usize, key: &str, v: Value) {
    if let Some(o) = args.get_mut(i).and_then(|a| a.as_object_mut()) {
        o.insert(key.to_string(), v);
    }
}

/// Replace every name or user id a screen sent with the signed-in user (a screen is never trusted to say who it is).
fn stamp_identity(actor: &Actor, method: &str, args: &mut Vec<Value>) {
    let name = Value::String(actor.name.clone());
    let id = Value::String(actor.id.clone());
    match method {
        "saveBill" | "holdBill" => set_field(args, 0, "cashier", name),
        "cancelBill" | "createReturn" | "addCashEntry" => set_field(args, 0, "by", name),
        "addExpense" => {
            set_field(args, 0, "by", name);
            if !actor.has("canSeeReports") {
                // A counter user records today's expenses only.
                if let Some(o) = args.get_mut(0).and_then(|a| a.as_object_mut()) {
                    o.remove("day");
                }
            }
        }
        "listExpenses" if !actor.has("canSeeReports") => {
            let today = Value::String(crate::db::day_of(Local::now()));
            let mut q = args.first().and_then(|a| a.as_object()).cloned().unwrap_or_default();
            q.insert("from".into(), today.clone());
            q.insert("to".into(), today);
            if args.is_empty() {
                args.push(Value::Null);
            }
            args[0] = Value::Object(q);
        }
        "listBillsOn" if actor.role == "cashier" => {
            // A cashier sees today's bills only; managers and owners see any date.
            if let Some(o) = args.get_mut(0).and_then(|a| a.as_object_mut()) {
                o.insert("date".into(), Value::String(crate::db::day_of(Local::now())));
                o.insert("allDays".into(), Value::Bool(false));
            }
        }
        "recordReprint" => {
            if args.len() < 2 {
                args.resize(2, Value::Null);
            }
            args[1] = name;
        }
        "openDay" | "closeDay" => set_field(args, 0, "userId", id),
        "currentShift" => {
            if args.is_empty() {
                args.push(Value::Null);
            }
            args[0] = id;
        }
        _ => {}
    }
}

fn pin_from(args: &[Value], i: usize, key: Option<&str>) -> String {
    let v = match key {
        Some(k) => args.get(i).map(|a| &a[k]),
        None => args.get(i),
    };
    v.and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
}

/// A wrong approval PIN: counted against the signed-in user; the answer says so when it locked them.
fn wrong_approval_pin(conn: &Connection, actor: &Actor, what: &str) -> ApiError {
    match store::register_pin_failure(conn, &actor.id, &actor.name, &format!("wrong manager PIN to {what}")) {
        Ok(Some(secs)) => ApiError::Invalid(store::locked_message(secs)),
        _ => ApiError::Invalid("Manager PIN is not correct".into()),
    }
}

/// Checks the call against the role matrix and stamps the caller's identity into the arguments.
/// `Err` means nothing may run. `Ok(Some(_))` is an approval that must be audited once the call has succeeded.
pub fn authorize(conn: &Connection, actor: &Actor, method: &str, args: &mut Vec<Value>) -> Result<Option<Override>> {
    stamp_identity(actor, method, args);
    match rule_for(method, args) {
        Rule::Open => Ok(None),
        Rule::Perm(perm) => {
            if actor.has(perm) {
                // Changing a price on an existing item is its own permission.
                if method == "saveItem" && !actor.has("canEditPrices") && item_price_changes(conn, args)? {
                    return invalid("You do not have permission to change prices. Ask the owner or a manager.");
                }
                Ok(None)
            } else {
                invalid(format!("You do not have permission to {}. Ask the owner or a manager.", describe(method)))
            }
        }
        Rule::PermPin { perm, action, pin_arg, pin_key } => {
            let needs = actor.pin_listed(action) || !actor.has(perm);
            if !needs {
                return Ok(None);
            }
            let what = describe(method);
            let pin = pin_from(args, pin_arg, pin_key);
            if pin.is_empty() {
                return invalid(format!("A manager PIN is needed to {what}"));
            }
            match store::find_approver(conn, &pin, Some(perm), 0)? {
                Some(m) => Ok(Some(Override { approver: m.name, what: what.to_string() })),
                None => Err(wrong_approval_pin(conn, actor, what)),
            }
        }
        Rule::Bill => check_bill(conn, actor, args),
        Rule::ExpenseAdd => {
            let amount = args.first().and_then(|a| a["amount"].as_i64()).unwrap_or(0);
            let limit = crate::expenses::expense_limit(conn);
            if amount <= limit || (!actor.pin_listed("expense_over_limit") && actor.has("canOpenDrawer")) {
                return Ok(None);
            }
            let what = "record an expense over the limit";
            let pin = pin_from(args, 0, Some("managerPin"));
            if pin.is_empty() {
                return invalid(format!("A manager PIN is needed to {what}"));
            }
            match store::find_approver(conn, &pin, Some("canOpenDrawer"), 0)? {
                Some(m) => Ok(Some(Override { approver: m.name, what: what.to_string() })),
                None => Err(wrong_approval_pin(conn, actor, what)),
            }
        }
        Rule::VoidLine => {
            if !crate::expenses::void_line_needs_pin(conn) || !actor.pin_listed("void_line") {
                return Ok(None);
            }
            let what = "remove a scanned line";
            let pin = pin_from(args, 0, Some("managerPin"));
            if pin.is_empty() {
                return invalid(format!("A manager PIN is needed to {what}"));
            }
            match store::find_approver(conn, &pin, None, 0)? {
                Some(m) => Ok(Some(Override { approver: m.name, what: what.to_string() })),
                None => Err(wrong_approval_pin(conn, actor, what)),
            }
        }
    }
}

fn item_price_changes(conn: &Connection, args: &[Value]) -> Result<bool> {
    let Some(a) = args.first() else { return Ok(false) };
    let Some(id) = a["id"].as_str() else { return Ok(false) };
    let cur: Option<(i64, i64)> = conn.query_row("SELECT price,mrp FROM items WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((price, mrp)) = cur else { return Ok(false) };
    Ok(a["price"].as_i64().map(|p| p != price).unwrap_or(false) || a["mrp"].as_i64().map(|m| m != mrp).unwrap_or(false))
}

/// Discount above the role limit, a price different from the item master, credit above the customer's limit:
/// each needs a manager PIN unless the role may do it on its own.
fn check_bill(conn: &Connection, actor: &Actor, args: &[Value]) -> Result<Option<Override>> {
    let Some(draft) = args.first().and_then(|a| serde_json::from_value::<BillDraft>(a.clone()).ok()) else { return Ok(None) };
    let lines: Vec<BillLine> = draft.lines.iter().map(recalc_line).collect();
    if lines.is_empty() {
        return Ok(None);
    }
    let totals = compute_totals(&lines, draft.bill_discount, true);
    let mut reasons: Vec<String> = vec![];
    let mut perm: Option<&str> = None;
    let mut min_discount = 0;

    let gross: i64 = lines.iter().map(|l| line_gross(l.rate, l.qty)).sum();
    if gross > 0 && totals.discount * 100 > gross * actor.discount_limit_pct {
        let pct = (totals.discount * 100 + gross - 1) / gross;
        reasons.push(format!("give a {pct}% discount (the limit is {}%)", actor.discount_limit_pct));
        min_discount = pct;
    }
    let mut price_changed = false;
    for l in &lines {
        let price: Option<i64> = conn.query_row("SELECT price FROM items WHERE id=?1", [&l.item_id], |r| r.get(0)).optional()?;
        if price.map(|p| p != l.rate).unwrap_or(false) {
            price_changed = true;
        }
    }
    if price_changed && (!actor.has("canEditPrices") || actor.pin_listed("price_override")) {
        reasons.push("change a price".into());
        perm = Some("canEditPrices");
    }
    let credit: i64 = draft.payments.iter().filter(|p| p.mode == "credit").map(|p| p.amount).sum();
    if credit > 0 && actor.pin_listed("credit_over_limit") {
        if let Some(cid) = &draft.customer_id {
            let cur: Option<(i64, i64)> =
                conn.query_row("SELECT credit_limit, outstanding FROM customers WHERE id=?1", [cid], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
            if let Some((limit, out)) = cur {
                if limit > 0 && out + credit > limit {
                    reasons.push("sell on credit above the customer's limit".into());
                }
            }
        }
    }
    if reasons.is_empty() {
        return Ok(None);
    }
    let what = reasons.join(" and ");
    let pin = draft.manager_pin.clone().unwrap_or_default().trim().to_string();
    if pin.is_empty() {
        return invalid(format!("A manager PIN is needed to {what}"));
    }
    match store::find_approver(conn, &pin, perm, min_discount)? {
        Some(m) => Ok(Some(Override { approver: m.name, what })),
        None => Err(wrong_approval_pin(conn, actor, &what)),
    }
}

/// After a successful call: the approval goes into the audit log next to the action's own row.
pub fn record_override(conn: &Connection, actor: &Actor, method: &str, o: &Override) -> Result<()> {
    audit(conn, Local::now(), &actor.name, "override", method, "", &format!("approved by {} to {}", o.approver, o.what))
}

/// A wrong manager PIN typed into `verifyManagerPin` or the day-close dialog counts like a wrong sign-in PIN.
pub fn count_wrong_manager_pin(conn: &Connection, actor: &Actor, method: &str) -> Result<Option<i64>> {
    store::register_pin_failure(conn, &actor.id, &actor.name, &format!("wrong manager PIN ({method})"))
}

pub fn is_locked(conn: &Connection, user_id: &str) -> Result<Option<i64>> {
    store::locked_secs(conn, user_id)
}
