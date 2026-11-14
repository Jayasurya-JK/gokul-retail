//! One-time setup of the live database for data entry. Close Gokul POS and Gokul Office first.
//!
//!   cargo run -p gokul-core --example r6_live_setup -- "<path to gokul.db>" --owner-pin XXXX --admin-pin XXXX --staff-pin XXXX [--dry-run]
//!
//! The PINs come only from these arguments. Use --dry-run first: it prints everything and changes nothing.
use gokul_core::live_setup::{run, Options};
use gokul_core::Db;

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn apps_running() -> bool {
    #[cfg(windows)]
    {
        if let Ok(out) = std::process::Command::new("tasklist").output() {
            let t = String::from_utf8_lossy(&out.stdout).to_lowercase();
            return t.contains("gokul pos") || t.contains("gokul office") || t.contains("gokul-pos") || t.contains("gokul-office");
        }
    }
    false
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = args.first().filter(|a| !a.starts_with("--")).cloned();
    let (Some(path), Some(owner), Some(admin), Some(staff)) =
        (path, arg_value(&args, "--owner-pin"), arg_value(&args, "--admin-pin"), arg_value(&args, "--staff-pin"))
    else {
        eprintln!("usage: r6_live_setup <path to gokul.db> --owner-pin XXXX --admin-pin XXXX --staff-pin XXXX [--dry-run]");
        std::process::exit(2);
    };
    let dry_run = args.iter().any(|a| a == "--dry-run");
    if apps_running() {
        eprintln!("Gokul POS or Gokul Office seems to be running. Close both, then run this again.");
        std::process::exit(1);
    }
    let db = Db::open(std::path::Path::new(&path)).unwrap_or_else(|e| {
        eprintln!("Could not open the database: {e}");
        std::process::exit(1);
    });
    let rep = db
        .with(|c| run(c, &Options { owner_pin: owner, admin_pin: admin, staff_pin: staff, dry_run }))
        .unwrap_or_else(|e| {
            eprintln!("Nothing was changed. {e}");
            std::process::exit(1);
        });
    println!("{}", if rep.dry_run { "DRY RUN: nothing was changed." } else { "Done." });
    println!("\nUsers:");
    for (n, r, a) in &rep.users {
        println!("  {n:<18} {r:<8} {}", if *a { "active" } else { "inactive" });
    }
    println!("\nOperators: {}", rep.operators.join(", "));
    println!("\nRecords removed:");
    for (t, n) in &rep.removed {
        println!("  {t:<40} {n}");
    }
    println!("\nItem stock corrected:");
    if rep.stock_changes.is_empty() {
        println!("  (none)");
    }
    for (n, b, a) in &rep.stock_changes {
        println!("  {n:<40} {:.3} -> {:.3}", *b as f64 / 1000.0, *a as f64 / 1000.0);
    }
    println!("\nAppend-only triggers restored: {}", rep.triggers_restored);
    println!("Integrity check: {}", rep.integrity);
}
