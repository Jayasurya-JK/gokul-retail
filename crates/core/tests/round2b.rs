//! Round 2B: expenses, voided lines, the mill daily sheet, customer notes and what a cashier may call.
mod common;
use chrono::{Duration, Local};
use common::*;
use gokul_core::db::{day_of, iso, post_movement, Db};
use gokul_core::{dispatch_session, Session};
use serde_json::{json, Value};

fn call(db: &Db, s: &Session, method: &str, args: Value) -> Result<Value, String> {
    dispatch_session(db, s, method, args.as_array().cloned().unwrap_or_default()).map_err(|e| e.to_string())
}

fn sign_in(db: &Db, s: &Session, user: &str, pin: &str) {
    assert!(!call(db, s, "verifyPin", json!([user, pin])).unwrap().is_null(), "sign in {user}");
}

fn err_has(r: Result<Value, String>, needle: &str) {
    match r {
        Ok(v) => panic!("expected an error containing '{needle}', got {v}"),
        Err(e) => assert!(e.to_lowercase().contains(&needle.to_lowercase()), "error was: {e}"),
    }
}

fn cashier(db: &Db) -> Session {
    let s = Session::pos();
    sign_in(db, &s, "u3", "1234");
    s
}
fn owner(db: &Db) -> Session {
    let s = Session::office();
    sign_in(db, &s, "u1", "1111");
    s
}
fn manager(db: &Db) -> Session {
    let s = Session::office();
    sign_in(db, &s, "u2", "2222");
    s
}

/// Saves the settings with a change; the demo-less test shop has no name yet, so give it one.
fn save_bundle(db: &Db, o: &Session, change: impl FnOnce(&mut Value)) -> Result<Value, String> {
    let mut b = call(db, o, "getSettingsBundle", json!([])).unwrap();
    b["shop"]["name"] = json!("Gokul Oils");
    change(&mut b);
    call(db, o, "saveSettingsBundle", json!([b]))
}

fn two_cash_bills(db: &Db) -> (String, String) {
    db.with(|c| {
        let a = gokul_core::bills::save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 2000, 36_000, 5)]))?;
        let b = gokul_core::bills::save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]))?;
        Ok((a.id, b.id))
    })
    .unwrap()
}

fn open_day(db: &Db, s: &Session) {
    // 10 x 500 = Rs 5,000 float
    call(db, s, "openDay", json!([{ "userId": "x", "counts": { "500": 10 } }])).unwrap();
}

fn expected_cash(db: &Db, s: &Session) -> i64 {
    call(db, s, "shiftSummary", json!([])).unwrap()["expectedCash"].as_i64().unwrap()
}

fn tea(amount: i64) -> Value {
    json!({ "categoryId": "tea", "paidFrom": "cash", "amount": amount, "paidTo": "Tea stall", "note": "tea" })
}

// ---------- expenses ----------

#[test]
fn expenses_limit_pin_void_and_the_drawer() {
    let (_d, db) = mini_db();
    let c = cashier(&db);
    // no open day: a cash expense is refused
    err_has(call(&db, &c, "addExpense", json!([tea(5_000)])), "open the day");
    open_day(&db, &c);
    assert_eq!(expected_cash(&db, &c), 500_000);

    // under the limit (Rs 1,000): no PIN
    let e1 = call(&db, &c, "addExpense", json!([tea(60_000)])).unwrap();
    assert_eq!(e1["status"], "active");
    assert_eq!(e1["by"], "Karthik", "the signed-in user, not what the screen says");
    assert_eq!(expected_cash(&db, &c), 440_000, "a drawer expense comes off the expected cash");

    // over the limit: needs a manager PIN
    let big = json!({ "categoryId": "wages", "paidFrom": "cash", "amount": 150_000, "paidTo": "Loadmen", "note": "lorry" });
    err_has(call(&db, &c, "addExpense", json!([big])), "manager pin is needed");
    let mut wrong = big.clone();
    wrong["managerPin"] = json!("9999");
    err_has(call(&db, &c, "addExpense", json!([wrong])), "not correct");
    let mut ok = big.clone();
    ok["managerPin"] = json!("2222");
    let e2 = call(&db, &c, "addExpense", json!([ok])).unwrap();
    assert_eq!(e2["approvedBy"], "Lakshmi", "the approver is recorded");
    assert_eq!(expected_cash(&db, &c), 290_000);
    // a cashier's own PIN is not an approval
    let mut own = big.clone();
    own["managerPin"] = json!("1234");
    assert!(call(&db, &c, "addExpense", json!([own])).is_err());

    // a limit change in settings applies at once
    let o = owner(&db);
    assert_eq!(call(&db, &o, "getSettingsBundle", json!([])).unwrap()["expenses"]["limit"], 100_000);
    save_bundle(&db, &o, |b| b["expenses"]["limit"] = json!(500_000)).unwrap();
    call(&db, &c, "addExpense", json!([big])).unwrap();
    assert_eq!(expected_cash(&db, &c), 140_000);

    // UPI and bank expenses never touch the drawer
    call(&db, &c, "addExpense", json!([{ "categoryId": "rent", "paidFrom": "upi", "amount": 20_000, "paidTo": "Owner" }])).unwrap();
    assert_eq!(expected_cash(&db, &c), 140_000);

    // void: needs a reason, and a cashier needs a manager PIN
    let id = e1["id"].as_str().unwrap();
    err_has(call(&db, &c, "voidExpense", json!([{ "id": id, "reason": "  " }])), "pin");
    err_has(call(&db, &c, "voidExpense", json!([{ "id": id, "reason": "  ", "managerPin": "2222" }])), "reason");
    let v = call(&db, &c, "voidExpense", json!([{ "id": id, "reason": "Entered twice", "managerPin": "2222" }])).unwrap();
    assert_eq!((v["status"].as_str().unwrap(), v["voidReason"].as_str().unwrap()), ("void", "Entered twice"));
    assert_eq!(expected_cash(&db, &c), 200_000, "a voided drawer expense comes back");
    err_has(call(&db, &c, "voidExpense", json!([{ "id": id, "reason": "again", "managerPin": "2222" }])), "already void");
    // never deleted
    db.with(|c| {
        assert!(c.execute("DELETE FROM expenses", []).is_err());
        Ok(())
    })
    .unwrap();
    // the row is still listed as void; totals leave it out
    let all = call(&db, &c, "listExpenses", json!([{ "status": "all" }])).unwrap();
    assert!(all["rows"].as_array().unwrap().iter().any(|r| r["id"] == id && r["status"] == "void"));
    assert_eq!(all["voidedCount"], 1);
    // edit keeps a reason and the old values in the audit trail
    let id2 = e2["id"].as_str().unwrap();
    err_has(call(&db, &c, "editExpense", json!([{ "id": id2, "amount": 100_000, "reason": "fix" }])), "pin");
    call(&db, &c, "editExpense", json!([{ "id": id2, "amount": 100_000, "reason": "Typed the wrong amount", "managerPin": "2222" }])).unwrap();
    assert_eq!(expected_cash(&db, &c), 250_000);
    db.with(|c| {
        let d: String = c.query_row("SELECT detail FROM audit_log WHERE action='expense_edit'", [], |r| r.get(0))?;
        assert!(d.contains("150000") && d.contains("100000") && d.contains("Typed the wrong amount"), "{d}");
        Ok(())
    })
    .unwrap();

    // Z close: the drawer count matches expected, the report carries the expenses, and a closed day's cash is final
    let z = call(&db, &manager(&db), "shiftSummary", json!([])).unwrap();
    assert_eq!(z["expensesCash"], 250_000, "active drawer expenses: 100,000 (edited) + 150,000");
    let counts = json!({ "500": 5 }); // Rs 2,500 = expected
    let rep = call(&db, &c, "closeDay", json!([{ "userId": "x", "counts": counts, "managerPin": "2222" }])).unwrap();
    assert_eq!(rep["expected"], 250_000);
    assert_eq!(rep["difference"], 0);
    assert_eq!(rep["summary"]["expensesCash"], 250_000);
    err_has(call(&db, &c, "voidExpense", json!([{ "id": id2, "reason": "late", "managerPin": "2222" }])), "closed day");
}

#[test]
fn cashiers_see_only_today_and_reports_subtract_expenses() {
    let (_d, db) = mini_db();
    let o = owner(&db);
    let yesterday = day_of(Local::now() - Duration::days(1));
    // Office records a forgotten bank expense for yesterday
    call(&db, &o, "addExpense", json!([{ "categoryId": "electricity", "paidFrom": "bank", "amount": 300_000, "paidTo": "TNEB", "day": yesterday }])).unwrap();
    call(&db, &o, "addExpense", json!([{ "categoryId": "rent", "paidFrom": "bank", "amount": 100_000, "paidTo": "Landlord" }])).unwrap();
    let c = cashier(&db);
    let mine = call(&db, &c, "listExpenses", json!([{ "from": "2000-01-01", "to": "2100-01-01" }])).unwrap();
    assert_eq!(mine["rows"].as_array().unwrap().len(), 1, "a cashier only gets today, whatever dates the screen asks for");
    // a cashier cannot back-date
    open_day(&db, &c);
    call(&db, &c, "addExpense", json!([{ "categoryId": "tea", "paidFrom": "cash", "amount": 1_000, "day": yesterday }])).unwrap();
    let all = call(&db, &o, "listExpenses", json!([{ "from": yesterday, "to": yesterday }])).unwrap();
    assert_eq!(all["rows"].as_array().unwrap().len(), 1, "the cashier's day field was ignored");
    // reports: a cashier may not run them; the owner sees expenses and profit after expenses
    err_has(call(&db, &c, "runReport", json!(["expenses", { "from": yesterday, "to": day_of(Local::now()) }])), "permission");
    let p = json!({ "from": yesterday, "to": day_of(Local::now()) });
    let rep = call(&db, &o, "runReport", json!(["expenses", p.clone()])).unwrap();
    assert_eq!(rep["totals"]["amount"], 300_000 + 100_000 + 1_000);
    db.with(|c| {
        gokul_core::bills::save_bill(c, &cash_draft(vec![line("i1", "101", "Groundnut Oil 1 L", 1000, 36_000, 5)]))?;
        Ok(())
    })
    .unwrap();
    let prof = call(&db, &o, "runReport", json!(["daily-profit", p.clone()])).unwrap();
    let exp_total = prof["totals"]["expenses"].as_i64().unwrap();
    assert_eq!(exp_total, 401_000);
    assert_eq!(prof["totals"]["profit"].as_i64().unwrap(), prof["totals"]["gross"].as_i64().unwrap() - exp_total, "net profit = gross - expenses");
    let cb = call(&db, &o, "runReport", json!(["cash-book", p])).unwrap();
    assert_eq!(cb["totals"]["expenses"], 1_000, "only drawer cash is in the cash book");
}

// ---------- voided lines ----------

#[test]
fn voided_lines_are_logged_with_the_user_and_optionally_need_a_pin() {
    let (_d, db) = mini_db();
    let c = cashier(&db);
    let line = json!({ "itemId": "i1", "code": "101", "name": "Groundnut Oil 1 L", "qty": 2000, "rate": 36_000, "counter": "Counter 1", "managerPin": "" });
    call(&db, &c, "logVoidedLine", json!([line])).unwrap();
    let o = owner(&db);
    let p = json!({ "from": day_of(Local::now()), "to": day_of(Local::now()) });
    let rep = call(&db, &o, "runReport", json!(["voided-lines", p.clone()])).unwrap();
    let rows = rep["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!((rows[0]["by"].as_str().unwrap(), rows[0]["amount"].as_i64().unwrap()), ("Karthik", 72_000));
    // the log cannot be edited or erased
    db.with(|c| {
        assert!(c.execute("DELETE FROM voided_lines", []).is_err());
        assert!(c.execute("UPDATE voided_lines SET qty=1", []).is_err());
        Ok(())
    })
    .unwrap();
    // the setting turns on a manager PIN for cashiers; managers are never asked
    save_bundle(&db, &o, |b| b["security"]["voidLineNeedsPin"] = json!(true)).unwrap();
    err_has(call(&db, &c, "logVoidedLine", json!([line])), "manager pin is needed");
    let mut with_pin = line.clone();
    with_pin["managerPin"] = json!("2222");
    call(&db, &c, "logVoidedLine", json!([with_pin])).unwrap();
    call(&db, &manager(&db), "logVoidedLine", json!([line])).unwrap();
    let rep = call(&db, &o, "runReport", json!(["voided-lines", p])).unwrap();
    assert_eq!(rep["rows"].as_array().unwrap().len(), 3);
}

#[test]
fn lockout_settings_are_editable_and_checked() {
    let (_d, db) = mini_db();
    let o = owner(&db);
    let b = call(&db, &o, "getSettingsBundle", json!([])).unwrap();
    assert_eq!((b["security"]["lockoutAttempts"].as_i64(), b["security"]["lockoutSeconds"].as_i64()), (Some(5), Some(60)));
    err_has(save_bundle(&db, &o, |b| b["security"]["lockoutAttempts"] = json!(2)), "between 3 and 20");
    save_bundle(&db, &o, |b| { b["security"]["lockoutAttempts"] = json!(3); b["security"]["lockoutSeconds"] = json!(30); }).unwrap();
    let s = Session::pos();
    for _ in 0..2 {
        assert!(call(&db, &s, "verifyPin", json!(["u3", "0000"])).unwrap().is_null());
    }
    let _ = call(&db, &s, "verifyPin", json!(["u3", "0000"])); // the third wrong PIN locks the user
    err_has(call(&db, &s, "verifyPin", json!(["u3", "1234"])), "locked for");
}

// ---------- what a cashier may call (POS Customers and Sales) ----------

#[test]
fn cashier_can_use_pos_customers_and_sales_but_only_today_and_no_cancel() {
    let (_d, db) = mini_db();
    let c = cashier(&db);
    let (a, b) = two_cash_bills(&db);
    // move bill b to an earlier day in the data
    db.with(|c| {
        c.execute("UPDATE bills SET day='2020-01-01' WHERE id=?1", [b.trim_start_matches('b').parse::<i64>().unwrap()])?;
        Ok(())
    })
    .unwrap();
    let today = day_of(Local::now());
    let todays = call(&db, &c, "listBillsOn", json!([{ "date": today }])).unwrap();
    assert_eq!(todays.as_array().unwrap().len(), 1);
    // asking for another date or all days still gives today only
    let sneaky = call(&db, &c, "listBillsOn", json!([{ "date": "2020-01-01", "allDays": true }])).unwrap();
    assert_eq!(sneaky.as_array().unwrap().len(), 1);
    assert_eq!(sneaky[0]["id"], a);
    // managers see any date
    let m = manager(&db);
    let old = call(&db, &m, "listBillsOn", json!([{ "date": "2020-01-01" }])).unwrap();
    assert_eq!(old.as_array().unwrap().len(), 1);
    assert_eq!(call(&db, &m, "listBillsOn", json!([{ "date": today, "allDays": true }])).unwrap().as_array().unwrap().len(), 2);
    // the rest of what the screens use
    assert!(!call(&db, &c, "getBillDetail", json!([a])).unwrap().is_null());
    assert!(call(&db, &c, "recordReprint", json!([a, "x"])).is_ok());
    assert!(call(&db, &c, "listCreditNotes", json!([10])).is_ok());
    assert!(call(&db, &c, "listCustomerRows", json!([])).is_ok());
    assert!(!call(&db, &c, "getCustomerProfile", json!(["c1"])).unwrap().is_null());
    assert!(!call(&db, &c, "getStatement", json!(["c1"])).unwrap().is_null());
    // customer notes are a real field
    let saved = call(&db, &c, "saveCustomer", json!([{ "id": "c1", "name": "Murugan", "phone": "98400 11111", "area": "Gandhipuram", "type": "retail", "creditLimit": 500_000, "notes": "Prefers 5 L tins" }])).unwrap();
    assert_eq!(saved["notes"], "Prefers 5 L tins");
    let rows = call(&db, &c, "listCustomerRows", json!([])).unwrap();
    assert_eq!(rows[0]["notes"], "Prefers 5 L tins");
    db.with(|c| { c.execute("UPDATE customers SET outstanding=5000 WHERE id='c1'", [])?; Ok(()) }).unwrap();
    assert!(call(&db, &c, "recordCollection", json!([{ "customerId": "c1", "amount": 1000, "mode": "upi" }])).is_ok());
    // cancelling still needs a manager PIN
    err_has(call(&db, &c, "cancelBill", json!([{ "billId": a, "reason": "x", "managerPin": "", "by": "x" }])), "manager pin");
    // the key-bar choice is a per-counter backend setting
    assert!(call(&db, &c, "getUiPref", json!(["showKeyBar"])).unwrap().is_null());
    call(&db, &c, "setUiPref", json!(["showKeyBar", "1"])).unwrap();
    assert_eq!(call(&db, &c, "getUiPref", json!(["showKeyBar"])).unwrap(), "1");
    // and a cashier cannot touch the mill sheet
    err_has(call(&db, &c, "getMillSheet", json!([today])), "permission");
    err_has(call(&db, &c, "saveMillSheet", json!([{ "day": today }])), "permission");
}

// ---------- mill daily sheet ----------

fn stock_kg(db: &Db, item: &str, kg: i64) {
    db.with(|c| {
        post_movement(c, &iso(Local::now() - Duration::days(5)), item, "opening", kg * 1000, "opening", "", "Opening", "Test")?;
        Ok(())
    })
    .unwrap();
}

fn item_stock(db: &Db, name_or_id: &str) -> i64 {
    db.with(|c| {
        Ok(c.query_row("SELECT stock FROM items WHERE id=?1 OR name=?1", [name_or_id], |r| r.get::<_, i64>(0)).unwrap_or(0))
    })
    .unwrap()
}

fn line_of<'a>(sheet: &'a Value, key: &str) -> &'a Value {
    sheet["stock"].as_array().unwrap().iter().find(|l| l["key"] == key).unwrap()
}

fn mill_day(db: &Db, o: &Session, day: &str, physical: Value) -> Value {
    let input = json!({
        "day": day, "supervisor": "Mohan", "note": "",
        "opRows": [
            { "operator": "Ambethkar", "seed": "groundnut", "machine": "W", "seedKg": 100_000, "oilL": 40_000, "cakeKg": 55_000, "jaggeryKg": 0 },
            { "operator": "Ambethkar", "seed": "groundnut", "machine": "R", "seedKg": 50_000, "oilL": 20_000, "cakeKg": 28_000, "jaggeryKg": 0 },
        ],
        "custRows": [
            { "customerId": "c1", "seed": "groundnut", "machine": "W", "seedKg": 30_000, "oilL": 11_000, "cakeKg": 17_000, "cakeMode": "kept" },
            { "customerId": "c1", "seed": "groundnut", "machine": "W", "seedKg": 20_000, "oilL": 7_500, "cakeKg": 11_000, "cakeMode": "taken" },
        ],
        "punnakuRows": [{ "punnaku": "kadalai_w", "qtyKg": 10_000 }],
        "physical": physical,
    });
    call(db, o, "saveMillSheet", json!([input])).unwrap()
}

#[test]
fn mill_sheet_draft_closing_math_and_nothing_moves_until_close() {
    let (_d, db) = mini_db();
    stock_kg(&db, "rm-gn", 1000);
    let o = owner(&db);
    let today = day_of(Local::now());
    let draft = mill_day(&db, &o, &today, json!({}));
    assert_eq!(draft["status"], "draft");
    // computed closing: opening + pressed + purchased + kept - sold - packed - adjusted
    let gn = line_of(&draft, "groundnut");
    assert_eq!(gn["opening"], 1_000_000);
    assert_eq!(gn["pressed"], -150_000, "only the shop's own pressing uses shop seed (the customer's 50 kg is not in it)");
    assert_eq!(gn["computed"], 850_000);
    // W and R punnaku are separate lines
    let kw = line_of(&draft, "kadalai_w");
    let kr = line_of(&draft, "kadalai_r");
    assert_eq!((kw["pressed"].as_i64(), kw["purchased"].as_i64(), kw["kept"].as_i64()), (Some(55_000), Some(10_000), Some(17_000)));
    assert_eq!(kw["computed"], 82_000, "the cake the customer takes (11 kg) is not shop stock");
    assert_eq!(kr["computed"], 28_000);
    assert_eq!(line_of(&draft, "oil_groundnut")["pressed"], 60_000, "oil out of the presses (the customer's oil is not counted)");
    // a draft moves nothing
    assert_eq!(item_stock(&db, "rm-gn"), 1_000_000);
    assert_eq!(item_stock(&db, "Groundnut Oil Cake (Loose)"), 0);
    db.with(|c| {
        assert_eq!(count(c, "pressing_batches"), 0);
        assert_eq!(count(c, "bills"), 0);
        Ok(())
    })
    .unwrap();
    // an unknown operator or a future day is refused
    let mut bad = json!({ "day": today, "supervisor": "", "note": "", "opRows": [{ "operator": "Nobody", "seed": "groundnut", "machine": "W", "seedKg": 1000, "oilL": 0, "cakeKg": 0, "jaggeryKg": 0 }], "custRows": [], "punnakuRows": [], "physical": {} });
    err_has(call(&db, &o, "saveMillSheet", json!([bad.clone()])), "operator");
    bad["day"] = json!(day_of(Local::now() + Duration::days(2)));
    bad["opRows"] = json!([]);
    err_has(call(&db, &o, "saveMillSheet", json!([bad])), "future");
}

#[test]
fn mill_sheet_close_posts_everything_and_carries_forward() {
    let (_d, db) = mini_db();
    stock_kg(&db, "rm-gn", 1000);
    db.with(|c| {
        c.execute("INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at) VALUES('i9','109','Groundnut Oil Cake (Loose)','oil','Gokul','kg',1,'2305',5,5000,5000,4000,0,0,1,'2026-01-01T00:00:00Z')", [])?;
        Ok(())
    })
    .unwrap();
    let o = owner(&db);
    let yesterday = day_of(Local::now() - Duration::days(1));
    let draft = mill_day(&db, &o, &yesterday, json!({}));
    assert_eq!(line_of(&draft, "kadalai_w")["computed"], 82_000);
    // count: 1 kg of groundnut short, 2 kg of Kadalai W short, the rest exactly as computed
    let mut phys = serde_json::Map::new();
    for l in draft["stock"].as_array().unwrap() {
        phys.insert(l["key"].as_str().unwrap().to_string(), l["computed"].clone());
    }
    phys.insert("groundnut".into(), json!(849_000));
    phys.insert("kadalai_w".into(), json!(80_000));
    mill_day(&db, &o, &yesterday, Value::Object(phys));
    // a draft close needs a manager PIN from a cashier-level approval path: the owner closes it
    let closed = call(&db, &o, "closeMillSheet", json!([{ "day": yesterday }])).unwrap();
    assert_eq!(closed["status"], "closed");

    // pressing batches carry the machine; the sheet's operator rows are linked to them
    db.with(|c| {
        assert_eq!(count(c, "pressing_batches"), 2);
        let m: Vec<String> = {
            let mut st = c.prepare("SELECT machine FROM pressing_batches ORDER BY id")?;
            let v = st.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
            v
        };
        assert_eq!(m, vec!["W", "R"]);
        Ok(())
    })
    .unwrap();
    assert!(closed["opRows"].as_array().unwrap().iter().all(|r| !r["batchNumber"].as_str().unwrap().is_empty()));

    // stock: customer seed and oil never touched shop stock; W and R cake are separate items
    assert_eq!(item_stock(&db, "rm-gn"), 849_000, "1,000 - 150 pressed - 1 counted short; the customer's 50 kg never entered");
    assert_eq!(item_stock(&db, "Groundnut Oil Cake (Loose)"), 80_000, "W cake: 55 pressed + 17 kept by the shop + 10 bought - 2 counted short");
    assert_eq!(item_stock(&db, "Groundnut Oil Cake R (Loose)"), 28_000, "R cake is its own item");
    db.with(|c| {
        // the only ledger rows of the customer jobs are the kept cake
        let n: i64 = c.query_row("SELECT COUNT(*) FROM stock_movements WHERE ref_type='mill_job'", [], |r| r.get(0))?;
        assert_eq!(n, 1, "only the kept cake, not the taken cake and never the customer's seed or oil");
        let kept: i64 = c.query_row("SELECT qty FROM stock_movements WHERE ref_type='mill_job'", [], |r| r.get(0))?;
        assert_eq!(kept, 17_000);
        // variance posting: two adjustment rows with the sheet as the reason
        let adj: Vec<(String, i64, String)> = {
            let mut st = c.prepare("SELECT i.name, a.qty, a.note FROM stock_adjustments a JOIN items i ON i.id=a.item_id WHERE a.note LIKE 'Mill sheet%' ORDER BY a.id")?;
            let v = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
            v
        };
        assert_eq!(adj.len(), 2, "{adj:?}");
        assert!(adj.iter().any(|a| a.1 == -1_000) && adj.iter().any(|a| a.1 == -2_000));
        assert!(adj[0].2.contains(&yesterday));
        // the stock ledger still adds up to the cached stock
        assert!(gokul_core::dash::ledger_mismatches(c)?.is_empty());
        Ok(())
    })
    .unwrap();

    // the aravai charge is billed on the customer's account: 30 kg x Rs 5 (kept) + 20 kg x Rs 8 (taken) = Rs 310, GST 5% included
    db.with(|c| {
        assert_eq!(count(c, "bills"), 1, "one bill per customer");
        let (grand, status, outstanding): (i64, String, i64) = c.query_row(
            "SELECT b.grand, b.status, cu.outstanding FROM bills b JOIN customers cu ON cu.id=b.customer_id", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        assert_eq!(grand, 31_000);
        assert_eq!(status, "credit");
        assert_eq!(outstanding, 31_000);
        assert_eq!(count(c, "bill_lines"), 2);
        let gst: i64 = c.query_row("SELECT gst FROM bills", [], |r| r.get(0))?;
        assert!((1_470..=1_480).contains(&gst), "GST inside the price at 5% of Rs 310 is about Rs 14.76, was {gst}");
        // the service item has no stock and no ledger rows
        let service: i64 = c.query_row("SELECT COUNT(*) FROM items WHERE service=1", [], |r| r.get(0))?;
        assert_eq!(service, 1);
        let svc_moves: i64 = c.query_row("SELECT COUNT(*) FROM stock_movements m JOIN items i ON i.id=m.item_id WHERE i.service=1", [], |r| r.get(0))?;
        assert_eq!(svc_moves, 0);
        Ok(())
    })
    .unwrap();
    assert!(closed["custRows"].as_array().unwrap().iter().all(|r| !r["billNumber"].as_str().unwrap().is_empty()));
    assert_eq!(closed["aravaiCharge"], 31_000);

    // the printed variance is the real difference, and the sheet reads the same afterwards
    let again = call(&db, &o, "getMillSheet", json!([yesterday])).unwrap();
    assert_eq!(line_of(&again, "groundnut")["variance"], -1_000);
    assert_eq!(line_of(&again, "kadalai_w")["variance"], -2_000);
    assert_eq!(line_of(&again, "kadalai_r")["variance"], 0);
    assert_eq!(line_of(&again, "groundnut")["computed"], 850_000);

    // read-only once closed
    err_has(call(&db, &o, "saveMillSheet", json!([{ "day": yesterday, "supervisor": "x", "note": "", "opRows": [], "custRows": [], "punnakuRows": [], "physical": {} }])), "closed");
    err_has(call(&db, &o, "closeMillSheet", json!([{ "day": yesterday }])), "already closed");
    db.with(|c| {
        assert!(c.execute("DELETE FROM mill_sheets", []).is_err());
        Ok(())
    })
    .unwrap();

    // opening carry-forward: today's sheet opens with yesterday's COUNTED closing
    let today = day_of(Local::now());
    let next = call(&db, &o, "getMillSheet", json!([today])).unwrap();
    assert_eq!(line_of(&next, "groundnut")["opening"], 849_000);
    assert_eq!(line_of(&next, "kadalai_w")["opening"], 80_000);
    assert_eq!(line_of(&next, "kadalai_r")["opening"], 28_000);
    assert_eq!(line_of(&next, "oil_groundnut")["opening"], 60_000, "oil opens at the previous closing too");
    let list = call(&db, &o, "listMillSheets", json!([10])).unwrap();
    assert_eq!(list[0]["day"], yesterday);
    assert_eq!(list[0]["varianceCount"], 2);
}

#[test]
fn closing_a_sheet_that_cannot_be_posted_changes_nothing() {
    let (_d, db) = mini_db();
    stock_kg(&db, "rm-gn", 100); // only 100 kg: the sheet presses 150 kg
    db.with(|c| {
        c.execute("INSERT INTO items(id,code,name,category_id,brand,unit,loose,hsn,gst_rate,mrp,price,cost,stock,reorder_level,active,created_at) VALUES('i9','109','Groundnut Oil Cake (Loose)','oil','Gokul','kg',1,'2305',5,5000,5000,4000,0,0,1,'2026-01-01T00:00:00Z')", [])?;
        Ok(())
    })
    .unwrap();
    let o = owner(&db);
    let today = day_of(Local::now());
    mill_day(&db, &o, &today, json!({}));
    err_has(call(&db, &o, "closeMillSheet", json!([{ "day": today }])), "in the godown");
    db.with(|c| {
        assert_eq!(count(c, "pressing_batches"), 0);
        assert_eq!(count(c, "bills"), 0);
        let st: String = c.query_row("SELECT status FROM mill_sheets WHERE day=?1", [&today], |r| r.get(0))?;
        assert_eq!(st, "draft");
        Ok(())
    })
    .unwrap();
    assert_eq!(item_stock(&db, "rm-gn"), 100_000);
}
