#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use gokul_core::{Db, Session};
use serde_json::Value;
use std::sync::Arc;

/// The shared database (`%APPDATA%\GokulRetail\gokul.db`, same file for POS and Office) and the signed-in user of this
/// app. The session lives here, in Rust: screens cannot say who they are.
struct Backend {
    db: Arc<Db>,
    session: Arc<Session>,
}

/// The one entry point for every screen call (see crates/core/src/dispatch.rs for the method list).
#[tauri::command]
async fn gokul_call(state: tauri::State<'_, Backend>, method: String, args: Vec<Value>) -> Result<Value, String> {
    let (db, session) = (state.db.clone(), state.session.clone());
    // Off the UI thread: SQLite work never freezes the window.
    tauri::async_runtime::spawn_blocking(move || gokul_core::dispatch_session(&db, &session, &method, args).map_err(|e| e.to_string()))
        .await
        .map_err(|_| "Something went wrong inside the app. Nothing was saved. Please try again.".to_string())?
}

/// Opens the database or tells the user why not in a native error box, then exits: without the shop database
/// there is nothing this app can do, and a silent empty window would look like a crash.
fn open_backend() -> Backend {
    match Db::open_default() {
        Ok(db) => {
            // DEMO DATA: fills an empty database with the demo shop. Remove this call to start with a blank shop.
            if let Err(e) = gokul_core::seed_demo_if_empty(&db) {
                eprintln!("demo seed failed: {e}");
            }
            // Scheduled backups run on their own thread and connection; billing never waits for them.
            gokul_core::backup::spawn_scheduler(db.path().to_path_buf());
            Backend { db: Arc::new(db), session: Arc::new(Session::office()) }
        }
        Err(e) => {
            gokul_core::native::show_error(
                "Gokul Office cannot start",
                &format!(
                    "The shop database could not be opened, so nothing was changed.

{e}

File: {}

Close any other Gokul window and start again. If this keeps happening, restore the latest backup from the Backups folder next to the database file or call support.",
                    gokul_core::db::default_db_path().display()
                ),
            );
            std::process::exit(1);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(open_backend())
        .invoke_handler(tauri::generate_handler![gokul_call])
        .run(tauri::generate_context!())
        .expect("error while running Gokul");
}
