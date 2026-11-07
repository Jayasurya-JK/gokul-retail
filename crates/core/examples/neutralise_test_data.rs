//! One-time: neutralises the test bills and the test customer through the app's own calls (no rows are deleted, no SQL
//! writes). Each bill is cancelled with `cancelBill` (stock goes back, the cancel is in the ledger and the audit trail),
//! and the customer is saved with `saveCustomer` (credit off, a note that says it is test data). The calls run as the
//! owner (Suresh Kumar), so no manager PIN is needed and the audit rows carry the owner's name.
//! Close Gokul POS and Gokul Office first.
//!
//!   cargo run -p gokul-core --example neutralise_test_data -- "<path to gokul.db>" <customer id> <bill id>...
//!   e.g. ... -- "<gokul.db>" c1 b2
use gokul_core::{Db, Session};
use serde_json::json;

const OWNER_ID: &str = "u1";
const REASON: &str = "Test data: neutralised on owner instruction, 07-Nov-2026 (customer load prep)";
const CUSTOMER_NOTE: &str = "TEST CUSTOMER (test data, neutralised 07-Nov-2026). Not a real customer. Do not use.";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 3 {
        eprintln!("usage: neutralise_test_data <path to gokul.db> <customer id> <bill id>...");
        std::process::exit(2);
    }
    let path = std::path::PathBuf::from(&args[0]);
    let customer_id = args[1].clone();
    let bill_ids: Vec<String> = args[2..].to_vec();
    let db = Db::open(&path).expect("open database");

    // Stock per item on the bills: the opening ledger value, and the value before any change.
    let item_ids: Vec<String> = db
        .with(|c| {
            let mut out: Vec<String> = Vec::new();
            for b in &bill_ids {
                let n: i64 = b.trim_start_matches('b').parse().expect("bill id like b2");
                let mut st = c.prepare("SELECT DISTINCT item_id FROM bill_lines WHERE bill_id=?1 ORDER BY item_id")?;
                for id in st.query_map([n], |r| r.get::<_, String>(0))? {
                    let id = id?;
                    if !out.contains(&id) {
                        out.push(id);
                    }
                }
            }
            Ok(out)
        })
        .expect("list items");
    let stock_of = |db: &Db| -> Vec<(String, i64, i64)> {
        db.with(|c| {
            let mut v = Vec::new();
            for id in &item_ids {
                let opening: i64 = c.query_row("SELECT COALESCE(SUM(qty),0) FROM stock_movements WHERE item_id=?1 AND kind='opening'", [id], |r| r.get(0))?;
                let stock: i64 = c.query_row("SELECT stock FROM items WHERE id=?1", [id], |r| r.get(0))?;
                v.push((id.clone(), opening, stock));
            }
            Ok(v)
        })
        .expect("read stock")
    };
    println!("before: items on these bills: {}", item_ids.len());
    for (id, opening, stock) in stock_of(&db) {
        println!("  {id}: opening {opening}, stock {stock}");
    }

    let session = Session::office();
    session.set(OWNER_ID);

    for b in &bill_ids {
        let status: String = db
            .with(|c| Ok(c.query_row("SELECT status FROM bills WHERE id=?1", [b.trim_start_matches('b').parse::<i64>().unwrap()], |r| r.get(0))?))
            .expect("bill status");
        if status == "cancelled" {
            println!("{b}: already cancelled, left as it is");
            continue;
        }
        let req = json!({ "billId": b, "reason": REASON, "managerPin": "", "by": "Suresh Kumar" });
        match gokul_core::dispatch_session(&db, &session, "cancelBill", vec![req]) {
            Ok(v) => println!("{b}: cancelled -> status {}", v["status"]),
            Err(e) => {
                eprintln!("{b}: cancel refused: {e}");
                std::process::exit(1);
            }
        }
    }

    let profile = gokul_core::dispatch_session(&db, &session, "getCustomerProfile", vec![json!(customer_id)]).expect("read customer");
    let cust = &profile["customer"];
    if cust.is_null() {
        eprintln!("customer {customer_id} not found");
        std::process::exit(1);
    }
    println!("customer before: name '{}', phone '{}', credit limit {}, outstanding {}, points {}", cust["name"], cust["phone"], cust["creditLimit"], cust["outstanding"], cust["loyaltyPoints"]);
    let input = json!({
        "id": customer_id,
        "name": cust["name"],
        "phone": cust["phone"],
        "area": cust["area"],
        "type": "retail",
        "creditLimit": 0,
        "notes": CUSTOMER_NOTE,
        "openingBalance": 0,
        "creditDays": 0,
    });
    let saved = gokul_core::dispatch_session(&db, &session, "saveCustomer", vec![input]).expect("save customer");
    println!("customer after: name '{}', credit limit {}, outstanding {}, points {}, notes '{}'", saved["name"], saved["creditLimit"], saved["outstanding"], saved["loyaltyPoints"], saved["notes"]);

    println!("after:");
    for (id, opening, stock) in stock_of(&db) {
        let ok = opening == stock;
        println!("  {id}: opening {opening}, stock {stock} {}", if ok { "(= opening)" } else { "(DIFFERENT)" });
    }
}
