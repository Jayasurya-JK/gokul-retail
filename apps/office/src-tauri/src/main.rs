#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use gokul_core::{Db, Session};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};

/// Whether a form on screen has unsaved edits (the screens tell us through `set_unsaved`), and whether the one
/// "Discard changes?" question has already been asked for the close in progress.
#[derive(Default)]
struct Unsaved {
    dirty: AtomicBool,
    asked: AtomicBool,
}

/// Safety net for every way out: once Office has been asked to close, the process is gone within 3 seconds even if
/// something (the web view tearing down, a background thread) would otherwise keep it alive. All shop data is written
/// in whole SQLite transactions, so ending the process can never leave a half-saved bill.
fn arm_exit_watchdog() {
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(3));
        std::process::exit(0);
    });
}

#[tauri::command]
fn set_unsaved(state: tauri::State<'_, Unsaved>, dirty: bool) {
    state.dirty.store(dirty, Ordering::SeqCst);
    state.asked.store(false, Ordering::SeqCst); // "Keep editing" re-arms the question for the next close
}

/// Closes Office now (after "Discard and close", or from the window buttons when nothing is unsaved).
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    arm_exit_watchdog();
    app.exit(0);
}

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
            // Cloud sync: does nothing unless sync is switched on in Settings (one app sends at a time, see sync::worker).
            gokul_core::sync::worker::spawn_worker(db.path().to_path_buf());
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
        .manage(Unsaved::default())
        .invoke_handler(tauri::generate_handler![gokul_call, set_unsaved, quit_app])
        .on_window_event(|window, event| {
            // Cross, Alt+F4 and the operating system asking us to close all arrive here, in Rust, so closing never
            // depends on the screens being healthy. Unsaved edits get one question; a second close request, or the
            // answer "Discard", ends the app.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let st = window.state::<Unsaved>();
                if st.dirty.load(Ordering::SeqCst) && !st.asked.swap(true, Ordering::SeqCst) && window.emit("gokul-confirm-close", ()).is_ok() {
                    api.prevent_close();
                    return;
                }
                arm_exit_watchdog();
            }
        })
        .setup(|app| {
            // Safety net: the window starts hidden and the UI shows it once mounted. If that never happens
            // (for example a JavaScript error on start), show it anyway after 3 s so the app is never invisible.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                if let Some(win) = handle.get_webview_window("main") {
                    if !win.is_visible().unwrap_or(true) {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Gokul")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                arm_exit_watchdog();
            }
        });
}
